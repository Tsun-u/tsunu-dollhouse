// 斜 45 度房間的畫布：格子座標 (x 往右後、y 往左後) ↔ 畫面座標，畫地板、兩面牆、家具色塊，處理點與拖曳。

/** 圖裡不透明像素的外框（透明邊不算）。 */
function opaqueBounds(img) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    if (data[(y * canvas.width + x) * 4 + 3] < 128) continue;   // 只算實心像素，半透明的光暈不算
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

const TILE_W = 64, TILE_H = 32, WALL_H = 120, UNIT_H = 48, CHARACTER_HEIGHT = 110, WALK_SPEED = 2.2;   // 格／秒
const BASEBOARD_H = 8;   // 踢腳板高度（px）
const BATH_STEAM_RISE = 62, SHOWER_STEAM_RISE = 128;   // 熱氣從格子中心往上幾 px 開始飄（泡澡在頭頂、淋浴在玻璃頂）
const SHOWER_GLASS_H = 120;       // 淋浴間玻璃的高度（px），比人高一點
const SHOWER_HEAD = { x: 700, y: 285, spread: 110 };   // shower.png 裡雨淋頭底面的中心與寬度（原圖像素）
const SHOWER_STREAMS = 7;         // 同時落下幾道水線
const SHOWER_FLOOR_RISE = 16;     // 水落到淋浴盤：前角往上幾 px（盤面中央）
const SHOWER_FROST = [0.08, 0.66];  // 霧面那段玻璃從多高到多高（玻璃高度的比例）：不透明，擋住身體、露出頭
const TABLE_ICON = 18, TABLE_ICON_GAP = 19;   // 桌上物品縮圖的邊長與間距：小桌放滿三樣剛好排得下
const MIRROR_CENTER_H = 82, MIRROR_RY = 26, MIRROR_RX = 0.36, MIRROR_REACH = 2.5;   // 鏡子中心離地高度與半高（px）、半寬（占牆格數的比例）、照得到離牆幾格內的人
const MIRROR_FEET_DROP = 12, MIRROR_DISTANCE_RISE = 4, MIRROR_SQUEEZE = 0.45;   // 鏡中影像的腳底在牆腳下方幾 px；離牆每一格影像升高幾 px；影像沿牆離鏡子中心的距離縮成幾成
const SIT_DROP = 8;
const AWAY_SIT_DROP = 16;   // 背對鏡頭坐著的預設下移：沙發的椅背高，人往下放大腿才藏得住；目錄的 back.sitDrop 可以個別改
const KISS_HEAD_TILT = 12;   // 親親時頭轉幾度：高的人低頭、矮的人抬頭
const HUG_LEAN = 8;          // 抱抱時兩人都向對方彎腰幾度
const KISS_LEAN = 6;         // 親親時高的人向對方彎腰幾度
const BACK_HUG_RISE = 2;     // 面向鏡頭從後面抱時，抱人往上挪的畫面像素（手才環得到對方腰上）
const BACK_HUG_LEAN = { front34: 8, back34: 10 };   // 從後面抱時抱人彎腰幾度，把頭靠到對方頭邊（依兩人面向）
const CUDDLE_SIDE_PX = 16;   // 抱抱、親親時兩人腳底同高，左右相距這麼多畫面像素
const CUDDLE_GAP = 0.25;   // 抱抱、親親時發起的人離對方幾格（走進對方的格子，身體才貼得在一起）
const BED_SIDE_HUG = { gap: 0.5, nearLean: 6, farLean: -6, farHead: 6 };   // 床上並肩側抱：兩人沿床寬相距幾格；靠鏡頭的人往對方傾、離鏡頭的人後仰並把頭偏過來
const BED_BACK_HUG = { backLean: 8, frontLean: -4, frontForward: 0.3, backTowardCamera: 0.1, kissFrontLean: 8 };   // 床上圈抱：後面的人往前彎、前面的人往後靠；前面的人往床尾挪幾格、後面的人往鏡頭偏幾格；圈抱著親親時前面的人改成往前彎
const BED_SIDE_KISS = { tilt: 12, gapTallNear: 12, gapTallFar: 16 };   // 床上並肩親親：高的低頭、矮的抬頭幾度；兩人臀部同高，左右相距幾 px（高的坐靠鏡頭那側時近一點）
const SEATED_ANIMS = new Set(["sit", "lounge", "lounge_side_hug", "lounge_back_hug", "lounge_back_held", "lounge_back_hug_kiss", "lounge_back_held_kiss", "lounge_turned", "sleep", "sleep_hug", "shower"]);   // 人在家具上（坐著、靠著、躺著）
const seated = (who) => SEATED_ANIMS.has(who.anim);
const lying = (who) => who.anim === "sleep" || who.anim === "sleep_hug";
const heightOf = (who) => who.skeletons[who.view].data.scale ?? 1;   // 身高看骨架檔的 scale
const LOWER_LEG = /^(lower_leg|foot)_/;   // 小腿與腳掌的骨頭
const parseCell = (key) => { const [x, y] = key.split(",").map(Number); return { x, y }; };
const besideCells = ({ x, y }) => [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }];

/** 鏡中影像面向哪裡 (dx, dy)：本人的面向（face 的反推）對鏡面反射，後牆鏡子（y=0）反 y、左牆鏡子（x=0）反 x；正面朝鏡頭的人，鏡子照到的是背面。 */
function mirroredFacing({ view, flip }, wall) {
  if (view === "front") return wall === "back" ? [0, -1] : [-1, 0];
  const [dx, dy] = view === "front34" ? (flip ? [1, 0] : [0, 1]) : (flip ? [0, -1] : [-1, 0]);
  return wall === "back" ? [dx, -dy] : [-dx, dy];
}
const HUG_SLEEP_GAP = 0.6;   // 抱著睡時兩人相距幾格（平常各睡床寬的 1/3、2/3）
const SLEEP_HIP_CELLS = 1.3;   // 躺著時臀部離床頭幾格，頭才會落在枕頭上
const SLEEP_Z_LIFT = 30;       // 躺著時 z 從腳底往上這麼多畫面像素冒出來
const DOOR_H = 84, DOOR_INSET = 0.14;   // 門的畫面高度；門框左右各內縮幾成格寬
const LABEL = { atone: "阿童", tsunu: "阿宇" };
const STILL_ANIMS = new Set(["idle", "sit", "lounge", "sleep"]);   // 只有呼吸起伏的動作：畫好的人像可以重用
export const STILL_POSE_TOLERANCE = 2;   // 姿勢差不到 2 度、2 個骨架單位（約 0.15 畫面 px）就不重畫；衣櫃的試穿預覽也用它
const CROWD = 4;                  // 房間裡超過這麼多人：走路的腳步也重用人像
const CROWD_WALK_TOLERANCE = 5;   // 人多時走路姿勢差 5 度以上才重畫（腳步一秒更新十幾次）
const FRESH_PER_FRAME = 1;        // 一幀最多重畫幾個可重用的人像，其餘先貼舊的（平移到新位置），下一幀再輪
const MAX_DEFERRED_FRAMES = 6;    // 連續被延這麼多幀的人，不管額度一定重畫，走路才不會變成腳不動地滑

/** 在家穿的衣服（鞋子不畫）；同一套衣服回傳同一個陣列，播放器才認得出「衣服沒變」、重用畫好的人像。 */
function indoorOutfits(character) {
  if (character.indoorFor !== character.outfits) {
    character.indoorFor = character.outfits;
    character.indoorOutfits = (character.outfits ?? []).filter((outfit) => !outfit.outdoor);
  }
  return character.indoorOutfits;
}
const THIRSTY_MS = 3 * 86_400_000;   // 跟伺服器同一個數字
const isThirsty = (piece) => !!piece.wateredAt && Date.now() - new Date(piece.wateredAt).getTime() > THIRSTY_MS;   // 坐姿時整個人往下移的畫面像素

/** 畫的先後：b 在 a 的 +x 或 +y 那側（靠鏡頭）、另一軸沒有反過來落在 a 後面時，b 後畫（蓋在上面）。
 *  一個在 +x 另一個在 +y 的斜對角，畫面上左右分開不會重疊，不排先後；範圍重疊或沒有範圍時比深度。
 *  只比深度（x＋y）的話，長條家具旁邊斜角的單格物件會排錯（浴缸左下的狗被浴缸壓住）。 */
