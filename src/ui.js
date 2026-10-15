// 不識字也看得懂的介面零件：手繪 SVG 圖示、錢幣價錢、「先點選中、再點勾勾」的兩步確認。

const INK = "#3b2f2a";

/** 24×24 的圖示，扁平上色加深色描邊，小朋友看形狀和顏色就認得。 */
const ICONS = {
  home: `<path d="M2.5 11.5 12 3.5l9.5 8z" fill="#e07a5f"/><rect x="5" y="11" width="14" height="10" rx="1" fill="#f6d9a8"/><rect x="10" y="14.5" width="4" height="6.5" rx="1" fill="#a0673c"/><path d="M2.5 11.5 12 3.5l9.5 8M5 11v10h14V11"/>`,
  puzzle: `<rect x="3" y="3" width="8" height="8" rx="2.5" fill="#ef6f6c"/><rect x="13" y="3" width="8" height="8" rx="2.5" fill="#5fa8e8"/><rect x="3" y="13" width="8" height="8" rx="2.5" fill="#7cc576"/><rect x="13" y="13" width="8" height="8" rx="2.5" fill="#f4c542"/><path d="M5 5.5h2M15 5.5h2M5 15.5h2M15 15.5h2" stroke="#fff"/>`,
  workshop: `<path d="M15.5 2.5 12.5 11" stroke-width="1.8"/><ellipse cx="15.6" cy="4.2" rx="1.6" ry="2.6" transform="rotate(20 15.6 4.2)" fill="#fff"/><path d="M3 11.5h18a9 8 0 0 1-18 0z" fill="#f2c46d"/><path d="M6 21h12"/>`,
  closet: `<path d="M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3c-.6 1.6-2.1 2.6-4 2.6S8.6 4.6 8 3z" fill="#8ecae6"/>`,
  street: `<rect x="4" y="10" width="16" height="11" fill="#f6d9a8"/><path d="M3 5h18l-1 5H4z" fill="#fff"/><path d="M6.5 5 6 10M11 5v5M15.5 5l.5 5" stroke="#e07a5f" stroke-width="2.4"/><path d="M3 5h18l-1 5H4zM4 10v11h16V10"/><rect x="7" y="13" width="5" height="4" fill="#bfe3f0"/><rect x="14" y="13" width="3.5" height="8" fill="#a0673c"/>`,
  shop: `<path d="M5 8h14l-1 13H6z" fill="#f4a6c0"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/><path d="M12 17.5s-2.6-1.5-2.6-3.2a1.4 1.4 0 0 1 2.6-.7 1.4 1.4 0 0 1 2.6.7c0 1.7-2.6 3.2-2.6 3.2z" fill="#fff"/>`,
  dolls: `<circle cx="12" cy="13" r="7.5" fill="#f7d7c0"/><path d="M4.5 12.5a7.5 7.5 0 0 1 15 0c-2-.2-4.5-1.6-5.5-3.3-1.5 2-5 3.3-9.5 3.3z" fill="#8a5a3b"/><circle cx="9.3" cy="14.2" r=".9" fill="${INK}" stroke="none"/><circle cx="14.7" cy="14.2" r=".9" fill="${INK}" stroke="none"/><circle cx="8" cy="16.5" r="1.2" fill="#f4a6a6" stroke="none"/><circle cx="16" cy="16.5" r="1.2" fill="#f4a6a6" stroke="none"/>`,
  coin: `<circle cx="12" cy="12" r="9" fill="#f4c542" stroke="#b8862b"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#fff3c4" stroke-width="1.6"/>`,
  check: `<circle cx="12" cy="12" r="10" fill="#4caf6e" stroke="none"/><path d="m7 12.5 3.2 3.2L17 9" stroke="#fff" stroke-width="2.6"/>`,
  cross: `<circle cx="12" cy="12" r="10" fill="#b9ada1" stroke="none"/><path d="m8.5 8.5 7 7m0-7-7 7" stroke="#fff" stroke-width="2.6"/>`,
  bin: `<circle cx="12" cy="12" r="10" fill="#d8ccbf" stroke="none"/><path d="M7.5 8.5h9M10 8.5V7h4v1.5M8.8 8.5l.7 8.5h5l.7-8.5" stroke="#fff" stroke-width="1.8" fill="none"/>`,
  trash: `<circle cx="12" cy="12" r="10" fill="#e05a4f" stroke="none"/><path d="M7.5 8.5h9M10 8.5V7h4v1.5M8.8 8.5l.7 8.5h5l.7-8.5" stroke="#fff" stroke-width="1.8" fill="none"/>`,
  undo: `<circle cx="12" cy="12" r="10" fill="#5fa8e8" stroke="none"/><path d="M9 7.5 5.8 10.6 9 13.7" stroke="#fff" stroke-width="2.2" fill="none"/><path d="M6.2 10.6h6.6a3.6 3.6 0 0 1 0 7.2H10" stroke="#fff" stroke-width="2.2" fill="none"/>`,
  pencil: `<path d="m15 4 5 5L9 20H4v-5z" fill="#f4c542"/><path d="m13 6 5 5"/><path d="M4 15v5h5" fill="#f7d7c0"/>`,
  plus: `<circle cx="12" cy="12" r="10" fill="#4caf6e" stroke="none"/><path d="M12 7v10M7 12h10" stroke="#fff" stroke-width="2.6"/>`,
  rotate: `<path d="M19 12a7 7 0 1 1-2.1-5" fill="none" stroke-width="2.2"/><path d="M17.5 2.5v4.5H13" fill="none" stroke-width="2.2"/>`,
  box: `<path d="M3.5 8 12 4l8.5 4v9L12 21l-8.5-4z" fill="#d9a066"/><path d="M3.5 8 12 12l8.5-4M12 12v9"/>`,
  sofa: `<path d="M5 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4H5z" fill="#e8a3a3"/><path d="M2.5 11a1.8 1.8 0 0 1 3.5 0v1.5h12V11a1.8 1.8 0 0 1 3.5 0v7h-19z" fill="#d98a8a"/><path d="M4.5 18v2.5M19.5 18v2.5"/>`,
  build: `<path d="M3 11 11 4l8 7" fill="#e07a5f"/><rect x="5" y="10.5" width="12" height="9.5" fill="#f6d9a8"/><path d="M3 11 11 4l8 7M5 10.5V20h12v-9.5"/><circle cx="18" cy="18" r="4.5" fill="#4caf6e" stroke="none"/><path d="M18 15.6v4.8M15.6 18h4.8" stroke="#fff" stroke-width="1.8"/>`,
  floor: `<path d="M12 6 22 12l-10 6L2 12z" fill="#e3cfb0"/><path d="M7 9l10 6M17 9 7 15"/><path d="M12 6 22 12l-10 6L2 12z" fill="none"/>`,
  wall: `<rect x="3" y="3" width="18" height="18" rx="1" fill="#e4e6d6"/><path d="M8 3v18M13 3v18M18 3v18" stroke="#bfd0b3" stroke-width="2.2"/><rect x="3" y="3" width="18" height="18" rx="1" fill="none"/>`,
  sell: `<path d="M3 17.5c3-.6 5-2.2 7.5-2.2h5a1.5 1.5 0 0 1 0 3H12M3 21h10.5l6.5-3.6a1.6 1.6 0 0 0-1.7-2.7L15.5 16" fill="#f7d7c0"/><circle cx="14" cy="7" r="4.5" fill="#f4c542" stroke="#b8862b"/><circle cx="14" cy="7" r="2.4" fill="none" stroke="#fff3c4" stroke-width="1.2"/>`,
  sun: `<circle cx="12" cy="12" r="4.5" fill="#f4c542"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="#e0a326" stroke-width="2"/>`,
  moon: `<path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.6A7 7 0 0 1 15.5 3.5z" fill="#ffe08a"/><path d="M6 6.5h.01M9 3.5h.01" stroke-width="2.4"/>`,
  dice: `<rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="#fff"/><circle cx="8.5" cy="8.5" r="1.5" fill="#e05a4f" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="#e05a4f" stroke="none"/><circle cx="15.5" cy="15.5" r="1.5" fill="#e05a4f" stroke="none"/>`,
  brush:`<path d="m14 3 7 7-6 1-2-2z" fill="#c98a4a"/><path d="M13 9c-3 0-4.5 2-4.5 4.5C8.5 17 6 18 3 18c2 2.5 6 3.2 8.8 1.5 2.6-1.6 3.2-4.5 3.2-6.5" fill="#7cc576"/>`,
};

