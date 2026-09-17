/*
 * 星际射击 —— 纵版射击网页游戏
 * 纯 Canvas 2D 矢量绘制，零外部依赖（无图片 / 无字体 / 无第三方库）
 * 主循环：requestAnimationFrame + delta time
 */
(function () {
  'use strict';

  /* ================================================================
   * 工具函数
   * ================================================================ */
  const rand = function (min, max) { return min + Math.random() * (max - min); };
  const clamp = function (v, min, max) { return v < min ? min : (v > max ? max : v); };
  const dist2 = function (ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  };

  /* ================================================================
   * DOM 引用
   * ================================================================ */
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const scoreEl = document.getElementById('scoreVal');
  const bestEl = document.getElementById('bestVal');
  const comboEl = document.getElementById('comboTag');
  const chipDouble = document.getElementById('chipDouble');
  const chipShield = document.getElementById('chipShield');
  const doubleTimeEl = document.getElementById('doubleTime');
  const livesEl = document.getElementById('lives');

  const startOverlay = document.getElementById('startOverlay');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const overOverlay = document.getElementById('overOverlay');
  const finalScoreEl = document.getElementById('finalScore');
  const finalBestEl = document.getElementById('finalBest');
  const recordTipEl = document.getElementById('recordTip');

  const startBtn = document.getElementById('startBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const againBtn = document.getElementById('againBtn');
  const pauseBtn = document.getElementById('pauseBtn');

  /* ================================================================
   * 全局常量
   * ================================================================ */
  const BEST_KEY = 'best_sky-shooter';

  const COLOR = {
    main: '#7c5cff',
    cyan: '#22d3ee',
    pink: '#ff5ca8',
    orange: '#ffb347',
    white: '#ffffff'
  };

  const PLAYER_R = 15;          // 玩家碰撞半径
  const PLAYER_SPEED = 380;     // 玩家移动速度（像素/秒）
  const FIRE_CD = 0.16;         // 普通射击间隔（秒）
  const DOUBLE_FIRE_CD = 0.13;  // 双发射击间隔
  const DOUBLE_DURATION = 8;    // 双发持续时间（秒）
  const BULLET_SPEED = 680;     // 子弹速度
  const START_LIVES = 3;        // 初始生命数
  const INVULN_TIME = 2.4;      // 被击中后无敌时间
  const SHIELD_INVULN = 1.2;    // 护盾抵挡后的短暂无敌

  // 迷你战机图标（生命数显示用，内联 SVG 矢量）
  const LIFE_ICON =
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" ' +
    'stroke="#22d3ee" stroke-width="2" stroke-linejoin="round" ' +
    'style="filter:drop-shadow(0 0 4px rgba(34,211,238,.85))">' +
    '<path d="M12 2 L20 21 L12 16.5 L4 21 Z"/></svg>';

  /* ================================================================
   * 运行时状态
   * ================================================================ */
  let W = 0;                    // 画布逻辑宽度（CSS 像素）
  let H = 0;                    // 画布逻辑高度
  let dpr = 1;                  // 设备像素比

  let state = 'menu';           // menu | playing | paused | over
  let player = null;            // 玩家战机
  let bullets = [];             // 玩家子弹
  let enemies = [];             // 敌机
  let particles = [];           // 粒子（爆炸、尾焰、火花）
  let powerups = [];            // 掉落道具
  let popups = [];              // 浮动提示文字
  let stars = [];               // 星空（多层）

  let score = 0;
  let best = 0;
  let lives = START_LIVES;
  let combo = 0;                // 连续击毁数
  let elapsed = 0;              // 本局已进行时间（秒）
  let spawnTimer = 1;           // 普通敌机生成计时
  let bigTimer = 12;            // 大型机生成计时

  let shakeTime = 0;            // 屏幕震动剩余时间
  let shakeDur = 1;             // 屏幕震动总时长（用于衰减）
  let shakeMag = 0;             // 震动幅度

  const keys = new Set();       // 当前按下的按键
  let touchFire = false;        // 触屏操控中（自动开火）
  let touchX = 0;
  let touchY = 0;

  /* ================================================================
   * 本地最高分
   * ================================================================ */
  function loadBest() {
    try {
      const v = parseInt(localStorage.getItem(BEST_KEY), 10);
      best = isNaN(v) ? 0 : v;
    } catch (err) {
      best = 0;
    }
    bestEl.textContent = best;
  }

  function saveBest() {
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch (err) {
      /* 本地存储不可用时静默忽略 */
    }
  }

  /* ================================================================
   * 多层视差星空
   * ================================================================ */
  function buildStars() {
    stars = [];
    // 三层：远（慢、暗、小）→ 近（快、亮、大）
    const layers = [
      { speed: 26, minR: 0.5, maxR: 1.0, alpha: 0.35, count: 70 },
      { speed: 66, minR: 1.0, maxR: 1.7, alpha: 0.65, count: 48 },
      { speed: 135, minR: 1.4, maxR: 2.4, alpha: 0.95, count: 26 }
    ];
    const tints = ['#ffffff', '#cfe6ff', '#c9bfff'];
    const areaScale = clamp((W * H) / (480 * 760), 0.5, 2.2);

    layers.forEach(function (layer, li) {
      const n = Math.round(layer.count * areaScale);
      for (let i = 0; i < n; i++) {
        stars.push({
          x: rand(0, W),
          y: rand(0, H),
          r: rand(layer.minR, layer.maxR),
          speed: layer.speed,
          alpha: layer.alpha * rand(0.7, 1.1),
          tw: rand(0, Math.PI * 2),                 // 闪烁相位
          tint: li === 0 ? tints[Math.random() < 0.85 ? 0 : 1] : tints[randInt(0, 2)]
        });
      }
    });
  }

  function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

  function updateStars(dt) {
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.y += s.speed * dt;
      s.tw += dt * 3;
      if (s.y > H + 3) {
        s.y = -3;
        s.x = rand(0, W);
      }
    }
  }

  function drawStars() {
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      ctx.globalAlpha = clamp(s.alpha * (0.75 + 0.25 * Math.sin(s.tw)), 0, 1);
      ctx.fillStyle = s.tint;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ================================================================
   * 难度曲线
   * ================================================================ */
  // 敌机速度倍率：随时间与分数缓慢提升，上限 2.2
  function speedScale() {
    return Math.min(1 + elapsed / 55 + score / 14000, 2.2);
  }

  // 普通敌机生成间隔：由 1.05 秒逐步压缩到 0.32 秒
  function spawnGap() {
    return Math.max(0.32, 1.05 - elapsed * 0.010 - score * 0.000015);
  }

  // 连击倍率：每 4 连击提升 0.5 倍，上限 5 倍
  function comboMult() {
    return Math.min(1 + Math.floor(combo / 4) * 0.5, 5);
  }

  /* ================================================================
   * 新局初始化
   * ================================================================ */
  function resetGame() {
    player = {
      x: W / 2,
      y: H - 90,
      vx: 0,
      vy: 0,
      t: 0,
      fireCd: 0,
      invuln: 0,
      shield: false,
      double: 0,
      alive: true
    };
    bullets = [];
    enemies = [];
    particles = [];
    powerups = [];
    popups = [];

    score = 0;
    lives = START_LIVES;
    combo = 0;
    elapsed = 0;
    spawnTimer = 0.9;
    bigTimer = 11;
    shakeTime = 0;
    shakeMag = 0;
    touchFire = false;
    keys.clear();

    renderLives();
    updateHud();
  }

  /* ================================================================
   * 敌机生成
   * type: diver 直线俯冲 / snake 左右蛇形 / big 重装大型机
   * ================================================================ */
  function makeEnemy(type) {
    const sc = speedScale();
    if (type === 'diver') {
      return {
        type: type,
        x: rand(36, W - 36),
        y: -36,
        r: 15,
        hp: 1, maxHp: 1,
        vy: rand(155, 225) * sc,
        t: rand(0, 6),
        flash: 0,
        score: 100
      };
    }
    if (type === 'snake') {
      const amp = rand(55, 105);
      const minX = 30 + amp;
      const baseX = minX < W - 30 - amp ? rand(minX, W - 30 - amp) : W / 2;
      return {
        type: type,
        baseX: baseX,
        x: 0,
        y: -36,
        r: 15,
        hp: 1, maxHp: 1,
        vy: rand(110, 155) * sc,
        amp: amp,
        freq: rand(2.2, 3.2),
        phase: rand(0, Math.PI * 2),
        t: 0,
        flash: 0,
        score: 150
      };
    }
    // 重装大型机：多血量、慢速、掉落道具
    const bigHp = 8 + Math.min(Math.floor(elapsed / 25), 12);
    return {
      type: 'big',
      x: rand(60, W - 60),
      y: -58,
      r: 36,
      hp: bigHp, maxHp: bigHp,
      vy: rand(48, 72) * Math.min(sc, 1.5),
      t: rand(0, 6),
      flash: 0,
      score: 500
    };
  }

  function spawnMinorEnemy() {
    // 蛇形机出现概率随时间缓慢提升
    const snakeChance = Math.min(0.14 + elapsed * 0.004, 0.4);
    enemies.push(makeEnemy(Math.random() < snakeChance ? 'snake' : 'diver'));
  }

  /* ================================================================
   * 子弹与射击
   * ================================================================ */
  function shoot() {
    const noseY = player.y - 20;
    if (player.double > 0) {
      bullets.push({ x: player.x - 10, y: noseY, r: 4, vy: -BULLET_SPEED });
      bullets.push({ x: player.x + 10, y: noseY, r: 4, vy: -BULLET_SPEED });
    } else {
      bullets.push({ x: player.x, y: noseY, r: 4, vy: -BULLET_SPEED });
    }
  }

  /* ================================================================
   * 粒子特效
   * ================================================================ */
  // 通用爆炸
  function explosion(x, y, kind, power) {
    let palette;
    let count;
    let speed;
    if (kind === 'diver') {
      palette = [COLOR.pink, COLOR.orange, '#ffe3c2'];
      count = 16; speed = 150;
    } else if (kind === 'snake') {
      palette = [COLOR.orange, COLOR.pink, COLOR.white];
      count = 20; speed = 180;
    } else if (kind === 'big') {
      palette = [COLOR.main, COLOR.cyan, COLOR.pink, COLOR.white];
      count = 44; speed = 280;
    } else {
      palette = [COLOR.cyan, COLOR.main, COLOR.white];
      count = 30; speed = 230;
    }
    count = Math.round(count * power);

    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(speed * 0.25, speed);
      const life = rand(0.35, 0.8);
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: life, maxLife: life,
        size: rand(1.6, 3.6),
        color: palette[randInt(0, palette.length - 1)],
        drag: 0.92,
        ring: false
      });
    }
    // 冲击波光环
    particles.push({
      x: x, y: y, vx: 0, vy: 0,
      life: 0.35, maxLife: 0.35,
      size: kind === 'big' ? 20 : 10,
      grow: kind === 'big' ? 260 : 170,
      color: kind === 'big' ? COLOR.cyan : COLOR.white,
      ring: true
    });
  }

  // 子弹命中火花
  function sparks(x, y, color) {
    for (let i = 0; i < 5; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(40, 150);
      const life = rand(0.15, 0.35);
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: life, maxLife: life,
        size: rand(1, 2.2),
        color: color,
        drag: 0.9,
        ring: false
      });
    }
  }

  // 玩家引擎尾焰
  function engineTrail(dt) {
    if (Math.random() < dt * 55) {
      const life = rand(0.2, 0.4);
      particles.push({
        x: player.x + rand(-3, 3),
        y: player.y + 15,
        vx: rand(-18, 18) - player.vx * 0.08,
        vy: rand(100, 170),
        life: life, maxLife: life,
        size: rand(2, 3.6),
        color: Math.random() < 0.5 ? COLOR.cyan : COLOR.main,
        drag: 0.96,
        ring: false
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
      if (p.ring) {
        p.size += p.grow * dt;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= p.drag;
        p.vy *= p.drag;
      }
    }
  }

  /* ================================================================
   * 浮动提示
   * ================================================================ */
  function addPopup(x, y, text, color) {
    popups.push({ x: x, y: y, text: text, color: color, life: 0.9, maxLife: 0.9 });
  }

  function updatePopups(dt) {
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.y -= 42 * dt;
      p.life -= dt;
      if (p.life <= 0) popups.splice(i, 1);
    }
  }

  /* ================================================================
   * 道具（大型机击毁后概率掉落）
   * ================================================================ */
  function dropPowerup(x, y) {
    if (Math.random() >= 0.45) return;
    // 已有护盾时更倾向掉落双发
    let type;
    if (player.shield) {
      type = Math.random() < 0.75 ? 'double' : 'shield';
    } else {
      type = Math.random() < 0.55 ? 'double' : 'shield';
    }
    powerups.push({ x: x, y: y, vy: 95, t: 0, type: type });
  }

  function applyPowerup(type) {
    if (type === 'double') {
      player.double = DOUBLE_DURATION;
      addPopup(player.x, player.y - 28, '双发弹药', COLOR.cyan);
    } else {
      player.shield = true;
      addPopup(player.x, player.y - 28, '能量护盾', '#b9a8ff');
    }
  }

  /* ================================================================
   * 玩家受击
   * ================================================================ */
  function addShake(time, mag) {
    shakeTime = time;
    shakeDur = time;
    shakeMag = mag;
  }

  function damagePlayer() {
    if (player.shield) {
      // 护盾抵挡一次，连击保留
      player.shield = false;
      player.invuln = SHIELD_INVULN;
      addShake(0.22, 8);
      explosion(player.x, player.y, 'player', 0.5);
      addPopup(player.x, player.y - 28, '护盾抵挡', COLOR.cyan);
      return;
    }
    lives -= 1;
    combo = 0;
    player.invuln = INVULN_TIME;
    addShake(0.4, 16);
    explosion(player.x, player.y, 'player', 1);
    renderLives();
    if (lives <= 0) {
      player.alive = false;
      gameOver();
    }
  }

  /* ================================================================
   * 敌机击毁
   * ================================================================ */
  function killEnemy(index, e) {
    enemies.splice(index, 1);
    combo += 1;
    const mult = comboMult();
    const gain = Math.round(e.score * mult);
    score += gain;

    explosion(e.x, e.y, e.type, 1);
    addPopup(e.x, e.y - 6, '+' + gain, mult > 1 ? COLOR.orange : '#9fe8ff');
    if (e.type === 'big') {
      addShake(0.25, 9);
      dropPowerup(e.x, e.y);
    }
  }

  /* ================================================================
   * 主更新逻辑
   * ================================================================ */
  function updateGame(dt) {
    elapsed += dt;

    /* ---- 敌机生成 ---- */
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnMinorEnemy();
      spawnTimer = spawnGap() * rand(0.75, 1.25);
    }
    bigTimer -= dt;
    if (bigTimer <= 0) {
      enemies.push(makeEnemy('big'));
      bigTimer = rand(10, 16) - Math.min(elapsed * 0.05, 5);
    }

    /* ---- 玩家移动（键盘平滑加减速） ---- */
    player.t += dt;
    let ax = 0;
    let ay = 0;
    if (!touchFire) {
      if (keys.has('arrowleft') || keys.has('a')) ax -= 1;
      if (keys.has('arrowright') || keys.has('d')) ax += 1;
      if (keys.has('arrowup') || keys.has('w')) ay -= 1;
      if (keys.has('arrowdown') || keys.has('s')) ay += 1;
      if (ax !== 0 && ay !== 0) {
        const inv = 1 / Math.sqrt(2);
        ax *= inv;
        ay *= inv;
      }
      player.vx += (ax * PLAYER_SPEED - player.vx) * Math.min(1, dt * 14);
      player.vy += (ay * PLAYER_SPEED - player.vy) * Math.min(1, dt * 14);
      player.x += player.vx * dt;
      player.y += player.vy * dt;
    } else {
      // 触屏：手指位置平滑拖动战机
      const k = Math.min(1, dt * 16);
      player.x += (touchX - player.x) * k;
      player.y += (touchY - player.y) * k;
      player.vx = 0;
      player.vy = 0;
    }
    player.x = clamp(player.x, PLAYER_R, W - PLAYER_R);
    player.y = clamp(player.y, PLAYER_R, H - PLAYER_R);

    /* ---- 玩家状态计时与开火 ---- */
    if (player.invuln > 0) player.invuln -= dt;
    if (player.double > 0) player.double -= dt;
    if (player.fireCd > 0) player.fireCd -= dt;
    engineTrail(dt);

    const firing = keys.has(' ') || touchFire;
    if (firing && player.fireCd <= 0) {
      shoot();
      player.fireCd = player.double > 0 ? DOUBLE_FIRE_CD : FIRE_CD;
    }

    /* ---- 子弹推进 ---- */
    for (let i = bullets.length - 1; i >= 0; i--) {
      bullets[i].y += bullets[i].vy * dt;
      if (bullets[i].y < -20) bullets.splice(i, 1);
    }

    /* ---- 敌机行为 ---- */
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.t += dt;
      if (e.flash > 0) e.flash -= dt;

      if (e.type === 'diver') {
        e.y += e.vy * dt;
      } else if (e.type === 'snake') {
        e.y += e.vy * dt;
        e.x = e.baseX + Math.sin(e.t * e.freq + e.phase) * e.amp;
      } else {
        e.y += e.vy * dt;
        e.x += Math.sin(e.t * 0.8) * 18 * dt;
      }

      if (e.y - e.r > H) {
        enemies.splice(i, 1);
      }
    }

    /* ---- 道具下落 ---- */
    for (let i = powerups.length - 1; i >= 0; i--) {
      const pu = powerups[i];
      pu.t += dt;
      pu.y += pu.vy * dt;
      if (pu.y > H + 30) {
        powerups.splice(i, 1);
        continue;
      }
      if (dist2(pu.x, pu.y, player.x, player.y) < Math.pow(PLAYER_R + 18, 2)) {
        applyPowerup(pu.type);
        powerups.splice(i, 1);
      }
    }

    /* ---- 碰撞：子弹 vs 敌机 ---- */
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      let killed = false;
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        const rr = e.r + b.r;
        if (dist2(e.x, e.y, b.x, b.y) < rr * rr) {
          bullets.splice(j, 1);
          e.hp -= 1;
          e.flash = 0.08;
          sparks(b.x, b.y, e.type === 'big' ? COLOR.cyan : COLOR.orange);
          if (e.hp <= 0) {
            killEnemy(i, e);
            killed = true;
          }
          break;
        }
      }
      if (killed) continue;
    }

    /* ---- 碰撞：敌机 vs 玩家 ---- */
    if (player.invuln <= 0) {
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const rr = e.r + PLAYER_R - 3;
        if (dist2(e.x, e.y, player.x, player.y) < rr * rr) {
          enemies.splice(i, 1);
          explosion(e.x, e.y, e.type, 0.8);
          damagePlayer();
          break;
        }
      }
    }

    /* ---- 屏幕震动衰减 ---- */
    if (shakeTime > 0) shakeTime -= dt;

    updateHud();
  }

  /* ================================================================
   * 矢量绘制：玩家战机
   * ================================================================ */
  function drawPlayer() {
    if (!player.alive) return;
    // 无敌期间闪烁（每隔约 0.08 秒切换显隐）
    if (player.invuln > 0 && Math.floor(player.t * 12) % 2 === 0) return;

    ctx.save();
    ctx.translate(player.x, player.y);

    // 引擎尾焰
    const flame = 8 + Math.sin(player.t * 30) * 3 + rand(0, 2.5);
    ctx.save();
    ctx.shadowColor = COLOR.orange;
    ctx.shadowBlur = 14;
    ctx.fillStyle = COLOR.orange;
    ctx.beginPath();
    ctx.moveTo(-5, 12);
    ctx.lineTo(0, 15 + flame);
    ctx.lineTo(5, 12);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = COLOR.cyan;
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(220,245,255,.9)';
    ctx.beginPath();
    ctx.moveTo(-2.5, 12);
    ctx.lineTo(0, 14 + flame * 0.55);
    ctx.lineTo(2.5, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 机身（霓虹辉光）
    ctx.shadowColor = COLOR.cyan;
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#141a3d';
    ctx.strokeStyle = COLOR.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -21);           // 机头
    ctx.lineTo(6, -4);
    ctx.lineTo(13, 13);          // 右翼尖
    ctx.lineTo(6, 9);
    ctx.lineTo(-6, 9);
    ctx.lineTo(-13, 13);         // 左翼尖
    ctx.lineTo(-6, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 机翼紫色光带
    ctx.shadowColor = COLOR.main;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = COLOR.main;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-11, 10);
    ctx.lineTo(-4, -2);
    ctx.moveTo(11, 10);
    ctx.lineTo(4, -2);
    ctx.stroke();

    // 座舱
    ctx.shadowColor = COLOR.main;
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#b9a8ff';
    ctx.beginPath();
    ctx.ellipse(0, -5, 3, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 能量护盾
    if (player.shield) {
      ctx.shadowColor = COLOR.cyan;
      ctx.shadowBlur = 16;
      ctx.strokeStyle = 'rgba(34,211,238,.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.stroke();
      // 旋转的明亮弧段
      const a0 = player.t * 2.4;
      ctx.strokeStyle = 'rgba(180,245,255,.9)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, 26, a0, a0 + 1.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 26, a0 + Math.PI, a0 + Math.PI + 1.3);
      ctx.stroke();
    }

    ctx.restore();
  }

  /* ================================================================
   * 矢量绘制：敌机
   * ================================================================ */
  // 直线俯冲机：下冲箭头
  function drawDiver(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    const hit = e.flash > 0;
    ctx.shadowColor = COLOR.pink;
    ctx.shadowBlur = 13;
    ctx.fillStyle = 'rgba(255,92,168,.14)';
    ctx.strokeStyle = hit ? COLOR.white : COLOR.pink;
    ctx.lineWidth = hit ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(13, -10);
    ctx.lineTo(5, -4);
    ctx.lineTo(-5, -4);
    ctx.lineTo(-13, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 核心
    ctx.shadowBlur = 8;
    ctx.fillStyle = hit ? COLOR.white : '#ffd0df';
    ctx.beginPath();
    ctx.arc(0, 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 蛇形机：菱形
  function drawSnake(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(Math.sin(e.t * e.freq + e.phase) * 0.18);
    const hit = e.flash > 0;
    ctx.shadowColor = COLOR.orange;
    ctx.shadowBlur = 13;
    ctx.fillStyle = 'rgba(255,179,71,.13)';
    ctx.strokeStyle = hit ? COLOR.white : COLOR.orange;
    ctx.lineWidth = hit ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(0, 15);
    ctx.lineTo(13, 0);
    ctx.lineTo(0, -15);
    ctx.lineTo(-13, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 内部小菱形
    ctx.shadowBlur = 6;
    ctx.strokeStyle = hit ? COLOR.white : '#ffe3b0';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.lineTo(6, 0);
    ctx.lineTo(0, -7);
    ctx.lineTo(-6, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // 重装大型机：六边形重甲 + 旋转内核 + 血条
  function drawBig(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    const hit = e.flash > 0;

    // 六边形外甲
    ctx.shadowColor = COLOR.main;
    ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(124,92,255,.13)';
    ctx.strokeStyle = hit ? COLOR.white : COLOR.main;
    ctx.lineWidth = hit ? 3.6 : 2.6;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = e.t * 0.5 + i * Math.PI / 3;
      const px = Math.cos(a) * 33;
      const py = Math.sin(a) * 33;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 反向旋转内环
    ctx.shadowColor = COLOR.cyan;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = hit ? COLOR.white : COLOR.cyan;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = -e.t * 0.9 + i * (Math.PI * 2 / 3);
      const px = Math.cos(a) * 18;
      const py = Math.sin(a) * 18;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

    // 能量核心
    ctx.shadowColor = COLOR.pink;
    ctx.shadowBlur = 16;
    ctx.fillStyle = hit ? COLOR.white : COLOR.pink;
    ctx.beginPath();
    ctx.arc(0, 0, 6 + Math.sin(e.t * 6) * 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 血条
    const barW = 66;
    const ratio = clamp(e.hp / e.maxHp, 0, 1);
    const bx = e.x - barW / 2;
    const by = e.y - 50;
    ctx.fillStyle = 'rgba(255,255,255,.15)';
    ctx.beginPath();
    ctx.rect(bx, by, barW, 5);
    ctx.fill();
    ctx.shadowColor = COLOR.cyan;
    ctx.shadowBlur = 8;
    ctx.fillStyle = ratio > 0.35 ? COLOR.cyan : COLOR.pink;
    ctx.beginPath();
    ctx.rect(bx, by, barW * ratio, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  /* ================================================================
   * 矢量绘制：子弹、道具、粒子、提示
   * ================================================================ */
  function drawBullets() {
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      ctx.shadowColor = COLOR.cyan;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = COLOR.cyan;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 8);
      ctx.lineTo(b.x, b.y + 8);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = COLOR.white;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 7);
      ctx.lineTo(b.x, b.y + 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 圆角矩形路径
  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function drawPowerups() {
    for (let i = 0; i < powerups.length; i++) {
      const pu = powerups[i];
      const isDouble = pu.type === 'double';
      const c = isDouble ? COLOR.cyan : COLOR.main;
      const bobY = pu.y + Math.sin(pu.t * 4) * 4;

      ctx.save();
      ctx.translate(pu.x, bobY);
      ctx.rotate(Math.sin(pu.t * 2) * 0.18);

      ctx.shadowColor = c;
      ctx.shadowBlur = 15;
      ctx.fillStyle = 'rgba(10,14,40,.75)';
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      roundRectPath(-13, -13, 26, 26, 7);
      ctx.fill();
      ctx.stroke();

      ctx.rotate(-Math.sin(pu.t * 2) * 0.18);
      ctx.shadowBlur = 8;
      ctx.strokeStyle = COLOR.white;
      ctx.fillStyle = COLOR.white;
      ctx.lineWidth = 2;

      if (isDouble) {
        // 双发图标：两枚向上的小箭头
        [-5, 5].forEach(function (dx) {
          ctx.beginPath();
          ctx.moveTo(dx, 6);
          ctx.lineTo(dx, -4);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(dx - 3.5, -1);
          ctx.lineTo(dx, -6);
          ctx.lineTo(dx + 3.5, -1);
          ctx.stroke();
        });
      } else {
        // 护盾图标：盾形
        ctx.beginPath();
        ctx.moveTo(-7, -5);
        ctx.quadraticCurveTo(0, -8, 7, -5);
        ctx.lineTo(7, 2);
        ctx.quadraticCurveTo(7, 8, 0, 11);
        ctx.quadraticCurveTo(-7, 8, -7, 2);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawParticles() {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      if (p.ring) {
        ctx.strokeStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 2.5 * alpha + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function drawPopups() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 15px "Segoe UI","Microsoft YaHei",system-ui,sans-serif';
    for (let i = 0; i < popups.length; i++) {
      const p = popups[i];
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  /* ================================================================
   * 总渲染
   * ================================================================ */
  function render() {
    ctx.clearRect(0, 0, W, H);

    // 星空不参与屏幕震动，保持背景稳定
    drawStars();

    ctx.save();
    if (shakeTime > 0) {
      const k = shakeTime / shakeDur;
      ctx.translate(rand(-1, 1) * shakeMag * k, rand(-1, 1) * shakeMag * k);
    }

    drawPowerups();
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.type === 'diver') drawDiver(e);
      else if (e.type === 'snake') drawSnake(e);
      else drawBig(e);
    }
    drawBullets();
    if (player) drawPlayer();
    drawParticles();
    drawPopups();

    ctx.restore();
  }

  /* ================================================================
   * HUD 更新
   * ================================================================ */
  function updateHud() {
    scoreEl.textContent = score;
    bestEl.textContent = best;

    if (combo >= 2) {
      const m = comboMult();
      const mText = (m % 1 === 0) ? String(m) : m.toFixed(1);
      comboEl.textContent = '连击 x' + combo + ' · ' + mText + ' 倍';
      comboEl.classList.remove('hidden');
    } else {
      comboEl.classList.add('hidden');
    }

    if (player && player.double > 0) {
      chipDouble.classList.remove('hidden');
      doubleTimeEl.textContent = Math.max(0, player.double).toFixed(1);
    } else {
      chipDouble.classList.add('hidden');
    }

    if (player && player.shield) {
      chipShield.classList.remove('hidden');
    } else {
      chipShield.classList.add('hidden');
    }
  }

  function renderLives() {
    let html = '';
    for (let i = 0; i < lives; i++) html += LIFE_ICON;
    livesEl.innerHTML = html;
  }

  /* ================================================================
   * 流程控制：开始 / 暂停 / 结束
   * ================================================================ */
  function hideOverlays() {
    startOverlay.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
    overOverlay.classList.add('hidden');
  }

  function beginGame() {
    resetGame();
    hideOverlays();
    state = 'playing';
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    keys.clear();
    touchFire = false;
    pauseOverlay.classList.remove('hidden');
  }

  function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing';
    pauseOverlay.classList.add('hidden');
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  }

  function togglePause() {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  }

  function gameOver() {
    state = 'over';
    keys.clear();
    touchFire = false;

    const isRecord = score > best;
    if (isRecord) {
      best = score;
      saveBest();
    }
    finalScoreEl.textContent = score;
    finalBestEl.textContent = best;
    recordTipEl.classList.toggle('hidden', !isRecord);
    overOverlay.classList.remove('hidden');
    updateHud();
  }

  /* ================================================================
   * 画布尺寸自适应（devicePixelRatio 清晰渲染）
   * ================================================================ */
  function resize() {
    const rect = stage.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    buildStars();
    if (player) {
      player.x = clamp(player.x, PLAYER_R, W - PLAYER_R);
      player.y = clamp(player.y, PLAYER_R, H - PLAYER_R);
    }
  }

  /* ================================================================
   * 输入：键盘
   * ================================================================ */
  window.addEventListener('keydown', function (e) {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'arrowright' || k === 'arrowup' ||
        k === 'arrowdown' || k === ' ') {
      e.preventDefault();
    }
    if (k === 'escape' || k === 'p') {
      togglePause();
      return;
    }
    if (state === 'playing') keys.add(k);
  });

  window.addEventListener('keyup', function (e) {
    keys.delete(e.key.toLowerCase());
  });

  /* ================================================================
   * 输入：触屏拖动（手指拖动战机，自动开火）
   * ================================================================ */
  function updateTouch(e) {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches[0];
    if (!t) return;
    touchX = clamp(t.clientX - rect.left, PLAYER_R, W - PLAYER_R);
    // 手指上方偏移，避免手指遮挡战机
    touchY = clamp(t.clientY - rect.top - 56, PLAYER_R, H - PLAYER_R);
  }

  canvas.addEventListener('touchstart', function (e) {
    if (state !== 'playing') return;
    e.preventDefault();
    touchFire = true;
    updateTouch(e);
  }, { passive: false });

  canvas.addEventListener('touchmove', function (e) {
    if (state !== 'playing') return;
    e.preventDefault();
    updateTouch(e);
  }, { passive: false });

  function endTouch(e) {
    e.preventDefault();
    touchFire = false;
  }
  canvas.addEventListener('touchend', endTouch, { passive: false });
  canvas.addEventListener('touchcancel', endTouch, { passive: false });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ================================================================
   * 按钮、失焦与可见性
   * ================================================================ */
  startBtn.addEventListener('click', beginGame);
  againBtn.addEventListener('click', beginGame);
  resumeBtn.addEventListener('click', resumeGame);
  pauseBtn.addEventListener('click', togglePause);

  window.addEventListener('blur', pauseGame);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pauseGame();
  });

  /* ================================================================
   * 主循环
   * ================================================================ */
  function frame(now) {
    // delta time，限制单帧最大步长，防止切后台后跳变
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    updateStars(dt);
    if (state === 'playing') {
      updateGame(dt);
    } else {
      // 菜单 / 暂停 / 结束时仍让粒子与提示自然消散
      updateParticles(dt);
      updatePopups(dt);
      if (shakeTime > 0) shakeTime -= dt;
    }

    render();
    requestAnimationFrame(frame);
  }

  /* ================================================================
   * 启动
   * ================================================================ */
  loadBest();
  resize();
  renderLives();
  updateHud();

  let lastTime = performance.now();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);
})();
