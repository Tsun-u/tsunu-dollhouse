// 把一件動作演在畫面上：刷牙洗手、揮手、摸狗餵狗、狗的互動、丟球、翻書的泡泡、丟枕頭。
// 動作是日誌裡那句「做了什麼」（不含主詞）。主畫面重播日誌、訪客頁播自己剛做的動作，都用這一份。

const WALK_CELLS_PER_S = 2.2;   // 跟 room-view 的走路速度一樣：估走到定位要多久
export const WAVE_MS = 3200, BRUSH_MS = 8000, WASH_MS = 4000, BUBBLE_MS = 8000;
const WAVE_ARM_UP = [0.4, 1.2];   // 揮手動畫（animations.json 的 wave）裡手舉在最高的那段（秒）：沒有丟東西的動作，丟枕頭借它舉手
const PILLOW_FLIGHT_MS = 600;
const PILLOW_W = 36;              // 飛在空中的枕頭多寬（畫面像素）
const PILLOW_ARC = 0.25, PILLOW_ARC_MIN = 30;   // 拋物線最高點比直線高多少：兩人距離的幾成，至少幾像素
const HAND_DROP = 36;             // room.headTop 往下這麼多是臉的高度：枕頭從這裡丟出去、打在對方臉上，羽毛也從這裡散開
const WOBBLE_MS = 500, WOBBLE_LEAN = 9, WOBBLE_TILT = 12;   // 被打中：身體往後仰、頭一偏的最大角度，晃一下半就停
const FEATHERS = 6, FEATHER_MS = 1200;
const PILLOW_IMAGE = "assets/items/pillow.png";   // 相對網址：小屋、訪客頁、放在子路徑底下的兒童版都找得到

