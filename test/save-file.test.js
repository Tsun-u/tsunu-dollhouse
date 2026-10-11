import assert from "node:assert/strict";
import { test } from "node:test";

import { createDoll } from "../src/dolls.js";
import { checkSave, saveData } from "../src/save-file.js";

const dollsSave = { dolls: [createDoll({ name: "小花", body: "f" }, () => "a")], selected: "a" };

test("存出去的存檔（檔案、雲端同一份）讀得回來：遊戲存檔原樣交回、娃娃照常載入", () => {
  const game = { state: { money: 120 } };
  const saved = checkSave(JSON.parse(JSON.stringify(saveData(game, dollsSave))));
  assert.deepEqual(saved.game, { money: 120 });
  assert.equal(saved.dolls.dolls[0].name, "小花");
  assert.equal(saved.dolls.selected, "a");
});

test("讀回來的娃娃穿著、衣服顏色、長相都跟存出去的一樣", () => {
  const saved = checkSave(JSON.parse(JSON.stringify(saveData({ state: {} }, dollsSave))));
  assert.deepEqual(saved.dolls.dolls, dollsSave.dolls);
});

test("第 1 版存檔（娃娃存檔被標成第 1 版、內容其實是當時的格式）讀回來，穿著和顏色不會被清掉", () => {
  const firstVersionFile = { app: "tsunu-dollhouse", version: 1, savedAt: "2026-10-10T12:00:00.000Z", game: {}, dolls: { version: 1, ...dollsSave } };
  const saved = checkSave(JSON.parse(JSON.stringify(firstVersionFile)));
  assert.deepEqual(saved.dolls.dolls, dollsSave.dolls);
});

test("別的遊戲的存檔、比遊戲新的存檔、沒有娃娃的存檔都擋下來", () => {
  const data = saveData({ state: {} }, dollsSave);
  assert.throws(() => checkSave({ ...data, app: "tsunu-hospital-2" }), /不是娃娃屋的存檔/);
  assert.throws(() => checkSave(null), /不是娃娃屋的存檔/);
  assert.throws(() => checkSave({ ...data, version: data.version + 1 }), /比遊戲還新/);
  assert.throws(() => checkSave({ ...data, dolls: { version: 1, dolls: [] } }), /沒有娃娃/);
});
