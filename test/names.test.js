import assert from "node:assert/strict";
import { test } from "node:test";

import { NAME_POOL, drawName } from "../src/names.js";

test("名字辭典沒有重複的名字", () => {
  assert.equal(new Set(NAME_POOL).size, NAME_POOL.length);
});

test("抽名字避開其他娃娃在用的、也不會抽回現在這個", () => {
  const taken = NAME_POOL.slice(0, -2);
  const [a, b] = NAME_POOL.slice(-2);
  for (let i = 0; i < 20; i++) assert.ok([a, b].includes(drawName(taken)));
  for (let i = 0; i < 20; i++) assert.equal(drawName(taken, a), b);
});

test("辭典的名字都被用完時還是抽得到一個", () => {
  assert.ok(NAME_POOL.includes(drawName(NAME_POOL)));
});
