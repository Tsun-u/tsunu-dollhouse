// 店內（咖啡廳、雜貨店、服飾店共用）：側面剖面。櫃台在左、門在右，阿童站櫃台後，客人從門口走進來排隊，
// 頭上冒出想要的商品；點客人就出餐。客人的長相由外觀種子（customer.look）決定：男生或女生素體、髮型、五官、各種顏色。

const W = 900, H = 360, FLOOR_Y = 320, COUNTER = { x: 110, w: 170, h: 90 }, DOOR_X = 820;
const QUEUE_X = [330, 420, 505];   // 排隊位置在櫃台與桌組之間
const WALK_SPEED = 220;   // 畫布像素／秒
const GUEST_FACING = { front34: 1, back34: -1 };   // 斜前面向左邊的櫃台、斜後面向右邊的門
const CUSTOMER_TOPS = ["#9fd8c9", "#f2dc8c", "#c9b6e4", "#f4b3c2", "#a9c8ee", "#d9c3a5"];   // 上衣模板染的顏色
const CUSTOMER_PANTS = ["#cfbda2", "#3d4a66", "#4a4a4f", "#a89a86", "#6b5442", "#5a6f95"];   // 染客人的長褲、短褲模板（卡其、深藍、炭灰、灰褐、咖啡、牛仔藍）
const CUSTOMER_SHOES = ["#5a4636", "#2f3440", "#8a6a4a", "#e9e4da", "#7a3b3b", "#3f5a4a"];   // 染灰稿便鞋
const PATIENCE_MS = 150_000;
// 店面圖（小葵畫的正側面剖面）：wall 滿版、counter 與 table（只有咖啡廳有桌組）疊在前面；圖沒到就畫色塊
const ART = {   // 相對頁面的網址：小屋與兒童版都從自己的根目錄找
  cafe: { wall: "assets/cafe/wall.png", counter: "assets/cafe/counter.png", table: "assets/cafe/table_set.png" },
  grocery: { wall: "assets/grocery/wall.png", counter: "assets/grocery/counter.png" },
  boutique: { wall: "assets/boutique/wall.png", counter: "assets/boutique/counter.png" },
};
const TABLE = { x: 560, w: 185, h: 152 };   // 桌組畫在門左邊
const BRUSH_R = 11;   // 裝飾點右上角小刷子的半徑

export class CafeView {
  /** guests：客人可以用的素體 [{ body: "f"|"m", views }]，views 是三個視角一組 { front, front34, back34 }（進門斜前、離開斜後），
   *  或只有 { front }（客人一律正面、靠左右翻轉表示方向）。looks：兩版共用的捏角模組（規則層的 looks.js），客人的長相照它抽。 */
  constructor(canvas, { skeleton, guests, looks, animations, samplePose }, icons, act) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.skeleton = skeleton;
    this.animations = animations;
    this.samplePose = samplePose;
    this.icons = icons;
    this.act = act;
    this.owner = { skin: "#ffe8d1", outfits: ["atone_face", "atone_mouth", "atone_hair", "atone_glasses"], bodyTint: null };   // app.js 依存檔穿著更新
    this.looks = looks;
    this.wardrobes = guests.map(({ body, views }) => guestWardrobe(body, views));
    this.customers = new Map();   // id → { data, x, target, leaving, look }
    this.state = null;
    this.ratio = 1;
    this.shopKind = "cafe";   // 畫面上是哪家店
    this.decor = null;        // 店內裝潢目錄（/api/decor）；有給才畫裝飾點的小刷子
    this.onDecor = null;      // 點到小刷子：onDecor(spot)
    this.decorImages = {};
    this.arts = {};
    for (const [kind, files] of Object.entries(ART)) {
      this.arts[kind] = {};
      for (const [key, src] of Object.entries(files)) { const img = new Image(); img.onload = () => { this.arts[kind][key] = img; }; img.src = src; }
    }
    canvas.addEventListener("click", (e) => this.onClick(e));
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    let last = performance.now();
    const loop = (now) => {
      this.step((now - last) / 1000); last = now;
      if (this.canvas.offsetParent) this.draw(now / 1000);   // 分頁藏起來時客人照樣走，只是不重畫
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.ratio = Math.max(1, (rect.width || W) / W) * (window.devicePixelRatio || 1);
    this.canvas.width = Math.round(W * this.ratio); this.canvas.height = Math.round(H * this.ratio);
    this.canvas.style.aspectRatio = `${W} / ${H}`;
    this.ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
  }

  /** 這個畫面顯示的那家店。 */
  get shop() { return this.state.shops[this.shopKind]; }

  get art() { return this.arts[this.shopKind]; }

