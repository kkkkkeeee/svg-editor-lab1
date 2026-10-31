// Independent audit only: invokes compiled CLI, never imports production classes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DOMParser } from '@xmldom/xmldom';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// M8-B rerun: preserve the original M8-A failure evidence unchanged.
const evidence = join(root, 'doc', 'M8-B-evidence');
fs.mkdirSync(evidence, { recursive: true });
const q = value => JSON.stringify(value.replaceAll('\\', '/'));
const file = name => join(evidence, name);
const records = [];
function run(name, input) {
  const result = spawnSync(process.execPath, [join(root, 'dist', 'main.js')], {
    cwd: root, input: input.join('\n'), encoding: 'utf8', timeout: 15000,
  });
  assert.ifError(result.error);
  records.push({ name, input, stdout: result.stdout, stderr: result.stderr, exitCode: result.status });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return result.stdout;
}
function xml(name) {
  return new DOMParser({ onError: (_, message) => { throw Error(message); } })
    .parseFromString(new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(file(name))), 'application/xml');
}
const ids = element => Array.from(element.childNodes).filter(n => n.nodeType === 1).map(n => n.getAttribute('id'));
fs.writeFileSync(file('invalid.svg'), '<svg><g></svg>');

const main = run('all-19-and-history', [
  'help', 'tree', '# ignored " unclosed comment', 'init 640 360', 'canvas',
  'create g outer', 'create g nested in outer', 'create rect r 10 20 100 50 #4a90d9 in nested',
  'create circle c 200 80 25 #f5a623 in nested', 'create ellipse e 500 230 40 20 green in outer',
  'create line l 30 200 550 200 black in outer', 'create text t 20 300 "中文 & <审计>" in outer',
  'move outer 5 10', 'scale nested 2', 'set r stroke-width 2', 'set t text "中文 & <审计> 空格"',
  'addto nested t', 'front r', 'back r', 'group pair t r', 'tree', 'ungroup pair', 'tree',
  'undo', 'tree', 'redo', 'delete nested', 'undo', 'redo', 'undo',
  'create rect r 0 0 1 1', 'addto nested outer', 'ungroup outer', 'front e', 'back e',
  'show r', `save ${q(file('roundtrip.svg'))}`, 'undo', 'move r 10 0', 'undo',
  `read ${q(file('invalid.svg'))}`, 'show r', 'redo', 'save',
  'move r 1 0', 'undo', `save ${q(evidence)}`, 'show r', 'redo', 'save',
  `read ${q(file('roundtrip.svg'))}`, 'undo', `save ${q(file('copy.svg'))}`,
  'move r 1 1', 'undo', 'canvas', 'canvas 0 2', 'scale r 0', 'redo',
  'canvas 800 600', 'undo', 'move r 1 0', 'undo', 'redo',
  'wat', 'move r 1', 'create text broken 1 2 "oops', 'show r',
]);
for (const message of ["no document. use 'init' or 'read' first", 'id already exists: r',
  'cannot move a container into itself or its descendant: outer', 'cannot ungroup top-level container: outer',
  'cannot read file:', 'cannot write file:', 'undo not allowed after io command', 'scale factor must be positive',
  'unknown command: wat', 'unclosed double quote', 'usage: move']) assert.ok(main.includes(message), message);
assert.equal((main.match(/\[已实现\]/g) ?? []).length, 19);
assert.ok(main.includes('undone: g#pair ungrouped'));
assert.ok(main.includes('redone: rect#r moved by (10,0)'));
assert.ok(main.includes('redone: rect#r moved by (1,0)'));
assert.deepEqual(fs.readFileSync(file('roundtrip.svg')), fs.readFileSync(file('copy.svg')));
const model = xml('roundtrip.svg');
assert.deepEqual(ids(model.getElementById('outer')), ['e', 'nested', 'l']);
assert.deepEqual(ids(model.getElementById('nested')), ['r', 't', 'c']);
assert.equal(model.getElementById('r').getAttribute('x'), '41');
assert.equal(model.getElementById('r').getAttribute('y'), '60');
assert.equal(model.getElementById('r').getAttribute('width'), '200');
assert.equal(model.getElementById('t').textContent, '中文 & <审计> 空格');
assert.equal(model.getElementById('c').hasAttribute('stroke'), false);

const unnamed = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><g><rect x="0" y="0" width="10" height="10"/><rect id="rect1" x="20" y="0" width="10" height="10"/></g></svg>';
fs.writeFileSync(file('unnamed.svg'), unnamed);
const auto = run('auto-id', [`read ${q(file('unnamed.svg'))}`, 'tree', 'undo', 'move rect2 5 0', 'save']);
assert.ok(auto.includes('warning: assigned id g1 to unnamed <g>\nwarning: assigned id rect2 to unnamed <rect>'));
assert.deepEqual(ids(xml('unnamed.svg').getElementById('g1')), ['rect2', 'rect1']);
assert.equal(xml('unnamed.svg').getElementById('rect2').getAttribute('x'), '5');

