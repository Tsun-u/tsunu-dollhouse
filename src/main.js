// 小屋娃娃屋：把小屋匯出的規則、畫面、素材接起來，加上最多四個自己捏的娃娃。
// 遊戲存檔（錢、材料、家具、咖啡廳）交給 game.js，娃娃存檔交給 dolls.js，兩份都在這台瀏覽器。

import { loadSkeleton, samplePose } from "../vendor/player/player.js";
import { BODIES, CLOTHES_COLORS, headParts, randomLooks } from "../vendor/rules/looks.js";
import { SHOP_LABEL, SHOP_RENT } from "../vendor/rules/state.js";
import { CafeView } from "../vendor/web/cafe-view.js";
import { CATEGORY_SLOT, SLOT_LABEL, dressUp, dyeable } from "../vendor/web/dress.js";
import { IconSheet } from "../vendor/web/icons.js";
import { PuzzleView } from "../vendor/web/puzzle-view.js";
import { StreetView } from "../vendor/web/street-view.js";
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
const cafe = new CafeView($("cafeCanvas"), { skeleton: skeletons.front, guests, looks: { BODIES, CLOTHES_COLORS, headParts, randomLooks }, clothes: content.clothes, dress: { dressUp, dyeable, CATEGORY_SLOT }, animations, samplePose }, icons, apply);
startCafeClock(game, apply);

// ───────── 商店街：咖啡廳加上租來的雜貨店、服飾店（跟小屋一樣），每家店可以換裝潢 ─────────

let viewingShop = "cafe";   // 商店街上正在看哪家店
const street = new StreetView($("streetCanvas"), {
  onPick: (kind) => { viewingShop = kind; cafe.setShop(kind); $("rentPanel").hidden = true; decorSpot = null; renderCafe(); },
  onRent: (lot) => openRent(lot),
  onHome: () => showTab("home"),
});
$("cafeToggle").onclick = () => apply({ kind: "shop_open", open: !game.state.shops[viewingShop].open, shop: viewingShop });
$("rentCancel").onclick = () => { $("rentPanel").hidden = true; };

/** 店內裝潢：點裝飾點的小刷子，列出三款風格（買過的「換上」、正在用的亮著）和原裝。 */
let decorSpot = null;
cafe.decor = content.decor;
cafe.onDecor = (spot) => { decorSpot = spot; renderDecorPanel(); };
$("decorClose").onclick = () => { decorSpot = null; $("decorPanel").hidden = true; };
function renderDecorPanel() {
  const { state } = game;
  const shop = state.shops[viewingShop];
  if (!decorSpot || !shop) { $("decorPanel").hidden = true; return; }
  const spec = content.decor.spots[decorSpot];
  const owned = shop.decor?.owned?.[decorSpot] ?? [];
  const chosen = shop.decor?.chosen?.[decorSpot] ?? null;
  const name = content.decor.shops[viewingShop]?.[decorSpot] ?? spec.label;
  $("decorPanelTitle").textContent = `${SHOP_LABEL[viewingShop]}的${name}（存款 $${state.money}）`;
  const choice = (text, theme, action, disabled = false) => {
    const b = Object.assign(document.createElement("button"), { textContent: text, disabled, onclick: () => apply(action) });
    if (theme === chosen) b.className = "chosen";
    return b;
  };
  $("decorChoices").replaceChildren(
    choice("原裝", null, { kind: "set_decor", shop: viewingShop, spot: decorSpot, theme: null }, chosen === null),
    ...Object.entries(content.decor.themes).map(([theme, label]) => owned.includes(theme)
      ? choice(theme === chosen ? `${label}（使用中）` : `${label}：換上`, theme, { kind: "set_decor", shop: viewingShop, spot: decorSpot, theme }, theme === chosen)
      : choice(`${label}：買 $${spec.price}`, theme, { kind: "buy_decor", shop: viewingShop, spot: decorSpot, theme }, state.money < spec.price)),
  );
  $("decorPanel").hidden = false;
}

/** 點到沒租的店面：列出還沒開的店與租金。 */
function openRent(lot) {
  const { state } = game;
  const choices = Object.entries(SHOP_RENT).filter(([kind]) => !state.shops[kind]);
  $("rentTitle").textContent = choices.length ? `${lot === "left" ? "左邊" : "右邊"}的店面出租中，要開哪家店？（存款 $${state.money}）` : "兩家店都開了。";
  $("rentChoices").replaceChildren(...choices.map(([kind, rent]) => Object.assign(document.createElement("button"), {
    textContent: `開${SHOP_LABEL[kind]}（租金 $${rent}）`, disabled: state.money < rent,
    onclick: () => { $("rentPanel").hidden = true; if (apply({ kind: "rent_shop", lot, shop: kind })) { viewingShop = kind; cafe.setShop(kind); renderCafe(); } },
  })));
  $("rentPanel").hidden = false;
}

