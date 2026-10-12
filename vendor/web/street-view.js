// 商店街：三棟透天厝的正面。中間是我們的樓（一樓咖啡廳、二樓家），左右兩間店面可以租來開雜貨店、服飾店。
// 開了的店：招牌貼上、鐵捲門的位置換成店內；沒租的：鐵捲門貼出租告示。點一樓看那家店、點沒租的店面租店、點二樓回家。

const W = 1800, H = 900;   // 街景圖原尺寸，座標都照這個量
const ART = {
  street: "assets/street/street.png", forRent: "assets/street/for_rent.png",
  sign_grocery: "assets/street/sign_grocery.png", sign_boutique: "assets/street/sign_boutique.png",
  inside_grocery: "assets/grocery/wall.png", inside_boutique: "assets/boutique/wall.png",
};
const LOTS = {
  left: { sign: { x: 50, y: 292, w: 505, h: 125 }, door: { x: 97, y: 428, w: 428, h: 288 } },
  right: { sign: { x: 1240, y: 292, w: 510, h: 125 }, door: { x: 1278, y: 428, w: 428, h: 288 } },
};
const CAFE_FLOOR = { x: 580, y: 320, w: 640, h: 410 };
const HOME_FLOOR = { x: 580, y: 25, w: 640, h: 295 };
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export class StreetView {
  /** onPick(kind)：點到一家開著的店；onRent(lot)：點到沒租的店面；onHome()：點到二樓。 */
  constructor(canvas, { onPick, onRent, onHome }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.handlers = { onPick, onRent, onHome };
    this.shops = { cafe: {} };
    this.selected = "cafe";
    this.art = {};
    for (const [key, src] of Object.entries(ART)) { const img = new Image(); img.onload = () => { this.art[key] = img; this.draw(); }; img.src = src; }
    canvas.addEventListener("click", (e) => this.onClick(e));
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = (rect.width || W / 2) / W * (window.devicePixelRatio || 1);
    this.canvas.width = Math.round(W * ratio); this.canvas.height = Math.round(H * ratio);
    this.canvas.style.aspectRatio = `${W} / ${H}`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw();
  }

  setState(shops, selected) {
    this.shops = shops;
    this.selected = selected;
    this.draw();
  }

  /** 哪家店租在這個店面（沒有就 null）。 */
  shopAt(lot) {
    return Object.entries(this.shops).find(([, shop]) => shop?.lot === lot)?.[0] ?? null;
  }

  onClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const p = { x: (e.clientX - rect.left) * W / rect.width, y: (e.clientY - rect.top) * H / rect.height };
    if (inside(p, HOME_FLOOR)) { this.handlers.onHome(); return; }
    if (inside(p, CAFE_FLOOR)) { this.handlers.onPick("cafe"); return; }
    for (const [lot, spot] of Object.entries(LOTS)) {
      if (!inside(p, spot.sign) && !inside(p, spot.door)) continue;
      const kind = this.shopAt(lot);
      if (kind) this.handlers.onPick(kind); else this.handlers.onRent(lot);
      return;
    }
  }

  draw() {
    const { ctx } = this;
    ctx.clearRect(0, 0, W, H);
    if (!this.art.street) { ctx.fillStyle = "#e9dcc4"; ctx.fillRect(0, 0, W, H); return; }
    ctx.drawImage(this.art.street, 0, 0, W, H);
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
    const frame = this.selected === "cafe" ? CAFE_FLOOR : LOTS[this.shops[this.selected]?.lot]?.door;
    if (frame) { ctx.strokeStyle = "#d98a5c"; ctx.lineWidth = 8; ctx.strokeRect(frame.x, frame.y, frame.w, frame.h); }
  }
}
