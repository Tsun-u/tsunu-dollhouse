// 小屋娃娃屋：把小屋匯出的規則、畫面、素材接起來，加上最多四個自己捏的娃娃。
// 遊戲存檔（錢、材料、家具、咖啡廳）交給 game.js，娃娃存檔交給 dolls.js，兩份都在這台瀏覽器。

import { loadSkeleton, samplePose } from "../vendor/player/player.js";
import { BODIES, CLOTHES_COLORS, headParts, randomLooks } from "../vendor/rules/looks.js";
import { CafeView } from "../vendor/web/cafe-view.js";
import { CATEGORY_SLOT, SLOT_LABEL, dressUp } from "../vendor/web/dress.js";
import { IconSheet } from "../vendor/web/icons.js";
import { PuzzleView } from "../vendor/web/puzzle-view.js";
import { WorkshopView } from "../vendor/web/workshop-view.js";
import { startCafeClock } from "./cafe-clock.js";
import { setupCreator } from "./creator.js";
import { addDoll, loadDolls, randomShopkeeper, removeDoll, saveDolls, updateDoll } from "./dolls.js";
import { createGame, loadContent } from "./game.js";
import { House } from "./house.js";
import { downloadSave, uploadSave } from "./drive-save.js";
import { checkSave, exportSave, readSave, saveData } from "./save-file.js";

const $ = (id) => document.getElementById(id);

/** 存不進瀏覽器（私密視窗）時退回只存在記憶體：能玩，關掉就沒了。 */
function browserStorage() {
  try {
    localStorage.setItem("dollhouse.probe", "1");
    return localStorage;
  } catch {
    const map = new Map();
    return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)) };
  }
}

const pack = await (await fetch("vendor/pack.json", { cache: "no-store" })).json();
const bust = `?v=${pack.source}`;   // 小屋匯出新版時網址跟著變，瀏覽器不會拿到舊的
const content = await loadContent(async (name) => (await fetch(`vendor/content/${name}.json${bust}`)).json());
const animations = await (await fetch(`vendor/player/animations.json${bust}`)).json();
const skeletonNames = [...new Set(Object.values(BODIES).flatMap((body) => Object.values(body.views)))];
const skeletons = Object.fromEntries(await Promise.all(skeletonNames.map(async (name) => [name, await loadSkeleton(`vendor/player/skeleton_${name}.json${bust}`, "vendor/player/assets/", bust)])));

const storage = browserStorage();
const game = createGame(content, storage);
let dollsSave = loadDolls(storage, content.clothes);

function apply(action) {
  try { game.apply(action); } catch (error) { flash(error.message); }
}

function flash(message) {
  $("dollsInfo").textContent = message;
  $("shopMoney").textContent = message;
}

function setDolls(next) {
  dollsSave = next;
  saveDolls(storage, dollsSave);
  renderAll();
}

const house = new House({
  game, content, skeletons, animations, samplePose, dressUp,
  dolls: () => dollsSave,
  updateDoll: (id, changes) => setDolls({ ...dollsSave, dolls: updateDoll(dollsSave.dolls, id, changes) }),
  select: (id) => setDolls({ ...dollsSave, selected: id }),
  apply,
});

const icons = new IconSheet(content.recipes, () => renderAll());
const puzzle = new PuzzleView($("board"), $("puzzleInfo"), $("puzzleStart"), icons, apply, content.settings.stamina);
const workshop = new WorkshopView({ materials: $("materials"), grid: $("grid"), products: $("products") }, content.recipes, icons, apply);
const guests = Object.entries(BODIES).map(([body, spec]) => ({ body, views: { front: skeletons[spec.views.front], front34: skeletons[spec.views.front34], back34: skeletons[spec.views.back34] } }));
const cafe = new CafeView($("cafeCanvas"), { skeleton: skeletons.front, guests, looks: { headParts, randomLooks }, animations, samplePose }, icons, apply);
$("cafeToggle").onclick = () => apply({ kind: "shop_open", open: !game.state.shops.cafe.open });
startCafeClock(game, apply);

/** 分頁：切到咖啡廳時從娃娃裡隨機抽一位顧店。 */
for (const tabButton of $("tabs").children) {
  tabButton.onclick = () => {
    for (const b of $("tabs").children) b.classList.toggle("on", b === tabButton);
    for (const tab of document.querySelectorAll(".tab")) tab.classList.toggle("on", tab.id === tabButton.dataset.tab);
    if (tabButton.dataset.tab === "cafe") pickShopkeeper();
    fitScenes();
    if (tabButton.dataset.tab === "home") house.room.draw();
  };
}

