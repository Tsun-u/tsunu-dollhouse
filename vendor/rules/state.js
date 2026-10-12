import { CATEGORY_SLOT, SLOT_LABEL } from "./clothing.js";
import { BODIES } from "./looks.js";
import { createBoard, finale, random, swap } from "./match3.js";
import { createWorkshop, moveOrMerge, putMaterial } from "./workshop.js";
export const JOURNAL_LIMIT = 500;
export const CHAT_LIMIT = 300;
const SHELF_LIMIT = 200;
export const THIRSTY_DAYS = 3; // 盆栽這麼多天沒澆水就垂下去
export const DEFAULT_FLOOR = "tile"; // 房間沒換過地板、壁紙時的樣式（content/surfaces.json）
export const DEFAULT_WALL = "plain";
export const HUNGRY_HOURS = 12; // 狗這麼久沒吃正餐就餓了
export const FULL_HOURS = 3; // 吃完正餐這段時間內還飽，不再吃
export const TABLE_SLOTS = 3;
export const INVITE_MS = 3 * 60_000; // 訪客的邀請沒回應多久過期
export const INVITE_RESULT_MS = 2 * 60_000; // 回應過的邀請留多久（讓邀請的人看到結果）
export const FRESH_MS = 2 * 60 * 60_000; // 商品放桌上超過兩小時，熱的就涼了、冰的就退冰了
/** 桌上商品現在的狀態：熱的「還溫／涼了」，冰的「還冰／退冰了」，常溫的一直是「放著」。 */
export function tableFreshness(recipe, placedAt, now) {
    if (recipe?.temp === "room")
        return { fresh: true, label: "放著" };
    const fresh = now.getTime() - new Date(placedAt).getTime() <= FRESH_MS;
    const cold = recipe?.temp === "cold";
    return { fresh, label: fresh ? (cold ? "還冰" : "還溫") : (cold ? "退冰了" : "涼了") };
}
const NOTE_MAX_LENGTH = 200;
const SHELF_MAX_LENGTH = 120;
export const CHAT_MAX_LENGTH = 500;
export const PUZZLE_ROWS = 7;
export const PUZZLE_COLS = 7;
export const PUZZLE_MOVES = 20;
export const SHOP_LABEL = { cafe: "咖啡廳", grocery: "雜貨店", boutique: "服飾店" };
export const SHOP_RENT = { grocery: 3000, boutique: 5000 }; // 租下隔壁店面一次付清
/** 這條配方鏈屬於哪家店；沒標的是咖啡廳。 */
/** 裝飾點在這家店的名稱（咖啡廳的主角家具叫「桌椅」）。 */
export const decorSpotLabel = (decor, shop, spot) => decor.shops[shop]?.[spot] ?? decor.spots[spot]?.label ?? spot;
export const shopOf = (recipe) => recipe?.shop ?? "cafe";
export const SHOP_QUEUE = 3; // 店裡最多幾位客人在等
export const CUSTOMER_PATIENCE_MS = 150_000;
export const AUTO_SERVE_MS = 15_000; // 客人到了這麼久沒人理，有貨就由店自己出餐（沒小費）
export const TIP_RATE = 0.2;
export const RESALE_RATE = 0.5; // 家具、衣服賣回店裡的折數
export const SERVED_MILESTONES = [10, 50, 100, 200, 500]; // 服務人次到這些數字時記一筆
export const QUIET_DAYS = 2; // 阿童這麼多天沒動靜，小屋記一筆
export const ORDER_WEIGHT = 2; // 客人點的商品，它的材料在盤面裡多出現幾份（每位客人加一份，最多加這麼多）
/** 門在房間最前面的角落；阿宇回家從這裡走進來。 */
export const DOOR = { x: 7, y: 7 };
export const ACTOR_NAME = { atone: "阿童", tsunu: "阿宇" };
export const FIRST_ROOM = "bedroom";
const HOME_SPOTS = { atone: { room: FIRST_ROOM, x: 6, y: 2 }, tsunu: { room: FIRST_ROOM, x: 2, y: 6 } };
export const STARTER_INVENTORY = { sofa: 1, table: 1, bed: 1, bookshelf: 1, plant: 2, lamp: 1, rug: 1, dogbed: 2 };
export const STARTER_WARDROBE = { tee_gray: 1, jeans_shorts: 1, shirt_gray: 1, pants_gray: 1, shoes_gray: 1 };
export const STARTER_WORN = { atone: { ...BODIES.f.starter }, tsunu: { ...BODIES.m.starter } }; // 兩版共用的起始穿著（鞋子在家不穿、在店裡穿）
export const STARTER_CLOTHES_COLORS = { ...BODIES.f.starterColors, ...BODIES.m.starterColors };
export function createInitialState() {
    return {
        version: 1, revision: 0, money: 0,
        rooms: { [FIRST_ROOM]: createBedroom([]) },
        inventory: { ...STARTER_INVENTORY },
        materials: {}, products: {}, dishes: {},
        puzzle: null,
        workshop: createWorkshop(),
        shops: { cafe: { open: true, customers: [], served: 0 } },
        tsunu: { home: false, note: "出門一下，晚點回來。" },
        positions: { ...HOME_SPOTS },
        stamina: { value: 5, updatedAt: "2026-01-01T00:00:00.000Z" },
        milestones: {},
        wardrobe: { ...STARTER_WARDROBE },
        worn: { atone: { ...STARTER_WORN.atone }, tsunu: { ...STARTER_WORN.tsunu } },
        clothesColors: { ...STARTER_CLOTHES_COLORS },
        journal: [],
        chat: [],
        shelf: [],
        sleeping: null,
        orders: [],
    };
}
/** 一開始就有的臥室；舊存檔的單一房間也搬進這裡。 */
export function createBedroom(placed, width = 8, depth = 8) {
    return { kind: FIRST_ROOM, name: "臥室", width, depth, placed, doors: [] };
}
/** 套用一個動作，回傳新狀態；不合法就丟錯、狀態不變。每個成功動作 revision +1，值得記的動作寫一筆日誌。 */
export function applyAction(state, action, context) {
    const { state: next, note, tier, chain, earned, to } = reduce(state, action, context);
    const quiet = (tier ?? (DIGEST_KINDS.has(action.kind) ? "digest" : "live")) === "digest";
    const entry = { at: context.now().toISOString(), actor: context.actor, ...(context.doer ? { who: context.doer.name } : {}), text: note ?? "", kind: action.kind, ...(quiet ? { quiet: true } : {}), ...(chain ? { chain } : {}), ...(earned ? { earned } : {}), ...(to ? { to } : {}) };
    const last = next.journal.at(-1);
    const repeated = note !== null && TWEAK_KINDS.has(action.kind) && last?.kind === action.kind && last.actor === context.actor && last.who === entry.who && last.text === note
        && context.now().getTime() - Date.parse(last.at) < TWEAK_WINDOW_MS; // 在調色盤上一格一格試顏色：只留第一筆，不每點一下就記一筆、推一則
    const journal = note === null || repeated ? next.journal : [...next.journal, entry].slice(-JOURNAL_LIMIT);
    return { ...next, revision: state.revision + 1, journal };
}
/** 會連續微調的動作（試顏色）：同一個人、同一句話在這段時間內重複，日誌只記一筆。 */
const TWEAK_KINDS = new Set(["paint_furniture", "dye_clothes"]);
const TWEAK_WINDOW_MS = 2 * 60_000;
/** 推播分級：這些動作是流水帳，併進每小時彙總；其他（對阿宇的互動、走進哪間房、里程碑、派單…）即時推。
 *  個別結果可以用 Reduced.tier 覆寫，例如第一次做出某商品、服務人次里程碑、雙人三消輪到誰。 */
