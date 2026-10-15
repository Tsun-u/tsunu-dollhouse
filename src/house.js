// 家：房間畫面裡的娃娃、家具、狗。畫面沿用小屋的 RoomView 與 Pets；娃娃的位置存在娃娃存檔，家具與房間交給遊戲存檔。
// 畫面跟著「目前選取的娃娃」在哪一間房；同一間房的娃娃都畫出來。

import { BODIES, CLOTHES_COLORS, headParts } from "../vendor/rules/looks.js";
import { cuddleSpot, openCells, pillowSpot, seatAt, tableFreshness } from "../vendor/rules/state.js";
import { createGestures } from "../vendor/web/gestures.js";
import { Pets } from "../vendor/web/pets.js";
import { RoomView } from "../vendor/web/room-view.js";
import { swatchRow } from "../vendor/web/swatches.js";
import { trimmedImage } from "./thumbs.js";

const $ = (id) => document.getElementById(id);
const WAVE_MS = 3200;
const button = (label, onclick, className = "item") => Object.assign(document.createElement("button"), { className, textContent: label, onclick });

/** 電視的頻道小卡：正在播的那台亮著（點了不用再轉一次），其他點了就轉過去。 */
function channelChips(tv, piece, onPick) {
  return tv.programs.map((program) => {
    const playing = piece.on && piece.program === program;
    return button(program, playing ? null : () => onPick(program), playing ? "item on" : "item");
  });
}

/** 沒有圖的家具：用代表色畫一塊。 */
function swatchBlock(color) {
  const block = Object.assign(document.createElement("span"), { className: "thumb surface" });
  block.style.background = color;
  return block;
}

export class House {
  /**
   * @param deps { game, content, skeletons, animations, samplePose, dressUp, dolls: () => dollsSave, updateDoll(id, changes), select(id), apply(action, doer) → 新寫的日誌或 null, icons: () => 圖示表 }
   */
  constructor(deps) {
    this.deps = deps;
    this.people = new Map();   // 娃娃 id → 畫面上的人物（位置、路徑、動畫）
    this.pendingItem = null;   // 倉庫裡選好、等著放進房間的家具
    this.selectedPiece = null;
    this.tappedCell = null;
    this.sleepingOn = null;    // 一起睡的那張床的 id；有人起來就結束
    this.dogOpen = null;
    this.paintingId = null;    // 打開布面色盤的那件家具
    this.tableOpen = null;     // 打開置物面板的那張桌子
    this.givingTo = null;      // 正在挑要遞什麼給她的那個娃娃
    const { content } = deps;
    this.room = new RoomView($("room"), content.furniture, {
      onCellTap: (cell) => this.tapCell(cell),
      onCharacterTap: (who) => deps.select(who.id),
      onPetTap: (dog) => { this.dogOpen = dog.id; this.renderDog(); },
      onDoorTap: (door) => this.goToRoom(door.to),
      onPieceTap: (piece, cell) => { this.tappedCell = cell; this.selectPiece(piece.id); },
      onPieceDrop: (piece, cell) => { if (cell.x !== piece.x || cell.y !== piece.y) deps.apply({ kind: "move", id: piece.id, x: cell.x, y: cell.y }); },
      bathFacesFront: () => false,   // 泡澡一律背影、一個人泡
    });
    this.room.pets = new Pets(content.pets, this.room);
    this.room.surfaces = content.surfaces;   // 地板、壁紙的花紋
    this.play = createGestures(this.room, content.pets);   // 把日誌那句演出來：刷牙洗手、狗跳、吃飯、撿球、翻書的泡泡
    $("flipBtn").onclick = () => this.selectedPiece && deps.apply({ kind: "flip", id: this.selectedPiece });
    $("storeBtn").onclick = () => { if (this.selectedPiece) { deps.apply({ kind: "store", id: this.selectedPiece }); this.selectPiece(null); } };
    $("dogClose").onclick = () => { this.dogOpen = null; this.renderDog(); };
    $("tableClose").onclick = () => { this.tableOpen = null; this.renderTable(); };
    $("noteForm").onsubmit = (e) => {
      e.preventDefault();
      const note = $("noteInput").value.trim();
      if (!note || !this.tableOpen) return;
      $("noteInput").value = "";
      this.act({ kind: "put_on_table", id: this.tableOpen, note });
    };
  }