function showTab(id) {
  [...$("tabs").children].find((b) => b.dataset.tab === id)?.click();
}

function pickShopkeeper() {
  const doll = randomShopkeeper(dollsSave.dolls);
  if (!doll) return;
  const body = BODIES[doll.body];
  const who = { name: body.sprites, skeletons: { front: skeletons[body.views.front], front34: skeletons[body.views.front34], back34: skeletons[body.views.back34] }, headParts: headParts(doll) };
  const { outfits, bodyTint } = dressUp(who, doll.worn, content.clothes, doll.colors);
  cafe.owner = { skeleton: skeletons[body.views.front], skin: doll.skin, outfits, bodyTint };
  $("cafeInfo").dataset.keeper = doll.name;
  renderCafe();
}

/** 場景畫面比清單寬：最寬 SCENE_MAX_W，房間另外要整間放得進視窗高度（沿用小屋的做法）。 */
const SCENE_MAX_W = 1400, SCENE_GUTTER = 16, ROOM_V_MARGIN = 24;
function fitScenes() {
  const available = Math.min(SCENE_MAX_W, window.innerWidth - SCENE_GUTTER * 2);
  for (const canvas of [$("room"), $("cafeCanvas")]) {
    const parentWidth = canvas.parentElement.clientWidth;
    if (!parentWidth) continue;
    const [w, h] = (canvas.style.aspectRatio || "2 / 1").split("/").map(Number);
    const byHeight = canvas.id === "room" ? Math.max(320, window.innerHeight - ROOM_V_MARGIN) * w / h : Infinity;
    const width = Math.max(parentWidth, Math.min(available, byHeight));
    canvas.style.width = `${Math.round(width)}px`;
    canvas.style.marginLeft = `${Math.round((parentWidth - width) / 2)}px`;
  }
}
window.addEventListener("resize", fitScenes);

// ───────── 家具店 ─────────

function renderShop() {
  const { state } = game;
  $("shopMoney").textContent = `錢：$${state.money}。買到的家具進倉庫。`;
  const chip = (html, disabled, onclick) => Object.assign(document.createElement("button"), { className: "item", innerHTML: html, disabled, onclick });
  const swatch = (color) => `<span class="swatch" style="background:${color}"></span>`;
  $("shopList").replaceChildren(...Object.entries(content.furniture).map(([item, spec]) =>
    chip(`${swatch(spec.color)}${spec.label}<span class="price">$${spec.price}</span>`, state.money < spec.price, () => apply({ kind: "buy", item }))));
  const unbuilt = Object.entries(content.rooms).filter(([id]) => !state.rooms[id]);
  $("buildList").replaceChildren(...unbuilt.map(([id, spec]) =>
    chip(`蓋${spec.label}（${spec.width}×${spec.depth}）<span class="price">$${spec.price}</span>`, state.money < spec.price, () => apply({ kind: "build_room", room: id }))));
  if (!unbuilt.length) $("buildList").textContent = "能蓋的房間都蓋好了。";
  $("clothesShop").replaceChildren(...Object.entries(content.clothes).map(([item, spec]) =>
    chip(`${swatch(spec.color)}${spec.label}<span class="price">$${spec.price}</span>`, state.money < spec.price, () => apply({ kind: "buy_clothes", item }))));
  $("resaleList").replaceChildren(...Object.entries(state.inventory).map(([item, count]) => {
    const spec = content.furniture[item];
    return chip(`${swatch(spec.color)}${spec.label}<span class="count">×${count}</span><span class="price">$${Math.floor(spec.price / 2)}</span>`, false, () => apply({ kind: "sell_furniture", item }));
  }));
  if (!$("resaleList").children.length) $("resaleList").textContent = "倉庫是空的。";
}

// ───────── 咖啡廳 ─────────

function renderCafe() {
  const { state } = game;
  const cafe = state.shops.cafe;
  const waiting = cafe.customers.length;
  const keeper = $("cafeInfo").dataset.keeper ? `今天${$("cafeInfo").dataset.keeper}顧店。` : "";
  $("cafeInfo").textContent = keeper + (cafe.open ? (waiting ? `${waiting} 位客人在等，累計服務 ${cafe.served} 人` : `店開著，等客人上門（累計服務 ${cafe.served} 人）`) : "打烊中");
  $("cafeToggle").textContent = cafe.open ? "打烊" : "開門";
  $("cafeProducts").replaceChildren(...Object.entries(state.products).map(([chain, count]) => {
    const recipe = content.recipes[chain];
    const chip = Object.assign(document.createElement("span"), { className: "item" });
    const icon = Object.assign(document.createElement("span"), { className: "icon" });
    icons.apply(icon, chain, (recipe?.tiers.length ?? 1) - 1);
    chip.append(icon, `${recipe?.tiers.at(-1) ?? chain} ×${count}`);
    return chip;
  }));
  if (!$("cafeProducts").children.length) $("cafeProducts").textContent = "櫃台空空的，去工坊做點東西。";
}

