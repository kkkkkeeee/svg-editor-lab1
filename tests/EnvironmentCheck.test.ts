import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("当前 TypeScript 入口可启动，输出中文环境提示并正常退出", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/main.ts"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    encoding: "utf8",
    timeout: 10_000,
  });

  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Environment OK:/);
  assert.match(result.stdout, /UTF-8 中文输出正常/);
  assert.match(result.stdout, /实验命令尚未实现/);
});
