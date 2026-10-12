// 2D 骨骼播放器：骨頭階層旋轉與縮放、關鍵格插補、最短弧角度、視角鏡射。
// skeleton.json 的 pivot 是畫布像素；圖層都對齊同一張畫布，所以圖畫在「世界座標 − pivot」。
//
// 動畫角度是「身體相對」的：正數＝該段往前擺（大腿前抬、上臂前舉、頭前傾），膝蓋與手肘的正數＝彎曲。
// 每個視角在 skeleton.json 用 forward 宣告「往前」在畫面上是順時針（+1）還是逆時針（−1）；
// 正面沒有前後方向，走路這類前後動作要在 animation.views.front 另外給一組關鍵格。

export const EASING = {
  linear: t => t,
  easeInOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  easeOutQuad: t => 1 - (1 - t) * (1 - t),
  easeInQuad: t => t * t,
};

// 彎曲方向：小腿彎曲是往後折，跟「往前」相反；手肘彎曲是往前折。
const FLEXION_SIGN = { lower_leg_l: -1, lower_leg_r: -1 };

const shortestArc = (a, b) => ((b - a + 540) % 360) - 180;

const BODY_TINT_BONES = new Set(["torso", "upper_arm_l", "upper_arm_r", "upper_leg_l", "upper_leg_r"]);   // 「基本身體染主色」染這幾個部位
const HEM_FOLLOW = 1;   // 裙襬跟著大腿轉的比例（骨架檔 hemFollow 可覆寫）
const HEM_SQUASH = 0.5;   // 裙襬彎 90° 時寬度壓掉幾成（骨架檔 hemSquash 可覆寫；壓更多會像縮水，少了漫畫的蓬度）
const HEM_PIVOT = [0, -20];   // 裙襬支點從髖關節中點往後、往上挪幾 px（骨架檔 hemPivot 可覆寫）；預設是往下 20
const SLEEVE_BONES = new Set(["upper_arm_l", "upper_arm_r", "lower_arm_l", "lower_arm_r"]);   // 外套袖子會整個包住裡面衣服的部位
const COAT_EDGE_PAD = 256;   // 外套外緣往外算幾 px 的範圍，裡面衣服的軀幹片在這裡不畫（夠蓋過蓬起來的裙子就好）
const COAT_EDGE_BAND = 8;    // 離外套最左（右）邊幾 px 內的像素算那一側的前襟，用它最低的一點當那一側的下襬
// 某根骨頭上的衣服延到另一根骨頭畫完才畫：小腿的衣服（褲管）等腳和鞋子，褲管才會蓋在腳背上；前臂的衣服（長袖）等手，袖口蓋在手腕上。
// 骨架檔可以用 garmentAfter 再加，例如斜後 { "head": "torso" }：頭的皮膚壓在軀幹底下，頭髮等身體和衣領畫完才蓋上去。
// 等的骨頭要排在後面，排在前面的等不到、那片就不會畫；
// 鍵 <骨頭>:clip 是補片：畫在那根骨頭的皮膚之後、衣服之前，只露在同一套衣服的褲頭片（軀幹片）範圍裡。
// 短褲的近側大腿補片：站著時大腿關節球在腰線上方、不在褲頭片裡，看不到；坐下轉到屁股後落進褲頭片範圍，才蓋住露出的皮膚。
// 只在那根骨頭相對上一節彎超過 CLIP_MIN_BEND 時畫：走路擺 25° 時關節球剛好擦過腰帶上緣，畫了反而多一條色帶。
const CLIP_MIN_BEND = 45;
// outfitAfter 只對某套衣服加，例如裙子 { "upper_leg_l": "lower_leg_l" } 讓裙襬蓋在小腿上（長褲不用）；
// 鍵也可以是單片的零件圖檔名，例如外套 { "torso": "upper_leg_l", "front34_tpl_coat_collar.png": "upper_arm_l" }：身體蓋大腿、領片蓋近側袖子。
const DYE_LINE_LUM = 0.25;   // 比這暗的像素算輪廓線，不算進布料的平均亮度
const DYE_MAX_GAIN = 1.25;  // 亮部最多比目標色亮這麼多（再亮就被截成目標色的 1.25 倍）
const GARMENT_AFTER = { lower_leg_l: "foot_l", lower_leg_r: "foot_r", lower_arm_l: "hand_l", lower_arm_r: "hand_r" };
// 灰稿素體（骨架檔 skinGray）的漸層對應：像素亮度 ÷ 全身平均亮度（skinBase）＝ 相對亮度，照下面幾個點內插出顏色。
// 每個點是主膚色的倍率（暗部偏暖：紅掉得少、藍掉得多），暖色偏移與陰影深度照膚色深淺收斂（見 shadowRatio）；
// null 是亮部：主膚色提亮 SKIN_LIGHT_LIFT 倍再混一點白（混太多白，深膚色的亮部會變成灰白斑）。
const SKIN_STOPS = [[0, [0.45, 0.28, 0.22]], [0.55, [0.76, 0.55, 0.49]], [0.8, [0.94, 0.8, 0.74]], [1, [1, 1, 1]], [1.2, null]];
const SKIN_LIGHT_LIFT = 1.15;
const SKIN_LIGHT_MIX = 0.2;
const SKIN_DARKEST_SHADOW = 0.65;   // 最深的膚色，陰影只壓到最淺膚色陰影深度的這個比例
const SKIN_ART_TINT = [0.933, 0.902, 0.867];   // 舊素體原圖的平均色：主膚色＝玩家選的膚色×它，新舊素體選同一個膚色一樣深
const DEFAULT_SKIN = "#ffe8d1";
const OUTLINE_COLOR = "#4c291a";   // 灰稿素體的外框色（手繪素體原本輪廓線的顏色）
const OUTLINE_WIDTH = 0.6;         // 外框寬度，以呼叫端畫布的座標單位計（房間畫布裡是 1 個邏輯 px），會跟著畫面縮放
const LIMB_OF = Object.fromEntries([
  ["core", ["torso", "head"]],
  ...["l", "r"].flatMap((side) => [[`arm_${side}`, [`upper_arm_${side}`, `lower_arm_${side}`, `hand_${side}`]], [`leg_${side}`, [`upper_leg_${side}`, `lower_leg_${side}`, `foot_${side}`]]]),
].flatMap(([limb, bones]) => bones.map((bone) => [bone, limb])));   // 骨頭屬於哪條肢體：同一條肢體內的交界是關節，不補線
const OUTLINE_DIRECTIONS =[[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]];

