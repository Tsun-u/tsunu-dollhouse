// 捏角選項（兩版共用）：素體、髮型、眼睛、嘴巴、眼鏡、色票，與頭部零件的組裝。純資料與純函式，小屋與兒童版、規則與畫面都用這一份。
// 選單上的名稱是中性描述（不寫阿童、阿宇）；套名要在素體的骨架檔裡真的存在才會出現在選單（小葵的新款裝進骨架、重新匯出就自動出現）。
export const BODIES = {
    f: { label: "女生", sprites: "atone", views: { front: "front", front34: "front34", back34: "back34" }, starter: { top: "tee_gray", bottom: "jeans_shorts", shoes: "shoes_gray" }, starterColors: { tee_gray: "#f4b3c2" } },
    m: { label: "男生", sprites: "tsunu", views: { front: "m_front", front34: "m_front34", back34: "m_back34" }, starter: { top: "shirt_gray", bottom: "pants_gray", shoes: "shoes_gray" }, starterColors: { shirt_gray: "#a9c8ee", pants_gray: "#cfbda2" } },
};
/** 頭髮都是灰稿，照髮色染。 */
export const HAIRS = [
    { id: "kid_straightbob", body: "f", label: "鮑伯頭", outfit: "kid_straightbob_hair", highlight: "kid_straightbobhl_hair" },
    { id: "kid_ponytail", body: "f", label: "馬尾", outfit: "kid_ponytail_hair", highlight: "kid_ponytailhl_hair" },
    { id: "kid_long", body: "f", label: "長髮", outfit: "kid_long_hair", highlight: "kid_longhl_hair" },
    { id: "kid_twintails", body: "f", label: "雙馬尾", outfit: "kid_twintails_hair" },
    { id: "kid_bun", body: "f", label: "丸子頭", outfit: "kid_bun_hair" },
    { id: "kid_pixie", body: "f", label: "俏麗短髮", outfit: "kid_pixie_hair" },
    { id: "kid_twinbuns", body: "f", label: "雙包頭", outfit: "kid_twinbuns_hair" },
    { id: "kid_braids", body: "f", label: "雙辮子", outfit: "kid_braids_hair" },
    { id: "kid_waves", body: "f", label: "大波浪長髮", outfit: "kid_waves_hair" },
    { id: "kid_himecut", body: "f", label: "公主切", outfit: "kid_himecut_hair" },
    { id: "kid_longstraight", body: "f", label: "及腰長直髮", outfit: "kid_longstraight_hair", highlight: "kid_longstraighthl_hair" },
    { id: "kid_fluffylong", body: "f", label: "蓬鬆長髮", outfit: "kid_fluffylong_hair" },
    { id: "kid_bunwaves", body: "f", label: "雙包頭長捲髮", outfit: "kid_bunwaves_hair" },
    { id: "kid_lowponytail", body: "f", label: "低馬尾", outfit: "kid_lowponytail_hair" },
    { id: "kid_sideponytail", body: "f", label: "側邊捲馬尾", outfit: "kid_sideponytail_hair", highlight: "kid_sideponytailhl_hair" },
    { id: "curly_short", body: "f", label: "捲捲短髮", outfit: "kid_atone_hair" },
    { id: "kid_short", body: "m", label: "清爽短髮", outfit: "kid_short_hair", highlight: "kid_shorthl_hair" },
    { id: "kid_wavy", body: "m", label: "微捲中長髮", outfit: "kid_wavy_hair" },
    { id: "kid_spiky", body: "m", label: "刺刺運動頭", outfit: "kid_spiky_hair" },
    { id: "kid_sidepart", body: "m", label: "旁分", outfit: "kid_sidepart_hair" },
    { id: "kid_buzz", body: "m", label: "平頭", outfit: "kid_buzz_hair" },
    { id: "kid_curly", body: "m", label: "捲髮", outfit: "kid_curly_hair" },
    { id: "tousled", body: "m", label: "蓬鬆短髮", outfit: "kid_tsunu_hair" },
];
/** 眼睛：iris 是瞳孔灰稿（換眼睛顏色），brows 是眉毛灰稿（照髮色暗一階染）。 */
export const FACES = [
    { id: "kid_f_smile", body: "f", label: "笑眼", face: "kid_f_smile_face", iris: "kid_f_smile_iris", brows: "kid_f_smile_brows" },
    { id: "kid_f_round", body: "f", label: "大眼", face: "kid_f_round_face", iris: "kid_f_round_iris", brows: "kid_f_round_brows" },
    { id: "kid_f_droopy", body: "f", label: "下垂眼", face: "kid_f_droopy_face", iris: "kid_f_droopy_iris", brows: "kid_f_droopy_brows" },
    { id: "kid_f_grin", body: "f", label: "亮晶晶", face: "kid_f_grin_face", iris: "kid_f_grin_iris", brows: "kid_f_grin_brows" },
    { id: "gentle", body: "f", label: "溫柔", face: "kid_f_atone_face", iris: "kid_f_atone_iris", brows: "kid_f_atone_brows" },
    { id: "kid_m_smile", body: "m", label: "笑眼", face: "kid_m_smile_face", iris: "kid_m_smile_iris", brows: "kid_m_smile_brows" },
    { id: "kid_m_cool", body: "m", label: "酷酷", face: "kid_m_cool_face", iris: "kid_m_cool_iris", brows: "kid_m_cool_brows" },
    { id: "kid_m_round", body: "m", label: "圓眼", face: "kid_m_round_face", iris: "kid_m_round_iris", brows: "kid_m_round_brows" },
    { id: "kid_m_surprised", body: "m", label: "睜大眼", face: "kid_m_surprised_face", iris: "kid_m_surprised_iris", brows: "kid_m_surprised_brows" },
    { id: "calm", body: "m", label: "沉穩", face: "kid_m_tsunu_face", iris: "kid_m_tsunu_iris", brows: "kid_m_tsunu_brows" },
];
/** 嘴巴：id 跟同一張圖畫出來的眼睛一樣（舊存檔沒選過嘴巴，就配這一款）。lips 是唇色灰稿，可以擦口紅。 */
export const MOUTHS = [
    { id: "kid_f_smile", body: "f", label: "微笑", mouth: "kid_f_smile_mouth", lips: "kid_f_smile_lips", drop: 7 }, // 這兩款的嘴線比下垂眼高 5～6 px（畫面上，頭縮放 0.85），往下對齊
    { id: "kid_f_round", body: "f", label: "彎彎嘴", mouth: "kid_f_round_mouth", lips: "kid_f_round_lips", drop: 7 },
    { id: "kid_f_droopy", body: "f", label: "小小微笑", mouth: "kid_f_droopy_mouth", lips: "kid_f_droopy_lips" },
    { id: "kid_f_grin", body: "f", label: "張嘴大笑", mouth: "kid_f_grin_mouth", lips: "kid_f_grin_lips" },
    { id: "gentle", body: "f", label: "溫柔", mouth: "kid_f_atone_mouth", lips: "kid_f_atone_lips" },
    { id: "kid_m_smile", body: "m", label: "微笑", mouth: "kid_m_smile_mouth", lips: "kid_m_smile_lips" },
    { id: "kid_m_cool", body: "m", label: "抿嘴", mouth: "kid_m_cool_mouth", lips: "kid_m_cool_lips" },
    { id: "kid_m_round", body: "m", label: "嘴角上揚", mouth: "kid_m_round_mouth", lips: "kid_m_round_lips" },
    { id: "kid_m_surprised", body: "m", label: "o 形嘴", mouth: "kid_m_surprised_mouth", lips: "kid_m_surprised_lips" },
    { id: "calm", body: "m", label: "沉穩", mouth: "kid_m_tsunu_mouth", lips: "kid_m_tsunu_lips" },
];
/** 眼鏡是灰稿，染成固定的鏡框顏色。 */
export const GLASSES = [
    { id: "round_silver", body: "f", label: "圓框眼鏡", outfit: "kid_atone_glasses", tint: "#d8d8d8" },
    { id: "boston", body: "m", label: "波士頓框眼鏡", outfit: "kid_tsunu_glasses", tint: "#2c3e66" },
];
export const SKIN_TONES = ["#ffe8d1", "#fbd9bd", "#f1c9a5", "#dcae86", "#b98460", "#8d5a3b"];
/** 顏色是 #rrggbb：色票之外也可以自訂（捏角的膚色、髮色、眼睛、口紅、衣服）。 */
export const isColor = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
export const HAIR_COLORS = ["#3b2a22", "#6b4a32", "#a8743f", "#e2c07a", "#f2efe8", "#c75c4a", "#e98fb0", "#6c8fd6"];
export const IRIS_COLORS = ["#5b3a24", "#8a5a2b", "#3f6fa8", "#4f8a5b", "#7a5aa6", "#2b2b2b", "#c0843a", "#d05f7a"];
export const LIP_COLORS = ["#e8a48c", "#e2a0a0", "#de9a96", "#d65a6e", "#c86478", "#b4505a", "#e07a5a", "#a8506e"]; // 第一個是自然唇色
/** 衣服的色票：衣服都是灰稿，自己挑顏色；第一個是灰稿原色。 */
export const CLOTHES_COLORS = ["#b9b9b9", "#f2f2ee", "#f4b3c2", "#e07a7a", "#f2dc8c", "#9fd8c9", "#a9c8ee", "#4a6a9c", "#c9b6e4", "#c8a070", "#6b8f5a", "#3b3b44"];
/** 衣服花紋（代號與中文名）：衣櫃、捏角、AI 工具共用這份；怎麼畫在播放器旁的 spike_player/patterns.js（test/patterns.test.ts 鎖住兩邊代號一致）。 */
export const PATTERNS = [
    { id: "plaid", label: "格紋" },
    { id: "stripes_h", label: "橫條紋" },
    { id: "stripes_v", label: "直條紋" },
    { id: "dots", label: "點點" },
    { id: "houndstooth", label: "千鳥格" },
];
export const PATTERN_IDS = PATTERNS.map((pattern) => pattern.id);
/** 隨機穿搭的客人每件能染的衣服抽一次：四件裡一件穿花紋。 */
export const PATTERN_ROLLS = [true, false, false, false];
const isPatternId = (value) => PATTERN_IDS.includes(value);
export function isDye(value) {
    if (isColor(value))
        return true;
    if (typeof value !== "object" || value === null)
        return false;
    const { color, pattern, patternColor } = value;
    return isColor(color) && isPatternId(pattern) && isColor(patternColor);
}
/** 存檔用的染法：色碼一律小寫、花紋物件只留三個欄位；不合法丟錯。 */
export function normalizeDye(value) {
    if (!isDye(value))
        throw new Error(`顏色要是 #rrggbb，或 { color, pattern, patternColor }（pattern：${PATTERN_IDS.join("／")}）。`);
    return typeof value === "string" ? value.toLowerCase() : { color: value.color.toLowerCase(), pattern: value.pattern, patternColor: value.patternColor.toLowerCase() };
}
export const dyeBase = (dye) => (typeof dye === "string" ? dye : dye.color);
export const dyePattern = (dye) => (dye && typeof dye === "object" ? dye.pattern : null);
export const patternLabel = (pattern) => PATTERNS.find((option) => option.id === pattern).label;
const dyeKey = (dye) => (dye == null ? "" : typeof dye === "string" ? dye.toLowerCase() : `${dye.color}/${dye.pattern}/${dye.patternColor}`.toLowerCase());
/** 兩個染法一樣（物件比內容，不比參照）；null 與 undefined 都是「沒挑過」。 */
export const sameDye = (a, b) => dyeKey(a) === dyeKey(b);
/** 換底色，花紋留著。 */
export const withBase = (dye, color) => (typeof dye === "string" ? color : { ...dye, color });
/** 換花紋：null 改回素色；原本是素色時，花紋色挑 palette 裡跟底色亮度差最大的。 */
export function withPattern(dye, pattern, palette) {
    const color = dyeBase(dye);
    if (!pattern)
        return color;
    return { color, pattern, patternColor: typeof dye === "string" ? contrastColor(color, palette) : dye.patternColor };
}
export const withPatternColor = (dye, patternColor) => ({ ...dye, patternColor });
const lightness = (hex) => [1, 3, 5].reduce((sum, k, i) => sum + parseInt(hex.slice(k, k + 2), 16) * [0.299, 0.587, 0.114][i], 0);
/** palette 裡跟 color 亮度差最大的顏色；palette 空的就用白或黑。 */
export function contrastColor(color, palette) {
    const options = palette.length ? palette : ["#ffffff", "#000000"];
    return options.reduce((best, option) => (Math.abs(lightness(option) - lightness(color)) > Math.abs(lightness(best) - lightness(color)) ? option : best));
}
/** 隨機穿搭的一件衣服：從 palette 抽底色；抽到穿花紋就再抽花紋與另一個顏色（跟底色不同）。pick 是種子抽籤，同一顆種子永遠同一件。 */
export function randomDye(pick, palette) {
    const color = pick(palette);
    if (!pick(PATTERN_ROLLS))
        return color;
    const others = palette.filter((option) => option !== color);
    return { color, pattern: pick(PATTERN_IDS), patternColor: pick(others.length ? others : [contrastColor(color, [])]) };
}
/** 小屋保留給阿童、阿宇本人的長相：人類和 AI 訪客挑不到，免得有人冒充屋主（眼鏡開放；隨機客人不受限）。 */
export const HOST_LOOKS = new Set(["curly_short", "tousled", "gentle", "calm"]);
/** 五官高度可以調的範圍（原圖 px）。 */
export const FACE_OFFSET_MAX = 12;
export const isFaceOffset = (value) => Number.isInteger(value) && Math.abs(value) <= FACE_OFFSET_MAX;
const BROW_SHADE = 0.8; // 眉毛是髮色的幾倍亮
/** 某個素體、某類選項裡，骨架檔真的有的那幾個。 */
export function available(options, body, skeletonOutfits) {
    return options.filter((option) => option.body === body && !!skeletonOutfits[partName(option)]);
}
/** 訪客選單：拿掉保留給屋主的款式。 */
export function forVisitors(options) {
    return options.filter((option) => !HOST_LOOKS.has(option.id));
}
/** 頭部零件交給播放器的順序：瞳孔、唇色墊最底下 → 眼睛 → 眉毛 → 嘴巴 → 頭髮 → 眼鏡。能染色的帶 tint。 */
export function headParts(looks) {
    const face = FACES.find((option) => option.id === looks.face);
    const mouth = MOUTHS.find((option) => option.id === (looks.mouth ?? looks.face));
    const hair = HAIRS.find((option) => option.id === looks.hair);
    const glasses = GLASSES.find((option) => option.id === looks.glasses);
    const eyeDy = looks.eyeOffset ?? 0;
    const mouthDy = (mouth?.drop ?? 0) + (looks.mouthOffset ?? 0);
    return [
        ...(face ? [part(face.iris, looks.irisColor, eyeDy)] : []),
        ...(mouth ? [part(mouth.lips, looks.lipColor ?? LIP_COLORS[0], mouthDy)] : []),
        ...(face ? [part(face.face, null, eyeDy), part(face.brows, browColor(looks.hairColor), eyeDy)] : []),
        ...(mouth ? [part(mouth.mouth, null, mouthDy)] : []),
        ...(hair ? [{ name: hair.outfit, tint: looks.hairColor }] : []),
        ...(hair?.highlight && looks.hairHighlight ? [{ name: hair.highlight, tint: looks.hairHighlight }] : []), // 挑染疊在頭髮上，照原本的明暗染第二個顏色
        ...(glasses ? [{ name: glasses.outfit, tint: glasses.tint }] : []),
    ];
}
/** 隨機長相（咖啡廳客人）：pick 每次從清單抽一個；只挑這個素體、骨架裡有的款式，不戴眼鏡。 */
export function randomLooks(pick, body, skeletonOutfits) {
    const face = pick(available(FACES, body, skeletonOutfits));
    const mouth = pick(available(MOUTHS, body, skeletonOutfits));
    const hair = pick(available(HAIRS, body, skeletonOutfits));
    return {
        body, skin: pick(SKIN_TONES) ?? SKIN_TONES[0],
        hair: hair?.id ?? null, hairColor: pick(HAIR_COLORS) ?? HAIR_COLORS[0],
        face: face?.id ?? null, irisColor: pick(IRIS_COLORS) ?? IRIS_COLORS[0],
        mouth: mouth?.id ?? null, lipColor: pick(LIP_COLORS) ?? LIP_COLORS[0],
        glasses: null,
    };
}
/** 一個頭部零件：沒顏色、沒移動就只寫套名。 */
function part(name, tint, dy) {
    if (!tint && !dy)
        return name;
    return { name, ...(tint ? { tint } : {}), ...(dy ? { dy } : {}) };
}
/** 這個選項要在骨架裡找的套名：髮型、眼鏡是 outfit，眼睛是 face，嘴巴是 mouth。 */
function partName(option) {
    if ("outfit" in option)
        return option.outfit;
    if ("face" in option)
        return option.face;
    return option.mouth;
}
/** 眉毛的顏色：比髮色暗一階。 */
function browColor(hairColor) {
    return "#" + [1, 3, 5].map((i) => Math.round(parseInt(hairColor.slice(i, i + 2), 16) * BROW_SHADE).toString(16).padStart(2, "0")).join("");
}
//# sourceMappingURL=looks.js.map