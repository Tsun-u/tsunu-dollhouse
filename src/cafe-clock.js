// 咖啡廳的時鐘：遊戲打開、頁面看得到時，每隔一陣子問小屋的 shopTick 該發生什麼事（客人進來、等太久離開、自動出餐）。
// 頁面藏起來就不跑：關掉遊戲就是打烊，回來不會發現客人全走了。

import { SHOP_TICK_MS, shopTick } from "../vendor/rules/shop-tick.js";

export function startCafeClock(game, apply) {
  const tick = () => {
    if (document.hidden) return;
    for (const action of shopTick(game.state, game.content, new Date(), Math.random, () => crypto.randomUUID())) apply(action);
  };
  const timer = setInterval(tick, SHOP_TICK_MS);
  return () => clearInterval(timer);
}
