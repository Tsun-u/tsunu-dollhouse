// 三消：盤面是 rows×cols 的磚，每塊有圖案（kind）與可能的特殊效果；交換相鄰兩格、消掉三個以上連線、
// 上方掉落補位、補新磚，連鎖到沒有可消為止。每一波都記下消了誰、誰掉到哪、補了幾塊，給前端演動畫。
// 特殊磚（照 Candy Crush）：四連→直線磚，條紋跟連線垂直（橫向四連清整行、直向四連清整列）；五連→彩虹磚
// （跟誰換就清光那種圖案，被炸到就清剩下最多的那種）；L 或 T 形→炸彈磚（清周圍 3×3）。特殊磚被消到就引爆，
// 可連鎖。步數用完時 finale 把盤面上剩下的特殊磚一次引爆。亂數用種子，伺服器端重算得出一樣的盤面。
/** mulberry32：小而穩定的種子亂數。 */
export function random(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const MIN_KINDS = 3;
/** 產生一個開局就沒有連線、而且至少有一步可走的盤面。 */
export function createBoard(rows, cols, kinds, seed) {
    if (new Set(kinds).size < MIN_KINDS)
        throw new Error(`盤面至少要 ${MIN_KINDS} 種材料。`); // 少於三種一定會連線，下面會一直重來
    let attempt = seed;
    for (;;) {
        const next = random(attempt);
        const cells = [];
        for (let r = 0; r < rows; r++) {
            const row = [];
            for (let c = 0; c < cols; c++) {
                let kind;
                do
                    kind = kinds[Math.floor(next() * kinds.length)];
                while ((c >= 2 && row[c - 1]?.kind === kind && row[c - 2]?.kind === kind) || (r >= 2 && cells[r - 1][c]?.kind === kind && cells[r - 2][c]?.kind === kind));
                row.push({ kind });
            }
            cells.push(row);
        }
        const board = { rows, cols, kinds, cells, seed: attempt };
        if (hasAnyMove(board))
            return board;
        attempt = (attempt + 1) >>> 0;
    }
}
/** 找出所有三連以上的直線（橫向與直向分開列）。 */
function findRuns(board) {
    const runs = [];
    const scan = (length, count, at, horizontal) => {
        for (let i = 0; i < count; i++) {
            for (let j = 0; j < length;) {
                const first = at(i, j);
                const kind = board.cells[first.r][first.c]?.kind;
                let end = j;
                while (end < length && kind !== undefined) {
                    const cell = at(i, end);
                    if (board.cells[cell.r][cell.c]?.kind !== kind)
                        break;
                    end++;
                }
                if (end - j >= 3)
                    runs.push({ cells: Array.from({ length: end - j }, (_, k) => at(i, j + k)), horizontal });
                j = Math.max(end, j + 1);
            }
        }
    };
    scan(board.cols, board.rows, (r, c) => ({ r, c }), true);
    scan(board.rows, board.cols, (c, r) => ({ r, c }), false);
    return runs;
}
export function findMatches(board) {
    const hit = board.cells.map((row) => row.map(() => false));
    for (const run of findRuns(board))
        for (const { r, c } of run.cells)
            hit[r][c] = true;
    return hit;
}
const key = ({ r, c }) => `${r},${c}`;
function swapped(board, a, b) {
    const cells = board.cells.map((row) => [...row]);
    [cells[a.r][a.c], cells[b.r][b.c]] = [cells[b.r][b.c], cells[a.r][a.c]];
    return { ...board, cells };
}
export function isAdjacent(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}
function inBoard(board, { r, c }) {
    return r >= 0 && c >= 0 && r < board.rows && c < board.cols;
}
export function hasAnyMove(board) {
    for (let r = 0; r < board.rows; r++)
        for (let c = 0; c < board.cols; c++) {
            const here = { r, c };
            if (board.cells[r][c]?.special === "rainbow")
                return true;
            for (const b of [{ r, c: c + 1 }, { r: r + 1, c }]) {
                if (!inBoard(board, b))
                    continue;
                if (board.cells[r][c]?.special && board.cells[b.r][b.c]?.special)
                    return true;
                if (findMatches(swapped(board, here, b)).some((row) => row.includes(true)))
                    return true;
            }
        }
    return false;
}
/** 從連線決定要生哪些特殊磚：五連彩虹、同時在橫直兩條線上炸彈、四連直線。生在 preferred 裡落在這條線上的那格（玩家換的兩格，先看換過去的那格），都不在線上就生在線的中間。
 *  那格本來就是特殊磚的不生：它這一波要引爆；在它上面再生一塊會原地保留，整盤都是特殊磚時連鎖就停不下來。 */
function specialsFrom(board, runs, preferred) {
    const made = [];
    const taken = new Set();
    const place = (cells, special) => {
        const spot = preferred.find((want) => cells.some((cell) => key(cell) === key(want))) ?? cells[Math.floor(cells.length / 2)];
        if (taken.has(key(spot)) || board.cells[spot.r][spot.c]?.special)
            return;
        taken.add(key(spot));
        made.push({ ...spot, special });
    };
    for (const run of runs)
        if (run.cells.length >= 5)
            place(run.cells, "rainbow");
    for (const run of runs.filter((run) => run.horizontal)) {
        for (const vertical of runs.filter((run) => !run.horizontal)) {
            const shared = run.cells.find((cell) => vertical.cells.some((other) => key(other) === key(cell)));
            if (shared)
                place([shared], "bomb");
        }
    }
    for (const run of runs)
        if (run.cells.length === 4)
            place(run.cells, run.horizontal ? "line_v" : "line_h");
    return made;
}
/** 消掉的格子集合往外擴：碰到特殊磚就引爆，直到沒有新的格子加進來。rainbowKind 拿到已經要消的格子，挑還剩的圖案。 */
function detonate(board, initial, rainbowKind) {
    const cleared = new Set(initial);
    const queue = [...initial];
    const add = (cell) => { if (inBoard(board, cell) && board.cells[cell.r][cell.c] && !cleared.has(key(cell))) {
        cleared.add(key(cell));
        queue.push(key(cell));
    } };
    while (queue.length) {
        const [r, c] = queue.shift().split(",").map(Number);
        const tile = board.cells[r][c];
        switch (tile?.special) {
            case "line_h":
                for (let cc = 0; cc < board.cols; cc++)
                    add({ r, c: cc });
                break;
            case "line_v":
                for (let rr = 0; rr < board.rows; rr++)
                    add({ r: rr, c });
                break;
            case "bomb":
                for (let dr = -1; dr <= 1; dr++)
                    for (let dc = -1; dc <= 1; dc++)
                        add({ r: r + dr, c: c + dc });
                break;
            case "rainbow": {
                const kind = rainbowKind({ r, c }, cleared);
                if (kind)
                    for (let rr = 0; rr < board.rows; rr++)
                        for (let cc = 0; cc < board.cols; cc++)
                            if (board.cells[rr][cc]?.kind === kind)
                                add({ r: rr, c: cc });
                break;
            }
        }
    }
    return cleared;
}
/** 兩塊特殊磚互換：依組合算出要清的格子，兩塊本身先退回普通磚（效果已經算進去，不再各自引爆）。 */
function combo(board, center, first, second) {
    const cells = board.cells.map((row) => [...row]);
    const initial = new Set();
    const clearAll = () => { for (let r = 0; r < board.rows; r++)
        for (let c = 0; c < board.cols; c++)
            initial.add(key({ r, c })); };
    const isLine = (tile) => tile.special === "line_h" || tile.special === "line_v";
    const specials = [first.special, second.special];
    const rainbows = specials.filter((special) => special === "rainbow").length;
    if (rainbows === 2)
        clearAll();
    else if (rainbows === 1) {
        const other = first.special === "rainbow" ? second : first;
        let parity = 0;
        for (let r = 0; r < board.rows; r++)
            for (let c = 0; c < board.cols; c++) {
                const tile = cells[r][c];
                if (tile?.kind !== other.kind || tile.special)
                    continue;
                cells[r][c] = { kind: tile.kind, special: isLine(other) ? (parity++ % 2 ? "line_v" : "line_h") : "bomb" }; // 同種圖案全部變特殊磚一起炸
                initial.add(key({ r, c }));
            }
    }
    else if (specials.every((special) => special === "bomb")) {
        for (let dr = -2; dr <= 2; dr++)
            for (let dc = -2; dc <= 2; dc++)
                initial.add(key({ r: center.r + dr, c: center.c + dc }));
    }
    else {
        const reach = specials.includes("bomb") ? 1 : 0; // 直線＋炸彈是粗十字，直線＋直線是十字
        for (let d = -reach; d <= reach; d++) {
            for (let c = 0; c < board.cols; c++)
                initial.add(key({ r: center.r + d, c }));
            for (let r = 0; r < board.rows; r++)
                initial.add(key({ r, c: center.c + d }));
        }
    }
    for (const cell of [center, ...neighbours(center)]) { // 換的兩塊都在 center 附近，退回普通磚並列入清除
        const tile = inBoard(board, cell) ? cells[cell.r][cell.c] : null;
        if (tile?.special && (tile === first || tile === second)) {
            cells[cell.r][cell.c] = { kind: tile.kind };
            initial.add(key(cell));
        }
    }
    const valid = new Set([...initial].filter((k) => { const [r, c] = k.split(",").map(Number); return inBoard(board, { r, c }); }));
    return { board: { ...board, cells }, initial: valid };
}
function neighbours({ r, c }) {
    return [{ r: r - 1, c }, { r: r + 1, c }, { r, c: c - 1 }, { r, c: c + 1 }];
}
/** 玩家的一步：交換相鄰兩格。沒有任何連線（也不是特殊磚）就是無效的一步，回 null。 */
export function swap(board, a, b) {
    if (!isAdjacent(a, b) || !inBoard(board, a) || !inBoard(board, b))
        return null;
    const tileA = board.cells[a.r][a.c], tileB = board.cells[b.r][b.c];
    if (!tileA || !tileB)
        return null;
    const candidate = swapped(board, a, b);
    if (tileA.special && tileB.special) {
        const mixed = combo(candidate, b, tileA, tileB);
        return resolve(mixed.board, mixed.initial, []);
    }
    const rainbow = tileA.special === "rainbow" ? { at: b, kind: tileB.kind } : tileB.special === "rainbow" ? { at: a, kind: tileA.kind } : null;
    const runs = findRuns(candidate);
    if (!runs.length && !rainbow)
        return null;
    const initial = new Set(runs.flatMap((run) => run.cells.map(key)));
    if (rainbow)
        initial.add(key(rainbow.at));
    return resolve(candidate, initial, specialsFrom(candidate, runs, [b, a]), rainbow);
}
/** 一步最多連鎖幾波；正常盤面最長四五十波，超過就當成停不下來。 */
export const MAX_CASCADE_WAVES = 100;
/** 消掉、掉落、補牌，重複到穩定；回傳新盤面、各圖案消掉的數量與每一波的細節。 */
export function resolve(board, initial, made, aimed = null) {
    const cleared = {};
    const steps = [];
    let current = board;
    const next = random(board.seed ^ 0x9e3779b9 ^ cascadeSalt(board));
    let pending = initial;
    while (pending && pending.size) {
        const aim = aimed;
        const blast = detonate(current, pending, (cell, done) => aim && key(cell) === key(aim.at) ? aim.kind : mostCommonKind(current, done));
        const step = clearWave(current, blast, made, cleared, next);
        current = step.board;
        steps.push(step);
        aimed = null;
        const runs = findRuns(current);
        pending = runs.length ? new Set(runs.flatMap((run) => run.cells.map(key))) : null;
        made = specialsFrom(current, runs, []);
        if (steps.length >= MAX_CASCADE_WAVES)
            break; // 保險：連鎖停不下來就收手，下面換一盤沒有連線的新盤面
    }
    const settled = { ...current, seed: (current.seed + 1) >>> 0 };
    const stable = !pending?.size && hasAnyMove(settled);
    const board2 = stable ? settled : createBoard(board.rows, board.cols, board.kinds, settled.seed);
    return { board: board2, cleared, steps };
}
/** 一波：消掉 blast（made 的格子原地變成新特殊磚）、上方掉落、最上面補新磚；消掉的數量累加進 cleared。 */
function clearWave(board, blast, made, cleared, next) {
    const cells = board.cells.map((row) => [...row]);
    const clearedCells = [];
    for (const k of blast) {
        const [r, c] = k.split(",").map(Number);
        const tile = cells[r][c];
        cleared[tile.kind] = (cleared[tile.kind] ?? 0) + 1;
        clearedCells.push({ r, c });
        const becomes = made.find((m) => key(m) === k);
        cells[r][c] = becomes ? { kind: tile.kind, special: becomes.special } : null;
    }
    const falls = [];
    const spawned = [];
    for (let c = 0; c < board.cols; c++) {
        let write = board.rows - 1;
        for (let r = board.rows - 1; r >= 0; r--) {
            if (cells[r][c] === null)
                continue;
            if (write !== r) {
                cells[write][c] = cells[r][c];
                cells[r][c] = null;
                falls.push({ from: { r, c }, to: { r: write, c } });
            }
            write--;
        }
        for (let r = write; r >= 0; r--) {
            cells[r][c] = { kind: board.kinds[Math.floor(next() * board.kinds.length)] };
            spawned.push({ r, c });
        }
    }
    return { cleared: clearedCells, made: [...made], falls, spawned, board: { ...board, cells } };
}
/** 步數用完的收尾：盤面上所有特殊磚一起引爆，只算這一波，補上來的磚不再連鎖。沒有特殊磚回 null。 */
export function finale(board) {
    const specials = new Set();
    for (let r = 0; r < board.rows; r++)
        for (let c = 0; c < board.cols; c++)
            if (board.cells[r][c]?.special)
                specials.add(key({ r, c }));
    if (!specials.size)
        return null;
    const blast = detonate(board, specials, (_cell, done) => mostCommonKind(board, done));
    const cleared = {};
    const step = clearWave(board, blast, [], cleared, random(board.seed ^ 0x85ebca6b ^ cascadeSalt(board)));
    return { board: step.board, cleared, steps: [step] };
}
/** 彩虹磚被炸到時，清掉還沒要消的普通磚裡最多的那種圖案（同一波好幾顆彩虹就各清不同種）。 */
function mostCommonKind(board, done) {
    const counts = new Map();
    board.cells.forEach((row, r) => row.forEach((tile, c) => { if (tile && !tile.special && !done.has(key({ r, c })))
        counts.set(tile.kind, (counts.get(tile.kind) ?? 0) + 1); }));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
function cascadeSalt(board) {
    let salt = 0;
    for (const row of board.cells)
        for (const tile of row)
            salt = (salt * 31 + (tile ? board.kinds.indexOf(tile.kind) + 1 : 0)) >>> 0;
    return salt;
}
//# sourceMappingURL=match3.js.map