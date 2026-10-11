import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { GAME_KEY, contentFrom, createGame } from "../src/game.js";

const read = (name) => JSON.parse(readFileSync(new URL(`../vendor/content/${name}.json`, import.meta.url), "utf8"));
const content = contentFrom(read);
const memoryStorage = () => {
  const map = new Map();
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), map };
};

test("第一次打開是新的遊戲", () => {
  const game = createGame(content, memoryStorage());
  assert.equal(game.state.money, 0);
  assert.equal(game.state.puzzle, null);
});

test("開一盤三消之後存檔，重新打開讀得回同一個盤面", () => {
  const storage = memoryStorage();
  const game = createGame(content, storage);
  game.apply({ kind: "puzzle_start" });
  assert.notEqual(game.state.puzzle, null);
  const again = createGame(content, storage);
  assert.deepEqual(again.state.puzzle.board, game.state.puzzle.board);
});

test("不合法的動作丟錯，存檔不變", () => {
  const storage = memoryStorage();
  const game = createGame(content, storage);
  const before = storage.getItem(GAME_KEY);
  assert.throws(() => game.apply({ kind: "buy", item: "沒有這件家具" }));
  assert.equal(storage.getItem(GAME_KEY), before);
});

test("訂閱者在每次成功的動作後收到新狀態", () => {
  const game = createGame(content, memoryStorage());
  const seen = [];
  game.subscribe((state) => seen.push(state.revision));
  game.apply({ kind: "puzzle_start" });
  assert.equal(seen.length, 1);
});
