// 把「每一格穿什麼」換成播放器要畫的 outfits：衣服三段降級、缺視角的備用套、各格的疊穿順序與內搭。小屋與兒童版共用。
// who：{ name（衣服專屬圖用哪一組，atone／tsunu）, skeletons（三個視角的骨架）, headParts（頭部零件，畫在衣服之後） }
// worn：{ 格子 → 衣服代號 }，格子見 CATEGORY_SLOT（跟伺服器 src/catalog.ts 同一組）。

/** 衣服大類穿在哪一格（跟伺服器 src/catalog.ts 的 CATEGORY_SLOT 同一組）。 */
export const CATEGORY_SLOT = {
  camisole: "innerTop", tee: "top", tank: "top", hoodie: "top", shirt: "top", pajama_top: "top", boyfriend_shirt: "top", dress: "top", pumpkin_suit: "top", coat: "coat", apron: "wrap", cape: "wrap", scarf: "wrap",
  leggings: "leggings", tights: "leggings", shorts: "bottom", pants: "bottom", wide_pants: "bottom", pajama_pants: "bottom", skirt: "bottom", pinafore: "overskirt", overalls: "overskirt", socks: "socks", shoes: "shoes", bowtie: "accessory", tie: "accessory",
};
export const SLOT_LABEL = { innerTop: "內搭衣", top: "上衣", coat: "外套", wrap: "罩衫", leggings: "內搭褲", bottom: "下衣", overskirt: "罩裙", socks: "襪子", shoes: "鞋子", accessory: "飾品" };

/** 由底到頂的畫法：上衣紮進下衣（tucked）就畫在下衣底下，不紮的（T 恤）畫在下衣上面；罩裙在外套底下；鞋子在下衣底下，褲管才蓋得住鞋口；
 *  飾品（蝴蝶結、領帶）蓋在上衣和罩裙上、敞開的外套底下。 */
const UPPER_SLOTS = new Set(["innerTop", "top", "coat", "wrap", "accessory"]);
const HIP_CATEGORIES = new Set(["dress", "boyfriend_shirt", "pumpkin_suit"]);   // 放在上衣格、但下襬一路蓋到大腿（跟伺服器 src/clothing.ts 同一組）

/** 這件穿了就蓋到大腿（連身的洋裝類），不用再配下衣。 */
export const coversHips = (spec) => !!spec && HIP_CATEGORIES.has(spec.category);
const TUCKED_ORDER = ["leggings", "socks", "shoes", "innerTop", "top", "bottom", "overskirt", "accessory", "coat", "wrap"];
const UNTUCKED_ORDER = ["leggings", "socks", "shoes", "innerTop", "bottom", "top", "overskirt", "accessory", "coat", "wrap"];

/** 穿了罩裙、外套或罩衫卻沒穿上衣和內搭衣時配的白 T（沒有 T 恤模板的素體退回白襯衫模板）。 */
const INNER_TEE = [{ category: "tee", color: "#f7f5ef" }, { category: "shirt", color: "#f7f5ef" }];

/** 這件衣服交給播放器的染法：一般是目錄（或自己挑）的顏色；透膚的（漁網背心）布料透明、網線用那個顏色畫，自己挑的花紋不套、永遠是漁網。 */
function garmentTint(spec) {
  if (!spec.sheer) return spec.color;
  const color = typeof spec.color === "string" ? spec.color : spec.color.color;
  return { color, pattern: "fishnet", patternColor: color, sheer: true };
}

/** 一件衣服要交給播放器的套：專屬小人圖 → 同大類模板染主色；兩個都沒有就是 null。 */
function garmentOutfit(who, spec) {
  const skeleton = who.skeletons.front;   // 模板三個視角都有，用正面判斷
  const template = `tpl_${spec.category}`;
  const templateOutfit = skeleton.data.outfits?.[template] ? { name: template, tint: garmentTint(spec) } : null;
  const own = spec.sprites?.[who.name];
  if (!own || !Object.values(who.skeletons).some((view) => view.data.outfits?.[own])) return templateOutfit;
  // 手繪套可能只拆了部分視角：沒有的視角改穿 fallback（指定的舊套，沒指定就用同色模板）
  const fallback = spec.fallback?.[who.name] ?? templateOutfit;
  return { name: own, tint: spec.dye || spec.sheer ? garmentTint(spec) : null, ...(fallback ? { fallback } : {}) };   // dye：手繪灰稿染成這件的顏色
}

/** 一件衣服另外接的零件（parts：無袖帽 T 接 T 恤的袖子），用那個大類的模板、只畫列出的骨頭，染同一個顏色。 */
function partOutfits(who, spec) {
  return (spec.parts ?? []).filter(({ template }) => who.skeletons.front.data.outfits?.[`tpl_${template}`])
    .map(({ template, bones }) => ({ name: `tpl_${template}`, tint: garmentTint(spec), ...(bones ? { bones } : {}) }));
}

/** 能自己挑顏色的衣服：手繪灰稿（dye）或走同大類模板（沒有專屬圖）。 */
export function dyeable(spec) {
  return !!spec && (!!spec.dye || !spec.sprites);
}

/** 設計文件的「小人衣服三段降級」：專屬小人圖 → 同大類模板染主色 → 上衣都沒有就是基本身體染主色。
 *  colors：自己挑過顏色的衣服（代號 → 顏色），蓋過目錄的主色。回傳要交給播放器的 outfits 與 bodyTint。 */
export function dressUp(who, worn, clothes, colors = {}) {
  const colored = (id) => clothes[id] && (colors[id] ? { ...clothes[id], color: colors[id] } : clothes[id]);
  const specs = Object.fromEntries(Object.entries(worn ?? {}).map(([slot, id]) => [slot, colored(id)]).filter(([, spec]) => spec));
  const needsInner = !specs.top && !specs.innerTop && (specs.overskirt || specs.coat || specs.wrap);
  const layers = [];
  let bodyTint = null;
  for (const slot of specs.top?.tucked ? TUCKED_ORDER : UNTUCKED_ORDER) {
    if (slot === "innerTop" && needsInner) {
      const inner = INNER_TEE.map((spec) => garmentOutfit(who, spec)).find(Boolean);
      if (inner) layers.push(inner);
    }
    if (!specs[slot]) continue;
    const outfit = garmentOutfit(who, specs[slot]);
    const tuck = slot === "top" && specs.top.tucked && !!(specs.bottom || specs.overskirt);   // 紮進下身：下襬往下延長的那片才畫（沒穿下身會露出來）
    const top = UPPER_SLOTS.has(slot) && !HIP_CATEGORIES.has(specs[slot].category);   // 只蓋上半身：單穿時播放器照畫內褲
    const outdoor = slot === "shoes";   // 在家脫掉（room-view 不畫），在店裡穿
    const flags = { ...(slot === "coat" ? { outer: true } : {}), ...(tuck ? { tuck } : {}), ...(top ? { top } : {}), ...(outdoor ? { outdoor } : {}) };   // 外套袖子包住裡面衣服的袖子（播放器照有沒有袖子片判斷）
    const parts = partOutfits(who, specs[slot]);
    const sleeved = parts.some(({ bones }) => bones?.some((bone) => bone.startsWith("upper_arm")));   // 接了袖子：本體的袖孔補片照畫
    if (outfit) layers.push({ ...outfit, ...flags, ...(sleeved ? { sleeved } : {}) }, ...parts.map((part) => ({ ...part, ...flags })));
    else if (slot === "top") bodyTint = specs.top.color;
  }
  return { outfits: [...layers, ...who.headParts], bodyTint };
}