  get selectedDoll() {
    const { dolls, selected } = this.deps.dolls();
    return dolls.find((doll) => doll.id === selected) ?? dolls[0] ?? null;
  }

  get roomId() { return this.selectedDoll?.spot.room ?? "bedroom"; }

  /** 娃娃對應的畫面人物：沿用同一個物件保留走到一半的位置；外型每次照存檔重新穿。 */
  personFor(doll) {
    const { skeletons, animations, samplePose, dressUp, content } = this.deps;
    let who = this.people.get(doll.id);
    if (!who) {
      who = { id: doll.id, animations, samplePose, anim: "idle", view: "front", flip: false, pos: null, room: null, path: [] };
      this.people.set(doll.id, who);
    }
    const body = BODIES[doll.body];
    who.name = body.sprites;   // 衣服專屬圖用哪一組（女生 atone、男生 tsunu）
    who.label = doll.name;     // 頭上泡泡寫誰說的
    who.asleep = !!doll.asleep;
    who.skeletons = { front: skeletons[body.views.front], front34: skeletons[body.views.front34], back34: skeletons[body.views.back34] };
    who.headParts = headParts(doll);
    who.skin = doll.skin;
    who.lead = doll.id === this.selectedDoll?.id;   // 狗跟著選取的娃娃走
    Object.assign(who, dressUp(who, doll.worn, content.clothes, doll.colors));
    return who;
  }

  render() {
    const { game } = this.deps;
    const roomId = game.state.rooms[this.roomId] ? this.roomId : "bedroom";
    const changedRoom = this.room.roomId !== roomId;
    this.room.setState(game.state, roomId);
    if (this.selectedPiece && !this.room.home.placed.some((p) => p.id === this.selectedPiece)) this.selectPiece(null);
    const { dolls } = this.deps.dolls();
    for (const id of this.people.keys()) if (!dolls.some((doll) => doll.id === id)) this.people.delete(id);
    const present = dolls.filter((doll) => doll.spot.room === roomId).map((doll) => {
      const who = this.personFor(doll);
      const target = doll.spot;
      if (!who.pos || who.room !== target.room) { who.pos = { x: target.x, y: target.y }; who.room = target.room; who.path = []; }
      else {
        const standing = who.path.length ? who.path.at(-1) : who.pos;
        if (standing.x !== target.x || standing.y !== target.y) who.path = this.room.findPath(who.pos, target);
      }
      return who;
    });
    if (changedRoom && this.selectedDoll) this.room.pets?.follow(this.selectedDoll.spot, this.personFor(this.selectedDoll));
    this.room.setCharacters(present);
    this.room.sleeping = !!this.sleepingOn;
    if (this.room.pets) this.room.pets.fed = game.state.fed ?? {};
    this.renderRoomTabs();
    this.renderInventory();
    this.renderPieceActions();
    this.renderDollActions();
    this.renderDog();
    this.renderTable();
    this.renderJournal();
  }

  /** 娃娃換位置：寫進娃娃存檔；走動就醒了，有人起來也不算一起睡了。 */
  moveDoll(id, spot) {
    this.sleepingOn = null;
    this.deps.updateDoll(id, { spot, asleep: false });
  }

  dollById(id) {
    return this.deps.dolls().dolls.find((doll) => doll.id === id) ?? null;
  }

