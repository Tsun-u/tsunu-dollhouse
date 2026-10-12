// 咖啡廳的時鐘：遊戲打開、頁面看得到時，每隔一陣子問小屋的 shopTick 該發生什麼事（客人進來、等太久離開、自動出餐）。
// 頁面藏起來就不跑：關掉遊戲就是打烊，回來不會發現客人全走了。

import { SHOP_TICK_MS, shopTick } from "../vendor/rules/shop-tick.js";

export function startCafeClock(game) {
  const timer = setInterval(() => {
    if (!document.hidden) cafeTick(game, new Date(), Math.random, () => crypto.randomUUID());
  }, SHOP_TICK_MS);
  return () => clearInterval(timer);
}

/** 這一輪該發生的事用店裡自己的身分套用；被規則擋下的只記在主控台，不打擾玩家（跟小屋的時鐘一樣）。 */
export function cafeTick(game, now, rand, newId) {
  for (const action of shopTick(game.state, game.content, now, rand, newId)) {
    try {
      game.applyAsHouse(action);
    } catch (error) {
      console.error(`時鐘的 ${action.kind} 沒套用：${error.message}`);
    }
  }
}