const DIGEST_KINDS = new Set([
    "workshop_move", "craft", "serve", "customer_leave", "wear", "place", "move", "flip", "store", "read", "shelve", "toggle", "water",
    "buy", "sell_furniture", "buy_clothes", "sell_clothes", "grant", "take_from_table", "throw_ball", "pet", "feed", "puzzle_start", "puzzle_swap", "shop_open", "keep_clothes",
]);
function reduce(state, action, context) {
    const { furniture, recipes, clothes, pets, fortunes } = context.content;
    const label = (item) => furniture[item]?.label ?? item;
    const materialLabel = (chain) => recipes[chain]?.label ?? chain;
    const productLabel = (chain) => recipes[chain]?.tiers.at(-1) ?? chain;
    switch (action.kind) {
        case "place": {
            const spec = furniture[action.item];
            if (!spec)
                throw new Error(`沒有「${action.item}」這種家具。`);
            if ((state.inventory[action.item] ?? 0) < 1)
                throw new Error(`倉庫裡沒有${spec.label}。`);
            const roomId = action.room ?? actorRoom(state, context.actor);
            const room = findRoom(state, roomId);
            const piece = { id: context.newId(), item: action.item, x: action.x, y: action.y, flip: action.flip ?? false };
            assertFits(room, piece, furniture);
            return {
                state: { ...withRoom(state, roomId, { ...room, placed: [...room.placed, piece] }), inventory: adjust(state.inventory, action.item, -1) },
                note: `把${spec.label}放到${roomNote(state, roomId)} (${action.x}, ${action.y})`,
            };
        }
        case "move": {
            const { piece, roomId } = findPlaced(state, action.id);
            const moved = { ...piece, x: action.x, y: action.y };
            assertFits(findRoom(state, roomId), moved, furniture, piece.id);
            return { state: replacePlaced(state, moved), note: `把${label(piece.item)}搬到 (${action.x}, ${action.y})` };
        }
        case "flip": {
            const { piece, roomId } = findPlaced(state, action.id);
            // 牆上家具換到另一面牆的同一格；有背面圖的家具輪四個方向：朝右下 → 左下 → 左上 → 右上，每轉兩次換一次正反面
            const spec = furniture[piece.item];
            const flipped = spec?.onWall ? { ...piece, flip: !piece.flip, x: piece.y, y: piece.x }
                : spec?.back ? { ...piece, flip: !piece.flip, back: piece.flip ? !piece.back : !!piece.back } : { ...piece, flip: !piece.flip };
            assertFits(findRoom(state, roomId), flipped, furniture, piece.id);
            return { state: replacePlaced(state, flipped), note: `把${label(piece.item)}轉向` };
        }
        case "store": {
            const { piece, roomId } = findPlaced(state, action.id);
            const room = findRoom(state, roomId);
            return {
                state: { ...withRoom(state, roomId, { ...room, placed: room.placed.filter((p) => p.id !== piece.id) }), inventory: adjust(state.inventory, piece.item, 1) },
                note: `把${label(piece.item)}收回倉庫`,
            };
        }
        case "grant": {
            if (!furniture[action.item])
                throw new Error(`沒有「${action.item}」這種家具。`);
            const count = action.count ?? 1;
            if (!Number.isInteger(count) || count < 1)
                throw new Error("數量必須是正整數。");
            return { state: { ...state, inventory: adjust(state.inventory, action.item, count) }, note: `倉庫多了 ${count} 個${label(action.item)}` };
        }
        case "buy": {
            const spec = furniture[action.item];
            if (!spec)
                throw new Error(`沒有「${action.item}」這種家具。`);
            if (state.money < spec.price)
                throw new Error(`錢不夠：${spec.label}要 ${spec.price}，現在有 ${state.money}。`);
            return { state: { ...state, money: state.money - spec.price, inventory: adjust(state.inventory, action.item, 1) }, note: `花 ${spec.price} 買了${spec.label}` };
        }
        case "sell_furniture": {
            const spec = furniture[action.item];
            if (!spec)
                throw new Error(`沒有「${action.item}」這種家具。`);
            if ((state.inventory[action.item] ?? 0) < 1)
                throw new Error(`倉庫裡沒有${spec.label}。`);
            const refund = Math.floor(spec.price * RESALE_RATE);
            return { state: { ...state, money: state.money + refund, inventory: adjust(state.inventory, action.item, -1) }, note: `把${spec.label}賣回家具店，拿回 ${refund}` };
        }
        case "buy_clothes": {
            const spec = clothes[action.item];
            if (!spec)
                throw new Error(`沒有「${action.item}」這件衣服。`);
            if (state.money < spec.price)
                throw new Error(`錢不夠：${spec.label}要 ${spec.price}，現在有 ${state.money}。`);
            return { state: { ...state, money: state.money - spec.price, wardrobe: adjust(state.wardrobe, action.item, 1) }, note: `花 ${spec.price} 買了${spec.label}` };
        }
        case "sell_clothes": {
            const spec = clothes[action.item];
            if (!spec)
                throw new Error(`沒有「${action.item}」這件衣服。`);
            const owned = state.wardrobe[action.item] ?? 0;
            if (owned < 1)
                throw new Error(`衣櫃裡沒有${spec.label}。`);
            const wearers = ["atone", "tsunu"].filter((who) => Object.values(state.worn[who]).includes(action.item));
            if (owned <= wearers.length)
                throw new Error(`${spec.label}正穿在${wearers.map((who) => ACTOR_NAME[who]).join("和")}身上，先脫下來才能賣。`);
            const refund = Math.floor(spec.price * RESALE_RATE);
            const wardrobe = adjust(state.wardrobe, action.item, -1);
            const colors = { ...state.clothesColors };
            if (!wardrobe[action.item])
                delete colors[action.item]; // 賣光了，顏色也不用記了
            return { state: { ...state, money: state.money + refund, wardrobe, clothesColors: colors }, note: `賣掉一件${spec.label}，拿回 ${refund}` };
        }
        case "dye_clothes": {
            const spec = context.content.clothes[action.item];
            if (!spec)
                throw new Error(`沒有「${action.item}」這件衣服。`);
            if (!state.wardrobe[action.item])
                throw new Error(`衣櫃裡沒有${spec.label}。`);
            const colors = { ...state.clothesColors };
            if (action.color === null)
                delete colors[action.item];
            else
                colors[action.item] = hexColor(action.color);
            return { state: { ...state, clothesColors: colors }, note: action.color === null ? `把${spec.label}換回原本的顏色` : `把${spec.label}換了顏色` };
        }
        case "paint_furniture": {
            const { piece } = findPlaced(state, action.id);
            if (!furniture[piece.item]?.dye)
                throw new Error(`${label(piece.item)}不能換顏色。`);
            const { tint: _old, ...plain } = piece;
            const painted = action.color === null ? plain : { ...plain, tint: hexColor(action.color) };
            return { state: replacePlaced(state, painted), note: action.color === null ? `把${label(piece.item)}換回原本的顏色` : `幫${label(piece.item)}換了布面顏色` };
        }
        case "wear": {
            if (context.actor === "game")
                throw new Error("小屋自己不穿衣服。");
            const who = action.who ?? context.actor;
            const helping = who !== context.actor ? `幫${ACTOR_NAME[who]}` : ""; // 幫對方換衣服
            const worn = state.worn[who];
            const dress = (next) => ({ ...state, worn: { ...state.worn, [who]: next } });
            if (action.item === null) {
                const slot = action.slot ?? (action.layer === "outer" ? "coat" : "top");
                const off = worn[slot];
                if (!off)
                    throw new Error(`${ACTOR_NAME[who]}沒有穿${SLOT_LABEL[slot]}。`);
                const { [slot]: _, ...rest } = worn;
                return { state: dress(rest), note: `${helping}把${clothes[off]?.label ?? SLOT_LABEL[slot]}脫下來` };
            }
            const spec = clothes[action.item];
            if (!spec)
                throw new Error(`沒有「${action.item}」這件衣服。`);
            if ((state.wardrobe[action.item] ?? 0) < 1)
                throw new Error(`衣櫃裡沒有${spec.label}。`);
            if (spec.wearers && !spec.wearers.includes(who))
                throw new Error(`${spec.label}只有${spec.wearers.map((name) => ACTOR_NAME[name]).join("、")}能穿。`);
            const slot = CATEGORY_SLOT[spec.category]; // 每一格各穿各的：穿外套不換掉上衣、穿背心裙不換掉短褲
            return { state: dress({ ...worn, [slot]: action.item }), note: `${helping}${worn[slot] ? "換上" : "穿上"}${spec.label}` };
        }
        case "dress": {
            if (context.actor === "game")
                throw new Error("小屋自己不穿衣服。");
            const who = action.who ?? context.actor;
            const before = state.worn[who];
            const owned = (item) => {
                const spec = clothes[item];
                if (!spec)
                    throw new Error(`沒有「${item}」這件衣服。`);
                if ((state.wardrobe[item] ?? 0) < 1)
                    throw new Error(`衣櫃裡沒有${spec.label}。`);
                return spec;
            };
            const added = [];
            for (const [slot, item] of Object.entries(action.worn)) { // 新穿上的才檢查：原本就穿著的當初穿的時候檢查過了
                if (before[slot] === item)
                    continue;
                const spec = owned(item);
                if (spec.wearers && !spec.wearers.includes(who))
                    throw new Error(`${spec.label}只有${spec.wearers.map((name) => ACTOR_NAME[name]).join("、")}能穿。`);
                if (CATEGORY_SLOT[spec.category] !== slot)
                    throw new Error(`${spec.label}要穿在${SLOT_LABEL[CATEGORY_SLOT[spec.category]]}。`);
                added.push(spec.label);
            }
            const removed = Object.entries(before).filter(([slot]) => !action.worn[slot]).map(([, item]) => clothes[item]?.label ?? item);
            const colors = { ...state.clothesColors };
            const recolored = [];
            for (const [item, color] of Object.entries(action.colors ?? {})) {
                const spec = owned(item);
                const next = color === null ? undefined : hexColor(color);
                if (colors[item] === next)
                    continue;
                if (next === undefined)
                    delete colors[item];
                else
                    colors[item] = next;
                recolored.push(spec.label);
            }
            if (!added.length && !removed.length && !recolored.length)
                throw new Error("沒有要換的。");
            const parts = [...(added.length ? [`換上了${added.join("、")}`] : []), ...(removed.length ? [`脫下了${removed.join("、")}`] : []), ...(recolored.length ? [`把${recolored.join("、")}換了顏色`] : [])];
            return { state: { ...state, worn: { ...state.worn, [who]: { ...action.worn } }, clothesColors: colors }, note: `${who !== context.actor ? `幫${ACTOR_NAME[who]}` : ""}${parts.join("，")}` };
        }
        case "give": {
            if (context.actor === "game")
                throw new Error("小屋自己不遞東西。");
            if (context.doer && action.to) { // 兒童版：遞給同一間房的另一個娃娃，她當場吃掉（跟遞給阿童一樣回體力）
                if (action.dish) {
                    const dish = context.content.dishes[action.dish];
                    if (!dish || (state.dishes[action.dish] ?? 0) < 1)
                        throw new Error(`沒有${dish?.label ?? action.dish}可以遞。`);
                    return { state: { ...state, dishes: adjust(state.dishes, action.dish, -1), stamina: fedStamina(state, dish.stamina, context) }, note: `遞給${action.to}一份${dish.label}`, to: action.to };
                }
                if (!action.product || (state.products[action.product] ?? 0) < 1)
                    throw new Error(`沒有${action.product ? productLabel(action.product) : "東西"}可以遞。`);
                return { state: { ...state, products: adjust(state.products, action.product, -1), stamina: fedStamina(state, 1, context) }, note: `遞給${action.to}一份${productLabel(action.product)}`, to: action.to };
            }
            if (action.to && action.to !== "atone" && action.to !== "tsunu") { // 遞給客人：從家裡的庫存拿一份到他手上
                const guest = state.visitors?.[action.to];
                if (!guest)
                    throw new Error("屋裡沒有這位客人。");
                if (guest.spot.room !== state.positions[context.actor].room)
                    throw new Error(`${guest.name}不在這間房。`);
                if (guest.holding)
                    throw new Error(`${guest.name}手上已經拿著東西了。`);
                const at = context.now().toISOString();
                if (action.dish) {
                    const dish = context.content.dishes[action.dish];
                    if (!dish || (state.dishes[action.dish] ?? 0) < 1)
                        throw new Error(`沒有${dish?.label ?? action.dish}可以遞。`);
                    const item = { kind: "dish", dish: action.dish, text: dish.label, by: context.actor, at };
                    return { state: { ...state, dishes: adjust(state.dishes, action.dish, -1), visitors: { ...state.visitors, [action.to]: { ...guest, holding: { item } } } }, note: `遞給${guest.name}一份${dish.label}`, to: action.to };
                }
                if (!action.product)
                    throw new Error("要遞商品或家常菜。");
                if ((state.products[action.product] ?? 0) < 1)
                    throw new Error(`沒有${productLabel(action.product)}可以遞。`);
                const item = { kind: "product", chain: action.product, by: context.actor, at };
                return { state: { ...state, products: adjust(state.products, action.product, -1), visitors: { ...state.visitors, [action.to]: { ...guest, holding: { item } } } }, note: `遞給${guest.name}一份${productLabel(action.product)}`, to: action.to };
            }
            if (!action.product)
                throw new Error("要遞什麼？");
            const to = context.actor === "atone" ? "tsunu" : "atone";
            if (to === "tsunu" && !state.tsunu.home)
                throw new Error("阿宇不在家，先放在桌上吧。");
            if ((state.products[action.product] ?? 0) < 1)
                throw new Error(`沒有${productLabel(action.product)}可以遞。`);
            const products = adjust(state.products, action.product, -1);
            if (to === "atone") { // 阿童收到吃了：體力回一點
                return { state: { ...state, products, stamina: fedStamina(state, 1, context) }, note: `遞給阿童一份${productLabel(action.product)}，她精神好多了` };
            }
            return { state: { ...state, products }, note: `遞給阿宇一份${productLabel(action.product)}` };
        }
        case "puzzle_start": {
            if (state.puzzle && state.puzzle.movesLeft > 0)
                throw new Error("這一盤還沒打完。");
            if (action.coop && !state.tsunu.home)
                throw new Error("阿宇不在家，沒辦法一起玩。");
            const shopKind = action.shop ?? "cafe";
            const shop = openedShop(state, shopKind);
            const stamina = spendStamina(state, context);
            const chains = Object.keys(recipes).filter((chain) => shopOf(recipes[chain]) === shopKind); // 一盤只出這家店的材料
            const wanted = [...new Set(shop.customers.map((c) => c.wants))];
            const board = createBoard(PUZZLE_ROWS, PUZZLE_COLS, orderedPool(chains, shop.customers.map((c) => c.wants)), context.seed());
            const starter = context.actor === "tsunu" ? "tsunu" : "atone";
            const coop = action.coop ? { turn: starter, scores: { atone: 0, tsunu: 0 } } : undefined;
            const puzzle = { board, movesLeft: PUZZLE_MOVES, collected: {}, wanted, ...(shopKind !== "cafe" ? { shop: shopKind } : {}), ...(coop ? { coop } : {}) };
            return { state: { ...state, stamina, puzzle }, note: coop ? `開了一盤雙人三消（幫${SHOP_LABEL[shopKind]}備料），${ACTOR_NAME[starter]}先` : null, ...(coop ? { tier: "live" } : {}) };
        }
        case "puzzle_swap": {
            if (!state.puzzle || state.puzzle.movesLeft <= 0)
                throw new Error("還沒開始這一盤。");
            const coop = state.puzzle.coop;
            if (coop && context.actor !== coop.turn)
                throw new Error(`現在輪到${ACTOR_NAME[coop.turn]}。`);
            if (!coop && context.actor === "tsunu")
                throw new Error("這一盤是阿童的，要一起玩請開雙人盤。");
            const a = { r: action.r1, c: action.c1 }, b = { r: action.r2, c: action.c2 };
            const move = swap(state.puzzle.board, a, b);
            if (!move)
                throw new Error("這樣換不會消。");
            const movesLeft = state.puzzle.movesLeft - 1;
            const bonus = movesLeft > 0 ? null : finale(move.board); // 最後一步：剩下的特殊磚一次引爆
            const result = bonus ? { board: bonus.board, cleared: mergeCounts(move.cleared, bonus.cleared), steps: [...move.steps, ...bonus.steps] } : move;
            const collected = { ...state.puzzle.collected };
            for (const [kind, count] of Object.entries(result.cleared))
                collected[kind] = (collected[kind] ?? 0) + count;
            const cleared = total(move.cleared);
            const player = context.actor;
            const partner = player === "atone" ? "tsunu" : "atone";
            const bonusCount = bonus ? total(bonus.cleared) : 0;
            const nextCoop = coop ? { turn: partner, scores: splitBonus({ ...coop.scores, [player]: coop.scores[player] + cleared }, bonusCount, result.board.seed) } : undefined;
            const puzzle = { board: result.board, movesLeft, collected, wanted: state.puzzle.wanted, ...(state.puzzle.shop ? { shop: state.puzzle.shop } : {}), ...(nextCoop ? { coop: nextCoop } : {}), lastMove: { swap: [a, b], steps: result.steps } };
            if (movesLeft > 0)
                return { state: { ...state, puzzle }, note: nextCoop ? `${ACTOR_NAME[player]}消了 ${cleared} 顆，換${ACTOR_NAME[nextCoop.turn]}（剩 ${movesLeft} 步）` : null, ...(nextCoop ? { tier: "live" } : {}) };
            const materials = { ...state.materials };
            for (const [kind, count] of Object.entries(collected))
                materials[kind] = (materials[kind] ?? 0) + count;
            const summary = Object.entries(collected).map(([kind, count]) => `${materialLabel(kind)}×${count}`).join("、") || "什麼都沒消到";
            const score = nextCoop ? `阿童消了 ${nextCoop.scores.atone}、阿宇消了 ${nextCoop.scores.tsunu}，` : "";
            const finish = bonusCount ? `收尾引爆特殊磚多消 ${bonusCount} 顆，` : "";
            return { state: { ...state, puzzle, materials }, note: `打完一盤${nextCoop ? "雙人" : ""}三消，${finish}${score}收到 ${summary}`, ...(nextCoop ? { tier: "live" } : {}) };
        }
        case "workshop_put": {
            if ((state.materials[action.chain] ?? 0) < 1)
                throw new Error(`沒有${materialLabel(action.chain)}可以放。`);
            return { state: { ...state, workshop: putMaterial(state.workshop, action.chain, recipes), materials: adjust(state.materials, action.chain, -1) }, note: null };
        }
        case "workshop_move": {
            const result = moveOrMerge(state.workshop, action.from, action.to, recipes);
            if (!result.product)
                return { state: { ...state, workshop: result.workshop }, note: null };
            return made({ ...state, workshop: result.workshop }, result.product, context);
        }
        case "craft": { // 一口氣用材料做一份商品（阿宇在 MCP 端不用拖格子）
            const recipe = recipes[action.chain];
            if (!recipe)
                throw new Error(`沒有「${action.chain}」這條配方。`);
            const need = 2 ** (recipe.tiers.length - 1);
            const have = state.materials[action.chain] ?? 0;
            if (have < need)
                throw new Error(`做一份${recipe.tiers.at(-1)}要 ${need} 個${recipe.label}，現在只有 ${have} 個。`);
            return made({ ...state, materials: adjust(state.materials, action.chain, -need) }, action.chain, context);
        }
        case "order": {
            if (context.actor === "game")
                throw new Error("小屋自己不派單。");
            if (!recipes[action.chain])
                throw new Error(`沒有「${action.chain}」這種商品。`);
            if (!Number.isInteger(action.count) || action.count < 1 || action.count > 20)
                throw new Error("份數要是 1 到 20。");
            const order = { id: context.newId(), by: context.actor, chain: action.chain, count: action.count, done: 0, at: context.now().toISOString() };
            const other = context.actor === "atone" ? "阿宇" : "阿童";
            return { state: { ...state, orders: [...state.orders, order] }, note: `請${other}做 ${action.count} 份${productLabel(action.chain)}` };
        }
        case "cancel_order": {
            const order = state.orders.find((o) => o.id === action.id);
            if (!order)
                throw new Error("沒有這張單。");
            return { state: { ...state, orders: state.orders.filter((o) => o.id !== action.id) }, note: `取消了${productLabel(order.chain)}的單` };
        }
        case "sell": {
            throw new Error("商品要賣給店裡的客人，去咖啡廳看看。");
        }
        case "shop_open": {
            const kind = action.shop ?? "cafe";
            const shop = openedShop(state, kind);
            return { state: withShop(state, kind, { ...shop, open: action.open }), note: `${SHOP_LABEL[kind]}${action.open ? "開門了" : "打烊了"}` };
        }
        case "rent_shop": {
            if (context.actor !== "atone")
                throw new Error("租店面是阿童決定的事。");
            if (action.shop === "cafe" || !(action.shop in SHOP_RENT))
                throw new Error("只能租來開雜貨店或服飾店。");
            if (state.shops[action.shop])
                throw new Error(`${SHOP_LABEL[action.shop]}已經開了。`);
            if (Object.values(state.shops).some((shop) => shop?.lot === action.lot))
                throw new Error("那間店面已經租出去了。");
            const rent = SHOP_RENT[action.shop];
            if (state.money < rent)
                throw new Error(`租金 ${rent}，錢不夠（現在 ${state.money}）。`);
            const shop = { open: true, customers: [], served: 0, lot: action.lot, openedAt: context.now().toISOString() };
            return { state: { ...withShop(state, action.shop, shop), money: state.money - rent }, note: `租下${action.lot === "left" ? "左邊" : "右邊"}的店面，${SHOP_LABEL[action.shop]}開張了！（租金 ${rent}，開幕第一天客人比較少，先備料吧）`, tier: "live" };
        }
        case "keep_clothes": {
            const recipe = recipes[action.chain];
            if (!recipe?.clothes)
                throw new Error("這不是衣服。");
            if ((state.products[action.chain] ?? 0) < 1)
                throw new Error(`沒有做好的${productLabel(action.chain)}。`);
            return { state: { ...state, products: adjust(state.products, action.chain, -1), wardrobe: adjust(state.wardrobe, recipe.clothes, 1) }, note: `把一件${productLabel(action.chain)}收進衣櫃` };
        }
        case "customer_arrive": {
            if (context.actor !== "game")
                throw new Error("客人只會自己上門。");
            const kind = action.shop ?? "cafe";
            const shop = openedShop(state, kind);
            if (!shop.open || shop.customers.length >= SHOP_QUEUE)
                throw new Error("店裡沒有位子。");
            if (!recipes[action.wants] || shopOf(recipes[action.wants]) !== kind)
                throw new Error(`${SHOP_LABEL[kind]}沒有賣「${action.wants}」。`);
            const customer = { id: action.id, wants: action.wants, arrivedAt: context.now().toISOString(), look: action.look };
            return { state: withShop(state, kind, { ...shop, customers: [...shop.customers, customer] }), note: null };
        }
        case "customer_leave": {
            const { customer, kind, shop } = findCustomer(state, action.id);
            return { state: withShop(state, kind, { ...shop, customers: shop.customers.filter((c) => c.id !== customer.id) }), note: `一位想買${productLabel(customer.wants)}的客人等太久走了`, chain: customer.wants };
        }
        case "serve": {
            const { customer, kind, shop } = findCustomer(state, action.customer);
            const recipe = recipes[customer.wants];
            if ((state.products[customer.wants] ?? 0) < 1)
                throw new Error(`沒有${productLabel(customer.wants)}可以給客人。`);
            const tip = context.actor === "game" ? 0 : Math.round(recipe.price * TIP_RATE); // 親自出餐才有小費
            const income = recipe.price + tip;
            const served = shop.served + 1;
            const milestone = SERVED_MILESTONES.includes(served) ? (kind === "cafe" ? `served:${served}` : `served:${kind}:${served}`) : null; // 咖啡廳沿用舊存檔的鍵
            const sale = context.actor === "game" ? `店裡自動賣出一份${productLabel(customer.wants)}，賺了 ${income}` : `賣給客人一份${productLabel(customer.wants)}，賺了 ${income}（含小費 ${tip}）`;
            const products = adjust(state.products, customer.wants, -1);
            const soldOut = shop.open && Object.keys(recipes).every((chain) => shopOf(recipes[chain]) !== kind || !products[chain]); // 這家店的貨全賣完了：先打烊，免得客人排隊空手走
            const notes = [sale, ...(milestone ? [`${SHOP_LABEL[kind]}服務滿 ${served} 位客人了！`] : []), ...(soldOut ? [`${SHOP_LABEL[kind]}賣光了，先打烊`] : [])];
            return {
                state: {
                    ...withShop(state, kind, { ...shop, customers: shop.customers.filter((c) => c.id !== customer.id), served, open: shop.open && !soldOut }),
                    products,
                    money: state.money + income,
                    milestones: milestone ? { ...state.milestones, [milestone]: context.now().toISOString() } : state.milestones,
                },
                note: notes.join("。"),
                earned: income,
                chain: customer.wants,
                ...(milestone || soldOut ? { tier: "live" } : {}),
            };
        }
        case "open_door": {
            if (context.actor === "game")
                throw new Error("小屋自己不開門。");
            if (state.door?.open)
                throw new Error("門已經開著了。");
            const [atoneSpot, tsunuSpot] = entranceSpots(state, furniture, 2, []); // 開門前清乾淨：兩人都起床、出浴缸，到客廳門口
            if (!atoneSpot || !tsunuSpot)
                throw new Error("客廳門口擠不下兩個人，先挪一下家具。");
            return { state: { ...state, door: { open: true, by: context.actor, at: context.now().toISOString() }, sleeping: null, positions: { atone: atoneSpot, tsunu: tsunuSpot } }, note: "打開門讓客人進來" };
        }
        case "close_door": {
            if (context.actor === "game")
                throw new Error("小屋自己不關門。");
            if (!state.door?.open)
                throw new Error("門本來就關著。");
            const guests = Object.values(state.visitors ?? {});
            const tidied = guests.reduce((next, guest) => returnHolding(next, guest, furniture), state); // 客人手上的東西放回桌上
            return { state: { ...tidied, door: { open: false, by: context.actor, at: context.now().toISOString() }, visitors: {}, invitations: [] }, note: guests.length ? "關上門，客人都回家了" : "關上門" };
        }
        case "say_guests": {
            if (context.actor === "game")
                throw new Error("小屋自己不說話。");
            const text = action.text.trim();
            if (!text)
                throw new Error("訊息不可空白。");
            if (text.length > CHAT_MAX_LENGTH)
                throw new Error(`一則最多 ${CHAT_MAX_LENGTH} 字。`);
            const message = { id: context.newId(), at: context.now().toISOString(), speaker: context.actor, name: ACTOR_NAME[context.actor], text };
            return { state: { ...state, guestChat: [...(state.guestChat ?? []), message].slice(-CHAT_LIMIT) }, note: null };
        }
        case "journal": {
            if (!action.text.trim())
                throw new Error("日誌內容不可空白。");
            return { state, note: action.text.trim() };
        }
        case "say": {
            if (context.actor === "game")
                throw new Error("小屋自己不說話。");
            const text = action.text.trim();
            if (!text)
                throw new Error("訊息不可空白。");
            if (text.length > CHAT_MAX_LENGTH)
                throw new Error(`一則最多 ${CHAT_MAX_LENGTH} 字。`);
            const message = { id: context.newId(), at: context.now().toISOString(), actor: context.actor, text, ...(action.mood && context.actor === "tsunu" ? { mood: action.mood } : {}) };
            return { state: { ...state, chat: [...state.chat, message].slice(-CHAT_LIMIT) }, note: null };
        }
        case "wave": {
            if (context.actor === "game")
                throw new Error("小屋自己不揮手。");
            return { state, note: "揮了揮手" };
        }
        case "wash": {
            if (context.actor === "game")
                throw new Error("小屋自己不刷牙。");
            const here = standingSpot(state, context);
            const room = findRoom(state, here.room);
            const { basin, verb } = washAt(room, here, action.what, furniture);
            if (!action.together)
                return { state, note: verb };
            if (state.door?.open)
                throw new Error(`有客人在，先不要一起${verb}。`);
            const partner = context.actor === "atone" ? "tsunu" : "atone";
            if (partner === "tsunu" && !state.tsunu.home)
                throw new Error("阿宇不在家。");
            const spot = freeSpotBeside(room, basin, here, furniture, visitorCells(state, here.room));
            if (!spot)
                throw new Error("洗手台前擠不下兩個人。");
            const positions = { ...state.positions, [partner]: { room: here.room, ...spot } };
            return { state: { ...state, positions }, note: `跟${partner === "tsunu" ? "阿宇" : "阿童"}一起${verb}` };
        }
        case "cook": {
            if (context.actor === "game")
                throw new Error("小屋自己不煮飯。");
            const dish = context.content.dishes[action.dish];
            if (!dish)
                throw new Error(`不會煮「${action.dish}」。`);
            const here = standingSpot(state, context);
            if (!pieceNextTo(findRoom(state, here.room), here, furniture, (spec) => !!spec.stove))
                throw new Error("要先走到爐台前。");
            const missing = Object.entries(dish.ingredients).filter(([chain, need]) => (state.materials[chain] ?? 0) < need);
            if (missing.length)
                throw new Error(`材料不夠：${missing.map(([chain, need]) => `${recipes[chain]?.label ?? chain}要 ${need} 個（有 ${state.materials[chain] ?? 0}）`).join("、")}。`);
            const materials = Object.entries(dish.ingredients).reduce((have, [chain, need]) => adjust(have, chain, -need), state.materials);
            return { state: { ...state, materials, dishes: adjust(state.dishes, action.dish, 1) }, note: `煮了一份${dish.label}` };
        }
        case "eat": {
            if (context.actor === "game")
                throw new Error("小屋自己不吃飯。");
            const dish = context.content.dishes[action.dish];
            if (!dish || (state.dishes[action.dish] ?? 0) < 1)
                throw new Error(`沒有${dish?.label ?? action.dish}可以吃，先去爐台煮一份。`);
            const dishes = adjust(state.dishes, action.dish, -1);
            const stamina = context.actor === "atone" ? fedStamina(state, dish.stamina, context) : state.stamina;
            return { state: { ...state, dishes, stamina }, note: `吃了一份${dish.label}` };
        }
        case "pet": {
            if (context.actor === "game")
                throw new Error("小屋自己不摸狗。");
            return { state, note: petDog(pets, action.dog, action.touch) };
        }
        case "feed": {
            if (context.actor === "game")
                throw new Error("小屋自己不餵狗。");
            return feedDog(state, context.content, action.dog, action.food, context.now());
        }
        case "toggle":
            return toggleSwitch(state, furniture, action.id);
        case "read": {
            if (context.actor === "game")
                throw new Error("小屋自己不看書。");
            return { state, note: readLine(state, furniture, action.id, [...fortunes, ...state.shelf], context.seed()) };
        }
        case "shelve": {
            if (context.actor === "game")
                throw new Error("小屋自己不放書。");
            const text = action.text.trim();
            if (!text)
                throw new Error("句子不可空白。");
            if (text.length > SHELF_MAX_LENGTH)
                throw new Error(`一句最多 ${SHELF_MAX_LENGTH} 字。`);
            return { state: { ...state, shelf: [...state.shelf, text].slice(-SHELF_LIMIT) }, note: `把一句話放進書櫃：${text}` };
        }
        case "water": {
            if (context.actor === "game")
                throw new Error("小屋自己不澆水。");
            return waterPlant(state, furniture, action.id, context.now());
        }
        case "put_on_table": {
            if (context.actor === "game")
                throw new Error("小屋自己不放東西。");
            const { piece } = findPlaced(state, action.id);
            const at = context.now().toISOString();
            if (action.product) {
                if ((state.products[action.product] ?? 0) < 1)
                    throw new Error(`沒有${productLabel(action.product)}可以放。`);
                const item = { kind: "product", chain: action.product, ...placedBy(context), at };
                return { state: putOnTable({ ...state, products: adjust(state.products, action.product, -1) }, furniture, action.id, item), note: `把一份${productLabel(action.product)}放在${label(piece.item)}上` };
            }
            if (action.dish) {
                const dish = context.content.dishes[action.dish];
                if (!dish || (state.dishes[action.dish] ?? 0) < 1)
                    throw new Error(`沒有${dish?.label ?? action.dish}可以放。`);
                const item = { kind: "dish", dish: action.dish, text: dish.label, ...placedBy(context), at };
                return { state: putOnTable({ ...state, dishes: adjust(state.dishes, action.dish, -1) }, furniture, action.id, item), note: `把一份${dish.label}端到${label(piece.item)}上` };
            }
            const text = action.note?.trim() ?? "";
            if (!text)
                throw new Error("要放商品或寫一張紙條。");
            if (text.length > NOTE_MAX_LENGTH)
                throw new Error(`紙條最多 ${NOTE_MAX_LENGTH} 字。`);
            return { state: putOnTable(state, furniture, action.id, { kind: "note", text, ...placedBy(context), at }), note: `在${label(piece.item)}上留了一張紙條：${text}` };
        }
        case "take_from_table": {
            if (context.actor === "game")
                throw new Error("小屋自己不拿東西。");
            const { piece } = findPlaced(state, action.id);
            const items = piece.items ?? [];
            const item = items[action.index];
            if (!item)
                throw new Error("桌上沒有這樣東西。");
            const rest = items.filter((_, i) => i !== action.index);
            const mine = item.by === context.actor && item.name === context.doer?.name; // 兒童版同一個 actor 有好幾個娃娃，連名字一起比
            const who = mine ? "自己" : item.name ?? ACTOR_NAME[item.by];
            if (item.kind === "note")
                return { state: replacePlaced(state, { ...piece, items: rest }), note: `收起${who}留的紙條：${item.text}`, ...(!mine ? { tier: "live" } : {}) };
            if (item.kind === "dish") { // 桌上的家常菜拿起來就是吃掉：阿童吃了回體力
                const dish = context.content.dishes[item.dish];
                const name = dish?.label ?? item.dish;
                const stamina = context.actor === "atone" && dish ? fedStamina(state, dish.stamina, context) : state.stamina;
                const cleared = replacePlaced({ ...state, stamina }, { ...piece, items: rest });
                return { state: cleared, note: mine ? `吃掉桌上的${name}` : `吃了${who}煮的${name}`, ...(!mine ? { tier: "live" } : {}) };
            }
            const { fresh, label: freshness } = tableFreshness(recipes[item.chain], item.at, context.now());
            const next = replacePlaced({ ...state, products: adjust(state.products, item.chain, 1) }, { ...piece, items: rest });
            return { state: next, note: mine ? `把${productLabel(item.chain)}從${label(piece.item)}上拿回來` : `拿了${who}留的${productLabel(item.chain)}${fresh ? `，${freshness}的` : `，已經${freshness}`}`, ...(!mine ? { tier: "live" } : {}) };
        }
        case "hug":
        case "kiss": {
            if (context.actor === "game")
                throw new Error("小屋自己不抱人。");
            const target = context.actor === "atone" ? "tsunu" : "atone";
            if (!state.tsunu.home)
                throw new Error("阿宇不在家。");
            if (state.door?.open)
                throw new Error("有客人在，先不要抱抱、親親。");
            const behind = action.kind === "hug" && action.from === "behind";
            const verb = action.kind === "kiss" ? "親了一下" : behind ? "從後面抱住" : "抱了一下";
            const note = `${verb}${ACTOR_NAME[target]}`;
            if (sameSeat(state, furniture)) { // 並肩坐在同一張沙發或床上：就地抱，不挪位子；一起睡時抱住就抱著睡，不會醒
                if (state.sleeping && !state.sleeping.alone && action.kind === "hug")
                    return { state: { ...state, sleeping: { ...state.sleeping, cuddledBy: context.actor } }, note: `${note}，抱著一起睡` };
                return { state, note };
            }
            const spot = state.positions[target];
            const cell = cuddleSpot(findRoom(state, spot.room), spot, behind, furniture, visitorCells(state, spot.room));
            if (!cell)
                throw new Error(`${ACTOR_NAME[target]}旁邊沒有位子可以靠過去。`);
            return { state: { ...state, positions: { ...state.positions, [context.actor]: { room: spot.room, ...cell } } }, note };
        }
        case "call": {
            if (context.actor === "game")
                throw new Error("小屋自己不叫人。");
            const target = context.actor === "atone" ? "tsunu" : "atone";
            if (target === "tsunu" && !state.tsunu.home)
                throw new Error("阿宇不在家，叫不到。");
            const spot = state.positions[context.actor];
            const cell = cuddleSpot(findRoom(state, spot.room), spot, false, furniture, visitorCells(state, spot.room));
            if (!cell)
                throw new Error("旁邊沒有位子讓對方站。");
            return { state: { ...state, positions: { ...state.positions, [target]: { room: spot.room, ...cell } } }, note: `叫${ACTOR_NAME[target]}過來` };
        }
        case "answer_invite": {
            if (context.actor === "game")
                throw new Error("小屋自己不回應邀請。");
            return answerInvite(state, action.id, context.actor, action.accept, furniture, context.now());
        }
        case "expire_invites": {
            if (context.actor !== "game")
                throw new Error("邀請只有小屋自己會讓它過期。");
            const now = context.now();
            const expiring = (state.invitations ?? []).filter((invitation) => invitation.status === "pending" && inviteStale(invitation, now));
            const invitations = (state.invitations ?? [])
                .map((invitation) => (expiring.includes(invitation) ? { ...invitation, status: "expired", answeredAt: now.toISOString() } : invitation))
                .filter((invitation) => !inviteStale(invitation, now));
            const note = expiring.map((invitation) => `${personName(state, invitation.to)}現在不方便（${personName(state, invitation.from)}的邀請過期了）`).join("；");
            return { state: { ...state, invitations }, note: note || null };
        }
        case "sleep": { // 自己躺在床上就睡；對方也在同一張床上就一起睡（對方先睡著了也算，躺過去一起睡）
            if (context.actor === "game")
                throw new Error("小屋自己不睡覺。");
            const actor = context.actor;
            const spot = state.positions[actor];
            const bed = seatAt(findRoom(state, spot.room), spot, furniture);
            if (!bed || furniture[bed.item]?.seatPose !== "lounge")
                throw new Error("要先躺到床上才能睡。");
            const together = state.tsunu.home && sameSeat(state, furniture)?.id === bed.id;
            if (state.sleeping && (!state.sleeping.alone || state.sleeping.alone === actor))
                throw new Error("已經在睡了。");
            if (state.sleeping && !together)
                throw new Error(`${ACTOR_NAME[state.sleeping.alone]}在別張床上睡。`);
            if (together && state.door?.open)
                throw new Error("有客人在，先不要一起睡。");
            if (together)
                return { state: { ...state, sleeping: { since: state.sleeping?.since ?? context.now().toISOString() } }, note: state.sleeping ? `躺到${ACTOR_NAME[state.sleeping.alone]}旁邊一起睡了` : "兩個人一起睡了" };
            return { state: { ...state, sleeping: { since: context.now().toISOString(), alone: actor } }, note: `躺在${label(bed.item)}上睡覺了` };
        }
        case "wake": {
            if (!state.sleeping)
                throw new Error("沒有人在睡。");
            const length = sleepLength(state.sleeping.since, context.now());
            return { state: { ...state, sleeping: null }, note: context.actor === "game" || state.sleeping.alone ? `睡了 ${length}，醒了` : `一起睡了 ${length}` };
        }
        case "throw_ball": {
            if (context.actor === "game")
                throw new Error("小屋自己不丟球。");
            return { state, note: throwBall(state, furniture, standingSpot(state, context).room, context.seed()) };
        }
        case "event": {
            if (context.actor !== "game")
                throw new Error("事件只有小屋自己會發。");
            if (state.milestones[action.key])
                throw new Error("這件事已經記過了。");
            return { state: { ...state, milestones: { ...state.milestones, [action.key]: context.now().toISOString() } }, note: action.text };
        }
        case "walk": {
            if (context.actor === "game")
                throw new Error("小屋自己不會走路。");
            const from = state.positions[context.actor].room;
            const roomId = action.room ?? from;
            const room = findRoom(state, roomId);
            const tapped = { x: action.x, y: action.y };
            assertWalkable(room, tapped, furniture);
            const seat = seatAt(room, tapped, furniture);
            const other = state.positions[context.actor === "atone" ? "tsunu" : "atone"];
            const wanted = seat && furniture[seat.item]?.seatPose === "lounge" ? pillowSpot(seat, tapped, other.room === roomId ? other : null, furniture) : tapped;
            const blockedDoor = roomId !== from && !seat && visitorAt(state, { room: roomId, ...wanted }); // 換房間時門口站著客人：站到門口旁邊最近的空位
            const cell = blockedDoor ? freeCellsNear(state, roomId, tapped, furniture, peopleSpots(state))[0] ?? wanted : wanted;
            const woke = state.sleeping && (!state.sleeping.alone || state.sleeping.alone === context.actor) ? reduce(state, { kind: "wake" }, context) : null; // 起床：一起睡時誰走動都算，一個人睡時只有睡的人自己起來才算
            const base = woke ? woke.state : state;
            const moved = roomId !== from ? `走到${room.name}` : null;
            const pose = seat ? furniture[seat.item]?.seatPose : undefined;
            const together = pose === "bathe" && other.room === roomId && seatAt(room, other, furniture)?.id === seat.id;
            if (together && state.door?.open)
                throw new Error("有客人在，先不要一起泡澡。");
            if (visitorAt(state, { room: roomId, ...cell }))
                throw new Error("那裡有客人站著。");
            if (pose && visitorOnSeat(state, room, roomId, seat, furniture))
                throw new Error(pose === "lounge" ? "床上有客人了。" : `${label(seat.item)}裡有客人，等一下。`); // 床、浴缸、淋浴間不跟客人共用（訪客只在門開著時在屋裡）
            const sat = !seat ? null
                : pose === "shower" ? `走進${label(seat.item)}洗澡`
                    : pose === "bathe" ? (together ? `泡進${label(seat.item)}，一起泡澡` : `泡進${label(seat.item)}`)
                        : `坐到${label(seat.item)}上`;
            const note = [woke?.note, moved, sat].filter(Boolean).join("，") || null;
            return { state: { ...base, positions: { ...base.positions, [context.actor]: { room: roomId, ...cell } } }, note };
        }
        case "build_room": {
            if (context.actor === "game")
                throw new Error("小屋自己不擴建。");
            const spec = context.content.rooms[action.room];
            if (!spec)
                throw new Error(`沒有「${action.room}」這種房間。`);
            if (state.rooms[action.room])
                throw new Error(`已經有${spec.label}了。`);
            if (state.money < spec.price)
                throw new Error(`錢不夠：蓋${spec.label}要 ${spec.price}，現在有 ${state.money}。`);
            if (spec.connectsTo && !state.rooms[spec.connectsTo]) {
                const neighbor = context.content.rooms[spec.connectsTo]?.label ?? spec.connectsTo;
                throw new Error(`${spec.label}要接在${neighbor}旁邊，先蓋好${neighbor}才能蓋。`);
            }
            const parentId = spec.connectsTo ?? (state.rooms[CONNECTOR_ROOM] ? CONNECTOR_ROOM : FIRST_ROOM);
            const parent = findRoom(state, parentId);
            const at = freeDoorSpot(parent, furniture);
            if (!at)
                throw new Error(`${parent.name}的牆邊都被家具擋住了，挪出一格才能開門。`);
            const room = { kind: action.room, name: spec.label, width: spec.width, depth: spec.depth, placed: [], doors: [{ wall: "left", at: Math.floor(spec.depth / 2), to: parentId }], ...(spec.floor ? { floor: spec.floor } : {}) };
            const rooms = { ...state.rooms, [parentId]: { ...parent, doors: [...parent.doors, { ...at, to: action.room }] }, [action.room]: room };
            return { state: { ...state, money: state.money - spec.price, rooms }, note: `花 ${spec.price} 蓋了${spec.label}，門開在${parent.name}` };
        }
        case "decorate_room": {
            if (context.actor === "game")
                throw new Error("小屋自己不裝潢。");
            const roomId = action.room ?? standingSpot(state, context).room;
            const room = findRoom(state, roomId);
            const { floors, walls } = context.content.surfaces;
            const floor = action.floor === undefined ? undefined : floors[action.floor];
            const wall = action.wall === undefined ? undefined : walls[action.wall];
            if (!floor && !wall)
                throw new Error(`要換哪種地板或壁紙？地板有 ${Object.keys(floors).join("、")}；壁紙有 ${Object.keys(walls).join("、")}。`);
            if (floor && action.floor === (room.floor ?? DEFAULT_FLOOR))
                throw new Error(`${room.name}已經是${floor.label}了。`);
            if (wall && action.wall === (room.wall ?? DEFAULT_WALL))
                throw new Error(`${room.name}已經是${wall.label}了。`);
            const cost = (floor?.price ?? 0) + (wall?.price ?? 0);
            if (state.money < cost)
                throw new Error(`錢不夠：要 ${cost}，現在有 ${state.money}。`);
            const decorated = { ...room, ...(floor ? { floor: action.floor } : {}), ...(wall ? { wall: action.wall } : {}) };
            const what = [floor && `地板換成${floor.label}`, wall && `壁紙換成${wall.label}`].filter(Boolean).join("、");
            return { state: { ...state, money: state.money - cost, rooms: { ...state.rooms, [roomId]: decorated } }, note: `把${room.name}的${what}${cost ? `（花了 ${cost}）` : ""}` };
        }
        case "buy_decor":
        case "set_decor": {
            if (context.actor === "game")
                throw new Error("小屋自己不裝潢。");
            const shop = openedShop(state, action.shop);
            const { spots, themes } = context.content.decor;
            const spot = spots[action.spot];
            if (!spot)
                throw new Error(`店裡沒有「${action.spot}」這個裝飾點，有 ${Object.keys(spots).join("、")}。`);
            const where = `${SHOP_LABEL[action.shop]}的${decorSpotLabel(context.content.decor, action.shop, action.spot)}`;
            const decor = shop.decor ?? { owned: {}, chosen: {} };
            const owned = decor.owned[action.spot] ?? [];
            const { [action.spot]: _previous, ...others } = decor.chosen;
            if (action.theme === null) {
                if (action.kind === "buy_decor")
                    throw new Error("要買哪一款風格？");
                if (!decor.chosen[action.spot])
                    throw new Error(`${where}已經是原裝了。`);
                return { state: withShop(state, action.shop, { ...shop, decor: { ...decor, chosen: others } }), note: `${where}換回原裝` };
            }
            const theme = themes[action.theme];
            if (!theme)
                throw new Error(`沒有「${action.theme}」這種風格，有 ${Object.entries(themes).map(([id, label]) => `${label}（${id}）`).join("、")}。`);
            if (action.kind === "set_decor") {
                if (!owned.includes(action.theme))
                    throw new Error(`${where}還沒買${theme}那款。`);
                if (decor.chosen[action.spot] === action.theme)
                    throw new Error(`${where}已經是${theme}了。`);
                return { state: withShop(state, action.shop, { ...shop, decor: { ...decor, chosen: { ...others, [action.spot]: action.theme } } }), note: `${where}換成${theme}` };
            }
            if (owned.includes(action.theme))
                throw new Error(`${where}已經買過${theme}了，直接換上就好。`);
            if (state.money < spot.price)
                throw new Error(`錢不夠：要 ${spot.price}，現在有 ${state.money}。`);
            const bought = { owned: { ...decor.owned, [action.spot]: [...owned, action.theme] }, chosen: { ...others, [action.spot]: action.theme } };
            return { state: { ...withShop(state, action.shop, { ...shop, decor: bought }), money: state.money - spot.price }, note: `幫${where}買了${theme}的款式（花了 ${spot.price}）` };
        }
        case "presence": {
            const positions = action.home ? { ...state.positions, tsunu: HOME_SPOTS.tsunu } : state.positions;
            return { state: { ...state, tsunu: { home: action.home, note: action.note ?? state.tsunu.note }, positions }, note: action.home ? "阿宇回家了" : "阿宇出門了" };
        }
        default: { // HTTP 送來的 kind 打錯時走到這裡；新增動作卻漏寫 case 則在編譯時報錯
            const unknown = action;
            throw new Error(`沒有「${unknown.kind}」這種動作。`);
        }
    }
}
/** 顏色一律存成 #rrggbb 小寫。 */
function hexColor(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color))
        throw new Error("顏色要是 #rrggbb。");
    return color.toLowerCase();
}
/** 做出一份商品：記第一次的里程碑；如果有「別人請我做」的單，算進那張單，做滿就結單。 */
function made(state, chain, context) {
    const recipe = context.content.recipes[chain];
    const product = recipe.tiers.at(-1);
    const firstKey = `first_product:${chain}`;
    const first = !state.milestones[firstKey];
    const milestones = first ? { ...state.milestones, [firstKey]: context.now().toISOString() } : state.milestones;
    const next = { ...state, products: adjust(state.products, chain, 1), milestones };
    const order = context.actor === "game" ? undefined : state.orders.find((o) => o.chain === chain && o.by !== context.actor);
    if (!order)
        return { state: next, note: first ? `第一次做出${product}！` : `做出一份${product}`, chain, ...(first ? { tier: "live" } : {}) };
    const done = order.done + 1;
    const orders = done >= order.count ? state.orders.filter((o) => o.id !== order.id) : state.orders.map((o) => (o.id === order.id ? { ...o, done } : o));
    const progress = done >= order.count ? `${ACTOR_NAME[order.by]}要的 ${order.count} 份${product}做完了！` : `做出一份${product}（${ACTOR_NAME[order.by]}要的 ${done}/${order.count}）`;
    return { state: { ...next, orders }, note: first ? `第一次做出${product}！${progress}` : progress, chain, tier: "live" }; // 做的是對方派的單：對方要知道進度
}
/** 房間裡站得了的空格（沒有實心家具、也不是可坐的家具）。 */
/** 訪客進門的位置：客廳（還沒蓋就第一間房）裡站得進去、不是座位、沒人站的格子，照離第一扇門近到遠排，取 count 格。
 *  taken 是已經有人站的位置（開門時屋主自己要被挪過去，傳空的）。 */
