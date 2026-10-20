// 穿衣服的格子與衣服大類。純邏輯，小屋與兒童版共用（web/dress.js 有同一份給畫面用）。
/** 穿衣服的格子，由內到外（內衣、內褲是素體本身，不是格子）。上半身：內搭衣 → 上衣 → 外套 → 罩衫（圍裙、斗篷、圍巾）；
 *  下半身：內搭褲 → 下衣（短褲、長褲、裙子）→ 罩裙（背心裙、吊帶褲）；腳：襪子 → 鞋子；飾品（蝴蝶結、領帶）哪件衣服都能搭。 */
export const SLOTS = ["innerTop", "top", "coat", "wrap", "leggings", "bottom", "overskirt", "socks", "shoes", "accessory"];
export const SLOT_LABEL = { innerTop: "內搭衣", top: "上衣", coat: "外套", wrap: "罩衫", leggings: "內搭褲", bottom: "下衣", overskirt: "罩裙", socks: "襪子", shoes: "鞋子", accessory: "飾品" };
/** 衣服的大類，以及它穿在哪一格。洋裝、南瓜小丑裝是連身的，放上衣格。 */
export const CATEGORY_SLOT = {
    camisole: "innerTop", tee: "top", tank: "top", hoodie: "top", shirt: "top", pajama_top: "top", boyfriend_shirt: "top", dress: "top", pumpkin_suit: "top", coat: "coat", apron: "wrap", cape: "wrap", scarf: "wrap",
    leggings: "leggings", tights: "leggings", shorts: "bottom", pants: "bottom", wide_pants: "bottom", pajama_pants: "bottom", skirt: "bottom", pinafore: "overskirt", overalls: "overskirt", socks: "socks", shoes: "shoes", bowtie: "accessory", tie: "accessory",
};
/** 放在上衣格、但下襬一路蓋到大腿的大類：穿了就算有穿下身（開門服儀、咖啡廳客人配衣服都看這個；web/dress.js 有同一份）。 */
export const HIP_CATEGORIES = new Set(["dress", "boyfriend_shirt", "pumpkin_suit"]);
//# sourceMappingURL=clothing.js.map