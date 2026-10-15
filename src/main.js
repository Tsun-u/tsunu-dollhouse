// 小屋娃娃屋：把小屋匯出的規則、畫面、素材接起來，加上最多四個自己捏的娃娃。
// 遊戲存檔（錢、材料、家具、咖啡廳）交給 game.js，娃娃存檔交給 dolls.js，兩份都在這台瀏覽器。

import { paintSwatch } from "../vendor/player/patterns.js";
import { loadSkeleton, samplePose } from "../vendor/player/player.js";
import { BODIES, CLOTHES_COLORS, PATTERNS, dyeBase, dyePattern, headParts, randomDye, randomLooks, sameDye, withBase, withPattern, withPatternColor } from "../vendor/rules/looks.js";
import { SHOP_LABEL, SHOP_RENT } from "../vendor/rules/state.js";
import { CafeView } from "../vendor/web/cafe-view.js";
import { CATEGORY_SLOT, SLOT_LABEL, dressUp, dyeable } from "../vendor/web/dress.js";
import { IconSheet } from "../vendor/web/icons.js";
import { PuzzleView } from "../vendor/web/puzzle-view.js";
import { StreetView } from "../vendor/web/street-view.js";
import { dyeSwatch, patternRow } from "../vendor/web/swatches.js";
import { WorkshopView } from "../vendor/web/workshop-view.js";
import { startCafeClock } from "./cafe-clock.js";
import { setupCreator } from "./creator.js";
import { MAX_DOLLS, addDoll, loadDolls, randomShopkeeper, removeDoll, saveDolls, updateDoll } from "./dolls.js";
import { createGame, loadContent } from "./game.js";
import { House } from "./house.js";
import { downloadSave, uploadSave } from "./drive-save.js";
import { checkSave, exportSave, readSave, saveData } from "./save-file.js";
import { createThumbs, thumbImage, trimmedImage } from "./thumbs.js";
import { confirmable, icon, iconButton, onConfirmChange, price } from "./ui.js";

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

const thumbs = createThumbs({ skeletons, animations, samplePose, clothes: content.clothes, dressUp });
const storage = browserStorage();
const game = createGame(content, storage);
let dollsSave = loadDolls(storage, content.clothes);

/** 套用一個動作；doer 是做這件事的娃娃（{ name, spot }）。成功回傳這次新寫的那筆日誌（沒寫就 null），失敗跳提示、回 null。 */
function apply(action, doer) {
  const before = game.state.journal.at(-1);
  try {
    const entry = game.apply(action, doer).journal.at(-1);
    return entry !== before ? entry : null;
  } catch (error) { flash(error.message); return null; }
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
  icons: () => icons,
});

const icons = new IconSheet(content.recipes, () => renderAll());

/** 家常菜的圖（畫在房間的桌上）：第一次要用時才載，載好重畫房間。 */
const dishImages = new Map();
function dishImage(dish) {
  if (!dishImages.has(dish)) {
    const image = new Image();
    image.onload = () => house.room.draw();
    if (content.dishes[dish]?.image) image.src = content.dishes[dish].image;
    dishImages.set(dish, image);
  }
  return dishImages.get(dish);
}
house.room.drawTableIcon = (ctx, item, x, y, size) => {   // 桌上的商品、家常菜畫成縮圖；紙條沒有圖，交給房間畫小圓點
  if (item.kind === "product") { icons.drawIcon(ctx, item.chain, (content.recipes[item.chain]?.tiers.length ?? 1) - 1, x, y, size); return true; }
  const image = item.kind === "dish" ? dishImage(item.dish) : null;
  if (!image?.naturalWidth) return false;
  ctx.drawImage(image, x, y, size, size);
  return true;
};
const puzzle = new PuzzleView($("board"), $("puzzleInfo"), $("puzzleStart"), icons, apply, content.settings.stamina, () => $("puzzleShop").value || undefined);
const workshop = new WorkshopView({ materials: $("materials"), grid: $("grid"), products: $("products") }, content.recipes, icons, apply);
const guests = Object.entries(BODIES).map(([body, spec]) => ({ body, views: { front: skeletons[spec.views.front], front34: skeletons[spec.views.front34], back34: skeletons[spec.views.back34] } }));
const cafe = new CafeView($("cafeCanvas"), { skeleton: skeletons.front, guests, looks: { BODIES, CLOTHES_COLORS, headParts, randomLooks, randomDye }, clothes: content.clothes, dress: { dressUp, dyeable, CATEGORY_SLOT }, animations, samplePose }, icons, apply);
startCafeClock(game);

