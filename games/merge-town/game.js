/* ============================================================
 * 合成小镇  game.js
 * 6x6 网格放置合成：草丛 → 灌木 → 大树 → 小屋 → 城堡 → 城镇
 * 纯 Canvas 2D 矢量绘制，零依赖；逻辑状态与动画表现分离
 * ============================================================ */
(function () {
  "use strict";

  /* ===================== 常量配置 ===================== */
  var N = 6;                    // 网格边长
  var CELLS = N * N;
  var EMPTY = -1;               // 空格标记
  var MAX_LEVEL = 5;            // 城镇为最高级
  var QUEUE_LEN = 3;            // 持有栏预告数量
  var UNDO_TIMES = 3;           // 每局撤销次数
  var REFRESH_TIMES = 3;        // 每局刷新次数
  var BEST_KEY = "best_merge-town";

  // 六个等级的中文名
  var LEVEL_NAMES = ["草丛", "灌木", "大树", "小屋", "城堡", "城镇"];
  // 各等级主题色（自然色系点缀，整体保持深色霓虹风）
  var LEVEL_COLORS = ["#4ade80", "#22c55e", "#16a34a", "#ffb347", "#7c5cff", "#ffd166"];
  // 合成结果为该等级时的基础得分
  var MERGE_SCORE = [0, 5, 15, 50, 150, 500];
  // 持有地块权重：等级越高占比越低，城镇（5）只能通过合成获得
  var WEIGHTS = [50, 27, 14, 7, 2];

  var TWO_PI = Math.PI * 2;

  /* ============== 纯逻辑核心（可在 Node 下做桩测试） ============== */

  // 确定性伪随机数发生器（mulberry32）
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 按权重随机出一个待放置地块等级（0~4）
  function rollLevel(rng) {
    var z = rng() * 100;
    var acc = 0;
    for (var i = 0; i < WEIGHTS.length; i++) {
      acc += WEIGHTS[i];
      if (z < acc) { return i; }
    }
    return 0;
  }

  // 取某格的上下左右四邻格（固定顺序：上、右、下、左）
  function neighborIndices(idx) {
    var r = (idx / N) | 0;
    var c = idx % N;
    var out = [];
    if (r > 0) { out.push(idx - N); }
    if (c < N - 1) { out.push(idx + 1); }
    if (r < N - 1) { out.push(idx + N); }
    if (c > 0) { out.push(idx - 1); }
    return out;
  }

  function emptyCount(s) {
    var n = 0;
    for (var i = 0; i < CELLS; i++) { if (s.grid[i] === EMPTY) { n++; } }
    return n;
  }

  // 当前持有地块是否还能放置：只要存在任意空格即可放置
  function canPlace(s) {
    return !s.over && s.queue.length > 0 && emptyCount(s) > 0;
  }

  // 创建一局新状态
  function createState(rng) {
    var s = {
      grid: [],
      queue: [],
      score: 0,
      bestLevel: 0,
      undoLeft: UNDO_TIMES,
      refreshLeft: REFRESH_TIMES,
      over: false,
      history: [],
      rng: rng || Math.random
    };
    for (var i = 0; i < CELLS; i++) { s.grid.push(EMPTY); }
    while (s.queue.length < QUEUE_LEN) { s.queue.push(rollLevel(s.rng)); }
    return s;
  }
  // 在 idx 格放置当前地块，并立即结算自动合成 / 连锁合成（逻辑层瞬时完成）
  // 说明：合成始终发生在“放置格”，被合成的邻格被消耗；
  //      新建筑继续检测相邻同类，因此每次连锁消耗的都是不同地块（每块只参与一次）。
  function place(s, idx) {
    if (s.over || idx < 0 || idx >= CELLS || s.grid[idx] !== EMPTY) {
      return { ok: false };
    }

    // 记录快照用于撤销
    s.history.push({
      grid: s.grid.slice(),
      queue: s.queue.slice(),
      score: s.score,
      bestLevel: s.bestLevel
    });
    if (s.history.length > 80) { s.history.shift(); }

    var placed = s.queue.shift();
    while (s.queue.length < QUEUE_LEN) { s.queue.push(rollLevel(s.rng)); }

    s.grid[idx] = placed;
    var level = placed;
    var steps = [];
    var chain = 0;
    var mergeGain = 0;

    while (level < MAX_LEVEL) {
      var peers = neighborIndices(idx);
      var pick = -1;
      for (var k = 0; k < peers.length; k++) {
        if (s.grid[peers[k]] === level) { pick = peers[k]; break; }
      }
      if (pick === -1) { break; }
      // 消耗一个同类邻格，放置格升级
      s.grid[pick] = EMPTY;
      level++;
      s.grid[idx] = level;
      chain++;
      // 连锁倍率：第 1 次合成 ×1.5，第 2 次 ×2，第 3 次 ×2.5 …
      var mult = 1 + 0.5 * chain;
      var gain = Math.round(MERGE_SCORE[level] * mult);
      mergeGain += gain;
      steps.push({ from: pick, result: level, gain: gain });
    }

    s.score += 1 + mergeGain;            // 每次放置固定 +1
    if (level > s.bestLevel) { s.bestLevel = level; }
    s.over = emptyCount(s) === 0;      // 无空格则当前地块无法放置，终局

    return {
      ok: true,
      idx: idx,
      base: placed,
      level: level,
      steps: steps,
      gain: 1 + mergeGain,
      mergeGain: mergeGain
    };
  }

  // 撤销上一步（恢复棋盘、队列、分数、最高合成等级）
  function undo(s) {
    if (s.undoLeft <= 0 || s.history.length === 0) { return false; }
    var snap = s.history.pop();
    s.grid = snap.grid;
    s.queue = snap.queue;
    s.score = snap.score;
    s.bestLevel = snap.bestLevel;
    s.undoLeft--;
    s.over = false;
    return true;
  }

  // 刷新：换掉当前持有的地块（保证与原地块不同）
  function refresh(s) {
    if (s.over || s.refreshLeft <= 0 || s.queue.length === 0) { return false; }
    var now = s.queue[0];
    var next = now;
    var guard = 0;
    while (next === now && guard < 50) { next = rollLevel(s.rng); guard++; }
    if (next === now) { return false; }
    s.queue[0] = next;
    s.refreshLeft--;
    return true;
  }

  var Core = {
    N: N, CELLS: CELLS, EMPTY: EMPTY, MAX_LEVEL: MAX_LEVEL,
    LEVEL_NAMES: LEVEL_NAMES, LEVEL_COLORS: LEVEL_COLORS,
    MERGE_SCORE: MERGE_SCORE, BEST_KEY: BEST_KEY,
    makeRng: makeRng, rollLevel: rollLevel, neighborIndices: neighborIndices,
    emptyCount: emptyCount, canPlace: canPlace,
    createState: createState, place: place, undo: undo, refresh: refresh
  };

  // Node 环境：仅导出纯逻辑，供逻辑桩测试使用
  if (typeof module !== "undefined" && module.exports) {
    module.exports = Core;
    return;
  }

  /* ===================== 浏览器 UI 层 ===================== */

  var boardCanvas = document.getElementById("boardCanvas");
  var g2 = boardCanvas.getContext("2d");

  var scoreValue = document.getElementById("scoreValue");
  var bestValue = document.getElementById("bestValue");
  var spaceValue = document.getElementById("spaceValue");
  var undoBtn = document.getElementById("undoBtn");
  var refreshBtn = document.getElementById("refreshBtn");
  var newBtn = document.getElementById("newBtn");
  var undoCount = document.getElementById("undoCount");
  var refreshCount = document.getElementById("refreshCount");

  var startOverlay = document.getElementById("startOverlay");
  var overOverlay = document.getElementById("overOverlay");
  var startBtn = document.getElementById("startBtn");
  var retryBtn = document.getElementById("retryBtn");
  var finalScore = document.getElementById("finalScore");
  var finalBest = document.getElementById("finalBest");
  var finalLevel = document.getElementById("finalLevel");

  var slotCanvas = [
    document.getElementById("slot0"),
    document.getElementById("slot1"),
    document.getElementById("slot2")
  ];
  var slotCtx = slotCanvas.map(function (cv) { return cv.getContext("2d"); });
  var slotName = [
    document.getElementById("slot0Name"),
    document.getElementById("slot1Name"),
    document.getElementById("slot2Name")
  ];

  /* ---------- 运行时状态（状态与动画表现分离） ---------- */
  var state = createState(makeRng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0));
  var started = false;
  var best = 0;
  try { best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0; } catch (e) { best = 0; }

  var fx = null;             // 当前放置的动画时间线
  var particles = [];        // 粒子列表
  var floats = [];           // 飘分文字列表
  var timed = [];            // 延时触发事件（如城镇第二波烟花）
  var hoverIdx = -1;

  // 动画时长参数（毫秒）
  var SPAWN_MS = 210;        // 放置弹跳
  var STEP_GAP = 290;        // 每级连锁的间隔
  var FLY_MS = 210;          // 被合成地块飞行耗时
  var BOUNCE_MS = 260;       // 合成后新建筑弹跳
  var CHAIN_PATH_COLORS = ["#22d3ee", "#7c5cff", "#ff5ca8", "#ffb347"];

  /* ---------- 高分存取 ---------- */
  function saveBest() {
    if (state.score > best) {
      best = state.score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* 忽略隐私模式异常 */ }
    }
  }

  /* ---------- 棋盘几何 ---------- */
  var dpr = 1;
  var boardSize = 0;
  var pad = 10;
  var pitch = 0;

  function resize() {
    var rect = boardCanvas.getBoundingClientRect();
    boardSize = Math.max(60, rect.width || 0);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    boardCanvas.width = Math.round(boardSize * dpr);
    boardCanvas.height = Math.round(boardSize * dpr);
    pitch = (boardSize - pad * 2) / N;
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function cellCenter(idx) {
    var r = (idx / N) | 0;
    var c = idx % N;
    return {
      x: pad + c * pitch + pitch / 2,
      y: pad + r * pitch + pitch / 2
    };
  }

  function pickCell(clientX, clientY) {
    var rect = boardCanvas.getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;
    var c = Math.floor((x - pad) / pitch);
    var r = Math.floor((y - pad) / pitch);
    if (r < 0 || r >= N || c < 0 || c >= N) { return -1; }
    var lx = x - (pad + c * pitch);  // 限制在格内区域（忽略缝隙）
    var ly = y - (pad + r * pitch);
    if (lx < 2 || ly < 2 || lx > pitch - 2 || ly > pitch - 2) { return -1; }
    return r * N + c;
  }
  /* ============== 矢量建筑绘制（六个等级，精致度递增） ============== */

  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // 四级芒星（城镇装饰光点）
  function sparkle(g, x, y, r, alpha, rot) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.globalAlpha = alpha;
    g.beginPath();
    g.moveTo(0, -r);
    g.lineTo(r * 0.28, -r * 0.28);
    g.lineTo(r, 0);
    g.lineTo(r * 0.28, r * 0.28);
    g.lineTo(0, r);
    g.lineTo(-r * 0.28, r * 0.28);
    g.lineTo(-r, 0);
    g.lineTo(-r * 0.28, -r * 0.28);
    g.closePath();
    g.fill();
    g.restore();
  }

  // 主绘制入口：以 (cx,cy) 为中心，R 为整体半径，所有美术按 40 单位空间缩放
  function drawBuildingAt(g, level, cx, cy, R, now, scale, alpha) {
    scale = scale == null ? 1 : scale;
    alpha = alpha == null ? 1 : alpha;
    g.save();
    g.translate(cx, cy);
    g.scale((R * scale) / 40, (R * scale) / 40);
    g.globalAlpha = alpha;

    // 落地阴影
    g.beginPath();
    g.ellipse(0, 30, 25, 7, 0, 0, TWO_PI);
    g.fillStyle = "rgba(0,0,0,.32)";
    g.fill();

    if (level === 0) { drawGrass(g); }
    else if (level === 1) { drawBush(g); }
    else if (level === 2) { drawTree(g); }
    else if (level === 3) { drawHouse(g); }
    else if (level === 4) { drawCastle(g, now); }
    else { drawTown(g, now); }

    g.restore();
  }

  // 草丛：三叶簇
  function drawGrass(g) {
    var angles = [-Math.PI / 2, -Math.PI / 2 + TWO_PI / 3, -Math.PI / 2 + TWO_PI * 2 / 3];
    for (var i = 0; i < 3; i++) {
      g.save();
      g.rotate(angles[i]);
      var grad = g.createLinearGradient(0, -2, 0, -27);
      grad.addColorStop(0, "#15803d");
      grad.addColorStop(1, "#4ade80");
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(0, -14, 8.5, 13.5, 0, 0, TWO_PI);
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = "rgba(255,255,255,.25)";
      g.stroke();
      g.beginPath();
      g.moveTo(0, -4);
      g.lineTo(0, -24);
      g.strokeStyle = "rgba(6,50,20,.45)";
      g.stroke();
      g.restore();
    }
    g.beginPath();
    g.arc(0, 0, 5.5, 0, TWO_PI);
    g.fillStyle = "#16a34a";
    g.fill();
    g.beginPath();
    g.arc(-1.6, -1.6, 1.9, 0, TWO_PI);
    g.fillStyle = "rgba(255,255,255,.5)";
    g.fill();
  }

  // 灌木：深绿圆球 + 浆果
  function drawBush(g) {
    var balls = [
      { x: -13, y: 9, r: 14.5, a: "#2f9e57", b: "#0f4d28" },
      { x: 13, y: 7, r: 16, a: "#2a9450", b: "#0e4726" },
      { x: 0, y: -4, r: 23, a: "#35a85e", b: "#14602f" }
    ];
    for (var i = 0; i < balls.length; i++) {
      var d = balls[i];
      var rg = g.createRadialGradient(d.x - d.r * .35, d.y - d.r * .4, d.r * .15, d.x, d.y, d.r);
      rg.addColorStop(0, d.a);
      rg.addColorStop(1, d.b);
      g.beginPath();
      g.arc(d.x, d.y, d.r, 0, TWO_PI);
      g.fillStyle = rg;
      g.fill();
    }
    var berries = [
      { x: -9, y: -8, c: "#ff5ca8" },
      { x: 9, y: -12, c: "#e11d48" },
      { x: 13, y: 3, c: "#ff5ca8" },
      { x: -13, y: 3, c: "#ffb347" },
      { x: -1, y: 9, c: "#e11d48" }
    ];
    for (var j = 0; j < berries.length; j++) {
      var b = berries[j];
      g.beginPath();
      g.arc(b.x, b.y, 3.4, 0, TWO_PI);
      g.fillStyle = b.c;
      g.fill();
      g.beginPath();
      g.arc(b.x - 1, b.y - 1.2, 1.1, 0, TWO_PI);
      g.fillStyle = "rgba(255,255,255,.75)";
      g.fill();
    }
  }
  // 大树：树干 + 分层树冠
  function drawTree(g) {
    var tg = g.createLinearGradient(-5, 0, 6, 0);
    tg.addColorStop(0, "#a06a37");
    tg.addColorStop(1, "#6b4423");
    rr(g, -5.5, 4, 11, 26, 4);
    g.fillStyle = tg;
    g.fill();
    g.beginPath();
    g.moveTo(0, 8);
    g.lineTo(0, 27);
    g.strokeStyle = "rgba(60,35,15,.35)";
    g.lineWidth = 1;
    g.stroke();

    var layers = [
      { x: 0, y: -3, r: 23, a: "#1c8f46", b: "#0c5128" },
      { x: -4, y: -17, r: 17, a: "#22a353", b: "#0f6e33" },
      { x: 3, y: -28, r: 12, a: "#34c465", b: "#15803d" }
    ];
    for (var i = 0; i < layers.length; i++) {
      var d = layers[i];
      var rg = g.createRadialGradient(d.x - d.r * .35, d.y - d.r * .45, d.r * .1, d.x, d.y, d.r);
      rg.addColorStop(0, d.a);
      rg.addColorStop(1, d.b);
      g.beginPath();
      g.arc(d.x, d.y, d.r, 0, TWO_PI);
      g.fillStyle = rg;
      g.fill();
      g.strokeStyle = "rgba(0,0,0,.16)";
      g.lineWidth = 1;
      g.stroke();
      g.beginPath();
      g.ellipse(d.x - d.r * .32, d.y - d.r * .38, d.r * .26, d.r * .16, -0.6, 0, TWO_PI);
      g.fillStyle = "rgba(255,255,255,.16)";
      g.fill();
    }
  }

  // 小屋：三角屋顶 + 门窗 + 烟囱
  function drawHouse(g) {
    // 烟囱（先画，屋顶会遮挡底部）
    rr(g, 9, -27, 8, 14, 2);
    g.fillStyle = "#8a5a3c";
    g.fill();
    rr(g, 7, -30, 12, 5, 2);
    g.fillStyle = "#6b4423";
    g.fill();

    // 墙体
    var wg = g.createLinearGradient(0, -4, 0, 28);
    wg.addColorStop(0, "#f3d8ab");
    wg.addColorStop(1, "#d39b61");
    rr(g, -20, -4, 40, 32, 4);
    g.fillStyle = wg;
    g.fill();
    g.beginPath();
    g.moveTo(-20, 12);
    g.lineTo(20, 12);
    g.strokeStyle = "rgba(120,70,30,.25)";
    g.lineWidth = 1;
    g.stroke();

    // 三角屋顶
    var rg2 = g.createLinearGradient(0, -33, 0, -2);
    rg2.addColorStop(0, "#ff8a7c");
    rg2.addColorStop(1, "#d1382c");
    g.beginPath();
    g.moveTo(-27, -2);
    g.lineTo(0, -33);
    g.lineTo(27, -2);
    g.closePath();
    g.fillStyle = rg2;
    g.fill();
    g.strokeStyle = "rgba(90,10,10,.55)";
    g.lineWidth = 1.2;
    g.stroke();
    g.beginPath();
    g.moveTo(-26, -2);
    g.lineTo(26, -2);
    g.strokeStyle = "rgba(0,0,0,.22)";
    g.lineWidth = 2;
    g.stroke();

    // 拱门
    g.beginPath();
    g.moveTo(-7, 28);
    g.lineTo(-7, 14);
    g.arc(0, 14, 7, Math.PI, 0);
    g.lineTo(7, 28);
    g.closePath();
    g.fillStyle = "#7c4a21";
    g.fill();
    g.strokeStyle = "rgba(60,30,10,.6)";
    g.lineWidth = 1;
    g.stroke();
    g.beginPath();
    g.arc(3.6, 20.5, 1.3, 0, TWO_PI);
    g.fillStyle = "#ffd166";
    g.fill();

    // 发光窗
    rr(g, -16, 3, 10, 10, 2);
    g.fillStyle = "#fff4d6";
    g.fill();
    g.save();
    g.shadowColor = "#22d3ee";
    g.shadowBlur = 8;
    rr(g, -14.5, 4.5, 7, 7, 1.5);
    g.fillStyle = "#22d3ee";
    g.fill();
    g.restore();
    g.beginPath();
    g.moveTo(-11, 4.5);
    g.lineTo(-11, 11.5);
    g.moveTo(-14.5, 8);
    g.lineTo(-7.5, 8);
    g.strokeStyle = "rgba(10,40,50,.55)";
    g.lineWidth = .9;
    g.stroke();
  }
  // 城堡：城垛 + 旗帜 + 发光窗
  function drawCastle(g, now) {
    // 两侧塔楼
    var sides = [-23, 23];
    for (var i = 0; i < sides.length; i++) {
      var sx = sides[i];
      var sg = g.createLinearGradient(sx - 7, 0, sx + 7, 0);
      sg.addColorStop(0, "#b6bfd0");
      sg.addColorStop(1, "#626b7d");
      rr(g, sx - 7, -4, 14, 32, 3);
      g.fillStyle = sg;
      g.fill();
      g.beginPath();
      g.moveTo(sx - 9, -4);
      g.lineTo(sx, -21);
      g.lineTo(sx + 9, -4);
      g.closePath();
      g.fillStyle = "#7c5cff";
      g.fill();
      g.strokeStyle = "rgba(30,20,70,.5)";
      g.lineWidth = 1;
      g.stroke();
      g.save();
      g.shadowColor = "#22d3ee";
      g.shadowBlur = 6;
      rr(g, sx - 1.6, 3, 3.2, 7, 1.6);
      g.fillStyle = "#8ff4ff";
      g.fill();
      g.restore();
    }

    // 中央高塔 + 尖顶与旗
    var cg = g.createLinearGradient(-7, 0, 7, 0);
    cg.addColorStop(0, "#aeb8cc");
    cg.addColorStop(1, "#5d6678");
    rr(g, -7, -28, 14, 20, 3);
    g.fillStyle = cg;
    g.fill();
    g.beginPath();
    g.moveTo(-8, -28);
    g.lineTo(0, -41);
    g.lineTo(8, -28);
    g.closePath();
    g.fillStyle = "#ffb347";
    g.fill();
    g.strokeStyle = "rgba(90,50,10,.5)";
    g.lineWidth = 1;
    g.stroke();
    g.beginPath();
    g.moveTo(0, -41);
    g.lineTo(0, -48);
    g.strokeStyle = "#e8ecff";
    g.lineWidth = 1.2;
    g.stroke();
    var wave = Math.sin(now / 180) * 1.4;
    g.beginPath();
    g.moveTo(0, -48);
    g.lineTo(11, -45 + wave);
    g.lineTo(0, -42);
    g.closePath();
    g.fillStyle = "#ff5ca8";
    g.fill();

    // 主城楼
    var kg = g.createLinearGradient(0, -10, 0, 28);
    kg.addColorStop(0, "#9aa3b8");
    kg.addColorStop(1, "#5b6478");
    rr(g, -16, -10, 32, 38, 4);
    g.fillStyle = kg;
    g.fill();
    g.fillStyle = "#8993a8";           // 城垛
    for (var mx = -16; mx < 16; mx += 8) {
      rr(g, mx, -16, 8, 6, 2);
      g.fill();
    }
    g.strokeStyle = "rgba(20,26,40,.22)";  // 石砖缝
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -10);
    g.lineTo(0, 28);
    g.moveTo(-16, 9);
    g.lineTo(16, 9);
    g.stroke();

    // 拱形城门
    g.beginPath();
    g.moveTo(-6, 28);
    g.lineTo(-6, 15);
    g.arc(0, 15, 6, Math.PI, 0);
    g.lineTo(6, 28);
    g.closePath();
    g.fillStyle = "#262a38";
    g.fill();
    g.strokeStyle = "rgba(180,190,215,.5)";
    g.lineWidth = .8;
    g.beginPath();
    g.moveTo(-3, 16);
    g.lineTo(-3, 28);
    g.moveTo(3, 16);
    g.lineTo(3, 28);
    g.stroke();

    // 城楼发光窗
    var wins = [[-10, -2], [6, -2], [-10, 16], [6, 16]];
    for (var w = 0; w < wins.length; w++) {
      g.save();
      g.shadowColor = "#ffb347";
      g.shadowBlur = 6;
      rr(g, wins[w][0], wins[w][1], 4, 6, 2);
      g.fillStyle = "#ffe08a";
      g.fill();
      g.restore();
    }
  }

  // 城镇：高塔群 + 发光窗 + 金色光晕
  function drawTown(g, now) {
    var pulse = .22 + .12 * Math.sin(now / 380);
    var halo = g.createRadialGradient(0, -4, 4, 0, -4, 42);
    halo.addColorStop(0, "rgba(255,209,102," + pulse.toFixed(3) + ")");
    halo.addColorStop(1, "rgba(255,209,102,0)");
    g.beginPath();
    g.arc(0, -4, 42, 0, TWO_PI);
    g.fillStyle = halo;
    g.fill();

    // 底座
    var pg = g.createLinearGradient(0, 18, 0, 28);
    pg.addColorStop(0, "#5a6080");
    pg.addColorStop(1, "#393e5b");
    rr(g, -29, 18, 58, 10, 4);
    g.fillStyle = pg;
    g.fill();

    // 两侧矮塔
    var blocks = [
      { x: -18, y: 0, w: 13, top: -14 },
      { x: 18, y: -7, w: 12, top: -19 }
    ];
    for (var i = 0; i < blocks.length; i++) {
      var d = blocks[i];
      var bg = g.createLinearGradient(d.x - d.w / 2, 0, d.x + d.w / 2, 0);
      bg.addColorStop(0, "#9aa2be");
      bg.addColorStop(1, "#5b627c");
      rr(g, d.x - d.w / 2, d.y, d.w, 20, 3);
      g.fillStyle = bg;
      g.fill();
      g.beginPath();
      g.moveTo(d.x - d.w / 2 - 2, d.y);
      g.lineTo(d.x, d.top);
      g.lineTo(d.x + d.w / 2 + 2, d.y);
      g.closePath();
      g.fillStyle = "#7c5cff";
      g.fill();
      g.strokeStyle = "rgba(30,20,70,.45)";
      g.lineWidth = 1;
      g.stroke();
    }

    // 中央高塔
    var mg = g.createLinearGradient(-9, 0, 9, 0);
    mg.addColorStop(0, "#a8b0cc");
    mg.addColorStop(1, "#5a6178");
    rr(g, -9, -22, 18, 40, 3);
    g.fillStyle = mg;
    g.fill();
    g.beginPath();
    g.moveTo(-11, -22);
    g.lineTo(0, -39);
    g.lineTo(11, -22);
    g.closePath();
    g.fillStyle = "#ffb347";
    g.fill();
    g.strokeStyle = "rgba(90,50,10,.45)";
    g.lineWidth = 1;
    g.stroke();
    g.beginPath();
    g.moveTo(0, -39);
    g.lineTo(0, -45);
    g.strokeStyle = "#e8ecff";
    g.lineWidth = 1.1;
    g.stroke();
    g.beginPath();
    g.moveTo(0, -45);
    g.lineTo(9, -42.5 + Math.sin(now / 170) * 1.2);
    g.lineTo(0, -40);
    g.closePath();
    g.fillStyle = "#22d3ee";
    g.fill();

    // 发光窗矩阵
    g.save();
    g.shadowColor = "#ffd166";
    g.shadowBlur = 7;
    g.fillStyle = "#ffe9a8";
    var rows = [-15, -6, 3];
    for (var r = 0; r < rows.length; r++) {
      rr(g, -5.5, rows[r], 3.2, 4, 1.4); g.fill();
      rr(g, 2.3, rows[r], 3.2, 4, 1.4); g.fill();
    }
    rr(g, -23, 6, 3, 4, 1.4); g.fill();
    rr(g, 16, 0, 3, 4, 1.4); g.fill();
    g.restore();

    // 中央塔底拱门
    g.beginPath();
    g.moveTo(-4, 18);
    g.lineTo(-4, 12);
    g.arc(0, 12, 4, Math.PI, 0);
    g.lineTo(4, 18);
    g.closePath();
    g.fillStyle = "#2c3044";
    g.fill();

    // 环绕闪烁光点
    g.fillStyle = "#fff3c4";
    var tw = [
      { x: -27, y: -22, ph: 0 },
      { x: 27, y: -26, ph: 2 },
      { x: 18, y: -42, ph: 4 }
    ];
    for (var t = 0; t < tw.length; t++) {
      var a = .25 + .6 * Math.abs(Math.sin(now / 460 + tw[t].ph));
      sparkle(g, tw[t].x, tw[t].y, 3.2, a, now / 900 + t);
    }
  }
  /* ===================== 粒子与飘分 ===================== */

  function addParticle(p) { particles.push(p); }

  // 合成粒子：自然系掉叶子，建筑系喷光点；城镇额外金色烟花
  function spawnMergeFx(level, x, y, now) {
    addParticle({
      kind: "ring", x: x, y: y,
      born: now, dur: level === MAX_LEVEL ? 620 : 400,
      r1: level === MAX_LEVEL ? 72 : 44,
      color: LEVEL_COLORS[level]
    });

    if (level <= 2) {
      // 叶子
      for (var i = 0; i < 11; i++) {
        addParticle({
          kind: "leaf", x: x, y: y,
          vx: (Math.random() - .5) * 130,
          vy: -50 - Math.random() * 130,
          g: 250, life: .85 + Math.random() * .5, age: 0,
          size: 4 + Math.random() * 2.6,
          rot: Math.random() * TWO_PI,
          vr: (Math.random() - .5) * 7,
          color: ["#4ade80", "#22c55e", "#86efac"][i % 3]
        });
      }
      for (var d = 0; d < 8; d++) {
        addParticle({
          kind: "dot", x: x, y: y,
          vx: (Math.random() - .5) * 170,
          vy: -40 - Math.random() * 150,
          g: 130, life: .5 + Math.random() * .4, age: 0,
          size: 2 + Math.random() * 2.2,
          color: ["#22d3ee", "#4ade80", "#a7f3d0"][d % 3]
        });
      }
    } else {
      var palette = ["#22d3ee", "#ff5ca8", "#7c5cff", "#ffb347", "#ffffff"];
      var cnt = level === MAX_LEVEL ? 20 : 15;
      for (var q = 0; q < cnt; q++) {
        addParticle({
          kind: "dot", x: x, y: y,
          vx: (Math.random() - .5) * 240,
          vy: -50 - Math.random() * 190,
          g: 150, life: .55 + Math.random() * .45, age: 0,
          size: 2 + Math.random() * 2.6,
          color: palette[q % palette.length]
        });
      }
    }

    if (level === MAX_LEVEL) {
      goldFirework(x, y);
      // 城镇出现：追加两波金色烟花
      timed.push({ at: now + 230, fn: function () { goldFirework(x, y); } });
      timed.push({ at: now + 470, fn: function () { goldFirework(x, y); } });
    }
  }

  function goldFirework(x, y) {
    var golds = ["#ffd166", "#ffb347", "#ffe9a8", "#fff6d6"];
    for (var i = 0; i < 28; i++) {
      var ang = Math.random() * TWO_PI;
      var sp = 90 + Math.random() * 210;
      addParticle({
        kind: "spark", x: x, y: y, px: x, py: y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 40,
        g: 300, life: .65 + Math.random() * .5, age: 0,
        size: 1.8 + Math.random() * 1.8,
        color: golds[i % golds.length]
      });
    }
    for (var k = 0; k < 10; k++) {
      var a2 = Math.random() * TWO_PI;
      var s2 = 200 + Math.random() * 130;
      addParticle({
        kind: "spark", x: x, y: y, px: x, py: y,
        vx: Math.cos(a2) * s2,
        vy: Math.sin(a2) * s2,
        g: 260, life: .35 + Math.random() * .25, age: 0,
        size: 1.4, color: "#ffffff"
      });
    }
  }

  function addFloat(x, y, text, color, size, big) {
    floats.push({
      x: x, y: y, text: text, color: color,
      size: size || 16, big: !!big, born: performance.now(), dur: 950
    });
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.age += dt;
      if (p.age >= p.life) { particles.splice(i, 1); continue; }
      if (p.kind === "ring") { continue; }
      p.px = p.x; p.py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.g || 0) * dt;
      p.vx *= (1 - 1.2 * dt);
      if (p.kind === "leaf") {
        p.x += Math.sin((p.age + i) * 5) * 18 * dt;
        p.rot += p.vr * dt;
      }
    }
    var now = performance.now();
    for (var j = floats.length - 1; j >= 0; j--) {
      if (now - floats[j].born > floats[j].dur) { floats.splice(j, 1); }
    }
  }

  /* ============== 放置动作与动画时间线（rAF 驱动） ============== */

  function startFx(res) {
    var now = performance.now();
    var steps = res.steps.map(function (st, i) {
      return {
        from: st.from, result: st.result, gain: st.gain,
        at: now + SPAWN_MS + i * STEP_GAP, fired: false
      };
    });
    fx = {
      idx: res.idx,
      base: res.base,
      start: now,
      steps: steps,
      endAt: steps.length ? steps[steps.length - 1].at + BOUNCE_MS + 120 : now + SPAWN_MS + 120
    };
    var pc = cellCenter(res.idx);   // 放置固定 +1 的小飘分
    addFloat(pc.x - pitch * .22, pc.y + pitch * .22, "+1", "rgba(238,240,255,.7)", 12);
    syncButtons();
  }

  function doPlace(idx) {
    if (!started || state.over || fx || idx < 0) { return; }
    if (state.grid[idx] !== EMPTY) { return; }
    var res = place(state, idx);
    if (!res.ok) { return; }
    saveBest();
    startFx(res);
    syncHud();
  }

  // 推进时间线：到点触发合成粒子、飘分与连锁提示
  function updateFx(now) {
    if (!fx) { return; }
    for (var i = 0; i < fx.steps.length; i++) {
      var st = fx.steps[i];
      if (!st.fired && now >= st.at) {
        st.fired = true;
        var pc = cellCenter(fx.idx);
        spawnMergeFx(st.result, pc.x, pc.y, now);
        addFloat(pc.x, pc.y - pitch * .12, "+" + st.gain,
          LEVEL_COLORS[st.result], st.result >= 4 ? 22 : 18, st.result >= 3);
        if (i === fx.steps.length - 1 && fx.steps.length >= 2) {
          addFloat(pc.x, pc.y - pitch * .42, fx.steps.length + " 连锁！", "#ff5ca8", 20, true);
        }
      }
    }
    for (var j = timed.length - 1; j >= 0; j--) {
      if (now >= timed[j].at) {
        var task = timed[j];
        timed.splice(j, 1);
        task.fn();
      }
    }
    if (now >= fx.endAt) {
      fx = null;
      syncButtons();
      if (state.over) { showOver(); }
    }
  }
  /* ===================== HUD 与按钮 ===================== */

  function syncHud() {
    scoreValue.textContent = String(state.score);
    bestValue.textContent = String(best);
    spaceValue.textContent = String(emptyCount(state));
    undoCount.textContent = String(state.undoLeft);
    refreshCount.textContent = String(state.refreshLeft);
    syncButtons();
  }

  function syncButtons() {
    undoBtn.disabled = !started || state.over || !!fx ||
      state.undoLeft <= 0 || state.history.length === 0;
    refreshBtn.disabled = !started || state.over || !!fx || state.refreshLeft <= 0;
    newBtn.disabled = !!fx;
  }

  // 按钮防连点：动作后留短暂冷却
  function cooldown(btn, ms) {
    btn.disabled = true;
    setTimeout(function () { syncButtons(); }, ms);
  }

  function newGame() {
    state = createState(makeRng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0));
    started = true;
    fx = null;
    particles.length = 0;
    floats.length = 0;
    timed.length = 0;
    hoverIdx = -1;
    startOverlay.classList.add("hidden");
    overOverlay.classList.add("hidden");
    syncHud();
  }

  function showOver() {
    finalScore.textContent = String(state.score);
    finalBest.textContent = String(best);
    finalLevel.textContent = LEVEL_NAMES[state.bestLevel];
    overOverlay.classList.remove("hidden");
    syncButtons();
  }

  undoBtn.addEventListener("click", function () {
    if (!started || state.over || fx) { return; }
    if (!undo(state)) { return; }
    particles.length = 0;
    floats.length = 0;
    timed.length = 0;
    syncHud();
    cooldown(undoBtn, 250);
  });

  refreshBtn.addEventListener("click", function () {
    if (!started || state.over || fx) { return; }
    if (!refresh(state)) { return; }
    syncHud();
    cooldown(refreshBtn, 250);
  });

  newBtn.addEventListener("click", function () { if (!fx) { newGame(); } });
  startBtn.addEventListener("click", newGame);
  retryBtn.addEventListener("click", newGame);

  /* ---------- 鼠标 / 触屏输入 ---------- */
  boardCanvas.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") { hoverIdx = -1; return; }
    hoverIdx = pickCell(e.clientX, e.clientY);
  });
  boardCanvas.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    hoverIdx = -1;
    doPlace(pickCell(e.clientX, e.clientY));
  });
  boardCanvas.addEventListener("pointerleave", function () { hoverIdx = -1; });
  boardCanvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", function () { setTimeout(resize, 200); });

  /* ===================== 棋盘渲染 ===================== */

  function drawCells(now) {
    var gap = pitch * .08;
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        var x = pad + c * pitch + gap / 2;
        var y = pad + r * pitch + gap / 2;
        var s = pitch - gap;
        rr(g2, x, y, s, s, pitch * .14);
        g2.fillStyle = "rgba(255,255,255,.035)";
        g2.fill();
        g2.strokeStyle = "rgba(255,255,255,.07)";
        g2.lineWidth = 1;
        g2.stroke();
      }
    }

    // 鼠标悬停空格：半透明预告当前持有地块
    if (started && !state.over && !fx && hoverIdx >= 0 && state.grid[hoverIdx] === EMPTY) {
      var pc = cellCenter(hoverIdx);
      rr(g2, pc.x - (pitch - gap) / 2, pc.y - (pitch - gap) / 2, pitch - gap, pitch - gap, pitch * .14);
      g2.strokeStyle = "rgba(34,211,238,.7)";
      g2.lineWidth = 1.6;
      g2.stroke();
      drawBuildingAt(g2, state.queue[0], pc.x, pc.y, pitch * .32, now, 1, .35);
    }
  }

  // 连锁路径高亮（被合成格 → 放置格）
  function drawConnectors(now) {
    if (!fx) { return; }
    var target = cellCenter(fx.idx);
    for (var i = 0; i < fx.steps.length; i++) {
      var st = fx.steps[i];
      var t0 = st.at - FLY_MS;
      var t1 = st.at + 380;
      if (now < t0 || now > t1) { continue; }
      var from = cellCenter(st.from);
      var dx = target.x - from.x;
      var dy = target.y - from.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / len, uy = dy / len;

      var fadeIn = Math.min(1, (now - t0) / 90);
      var fadeOut = Math.min(1, (t1 - now) / 260);
      var alpha = Math.max(0, Math.min(fadeIn, fadeOut));
      var col = CHAIN_PATH_COLORS[i % CHAIN_PATH_COLORS.length];

      g2.save();
      g2.globalAlpha = alpha;
      g2.strokeStyle = col;
      g2.lineWidth = 4;
      g2.lineCap = "round";
      g2.shadowColor = col;
      g2.shadowBlur = 12;
      g2.setLineDash([9, 8]);
      g2.lineDashOffset = -now / 24;
      g2.beginPath();
      g2.moveTo(from.x + ux * pitch * .2, from.y + uy * pitch * .2);
      g2.lineTo(target.x - ux * pitch * .24, target.y - uy * pitch * .24);
      g2.stroke();
      g2.setLineDash([]);

      var ang = Math.atan2(dy, dx);
      var mx = (from.x + target.x) / 2;
      var my = (from.y + target.y) / 2;
      g2.translate(mx, my);
      g2.rotate(ang);
      g2.beginPath();
      g2.moveTo(7, 0);
      g2.lineTo(-5, -6);
      g2.lineTo(-5, 6);
      g2.closePath();
      g2.fillStyle = col;
      g2.fill();
      g2.restore();

      g2.save();
      g2.globalAlpha = alpha * .8;
      g2.strokeStyle = col;
      g2.lineWidth = 2;
      g2.beginPath();
      g2.arc(target.x, target.y, pitch * .34 + Math.sin((now - st.at) / 90) * 2.5, 0, TWO_PI);
      g2.stroke();
      g2.restore();
    }
  }

  // 出场回弹缓动
  function easeOutBack(x) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  function drawBoard(now) {
    g2.clearRect(0, 0, boardSize, boardSize);
    drawCells(now);
    drawConnectors(now);

    var targetIdx = fx ? fx.idx : -1;
    var R = pitch * .33;

    // 普通建筑；已被逻辑消耗但动画尚未轮到的邻格也要照常显示
    for (var i = 0; i < CELLS; i++) {
      if (i === targetIdx) { continue; }
      var pendingLevel = -1;
      if (fx) {
        for (var k = 0; k < fx.steps.length; k++) {
          if (fx.steps[k].from === i && now < fx.steps[k].at - FLY_MS) {
            pendingLevel = fx.steps[k].result - 1;
            break;
          }
        }
      }
      var lvl = state.grid[i] !== EMPTY ? state.grid[i] : pendingLevel;
      if (lvl !== -1) {
        var pc = cellCenter(i);
        drawBuildingAt(g2, lvl, pc.x, pc.y, R, now);
      }
    }

    if (fx) {
      var center = cellCenter(fx.idx);

      // 飞行中的被合成地块：从邻格飞向放置格，缩小并淡出
      for (var m = 0; m < fx.steps.length; m++) {
        var st2 = fx.steps[m];
        var q = (now - (st2.at - FLY_MS)) / (FLY_MS + 50);
        if (q < 0 || q > 1) { continue; }
        var src = cellCenter(st2.from);
        var flyX = src.x + (center.x - src.x) * q;
        var flyY = src.y + (center.y - src.y) * q - Math.sin(q * Math.PI) * pitch * .12;
        drawBuildingAt(g2, st2.result - 1, flyX, flyY, R, now, 1 - q * .85, 1 - q * .4);
      }

      // 放置格：等级随连锁推进，带出场回弹与逐级弹跳
      var levelNow = fx.base;
      for (var n = 0; n < fx.steps.length; n++) {
        if (now >= fx.steps[n].at) { levelNow = fx.steps[n].result; }
      }
      var scale = 1;
      var spawnQ = Math.min(1, (now - fx.start) / SPAWN_MS);
      if (spawnQ < 0) { scale = 0; }
      else if (spawnQ < 1) { scale = Math.max(0, easeOutBack(spawnQ)); }
      for (var n2 = fx.steps.length - 1; n2 >= 0; n2--) {
        if (now >= fx.steps[n2].at) {
          var bp = Math.min(1, (now - fx.steps[n2].at) / BOUNCE_MS);
          scale *= 1 + .28 * Math.sin(bp * Math.PI);
          break;
        }
      }
      drawBuildingAt(g2, levelNow, center.x, center.y, R, now, scale, 1);
    }
  }

  /* ===================== 粒子 / 飘分渲染 ===================== */

  function drawParticles() {
    var now = performance.now();
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var t = p.age / p.life;
      if (p.kind === "ring") {
        var e = 1 - Math.pow(1 - Math.min(1, t), 3);
        g2.save();
        g2.globalAlpha = (1 - t) * .9;
        g2.strokeStyle = p.color;
        g2.lineWidth = 1 + 3 * (1 - t);
        g2.shadowColor = p.color;
        g2.shadowBlur = 14;
        g2.beginPath();
        g2.arc(p.x, p.y, 8 + (p.r1 - 8) * e, 0, TWO_PI);
        g2.stroke();
        g2.restore();
      } else if (p.kind === "leaf") {
        g2.save();
        g2.globalAlpha = 1 - t * .6;
        g2.translate(p.x, p.y);
        g2.rotate(p.rot);
        g2.beginPath();
        g2.ellipse(0, 0, p.size * .7, p.size, 0, 0, TWO_PI);
        g2.fillStyle = p.color;
        g2.fill();
        g2.restore();
      } else if (p.kind === "spark") {
        g2.save();
        g2.globalAlpha = Math.max(0, 1 - t);
        g2.strokeStyle = p.color;
        g2.lineWidth = p.size;
        g2.lineCap = "round";
        g2.shadowColor = p.color;
        g2.shadowBlur = 8;
        g2.beginPath();
        g2.moveTo(p.px, p.py);
        g2.lineTo(p.x, p.y);
        g2.stroke();
        g2.restore();
      } else {
        g2.save();
        g2.globalAlpha = Math.max(0, 1 - t);
        g2.fillStyle = p.color;
        g2.shadowColor = p.color;
        g2.shadowBlur = 8;
        g2.beginPath();
        g2.arc(p.x, p.y, p.size * (1 - t * .3), 0, TWO_PI);
        g2.fill();
        g2.restore();
      }
    }

    for (var j = 0; j < floats.length; j++) {
      var f = floats[j];
      var ft = (now - f.born) / f.dur;
      if (ft < 0 || ft > 1) { continue; }
      var fy = f.y - ft * 42;
      var pop = ft < .14 ? easeOutBack(ft / .14) : 1;
      g2.save();
      g2.globalAlpha = ft < .7 ? 1 : 1 - (ft - .7) / .3;
      g2.translate(f.x, fy);
      g2.scale(pop, pop);
      g2.font = "700 " + f.size + "px system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif";
      g2.textAlign = "center";
      g2.textBaseline = "middle";
      g2.lineWidth = 3;
      g2.strokeStyle = "rgba(10,12,32,.7)";
      g2.strokeText(f.text, 0, 0);
      g2.fillStyle = f.color;
      g2.fillText(f.text, 0, 0);
      g2.restore();
    }
  }

  /* ===================== 持有栏小画布 ===================== */

  function renderSlots(now) {
    for (var i = 0; i < QUEUE_LEN; i++) {
      var cv = slotCanvas[i];
      var cx = slotCtx[i];
      var lvl = state.queue[i];
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.clearRect(0, 0, cv.width, cv.height);
      var radius = i === 0 ? cv.width * .31 : cv.width * .29;
      drawBuildingAt(cx, lvl, cv.width / 2, cv.height * .55, radius, now);
      slotName[i].textContent = LEVEL_NAMES[lvl];
      slotName[i].style.color = i === 0 ? "#22d3ee" : LEVEL_COLORS[lvl];
    }
  }

  /* ===================== 主循环（rAF，状态与动画分离） ===================== */

  var lastNow = 0;
  function frame(now) {
    var dt = lastNow ? Math.min(.05, (now - lastNow) / 1000) : 0;
    lastNow = now;
    updateFx(now);
    updateParticles(dt);
    drawBoard(now);
    drawParticles();
    renderSlots(now);
    requestAnimationFrame(frame);
  }

  resize();
  syncHud();
  requestAnimationFrame(frame);
})();