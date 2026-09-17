/* ============================================================
 * 火柴人烈焰跑酷 —— 纯 Canvas 2D 横版无尽跑酷（零依赖）
 * 程序化火柴人 + 火焰粒子拖尾 + 昼夜视差城市
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- 界面元素 ---------- */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const elDist = document.getElementById('distVal');
  const elBest = document.getElementById('bestVal');
  const elCoin = document.getElementById('coinVal');
  const elLevel = document.getElementById('levelVal');
  const elPauseBtn = document.getElementById('pauseBtn');
  const startOverlay = document.getElementById('startOverlay');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const overOverlay = document.getElementById('overOverlay');
  const startBtn = document.getElementById('startBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const againBtn = document.getElementById('againBtn');
  const elFinalDist = document.getElementById('finalDist');
  const elFinalCoins = document.getElementById('finalCoins');
  const elFinalBest = document.getElementById('finalBest');
  const elRecordTip = document.getElementById('recordTip');

  /* ---------- 常量 ---------- */
  const BEST_KEY = 'best_stickman-runner'; // 最高分存档键
  const BASE_SPEED = 360;                  // 初始世界速度（像素/秒）
  const MAX_SPEED = 840;                   // 速度上限
  const SPEED_STEP = 60;                   // 每档提速
  const COINS_PER_LEVEL = 50;              // 每多少金币提升一档
  const GRAVITY = 2300;                    // 重力加速度
  const JUMP_V = 820;                      // 一段跳起跳速度
  const DOUBLE_JUMP_V = 740;               // 二段跳起跳速度
  const PX_TO_M = 0.08;                    // 像素折算米
  const DAY_PERIOD = 40;                   // 昼夜循环周期（秒，夜→黄昏→夜）
  const ATTRACT_SPEED = 210;               // 开始界面演示滚动速度

  /* ---------- 工具函数 ---------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  // 十六进制颜色转 RGB 数组
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // 两种颜色按 t 混合，返回 rgb 字符串
  function mixColor(a, b, t) {
    return 'rgb(' +
      Math.round(lerp(a[0], b[0], t)) + ',' +
      Math.round(lerp(a[1], b[1], t)) + ',' +
      Math.round(lerp(a[2], b[2], t)) + ')';
  }
  // 稳定伪随机（0~1），用于程序化剪影
  function hash(n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  // 圆角矩形路径
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // 矩形重叠判定
  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /* ---------- 昼夜调色板（0=夜色 1=黄昏） ---------- */
  const PAL = {
    night: {
      skyTop: hexToRgb('#141737'),
      skyMid: hexToRgb('#1b1e44'),
      skyHor: hexToRgb('#2e2656'),
      far: hexToRgb('#232352'),
      city: hexToRgb('#171938'),
      near: hexToRgb('#10132f'),
      ground: hexToRgb('#0e1128'),
      line: hexToRgb('#343a78')
    },
    dusk: {
      skyTop: hexToRgb('#2e2250'),
      skyMid: hexToRgb('#7a3f62'),
      skyHor: hexToRgb('#ff9a56'),
      far: hexToRgb('#5d365c'),
      city: hexToRgb('#3c2247'),
      near: hexToRgb('#2c1a3d'),
      ground: hexToRgb('#231538'),
      line: hexToRgb('#9a5266')
    }
  };

  /* ---------- 画布尺寸（自适应 + devicePixelRatio） ---------- */
  let W = 0;
  let H = 0;
  let S = 1;       // 纵向缩放系数
  let groundY = 0; // 地面线纵坐标

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, stage.clientWidth);
    H = Math.max(1, stage.clientHeight);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = clamp(H / 620, 0.78, 1.25);
    groundY = H - Math.max(56, H * 0.13);
    if (player.grounded) player.feetY = groundY;
  }

  /* ---------- 最高分存档 ---------- */
  let best = { distance: 0, coins: 0 };
  function loadBest() {
    try {
      const raw = localStorage.getItem(BEST_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        best = {
          distance: (o.distance | 0) || 0,
          coins: (o.coins | 0) || 0
        };
      }
    } catch (e) {
      best = { distance: 0, coins: 0 };
    }
  }
  function saveBest() {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(best));
    } catch (e) {
      /* 隐私模式等场景下静默失败 */
    }
  }

  /* ---------- 游戏状态 ---------- */
  // ready=开始演示 playing=进行中 paused=暂停 dying=死亡慢动作 over=结束
  let state = 'ready';
  let speed = BASE_SPEED;
  let distance = 0;
  let coinCount = 0;
  let level = 1;
  let dayTime = 0;        // 昼夜时间累计
  let animTime = 0;       // 全局动画时间（火焰闪烁等）
  let gapCounter = 700;   // 距下一个障碍生成的像素余量
  let deathT = 0;         // 死亡慢动作计时
  let shake = 0;          // 震屏剩余时间
  let fireAcc = 0;        // 火焰粒子累计器
  let nightF = 1;         // 当前夜色浓度（1=深夜 0=黄昏）

  // 视差滚动偏移
  const scroll = { far: 0, city: 0, near: 0, ground: 0 };

  const obstacles = []; // 障碍列表
  const coins = [];     // 金币列表
  const particles = []; // 粒子列表（火焰/火花/碎片）
  const floats = [];    // 浮动提示文字

  // 火柴人主角
  const player = {
    cx: 0,
    feetY: 0,
    vy: 0,
    grounded: true,
    jumps: 0,          // 已用跳跃次数
    sliding: false,
    slideHold: false,  // 键盘按住滑铲
    slideTimer: 0,     // 触屏触发的滑铲剩余时间
    runPhase: 0,
    airBlend: 0,       // 空中姿态混合度
    alive: true
  };

  // 星空（固定布局，随夜色淡入）
  const stars = [];
  for (let i = 0; i < 90; i++) {
    stars.push({
      fx: hash(i + 1),
      fy: hash(i + 100) * 0.72,
      r: 0.6 + hash(i + 200) * 1.4,
      tw: hash(i + 300) * Math.PI * 2
    });
  }

  /* ---------- 初始化 / 重置 ---------- */
  function resetGame() {
    speed = BASE_SPEED;
    distance = 0;
    coinCount = 0;
    level = 1;
    gapCounter = 700;
    deathT = 0;
    shake = 0;
    fireAcc = 0;
    obstacles.length = 0;
    coins.length = 0;
    particles.length = 0;
    floats.length = 0;
    player.feetY = groundY;
    player.vy = 0;
    player.grounded = true;
    player.jumps = 0;
    player.sliding = false;
    player.slideHold = false;
    player.slideTimer = 0;
    player.airBlend = 0;
    player.alive = true;
  }

  /* ---------- 跳跃 / 滑铲 ---------- */
  function jump() {
    if (!player.grounded && player.jumps >= 2) return;
    if (player.grounded) {
      player.vy = -JUMP_V;
      player.grounded = false;
      player.jumps = 1;
      burst(player.cx - 4 * S, player.feetY, 10, '#9db4ff', 130);
    } else {
      player.vy = -DOUBLE_JUMP_V;
      player.jumps = 2;
      // 二段跳喷射出更亮的火焰
      burst(player.cx - 4 * S, player.feetY - 8 * S, 16, '#7eeaff', 200);
    }
  }

  /* ---------- 障碍与金币生成 ---------- */
  function spawnObstacle() {
    const roll = Math.random();
    const x = W + 80;
    if (roll < 0.42) {
      // 矮砖块：跳过
      obstacles.push({
        type: 'brick',
        x: x,
        w: (30 + Math.random() * 16) * S,
        h: (34 + Math.random() * 18) * S,
        seed: Math.random() * 10
      });
    } else if (roll < 0.74) {
      // 高架障碍：滑铲穿过（吊牌下缘高于滑铲高度）
      obstacles.push({
        type: 'barrier',
        x: x,
        w: (58 + Math.random() * 34) * S,
        top: groundY - 74 * S,
        bottom: groundY - 48 * S,
        seed: Math.random() * 10
      });
    } else {
      // 火坑：更宽，必须提前起跳
      obstacles.push({
        type: 'pit',
        x: x,
        w: (72 + Math.random() * 38) * S,
        seed: Math.random() * 10
      });
    }
    // 间距随时速放大，保证至少约 1 秒的反应与操作窗口
    gapCounter = speed * (1.02 + Math.random() * 0.5);
    // 在本障碍与下一障碍之间安排金币串
    if (Math.random() < 0.72) spawnCoinPattern(x, obstacles[obstacles.length - 1]);
  }

  function spawnCoinPattern(originX, obs) {
    const midX = originX + gapCounter * 0.42;
    const kind = Math.random();
    if (obs.type === 'pit' || kind < 0.34) {
      // 高空抛物线串（引导致跃过火坑）
      const n = 6;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const px = midX - 90 * S + t * 180 * S;
        const py = groundY - (70 + Math.sin(t * Math.PI) * 92) * S;
        coins.push({ x: px, baseY: py, y: py, phase: Math.random() * 6 });
      }
    } else if (kind < 0.67) {
      // 地面低空串：奔跑即可拾取
      for (let i = 0; i < 6; i++) {
        const px = midX - 88 * S + i * 35 * S;
        const py = groundY - 40 * S;
        coins.push({ x: px, baseY: py, y: py, phase: Math.random() * 6 });
      }
    } else {
      // 高空直线串：需要跳跃拾取
      for (let i = 0; i < 5; i++) {
        const px = midX - 72 * S + i * 36 * S;
        const py = groundY - 128 * S;
        coins.push({ x: px, baseY: py, y: py, phase: Math.random() * 6 });
      }
    }
  }

  /* ---------- 碰撞盒（对火柴人收紧） ---------- */
  function playerBox() {
    if (player.sliding) {
      return { x: player.cx - 20 * S, y: player.feetY - 32 * S, w: 50 * S, h: 32 * S };
    }
    return { x: player.cx - 11 * S, y: player.feetY - 72 * S, w: 22 * S, h: 72 * S };
  }
  function obstacleBox(o) {
    if (o.type === 'brick') {
      return { x: o.x + 3, y: groundY - o.h + 3, w: o.w - 6, h: o.h - 3 };
    }
    // 高架吊牌
    return { x: o.x + 4, y: o.top + 3, w: o.w - 8, h: o.bottom - o.top - 6 };
  }
  // 脚底是否处于火坑开口内
  function footOverPit() {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (o.type === 'pit' && player.cx > o.x + 6 && player.cx < o.x + o.w - 6) return true;
    }
    return false;
  }

  /* ---------- 粒子 ---------- */
  // 通用粒子爆发
  function burst(x, y, n, color, power) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = power * (0.35 + Math.random() * 0.65);
      particles.push({
        kind: 'spark',
        x: x, y: y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
        size: 2 + Math.random() * 2.5,
        color: color
      });
    }
  }

  // 火焰拖尾粒子（橙红黄渐变，速度越快越旺）
  function emitFire(dt, scrollSpeed) {
    const rate = state === 'ready' ? 26 : 32 + speed * 0.07;
    fireAcc += dt * rate;
    const lowY = player.sliding ? 8 : 16;
    const highY = player.sliding ? 24 : 64;
    while (fireAcc >= 1) {
      fireAcc -= 1;
      const life = 0.32 + Math.random() * 0.3;
      particles.push({
        kind: 'fire',
        x: player.cx - (6 + Math.random() * 10) * S,
        y: player.feetY - (lowY + Math.random() * (highY - lowY)) * S,
        vx: -scrollSpeed * 0.16 - Math.random() * 90,
        vy: -26 - Math.random() * 120,
        life: life,
        maxLife: life,
        size: (4 + Math.random() * 5) * S
      });
    }
  }

  // 死亡：火柴人四散碎片
  function spawnShards() {
    const pts = [
      [player.cx, player.feetY - 70 * S], // 头
      [player.cx + 2 * S, player.feetY - 46 * S], // 躯干
      [player.cx - 6 * S, player.feetY - 30 * S], // 手
      [player.cx + 8 * S, player.feetY - 30 * S],
      [player.cx - 6 * S, player.feetY - 6 * S],  // 脚
      [player.cx + 8 * S, player.feetY - 6 * S]
    ];
    const colors = ['#ffffff', '#7c5cff', '#22d3ee', '#ff5ca8'];
    for (let p = 0; p < pts.length; p++) {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        const v = 180 + Math.random() * 320;
        particles.push({
          kind: 'shard',
          x: pts[p][0], y: pts[p][1],
          vx: Math.cos(a) * v - speed * 0.25,
          vy: Math.sin(a) * v,
          life: 1.0 + Math.random() * 0.5,
          maxLife: 1.5,
          size: (3 + Math.random() * 3) * S,
          color: colors[(p + i) % colors.length],
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 12
        });
      }
    }
    // 最后的火焰爆发，随后熄灭
    for (let i = 0; i < 46; i++) {
      const life = 0.4 + Math.random() * 0.5;
      particles.push({
        kind: 'fire',
        x: player.cx + (Math.random() - 0.5) * 26 * S,
        y: player.feetY - Math.random() * 56 * S,
        vx: (Math.random() - 0.5) * 300,
        vy: -60 - Math.random() * 200,
        life: life,
        maxLife: life,
        size: (5 + Math.random() * 7) * S
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'fire') {
        p.vy -= 300 * dt;                 // 热气上升
        p.vx *= Math.pow(0.35, dt);
      } else if (p.kind === 'shard') {
        p.vy += 1500 * dt;               // 碎片受重力坠落
        p.rot += p.vr * dt;
      } else {
        p.vx *= Math.pow(0.5, dt);
        p.vy *= Math.pow(0.5, dt);
      }
    }
  }

  /* ---------- 收集金币 ---------- */
  function collectCoin(c) {
    coinCount += 1;
    burst(c.x, c.y, 9, '#ffd24a', 150);
    const newLevel = 1 + Math.floor(coinCount / COINS_PER_LEVEL);
    if (newLevel > level) {
      level = newLevel;
      speed = Math.min(BASE_SPEED + (level - 1) * SPEED_STEP, MAX_SPEED);
      floats.push({
        text: '速度提升 Lv.' + level,
        x: W / 2, y: H * 0.34,
        life: 1.6, maxLife: 1.6,
        color: '#ffb347'
      });
      burst(player.cx, player.feetY - 40 * S, 22, '#22d3ee', 260);
    }
  }

  /* ---------- 死亡 / 结束 ---------- */
  function die() {
    if (!player.alive) return;
    player.alive = false;
    state = 'dying';
    deathT = 0;
    shake = 0.55;
    spawnShards();
  }

  function finishGame() {
    state = 'over';
    const newRecord = distance > best.distance;
    if (distance > best.distance) best.distance = Math.round(distance);
    if (coinCount > best.coins) best.coins = coinCount;
    saveBest();
    elFinalDist.textContent = Math.round(distance) + 'm';
    elFinalCoins.textContent = String(coinCount);
    elFinalBest.textContent = best.distance + 'm';
    elRecordTip.classList.toggle('hidden', !newRecord);
    overOverlay.classList.remove('hidden');
    updateHud(true);
  }

  /* ---------- 主角更新 ---------- */
  function updatePlayer(dt, scrollSpeed) {
    player.cx = W * 0.24;

    if (player.alive) {
      // 空中物理
      if (!player.grounded) {
        const diving = player.slideHold || player.slideTimer > 0; // 空中按下：急速下压
        player.vy += GRAVITY * (diving ? 1.9 : 1) * dt;
        player.feetY += player.vy * dt;
        if (player.feetY >= groundY) {
          if (!footOverPit()) {
            // 实地：着陆
            player.feetY = groundY;
            player.vy = 0;
            player.grounded = true;
            player.jumps = 0;
            burst(player.cx, groundY, 6, '#9db4ff', 110);
          } else if (player.feetY > groundY + 26 * S) {
            // 坠进火坑深处：死亡（浅层时尚可用跳跃自救）
            die();
          }
        }
      } else if (footOverPit()) {
        // 跑出火坑边缘开始坠落，保留一次空中恢复跳跃
        player.grounded = false;
        player.jumps = 1;
      }

      if (player.slideTimer > 0) player.slideTimer -= dt;
      player.sliding = player.grounded && (player.slideHold || player.slideTimer > 0);
    }

    // 空中姿态平滑过渡
    const targetAir = player.grounded ? 0 : 1;
    player.airBlend += (targetAir - player.airBlend) * Math.min(1, dt * 12);
    // 正弦驱动的跑步摆腿，速度越快频率越高
    player.runPhase += dt * (7 + scrollSpeed * 0.02);
  }

  /* ---------- 主更新 ---------- */
  function update(dt) {
    const scrollSpeed = state === 'ready' ? ATTRACT_SPEED : speed;

    // 昼夜循环
    dayTime = (dayTime + dt) % DAY_PERIOD;
    const u = dayTime / DAY_PERIOD;
    nightF = u < 0.5 ? 1 - u * 2 : u * 2 - 1; // 1→0→1

    // 视差层滚动
    scroll.far += scrollSpeed * dt * 0.1;
    scroll.city += scrollSpeed * dt * 0.3;
    scroll.near += scrollSpeed * dt * 0.55;
    scroll.ground += scrollSpeed * dt;

    updatePlayer(dt, scrollSpeed);

    if (state === 'playing') {
      distance += scrollSpeed * dt * PX_TO_M;
      gapCounter -= scrollSpeed * dt;
      if (gapCounter <= 0) spawnObstacle();
    }

    // 障碍移动与碰撞
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.x -= scrollSpeed * dt;
      // 火坑的坠落判定在 updatePlayer 中处理，这里只处理实体障碍
      if (player.alive && state === 'playing' && o.type !== 'pit') {
        if (overlap(playerBox(), obstacleBox(o))) die();
      }
      if (o.x + o.w < -140) obstacles.splice(i, 1);
    }

    // 金币移动、磁吸与拾取
    const magnetR = 150 * S;
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.x -= scrollSpeed * dt;
      c.phase += dt * 4;
      c.y = c.baseY + Math.sin(c.phase) * 4 * S;
      if (player.alive && state === 'playing') {
        const py = player.feetY - (player.sliding ? 22 : 40) * S;
        let dx = player.cx - c.x;
        let dy = py - c.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < magnetR * magnetR && d2 > 0.01) {
          const d = Math.sqrt(d2);
          c.x += dx / d * 540 * S * dt;
          c.y += dy / d * 540 * S * dt;
          dx = player.cx - c.x;
          dy = py - c.y;
        }
        if (dx * dx + dy * dy < (26 * S) * (26 * S)) {
          collectCoin(c);
          coins.splice(i, 1);
          continue;
        }
      }
      if (c.x < -60) coins.splice(i, 1);
    }

    // 火焰拖尾
    if (player.alive && state !== 'dying') emitFire(dt, scrollSpeed);
    updateParticles(dt);

    // 浮动提示
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life -= dt;
      f.y -= 32 * dt;
      if (f.life <= 0) floats.splice(i, 1);
    }

    if (shake > 0) shake -= dt;

    updateHud(false);
  }

  /* ---------- HUD ---------- */
  const hudCache = { dist: '', coin: '', best: '', level: '' };
  function updateHud(force) {
    const d = Math.round(distance) + 'm';
    const c = String(coinCount);
    const b = best.distance + 'm';
    const lv = 'Lv.' + level;
    if (force || d !== hudCache.dist) { elDist.textContent = d; hudCache.dist = d; }
    if (force || c !== hudCache.coin) { elCoin.textContent = c; hudCache.coin = c; }
    if (force || b !== hudCache.best) { elBest.textContent = b; hudCache.best = b; }
    if (force || lv !== hudCache.level) { elLevel.textContent = lv; hudCache.level = lv; }
  }

  /* ============================================================
   * 绘制部分
   * ============================================================ */

  // ---------- 天空与昼夜 ----------
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, groundY + 20);
    const duskT = 1 - nightF;
    g.addColorStop(0, mixColor(PAL.night.skyTop, PAL.dusk.skyTop, duskT));
    g.addColorStop(0.62, mixColor(PAL.night.skyMid, PAL.dusk.skyMid, duskT));
    g.addColorStop(1, mixColor(PAL.night.skyHor, PAL.dusk.skyHor, duskT));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 星星（夜色中闪烁）
    ctx.save();
    for (let i = 0; i < stars.length; i++) {
      const st = stars[i];
      const tw = 0.55 + 0.45 * Math.sin(animTime * 2 + st.tw);
      ctx.globalAlpha = nightF * tw * 0.9;
      ctx.fillStyle = '#dfe6ff';
      ctx.beginPath();
      ctx.arc(st.fx * W, st.fy * groundY, st.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 月亮 / 落日随昼夜交叉淡入
    const cx = W * 0.74;
    const cy = H * 0.2;
    ctx.save();
    ctx.globalAlpha = nightF * 0.95;
    ctx.shadowColor = 'rgba(220,228,255,0.9)';
    ctx.shadowBlur = 34;
    ctx.fillStyle = '#e7ecff';
    ctx.beginPath();
    ctx.arc(cx, cy, 22 * S, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = duskT * 0.9;
    ctx.shadowColor = 'rgba(255,170,90,0.95)';
    ctx.shadowBlur = 56;
    ctx.fillStyle = '#ffd09a';
    ctx.beginPath();
    ctx.arc(cx, cy + 26 * S, 30 * S, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---------- 通用山脊剪影 ----------
  function drawRidge(offset, factorY, amp1, amp2, color, seed) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-2, groundY + 2);
    for (let x = -2; x <= W + 2; x += 22) {
      const wx = x + offset;
      const y = groundY - factorY
        - (Math.sin(wx * 0.004 + seed) * 0.5 + 0.5) * amp1
        - (Math.sin(wx * 0.013 + seed * 2.3) * 0.5 + 0.5) * amp2;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W + 2, groundY + 2);
    ctx.closePath();
    ctx.fill();
  }

  // ---------- 城市楼群剪影 ----------
  function drawCity(offset) {
    const bw = 54 * S;
    const startI = Math.floor(offset / bw) - 1;
    const endI = Math.floor((offset + W) / bw) + 1;
    const duskT = 1 - nightF;
    ctx.fillStyle = mixColor(PAL.night.city, PAL.dusk.city, duskT);
    for (let i = startI; i <= endI; i++) {
      const x = i * bw - offset;
      const bh = (64 + hash(i) * 104) * S;
      const top = groundY - bh;
      ctx.fillRect(x, top, bw - 8 * S, bh);
      // 楼顶天线
      if (hash(i + 50) > 0.62) {
        ctx.fillRect(x + bw * 0.5 - 1, top - 14 * S, 2, 14 * S);
      }
      // 亮窗
      const cols = 2;
      const rows = Math.floor(bh / (18 * S));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (hash(i * 91 + r * 7 + c * 13) > 0.52) {
            const lit = 0.25 + nightF * 0.65;
            ctx.fillStyle = 'rgba(255,210,140,' + (lit * (0.5 + hash(i + r + c * 3) * 0.5)).toFixed(3) + ')';
            ctx.fillRect(x + (10 + c * 20) * S, top + (8 + r * 16) * S, 6 * S, 8 * S);
            ctx.fillStyle = mixColor(PAL.night.city, PAL.dusk.city, duskT);
          }
        }
      }
    }
  }

  // ---------- 地面 ----------
  function drawGround() {
    const duskT = 1 - nightF;
    ctx.fillStyle = mixColor(PAL.night.ground, PAL.dusk.ground, duskT);
    ctx.fillRect(0, groundY, W, H - groundY);
    // 地面线
    ctx.strokeStyle = mixColor(PAL.night.line, PAL.dusk.line, duskT);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.stroke();
    // 速度感虚线
    ctx.strokeStyle = 'rgba(124,160,255,0.16)';
    ctx.lineWidth = 2;
    for (let lane = 0; lane < 2; lane++) {
      const y = groundY + (22 + lane * 24) * S;
      const dash = 34 * S;
      const gap = 46 * S;
      const span = dash + gap;
      let off = scroll.ground % span;
      ctx.beginPath();
      for (let x = -off; x < W; x += span) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + dash, y);
      }
      ctx.stroke();
    }
  }

  // ---------- 障碍 ----------
  function drawObstacles() {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (o.type === 'brick') drawBrick(o);
      else if (o.type === 'barrier') drawBarrier(o);
      else drawPit(o);
    }
  }

  // 矮砖块
  function drawBrick(o) {
    const x = o.x;
    const y = groundY - o.h;
    const w = o.w;
    const h = o.h;
    ctx.save();
    ctx.shadowColor = 'rgba(124,92,255,0.55)';
    ctx.shadowBlur = 12;
    roundRect(x, y, w, h, 6 * S);
    ctx.fillStyle = '#26264f';
    ctx.fill();
    ctx.restore();
    // 顶帽
    ctx.fillStyle = '#3a3a82';
    roundRect(x, y, w, Math.max(7 * S, h * 0.16), 6 * S);
    ctx.fill();
    // 描边
    roundRect(x, y, w, h, 6 * S);
    ctx.strokeStyle = 'rgba(124,92,255,0.9)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // 铆钉
    ctx.fillStyle = '#7c5cff';
    const rx = 6 * S;
    const ry = 7 * S;
    ctx.beginPath();
    ctx.arc(x + rx, y + ry, 1.8 * S, 0, Math.PI * 2);
    ctx.arc(x + w - rx, y + ry, 1.8 * S, 0, Math.PI * 2);
    ctx.fill();
    // 能量裂纹
    ctx.strokeStyle = 'rgba(255,92,168,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.32, y + h * 0.32);
    ctx.lineTo(x + w * 0.5, y + h * 0.55);
    ctx.lineTo(x + w * 0.4, y + h * 0.84);
    ctx.moveTo(x + w * 0.5, y + h * 0.55);
    ctx.lineTo(x + w * 0.7, y + h * 0.42);
    ctx.stroke();
  }

  // 高架吊牌障碍
  function drawBarrier(o) {
    const x = o.x;
    const w = o.w;
    const top = o.top;
    const bottom = o.bottom;
    // 吊链延伸到画面之外
    ctx.strokeStyle = '#8a90c4';
    ctx.lineWidth = 2 * S;
    ctx.beginPath();
    ctx.moveTo(x + 9 * S, -10);
    ctx.lineTo(x + 9 * S, top);
    ctx.moveTo(x + w - 9 * S, -10);
    ctx.lineTo(x + w - 9 * S, top);
    ctx.stroke();
    // 牌体
    ctx.save();
    ctx.shadowColor = 'rgba(34,211,238,0.5)';
    ctx.shadowBlur = 14;
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, '#3a2357');
    g.addColorStop(1, '#241a44');
    roundRect(x, top, w, bottom - top, 6 * S);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    roundRect(x, top, w, bottom - top, 6 * S);
    ctx.strokeStyle = 'rgba(34,211,238,0.85)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // 警示 Chevron 箭头
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 2.6 * S;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const cy = (top + bottom) / 2;
    const n = Math.max(2, Math.floor(w / (24 * S)));
    for (let i = 0; i < n; i++) {
      const cxp = x + w * (0.24 + i * (0.52 / Math.max(1, n - 1)));
      ctx.beginPath();
      ctx.moveTo(cxp - 5 * S, cy - 6 * S);
      ctx.lineTo(cxp + 2 * S, cy);
      ctx.lineTo(cxp - 5 * S, cy + 6 * S);
      ctx.stroke();
    }
    // 下缘粉色警示光
    ctx.fillStyle = 'rgba(255,92,168,0.35)';
    ctx.fillRect(x + 4, bottom - 3 * S, w - 8, 3 * S);
  }

  // 火坑：黑洞 + 炭火 + 三层火焰（致敬原版火焰特效）
  function drawPit(o) {
    const x = o.x;
    const w = o.w;
    // 黑洞
    ctx.fillStyle = '#04050d';
    ctx.fillRect(x - 4, groundY - 2, w + 8, H - groundY + 4);
    // 坑底红光
    const g = ctx.createLinearGradient(0, groundY, 0, groundY + 60 * S);
    g.addColorStop(0, 'rgba(255,80,30,0)');
    g.addColorStop(1, 'rgba(255,90,30,0.4)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 4, groundY, w + 8, 60 * S);
    // 木炭
    ctx.fillStyle = '#3a1418';
    for (let i = 0; i < Math.floor(w / (18 * S)); i++) {
      const cxp = x + 10 * S + i * 18 * S + hash(i + Math.floor(o.seed * 99)) * 6 * S;
      ctx.beginPath();
      ctx.ellipse(cxp, groundY + 16 * S, 6 * S, 3 * S, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 焰苗（红→橙→黄三层三角形）
    const step = 13 * S;
    for (let lx = x + 7 * S; lx < x + w - 4 * S; lx += step) {
      const fh = (15 + Math.sin(animTime * 9 + lx * 0.3) * 5 +
        Math.sin(animTime * 17 + lx * 0.13) * 3) * S;
      const flick = Math.sin(animTime * 13 + lx) * 2.4 * S;
      // 外焰红
      ctx.fillStyle = 'rgba(255,59,48,0.88)';
      ctx.beginPath();
      ctx.moveTo(lx - 5 * S, groundY + 2);
      ctx.lineTo(lx + flick, groundY - fh);
      ctx.lineTo(lx + 5 * S, groundY + 2);
      ctx.closePath();
      ctx.fill();
      // 中焰橙
      ctx.fillStyle = 'rgba(255,157,60,0.92)';
      ctx.beginPath();
      ctx.moveTo(lx - 3.4 * S, groundY + 2);
      ctx.lineTo(lx + flick * 0.6, groundY - fh * 0.72 + 4 * S);
      ctx.lineTo(lx + 3.4 * S, groundY + 2);
      ctx.closePath();
      ctx.fill();
      // 内焰黄
      ctx.fillStyle = 'rgba(255,233,138,0.95)';
      ctx.beginPath();
      ctx.moveTo(lx - 1.8 * S, groundY + 2);
      ctx.lineTo(lx + flick * 0.3, groundY - fh * 0.42 + 7 * S);
      ctx.lineTo(lx + 1.8 * S, groundY + 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ---------- 金币（矢量圆 + 星芒） ----------
  function drawCoins() {
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      const r = 8.5 * S;
      ctx.save();
      ctx.translate(c.x, c.y);
      // 光晕
      ctx.shadowColor = 'rgba(255,200,90,0.9)';
      ctx.shadowBlur = 12;
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
      g.addColorStop(0, '#fff3c4');
      g.addColorStop(0.6, '#ffd24a');
      g.addColorStop(1, '#ff9d2e');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // 内圈
      ctx.strokeStyle = 'rgba(160,80,10,0.65)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      // 旋转星芒
      ctx.rotate(c.phase * 0.5);
      ctx.strokeStyle = 'rgba(255,244,200,0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        ctx.moveTo(Math.cos(a) * (r + 1), Math.sin(a) * (r + 1));
        ctx.lineTo(Math.cos(a) * (r + 5 * S), Math.sin(a) * (r + 5 * S));
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- 火焰 / 火花粒子（加色混合） ----------
  function fireColor(t) {
    if (t > 0.66) return '#ffe98a';
    if (t > 0.33) return '#ff9d3c';
    return '#ff4030';
  }
  function drawParticlesAdditive() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.kind === 'shard') continue;
      const t = p.life / p.maxLife;
      if (p.kind === 'fire') {
        ctx.globalAlpha = Math.min(1, t * 1.4);
        ctx.fillStyle = fireColor(t);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * t), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = Math.min(1, t * 1.6);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---------- 火柴人碎片（普通混合） ----------
  function drawShards() {
    ctx.save();
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.kind !== 'shard') continue;
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(1, t * 1.5);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size * 0.5, -p.size * 1.4, p.size, p.size * 2.8);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------- 火柴人主角 ----------
  // 绘制两节肢体（髋/肩 → 肘/膝 → 末端），角度以竖直向下为 0
  function limb(x, y, a1, l1, a2, l2) {
    const x2 = x + Math.sin(a1) * l1;
    const y2 = y + Math.cos(a1) * l1;
    const x3 = x2 + Math.sin(a2) * l2;
    const y3 = y2 + Math.cos(a2) * l2;
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
  }

  function drawStickman() {
    const cx = player.cx;
    const feet = player.feetY;
    const s = S;

    // 地面投影
    const h = groundY - feet;
    ctx.save();
    ctx.globalAlpha = clamp(0.35 - h / 600, 0.05, 0.35);
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(cx, groundY + 3, (26 - h * 0.05) * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#eef1ff';
    ctx.fillStyle = '#eef1ff';
    ctx.lineWidth = 3.2 * s;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(124,92,255,0.85)';
    ctx.shadowBlur = 9;

    if (player.sliding) {
      drawSlidePose(cx, feet, s);
    } else {
      drawRunPose(cx, feet, s);
    }
    ctx.restore();
  }

  // 跑步 / 跳跃姿态
  function drawRunPose(cx, feet, s) {
    const ph = player.runPhase;
    const sn = Math.sin(ph);
    const ab = player.airBlend;

    // 腿部摆角（正弦驱动），空中向收腿姿态混合
    let hipA1 = lerp(sn * 0.85, 0.55, ab);
    let hipA2 = lerp(-sn * 0.85, -0.35, ab);
    let knee1 = lerp(0.3 + Math.max(0, -sn) * 0.95, 1.35, ab);
    let knee2 = lerp(0.3 + Math.max(0, sn) * 0.95, 1.2, ab);
    // 手臂与腿反向摆动，空中上举
    let armA1 = lerp(-sn * 0.9, -2.35, ab);
    let armA2 = lerp(sn * 0.9, 2.5, ab);

    const UL = 16 * s;  // 大腿
    const LL = 18 * s;  // 小腿
    const UA = 14 * s;  // 上臂
    const LA = 15 * s;  // 下臂
    const bob = (1 - Math.abs(sn)) * -1.6 * s; // 奔跑起伏
    const hipX = cx;
    const hipY = feet - 34 * s + bob;
    const lean = 0.14;
    const shoulderX = hipX + Math.sin(lean) * 28 * s;
    const shoulderY = hipY - Math.cos(lean) * 28 * s;

    ctx.beginPath();
    // 腿
    limb(hipX, hipY, hipA1, UL, hipA1 + knee1, LL);
    limb(hipX, hipY, hipA2, UL, hipA2 + knee2, LL);
    // 手臂
    limb(shoulderX, shoulderY, armA1, UA, armA1 + 0.7, LA);
    limb(shoulderX, shoulderY, armA2, UA, armA2 + 0.7, LA);
    // 躯干
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(shoulderX, shoulderY);
    ctx.stroke();

    // 头部
    const hx = shoulderX + Math.sin(lean) * 8 * s;
    const hy = shoulderY - Math.cos(lean) * 9 * s;
    ctx.beginPath();
    ctx.arc(hx, hy, 9 * s, 0, Math.PI * 2);
    ctx.fill();
    // 眼睛（朝向奔跑方向）
    ctx.fillStyle = '#20244a';
    ctx.beginPath();
    ctx.arc(hx + 4.2 * s, hy - 1.5 * s, 1.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // 滑铲姿态：压低身体、后腿蹬地、前腿前伸
  function drawSlidePose(cx, feet, s) {
    const hipX = cx - 4 * s;
    const hipY = feet - 19 * s;
    const shoulderX = cx - 22 * s;
    const shoulderY = feet - 32 * s;

    ctx.beginPath();
    // 后腿（蜷起蹬地）
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(cx - 16 * s, feet - 10 * s);
    ctx.lineTo(cx - 2 * s, feet - 1 * s);
    // 前腿（前伸）
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(cx + 16 * s, feet - 12 * s);
    ctx.lineTo(cx + 30 * s, feet - 1 * s);
    // 躯干后仰
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(shoulderX, shoulderY);
    // 前手前伸
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(cx - 6 * s, feet - 34 * s);
    ctx.lineTo(cx + 12 * s, feet - 22 * s);
    // 后手后摆
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(cx - 34 * s, feet - 26 * s);
    ctx.stroke();

    // 头部
    ctx.beginPath();
    ctx.arc(shoulderX - 5 * s, shoulderY - 2 * s, 9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20244a';
    ctx.beginPath();
    ctx.arc(shoulderX - 1 * s, shoulderY - 3 * s, 1.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- 浮动提示 ----------
  function drawFloats() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '800 ' + Math.round(24 * S) + 'px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif';
    for (let i = 0; i < floats.length; i++) {
      const f = floats[i];
      const t = f.life / f.maxLife;
      ctx.globalAlpha = Math.min(1, t * 2);
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 14;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }

  // ---------- 整帧渲染 ----------
  function render() {
    if (!W) return;
    ctx.save();
    // 死亡震屏
    if (shake > 0) {
      const m = shake * 16;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }

    drawSky();

    const duskT = 1 - nightF;
    drawRidge(scroll.far, 70 * S, 70 * S, 38 * S,
      mixColor(PAL.night.far, PAL.dusk.far, duskT), 1.7);
    drawCity(scroll.city);
    drawRidge(scroll.near, 8 * S, 34 * S, 16 * S,
      mixColor(PAL.night.near, PAL.dusk.near, duskT), 4.2);

    drawGround();
    drawObstacles();
    drawCoins();
    drawParticlesAdditive();
    if (player.alive) drawStickman();
    drawShards();
    drawFloats();

    ctx.restore();
  }

  /* ---------- 暂停 / 开始 / 再玩 ---------- */
  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    pauseOverlay.classList.remove('hidden');
  }
  function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing';
    pauseOverlay.classList.add('hidden');
  }
  function startGame() {
    resetGame();
    startOverlay.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
    overOverlay.classList.add('hidden');
    state = 'playing';
    document.activeElement && document.activeElement.blur();
  }

  /* ---------- 输入 ---------- */
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
    }
    if (e.code === 'Escape') {
      if (state === 'playing') pauseGame();
      else if (state === 'paused') resumeGame();
      return;
    }
    if (state !== 'playing') return;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      jump();
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      player.slideHold = true;
    }
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'ArrowDown' || e.code === 'KeyS') player.slideHold = false;
  });

  // 触屏 / 鼠标：点击跳跃，下滑滑铲
  let touchStart = null;
  let touchSwiped = false;
  canvas.addEventListener('pointerdown', function (e) {
    if (state !== 'playing') return;
    touchStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    touchSwiped = false;
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!touchStart || touchSwiped) return;
    if (e.clientY - touchStart.y > 24) {
      touchSwiped = true;
      player.slideTimer = 0.72;
    }
  });
  function touchEnd(e) {
    if (!touchStart) return;
    const quick = performance.now() - touchStart.t < 350;
    const moved = Math.abs(e.clientY - touchStart.y) >= 18;
    if (!touchSwiped && quick && !moved) jump();
    touchStart = null;
  }
  canvas.addEventListener('pointerup', touchEnd);
  canvas.addEventListener('pointercancel', function () { touchStart = null; });

  // 失焦 / 切后台自动暂停
  window.addEventListener('blur', function () { pauseGame(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pauseGame();
  });

  startBtn.addEventListener('click', startGame);
  againBtn.addEventListener('click', startGame);
  resumeBtn.addEventListener('click', resumeGame);
  elPauseBtn.addEventListener('click', function () {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  });

  /* ---------- 尺寸监听 ---------- */
  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(stage);
  }
  window.addEventListener('resize', resize);

  /* ---------- 主循环（rAF + delta time） ---------- */
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; // 切后台回来时防止大跳变
    animTime += dt;

    if (state === 'playing' || state === 'ready') {
      update(dt);
    } else if (state === 'dying') {
      deathT += dt;
      update(dt * 0.22); // 慢动作
      if (deathT >= 1.2) finishGame();
    }
    render();
  }

  /* ---------- 启动 ---------- */
  loadBest();
  resize();
  player.cx = W * 0.24;
  player.feetY = groundY;
  updateHud(true);
  requestAnimationFrame(frame);
})();
