/* ============================================================
   霓虹贪吃蛇 —— 纯 Canvas 2D，零外部依赖
   固定时间步长移动 + 渲染插值；IIFE 封装，全部中文注释
   ============================================================ */
(function () {
  'use strict';

  // ---------------- 常量配置 ----------------
  const GRID = 24;                 // 场地网格数（GRID x GRID）
  const BASE_INTERVAL = 150;       // 初始移动步进间隔（毫秒）
  const MIN_INTERVAL = 72;         // 随长度加速后的最小步进间隔
  const SPEED_STEP = 3;            // 蛇身每增长一节缩短的步进毫秒数
  const GOLD_CHANCE = 0.18;        // 吃掉普通食物后金色食物出现概率
  const GOLD_DURATION = 6000;      // 金色食物停留时长（毫秒）
  const BOOST_DURATION = 5000;     // 金色食物带来的加速时长（毫秒）
  const BOOST_RATIO = 0.62;        // 加速状态下的步进间隔比例
  const BEST_KEY = 'best_snake';   // 最高分本地存储键
  const FONT_STACK = 'system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif';

  // 蛇身渐变两端颜色：头为青，尾为紫
  const COLOR_HEAD = { r: 34, g: 211, b: 238 };   // #22d3ee
  const COLOR_TAIL = { r: 124, g: 92, b: 255 };   // #7c5cff

  // ---------------- DOM 引用 ----------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('canvas-wrap');
  const hudLength = document.getElementById('hud-length');
  const hudScore = document.getElementById('hud-score');
  const hudBest = document.getElementById('hud-best');
  const pauseBtn = document.getElementById('pause-btn');
  const startOverlay = document.getElementById('start-overlay');
  const pauseOverlay = document.getElementById('pause-overlay');
  const overOverlay = document.getElementById('over-overlay');
  const startBtn = document.getElementById('start-btn');
  const resumeBtn = document.getElementById('resume-btn');
  const restartBtn = document.getElementById('restart-btn');
  const finalScore = document.getElementById('final-score');
  const finalLength = document.getElementById('final-length');
  const newRecord = document.getElementById('new-record');

  // ---------------- 游戏状态 ----------------
  // ready（开始遮罩） | playing | paused | dying（消散动画） | over（结束遮罩）
  let state = 'ready';
  let snake = [];
  let prevSnake = [];               // 上一步蛇身位置，用于渲染插值
  let dir = { x: 1, y: 0 };         // 当前移动方向
  let dirQueue = [];                // 方向输入缓冲队列
  let food = null;                  // 普通食物 {x,y,age}
  let gold = null;                  // 金色食物 {x,y,age,timeLeft}
  let score = 0;
  let best = loadBest();
  let particles = [];               // 粒子集合
  let floatTexts = [];              // 飘字集合（+1 / +3 加速）
  let accumulator = 0;              // 固定步长累加器
  let lastTime = 0;
  let now = 0;                      // 当前帧时间戳
  let fieldSize = 0;                // 画布 CSS 像素边长
  let cell = 0;                     // 单格像素边长
  let dpr = 1;                      // 设备像素比
  let eatPulse = 0;                 // 吃到食物时的放大弹跳进度（1 -> 0）
  let boostLeft = 0;                // 加速剩余毫秒
  let deathTime = 0;                // 死亡消散动画已播放时长
  let deathBursted = 0;             // 已消散的蛇身段数
  let deathTotal = 0;              // 消散动画总时长
  let recordBroken = false;

  // ============================================================
  // 工具函数
  // ============================================================

  // 读取本地最高分
  function loadBest() {
    try {
      return parseInt(localStorage.getItem(BEST_KEY), 10) || 0;
    } catch (err) {
      return 0;
    }
  }

  // 写入本地最高分
  function saveBest(value) {
    try {
      localStorage.setItem(BEST_KEY, String(value));
    } catch (err) {
      /* 本地存储不可用时静默忽略 */
    }
  }

  // 两色按比例混合，返回 rgb 字符串
  function mixColor(a, b, t) {
    return 'rgb(' +
      Math.round(a.r + (b.r - a.r) * t) + ',' +
      Math.round(a.g + (b.g - a.g) * t) + ',' +
      Math.round(a.b + (b.b - a.b) * t) + ')';
  }

  // 圆角矩形路径（兼容性手写实现）
  function roundRectPath(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // ============================================================
  // 画布自适应（devicePixelRatio）
  // ============================================================

  function resize() {
    const rect = wrap.getBoundingClientRect();
    fieldSize = Math.max(120, Math.floor(rect.width));
    dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    canvas.width = Math.floor(fieldSize * dpr);
    canvas.height = canvas.width;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = fieldSize / GRID;
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  // ============================================================
  // 食物生成
  // ============================================================

  function isOccupied(x, y) {
    for (let i = 0; i < snake.length; i++) {
      if (snake[i].x === x && snake[i].y === y) return true;
    }
    if (food && food.x === x && food.y === y) return true;
    if (gold && gold.x === x && gold.y === y) return true;
    return false;
  }

  // 从所有空格中随机取一格
  function randomEmptyCell() {
    const empties = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (!isOccupied(x, y)) empties.push({ x: x, y: y });
      }
    }
    if (!empties.length) return null;
    return empties[(Math.random() * empties.length) | 0];
  }

  function spawnFood() {
    const c = randomEmptyCell();
    if (c) food = { x: c.x, y: c.y, age: 0 };
  }

  // 吃普通食物后概率刷新金色食物
  function maybeSpawnGold() {
    if (gold || Math.random() > GOLD_CHANCE) return;
    const c = randomEmptyCell();
    if (c) gold = { x: c.x, y: c.y, age: 0, timeLeft: GOLD_DURATION };
  }

  // ============================================================
  // 粒子与飘字
  // ============================================================

  // 在指定格中心爆出一团粒子
  function burst(gx, gy, palette, count) {
    const cx = (gx + 0.5) * cell;
    const cy = (gy + 0.5) * cell;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 200;
      const life = 380 + Math.random() * 460;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: cell * (0.06 + Math.random() * 0.1),
        life: life,
        maxLife: life,
        color: palette[(Math.random() * palette.length) | 0]
      });
    }
  }

  function addFloat(gx, gy, text, color) {
    floatTexts.push({
      x: (gx + 0.5) * cell,
      y: (gy + 0.15) * cell,
      text: text,
      color: color,
      life: 900,
      maxLife: 900
    });
  }

  // ============================================================
  // 开局重置
  // ============================================================

  function resetGame() {
    snake = [
      { x: 12, y: 12 },
      { x: 11, y: 12 },
      { x: 10, y: 12 }
    ];
    prevSnake = snake.map(function (s) { return { x: s.x, y: s.y }; });
    dir = { x: 1, y: 0 };
    dirQueue = [];
    score = 0;
    food = null;
    gold = null;
    particles = [];
    floatTexts = [];
    accumulator = 0;
    eatPulse = 0;
    boostLeft = 0;
    deathTime = 0;
    deathBursted = 0;
    recordBroken = false;
    spawnFood();
    updateHud();
  }

  // ============================================================
  // 速度与固定步长
  // ============================================================

  function currentInterval() {
    let interval = BASE_INTERVAL - (snake.length - 3) * SPEED_STEP;
    if (interval < MIN_INTERVAL) interval = MIN_INTERVAL;
    if (boostLeft > 0) interval *= BOOST_RATIO;
    return interval;
  }

  // 单次逻辑步进
  function step() {
    if (dirQueue.length) dir = dirQueue.shift();
    prevSnake = snake.map(function (s) { return { x: s.x, y: s.y }; });

    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // 撞墙判定
    if (head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID) {
      die();
      return;
    }

    const ateFood = (head.x === food.x && head.y === food.y);
    const ateGold = !!(gold && head.x === gold.x && head.y === gold.y);
    const grew = ateFood || ateGold;

    // 撞自身判定：不生长时尾巴会让位，故排除尾节
    const limit = grew ? snake.length : snake.length - 1;
    for (let i = 0; i < limit; i++) {
      if (snake[i].x === head.x && snake[i].y === head.y) {
        die();
        return;
      }
    }

    snake.unshift(head);

    if (ateFood) {
      // 普通食物：+1 分，弹跳帧动画与红色粒子
      score += 1;
      eatPulse = 1;
      burst(food.x, food.y, ['#ff3b5c', '#ff5ca8', '#ffd9e2'], 16);
      addFloat(food.x, food.y, '+1', '#ff87a8');
      spawnFood();
      maybeSpawnGold();
    } else if (ateGold) {
      // 金色食物：+3 分并触发加速
      score += 3;
      eatPulse = 1;
      boostLeft = BOOST_DURATION;
      burst(gold.x, gold.y, ['#ffb347', '#ffe29a', '#22d3ee', '#ffffff'], 28);
      addFloat(gold.x, gold.y, '+3 加速', '#ffd47a');
      gold = null;
    } else {
      snake.pop();
    }

    updateHud();
  }

  // ============================================================
  // 死亡：蛇身逐段粒子消散
  // ============================================================

  function die() {
    state = 'dying';
    deathTime = 0;
    deathBursted = 0;
    deathTotal = snake.length * 55 + 480;
    dirQueue = [];
    pauseBtn.classList.add('hidden');
  }

  function updateDeath(dt) {
    // 自头向尾，每 55 毫秒消散一段
    while (deathBursted < snake.length && deathBursted * 55 <= deathTime) {
      const idx = deathBursted;
      const seg = snake[idx];
      const ratio = snake.length <= 1 ? 0 : idx / (snake.length - 1);
      const segColor = mixColor(COLOR_HEAD, COLOR_TAIL, ratio);
      burst(seg.x, seg.y, [segColor, '#ffffff', idx === 0 ? '#22d3ee' : segColor], 14);
      deathBursted++;
    }
    deathTime += dt;
    if (deathTime >= deathTotal) finishDeath();
  }

  function finishDeath() {
    state = 'over';
    if (score > best) {
      best = score;
      saveBest(best);
      recordBroken = true;
    }
    updateHud();
    finalScore.textContent = String(score);
    finalLength.textContent = String(snake.length);
    newRecord.classList.toggle('hidden', !recordBroken);
    overOverlay.classList.remove('hidden');
  }

  // ============================================================
  // 每帧特效更新（与逻辑步长解耦）
  // ============================================================

  function updateEffects(dt) {
    // 弹跳进度约 320ms 衰减完
    eatPulse = Math.max(0, eatPulse - dt / 320);
    food.age += dt;

    if (boostLeft > 0) boostLeft = Math.max(0, boostLeft - dt);

    if (gold) {
      gold.age += dt;
      gold.timeLeft -= dt;
      if (gold.timeLeft <= 0) {
        // 金色食物超时消失
        burst(gold.x, gold.y, ['#ffb347', '#ffffff'], 10);
        gold = null;
      }
    }

    // 粒子：位移 + 阻尼 + 生命衰减
    const drag = Math.exp(-2.4 * dt / 1000);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt / 1000;
      p.y += p.vy * dt / 1000;
      p.vx *= drag;
      p.vy *= drag;
    }

    // 飘字上升
    for (let j = floatTexts.length - 1; j >= 0; j--) {
      const f = floatTexts[j];
      f.life -= dt;
      f.y -= 30 * dt / 1000;
      if (f.life <= 0) floatTexts.splice(j, 1);
    }
  }

  // ============================================================
  // 渲染
  // ============================================================

  // 淡赛博点阵背景
  function drawGrid() {
    ctx.save();
    ctx.fillStyle = 'rgba(124, 92, 255, 0.14)';
    const dotR = Math.max(0.8, cell * 0.05);
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        ctx.beginPath();
        ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 四角青色微光点缀
    ctx.fillStyle = 'rgba(34, 211, 238, 0.20)';
    const corners = [[0, 0], [GRID - 1, 0], [0, GRID - 1], [GRID - 1, GRID - 1]];
    for (let k = 0; k < corners.length; k++) {
      ctx.beginPath();
      ctx.arc((corners[k][0] + 0.5) * cell, (corners[k][1] + 0.5) * cell, dotR * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 普通食物：脉动旋转的红色能量块
  function drawFood() {
    if (!food) return;
    const cx = (food.x + 0.5) * cell;
    const cy = (food.y + 0.5) * cell;
    const ageScale = Math.min(1, food.age / 200);
    const pulse = 1 + 0.13 * Math.sin(now / 200);
    const s = cell * 0.33 * pulse * ageScale;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(now / 700);
    ctx.shadowColor = '#ff3b5c';
    ctx.shadowBlur = cell * 0.95;
    ctx.fillStyle = '#ff3b5c';
    roundRectPath(-s, -s, s * 2, s * 2, s * 0.35);
    ctx.fill();

    // 高亮内核
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    const s2 = s * 0.42;
    roundRectPath(-s2, -s2, s2 * 2, s2 * 2, s2 * 0.3);
    ctx.fill();
    ctx.restore();
  }

  // 金色食物：脉动金块 + 倒计时圆环 + 环绕光点
  function drawGold() {
    if (!gold) return;
    const cx = (gold.x + 0.5) * cell;
    const cy = (gold.y + 0.5) * cell;
    const ageScale = Math.min(1, gold.age / 200);
    const pulse = 1 + 0.16 * Math.sin(now / 150);
    const ratio = gold.timeLeft / GOLD_DURATION;
    // 最后 1.5 秒高频闪烁提示
    const blink = ratio < 0.25 ? 0.45 + 0.55 * Math.abs(Math.sin(now / 90)) : 1;
    const s = cell * 0.35 * pulse * ageScale;

    ctx.save();
    ctx.globalAlpha = blink;
    ctx.translate(cx, cy);

    // 环绕小光点
    for (let k = 0; k < 3; k++) {
      const a = now / 350 + k * (Math.PI * 2 / 3);
      ctx.fillStyle = '#ffe29a';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * cell * 0.52, Math.sin(a) * cell * 0.52, cell * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.rotate(now / 500);
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = cell * 1.1;
    ctx.fillStyle = '#ffb347';
    roundRectPath(-s, -s, s * 2, s * 2, s * 0.35);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    const s2 = s * 0.42;
    roundRectPath(-s2, -s2, s2 * 2, s2 * 2, s2 * 0.3);
    ctx.fill();
    ctx.restore();

    // 倒计时圆环（不随金块旋转）
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.strokeStyle = '#ffd47a';
    ctx.lineWidth = Math.max(2, cell * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.52, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.stroke();
    ctx.restore();
  }

  // 蛇身：圆角分段 + 头青尾紫渐变 + 发光
  function drawSnake() {
    const alpha = state === 'playing'
      ? Math.max(0, Math.min(1, accumulator / currentInterval()))
      : 1;
    const n = snake.length;
    const bump = Math.sin(eatPulse * Math.PI);

    // 自尾向头绘制，保证蛇头覆盖在上层
    for (let i = n - 1; i >= 0; i--) {
      if (state === 'dying' && i < deathBursted) continue;

      const cur = snake[i];
      const pv = prevSnake[i] || prevSnake[prevSnake.length - 1] || cur;
      const gx = pv.x + (cur.x - pv.x) * alpha + 0.5;
      const gy = pv.y + (cur.y - pv.y) * alpha + 0.5;
      const ratio = n <= 1 ? 0 : i / (n - 1);
      const color = mixColor(COLOR_HEAD, COLOR_TAIL, ratio);
      const scale = 1 + bump * (i === 0 ? 0.22 : 0.1);
      const size = cell * 0.9 * scale;
      const half = size / 2;
      const cxp = gx * cell;
      const cyp = gy * cell;

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = cell * 0.7;
      ctx.fillStyle = color;
      roundRectPath(cxp - half, cyp - half, size, size, cell * 0.3);
      ctx.fill();
      ctx.restore();
    }

    drawHead(alpha);
  }

  // 蛇头：随方向旋转的眼睛与吐信
  function drawHead(alpha) {
    const cur = snake[0];
    if (!cur) return;
    if (state === 'dying' && deathBursted > 0) return;
    const pv = prevSnake[0] || cur;
    const cx = (pv.x + (cur.x - pv.x) * alpha + 0.5) * cell;
    const cy = (pv.y + (cur.y - pv.y) * alpha + 0.5) * cell;
    const angle = Math.atan2(dir.y, dir.x);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // 舌头：周期 1.5 秒，吐出约占 28% 时长
    const cycle = (now % 1500) / 1500;
    if (cycle < 0.28) {
      const k = cycle < 0.14 ? cycle / 0.14 : (0.28 - cycle) / 0.14;
      const ext = cell * (0.32 + 0.4 * k);
      ctx.strokeStyle = '#ff5ca8';
      ctx.lineWidth = cell * 0.09;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#ff5ca8';
      ctx.shadowBlur = cell * 0.4;
      ctx.beginPath();
      ctx.moveTo(cell * 0.24, 0);
      ctx.lineTo(ext, 0);
      ctx.moveTo(ext, 0);
      ctx.lineTo(ext + cell * 0.16, -cell * 0.12);
      ctx.moveTo(ext, 0);
      ctx.lineTo(ext + cell * 0.16, cell * 0.12);
      ctx.stroke();
    }

    // 双眼：白色眼白 + 深色瞳孔，位置朝行进方向偏移
    const eyeR = cell * 0.14;
    const pupilR = cell * 0.075;
    const ex = cell * 0.14;
    const ey = cell * 0.2;
    ctx.shadowBlur = 0;
    const sides = [-1, 1];
    for (let i = 0; i < sides.length; i++) {
      const side = sides[i];
      ctx.fillStyle = '#eafcff';
      ctx.beginPath();
      ctx.arc(ex, side * ey, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#10132a';
      ctx.beginPath();
      ctx.arc(ex + cell * 0.05, side * ey, pupilR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // 粒子（叠加发光混合）
  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * a), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 飘字
  function drawFloats() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + Math.round(cell * 0.72) + 'px ' + FONT_STACK;
    for (let i = 0; i < floatTexts.length; i++) {
      const f = floatTexts[i];
      const a = Math.max(0, f.life / f.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 10;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }

  // 加速状态提示条
  function drawBoostBar() {
    const ratio = boostLeft / BOOST_DURATION;
    const barW = fieldSize * 0.42;
    const barH = Math.max(4, cell * 0.14);
    const x = (fieldSize - barW) / 2;
    const y = cell * 0.42;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + Math.round(cell * 0.55) + 'px ' + FONT_STACK;
    ctx.fillStyle = '#9ff3ff';
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 10;
    ctx.fillText('加速中', fieldSize / 2, cell * 1.25);

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    roundRectPath(x, y, barW, barH, barH / 2);
    ctx.fill();
    ctx.fillStyle = '#22d3ee';
    roundRectPath(x, y, Math.max(barH, barW * ratio), barH, barH / 2);
    ctx.fill();
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, fieldSize, fieldSize);
    drawGrid();
    drawFood();
    drawGold();
    drawSnake();
    drawParticles();
    drawFloats();
    if (boostLeft > 0 && (state === 'playing' || state === 'paused')) drawBoostBar();
  }

  // ============================================================
  // 主循环：rAF 驱动，移动采用固定时间步长 + 渲染插值
  // ============================================================

  function frame(t) {
    requestAnimationFrame(frame);
    if (!lastTime) lastTime = t;
    let dt = t - lastTime;
    lastTime = t;
    now = t;
    if (dt > 100) dt = 100; // 切后台等大间隔钳制

    if (state === 'playing') {
      updateEffects(dt);
      accumulator += dt;
      let interval = currentInterval();
      if (accumulator > interval * 3) accumulator = interval;
      while (accumulator >= interval && state === 'playing') {
        accumulator -= interval;
        step();
        interval = currentInterval();
      }
    } else if (state === 'dying') {
      updateEffects(dt);
      updateDeath(dt);
    }

    render();
  }

  // ============================================================
  // HUD 与流程切换
  // ============================================================

  function updateHud() {
    hudLength.textContent = String(snake.length);
    hudScore.textContent = String(score);
    hudBest.textContent = String(best);
  }

  function hideOverlays() {
    startOverlay.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
    overOverlay.classList.add('hidden');
  }

  function startGame() {
    resetGame();
    state = 'playing';
    hideOverlays();
    pauseBtn.textContent = '暂停';
    pauseBtn.classList.remove('hidden');
    lastTime = 0;
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    pauseOverlay.classList.remove('hidden');
    pauseBtn.textContent = '继续';
  }

  function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing';
    pauseOverlay.classList.add('hidden');
    pauseBtn.textContent = '暂停';
    lastTime = 0;
  }

  // 窗口失焦 / 页面隐藏时自动暂停
  function autoPause() {
    if (state === 'playing') pauseGame();
  }
  window.addEventListener('blur', autoPause);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) autoPause();
  });

  // ============================================================
  // 键盘控制（方向键 / WASD / 空格 / Esc）
  // ============================================================

  const KEY_DIRS = {
    ArrowUp: { x: 0, y: -1 },
    KeyW: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    KeyS: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    KeyA: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    KeyD: { x: 1, y: 0 }
  };

  // 方向入队：禁止同向重复与 180 度反向
  function queueDir(nx, ny) {
    const last = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
    if (last.x === nx && last.y === ny) return;
    if (last.x === -nx && last.y === -ny) return;
    if (dirQueue.length < 2) dirQueue.push({ x: nx, y: ny });
  }

  window.addEventListener('keydown', function (e) {
    const d = KEY_DIRS[e.code];
    if (d) {
      e.preventDefault();
      if (state === 'playing') queueDir(d.x, d.y);
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      if (state === 'playing') pauseGame();
      else if (state === 'paused') resumeGame();
      else if (state === 'ready' || state === 'over') startGame();
    } else if (e.code === 'Escape') {
      if (state === 'playing') pauseGame();
      else if (state === 'paused') resumeGame();
    }
  });

  // ============================================================
  // 触屏滑动转向
  // ============================================================

  let touchStart = null;

  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) {
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (!touchStart || state !== 'playing') return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      queueDir(dx > 0 ? 1 : -1, 0);
    } else {
      queueDir(0, dy > 0 ? 1 : -1);
    }
    // 以当前触点为新起点，支持一次滑动连续转向
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: false });

  canvas.addEventListener('touchend', function () {
    touchStart = null;
  });

  canvas.addEventListener('touchcancel', function () {
    touchStart = null;
  });

  // ============================================================
  // 按钮事件
  // ============================================================

  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);
  resumeBtn.addEventListener('click', resumeGame);
  pauseBtn.addEventListener('click', function () {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  });

  // ============================================================
  // 启动
  // ============================================================

  resize();
  resetGame();
  updateHud();
  requestAnimationFrame(frame);
})();