// ───────── 衣櫃：幫娃娃換衣服（衣服從遊戲存檔的衣櫃挑，穿在娃娃存檔） ─────────

let closetWho = null;

function renderCloset() {
  const dolls = dollsSave.dolls;
  if (!dolls.some((doll) => doll.id === closetWho)) closetWho = dollsSave.selected ?? dolls[0]?.id ?? null;
  $("closetWho").replaceChildren(...dolls.map((doll) => {
    const chip = Object.assign(document.createElement("button"), { className: "item" + (doll.id === closetWho ? " on" : ""), textContent: doll.name });
    chip.onclick = () => { closetWho = doll.id; renderCloset(); };
    return chip;
  }));
  const doll = dolls.find((d) => d.id === closetWho);
  if (!doll) return;
  const change = (changes) => setDolls({ ...dollsSave, dolls: updateDoll(dollsSave.dolls, doll.id, changes) });
  const starter = Object.values(BODIES[doll.body].starter);   // 基本款每個娃娃都有
  const wearable = (item) => content.clothes[item] && (!content.clothes[item].wearers || content.clothes[item].wearers.includes(BODIES[doll.body].sprites));   // 男生、女生素體各有各的衣服
  const items = [...new Set([...starter, ...Object.keys(game.state.wardrobe)])].filter(wearable);
  const colorOf = (item) => doll.colors?.[item] ?? content.clothes[item].color;
  // 照格子由內到外分組，每格一行標題；點了穿上，已經穿著的再點一次是脫掉那一格；穿著的那件下面一排色票換顏色
  $("wardrobe").replaceChildren(...Object.keys(SLOT_LABEL).flatMap((slot) => {
    const inSlot = items.filter((item) => CATEGORY_SLOT[content.clothes[item].category] === slot);
    if (!inSlot.length) return [];
    const title = Object.assign(document.createElement("div"), { className: "wardrobe-slot", textContent: SLOT_LABEL[slot] });
    const chips = inSlot.map((item) => {
      const on = doll.worn[slot] === item;
      const chip = Object.assign(document.createElement("button"), { className: "item" + (on ? " on" : "") });
      chip.innerHTML = `<span class="swatch" style="background:${colorOf(item)}"></span>${content.clothes[item].label}`;
      chip.onclick = () => { const { [slot]: _, ...rest } = doll.worn; change({ worn: on ? rest : { ...doll.worn, [slot]: item } }); };
      return chip;
    });
    const wearing = doll.worn[slot];
    const spec = content.clothes[wearing];
    const dyeable = spec && (spec.dye || !spec.sprites?.[BODIES[doll.body].sprites]);   // 彩色原稿（牛仔短褲）不給換色；灰稿與用模板畫的才行
    if (!inSlot.includes(wearing) || !dyeable) return [title, ...chips];
    const palette = Object.assign(document.createElement("div"), { className: "swatches wardrobe-colors" });
    palette.append(...CLOTHES_COLORS.map((color) => {
      const button = Object.assign(document.createElement("button"), { title: color, onclick: () => change({ colors: { ...doll.colors, [wearing]: color } }) });
      button.style.background = color;
      if (colorOf(wearing) === color) button.classList.add("on");
      return button;
    }));
    return [title, ...chips, palette];
  }));
}

function drawCloset(time) {
  const canvas = $("closetCanvas");
  const rect = canvas.getBoundingClientRect();
  const doll = dollsSave.dolls.find((d) => d.id === closetWho);
  if (!rect.width || !doll) return;
  const ratio = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * ratio), h = Math.round(rect.height * ratio);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const body = BODIES[doll.body];
  const skeleton = skeletons[body.views.front];
  const who = { name: body.sprites, skeletons: { front: skeleton, front34: skeletons[body.views.front34], back34: skeletons[body.views.back34] }, headParts: headParts(doll) };
  const { outfits, bodyTint } = dressUp(who, doll.worn, content.clothes, doll.colors);
  const scale = (rect.height * 0.92) / skeleton.data.canvas.h;
  skeleton.draw(ctx, samplePose(animations.idle, time, "front"), { x: rect.width / 2 - (skeleton.data.canvas.w * scale) / 2, y: rect.height * 0.04, scale, outfits, skin: doll.skin, bodyTint });
}
(function closetLoop(now) {
  if ($("closet").classList.contains("on")) drawCloset(now / 1000);
  requestAnimationFrame(closetLoop);
})(performance.now());