/** 主膚色（RGB 0～255）：玩家選的膚色 × 舊素體原圖的平均色。 */
const mainSkin = (skin) => [1, 3, 5].map((k, i) => parseInt(skin.slice(k, k + 2), 16) * SKIN_ART_TINT[i]);
const luminance = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/** 陰影點的倍率照膚色深淺收斂：越深的膚色，暖色偏移越小（三個色版往平均靠）、陰影越淺（不往黑壓）。lightness：最淺的膚色＝ 1。 */
function shadowRatio(ratio, lightness) {
  const mean = ratio.reduce((sum, r) => sum + r) / ratio.length;
  const depth = SKIN_DARKEST_SHADOW + (1 - SKIN_DARKEST_SHADOW) * lightness;
  return ratio.map((r) => 1 - (1 - (mean + (r - mean) * lightness)) * depth);
}

export class Skeleton {
  constructor(data, images, offsets = {}) {
    this.data = data;
    this.images = images;
    this.offsets = offsets;   // 裁過的零件圖在原畫布上的左上角（scripts/asset_images.py 寫的）
    this.forward = data.forward ?? 1;
    this.partsLoaded = 0;   // 開頁後才載好的零件（lazyOutfits）有幾片：多一片，畫好的人像（memo）就要重畫
    this.bones = new Map(data.bones.map(b => [b.name, b]));
    this.rebuild();
  }

  /** 還沒載的零件開始載（每片只載一次，載不到也不重試）；loadSkeleton 沒開 lazyOutfits 時沒有 loadPart，什麼都不做。 */
  requestPart(slot) {
    if (!this.loadPart) return;
    this.pendingParts ??= new Map();
    if (!this.pendingParts.has(slot)) this.pendingParts.set(slot, this.loadPart(slot));
  }

  /** 先載好這幾套（draw 的 outfits 格式）的所有零件：換裝時先載，人轉到這個視角時衣服已經在，不會閃出素體。 */
  preloadOutfits(outfits) {
    for (const outfit of outfits) {
      let entry = typeof outfit === "string" ? { name: outfit } : outfit;
      while (entry && !this.data.outfits?.[entry.name] && entry.fallback) entry = typeof entry.fallback === "string" ? { name: entry.fallback } : entry.fallback;
      for (const slot of Object.values(this.data.outfits?.[entry?.name] ?? {}).flat()) this.requestPart(slot);
    }
  }

  /** 已經開始載的零件全部載完（成功或失敗）。 */
  partsSettled() {
    return Promise.all(this.pendingParts?.values() ?? []);
  }

  /** pivot 改變後重算每根骨相對父骨的偏移。 */
  rebuild() {
    for (const bone of this.data.bones) {
      const parent = bone.parent ? this.bones.get(bone.parent) : null;
      bone.local = parent ? [bone.pivot[0] - parent.pivot[0], bone.pivot[1] - parent.pivot[1]] : [...bone.pivot];
      bone.children = this.data.bones.filter(b => b.parent === bone.name);
    }
  }

  screenAngle(boneName, p) {
    if (p.screen) return p.angle || 0;   // 視角專屬關鍵格：角度就是畫面上的角度，不做前後換算
    return (p.angle || 0) * this.forward * (FLEXION_SIGN[boneName] ?? 1);
  }

  /** 畫面上比較低的那隻手（"l" 或 "r"）：兩人抱在一起時，這隻要繞到對方身後。 */
  lowerArm(pose) {
    const world = this.solve(pose);
    return (world.get("hand_l")?.pos[1] ?? 0) >= (world.get("hand_r")?.pos[1] ?? 0) ? "l" : "r";
  }

  /** 前序走訪：父先子後，算每根骨的世界位置、角度、縮放。pose 是 {boneName: {angle, x, y, sx, sy}} */
  solve(pose) {
    const world = new Map();
    const visit = (bone, parent) => {
      const p = pose[bone.name] || {};
      const rad = (parent.rot * Math.PI) / 180;
      const lx = (bone.local[0] + (p.x || 0)) * parent.scale[0];
      const ly = (bone.local[1] + (p.y || 0)) * parent.scale[1];
      const w = {
        pos: [parent.pos[0] + lx * Math.cos(rad) - ly * Math.sin(rad), parent.pos[1] + lx * Math.sin(rad) + ly * Math.cos(rad)],
        rot: parent.rot + this.screenAngle(bone.name, p),
        scale: [parent.scale[0] * (p.sx ?? 1) * (bone.scale ?? 1), parent.scale[1] * (p.sy ?? 1) * (bone.scale ?? 1)],   // bone.scale：骨架檔給的固定縮放（例如把頭調小）
      };
      world.set(bone.name, w);
      for (const child of bone.children) visit(child, w);
    };
    visit(this.bones.get(this.data.root), { pos: [0, 0], rot: 0, scale: [1, 1] });
    return world;
  }

  /** 零件圖在整張畫布上的位置。整張畫布大小的圖是還沒裁的，不套位移。 */
  offsetOf(slot) {
    const { naturalWidth, naturalHeight } = this.images[slot];
    const full = naturalWidth === this.data.canvas.w && naturalHeight === this.data.canvas.h;
    return full ? [0, 0] : this.offsets[slot] ?? [0, 0];
  }

