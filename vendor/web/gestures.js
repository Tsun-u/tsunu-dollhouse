// 把一件動作演在畫面上：刷牙洗手、揮手、摸狗餵狗、狗的互動、丟球、翻書的泡泡。
// 動作是日誌裡那句「做了什麼」（不含主詞）。主畫面重播日誌、訪客頁播自己剛做的動作，都用這一份。

const WALK_CELLS_PER_S = 2.2;   // 跟 room-view 的走路速度一樣：估走到定位要多久
export const WAVE_MS = 3200, BRUSH_MS = 8000, WASH_MS = 4000, BUBBLE_MS = 8000;

export function createGestures(room, pets) {
  const timers = new WeakMap();   // 人物 → 計時；用人物本身當鍵（兒童版同一個素體的娃娃名字一樣）

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

  /** who 做了 text 這件事。spot：who 站定後的位置（人可能還在走過去的路上）；partner：一起刷牙的另一個人；watchers：小黑撿球時跟著的人。 */
  return function play(who, text, { spot, partner = null, watchers = [who] } = {}) {
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
  };
}