const structure = run('cross-parent-and-order', [
  'init', 'create g left', 'create g right', 'create rect r 0 0 10 10 in left',
  'create rect keep 20 0 10 10 in left', 'create circle c 5 5 2 in right',
  'group gathered c r', 'tree', 'undo', 'tree', 'redo', 'tree',
  'addto left gathered', 'ungroup gathered', 'tree', 'undo', 'tree', 'redo', 'tree',
  `save ${q(file('structure.svg'))}`,
]);
assert.doesNotMatch(structure, /error:/);
const trees = structure.split('svg> ').filter(part => part.startsWith('svg ('));
assert.equal(trees[0], trees[2]); // redo restores cross-parent grouping exactly.
assert.equal(trees[3], trees[5]); // redo restores ungrouped tree exactly.
assert.ok(trees[1].includes('g#right\n    └── circle#c'));
assert.ok(trees[4].includes('g#gathered\n│       ├── rect#r'));
assert.deepEqual(ids(xml('structure.svg').getElementById('left')), ['keep', 'r', 'c']);
assert.deepEqual(ids(xml('structure.svg').getElementById('right')), []);

const atomic = run('overflow-and-ancestor-rejection', [
  'init', 'create g g', 'create rect normal 1 2 3 4 in g',
  'create circle huge 1e308 1 2 in g', 'create text later 1 1 "later"', 'undo',
  'move g 1e308 0', 'scale g 2', 'group bad g huge', 'show normal', 'redo', 'show later',
]);
assert.ok(atomic.includes('error: cx must be a finite number'));
assert.ok(atomic.includes('error: cannot group a container into its own descendant: g'));
assert.ok(atomic.includes('x=1 y=2 width=3 height=4'));
assert.ok(atomic.includes('redone: text#later created'));

const preview = run('visual-preview', [
  'init 640 300', 'create g diagram', 'create rect start 30 60 160 80 #4a90d9 in diagram',
  'create text title 40 105 "开始 & <审计>" in diagram', 'set title fill white',
  'create g right in diagram', 'create circle end 440 100 45 #f5a623 in right',
  'create text label 420 105 "完成" in right', 'create line edge 190 100 395 100 black in diagram',
  'set edge stroke-width 3', 'create ellipse badge 540 220 40 20 green', `save ${q(file('preview.svg'))}`,
  `read ${q(file('preview.svg'))}`, `save ${q(file('preview-readback.svg'))}`,
]);
assert.doesNotMatch(preview, /error:/);
assert.equal(xml('preview.svg').getElementsByTagName('*').length, 9);
assert.deepEqual(fs.readFileSync(file('preview.svg')), fs.readFileSync(file('preview-readback.svg')));

// Both historical counterexamples must now be rejected without losing state/history/path.
const regressions = [];
for (const [name, content] of [['bare-ampersand', 'a & b'], ['cdata-close', 'a ]]> b']]) {
  fs.writeFileSync(file(`${name}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text id="t" x="1" y="2">${content}</text></svg>`);
  const bad = fs.readFileSync(file(`${name}.svg`));
  const out = run(name, ['init', 'create rect old 1 2 3 4', `save ${q(file(`${name}-old.svg`))}`,
    'move old 10 20', 'undo', `read ${q(file(`${name}.svg`))}`, 'show old', 'redo', 'tree', 'save',
    `read ${q(file(`${name}.svg`))}`, 'undo', 'show old']);
  assert.equal((out.match(/error: cannot read file:/g) ?? []).length, 2);
  assert.ok(out.includes('x=1 y=2 width=3 height=4'));
  assert.ok(out.includes('redone: rect#old moved by (10,20)'));
  assert.ok(out.includes('x=11 y=22 width=3 height=4'));
  assert.equal((out.match(/error: undo not allowed after io command/g) ?? []).length, 1);
  assert.doesNotMatch(out, /no such shape|warning:/);
  assert.equal(xml(`${name}-old.svg`).getElementById('old').getAttribute('x'), '11');
  assert.deepEqual(fs.readFileSync(file(`${name}.svg`)), bad);
  regressions.push({name, observed:'Rejected; original document, default path, redo and IO-disabled state preserved'});
}
const commandNames = ['help','init','canvas','create','move','scale','set','addto','front','back','group','ungroup','undo','redo','delete','show','tree','save','read'];
const commandsCovered = commandNames.filter(name => records.some(r => r.input.some(line => line.split(' ')[0] === name)));
assert.equal(commandsCovered.length, 19);
fs.writeFileSync(file('results.json'), JSON.stringify({ commandsCovered,
  normalScenarios:5, regressions, records}, null, 2));
console.log(`PASS: 19 commands; 5 normal scenarios; ${regressions.length} XML rejection regressions. Evidence: ${evidence}`);
