/* ============================================================
   合成猫咪 —— 游戏逻辑（Canvas 2D，零依赖）
   规则同 2048：滑动、同级合并，一次移动每块最多合并一次
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- 常量配置 ---------------- */

  var SIZE = 4;                 // 棋盘 4x4
  var SLIDE_MS = 130;           // 滑动动画时长
  var POP_MS = 210;             // 合成弹跳时长
  var APPEAR_MS = 190;          // 新猫咪出现时长
  var UNDO_MAX = 5;             // 撤销步数上限
  var BEST_KEY = 'best_merge-cats';
  var UNLOCK_KEY = 'unlocked_merge-cats';
  var SWIPE_MIN = 24;           // 触屏滑动判定距离（像素）
  var FONT_FAMILY = 'system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif';

  // 十个等级：中文名 + 毛色 / 暗部 / 耳朵 / 眼睛 / 胡须等配色
  var CAT_DEFS = [
    { name: '奶猫', fur: '#f7e0c4', dark: '#dabf95', ear: '#eccfa6', eye: '#6b4f35', whisker: 'rgba(150,120,90,.45)', tint: '#93a8dd' },
    { name: '狸花', fur: '#c7a37e', dark: '#8d6d4c', ear: '#a87f5b', eye: '#4a3826', whisker: 'rgba(255,255,255,.55)', tint: '#b08d66', stripe: '#74563a' },
    { name: '橘猫', fur: '#f3a648', dark: '#d9822b', ear: '#e08f33', eye: '#4a3826', whisker: 'rgba(255,255,255,.6)', tint: '#f0a14e', stripe: '#c0691c' },
    { name: '奶牛', fur: '#f5f1ea', dark: '#d8d0c2', ear: '#e7e0d5', eye: '#3a332e', whisker: 'rgba(120,100,85,.4)', tint: '#c9c2b6' },
    { name: '三花', fur: '#f7efe4', dark: '#ddcfba', ear: '#ecdcc4', eye: '#3a332e', whisker: 'rgba(120,100,85,.4)', tint: '#e88fa8' },
    { name: '蓝猫', fur: '#94a8c7', dark: '#6e84a6', ear: '#8094b6', eye: '#d98a3d', whisker: 'rgba(255,255,255,.55)', tint: '#7d97c9' },
    { name: '暹罗', fur: '#ecd8bb', dark: '#caa87d', ear: '#5b4636', eye: '#46b8ff', whisker: 'rgba(120,95,70,.4)', tint: '#a88768', mask: '#5b4636' },
    { name: '布偶', fur: '#f4e8d9', dark: '#d5bfa8', ear: '#b79a82', eye: '#4f9fff', whisker: 'rgba(120,95,70,.4)', tint: '#9db8e8', fluff: true },
    { name: '缅因', fur: '#ab7d52', dark: '#75502d', ear: '#8a5f39', eye: '#7fb069', whisker: 'rgba(255,255,255,.55)', tint: '#b07d4e', stripe: '#604022', mane: true },
    { name: '猫王', fur: '#ffe6a3', dark: '#e5b13c', ear: '#f2c64e', eye: '#7a4a16', whisker: 'rgba(255,255,255,.7)', tint: '#ffd24a', crown: true }
  ];

  // 粒子配色
  var PALETTE = ['#ff5ca8', '#22d3ee', '#ffb347', '#ffffff', '#b79cff'];

  /* ---------------- DOM 引用 ---------------- */

  var boardEl = document.getElementById('board');
  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('scoreValue');
  var bestEl = document.getElementById('bestValue');
  var scoreBox = document.getElementById('scoreBox');
  var undoBtn = document.getElementById('undoBtn');
  var startOverlay = document.getElementById('startOverlay');
  var winOverlay = document.getElementById('winOverlay');
  var overOverlay = document.getElementById('overOverlay');
  var finalScoreEl = document.getElementById('finalScore');
  var finalCatEl = document.getElementById('finalCat');
  var codexMask = document.getElementById('codexMask');
  var codexGrid = document.getElementById('codexGrid');
  var codexSub = document.getElementById('codexSub');
  var logoCanvas = document.getElementById('logoCanvas');

  /* ---------------- 游戏状态 ---------------- */

  var board = [];               // 4x4 格子，存放逻辑猫咪引用
  var tiles = [];               // 全部渲染猫咪（含动画中即将消失的）
  var nextId = 1;
  var score = 0;
  var best = 0;
  var maxLevel = 1;
  var started = false;
  var won = false;
  var over = false;
  var paused = false;           // 通关遮罩展示期间暂停
  var lock = false;             // 动画播放期间锁定输入
  var anim = null;              // 当前动画阶段描述
  var fx = null;                // 定时特效（烟花 / 遮罩延迟）
  var particles = [];           // 爱心与星星粒子
  var history = [];             // 撤销快照
  var unlocked = [];            // 图鉴解锁情况
  var metrics = { css: 0, gap: 0, cell: 0 };
  var lastFrame = 0;

  /* ---------------- 工具函数 ---------------- */

  // 读取本地存储（file:// 下异常时静默降级）
  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, val) {
    try { window.localStorage.setItem(key, val); } catch (e) { /* 忽略写入失败 */ }
  }

  function emptyGrid() {
    var g = new Array(SIZE);
    for (var r = 0; r < SIZE; r++) {
      g[r] = [null, null, null, null];
    }
    return g;
  }

  // 圆角矩形路径
  function roundRect(c, x, y, w, h, rad) {
    var rr = Math.min(rad, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  // #rrggbb + 透明度转 rgba
  function hexA(hex, alpha) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function easeInOutQuad(p) {
    return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  }
  function easeOutBack(p) {
    var c1 = 1.6, c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  }

  function randomInt(n) { return Math.floor(Math.random() * n); }

  /* ---------------- 猫咪对象 ---------------- */

  function makeTile(lv, r, c) {
    return {
      id: nextId++,
      lv: lv,
      r: r, c: c,       // 目标格子
      x: c, y: r,       // 当前渲染位置（格坐标，可为小数）
      sx: c, sy: r,     // 滑动起点
      scale: 1,
      tMode: null,      // 'pop' 合成弹跳 / 'appear' 新猫出现
      t0: 0,
      dying: false      // 本次滑动后移除（被合成的两只）
    };
  }

  function listEmptyCells() {
    var cells = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (!board[r][c]) cells.push({ r: r, c: c });
      }
    }
    return cells;
  }

  function spawnRandom(now) {
    var cells = listEmptyCells();
    if (!cells.length) return null;
    var pos = cells[randomInt(cells.length)];
    var t = makeTile(1, pos.r, pos.c);
    if (now !== undefined) { t.tMode = 'appear'; t.t0 = now; }
    board[pos.r][pos.c] = t;
    tiles.push(t);
    return t;
  }

  /* ---------------- 新游戏 / 撤销 ---------------- */

  function newGame() {
    board = emptyGrid();
    tiles = [];
    score = 0;
    maxLevel = 1;
    won = false;
    over = false;
    paused = false;
    lock = false;
    anim = null;
    fx = null;
    particles = [];
    history = [];
    spawnRandom();
    spawnRandom();
    markUnlocked(1);
    hideAllOverlays();
    refreshHUD();
    refreshCodex();
  }

  function pushHistory() {
    var snap = { grid: [], score: score };
    for (var r = 0; r < SIZE; r++) {
      snap.grid[r] = [];
      for (var c = 0; c < SIZE; c++) {
        var t = board[r][c];
        snap.grid[r][c] = t ? t.lv : 0;
      }
    }
    history.push(snap);
    if (history.length > UNDO_MAX) history.shift();
  }

  function undo() {
    if (lock || !history.length) return;
    var snap = history.pop();
    board = emptyGrid();
    tiles = [];
    particles = [];
    anim = null;
    fx = null;
    over = false;
    paused = false;
    score = snap.score;
    maxLevel = 1;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var lv = snap.grid[r][c];
        if (lv) {
          var t = makeTile(lv, r, c);
          board[r][c] = t;
          tiles.push(t);
          if (lv > maxLevel) maxLevel = lv;
        }
      }
    }
    hideAllOverlays();
    refreshHUD();
  }

  /* ---------------- 合并核心逻辑（2048 规则） ---------------- */

  // 方向：up / down / left / right，返回本次移动的全部动作
  function computeMove(dir) {
    var dr = 0, dc = 0;
    if (dir === 'up') dr = -1;
    else if (dir === 'down') dr = 1;
    else if (dir === 'left') dc = -1;
    else dc = 1;

    var g = emptyGrid();
    var merged = [[false, false, false, false], [false, false, false, false],
                  [false, false, false, false], [false, false, false, false]];
    var merges = [];
    var moved = false;
    var gained = 0;

    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var t = board[r][c];
        if (t) g[r][c] = t;
      }
    }

    // 按滑动方向确定遍历顺序：靠近目标边的行 / 列先处理
    for (var k = 0; k < SIZE * SIZE; k++) {
      var rr, cc;
      if (dc !== 0) {
        rr = k >> 2;
        cc = dc === -1 ? (k & 3) : (3 - (k & 3));
      } else {
        cc = k >> 2;
        rr = dr === -1 ? (k & 3) : (3 - (k & 3));
      }
      var tile = g[rr][cc];
      if (!tile) continue;

      // 找到最远空格
      var nr = rr, nc = cc;
      while (true) {
        var ar = nr + dr, ac = nc + dc;
        if (ar < 0 || ar >= SIZE || ac < 0 || ac >= SIZE || g[ar][ac]) break;
        nr = ar; nc = ac;
      }
      // 再往前一格：若为同级且本步未参与合并，则合成
      var br = nr + dr, bc = nc + dc;
      var other = (br >= 0 && br < SIZE && bc >= 0 && bc < SIZE) ? g[br][bc] : null;

      if (other && other.lv === tile.lv && !merged[br][bc]) {
        var res = makeTile(tile.lv + 1, br, bc);
        res.scale = 0; // 滑动阶段不可见，滑动结束后弹跳登场
        merges.push({ mover: tile, target: other, result: res, r: br, c: bc });
        g[rr][cc] = null;
        g[br][bc] = res;
        merged[br][bc] = true;
        tile.r = br; tile.c = bc;
        tile.dying = true;
        other.dying = true;
        tiles.push(res);
        gained += Math.pow(2, res.lv);
        moved = true;
      } else if (nr !== rr || nc !== cc) {
        g[nr][nc] = tile;
        g[rr][cc] = null;
        tile.r = nr; tile.c = nc;
        moved = true;
      }
    }

    board = g;
    return { moved: moved, merges: merges, gained: gained };
  }

  function tryMove(dir) {
    if (!started || lock || over || paused) return;
    var result = computeMove(dir);
    if (!result.moved) return;

    pushHistory();

    // 记录每只猫咪的滑动起点
    for (var i = 0; i < tiles.length; i++) {
      tiles[i].sx = tiles[i].x;
      tiles[i].sy = tiles[i].y;
    }

    score += result.gained;
    if (score > best) {
      best = score;
      storageSet(BEST_KEY, String(best));
    }
    for (var m = 0; m < result.merges.length; m++) {
      markUnlocked(result.merges[m].result.lv);
    }
    if (result.gained > 0) floatScore(result.gained);
    scoreEl.classList.remove('bump');
    void scoreEl.offsetWidth;          // 重置分数跳动动画
    scoreEl.classList.add('bump');

    anim = { phase: 'slide', t0: performance.now(), dur: SLIDE_MS, merges: result.merges };
    lock = true;
    refreshHUD();
  }

  // 滑动结束：移除被合成猫咪、弹跳、补充奶猫、判定胜负
  function finalizeSlide(now) {
    var keep = [];
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      t.x = t.c; t.y = t.r;
      if (t.dying) continue;
      keep.push(t);
    }
    tiles = keep;

    var popPositions = [];
    for (var k = 0; k < anim.merges.length; k++) {
      var mt = anim.merges[k];
      mt.result.tMode = 'pop';
      mt.result.t0 = now;
      mt.result.scale = 0;
      popPositions.push({ r: mt.r, c: mt.c, lv: mt.result.lv });
      spawnMergeParticles(mt.c, mt.r, mt.result.lv);
      if (mt.result.lv > maxLevel) maxLevel = mt.result.lv;
    }

    spawnRandom(now);

    anim = { phase: 'post', t0: now, dur: POP_MS };
    fx = fx || { burstUntil: 0, nextBurst: 0, winAt: 0, endAt: 0 };

    // 猫王通关：放烟花并延迟弹出通关遮罩
    if (maxLevel >= CAT_DEFS.length && !won) {
      won = true;
      paused = true;
      fx.burstUntil = now + 1700;
      fx.nextBurst = now;
      fx.winAt = now + 750;
    }

    // 无可移动格则结束
    if (!canMove()) {
      over = true;
      fx.endAt = now + 320;
    }

    refreshHUD();
    refreshCodex();
  }

  // 判定是否还能移动：有空格或有同级相邻
  function canMove() {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var t = board[r][c];
        if (!t) return true;
        if (r + 1 < SIZE && board[r + 1][c] && board[r + 1][c].lv === t.lv) return true;
        if (c + 1 < SIZE && board[r][c + 1] && board[r][c + 1].lv === t.lv) return true;
      }
    }
    return false;
  }

  /* ---------------- 解锁与图鉴 ---------------- */

  function markUnlocked(lv) {
    if (!unlocked[lv]) {
      unlocked[lv] = true;
      var arr = [];
      for (var i = 1; i <= CAT_DEFS.length; i++) if (unlocked[i]) arr.push(i);
      storageSet(UNLOCK_KEY, JSON.stringify(arr));
    }
  }

  function loadUnlocked() {
    unlocked = [];
    var raw = storageGet(UNLOCK_KEY);
    if (raw) {
      try {
        var arr = JSON.parse(raw);
        for (var i = 0; i < arr.length; i++) unlocked[arr[i]] = true;
      } catch (e) { /* 数据损坏时视为全未解锁 */ }
    }
    if (!unlocked[1]) unlocked[1] = true;
  }

  function buildCodex() {
    codexGrid.innerHTML = '';
    for (var i = 0; i < CAT_DEFS.length; i++) {
      var lv = i + 1;
      var item = document.createElement('div');
      item.className = 'codex-item';

      var cv = document.createElement('canvas');
      cv.width = 128; cv.height = 128;
      cv.setAttribute('aria-hidden', 'true');
      item.appendChild(cv);

      var info = document.createElement('div');
      info.className = 'codex-info';
      var name = document.createElement('span');
      name.className = 'codex-name';
      var lvl = document.createElement('span');
      lvl.className = 'codex-level';
      lvl.textContent = 'Lv.' + lv;
      info.appendChild(name);
      info.appendChild(lvl);
      item.appendChild(info);

      codexGrid.appendChild(item);
      paintCodexItem(cv, lv, name);
    }
  }

  function paintCodexItem(cv, lv, nameEl) {
    var c = cv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var css = 64;
    cv.width = css * dpr;
    cv.height = css * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, css, css);
    var item = cv.parentNode;
    if (unlocked[lv]) {
      item.classList.add('unlocked');
      item.classList.remove('locked');
      nameEl.textContent = CAT_DEFS[lv - 1].name;
      var cy = lv === 10 ? 38 : 34;
      var rad = lv === 10 ? 19 : 21;
      drawCat(c, 32, cy, rad, lv, performance.now());
    } else {
      item.classList.add('locked');
      item.classList.remove('unlocked');
      nameEl.textContent = '？？？';
      drawSilhouette(c, 32, 32, 21);
    }
  }

  function refreshCodex() {
    var count = 0;
    for (var i = 1; i <= CAT_DEFS.length; i++) if (unlocked[i]) count++;
    codexSub.textContent = '已解锁 ' + count + ' / ' + CAT_DEFS.length;
    var items = codexGrid.children;
    for (var k = 0; k < items.length; k++) {
      var cv = items[k].querySelector('canvas');
      var nameEl = items[k].querySelector('.codex-name');
      paintCodexItem(cv, k + 1, nameEl);
    }
  }

  /* ---------------- 粒子（矢量爱心 / 星星 / 烟花） ---------------- */

  function spawnMergeParticles(cellCol, cellRow, lv) {
    var cx = metrics.gap + cellCol * (metrics.cell + metrics.gap) + metrics.cell / 2;
    var cy = metrics.gap + cellRow * (metrics.cell + metrics.gap) + metrics.cell / 2;
    var count = 7 + Math.min(lv, 5);
    for (var i = 0; i < count; i++) {
      var ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      var spd = 0.05 + Math.random() * 0.12;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.008,
        size: 4 + Math.random() * 3.5 + Math.min(lv, 6) * 0.25,
        life: 0, max: 620 + Math.random() * 260,
        shape: Math.random() < 0.55 ? 'heart' : 'star',
        color: PALETTE[randomInt(PALETTE.length)],
        grav: 0.00055
      });
    }
  }

  function spawnFirework(now) {
    var m = metrics;
    var cx = m.gap + Math.random() * (m.css - m.gap * 2);
    var cy = m.css * 0.3 + Math.random() * m.css * 0.4;
    var baseColor = PALETTE[randomInt(PALETTE.length)];
    for (var i = 0; i < 18; i++) {
      var ang = (Math.PI * 2 * i) / 18 + Math.random() * 0.2;
      var spd = 0.06 + Math.random() * 0.14;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.006,
        size: 4.5 + Math.random() * 4,
        life: 0, max: 800 + Math.random() * 400,
        shape: Math.random() < 0.5 ? 'star' : 'heart',
        color: Math.random() < 0.7 ? baseColor : PALETTE[randomInt(PALETTE.length)],
        grav: 0.00012
      });
    }
  }

  function updateParticles(dt, now) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life += dt;
      if (p.life >= p.max) { particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    if (fx && fx.burstUntil && now < fx.burstUntil && now >= fx.nextBurst) {
      spawnFirework(now);
      fx.nextBurst = now + 260;
    }
  }

  // 爱心路径（以原点为顶心）
  function heartPath(c, s) {
    c.beginPath();
    c.moveTo(0, s * 0.3);
    c.bezierCurveTo(0, 0, -s, 0, -s, s * 0.35);
    c.bezierCurveTo(-s, s * 0.72, -s * 0.5, s * 0.95, 0, s * 1.2);
    c.bezierCurveTo(s * 0.5, s * 0.95, s, s * 0.72, s, s * 0.35);
    c.bezierCurveTo(s, 0, 0, 0, 0, s * 0.3);
    c.closePath();
  }

  // 五角星路径
  function starPath(c, s) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 5;
      var rad = (i % 2 === 0) ? s : s * 0.45;
      var px = Math.cos(ang) * rad;
      var py = Math.sin(ang) * rad;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
  }

  // 四芒星装饰
  function sparklePath(c, s) {
    c.beginPath();
    c.moveTo(0, -s);
    c.lineTo(s * 0.24, -s * 0.24);
    c.lineTo(s, 0);
    c.lineTo(s * 0.24, s * 0.24);
    c.lineTo(0, s);
    c.lineTo(-s * 0.24, s * 0.24);
    c.lineTo(-s, 0);
    c.lineTo(-s * 0.24, -s * 0.24);
    c.closePath();
  }

  function drawParticles(now) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var alpha = 1 - p.life / p.max;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y - p.size * 0.2);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      if (p.shape === 'heart') heartPath(ctx, p.size);
      else starPath(ctx, p.size);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ---------------- Canvas 猫咪绘制 ---------------- */

  // 绘制一只猫。cx/cy 为脸中心，R 为脸半径（像素），lv 为 1~10 等级
  function drawCat(c, cx, cy, R, lv, now) {
    var d = CAT_DEFS[lv - 1];
    c.save();
    c.translate(cx, cy);

    // 缅因猫：头部周围的鬃毛（先画在脸下方）
    if (d.mane) {
      c.save();
      c.fillStyle = d.dark;
      c.beginPath();
      for (var i2 = 0; i2 <= 20; i2++) {
        var ang2 = Math.PI * 0.08 + (Math.PI * 0.84 * i2) / 20;
        var rad2 = (i2 % 2 === 0) ? 1.22 : 1.08;
        var px2 = Math.cos(ang2) * R * rad2;
        var py2 = Math.sin(ang2) * R * rad2 + R * 0.05;
        if (i2 === 0) c.moveTo(px2, py2); else c.lineTo(px2, py2);
      }
      for (var j2 = 20; j2 >= 0; j2--) {
        var ang3 = Math.PI * 0.08 + (Math.PI * 0.84 * j2) / 20;
        var px3 = Math.cos(ang3) * R * 0.92;
        var py3 = Math.sin(ang3) * R * 0.92 + R * 0.05;
        c.lineTo(px3, py3);
      }
      c.closePath();
      c.fill();
      c.restore();
    }

    // ---- 三角耳朵 ----
    drawEar(c, -1, R, d);
    drawEar(c, 1, R, d);

    // 缅因猫耳尖簇毛
    if (d.mane) {
      c.strokeStyle = d.dark;
      c.lineWidth = R * 0.08;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-R * 0.96, -R * 1.0);
      c.lineTo(-R * 1.08, -R * 1.32);
      c.moveTo(R * 0.96, -R * 1.0);
      c.lineTo(R * 1.08, -R * 1.32);
      c.stroke();
    }

    // ---- 圆脸 ----
    c.fillStyle = d.fur;
    c.strokeStyle = d.dark;
    c.lineWidth = R * 0.06;
    c.beginPath();
    c.arc(0, 0, R, 0, Math.PI * 2);
    c.fill();

    // 脸部花纹裁剪在脸内
    c.save();
    c.clip();

    // 狸花 / 橘猫 / 缅因：虎斑纹
    if (d.stripe) {
      c.strokeStyle = d.stripe;
      c.globalAlpha = 0.55;
      c.lineWidth = R * 0.09;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-R * 0.26, -R * 0.78); c.lineTo(-R * 0.2, -R * 0.42);
      c.moveTo(0, -R * 0.82); c.lineTo(0, -R * 0.4);
      c.moveTo(R * 0.26, -R * 0.78); c.lineTo(R * 0.2, -R * 0.42);
      c.moveTo(-R * 0.62, -R * 0.28); c.lineTo(-R * 0.9, -R * 0.12);
      c.moveTo(-R * 0.6, R * 0.04); c.lineTo(-R * 0.86, R * 0.14);
      c.moveTo(R * 0.62, -R * 0.28); c.lineTo(R * 0.9, -R * 0.12);
      c.moveTo(R * 0.6, R * 0.04); c.lineTo(R * 0.86, R * 0.14);
      c.stroke();
      c.globalAlpha = 1;
    }

    // 奶牛：黑白斑块
    if (lv === 4) {
      c.fillStyle = '#3c3742';
      c.beginPath(); c.arc(R * 0.52, -R * 0.58, R * 0.3, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(-R * 0.68, R * 0.32, R * 0.24, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(R * 0.18, R * 0.82, R * 0.2, 0, Math.PI * 2); c.fill();
    }

    // 三花：橘 + 黑斑块
    if (lv === 5) {
      c.fillStyle = '#e08a3c';
      c.beginPath(); c.arc(R * 0.55, -R * 0.52, R * 0.28, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(-R * 0.25, R * 0.78, R * 0.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#3c3742';
      c.beginPath(); c.arc(-R * 0.62, -R * 0.3, R * 0.22, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(R * 0.45, R * 0.55, R * 0.17, 0, Math.PI * 2); c.fill();
    }

    // 暹罗：深色面罩，中间留奶油色吻部
    if (d.mask) {
      c.fillStyle = d.mask;
      c.beginPath();
      c.ellipse(0, -R * 0.12, R * 0.74, R * 0.62, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = d.fur;
      c.beginPath();
      c.ellipse(0, R * 0.3, R * 0.3, R * 0.26, 0, 0, Math.PI * 2);
      c.fill();
    }

    c.restore();

    // 脸轮廓描边放在花纹之后
    c.beginPath();
    c.arc(0, 0, R, 0, Math.PI * 2);
    c.stroke();

    // 布偶：脸颊蓬松绒毛
    if (d.fluff) {
      c.fillStyle = d.fur;
      c.strokeStyle = d.dark;
      c.lineWidth = R * 0.04;
      c.beginPath(); c.arc(-R * 0.98, R * 0.18, R * 0.2, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.arc(R * 0.98, R * 0.18, R * 0.2, 0, Math.PI * 2); c.fill(); c.stroke();
    }

    // ---- 五官 ----
    // 眨眼周期：约每 3.4 秒眨一次
    var blink = ((now % 3400) > 3120) ? 0.18 : 1;

    if (lv === 1) {
      // 奶猫：稚嫩小圆眼
      c.fillStyle = d.eye;
      c.beginPath(); c.arc(-R * 0.32, -R * 0.06, R * 0.08, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(R * 0.32, -R * 0.06, R * 0.08, 0, Math.PI * 2); c.fill();
    } else if (lv === 10) {
      // 猫王：开心眯眯眼
      c.strokeStyle = '#7a4a16';
      c.lineWidth = R * 0.075;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(-R * 0.36, -R * 0.02, R * 0.14, Math.PI * 1.12, Math.PI * 1.88);
      c.stroke();
      c.beginPath();
      c.arc(R * 0.36, -R * 0.02, R * 0.14, Math.PI * 1.12, Math.PI * 1.88);
      c.stroke();
    } else {
      var almond = !!d.mask;
      var ex = R * 0.36, ey = -R * 0.1;
      var erx = R * (almond ? 0.16 : 0.13);
      var ery = R * (almond ? 0.11 : 0.15) * blink;
      c.fillStyle = d.eye;
      c.beginPath(); c.ellipse(-ex, ey, erx, ery, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(ex, ey, erx, ery, 0, 0, Math.PI * 2); c.fill();
      // 高光
      if (blink > 0.5) {
        c.fillStyle = 'rgba(255,255,255,.9)';
        c.beginPath(); c.arc(-ex - R * 0.04, ey - R * 0.05, R * 0.04, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(ex - R * 0.04, ey - R * 0.05, R * 0.04, 0, Math.PI * 2); c.fill();
      }
      // 缅因：威武浓眉
      if (d.mane) {
        c.strokeStyle = d.stripe;
        c.lineWidth = R * 0.08;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(-R * 0.56, -R * 0.32); c.lineTo(-R * 0.2, -R * 0.24);
        c.moveTo(R * 0.56, -R * 0.32); c.lineTo(R * 0.2, -R * 0.24);
        c.stroke();
      }
    }

    // 腮红（奶猫以上都有）
    if (lv >= 2) {
      c.fillStyle = 'rgba(255,120,160,.3)';
      c.beginPath(); c.ellipse(-R * 0.56, R * 0.18, R * 0.16, R * 0.1, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(R * 0.56, R * 0.18, R * 0.16, R * 0.1, 0, 0, Math.PI * 2); c.fill();
    }

    // 鼻子：小三角
    c.fillStyle = '#e58ca0';
    c.beginPath();
    c.moveTo(-R * 0.08, R * 0.1);
    c.lineTo(R * 0.08, R * 0.1);
    c.lineTo(0, R * 0.2);
    c.closePath();
    c.fill();

    // 嘴：人中 + 两道微笑弧线
    c.strokeStyle = 'rgba(90,60,50,.65)';
    c.lineWidth = R * 0.04;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(0, R * 0.2);
    c.lineTo(0, R * 0.28);
    c.arc(-R * 0.08, R * 0.28, R * 0.08, 0, Math.PI);
    c.moveTo(0, R * 0.28);
    c.arc(R * 0.08, R * 0.28, R * 0.08, 0, Math.PI);
    c.stroke();

    // 胡须：每侧三根
    c.strokeStyle = d.whisker;
    c.lineWidth = R * 0.032;
    c.beginPath();
    c.moveTo(-R * 0.2, R * 0.18); c.lineTo(-R * 0.82, R * 0.04);
    c.moveTo(-R * 0.2, R * 0.24); c.lineTo(-R * 0.84, R * 0.22);
    c.moveTo(-R * 0.2, R * 0.3); c.lineTo(-R * 0.78, R * 0.38);
    c.moveTo(R * 0.2, R * 0.18); c.lineTo(R * 0.82, R * 0.04);
    c.moveTo(R * 0.2, R * 0.24); c.lineTo(R * 0.84, R * 0.22);
    c.moveTo(R * 0.2, R * 0.3); c.lineTo(R * 0.78, R * 0.38);
    c.stroke();

    // 布偶 / 猫王：闪烁星光装饰
    if (lv >= 8) {
      var pulse = 0.65 + 0.35 * Math.sin(now / 260);
      c.fillStyle = lv === 10 ? '#fff2b0' : '#dff1ff';
      c.globalAlpha = pulse;
      drawSparkle(c, -R * 0.95, -R * 0.55, R * 0.13, now);
      drawSparkle(c, R * 0.98, -R * 0.3, R * 0.1, now * 1.3);
      drawSparkle(c, -R * 0.7, -R * 0.95, R * 0.09, now * 0.7);
      c.globalAlpha = 1;
    }

    // 猫王：金色王冠
    if (d.crown) drawCrown(c, R, now);

    c.restore();
  }

  function drawSparkle(c, x, y, s, now) {
    c.save();
    c.translate(x, y);
    c.rotate(Math.sin(now / 500) * 0.3);
    sparklePath(c, s);
    c.fill();
    c.restore();
  }

  // 单只三角耳（side：-1 左 / 1 右）
  function drawEar(c, side, R, d) {
    c.save();
    c.fillStyle = d.ear;
    c.strokeStyle = d.dark;
    c.lineWidth = R * 0.05;
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(side * R * 0.6, -R * 0.52);
    c.lineTo(side * R * 1.0, -R * 1.04);
    c.lineTo(side * R * 0.28, -R * 0.86);
    c.closePath();
    c.fill();
    c.stroke();
    // 内耳粉色
    c.fillStyle = 'rgba(240,150,175,.65)';
    c.beginPath();
    c.moveTo(side * R * 0.6, -R * 0.6);
    c.lineTo(side * R * 0.86, -R * 0.92);
    c.lineTo(side * R * 0.42, -R * 0.8);
    c.closePath();
    c.fill();
    c.restore();
  }

  // 王冠：金色冠身 + 三颗几何宝石
  function drawCrown(c, R, now) {
    c.save();
    c.translate(0, -R * 0.02);
    var glow = 10 + 4 * Math.sin(now / 240);
    c.shadowColor = '#ffd24a';
    c.shadowBlur = glow;

    // 冠身（三座尖峰）
    var grad = c.createLinearGradient(0, -R * 1.35, 0, -R * 0.85);
    grad.addColorStop(0, '#fff0a8');
    grad.addColorStop(1, '#f5a623');
    c.fillStyle = grad;
    c.strokeStyle = '#b9791a';
    c.lineWidth = R * 0.05;
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(-R * 0.62, -R * 0.9);
    c.lineTo(-R * 0.62, -R * 1.22);
    c.lineTo(-R * 0.3, -R * 1.02);
    c.lineTo(0, -R * 1.38);
    c.lineTo(R * 0.3, -R * 1.02);
    c.lineTo(R * 0.62, -R * 1.22);
    c.lineTo(R * 0.62, -R * 0.9);
    c.closePath();
    c.fill();
    c.stroke();

    // 冠带
    c.shadowBlur = 0;
    c.fillStyle = '#f5b73f';
    roundRect(c, -R * 0.62, -R * 0.98, R * 1.24, R * 0.2, R * 0.06);
    c.fill();
    c.stroke();

    // 宝石
    c.fillStyle = '#ff5ca8';
    c.beginPath(); c.arc(0, -R * 1.16, R * 0.08, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#22d3ee';
    c.beginPath(); c.arc(-R * 0.42, -R * 1.06, R * 0.06, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(R * 0.42, -R * 1.06, R * 0.06, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  // 图鉴中未解锁猫咪的暗色剪影 + 几何小锁
  function drawSilhouette(c, cx, cy, R) {
    c.save();
    c.translate(cx, cy);
    c.fillStyle = '#262a45';
    c.strokeStyle = 'rgba(255,255,255,.07)';
    c.lineWidth = R * 0.05;
    // 耳朵
    c.beginPath();
    c.moveTo(-R * 0.6, -R * 0.52);
    c.lineTo(-R * 1.0, -R * 1.0);
    c.lineTo(-R * 0.3, -R * 0.86);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(R * 0.6, -R * 0.52);
    c.lineTo(R * 1.0, -R * 1.0);
    c.lineTo(R * 0.3, -R * 0.86);
    c.closePath();
    c.fill();
    // 圆脸
    c.beginPath();
    c.arc(0, 0, R, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // 小锁：锁环
    c.strokeStyle = '#56609b';
    c.lineWidth = R * 0.1;
    c.beginPath();
    c.arc(0, -R * 0.06, R * 0.2, Math.PI, 0);
    c.stroke();
    // 锁身
    c.fillStyle = '#56609b';
    roundRect(c, -R * 0.26, -R * 0.06, R * 0.52, R * 0.4, R * 0.08);
    c.fill();
    c.restore();
  }

  /* ---------------- 棋盘渲染 ---------------- */

  function resizeCanvas() {
    var css = boardEl.clientWidth;
    if (!css) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(css * dpr);
    canvas.height = Math.round(css * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var gap = css * 0.026;
    metrics.css = css;
    metrics.gap = gap;
    metrics.cell = (css - gap * (SIZE + 1)) / SIZE;
  }

  function drawBoardCells() {
    var m = metrics;
    ctx.fillStyle = 'rgba(255,255,255,.045)';
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var x = m.gap + c * (m.cell + m.gap);
        var y = m.gap + r * (m.cell + m.gap);
        roundRect(ctx, x, y, m.cell, m.cell, m.cell * 0.14);
        ctx.fill();
      }
    }
  }

  function drawTile(tile, now) {
    var m = metrics;
    var x = m.gap + tile.x * (m.cell + m.gap);
    var y = m.gap + tile.y * (m.cell + m.gap);
    var def = CAT_DEFS[tile.lv - 1];

    ctx.save();
    ctx.translate(x + m.cell / 2, y + m.cell / 2);
    ctx.scale(tile.scale, tile.scale);
    ctx.translate(-(x + m.cell / 2), -(y + m.cell / 2));

    // 格子底板：随等级微微染色，高等级带辉光
    if (tile.lv >= 8) {
      ctx.shadowColor = def.tint;
      ctx.shadowBlur = tile.lv === 10 ? 22 : 12;
    }
    ctx.fillStyle = hexA(def.tint, 0.1 + tile.lv * 0.008);
    roundRect(ctx, x + m.cell * 0.02, y + m.cell * 0.02, m.cell * 0.96, m.cell * 0.96, m.cell * 0.13);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hexA(def.tint, 0.22);
    ctx.lineWidth = 1;
    ctx.stroke();

    // 猫咪：等级越高体型越大；猫王预留王冠空间
    var hasCrown = tile.lv === 10;
    var sizeMul = 0.8 + (tile.lv - 1) * 0.022;
    var faceR = m.cell * (hasCrown ? 0.25 : 0.285) * sizeMul;
    var faceCY = y + m.cell * (hasCrown ? 0.47 : 0.43);
    drawCat(ctx, x + m.cell / 2, faceCY, faceR, tile.lv, now);

    // 中文名牌
    var plateW = m.cell * 0.66;
    var plateH = m.cell * 0.17;
    var plateX = x + (m.cell - plateW) / 2;
    var plateY = y + m.cell * 0.78;
    ctx.fillStyle = 'rgba(12,14,32,.62)';
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 1;
    roundRect(ctx, plateX, plateY, plateW, plateH, plateH / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = tile.lv === 10 ? '#ffe9a8' : '#f2f4ff';
    ctx.font = '700 ' + (plateH * 0.62) + 'px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.name, x + m.cell / 2, plateY + plateH * 0.52);

    ctx.restore();
  }

  function render(now) {
    if (!metrics.css) return;
    ctx.clearRect(0, 0, metrics.css, metrics.css);
    drawBoardCells();

    var p = 1;
    if (anim && anim.phase === 'slide') {
      p = clamp((now - anim.t0) / anim.dur, 0, 1);
      p = easeInOutQuad(p);
    }

    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      if (anim && anim.phase === 'slide') {
        t.x = t.sx + (t.c - t.sx) * p;
        t.y = t.sy + (t.r - t.sy) * p;
      }
      // 弹跳 / 出现的缩放
      if (t.tMode === 'pop') {
        var pp = clamp((now - t.t0) / POP_MS, 0, 1);
        t.scale = pp < 0.55 ? 1.28 * (pp / 0.55) : 1.28 - 0.28 * ((pp - 0.55) / 0.45);
        if (pp >= 1) t.tMode = null;
      } else if (t.tMode === 'appear') {
        var ap = clamp((now - t.t0) / APPEAR_MS, 0, 1);
        t.scale = Math.min(1, easeOutBack(ap));
        if (ap >= 1) t.tMode = null;
      }
      if (t.scale > 0.01) drawTile(t, now);
    }

    drawParticles(now);
  }

  /* ---------------- 主循环 ---------------- */

  function frame(now) {
    var dt = lastFrame ? Math.min(now - lastFrame, 50) : 16;
    lastFrame = now;

    if (anim && anim.phase === 'slide' && now - anim.t0 >= anim.dur) {
      finalizeSlide(now);
    }
    if (anim && anim.phase === 'post' && now - anim.t0 >= anim.dur) {
      anim = null;
      lock = false;
      refreshHUD();
    }

    updateParticles(dt, now);

    // 延迟弹出的通关 / 结束遮罩
    if (fx) {
      if (fx.winAt && now >= fx.winAt) {
        fx.winAt = 0;
        winOverlay.classList.remove('hidden');
      }
      if (fx.endAt && now >= fx.endAt) {
        fx.endAt = 0;
        finalScoreEl.textContent = String(score);
        finalCatEl.textContent = CAT_DEFS[maxLevel - 1].name;
        overOverlay.classList.remove('hidden');
        document.getElementById('overUndoBtn').disabled = history.length === 0;
      }
    }

    render(now);
    requestAnimationFrame(frame);
  }

  /* ---------------- HUD 与遮罩 ---------------- */

  function refreshHUD() {
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);
    undoBtn.disabled = history.length === 0 || lock;
  }

  function floatScore(n) {
    var el = document.createElement('span');
    el.className = 'score-float';
    el.textContent = '+' + n;
    scoreBox.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 820);
  }

  function hideAllOverlays() {
    startOverlay.classList.add('hidden');
    winOverlay.classList.add('hidden');
    overOverlay.classList.add('hidden');
    paused = false;
  }

  function startGame() {
    started = true;
    hideAllOverlays();
  }

  function openCodex() {
    refreshCodex();
    codexMask.classList.remove('hidden');
  }
  function closeCodex() { codexMask.classList.add('hidden'); }

  /* ---------------- 输入：键盘 + 触屏滑动 ---------------- */

  var KEY_MAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right'
  };

  window.addEventListener('keydown', function (e) {
    if (!codexMask.classList.contains('hidden')) {
      if (e.key === 'Escape') closeCodex();
      return;
    }
    if (!started) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startGame(); }
      return;
    }
    var dir = KEY_MAP[e.key];
    if (dir) {
      e.preventDefault();
      tryMove(dir);
    }
  });

  var touchX = 0, touchY = 0, touching = false;

  boardEl.addEventListener('pointerdown', function (e) {
    if (!started || lock || over || paused) return;
    touching = true;
    touchX = e.clientX;
    touchY = e.clientY;
  });

  boardEl.addEventListener('pointerup', function (e) {
    if (!touching) return;
    touching = false;
    var dx = e.clientX - touchX;
    var dy = e.clientY - touchY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      tryMove(dx > 0 ? 'right' : 'left');
    } else {
      tryMove(dy > 0 ? 'down' : 'up');
    }
  });

  boardEl.addEventListener('pointercancel', function () { touching = false; });

  /* ---------------- 按钮绑定 ---------------- */

  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('startCodexBtn').addEventListener('click', openCodex);
  document.getElementById('codexBtn').addEventListener('click', openCodex);
  document.getElementById('codexClose').addEventListener('click', closeCodex);
  codexMask.addEventListener('click', function (e) {
    if (e.target === codexMask) closeCodex();
  });
  undoBtn.addEventListener('click', undo);
  document.getElementById('overUndoBtn').addEventListener('click', function () {
    undo();
    refreshHUD();
  });
  document.getElementById('newBtn').addEventListener('click', function () {
    started = true;
    newGame();
  });
  document.getElementById('retryBtn').addEventListener('click', function () {
    started = true;
    newGame();
  });
  document.getElementById('winNewBtn').addEventListener('click', function () {
    started = true;
    newGame();
  });
  document.getElementById('continueBtn').addEventListener('click', function () {
    winOverlay.classList.add('hidden');
    paused = false;
  });

  window.addEventListener('resize', resizeCanvas);

  /* ---------------- 启动 ---------------- */

  function drawLogo() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var c = logoCanvas.getContext('2d');
    logoCanvas.width = 104 * dpr;
    logoCanvas.height = 104 * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCat(c, 52, 56, 26, 10, performance.now());
  }

  best = parseInt(storageGet(BEST_KEY), 10) || 0;
  loadUnlocked();
  resizeCanvas();
  buildCodex();
  newGame();
  started = false;            // 先展示开始遮罩
  startOverlay.classList.remove('hidden');
  drawLogo();
  refreshHUD();
  requestAnimationFrame(frame);

})();