  /** 娃娃（預設選取的那個）做一件要進規則的事：帶上她是誰、站在哪；成功就把日誌那句演出來。 */
  act(action, doll = this.selectedDoll) {
    if (!doll) return;
    const entry = this.deps.apply(action, { name: doll.name, spot: doll.spot });
    if (!entry) return;
    const watchers = [...this.people.values()].filter((who) => who.room === this.roomId);   // 小黑撿完球跑回他們身邊
    const target = entry.to && this.people.get(this.deps.dolls().dolls.find((other) => other.name === entry.to)?.id);   // 被丟枕頭的娃娃
    this.play(this.personFor(doll), entry.text, { spot: doll.spot, watchers, target });
  }

  /** 家具（洗手台、爐台）旁邊、這個娃娃站得進去又沒有別人的格子裡離 from 最近的那格；from 已經緊鄰就是 from；沒有就 null。 */
  besideFree(piece, from, dollId) {
    const cells = this.room.cellsOf(piece).map((key) => key.split(",").map(Number)).map(([x, y]) => ({ x, y }));
    const touching = (cell) => cells.some((c) => Math.abs(c.x - cell.x) + Math.abs(c.y - cell.y) === 1);
    if (from.room === this.roomId && touching(from)) return from;
    return cells.flatMap(({ x, y }) => [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }])
      .filter((cell) => touching(cell) && this.standable(cell, dollId))
      .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0] ?? null;
  }

  /** 先走到家具旁邊的空位再做（洗手台、爐台）；旁邊站不下就原地做，讓規則說要站到哪。 */
  atPiece(piece, action, doll = this.selectedDoll) {
    if (!doll) return;
    const spot = this.besideFree(piece, doll.spot, doll.id);
    if (spot && (spot.x !== doll.spot.x || spot.y !== doll.spot.y || doll.spot.room !== this.roomId)) this.moveDoll(doll.id, { room: this.roomId, x: spot.x, y: spot.y });
    this.act(action, this.dollById(doll.id));
  }

  /** 這件家具上離點的地方最近、這個娃娃坐得下的位置（床照枕頭那一排）；坐不下就 null。 */
  seatFor(piece, doll) {
    const from = this.tappedCell ?? piece;
    const cells = this.room.cellsOf(piece).map((key) => key.split(",").map(Number)).map(([x, y]) => ({ x, y }))
      .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y));
    return cells.map((cell) => this.standingSpot(cell, doll.id)).find((cell) => this.standable(cell, doll.id)) ?? null;
  }

  /** 能不能站：房間裡的空格或座位，而且沒有別的娃娃站在那裡；浴缸一次只泡一個人。 */
  standable(cell, exceptId) {
    const home = this.room.home;
    const catalog = this.deps.content.furniture;
    const seat = seatAt(home, cell, catalog);
    const free = openCells(home, catalog).some((c) => c.x === cell.x && c.y === cell.y) || !!seat;
    const others = this.deps.dolls().dolls.filter((doll) => doll.id !== exceptId && doll.spot.room === this.roomId);
    const taken = others.some((doll) => doll.spot.x === cell.x && doll.spot.y === cell.y);
    const oneAtATime = catalog[seat?.item]?.seatPose === "bathe" || !!catalog[seat?.item]?.toilet;   // 浴缸、馬桶一次一個人
    const inUse = oneAtATime && others.some((doll) => seatAt(home, doll.spot, catalog)?.id === seat.id);
    return free && !taken && !inUse;
  }

  /** 在泡澡或淋浴（沒穿衣服）。 */
  washing(doll) {
    const catalog = this.deps.content.furniture;
    return ["bathe", "shower"].includes(catalog[seatAt(this.room.home, doll.spot, catalog)?.item]?.seatPose);
  }

  /** 點到某格要站的位置：床上照小屋的規則坐到枕頭那一排，跟別人並排。 */
  standingSpot(cell, dollId) {
    const catalog = this.deps.content.furniture;
    const seat = seatAt(this.room.home, cell, catalog);
    if (!seat || catalog[seat.item]?.seatPose !== "lounge") return cell;
    const other = this.deps.dolls().dolls.find((doll) => doll.id !== dollId && doll.spot.room === this.roomId && seatAt(this.room.home, doll.spot, catalog)?.id === seat.id);
    return pillowSpot(seat, cell, other?.spot ?? null, catalog);
  }

  /** 某間房裡離這格最近、站得了又沒人的格子（新娃娃出生用）。 */
  freeSpotNear(spot) {
    const home = this.deps.game.state.rooms[spot.room];
    const taken = new Set(this.deps.dolls().dolls.filter((doll) => doll.spot.room === spot.room).map((doll) => `${doll.spot.x},${doll.spot.y}`));
    const free = openCells(home, this.deps.content.furniture).filter((cell) => !taken.has(`${cell.x},${cell.y}`));
    free.sort((a, b) => Math.hypot(a.x - spot.x, a.y - spot.y) - Math.hypot(b.x - spot.x, b.y - spot.y));
    return free[0] ? { room: spot.room, ...free[0] } : spot;
  }

  tapCell(cell) {
    const { apply } = this.deps;
    if (this.pendingItem) {
      apply({ kind: "place", item: this.pendingItem, x: cell.x, y: cell.y, room: this.roomId });
      this.pendingItem = null;
      this.renderInventory();
      return;
    }
    this.selectPiece(null);
    this.walkTo(cell);
  }

  walkTo(cell) {
    const doll = this.selectedDoll;
    if (!doll) return;
    const spot = this.standingSpot(cell, doll.id);
    if (this.standable(spot, doll.id)) this.moveDoll(doll.id, { room: this.roomId, x: spot.x, y: spot.y });
  }

  /** 走到別間房：站到那間房通回這裡的門口。 */
  goToRoom(roomId) {
    const doll = this.selectedDoll;
    const target = this.deps.game.state.rooms[roomId];
    if (!doll || !target || roomId === doll.spot.room) return;
    const door = target.doors.find((d) => d.to === doll.spot.room) ?? target.doors[0];
    const entrance = !door ? { x: 1, y: 1 } : door.wall === "back" ? { x: door.at, y: 0 } : { x: 0, y: door.at };
    this.moveDoll(doll.id, { room: roomId, ...entrance });
  }

  renderRoomTabs() {
    const rooms = Object.entries(this.deps.game.state.rooms);
    $("roomTabs").hidden = rooms.length < 2;
    $("roomTabs").replaceChildren(...rooms.map(([id, spec]) => {
      const chip = button(spec.name, () => this.goToRoom(id));
      chip.classList.toggle("on", id === this.roomId);
      return chip;
    }));
  }

  renderInventory() {
    const catalog = this.deps.content.furniture;
    $("inventory").replaceChildren(...Object.entries(this.deps.game.state.inventory).map(([item, count]) => {
      const spec = catalog[item];
      const card = document.createElement("button");
      card.className = "card" + (this.pendingItem === item ? " on" : "");
      card.setAttribute("aria-label", spec.label);
      card.append(
        spec.image ? Object.assign(document.createElement("img"), { src: trimmedImage(spec.image, () => this.renderInventory()), className: "thumb", alt: "", draggable: false }) : swatchBlock(spec.color),
        Object.assign(document.createElement("span"), { className: "card-label", textContent: spec.label }),
        Object.assign(document.createElement("span"), { className: "count-badge", textContent: `×${count}` }),
      );
      card.onclick = () => { this.pendingItem = this.pendingItem === item ? null : item; this.selectPiece(null); this.renderInventory(); };
      return card;
    }));
    $("inventory").previousElementSibling.hidden = $("inventory").hidden = !$("inventory").children.length;   // 倉庫空了就整段收起來
  }

  selectPiece(id) {
    this.selectedPiece = id;
    $("flipBtn").disabled = $("storeBtn").disabled = !id;
    this.room.setSelected(id);
    this.renderPieceActions();
  }

  /** 家具點起來之後能做的事：坐下、躺下睡覺、開燈、翻書、澆水、餵狗；轉向與收回倉庫一直在旁邊。 */
  renderPieceActions() {
    const piece = this.selectedPiece && this.room.home?.placed.find((p) => p.id === this.selectedPiece);
    const spec = piece && this.deps.content.furniture[piece.item];
    const actions = [];
    const doll = this.selectedDoll;
    const catalog = this.deps.content.furniture;
    const onThis = doll && seatAt(this.room.home, doll.spot, catalog)?.id === piece?.id;
    if (spec?.seat && doll) {
      const seat = this.seatFor(piece, doll);
      if (seat && !onThis) actions.push(button(`${doll.name}${spec.toilet ? "上廁所" : "坐下"}`, () => this.moveDoll(doll.id, { room: this.roomId, x: seat.x, y: seat.y }), ""));
    }
    if (spec?.seatPose === "lounge" && doll) {   // 床：一個人躺下睡覺，睡著了就是起床
      if (onThis && doll.asleep) actions.push(button(`${doll.name}起床`, () => this.deps.updateDoll(doll.id, { asleep: false }), ""));
      else {
        const seat = onThis ? doll.spot : this.seatFor(piece, doll);
        if (seat) actions.push(button(`${doll.name}躺下睡覺`, () => this.deps.updateDoll(doll.id, { spot: { room: this.roomId, x: seat.x, y: seat.y }, asleep: true }), ""));
      }
    }
    if (spec?.switch) actions.push(button(piece.on ? "關燈" : "開燈", () => this.act({ kind: "toggle", id: piece.id }), ""));
    if (spec?.tv) actions.push(button(piece.on ? "關電視" : "開電視", () => this.act({ kind: "toggle", id: piece.id }), ""), button("下一台", () => this.act({ kind: "tv_channel", id: piece.id }), ""));
    if (spec?.readable && this.deps.content.fortunes.length) actions.push(button("翻書", () => this.act({ kind: "read", id: piece.id }), ""));
    if (spec?.plant) actions.push(button("澆水", () => this.act({ kind: "water", id: piece.id }), ""));
    if (spec?.washbasin && doll) {   // 洗手台：洗手、刷牙；同一間房的娃娃可以一起刷牙（兩人各自走到旁邊、各自刷）
      const teeth = { kind: "wash", what: "teeth" };
      actions.push(button("洗手", () => this.atPiece(piece, { kind: "wash", what: "hands" }), ""), button("刷牙", () => this.atPiece(piece, teeth), ""));
      for (const other of this.deps.dolls().dolls.filter((d) => d.id !== doll.id && d.spot.room === this.roomId)) {
        actions.push(button(`跟${other.name}一起刷牙`, () => { this.atPiece(piece, teeth, doll); this.atPiece(piece, teeth, this.dollById(other.id)); }, ""));
      }
    }
    if (spec?.stove && doll) {   // 爐台：用三消材料煮家常菜，材料不夠的反灰、寫上缺什麼；家裡有煮好的就能吃
      const { dishes, recipes } = this.deps.content;
      const { materials } = this.deps.game.state;
      for (const [id, dish] of Object.entries(dishes)) {
        const missing = Object.entries(dish.ingredients).filter(([chain, need]) => (materials[chain] ?? 0) < need)
          .map(([chain, need]) => `${recipes[chain]?.label ?? chain} ${need - (materials[chain] ?? 0)}`);
        const cook = button(missing.length ? `煮${dish.label}（缺${missing.join("、")}）` : `煮${dish.label}`, () => this.atPiece(piece, { kind: "cook", dish: id }), "");
        cook.disabled = missing.length > 0;
        actions.push(cook);
      }
      for (const [id, count] of Object.entries(this.deps.game.state.dishes ?? {})) if (count > 0) actions.push(button(`吃${dishes[id]?.label ?? id}（${count}）`, () => this.act({ kind: "eat", dish: id }), ""));
    }
    for (const [dog, pet] of Object.entries(this.deps.content.pets)) {
      if (spec?.bowl) actions.push(button(`倒飼料給${pet.label}`, () => this.act({ kind: "feed", dog, food: "meal" }), ""));
      if (spec?.snacks) actions.push(button(`拿零食給${pet.label}`, () => this.act({ kind: "feed", dog, food: "snack" }), ""));
    }
    if (spec?.table) actions.push(button("打開桌面", () => { this.tableOpen = piece.id; this.renderTable(); }, ""));
    if (spec?.dye) actions.push(button(this.paintingId === piece.id ? "收起顏色" : "換顏色", () => { this.paintingId = this.paintingId === piece.id ? null : piece.id; this.renderPieceActions(); }, ""));
    $("pieceActions").replaceChildren(...actions);
    const painting = spec?.dye && this.paintingId === piece.id;   // 布面色盤：原色＋衣服的色票＋自訂顏色
    $("piecePalette").hidden = !painting;
    if (painting) {
      const paint = (color) => this.act({ kind: "paint_furniture", id: piece.id, color });
      $("piecePalette").replaceChildren(Object.assign(document.createElement("span"), { textContent: `${spec.label}的布面` }),
        button("原色", () => paint(null), "reset"), swatchRow(CLOTHES_COLORS, piece.tint ?? null, paint));
    }
    $("tvChannels").hidden = !spec?.tv;
    if (spec?.tv) $("tvChannels").replaceChildren(...channelChips(spec.tv, piece, (program) => this.act({ kind: "tv_channel", id: piece.id, program })));
  }

  /** 選取的娃娃跟同一間房的其他娃娃能做的事。 */
  renderDollActions() {
    const doll = this.selectedDoll;
    const others = this.deps.dolls().dolls.filter((other) => doll && other.id !== doll.id && other.spot.room === doll.spot.room);
    $("dollPanel").hidden = !others.length;
    if (!others.some((other) => other.id === this.givingTo)) this.givingTo = null;
    this.renderGiveChoices(doll, others.find((other) => other.id === this.givingTo));
    if (!others.length) return;
    $("dollPanelTitle").textContent = `${doll.name}可以……`;
    const catalog = this.deps.content.furniture;
    const seatOf = (d) => seatAt(this.room.home, d.spot, catalog);
    const asleep = (d) => d.asleep || (!!this.sleepingOn && seatOf(d)?.id === this.sleepingOn);
    const actions = [button("揮手", () => this.wave(doll.id))];
    for (const other of others) {
      const washing = this.washing(doll) || this.washing(other);
      if (!washing) actions.push(button(`抱抱${other.name}`, () => this.hug(doll, other)));
      if (!asleep(doll) && !asleep(other)) actions.push(button(`用枕頭丟${other.name}`, () => this.act({ kind: "throw_pillow", target: other.name })));
      const seat = seatOf(other);
      const together = seat && seatOf(doll)?.id === seat.id;
      if (seat && !together && !washing && !catalog[seat.item]?.toilet) actions.push(button(`坐到${other.name}旁邊`, () => this.sitBeside(doll, other, seat)));
      if (together && catalog[seat.item]?.seatPose === "lounge" && this.sleepingOn !== seat.id) actions.push(button(`跟${other.name}一起睡`, () => { this.sleepingOn = seat.id; this.render(); }));
      actions.push(button(`叫${other.name}過來`, () => this.callOver(doll, other)));
      actions.push(button(this.givingTo === other.id ? "收起" : `遞東西給${other.name}`, () => { this.givingTo = this.givingTo === other.id ? null : other.id; this.renderDollActions(); }));
    }
    $("dollActions").replaceChildren(...actions);
  }

  /** 遞東西給 target：列出家裡的商品與家常菜，點了就遞過去（她當場吃掉）。 */
  renderGiveChoices(doll, target) {
    $("giveChoices").hidden = !target;
    if (!target) return;
    const { content, game } = this.deps;
    const give = (label, count, action) => {
      const chip = button(label, () => this.act(action, doll));
      chip.append(Object.assign(document.createElement("span"), { className: "count", textContent: `×${count}` }));
      return chip;
    };
    $("giveChoices").replaceChildren(
      ...Object.entries(game.state.products).filter(([chain]) => !content.recipes[chain]?.clothes).map(([chain, n]) => give(`遞一份${content.recipes[chain]?.tiers.at(-1) ?? chain}`, n, { kind: "give", product: chain, to: target.name })),   // 衣服不能吃，收進衣櫃另外處理
      ...Object.entries(game.state.dishes ?? {}).filter(([, n]) => n > 0).map(([dish, n]) => give(`遞一份${content.dishes[dish]?.label ?? dish}`, n, { kind: "give", dish, to: target.name })),
    );
    if (!$("giveChoices").children.length) $("giveChoices").textContent = "家裡沒有可以遞的東西，去工坊做或爐台煮。";
  }

  wave(id) {
    const who = this.people.get(id);
    if (!who || who.anim !== "idle") return;
    who.anim = "wave";
    clearTimeout(who.waveTimer);
    who.waveTimer = setTimeout(() => { if (who.anim === "wave") who.anim = "idle"; }, WAVE_MS);
  }

  /** 抱抱（面對面）：兩個人坐在同一件家具上就原地抱，不然走到對方前面一格再抱。 */
  hug(doll, other) {
    const catalog = this.deps.content.furniture;
    const seat = seatAt(this.room.home, other.spot, catalog);
    const sameSeat = seat && seatAt(this.room.home, doll.spot, catalog)?.id === seat.id;
    if (!sameSeat) {
      const cell = cuddleSpot(this.room.home, other.spot, false, catalog);
      if (!cell || !this.standable(cell, doll.id)) return;
      this.moveDoll(doll.id, { room: this.roomId, x: cell.x, y: cell.y });
    }
    this.room.cuddle(this.people.get(doll.id), this.people.get(other.id), { behind: false, kiss: false });
  }

  /** 坐到對方旁邊：同一件家具上離對方最近的空位（床照枕頭那一排）。 */
  sitBeside(doll, other, seat) {
    const cells = this.room.cellsOf(seat).map((key) => key.split(",").map(Number)).map(([x, y]) => ({ x, y }))
      .sort((a, b) => Math.hypot(a.x - other.spot.x, a.y - other.spot.y) - Math.hypot(b.x - other.spot.x, b.y - other.spot.y));
    const spot = cells.map((cell) => this.standingSpot(cell, doll.id)).find((cell) => this.standable(cell, doll.id));
    if (spot) this.moveDoll(doll.id, { room: this.roomId, x: spot.x, y: spot.y });
  }

  /** 跟狗能做的事（跟小屋一樣）：摸摸、餵飯、給零食（家裡有零食櫃）、這隻狗專屬的互動；小黑會撿球。 */
  renderDog() {
    $("dogPanel").hidden = !this.dogOpen;
    if (!this.dogOpen) return;
    const { pets, furniture } = this.deps.content;
    const dog = this.dogOpen;
    const hungry = this.room.pets?.isHungry({ id: dog });
    $("dogTitle").textContent = `跟${pets[dog]?.label ?? dog}${hungry ? "（肚子餓了）" : ""}`;
    const hasSnacks = Object.values(this.deps.game.state.rooms).some((home) => home.placed.some((piece) => furniture[piece.item]?.snacks));
    $("dogActions").replaceChildren(
      button("摸摸", () => this.act({ kind: "pet", dog })),
      button("餵飯", () => this.act({ kind: "feed", dog, food: "meal" })),
      ...(hasSnacks ? [button("給零食", () => this.act({ kind: "feed", dog, food: "snack" }))] : []),
      ...Object.entries(pets[dog]?.touches ?? {}).map(([touch, spec]) => button(spec.label, () => this.act({ kind: "pet", dog, touch }))),
      ...(dog === "black" ? [button("丟球", () => this.act({ kind: "throw_ball" }))] : []),
    );
  }

  /** 桌上的東西（點了拿走，家常菜是吃掉；寫是哪個娃娃放的）與可以放上去的商品、家常菜；一張桌子最多 3 樣。 */
  renderTable() {
    const piece = this.tableOpen && this.room.home?.placed.find((p) => p.id === this.tableOpen);
    $("tablePanel").hidden = !piece;
    if (!piece) return;
    const { content, game } = this.deps;
    const icons = this.deps.icons();
    const items = piece.items ?? [];
    $("tableTitle").textContent = `${content.furniture[piece.item].label}上（${items.length}/3）`;
    const productIcon = (chain) => { const icon = Object.assign(document.createElement("span"), { className: "icon" }); icons.apply(icon, chain, (content.recipes[chain]?.tiers.length ?? 1) - 1); return icon; };
    const dishIcon = (dish) => Object.assign(document.createElement("img"), { className: "icon", src: content.dishes[dish]?.image ?? "", alt: "" });
    $("tableItems").replaceChildren(...items.map((item, index) => {
      const chip = button("", () => this.act({ kind: "take_from_table", id: piece.id, index }));
      const who = item.name ?? "有人";
      if (item.kind === "note") chip.textContent = `${who}的紙條：${item.text}`;
      else if (item.kind === "dish") chip.append(dishIcon(item.dish), `${who}煮的${item.text}（點一下吃掉）`);
      else chip.append(productIcon(item.chain), `${who}放的${content.recipes[item.chain]?.tiers.at(-1) ?? item.chain}（${tableFreshness(content.recipes[item.chain], item.at, new Date()).label}）`);
      chip.title = "點一下拿走";
      return chip;
    }));
    if (!items.length) $("tableItems").textContent = "桌上空空的。";
    const count = (n) => Object.assign(document.createElement("span"), { className: "count", textContent: `×${n}` });
    const put = (children, action) => {
      const chip = button("", () => this.act(action));
      chip.append(...children);
      chip.disabled = items.length >= 3;
      return chip;
    };
    $("tablePut").replaceChildren(
      ...Object.entries(game.state.products).map(([chain, n]) => put([productIcon(chain), `放一份${content.recipes[chain]?.tiers.at(-1) ?? chain}`, count(n)], { kind: "put_on_table", id: piece.id, product: chain })),
      ...Object.entries(game.state.dishes ?? {}).filter(([, n]) => n > 0).map(([dish, n]) => put([dishIcon(dish), `端一份${content.dishes[dish]?.label ?? dish}上桌`, count(n)], { kind: "put_on_table", id: piece.id, dish })),
    );
  }

  /** 最近發生的事：娃娃做的寫她的名字，店裡自己發生的寫「店裡」，其他（買東西、佈置）不寫主詞。 */
  renderJournal() {
    const time = (at) => new Date(at).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
    $("journal").replaceChildren(...this.deps.game.state.journal.slice(-30).reverse().map((entry) => {
      const who = entry.who ?? (entry.actor === "game" ? "店裡" : "");
      return Object.assign(document.createElement("p"), { textContent: `${time(entry.at)} ${who ? `${who}：` : ""}${entry.text}` });
    }));
    if (!$("journal").children.length) $("journal").textContent = "還沒有發生什麼事。";
  }

  /** 叫同一間房的娃娃過來：她走到選取的娃娃面前（跟抱抱同一個站位），站不下就到附近最近的空格。 */
  callOver(doll, other) {
    const front = cuddleSpot(this.room.home, doll.spot, false, this.deps.content.furniture);
    const spot = front && this.standable(front, other.id) ? { room: this.roomId, ...front } : this.freeSpotNear(doll.spot);
    this.moveDoll(other.id, { room: this.roomId, x: spot.x, y: spot.y });
  }
}
