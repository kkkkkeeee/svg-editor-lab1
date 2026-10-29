import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PassThrough } from "node:stream";
import { CommandParser } from "../../src/cli/CommandParser.js";
import { ConsoleRenderer } from "../../src/cli/ConsoleRenderer.js";
import { CliApplication } from "../../src/cli/CliApplication.js";
import { CommandDispatcher } from "../../src/application/CommandDispatcher.js";
import { EditorSession } from "../../src/application/EditorSession.js";

test("parser: 双引号保留空格、中文和空参数", () => {
  const parser = new CommandParser();
  assert.deepEqual(parser.parse('create text t1 20 40 "Hello World"'), {
    name: "create", args: ["text", "t1", "20", "40", "Hello World"],
    argsQuoted: [false, false, false, false, true],
  });
  assert.deepEqual(parser.parse('set t1 text ""')!.args, ["t1", "text", ""]);
  assert.equal(parser.parse('set t1 text "你好 世界"')!.args[2], "你好 世界");
});

test("parser: 空行、缩进注释及颜色参数", () => {
  const parser = new CommandParser();
  for (const line of ["", "  ", "# comment", '  # "unclosed']) assert.equal(parser.parse(line), undefined);
  assert.equal(parser.parse("create rect r 0 0 1 1 #ffffff")!.args.at(-1), "#ffffff");
  assert.equal(parser.parse('set t text "# not comment"')!.args.at(-1), "# not comment");
});

test("parser: 拒绝未闭合、粘连引号及空命令", () => {
  const parser = new CommandParser();
  assert.throws(() => parser.parse('create text t 1 2 "oops'), /unclosed double quote/);
  for (const input of ['help"x"', '"help"x', '""']) assert.throws(() => parser.parse(input));
});

test("parser: 引号内仅转义引号和反斜杠，其他反斜杠保留", () => {
  const parser = new CommandParser();
  const parsed = parser.parse(String.raw`set t text "say \"hi\" C:\\tmp\file"`)!;
  assert.equal(parsed.args[2], String.raw`say "hi" C:\tmp\file`);
  assert.ok(Object.isFrozen(parsed.args));
});

test("init: 默认、指定、单宽度及重复初始化替换文档", () => {
  const session = new EditorSession();
  const dispatcher = new CommandDispatcher(session);
  assert.equal(dispatcher.dispatch({ name: "init", args: [] }), "canvas 800x600 created");
  const previous = session.describe();
  assert.equal(dispatcher.dispatch({ name: "init", args: ["400", "200"] }), "canvas 400x200 created");
  assert.deepEqual(session.describe(), { width: 400, height: 200, children: [] });
  assert.equal(previous.width, 800);
  assert.equal(dispatcher.dispatch({ name: "init", args: ["320"] }), "canvas 320x600 created");
});

test("init: 参数错误或非法尺寸不替换已有文档", () => {
  const session = new EditorSession();
  const dispatcher = new CommandDispatcher(session);
  session.init(400, 200);
  const before = session.describe();
  for (const args of [["1", "2", "3"], [""], ["abc"], ["0x10"], ["0"], ["-1"], ["Infinity"], ["1e999"], ["1", "NaN"]]) {
    assert.throws(() => dispatcher.dispatch({ name: "init", args }));
    assert.deepEqual(session.describe(), before);
  }
});

test("dispatcher: 无文档、未知命令与尚未实现区分", () => {
  const session = new EditorSession();
  const dispatcher = new CommandDispatcher(session);
  const commands = ["save", "canvas", "create", "delete", "move", "scale", "set",
    "group", "ungroup", "addto", "front", "back", "tree", "show", "undo", "redo"];
  for (const name of commands) {
    assert.throws(() => dispatcher.dispatch({ name, args: [] }), {
      message: "no document. use 'init' or 'read' first",
    });
  }
  assert.throws(() => dispatcher.dispatch({ name: "wat", args: [] }), /unknown command: wat/);
  assert.throws(() => dispatcher.dispatch({ name: "read", args: ["a.svg"] }), /not implemented/);
  assert.equal(session.hasDocument, false);
  session.init();
  assert.throws(() => dispatcher.dispatch({ name: "move", args: ["g1", "1", "2"] }), /no such shape: g1/);
  assert.throws(() => dispatcher.dispatch({ name: "save", args: [] }), /no save path. specify a file path/);
  assert.throws(() => dispatcher.dispatch({ name: "help", args: ["extra"] }), /usage: help/);
  assert.deepEqual(session.describe().children, []);
});

test("help: 无文档可用，全部 19 个命令均标注实现状态", () => {
  const result = new CommandDispatcher(new EditorSession()).dispatch({ name: "help", args: [] });
  assert.match(result, /\[已实现\] help/);
  assert.match(result, /\[已实现\] init \[w\] \[h\]/);
  const pending = ["read"];
  for (const name of pending) assert.ok(result.includes("[暂未实现] " + name));
  assert.ok(result.includes("[已实现] save [file.svg]"));
  for (const name of ["create", "tree", "show", "undo", "redo", "move", "scale", "set", "delete", "canvas", "addto", "front", "back", "group", "ungroup"]) assert.ok(result.includes("[已实现] " + name));
});

test("REPL: 管道一次输入多行、错误后继续、末行无换行的 EOF", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/main.ts"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    input: 'tree\nwat\ninit 1 2 3\ninit\ncreate text t 20 40 "oops\n# skip\ninit 400 200\ncreate rect r 0 0 1 1 #ffffff\nhelp',
    encoding: "utf8", timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /error: no document\. use 'init' or 'read' first/);
  assert.match(result.stdout, /error: unknown command: wat/);
  assert.match(result.stdout, /error: invalid arguments; usage: init/);
  assert.match(result.stdout, /error: unclosed double quote/);
  assert.match(result.stdout, /canvas 800x600 created/);
  assert.match(result.stdout, /canvas 400x200 created/);
  assert.match(result.stdout, /rect#r created/);
  assert.match(result.stdout, /\[已实现\] help/);
});

test("REPL: CRLF、空行和带空格文本不会丢失后续行", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/main.ts"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    input: '\r\ninit 300 200\r\ncreate text t 1 2 "Hello World"\r\ninit 100 50\r\n',
    encoding: "utf8", timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /canvas 300x200 created/);
  assert.match(result.stdout, /text#t created/);
  assert.match(result.stdout, /canvas 100x50 created/);
  assert.doesNotMatch(result.stdout, /unclosed|unknown command/);
});

test("REPL: 终端 Ctrl+C 关闭并释放进程信号监听器", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();
  const listeners = process.listenerCount("SIGINT");
  const app = new CliApplication(new CommandDispatcher(new EditorSession()),
    new CommandParser(), new ConsoleRenderer(output), input, output, true);
  const done = app.run();
  input.write("\u0003");
  await done;
  assert.equal(process.listenerCount("SIGINT"), listeners);
  input.destroy();
  output.destroy();
});