  /** 灰稿皮膚上膚色（漸層對應，見 SKIN_STOPS）：陰影照比例變暗偏暖、亮部往白色混，結果依顏色快取。 */
  graded(slot, skin) {
    const key = `skin|${slot}|${skin}`;
    if (!this.tintCache) this.tintCache = new Map();
    if (this.tintCache.has(key)) return this.tintCache.get(key);
    const main = mainSkin(skin);
    const lightness = Math.min(1, luminance(main) / luminance(mainSkin(DEFAULT_SKIN)));   // 膚色多淺：預設膚色（最淺）＝ 1
    const stops = SKIN_STOPS.map(([at, ratio]) => [at, ratio ? shadowRatio(ratio, lightness).map((r, i) => main[i] * r) : main.map((c) => {
      const lifted = Math.min(255, c * SKIN_LIGHT_LIFT);
      return lifted + (255 - lifted) * SKIN_LIGHT_MIX;
    })]);
    const source = this.images[slot];
    const canvas = document.createElement("canvas");
    canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
    const c = canvas.getContext("2d", { willReadFrequently: true });
    c.drawImage(source, 0, 0);
    const image = c.getImageData(0, 0, canvas.width, canvas.height);
    const px = image.data;
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      const r = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255 / this.data.skinBase;
      const found = stops.findIndex(([at]) => at >= r);
      const upper = found < 0 ? stops.length - 1 : Math.max(1, found);   // 比最亮的點還亮：用最後一段（t 截在 1）
      const [a0, c0] = stops[upper - 1], [a1, c1] = stops[upper];
      const t = Math.min(1, Math.max(0, (r - a0) / (a1 - a0)));
      for (let k = 0; k < 3; k++) px[i + k] = Math.min(255, Math.round(c0[k] + (c1[k] - c0[k]) * t));
    }
    c.putImageData(image, 0, 0);
    this.tintCache.set(key, canvas);
    return canvas;
  }

  /** 零件圖乘上一個顏色（膚色、衣服主色），結果依顏色快取。 */
  /** 衣服染色：先去色，每個像素的亮度除以這片布的平均亮度（不算深色輪廓線），再乘上目標色。
   *  布料主色剛好變成目標色，陰影、亮部照比例變深變淺；輪廓線本來就深，染完還是深。灰色畫的衣服最準，有顏色的舊衣服也能染。 */
  dyed(slot, color) {
    const key = `dye|${slot}|${color}`;
    if (!this.tintCache) this.tintCache = new Map();
    if (this.tintCache.has(key)) return this.tintCache.get(key);
    const source = this.images[slot];
    const canvas = document.createElement("canvas");
    canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
    const c = canvas.getContext("2d", { willReadFrequently: true });
    c.drawImage(source, 0, 0);
    const image = c.getImageData(0, 0, canvas.width, canvas.height);
    const px = image.data;
    const lum = (i) => (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
    let sum = 0, count = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 128) { const l = lum(i); if (l > DYE_LINE_LUM) { sum += l; count++; } }
    const base = count ? sum / count : 1;
    const target = [1, 3, 5].map((k) => parseInt(color.slice(k, k + 2), 16));
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      const g = Math.min(DYE_MAX_GAIN, lum(i) / base);
      for (let k = 0; k < 3; k++) px[i + k] = Math.min(255, Math.round(target[k] * g));
    }
    c.putImageData(image, 0, 0);
    this.tintCache.set(key, canvas);
    return canvas;
  }

  /** 外套軀幹片左右外緣以外、各自那一側的下襬以上的區域（不透明＝要挖掉），依外套零件快取；零件還沒載好回 null。
   *  回傳 { canvas, x, y }：x、y 是這張圖左上角在原畫布上的位置。 */
  coatOutside(slots) {
    const key = slots.join("|");
    this.coatOutsideCache ??= new Map();
    if (this.coatOutsideCache.has(key)) return this.coatOutsideCache.get(key);
    if (slots.some((slot) => !this.images[slot])) return null;
    const boxes = slots.map((slot) => { const [x, y] = this.offsetOf(slot); return [x, y, x + this.images[slot].naturalWidth, y + this.images[slot].naturalHeight]; });
    const left = Math.min(...boxes.map((b) => b[0])) - COAT_EDGE_PAD, top = Math.min(...boxes.map((b) => b[1]));
    const width = Math.max(...boxes.map((b) => b[2])) + COAT_EDGE_PAD - left, height = Math.max(...boxes.map((b) => b[3])) - top;
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const c = canvas.getContext("2d", { willReadFrequently: true });
    slots.forEach((slot, i) => c.drawImage(this.images[slot], boxes[i][0] - left, boxes[i][1] - top));
    const alpha = c.getImageData(0, 0, width, height).data;
    const rows = [];   // 每一列外套的最左、最右像素
    for (let y = 0; y < height; y++) {
      let first = -1, last = -1;
      for (let x = 0; x < width; x++) if (alpha[(y * width + x) * 4 + 3] > 16) { if (first < 0) first = x; last = x; }
      rows.push(first < 0 ? null : [first, last]);
    }
    const solid = rows.filter(Boolean);
    const leftmost = Math.min(...solid.map(([first]) => first)), rightmost = Math.max(...solid.map(([, last]) => last));
    const hemOf = (onEdge) => rows.reduce((bottom, row, y) => (row && onEdge(row) ? y : bottom), -1);
    const leftHem = hemOf(([first]) => first <= leftmost + COAT_EDGE_BAND), rightHem = hemOf(([, last]) => last >= rightmost - COAT_EDGE_BAND);
    const zone = c.createImageData(width, height);
    rows.forEach((row, y) => {
      if (!row) return;
      if (y <= leftHem) for (let x = 0; x < row[0]; x++) zone.data[(y * width + x) * 4 + 3] = 255;
      if (y <= rightHem) for (let x = row[1] + 1; x < width; x++) zone.data[(y * width + x) * 4 + 3] = 255;
    });
    c.putImageData(zone, 0, 0);
    const outside = { canvas, x: left, y: top };
    this.coatOutsideCache.set(key, outside);
    return outside;
  }

  /** 裡面衣服的軀幹片挖掉外套外緣以外的部分（coatOutside），結果依零件、顏色、外套快取。 */
  insideCoat(image, slot, tint, coatSlots) {
    const outside = this.coatOutside(coatSlots);
    if (!outside) { coatSlots.forEach((coatSlot) => this.requestPart(coatSlot)); return image; }
    const key = `coat|${slot}|${tint}|${coatSlots.join("|")}`;
    this.tintCache ??= new Map();
    if (this.tintCache.has(key)) return this.tintCache.get(key);
    const [ox, oy] = this.offsetOf(slot);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth ?? image.width; canvas.height = image.naturalHeight ?? image.height;
    const c = canvas.getContext("2d");
    c.drawImage(image, 0, 0);
    c.globalCompositeOperation = "destination-out"; c.drawImage(outside.canvas, outside.x - ox, outside.y - oy);
    this.tintCache.set(key, canvas);
    return canvas;
  }

  tinted(slot, color) {
    const key = `${slot}|${color}`;
    if (!this.tintCache) this.tintCache = new Map();
    if (this.tintCache.has(key)) return this.tintCache.get(key);
    const source = this.images[slot];
    const canvas = document.createElement("canvas");
    canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
    const c = canvas.getContext("2d");
    c.drawImage(source, 0, 0);
    c.globalCompositeOperation = "multiply"; c.fillStyle = color; c.fillRect(0, 0, canvas.width, canvas.height);
    c.globalCompositeOperation = "destination-in"; c.drawImage(source, 0, 0);
    this.tintCache.set(key, canvas);
    return canvas;
  }

  /** outfits：要穿的零件套（skeleton.outfits 的鍵，可多個，例如臉、頭髮、眼鏡、衣服）；每一項可以是套名，或 { name, tint } 把那套乘上顏色（大類模板染成衣服主色）。
   *  { outer: true } 標成外套：它有袖子片的手臂，前面穿的衣服在那隻手臂上不畫。
   *  { bones: [...] } 只畫這幾根骨頭的片（無袖帽 T 接 T 恤的袖子：T 恤模板只畫上臂）。
   *  { sleeved: true } 這件另外接了袖子：袖孔補片（torso:armhole）照畫。
   *  skin：膚色（CSS 顏色）：舊素體乘在皮膚層上、沒給就用原圖；灰稿素體（skinGray）用漸層對應，沒給用 DEFAULT_SKIN。
   *  bodyTint：連大類模板都沒有時，軀幹與四肢上段的皮膚乘上衣服主色（「基本身體染主色」）。
   *  only：只畫這些骨頭（Set）；兩人抱在一起時把一隻手拆出來先畫，才能繞到對方身後。
   *  underwear：false 就連內衣也不畫（泡澡）。
   *  layer："behind" 只畫皮膚底下的零件（後髮），"front" 不畫它們；沒給就全畫。從後面抱時被抱的人的後髮要塞到抱人的身體後面。
   *  灰稿素體沒有輪廓線，整個人（或 only 拆出來的那幾根）畫好後在最外圈補一道外框（OUTLINE_COLOR）。 */
  /** memo（呼叫端每個人一份）＋poseTolerance：同一個人衣服、縮放、面向都沒變、也沒有新載好的零件，姿勢跟上次畫的差不到 poseTolerance
   *  （角度幾度、位移幾個骨架單位）時，直接貼上次畫好的人像（含外框、交疊線），人移動了就平移過去貼。
   *  站、坐、躺的呼吸起伏不到 1 px，重用看不出差別；畫一個人要疊十幾次圖，同一間房人多時靠這個省下大半。
   *  看姿勢不看時間：畫面越慢越該重用，不能因為一幀太久就全部重畫。回傳這次有沒有真的重畫（false＝貼了上次的人像）。 */
  draw(ctx, pose, options = {}) {
    if (!this.data.skinGray) { this.drawParts(ctx, pose, options); return true; }
    const { x = 0, y = 0, scale = 1, facing = 1, memo = null, poseTolerance = 0 } = options;
    const m = ctx.getTransform();
    const origin = [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];   // 這次畫在畫面上的哪裡（人像本身跟位置無關）
    const inputs = memo && [this, this.partsLoaded, scale, facing, m.a, m.b, m.c, m.d, options.outfits, options.skin, options.bodyTint, options.only, options.layer, options.underwear];
    if (memo?.canvas && poseTolerance > 0 && inputs.every((value, i) => value === memo.inputs[i]) && posesClose(pose, memo.pose, poseTolerance)) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(memo.canvas, memo.left + origin[0] - memo.origin[0], memo.upper + origin[1] - memo.origin[1]);
      ctx.restore();
      return false;
    }
    const { w: canvasW, h: canvasH } = this.data.canvas;
    const build = this.data.scale ?? 1;
    const centerX = x + (facing * canvasW * scale) / 2, footY = y + canvasH * scale;
    const width = Math.max(1, Math.hypot(m.a, m.b) * OUTLINE_WIDTH);   // 外框在畫面上的寬度（跟著人物的縮放）
    const toScreen = ([cx, cy]) => m.transformPoint(new DOMPoint(centerX + (cx - canvasW / 2) * scale * facing * build, footY + (cy - canvasH) * scale * build));
    // 暫存畫布涵蓋整張骨架畫布，加上擺好姿勢後伸出畫布的皮膚（靠坐時往前伸的腳掌）
    const canvasCorners = [[0, 0], [canvasW, 0], [0, canvasH], [canvasW, canvasH]];
    const corners = [...canvasCorners, ...this.posedCorners(pose, options.only)].map(toScreen);
    const pad = Math.ceil(width) + 2;
    const left = Math.floor(Math.min(...corners.map((p) => p.x))) - pad, right = Math.ceil(Math.max(...corners.map((p) => p.x))) + pad;
    const upper = Math.floor(Math.min(...corners.map((p) => p.y))) - pad, lower = Math.ceil(Math.max(...corners.map((p) => p.y))) + pad;
    const [body, shape] = this.outlineCanvases(right - left, lower - upper);
    const bodyCtx = body.getContext("2d");
    bodyCtx.setTransform(1, 0, 0, 1, 0, 0); bodyCtx.clearRect(0, 0, body.width, body.height);
    bodyCtx.setTransform(m.a, m.b, m.c, m.d, m.e - left, m.f - upper);
    this.drawParts(bodyCtx, pose, options);
    this.drawLimbLines(body, pose, options, bodyCtx.getTransform(), width, right - left, lower - upper);
    const shapeCtx = shape.getContext("2d");
    shapeCtx.globalCompositeOperation = "source-over"; shapeCtx.clearRect(0, 0, shape.width, shape.height);
    shapeCtx.drawImage(body, 0, 0);
    shapeCtx.globalCompositeOperation = "source-in"; shapeCtx.fillStyle = OUTLINE_COLOR; shapeCtx.fillRect(0, 0, shape.width, shape.height);
    const w = right - left, h = lower - upper;
    if (!memo) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const [dx, dy] of OUTLINE_DIRECTIONS) ctx.drawImage(shape, 0, 0, w, h, left + dx * width, upper + dy * width, w, h);
      ctx.drawImage(body, 0, 0, w, h, left, upper, w, h);
      ctx.restore();
      return true;
    }
    // 畫進這個人自己的畫布（外框往外偏的量在 pad 裡，不會被切掉），存起來下次重用，再貼到畫面上
    memo.canvas ??= document.createElement("canvas");
    if (memo.canvas.width !== w || memo.canvas.height !== h) { memo.canvas.width = w; memo.canvas.height = h; }
    const memoCtx = memo.canvas.getContext("2d");
    memoCtx.clearRect(0, 0, w, h);
    for (const [dx, dy] of OUTLINE_DIRECTIONS) memoCtx.drawImage(shape, 0, 0, w, h, dx * width, dy * width, w, h);
    memoCtx.drawImage(body, 0, 0, w, h, 0, 0, w, h);
    Object.assign(memo, { inputs, pose, origin, left, upper });
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(memo.canvas, left, upper); ctx.restore();
    return true;
  }

  /** 擺好姿勢後，每片皮膚零件四個角在骨架畫布座標上的位置（only：只算這些骨頭）。 */
  posedCorners(pose, only = null) {
    const world = this.solve(pose);
    const corners = [];
    for (const name of this.data.zOrder) {
      if (only && !only.has(name)) continue;
      const bone = this.bones.get(name), w = world.get(name);
      const rad = (w.rot * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
      const variant = pose[name]?.variant;
      for (const slot of (variant && bone.variants?.[variant]) || bone.slots) {
        const image = this.images[slot];
        if (!image) continue;
        const [ox, oy] = this.offsetOf(slot);
        const left = ox - bone.pivot[0], top = oy - bone.pivot[1];
        for (const [px, py] of [[left, top], [left + image.naturalWidth, top], [left, top + image.naturalHeight], [left + image.naturalWidth, top + image.naturalHeight]]) {
          const sx = px * w.scale[0], sy = py * w.scale[1];
          corners.push([w.pos[0] + sx * cos - sy * sin, w.pos[1] + sx * sin + sy * cos]);
        }
      }
    }
    return corners;
  }

  /** 肢體交疊處補線（灰稿素體沒有輪廓線，腿疊腿、手放在腿上會糊成一片）：疊圖順序裡連續屬於同一條肢體的部位併成一組，
   *  整組的剪影往外擴一圈，只留在「已經畫在它底下、又不是同一條肢體或上下一節」的地方。以整組算，關節的圓頭藏在肢體裡面，
   *  不會被描出來；之後疊上來的部位會把線蓋掉。 */
  drawLimbLines(body, pose, options, transform, width, w, h) {
    const bones = this.data.zOrder.filter((name) => !options.only || options.only.has(name));
    const groups = [];
    for (const name of bones) {
      const last = groups.at(-1);
      if (last && LIMB_OF[last[0]] === LIMB_OF[name]) last.push(name); else groups.push([name]);
    }
    const [below, line, lines, late, ...masks] = this.limbCanvases(groups.length + 4, w, h);
    const reset = (canvas) => { const c = canvas.getContext("2d"); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = "source-over"; c.clearRect(0, 0, w, h); return c; };
    const linesCtx = reset(lines);
    groups.forEach((group, i) => {
      const maskCtx = reset(masks[i]);
      maskCtx.setTransform(transform);
      this.drawParts(maskCtx, pose, { ...options, only: new Set(group), under: false });
      const belowCtx = reset(below);
      groups.slice(0, i).forEach((other, j) => { if (!group.some((a) => other.some((b) => this.jointed(a, b)))) belowCtx.drawImage(masks[j], 0, 0); });
      const lineCtx = reset(line);
      for (const [dx, dy] of OUTLINE_DIRECTIONS) lineCtx.drawImage(masks[i], dx * width, dy * width);
      lineCtx.globalCompositeOperation = "source-in"; lineCtx.fillStyle = OUTLINE_COLOR; lineCtx.fillRect(0, 0, w, h);
      lineCtx.globalCompositeOperation = "destination-in"; lineCtx.drawImage(below, 0, 0);
      lineCtx.globalCompositeOperation = "destination-out"; lineCtx.drawImage(masks[i], 0, 0);
      linesCtx.globalCompositeOperation = "destination-out"; linesCtx.drawImage(masks[i], 0, 0);   // 這組蓋住的舊線看不到了
      linesCtx.globalCompositeOperation = "source-over"; linesCtx.drawImage(line, 0, 0);
      const lateCtx = reset(late);   // 延到這組畫完才畫的衣服（背心裙等腿畫完）也會蓋掉線
      lateCtx.setTransform(transform);
      this.drawParts(lateCtx, pose, { ...options, lateAfter: new Set(group) });
      linesCtx.globalCompositeOperation = "destination-out"; linesCtx.drawImage(late, 0, 0);
    });
    const bodyCtx = body.getContext("2d");
    bodyCtx.save(); bodyCtx.setTransform(1, 0, 0, 1, 0, 0); bodyCtx.drawImage(lines, 0, 0); bodyCtx.restore();
  }

  /** 兩個部位接在一起（同一條肢體，或一個是另一個的上一節）：交界是關節，不補線。 */
  jointed(a, b) {
    return LIMB_OF[a] === LIMB_OF[b] || this.bones.get(a)?.parent === b || this.bones.get(b)?.parent === a;
  }

  /** 肢體交疊線用的暫存畫布，夠多、夠大就重複用。 */
  limbCanvases(count, width, height) {
    this.limbWork ??= [];
    while (this.limbWork.length < count) this.limbWork.push(document.createElement("canvas"));
    for (const canvas of this.limbWork) {
      if (canvas.width < width) canvas.width = width;
      if (canvas.height < height) canvas.height = height;
    }
    return this.limbWork;
  }

  /** 畫外框用的兩張暫存畫布（人物本體、剪影），夠大就重複用。 */
  outlineCanvases(width, height) {
    this.outlineWork ??= [document.createElement("canvas"), document.createElement("canvas")];
    for (const canvas of this.outlineWork) {
      if (canvas.width < width) canvas.width = width;
      if (canvas.height < height) canvas.height = height;
    }
    return this.outlineWork;
  }

  /** lateAfter：只畫「延到這些骨頭畫完才畫」的衣服片，其他都不畫（肢體交疊線用來擦掉被它們蓋住的線）。
   *  under：false 就不畫墊底的零件（外套底片）；肢體交疊線算各組輪廓時不算它，底片邊緣才不會描在遠側手臂上。 */
  drawParts(ctx, pose, { x = 0, y = 0, scale = 1, facing = 1, outfits = [], skin = null, bodyTint = null, only = null, underwear = true, layer = null, lateAfter = null, under = true } = {}) {
    // 這個視角還沒有某套的圖，就換成它的 fallback（例如只拆了正面的手繪衣服，其他角度先穿舊的那套）
    const resolve = (outfit) => {
      const entry = typeof outfit === "string" ? { name: outfit, tint: null } : outfit;
      if (this.data.outfits?.[entry.name] || !entry.fallback) return entry;
      const { outer, tuck, top, bones, sleeved, dy } = entry;
      return { ...resolve(entry.fallback), outer, tuck, top, bones, sleeved, dy };   // 換成備用套也還是外套、一樣紮進下身、一樣只蓋上半身、一樣只畫那幾根骨頭、一樣往下移
    };
    const wearing = outfits.map(resolve);
    const world = this.solve(pose);
    ctx.save();
    const { w: canvasW, h: canvasH } = this.data.canvas;
    const build = this.data.scale ?? 1;   // 骨架檔的整體身高倍率，以腳底中心放大，腳留在原地
    ctx.translate(x + (facing * canvasW * scale) / 2, y + canvasH * scale);   // 鏡射時呼叫端給的是右邊緣，所以中心在左邊
    ctx.scale(scale * facing * build, scale * build);
    ctx.translate(-canvasW / 2, -canvasH);
    const garmentAfter = { ...GARMENT_AFTER, ...this.data.garmentAfter };
    const deferred = new Map();   // 等某根骨頭畫完才畫的衣服：骨頭名 → [{ transform, pivot, pieces }]
    const placed = new Map();     // 已經畫過的骨頭 → 它的座標轉換（補片用軀幹的褲頭片當遮罩）
    const drawPieces = (list, pivot, bodyColor, target = ctx) => {
      for (const { slot, tint, coat, dy = 0 } of list) {
        if (!this.images[slot]) { this.requestPart(slot); continue; }
        const isSkin = slot.includes("skin_");
        const look = tint ? this.dyed(slot, tint)
          : isSkin && bodyColor ? (this.data.skinGray ? this.dyed(slot, bodyColor) : this.tinted(slot, bodyColor))
          : isSkin && this.data.skinGray ? this.graded(slot, skin ?? DEFAULT_SKIN)
          : isSkin && skin ? this.tinted(slot, skin)
          : this.images[slot];
        const image = coat ? this.insideCoat(look, slot, tint, coat) : look;
        const [ox, oy] = this.offsetOf(slot);
        target.drawImage(image, ox - pivot[0], oy - pivot[1] + dy);   // dy：整套往下移（捏角調五官高度），骨頭座標
      }
    };
    // 延後畫的一組零件；帶 mask（軀幹皮膚）時只畫在軀幹範圍外：遠側外套袖子要蓋過裡面衣服露在肩膀外的邊，卻不能跑到胸口前面。
    // inside 反過來只畫在 mask 範圍內：大腿的補片（鍵 <骨頭>:clip）只露在同一套的褲頭片範圍裡
    const drawEntry = ({ transform, pivot, pieces: waiting, mask, inside = false }) => {
      if (!mask) { ctx.save(); ctx.setTransform(transform); drawPieces(waiting, pivot, null); ctx.restore(); return; }
      const work = (this.maskWork ??= document.createElement("canvas"));
      if (work.width !== ctx.canvas.width || work.height !== ctx.canvas.height) { work.width = ctx.canvas.width; work.height = ctx.canvas.height; }
      const w = work.getContext("2d");
      w.setTransform(1, 0, 0, 1, 0, 0); w.globalCompositeOperation = "source-over"; w.clearRect(0, 0, work.width, work.height);
      w.setTransform(transform); drawPieces(waiting, pivot, null, w);
      w.setTransform(mask.transform); w.globalCompositeOperation = inside ? "destination-in" : "destination-out"; drawPieces(mask.pieces, mask.pivot, null, w);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(work, 0, 0); ctx.restore();
    };
    const afterOf = (outfit, key, slot) => this.data.outfitAfter?.[outfit]?.[slot] ?? this.data.outfitAfter?.[outfit]?.[key];   // 單片設定（外套領片）優先於整根骨頭
    // 外套（outer）在這隻手臂有袖子片時，比它先穿的衣服在同一隻手臂的袖子不畫：舉手時裡面的袖子才不會從腋下露出來；無袖外套沒有手臂片，裡面照畫
    const sleeveCovered = (index, key) => SLEEVE_BONES.has(key) && wearing.some((entry, later) => later > index && entry.outer && this.data.outfits?.[entry.name]?.[key]?.length);
    // 外套有軀幹片時，比它先穿的衣服的軀幹片挖掉外套外緣以外的部分：蓬起來的裙子才不會從遠側窄窄的前襟外面露出來。
    // 只挖軀幹片：跟外套一樣在軀幹座標裡、不會轉開；大腿片和裙襬坐下時會往前伸，不挖
    const coatOver = (index) => wearing.find((entry, later) => later > index && entry.outer && this.data.outfits?.[entry.name]?.torso?.length);
    const pieces = (key) => wearing.flatMap(({ name: outfit, tint, tuck, bones, sleeved, dy }, index) => {
      if (sleeveCovered(index, key) || (bones && !bones.includes(key))) return [];
      const coat = key === "torso" ? this.data.outfits?.[coatOver(index)?.name]?.torso : undefined;
      const own = (this.data.outfits?.[outfit]?.[key] ?? []).map(slot => ({ slot, tint, index, after: afterOf(outfit, key, slot), coat, dy }));
      // 裙襬（鍵 hem）畫在同一套的軀幹片底下、跟它一起延後（蓋在大腿和身體上），畫的時候繞髖部轉（hemSpace）；
      // 走路時兩腿一起往前也會小轉一點，裙襬上緣靠軀幹片蓋住才不會露出歪掉的腰帶
      const hem = key === "torso" ? (this.data.outfits?.[outfit]?.hem ?? []).map(slot => ({ slot, tint, index, after: afterOf(outfit, "torso", slot), hem: true })) : [];
      // 紮進下身的上衣（鍵 torso:tuck）：下襬往下延長的那片，有穿下身（tuck）才畫，蓋在褲頭底下；沒穿下身時不畫，才不會露出一截延長的布
      const tucked = key === "torso" && tuck ? (this.data.outfits?.[outfit]?.["torso:tuck"] ?? []).map(slot => ({ slot, tint, index, after: afterOf(outfit, "torso", slot), coat })) : [];
      // 袖孔補片（鍵 torso:armhole）：這件有袖子（自己的上臂片，或 sleeved：另外接的袖子）才畫，手舉起來袖孔露出的是布
      const hasSleeves = sleeved || ["upper_arm_l", "upper_arm_r"].some((bone) => this.data.outfits?.[outfit]?.[bone]?.length);
      const armhole = key === "torso" && hasSleeves ? (this.data.outfits?.[outfit]?.["torso:armhole"] ?? []).map(slot => ({ slot, tint, index, after: afterOf(outfit, "torso", slot), coat })) : [];
      return [...hem, ...tucked, ...armhole, ...own];
    });
    const boneSpace = (name) => {
      const w = world.get(name);
      ctx.translate(w.pos[0], w.pos[1]);
      ctx.rotate((w.rot * Math.PI) / 180);
      ctx.scale(w.scale[0], w.scale[1]);
    };
    // 裙襬：在軀幹座標裡繞兩個髖關節的中點轉，角度是兩條大腿相對軀幹「一起彎」的量
    // （同方向取彎得少的那條，一前一後就不轉）：坐下時鋪在大腿上，走路時不跟著擺、不會分成兩根褲管
    const hemSpace = () => {
      const torso = this.bones.get("torso"), legs = ["upper_leg_l", "upper_leg_r"].map((n) => this.bones.get(n));
      if (legs.some((leg) => !leg)) return;
      const [a, b] = legs.map((leg) => world.get(leg.name).rot - world.get("torso").rot);
      const bend = (a * b > 0 ? Math.sign(a) * Math.min(Math.abs(a), Math.abs(b)) : 0) * (this.data.hemFollow ?? HEM_FOLLOW);
      // 支點從兩個髖關節的中點往後（臀部）、往上（腰）挪：坐下時裙子後面壓在臀部下不動，只有前面往大腿轉
      const [back, up] = this.data.hemPivot ?? HEM_PIVOT;
      const hx = (legs[0].pivot[0] + legs[1].pivot[0]) / 2 - torso.pivot[0] + back * this.forward;   // 大腿往前抬是往畫面 −x 掃（forward 1），所以背後是 +x
      const hy = (legs[0].pivot[1] + legs[1].pivot[1]) / 2 - torso.pivot[1] - up;
      // 轉開時順著角度把裙子左右的寬度壓窄（彎 90° 壓最多），張很開的裙襬鋪在大腿上才不會疊成厚厚一坨
      const squash = 1 - (this.data.hemSquash ?? HEM_SQUASH) * Math.min(Math.abs(bend), 90) / 90;
      ctx.translate(hx, hy); ctx.rotate((bend * Math.PI) / 180); ctx.scale(squash, 1); ctx.translate(-hx, -hy);
    };
    // 墊在整個人最下面的零件（外套底片，鍵 <骨頭>:under）：先於所有部位畫，斜前斜後轉身時從身體旁露出來的後片才不會像破洞
    if (under && !lateAfter && layer !== "front") for (const name of this.data.zOrder) {
      if (only && !only.has(name)) continue;
      const lining = pieces(`${name}:under`);
      if (!lining.length) continue;
      ctx.save(); boneSpace(name); drawPieces(lining, this.bones.get(name).pivot, null); ctx.restore();
    }
    // 外套在軀幹之前畫的袖子（遠側手臂）先收起來，等外套軀幹那片畫的時候緊接在它前面畫：
    // 裡面上衣的軀幹片才不會蓋到外套袖子（遠側也跟近側一樣，外套袖子包住裡面），外套軀幹再蓋住袖子接縫
    const riders = new Map();   // 穿的順序 → [{ transform, pivot, pieces }]
    const torsoAt = this.data.zOrder.indexOf("torso");
    const rides = (name, piece) => SLEEVE_BONES.has(name) && this.data.zOrder.indexOf(name) < torsoAt && (!only || only.has("torso"))
      && wearing[piece.index]?.outer && this.data.outfits?.[wearing[piece.index].name]?.torso?.length;
    const withRiders = (piece, emit) => { const waiting = riders.get(piece.index); if (waiting) { riders.delete(piece.index); waiting.forEach(emit); } };
    for (const name of this.data.zOrder) {
      if (only && !only.has(name)) continue;
      const bone = this.bones.get(name);
      ctx.save();
      boneSpace(name);
      placed.set(name, ctx.getTransform());
      const variant = pose[name]?.variant;
      const allWorn = pieces(name);
      const worn = allWorn.filter((piece) => !rides(name, piece));
      for (const piece of allWorn.filter((piece) => rides(name, piece))) {
        riders.set(piece.index, [...(riders.get(piece.index) ?? []), { transform: ctx.getTransform(), pivot: bone.pivot, pieces: [piece] }]);
      }
      const behind = pieces(`${name}:behind`);   // 畫在皮膚底下的零件（後髮）
      const own = ((variant && bone.variants?.[variant]) || bone.slots).map(slot => ({ slot, tint: null }));
      const dressed = allWorn.some(({ slot }) => !slot.includes("_face") && !slot.includes("_hair") && !slot.includes("_glasses"));
      const bodyColor = bodyTint && !dressed && BODY_TINT_BONES.has(name) ? bodyTint : null;
      // 這個部位有穿東西（或整段染成衣服色）就不畫內衣；只蓋上半身的衣服（top：T 恤、襯衫、外套）不算，單穿上衣時內褲照畫
      const covered = allWorn.some(({ index }) => !wearing[index]?.top);
      const bare = (!underwear || covered || bodyColor ? own.filter(({ slot }) => !slot.includes("underwear")) : own);
      const ownTarget = (piece) => { const target = piece.after ?? garmentAfter[name]; return target && (!only || only.has(target)) ? target : null; };   // 等的那根這次不畫就不等
      // 疊穿的前後照穿的順序：同一根骨頭上，先穿的延後畫了，後穿的也延到同一時間（背心裙延到腿之後，外套還是要蓋在背心裙外面）
      // 自己設的等待和前面穿的取比較晚的那根：外套等大腿、背心裙等左腳時，外套也要等到左腳，才蓋得住背心裙
      let carried = null;
      const later = (a, b) => (!a ? b : !b ? a : this.data.zOrder.indexOf(a) >= this.data.zOrder.indexOf(b) ? a : b);
      const planned = worn.map((piece) => { const target = later(ownTarget(piece), carried); if (target) carried = target; return { piece, target }; });
      const now = planned.filter(({ target }) => !target).map(({ piece }) => piece);
      const bodyLayer = layer === "behind" ? behind : layer === "front" ? bare : [...behind, ...bare];
      const drawn = layer === "behind" ? [] : now;
      const inSpace = (piece, draw) => { if (!piece.hem) return draw(); ctx.save(); hemSpace(); const result = draw(); ctx.restore(); return result; };
      const torsoMask = { transform: ctx.getTransform(), pivot: bone.pivot, pieces: own };   // 遠側外套袖子挖掉軀幹皮膚範圍
      const drawOne = (piece) => {
        if (piece.index !== undefined && now.includes(piece)) withRiders(piece, (rider) => drawEntry({ ...rider, mask: torsoMask }));
        inSpace(piece, () => drawPieces([piece], bone.pivot, bodyColor));
      };
      if (!lateAfter) {
        bodyLayer.forEach(drawOne);
        const bent = Math.abs(world.get(name).rot - world.get(bone.parent ?? name).rot) >= CLIP_MIN_BEND;
        if (layer !== "behind" && bent) for (const piece of pieces(`${name}:clip`)) {
          const torso = this.bones.get("torso"), mask = pieces("torso").filter(({ index, hem }) => index === piece.index && !hem);
          if (mask.length && placed.has("torso")) drawEntry({ transform: ctx.getTransform(), pivot: bone.pivot, pieces: [piece], mask: { transform: placed.get("torso"), pivot: torso.pivot, pieces: mask }, inside: true });
        }
        drawn.forEach(drawOne);
      }
      if (layer !== "behind") for (const { piece, target } of planned.filter(({ target }) => target)) {
        const queue = deferred.get(target) ?? [];
        withRiders(piece, (rider) => queue.push({ ...rider, mask: torsoMask }));
        queue.push({ transform: inSpace(piece, () => ctx.getTransform()), pivot: bone.pivot, pieces: [piece] });
        deferred.set(target, queue);
      }
      ctx.restore();
      if (lateAfter && !lateAfter.has(name)) continue;
      for (const entry of deferred.get(name) ?? []) drawEntry(entry);
    }
    ctx.restore();
  }
}