// ───────── 商店街：咖啡廳加上租來的雜貨店、服飾店（跟小屋一樣），每家店可以換裝潢 ─────────

let viewingShop = "cafe";   // 商店街上正在看哪家店
const street = new StreetView($("streetCanvas"), {
  onPick: (kind) => { viewingShop = kind; cafe.setShop(kind); $("rentPanel").hidden = true; decorSpot = null; renderCafe(); },
  onRent: (lot) => openRent(lot),
  onHome: () => showTab("home"),
});
$("cafeToggle").onclick = () => apply({ kind: "shop_open", open: !game.state.shops[viewingShop].open, shop: viewingShop });

/** 店內裝潢：點裝飾點的小刷子，列出三款風格（買過的「換上」、正在用的亮著）和原裝。 */
let decorSpot = null;
cafe.decor = content.decor;
cafe.onDecor = (spot) => { decorSpot = spot; renderDecorPanel(); };
function renderDecorPanel() {
  const { state } = game;
  const shop = state.shops[viewingShop];
  if (!decorSpot || !shop) { $("decorPanel").hidden = true; return; }
  const spec = content.decor.spots[decorSpot];
  const owned = shop.decor?.owned?.[decorSpot] ?? [];
  const chosen = shop.decor?.chosen?.[decorSpot] ?? null;
  const name = content.decor.shops[viewingShop]?.[decorSpot] ?? spec.label;
  $("decorPanelTitle").replaceChildren(icon("brush"), `${SHOP_LABEL[viewingShop]}的${name}`);
  const art = (theme) => (decorSpot === "hanging" ? `assets/decor/hanging_${theme}.png` : `assets/decor/${viewingShop}/${decorSpot}_${theme}.png`);
  // 用中的打勾、買過的點一下就換上、沒買過的要花錢（點兩下）；原裝是一張空白卡加復原圖示
  const original = itemCard(icon("undo"), "原裝", ...(chosen === null ? [usingMark()] : []));
  original.classList.toggle("on", chosen === null);
  original.disabled = chosen === null;
  original.onclick = () => apply({ kind: "set_decor", shop: viewingShop, spot: decorSpot, theme: null });
  $("decorChoices").replaceChildren(original, ...Object.entries(content.decor.themes).map(([theme, label]) => {
    if (theme === chosen) { const card = itemCard(art(theme), label, usingMark()); card.classList.add("on"); card.disabled = true; return card; }
    if (owned.includes(theme)) { const card = itemCard(art(theme), label); card.onclick = () => apply({ kind: "set_decor", shop: viewingShop, spot: decorSpot, theme }); return card; }
    return payCard(itemCard(art(theme), label, price(spec.price)), `decor:${viewingShop}:${decorSpot}:${theme}`, spec.price, () => apply({ kind: "buy_decor", shop: viewingShop, spot: decorSpot, theme }));
  }));
  $("decorPanel").hidden = false;
}

/** 點到沒租的店面：列出還沒開的店與租金。 */
function openRent(lot) {
  const { state } = game;
  const choices = Object.entries(SHOP_RENT).filter(([kind]) => !state.shops[kind]);
  $("rentTitle").replaceChildren(icon("street"), choices.length ? `開哪家店？` : "兩家店都開了。");
  $("rentChoices").replaceChildren(...choices.map(([kind, rent]) => payCard(itemCard(`assets/street/sign_${kind}.png`, SHOP_LABEL[kind], price(rent)), `rent:${lot}:${kind}`, rent, () => {
    $("rentPanel").hidden = true;
    if (apply({ kind: "rent_shop", lot, shop: kind })) { viewingShop = kind; cafe.setShop(kind); renderCafe(); }
  })));
  $("rentPanel").hidden = false;
}

