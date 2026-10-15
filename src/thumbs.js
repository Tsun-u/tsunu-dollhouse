// 縮圖：衣服（娃娃只穿這一件時，衣服那一塊）、娃娃頭像、娃娃全身。畫在離屏畫布上，照外觀快取成圖片網址。
// 衣服縮圖一次要畫兩個人，平板上一件要好一陣子：排隊分批做，每批只佔一小段時間就讓畫面先動，做好再通知重畫。

import { BODIES, headParts } from "../vendor/rules/looks.js";
import { CATEGORY_SLOT } from "../vendor/web/dress.js";

const RENDER_H = 320;   // 離屏畫一個人的高度（px）：頭像、全身
const CLOTHES_H = 200;  // 衣服縮圖只顯示 56px，畫小一點就夠
const OUT = 112;        // 縮圖輸出邊長（顯示 56px，兩倍給高解析螢幕）
const PAD = 8;

const SLICE_MS = 12;   // 每批最多做多久
const jobs = [];
let draining = false;
function enqueue(job) {
  jobs.push(job);
  if (!draining) { draining = true; setTimeout(drain, 0); }
}
function drain() {
  const start = performance.now();
  const done = new Set();
  while (jobs.length && performance.now() - start < SLICE_MS) { const job = jobs.shift(); job.run(); done.add(job.onReady); }
  for (const onReady of done) onReady();
  if (jobs.length) setTimeout(drain, 0); else draining = false;
}

export function createThumbs({ skeletons, animations, samplePose, clothes, dressUp, onReady }) {
  const cache = new Map();
  const pose = samplePose(animations.idle, 0, "front");

  const whoOf = (doll, withHead) => {
    const body = BODIES[doll.body];
    return {
      name: body.sprites,
      skeletons: { front: skeletons[body.views.front], front34: skeletons[body.views.front34], back34: skeletons[body.views.back34] },
      headParts: withHead ? headParts(doll) : [],
    };
  };

  /** 正面站姿畫一個人，回傳畫布。 */
  function render(doll, outfitsAndTint, { only = null, underwear = true, height = RENDER_H } = {}) {
    const skeleton = skeletons[BODIES[doll.body].views.front];
    const scale = height / skeleton.data.canvas.h;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(skeleton.data.canvas.w * scale);
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    skeleton.draw(ctx, pose, { x: 0, y: 0, scale, skin: doll.skin, ...outfitsAndTint, underwear, ...(only ? { only } : {}) });
    return canvas;
  }

  /** 不透明像素（或兩張不一樣的像素）的範圍。 */
  function bounds(canvas, other = null) {
    const { width, height } = canvas;
    const a = canvas.getContext("2d").getImageData(0, 0, width, height).data;
    const b = other?.getContext("2d").getImageData(0, 0, width, height).data;
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const hit = b
          ? Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) + Math.abs(a[i + 3] - b[i + 3]) > 24
          : a[i + 3] > 16;
        if (hit) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  /** canvas 上跟 other 一樣的像素改成透明。 */
  function keepDifferent(canvas, other) {
    const { width, height } = canvas;
    const ctx = canvas.getContext("2d");
    const image = ctx.getImageData(0, 0, width, height);
    const a = image.data;
    const b = other.getContext("2d").getImageData(0, 0, width, height).data;
    for (let i = 0; i < a.length; i += 4) {
      if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) + Math.abs(a[i + 3] - b[i + 3]) <= 24) a[i + 3] = 0;
    }
    ctx.putImageData(image, 0, 0);
  }

  /** 把 source 的 box 範圍等比放進 OUT×OUT 的正方形，回傳圖片網址。 */
  function crop(source, box, size = OUT, pad = PAD) {
    const out = document.createElement("canvas");
    out.width = out.height = size;
    const side = Math.max(box.w, box.h) + pad * 2;
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    out.getContext("2d").drawImage(source, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size);
    return out.toDataURL();
  }


  /** 娃娃的畫像每個娃娃只留最新一張：外觀（sig）變了就重畫、換掉舊的，換裝換一下午也不會越存越多。 */
  const portraits = new Map();
  function portrait(key, sig, make) {
    const held = portraits.get(key);
    if (held?.sig !== sig) portraits.set(key, { sig, url: make() });
    return portraits.get(key).url;
  }
  const looksOf = (doll) => JSON.stringify({ ...doll, spot: null, name: null, asleep: null });

  return {
    /** 這件衣服穿在 doll 身上的樣子（只穿這件），dye 是現在的顏色；男女素體穿不了的退回另一個素體。
     *  還沒畫好回傳 null 並排進佇列，畫好呼叫 onReady。 */
    clothes(item, doll, dye) {
      const spec = clothes[item];
      const sprites = BODIES[doll.body].sprites;
      const body = !spec.wearers || spec.wearers.includes(sprites) ? doll.body : Object.keys(BODIES).find((id) => spec.wearers.includes(BODIES[id].sprites));
      const model = { ...doll, body };
      const key = `c|${body}|${doll.skin}|${item}|${JSON.stringify(dye)}`;
      if (cache.has(key)) return cache.get(key);
      cache.set(key, null);
      enqueue({ onReady, run: () => {
        const who = whoOf(model, false);
        const worn = { [CATEGORY_SLOT[spec.category]]: item };
        const dressed = render(model, dressUp(who, worn, clothes, { [item]: dye }), { underwear: false, height: CLOTHES_H });   // 兩張都不畫內衣，差異才只有衣服
        const bare = render(model, dressUp(who, {}, clothes), { underwear: false, height: CLOTHES_H });
        const box = bounds(dressed, bare) ?? bounds(dressed);
        keepDifferent(dressed, bare);   // 只留衣服本身，身體挖掉
        cache.set(key, crop(dressed, box, OUT, 5));
      } });
      return null;
    },

    /** 娃娃的臉（頭和頭髮）：不畫衣服，換裝時不用重畫，只有長相改了才換。 */
    face(doll) {
      return portrait(`f|${doll.id}`, looksOf({ ...doll, worn: null, colors: null }), () => {
        const head = render(doll, dressUp(whoOf(doll, true), {}, clothes), { only: new Set(["head"]) });   // 只畫頭和頭髮，畫一次就裁
        return crop(head, bounds(head), OUT, 4);
      });
    },

    /** 娃娃的全身。 */
    full(doll) {
      return portrait(`b|${doll.id}`, looksOf(doll), () => {
        const who = whoOf(doll, true);
        const canvas = render(doll, dressUp(who, doll.worn, clothes, doll.colors));
        return crop(canvas, bounds(canvas), 240);
      });
    },
  };
}

