/* ============================================================
   合成数字 2048 —— 游戏逻辑
   纯原生 JavaScript，零依赖；状态与渲染分离，动画基于 rAF
   ============================================================ */

(function () {
  'use strict';

  // ========== 常量配置 ==========
  const SIZE = 4;                 // 棋盘边长
  const HISTORY_MAX = 5;          // 撤销历史最多保留 5 步
  const SLIDE_MS = 130;           // 方块滑动动画时长（毫秒）
  const BEST_KEY = 'best_merge-2048';
  const SWIPE_MIN = 24;           // 触屏滑动最小识别距离（像素）
  const DIAG_LIMIT = 0.55;        // 对角线误触过滤比例（次轴 / 主轴）

  // 四个移动方向对应的行列增量
  const VECTORS = {
    up: { r: -1, c: 0 },
    down: { r: 1, c: 0 },
    left: { r: 0, c: -1 },
    right: { r: 0, c: 1 }
  };

  // 键盘映射：方向键 + WASD
  const KEY_DIRS = {
    arrowup: 'up', w: 'up',
    arrowdown: 'down', s: 'down',
    arrowleft: 'left', a: 'left',
    arrowright: 'right', d: 'right'
  };

  // 不同数字位数使用的字号比例（相对格子边长）
  const FONT_FACTOR = [0.42, 0.42, 0.35, 0.28, 0.22, 0.18];

  // ========== DOM 引用 ==========
  const board = document.getElementById('board');
  const cellLayer = document.getElementById('cellLayer');
  const tileLayer = document.getElementById('tileLayer');
  const fxLayer = document.getElementById('fxLayer');
  const scoreBox = document.getElementById('scoreBox');
  const scoreValueEl = document.getElementById('scoreValue');
  const bestValueEl = document.getElementById('bestValue');
  const undoBtn = document.getElementById('undoBtn');
  const newBtn = document.getElementById('newBtn');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const continueBtn = document.getElementById('continueBtn');
  const overlayNewBtn = document.getElementById('overlayNewBtn');

  // ========== 游戏状态（纯数据，与渲染无关） ==========
  let idSeq = 1;
  const state = {
    grid: createEmptyGrid(),  // 4x4，元素为 null 或方块对象
    score: 0,
    best: loadBest(),
    over: false,              // 是否无路可走
    won: false,               // 是否曾经合成 2048
    keep: false,              // 胜利后是否选择继续挑战
    moving: false,            // 滑动动画进行中（临时锁定输入）
    history: []               // 撤销快照栈
  };

  // 方块元素缓存：方块 id -> DOM 元素
  const tileEls = new Map();

  // 棋盘几何信息（由实际尺寸测量得到）
  let geom = { size: 0, gap: 0, cell: 0, pitch: 0 };

  // ============================================================
  // 一、纯逻辑部分
  // ============================================================

  function createEmptyGrid() {
    const grid = new Array(SIZE);
    for (let r = 0; r < SIZE; r++) grid[r] = new Array(SIZE).fill(null);
    return grid;
  }

  function makeTile(r, c, value) {
    return { id: idSeq++, row: r, col: c, value: value, justMerged: false };
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function forEachCell(grid, fn) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) fn(grid[r][c], r, c);
    }
  }

  // 在随机空格生成新方块：90% 为 2，10% 为 4；返回新方块（无空格时返回 null）
  function addRandomTile(grid) {
    const empty = [];
    forEachCell(grid, (tile, r, c) => {
      if (!tile) empty.push({ r: r, c: c });
    });
    if (empty.length === 0) return null;
    const pos = empty[Math.floor(Math.random() * empty.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    const tile = makeTile(pos.r, pos.c, value);
    grid[pos.r][pos.c] = tile;
    return tile;
  }

  // 沿移动方向寻找：最远可到达的空格 farthest，以及再往前遇到的第一个方块 next
  function findFarthest(grid, r, c, vec) {
    let pr = r;
    let pc = c;
    while (true) {
      const nr = pr + vec.r;
      const nc = pc + vec.c;
      if (!inBounds(nr, nc)) break;
      if (grid[nr][nc]) return { farthest: { r: pr, c: pc }, next: { r: nr, c: nc } };
      pr = nr;
      pc = nc;
    }
    return { farthest: { r: pr, c: pc }, next: null };
  }

  /**
   * 计算一次移动（直接修改 grid 与方块坐标），返回渲染所需的描述：
   * movements：所有参与滑动的方块（含被合并掉的源方块）
   * merges：合并结果 { tile: 新方块, sources: [两个源方块] }
   * 规则保证：一次移动中每个方块最多参与一次合并（justMerged 标记）
   */
  function computeMove(grid, dir) {
    const vec = VECTORS[dir];
    const rows = [0, 1, 2, 3];
    const cols = [0, 1, 2, 3];
    // 必须从移动方向指向的边缘开始遍历，保证连锁合并顺序正确
    if (vec.r === 1) rows.reverse();
    if (vec.c === 1) cols.reverse();

    forEachCell(grid, (tile) => { if (tile) tile.justMerged = false; });

    const movements = [];
    const merges = [];
    let moved = false;
    let gained = 0;
    let reached = false;

    rows.forEach((r) => {
      cols.forEach((c) => {
        const tile = grid[r][c];
        if (!tile) return;

        const fp = findFarthest(grid, r, c, vec);
        const nextTile = fp.next ? grid[fp.next.r][fp.next.c] : null;

        if (nextTile && nextTile.value === tile.value && !nextTile.justMerged) {
          // 相同数字且目标本回合未合并过 -> 合并翻倍
          const merged = makeTile(fp.next.r, fp.next.c, tile.value * 2);
          merged.justMerged = true;
          grid[r][c] = null;
          grid[fp.next.r][fp.next.c] = merged;

          movements.push({ tile: tile, fromR: r, fromC: c, toR: fp.next.r, toC: fp.next.c });
          movements.push({ tile: nextTile, fromR: nextTile.row, fromC: nextTile.col, toR: fp.next.r, toC: fp.next.c });
          merges.push({ tile: merged, sources: [tile, nextTile] });

          moved = true;
          gained += merged.value;
          if (merged.value === 2048) reached = true;
        } else if (fp.farthest.r !== r || fp.farthest.c !== c) {
          // 仅移动到最远空格
          const to = fp.farthest;
          grid[r][c] = null;
          grid[to.r][to.c] = tile;
          tile.row = to.r;
          tile.col = to.c;
          movements.push({ tile: tile, fromR: r, fromC: c, toR: to.r, toC: to.c });
          moved = true;
        }
      });
    });

    return { moved: moved, movements: movements, merges: merges, gained: gained, reached: reached };
  }

  // 判断棋盘是否仍有可走的步（存在空格，或相邻存在相同数字）
  function canMove(grid) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const tile = grid[r][c];
        if (!tile) return true;
        if (c + 1 < SIZE && grid[r][c + 1] && grid[r][c + 1].value === tile.value) return true;
        if (r + 1 < SIZE && grid[r + 1][c] && grid[r + 1][c].value === tile.value) return true;
      }
    }
    return false;
  }

  // 撤销快照：保存纯数值棋盘与分数等状态
  function makeSnapshot() {
    return {
      cells: state.grid.map((row) => row.map((tile) => (tile ? tile.value : 0))),
      score: state.score,
      won: state.won,
      keep: state.keep
    };
  }

  function restoreSnapshot(snap) {
    state.grid = snap.cells.map((row, r) =>
      row.map((value, c) => (value ? makeTile(r, c, value) : null))
    );
    state.score = snap.score;
    state.won = snap.won;
    state.keep = snap.keep;
    state.over = false;
  }

  // ========== 最高分本地持久化 ==========

  function loadBest() {
    try {
      return parseInt(localStorage.getItem(BEST_KEY), 10) || 0;
    } catch (err) {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      localStorage.setItem(BEST_KEY, String(value));
    } catch (err) {
      /* 本地存储不可用时静默忽略 */
    }
  }

  // ============================================================
  // 二、渲染部分
  // ============================================================

  // 测量棋盘实际像素尺寸，计算格子几何
  function measureGeom() {
    const size = board.clientWidth;
    const gap = parseFloat(getComputedStyle(board).getPropertyValue('--gap')) || 10;
    const cell = (size - gap * (SIZE + 1)) / SIZE;
    geom = { size: size, gap: gap, cell: cell, pitch: cell + gap };
  }

  // 格子中心坐标换算为左上角偏移
  function posOf(r, c) {
    return { x: geom.gap + c * geom.pitch, y: geom.gap + r * geom.pitch };
  }

  function transformPx(r, c) {
    const p = posOf(r, c);
    return 'translate(' + p.x + 'px,' + p.y + 'px)';
  }

  // 构建 16 个静态背景格
  function buildCells() {
    cellLayer.innerHTML = '';
    for (let i = 0; i < SIZE * SIZE; i++) {
      const cellEl = document.createElement('div');
      cellEl.className = 'cell';
      cellLayer.appendChild(cellEl);
    }
  }

  function layoutCells() {
    const cells = cellLayer.children;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const el = cells[r * SIZE + c];
        const p = posOf(r, c);
        el.style.width = geom.cell + 'px';
        el.style.height = geom.cell + 'px';
        el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
      }
    }
  }

  // 依据方块数值设置等级配色与字号
  function paintTile(el, tile) {
    const level = Math.round(Math.log(tile.value) / Math.LN2);
    const cls = level >= 12 ? 'tile tile-lv12 tile-lv-super' : 'tile tile-lv' + level;
    el.className = cls;
    el.dataset.value = String(tile.value);

    const numEl = el.querySelector('.tile-num');
    numEl.textContent = String(tile.value);
    const digits = Math.min(String(tile.value).length, FONT_FACTOR.length - 1);
    numEl.style.fontSize = geom.cell * FONT_FACTOR[digits] + 'px';
  }

  // 创建一个方块元素；anim 可为 'appear'（新生成）、'pop'（合并弹跳）或 null
  function createTileEl(tile, anim) {
    const el = document.createElement('div');
    const inner = document.createElement('div');
    inner.className = 'tile-inner';
    const numEl = document.createElement('span');
    numEl.className = 'tile-num';
    inner.appendChild(numEl);
    el.appendChild(inner);

    el.style.width = geom.cell + 'px';
    el.style.height = geom.cell + 'px';
    el.style.transform = transformPx(tile.row, tile.col);
    paintTile(el, tile);
    tileLayer.appendChild(el);
    tileEls.set(tile.id, el);

    if (anim) {
      inner.classList.add('anim-' + anim);
      inner.addEventListener('animationend', function () {
        inner.classList.remove('anim-' + anim);
      }, { once: true });
    }
    return el;
  }

  function removeTileEl(id) {
    const el = tileEls.get(id);
    if (el) {
      el.parentNode.removeChild(el);
      tileEls.delete(id);
    }
  }

  // 依据状态完整重建方块层（新游戏 / 撤销时使用）
  function rebuildTiles(anim) {
    tileLayer.innerHTML = '';
    tileEls.clear();
    forEachCell(state.grid, (tile) => {
      if (tile) createTileEl(tile, anim);
    });
  }

  // 尺寸变化时重新布局所有元素
  function refreshGeom() {
    measureGeom();
    layoutCells();
    tileEls.forEach((el) => {
      el.style.width = geom.cell + 'px';
      el.style.height = geom.cell + 'px';
    });
    forEachCell(state.grid, (tile) => {
      if (!tile) return;
      const el = tileEls.get(tile.id);
      if (!el) return;
      el.style.transform = transformPx(tile.row, tile.col);
      const numEl = el.querySelector('.tile-num');
      const digits = Math.min(String(tile.value).length, FONT_FACTOR.length - 1);
      numEl.style.fontSize = geom.cell * FONT_FACTOR[digits] + 'px';
    });
  }

  // ============================================================
  // 三、动画部分（rAF 驱动滑动，CSS 关键帧负责弹跳 / 出现）
  // ============================================================

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function playSlide(result, done) {
    const moves = result.movements;
    // 先将所有滑动方块置于起始位置
    moves.forEach((m) => {
      const el = tileEls.get(m.tile.id);
      if (el) el.style.transform = transformPx(m.fromR, m.fromC);
    });

    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / SLIDE_MS);
      const e = easeOutCubic(t);
      moves.forEach((m) => {
        const el = tileEls.get(m.tile.id);
        if (!el) return;
        const r = m.fromR + (m.toR - m.fromR) * e;
        const c = m.fromC + (m.toC - m.fromC) * e;
        el.style.transform = transformPx(r, c);
      });
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        done();
      }
    }
    requestAnimationFrame(frame);
  }

  // 棋盘内合并位置的飘字 “+数值”
  function spawnMergeFx(tile) {
    const p = posOf(tile.row, tile.col);
    const fx = document.createElement('div');
    fx.className = 'merge-fx';
    fx.textContent = '+' + tile.value;
    fx.style.left = p.x + 'px';
    fx.style.top = p.y + 'px';
    fx.style.width = geom.cell + 'px';
    fx.style.height = geom.cell + 'px';
    fxLayer.appendChild(fx);
    fx.addEventListener('animationend', function () {
      if (fx.parentNode) fx.parentNode.removeChild(fx);
    }, { once: true });
  }

  // 分数栏飘字 “+本次得分”
  function floatScore(gained) {
    if (!gained) return;
    const float = document.createElement('span');
    float.className = 'score-float';
    float.textContent = '+' + gained;
    scoreBox.appendChild(float);
    float.addEventListener('animationend', function () {
      if (float.parentNode) float.parentNode.removeChild(float);
    }, { once: true });
  }

  // ============================================================
  // 四、HUD 与遮罩
  // ============================================================

  function updateHud(bump, gained) {
    scoreValueEl.textContent = String(state.score);
    bestValueEl.textContent = String(state.best);
    undoBtn.disabled = state.history.length === 0 || state.moving;

    if (bump && gained > 0) {
      scoreValueEl.classList.remove('bump');
      void scoreValueEl.offsetWidth; // 强制重启动画
      scoreValueEl.classList.add('bump');
      floatScore(gained);
    }
  }

  function showOverlay(kind) {
    if (kind === 'win') {
      overlayTitle.textContent = '达成 2048！';
      overlayTitle.className = 'overlay-title win';
      overlayText.textContent = '恭喜合成 2048！可以继续挑战，冲击 4096 甚至更高数字。';
      continueBtn.classList.remove('hidden');
      overlayNewBtn.textContent = '新游戏';
    } else {
      overlayTitle.textContent = '游戏结束';
      overlayTitle.className = 'overlay-title lose';
      overlayText.textContent = '棋盘已满且没有可合并的数字，最终得分 ' + state.score + ' 分。';
      continueBtn.classList.add('hidden');
      overlayNewBtn.textContent = '再来一局';
    }
    overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  // ============================================================
  // 五、游戏流程控制
  // ============================================================

  function newGame() {
    state.grid = createEmptyGrid();
    state.score = 0;
    state.over = false;
    state.won = false;
    state.keep = false;
    state.moving = false;
    state.history = [];
    hideOverlay();
    addRandomTile(state.grid);
    addRandomTile(state.grid);
    rebuildTiles('appear');
    updateHud(false, 0);
  }

  function undo() {
    if (state.moving || state.history.length === 0) return;
    const snap = state.history.pop();
    restoreSnapshot(snap);
    hideOverlay();
    rebuildTiles(null);
    updateHud(false, 0);
  }

  function handleMove(dir) {
    if (state.moving || state.over) return;
    if (state.won && !state.keep) return; // 胜利弹窗未关闭前暂停响应

    const result = computeMove(state.grid, dir);
    if (!result.moved) return;

    // 移动生效前压入撤销快照
    state.history.push(makeSnapshot());
    if (state.history.length > HISTORY_MAX) state.history.shift();
    state.score += result.gained;
    state.moving = true;
    updateHud(false, 0);

    playSlide(result, function () {
      // 滑动结束：移除被合并的两个源方块，弹出合并后的新方块
      result.merges.forEach((mg) => {
        mg.sources.forEach((src) => removeTileEl(src.id));
        createTileEl(mg.tile, 'pop');
        spawnMergeFx(mg.tile);
      });

      // 每次有效移动随机生成一个新方块
      const born = addRandomTile(state.grid);
      if (born) createTileEl(born, 'appear');

      state.moving = false;
      if (state.score > state.best) {
        state.best = state.score;
        saveBest(state.best);
      }
      updateHud(true, result.gained);

      // 胜利判定（仅首次合成 2048 时弹窗，可继续挑战）
      if (result.reached && !state.won) {
        state.won = true;
        showOverlay('win');
      } else if (!canMove(state.grid)) {
        state.over = true;
        showOverlay('over');
      }
    });
  }

  // ============================================================
  // 六、输入：键盘 + 触屏
  // ============================================================

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const dir = KEY_DIRS[e.key.toLowerCase()];
    if (!dir) return;
    e.preventDefault();
    handleMove(dir);
  }

  let touchStart = null;

  function onTouchStart(e) {
    if (e.touches.length !== 1) {
      touchStart = null;
      return;
    }
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }

  function onTouchMove(e) {
    // 阻止滑动时页面滚动
    if (touchStart) e.preventDefault();
  }

  function onTouchEnd(e) {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const main = Math.max(absX, absY);
    if (main < SWIPE_MIN) return;                 // 距离太短，忽略
    if (Math.min(absX, absY) / main > DIAG_LIMIT) return; // 对角线误触，忽略

    const dir = absX > absY
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');
    handleMove(dir);
  }

  function bindEvents() {
    window.addEventListener('keydown', onKeyDown);

    board.addEventListener('touchstart', onTouchStart, { passive: true });
    board.addEventListener('touchmove', onTouchMove, { passive: false });
    board.addEventListener('touchend', onTouchEnd, { passive: true });
    board.addEventListener('touchcancel', function () { touchStart = null; }, { passive: true });

    undoBtn.addEventListener('click', undo);
    newBtn.addEventListener('click', newGame);
    overlayNewBtn.addEventListener('click', newGame);
    continueBtn.addEventListener('click', function () {
      state.keep = true;
      hideOverlay();
    });

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(refreshGeom);
      observer.observe(board);
    } else {
      window.addEventListener('resize', refreshGeom);
    }
  }

  // ============================================================
  // 七、初始化
  // ============================================================

  function init() {
    buildCells();
    measureGeom();
    layoutCells();
    addRandomTile(state.grid);
    addRandomTile(state.grid);
    rebuildTiles('appear');
    updateHud(false, 0);
    bindEvents();
  }

  init();
})();