/** 兩個姿勢差不多：每根骨頭的角度、位移差不到 tolerance，縮放差不到 tolerance 的百分之一，換的零件一樣。 */
function posesClose(a, b, tolerance) {
  for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const p = a[name] ?? {}, q = b[name] ?? {};
    if (p.variant !== q.variant) return false;
    for (const key of ["angle", "x", "y"]) if (Math.abs((p[key] ?? 0) - (q[key] ?? 0)) > tolerance) return false;
    for (const key of ["sx", "sy"]) if (Math.abs((p[key] ?? 1) - (q[key] ?? 1)) > tolerance / 100) return false;
  }
  return true;
}

/** 手臂的三根骨頭（l 或 r）。 */
export const armBones = (side) => [`upper_arm_${side}`, `lower_arm_${side}`, `hand_${side}`];

export function lerpKeys(keys, t, defaultEasing) {
  if (t <= keys[0].t) return { ...keys[0] };
  if (t >= keys[keys.length - 1].t) return { ...keys[keys.length - 1] };
  let i = 0;
  while (keys[i + 1].t < t) i++;
  const [a, b] = [keys[i], keys[i + 1]];
  const p = EASING[b.easing || defaultEasing || "linear"]((t - a.t) / (b.t - a.t));
  const num = k => (v => v === undefined ? undefined : v);
  const mix = (ka, kb, fallback) => {
    const va = ka ?? fallback, vb = kb ?? fallback;
    return va + (vb - va) * p;
  };
  return {
    angle: (a.angle ?? 0) + shortestArc(a.angle ?? 0, b.angle ?? 0) * p,
    x: mix(a.x, b.x, 0), y: mix(a.y, b.y, 0),
    sx: mix(a.sx, b.sx, 1), sy: mix(a.sy, b.sy, 1),
    variant: a.variant,   // 換圖不插補：過了關鍵格就換
  };
}

