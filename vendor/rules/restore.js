// 讀進來的存檔升級成目前的格式：沒有存檔就從頭開始，舊格式照順序遷移。純邏輯，小屋與兒童版共用。
import { CATEGORY_SLOT } from "./clothing.js";
import { FIRST_ROOM, GUEST_LOUNGE_ROOM, createBedroom, createInitialState, freeDoorSpot } from "./state.js";
const JEANS_SHORTS = "jeans_shorts";
export function restore(snapshot, content) {
    if (!snapshot || typeof snapshot !== "object")
        return createInitialState();
    const loaded = snapshot;
    if (loaded.version !== 1)
        throw new Error(`不認得的存檔版本：${String(loaded.version)}`);
    return { ...createInitialState(), ...migrateWorn(splitOutfits(mergeColorVariants(splitClothesColors(migrateShops(migrateUpstairs(migrateRooms(loaded), content)))), content), content), puzzle: migratePuzzle(loaded.puzzle) };
}
/** 客房的門搬上樓：有客房、沒有二樓小客廳的存檔，補一間二樓（門接客廳），每間客房的門從原本那間搬到二樓。 */
function migrateUpstairs(loaded, content) {
    const rooms = loaded.rooms;
    if (!rooms || rooms[GUEST_LOUNGE_ROOM])
        return loaded;
    const guestIds = Object.keys(rooms).filter((id) => content.rooms[rooms[id].kind]?.guest);
    if (!guestIds.length)
        return loaded;
    const spec = content.rooms[GUEST_LOUNGE_ROOM];
    const parentId = spec.connectsTo && rooms[spec.connectsTo] ? spec.connectsTo : FIRST_ROOM;
    const next = { ...rooms };
    for (const id of guestIds)
        next[id] = { ...next[id], doors: [{ wall: "left", at: Math.floor(next[id].depth / 2), to: GUEST_LOUNGE_ROOM }] };
    for (const [id, room] of Object.entries(next))
        if (!guestIds.includes(id))
            next[id] = { ...room, doors: room.doors.filter((door) => !guestIds.includes(door.to)) };
    let lounge = { kind: GUEST_LOUNGE_ROOM, name: spec.label, width: spec.width, depth: spec.depth, placed: [], doors: [{ wall: "left", at: Math.floor(spec.depth / 2), to: parentId }] };
    for (const id of guestIds) {
        const at = freeDoorSpot(lounge, content.furniture);
        if (at)
            lounge = { ...lounge, doors: [...lounge.doors, { ...at, to: id }] };
    }
    const parent = next[parentId];
    const stairs = freeDoorSpot(parent, content.furniture);
    next[parentId] = { ...parent, doors: [...parent.doors, { ...(stairs ?? { wall: "left", at: 1 }), to: GUEST_LOUNGE_ROOM }] };
    next[GUEST_LOUNGE_ROOM] = lounge;
    return { ...loaded, rooms: next };
}
/** 舊存檔的衣服顏色兩人共用一份（衣服代號 → 染法）：複製給兩人各一份，外觀不變。
 *  一律寫回：舊存檔沒有這欄時兩人都沒染過，不能讓新遊戲的起始顏色蓋上去。 */
