import assert from "node:assert/strict";
import { test } from "node:test";

import { NAMES, drawName } from "../src/names.js";

test("名字辭典女生、男生各自沒有重複，兩份也不重疊", () => {
  for (const list of Object.values(NAMES)) assert.equal(new Set(list).size, list.length);
  assert.equal(NAMES.f.filter((name) => NAMES.m.includes(name)).length, 0);
});

test("照身體抽：女生抽女生的、男生抽男生的", () => {
  for (let i = 0; i < 20; i++) {
    assert.ok(NAMES.f.includes(drawName("f")));
    assert.ok(NAMES.m.includes(drawName("m")));
  }
});

test("抽名字避開其他娃娃在用的、也不會抽回現在這個", () => {
  const taken = NAMES.f.slice(0, -2);
  const [a, b] = NAMES.f.slice(-2);
  for (let i = 0; i < 20; i++) assert.ok([a, b].includes(drawName("f", taken)));
  for (let i = 0; i < 20; i++) assert.equal(drawName("f", taken, a), b);
});

test("辭典的名字都被用完時還是抽得到一個", () => {
  assert.ok(NAMES.m.includes(drawName("m", NAMES.m)));
});