/** 取某個時間點的姿勢；view 有專屬關鍵格時，該骨頭用專屬的。 */
export function samplePose(animation, time, view) {
  const t = animation.loop ? time % animation.duration : Math.min(time, animation.duration);
  const override = animation.views?.[view]?.tracks || {};
  const pose = {};
  for (const [bone, keys] of Object.entries(animation.tracks)) pose[bone] = lerpKeys(keys, t, animation.easing);
  for (const [bone, keys] of Object.entries(override)) pose[bone] = { ...lerpKeys(keys, t, animation.easing), screen: true };
  return pose;
}

/** query 會接在每張零件圖網址後面（遊戲用版本號避開快取）。 */
/** lazyOutfits：只先載素體本身的零件，衣服、臉、頭髮等套裝零件等第一次要畫時才載（載到之前那片先不畫），開頁不用等全部衣服。 */
export async function loadSkeleton(url, assetBase, query = "", { lazyOutfits = false } = {}) {
  const [data, offsets] = await Promise.all([
    fetch(url).then((response) => response.json()),
    fetch(assetBase + "offsets.json" + query).then((response) => (response.ok ? response.json() : {})).catch(() => ({})),
  ]);
  const outfitSlots = Object.values(data.outfits ?? {}).flatMap(pieces => Object.values(pieces).flat());
  const bodySlots = data.bones.flatMap(b => [...b.slots, ...Object.values(b.variants || {}).flat()]);
  const names = [...new Set(lazyOutfits ? bodySlots : [...bodySlots, ...outfitSlots])];
  const images = {};
  let skeleton = null;
  const loadPart = (n) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => { images[n] = img; if (skeleton) skeleton.partsLoaded++; resolve(); };
    img.onerror = () => { console.error(`載不到零件圖 ${n}`); resolve(); };
    img.src = assetBase + n + query;
  });
  await Promise.all(names.map(loadPart));
  skeleton = new Skeleton(data, images, offsets);
  if (lazyOutfits) skeleton.loadPart = loadPart;
  return skeleton;
}
