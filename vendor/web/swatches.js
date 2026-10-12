// 一排色票＋自訂顏色：色票是常用顏色的快捷，最後一顆打開顏色選擇器，可以挑任何顏色（存成 #rrggbb）。
// 小屋訪客捏角、兒童版捏娃娃共用。

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