/** 家具等大畫布的圖：只露出圖裡有東西的那塊（找一次範圍、記下來），縮圖才不會只剩中間一小塊。
 *  顯示直接用原圖加 CSS 裁切：房間畫面本來就載過同一張，瀏覽器不用再解碼一次。範圍還沒算好前先整張縮小顯示。 */
const TRIM_SCAN = 256;
const boxes = new Map();     // 圖 → 有東西那塊的正方形範圍（佔原圖的比例）；null 是還在算
const waiting = new Map();   // 還在算的圖 → 算好要通知的人
export function trimmedImage(src, onReady) {
  const tile = Object.assign(document.createElement("span"), { className: "thumb trimmed" });
  tile.style.backgroundImage = `url("${src}")`;
  const box = boxes.get(src);
  if (box) {
    tile.style.backgroundSize = `${100 / box.side}% auto`;
    tile.style.backgroundPosition = `${box.side < 1 ? (box.x / (1 - box.side)) * 100 : 0}% ${box.sideY < 1 ? (box.y / (1 - box.sideY)) * 100 : 0}%`;
    return tile;
  }
  tile.style.backgroundSize = "contain";
  if (boxes.has(src)) { waiting.get(src).add(onReady); return tile; }
  boxes.set(src, null);
  waiting.set(src, new Set([onReady]));
  const image = new Image();
  image.onload = () => {
    const shrink = Math.min(1, TRIM_SCAN / Math.max(image.naturalWidth, image.naturalHeight));   // 縮小再找邊，大圖逐點掃太慢
    const width = Math.round(image.naturalWidth * shrink), height = Math.round(image.naturalHeight * shrink);
    const ctx = Object.assign(document.createElement("canvas"), { width, height }).getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return;
    const side = Math.min(Math.max(x1 - x0, y1 - y0) + 3, width, height);   // 正方形，邊長取寬高比較大的那邊，四周留一點空
    const left = Math.max(0, Math.min(width - side, (x0 + x1) / 2 - side / 2));
    const top = Math.max(0, Math.min(height - side, (y0 + y1) / 2 - side / 2));
    boxes.set(src, { x: left / width, y: top / height, side: side / width, sideY: side / height });
    for (const callback of waiting.get(src)) callback();
    waiting.delete(src);
  };
  image.src = src;
  return tile;
}

/** 一張縮圖 img。 */
export function thumbImage(src, className = "thumb") {
  return Object.assign(document.createElement("img"), { src, className, alt: "", draggable: false });
}