/** 分頁按鈕：大圖示＋小字（字給大人看）。 */
const TAB_ICONS = { home: "home", puzzle: "puzzle", workshop: "workshop", closet: "closet", cafe: "street", shop: "shop", dolls: "dolls" };
for (const tabButton of $("tabs").children) {
  const label = tabButton.textContent;
  tabButton.setAttribute("aria-label", label);
  tabButton.replaceChildren(icon(TAB_ICONS[tabButton.dataset.tab]), Object.assign(document.createElement("span"), { className: "tab-label", textContent: label }));
}
for (const heading of document.querySelectorAll("h2.section[data-icon]")) heading.prepend(icon(heading.dataset.icon));
$("saveSummary").prepend(icon("box"));
$("flipBtn").append(icon("rotate"));
$("storeBtn").append(icon("box"));
$("rentCancel").replaceChildren(iconButton("cross", "先不要", () => { $("rentPanel").hidden = true; }));
$("decorClose").replaceChildren(iconButton("cross", "關閉", () => { decorSpot = null; $("decorPanel").hidden = true; }));

/** 分頁：切到咖啡廳時從娃娃裡隨機抽一位顧店；進衣櫃時從頭記「可以復原到哪一套」。 */
for (const tabButton of $("tabs").children) {
  const show = () => {
    for (const b of $("tabs").children) b.classList.toggle("on", b === tabButton);
    for (const tab of document.querySelectorAll(".tab")) tab.classList.toggle("on", tab.id === tabButton.dataset.tab);
    if (tabButton.dataset.tab === "cafe") pickShopkeeper();
    if (tabButton.dataset.tab === "closet") { closetOrigin = null; renderCloset(); }
    fitScenes();
    if (tabButton.dataset.tab === "home") house.room.draw();
  };
  tabButton.onclick = show;
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

/** 地板、壁紙的小樣：照目錄的花紋和顏色用 CSS 畫一塊。 */
function surfaceSample(spec) {
  const [a, b = a, c = b] = spec.colors;
  const accent = spec.accent ?? spec.line ?? b;
  const backgrounds = {
    checker: `repeating-conic-gradient(${a} 0 25%, ${b} 0 50%) 0 0 / 50% 50%`,
    planks: `repeating-linear-gradient(90deg, ${a} 0 30%, ${b} 30% 32%, ${c} 32% 64%, ${spec.line} 64% 66%)`,
    stripes: `repeating-linear-gradient(90deg, ${a} 0 22%, ${accent} 22% 34%)`,
    dots: `radial-gradient(${accent} 18%, transparent 20%) 0 0 / 33% 33%, ${a}`,
    wainscot: `linear-gradient(${a} 0 55%, ${accent} 55% 58%, ${b} 58%)`,
    baseboard: `linear-gradient(${a} 0 80%, ${accent} 80%)`,
  };
  const sample = Object.assign(document.createElement("span"), { className: "thumb surface" });
  sample.style.background = backgrounds[spec.pattern] ?? `linear-gradient(${a}, ${b})`;
  return sample;
}

/** 家具縮圖：裁掉透明邊的家具圖；目錄沒有圖的用它的代表色畫一塊。圖裁好時整頁合併成下一幀重畫一次。 */
let renderQueued = false;
const renderSoon = () => { if (!renderQueued) { renderQueued = true; requestAnimationFrame(() => { renderQueued = false; renderAll(); }); } };
function furnitureThumb(spec) {
  if (spec.image) return trimmedImage(spec.image, renderSoon);
  const block = Object.assign(document.createElement("span"), { className: "thumb surface" });
  block.style.background = spec.color;
  return block;
}

/** 卡片的狀態：買不起（灰淡）、用中（綠勾）、有幾個（角落數字）分開表示。 */
function badge(text) { return Object.assign(document.createElement("span"), { className: "count-badge", textContent: text }); }
function usingMark() { const mark = icon("check"); mark.classList.add("using-mark"); return mark; }

/** 要花錢（或賣掉）的卡：買不起就灰掉不能點，買得起要點兩下（選中、再點勾勾）。 */
function payCard(card, key, cost, onConfirm) {
  if (cost > game.state.money) { card.disabled = true; card.classList.add("poor"); return card; }
  return confirmable(card, key, "go", onConfirm);
}

/** 家具店的裝潢這間房：選取的娃娃所在那間房的地板與壁紙，使用中的打勾。 */
function renderRoomDecor() {
  const { state } = game;
  const here = state.rooms[house.roomId] ? house.roomId : "bedroom";
  const current = state.rooms[here];
  $("decorTitle").textContent = `${current.name}的地板`;
  const row = (kind, list, fallback) => Object.entries(list).map(([id, spec]) => {
    const using = (current[kind] ?? fallback) === id;
    const card = itemCard(surfaceSample(spec), spec.label, ...(using ? [usingMark()] : [price(spec.price)]));
    if (using) { card.classList.add("on"); card.disabled = true; return card; }
    return payCard(card, `${kind}:${here}:${id}`, spec.price, () => apply({ kind: "decorate_room", room: here, [kind]: id }));
  });
  $("floorList").replaceChildren(...row("floor", content.surfaces.floors, "tile"));
  $("wallList").replaceChildren(...row("wall", content.surfaces.walls, "plain"));
}

/** 蓋房間的小圖：屋子圖示加上房間的格數畫成小方格。 */
function roomSample(spec) {
  const box = Object.assign(document.createElement("span"), { className: "thumb room-sample" });
  const grid = Object.assign(document.createElement("span"), { className: "room-grid" });
  grid.style.gridTemplateColumns = `repeat(${spec.width}, 1fr)`;
  grid.style.aspectRatio = `${spec.width} / ${spec.depth}`;
  grid.append(...Array.from({ length: spec.width * spec.depth }, () => document.createElement("i")));
  box.append(icon("build"), grid);
  return box;
}

/** 選中的娃娃（家具店的衣服縮圖照她的素體畫）。 */
const shopperDoll = () => dollsSave.dolls.find((d) => d.id === dollsSave.selected) ?? dollsSave.dolls[0];

/** 衣櫃裡比穿著它的娃娃多的才能賣（基本款每個娃娃都有，不算）。 */
function sellableClothes() {
  const wearers = (item) => dollsSave.dolls.filter((d) => Object.values(d.worn).includes(item) && !Object.values(BODIES[d.body].starter).includes(item)).length;
  return Object.entries(game.state.wardrobe).filter(([item, count]) => content.clothes[item] && count > wearers(item));
}

function renderShop() {
  const { state } = game;
  $("shopMoney").replaceChildren();   // 錢已經在最上面，這行只留給錯誤訊息
  const doll = shopperDoll();
  $("shopList").replaceChildren(...Object.entries(content.furniture).map(([item, spec]) => {
    const card = itemCard(furnitureThumb(spec), spec.label, price(spec.price), ...(state.inventory[item] ? [badge(`×${state.inventory[item]}`)] : []));
    return payCard(card, `buy:${item}`, spec.price, () => apply({ kind: "buy", item }));
  }));
  $("clothesShop").replaceChildren(...(doll ? Object.entries(content.clothes).map(([item, spec]) => {
    const card = itemCard(thumbs.clothes(item, doll, spec.color), spec.label, price(spec.price), ...(state.wardrobe[item] ? [badge(`×${state.wardrobe[item]}`)] : []));
    return payCard(card, `buyc:${item}`, spec.price, () => apply({ kind: "buy_clothes", item }));
  }) : []));
  const unbuilt = Object.entries(content.rooms).filter(([id]) => !state.rooms[id]);
  $("buildList").replaceChildren(...unbuilt.map(([id, spec]) =>
    payCard(itemCard(roomSample(spec), spec.label, price(spec.price)), `build:${id}`, spec.price, () => apply({ kind: "build_room", room: id }))));
  $("buildList").previousElementSibling.hidden = $("buildList").hidden = !unbuilt.length;
  renderRoomDecor();
  const sellCard = (card, key, onConfirm) => { card.classList.add("selling"); return confirmable(card, key, "go", onConfirm); };
  $("resaleList").replaceChildren(
    ...Object.entries(state.inventory).map(([item, count]) => {
      const spec = content.furniture[item];
      return sellCard(itemCard(furnitureThumb(spec), spec.label, price(Math.floor(spec.price / 2)), badge(`×${count}`)), `sellf:${item}`, () => apply({ kind: "sell_furniture", item }));
    }),
    ...(doll ? sellableClothes().map(([item, count]) => {
      const spec = content.clothes[item];
      return sellCard(itemCard(thumbs.clothes(item, doll, spec.color), spec.label, price(Math.floor(spec.price / 2)), badge(`×${count}`)), `sellc:${item}`, () => apply({ kind: "sell_clothes", item }));
    }) : []),
  );
  $("resaleList").previousElementSibling.hidden = $("resaleList").hidden = !$("resaleList").children.length;
}

// ───────── 咖啡廳 ─────────

/** 正在看的那家店：客人、開關、這家店的商品（服飾店做好的衣服可以收進衣櫃）；街景、三消選店跟著更新。 */
function renderCafe() {
  const { state } = game;
  if (!state.shops[viewingShop]) { viewingShop = "cafe"; cafe.setShop("cafe"); }
  const shop = state.shops[viewingShop];
  const label = SHOP_LABEL[viewingShop];
  const waiting = shop.customers.length;
  const keeper = $("cafeInfo").dataset.keeper ? `今天${$("cafeInfo").dataset.keeper}顧店。` : "";
  $("cafeInfo").textContent = keeper + (shop.open ? (waiting ? `${label}：${waiting} 位客人在等，累計服務 ${shop.served} 人` : `${label}開著，等客人上門（累計服務 ${shop.served} 人）`) : `${label}打烊中`);
  $("cafeToggle").replaceChildren(icon(shop.open ? "moon" : "sun"));
  $("cafeToggle").className = `icon-btn big ${shop.open ? "closing" : "opening"}`;
  $("cafeToggle").title = shop.open ? "打烊" : "開門";
  $("cafeToggle").setAttribute("aria-label", $("cafeToggle").title);
  $("cafeProductsHint").textContent = viewingShop === "boutique" ? "櫃台上的衣服（點客人就賣出；想自己穿就收進衣櫃）" : "櫃台上的商品（點客人就出餐）";
  const mine = Object.entries(state.products).filter(([chain]) => (content.recipes[chain]?.shop ?? "cafe") === viewingShop);
  $("cafeProducts").replaceChildren(...mine.map(([chain, count]) => {
    const recipe = content.recipes[chain];
    const chip = Object.assign(document.createElement("span"), { className: "item" });
    const icon = Object.assign(document.createElement("span"), { className: "icon" });
    icons.apply(icon, chain, (recipe?.tiers.length ?? 1) - 1);
    chip.append(icon, `${recipe?.tiers.at(-1) ?? chain} ×${count}`);
    if (recipe?.clothes) chip.append(iconButton("closet", "收進衣櫃", () => apply({ kind: "keep_clothes", chain })));
    return chip;
  }));
  if (!mine.length) $("cafeProducts").textContent = "櫃台空空的，去工坊做點東西。";
  street.setState(state.shops, viewingShop);
  renderDecorPanel();
  const opened = Object.keys(state.shops);
  $("puzzleShop").hidden = opened.length < 2;
  const picked = $("puzzleShop").value;
  $("puzzleShop").replaceChildren(...opened.map((kind) => Object.assign(document.createElement("option"), { value: kind, textContent: `幫${SHOP_LABEL[kind]}備料`, selected: kind === picked })));
}

// ───────── 衣櫃：幫娃娃換衣服（衣服從遊戲存檔的衣櫃挑，穿在娃娃存檔） ─────────

let closetWho = null;
/** 進衣櫃（或換人）後第一次改衣服前的樣子（{ id, worn, colors }），↩ 復原回到這套；null 是還沒改過。 */
let closetOrigin = null;

/** 兩份「格子 → 衣服」或「衣服 → 染法」一樣；same 比兩個值（染法用 sameDye 比內容）。 */
const sameEntries = (a, b, same = (x, y) => x === y) => [...new Set([...Object.keys(a), ...Object.keys(b)])].every((key) => same(a[key], b[key]));

/** 點了就穿上：直接寫進娃娃，第一次改之前先記下原本那套。 */
function editCloset(doll, change) {
  const current = { worn: { ...doll.worn }, colors: { ...(doll.colors ?? {}) } };
  if (closetOrigin?.id !== doll.id) closetOrigin = { id: doll.id, ...current };
  setDolls({ ...dollsSave, dolls: updateDoll(dollsSave.dolls, doll.id, change(current)) });
}

function undoCloset() {
  if (!closetOrigin) return;
  const { id, worn, colors } = closetOrigin;
  closetOrigin = null;
  setDolls({ ...dollsSave, dolls: updateDoll(dollsSave.dolls, id, { worn, colors }) });
}

/** 這個娃娃跟進衣櫃時穿的不一樣：↩ 才有東西可以復原。 */
function closetChanged(doll) {
  return closetOrigin?.id === doll.id && !(sameEntries(doll.worn, closetOrigin.worn) && sameEntries(doll.colors ?? {}, closetOrigin.colors, sameDye));
}

/** 選娃娃的頭像按鈕（衣櫃、娃娃分頁共用的樣子）。 */
function faceButton(doll, on, onclick) {
  const button = Object.assign(document.createElement("button"), { className: "who" + (on ? " on" : ""), onclick, type: "button" });
  button.setAttribute("aria-label", doll.name);
  button.append(thumbImage(thumbs.face(doll), "face"), Object.assign(document.createElement("span"), { className: "who-name", textContent: doll.name }));
  return button;
}

function renderCloset() {
  const dolls = dollsSave.dolls;
  if (!dolls.some((doll) => doll.id === closetWho)) closetWho = dollsSave.selected ?? dolls[0]?.id ?? null;
  $("closetWho").replaceChildren(...dolls.map((doll) => faceButton(doll, doll.id === closetWho, () => { closetWho = doll.id; closetOrigin = null; renderCloset(); })));
  const doll = dolls.find((d) => d.id === closetWho);
  $("closetUndo").replaceChildren(...(doll && closetChanged(doll) ? [iconButton("undo", "變回原本那套", undoCloset, "big")] : []));
  if (!doll) return;
  const { worn } = doll;
  const colors = doll.colors ?? {};
  const starter = Object.values(BODIES[doll.body].starter);   // 基本款每個娃娃都有
  const wearable = (item) => content.clothes[item] && (!content.clothes[item].wearers || content.clothes[item].wearers.includes(BODIES[doll.body].sprites));   // 男生、女生素體各有各的衣服
  const items = [...new Set([...starter, ...Object.keys(game.state.wardrobe)])].filter(wearable);
  const colorOf = (item) => colors[item] ?? content.clothes[item].color;
  // 照格子由內到外分組；點了就穿上，已經穿著的再點一次是脫掉那一格；穿著的那件下面換底色、花紋，選了花紋再多一排花紋色
  $("wardrobe").replaceChildren(...Object.keys(SLOT_LABEL).flatMap((slot) => {
    const inSlot = items.filter((item) => CATEGORY_SLOT[content.clothes[item].category] === slot);
    if (!inSlot.length) return [];
    const title = Object.assign(document.createElement("div"), { className: "wardrobe-slot", textContent: SLOT_LABEL[slot] });
    const cards = inSlot.map((item) => {
      const on = worn[slot] === item;
      const card = itemCard(thumbs.clothes(item, doll, colorOf(item)), content.clothes[item].label);
      card.classList.toggle("on", on);
      card.onclick = () => editCloset(doll, (current) => { const { [slot]: _, ...rest } = current.worn; return { worn: on ? rest : { ...current.worn, [slot]: item } }; });
      return card;
    });
    const wearing = worn[slot];
    const spec = content.clothes[wearing];
    const recolorable = spec && (spec.dye || !spec.sprites?.[BODIES[doll.body].sprites]);   // 彩色原稿（牛仔短褲）不給換色；灰稿與用模板畫的才行
    if (!inSlot.includes(wearing) || !recolorable) return [title, ...cards];
    const dye = colorOf(wearing);
    const setDye = (next) => editCloset(doll, (current) => ({ colors: { ...current.colors, [wearing]: next } }));
    const pattern = dyePattern(dye);
    return [title, ...cards,
      colorButtons(CLOTHES_COLORS, dyeBase(dye), (color) => setDye(withBase(dye, color, CLOTHES_COLORS))),
      patternRow(PATTERNS, pattern, (p) => dyeSwatch(withPattern(dye, p, CLOTHES_COLORS), paintSwatch), (p) => setDye(withPattern(dye, p, CLOTHES_COLORS))),
      ...(pattern ? [patternColorTitle(dye), colorButtons(CLOTHES_COLORS, dye.patternColor, (color) => setDye(withPatternColor(dye, color)))] : [])];
  }));
}

/** 「花紋色」那排的小標：一小塊現在的花紋，看得出這排改的是花紋的顏色。 */
function patternColorTitle(dye) {
  const title = Object.assign(document.createElement("div"), { className: "wardrobe-sub" });
  const sample = dyeSwatch(dye, paintSwatch);
  sample.classList.add("pattern-sample");
  title.append(sample, "花紋色");
  return title;
}

/** 一張商品／衣服卡：上面大縮圖，下面小字；extra 是價錢、數量這類放在卡片裡的東西。 */
function itemCard(image, label, ...extra) {
  const card = Object.assign(document.createElement("button"), { className: "card", type: "button" });
  card.setAttribute("aria-label", label);
  const picture = typeof image === "string" ? thumbImage(image) : image;
  card.append(picture, Object.assign(document.createElement("span"), { className: "card-label", textContent: label }), ...extra);
  return card;
}

/** 衣櫃的一排色票：current 那顆亮著，點了呼叫 onPick(color)。 */
function colorButtons(colors, current, onPick) {
  const row = Object.assign(document.createElement("div"), { className: "swatches wardrobe-colors" });
  row.append(...colors.map((color) => {
    const button = Object.assign(document.createElement("button"), { title: color, className: color === current ? "on" : "", onclick: () => onPick(color) });
    button.style.background = color;
    return button;
  }));
  return row;
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
  takenNames: (exceptId) => dollsSave.dolls.filter((d) => d.id !== exceptId).map((d) => d.name),
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

/** 娃娃分頁：每個娃娃一張全身卡（點卡片就選她），下面是修改、刪掉；還有空位就多一張加號卡。 */
function renderDolls() {
  const { dolls, selected } = dollsSave;
  $("dollsInfo").textContent = "";
  const cards = dolls.map((doll) => {
    const card = Object.assign(document.createElement("div"), { className: "doll-card" + (doll.id === selected ? " on" : "") });
    const pick = Object.assign(document.createElement("button"), { className: "doll-pick", type: "button", onclick: () => setDolls({ ...dollsSave, selected: doll.id }) });
    pick.setAttribute("aria-label", `選${doll.name}`);
    pick.append(thumbImage(thumbs.full(doll), "full"), Object.assign(document.createElement("strong"), { textContent: doll.name }));
    const actions = Object.assign(document.createElement("div"), { className: "row" });
    actions.append(iconButton("pencil", `修改${doll.name}`, () => creator.open(doll), "big"));
    if (dolls.length > 1) {
      const remove = iconButton("bin", `刪掉${doll.name}`, null, "big");   // 平常灰色，點一下變紅、冒出紅色垃圾桶，再點才刪
      actions.append(confirmable(remove, `delete:${doll.id}`, "delete", () => {
        try { setDolls({ dolls: removeDoll(dolls, doll.id), selected: selected === doll.id ? dolls.find((d) => d.id !== doll.id).id : selected }); } catch (error) { flash(error.message); }
      }));
    }
    card.append(pick, actions);
    return card;
  });
  if (dolls.length < MAX_DOLLS) {
    const add = Object.assign(document.createElement("button"), { className: "doll-card doll-add", type: "button", onclick: () => creator.open(null) });
    add.setAttribute("aria-label", "新增娃娃");
    add.append(icon("plus"), icon("dolls"));
    cards.push(add);
  }
  $("dollList").replaceChildren(...cards);
}

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
  $("money").replaceChildren(price(game.state.money));
  $("currentDoll").replaceChildren(...(doll ? [thumbImage(thumbs.face(doll), "face"), doll.name] : []));
  $("currentDoll").title = doll ? `正在操作：${doll.name}` : "";
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
onConfirmChange(() => renderAll());
renderAll();
if (!dollsSave.dolls.length) { showTab("dolls"); creator.open(null, { first: true }); }
$("loading").classList.add("done");

window.__dollhouse = { game, get dolls() { return dollsSave; }, house, cafe };   // 開發時從主控台看狀態
