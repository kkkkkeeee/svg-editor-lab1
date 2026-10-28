import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("当前 TypeScript CLI 入口可启动，在空输入 EOF 后正常退出", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/main.ts"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    encoding: "utf8",
    input: "",
    timeout: 10_000,
  });

  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /svg-editor 0.1 — type 'help' for commands/);
  assert.match(result.stdout, /svg> /);
});
