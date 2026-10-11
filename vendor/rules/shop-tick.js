// 每家開著的店每次檢查該發生的事：等太久的客人離開、有貨就自動出餐、店開著、沒排滿也沒在這一輪賣光就可能來一位新客人。
// 純函式：只回傳要套用的動作，亂數與 id 由呼叫端給，小屋的時鐘與兒童版的時鐘共用。
import { AUTO_SERVE_MS, CUSTOMER_PATIENCE_MS, SHOP_QUEUE, shopOf } from "./state.js";
export const SHOP_TICK_MS = 5_000;
const ARRIVAL_MEAN_MS = 40_000; // 客人平均花 REFERENCE_PRICE 的店，平均每 40 秒來一位
const REFERENCE_PRICE = 45; // 一份四個材料的商品大約的價錢；客人平均花得比這多的店，來客照比例變慢
export const OPENING_DAY_MS = 24 * 60 * 60 * 1000; // 開幕第一天來客減半
const LOOK_SEEDS = 2 ** 31;
export function shopTick(state, content, now, rand, newId) {
    const actions = [];
    const stock = { ...state.products }; // 各店共用商品庫存，一份貨只出給一位客人
    for (const [kind, shop] of Object.entries(state.shops)) {
        const chains = Object.keys(content.recipes).filter((chain) => shopOf(content.recipes[chain]) === kind); // 客人只點自家店的商品
        let waiting = shop.customers.length;
        let servedNow = false;
        for (const customer of shop.customers) {
            const waited = now.getTime() - new Date(customer.arrivedAt).getTime();
            if (waited > CUSTOMER_PATIENCE_MS) {
                actions.push({ kind: "customer_leave", id: customer.id });
                waiting--;
            }
            else if (waited > AUTO_SERVE_MS && (stock[customer.wants] ?? 0) > 0) {
                actions.push({ kind: "serve", customer: customer.id });
                stock[customer.wants] -= 1;
                waiting--;
                servedNow = true;
            }
        }
        if (!chains.length)
            continue;
        const closing = servedNow && chains.every((chain) => !stock[chain]); // 出餐把貨賣光時 serve 會順手打烊，新客人進不了門
        const demand = orderWeights(chains.map((chain) => content.recipes[chain].price));
        const spend = chains.reduce((sum, chain, i) => sum + demand[i] * content.recipes[chain].price, 0); // 這家店每位客人平均花多少
        const openingDay = shop.openedAt !== undefined && now.getTime() - new Date(shop.openedAt).getTime() < OPENING_DAY_MS;
        const arrivalChance = SHOP_TICK_MS / (ARRIVAL_MEAN_MS * Math.max(1, spend / REFERENCE_PRICE)) / (openingDay ? 2 : 1);
        if (shop.open && !closing && waiting < SHOP_QUEUE && rand() < arrivalChance) {
            actions.push({ kind: "customer_arrive", id: newId(), wants: chains[pick(demand, rand())], look: Math.floor(rand() * LOOK_SEEDS), ...(kind !== "cafe" ? { shop: kind } : {}) });
        }
    }
    return actions;
}
/** 客人點各樣商品的機率：跟價錢成反比，越貴越少人點（加總是 1）。 */
export function orderWeights(prices) {
    const inverse = prices.map((price) => 1 / Math.max(1, price));
    const total = inverse.reduce((sum, value) => sum + value, 0);
    return inverse.map((value) => value / total);
}
/** 照機率挑一個：roll 是 0～1 的亂數。 */
function pick(weights, roll) {
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
        acc += weights[i];
        if (roll < acc)
            return i;
    }
    return weights.length - 1;
}
//# sourceMappingURL=shop-tick.js.map