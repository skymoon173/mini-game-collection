/*
 * 霓虹躲避 —— 纯 Canvas 2D 实现，零依赖
 * 包含：八方向惯性移动、四向涌入的霓虹方块、青色无敌道具、
 *       粒子拖尾 / 爆炸、屏幕震动、触屏虚拟摇杆、暂停与最高分记录。
 */
(function () {
  'use strict';

  // ==================== 常量与配色 ====================

  var COLOR = {
    primary: '#7c5cff',
    cyan: '#22d3ee',
    pink: '#ff5ca8',
    amber: '#ffb347'
  };
  var BLOCK_COLORS = [COLOR.pink, COLOR.amber, COLOR.primary];
  var BEST_KEY = 'best_dodge-blocks';

  // 玩家手感参数
  var ACCEL = 2500;          // 加速度（像素/秒²）
  var MAX_SPEED = 335;       // 最大移动速度
  var FRICTION = 0.025;      // 松开按键后的惯性衰减系数（每秒）
  var PLAYER_RADIUS = 11;    // 碰撞半径
  var INVINCIBLE_TIME = 2;   // 无敌持续秒数
  var JOY_MAX = 60;          // 虚拟摇杆最大半径

  // ==================== DOM 引用 ====================

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var stage = document.getElementById('stage');

  var hudTime = document.getElementById('hudTime');
  var hudBest = document.getElementById('hudBest');
  var hudLevel = document.getElementById('hudLevel');

  var startOverlay = document.getElementById('startOverlay');
  var pauseOverlay = document.getElementById('pauseOverlay');
  var overOverlay = document.getElementById('overOverlay');
  var pauseBtn = document.getElementById('pauseBtn');
  var pauseTime = document.getElementById('pauseTime');
  var finalTimeEl = document.getElementById('finalTime');
  var finalBestEl = document.getElementById('finalBest');
  var recordTip = document.getElementById('recordTip');

  // ==================== 运行时状态 ====================

  var W = 0;                 // 画布 CSS 像素宽
  var H = 0;                 // 画布 CSS 像素高
  var dpr = 1;               // 设备像素比

  // 游戏状态：menu 菜单 / playing 进行中 / paused 暂停 / over 结束
  var gameState = 'menu';

  var time = 0;              // 本次存活时间（秒）
  var level = 1;             // 当前难度等级
  var best = loadBest();     // 历史最高分
  var bestAtStart = best;    // 开局时的最高分（用于判断新纪录）
  var animT = 0;             // 不受暂停影响的视觉动画时钟

  var player = null;         // 玩家飞船
  var blocks = [];           // 敌方方块
  var powerup = null;        // 青色能量球
  var trail = [];            // 拖尾粒子
  var effects = [];          // 爆炸 / 拾取等特效粒子
  var dust = [];             // 背景漂浮微粒

  var spawnTimer = 0;        // 方块生成计时
  var powerTimer = 0;        // 道具生成计时
  var shakeTime = 0;         // 屏幕震动剩余时间
  var shakeMag = 0;          // 屏幕震动幅度

  var keys = Object.create(null); // 按下的按键
  var joy = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };

  var lastTs = 0;

  // 方块辉光精灵缓存（按 颜色+尺寸+像素比 缓存）
  var blockSpriteCache = new Map();

  // ==================== 工具函数 ====================

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  // #rrggbb 转 rgba 字符串
  function hexToRgba(hex, alpha) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  // 圆角矩形路径
  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function loadBest() {
    try {
      var v = parseFloat(localStorage.getItem(BEST_KEY));
      return isFinite(v) && v > 0 ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  function saveBest(v) {
    try {
      localStorage.setItem(BEST_KEY, String(v));
    } catch (e) {
      /* 隐私模式等场景下静默失败 */
    }
  }

  // ==================== 画布自适应 ====================

  function resize() {
    var rect = stage.getBoundingClientRect();
    W = Math.max(240, Math.floor(rect.width));
    H = Math.max(240, Math.floor(rect.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);

    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (player) {
      player.x = clamp(player.x, 20, W - 20);
      player.y = clamp(player.y, 20, H - 20);
    }
    initDust();
  }

  // ==================== 背景微粒 ====================

  function initDust() {
    var count = clamp(Math.round((W * H) / 16000), 30, 90);
    dust = [];
    for (var i = 0; i < count; i++) {
      dust.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: rand(0.6, 1.8),
        vx: rand(-7, 7),
        vy: rand(-9, 9),
        a: rand(0.08, 0.3)
      });
    }
  }

  function updateDust(dt) {
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.x < -4) d.x = W + 4;
      else if (d.x > W + 4) d.x = -4;
      if (d.y < -4) d.y = H + 4;
      else if (d.y > H + 4) d.y = -4;
    }
  }

  function drawDust() {
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      ctx.fillStyle = 'rgba(185,195,255,' + d.a + ')';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ==================== 游戏流程 ====================

  function resetGame() {
    time = 0;
    level = 1;
    blocks = [];
    powerup = null;
    trail = [];
    effects = [];
    spawnTimer = 0.8;
    powerTimer = 6;
    shakeTime = 0;
    shakeMag = 0;
    player = {
      x: W / 2,
      y: H / 2,
      vx: 0,
      vy: 0,
      facing: -Math.PI / 2,
      invincible: 0,
      trailAcc: 0
    };
  }

  function startGame() {
    bestAtStart = best;
    resetGame();
    gameState = 'playing';
    hideAllOverlays();
    pauseBtn.classList.remove('hidden');
    pauseBtn.textContent = '暂停';
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
    updateHud();
  }

  function pauseGame() {
    if (gameState !== 'playing') return;
    gameState = 'paused';
    joy.active = false;
    pauseTime.textContent = time.toFixed(1);
    pauseOverlay.classList.remove('hidden');
    pauseBtn.textContent = '继续';
  }

  function resumeGame() {
    if (gameState !== 'paused') return;
    gameState = 'playing';
    pauseOverlay.classList.add('hidden');
    pauseBtn.textContent = '暂停';
  }

  function gameOver() {
    gameState = 'over';
    joy.active = false;
    pauseBtn.classList.add('hidden');

    var isRecord = time > bestAtStart;
    if (isRecord) {
      best = time;
      saveBest(best);
    }

    finalTimeEl.textContent = time.toFixed(1);
    finalBestEl.textContent = best.toFixed(1);
    recordTip.classList.toggle('hidden', !isRecord);
    overOverlay.classList.remove('hidden');
    updateHud();
  }

  function hideAllOverlays() {
    startOverlay.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
    overOverlay.classList.add('hidden');
  }

  function addShake(duration, magnitude) {
    // 多次震动取较强者
    if (magnitude >= shakeMag) {
      shakeTime = duration;
      shakeMag = magnitude;
    }
  }

  // ==================== 难度曲线 ====================

  function spawnInterval() {
    return Math.max(0.22, 0.95 - time * 0.012);
  }

  function blockSpeed() {
    return Math.min(470, 125 + time * 4.6);
  }

  function blockSize() {
    return Math.max(17, 52 - time * 0.85);
  }

  function doubleSpawnChance() {
    return clamp((time - 25) / 55, 0, 0.6);
  }

  // ==================== 敌方方块 ====================

  function spawnBlock() {
    var edge = Math.floor(Math.random() * 4); // 0上 1下 2左 3右
    var size = clamp(blockSize() * rand(0.85, 1.15), 14, 64);
    var m = size + 8;
    var x, y, tx, ty;

    if (edge === 0) {        // 从上方涌入
      x = rand(0, W); y = -m;
      tx = clamp(x + rand(-W * 0.7, W * 0.7), W * 0.05, W * 0.95);
      ty = rand(H * 0.62, H + m);
    } else if (edge === 1) { // 从下方涌入
      x = rand(0, W); y = H + m;
      tx = clamp(x + rand(-W * 0.7, W * 0.7), W * 0.05, W * 0.95);
      ty = rand(-m, H * 0.38);
    } else if (edge === 2) { // 从左方涌入
      x = -m; y = rand(0, H);
      tx = rand(W * 0.62, W + m);
      ty = clamp(y + rand(-H * 0.7, H * 0.7), H * 0.05, H * 0.95);
    } else {                 // 从右方涌入
      x = W + m; y = rand(0, H);
      tx = rand(-m, W * 0.38);
      ty = clamp(y + rand(-H * 0.7, H * 0.7), H * 0.05, H * 0.95);
    }

    var ang = Math.atan2(ty - y, tx - x);
    var sp = blockSpeed() * rand(0.85, 1.18);

    blocks.push({
      x: x,
      y: y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      size: size,
      rot: rand(0, Math.PI * 2),
      vr: rand(-1.6, 1.6),
      color: BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)]
    });
  }

  // 取（必要时离屏生成）方块的霓虹辉光精灵
  function getBlockSprite(color, size) {
    var key = color + '|' + Math.round(size) + '|' + Math.round(dpr);
    var cached = blockSpriteCache.get(key);
    if (cached) return cached;

    var pad = 18;
    var drawW = size + pad * 2;
    var c = document.createElement('canvas');
    c.width = Math.ceil(drawW * dpr);
    c.height = Math.ceil(drawW * dpr);
    var g = c.getContext('2d');
    g.scale(dpr, dpr);

    var r = Math.max(4, size * 0.18);

    // 外层辉光 + 半透明填充
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.fillStyle = hexToRgba(color, 0.16);
    roundRectPath(g, pad, pad, size, size, r);
    g.fill();

    // 亮色描边
    g.shadowBlur = 0;
    g.lineWidth = 2;
    g.strokeStyle = hexToRgba(color, 0.95);
    roundRectPath(g, pad, pad, size, size, r);
    g.stroke();

    // 内部高光方框
    g.lineWidth = 1.4;
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    var inner = size * 0.18;
    var innerSize = size * 0.64;
    roundRectPath(g, pad + inner, pad + inner, innerSize, innerSize, r * 0.6);
    g.stroke();

    cached = { canvas: c, drawW: drawW };
    blockSpriteCache.set(key, cached);
    return cached;
  }

  function drawBlocks() {
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      var spr = getBlockSprite(b.color, b.size);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.drawImage(spr.canvas, -spr.drawW / 2, -spr.drawW / 2, spr.drawW, spr.drawW);
      ctx.restore();
    }
  }

  // ==================== 青色能量球 ====================

  function spawnPowerup() {
    var x = 0, y = 0, ok = false;
    // 尽量避开玩家出生点附近
    for (var i = 0; i < 12; i++) {
      x = rand(56, W - 56);
      y = rand(56, H - 56);
      if (!player || Math.hypot(x - player.x, y - player.y) > 170) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      x = rand(56, W - 56);
      y = rand(56, H - 56);
    }
    powerup = { x: x, y: y, r: 10, life: 8, t: 0 };
  }

  function drawPowerup() {
    if (!powerup) return;
    var p = powerup;
    var blink = p.life < 2 && Math.floor(animT * 6) % 2 === 0;
    var alpha = blink ? 0.35 : 1;
    var pulse = 1 + 0.16 * Math.sin(p.t * 6);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);

    // 外圈旋转虚线环
    ctx.rotate(animT * 1.6);
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = hexToRgba(COLOR.cyan, 0.7);
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 内核发光球
    ctx.rotate(-animT * 1.6);
    var rr = p.r * pulse;
    var grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rr + 4);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.45, COLOR.cyan);
    grad.addColorStop(1, hexToRgba(COLOR.cyan, 0));
    ctx.shadowColor = COLOR.cyan;
    ctx.shadowBlur = 22;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, rr + 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ==================== 粒子 ====================

  function spawnParticle(list, x, y, vx, vy, life, size, color) {
    if (list.length > 500) list.shift();
    list.push({ x: x, y: y, vx: vx, vy: vy, life: life, maxLife: life, size: size, color: color });
  }

  // 圆形爆发粒子
  function emitBurst(x, y, color, count, speed) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = rand(speed * 0.25, speed);
      var palette = Math.random() < 0.7 ? color : '#ffffff';
      spawnParticle(effects, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        rand(0.4, 1.05), rand(2, 5), palette);
    }
  }

  function updateParticleList(list, dt) {
    var drag = Math.pow(0.1, dt);
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        list.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
    }
  }

  function drawParticleList(list) {
    if (!list.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var k = p.life / p.maxLife;
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * k), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ==================== 玩家飞船 ====================

  function emitTrail(dt) {
    var speed = Math.hypot(player.vx, player.vy);
    if (speed < 60) return;

    player.trailAcc += dt;
    var step = 0.018;
    while (player.trailAcc >= step) {
      player.trailAcc -= step;
      var back = 12;
      var bx = player.x - Math.cos(player.facing) * back + rand(-2, 2);
      var by = player.y - Math.sin(player.facing) * back + rand(-2, 2);
      var color = Math.random() < 0.55 ? COLOR.cyan : COLOR.primary;
      spawnParticle(trail, bx, by,
        -player.vx * 0.12 + rand(-30, 30),
        -player.vy * 0.12 + rand(-30, 30),
        rand(0.25, 0.45), rand(2, 4.2), color);
    }
  }

  function drawPlayer() {
    var p = player;

    // 无敌气场
    if (p.invincible > 0) {
      var pulse = 0.5 + 0.5 * Math.sin(animT * 12);
      ctx.save();
      ctx.strokeStyle = hexToRgba(COLOR.cyan, 0.75);
      ctx.fillStyle = hexToRgba(COLOR.cyan, 0.07 + pulse * 0.08);
      ctx.lineWidth = 2;
      ctx.shadowColor = COLOR.cyan;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 23 + pulse * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 无敌期间机身闪烁
    if (p.invincible > 0 && Math.floor(animT * 14) % 2 === 0) return;

    var speed = Math.hypot(p.vx, p.vy);
    var bodyColor = p.invincible > 0 ? COLOR.cyan : COLOR.primary;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.facing);

    // 尾焰
    if (speed > 50) {
      var flame = 7 + Math.random() * 7;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var fg = ctx.createLinearGradient(-10, 0, -10 - flame - 6, 0);
      fg.addColorStop(0, hexToRgba(COLOR.cyan, 0.9));
      fg.addColorStop(1, hexToRgba(COLOR.cyan, 0));
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-9, -4.5);
      ctx.lineTo(-9 - flame - 6, 0);
      ctx.lineTo(-9, 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 机身（箭头飞船）
    ctx.shadowColor = bodyColor;
    ctx.shadowBlur = 20;
    ctx.fillStyle = hexToRgba(bodyColor, 0.32);
    ctx.strokeStyle = bodyColor === COLOR.cyan ? '#a8f2ff' : '#b9a5ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-11, -11);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-11, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 驾驶舱高光
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(3, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ==================== 虚拟摇杆 ====================

  function drawJoystick() {
    if (!joy.active) return;
    ctx.save();

    // 底盘
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(joy.ox, joy.oy, JOY_MAX, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 摇杆头
    var kx = joy.ox + joy.dx * JOY_MAX;
    var ky = joy.oy + joy.dy * JOY_MAX;
    ctx.shadowColor = COLOR.cyan;
    ctx.shadowBlur = 16;
    ctx.fillStyle = hexToRgba(COLOR.cyan, 0.85);
    ctx.beginPath();
    ctx.arc(kx, ky, 26, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ==================== 场景绘制 ====================

  function drawGrid() {
    var gap = 46;
    ctx.strokeStyle = 'rgba(124,92,255,0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = 0; x <= W; x += gap) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
    }
    for (var y = 0; y <= H; y += gap) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
    }
    ctx.stroke();

    // 场地内框
    ctx.strokeStyle = 'rgba(124,92,255,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    // 屏幕震动
    if (shakeTime > 0) {
      var k = shakeTime / 0.45;
      var mx = rand(-1, 1) * shakeMag * k;
      var my = rand(-1, 1) * shakeMag * k;
      ctx.translate(mx, my);
    }

    drawGrid();
    drawDust();
    drawPowerup();
    drawBlocks();
    drawParticleList(trail);
    if (player && (gameState === 'playing' || gameState === 'paused')) drawPlayer();
    drawParticleList(effects);
    drawJoystick();

    ctx.restore();
  }

  // ==================== HUD ====================

  function updateHud() {
    hudTime.textContent = time.toFixed(1);
    hudBest.textContent = best.toFixed(1);
    hudLevel.textContent = String(level);
  }

  // ==================== 主更新逻辑 ====================

  function update(dt) {
    time += dt;
    level = Math.floor(time / 12) + 1;

    // ---- 输入合成 ----
    var ix = 0, iy = 0;
    if (joy.active) {
      ix = joy.dx;
      iy = joy.dy;
      if (Math.hypot(ix, iy) < 0.12) {
        ix = 0; iy = 0;
      }
    } else {
      if (keys['ArrowLeft'] || keys['KeyA']) ix -= 1;
      if (keys['ArrowRight'] || keys['KeyD']) ix += 1;
      if (keys['ArrowUp'] || keys['KeyW']) iy -= 1;
      if (keys['ArrowDown'] || keys['KeyS']) iy += 1;
      var len = Math.hypot(ix, iy);
      if (len > 1) {
        ix /= len; iy /= len;
      }
    }

    // ---- 玩家移动（带轻微惯性）----
    var inputLen = Math.hypot(ix, iy);
    if (inputLen > 0) {
      player.vx += ix * ACCEL * dt;
      player.vy += iy * ACCEL * dt;
      var sp = Math.hypot(player.vx, player.vy);
      if (sp > MAX_SPEED) {
        player.vx = player.vx / sp * MAX_SPEED;
        player.vy = player.vy / sp * MAX_SPEED;
      }
    } else {
      var f = Math.pow(FRICTION, dt);
      player.vx *= f;
      player.vy *= f;
    }

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // 封闭场地边界碰撞
    var pad = 16;
    if (player.x < pad) { player.x = pad; player.vx = Math.abs(player.vx) * 0.3; }
    if (player.x > W - pad) { player.x = W - pad; player.vx = -Math.abs(player.vx) * 0.3; }
    if (player.y < pad) { player.y = pad; player.vy = Math.abs(player.vy) * 0.3; }
    if (player.y > H - pad) { player.y = H - pad; player.vy = -Math.abs(player.vy) * 0.3; }

    if (Math.hypot(player.vx, player.vy) > 25) {
      player.facing = Math.atan2(player.vy, player.vx);
    }

    if (player.invincible > 0) player.invincible = Math.max(0, player.invincible - dt);

    emitTrail(dt);

    // ---- 敌方方块生成 ----
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnBlock();
      if (Math.random() < doubleSpawnChance()) spawnBlock();
      spawnTimer = spawnInterval() * rand(0.8, 1.2);
    }

    // ---- 能量球生成 ----
    powerTimer -= dt;
    if (powerTimer <= 0) {
      if (!powerup) spawnPowerup();
      powerTimer = rand(10, 16);
    }

    // ---- 方块移动与碰撞 ----
    for (var i = blocks.length - 1; i >= 0; i--) {
      var b = blocks[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;

      // 完全离开场地后回收
      if (b.x < -90 || b.x > W + 90 || b.y < -90 || b.y > H + 90) {
        blocks.splice(i, 1);
        continue;
      }

      var dx = b.x - player.x;
      var dy = b.y - player.y;
      var rr = b.size * 0.42 + PLAYER_RADIUS;
      if (dx * dx + dy * dy < rr * rr) {
        if (player.invincible > 0) {
          // 无敌状态下撞碎方块
          emitBurst(b.x, b.y, b.color, 12, 230);
          blocks.splice(i, 1);
          addShake(0.1, 3.5);
        } else {
          emitBurst(player.x, player.y, COLOR.primary, 40, 360);
          emitBurst(player.x, player.y, COLOR.cyan, 24, 300);
          emitBurst(player.x, player.y, COLOR.pink, 18, 260);
          addShake(0.45, 14);
          gameOver();
          return;
        }
      }
    }

    // ---- 能量球更新与拾取 ----
    if (powerup) {
      powerup.t += dt;
      powerup.life -= dt;
      if (powerup.life <= 0) {
        powerup = null;
      } else {
        var pdx = powerup.x - player.x;
        var pdy = powerup.y - player.y;
        var pr = powerup.r + PLAYER_RADIUS + 4;
        if (pdx * pdx + pdy * pdy < pr * pr) {
          player.invincible = INVINCIBLE_TIME;
          emitBurst(powerup.x, powerup.y, COLOR.cyan, 20, 240);
          powerup = null;
          addShake(0.12, 4);
        }
      }
    }

    // ---- 粒子与震动 ----
    updateParticleList(trail, dt);
    updateParticleList(effects, dt);
    if (shakeTime > 0) shakeTime = Math.max(0, shakeTime - dt);

    updateHud();
  }

  // 结束状态下继续播放爆炸残留效果
  function updateOverEffects(dt) {
    updateParticleList(trail, dt);
    updateParticleList(effects, dt);
    if (shakeTime > 0) shakeTime = Math.max(0, shakeTime - dt);
  }

  // ==================== 主循环 ====================

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    // delta time，切后台回来时钳制防止大跳变
    var dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    animT += dt;

    updateDust(dt);

    if (gameState === 'playing') {
      update(dt);
    } else if (gameState === 'over') {
      updateOverEffects(dt);
    }

    render();
    requestAnimationFrame(loop);
  }

  // ==================== 键盘输入 ====================

  var MOVE_CODES = {
    ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1,
    KeyA: 1, KeyD: 1, KeyW: 1, KeyS: 1
  };

  window.addEventListener('keydown', function (e) {
    if (MOVE_CODES[e.code]) {
      keys[e.code] = true;
      e.preventDefault();
    } else if (e.code === 'Escape') {
      if (gameState === 'playing') pauseGame();
      else if (gameState === 'paused') resumeGame();
    } else if (e.code === 'Enter' || e.code === 'Space') {
      if (gameState === 'menu' || gameState === 'over') {
        startGame();
        e.preventDefault();
      }
    }
  });

  window.addEventListener('keyup', function (e) {
    if (MOVE_CODES[e.code]) {
      keys[e.code] = false;
      e.preventDefault();
    }
  });

  // ==================== 触屏虚拟摇杆 ====================

  function touchPos(t) {
    var rect = canvas.getBoundingClientRect();
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  canvas.addEventListener('touchstart', function (e) {
    if (gameState !== 'playing' || joy.active) return;
    var t = e.changedTouches[0];
    var pos = touchPos(t);
    joy.active = true;
    joy.id = t.identifier;
    joy.ox = pos.x;
    joy.oy = pos.y;
    joy.dx = 0;
    joy.dy = 0;
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', function (e) {
    if (!joy.active) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier !== joy.id) continue;
      var pos = touchPos(t);
      var dx = pos.x - joy.ox;
      var dy = pos.y - joy.oy;
      var len = Math.hypot(dx, dy);
      if (len > JOY_MAX) {
        dx = dx / len * JOY_MAX;
        dy = dy / len * JOY_MAX;
      }
      joy.dx = dx / JOY_MAX;
      joy.dy = dy / JOY_MAX;
    }
    e.preventDefault();
  }, { passive: false });

  function endTouch(e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joy.id) {
        joy.active = false;
        joy.id = -1;
        joy.dx = 0;
        joy.dy = 0;
      }
    }
  }
  canvas.addEventListener('touchend', endTouch, { passive: false });
  canvas.addEventListener('touchcancel', endTouch, { passive: false });

  // ==================== 按钮与生命周期 ====================

  document.getElementById('btnStart').addEventListener('click', startGame);
  document.getElementById('btnAgain').addEventListener('click', startGame);
  document.getElementById('btnResume').addEventListener('click', resumeGame);
  document.getElementById('btnRestart').addEventListener('click', startGame);
  pauseBtn.addEventListener('click', function () {
    if (gameState === 'playing') pauseGame();
    else if (gameState === 'paused') resumeGame();
  });

  // 页面失焦（切标签页 / 最小化）自动暂停
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && gameState === 'playing') pauseGame();
  });

  window.addEventListener('resize', resize);

  // ==================== 启动 ====================

  resize();
  hudBest.textContent = best.toFixed(1);
  requestAnimationFrame(loop);
})();