function splitClothesColors(loaded) {
    const colors = loaded.clothesColors ?? {};
    if ("atone" in colors || "tsunu" in colors) { // 衣服代號不會叫 atone、tsunu：有這樣的鍵就是已經分開的
        const personal = colors;
        return { ...loaded, clothesColors: { atone: personal.atone ?? {}, tsunu: personal.tsunu ?? {} } };
    }
    const shared = colors;
    return { ...loaded, clothesColors: { atone: { ...shared }, tsunu: { ...shared } } };
}
/** 兩人的衣服顏色各自照同一個規則升級。 */
const recolorBoth = (colors, recolor) => ({ atone: recolor(colors.atone), tsunu: recolor(colors.tsunu) });
/** 拿掉的彩色款：併進哪件灰稿、原本是什麼顏色。 */
export const MERGED_CLOTHES = {
    casual: { into: "tee_gray", color: "#f4b3c2" },
    tee_mint: { into: "tee_gray", color: "#9fd8c9" },
    tee_yellow: { into: "tee_gray", color: "#f2dc8c" },
    shirt_navy: { into: "shirt_gray", color: "#4a6a9c" },
    shirt_white: { into: "shirt_gray", color: "#f2f2ee" },
    dress_lavender: { into: "dress_gray", color: "#c9b6e4" },
};
/** 有染色之後每種衣服只留一件灰稿：彩色款的數量併進灰稿；灰稿還沒染過色的，染成身上穿著（沒穿就是先擁有）那件彩色款的顏色，外觀不變。 */
function mergeColorVariants(loaded) {
    const rename = (item) => (item && MERGED_CLOTHES[item]?.into) ?? item;
    const wornItems = [...Object.values(loaded.worn?.atone ?? {}), ...Object.values(loaded.worn?.tsunu ?? {}), ...Object.values(loaded.wearing ?? {}), ...Object.values(loaded.outer ?? {})];
    const recolor = (own) => {
        const colors = { ...own };
        for (const item of [...wornItems, ...Object.keys(loaded.wardrobe ?? {})]) {
            const merged = item ? MERGED_CLOTHES[item] : undefined;
            if (merged && !colors[merged.into])
                colors[merged.into] = own[item] ?? merged.color;
        }
        for (const item of Object.keys(MERGED_CLOTHES))
            delete colors[item];
        return colors;
    };
    const wardrobe = {};
    for (const [item, count] of Object.entries(loaded.wardrobe ?? {}))
        wardrobe[rename(item)] = (wardrobe[rename(item)] ?? 0) + count;
    const renameAll = (slots) => slots && Object.fromEntries(Object.entries(slots).map(([slot, item]) => [slot, rename(item)]));
    return {
        ...loaded,
        ...(loaded.wardrobe ? { wardrobe } : {}),
        clothesColors: recolorBoth(loaded.clothesColors, recolor),
        ...(loaded.worn ? { worn: { atone: renameAll(loaded.worn.atone), tsunu: renameAll(loaded.worn.tsunu) } } : {}),
        ...(loaded.wearing ? { wearing: renameAll(loaded.wearing) } : {}),
        ...(loaded.outer ? { outer: renameAll(loaded.outer) } : {}),
    };
}
/** 拿掉的手繪套裝：拆成哪幾件灰稿、各自原本的顏色（阿宇的「襯衫配卡其褲」換成襯衫＋長褲兩件）。 */
export const SPLIT_CLOTHES = {
    shirt: [{ into: "shirt_gray", color: "#a9c8ee" }, { into: "pants_gray", color: "#cfbda2" }],
    uniform_gray: [{ into: "shirt_gray", color: "#b9b9b9" }, { into: "skirt_gray", color: "#b9b9b9" }, { into: "bowtie_gray", color: "#b9b9b9" }], // 一件式制服拆成三件
};
/** 套裝拆成單件：衣櫃裡每套換成各一件；身上穿著的，每件照大類穿進對應的格子（那格原本空著才穿）；
 *  灰稿還沒染過色的染成套裝原本的顏色，外觀不變。舊格式的「上衣」欄只放得下一件，換成第一件。 */
