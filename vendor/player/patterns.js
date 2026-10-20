// 衣服花紋怎麼畫：每種花紋回答「原圖座標 (x, y) 被花紋蓋住多少（0～1）」。播放器染衣服、色票小預覽共用。
// 代號與中文名在規則 src/looks.ts 的 PATTERNS（test/patterns.test.ts 鎖住兩邊一致）。

/** 每種花紋一個週期（原圖像素）。人物在遊戲裡約縮成 1/14：56 在畫面上大約 4 px、84 大約 6 px。 */
export const PATTERN_PERIOD = { plaid: 84, stripes_h: 56, stripes_v: 56, dots: 56, houndstooth: 84, fishnet: 40 };   // 漁網 40：遊戲大小還看得出是網、放大不會太粗
const SAMPLES = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];   // 一個像素取四點平均，邊緣不鋸齒
const frac = (value) => value - Math.floor(value);

/** 一個週期裡的位置（u、v 都是 0～1）被蓋住多少。 */
const SHAPES = {
  stripes_h: (u, v) => (v < 0.5 ? 1 : 0),
  stripes_v: (u) => (u < 0.5 ? 1 : 0),
  plaid: (u, v) => (u < 0.3 ? 0.5 : 0) + (v < 0.3 ? 0.5 : 0),   // 橫條、直條各蓋一半，交叉處全蓋
  dots: (u, v) => (Math.hypot(u - 0.5, v - 0.5) < 0.28 ? 1 : 0),
  houndstooth: (u, v) => {   // 左上方塊是花紋、右下是底色，另外兩格是斜紋，接起來成千鳥的齒
    if (u < 0.5 && v < 0.5) return 1;
    if (u >= 0.5 && v >= 0.5) return 0;
    return frac(2 * (u + v)) < 0.5 ? 1 : 0;
  },
  fishnet: (u, v) => {   // 兩組斜線交成菱形網：線（畫面上約 1 px）是花紋，網眼是底色；透膚的衣服網眼直接透明
    const onLine = (t) => Math.min(frac(t), 1 - frac(t)) < FISHNET_LINE;
    return onLine(u + v) || onLine(u - v) ? 1 : 0;
  },
};
const FISHNET_LINE = 0.16;   // 斜線占週期的比例（兩邊各 0.16，線寬約週期的 0.32／√2）

export function patternCoverage(pattern, x, y, period = PATTERN_PERIOD[pattern]) {
  const shape = SHAPES[pattern];
  let sum = 0;
  for (const [dx, dy] of SAMPLES) {
    const u = (x + dx) / period, v = (y + dy) / period;
    const shift = pattern === "dots" && Math.floor(v) % 2 ? 0.5 : 0;   // 點點錯位排列
    sum += shape(frac(u + shift), frac(v));
  }
  return sum / SAMPLES.length;
}

export const hexRgb = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
export const dyeColor = (dye) => (typeof dye === "string" ? dye : dye.color);
/** 染色快取的鍵：素色是色碼，花紋是三個欄位接起來；透膚（sheer）另外標。 */
export const dyeCacheKey = (dye) => (typeof dye === "string" ? dye : `${dye.color}/${dye.pattern}/${dye.patternColor}${dye.sheer ? "/sheer" : ""}`);

/** 小預覽：把 canvas 塗成這個染法（色票、衣服小卡用），花紋縮到看得出兩個半週期。 */
export function paintSwatch(canvas, dye) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  if (typeof dye === "string") { ctx.fillStyle = dye; ctx.fillRect(0, 0, width, height); return canvas; }
  const image = ctx.createImageData(width, height);
  const base = hexRgb(dye.color), mark = hexRgb(dye.patternColor);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const t = patternCoverage(dye.pattern, x, y, width / 2.5);
    const i = (y * width + x) * 4;
    for (let k = 0; k < 3; k++) image.data[i + k] = Math.round(base[k] + (mark[k] - base[k]) * t);
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
