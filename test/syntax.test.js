import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { test } from "node:test";

// 畫面程式要瀏覽器才跑得起來，其他測試不會載入它們：每支都先過一次語法檢查，打錯字推上去前就會被擋下。
const folders = ["src", "vendor/web", "vendor/rules"];

for (const folder of folders) {
  const dir = new URL(`../${folder}/`, import.meta.url);
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".js"))) {
    test(`${folder}/${name} 語法正確`, () => {
      assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", new URL(name, dir).pathname.replace(/^\/([A-Za-z]:)/, "$1")], { stdio: "pipe" }));
    });
  }
}