export function createGestures(room, pets) {
  const timers = new WeakMap();   // 人物 → 計時；用人物本身當鍵（兒童版同一個素體的娃娃名字一樣）
  const pillow = Object.assign(new Image(), { src: PILLOW_IMAGE });

  /** 播一段動作，時間到回 idle；同一個人的新動作蓋掉舊的計時。 */
  function animate(who, anim, ms) {
    who.anim = anim;
    clearTimeout(timers.get(who));
    timers.set(who, setTimeout(() => { if (who.anim === anim) who.anim = "idle"; }, ms));
  }

  /** 走到定位、站定之後面向 toward（兩人一起刷牙時並肩面向同一面鏡子），播刷牙或洗手。 */
  function atBasin(who, anim, ms, toward) {
    const start = () => {
      if (who.path.length) { setTimeout(start, 200); return; }   // 還在走：站定再開始
      room.face(who, toward.dx, toward.dy);
      animate(who, anim, ms);
    };
    setTimeout(start, (who.path?.length ?? 0) / WALK_CELLS_PER_S * 1000 + 150);
  }

  /** 用枕頭丟人：丟的人舉手、枕頭沿拋物線飛到對方身上，對方晃一下、頭上飄羽毛。兩個人都要在畫面這間房。 */
  function throwPillow(thrower, target) {
    if (!thrower.pos || !target.pos) return;
    setTimeout(() => {
      const start = performance.now();
      room.effects.push({ until: start + PILLOW_FLIGHT_MS, draw: (ctx, now) => drawFlight(ctx, thrower, target, (now - start) / PILLOW_FLIGHT_MS) });
      setTimeout(() => hit(target), PILLOW_FLIGHT_MS);
    }, raiseArm(thrower, target));
  }

  /** 站著的人轉向對方、借揮手動畫舉手，播到那一輪手放下來；回傳等多久手才舉到最高（毫秒），那時丟出去。
   *  動畫照全域時間播，從現在播到的地方算。坐著、躺著的不舉手，馬上丟。 */
  function raiseArm(who, target) {
    const cycle = who.animations?.wave?.duration;
    if (who.anim !== "idle" || !cycle) return 0;
    const at = (performance.now() / 1000) % cycle;
    const [up, down] = WAVE_ARM_UP;
    const wait = at < up ? up - at : at < down ? 0 : cycle - at + up;
    const released = (at + wait) % cycle;
    room.face(who, target.pos.x - who.pos.x, target.pos.y - who.pos.y);
    animate(who, "wave", (wait + cycle - released) * 1000);
    return wait * 1000;
  }

  function drawFlight(ctx, from, to, t) {
    if (!from.pos || !to.pos) return;
    const [x0, y0] = room.headTop(from), [x1, y1] = room.headTop(to);
    const arc = Math.max(PILLOW_ARC_MIN, Math.hypot(x1 - x0, y1 - y0) * PILLOW_ARC);
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + HAND_DROP - arc * 4 * t * (1 - t);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * Math.PI * 1.5 * (x1 >= x0 ? 1 : -1));   // 往哪邊飛就往哪邊翻
    if (pillow.naturalWidth) {
      const h = PILLOW_W * pillow.naturalHeight / pillow.naturalWidth;
      ctx.drawImage(pillow, -PILLOW_W / 2, -h / 2, PILLOW_W, h);
    } else {   // 圖還沒載好：畫一個白色圓角小枕頭
      ctx.fillStyle = "#fbf8f2"; ctx.strokeStyle = "#5a4636"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(-PILLOW_W / 2, -PILLOW_W / 3, PILLOW_W, PILLOW_W * 2 / 3, 8); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  /** 被打中：身體晃一下（抱在一起的不晃，姿勢歸抱抱管），頭上飄出幾片羽毛。 */
  function hit(target) {
    if (!target.pos) return;
    if (!target.cuddleWith && !target.behind) wobble(target);
    const [x, top] = room.headTop(target);
    const y = top + HAND_DROP;
    const feathers = Array.from({ length: FEATHERS }, (_, i) => ({
      dx: (i - (FEATHERS - 1) / 2) * 9 + (Math.random() - 0.5) * 6,
      burst: 34 + Math.random() * 20,
      phase: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 3,
    }));
    const start = performance.now();
    room.effects.push({ until: start + FEATHER_MS, draw: (ctx, now) => drawFeathers(ctx, x, y, feathers, (now - start) / FEATHER_MS) });
  }

  /** 身體往後仰、頭一偏，越晃越小，停在原本的姿勢。 */
  function wobble(who) {
    const start = performance.now();
    const step = (now) => {
      const t = (now - start) / WOBBLE_MS;
      if (t >= 1) { who.lean = who.headTilt = null; return; }
      const swing = Math.sin(t * Math.PI * 3) * (1 - t);
      who.lean = -WOBBLE_LEAN * swing;
      who.headTilt = WOBBLE_TILT * swing;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** 羽毛：從被打中的地方往上散到頭上，再左右飄著慢慢落下、淡出。 */
  function drawFeathers(ctx, x, y, feathers, t) {
    const spread = 1 - (1 - t) ** 2;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (1 - t) * 1.6);
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "rgba(110, 90, 80, 0.45)"; ctx.lineWidth = 1;
    for (const feather of feathers) {
      const fx = x + feather.dx * spread + Math.sin(t * Math.PI * 3 + feather.phase) * 5;
      const fy = y - feather.burst * spread + t * t * 30;
      ctx.beginPath();
      ctx.ellipse(fx, fy, 5.5, 2.2, feather.spin + Math.sin(t * Math.PI * 3 + feather.phase) * 0.6, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  /** who 做了 text 這件事。spot：who 站定後的位置（人可能還在走過去的路上）；partner：一起刷牙的另一個人；watchers：小黑撿球時跟著的人；target：被丟枕頭的人。 */
  return function play(who, text, { spot, partner = null, watchers = [who], target = null } = {}) {
    const washing = text.match(/^(?:跟(?:阿宇|阿童)一起)?(刷牙|洗手)$/);
    if (washing) {
      const [anim, ms] = washing[1] === "刷牙" ? ["brush", BRUSH_MS] : ["wash", WASH_MS];
      const toward = spot && room.basinDirection(spot);
      if (toward) for (const person of [who, partner].filter(Boolean)) atBasin(person, anim, ms, toward);
    }
    if (text === "揮了揮手" && who.anim === "idle") animate(who, "wave", WAVE_MS);
    for (const [id, spec] of Object.entries(pets)) {
      if (text.startsWith(`摸摸${spec.label}`)) room.pets?.cheer(id);
      if (text.startsWith(`餵${spec.label}吃飯`)) room.pets?.feed(id, "meal", who);
      if (text.startsWith(`給${spec.label}一塊零食`)) room.pets?.feed(id, "snack", who);
      for (const touch of Object.values(spec.touches ?? {})) if (text === touch.note) room.pets?.touch(id, touch.play, who);
    }
    if (text.startsWith("翻到一句：")) who.bubble = { text: text.slice(5), until: performance.now() + BUBBLE_MS * 1.5 };
    const thrown = text.match(/^丟球給小黑，球滾到 \((\d+), (\d+)\)$/);
    if (thrown && who.pos) room.pets?.fetch("black", { x: Number(thrown[1]), y: Number(thrown[2]) }, watchers.filter((person) => person.pos));   // 在別間房丟的球狗撿不到
    if (text.startsWith("用枕頭丟中") && target) throwPillow(who, target);
  };
}
