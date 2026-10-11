// 遊戲存檔：錢、材料、商品、家具、房間、三消、工坊、咖啡廳。規則全部交給小屋匯出的 vendor/rules，這裡只負責存讀與通知。
// 動作一律用 actor "atone" 送：小屋存檔裡的「阿童」在兒童版就是玩家。

import { restore } from "../vendor/rules/restore.js";
import { applyAction } from "../vendor/rules/state.js";

export const GAME_KEY = "dollhouse.game";
const CONTENT_FILES = ["furniture", "recipes", "clothes", "settings", "pets", "fortunes", "rooms"];

/** 內容表組成規則要的 Content；read(name) 回傳 vendor/content/<name>.json 的內容（瀏覽器用 fetch、測試用 fs）。 */
export async function loadContent(read) {
  const entries = await Promise.all(CONTENT_FILES.map(async (name) => [name, await read(name)]));
  return Object.fromEntries(entries);
}

/** 同步版，給測試用。 */
export function contentFrom(read) {
  return Object.fromEntries(CONTENT_FILES.map((name) => [name, read(name)]));
}

export function createGame(content, storage, clock = () => new Date()) {
  const saved = storage.getItem(GAME_KEY);
  let state = restore(saved ? JSON.parse(saved) : undefined, content);
  const listeners = new Set();
  const context = {
    content, actor: "atone", now: clock,
    newId: () => crypto.randomUUID(),
    seed: () => Math.floor(Math.random() * 2 ** 31),
  };
  return {
    get state() { return state; },
    get content() { return content; },
    /** 套用一個動作；不合法會丟錯，狀態與存檔都不變。 */
    apply(action) {
      state = applyAction(state, action, context);
      storage.setItem(GAME_KEY, JSON.stringify(state));
      for (const listener of listeners) listener(state);
      return state;
    },
    /** 整份換掉（匯入存檔用）：先照目前規則升級舊格式。 */
    replace(snapshot) {
      state = restore(snapshot, content);
      storage.setItem(GAME_KEY, JSON.stringify(state));
      for (const listener of listeners) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