/** 一顆圖示（span 包 svg），大小用 CSS 控制；label 給讀螢幕軟體和滑鼠停留的大人看。 */
export function icon(name, label = "") {
  const span = document.createElement("span");
  span.className = `ico ico-${name}`;
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  if (label) span.title = label;
  return span;
}

/** 價錢：一枚金幣加數字。 */
export function price(amount) {
  const span = document.createElement("span");
  span.className = "price";
  span.append(icon("coin"), String(amount));
  return span;
}

/** 只有圖示的按鈕；label 是滑鼠停留提示與 aria-label。 */
export function iconButton(name, label, onclick, className = "") {
  const button = Object.assign(document.createElement("button"), { className: `icon-btn ${className}`.trim(), onclick, type: "button" });
  button.setAttribute("aria-label", label);
  button.title = label;
  button.append(icon(name));
  return button;
}

// ───────── 兩步確認：買、賣、刪先點一下選中（亮框＋冒出勾勾或垃圾桶），再點一次才算數 ─────────
// 畫面常整片重畫（店的時鐘每秒更新），所以「選中哪一個」記成字串 key，重畫時照 key 還原。

let armedKey = null;
let rerender = () => {};

export function onConfirmChange(callback) { rerender = callback; }

/** 把 element 變成要確認的按鈕：kind 是 "go"（買、賣：綠勾勾）或 "delete"（刪：紅垃圾桶）。 */
export function confirmable(element, key, kind, onConfirm) {
  element.classList.add("confirmable", `confirm-${kind}`);
  if (armedKey === key) arm(element, kind);
  element.onclick = (event) => {
    event.stopPropagation();
    if (armedKey === key) { armedKey = null; onConfirm(); rerender(); return; }
    disarmAll();
    armedKey = key;
    arm(element, kind);
  };
  return element;
}

function arm(element, kind) {
  element.classList.add("armed");
  if (!element.querySelector(":scope > .confirm-badge")) {
    const badge = icon(kind === "delete" ? "trash" : "check");
    badge.classList.add("confirm-badge");
    element.append(badge);
  }
}

function disarmAll() {
  for (const element of document.querySelectorAll(".confirmable.armed")) {
    element.classList.remove("armed");
    element.querySelector(":scope > .confirm-badge")?.remove();
  }
}

// 點到別的地方就取消選中；只改這一顆的樣子、不整片重畫，才不會吃掉這次點擊
document.addEventListener("pointerdown", (event) => {
  if (armedKey && !event.target.closest?.(".confirmable.armed")) { armedKey = null; disarmAll(); }
}, true);
