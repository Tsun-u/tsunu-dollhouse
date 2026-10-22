// 商店街：一條橫向的街，客人與屋主沿著街景圖的橫座標走動（沒有格子），店與旅館是街上的門。
// 位置寫法沿用 Spot：street 的 x 是街景圖座標（0～STREET_WIDTH）、y 固定 0；站在店裡時 room 是店的代號、x 與 y 都 0。
// 旅館：room 是大廳或兩間浴場；浴場裡 y 0 是池邊走道（x 是走道上的位置）、y 1 是泡在池裡（x 是池位 0～POOL_SLOTS−1）。
export const STREET_ROOM = "street";
export const STREET_WIDTH = 2700; // 街景圖 assets/street/street.png（1800）接上旅館那段 assets/street/inn.png（900）
/** 街上的門（街景圖橫座標）：我們的樓（一樓咖啡廳、二樓家）在中間，左右是可以租的店面，旅館在延伸段的正中央。 */
export const STREET_DOORS = { home: 1070, left: 311, right: 1492, inn: 2260 };
export const DOOR_REACH = 60; // 離門這麼近才算站在門口
const SHOP_KINDS = ["cafe", "grocery", "boutique"];
export const INN_LOBBY = "inn";
export const INN_BATHS = { blue: "inn_blue", red: "inn_red" };
export const POOL_SLOTS = 6;
export const INN_LABEL = "溫泉旅館";
export const BATH_LABEL = { blue: "男湯", red: "女湯" };
export const isShopRoom = (room) => SHOP_KINDS.includes(room);
export const isInnRoom = (room) => room === INN_LOBBY || room === INN_BATHS.blue || room === INN_BATHS.red;
export const isBathRoom = (room) => room === INN_BATHS.blue || room === INN_BATHS.red;
export const curtainOf = (room) => room === INN_BATHS.blue ? "blue" : room === INN_BATHS.red ? "red" : null;
/** 不在家裡的房間：街上、店裡或旅館裡。 */
export const isOutside = (room) => room === STREET_ROOM || isShopRoom(room) || isInnRoom(room);
export const clampStreetX = (x) => Math.max(0, Math.min(STREET_WIDTH, Math.round(x)));
export const atDoor = (x, door) => Math.abs(x - door) <= DOOR_REACH;
//# sourceMappingURL=street.js.map