  /** 換一家店看：畫面上的客人清掉，照那家店的排隊重新走進來。 */
  setShop(kind) {
    if (kind === this.shopKind) return;
    this.shopKind = kind;
    this.customers.clear();
    if (this.state) this.setState(this.state);
  }

  setState(state) {
    this.state = state;
    const seen = new Set();
    this.shop.customers.forEach((data, index) => {
      seen.add(data.id);
      const existing = this.customers.get(data.id);
      if (existing) { existing.data = data; existing.target = QUEUE_X[index]; }
      else this.customers.set(data.id, { data, x: DOOR_X + 60, target: QUEUE_X[index], leaving: false, look: this.dressGuest(data.look) });
    });
    for (const [id, customer] of this.customers) if (!seen.has(id) && !customer.leaving) { customer.leaving = true; customer.target = DOOR_X + 80; }
  }

  step(dt) {
    for (const [id, customer] of this.customers) {
      const dx = customer.target - customer.x;
      if (Math.abs(dx) <= WALK_SPEED * dt) { customer.x = customer.target; if (customer.leaving) this.customers.delete(id); }
      else customer.x += Math.sign(dx) * WALK_SPEED * dt;
    }
  }

  onClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * W / rect.width, y = (e.clientY - rect.top) * H / rect.height;
    for (const spot of this.decorSpots()) {
      const [bx, by] = this.brushAt(spot);
      if (Math.hypot(x - bx, y - by) <= BRUSH_R + 4) { this.onDecor?.(spot); return; }
    }
    for (const customer of this.customers.values()) {
      if (!customer.leaving && Math.abs(x - customer.x) < 40 && y > FLOOR_Y - 150 && y < FLOOR_Y) { this.act({ kind: "serve", customer: customer.data.id }); return; }
    }
  }

  /** 有裝潢目錄、這家店也開著時可以點的裝飾點。 */
  decorSpots() { return this.decor && this.onDecor && this.state && this.shop ? Object.keys(this.decor.spots) : []; }

  /** 裝飾點在這家店的位置：有覆寫就用覆寫的（避開背景圖上畫好的東西）。 */
  spotRect(spot) { return this.decor.rects?.[this.shopKind]?.[spot] ?? this.decor.spots[spot].rect; }

  brushAt(spot) { const [x, y, w] = this.spotRect(spot); return [x + w - BRUSH_R, y + BRUSH_R + 2]; }

  /** 這家店的裝飾點現在用的風格圖（沒換過或圖還沒到就 null）；吊飾三家店共用。 */
  decorArt(spot) {
    const theme = this.shop?.decor?.chosen?.[spot];
    if (!theme) return null;
    const src = spot === "hanging" ? `assets/decor/hanging_${theme}.png` : `assets/decor/${this.shopKind}/${spot}_${theme}.png`;
    if (!(src in this.decorImages)) { this.decorImages[src] = null; const img = new Image(); img.onload = () => { this.decorImages[src] = img; }; img.src = src; }
    return this.decorImages[src] ?? { missing: theme };
  }

  /** 畫一個裝飾點：有換過就畫那款的圖（圖還沒到畫虛線框和風格名），沒換過回傳 false 讓呼叫的人畫原裝。 */
  drawDecor(spot) {
    const art = this.decor && this.decorArt(spot);
    if (!art) return false;
    const [x, y, w, h] = this.spotRect(spot);
    const { ctx } = this;
    if (art.missing) {
      ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = "#a88a63"; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "#6b5236"; ctx.font = "13px sans-serif"; ctx.fillText(this.decor.themes[art.missing] ?? art.missing, x + w / 2, y + h / 2); ctx.restore();
    } else {
      ctx.drawImage(art, x, y, w, h);
      const sign = this.decor.texts?.[this.shopKind]?.[`${spot}_${this.shop.decor.chosen[spot]}`];
      if (sign) this.drawSign(sign, x, y, w, h);
    }
    return true;
  }

  /** 招牌字：圖上的牌面留白，字用程式寫（生圖寫不好中文）；橫的置中，直的由上往下。 */
  drawSign({ text, color, box: [bx, by, bw, bh], vertical }, x, y, w, h) {
    const { ctx } = this;
    const left = x + bx * w, top = y + by * h, width = bw * w, height = bh * h;
    const chars = [...text];
    const size = vertical ? Math.min(width * 0.72, height / chars.length * 0.82) : Math.min(height * 0.62, width / chars.length * 0.8);
    ctx.save();
    ctx.fillStyle = color; ctx.font = `bold ${size}px "Noto Serif TC", "Noto Sans TC", "Microsoft JhengHei", serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (vertical) chars.forEach((char, i) => ctx.fillText(char, left + width / 2, top + height / 2 + (i - (chars.length - 1) / 2) * size * 1.08));
    else ctx.fillText(text, left + width / 2, top + height / 2);
    ctx.restore();
  }

  drawBrushes() {
    const { ctx } = this;
    for (const spot of this.decorSpots()) {
      const [x, y] = this.brushAt(spot);
      ctx.save();
      ctx.fillStyle = "rgba(255,250,240,0.9)"; ctx.strokeStyle = "#a88a63"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, BRUSH_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🖌", x, y + 1);
      ctx.restore();
    }
  }

  /** 用外觀種子挑素體、上衣顏色、長相（共用捏角模組的隨機長相：髮型、髮色、眼睛、瞳色、嘴巴、唇色、膚色）、鞋子與褲子顏色；
   *  同一顆種子永遠是同一個樣子。 */
  dressGuest(seed) {
    const pick = seededPicker(seed);
    const wardrobe = pick(this.wardrobes);
    const topColor = pick(CUSTOMER_TOPS);
    const top = wardrobe.top ? [wardrobe.top.dye ? { name: wardrobe.top.name, tint: topColor, tuck: !!wardrobe.top.tucked } : wardrobe.top.name] : [];
    const bottom = (wardrobe.top?.with ?? []).map((entry) => (typeof entry === "string" ? entry : { ...entry }));
    const outfits = wardrobe.top?.tucked ? [...top, ...bottom] : [...bottom, ...top];   // 下身先畫，上衣下擺蓋在褲頭上；紮進去的反過來
    const looks = this.looks.randomLooks(pick, wardrobe.body, wardrobe.outfits);
    outfits.push(...this.looks.headParts(looks));
    if (wardrobe.shoes) outfits.unshift({ name: "shoes", tint: pick(CUSTOMER_SHOES) });   // 排在最前面先畫，褲管蓋在鞋口上
    for (const entry of bottom) if (entry.dye) entry.tint = pick(CUSTOMER_PANTS);
    for (const skeleton of Object.values(wardrobe.views)) skeleton.preloadOutfits(outfits);   // 進門斜前、離開斜後：每個視角的衣服先載好，轉身不閃素體
    return { views: wardrobe.views, skin: looks.skin, outfits };
  }

  /** 客人朝哪個視角：進門、排隊面向櫃台是斜前，買完走向門口是斜後；素體沒有那個視角就用正面、靠左右翻轉。 */
  guestTurn(customer) {
    const { views } = customer.look;
    const view = customer.leaving ? "back34" : "front34";
    if (views[view]) return { skeleton: views[view], view, facing: GUEST_FACING[view] };
    return { skeleton: views.front, view: "front", facing: customer.leaving ? -1 : 1 };
  }

  /** 人自己帶骨架就用它的（兒童版男生娃娃顧店），沒帶就用女生正面素體（小屋的阿童、客人）。 */
  drawPerson(x, time, { skeleton = this.skeleton, view = "front", skin, outfits, bodyTint = null, anim = "idle", facing = 1 }) {
    const scale = 150 / skeleton.data.canvas.h;
    const half = skeleton.data.canvas.w * scale / 2;
    const pose = this.samplePose(this.animations[anim], time, view);
    skeleton.draw(this.ctx, pose, { x: facing < 0 ? x + half : x - half, y: FLOOR_Y - skeleton.data.canvas.h * scale + 4, scale, facing, outfits, skin, bodyTint });
  }

  draw(time) {
    const { ctx } = this;
    ctx.clearRect(0, 0, W, H);
    ctx.font = "14px sans-serif"; ctx.textAlign = "center";
    if (this.art.wall) ctx.drawImage(this.art.wall, 0, 0, W, H);
    else {   // 牆、地板、門的色塊版
      ctx.fillStyle = "#f6ead6"; ctx.fillRect(0, 0, W, FLOOR_Y);
      ctx.fillStyle = "#cdb593"; ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
      ctx.fillStyle = "#e4d3b6"; ctx.fillRect(DOOR_X - 40, FLOOR_Y - 190, 80, 190);
      ctx.strokeStyle = "#a88a63"; ctx.lineWidth = 3; ctx.strokeRect(DOOR_X - 40, FLOOR_Y - 190, 80, 190);
      ctx.fillStyle = "#3b2f2a"; ctx.fillText("門", DOOR_X, FLOOR_Y - 200);
    }
    this.drawDecor("wall"); this.drawDecor("hanging");
    if (!this.drawDecor("feature") && this.art.table) ctx.drawImage(this.art.table, TABLE.x, FLOOR_Y - TABLE.h + 10, TABLE.w, TABLE.h);
    // 老闆娘站櫃台後面，再畫櫃台蓋住下半身
    this.drawPerson(COUNTER.x + COUNTER.w / 2, time, this.owner);
    if (!this.drawDecor("counter")) this.drawCounter();
    if (this.state && !this.shop.open) { ctx.fillStyle = "rgba(60,40,30,0.55)"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#fff"; ctx.font = "24px sans-serif"; ctx.fillText("打烊中", W / 2, H / 2); this.drawBrushes(); return; }
    // 客人
    for (const customer of this.customers.values()) {
      const walking = customer.x !== customer.target;
      this.drawPerson(customer.x, time + (customer.data.look % 97), { ...customer.look, ...this.guestTurn(customer), anim: walking ? "walk" : "idle" });   // 錯開每個人的動畫相位
      if (!customer.leaving) this.drawBubble(customer, time);
    }
    this.drawBrushes();
  }

  /** 原裝的櫃台（圖還沒到就畫色塊）。 */
  drawCounter() {
    const { ctx } = this;
    if (this.art.counter) { ctx.drawImage(this.art.counter, COUNTER.x - 20, FLOOR_Y - COUNTER.h - 20, COUNTER.w + 40, COUNTER.h + 25); return; }
    ctx.fillStyle = "#b08a5a"; ctx.fillRect(COUNTER.x, FLOOR_Y - COUNTER.h, COUNTER.w, COUNTER.h);
    ctx.fillStyle = "#8a6a44"; ctx.fillRect(COUNTER.x - 6, FLOOR_Y - COUNTER.h - 8, COUNTER.w + 12, 10);
    ctx.fillStyle = "#3b2f2a"; ctx.fillText("櫃台", COUNTER.x + COUNTER.w / 2, FLOOR_Y - COUNTER.h / 2 + 5);
  }

  /** 客人頭上的對話框：想要的商品圖示＋耐心條。 */
  drawBubble(customer, time) {
    const { ctx } = this;
    const x = customer.x, y = FLOOR_Y - 190 + Math.sin(time * 2) * 3;
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#cdb593"; ctx.lineWidth = 2;
    roundRect(ctx, x - 30, y - 30, 60, 56, 10); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 8, y + 26); ctx.lineTo(x, y + 36); ctx.lineTo(x + 8, y + 26); ctx.closePath(); ctx.fill();
    const recipe = this.icons.recipes[customer.data.wants];
    this.icons.drawIcon(ctx, customer.data.wants, (recipe?.tiers.length ?? 1) - 1, x - 20, y - 24, 40);
    const waited = Date.now() - new Date(customer.data.arrivedAt).getTime();
    const left = Math.max(0, 1 - waited / PATIENCE_MS);
    ctx.fillStyle = "#e0d3bf"; ctx.fillRect(x - 24, y + 18, 48, 5);
    ctx.fillStyle = left > 0.4 ? "#7bc47f" : "#e07a5f"; ctx.fillRect(x - 24, y + 18, 48 * left, 5);
  }
}

/** 客人的上衣：女生穿 T 恤模板染色、搭染色的短褲模板（跟衣櫃同一套）；
 *  男生穿襯衫模板染色、紮進染色的長褲模板（tucked：褲子畫在襯衫之後，蓋住紮進去的下襬）。每個視角都要有才用。 */
function guestTop(views) {
  const everyView = (name) => Object.values(views).every((skeleton) => skeleton.data.outfits?.[name]);
  if (everyView("tpl_tee") && everyView("tpl_shorts")) return { name: "tpl_tee", dye: true, with: [{ name: "tpl_shorts", dye: true }] };
  if (everyView("tpl_shirt") && everyView("tpl_pants")) return { name: "tpl_shirt", dye: true, tucked: true, with: [{ name: "tpl_pants", dye: true }] };
  return null;
}

/** 一個素體能配給客人的衣著：鞋子、上衣，以及長相可以挑的套名（轉身不會缺零件）：
 *  頭髮每個視角都要有；五官只要斜後以外的視角有（斜後看不到臉）。 */
function guestWardrobe(body, views) {
  const inViews = (skeletons) => (name) => skeletons.every((skeleton) => skeleton.data.outfits?.[name]);
  const everyView = inViews(Object.values(views));
  const faceViews = inViews(Object.entries(views).filter(([view]) => view !== "back34").map(([, skeleton]) => skeleton));
  return {
    body,
    views,
    shoes: everyView("shoes"),   // 灰稿便鞋（scripts/make_shoes.py），每個視角都有才穿
    top: guestTop(views),
    outfits: Object.fromEntries(Object.keys(views.front.data.outfits ?? {}).filter((name) => (name.endsWith("_hair") ? everyView(name) : faceViews(name))).map((name) => [name, true])),
  };
}

/** 以種子起算的亂數（mulberry32），每次呼叫從清單抽一個。種子先打散，相鄰的種子（舊存檔的 0～5）才不會長得像。 */
function seededPicker(seed) {
  let s = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return (list) => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return list[(((t ^ (t >>> 14)) >>> 0) / 4294967296) * list.length | 0];
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
