// 存檔備份：換裝置或備份用。一份存檔裝遊戲存檔與娃娃存檔，匯出的檔案和存到雲端的是同一份。

import { dollsRecord, loadDolls } from "./dolls.js";

export const APP = "tsunu-dollhouse";
const VERSION = 2;
const FIRST_FILE_DOLLS_VERSION = 5;   // 第 1 版存檔把娃娃存檔一律標成第 1 版，裡面其實是當時第 5 版的格式

export function saveData(game, dollsSave) {
  return { app: APP, version: VERSION, savedAt: new Date().toISOString(), game: game.state, dolls: dollsRecord(dollsSave) };
}

export function exportSave(game, dollsSave) {
  const blob = new Blob([JSON.stringify(saveData(game, dollsSave))], { type: "application/json" });
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `dollhouse-${new Date().toISOString().slice(0, 10)}.json` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** 檢查一份存檔；通過才回傳 { game, dolls }，由呼叫端覆蓋。遊戲存檔交給 game.replace 升級格式；
 *  娃娃存檔照它自己的版本升級，clothes 是衣服清單（舊格式照大類放格子要用）。 */
export function checkSave(data, clothes = {}) {
  if (data?.app !== APP) throw new Error("這不是娃娃屋的存檔。");
  if (data.version > VERSION) throw new Error("這份存檔比遊戲還新，請重新整理拿最新版。");
  const record = data.version === 1 ? { ...data.dolls, version: FIRST_FILE_DOLLS_VERSION } : data.dolls;
  const dolls = loadDolls({ getItem: () => JSON.stringify(record) }, clothes);
  if (!dolls.dolls.length) throw new Error("存檔裡沒有娃娃。");
  return { game: data.game, dolls };
}

export async function readSave(file, clothes) {
  return checkSave(JSON.parse(await file.text()), clothes);
}