/** 分頁：切到咖啡廳時從娃娃裡隨機抽一位顧店。 */
for (const tabButton of $("tabs").children) {
  const show = () => {
    for (const b of $("tabs").children) b.classList.toggle("on", b === tabButton);
    for (const tab of document.querySelectorAll(".tab")) tab.classList.toggle("on", tab.id === tabButton.dataset.tab);
    if (tabButton.dataset.tab === "cafe") pickShopkeeper();
    fitScenes();
    if (tabButton.dataset.tab === "home") house.room.draw();
  };
  tabButton.onclick = () => ($("closet").classList.contains("on") && tabButton.dataset.tab !== "closet" ? leaveCloset(show) : show());
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

/** 家具店的裝潢這間房：選取的娃娃所在那間房的地板與壁紙，使用中的亮著。 */
function renderRoomDecor(chip) {
  const { state } = game;
  const here = state.rooms[house.roomId] ? house.roomId : "bedroom";
  const current = state.rooms[here];
  $("decorTitle").textContent = `裝潢${current.name}（娃娃走到別間房就能裝潢那間）`;
  const row = (kind, list, fallback) => Object.entries(list).map(([id, spec]) => {
    const using = (current[kind] ?? fallback) === id;
    const choice = chip(`${spec.label}<span class="price">${using ? "使用中" : spec.price ? `$${spec.price}` : "免費"}</span>`, using || state.money < spec.price, () => apply({ kind: "decorate_room", room: here, [kind]: id }));
    choice.classList.toggle("on", using);
    return choice;
  });
  $("floorList").replaceChildren(...row("floor", content.surfaces.floors, "tile"));
  $("wallList").replaceChildren(...row("wall", content.surfaces.walls, "plain"));
}

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
  renderRoomDecor(chip);
  $("clothesShop").replaceChildren(...Object.entries(content.clothes).map(([item, spec]) =>
    chip(`${swatch(spec.color)}${spec.label}<span class="price">$${spec.price}</span>`, state.money < spec.price, () => apply({ kind: "buy_clothes", item }))));
  $("resaleList").replaceChildren(...Object.entries(state.inventory).map(([item, count]) => {
    const spec = content.furniture[item];
    return chip(`${swatch(spec.color)}${spec.label}<span class="count">×${count}</span><span class="price">$${Math.floor(spec.price / 2)}</span>`, false, () => apply({ kind: "sell_furniture", item }));
  }));
  if (!$("resaleList").children.length) $("resaleList").textContent = "倉庫是空的。";
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
  $("cafeToggle").textContent = shop.open ? "打烊" : "開門";
  $("cafeProductsHint").textContent = viewingShop === "boutique" ? "櫃台上的衣服（點客人就賣出；想自己穿就收進衣櫃）" : "櫃台上的商品（點客人就出餐）";
  const mine = Object.entries(state.products).filter(([chain]) => (content.recipes[chain]?.shop ?? "cafe") === viewingShop);
  $("cafeProducts").replaceChildren(...mine.map(([chain, count]) => {
    const recipe = content.recipes[chain];
    const chip = Object.assign(document.createElement("span"), { className: "item" });
    const icon = Object.assign(document.createElement("span"), { className: "icon" });
    icons.apply(icon, chain, (recipe?.tiers.length ?? 1) - 1);
    chip.append(icon, `${recipe?.tiers.at(-1) ?? chain} ×${count}`);
    if (recipe?.clothes) chip.append(Object.assign(document.createElement("button"), { className: "quiet", textContent: "收進衣櫃", onclick: () => apply({ kind: "keep_clothes", chain }) }));
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
/** 衣櫃的試穿草稿：點衣服、換色都只改這份（{ id, worn, colors }），按存檔才寫進娃娃；null 是沒在試穿。 */
let closetDraft = null;

/** 衣櫃現在畫的樣子：在試穿這個娃娃就是草稿，不然照娃娃身上的。 */
function closetLook(doll) {
  return closetDraft?.id === doll.id ? closetDraft : { id: doll.id, worn: { ...doll.worn }, colors: { ...(doll.colors ?? {}) } };
}

/** 兩份「格子 → 衣服」或「衣服 → 顏色」一樣。 */
const sameEntries = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].every((key) => a[key] === b[key]);

/** 草稿跟娃娃身上的不一樣：有東西要存。 */
function closetChanged() {
  const doll = closetDraft && dollsSave.dolls.find((d) => d.id === closetDraft.id);
  return !!doll && !(sameEntries(doll.worn, closetDraft.worn) && sameEntries(doll.colors ?? {}, closetDraft.colors));
}

function editCloset(doll, change) {
  const current = closetLook(doll);
  closetDraft = { ...current, ...change(current) };
  renderCloset();
}

function saveCloset() {
  if (closetChanged()) setDolls({ ...dollsSave, dolls: updateDoll(dollsSave.dolls, closetDraft.id, { worn: closetDraft.worn, colors: closetDraft.colors }) });
  closetDraft = null;
  renderCloset();
}

function discardCloset() {
  closetDraft = null;
  renderCloset();
}

/** 要離開衣櫃（切分頁、換娃娃）時：草稿沒存就先問存檔、放棄、繼續試穿，選了存檔或放棄才接著 proceed。 */
function leaveCloset(proceed) {
  if (!closetChanged()) { closetDraft = null; proceed(); return; }
  const dialog = $("closetLeave");
  dialog.onclick = (event) => {
    const choice = event.target.dataset?.choice;
    if (!choice) return;
    dialog.close();
    if (choice === "stay") return;
    if (choice === "save") saveCloset(); else discardCloset();
    proceed();
  };
  dialog.showModal();
}
$("closetSaveBtn").onclick = saveCloset;
$("closetDiscardBtn").onclick = discardCloset;

function renderCloset() {
  const dolls = dollsSave.dolls;
  if (!dolls.some((doll) => doll.id === closetWho)) closetWho = dollsSave.selected ?? dolls[0]?.id ?? null;
  $("closetWho").replaceChildren(...dolls.map((doll) => {
    const chip = Object.assign(document.createElement("button"), { className: "item" + (doll.id === closetWho ? " on" : ""), textContent: doll.name });
    chip.onclick = () => leaveCloset(() => { closetWho = doll.id; renderCloset(); });
    return chip;
  }));
  const doll = dolls.find((d) => d.id === closetWho);
  $("closetSave").hidden = !closetChanged();
  if (!doll) return;
  const { worn, colors } = closetLook(doll);
  const starter = Object.values(BODIES[doll.body].starter);   // 基本款每個娃娃都有
  const wearable = (item) => content.clothes[item] && (!content.clothes[item].wearers || content.clothes[item].wearers.includes(BODIES[doll.body].sprites));   // 男生、女生素體各有各的衣服
  const items = [...new Set([...starter, ...Object.keys(game.state.wardrobe)])].filter(wearable);
  const colorOf = (item) => colors[item] ?? content.clothes[item].color;
  const wearers = (item) => dollsSave.dolls.filter((d) => Object.values(d.worn).includes(item) && !Object.values(BODIES[d.body].starter).includes(item)).length;
  const sellable = (item) => (game.state.wardrobe[item] ?? 0) > wearers(item);   // 衣櫃裡比穿著它的娃娃多的才能賣（基本款每個娃娃都有，不算）
  // 照格子由內到外分組，每格一行標題；點了試穿，已經穿著的再點一次是脫掉那一格；穿著的那件下面一排色票換顏色；按存檔才寫進娃娃
  $("wardrobe").replaceChildren(...Object.keys(SLOT_LABEL).flatMap((slot) => {
    const inSlot = items.filter((item) => CATEGORY_SLOT[content.clothes[item].category] === slot);
    if (!inSlot.length) return [];
    const title = Object.assign(document.createElement("div"), { className: "wardrobe-slot", textContent: SLOT_LABEL[slot] });
    const chips = inSlot.map((item) => {
      const on = worn[slot] === item;
      const chip = Object.assign(document.createElement("button"), { className: "item" + (on ? " on" : "") });
      chip.innerHTML = `<span class="swatch" style="background:${colorOf(item)}"></span>${content.clothes[item].label}`;
      chip.onclick = () => editCloset(doll, (current) => { const { [slot]: _, ...rest } = current.worn; return { worn: on ? rest : { ...current.worn, [slot]: item } }; });
      if (sellable(item)) chip.append(Object.assign(document.createElement("span"), {
        className: "sell", role: "button", textContent: `賣 $${Math.floor(content.clothes[item].price / 2)}`,
        onclick: (e) => { e.stopPropagation(); apply({ kind: "sell_clothes", item }); },
      }));
      return chip;
    });
    const wearing = worn[slot];
    const spec = content.clothes[wearing];
    const recolorable = spec && (spec.dye || !spec.sprites?.[BODIES[doll.body].sprites]);   // 彩色原稿（牛仔短褲）不給換色；灰稿與用模板畫的才行
    if (!inSlot.includes(wearing) || !recolorable) return [title, ...chips];
    const palette = Object.assign(document.createElement("div"), { className: "swatches wardrobe-colors" });
    palette.append(...CLOTHES_COLORS.map((color) => {
      const button = Object.assign(document.createElement("button"), { title: color, onclick: () => editCloset(doll, (current) => ({ colors: { ...current.colors, [wearing]: color } })) });
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
  const look = closetLook(doll);   // 試穿中就畫草稿
  const { outfits, bodyTint } = dressUp(who, look.worn, content.clothes, look.colors);
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

window.__dollhouse = { game, get dolls() { return dollsSave; }, house, cafe };   // 開發時從主控台看狀態
