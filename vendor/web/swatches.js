// 挑顏色的小元件：一排色票＋自訂顏色（色票是常用顏色的快捷，最後一顆打開顏色選擇器，可以挑任何顏色，存成 #rrggbb）、衣服染法的小色塊、花紋列。
// 小屋衣櫃、小屋訪客捏角、兒童版捏娃娃共用。

/** colors：色票；current：現在的顏色（不在色票裡就是自訂的，自訂那顆標成選到）；onPick(color)；disabled：這款不能換色時整排停用。 */
export function swatchRow(colors, current, onPick, disabled = false) {
  const row = document.createElement("div");
  row.className = "swatches";
  row.append(...colors.map((color) => {
    const button = Object.assign(document.createElement("button"), { type: "button", title: color, disabled, className: color === current ? "on" : "", onclick: () => onPick(color) });
    button.style.background = color;
    return button;
  }));
  const custom = Boolean(current) && !colors.includes(current);
  const picker = Object.assign(document.createElement("input"), {
    type: "color", title: "自訂顏色", disabled, className: `custom-color${custom ? " on" : ""}`,
    value: /^#[0-9a-f]{6}$/i.test(current ?? "") ? current : "#888888",
  });
  picker.addEventListener("change", () => onPick(picker.value.toLowerCase()));   // 關掉選擇器才換：拖著選的時候畫面重畫會把選擇器關掉
  row.append(picker);
  return row;
}

/** 家具布面與衣服的常用色票（屋主頁、訪客頁共用）。 */
export const PALETTE = ["#e3d5bf", "#f4f1ea", "#b9b9b9", "#3a3a3a", "#f3dfa2", "#c8925b", "#d9a3a3", "#c6b8dc", "#b9cdb0", "#a9c1d9", "#4a5a7a"];

/** 一排顏色：current 那個亮著，點了呼叫 onPick(color)；第一顆「原色」送 null（reset 是 false 就不放，花紋色那排用）。 */
export function paletteRow(title, current, onPick, { reset = true } = {}) {
  const label = Object.assign(document.createElement("span"), { textContent: title });
  const resetButton = Object.assign(document.createElement("button"), { type: "button", className: "reset quiet", textContent: "原色", onclick: () => onPick(null) });
  const swatches = PALETTE.map((color) => Object.assign(document.createElement("button"), {
    type: "button", className: "color" + (current === color ? " on" : ""), title: color, style: `background:${color}`, onclick: () => onPick(color),
  }));
  return [label, ...(reset ? [resetButton] : []), ...swatches];
}

/** 染法的小色塊：素色是一塊顏色，花紋畫小預覽（paint 是 spike_player/patterns.js 的 paintSwatch）。衣服小卡、花紋列共用。
 *  畫布比畫面上的尺寸（14～24 px）大，手機高解析度螢幕上花紋才不糊。 */
export function dyeSwatch(dye, paint, size = 28) {
  const canvas = Object.assign(document.createElement("canvas"), { width: size, height: size, className: "swatch" });
  return paint(canvas, dye);
}

/** 花紋列：素色＋各種花紋（patterns：[{ id, label }]）；previewOf(id) 回傳那一顆的小預覽；current 是現在的花紋（素色是 null）；onPick(id 或 null)。 */
export function patternRow(patterns, current, previewOf, onPick) {
  const row = document.createElement("div");
  row.className = "swatches patterns";
  row.append(...[{ id: null, label: "素色" }, ...patterns].map(({ id, label }) => {
    const button = Object.assign(document.createElement("button"), { type: "button", title: label, ariaLabel: label, className: id === current ? "on" : "", onclick: () => onPick(id) });
    button.append(previewOf(id));
    return button;
  }));
  return row;
}