// ───────── 娃娃分頁 ─────────

const creator = setupCreator({
  skeletons, animations, samplePose, clothes: content.clothes, dressUp,
  onSave: (doll, isNew) => {
    try {
      const placed = isNew ? { ...doll, spot: house.freeSpotNear(doll.spot) } : doll;   // 新娃娃出生時避開已經有人站的格子
      setDolls(isNew
        ? { dolls: addDoll(dollsSave.dolls, placed), selected: dollsSave.selected ?? doll.id }
        : { ...dollsSave, dolls: updateDoll(dollsSave.dolls, doll.id, doll) });
      if (dollsSave.dolls.length === 1 && isNew) showTab("home");
    } catch (error) { flash(error.message); }
  },
});

function renderDolls() {
  const { dolls, selected } = dollsSave;
  $("dollsInfo").textContent = `娃娃 ${dolls.length}／4`;
  $("addDoll").disabled = dolls.length >= 4;
  $("dollList").replaceChildren(...dolls.map((doll) => {
    const card = Object.assign(document.createElement("div"), { className: "doll-card" + (doll.id === selected ? " on" : "") });
    const actions = Object.assign(document.createElement("div"), { className: "row" });
    const small = (label, onclick, disabled = false) => Object.assign(document.createElement("button"), { textContent: label, onclick, disabled });
    actions.append(
      small(doll.id === selected ? "操作中" : "選她", () => setDolls({ ...dollsSave, selected: doll.id }), doll.id === selected),
      small("修改", () => creator.open(doll)),
      small("刪掉", () => { try { setDolls({ dolls: removeDoll(dolls, doll.id), selected: selected === doll.id ? dolls.find((d) => d.id !== doll.id).id : selected }); } catch (error) { flash(error.message); } }, dolls.length <= 1),
    );
    card.append(Object.assign(document.createElement("strong"), { textContent: doll.name }), actions);
    return card;
  }));
}
$("addDoll").onclick = () => creator.open(null);

function restoreSave(saved) {
  game.replace(saved.game);
  setDolls(saved.dolls);
  $("saveInfo").textContent = "讀回來了。";
}

$("exportSave").onclick = () => exportSave(game, dollsSave);
$("importSave").onchange = async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try { restoreSave(await readSave(file, content.clothes)); } catch (error) { $("saveInfo").textContent = `讀不進來：${error.message}`; }
};
$("cloudSave").onclick = async () => {
  $("saveInfo").textContent = "存到雲端中…";
  try {
    await uploadSave(saveData(game, dollsSave));
    $("saveInfo").textContent = "存到雲端了。";
  } catch (error) { $("saveInfo").textContent = `沒存成功：${error.message}`; }
};
$("cloudLoad").onclick = async () => {
  if (!confirm("從雲端取回會蓋掉現在的進度，要取回嗎？")) return;
  $("saveInfo").textContent = "從雲端取回中…";
  try {
    const data = await downloadSave();
    if (!data) { $("saveInfo").textContent = "雲端還沒有存檔。"; return; }
    restoreSave(checkSave(data, content.clothes));
  } catch (error) { $("saveInfo").textContent = `讀不進來：${error.message}`; }
};

// ───────── 全部重畫 ─────────

function renderStatus() {
  const doll = dollsSave.dolls.find((d) => d.id === dollsSave.selected) ?? dollsSave.dolls[0];
  $("money").textContent = `$${game.state.money}`;
  $("currentDoll").textContent = doll ? `正在操作：${doll.name}` : "";
  $("currentDoll").onclick = () => showTab("dolls");
}

function renderAll() {
  house.render();
  puzzle.setState(game.state);
  workshop.setState(game.state);
  cafe.setState(game.state);
  renderCafe();
  renderShop();
  renderCloset();
  renderDolls();
  renderStatus();
  fitScenes();
}

game.subscribe(() => renderAll());
renderAll();
if (!dollsSave.dolls.length) { showTab("dolls"); creator.open(null, { first: true }); }
$("loading").classList.add("done");

window.__dollhouse = { game, get dolls() { return dollsSave; }, house };   // 開發時從主控台看狀態