function paintersOrder(drawables) {
  const inFront = (a, b) => (b.x0 >= a.x1 && b.y1 > a.y0) || (b.y0 >= a.y1 && b.x1 > a.x0);
  const apart = (a, b) => a.x0 >= b.x1 || b.x0 >= a.x1 || a.y0 >= b.y1 || b.y0 >= a.y1;
  const mustPrecede = (a, b) => {
    if (a.box && b.box && apart(a.box, b.box)) return inFront(a.box, b.box);
    return a.depth < b.depth;
  };
  const remaining = [...drawables];
  const ordered = [];
  while (remaining.length) {
    const free = remaining.filter((item) => !remaining.some((other) => other !== item && mustPrecede(other, item)));
    const pool = free.length ? free : remaining;   // 有循環就退回只看深度
    const next = pool.reduce((best, item) => (item.depth < best.depth ? item : best));
    ordered.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return ordered;
}

export class RoomView {
  constructor(canvas, catalog, handlers) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.catalog = catalog;
    this.handlers = handlers;
    this.state = null;
    this.roomId = "bedroom";   // 畫面上的是哪間房
    this.selectedId = null;
    this.drag = null;
    this.images = {};
    this.characters = [];   // { name, skeleton, animations, anim, cell }
    this.effects = [];      // 一次性的演出（飛出去的枕頭、飄的羽毛）：{ until, draw(ctx, now) }，蓋在人物上面，時間到就拿掉
    this.animating = false;
    canvas.addEventListener("pointerdown", (e) => this.onDown(e));
    canvas.addEventListener("pointermove", (e) => this.onMove(e));
    canvas.addEventListener("pointerup", (e) => this.onUp(e));
    canvas.addEventListener("pointercancel", () => { this.drag = null; this.draw(); });
    new ResizeObserver(() => { if (this.state) { this.resize(); this.draw(); } }).observe(canvas);
  }

  /** 目前畫的這間房。 */
  get home() { return this.state.rooms[this.roomId]; }

  setState(state, roomId) {
    this.state = state;
    this.roomId = roomId;
    const { width, depth } = this.home;
    this.logical = { w: (width + depth) * TILE_W / 2 + 40, h: (width + depth) * TILE_H / 2 + WALL_H + 40 };
    this.canvas.style.aspectRatio = `${this.logical.w} / ${this.logical.h}`;
    this.resize();
    this.originX = depth * TILE_W / 2 + 20;
    this.originY = WALL_H + 20;
    for (const piece of this.home.placed) this.loadImage(piece.item);
    this.draw();
  }

  setSelected(id) { this.selectedId = id; this.draw(); }

  /** 小人站在房間裡，跟家具一起依深度排序畫；有小人時就持續播動畫。 */
  setCharacters(characters) {
    this.characters = characters;
    if (characters.length && !this.animating) {
      this.animating = true;
      let last = performance.now();
      const loop = (now) => {
        if (!this.characters.length) { this.animating = false; return; }
        try {
          for (const character of this.characters) this.step(character, (now - last) / 1000);
          this.pets?.step((now - last) / 1000, this.characters);
          if (this.canvas.offsetParent) this.draw();   // 分頁藏起來時人照樣走，只是不重畫
        } catch (error) {   // 一幀畫壞不讓整個畫面停住；錯誤交給頁面顯示（手機上看不到主控台）
          this.reportError?.(error);
        }
        last = now;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  /** 抱抱／親親的演出：發起的人走到定位後，兩人擺出抱的姿勢、冒愛心，幾秒後恢復。 */
  cuddle(actor, target, { behind, kiss }) {
    this.pending = { actor, target, behind, kiss };
  }

  /** 持續的抱抱（小屋）：存檔說抱著就一直抱，直到 releaseCuddle。發起的人還在走過去時先排著，走到定位才擺姿勢。 */
  holdCuddle(actor, target, { behind }) {
    const same = (c) => c && c.actor === actor && c.target === target && c.behind === behind;
    if (same(this.held) || (this.pending?.hold && same(this.pending))) return;
    this.pending = { actor, target, behind, hold: true };
  }

  releaseCuddle() {
    if (this.pending?.hold) this.pending = null;
    if (!this.held) return;
    const { actor, target } = this.held;
    this.held = null;
    this.unstrike(actor, target);
  }

  /** 放開：站著抱的兩人回正面站好；坐著的由 step() 照座位擺回。 */
  unstrike(actor, target) {
    const backHug = !!actor.behind;
    for (const who of [actor, target]) {
      who.cuddleAt = who.cuddleWith = who.behind = who.headTilt = who.lean = who.bedAt = null;
      if (backHug || who.anim === "hug" || who.anim === "hugged") { who.anim = "idle"; who.view = "front"; who.flip = false; }
    }
    if (this.bedPair?.people.includes(actor)) this.bedPair = null;
  }

  startCuddle() {
    const { actor, target, behind, kiss, hold } = this.pending;
    this.pending = null;
    const pair = (c) => c && [c.actor, c.target].includes(actor) && [c.actor, c.target].includes(target);
    if (!(kiss && pair(this.held))) this.strike(actor, target, behind);
    if (hold) this.held = { actor, target, behind };
    if (kiss) this.kissPose(actor, target);
    const mid = { x: (actor.pos.x + target.pos.x) / 2, y: (actor.pos.y + target.pos.y) / 2 };
    this.hearts = { at: mid, until: performance.now() + (kiss ? 2500 : 3200), kiss };
    if (hold) return;
    clearTimeout(this.cuddleTimer);
    this.cuddleTimer = setTimeout(() => {
      if (pair(this.held)) this.strike(this.held.actor, this.held.target, this.held.behind);   // 抱著時親完：回到抱著的姿勢
      else this.unstrike(actor, target);
    }, kiss ? 2500 : 3200);
  }

  /** 擺抱的姿勢：站著抱、醒著在床上抱（只有 handlers.bedCuddles 打開時，小屋限定；兒童版刻意不做）；其他並肩坐著（沙發、兒童版的床）或一起睡著時維持原本的姿勢，只冒愛心。 */
  strike(actor, target, behind) {
    const seat = this.sharedSeat(actor, target);
    if (!seat) this.strikeCuddlePose(actor, target, behind);
    else if (this.handlers.bedCuddles && this.catalog[seat.item]?.seatPose === "lounge" && !lying(actor) && !lying(target)) this.strikeBedPose(actor, target, behind, seat);
    else actor.headTilt = target.headTilt = actor.lean = target.lean = null;
  }

  /** 兩人停在同一件可坐的家具上：回傳那件家具，否則 null。看位置不看動畫：剛走到、這一幀還沒輪到坐下的人也算。 */
  sharedSeat(a, b) {
    if (a.path?.length || b.path?.length) return null;
    const seat = this.seatAt(a.pos);
    return seat && seat.id === this.seatAt(b.pos)?.id ? seat : null;
  }

  /** 床上抱（數值見 docs/specs/2026-10-15-bed-cuddle.md），不管誰發起都一樣：
   *  並肩側抱：兩人往床寬中間靠攏；靠鏡頭的人往對方傾，遠側那隻手繞到對方背後；離鏡頭的人後仰、頭偏過來。
   *  從後面抱：高的坐在床頭、往鏡頭偏一點，矮的往床尾挪一點坐在他兩腿中間；手和頭跟站著從後面抱一樣（他環住她、頭靠在她頭上，她握住他的手）。 */
  strikeBedPose(actor, target, behind, bed) {
    const along = this.bedAxis(bed), across = along === "x" ? "y" : "x";
    const { w, d } = this.footprint(bed);
    const middle = bed[across] + (along === "x" ? d : w) / 2 - 0.5;
    const row = actor.pos[along];   // 都坐在靠枕頭那一排（pillowSpot）
    const at = (forward, towardCamera) => ({ [along]: row + forward, [across]: middle + towardCamera });
    for (const who of [actor, target]) {   // 跟坐床一樣斜前、朝床尾（剛走到的人這一幀還沒被 step 擺好）
      who.headTilt = who.lean = null;
      who.view = "front34"; who.flip = along === "x";
    }
    if (behind) {
      const [back, front] = heightOf(actor) >= heightOf(target) ? [actor, target] : [target, actor];
      back.bedAt = at(0, BED_BACK_HUG.backTowardCamera); front.bedAt = at(BED_BACK_HUG.frontForward, 0);
      back.anim = "lounge_back_hug"; front.anim = "lounge_back_held";
      back.lean = BED_BACK_HUG.backLean; front.lean = BED_BACK_HUG.frontLean;
      this.bedPair = { bed, people: [actor, target], back, front };
    } else {
      const [near, far] = actor.pos[across] > target.pos[across] ? [actor, target] : [target, actor];   // 床寬座標大的離鏡頭近
      near.bedAt = at(0, BED_SIDE_HUG.gap / 2); far.bedAt = at(0, -BED_SIDE_HUG.gap / 2);
      near.anim = "lounge_side_hug"; far.anim = "lounge";
      near.lean = BED_SIDE_HUG.nearLean; far.lean = BED_SIDE_HUG.farLean; far.headTilt = BED_SIDE_HUG.farHead;
      this.bedPair = { bed, people: [actor, target], near, far };
    }
  }

  /** 親親的姿勢：床上圈抱著時，前面的人回頭（頭左右翻轉、抬頭）、往前彎，後面的人頭往前湊；床上並肩坐著時兩人臀部同高、頭面對面；其他情況照 tiltForKiss。親完由 startCuddle 的計時器擺回抱的姿勢。 */
  kissPose(a, b) {
    const pair = this.bedPair;
    if (pair?.back && pair.people.includes(a) && pair.people.includes(b)) {
      pair.back.anim = "lounge_back_hug_kiss"; pair.front.anim = "lounge_back_held_kiss";
      pair.front.lean = BED_BACK_HUG.kissFrontLean;
      return;
    }
    if (pair?.near && pair.people.includes(a) && pair.people.includes(b)) return this.bedSideKiss(pair);
    this.tiltForKiss(a, b);
  }

  /** 床上並肩親親：跟站著親親一樣讓兩人臀部同一個 y、只左右錯開，頭才對得齊；離鏡頭的人把頭翻過來面向對方，高的低頭、矮的抬頭，高的頭畫在最上面（drawBedEmbrace）。 */
  bedSideKiss(pair) {
    const { bed, near, far } = pair;
    const [nearX] = this.toScreen(near.pos.x + 0.5, near.pos.y + 0.5), [farX] = this.toScreen(far.pos.x + 0.5, far.pos.y + 0.5);
    const nearSide = nearX < farX ? -1 : 1;   // 靠鏡頭的人在畫面左邊（床沿 x）或右邊（床沿 y）
    const [midX, midY] = this.drawnSpot(near).map((v, i) => (v + this.drawnSpot(far)[i]) / 2);
    const tallNear = heightOf(near) >= heightOf(far);
    const gap = tallNear ? BED_SIDE_KISS.gapTallNear : BED_SIDE_KISS.gapTallFar;
    const cell = (sx) => { const { x, y } = this.fromScreen(sx, midY); return { x: x - 0.5, y: y - 0.5 }; };
    near.bedAt = cell(midX + nearSide * gap / 2); far.bedAt = cell(midX - nearSide * gap / 2);
    near.anim = "lounge"; far.anim = "lounge_turned";
    near.lean = far.lean = null;
    near.headTilt = tallNear ? -BED_SIDE_KISS.tilt : BED_SIDE_KISS.tilt;   // 正＝抬頭
    far.headTilt = tallNear ? -BED_SIDE_KISS.tilt : BED_SIDE_KISS.tilt;    // 頭翻過來，正＝低頭
    this.bedPair = { bed, people: pair.people, near, far, kiss: true };
  }

  /** toScreen 的反函數（不取整）：畫面座標換回格子座標。 */
  fromScreen(sx, sy) {
    const u = (sx - this.originX) / (TILE_W / 2), v = (sy - this.originY) / (TILE_H / 2);
    return { x: (u + v) / 2, y: (v - u) / 2 };
  }

  /** 親親：比較高的人低頭、比較矮的人抬頭（身高看骨架檔的 scale）；一樣高就不動。 */
  tiltForKiss(a, b) {
    if (heightOf(a) === heightOf(b)) return;
    const [tall, short] = heightOf(a) > heightOf(b) ? [a, b] : [b, a];
    tall.headTilt = -KISS_HEAD_TILT; short.headTilt = KISS_HEAD_TILT;   // head 正值＝抬頭
    tall.lean = KISS_LEAN; short.lean = 0;
  }

  strikeCuddlePose(actor, target, behind) {
    const dx = target.pos.x - actor.pos.x, dy = target.pos.y - actor.pos.y;
    actor.cuddleAt = actor.behind = actor.headTilt = actor.lean = target.cuddleAt = target.behind = target.headTilt = target.lean = null;
    actor.cuddleWith = target; target.cuddleWith = actor;   // 抱在一起的對象：屋裡可能還有訪客，站位、圖層都照這個找
    if (behind) {   // 兩人面向同一邊（從發起的人走向對方的方向），發起的人貼在對方背後：從後方靠近就是斜前、從鏡頭這側靠近就是斜後
      const [ax, ay] = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy)];
      const facingCamera = ax + ay > 0;
      actor.anim = facingCamera ? "hug_back" : "hug_back_away";   // 斜前時靠鏡頭那隻手環腰；斜後時兩手都藏在對方身前
      target.anim = facingCamera ? "hug_back_held" : "idle";   // 斜前時被抱的人微微低頭
      this.face(actor, ax, ay); this.face(target, ax, ay);
      actor.lean = BACK_HUG_LEAN[actor.view];
      actor.cuddleAt = { x: target.pos.x - ax * CUDDLE_GAP, y: target.pos.y - ay * CUDDLE_GAP };
      actor.behind = target;
    } else {
      const distance = Math.hypot(dx, dy) || 1;   // 面對面：發起的人站到對方面前半格
      actor.cuddleAt = { x: target.pos.x - dx / distance * CUDDLE_GAP, y: target.pos.y - dy / distance * CUDDLE_GAP };
      const actorInFront = actor.cuddleAt.x + actor.cuddleAt.y > target.pos.x + target.pos.y;   // 靠鏡頭（上層）的人環抱，後面的人手自然垂著
      actor.anim = actorInFront ? "hug" : "hugged"; target.anim = actorInFront ? "hugged" : "hug";
      this.face(actor, dx, dy);   // 兩人面向對方：靠鏡頭那個背對鏡頭（斜後），才不會像隔空抱
      this.face(target, -dx, -dy);
      actor.lean = target.lean = HUG_LEAN;   // 親親時 tiltForKiss 會改成只有高的人彎
    }
  }

  drawHearts() {
    const h = this.hearts;
    if (!h) return;
    const now = performance.now();
    if (now > h.until) { this.hearts = null; return; }
    const { ctx } = this;
    const [sx, sy] = this.toScreen(h.at.x + 0.5, h.at.y + 0.5);
    const life = 1 - (h.until - now) / (h.kiss ? 2500 : 3200);
    ctx.save();
    ctx.font = `${h.kiss ? 22 : 16}px sans-serif`; ctx.textAlign = "center";
    for (let i = 0; i < (h.kiss ? 3 : 5); i++) {
      const phase = (life * 2 + i * 0.37) % 1;
      ctx.globalAlpha = 1 - phase;
      ctx.fillStyle = h.kiss ? "#ff5d8f" : "#ff8fab";
      ctx.fillText("♥", sx + Math.sin((i + 1) * 2.1 + phase * 6) * 18, sy - CHARACTER_HEIGHT * 0.7 - phase * 50);
    }
    ctx.restore();
  }

  /** 家具圖要不要左右鏡射：圖預設畫成長邊沿右後方向；imageAlongDepth 的圖畫成長邊沿左後，翻轉的判斷反過來。 */
  imageMirrored(piece) {
    return piece.flip !== !!this.catalog[piece.item]?.imageAlongDepth;
  }

  /** 面向 (dx, dy) 這個方向：往 +x／+y 是斜前（朝鏡頭），往 −x／−y 是斜後；沿 x 軸要鏡射。 */
  face(character, dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) { character.view = dx > 0 ? "front34" : "back34"; character.flip = dx > 0; }
    else { character.view = dy > 0 ? "front34" : "back34"; character.flip = dy < 0; }
  }

  /** 沿路徑往下一格走；走的方向決定用斜前或斜後、要不要鏡射。 */
  step(character, dt) {
    const next = character.path?.[0];
    if (!next && this.pending && this.pending.actor === character) { this.startCuddle(); return; }   // 走到定位了：開始抱
    if (!next) {
      if (this.characters.some((who) => who.behind === character)) return;   // 被從後面抱著：跟抱人的同一個面向，不轉回正面
      if (character.bedAt) return;   // 在床上抱著：維持抱的姿勢，不重擺坐姿
      if (["walk", "idle"].includes(character.anim) || seated(character)) {
        const seat = this.seatAt(character.pos);
        if (seat) {   // 坐下：斜前視角，背靠椅背（床頭）、面朝座面前方；家具圖有鏡射，人就反過來（床上腿伸直）；一起睡時床上的人往床頭躺平
          const seatPose = this.catalog[seat.item].seatPose ?? "sit";
          const onBed = seatPose === "lounge";
          character.bathing = seatPose === "bathe";   // 泡澡：背影坐進浴缸，只露出頭和肩膀
          character.showering = seatPose === "shower";   // 淋浴：站在淋浴盤上洗頭，霧面玻璃擋住身體
          const hostAsleep = this.sleeping && !character.visitor && (!this.sleepAlone || this.sleepAlone === character.name);   // 屋主一個人睡時，另一個坐上床只是坐著
          const asleep = onBed && (hostAsleep || character.asleep);   // 訪客各自睡：角色帶 asleep
          character.anim = asleep ? (this.sleepCuddler === character.name ? "sleep_hug" : "sleep") : character.bathing ? "sit" : seatPose;
          const away = this.facesAway(seat) || character.bathing;   // 背對鏡頭的椅子與浴缸：坐上去是背影，朝左上＝沿 −x、朝右上＝沿 −y
          character.view = lying(character) || away ? "back34" : "front34";   // 睡覺背對鏡頭側睡，不用畫閉眼
          character.flip = onBed ? this.bedAxis(seat) === "x" : this.imageMirrored(seat) === away;   // 斜前視角朝右下＝沿 x，朝左下＝沿 y
          if (character.bathing) {   // 泡澡：露正面的人（小屋是阿宇，露上半身）坐遠端、其他人背影坐近端，沿浴缸長邊朝向對方那端，兩人一起泡就是面對面
            const alongX = this.footprint(seat).w > this.footprint(seat).d;
            const facingFront = this.bathFacesFront(character);
            character.view = facingFront ? "front34" : "back34";
            character.flip = facingFront === alongX;
          }
        }
        else { if (character.anim !== "idle") character.anim = "idle"; character.view = "front"; character.flip = false; character.bathing = false; character.showering = false; }   // 站定就面向玩家
      }
      return;
    }
    character.bathing = false; character.showering = false;   // 一起身就穿回衣服
    const dx = next.x - character.pos.x, dy = next.y - character.pos.y;
    const distance = Math.hypot(dx, dy);
    const stride = WALK_SPEED * dt;
    if (distance <= stride) { character.pos = { ...next }; character.path.shift(); }
    else character.pos = { x: character.pos.x + dx / distance * stride, y: character.pos.y + dy / distance * stride };
    character.anim = "walk";
    this.face(character, dx, dy);
  }

  /** 四方向 BFS，繞過家具；到不了就走直線。 */
  findPath(from, to) {
    const { width, depth } = this.home;
    const key = (c) => `${c.x},${c.y}`;
    const taken = new Set(this.home.placed.filter((piece) => !this.catalog[piece.item]?.floor).flatMap((piece) => this.cellsOf(piece)));
    taken.delete(key(to));   // 目的地可以是沙發、床這種可坐的家具
    const start = { x: Math.round(from.x), y: Math.round(from.y) };
    const previous = new Map([[key(start), null]]);
    const queue = [start];
    while (queue.length) {
      const cell = queue.shift();
      if (cell.x === to.x && cell.y === to.y) {
        const path = [];
        for (let k = key(cell), c = cell; c; c = previous.get(k), k = c && key(c)) path.unshift(c);
        return path.slice(1);
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = { x: cell.x + dx, y: cell.y + dy };
        if (n.x < 0 || n.y < 0 || n.x >= width || n.y >= depth || taken.has(key(n)) || previous.has(key(n))) continue;
        previous.set(key(n), cell);
        queue.push(n);
      }
    }
    return [to];
  }

  /** 人物頭上的對話框：最近一句話，幾秒後消失。 */
  drawBubble(character) {
    const bubble = character.bubble;
    if (!bubble || performance.now() > bubble.until) return;
    const [sx, sy] = this.toScreen(character.pos.x + 0.5, character.pos.y + 0.5);
    this.bubbleAt(sx, sy - CHARACTER_HEIGHT - 6, bubble.text);
  }

  /** 畫一個對話框：底邊在 bottom，尖角朝下指著 sx。 */
  bubbleAt(sx, bottom, text) {
    const { ctx } = this;
    ctx.save();
    ctx.font = "13px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const lines = wrapText(ctx, text, 150);
    const w = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 20, h = lines.length * 17 + 12;
    const x = sx - w / 2, y = bottom - h;
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#cdb593"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - 6, y + h); ctx.lineTo(sx, y + h + 8); ctx.lineTo(sx + 6, y + h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#3b2f2a";
    lines.forEach((line, i) => ctx.fillText(line, sx, y + 6 + 8.5 + i * 17));
    ctx.restore();
  }

  /** 床的長邊沿哪一軸（床頭在那一軸小的那端）：長方形看占地的長邊；正方形的雙人床看圖有沒有鏡射。 */
  bedAxis(bed) {
    const { w, d } = this.footprint(bed);
    if (w !== d) return w > d ? "x" : "y";
    return this.imageMirrored(bed) ? "y" : "x";
  }

  /** 躺在床上時畫在哪：臀部離床頭 SLEEP_HIP_CELLS 格；同一張床上的人照原本的左右順序平分床寬，各睡一邊。
   *  抱著睡：兩人靠在床中間、都背對鏡頭側睡，抱人的睡靠外側（在對方背後，畫在上層，手搭到對方身上）。 */
  sleepSpot(character) {
    const bed = this.seatAt(character.pos);
    if (!bed) return character.pos;
    const along = this.bedAxis(bed), across = along === "x" ? "y" : "x";
    const hugging = (who) => who.anim === "sleep_hug";
    const sleepers = this.characters.filter((who) => lying(who) && this.seatAt(who.pos)?.id === bed.id)
      .sort((a, b) => hugging(a) - hugging(b) || a.pos[across] - b.pos[across] || a.name.localeCompare(b.name));
    const { w, d } = this.footprint(bed);
    const width = along === "x" ? d : w, lane = sleepers.indexOf(character);
    const cross = sleepers.length === 2 && sleepers.some(hugging) ? width / 2 + (lane - 0.5) * HUG_SLEEP_GAP : width * (lane + 1) / (sleepers.length + 1);
    return { [along]: bed[along] + SLEEP_HIP_CELLS - 0.5, [across]: bed[across] + cross - 0.5 };
  }

  /** 畫在哪：面對面抱抱、親親時腳底跟對方同高、左右錯開 CUDDLE_SIDE_PX（斜角地板上站前後會一高一低）；從後面抱腳底也同高，躺著照 sleepSpot，其餘在自己的位置（存檔位置都不變）。 */
  drawnSpot(character) {
    if (character.drawnAt) return character.drawnAt;   // 鏡中的影像：位置由鏡子直接給
    if (character.bedAt) return this.toScreen(character.bedAt.x + 0.5, character.bedAt.y + 0.5);   // 床上抱：strikeBedPose 排的位置
    if (character.cuddleAt && !character.behind) {
      const partner = character.cuddleWith;
      const [px, py] = this.toScreen(partner.pos.x + 0.5, partner.pos.y + 0.5);
      const [cx] = this.toScreen(character.cuddleAt.x + 0.5, character.cuddleAt.y + 0.5);
      return [px + Math.sign(cx - px || 1) * CUDDLE_SIDE_PX, py];
    }
    if (character.behind) {   // 從後面抱：跟擁抱一樣腳底跟對方同高，只左右錯開
      const [, py] = this.toScreen(character.behind.pos.x + 0.5, character.behind.pos.y + 0.5);
      const [cx] = this.toScreen(character.cuddleAt.x + 0.5, character.cuddleAt.y + 0.5);
      return [cx, character.view === "front34" ? py - BACK_HUG_RISE : py];
    }
    const pos = character.cuddleAt ?? (lying(character) ? this.sleepSpot(character) : this.bathSpot(character) ?? character.pos);
    const [sx, sy] = this.toScreen(pos.x + 0.5, pos.y + 0.5);
    return [sx, sy];
  }

  /** only：只畫這些骨頭（抱在一起時拆手用），沒給就整個人；layer 見播放器 draw（只畫／不畫後髮）。 */
  drawCharacter(character, time, only = null, layer = null) {
    const { skeletons, animations, anim, view, flip, samplePose } = character;
    const skeleton = skeletons[view];
    const scale = CHARACTER_HEIGHT / skeleton.data.canvas.h;
    const [sx, sy] = this.drawnSpot(character);
    const still = STILL_ANIMS.has(anim);
    const phase = still || anim === "walk" ? (character.animPhase ??= Math.random() * 10) : 0;   // 每個人呼吸、腳步錯開：一屋子人不會同步，重畫人像也不會擠在同一幀
    const pose = samplePose(animations[anim], time + phase, view);
    if (character.headTilt) pose.head = { ...pose.head, angle: (pose.head?.angle ?? 0) + character.headTilt };   // 正＝抬頭、負＝低頭
    if (character.lean) bendAtHips(pose, character.lean);
    const half = skeleton.data.canvas.w * scale / 2;
    const seat = seated(character) ? this.seatAt(character.pos) : null;
    const side = seat ? this.seatSide(seat) : null;
    const facingDrop = character.bathing && view !== "back34" ? this.catalog[seat.item].facingSitDrop : undefined;   // 泡澡露正面的人沉深一點
    const seatDrop = seat ? facingDrop ?? side.sitDrop ?? (this.facesAway(seat) ? AWAY_SIT_DROP : SIT_DROP) : 0;   // 坐著時腳落在格子前緣，屁股才會在坐墊上
    const shift = seat ? this.sitShift(seat) : 0;
    const undressed = character.bathing || character.showering;   // 泡澡、淋浴連內衣都脫掉（水面、霧面玻璃擋住身體）
    const outfits = undressed ? character.headParts ?? [] : indoorOutfits(character);
    if (character.bathing && !only) only = new Set(skeleton.data.zOrder.filter((bone) => !/leg|foot|lower_arm|hand/.test(bone)));   // 腿和前臂泡在水裡：不畫，免得從浴缸外穿出來
    // 站、坐、躺的人重用剛畫好的人像；人多時走路的人也是（只差在移動，平移過去貼）
    const tolerance = still ? STILL_POSE_TOLERANCE : anim === "walk" && this.characters.length > CROWD ? CROWD_WALK_TOLERANCE : 0;
    const memo = tolerance && !only && !layer ? (character.drawMemo ??= { deferred: 0 }) : null;
    const deferring = memo && this.freshBudget <= 0 && memo.deferred < MAX_DEFERRED_FRAMES;   // 這幀的重畫額度用完了：姿勢差多少都先貼舊的
    const reuse = memo ? { memo, poseTolerance: deferring ? Infinity : tolerance } : {};
    const fresh = skeleton.draw(this.ctx, pose, { x: (flip ? sx + half : sx - half) + shift, y: sy - skeleton.data.canvas.h * scale + 6 + seatDrop, scale, facing: flip ? -1 : 1, outfits, skin: character.skin ?? null, bodyTint: undressed ? null : character.bodyTint ?? null, only, underwear: !undressed, layer, ...reuse });
    if (!memo) return;
    if (fresh) { this.freshBudget--; memo.deferred = 0; }
    else if (deferring) memo.deferred++;
  }

  /** 抱在一起的兩人（面對面抱抱、從後面抱、親親、床上抱、抱著睡）：[上層的人, 下層的人]；沒有就 null。床上抱的圖層由 drawBedEmbrace 自己排。 */
  embrace() {
    if (this.bedPair) return this.bedPair.people;
    const hugger = this.characters.find((who) => who.anim === "hug" || who.behind || who.anim === "sleep_hug");
    const partner = hugger && (hugger.behind ?? (hugger.anim === "sleep_hug" ? this.characters.find((who) => who !== hugger && !who.visitor && lying(who)) : hugger.cuddleWith));
    if (!partner) return null;
    return this.characterDepth(hugger) >= this.characterDepth(partner) ? [hugger, partner] : [partner, hugger];
  }

  /** 從後面抱（圖層由下往上）：
   *  抱人的在後面：被抱的後髮 → 抱人（遠側那隻不畫前臂）→ 被抱的其餘 → 抱人靠鏡頭那隻的前臂、手掌、遠側手掌與頭（環在對方身上、頭靠在對方頭上）→ 被抱的靠鏡頭那隻手（握住抱人的手）；
   *  抱人的在前面：抱人遠側那隻的前臂（繞到對方另一側）→ 被抱的（除了靠鏡頭那隻手）→ 抱人其餘 → 被抱的靠鏡頭那隻上臂（蓋住抱人環過來的前臂，前臂與手掌不畫）；抱人兩隻手掌都環到對方身前，不畫。
   *  靠鏡頭那隻手＝骨架 zOrder 裡上臂排在後面的那隻；伸向畫面深處的前臂在動畫裡縮短（sy）。 */
  drawBackHug([top, bottom], time) {
    const hugger = top.behind ? top : bottom, held = hugger === top ? bottom : top;
    const bones = (who, keep) => new Set(who.skeletons[who.view].data.zOrder.filter(keep));
    const near = this.nearSide(hugger), far = near === "l" ? "r" : "l";
    if (hugger === bottom) {
      const wrap = new Set([`lower_arm_${near}`, `hand_${near}`, `hand_${far}`, "head"]);   // 遠側前臂伸向畫面深處被擋住不畫，手掌從對方另一側扣住腰；頭側靠在對方頭上
      const heldSide = this.nearSide(held);
      const heldArm = new Set([`upper_arm_${heldSide}`, `lower_arm_${heldSide}`, `hand_${heldSide}`]);   // 被抱的人握住抱人環過來的手
      this.drawCharacter(held, time, null, "behind");   // 被抱的人的後髮夾在抱人的身體後面
      this.drawCharacter(hugger, time, bones(hugger, (bone) => !wrap.has(bone) && bone !== `lower_arm_${far}`));
      const heldFar = heldSide === "l" ? "r" : "l";
      this.drawCharacter(held, time, bones(held, (bone) => !heldArm.has(bone) && bone !== `lower_arm_${heldFar}` && bone !== `hand_${heldFar}`), "front");   // 遠側那隻前臂、手掌收在身前被擋住
      this.drawCharacter(hugger, time, wrap);
      this.drawCharacter(held, time, heldArm);
      return;
    }
    const around = new Set([`lower_arm_${far}`]);
    const hands = new Set([`hand_${near}`, `hand_${far}`]);
    const heldSide = this.nearSide(held);
    const heldArm = new Set([`upper_arm_${heldSide}`, `lower_arm_${heldSide}`, `hand_${heldSide}`]);
    this.drawCharacter(hugger, time, around);
    this.drawCharacter(held, time, bones(held, (bone) => !heldArm.has(bone)));
    this.drawCharacter(hugger, time, bones(hugger, (bone) => !around.has(bone) && !hands.has(bone)));
    this.drawCharacter(held, time, new Set([`upper_arm_${heldSide}`]));   // 前臂、手掌收在身前，被抱人的身體擋住
  }

  /** 靠鏡頭那側的手腳是 l 還是 r：骨架 zOrder 裡上臂排在後面（畫在上層）的那隻。 */
  nearSide(who) {
    const z = who.skeletons[who.view].data.zOrder;
    return z.indexOf("upper_arm_l") > z.indexOf("upper_arm_r") ? "l" : "r";
  }

  /** 床上抱的圖層（由下往上）：
   *  並肩側抱：靠鏡頭那人遠側整隻手（藏在對方身後）→ 離鏡頭那人 → 靠鏡頭那人其餘。
   *  圈抱（手和頭照站著從後面抱的 drawBackHug）：後面那人遠側的腿（墊在她下面）→ 前面那人的後髮 → 後面那人其餘（不含兩腿、環過去的手、頭）→ 前面那人其餘（不含握手那隻、遠側前臂與手掌）→ 後面那人近側的腿（接在臀部上、疊在她身上）→ 環過去的近側前臂、兩隻手掌與頭 → 前面那人握住他的那隻手。 */
  drawBedEmbrace({ near, far, back, front, kiss }, time) {
    const limb = (side, parts) => parts.map((part) => `${part}_${side}`);
    const except = (who, skip) => new Set(who.skeletons[who.view].data.zOrder.filter((bone) => !skip.includes(bone)));
    const other = (side) => (side === "l" ? "r" : "l");
    if (kiss) {   // 並肩親親：靠鏡頭的人畫在上面，高的人的頭永遠最上面
      const tallFar = heightOf(far) > heightOf(near);
      this.drawCharacter(far, time, tallFar ? except(far, ["head"]) : null);
      this.drawCharacter(near, time);
      if (tallFar) this.drawCharacter(far, time, new Set(["head"]));
      return;
    }
    if (near) {
      const arm = limb(other(this.nearSide(near)), ["upper_arm", "lower_arm", "hand"]);
      this.drawCharacter(near, time, new Set(arm));
      this.drawCharacter(far, time);
      this.drawCharacter(near, time, except(near, arm));
      return;
    }
    const backNear = this.nearSide(back), backFar = other(backNear), frontNear = this.nearSide(front), frontFar = other(frontNear);
    const nearLeg = limb(backNear, ["upper_leg", "lower_leg", "foot"]), farLeg = limb(backFar, ["upper_leg", "lower_leg", "foot"]);
    const wrap = [`lower_arm_${backNear}`, `hand_${backNear}`, `hand_${backFar}`, "head"];
    const heldArm = limb(frontNear, ["upper_arm", "lower_arm", "hand"]);
    this.drawCharacter(back, time, new Set(farLeg));
    this.drawCharacter(front, time, null, "behind");
    this.drawCharacter(back, time, except(back, [...nearLeg, ...farLeg, ...wrap, `lower_arm_${backFar}`]));
    this.drawCharacter(front, time, except(front, [...heldArm, `lower_arm_${frontFar}`, `hand_${frontFar}`]), "front");
    this.drawCharacter(back, time, new Set(nearLeg));
    this.drawCharacter(back, time, new Set(wrap));
    this.drawCharacter(front, time, new Set(heldArm));
  }

  /** 畫抱在一起的兩人，手才會繞到對方身後：
   *  站著（抱抱、親親）：上層那人下面的手 → 下層那人（除了下面那隻的前臂、手掌）→ 上層那人其餘 → 下層那人下面那隻的前臂、手掌（搭在對方後腰）；
   *  躺著（抱著睡）：上層那人下面的手 → 下層那人 → 上層那人其餘（下層那人上面的手收在自己臉旁，不蓋到對方身上）。 */
  drawEmbrace([top, bottom], time) {
    if (this.bedPair) return this.drawBedEmbrace(this.bedPair, time);
    if (top.behind || bottom.behind) return this.drawBackHug([top, bottom], time);
    const armOf = (who, lower) => {
      const lowerSide = who.skeletons[who.view].lowerArm(who.samplePose(who.animations[who.anim], time, who.view));
      const side = lower ? lowerSide : lowerSide === "l" ? "r" : "l";
      return new Set([`upper_arm_${side}`, `lower_arm_${side}`, `hand_${side}`]);
    };
    const except = (who, bones) => new Set(who.skeletons[who.view].data.zOrder.filter((bone) => !bones.has(bone)));
    const topArm = armOf(top, true);
    const bottomArm = lying(bottom) ? new Set() : new Set([...armOf(bottom, true)].filter((bone) => !bone.startsWith("upper_arm")));   // 上臂留在身上，只有前臂和手掌搭到對方後腰
    this.drawCharacter(top, time, topArm);
    this.drawCharacter(bottom, time, except(bottom, bottomArm));
    this.drawCharacter(top, time, except(top, topArm));
    if (bottomArm.size) this.drawCharacter(bottom, time, bottomArm);
  }

  /** 載入家具圖；背面圖存在 `<item>:back`、前景層 `<圖的鍵>:front`、布面遮罩 `<圖的鍵>:dye`，電視亮著的螢幕 `<item>:on`、各台畫面 `<item>:on:<節目>`。 */
  loadImage(item) {
    const spec = this.catalog[item];
    const dyeMask = (src) => (spec?.dye && src ? src.replace(/\.png(\?|$)/, "_dye.png$1") : null);   // 布面可換色的家具：旁邊放一張同名 _dye 遮罩
    const sources = [[item, spec?.image], [`${item}:back`, spec?.back?.image], [`${item}:front`, spec?.front], [`${item}:back:front`, spec?.back?.front],[`${item}:dye`, dyeMask(spec?.image)], [`${item}:back:dye`, dyeMask(spec?.back?.image)], [`${item}:front:dye`, dyeMask(spec?.front)], [`${item}:back:front:dye`, dyeMask(spec?.back?.front)], [`${item}:blanket`, spec?.blanket], [`${item}:on`, spec?.tv?.image],
      ...Object.entries(spec?.tv?.screens ?? {}).map(([program, src]) => [`${item}:on:${program}`, src])];
    for (const [key, src] of sources) {
      if (!src || key in this.images) continue;
      const img = new Image();
      img.onload = () => { img.bounds = opaqueBounds(img); this.draw(); };
      img.onerror = () => { this.images[key] = null; };   // 沒圖就退回色塊
      img.src = src;
      this.images[key] = img;
    }
  }

  /** 泡澡時畫在哪一格：露正面的人在浴缸比較遠的那端、背影的人在比較近的那端（不管走進哪一格），兩人一起泡就是面對面；一個人泡也坐同一端。不在泡澡就 null。 */
  bathSpot(character) {
    if (!character.bathing) return null;
    const tub = this.seatAt(character.pos);
    if (!tub) return null;
    const cells = this.cellsOf(tub).map((key) => key.split(",").map(Number)).sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
    const [x, y] = this.bathFacesFront(character) ? cells[0] : cells.at(-1);
    return { x, y };
  }

  /** 泡澡露正面的人：小屋是阿宇；兒童版沒有預設角色，由 handlers.bathFacesFront 決定。 */
  bathFacesFront(character) {
    return this.handlers.bathFacesFront ? this.handlers.bathFacesFront(character) : character.name === "tsunu";
  }

  /** 坐在這件家具上時用哪一面的設定（front 前景層、sitShift、sitDrop）：背對鏡頭用 back，其他用家具本身。 */
  seatSide(piece) {
    const spec = this.catalog[piece.item];
    return this.facesAway(piece) ? spec.back : spec;
  }

  /** 坐著時人往右挪幾 px：目錄的 sitShift 是原圖座標，圖有鏡射就反過來。 */
  sitShift(seat) {
    const shift = this.seatSide(seat).sitShift ?? 0;
    return this.imageMirrored(seat) ? -shift : shift;
  }

  /** 有前景層（背對的餐椅靠背、浴缸的水面與近側缸壁）：人畫在家具上面，前景層再蓋回人身上。 */
  hasFrontLayer(piece) {
    return !!this.seatSide(piece)?.front;
  }

  /** 布面換過顏色的家具圖：只染遮罩（<圖>_dye.png，scripts/make_dye_mask.py 算的）標到的布料、保留明暗；遮罩還沒載到就先用原圖。同一張圖同一個顏色只算一次。 */
  tinted(key, color) {
    const source = this.images[key], mask = this.images[`${key}:dye`];
    if (!source?.bounds || !mask?.bounds) return source;
    const cacheKey = `${key}@${color}`;
    this.tintCache ??= new Map();
    if (this.tintCache.has(cacheKey)) return this.tintCache.get(cacheKey);
    const pixelsOf = (image) => {
      const ctx = Object.assign(document.createElement("canvas"), { width: source.naturalWidth, height: source.naturalHeight }).getContext("2d");
      ctx.drawImage(image, 0, 0);
      return { ctx, pixels: ctx.getImageData(0, 0, source.naturalWidth, source.naturalHeight) };
    };
    const { ctx, pixels } = pixelsOf(source);
    const fabric = pixelsOf(mask).pixels.data;
    const data = pixels.data;
    const target = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    const FABRIC_VALUE = 0.89;   // 燕麥色布面的亮度：比它亮的地方（打光）染得更亮、暗的（陰影）染得更暗
    for (let i = 0; i < data.length; i += 4) {
      if (!fabric[i + 3]) continue;
      const shade = Math.max(data[i], data[i + 1], data[i + 2]) / 255 / FABRIC_VALUE;
      for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, target[c] * shade);
    }
    ctx.putImageData(pixels, 0, 0);
    const canvas = Object.assign(ctx.canvas, { naturalWidth: source.naturalWidth, naturalHeight: source.naturalHeight, bounds: source.bounds });
    this.tintCache.set(cacheKey, canvas);
    return canvas;
  }

  /** 有人躺在這張床上睡覺、床也有被子層：被子要蓋到人身上。 */
  sleepingIn(piece) {
    return !!this.catalog[piece.item]?.blanket && this.characters.some((who) => lying(who) && this.seatAt(who.pos)?.id === piece.id);   // 躺著睡的人（屋主或訪客）蓋被子
  }

  /** 床圖（換過色就用染好的）只留被子那一塊：用被子層的形狀裁出來。 */
  blanketCover(piece, bed) {
    const shape = this.images[`${piece.item}:blanket`];
    if (!bed?.bounds || !shape?.bounds) return null;
    if (piece.tint && !this.images[`${piece.item}:dye`]?.bounds) return null;   // 染色遮罩還沒到，先不蓋，免得快取到沒染色的被子
    const cacheKey = `${piece.item}:cover@${piece.tint ?? ""}`;
    this.tintCache ??= new Map();
    if (this.tintCache.has(cacheKey)) return this.tintCache.get(cacheKey);
    const ctx = Object.assign(document.createElement("canvas"), { width: bed.naturalWidth, height: bed.naturalHeight }).getContext("2d");
    ctx.drawImage(bed, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(shape, 0, 0);
    const canvas = Object.assign(ctx.canvas, { naturalWidth: bed.naturalWidth, naturalHeight: bed.naturalHeight, bounds: bed.bounds });
    this.tintCache.set(cacheKey, canvas);
    return canvas;
  }

  /** 這件家具現在是背對鏡頭擺的（有背面圖才算）。 */
  facesAway(piece) {
    return !!piece.back && !!this.catalog[piece.item]?.back;
  }

  toScreen(x, y) { return [this.originX + (x - y) * TILE_W / 2, this.originY + (x + y) * TILE_H / 2]; }

  toCell(px, py) {
    const dx = (px - this.originX) / (TILE_W / 2), dy = (py - this.originY) / (TILE_H / 2);
    return { x: Math.floor((dx + dy) / 2), y: Math.floor((dy - dx) / 2) };
  }

  /** 畫布的實際像素跟著顯示尺寸與裝置像素比走，畫圖仍用邏輯座標。 */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.max(1, (rect.width || this.logical.w) / this.logical.w) * (window.devicePixelRatio || 1);
    const w = Math.round(this.logical.w * ratio), h = Math.round(this.logical.h * ratio);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.ratio = ratio;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.ctx.imageSmoothingQuality = "high";
  }

  pointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    return [(e.clientX - rect.left) * this.logical.w / rect.width, (e.clientY - rect.top) * this.logical.h / rect.height];
  }

  footprint(piece) {
    const spec = this.catalog[piece.item];
    return piece.flip ? { w: spec.d, d: spec.w } : { w: spec.w, d: spec.d };
  }

  pieceAt(px, py) {
    const sorted = [...this.home.placed].sort((a, b) => this.depthOf(b) - this.depthOf(a));
    // isPointInPath 吃的是畫布實際像素，不受目前的縮放影響
    return sorted.find((piece) => this.ctx.isPointInPath(this.boxPath(piece).path, px * this.ratio, py * this.ratio)) ?? null;
  }

  onDown(e) {
    if (!this.state) return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* 合成事件沒有真的指標，抓不到也照樣處理 */ }
    const [px, py] = this.pointer(e);
    const who = this.characterAt(px, py), dog = who ? null : this.petAt(px, py);
    const door = who || dog ? null : this.doorAt(px, py);
    const piece = who || dog || door ? null : this.pieceAt(px, py);
    this.drag = { piece, who, dog, door, startX: px, startY: py, cell: piece ? { x: piece.x, y: piece.y } : this.toCell(px, py), moved: false };
  }

  onMove(e) {
    if (!this.drag?.piece) return;
    const [px, py] = this.pointer(e);
    if (Math.hypot(px - this.drag.startX, py - this.drag.startY) > 6) this.drag.moved = true;
    if (!this.drag.moved) return;
    const grab = this.toCell(this.drag.startX, this.drag.startY);
    const here = this.toCell(px, py);
    this.drag.cell = { x: this.drag.piece.x + here.x - grab.x, y: this.drag.piece.y + here.y - grab.y };
    this.draw();
  }

  onUp(e) {
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;
    if (drag.who) this.handlers.onCharacterTap?.(drag.who);
    else if (drag.dog) this.handlers.onPetTap?.(drag.dog);
    else if (drag.door) this.handlers.onDoorTap?.(drag.door);
    else if (drag.piece && drag.moved) this.handlers.onPieceDrop(drag.piece, drag.cell);
    else if (drag.piece) this.handlers.onPieceTap(drag.piece, this.toCell(drag.startX, drag.startY));
    else if (this.inRoom(drag.cell)) this.handlers.onCellTap(drag.cell);
    this.draw();
  }

  /** 點到哪個小人：以腳底為中心、小人高度的長方形。 */
  characterAt(px, py) {
    return this.characters.find((who) => {
      const [sx, sy] = this.toScreen(who.pos.x + 0.5, who.pos.y + 0.5);
      return Math.abs(px - sx) < 22 && py < sy + 8 && py > sy - CHARACTER_HEIGHT;
    }) ?? null;
  }

  petAt(px, py) {
    return this.pets?.dogs.find((dog) => {
      const [sx, sy] = this.toScreen(dog.pos.x + 0.5, dog.pos.y + 0.5);
      return Math.abs(px - sx) < 24 && py < sy + 8 && py > sy - 50;
    }) ?? null;
  }

  inRoom(cell) { return cell.x >= 0 && cell.y >= 0 && cell.x < this.home.width && cell.y < this.home.depth; }

  depthOf(piece) { if (this.onWall(piece)) return -2; if (this.catalog[piece.item]?.floor) return -1; const { w, d } = this.footprint(piece); return piece.x + w + piece.y + d; }   // 地板層永遠先畫

  cellsOf(piece) {
    if (this.onWall(piece)) return [];   // 掛在牆上的不占地板
    const { w, d } = this.footprint(piece);
    const cells = [];
    for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < d; dy++) cells.push(`${piece.x + dx},${piece.y + dy}`);
    return cells;
  }

  /** 家具（洗手台、爐台）旁邊站得進去的格子裡離 from 最近的那格；from 已經緊鄰它就是 from 自己；沒有就 null。 */
  spotBeside(piece, from) {
    const cells = this.cellsOf(piece).map(parseCell);
    if (cells.some((cell) => Math.abs(cell.x - from.x) + Math.abs(cell.y - from.y) === 1)) return from;
    const blocked = new Set(this.home.placed.filter((p) => !this.catalog[p.item]?.floor && !this.catalog[p.item]?.seat && !this.catalog[p.item]?.onWall).flatMap((p) => this.cellsOf(p)));
    const open = cells.flatMap(besideCells).filter((cell) => this.inRoom(cell) && !blocked.has(`${cell.x},${cell.y}`));
    return open.sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0] ?? null;
  }

  /** 從 cell 看過去、緊鄰的那格洗手台在哪個方向（{dx, dy}）；旁邊沒有洗手台就 null。 */
  basinDirection(cell) {
    for (const piece of this.home.placed.filter((p) => this.catalog[p.item]?.washbasin)) {
      for (const { x, y } of this.cellsOf(piece).map(parseCell)) {
        if (Math.abs(x - cell.x) + Math.abs(y - cell.y) === 1) return { dx: x - cell.x, dy: y - cell.y };
      }
    }
    return null;
  }

  /** 這一格上可坐的家具（沙發、床），沒有就 null。 */
  seatAt(cell) {
    const key = `${Math.round(cell.x)},${Math.round(cell.y)}`;
    return this.home.placed.find((piece) => this.catalog[piece.item]?.seat && this.cellsOf(piece).includes(key)) ?? null;
  }

  /** 家具占的地板範圍（格），排前後用。 */
  boxOf(piece, at = piece) {
    const { w, d } = this.footprint(piece);
    return { x0: at.x, x1: at.x + w, y0: at.y, y1: at.y + d };
  }

  /** 人占的地板範圍：坐著、躺著就是那件家具的範圍（跟家具與前景層用深度細排）；抱在一起時不給，照深度排。 */
  characterBox(character) {
    if (character.cuddleAt || character.behind) return null;
    const seat = seated(character) ? this.seatAt(character.pos) : null;
    if (seat) return this.boxOf(seat);
    return { x0: character.pos.x, x1: character.pos.x + 1, y0: character.pos.y, y1: character.pos.y + 1 };
  }

  /** 人物的前後：坐在家具上就畫在那件家具前面（背對鏡頭的椅子畫在後面）。 */
  characterDepth(character) {
    if (character.cuddleAt) return character.cuddleAt.x + character.cuddleAt.y + 2;
    const seat = seated(character) ? this.seatAt(character.pos) : null;
    if (seat && lying(character)) { const spot = this.sleepSpot(character); return this.depthOf(seat) + 0.5 + (spot.x + spot.y) * 0.001; }   // 同床的兩人，靠外側的畫在上面
    if (seat && this.facesAway(seat) && !this.hasFrontLayer(seat)) return this.depthOf(seat) - 0.01;   // 背對鏡頭的沙發：人坐在椅背後面，椅背擋住下半身
    const bath = this.bathSpot(character);
    if (seat && bath) return this.depthOf(seat) + 0.5 + (bath.x + bath.y) * 0.001;   // 一起泡澡：靠近鏡頭那端的人畫在上面
    return seat ? this.depthOf(seat) + 0.5 : character.pos.x + character.pos.y + 2;
  }

  /** 家具的立方體外框（地面菱形往上拉高），用來畫色塊與判斷點到誰。 */
  /** 掛在牆上的家具（窗戶）：沒翻轉掛後牆、翻轉掛左牆。 */
  onWall(piece) {
    return !!this.catalog[piece.item]?.onWall;
  }

  /** 牆上家具在哪面牆、從第幾格開始；at 可以是拖曳中的格子（掛後牆看 x、掛左牆看 y）。 */
  wallSpot(piece, at = piece) {
    return piece.flip ? { wall: "left", along: at.y } : { wall: "back", along: at.x };
  }

  /** 牆上家具：照牆面底圖畫的圖，anchor 是占的第一格在牆腳（後牆）的像素、與 w 格在畫面上的水平寬；掛左牆時左右鏡射。 */
  drawWallPiece(piece, at, alpha) {
    const { ctx } = this;
    const spec = this.catalog[piece.item];
    const { wall, along } = this.wallSpot(piece, at);
    const image = this.images[piece.item];
    ctx.save();
    ctx.globalAlpha = alpha;
    if (spec.mirror) {
      this.drawMirror(wall, along, spec.w);
    } else if (image?.bounds && spec.anchor) {
      const [sx, sy] = wall === "back" ? this.toScreen(along, 0) : this.toScreen(0, along);
      const scale = spec.w * TILE_W / 2 / spec.anchor.width;
      ctx.translate(sx, 0); if (wall === "left") ctx.scale(-1, 1);
      ctx.drawImage(image, -spec.anchor.x * scale, sy - spec.anchor.y * scale, image.naturalWidth * scale, image.naturalHeight * scale);
    } else {
      ctx.fillStyle = spec.color; ctx.fill(this.wallPath(wall, along + 0.15, along + spec.w - 0.15, WALL_H * 0.35, WALL_H * 0.85));
    }
    ctx.restore();
    if (piece.id === this.selectedId) { ctx.save(); ctx.strokeStyle = "#d98a5c"; ctx.lineWidth = 3; ctx.stroke(this.boxPath(piece, at).path); ctx.restore(); }
  }

  /** 鏡子：牆面上的橢圓（跟著牆的斜角傾斜），照出站在前面的人。
   *  反射＝把人畫在牆後面那間「鏡中房間」的對稱位置、裁成鏡面形狀：背對鏡頭的人在鏡子裡露出正臉（斜後、斜前對調，左右翻轉不變）。 */
  drawMirror(wall, along, width) {
    const { ctx } = this;
    const [ox, oy] = wall === "back" ? this.toScreen(along, 0) : this.toScreen(0, along);
    const [ux, uy] = wall === "back" ? [TILE_W / 2, TILE_H / 2] : [-TILE_W / 2, TILE_H / 2];   // 沿牆走一格在畫面上的位移
    const oval = (grow) => {   // 牆面座標（沿牆格數、離地高度）畫橢圓，再換回畫面座標
      const path = new Path2D();
      path.ellipse(width / 2, MIRROR_CENTER_H, width * MIRROR_RX + grow / TILE_W, MIRROR_RY + grow, 0, 0, Math.PI * 2);
      const onWall = new Path2D();
      onWall.addPath(path, new DOMMatrix([ux, uy, 0, -1, ox, oy]));
      return onWall;
    };
    const glass = oval(0);
    ctx.save();
    ctx.clip(glass);
    const [gx, gy] = wall === "back" ? this.toScreen(along + width / 2, 0) : this.toScreen(0, along + width / 2);
    const fill = ctx.createLinearGradient(gx, gy - MIRROR_CENTER_H - MIRROR_RY, gx, gy - MIRROR_CENTER_H + MIRROR_RY);
    fill.addColorStop(0, "#eef4f6"); fill.addColorStop(1, "#c9d8de");
    ctx.fillStyle = fill; ctx.fill(glass);
    const time = performance.now() / 1000;
    for (const character of this.characters) {
      const reflection = this.reflectionOf(character, wall, along, width);
      if (reflection) this.drawCharacter(reflection, time);
    }
    ctx.globalAlpha *= 0.3;   // 鏡面左上一道細細的反光，不蓋到臉
    ctx.fillStyle = "#ffffff";
    ctx.fill(new Path2D(`M ${gx - 12} ${gy - MIRROR_CENTER_H + 4} l 5 0 l 12 -26 l -5 0 z`));
    ctx.restore();
    ctx.lineWidth = 5; ctx.strokeStyle = "#b07a45"; ctx.stroke(glass);
    ctx.lineWidth = 1.5; ctx.strokeStyle = "#7a5230"; ctx.stroke(oval(3));
  }

  /** 站在鏡子前（沿牆落在鏡面範圍、離牆 MIRROR_REACH 格內）的人在鏡子裡的樣子；躺著、泡澡、抱在一起的不照。
   *  斜角投影照物理算，影像會沿牆偏出鏡框；這裡照「站在鏡子前就看得到自己」：影像對齊本人沿牆的位置，腳底放在牆腳略下方，鏡面剛好框住頭肩，離得越遠影像越高一點。 */
  reflectionOf(character, wall, along, width) {
    if (!character.pos || lying(character) || character.bathing || character.cuddleAt || character.behind) return null;
    const { x, y } = character.pos;
    const [alongPos, distance] = wall === "back" ? [x + 0.5, y + 0.5] : [y + 0.5, x + 0.5];
    if (alongPos < along - 0.5 || alongPos > along + width + 0.5 || distance > MIRROR_REACH) return null;
    const shown = along + width / 2 + (alongPos - along - width / 2) * MIRROR_SQUEEZE;   // 往鏡子中間收：兩人並肩站時都照得進去
    const [sx, sy] = wall === "back" ? this.toScreen(shown, 0) : this.toScreen(0, shown);
    const image = { ...character, drawnAt: [sx, sy + MIRROR_FEET_DROP - distance * MIRROR_DISTANCE_RISE], drawMemo: (character.mirrorMemo ??= { deferred: 0 }) };   // 鏡像的人像另外存，不蓋掉本人的
    this.face(image, ...mirroredFacing(character, wall));
    return image;
  }

  drawWallPieces() {
    for (const piece of this.home.placed.filter((p) => this.onWall(p))) {
      const dragging = this.drag?.piece?.id === piece.id && this.drag.moved;
      this.drawWallPiece(piece, dragging ? this.drag.cell : piece, dragging ? 0.6 : 1);
    }
  }

  boxPath(piece, at = piece) {
    if (this.onWall(piece)) {   // 牆上家具：點選範圍是牆上那一塊
      const { wall, along } = this.wallSpot(piece, at);
      return { path: this.wallPath(wall, along, along + this.catalog[piece.item].w, WALL_H * 0.3, WALL_H * 0.9), corners: null };
    }
    const { w, d } = this.footprint(piece);
    const h = this.catalog[piece.item].height * UNIT_H;
    const [ax, ay] = this.toScreen(at.x, at.y), [bx, by] = this.toScreen(at.x + w, at.y);
    const [cx, cy] = this.toScreen(at.x + w, at.y + d), [dx, dy] = this.toScreen(at.x, at.y + d);
    const path = new Path2D();
    path.moveTo(ax, ay - h); path.lineTo(bx, by - h); path.lineTo(bx, by); path.lineTo(cx, cy); path.lineTo(dx, dy); path.lineTo(dx, dy - h); path.closePath();
    return { path, corners: { ax, ay, bx, by, cx, cy, dx, dy, h } };
  }

  draw() {
    if (!this.state) return;
    this.freshBudget = FRESH_PER_FRAME;
    const { ctx } = this;
    ctx.clearRect(0, 0, this.logical.w, this.logical.h);
    this.drawWalls();
    this.drawWallPieces();
    this.drawDoors();
    this.drawFloor();
    this.drawGlow();
    const time = performance.now() / 1000;
    const drawables = [
      ...this.home.placed.filter((piece) => !this.onWall(piece)).map((piece) => {
        const dragging = this.drag?.piece?.id === piece.id && this.drag.moved;
        const at = dragging ? { ...piece, ...this.drag.cell } : piece;
        return { depth: this.depthOf(piece), box: this.catalog[piece.item]?.floor ? null : this.boxOf(piece, at), draw: () => {
          this.drawPiece(piece, at, dragging ? 0.6 : 1);
          if (!dragging) this.drawTableItems(piece);
        } };
      }),
      ...this.home.placed.filter((piece) => this.hasFrontLayer(piece) && !(this.drag?.piece?.id === piece.id && this.drag.moved))
        .map((piece) => ({ depth: this.depthOf(piece) + 0.6, box: this.boxOf(piece), draw: () => this.drawPiece(piece, piece, 1, "front") })),
      ...this.home.placed.filter((piece) => this.catalog[piece.item]?.seatPose === "shower" && !(this.drag?.piece?.id === piece.id && this.drag.moved))
        .map((piece) => ({ depth: this.depthOf(piece) + 0.6, box: this.boxOf(piece), draw: () => this.drawShowerGlass(piece, time) })),
      ...this.home.placed.filter((piece) => this.sleepingIn(piece))
        .map((piece) => ({ depth: this.depthOf(piece) + 0.6, box: this.boxOf(piece), draw: () => this.drawPiece(piece, piece, 1, "blanket") })),
      ...this.characterDrawables(time),
      ...(this.pets?.drawables() ?? []),
    ];
    for (const drawable of paintersOrder(drawables)) drawable.draw();
    this.drawSteam(time);
    this.drawNight();
    this.drawHearts();
    this.drawEffects();
    this.drawMarkers();
    this.drawBubbles();   // 對話框永遠在最上面
  }

  drawEffects() {
    const now = performance.now();
    this.effects = this.effects.filter((effect) => now < effect.until);
    for (const effect of this.effects) effect.draw(this.ctx, now);
  }

  /** 人物頭頂在畫面上的位置（躺著的頭比較低）。 */
  headTop(who) {
    const [sx, sy] = this.drawnSpot(who);
    return [sx, sy - (lying(who) ? SLEEP_Z_LIFT : CHARACTER_HEIGHT)];
  }

  /** 標了 marker 的人（訪客頁的自己）頭上一個上下輕晃的小三角：一屋子人時找得到自己。 */
  drawMarkers() {
    const { ctx } = this;
    for (const who of this.characters) {
      if (!who.marker || !who.pos) continue;
      const [sx, top] = this.headTop(who);
      const y = top - 6 + Math.sin(performance.now() / 300) * 2;
      ctx.save();
      ctx.fillStyle = "#d98a5c"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx - 6, y - 9); ctx.lineTo(sx + 6, y - 9); ctx.lineTo(sx, y); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  /** 人物的繪製項目：抱在一起的兩人併成一項（深度用下層那人的），其他人各自一項。
   *  坐在 legsUnder 的家具上（背對的餐椅）：小腿和腳掌拆成另一項，排在家具本身之前，收在椅墊底下。 */
  characterDrawables(time) {
    const pair = this.embrace();
    const alone = this.characters.filter((who) => !pair?.includes(who));
    return [
      ...alone.flatMap((character) => {
        const depth = this.characterDepth(character), box = this.characterBox(character);
        const seat = seated(character) ? this.seatAt(character.pos) : null;
        if (!seat || !this.seatSide(seat)?.legsUnder) return [{ depth, box, draw: () => this.drawCharacter(character, time) }];
        const bones = character.skeletons[character.view].data.zOrder;
        const body = new Set(bones.filter((bone) => !LOWER_LEG.test(bone))), legs = new Set(bones.filter((bone) => LOWER_LEG.test(bone)));
        return [
          { depth, box, draw: () => this.drawCharacter(character, time, body) },
          { depth: this.depthOf(seat) - 0.05, box, draw: () => this.drawCharacter(character, time, legs) },
        ];
      }),
      ...(pair ? [{ depth: this.characterDepth(pair[1]), draw: () => this.drawEmbrace(pair, time) }] : []),
    ];
  }

  /** 兩人坐在同一件家具上時，兩句話併成一個共用的對話框；否則各自冒。 */
  drawBubbles() {
    for (const piece of this.home.placed) {   // 開著的電視上面寫正在播什麼
      const spec = this.catalog[piece.item];
      if (!spec?.tv || !piece.on || !piece.program) continue;
      const { w, d } = this.footprint(piece);
      const [sx, sy] = this.toScreen(piece.x + w / 2, piece.y + d / 2);
      this.bubbleAt(sx, sy - spec.height * UNIT_H * (spec.size ?? 1) - 10, `正在播：${piece.program}`);
    }
    const now = performance.now();
    const talking = this.characters.filter((who) => who.bubble && now < who.bubble.until);
    if (talking.length === 2) {
      const seats = talking.map((who) => seated(who) ? this.seatAt(who.pos)?.id : null);
      if (seats[0] && seats[0] === seats[1]) {
        const [a, b] = talking;
        const mid = { pos: { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2 }, bubble: { text: `${a.label ?? LABEL[a.name]}：${a.bubble.text}\n${b.label ?? LABEL[b.name]}：${b.bubble.text}`, until: Math.max(a.bubble.until, b.bubble.until) } };
        this.drawBubble(mid);
        return;
      }
    }
    for (const who of talking) this.drawBubble(who);
  }

  /** 家裡有燈但全關著＝夜晚：整間罩一層藍夜色，開著的燈才把光暈畫在夜色上。 */
  isNight() {
    const lamps = this.home.placed.filter((piece) => this.catalog[piece.item]?.switch);
    return lamps.length > 0 && lamps.every((piece) => !piece.on);
  }

  drawNight() {
    if (this.sleeping) {   // 一起睡：畫面暗下來、床邊冒 z
      const { ctx } = this;
      ctx.save();
      ctx.fillStyle = "rgba(20, 25, 60, 0.55)"; ctx.fillRect(0, 0, this.logical.w, this.logical.h);
      const who = this.characters[0];
      if (who) {
        const [sx, sy] = this.drawnSpot(who);
        const top = lying(who) ? SLEEP_Z_LIFT : CHARACTER_HEIGHT;   // z 從頭旁邊冒：躺著的頭低很多
        const t = performance.now() / 1000;
        ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = "16px sans-serif"; ctx.textAlign = "center";
        for (let i = 0; i < 3; i++) { const phase = (t / 2 + i / 3) % 1; ctx.globalAlpha = 1 - phase; ctx.fillText("z", sx + 20 + phase * 30, sy - top - phase * 40); }
      }
      ctx.restore();
      return;
    }
    if (!this.isNight()) return;
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = "rgba(30, 40, 90, 0.42)";
    ctx.fillRect(0, 0, this.logical.w, this.logical.h);
    ctx.restore();
  }

  /** 桌上有東西：一樣一樣排在桌面上。頁面有給 drawTableIcon（畫得出來回 true）就畫縮圖，其餘畫小圓點。 */
  drawTableItems(piece) {
    const items = piece.items ?? [];
    if (!items.length || this.catalog[piece.item]?.drawer) return;   // 抽屜裡的東西藏著不畫
    const { ctx } = this;
    const { w, d } = this.footprint(piece);
    const [sx, sy] = this.toScreen(piece.x + w / 2, piece.y + d / 2);
    const surface = sy - this.catalog[piece.item].height * UNIT_H;
    ctx.save();
    items.forEach((item, i) => {
      const x = sx + (i - (items.length - 1) / 2) * TABLE_ICON_GAP;
      if (this.drawTableIcon?.(ctx, item, x - TABLE_ICON / 2, surface - TABLE_ICON * 0.8, TABLE_ICON)) return;
      ctx.fillStyle = { note: "#fff6c8", dish: "#f2c14e" }[item.kind] ?? "#e07a5f"; ctx.strokeStyle = "#5a3a1a"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, surface - 10, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    ctx.restore();
  }

  /** 淋浴間靠鏡頭的兩片玻璃（L 型乾濕分離）：有人在洗就先畫雨淋頭落下的水，再蓋上中段霧面、上下透明的玻璃和銀框。 */
  drawShowerGlass(piece, time) {
    const { ctx } = this;
    const { w, d } = this.footprint(piece);
    const left = this.toScreen(piece.x, piece.y + d), front = this.toScreen(piece.x + w, piece.y + d), right = this.toScreen(piece.x + w, piece.y);
    const panel = ([ax, ay], [bx, by], h0, h1) => {
      const path = new Path2D();
      path.moveTo(ax, ay - h0); path.lineTo(bx, by - h0); path.lineTo(bx, by - h1); path.lineTo(ax, ay - h1); path.closePath();
      return path;
    };
    ctx.save();
    if (this.characters.some((who) => who.showering && this.seatAt(who.pos)?.id === piece.id)) this.drawShowerWater(piece, { left, front, right }, time);
    const [frostFrom, frostTo] = SHOWER_FROST;
    for (const [a, b] of [[left, front], [front, right]]) {
      ctx.fillStyle = "rgba(205,228,238,0.22)"; ctx.fill(panel(a, b, 0, SHOWER_GLASS_H));
      ctx.fillStyle = "#e6eff3"; ctx.fill(panel(a, b, SHOWER_GLASS_H * frostFrom, SHOWER_GLASS_H * frostTo));
      ctx.strokeStyle = "#aeb8be"; ctx.lineWidth = 1.5; ctx.stroke(panel(a, b, 0, SHOWER_GLASS_H));
    }
    ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 2; ctx.lineCap = "round";   // 右片玻璃上緣一道斜斜的反光
    const along = (t, h) => [front[0] + (right[0] - front[0]) * t, front[1] + (right[1] - front[1]) * t - h];
    ctx.beginPath(); ctx.moveTo(...along(0.25, SHOWER_GLASS_H * 0.95)); ctx.lineTo(...along(0.55, SHOWER_GLASS_H * 0.82)); ctx.stroke();
    ctx.restore();
  }

  /** 雨淋頭落下的水：幾道短水線從蓮蓬頭一路落到淋浴盤。雨淋頭的位置是原圖座標（SHOWER_HEAD），照 anchor 換到畫面上。 */
  drawShowerWater(piece, { left, front, right }, time) {
    const { ctx } = this;
    const anchor = this.catalog[piece.item].anchor;
    const scale = (right[0] - left[0]) / anchor.width;
    const mirror = this.imageMirrored(piece) ? -1 : 1;
    const headX = front[0] + mirror * (SHOWER_HEAD.x - anchor.x) * scale, headY = front[1] + (SHOWER_HEAD.y - anchor.y) * scale;
    const floorY = front[1] - SHOWER_FLOOR_RISE;
    ctx.strokeStyle = "rgba(110,170,220,0.9)"; ctx.lineWidth = 1.6; ctx.lineCap = "round";
    for (let i = 0; i < SHOWER_STREAMS; i++) {
      const phase = (time * 1.4 + i * 0.37) % 1;
      const x = headX + (i / (SHOWER_STREAMS - 1) - 0.5) * SHOWER_HEAD.spread * scale;
      const y = headY + phase * (floorY - headY);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, Math.min(y + 8, floorY)); ctx.stroke();
    }
  }

  /** 有人在泡澡的浴缸：水面上飄幾縷熱氣，慢慢往上散開。 */
  drawSteam(time) {
    const { ctx } = this;
    const tubs = new Map();
    for (const who of this.characters) if (who.bathing || who.showering) { const tub = this.seatAt(who.pos); if (tub) tubs.set(tub.id, { tub, rise: who.showering ? SHOWER_STEAM_RISE : BATH_STEAM_RISE }); }
    for (const { tub, rise } of tubs.values()) {
      const { w, d } = this.footprint(tub);
      const [cx, cy] = this.toScreen(tub.x + w / 2, tub.y + d / 2);
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 3; ctx.lineCap = "round";
      for (let i = 0; i < 4; i++) {
        const phase = (time * 0.25 + i / 4) % 1;
        const x = cx + (i - 1.5) * 12, y = cy - rise - phase * 40;   // 從頭頂上方開始飄
        ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.8;
        ctx.beginPath();
        for (let k = 0; k <= 12; k++) { const t = k / 12; ctx.lineTo(x + Math.sin(t * 6 + time * 2 + i) * 4, y - t * 22); }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** 開著的燈在地板上灑一圈暖光；有燈開著時就不是夜晚，暖光畫在地板上。 */
  drawGlow() {
    const { ctx } = this;
    for (const piece of this.home.placed) {
      if (!piece.on) continue;
      const [sx, sy] = this.toScreen(piece.x + 0.5, piece.y + 0.5);
      const radius = this.catalog[piece.item]?.glow ?? 110;   // 小夜燈這類小燈的目錄寫 glow 縮小光圈
      const tint = this.catalog[piece.item]?.glowColor ?? "255, 214, 140";   // 南瓜燈的目錄寫 glowColor 換成橘光（"r, g, b"）
      const glow = ctx.createRadialGradient(sx, sy, 8, sx, sy, radius);
      glow.addColorStop(0, `rgba(${tint}, 0.55)`); glow.addColorStop(1, `rgba(${tint}, 0)`);
      ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.5); ctx.translate(-sx, -sy);
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sx, sy, radius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  /** 這間房的地板／壁紙樣式；沒載到樣式清單（兒童版）就用原本的米色。 */
  surface(kind) {
    const list = this.surfaces?.[kind === "floor" ? "floors" : "walls"];
    const id = this.home[kind] ?? (kind === "floor" ? "tile" : "plain");
    return list?.[id] ?? (kind === "floor" ? { pattern: "checker", colors: ["#e3cfb0", "#d9c2a0"], line: "#cdb593" } : { pattern: "plain", colors: ["#e9dcc4", "#f4e9d3"] });
  }

  /** 牆面上一塊：沿牆 t0～t1 格、離地 h0～h1 px。wall 是 "left"（x＝0 那面）或 "back"（y＝0 那面）。 */
  wallPath(wall, t0, t1, h0, h1) {
    const at = (t) => (wall === "back" ? this.toScreen(t, 0) : this.toScreen(0, t));
    const [ax, ay] = at(t0), [bx, by] = at(t1);
    const path = new Path2D();
    path.moveTo(ax, ay - h0); path.lineTo(bx, by - h0); path.lineTo(bx, by - h1); path.lineTo(ax, ay - h1); path.closePath();
    return path;
  }

  drawWalls() {
    const { ctx } = this;
    const style = this.surface("wall");
    const walls = [["left", this.home.depth, style.colors[0]], ["back", this.home.width, style.colors[1] ?? style.colors[0]]];
    for (const [wall, length, color] of walls) {
      ctx.fillStyle = color; ctx.fill(this.wallPath(wall, 0, length, 0, WALL_H));
      ctx.save();
      ctx.clip(this.wallPath(wall, 0, length, 0, WALL_H));
      ctx.fillStyle = style.accent ?? color;
      if (style.pattern === "stripes") for (let t = 0; t < length; t += 0.5) ctx.fill(this.wallPath(wall, t, t + 0.2, 0, WALL_H));
      if (style.pattern === "dots") {
        for (let row = 0; row * 18 < WALL_H; row++) for (let t = (row % 2) * 0.25; t < length; t += 0.5) {
          const [x, y] = wall === "back" ? this.toScreen(t + 0.125, 0) : this.toScreen(0, t + 0.125);
          ctx.beginPath(); ctx.arc(x, y - 10 - row * 18, 2.2, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (style.pattern === "wainscot") {
        ctx.fill(this.wallPath(wall, 0, length, 0, WALL_H * 0.38));
        ctx.fillStyle = "rgba(90,60,30,0.25)";
        for (let t = 0.5; t < length; t += 0.5) ctx.fill(this.wallPath(wall, t, t + 0.03, 0, WALL_H * 0.38));
        ctx.fillStyle = "#9a6a3d"; ctx.fill(this.wallPath(wall, 0, length, WALL_H * 0.38, WALL_H * 0.38 + 3));
      }
      if (style.pattern === "baseboard") {   // 牆腳一條木踢腳板，上緣一道收邊
        ctx.fill(this.wallPath(wall, 0, length, 0, BASEBOARD_H));
        ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fill(this.wallPath(wall, 0, length, BASEBOARD_H - 1.5, BASEBOARD_H));
      }
      ctx.restore();
    }
  }

  /** 門在牆上的外框：門格那段牆往上拉 DOOR_H。 */
  doorPath(door) {
    const along = door.wall === "back" ? (t) => this.toScreen(door.at + t, 0) : (t) => this.toScreen(0, door.at + t);
    const [ax, ay] = along(DOOR_INSET), [bx, by] = along(1 - DOOR_INSET);
    const path = new Path2D();
    path.moveTo(ax, ay); path.lineTo(bx, by); path.lineTo(bx, by - DOOR_H); path.lineTo(ax, ay - DOOR_H); path.closePath();
    return { path, top: [(ax + bx) / 2, (ay + by) / 2 - DOOR_H] };
  }

  doorAt(px, py) {
    return this.home.doors.find((door) => this.ctx.isPointInPath(this.doorPath(door).path, px * this.ratio, py * this.ratio)) ?? null;
  }

  /** 門：深色門洞加木框，門上寫通到哪間房。 */
  drawDoors() {
    const { ctx } = this;
    for (const door of this.home.doors) {
      const { path, top } = this.doorPath(door);
      ctx.save();
      ctx.fillStyle = "#6b5140"; ctx.fill(path);
      ctx.strokeStyle = "#a88a63"; ctx.lineWidth = 4; ctx.stroke(path);
      ctx.fillStyle = "#3b2f2a"; ctx.font = "13px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(this.state.rooms[door.to]?.name ?? "", top[0], top[1] - 8);
      ctx.restore();
    }
  }

  /** 地板上一塊：x0～x1、y0～y1（格）。 */
  floorPath(x0, x1, y0, y1) {
    const path = new Path2D();
    const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => this.toScreen(x, y));
    path.moveTo(...corners[0]); for (const corner of corners.slice(1)) path.lineTo(...corner); path.closePath();
    return path;
  }

  drawFloor() {
    const { ctx } = this;
    const { width, depth } = this.home;
    const style = this.surface("floor");
    ctx.save();
    ctx.strokeStyle = style.line ?? "rgba(0,0,0,0.15)"; ctx.lineWidth = style.pattern === "planks" ? 0.6 : 1;
    if (style.pattern === "planks") {
      // 木地板：每格三條木板沿 x 方向排，一片兩格長，每排錯開接縫；顏色照位置固定挑，重畫不會閃
      const PER_CELL = 3, LENGTH = 2;
      for (let row = 0; row < depth * PER_CELL; row++) {
        for (let start = -((row * 7) % 3) * (LENGTH / 3); start < width; start += LENGTH) {
          const a = Math.max(0, start), b = Math.min(width, start + LENGTH);
          const path = this.floorPath(a, b, row / PER_CELL, (row + 1) / PER_CELL);
          ctx.fillStyle = style.colors[Math.abs(row * 31 + Math.round(start * 3) * 17) % style.colors.length];
          ctx.fill(path); ctx.stroke(path);
        }
      }
    } else {
      for (let x = 0; x < width; x++) for (let y = 0; y < depth; y++) {
        const path = this.floorPath(x, x + 1, y, y + 1);
        ctx.fillStyle = style.colors[(x + y) % style.colors.length];
        ctx.fill(path); ctx.stroke(path);
      }
    }
    const hover = this.drag && !this.drag.piece ? this.drag.cell : null;
    if (hover) { ctx.fillStyle = "rgba(246,212,166,0.75)"; ctx.fill(this.floorPath(hover.x, hover.x + 1, hover.y, hover.y + 1)); }
    ctx.restore();
  }

  /** 開著的電視畫哪張：這一台有自己的畫面就用它，沒有（或還沒載到）用通用的亮螢幕；都還沒載到就是 null，先畫關著的。 */
  screenKey(piece) {
    return [`${piece.item}:on:${piece.program}`, `${piece.item}:on`].find((key) => this.images[key]?.bounds) ?? null;
  }

  /** layer："front" 只畫前景層（蓋在坐著的人身上）、"blanket" 只畫被子（蓋在躺著的人身上）；沒給就畫整件。 */
  drawPiece(piece, at, alpha, layer = null) {
    const { ctx } = this;
    const spec = this.catalog[piece.item];
    const away = this.facesAway(piece);
    const frontLayer = layer !== null;
    const lit = !frontLayer && piece.on && spec.tv && this.screenKey(piece);
    const key = layer === "front" ? `${piece.item}${away ? ":back" : ""}:front` : away ? `${piece.item}:back` : lit || piece.item;
    const base = piece.tint && spec.dye ? this.tinted(key, piece.tint) : this.images[key];
    const image = layer === "blanket" ? this.blanketCover(piece, base) : base;
    if (frontLayer && !image?.bounds) return;   // 前景層還沒載到就先不蓋，不退回色塊
    const anchor = away ? spec.back.anchor : spec.anchor;
    const { path, corners: c } = this.boxPath(piece, at);
    ctx.save();
    ctx.globalAlpha = alpha;
    const mirrored = this.imageMirrored(piece);
    const left = Math.min(c.dx, c.ax), right = Math.max(c.bx, c.cx);
    const resized = image?.bounds && spec.size;
    if (resized) {   // 圖畫得比占地格小（或大）：以占地菱形中心為準縮放，家具還是站在格子正中；選取框照占地格畫，不跟著縮
      const centerX = (left + right) / 2, centerY = (c.ay + c.cy) / 2;
      ctx.save(); ctx.translate(centerX, centerY); ctx.scale(spec.size, spec.size); ctx.translate(-centerX, -centerY);
    }
    if (image?.bounds && anchor) {
      // 圖是照占地格底圖畫的：anchor 是底圖上占地菱形「最前面的角」的像素與菱形寬度，直接對到畫面上的角
      const a = anchor;
      const scale = (right - left) / a.width;
      ctx.save(); if (mirrored) { ctx.translate(right + left, 0); ctx.scale(-1, 1); }
      const frontX = mirrored ? right + left - c.cx : c.cx;
      ctx.drawImage(image, frontX - a.x * scale, c.cy - a.y * scale, image.naturalWidth * scale, image.naturalHeight * scale);
      ctx.restore();
    } else if (image?.bounds) {
      // 裁掉透明邊，讓圖的實際寬度貼齊占地菱形的寬度，底邊對齊最前面的角
      const b = image.bounds;
      const scale = (right - left) / b.w;
      const wilt = spec.plant && isThirsty(piece) ? 0.82 : 1;   // 渴了的盆栽矮一截、顏色暗一點
      ctx.save(); if (mirrored) { ctx.translate(right + left, 0); ctx.scale(-1, 1); }
      if (wilt < 1) ctx.filter = "saturate(0.6) brightness(0.9)";
      ctx.drawImage(image, b.x, b.y, b.w, b.h, left, c.cy - b.h * scale * wilt, b.w * scale, b.h * scale * wilt);
      ctx.restore();
    } else {
      ctx.fillStyle = spec.color; ctx.fill(path);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath(); ctx.moveTo(c.bx, c.by - c.h); ctx.lineTo(c.cx, c.cy - c.h); ctx.lineTo(c.cx, c.cy); ctx.lineTo(c.bx, c.by); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath(); ctx.moveTo(c.ax, c.ay - c.h); ctx.lineTo(c.bx, c.by - c.h); ctx.lineTo(c.cx, c.cy - c.h); ctx.lineTo(c.dx, c.dy - c.h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#3b2f2a"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(spec.label + (piece.flip ? "↺" : ""), (c.ax + c.cx) / 2, (c.ay + c.cy) / 2 - c.h / 2 + 4);
    }
    if (resized) ctx.restore();
    if (piece.id === this.selectedId && !frontLayer) { ctx.strokeStyle = "#d98a5c"; ctx.lineWidth = 3; ctx.stroke(path); }
    ctx.restore();
  }
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const ch of text) {
    const newline = ch.charCodeAt(0) === 10;
    if (newline || ctx.measureText(line + ch).width > maxWidth) { lines.push(line); line = newline ? "" : ch; }
    else line += ch;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

/** 從臀部往前彎 degrees 度：軀幹（根骨頭）往前轉，兩條大腿反轉同樣的度數，腳還是直的。軀幹負值＝往前。 */
function bendAtHips(pose, degrees) {
  const add = (bone, delta) => { pose[bone] = { ...pose[bone], angle: (pose[bone]?.angle ?? 0) + delta }; };
  add("torso", -degrees);
  add("upper_leg_l", degrees);
  add("upper_leg_r", degrees);
}
