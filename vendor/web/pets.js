// 家裡的兩隻狗：在房間裡自己晃、有狗窩就去趴、會偷跳上沙發和床、阿童走動時偶爾跟上去。
// 位置只在瀏覽器裡，不存檔；存檔只記上次吃飯的時間（state.fed）。

const DOG_SPEED = 1.6;        // 格／秒
const DOG_HEIGHT = 46;        // 站著時的畫面高度（像素）
const REST_MIN = 4, REST_MAX = 12;   // 站著發呆多久再去別的地方（秒）
const NAP_MIN = 20, NAP_MAX = 60;    // 在狗窩趴多久
const FOLLOW_CHANCE = 0.35;
const CLIMB_CHANCE = 0.2;     // 閒晃時偷跳上沒人坐的沙發或床
const BOWL_WAIT_CHANCE = 0.5; // 肚子餓時跑去狗碗旁邊等
const HUNGRY_MS = 12 * 3_600_000;   // 跟伺服器同一個數字（HUNGRY_HOURS）
const UNIT_H = 48;            // 跟 room-view 同一個數字：家具高度 1 在畫面上幾像素
const SEAT_TOP = 0.5;         // 座面大約在家具高度的一半
const HOP = 10, MUNCH = 3;    // 開心跳、低頭吃飯的上下幅度（像素）

/** 認人：有 id 的用 id（兒童版的娃娃，可能好幾個同一組衣服圖），沒有的用 name（小屋的阿童、阿宇）。 */
const personId = (who) => who.id ?? who.name;

export class Pets {
  constructor(specs, room) {
    this.room = room;
    this.images = {};
    this.dogs = Object.entries(specs).map(([id, spec], index) => {
      for (const [pose, src] of Object.entries(spec.images)) this.load(`${id}:${pose}`, src);
      return { id, spec, pos: { x: 1 + index * 2, y: 1 }, path: [], pose: "stand", flip: index === 1, timer: 2 + index * 3, bedId: null };
    });
  }

  load(key, src) {
    const img = new Image();
    img.onload = () => { this.images[key] = img; };
    img.onerror = () => { this.images[key] = null; };   // 圖還沒畫好就退回色塊
    img.src = src;
  }

  /** 阿宇回家：兩隻狗放下手邊的事衝到門口旁邊迎接。 */
  rush(target) {
    for (const dog of this.dogs) {
      this.rouse(dog);
      this.goTo(dog, target, true);
      this.bounce(dog, 2500);
    }
  }

  /** 阿童走進別間房：兩隻狗隔一兩秒才從門口跟進來，再跑到她旁邊。 */
  follow(entrance, atone) {
    this.ball = null;
    this.dogs.forEach((dog, index) => {
      Object.assign(dog, { pos: { ...entrance }, path: [], bedId: null, restBy: null, seat: null, climb: null, arrival: null, fetching: null, pose: "stand", timer: 99 });
      dog.hiddenUntil = performance.now() + 1200 + index * 900;
      dog.arriveBeside = atone;
    });
  }

  /** 丟球：球放在那格，指定的狗跑去撿、再叼回給離牠最近的人。 */
  fetch(id, cell, people) {
    const dog = this.dogs.find((d) => d.id === id);
    if (!dog) return;
    this.ball = { pos: { ...cell }, carriedBy: null };
    this.rouse(dog);
    dog.path = this.room.findPath(dog.pos, cell);
    dog.fetching = { people };
    dog.timer = 99;
  }

  /** 餵飯：房間裡有狗碗就跑去碗邊吃，沒有就在餵的人腳邊吃；零食一律跑到給的人旁邊。 */
  feed(id, food, feeder) {
    const dog = this.dogs.find((d) => d.id === id);
    if (!dog) return;
    const bowl = food === "meal" && this.bowl(dog);
    const target = bowl ? { x: bowl.x, y: bowl.y } : feeder?.pos;
    if (!target) { this.bounce(dog, 1500); return; }
    this.rouse(dog);
    this.goTo(dog, target, true);
    dog.arrival = food === "meal" ? "munch" : "hop";
    dog.timer = 99;
  }

  /** 狗專屬的互動（content/pets.json 的 touches）：roll 原地翻肚、cheer 開心跳、come 跑到那個人腳邊趴下。 */
  touch(id, play, person) {
    const dog = this.dogs.find((d) => d.id === id);
    if (!dog) return;
    if (play === "cheer") { this.cheer(id); return; }
    if (play === "roll") {
      Object.assign(dog, { path: [], pose: "lie", flip: !dog.flip, timer: 4 });
      this.bounce(dog, 1500, MUNCH);
      return;
    }
    if (play === "come" && person) {
      this.rouse(dog);
      dog.restBy = personId(person);
      this.goTo(dog, person.pos, true);
    }
  }

