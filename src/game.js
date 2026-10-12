// 遊戲存檔：錢、材料、商品、家具、房間、三消、工坊、咖啡廳。規則全部交給小屋匯出的 vendor/rules，這裡只負責存讀與通知。
// 玩家的動作用 actor "atone" 送：小屋存檔裡的「阿童」在兒童版就是玩家；哪個娃娃做的、站在哪，用 doer 告訴規則。
// 咖啡廳時鐘排的動作（客人上門、等太久離開、自動出餐）用 actor "game"，跟小屋的時鐘一樣是店裡自己發生的事。

import { restore } from "../vendor/rules/restore.js";
import { applyAction } from "../vendor/rules/state.js";

export const GAME_KEY = "dollhouse.game";
const CONTENT_FILES = ["furniture", "recipes", "clothes", "settings", "pets", "fortunes", "rooms", "dishes", "surfaces", "decor"];

/** 內容表組成規則要的 Content；read(name) 回傳 vendor/content/<name>.json 的內容（瀏覽器用 fetch、測試用 fs）。 */
export async function loadContent(read) {
  const entries = await Promise.all(CONTENT_FILES.map(async (name) => [name, await read(name)]));
  return Object.fromEntries(entries);
}

/** 同步版，給測試用。 */
export function contentFrom(read) {
  return Object.fromEntries(CONTENT_FILES.map((name) => [name, read(name)]));
}

/** 兒童版的娃娃穿什麼記在娃娃存檔：規則裡阿童、阿宇的穿著清空，賣衣服時規則才不會拿那份擋（有沒有娃娃穿著由畫面算）。 */
const forDolls = (state) => ({ ...state, worn: { atone: {}, tsunu: {} } });

export function createGame(content, storage, clock = () => new Date()) {
  const saved = storage.getItem(GAME_KEY);
  let state = forDolls(restore(saved ? JSON.parse(saved) : undefined, content));
  const listeners = new Set();
  const context = {
    content, actor: "atone", now: clock,
    newId: () => crypto.randomUUID(),
    seed: () => Math.floor(Math.random() * 2 ** 31),
  };
  const commit = (next) => {
    state = next;
    storage.setItem(GAME_KEY, JSON.stringify(state));
    for (const listener of listeners) listener(state);
    return state;
  };
  return {
    get state() { return state; },
    get content() { return content; },
    /** 套用一個動作；不合法會丟錯，狀態與存檔都不變。doer（{ name, spot }）是做這件事的娃娃：日誌記她的名字，洗手、做菜看她站哪。 */
    apply(action, doer) {
      return commit(applyAction(state, action, doer ? { ...context, doer } : context));
    },
    /** 店裡自己發生的事（咖啡廳時鐘排的動作）；不合法一樣丟錯。 */
    applyAsHouse(action) {
      return commit(applyAction(state, action, { ...context, actor: "game" }));
    },
    /** 整份換掉（匯入存檔用）：先照目前規則升級舊格式。 */
    replace(snapshot) {
      commit(forDolls(restore(snapshot, content)));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
