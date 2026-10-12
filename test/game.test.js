import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { cafeTick } from "../src/cafe-clock.js";
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

test("帶上娃娃（doer）的動作，日誌記她的名字", () => {
  const game = createGame(content, memoryStorage());
  game.apply({ kind: "wave" }, { name: "小花", spot: { room: "bedroom", x: 1, y: 1 } });
  assert.equal(game.state.journal.at(-1).who, "小花");
  game.apply({ kind: "wave" });
  assert.equal(game.state.journal.at(-1).who, undefined);
});

test("遊戲存檔裡阿童、阿宇的穿著是空的（娃娃穿什麼記在娃娃存檔），衣櫃的基本款賣得掉", () => {
  const game = createGame(content, memoryStorage());
  assert.deepEqual(game.state.worn, { atone: {}, tsunu: {} });
  const item = Object.keys(game.state.wardrobe)[0];
  const before = game.state.money;
  game.apply({ kind: "sell_clothes", item });
  assert.ok(game.state.money > before);
});

test("咖啡廳的時鐘帶客人上門（用店裡自己的身分套用）；玩家自己帶不了客人", () => {
  const game = createGame(content, memoryStorage());
  cafeTick(game, new Date(), () => 0, () => "c1");
  const [customer] = game.state.shops.cafe.customers;
  assert.equal(customer?.id, "c1");
  assert.throws(() => game.apply({ kind: "customer_arrive", id: "c2", wants: customer.wants, look: 0 }), /客人只會自己上門/);
});

test("訂閱者在每次成功的動作後收到新狀態", () => {
  const game = createGame(content, memoryStorage());
  const seen = [];
  game.subscribe((state) => seen.push(state.revision));
  game.apply({ kind: "puzzle_start" });
  assert.equal(seen.length, 1);
});
