// 娃娃存檔：最多四個自己捏的娃娃（外型、衣服、所在位置）與目前選取誰。純邏輯，畫面在 creator.js、house.js。

import { CATEGORY_SLOT } from "../vendor/web/dress.js";
import { BODIES, FACES, HAIRS, MOUTHS, HAIR_COLORS, IRIS_COLORS, LIP_COLORS, SKIN_TONES } from "../vendor/rules/looks.js";
import { MERGED_CLOTHES, SPLIT_CLOTHES } from "../vendor/rules/restore.js";

export const DOLLS_KEY = "dollhouse.dolls";
export const MAX_DOLLS = 4;
const VERSION = 7;
const START_SPOT = { room: "bedroom", x: 3, y: 4 };

export function createDoll({ name, body, ...looks }, newId = () => crypto.randomUUID()) {
  return {
    id: newId(), name, body,
    skin: SKIN_TONES[0],
    hair: HAIRS.find((hair) => hair.body === body)?.id ?? null, hairColor: HAIR_COLORS[0],
    face: FACES.find((face) => face.body === body)?.id ?? null, irisColor: IRIS_COLORS[0],
    mouth: MOUTHS.find((mouth) => mouth.body === body)?.id ?? null, lipColor: LIP_COLORS[0],
    glasses: null,
    worn: { ...BODIES[body].starter },   // 每一格穿的衣服（格子見 vendor/web/dress.js 的 CATEGORY_SLOT）
    colors: { ...BODIES[body].starterColors },   // 自己挑過顏色的衣服：代號 → 顏色
    spot: { ...START_SPOT },
    ...looks,
  };
}

export function addDoll(dolls, doll) {
  if (dolls.length >= MAX_DOLLS) throw new Error(`最多 ${MAX_DOLLS} 個娃娃。`);
  return [...dolls, doll];
}

export function removeDoll(dolls, id) {
  if (dolls.length <= 1) throw new Error("至少要留一個娃娃顧家。");
  return dolls.filter((doll) => doll.id !== id);
}

export function updateDoll(dolls, id, changes) {
  return dolls.map((doll) => (doll.id === id ? { ...doll, ...changes } : doll));
}

export function randomShopkeeper(dolls, rand = Math.random) {
  return dolls[Math.min(dolls.length - 1, Math.floor(rand() * dolls.length))] ?? null;
}

/** 拿掉的套裝拆成單件灰稿（SPLIT_CLOTHES）升到 version：每件照大類穿進空著的格子，沒染過的顏色維持原本的。 */
function splitSuits(version) {
  return (saved, clothes) => ({
    ...saved, version,
    dolls: saved.dolls.map((doll) => {
      const worn = Object.fromEntries(Object.entries(doll.worn).filter(([, item]) => !SPLIT_CLOTHES[item]));
      const colors = { ...doll.colors };
      for (const item of Object.values(doll.worn)) {
        for (const part of SPLIT_CLOTHES[item] ?? []) {
          const slot = CATEGORY_SLOT[clothes[part.into]?.category];
          if (slot && !worn[slot]) worn[slot] = part.into;
          if (!colors[part.into]) colors[part.into] = part.color;
        }
      }
      return { ...doll, worn, colors };
    }),
  });
}

/** 舊版本的娃娃存檔升級到目前版本：key 是舊版本號，回傳下一版。clothes 是衣服清單（照大類放格子要用）。 */
const MIGRATIONS = {
  /** 1 → 2：上衣、外套兩欄改成分格；女生的 T 恤以前自帶牛仔短褲，現在短褲是另一件，補穿上。 */
  1: (saved, clothes) => ({
    ...saved, version: 2,
    dolls: saved.dolls.map(({ top, outer, ...doll }) => {
      const worn = {};
      const specOf = (item) => clothes[MERGED_CLOTHES[item]?.into ?? SPLIT_CLOTHES[item]?.[0].into ?? item];   // 彩色款、套裝已經拿掉，大類看它換成的灰稿；代號留給 2 → 3、3 → 4 換
      for (const item of [top, outer]) if (item && specOf(item)) worn[CATEGORY_SLOT[specOf(item).category]] = item;
      if (doll.body === "f" && worn.top && specOf(worn.top).category === "tee") worn.bottom = "jeans_shorts";
      return { ...doll, worn };
    }),
  }),
  /** 2 → 3：衣服只留灰稿、顏色自己挑：穿著的彩色款換成灰稿，顏色記進娃娃的 colors，外觀不變。 */
  2: (saved) => ({
    ...saved, version: 3,
    dolls: saved.dolls.map((doll) => {
      const worn = {}, colors = {};
      for (const [slot, item] of Object.entries(doll.worn)) {
        const merged = MERGED_CLOTHES[item];
        worn[slot] = merged?.into ?? item;
        if (merged) colors[merged.into] = merged.color;
      }
      return { ...doll, worn, colors };
    }),
  }),
  3: splitSuits(4),   // 3 → 4：男生的襯衫配卡其褲 → 襯衫＋長褲
  4: splitSuits(5),   // 4 → 5：一件式制服 → 襯衫＋百褶裙＋蝴蝶結
  /** 5 → 6：舊的捲髮鮑伯頭跟捲捲短髮是同一個造型，併進捲捲短髮（「鮑伯頭」改指直髮的經典鮑伯）。 */
  5: (saved) => ({ ...saved, version: 6, dolls: saved.dolls.map((doll) => (doll.hair === "kid_bob" ? { ...doll, hair: "curly_short" } : doll)) }),
  /** 6 → 7：南瓜小丑裝是套在衣服外面的，從上衣格搬到罩裙格（跟小屋的 migratePumpkinSuit 一樣）。 */
  6: (saved) => ({
    ...saved, version: 7,
    dolls: saved.dolls.map((doll) => {
      if (doll.worn.top !== "pumpkin_suit") return doll;
      const { top: _top, ...rest } = doll.worn;
      return { ...doll, worn: { ...rest, overskirt: "pumpkin_suit" } };
    }),
  }),
};

export function loadDolls(storage, clothes = {}) {
  const raw = storage.getItem(DOLLS_KEY);
  if (!raw) return { dolls: [], selected: null };
  let saved = JSON.parse(raw);
  while (saved.version < VERSION) saved = MIGRATIONS[saved.version](saved, clothes);
  if (saved.version > VERSION) throw new Error("這份娃娃存檔比遊戲還新，請重新整理拿最新版。");
  return { dolls: saved.dolls, selected: saved.selected };
}

/** 娃娃存檔存出去的樣子：瀏覽器裡的存檔和存檔備份共用，標上目前的格式版本，讀回來才知道要不要升級。 */
export function dollsRecord({ dolls, selected }) {
  return { version: VERSION, dolls, selected };
}

export function saveDolls(storage, save) {
  storage.setItem(DOLLS_KEY, JSON.stringify(dollsRecord(save)));
}
