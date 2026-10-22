import assert from "node:assert/strict";
import { test } from "node:test";

import { DOLLS_KEY, MAX_DOLLS, addDoll, createDoll, loadDolls, randomShopkeeper, removeDoll, saveDolls, updateDoll } from "../src/dolls.js";

const doll = (overrides = {}) => createDoll({ name: "小花", body: "f", ...overrides }, () => `id-${Math.random()}`);

test("新娃娃預設穿基本衣服（女生 T 恤配牛仔短褲）、站在臥室", () => {
  assert.deepEqual(doll().worn, { top: "tee_gray", bottom: "jeans_shorts", shoes: "shoes_gray" });   // 鞋子在家不畫、當店長時穿
  assert.deepEqual(doll().colors, { tee_gray: "#f4b3c2" });   // 女生的 T 恤一開始是粉紅
  assert.deepEqual(doll({ body: "m" }).worn, { top: "shirt_gray", bottom: "pants_gray", shoes: "shoes_gray" });   // 男生藍襯衫配卡其褲
  assert.equal(doll().spot.room, "bedroom");
});

test("版本 1 的娃娃存檔（上衣、外套兩欄）一路升級：分格、女生穿 T 恤的補牛仔短褲、彩色款換灰稿並記下顏色、男生的套裝拆成襯衫＋長褲", () => {
  const clothes = { tee_gray: { category: "tee" }, dress_gray: { category: "dress" }, coat_camel: { category: "coat" }, shirt_gray: { category: "shirt" }, pants_gray: { category: "pants" } };
  const old = { id: "a", name: "舊", body: "f", top: "casual", outer: "coat_camel" };
  const map = new Map([[DOLLS_KEY, JSON.stringify({ version: 1, dolls: [old, { ...old, id: "b", top: "dress_lavender", outer: null }, { ...old, id: "c", body: "m", top: "shirt", outer: null }], selected: "a" })]]);
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  const { dolls } = loadDolls(storage, clothes);
  assert.deepEqual(dolls.map((d) => d.worn), [{ top: "tee_gray", bottom: "jeans_shorts", coat: "coat_camel" }, { top: "dress_gray" }, { top: "shirt_gray", bottom: "pants_gray" }]);
  assert.deepEqual(dolls.map((d) => d.colors), [{ tee_gray: "#f4b3c2" }, { dress_gray: "#c9b6e4" }, { shirt_gray: "#a9c8ee", pants_gray: "#cfbda2" }]);
  assert.equal("top" in dolls[0], false);
});

test("版本 4 的娃娃穿著一件式制服：拆成襯衫＋百褶裙＋蝴蝶結，照大類穿上", () => {
  const clothes = { shirt_gray: { category: "shirt" }, skirt_gray: { category: "skirt" }, bowtie_gray: { category: "bowtie" } };
  const map = new Map([[DOLLS_KEY, JSON.stringify({ version: 4, dolls: [{ id: "a", name: "舊", body: "f", worn: { top: "uniform_gray" }, colors: {} }], selected: "a" })]]);
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  assert.deepEqual(loadDolls(storage, clothes).dolls[0].worn, { top: "shirt_gray", bottom: "skirt_gray", accessory: "bowtie_gray" });
});

test("最多四個娃娃", () => {
  let dolls = [];
  for (let i = 0; i < MAX_DOLLS; i++) dolls = addDoll(dolls, doll());
  assert.throws(() => addDoll(dolls, doll()), /最多/);
});

test("最後一個娃娃不能刪", () => {
  const only = [doll()];
  assert.throws(() => removeDoll(only, only[0].id), /至少/);
  const two = [...only, doll({ name: "小草" })];
  assert.deepEqual(removeDoll(two, two[0].id).map((d) => d.name), ["小草"]);
});

test("修改娃娃只改指定的欄位", () => {
  const dolls = [doll()];
  const [changed] = updateDoll(dolls, dolls[0].id, { hairColor: "#c75c4a" });
  assert.equal(changed.hairColor, "#c75c4a");
  assert.equal(changed.name, "小花");
});

test("顧店的娃娃隨機抽", () => {
  const dolls = [doll({ name: "一" }), doll({ name: "二" }), doll({ name: "三" })];
  assert.equal(randomShopkeeper(dolls, () => 0).name, "一");
  assert.equal(randomShopkeeper(dolls, () => 0.99).name, "三");
});

test("版本 5 的娃娃留著舊的捲髮鮑伯頭：換成同造型的捲捲短髮，其他不變", () => {
  const map = new Map([[DOLLS_KEY, JSON.stringify({ version: 5, dolls: [{ id: "a", name: "舊", body: "f", hair: "kid_bob", hairColor: "#c75c4a", worn: {}, colors: {} }, { id: "b", name: "長", body: "f", hair: "kid_long", worn: {}, colors: {} }], selected: "a" })]]);
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  const [old, long] = loadDolls(storage).dolls;
  assert.equal(old.hair, "curly_short");
  assert.equal(old.hairColor, "#c75c4a");
  assert.equal(long.hair, "kid_long");
});

test("存檔帶版本號，讀回來一樣；沒有存檔就是空的", () => {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  assert.deepEqual(loadDolls(storage), { dolls: [], selected: null });
  const dolls = [doll()];
  saveDolls(storage, { dolls, selected: dolls[0].id });
  assert.equal(JSON.parse(map.get(DOLLS_KEY)).version, 7);
  assert.deepEqual(loadDolls(storage), { dolls, selected: dolls[0].id });
});

test("新娃娃的預設嘴巴：那個素體的第一款", () => {
  assert.equal(doll().mouth, "kid_f_smile");
  assert.equal(doll({ body: "m" }).mouth, "kid_m_smile");
});

test("版本 6 的娃娃存檔：穿在上衣格的南瓜小丑裝搬到罩裙格，其他格不動", () => {
  const map = new Map([[DOLLS_KEY, JSON.stringify({ version: 6, dolls: [
    { id: "a", name: "甲", body: "f", worn: { top: "pumpkin_suit", bottom: "jeans_shorts", shoes: "shoes_gray" } },
    { id: "b", name: "乙", body: "f", worn: { top: "tee_gray", bottom: "jeans_shorts" } },
  ], selected: "a" })]]);
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  const { dolls } = loadDolls(storage);
  assert.deepEqual(dolls[0].worn, { bottom: "jeans_shorts", shoes: "shoes_gray", overskirt: "pumpkin_suit" });
  assert.deepEqual(dolls[1].worn, { top: "tee_gray", bottom: "jeans_shorts" });
});