export function entranceSpots(state, catalog, count, taken) {
    const roomId = state.rooms.living ? "living" : FIRST_ROOM;
    const door = findRoom(state, roomId).doors[0];
    return freeCellsNear(state, roomId, door ? doorCell(door) : { x: 0, y: 0 }, catalog, taken).slice(0, count);
}
/** 這間房裡站得進去、不是座位、沒人站（taken）的格子，照離 origin 近到遠排。 */
export function freeCellsNear(state, roomId, origin, catalog, taken) {
    const busy = new Set(taken.filter((spot) => spot.room === roomId).map(cellKey));
    const distance = (cell) => Math.abs(cell.x - origin.x) + Math.abs(cell.y - origin.y);
    return openCells(findRoom(state, roomId), catalog).filter((cell) => !busy.has(cellKey(cell)))
        .sort((a, b) => distance(a) - distance(b)).map((cell) => ({ room: roomId, ...cell }));
}
/** 屋裡有人站的位置：阿童、在家的阿宇、訪客（except 那位訪客不算）。 */
export function peopleSpots(state, except) {
    return [state.positions.atone, ...(state.tsunu.home ? [state.positions.tsunu] : []),
        ...Object.entries(state.visitors ?? {}).filter(([id]) => id !== except).map(([, visitor]) => visitor.spot)];
}
/** 這間房裡訪客站的格子（"x,y"）：給人找位子時跳過。 */
function visitorCells(state, roomId) {
    return new Set(Object.values(state.visitors ?? {}).filter((visitor) => visitor.spot.room === roomId).map((visitor) => cellKey(visitor.spot)));
}
/** 有訪客在這件可坐的家具上（床、浴缸、淋浴間、沙發）。 */
function visitorOnSeat(state, room, roomId, seat, catalog) {
    return Object.values(state.visitors ?? {}).some((visitor) => visitor.spot.room === roomId && seatAt(room, visitor.spot, catalog)?.id === seat.id);
}
/** 這一格站著哪位訪客（id），沒有就 null。 */
export function visitorAt(state, spot) {
    return Object.entries(state.visitors ?? {}).find(([, visitor]) => visitor.spot.room === spot.room && visitor.spot.x === spot.x && visitor.spot.y === spot.y)?.[0] ?? null;
}
export function openCells(room, catalog) {
    const cells = [];
    for (let x = 0; x < room.width; x++)
        for (let y = 0; y < room.depth; y++) {
            const cell = { x, y };
            try {
                assertWalkable(room, cell, catalog);
                if (!seatAt(room, cell, catalog))
                    cells.push(cell);
            }
            catch { /* 站不了 */ }
        }
    return cells;
}
/** 床上的位置：都坐在靠枕頭的那一排（床頭在 x 或 y 的起點，轉向的床換一邊），兩個人才會並肩、不會一前一後；
 *  點到的那一條被對方佔了，就挪到最近的空位。 */