  /** 放下手邊的事站起來：離開狗窩、腳邊，在沙發上的先跳下來。 */
  rouse(dog) {
    if (dog.seat) this.hopDown(dog);
    Object.assign(dog, { bedId: null, restBy: null, climb: null, arrival: null, pose: "stand" });
  }

  /** 從沙發或床跳回旁邊的地板。 */
  hopDown(dog) {
    const around = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([dx, dy]) => ({ x: dog.pos.x + dx, y: dog.pos.y + dy })).find((cell) => this.isWalkable(cell));
    if (around) dog.pos = around;
    Object.assign(dog, { seat: null, pose: "stand" });
    this.bounce(dog, 600);
  }

  bounce(dog, ms, height = HOP) {
    dog.hopUntil = performance.now() + ms;
    dog.hopHeight = height;
  }

  /** 離這隻狗最近的狗碗；房間裡沒有就是 null。 */
  bowl(dog) {
    const bowls = this.room.home.placed.filter((piece) => this.room.catalog[piece.item]?.bowl);
    const distance = (piece) => Math.hypot(piece.x - dog.pos.x, piece.y - dog.pos.y);
    return bowls.sort((a, b) => distance(a) - distance(b))[0] ?? null;
  }

  isHungry(dog) {
    const lastMeal = this.fed?.[dog.id];
    return !!lastMeal && Date.now() - new Date(lastMeal).getTime() > HUNGRY_MS;
  }

  /** 狗可以偷跳上去的座位：沙發、床（不含浴缸；背對鏡頭的要有椅背前景層蓋住狗），而且那格沒人坐、沒別的狗。 */
  freeSeatCell(dog, people) {
    const taken = new Set([
      ...people.map((who) => `${Math.round(who.pos.x)},${Math.round(who.pos.y)}`),
      ...this.dogs.filter((other) => other !== dog && (other.seat || other.climb)).map((other) => { const cell = other.climb?.cell ?? other.pos; return `${cell.x},${cell.y}`; }),
    ]);
    const seats = this.room.home.placed.filter((piece) => { const spec = this.room.catalog[piece.item]; return spec?.dogNap && (!this.room.facesAway(piece) || this.room.hasFrontLayer(piece)); });
    const cells = seats.flatMap((piece) => this.room.cellsOf(piece).filter((key) => !taken.has(key)).map((key) => { const [x, y] = key.split(",").map(Number); return { id: piece.id, cell: { x, y } }; }));
    return cells.length ? cells[Math.floor(Math.random() * cells.length)] : null;
  }

  /** 每一格動畫呼叫一次：走路、發呆倒數、決定下一件事。 */
  step(dt, people) {
    this.trackSitting(people);
    for (const dog of this.dogs) {
      if (dog.hiddenUntil) {   // 還在門外：時間到就進門、跑去阿童旁邊
        if (performance.now() < dog.hiddenUntil) continue;
        dog.hiddenUntil = null;
        this.goTo(dog, dog.arriveBeside.pos, true);
        dog.hopUntil = performance.now() + 1200;
        continue;
      }
      if (dog.seat && this.seatTaken(dog, people)) { this.hopDown(dog); dog.timer = rand(REST_MIN, REST_MAX); }   // 有人要坐（或沙發被搬走）就跳下來
      const next = dog.path[0];
      if (next) {
        const dx = next.x - dog.pos.x, dy = next.y - dog.pos.y, distance = Math.hypot(dx, dy), stride = DOG_SPEED * dt;
        if (distance <= stride) { dog.pos = { ...next }; dog.path.shift(); }
        else dog.pos = { x: dog.pos.x + dx / distance * stride, y: dog.pos.y + dy / distance * stride };
        const screenDx = dx - dy;   // 畫面上的左右：x 往右後、y 往左後
        if (Math.abs(screenDx) > 0.01) dog.flip = screenDx > 0;
        if (!dog.path.length) {
          if (dog.fetching && this.ball && !this.ball.carriedBy) {   // 到球那格：叼起來，跑去最近的人旁邊
            this.ball.carriedBy = dog.id;
            const nearest = [...dog.fetching.people].sort((a, b) => Math.hypot(a.pos.x - dog.pos.x, a.pos.y - dog.pos.y) - Math.hypot(b.pos.x - dog.pos.x, b.pos.y - dog.pos.y))[0];
            if (nearest) { this.goTo(dog, nearest.pos, true); continue; }
          }
          if (dog.fetching) { dog.fetching = null; this.ball = null; this.bounce(dog, 1500); }   // 送到了
          if (dog.climb) this.climbUp(dog);
          if (dog.arrival) { this.bounce(dog, dog.arrival === "munch" ? 2500 : 1500, dog.arrival === "munch" ? MUNCH : HOP); dog.arrival = null; }
          const lie = dog.bedId || dog.restBy || dog.seat; dog.pose = lie ? "lie" : "stand"; dog.timer = lie ? rand(NAP_MIN, NAP_MAX) : rand(REST_MIN, REST_MAX);
        }
        continue;
      }
      dog.timer -= dt;
      if (dog.timer > 0) continue;
      this.decide(dog, people);
    }
  }

  /** 記每個人從什麼時候坐到現在；站起來就清掉。 */
  trackSitting(people) {
    this.sitSince ??= new Map();
    for (const who of people) {
      const sitting = who.anim === "sit" || who.anim === "lounge";
      if (sitting && !this.sitSince.has(personId(who))) this.sitSince.set(personId(who), performance.now());
      if (!sitting) this.sitSince.delete(personId(who));
    }
  }

  decide(dog, people) {
    const beds = this.room.home.placed.filter((piece) => this.room.catalog[piece.item]?.pet);
    const taken = new Set(this.dogs.filter((other) => other !== dog).map((other) => other.bedId));
    const freeBed = beds.find((bed) => !taken.has(bed.id));
    const leader = people.find((who) => who.lead) ?? people.find((who) => who.name === "atone");   // 狗跟著誰走：標了 lead 的人，沒標就是阿童
    this.rouse(dog);
    const bowl = this.bowl(dog);
    if (bowl && this.isHungry(dog) && Math.random() < BOWL_WAIT_CHANCE) { this.goTo(dog, { x: bowl.x, y: bowl.y }, true); return; }
    // 樂樂喜歡趴到坐最久的人腳邊
    const longest = [...(this.sitSince ?? new Map())].sort((a, b) => a[1] - b[1])[0];
    const sitter = longest && people.find((who) => personId(who) === longest[0]);
    if (dog.id === "yellow" && sitter && Math.random() < 0.6) { dog.restBy = personId(sitter); this.goTo(dog, sitter.pos, true); return; }
    if (freeBed && Math.random() < 0.5) { dog.bedId = freeBed.id; this.goTo(dog, { x: freeBed.x, y: freeBed.y }); return; }
    const seat = Math.random() < CLIMB_CHANCE && this.freeSeatCell(dog, people);
    if (seat) {
      dog.climb = seat;
      if (isNextTo(dog.pos, seat.cell)) { this.climbUp(dog); dog.pose = "lie"; dog.timer = rand(NAP_MIN, NAP_MAX); return; }
      this.goTo(dog, seat.cell, true);
      if (!dog.path.length) dog.climb = null;
      return;
    }
    if (leader?.path?.length && Math.random() < FOLLOW_CHANCE) { this.goTo(dog, leader.path.at(-1), true); return; }
    const spots = this.walkableCells();
    if (spots.length) this.goTo(dog, spots[Math.floor(Math.random() * spots.length)]);
    else dog.timer = rand(REST_MIN, REST_MAX);
  }

  /** 跳上沙發或床的那一格趴著。 */
  climbUp(dog) {
    Object.assign(dog, { pos: { ...dog.climb.cell }, seat: dog.climb.id, climb: null });
    this.bounce(dog, 400);
  }

  /** 狗趴的座位不能待了：有人坐到同一格，或那件家具不在這間房了。 */
  seatTaken(dog, people) {
    if (!this.seatPiece(dog)) return true;
    return people.some((who) => Math.round(who.pos.x) === dog.pos.x && Math.round(who.pos.y) === dog.pos.y);
  }

  seatPiece(dog) {
    return this.room.home.placed.find((piece) => piece.id === dog.seat) ?? null;
  }

  /** 走去某格；跟著人時停在旁邊一格。 */
  goTo(dog, target, beside = false) {
    let goal = target;
    if (beside) {
      const options = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy })).filter((cell) => this.isWalkable(cell));
      if (!options.length) { dog.timer = rand(REST_MIN, REST_MAX); return; }
      goal = options[Math.floor(Math.random() * options.length)];
    }
    dog.path = this.room.findPath(dog.pos, goal);
    if (!dog.path.length) { dog.pose = dog.bedId ? "lie" : "stand"; dog.timer = rand(REST_MIN, REST_MAX); }
  }

  walkableCells() {
    const { width, depth } = this.room.home;
    const cells = [];
    for (let x = 0; x < width; x++) for (let y = 0; y < depth; y++) if (this.isWalkable({ x, y })) cells.push({ x, y });
    return cells;
  }

  /** 狗能站的格子：空地或地毯上；家具（含沙發、床）不站。 */
  isWalkable(cell) {
    const home = this.room.home;
    if (cell.x < 0 || cell.y < 0 || cell.x >= home.width || cell.y >= home.depth) return false;
    const key = `${cell.x},${cell.y}`;
    return !home.placed.some((piece) => !this.room.catalog[piece.item]?.floor && this.room.cellsOf(piece).includes(key));
  }

  /** 交給房間畫：跟小人一樣依深度排序；球在地上或狗嘴裡。 */
  drawables() {
    const list = this.dogs.filter((dog) => !dog.hiddenUntil).map((dog) => {
      const seat = dog.seat && this.seatPiece(dog);   // 趴在沙發上：跟坐著的人一樣畫在那件家具前面
      if (seat) return { depth: this.room.depthOf(seat) + 0.5, box: this.room.boxOf(seat), draw: () => this.draw(dog) };
      return { depth: dog.pos.x + dog.pos.y + 2, box: { x0: dog.pos.x, x1: dog.pos.x + 1, y0: dog.pos.y, y1: dog.pos.y + 1 }, draw: () => this.draw(dog) };
    });
    if (this.ball) {
      const holder = this.ball.carriedBy && this.dogs.find((d) => d.id === this.ball.carriedBy);
      const pos = holder ? holder.pos : this.ball.pos;
      list.push({ depth: pos.x + pos.y + 2.1, draw: () => this.drawBall(pos, !!holder) });
    }
    return list;
  }

  drawBall(pos, carried) {
    const { ctx } = this.room;
    const [sx, sy] = this.room.toScreen(pos.x + 0.5, pos.y + 0.5);
    ctx.save();
    ctx.fillStyle = "#f2c94c"; ctx.strokeStyle = "#8a6a1a"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx + (carried ? 14 : 0), sy - (carried ? 22 : 5), 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /** 被摸了：原地開心跳幾下。 */
  cheer(id) {
    const dog = this.dogs.find((d) => d.id === id);
    if (dog) { this.bounce(dog, 1500); dog.pose = "stand"; }
  }

  draw(dog) {
    const { ctx } = this.room;
    const hop = dog.hopUntil && performance.now() < dog.hopUntil ? Math.abs(Math.sin(performance.now() / 120)) * (dog.hopHeight ?? HOP) : 0;
    const seat = dog.seat && this.seatPiece(dog);
    const lift = seat ? this.room.catalog[seat.item].height * UNIT_H * SEAT_TOP : 0;
    const [sx, sy0] = this.room.toScreen(dog.pos.x + 0.5, dog.pos.y + 0.5);
    const sy = sy0 - hop - lift;
    const image = this.images[`${dog.id}:${dog.pose}`];
    ctx.save();
    if (image) {
      const bounds = image.bounds ?? (image.bounds = opaqueBounds(image));
      const height = dog.pose === "lie" ? DOG_HEIGHT * 0.6 : DOG_HEIGHT;
      const scale = height / bounds.h, w = bounds.w * scale;
      if (dog.flip) { ctx.translate(sx * 2, 0); ctx.scale(-1, 1); }
      ctx.drawImage(image, bounds.x, bounds.y, bounds.w, bounds.h, sx - w / 2, sy + 4 - height, w, height);
    } else {
      ctx.fillStyle = dog.spec.color;
      ctx.beginPath(); ctx.ellipse(sx, sy - 10, 16, dog.pose === "lie" ? 8 : 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(sx - 12, sy - 18); ctx.lineTo(sx - 8, sy - 30); ctx.lineTo(sx - 3, sy - 20); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
}

function rand(min, max) { return min + Math.random() * (max - min); }

function isNextTo(a, b) { return Math.abs(Math.round(a.x) - b.x) + Math.abs(Math.round(a.y) - b.y) === 1; }

function opaqueBounds(img) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    if (data[(y * canvas.width + x) * 4 + 3] < 128) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return maxX < 0 ? { x: 0, y: 0, w: canvas.width, h: canvas.height } : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
