// 捏娃娃的外型選項：選單上的名稱（中性描述，不寫阿童、阿宇）、對應骨架裡的套名、能不能染色。
// 套名要在素體的骨架檔裡真的存在才會出現在選單（小葵的新款裝進骨架、重新匯出就自動出現）。

export const BODIES = {
  f: { label: "女生", sprites: "atone", views: { front: "front", front34: "front34", back34: "back34" }, starter: { top: "tee_gray", bottom: "jeans_shorts", shoes: "shoes_gray" }, starterColors: { tee_gray: "#f4b3c2" } },
  m: { label: "男生", sprites: "tsunu", views: { front: "m_front", front34: "m_front34", back34: "m_back34" }, starter: { top: "shirt_gray", bottom: "pants_gray", shoes: "shoes_gray" }, starterColors: { shirt_gray: "#a9c8ee", pants_gray: "#cfbda2" } },
};

/** 頭髮都是灰稿，照娃娃的髮色染。 */
export const HAIRS = [
  { id: "kid_straightbob", body: "f", label: "鮑伯頭", outfit: "kid_straightbob_hair" },
  { id: "kid_ponytail", body: "f", label: "馬尾", outfit: "kid_ponytail_hair" },
  { id: "kid_long", body: "f", label: "長髮", outfit: "kid_long_hair" },
  { id: "kid_twintails", body: "f", label: "雙馬尾", outfit: "kid_twintails_hair" },
  { id: "kid_bun", body: "f", label: "丸子頭", outfit: "kid_bun_hair" },
  { id: "kid_pixie", body: "f", label: "俏麗短髮", outfit: "kid_pixie_hair" },
  { id: "kid_twinbuns", body: "f", label: "雙包頭", outfit: "kid_twinbuns_hair" },
  { id: "kid_braids", body: "f", label: "雙辮子", outfit: "kid_braids_hair" },
  { id: "kid_waves", body: "f", label: "大波浪長髮", outfit: "kid_waves_hair" },
  { id: "curly_short", body: "f", label: "捲捲短髮", outfit: "kid_atone_hair" },
  { id: "kid_short", body: "m", label: "清爽短髮", outfit: "kid_short_hair" },
  { id: "kid_wavy", body: "m", label: "微捲中長髮", outfit: "kid_wavy_hair" },
  { id: "kid_spiky", body: "m", label: "刺刺運動頭", outfit: "kid_spiky_hair" },
  { id: "kid_sidepart", body: "m", label: "旁分", outfit: "kid_sidepart_hair" },
  { id: "kid_buzz", body: "m", label: "平頭", outfit: "kid_buzz_hair" },
  { id: "kid_curly", body: "m", label: "捲髮", outfit: "kid_curly_hair" },
  { id: "tousled", body: "m", label: "蓬鬆短髮", outfit: "kid_tsunu_hair" },
];

/** 眼睛：iris 是瞳孔灰稿，可以換眼睛顏色；沒有的就是原本的顏色。 */
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
  { id: "kid_f_smile", body: "f", label: "微笑", mouth: "kid_f_smile_mouth", lips: "kid_f_smile_lips" },
  { id: "kid_f_round", body: "f", label: "彎彎嘴", mouth: "kid_f_round_mouth", lips: "kid_f_round_lips" },
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
export const HAIR_COLORS = ["#3b2a22", "#6b4a32", "#a8743f", "#e2c07a", "#f2efe8", "#c75c4a", "#e98fb0", "#6c8fd6"];
export const IRIS_COLORS = ["#5b3a24", "#8a5a2b", "#3f6fa8", "#4f8a5b", "#7a5aa6", "#2b2b2b", "#c0843a", "#d05f7a"];
/** 衣服的色票：衣服都是灰稿，每個娃娃自己挑顏色；第一個是灰稿原色。 */
export const CLOTHES_COLORS = ["#b9b9b9", "#f2f2ee", "#f4b3c2", "#e07a7a", "#f2dc8c", "#9fd8c9", "#a9c8ee", "#4a6a9c", "#c9b6e4", "#c8a070", "#6b8f5a", "#3b3b44"];
export const LIP_COLORS = ["#e8a48c", "#e2a0a0", "#de9a96", "#d65a6e", "#c86478", "#b4505a", "#e07a5a", "#a8506e"];   // 第一個是自然唇色

/** 某個素體、某類選項裡，骨架檔（正面）真的有的那幾個。 */
export function available(options, body, skeletonOutfits) {
  return options.filter((option) => option.body === body && [option.outfit, option.face, option.mouth].filter(Boolean).every((name) => skeletonOutfits[name]));
}
