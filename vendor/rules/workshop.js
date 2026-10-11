// 合成工坊：棋盤上每格放一個「某條配方鏈的第幾階」，兩個同鏈同階合成升一階；升到最後一階就變商品離開棋盤。
export function createWorkshop(rows = 5, cols = 6) {
    return { rows, cols, cells: Array.from({ length: rows * cols }, () => null) };
}
export function putMaterial(workshop, chain, recipes) {
    if (!recipes[chain])
        throw new Error(`沒有「${chain}」這種材料。`);
    const index = workshop.cells.indexOf(null);
    if (index < 0)
        throw new Error("工坊滿了，先合成或賣掉一些。");
    const cells = [...workshop.cells];
    cells[index] = { chain, tier: 0 };
    return { ...workshop, cells };
}
/** 把 from 格的東西拖到 to 格：同鏈同階就合成；to 是空格就搬過去；其他情況拒絕。 */
export function moveOrMerge(workshop, from, to, recipes) {
    const source = cellAt(workshop, from), target = cellAt(workshop, to);
    if (!source)
        throw new Error("那一格是空的。");
    if (from === to)
        return { workshop, product: null };
    const cells = [...workshop.cells];
    if (!target) {
        cells[to] = source;
        cells[from] = null;
        return { workshop: { ...workshop, cells }, product: null };
    }
    if (target.chain !== source.chain || target.tier !== source.tier)
        throw new Error("只有一樣的東西才能合成。");
    const recipe = recipes[source.chain];
    if (!recipe)
        throw new Error(`沒有「${source.chain}」這條配方。`);
    cells[from] = null;
    if (source.tier + 2 >= recipe.tiers.length) {
        cells[to] = null;
        return { workshop: { ...workshop, cells }, product: source.chain };
    }
    cells[to] = { chain: source.chain, tier: source.tier + 1 };
    return { workshop: { ...workshop, cells }, product: null };
}
export function tierLabel(item, recipes) {
    return recipes[item.chain]?.tiers[item.tier] ?? `${item.chain}#${item.tier}`;
}
function cellAt(workshop, index) {
    if (!Number.isInteger(index) || index < 0 || index >= workshop.cells.length)
        throw new Error("工坊沒有這一格。");
    return workshop.cells[index] ?? null;
}
//# sourceMappingURL=workshop.js.map