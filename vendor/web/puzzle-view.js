// 三消畫面：7×7 格，點兩個相鄰格交換。盤面與結果都由伺服器決定，這裡照 lastMove 的步驟演動畫：
// 交換 → 每一波「消掉的磚縮小消失 → 上面的磚掉下來、新磚從上方補進來」→ 最後盤面。

const ROWS = 7, COLS = 7;
const SWAP_MS = 160, POP_MS = 220, FALL_MS = 260, SPECIAL_MS = 120;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class PuzzleView {
  /** shopChoice：開盤時幫哪家店備料（回傳 undefined＝咖啡廳）。 */
  constructor(root, info, startBtn, icons, act, stamina, shopChoice = () => undefined) {
    this.root = root;
    this.info = info;
    this.startBtn = startBtn;
    this.icons = icons;
    this.act = act;
    this.stamina = stamina;   // 設定：enabled／max／regenMinutes
    this.state = null;
    setInterval(() => { if (this.state && !this.busy) this.updateInfo(this.state); }, 30_000);   // 倒數每半分鐘更新
    this.picked = null;
    this.board = null;      // 目前畫面上的盤面
    this.busy = false;      // 動畫進行中，暫不接受點擊與新盤面
    this.pending = null;    // 動畫中收到的最新狀態
    const withShop = (action) => { const shop = shopChoice(); return shop ? { ...action, shop } : action; };
    startBtn.onclick = () => act(withShop({ kind: "puzzle_start" }));
    document.getElementById("puzzleCoop").onclick = () => act(withShop({ kind: "puzzle_start", coop: true }));
  }

  setState(state) {
    if (this.busy) { this.pending = state; return; }
    const puzzle = state.puzzle;
    this.updateInfo(state);
    if (!puzzle) { this.root.replaceChildren(); this.board = null; return; }
    const isNewMove = this.board && puzzle.lastMove && this.lastMoveKey !== JSON.stringify(puzzle.lastMove.swap) + puzzle.movesLeft;
    if (isNewMove) {
      this.lastMoveKey = JSON.stringify(puzzle.lastMove.swap) + puzzle.movesLeft;
      void this.animate(puzzle.lastMove, puzzle.board, state);
      return;
    }
    this.lastMoveKey = puzzle.lastMove ? JSON.stringify(puzzle.lastMove.swap) + puzzle.movesLeft : null;
    this.render(puzzle.board);
  }

  updateInfo(state) {
    this.state = state;
    const puzzle = state.puzzle;
    const energy = this.describeStamina(state);
    const playing = puzzle && puzzle.movesLeft > 0;
    this.startBtn.disabled = playing || energy.value < 1;
    this.startBtn.textContent = playing ? "進行中" : `開一盤${energy.text}`;
    const coopBtn = document.getElementById("puzzleCoop");
    coopBtn.hidden = playing || !state.tsunu.home;
    coopBtn.disabled = energy.value < 1;
    this.myTurn = !puzzle?.coop || puzzle.coop.turn === "atone";
    if (!puzzle) { this.info.textContent = `還沒開盤。消掉的圖案會變成材料。${energy.wait}`; return; }
    const collected = Object.entries(puzzle.collected).map(([kind, count]) => `${this.icons.recipes[kind]?.label ?? kind}×${count}`).join("、");
    const wanted = (puzzle.wanted ?? []).map((chain) => this.icons.recipes[chain]?.tiers.at(-1) ?? chain).join("、");
    const coop = puzzle.coop ? `【${puzzle.coop.turn === "atone" ? "輪到妳" : "等阿宇走"}｜阿童 ${puzzle.coop.scores.atone}：阿宇 ${puzzle.coop.scores.tsunu}】` : "";
    this.info.textContent = playing
      ? `${coop}剩 ${puzzle.movesLeft} 步${wanted ? `，店裡想要${wanted}` : ""}${collected ? `，已消：${collected}` : ""}`
      : `打完了，收到 ${collected || "什麼都沒有"}。${energy.value >= 1 ? "再開一盤？" : energy.wait}`;
  }

  /** 體力：跟伺服器同一套算法（上次結算起每 regenMinutes 回 1 點）。 */
  describeStamina(state) {
    const { enabled, max, regenMinutes } = this.stamina;
    if (!enabled) return { value: Infinity, text: "", wait: "" };
    const since = new Date(state.stamina.updatedAt).getTime(), now = Date.now();
    const regenMs = regenMinutes * 60_000;
    const value = Math.min(max, state.stamina.value + Math.floor(Math.max(0, now - since) / regenMs));
    const nextAt = value >= max ? null : since + (Math.floor(Math.max(0, now - since) / regenMs) + 1) * regenMs;
    const minutes = nextAt ? Math.max(1, Math.ceil((nextAt - now) / 60_000)) : 0;
    return { value, text: `（體力 ${value}/${max}）`, wait: nextAt ? `下一點體力 ${minutes} 分鐘後回復。` : "" };
  }

  /** 照伺服器記錄的每一波演完，最後停在最終盤面；動畫期間進來的新狀態最後再套。 */
  async animate(move, finalBoard, state) {
    this.busy = true;
    this.picked = null;
    try {
      await this.playSwap(move.swap);
      for (const step of move.steps) {
        await this.playClear(step.cleared, step.made);
        await this.playFall(step);
      }
      this.render(finalBoard);
      this.updateInfo(state);
    } finally {
      this.busy = false;
      if (this.pending) { const next = this.pending; this.pending = null; this.setState(next); }
    }
  }

  async playSwap([a, b]) {
    const tileA = this.tileAt(a), tileB = this.tileAt(b);
    if (tileA && tileB) {
      tileA.style.transform = `translate(${(b.c - a.c) * 100}%, ${(b.r - a.r) * 100}%)`;
      tileB.style.transform = `translate(${(a.c - b.c) * 100}%, ${(a.r - b.r) * 100}%)`;
      await wait(SWAP_MS);
    }
    const cells = this.board.cells.map((row) => [...row]);
    [cells[a.r][a.c], cells[b.r][b.c]] = [cells[b.r][b.c], cells[a.r][a.c]];
    this.render({ ...this.board, cells });
  }

  async playClear(cleared, made) {
    for (const cell of cleared) {
      const tile = this.tileAt(cell);
      if (!tile) continue;
      const becomesSpecial = made.find((m) => m.r === cell.r && m.c === cell.c);
      tile.classList.add(becomesSpecial ? "flash" : "pop");
    }
    await wait(POP_MS);
    for (const m of made) {
      const tile = this.tileAt(m);
      if (tile) { tile.classList.remove("flash"); this.decorate(tile, m.special); }
    }
    if (made.length) await wait(SPECIAL_MS);
  }

  async playFall(step) {
    const fromOffset = new Map();
    for (const { from, to } of step.falls) fromOffset.set(`${to.r},${to.c}`, to.r - from.r);
    const spawnCount = {};
    for (const { c } of step.spawned) spawnCount[c] = (spawnCount[c] ?? 0) + 1;
    for (const { r, c } of step.spawned) fromOffset.set(`${r},${c}`, spawnCount[c]);   // 新磚整排從盤面上方掉進來
    this.render(step.board, (tile, r, c) => {
      const offset = fromOffset.get(`${r},${c}`);
      if (offset) { tile.style.transition = "none"; tile.style.transform = `translateY(${-offset * 100}%)`; }
    });
    this.root.getBoundingClientRect();   // 先讓起始位置生效，下一格再開始過渡
    for (const tile of this.root.children) { tile.style.transition = ""; tile.style.transform = ""; }
    await wait(FALL_MS);
  }

  tileAt({ r, c }) { return this.root.children[r * COLS + c] ?? null; }

  /** 49 顆磚建一次就一直沿用，換盤面只改圖案與樣式——手機上每一波都重建節點會卡。
   *  改樣式時先關掉過渡，磚直接跳到新樣子；有 beforeInsert（掉落動畫）時由呼叫端接手開過渡。 */
  render(board, beforeInsert = null) {
    this.board = board;
    if (this.root.children.length !== ROWS * COLS) this.createTiles();
    board.cells.forEach((row, r) => row.forEach((item, c) => {
      const tile = this.tileAt({ r, c });
      tile.style.transition = "none"; tile.style.transform = "";
      tile.style.background = ""; tile.textContent = "";
      tile.className = "tile" + (this.picked && this.picked.r === r && this.picked.c === c ? " on" : "");
      if (item) { this.icons.apply(tile, item.kind, 0); if (item.special) this.decorate(tile, item.special); }
      else tile.classList.add("empty");
      beforeInsert?.(tile, r, c);
    }));
    if (beforeInsert) return;
    this.root.getBoundingClientRect();
    for (const tile of this.root.children) tile.style.transition = "";
  }

  createTiles() {
    const tiles = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const tile = document.createElement("div");
      tile.style.left = `${(c / COLS) * 100}%`; tile.style.top = `${(r / ROWS) * 100}%`;
      tile.onclick = () => this.tap(r, c);
      tile.onpointerdown = (e) => this.dragStart(e, r, c);
      tiles.push(tile);
    }
    this.root.replaceChildren(...tiles);
  }

  /** 特殊磚的標記：直線磚畫條紋、炸彈畫光圈、彩虹整塊換成彩虹底。 */
  decorate(tile, special) {
    tile.classList.remove("special-line_h", "special-line_v", "special-bomb", "special-rainbow");
    tile.classList.add(`special-${special}`);
    if (special === "rainbow") { tile.style.background = ""; tile.textContent = ""; }
  }

  /** 拖曳交換：按住一顆磚往上下左右拖超過門檻，就跟那個方向的鄰居交換（點兩下的方式也保留）。 */
  dragStart(e, r, c) {
    if (this.busy) return;
    const startX = e.clientX, startY = e.clientY;
    const threshold = this.root.getBoundingClientRect().width / COLS * 0.35;
    const move = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (Math.hypot(dx, dy) < threshold) return;
      cleanup();
      const [dr, dc] = Math.abs(dx) > Math.abs(dy) ? [0, Math.sign(dx)] : [Math.sign(dy), 0];
      const r2 = r + dr, c2 = c + dc;
      if (r2 < 0 || c2 < 0 || r2 >= ROWS || c2 >= COLS) return;
      this.picked = null; this.refreshPick();
      this.dragged = true; setTimeout(() => { this.dragged = false; }, 0);   // 只擋掉緊接著的那一下 click
      if (this.myTurn !== false) this.act({ kind: "puzzle_swap", r1: r, c1: c, r2, c2 });   // 雙人盤沒輪到自己就不送
    };
    const cleanup = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", cleanup); window.removeEventListener("pointercancel", cleanup); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  }

  tap(r, c) {
    if (this.dragged) { this.dragged = false; return; }   // 拖曳結束時瀏覽器還會補一個 click，不當成點選
    if (this.busy) return;
    if (!this.picked) { this.picked = { r, c }; this.refreshPick(); return; }
    const { r: r1, c: c1 } = this.picked;
    this.picked = null;
    if (Math.abs(r1 - r) + Math.abs(c1 - c) === 1 && this.myTurn !== false) this.act({ kind: "puzzle_swap", r1, c1, r2: r, c2: c });
    else if (r1 !== r || c1 !== c) this.picked = { r, c };
    this.refreshPick();
  }

  refreshPick() {
    [...this.root.children].forEach((tile, i) => tile.classList.toggle("on", !!this.picked && i === this.picked.r * COLS + this.picked.c));
  }
}