function splitOutfits(loaded, content) {
    const owned = Object.keys(loaded.wardrobe ?? {});
    const wornItems = [...Object.values(loaded.worn?.atone ?? {}), ...Object.values(loaded.worn?.tsunu ?? {}), ...Object.values(loaded.wearing ?? {})];
    const present = Object.keys(SPLIT_CLOTHES).filter((item) => owned.includes(item) || wornItems.includes(item));
    if (!present.length)
        return loaded;
    const wardrobe = { ...loaded.wardrobe };
    for (const item of present) {
        for (const part of SPLIT_CLOTHES[item])
            if (wardrobe[item])
                wardrobe[part.into] = (wardrobe[part.into] ?? 0) + wardrobe[item];
        delete wardrobe[item];
    }
    const recolor = (own) => {
        const colors = { ...own };
        for (const item of present) {
            for (const part of SPLIT_CLOTHES[item])
                if (!colors[part.into])
                    colors[part.into] = part.color;
            delete colors[item];
        }
        return colors;
    };
    const splitWorn = (slots) => {
        const next = {};
        for (const [slot, item] of Object.entries(slots))
            if (!SPLIT_CLOTHES[item])
                next[slot] = item;
        for (const item of Object.values(slots)) {
            for (const part of SPLIT_CLOTHES[item] ?? []) {
                const category = content.clothes[part.into]?.category;
                const slot = category ? CATEGORY_SLOT[category] : undefined;
                if (slot && !next[slot])
                    next[slot] = part.into;
            }
        }
        return next;
    };
    const renameLegacy = (slots) => Object.fromEntries(Object.entries(slots).map(([who, item]) => [who, item && SPLIT_CLOTHES[item] ? SPLIT_CLOTHES[item][0].into : item]));
    return {
        ...loaded,
        ...(loaded.wardrobe ? { wardrobe } : {}),
        clothesColors: recolorBoth(loaded.clothesColors, recolor),
        ...(loaded.worn ? { worn: { atone: splitWorn(loaded.worn.atone), tsunu: splitWorn(loaded.worn.tsunu) } } : {}),
        ...(loaded.wearing ? { wearing: renameLegacy(loaded.wearing) } : {}),
    };
}
/** 舊存檔只有「上衣」「外套」兩欄：每件衣服照大類放進對應的格子（外套、背心裙以前會被當上衣穿）；
 *  T 恤以前自帶牛仔短褲，現在短褲是獨立一件：衣櫃有 T 恤就補一件短褲，阿童身上穿著 T 恤的一併穿上。 */
function migrateWorn(loaded, content) {
    const { wearing, outer, ...rest } = loaded;
    if (rest.worn || !wearing)
        return rest;
    const isTee = (item) => !!item && content.clothes[item]?.category === "tee";
    const ownsTee = Object.keys(rest.wardrobe ?? {}).some(isTee);
    const wardrobe = ownsTee ? { ...rest.wardrobe, [JEANS_SHORTS]: Math.max(1, rest.wardrobe?.[JEANS_SHORTS] ?? 0) } : rest.wardrobe;
    const worn = {};
    for (const who of ["atone", "tsunu"]) {
        const slots = {};
        for (const item of [wearing[who], outer?.[who]]) {
            const spec = item ? content.clothes[item] : undefined;
            if (item && spec)
                slots[CATEGORY_SLOT[spec.category]] = item;
        }
        if (who === "atone" && isTee(slots.top))
            slots.bottom = JEANS_SHORTS; // 阿宇的 T 恤沒有畫短褲，不補
        worn[who] = slots;
    }
    return { ...rest, ...(wardrobe ? { wardrobe } : {}), worn };
}
/** 舊存檔只有一家咖啡廳（shop）：搬進 shops.cafe。 */
function migrateShops(loaded) {
    const { shop, ...rest } = loaded;
    return shop && !rest.shops ? { ...rest, shops: { cafe: shop } } : rest;
}
/** 舊存檔只有一間房（home）、位置沒記房間：房間搬進臥室，位置補上臥室。 */
function migrateRooms(loaded) {
    const { home, ...rest } = loaded;
    const rooms = rest.rooms ?? (home ? { [FIRST_ROOM]: createBedroom(home.placed, home.width, home.depth) } : undefined);
    const spot = (value) => (value ? { ...value, room: value.room ?? FIRST_ROOM } : undefined);
    const positions = rest.positions;
    return {
        ...rest,
        ...(rooms ? { rooms } : {}),
        ...(positions ? { positions: { atone: spot(positions.atone), tsunu: spot(positions.tsunu) } } : {}),
    };
}
/** 舊存檔的三消盤面每格是圖案字串，現在是 {kind, special?}；照舊格式存的盤面轉一下。 */
function migratePuzzle(puzzle) {
    if (!puzzle)
        return null;
    const cells = puzzle.board.cells.map((row) => row.map((cell) => (typeof cell === "string" ? { kind: cell } : cell)));
    return { ...puzzle, wanted: puzzle.wanted ?? [], board: { ...puzzle.board, cells } };
}
//# sourceMappingURL=restore.js.map