import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { EditorSession } from "../../src/application/EditorSession.js";
import { CommandDispatcher } from "../../src/application/CommandDispatcher.js";
import { CommandParser } from "../../src/cli/CommandParser.js";
import { SvgFileStore } from "../../src/infrastructure/SvgFileStore.js";
import { SvgCodec } from "../../src/infrastructure/SvgCodec.js";
import { MemoryDocumentStore } from "./MemoryDocumentStore.js";
import { DOMParser } from "@xmldom/xmldom";

const xml = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><g id="g"><rect x="0" y="0" width="10" height="20"/><text id="t" x="1" y="2">中文 &amp; &lt;读取&gt;</text></g></svg>';
function directory(t: TestContext) {
  const dir = fs.mkdtempSync(join(tmpdir(),'svg-read-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true})); return dir;
}
function setup(store = new SvgFileStore()) {
  const session = new EditorSession(store); const dispatcher = new CommandDispatcher(session); const parser = new CommandParser();
  return {session, run:(line:string)=>dispatcher.dispatch(parser.parse(line)!)};
}

test('M7 真实读取无需 init，警告顺序/默认 save/编辑往返',t=>{
  const dir=directory(t), file=join(dir,'中文 file.svg'); fs.writeFileSync(file,xml);
  const {session,run}=setup();
  assert.equal(session.read(file),`warning: assigned id rect1 to unnamed <rect>\nread ${file} (3 elements)`);
  assert.equal(session.snapshot().getParentId('rect1'),'g');
  const before=session.describe(); run('move g 10 20'); session.save();
  const after=session.describe(); assert.notDeepEqual(after,before);
  session.read(file); assert.deepEqual(session.describe(),after);
  const parsed=new DOMParser({onError:(_level,message)=>{throw new Error(message);}}).parseFromString(fs.readFileSync(file,'utf8'),'application/xml');
  assert.equal(parsed.getElementsByTagName('rect')[0].getAttribute('x'),'10');
  assert.equal(parsed.getElementsByTagName('text')[0].textContent,'中文 & <读取>');
  assert.deepEqual(fs.readdirSync(dir),['中文 file.svg']);
});

test('M7 成功 read 隔断旧历史，失败编辑不解禁，新编辑不能越界',t=>{
  const dir=directory(t), file=join(dir,'a.svg'); fs.writeFileSync(file,xml);
  const {session,run}=setup(); run('init'); run('create g old'); run('undo');
  session.read(file); const loaded=session.describe();
  for(const command of ['undo','redo']) assert.throws(()=>run(command),{message:'undo not allowed after io command'});
  assert.throws(()=>run('move missing 1 2')); assert.throws(()=>run('undo'),/undo not allowed/);
  run('move rect1 5 6'); const moved=session.describe(); run('undo'); assert.deepEqual(session.describe(),loaded);
  assert.throws(()=>run('undo'),/nothing to undo/); run('redo'); assert.deepEqual(session.describe(),moved);
});

test('M7 各类读取失败不改整份文档/default path/redo 或禁用状态',t=>{
  const dir=directory(t), good=join(dir,'good.svg'), bad=join(dir,'bad.svg'); fs.writeFileSync(good,xml);
  const {session,run}=setup(); session.read(good); run('move rect1 5 6'); const moved=session.describe();run('undo');const before=session.describe();
  const badInputs=['<svg>',xml.replace('id="t"','id="g"'),xml.replace('<g id="g">','<g id="g" transform="scale(2)">'),xml.replace('</g>','<path/></g>')];
  for(const content of badInputs) {
    fs.writeFileSync(bad,content);
    assert.throws(()=>session.read(bad),{message:`cannot read file: ${bad}`});
    assert.deepEqual(session.describe(),before); run('redo');assert.deepEqual(session.describe(),moved);run('undo');
  }
  for(const path of [join(dir,'missing.svg'),dir,'','   ']) {
    assert.throws(()=>session.read(path),{message:`cannot read file: ${path}`});
    assert.deepEqual(session.describe(),before);run('redo');assert.deepEqual(session.describe(),moved);run('undo');
  }
  session.save(); assert.deepEqual(new SvgCodec().deserialize(fs.readFileSync(good,'utf8')).document.describe(),before);
  assert.throws(()=>session.read(bad)); assert.throws(()=>run('redo'),/undo not allowed/);
});

test('M7 拒绝损坏 UTF-8，模拟权限错误不替换文档',t=>{
  const dir=directory(t), file=join(dir,'invalid.svg');fs.writeFileSync(file,Buffer.from([0xc3,0x28]));
  const {session,run}=setup();run('init'); const before=session.describe();
  assert.throws(()=>session.read(file),{message:`cannot read file: ${file}`}); assert.deepEqual(session.describe(),before);
  const mock=t.mock.method(fs,'readFileSync',()=>{throw Object.assign(new Error('denied'),{code:'EACCES'});});
  assert.throws(()=>session.read(file),{message:`cannot read file: ${file}`});mock.mock.restore();assert.deepEqual(session.describe(),before);
});

test('M7 内存替代存储与发布克隆隔离、init/read/save 路径转换',()=>{
  const store=new MemoryDocumentStore(); const session=new EditorSession(store);
  const run=(name:string,args:string[]=[])=>new CommandDispatcher(session).dispatch({name,args});
  session.init();run('create',['g','first']);session.save('first.svg');
  session.init(200,100);run('create',['g','second']);session.save('second.svg');
  session.read('first.svg');session.save();assert.equal(session.snapshot().find('second'),undefined);
  const saved=store.documents.get('first.svg')!;saved.move('first',1,1);
  // 故意让替代实现返回共享文档，验证会话仍独占副本。
  store.read=()=>({document:saved,warnings:[]});session.read('first.svg');saved.delete('first');
  assert.ok(session.snapshot().find('first'));session.save();
  assert.throws(()=>session.init(0,2));session.save();
  session.init();assert.throws(()=>session.save(),/no save path/);
});

test('M7 六类型/空文本/显式样式/嵌套次序完整磁盘往返及结构历史',t=>{
  const dir=directory(t), file=join(dir,'roundtrip.svg');const {session,run}=setup();
  for(const command of ['init 400.5 300.25','create g root','create rect r -1.5 2 3 4 red in root',
    'create circle c 1 2 3 in root','create ellipse e 1 2 3 4 in root','create line l 1 2 3 4 black in root',
    'create text t 1 2 "中文 & < >" in root','create text empty 0 0 "" in root','group nested r c',
    'set root stroke-width 2','front r','back empty']) run(command);
  const before=session.describe(); session.save(file);session.read(file);assert.deepEqual(session.describe(),before);
  assert.equal(session.snapshot().getParentId('nested'),'root');
  run('ungroup nested');const ungrouped=session.describe();run('undo');assert.deepEqual(session.describe(),before);
  run('redo');assert.deepEqual(session.describe(),ungrouped);run('move r 10 20');session.save();session.read(file);
  assert.equal(session.snapshot().find('r')!.describe().attributes.x,8.5);
});

test('M7 CLI 实际读取、失败无补 ID 警告、usage、恢复和 EOF',t=>{
  const dir=directory(t), file=join(dir,'input.svg'), bad=join(dir,'bad.svg');fs.writeFileSync(file,xml);fs.writeFileSync(bad,xml.replace('</g>','<path/></g>'));
  const quote=(p:string)=>`"${p.replace(/\\/g,'/')}"`;
  const result=spawnSync(process.execPath,['--import','tsx','src/main.ts'],{encoding:'utf8',timeout:10000,
    input:[`read ${quote(bad)}`,'tree','read','read a b',`read ${quote(file)}`,'tree','undo','move rect1 5 0','save',`read ${quote(file)}`,'show rect1'].join('\n')});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr);
  assert.equal((result.stdout.match(/warning: assigned id/g)??[]).length,1);
  assert.ok(result.stdout.includes('error: cannot read file:'));
  assert.ok(result.stdout.includes("error: no document. use 'init' or 'read' first"));
  assert.equal((result.stdout.match(/usage: read <file.svg>/g)??[]).length,2);
  assert.ok(result.stdout.includes('error: undo not allowed after io command'));
  assert.ok(result.stdout.includes('rect#rect1  parent=g#g'));
  const doc=new SvgCodec().deserialize(fs.readFileSync(file,'utf8')).document;
  assert.equal(doc.find('rect1')!.describe().attributes.x,5);
});