export function pillowSpot(bed, tapped, occupied, catalog) {
    const { w, d } = footprint(bed, catalog);
    const lanes = bed.flip ? w : d; // 沒轉向：床頭沿 y 排開 d 格；轉向：沿 x 排開 w 格
    const spot = (lane) => (bed.flip ? { x: bed.x + lane, y: bed.y } : { x: bed.x, y: bed.y + lane });
    const wanted = bed.flip ? tapped.x - bed.x : tapped.y - bed.y;
    const order = Array.from({ length: lanes }, (_, lane) => lane).sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted));
    const free = order.find((lane) => { const cell = spot(lane); return !occupied || occupied.x !== cell.x || occupied.y !== cell.y; });
    return spot(free ?? wanted);
}
/** 後來蓋的房間優先接在客廳；還沒有客廳就接在臥室。 */
const CONNECTOR_ROOM = "living";
/** 門格：門開在哪面牆的第幾格，對應到房間裡的哪一格。 */
export function doorCell(door) {
    return door.wall === "back" ? { x: door.at, y: 0 } : { x: 0, y: door.at };
}
/** 牆邊找一格開新門：先找後牆（從右往左）、再找左牆（從前往後）；要站得進去、不是座位、還沒有門。 */
function freeDoorSpot(room, catalog) {
    const candidates = [];
    for (let x = room.width - 1; x >= 1; x--)
        candidates.push({ wall: "back", at: x });
    for (let y = room.depth - 1; y >= 1; y--)
        candidates.push({ wall: "left", at: y });
    const doors = new Set(room.doors.map((d) => cellKey(doorCell(d))));
    const hung = new Set(room.placed.flatMap((p) => wallSlots(p, catalog))); // 窗戶那段牆不開門
    return candidates.find((spot) => {
        const cell = doorCell(spot);
        if (doors.has(cellKey(cell)) || hung.has(`${spot.wall}:${spot.at}`) || seatAt(room, cell, catalog))
            return false;
        try {
            assertWalkable(room, cell, catalog);
            return true;
        }
        catch {
            return false;
        }
    }) ?? null;
}
function cellKey(cell) {
    return `${cell.x},${cell.y}`;
}
/** 兩個人坐在同一件家具上（同一張沙發、同一張床）就回傳那件家具，否則 null。 */
function sameSeat(state, catalog) {
    const [atone, tsunu] = ["atone", "tsunu"].map((who) => seatAt(findRoom(state, state.positions[who].room), state.positions[who], catalog));
    return atone && tsunu && atone.id === tsunu.id ? atone : null;
}
/** 靠過去抱人要站的格子：從前面＝對方畫面前方（x+1 或 y+1），從後面＝畫面後方（x-1 或 y-1）；要在房間內、沒有實心家具、沒有人站（taken）。 */
export function cuddleSpot(room, target, behind, catalog, taken = new Set()) {
    const order = behind ? [[-1, 0], [0, -1], [1, 0], [0, 1]] : [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (const [dx, dy] of order) {
        const cell = { x: target.x + dx, y: target.y + dy };
        if (taken.has(cellKey(cell)))
            continue;
        try {
            assertWalkable(room, cell, catalog);
            return cell;
        }
        catch { /* 這格站不了，試下一格 */ }
    }
    return null;
}
/** 盆栽渴了沒：上次澆水超過 THIRSTY_DAYS 天。沒澆過的當剛買回來，不渴。 */
export function isThirsty(piece, now) {
    if (!piece.wateredAt)
        return false;
    return now.getTime() - new Date(piece.wateredAt).getTime() > THIRSTY_DAYS * 86_400_000;
}
/** 狗餓了沒：上次正餐超過 HUNGRY_HOURS 小時。沒吃過的當剛吃飽，不餓。 */
export function isHungry(state, dog, now) {
    const lastMeal = state.fed?.[dog];
    if (!lastMeal)
        return false;
    return now.getTime() - new Date(lastMeal).getTime() > HUNGRY_HOURS * 3_600_000;
}
// 人和家裡東西的互動：阿童、阿宇、訪客共用同一套規則。回傳的 note 不含主詞，日誌的主詞由呼叫端加。
const furnitureLabel = (catalog, item) => catalog[item]?.label ?? item;
/** 站在洗手台前洗手或刷牙：回傳那座洗手台與動詞。 */
export function washAt(room, spot, what, catalog) {
    const basin = pieceNextTo(room, spot, catalog, (spec) => !!spec.washbasin);
    if (!basin)
        throw new Error("要先走到洗手台前。");
    return { basin, verb: what === "teeth" ? "刷牙" : "洗手" };
}
export function petDog(pets, dogId, touch) {
    const dog = pets[dogId];
    if (!dog)
        throw new Error(`家裡沒有「${dogId}」這隻狗。`);
    if (!touch)
        return `摸摸${dog.label}，${dog.label}開心地搖尾巴`;
    const found = dog.touches?.[touch];
    if (!found)
        throw new Error(`${dog.label}沒有「${touch}」這個互動。`);
    return found.note;
}
/** 餵狗：零食要家裡有零食櫃；正餐吃完 FULL_HOURS 小時內還飽，誰餵都算吃過。 */
export function feedDog(state, content, dogId, food, now) {
    const dog = content.pets[dogId];
    if (!dog)
        throw new Error(`家裡沒有「${dogId}」這隻狗。`);
    if (food === "snack") {
        const hasCabinet = Object.values(state.rooms).some((room) => room.placed.some((piece) => content.furniture[piece.item]?.snacks));
        if (!hasCabinet)
            throw new Error("家裡還沒有零食櫃。");
        return { state, note: `給${dog.label}一塊零食，${dog.label}坐得好端正` };
    }
    const lastMeal = state.fed?.[dogId];
    if (lastMeal && now.getTime() - new Date(lastMeal).getTime() < FULL_HOURS * 3_600_000)
        throw new Error(`${dog.label}剛吃過，還不餓。`);
    const hungry = isHungry(state, dogId, now);
    return { state: { ...state, fed: { ...state.fed, [dogId]: now.toISOString() } }, note: hungry ? `餵${dog.label}吃飯，${dog.label}餓壞了，吃得好快` : `餵${dog.label}吃飯` };
}
export function toggleSwitch(state, catalog, id) {
    const { piece } = findPlaced(state, id);
    if (!catalog[piece.item]?.switch)
        throw new Error(`${furnitureLabel(catalog, piece.item)}沒有開關。`);
    const on = !piece.on;
    return { state: replacePlaced(state, { ...piece, on }), note: `把${furnitureLabel(catalog, piece.item)}${on ? "打開" : "關掉"}` };
}
/** 翻書抽一句：從 lines 裡抽（屋主抽籤詩＋書櫃的句子，訪客只抽籤詩）。 */
export function readLine(state, catalog, id, lines, seed) {
    const { piece } = findPlaced(state, id);
    if (!catalog[piece.item]?.readable)
        throw new Error(`${furnitureLabel(catalog, piece.item)}上沒有書。`);
    if (!lines.length)
        throw new Error("書櫃是空的。");
    return `翻到一句：${lines[seed % lines.length]}`;
}
export function waterPlant(state, catalog, id, now) {
    const { piece } = findPlaced(state, id);
    if (!catalog[piece.item]?.plant)
        throw new Error(`${furnitureLabel(catalog, piece.item)}不用澆水。`);
    const thirsty = isThirsty(piece, now);
    const name = furnitureLabel(catalog, piece.item);
    return { state: replacePlaced(state, { ...piece, wateredAt: now.toISOString() }), note: thirsty ? `幫${name}澆水，它精神回來了` : `幫${name}澆水` };
}
/** 在這間房丟球給小黑：球滾到隨機一格空地。 */
export function throwBall(state, catalog, roomId, seed) {
    const spots = openCells(findRoom(state, roomId), catalog);
    if (!spots.length)
        throw new Error("沒有地方可以丟。");
    const cell = spots[seed % spots.length];
    return `丟球給小黑，球滾到 (${cell.x}, ${cell.y})`;
}
/** 睡了多久：不到一小時寫分鐘（至少 1 分鐘），之後寫到小數一位的小時。 */
export function sleepLength(since, now) {
    const hours = (now.getTime() - new Date(since).getTime()) / 3_600_000;
    return hours < 1 ? `${Math.max(1, Math.round(hours * 60))} 分鐘` : `${hours.toFixed(1)} 小時`;
}
/** 桌上第 index 樣東西，與拿走它之後剩下的。 */
export function tableItemAt(state, id, index) {
    const { piece } = findPlaced(state, id);
    const items = piece.items ?? [];
    const item = items[index];
    if (!item)
        throw new Error("桌上沒有這樣東西。");
    return { piece, item, rest: items.filter((_, i) => i !== index) };
}
/** 把桌面換成 items。 */
export function setTableItems(state, piece, items) {
    return replacePlaced(state, { ...piece, items: [...items] });
}
/** 把一樣東西放到桌上：要是能放東西的家具、還有空位。 */
export function putOnTable(state, catalog, id, item) {
    const { piece } = findPlaced(state, id);
    if (!catalog[piece.item]?.table)
        throw new Error(`${furnitureLabel(catalog, piece.item)}上放不了東西。`);
    const items = piece.items ?? [];
    if (items.length >= TABLE_SLOTS)
        throw new Error(`${furnitureLabel(catalog, piece.item)}上滿了，最多放 ${TABLE_SLOTS} 樣。`);
    return setTableItems(state, piece, [...items, item]);
}
/** 訪客手上的東西收回去（離開、關門時）：桌上拿的放回原本的桌子（桌子收掉了或滿了就算吃掉了），屋主遞的回到家裡的庫存。 */
export function returnHolding(state, visitor, catalog) {
    if (!visitor.holding)
        return state;
    const { item, from } = visitor.holding;
    if (!from)
        return item.kind === "dish" ? { ...state, dishes: adjust(state.dishes, item.dish, 1) } : { ...state, products: adjust(state.products, item.chain, 1) };
    try {
        return putOnTable(state, catalog, from, item);
    }
    catch {
        return state;
    }
}
/** 桌上食物的叫法：「阿童煮的蛋餅」「一份布丁」。 */
export function foodName(item, content) {
    if (item.kind === "dish")
        return `${ACTOR_NAME[item.by]}煮的${item.text ?? content.dishes[item.dish]?.label ?? item.dish}`;
    return `一份${content.recipes[item.chain]?.tiers.at(-1) ?? item.chain}`;
}
/** 阿童吃了這樣東西回幾點體力：家常菜照菜單，商品 1 點。 */
export function foodStamina(item, content) {
    return item.kind === "dish" ? content.dishes[item.dish]?.stamina ?? 1 : 1;
}
/** 阿童吃了東西：體力回 amount 點（不超過上限）。 */
export function eatenStamina(state, amount, settings, now) {
    const { max } = settings.stamina;
    const value = Math.min(max, currentStamina(state, settings, now) + amount);
    return { value, updatedAt: value >= max ? now.toISOString() : state.stamina.updatedAt };
}
/** 屋裡的人怎麼稱呼：阿童、阿宇或客人的名字。 */
export function personName(state, id) {
    return id === "atone" || id === "tsunu" ? ACTOR_NAME[id] : state.visitors?.[id]?.name ?? "客人";
}
/** 回應給 who 的邀請：答應就走到邀請的人旁邊最近的空位（換房間也一樣，睡著的先醒），婉拒就記下來讓邀請的人知道。
 *  note 不含回應者的主詞。 */
export function answerInvite(state, id, who, accept, catalog, now) {
    const invitation = state.invitations?.find((candidate) => candidate.id === id && candidate.status === "pending");
    if (!invitation)
        throw new Error("這則邀請已經不在了。");
    if (invitation.to !== who)
        throw new Error("這則邀請不是給你的。");
    const inviter = state.visitors?.[invitation.from];
    if (!inviter)
        throw new Error("邀請你的客人已經回家了。");
    const answered = { ...state, invitations: state.invitations.map((candidate) => (candidate.id === id ? { ...candidate, status: accept ? "accepted" : "declined", answeredAt: now.toISOString() } : candidate)) };
    if (!accept)
        return { state: answered, note: `現在不方便（${inviter.name}的邀請）` };
    const [spot] = freeCellsNear(state, inviter.spot.room, inviter.spot, catalog, peopleSpots(state, who));
    if (!spot)
        throw new Error(`${inviter.name}旁邊沒有位子了。`);
    const host = who === "atone" || who === "tsunu" ? who : null;
    const fromRoom = host ? state.positions[host].room : state.visitors?.[who]?.spot.room;
    const where = fromRoom === spot.room ? `${inviter.name}旁邊` : findRoom(state, spot.room).name;
    const note = `答應${inviter.name}的邀請，走到${where}`;
    if (host)
        return { state: { ...answered, positions: { ...answered.positions, [host]: spot }, sleeping: answered.sleeping?.alone === host ? null : answered.sleeping }, note };
    const { asleep: _asleep, ...guest } = state.visitors[who];
    return { state: { ...answered, visitors: { ...answered.visitors, [who]: { ...guest, spot } } }, note };
}
/** 有沒有邀請該過期（沒回應超過 INVITE_MS）或該清掉（回應過超過 INVITE_RESULT_MS）：小屋時鐘用它決定要不要套用 expire_invites。 */
export function inviteHousekeepingDue(state, now) {
    return (state.invitations ?? []).some((invitation) => inviteStale(invitation, now));
}
const inviteStale = (invitation, now) => invitation.status === "pending"
    ? now.getTime() - Date.parse(invitation.at) >= INVITE_MS
    : now.getTime() - Date.parse(invitation.answeredAt ?? invitation.at) >= INVITE_RESULT_MS;
/** 這件家具在哪間房。 */
export function placedRoom(state, id) {
    return findPlaced(state, id).roomId;
}
/** 阿童上次有動靜的時間（她的日誌最後一筆），沒有就 null。 */
export function lastAtoneActivity(state) {
    const entry = [...state.journal].reverse().find((e) => e.actor === "atone");
    return entry ? new Date(entry.at) : null;
}
/** 太久沒人來的事件鍵：以「安靜開始的那一天」為鍵，同一段安靜期只記一次。 */
export function quietEventKey(state, now) {
    const last = lastAtoneActivity(state);
    if (!last)
        return null;
    const days = (now.getTime() - last.getTime()) / 86_400_000;
    return days >= QUIET_DAYS ? `quiet:${last.toISOString().slice(0, 10)}` : null;
}
/** 三消的圖案池：每種材料一份，店裡客人點的商品再加份數（同一種最多加 ORDER_WEIGHT 份），盤面就會偏向訂單要的材料。 */
export function orderedPool(chains, orders) {
    const extra = {};
    for (const chain of orders)
        if (chains.includes(chain))
            extra[chain] = Math.min(ORDER_WEIGHT, (extra[chain] ?? 0) + 1);
    return chains.flatMap((chain) => Array(1 + (extra[chain] ?? 0)).fill(chain));
}
/** 現在有多少體力：從上次結算起每 regenMinutes 回 1 點，回到上限為止；關掉體力就永遠是上限。 */
export function currentStamina(state, settings, now) {
    const { enabled, max, regenMinutes } = settings.stamina;
    if (!enabled)
        return max;
    const elapsedMinutes = Math.max(0, now.getTime() - new Date(state.stamina.updatedAt).getTime()) / 60_000;
    return Math.min(max, state.stamina.value + Math.floor(elapsedMinutes / regenMinutes));
}
/** 下一點體力什麼時候回來（已滿或關掉就是 null）。 */
export function nextStaminaAt(state, settings, now) {
    const { enabled, max, regenMinutes } = settings.stamina;
    if (!enabled || currentStamina(state, settings, now) >= max)
        return null;
    const regenMs = regenMinutes * 60_000;
    const since = new Date(state.stamina.updatedAt).getTime();
    const elapsed = Math.max(0, now.getTime() - since);
    return new Date(since + (Math.floor(elapsed / regenMs) + 1) * regenMs);
}
function spendStamina(state, context) {
    const { settings } = context.content;
    if (!settings.stamina.enabled)
        return state.stamina;
    const now = context.now();
    const value = currentStamina(state, settings, now);
    if (value < 1)
        throw new Error(`體力不夠，${describeWait(nextStaminaAt(state, settings, now), now)}再來。`);
    // 結算時間：滿的時候從現在起算，沒滿就保留已經累積的零頭
    const regenMs = settings.stamina.regenMinutes * 60_000;
    const since = new Date(state.stamina.updatedAt).getTime();
    const updatedAt = value >= settings.stamina.max ? now : new Date(since + Math.floor((now.getTime() - since) / regenMs) * regenMs);
    return { value: value - 1, updatedAt: updatedAt.toISOString() };
}
function describeWait(at, now) {
    if (!at)
        return "等一下";
    const minutes = Math.max(1, Math.ceil((at.getTime() - now.getTime()) / 60_000));
    return `${minutes} 分鐘後`;
}
/** 家具翻轉後佔地寬深對調：翻轉是換到另一面牆。 */
export function footprint(piece, catalog) {
    const spec = catalog[piece.item];
    if (!spec)
        throw new Error(`沒有「${piece.item}」這種家具。`);
    return piece.flip ? { w: spec.d, d: spec.w } : { w: spec.w, d: spec.d };
}
/** 牆上家具占的牆格（"back:3" 是後牆第 3 格、"left:2" 是左牆第 2 格）；門也用同樣的鍵。 */
export function wallSlots(piece, catalog) {
    const spec = catalog[piece.item];
    if (!spec?.onWall)
        return [];
    const [wall, from] = piece.flip ? ["left", piece.y] : ["back", piece.x];
    return Array.from({ length: spec.w }, (_, i) => `${wall}:${from + i}`);
}
export function occupiedCells(piece, catalog) {
    if (catalog[piece.item]?.onWall)
        return []; // 掛在牆上的不占地板
    const { w, d } = footprint(piece, catalog);
    const cells = [];
    for (let dx = 0; dx < w; dx++)
        for (let dy = 0; dy < d; dy++)
            cells.push(`${piece.x + dx},${piece.y + dy}`);
    return cells;
}
/** 地板層（地毯）只跟地板層互相擋；其他家具可以疊在地毯上，但不能擋門。 */
function assertFits(room, piece, catalog, ignoreId) {
    if (!Number.isInteger(piece.x) || !Number.isInteger(piece.y))
        throw new Error("座標必須是整數格。");
    if (catalog[piece.item]?.onWall) {
        assertFitsOnWall(room, piece, catalog, ignoreId);
        return;
    }
    const { w, d } = footprint(piece, catalog);
    if (piece.x < 0 || piece.y < 0 || piece.x + w > room.width || piece.y + d > room.depth)
        throw new Error("這個位置超出房間。");
    const onFloorLayer = !!catalog[piece.item]?.floor;
    const blockers = room.placed.filter((p) => p.id !== ignoreId && !!catalog[p.item]?.floor === onFloorLayer);
    const taken = new Set(blockers.flatMap((p) => occupiedCells(p, catalog)));
    if (occupiedCells(piece, catalog).some((cell) => taken.has(cell)))
        throw new Error("這個位置已經有東西了。");
    const doors = new Set(room.doors.map((door) => cellKey(doorCell(door))));
    if (!onFloorLayer && occupiedCells(piece, catalog).some((cell) => doors.has(cell)))
        throw new Error("這裡是門口，不能擋住。");
}
/** 牆上家具：要貼著後牆（y＝0）或左牆（x＝0）、不超出牆、不蓋到門或別的牆上家具。 */
function assertFitsOnWall(room, piece, catalog, ignoreId) {
    const along = piece.flip ? piece.y : piece.x;
    if ((piece.flip ? piece.x : piece.y) !== 0)
        throw new Error(piece.flip ? "掛左牆的話 x 要是 0。" : "掛後牆的話 y 要是 0。");
    if (along < 0 || along + catalog[piece.item].w > (piece.flip ? room.depth : room.width))
        throw new Error("這個位置超出牆面。");
    const doors = new Set(room.doors.map((door) => `${door.wall}:${door.at}`));
    const others = new Set(room.placed.filter((p) => p.id !== ignoreId).flatMap((p) => wallSlots(p, catalog)));
    const slots = wallSlots(piece, catalog);
    if (slots.some((slot) => doors.has(slot)))
        throw new Error("那段牆有門，掛不上去。");
    if (slots.some((slot) => others.has(slot)))
        throw new Error("那段牆已經掛了東西。");
}
/** 站在哪件可坐的家具上（沒有就 null）。 */
export function seatAt(room, cell, catalog) {
    return room.placed.find((p) => catalog[p.item]?.seat && occupiedCells(p, catalog).includes(`${cell.x},${cell.y}`)) ?? null;
}
const besideCells = (cell) => [{ x: cell.x + 1, y: cell.y }, { x: cell.x - 1, y: cell.y }, { x: cell.x, y: cell.y + 1 }, { x: cell.x, y: cell.y - 1 }];
/** 緊鄰這一格（前後左右）、符合條件的家具（洗手台、爐台）；沒有就 null。 */
function pieceNextTo(room, cell, catalog, wanted) {
    const near = new Set(besideCells(cell).map((c) => `${c.x},${c.y}`));
    return room.placed.find((p) => catalog[p.item] && wanted(catalog[p.item]) && occupiedCells(p, catalog).some((key) => near.has(key))) ?? null;
}
/** 阿童吃了東西：體力回 amount 點（不超過上限）。 */
function fedStamina(state, amount, context) {
    return eatenStamina(state, amount, context.content.settings, context.now());
}
/** 兩人一起刷牙時給另一個人站的空位：先找 from 旁邊、跟洗手台平行的那兩格（並肩對著鏡子），都站不進去才找洗手台旁邊其他格；有人站（taken）的跳過；沒有就 null。 */
function freeSpotBeside(room, basin, from, catalog, taken) {
    const walkable = (cell) => { if (taken.has(cellKey(cell)))
        return false; try {
        assertWalkable(room, cell, catalog);
        return true;
    }
    catch {
        return false;
    } };
    const basinCells = occupiedCells(basin, catalog).map((key) => { const [x, y] = key.split(",").map(Number); return { x: x, y: y }; });
    const facing = basinCells.find((cell) => Math.abs(cell.x - from.x) + Math.abs(cell.y - from.y) === 1);
    const shoulder = facing.x !== from.x ? [{ x: from.x, y: from.y + 1 }, { x: from.x, y: from.y - 1 }] : [{ x: from.x + 1, y: from.y }, { x: from.x - 1, y: from.y }];
    const aside = basinCells.flatMap(besideCells).filter((cell) => !(cell.x === from.x && cell.y === from.y));
    return [...shoulder, ...aside].find(walkable) ?? null;
}
/** 走得進去的格子：空地、地毯上、可坐的家具上。 */
export function assertWalkable(room, cell, catalog) {
    if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y))
        throw new Error("座標必須是整數格。");
    if (cell.x < 0 || cell.y < 0 || cell.x >= room.width || cell.y >= room.depth)
        throw new Error("這個位置超出房間。");
    const solid = room.placed.filter((p) => !catalog[p.item]?.floor && !catalog[p.item]?.seat);
    const taken = new Set(solid.flatMap((p) => occupiedCells(p, catalog)));
    if (taken.has(`${cell.x},${cell.y}`))
        throw new Error("那裡有家具，站不進去。");
}
/** 客人 id 全街唯一：找得到就知道在哪家店。 */
function findCustomer(state, id) {
    for (const [kind, shop] of Object.entries(state.shops)) {
        const customer = shop.customers.find((c) => c.id === id);
        if (customer)
            return { customer, kind, shop };
    }
    throw new Error("這位客人已經不在店裡了。");
}
function openedShop(state, kind) {
    const shop = state.shops[kind];
    if (!shop)
        throw new Error(`還沒有${SHOP_LABEL[kind]}，先租下隔壁的店面。`);
    return shop;
}
const withShop = (state, kind, shop) => ({ ...state, shops: { ...state.shops, [kind]: shop } });
/** 家具 id 全家唯一：找得到就知道它在哪間房。 */
export function findPlaced(state, id) {
    for (const [roomId, room] of Object.entries(state.rooms)) {
        const piece = room.placed.find((p) => p.id === id);
        if (piece)
            return { piece, roomId };
    }
    throw new Error("家裡找不到這件家具。");
}
function replacePlaced(state, piece) {
    const { roomId } = findPlaced(state, piece.id);
    const room = state.rooms[roomId];
    return withRoom(state, roomId, { ...room, placed: room.placed.map((p) => (p.id === piece.id ? piece : p)) });
}
export function findRoom(state, roomId) {
    const room = state.rooms[roomId];
    if (!room)
        throw new Error(`家裡還沒有「${roomId}」這間房。`);
    return room;
}
function withRoom(state, roomId, room) {
    return { ...state, rooms: { ...state.rooms, [roomId]: room } };
}
/** 動作者現在在哪間房；小屋自己（game）算在臥室。 */
function actorRoom(state, actor) {
    return actor === "game" ? FIRST_ROOM : state.positions[actor].room;
}
/** 做這件事的人站在哪：兒童版看娃娃（doer），小屋看阿童、阿宇的位置。 */
function standingSpot(state, context) {
    if (context.doer)
        return context.doer.spot;
    if (context.actor === "game")
        throw new Error("小屋自己沒有站的地方。");
    return state.positions[context.actor];
}
/** 放上桌的東西記誰放的：兒童版多記娃娃名字。 */
function placedBy(context) {
    if (context.actor === "game")
        throw new Error("小屋自己不放東西。");
    return { by: context.actor, ...(context.doer ? { name: context.doer.name } : {}) };
}
/** 日誌裡的房間名：只有一間房時不用講。 */
function roomNote(state, roomId) {
    return Object.keys(state.rooms).length > 1 ? state.rooms[roomId].name : "";
}
/** 雙人三消的收尾獎勵兩人平分；單數多的一顆給分數低的人，同分用盤面種子擲一次。 */
export function splitBonus(scores, bonus, seed) {
    const half = Math.floor(bonus / 2);
    const split = { atone: scores.atone + half, tsunu: scores.tsunu + half };
    if (bonus % 2) {
        const lower = split.atone === split.tsunu ? (random(seed)() < 0.5 ? "atone" : "tsunu") : split.atone < split.tsunu ? "atone" : "tsunu";
        split[lower] += 1;
    }
    return split;
}
function total(counts) {
    return Object.values(counts).reduce((sum, count) => sum + count, 0);
}
function mergeCounts(first, second) {
    const merged = { ...first };
    for (const [kind, count] of Object.entries(second))
        merged[kind] = (merged[kind] ?? 0) + count;
    return merged;
}
function adjust(counts, key, delta) {
    const next = { ...counts, [key]: (counts[key] ?? 0) + delta };
    if (next[key] === 0)
        delete next[key];
    return next;
}
//# sourceMappingURL=state.js.map