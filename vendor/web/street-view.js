// 商店街：三棟透天厝的正面加右邊一棟溫泉旅館，橫向捲動（畫布高度固定、寬度照街景圖比例，容器 overflow-x 捲）。中間是我們的樓（一樓咖啡廳、二樓家），
// 左右兩間店面可以租來開雜貨店、服飾店。開了的店：招牌貼上、鐵捲門的位置換成店內；沒租的：鐵捲門貼出租告示。
// 點一樓看那家店、點沒租的店面租店、點旅館門面 onPick("inn")、點二樓回家、點人行道走過去（有給 onGround 才會）。
// 街上的人（真客人、屋主）由 setPeople 餵進來：照街景圖的橫座標站在人行道上，位置變了就沿街走過去；可以重疊。沒餵人就只畫街景（兒童版）。

const STREET_W = 1800, INN_W = 900, H = 900;   // 街景圖與旅館延伸圖的原尺寸，座標都照這個量；兩張接起來是整條街
const FULL_W = STREET_W + INN_W;
const SEAM = 40;           // 兩張圖接縫的漸層寬度
const GROUND_Y = 775;      // 人行道上人站的地平線
const PERSON_H = 200;      // 人的高度（街景圖像素）
const WALK_SPEED = 260;    // 街景圖像素／秒
const SIDEWALK = { top: 690, bottom: 810 };   // 點這一段算點人行道
const ART = {
  street: "assets/street/street.png", inn: "assets/street/inn.png", forRent: "assets/street/for_rent.png",
  sign_grocery: "assets/street/sign_grocery.png", sign_boutique: "assets/street/sign_boutique.png",
  inside_grocery: "assets/grocery/wall.png", inside_boutique: "assets/boutique/wall.png",
};
const LOTS = {
  left: { sign: { x: 50, y: 292, w: 505, h: 125 }, door: { x: 97, y: 428, w: 428, h: 288 } },
  right: { sign: { x: 1240, y: 292, w: 510, h: 125 }, door: { x: 1278, y: 428, w: 428, h: 288 } },
};
const CAFE_FLOOR = { x: 580, y: 320, w: 640, h: 410 };
const HOME_FLOOR = { x: 580, y: 25, w: 640, h: 295 };
const INN_FLOOR = { x: STREET_W + 120, y: 330, w: 700, h: 400 };   // 旅館一樓（門簾、燈籠、招牌）：點了就是進旅館／看旅館
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export class StreetView {
  /** onPick(kind)：點到一家開著的店（或旅館 "inn"）；onRent(lot)：點到沒租的店面；onHome()：點到二樓；onGround(x)：點到人行道（選用）。
   *  animations、samplePose：要畫街上的人才給（跟 cafe-view 同一套）。inn：false 就不接旅館那段（街維持 1800、不載 inn.png、不會送 onPick("inn")）。 */
  constructor(canvas, { onPick, onRent, onHome, onGround = null, animations = null, samplePose = null, inn = true }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.handlers = { onPick, onRent, onHome, onGround };
    this.animations = animations;
    this.samplePose = samplePose;
    this.shops = { cafe: {} };
    this.selected = "cafe";
    this.art = {};
    this.people = new Map();   // id → { who, x, target, facing }
    for (const [key, src] of Object.entries(ART)) {
      if (key === "inn" && !inn) continue;
      const img = new Image(); img.onload = () => { this.art[key] = img; if (key === "inn") this.resize(); else this.draw(); }; img.src = src;   // 旅館那段載到了街才變長
    }
    canvas.addEventListener("click", (e) => this.onClick(e));
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    if (animations) {   // 有人要畫才跑動畫迴圈；分頁藏起來時人照樣走，只是不重畫
      let last = performance.now();
      const loop = (now) => { this.step((now - last) / 1000); last = now; if (this.canvas.offsetParent) this.draw(now / 1000); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  }

  /** 整條街現在多寬：旅館那段的圖載到了才算進去。 */
  get width() { return this.art.inn ? FULL_W : STREET_W; }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = (rect.height || H / 3) / H * (window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * ratio); this.canvas.height = Math.round(H * ratio);
    this.canvas.style.aspectRatio = `${this.width} / ${H}`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw();
  }

  setState(shops, selected) {
    this.shops = shops;
    this.selected = selected;
    this.draw();
  }

  /** 街上的人：[{ id, x, who }]，who 是 people.js 的人（skeletons、outfits、skin、bodyTint）。位置變了就走過去；不在名單上的收掉。 */
  setPeople(list) {
    const seen = new Set();
    for (const { id, x, who } of list) {
      seen.add(id);
      const existing = this.people.get(id);
      if (existing) { existing.who = who; if (existing.target !== x) { existing.facing = x > existing.x ? 1 : -1; existing.target = x; } continue; }
      this.people.set(id, { who, x, target: x, facing: 1 });
    }
    for (const id of this.people.keys()) if (!seen.has(id)) this.people.delete(id);
    if (!this.animations) this.draw();
  }

  step(dt) {
    for (const person of this.people.values()) {
      const dx = person.target - person.x;
      if (Math.abs(dx) <= WALK_SPEED * dt) person.x = person.target;
      else person.x += Math.sign(dx) * WALK_SPEED * dt;
    }
  }

  /** 哪家店租在這個店面（沒有就 null）。 */
  shopAt(lot) {
    return Object.entries(this.shops).find(([, shop]) => shop?.lot === lot)?.[0] ?? null;
  }

  /** 這家店的門在街上的橫座標。 */
  doorX(kind) {
    const lot = this.shops[kind]?.lot;
    const rect = lot ? LOTS[lot].door : CAFE_FLOOR;
    return Math.round(rect.x + rect.w / 2);
  }

  onClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const p = { x: (e.clientX - rect.left) * this.width / rect.width, y: (e.clientY - rect.top) * H / rect.height };
    if (inside(p, HOME_FLOOR)) { this.handlers.onHome(); return; }
    if (inside(p, CAFE_FLOOR)) { this.handlers.onPick("cafe"); return; }
    if (this.art.inn && inside(p, INN_FLOOR)) { this.handlers.onPick("inn"); return; }
    for (const [lot, spot] of Object.entries(LOTS)) {
      if (!inside(p, spot.sign) && !inside(p, spot.door)) continue;
      const kind = this.shopAt(lot);
      if (kind) this.handlers.onPick(kind); else this.handlers.onRent(lot);
      return;
    }
    if (this.handlers.onGround && p.y >= SIDEWALK.top && p.y <= SIDEWALK.bottom) this.handlers.onGround(Math.round(p.x));
  }

  draw(time = performance.now() / 1000) {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.width, H);
    if (!this.art.street) { ctx.fillStyle = "#e9dcc4"; ctx.fillRect(0, 0, this.width, H); return; }
    ctx.drawImage(this.art.street, 0, 0, STREET_W, H);
    if (this.art.inn) this.drawInn();
    for (const [lot, spot] of Object.entries(LOTS)) {
      const kind = this.shopAt(lot);
      if (!kind) {   // 沒租：出租告示貼在鐵捲門中間
        const sign = this.art.forRent;
        if (sign) ctx.drawImage(sign, spot.door.x + (spot.door.w - 216) / 2, spot.door.y + 50, 216, 144);
        continue;
      }
      const shop = this.shops[kind];
      const room = this.art[`inside_${kind}`];
      if (room) {   // 鐵捲門拉起來：看得到店內（取店內圖的中段）
        const sw = room.naturalWidth * 0.62, sh = sw * spot.door.h / spot.door.w;
        ctx.drawImage(room, (room.naturalWidth - sw) / 2, room.naturalHeight - sh, sw, sh, spot.door.x, spot.door.y, spot.door.w, spot.door.h);
      }
      if (!shop.open) { ctx.fillStyle = "rgba(60,40,30,0.5)"; ctx.fillRect(spot.door.x, spot.door.y, spot.door.w, spot.door.h); }
      const sign = this.art[`sign_${kind}`];
      if (sign) ctx.drawImage(sign, spot.sign.x + 20, spot.sign.y + 12, spot.sign.w - 40, spot.sign.h - 24);
    }
    // 目前在看的店：一樓外框描邊
    const frame = this.selected === "cafe" ? CAFE_FLOOR : this.selected === "inn" ? INN_FLOOR : LOTS[this.shops[this.selected]?.lot]?.door;
    if (frame) { ctx.strokeStyle = "#d98a5c"; ctx.lineWidth = 8; ctx.strokeRect(frame.x, frame.y, frame.w, frame.h); }
    this.drawPeople(time);
  }

  /** 旅館那段接在街景右邊：先整張畫上去，再把接縫左側那一條用漸層淡出蓋回街景（兩張圖的人行道亮度差一點，硬接會有一條線）。 */
  drawInn() {
    const { ctx } = this;
    ctx.drawImage(this.art.inn, STREET_W, 0, INN_W, H);
    const fade = ctx.createLinearGradient(STREET_W, 0, STREET_W + SEAM, 0);
    fade.addColorStop(0, "rgba(0,0,0,1)"); fade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = fade; ctx.fillRect(STREET_W, 0, SEAM, H);
    ctx.globalCompositeOperation = "destination-over";
    ctx.drawImage(this.art.street, STREET_W - SEAM, 0, SEAM, H, STREET_W, 0, SEAM, H);   // 接縫底下墊街景最右邊那一條
    ctx.restore();
  }

  /** 街上的人站在人行道上：走路時照方向用斜前（往右）或斜後（往左），站著面向鏡頭。 */
  drawPeople(time) {
    if (!this.animations) return;
    for (const [id, person] of this.people) {
      const { who } = person;
      const walking = person.x !== person.target;
      const view = walking ? (person.facing > 0 ? "front34" : "back34") : "front";
      const skeleton = who.skeletons[view] ?? who.skeletons.front;
      const scale = PERSON_H / skeleton.data.canvas.h;
      const half = skeleton.data.canvas.w * scale / 2;
      const pose = this.samplePose(this.animations[walking ? "walk" : "idle"], time + phaseOf(id), view);
      skeleton.draw(this.ctx, pose, { x: person.x - half, y: GROUND_Y - skeleton.data.canvas.h * scale, scale, facing: 1, outfits: who.outfits, skin: who.skin, bodyTint: who.bodyTint });
      if (who.label) {
        this.ctx.font = "26px sans-serif"; this.ctx.textAlign = "center"; this.ctx.fillStyle = "rgba(255,255,255,0.85)";
        const w = this.ctx.measureText(who.label).width + 20;
        this.ctx.fillRect(person.x - w / 2, GROUND_Y - PERSON_H - 40, w, 34);
        this.ctx.fillStyle = "#3b2f2a"; this.ctx.fillText(who.label, person.x, GROUND_Y - PERSON_H - 14);
      }
    }
  }
}

/** 每個人的動畫相位錯開（用 id 的字元算），一排人不會同步擺動。 */
function phaseOf(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return hash / 10;
}
