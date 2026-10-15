// 縮圖：衣服（娃娃只穿這一件時，衣服那一塊）、娃娃頭像、娃娃全身。畫在離屏畫布上，照外觀快取成圖片網址。

import { BODIES, headParts } from "../vendor/rules/looks.js";
import { CATEGORY_SLOT } from "../vendor/web/dress.js";

const RENDER_H = 320;   // 離屏畫一個人的高度（px）
const OUT = 112;        // 縮圖輸出邊長（顯示 56px，兩倍給高解析螢幕）
const PAD = 8;

export function createThumbs({ skeletons, animations, samplePose, clothes, dressUp }) {
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
  function render(doll, outfitsAndTint, { only = null, underwear = true } = {}) {
    const skeleton = skeletons[BODIES[doll.body].views.front];
    const scale = RENDER_H / skeleton.data.canvas.h;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(skeleton.data.canvas.w * scale);
    canvas.height = RENDER_H;
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
  function crop(source, box, size = OUT) {
    const out = document.createElement("canvas");
    out.width = out.height = size;
    const side = Math.max(box.w, box.h) + PAD * 2;
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    out.getContext("2d").drawImage(source, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size);
    return out.toDataURL();
  }

  function cached(key, make) {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
  }

  return {
    /** 這件衣服穿在 doll 身上的樣子（只穿這件），dye 是現在的顏色；男女素體穿不了的退回另一個素體。 */
    clothes(item, doll, dye) {
      const spec = clothes[item];
      const sprites = BODIES[doll.body].sprites;
      const body = !spec.wearers || spec.wearers.includes(sprites) ? doll.body : Object.keys(BODIES).find((id) => spec.wearers.includes(BODIES[id].sprites));
      const model = { ...doll, body };
      return cached(`c|${body}|${doll.skin}|${item}|${JSON.stringify(dye)}`, () => {
        const who = whoOf(model, false);
        const worn = { [CATEGORY_SLOT[spec.category]]: item };
        const dressed = render(model, dressUp(who, worn, clothes, { [item]: dye }), { underwear: false });   // 兩張都不畫內衣，差異才只有衣服
        const bare = render(model, dressUp(who, {}, clothes), { underwear: false });
        const box = bounds(dressed, bare) ?? bounds(dressed);
        keepDifferent(dressed, bare);   // 只留衣服本身，身體挖掉
        return crop(dressed, box);
      });
    },

    /** 娃娃的臉（頭和頭髮）。 */
    face(doll) {
      return cached(`f|${JSON.stringify({ ...doll, spot: null, name: null })}`, () => {
        const who = whoOf(doll, true);
        const look = dressUp(who, doll.worn, clothes, doll.colors);
        const head = render(doll, look, { only: new Set(["head"]) });
        const box = bounds(head);
        return crop(render(doll, look), box);
      });
    },

    /** 娃娃的全身。 */
    full(doll) {
      return cached(`b|${JSON.stringify({ ...doll, spot: null, name: null })}`, () => {
        const who = whoOf(doll, true);
        const canvas = render(doll, dressUp(who, doll.worn, clothes, doll.colors));
        return crop(canvas, bounds(canvas), 240);
      });
    },
  };
}

/** 家具等大畫布的圖：載好後裁掉四周透明的部分，縮圖才不會只剩中間一小塊。裁好前先回傳原圖，裁好呼叫 onReady 讓畫面重畫。 */
const trimmed = new Map();
export function trimmedImage(src, onReady) {
  if (trimmed.has(src)) return trimmed.get(src) ?? src;
  trimmed.set(src, null);
  const image = new Image();
  image.onload = () => {
    const canvas = Object.assign(document.createElement("canvas"), { width: image.naturalWidth, height: image.naturalHeight });
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return;
    const side = Math.max(x1 - x0, y1 - y0) + 1;
    const out = Object.assign(document.createElement("canvas"), { width: 128, height: 128 });
    out.getContext("2d").drawImage(canvas, (x0 + x1) / 2 - side / 2, (y0 + y1) / 2 - side / 2, side, side, 0, 0, 128, 128);
    trimmed.set(src, out.toDataURL());
    onReady();
  };
  image.src = src;
  return src;
}

/** 一張縮圖 img。 */
export function thumbImage(src, className = "thumb") {
  return Object.assign(document.createElement("img"), { src, className, alt: "", draggable: false });
}
