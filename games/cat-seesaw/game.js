/*
 * 和小猫玩跷跷板 —— 纯 Canvas 2D 实现，零依赖、零外部资源
 * 自研 2D 物理：长板绕中央支点作定轴转动，角色沿板轴作一维运动；
 * 角加速度 = 重力矩之和 / 总转动惯量（板自身惯量 + 角色质点惯量），
 * 角色受重力沿板分量、静/动摩擦与离心项影响会自行滑移。
 */
(function () {
  'use strict';

  // ==================== 全局配置 ====================

  const CFG = {
    phys: {
      L: 250,          // 板的半长（逻辑像素）
      g: 500,          // 重力加速度（像素/秒²）
      boardMass: 950,  // 板质量：板较重，决定倾斜的节奏
      edge: 26,        // 角色距板端的最小距离
      muS: 0.18,       // 静摩擦系数（约 10° 以内可站稳）
      muK: 0.1,        // 动摩擦系数
      dragLin: 0.9,    // 支点线性角阻尼
      dragQuad: 0.22   // 支点二次角阻尼
    },
    critAngle: 22 * Math.PI / 180, // 临界倾角
    dangerHold: 1.5,               // 超临界持续多久判负（秒）
    graceTime: 3.0,                // 开局宽限期（秒）
    playerMasses: [60, 85, 120],   // 玩家三档重量
    playerSizes: [0.9, 1.0, 1.14], // 三档体型缩放
    gearNames: ['轻', '中', '重'],
    playerStartS: -110,
    catMass: 75,
    catSitMul: 1.5,                // 坐下打盹时增重倍数
    catStartS: 118,
    playerMaxSpeed: 240,
    levelEvery: 10,                // 每 10 秒一关
    bestKey: 'best_cat-seesaw'
  };

  // ==================== 物理核心（纯逻辑类，可在 Node 中独立自测） ====================

  class PhysicsWorld {
    constructor(opts) {
      const o = opts || CFG.phys;
      this.L = o.L;
      this.g = o.g;
      this.boardMass = o.boardMass;
      this.edge = o.edge;
      this.muS = o.muS;
      this.muK = o.muK;
      this.dragLin = o.dragLin;
      this.dragQuad = o.dragQuad;
      this.theta = 0;  // 板倾角（弧度），正值表示右端下沉、顺时针转动
      this.omega = 0;  // 角速度（弧度/秒）
      this.bodies = [];
    }

    // 添加一个沿板移动的角色（质点）
    addBody(cfg) {
      const b = {
        s: cfg.s,                       // 沿板坐标（相对支点，向右为正）
        v: 0,                           // 沿板速度
        mass: cfg.mass,
        slide: cfg.slide !== false,     // 是否可滑移（坐下时紧抓板面）
        extV: null,                     // 主动移动的期望速度（null 表示不施力）
        accel: cfg.accel || 1200,       // 逼近期望速度的加速度
        muS: cfg.muS != null ? cfg.muS : this.muS,
        muK: cfg.muK != null ? cfg.muK : this.muK
      };
      this.bodies.push(b);
      return b;
    }

    // 总转动惯量：板绕中心 (1/12)M(2L)² = ML²/3，加各质点 m·s²
    inertia() {
      let I = this.boardMass * this.L * this.L / 3;
      for (const b of this.bodies) I += b.mass * b.s * b.s;
      return I;
    }

    // 重力矩之和：τ = m·g·s·cosθ（右侧质量产生顺时针力矩）
    gravityTorque() {
      let t = 0;
      const c = Math.cos(this.theta);
      for (const b of this.bodies) t += b.mass * this.g * b.s * c;
      return t;
    }

    // 固定步长推进一次
    step(h) {
      // ---- 定轴转动：α = Στ / I，叠加支点阻尼力矩 ----
      const I = this.inertia();
      let alpha = this.gravityTorque() / I;
      alpha -= this.dragLin * this.omega;
      alpha -= this.dragQuad * this.omega * Math.abs(this.omega);
      this.omega += alpha * h;
      this.theta += this.omega * h;

      // ---- 各角色沿板的一维运动 ----
      const sin = Math.sin(this.theta);
      const cos = Math.cos(this.theta);
      const limit = this.L - this.edge;
      for (const b of this.bodies) {
        if (!b.slide) { // 坐下打盹时紧抓板面
          b.v = 0;
          b.extV = null;
          continue;
        }
        // 重力沿板分量 g·sinθ，加旋转参考系中的离心项 s·ω²
        const tang = this.g * sin + b.s * this.omega * this.omega;
        const normalG = this.g * cos;
        let a;
        if (Math.abs(b.v) > 1) {
          // 滑动中：动摩擦与速度反向
          a = tang - b.muK * normalG * Math.sign(b.v);
        } else if (Math.abs(tang) > b.muS * normalG) {
          // 重力沿板分量超过最大静摩擦，开始下滑
          a = tang - b.muK * normalG * Math.sign(tang);
        } else {
          // 静摩擦平衡，站稳不动
          a = 0;
          b.v = 0;
        }
        b.v += a * h;

        // 主动移动：朝期望速度有限加速度逼近
        if (b.extV !== null) {
          const dv = b.extV - b.v;
          const maxDv = b.accel * h;
          b.v += Math.max(-maxDv, Math.min(maxDv, dv));
        }

        b.s += b.v * h;
        // 沿板位置硬限制，角色不得穿板、不得离开板端
        if (b.s > limit) { b.s = limit; if (b.v > 0) b.v = 0; }
        if (b.s < -limit) { b.s = -limit; if (b.v < 0) b.v = 0; }
      }
    }
  }

  // Node 物理桩自测导出；浏览器环境继续执行后续界面逻辑
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PhysicsWorld: PhysicsWorld, CFG: CFG };
  }
  if (typeof window === 'undefined') {
    return;
  }

  // ==================== DOM 引用 ====================

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');

  const timeVal = document.getElementById('timeVal');
  const bestVal = document.getElementById('bestVal');
  const levelVal = document.getElementById('levelVal');
  const scoreVal = document.getElementById('scoreVal');
  const weightLabel = document.getElementById('weightLabel');

  const startOverlay = document.getElementById('startOverlay');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const overOverlay = document.getElementById('overOverlay');
  const overTitle = document.getElementById('overTitle');
  const overReason = document.getElementById('overReason');
  const finalTimeEl = document.getElementById('finalTime');
  const finalLevelEl = document.getElementById('finalLevel');
  const finalScoreEl = document.getElementById('finalScore');
  const finalBestEl = document.getElementById('finalBest');
  const recordTip = document.getElementById('recordTip');

  const pauseBtn = document.getElementById('pauseBtn');
  const startBtn = document.getElementById('startBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const againBtn = document.getElementById('againBtn');
  const btnLeft = document.getElementById('btnLeft');
  const btnRight = document.getElementById('btnRight');
  const btnWeight = document.getElementById('btnWeight');

  // ==================== 运行时状态 ====================

  let cssW = 0;                // 画布 CSS 像素宽
  let cssH = 0;
  let dpr = 1;
  let viewScale = 1;           // 逻辑像素到屏幕像素的缩放
  let pivotSX = 0;             // 支点顶点屏幕坐标
  let pivotSY = 0;

  // ready 准备 / playing 进行 / paused 暂停 / over 结束
  let gameState = 'ready';
  let world = null;
  let player = null;
  let cat = null;
  let playerGear = 1;
  let catAI = null;
  let items = [];
  let popups = [];
  let notices = [];
  let stars = [];
  let dust = [];

  let elapsed = 0;
  let score = 0;
  let level = 1;
  let dangerT = 0;
  let perfectT = 0;
  let itemTimer = 13;
  let animT = 0;
  let playerPhase = 0;
  let catPhase = 0;

  const keys = { left: false, right: false };

  let best = 0;
  try {
    best = parseInt(localStorage.getItem(CFG.bestKey), 10) || 0;
  } catch (e) {
    best = 0;
  }
  bestVal.textContent = String(best);

  // ==================== 工具函数 ====================

  const clamp = function (v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  };
  const rand = function (lo, hi) {
    return lo + Math.random() * (hi - lo);
  };

  // 读取最高分
  function saveBest(v) {
    best = v;
    bestVal.textContent = String(v);
    try {
      localStorage.setItem(CFG.bestKey, String(v));
    } catch (e) {
      /* 本地存储不可用时静默忽略 */
    }
  }

  // ==================== 开局 / 重开 ====================

  function resetGame() {
    world = new PhysicsWorld();
    player = world.addBody({ s: CFG.playerStartS, mass: CFG.playerMasses[1], accel: 1500 });
    cat = world.addBody({ s: CFG.catStartS, mass: CFG.catMass, accel: 760 });
    player.face = 1;
    cat.face = -1;
    playerGear = 1;
    weightLabel.textContent = CFG.gearNames[1];

    // 橘猫 AI：idle 发呆 / walk 散步 / sit 坐下打盹；happy 为吃到东西后的奖励态
    catAI = { mode: 'idle', timer: CFG.graceTime, target: 0, face: -1, happy: 0 };

    items = [];
    popups = [];
    notices = [{ text: '稳住，别动太快！', t: 1.8, max: 1.8 }];
    elapsed = 0;
    score = 0;
    level = 1;
    dangerT = 0;
    perfectT = 0;
    itemTimer = 13;
    playerPhase = 0;
    catPhase = 0;
    player.mass = CFG.playerMasses[playerGear];
    updateHud();
  }

  function startGame() {
    resetGame();
    gameState = 'playing';
    startOverlay.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
    overOverlay.classList.add('hidden');
  }

  function pauseGame() {
    if (gameState !== 'playing') return;
    gameState = 'paused';
    pauseOverlay.classList.remove('hidden');
  }

  function resumeGame() {
    if (gameState !== 'paused') return;
    gameState = 'playing';
    pauseOverlay.classList.add('hidden');
  }

  function gameOver() {
    gameState = 'over';
    const highSide = world.theta > 0 ? -1 : 1; // 上翘的一侧
    const playerLifted = player.s * highSide > 30;
    const catLifted = cat.s * highSide > 30;
    if (playerLifted && !catLifted) {
      overTitle.textContent = '你被翘飞啦';
      overReason.textContent = '跷跷板倾斜太久，你从高的一端摔了下去。';
    } else if (catLifted && !playerLifted) {
      overTitle.textContent = '小猫摔下去了';
      overReason.textContent = '橘猫被翘到了半空，生气地跑掉了。';
    } else {
      overTitle.textContent = '平衡告破';
      overReason.textContent = '跷跷板翻过了临界角度。';
    }

    const finalScore = Math.floor(score);
    const isRecord = finalScore > best;
    if (isRecord) saveBest(finalScore);

    finalTimeEl.textContent = elapsed.toFixed(1) + '秒';
    finalLevelEl.textContent = String(level);
    finalScoreEl.textContent = String(finalScore);
    finalBestEl.textContent = String(best);
    recordTip.classList.toggle('hidden', !isRecord);
    overOverlay.classList.remove('hidden');
  }
  // ==================== 飘字与公告 ====================

  function addPopup(wx, wy, text, color) {
    popups.push({ x: wx, y: wy, text: text, color: color, t: 1.4, max: 1.4 });
  }

  function addNotice(text) {
    notices.push({ text: text, t: 1.8, max: 1.8 });
  }

  // ==================== 橘猫 AI ====================

  // 随关卡缩短的发呆间隔
  function catIdleInterval() {
    return (3.4 / (1 + 0.22 * (level - 1))) * rand(0.7, 1.3);
  }

  function decideCatMove() {
    // 坐下打盹：增重且不动，玩家要预判这份额外重量
    const sitP = Math.min(0.14 + 0.02 * (level - 1), 0.3);
    if (Math.random() < sitP) {
      catAI.mode = 'sit';
      catAI.timer = rand(2.2, 4.2);
      cat.extV = null;
      return;
    }
    // 随机小步移动，关卡越高步子越大
    const maxRange = Math.min(120 + 8 * (level - 1), 195);
    const step = rand(36, 78) + 6 * (level - 1);
    let target = cat.s + (Math.random() < 0.5 ? -1 : 1) * step;
    target = clamp(target, -maxRange, maxRange);
    catAI.target = target;
    catAI.mode = 'walk';
  }

  function updateCatAI(dt) {
    const a = catAI;
    const sitMass = CFG.catMass * CFG.catSitMul;
    const isSitting = a.mode === 'sit' && a.happy <= 0;
    cat.mass = isSitting ? sitMass : CFG.catMass;
    cat.slide = !isSitting;

    // 开心奖励：快速跑向板中心并停留约 2 秒
    if (a.happy > 0) {
      a.happy -= dt;
      if (Math.abs(cat.s) < 10) {
        cat.extV = 0;
        cat.v = 0;
      } else {
        a.face = cat.s > 0 ? -1 : 1;
        cat.extV = (cat.s > 0 ? -1 : 1) * 130;
      }
      if (a.happy <= 0) {
        a.mode = 'idle';
        a.timer = rand(0.6, 1.2);
      }
      return;
    }

    const speed = Math.min(36 + 6 * (level - 1), 82);

    if (a.mode === 'sit') {
      cat.extV = null;
      if (a.timer <= 0) {
        a.mode = 'idle';
        a.timer = rand(0.4, 1.0);
      }
      return;
    }

    if (a.mode === 'walk') {
      const d = a.target - cat.s;
      if (Math.abs(d) < 7) {
        cat.extV = null;
        a.mode = 'idle';
        a.timer = catIdleInterval();
      } else {
        a.face = d >= 0 ? 1 : -1;
        cat.extV = Math.sign(d) * speed;
      }
      return;
    }

    // idle：宽限期内只等待，宽限一结束立即做第一次决定
    cat.extV = null;
    a.face = player.s < cat.s ? -1 : 1;
    a.timer -= dt;
    if (a.timer <= 0) {
      if (elapsed >= CFG.graceTime) decideCatMove();
      else a.timer = 0.05;
    }
  }

  // ==================== 鱼 / 毛线球 道具 ====================

  function spawnItem() {
    if (items.length >= 2) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    items.push({
      s: side * rand(95, 200),
      kind: Math.random() < 0.5 ? 'fish' : 'yarn',
      fall: 0,
      fallDur: 0.85,
      age: 0,
      life: 14
    });
    addNotice('有东西掉到板上了，点它！');
  }

  function updateItems(dt) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.fall < it.fallDur) {
        it.fall += dt;
      } else {
        it.age += dt;
        if (it.age >= it.life) items.splice(i, 1);
      }
    }
    if (level >= 2) {
      itemTimer -= dt;
      if (itemTimer <= 0) {
        spawnItem();
        itemTimer = rand(9, 15);
      }
    }
  }

  // 屏幕坐标拾取道具
  function tryPickup(cssX, cssY) {
    if (gameState !== 'playing') return;
    const vx = (cssX - pivotSX) / viewScale;
    const vy = (cssY - pivotSY) / viewScale;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.fall < it.fallDur) continue;
      const bx = it.s * Math.cos(world.theta);
      const by = it.s * Math.sin(world.theta) - 14;
      const dx = vx - bx;
      const dy = vy - by;
      if (dx * dx + dy * dy < 32 * 32) {
        items.splice(i, 1);
        score += 30;
        addPopup(bx, by - 24, '+30 小猫开心', '#ff5ca8');
        // 猫开心地移向中心，给玩家约 2 秒喘息奖励
        catAI.happy = 2.3;
        catAI.mode = 'walk';
        cat.slide = true;
        return;
      }
    }
  }

  // ==================== 玩家重量档位 ====================

  function changeGear(dir) {
    if (gameState !== 'playing') return;
    const old = playerGear;
    playerGear = clamp(playerGear + dir, 0, 2);
    if (playerGear === old) return;
    player.mass = CFG.playerMasses[playerGear];
    weightLabel.textContent = CFG.gearNames[playerGear];
    const bx = player.s * Math.cos(world.theta);
    const by = player.s * Math.sin(world.theta) - 78;
    addPopup(bx, by, '重量：' + CFG.gearNames[playerGear], '#ffb347');
  }

  function cycleWeight() {
    if (gameState !== 'playing') return;
    playerGear = (playerGear + 1) % 3;
    player.mass = CFG.playerMasses[playerGear];
    weightLabel.textContent = CFG.gearNames[playerGear];
    const bx = player.s * Math.cos(world.theta);
    const by = player.s * Math.sin(world.theta) - 78;
    addPopup(bx, by, '重量：' + CFG.gearNames[playerGear], '#ffb347');
  }

  // ==================== 主更新 ====================

  function update(dt) {
    elapsed += dt;

    // 玩家输入 → 期望速度
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (dir !== 0) {
      player.extV = dir * CFG.playerMaxSpeed;
      player.face = dir;
    } else {
      player.extV = null;
    }

    updateCatAI(dt);
    updateItems(dt);

    // 动画步态相位
    playerPhase += Math.abs(player.v) * dt * 0.055;
    catPhase += Math.abs(cat.v) * dt * 0.09;

    // 关卡推进
    const newLevel = 1 + Math.floor(elapsed / CFG.levelEvery);
    if (newLevel > level) {
      level = newLevel;
      score += 20 * level;
      addNotice('第 ' + level + ' 关 · 橘猫更活跃了');
      spawnItem();
    }

    // 生存得分
    score += dt * 10;

    // 完美平衡：角度小于 3° 且角速度很小，每 2 秒奖分
    const flat = 3 * Math.PI / 180;
    if (elapsed > CFG.graceTime &&
        Math.abs(world.theta) < flat && Math.abs(world.omega) < 0.06) {
      perfectT += dt;
      if (perfectT >= 2) {
        perfectT = 0;
        score += 50;
        addPopup(0, -70, '+50 完美平衡', '#22d3ee');
      }
    } else {
      perfectT = 0;
    }

    // 超临界持续计时：宽限期与回正后都会清零/回退
    if (elapsed < CFG.graceTime) {
      dangerT = 0;
    } else if (Math.abs(world.theta) > CFG.critAngle) {
      dangerT += dt;
      if (dangerT >= CFG.dangerHold) {
        gameOver();
        return;
      }
    } else {
      dangerT = Math.max(0, dangerT - dt * 1.6);
    }

    // 飘字与公告
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.t -= dt;
      p.y -= 20 * dt;
      if (p.t <= 0) popups.splice(i, 1);
    }
    for (let i = notices.length - 1; i >= 0; i--) {
      notices[i].t -= dt;
      if (notices[i].t <= 0) notices.splice(i, 1);
    }

    updateHud();
  }

  function updateHud() {
    timeVal.textContent = elapsed.toFixed(1) + '秒';
    levelVal.textContent = String(level);
    scoreVal.textContent = String(Math.floor(score));
  }

  // ==================== 键盘输入 ====================

  const gameKeyCodes = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];

  window.addEventListener('keydown', function (e) {
    const k = e.key;
    if (gameKeyCodes.indexOf(k) !== -1) e.preventDefault();

    if (k === 'Escape' || k === 'p' || k === 'P') {
      if (gameState === 'playing') pauseGame();
      else if (gameState === 'paused') resumeGame();
      return;
    }
    if (gameState === 'ready' && (k === 'Enter' || k === ' ')) {
      startGame();
      return;
    }
    if (gameState === 'over' && k === 'Enter') {
      startGame();
      return;
    }
    if (gameState !== 'playing') return;

    if (k === 'a' || k === 'A' || k === 'ArrowLeft') keys.left = true;
    if (k === 'd' || k === 'D' || k === 'ArrowRight') keys.right = true;
    if (!e.repeat && (k === 'w' || k === 'W' || k === 'ArrowUp')) changeGear(1);
    if (!e.repeat && (k === 's' || k === 'S' || k === 'ArrowDown')) changeGear(-1);
  });

  window.addEventListener('keyup', function (e) {
    const k = e.key;
    if (k === 'a' || k === 'A' || k === 'ArrowLeft') keys.left = false;
    if (k === 'd' || k === 'D' || k === 'ArrowRight') keys.right = false;
  });

  // 失焦自动暂停
  window.addEventListener('blur', pauseGame);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') pauseGame();
  });

  // ==================== 触屏按钮 ====================

  function bindHold(btn, prop) {
    const on = function (e) {
      e.preventDefault();
      keys[prop] = true;
      btn.classList.add('pressed');
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    };
    const off = function (e) {
      e.preventDefault();
      keys[prop] = false;
      btn.classList.remove('pressed');
    };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', function () {
      keys[prop] = false;
      btn.classList.remove('pressed');
    });
  }
  bindHold(btnLeft, 'left');
  bindHold(btnRight, 'right');
  btnWeight.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    cycleWeight();
  });

  // 点击画布拾取道具
  canvas.addEventListener('pointerdown', function (e) {
    const rect = canvas.getBoundingClientRect();
    tryPickup(e.clientX - rect.left, e.clientY - rect.top);
  });

  // ==================== 界面按钮 ====================

  startBtn.addEventListener('click', startGame);
  resumeBtn.addEventListener('click', resumeGame);
  againBtn.addEventListener('click', startGame);
  pauseBtn.addEventListener('click', function () {
    if (gameState === 'playing') pauseGame();
    else if (gameState === 'paused') resumeGame();
  });
  // ==================== 画布自适应 ====================

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = stage.clientWidth;
    cssH = stage.clientHeight;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
  }
  window.addEventListener('resize', resize);

  // 程序化生成背景星空与萤火
  function buildBackdrop() {
    stars = [];
    for (let i = 0; i < 110; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random() * 0.72,
        r: rand(0.5, 1.7),
        ph: rand(0, Math.PI * 2),
        sp: rand(0.6, 2.0)
      });
    }
    dust = [];
    const dustCols = ['#22d3ee', '#ff5ca8', '#7c5cff'];
    for (let i = 0; i < 9; i++) {
      dust.push({
        x: rand(0.08, 0.92),
        y: rand(0.25, 0.75),
        ph: rand(0, Math.PI * 2),
        sp: rand(0.5, 1.2),
        drift: rand(0.015, 0.05),
        col: dustCols[i % dustCols.length]
      });
    }
  }

  // 圆角矩形路径
  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.lineTo(x + w - rr, y);
    c.arcTo(x + w, y, x + w, y + rr, rr);
    c.lineTo(x + w, y + h - rr);
    c.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    c.lineTo(x + rr, y + h);
    c.arcTo(x, y + h, x, y + h - rr, rr);
    c.lineTo(x, y + rr);
    c.arcTo(x, y, x + rr, y, rr);
    c.closePath();
  }

  // ==================== 背景层 ====================

  function drawBackground() {
    // 星星
    for (const s of stars) {
      const a = 0.25 + 0.6 * Math.abs(Math.sin(animT * s.sp + s.ph));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#dfe6ff';
      ctx.beginPath();
      ctx.arc(s.x * cssW, s.y * cssH, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 月亮
    const mx = cssW * 0.84;
    const my = cssH * 0.15;
    const mr = Math.max(22, cssH * 0.055);
    const glow = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 3.4);
    glow.addColorStop(0, 'rgba(224,230,255,0.35)');
    glow.addColorStop(1, 'rgba(224,230,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(mx - mr * 3.4, my - mr * 3.4, mr * 6.8, mr * 6.8);
    ctx.fillStyle = '#f2f4ff';
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(190,198,230,0.5)';
    ctx.beginPath();
    ctx.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.16, 0, Math.PI * 2);
    ctx.arc(mx + mr * 0.25, my + mr * 0.28, mr * 0.11, 0, Math.PI * 2);
    ctx.arc(mx + mr * 0.4, my - mr * 0.35, mr * 0.08, 0, Math.PI * 2);
    ctx.fill();

    // 远山剪影
    const groundY = pivotSY + 74 * viewScale;
    ctx.fillStyle = 'rgba(124,92,255,0.10)';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(cssW * 0.12, groundY - cssH * 0.12);
    ctx.lineTo(cssW * 0.26, groundY - cssH * 0.05);
    ctx.lineTo(cssW * 0.42, groundY - cssH * 0.15);
    ctx.lineTo(cssW * 0.58, groundY - cssH * 0.06);
    ctx.lineTo(cssW * 0.74, groundY - cssH * 0.13);
    ctx.lineTo(cssW * 0.9, groundY - cssH * 0.04);
    ctx.lineTo(cssW, groundY - cssH * 0.1);
    ctx.lineTo(cssW, groundY);
    ctx.closePath();
    ctx.fill();

    // 地面辉光
    const gg = ctx.createLinearGradient(0, groundY - 30, 0, groundY + 90);
    gg.addColorStop(0, 'rgba(124,92,255,0)');
    gg.addColorStop(1, 'rgba(124,92,255,0.14)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, groundY - 30, cssW, 120);

    // 流萤
    for (const d of dust) {
      const x = (d.x + Math.sin(animT * d.sp * 0.4 + d.ph) * d.drift) * cssW;
      const y = (d.y + Math.cos(animT * d.sp * 0.3 + d.ph) * d.drift) * cssH;
      const a = 0.25 + 0.55 * Math.abs(Math.sin(animT * d.sp + d.ph));
      ctx.globalAlpha = a;
      ctx.shadowColor = d.col;
      ctx.shadowBlur = 10;
      ctx.fillStyle = d.col;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  function drawGroundLine() {
    const y = pivotSY + 74 * viewScale;
    const grad = ctx.createLinearGradient(0, 0, cssW, 0);
    grad.addColorStop(0, 'rgba(124,92,255,0)');
    grad.addColorStop(0.5, 'rgba(124,92,255,0.8)');
    grad.addColorStop(1, 'rgba(124,92,255,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.shadowColor = '#7c5cff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cssW, y);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ==================== 三角支点 ====================

  function drawPivot() {
    ctx.save();
    ctx.translate(pivotSX, pivotSY);
    ctx.scale(viewScale, viewScale);
    const grad = ctx.createLinearGradient(0, 0, 0, 74);
    grad.addColorStop(0, '#3b2f6e');
    grad.addColorStop(1, '#1a1740');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-54, 74);
    ctx.lineTo(54, 74);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#7c5cff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#7c5cff';
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 内部结构线
    ctx.strokeStyle = 'rgba(124,92,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-30, 41);
    ctx.lineTo(30, 41);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 74);
    ctx.stroke();
    ctx.restore();
  }

  // ==================== 木板 ====================

  function drawBoard() {
    const theta = world.theta;
    const danger = Math.abs(theta) / CFG.critAngle;
    ctx.save();
    ctx.translate(pivotSX, pivotSY);
    ctx.rotate(theta);
    ctx.scale(viewScale, viewScale);

    // 板身
    const wood = ctx.createLinearGradient(0, -10, 0, 6);
    wood.addColorStop(0, '#735236');
    wood.addColorStop(0.45, '#5d4028');
    wood.addColorStop(1, '#3a2718');
    roundRect(ctx, -CFG.phys.L, -10, CFG.phys.L * 2, 14, 5);
    ctx.fillStyle = wood;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,179,71,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 板缝
    ctx.strokeStyle = 'rgba(30,18,10,0.55)';
    ctx.lineWidth = 1;
    for (let x = -CFG.phys.L + 50; x < CFG.phys.L; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, -9);
      ctx.lineTo(x, 3);
      ctx.stroke();
    }

    // 上沿刻度
    for (let x = -200; x <= 200; x += 50) {
      if (x === 0) continue;
      const major = x % 100 === 0;
      ctx.strokeStyle = major ? 'rgba(34,211,238,0.8)' : 'rgba(34,211,238,0.4)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, -10);
      ctx.lineTo(x, major ? -5 : -7);
      ctx.stroke();
    }

    // 中心轴
    ctx.fillStyle = '#0d1230';
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, -3, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 两端封头，危险时发红脉冲
    const pulse = danger > 0.55 ? 0.5 + 0.5 * Math.sin(animT * 10) : 0;
    const caps = [{ x: -CFG.phys.L, col: '#22d3ee' }, { x: CFG.phys.L, col: '#ff5ca8' }];
    for (const cap of caps) {
      ctx.fillStyle = pulse > 0 ? '#ff3b4e' : cap.col;
      ctx.shadowColor = pulse > 0 ? '#ff3b4e' : cap.col;
      ctx.shadowBlur = pulse > 0 ? 8 + pulse * 14 : 8;
      ctx.beginPath();
      ctx.arc(cap.x, -3, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ==================== 道具绘制 ====================

  function drawFish() {
    const g = ctx.createLinearGradient(-20, -6, 14, 6);
    g.addColorStop(0, '#67e8f9');
    g.addColorStop(1, '#0e9fb8');
    ctx.fillStyle = g;
    ctx.strokeStyle = 'rgba(8,70,90,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 尾巴
    ctx.fillStyle = '#0e9fb8';
    ctx.beginPath();
    ctx.moveTo(-11, 0);
    ctx.lineTo(-21, -8);
    ctx.lineTo(-19, 0);
    ctx.lineTo(-21, 8);
    ctx.closePath();
    ctx.fill();
    // 背鳍
    ctx.beginPath();
    ctx.moveTo(-2, -6);
    ctx.lineTo(2, -12);
    ctx.lineTo(6, -6);
    ctx.closePath();
    ctx.fill();
    // 眼与纹
    ctx.fillStyle = '#0b1530';
    ctx.beginPath();
    ctx.arc(6, -1.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(6.6, -2.1, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(8,70,90,0.45)';
    ctx.beginPath();
    ctx.moveTo(-5, -4);
    ctx.lineTo(-5, 4);
    ctx.moveTo(-9, -3);
    ctx.lineTo(-9, 3);
    ctx.stroke();
  }

  function drawYarn() {
    ctx.fillStyle = '#ff5ca8';
    ctx.strokeStyle = '#c43b7f';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(i * 3, 0, 8, -0.9, 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(i * 3, 0, 8, Math.PI - 0.9, Math.PI + 0.9);
      ctx.stroke();
    }
    // 散落的线头
    ctx.beginPath();
    ctx.moveTo(9, 6);
    ctx.quadraticCurveTo(16, 8, 15, 15);
    ctx.stroke();
  }

  function drawItems() {
    for (const it of items) {
      const rest = clamp(it.fall / it.fallDur, 0, 1);
      const ease = rest * rest;
      const yOff = -280 * (1 - ease);
      let alpha = clamp(rest * 2, 0, 1);
      if (it.age > it.life - 3) {
        alpha *= 0.35 + 0.65 * Math.abs(Math.sin(animT * 9));
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(pivotSX, pivotSY);
      ctx.rotate(world.theta);
      ctx.scale(viewScale, viewScale);
      ctx.translate(it.s, 0);
      ctx.translate(0, yOff - 14);
      ctx.shadowColor = it.kind === 'fish' ? '#22d3ee' : '#ff5ca8';
      ctx.shadowBlur = 12;
      if (it.kind === 'fish') drawFish();
      else drawYarn();
      ctx.restore();
    }
  }
  // ==================== 火柴人玩家 ====================

  function drawStickman(face, gear, phase, moving) {
    const sw = moving ? Math.sin(phase * 2) * 7 : 3.5;
    const bob = moving ? -Math.abs(Math.cos(phase * 2)) * 1.6 : 0;

    // 板上影子
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 1.6, 13, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 后腿 / 后臂
    ctx.strokeStyle = 'rgba(80,150,190,0.8)';
    ctx.lineWidth = 3.2 + gear * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -22 + bob);
    ctx.lineTo(-6 - sw, 0);
    ctx.moveTo(0, -40 + bob);
    ctx.lineTo(-8 + sw * 0.6, -28 + bob);
    ctx.stroke();

    // 身体
    ctx.strokeStyle = '#e7fbff';
    ctx.lineWidth = 3.6 + gear * 0.6;
    ctx.shadowColor = 'rgba(34,211,238,0.85)';
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.moveTo(0, -22 + bob);
    ctx.lineTo(0, -42 + bob);
    ctx.stroke();

    // 前腿 / 前臂
    ctx.beginPath();
    ctx.moveTo(0, -22 + bob);
    ctx.lineTo(6 + sw, 0);
    ctx.moveTo(0, -40 + bob);
    ctx.lineTo(8 - sw * 0.6, -28 + bob);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 重量肚囊（档位越高越大）
    ctx.fillStyle = 'rgba(124,92,255,' + (0.35 + gear * 0.15) + ')';
    ctx.strokeStyle = 'rgba(150,128,255,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, -31 + bob, 4.5 + gear * 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 头
    ctx.fillStyle = '#0e1730';
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2.4;
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(2, -54 + bob, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 护目镜
    ctx.fillStyle = 'rgba(34,211,238,0.85)';
    ctx.beginPath();
    ctx.ellipse(6, -55 + bob, 3.6, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ==================== 程序化橘猫 ====================

  // 猫头（含三角耳、脸颊、眼睛、鼻须）
  function drawCatHead(cx, cy, r, happy, nap) {
    const fur = '#ffb347';
    const furLight = '#ffd9a3';
    // 耳朵
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.75, cy - r * 0.45);
    ctx.lineTo(cx - r * 0.4, cy - r * 1.5);
    ctx.lineTo(cx - r * 0.05, cy - r * 0.6);
    ctx.closePath();
    ctx.moveTo(cx + r * 0.15, cy - r * 0.6);
    ctx.lineTo(cx + r * 0.55, cy - r * 1.5);
    ctx.lineTo(cx + r * 0.8, cy - r * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff8fa3';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.6, cy - r * 0.55);
    ctx.lineTo(cx - r * 0.42, cy - r * 1.15);
    ctx.lineTo(cx - r * 0.22, cy - r * 0.62);
    ctx.closePath();
    ctx.moveTo(cx + r * 0.27, cy - r * 0.66);
    ctx.lineTo(cx + r * 0.52, cy - r * 1.15);
    ctx.lineTo(cx + r * 0.68, cy - r * 0.55);
    ctx.closePath();
    ctx.fill();

    // 头与脸颊
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = furLight;
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.75, cy + r * 0.55, r * 0.42, r * 0.34, 0, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.28, cy + r * 0.72, r * 0.42, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛
    const ex1 = cx - r * 0.25;
    const ex2 = cx + r * 0.45;
    const ey = cy - r * 0.05;
    ctx.strokeStyle = '#2b1a0e';
    ctx.fillStyle = '#2b1a0e';
    ctx.lineWidth = 2;
    if (happy) {
      ctx.beginPath();
      ctx.arc(ex1, ey + 1, 2.8, Math.PI * 1.1, Math.PI * 1.9);
      ctx.arc(ex2, ey + 1, 2.8, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    } else if (nap) {
      ctx.beginPath();
      ctx.arc(ex1, ey + 2, 2.6, Math.PI * 0.15, Math.PI * 0.85);
      ctx.arc(ex2, ey + 2, 2.6, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(ex1, ey, 2.3, 2.8, 0, 0, Math.PI * 2);
      ctx.ellipse(ex2, ey, 2.3, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex1 + 0.8, ey - 0.9, 0.8, 0, Math.PI * 2);
      ctx.arc(ex2 + 0.8, ey - 0.9, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // 鼻子、嘴、胡须
    ctx.fillStyle = '#ff6f8f';
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.62, cy + r * 0.22);
    ctx.lineTo(cx + r * 0.82, cy + r * 0.22);
    ctx.lineTo(cx + r * 0.72, cy + r * 0.38);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#7a4a1e';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx + r * 0.6, cy + r * 0.42, 1.8, 0.15 * Math.PI, 0.9 * Math.PI);
    ctx.arc(cx + r * 0.84, cy + r * 0.42, 1.8, 0.1 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.55, cy + r * 0.5);
    ctx.lineTo(cx + r * 1.55, cy + r * 0.32);
    ctx.moveTo(cx + r * 0.55, cy + r * 0.62);
    ctx.lineTo(cx + r * 1.55, cy + r * 0.72);
    ctx.stroke();
  }

  // 打盹时的 Z 字
  function drawNapZ() {
    ctx.fillStyle = 'rgba(200,225,255,0.85)';
    for (let i = 0; i < 3; i++) {
      const off = (animT * 0.8 + i * 1.0) % 3;
      ctx.globalAlpha = clamp(1 - off / 3, 0, 1);
      ctx.font = '800 ' + Math.round(10 + off * 3) + 'px system-ui, sans-serif';
      ctx.fillText('Z', 26 + off * 3, -50 - off * 8);
    }
    ctx.globalAlpha = 1;
  }

  // 站立 / 行走 / 开心姿态的橘猫
  function drawCatStanding(happy, nap, phase, moving, theta) {
    const fur = '#ffb347';
    const furDark = '#d98a2e';
    const bob = moving ? -Math.abs(Math.cos(phase * 2)) * 1.2
      : happy ? Math.sin(animT * 5) * 2.2 : 0;
    const f = moving ? Math.sin(phase * 2) * 5 : 0;

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 1.6, 22, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 尾巴随平衡倾斜摆动
    const tailA = clamp(-theta * 1.2, -0.5, 0.5) + Math.sin(animT * 2.6 + phase) * 0.16;
    ctx.strokeStyle = furDark;
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-17, -14);
    ctx.quadraticCurveTo(-30, -24, -26, -34 + tailA * 20);
    ctx.stroke();
    ctx.fillStyle = '#b8661f';
    ctx.beginPath();
    ctx.arc(-26, -34 + tailA * 20, 3, 0, Math.PI * 2);
    ctx.fill();

    // 后腿
    ctx.strokeStyle = '#c97724';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(-13, -10);
    ctx.lineTo(-13 - f, 0);
    ctx.moveTo(-4, -10);
    ctx.lineTo(-4 + f, 0);
    ctx.stroke();

    // 身体
    const bg = ctx.createRadialGradient(-4, -26 + bob, 3, 0, -20 + bob, 24);
    bg.addColorStop(0, '#ffc47a');
    bg.addColorStop(1, fur);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(0, -20 + bob, 23, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    // 肚子
    ctx.fillStyle = '#ffd9a3';
    ctx.beginPath();
    ctx.ellipse(3, -16 + bob, 13, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // 背纹
    ctx.strokeStyle = '#c96f24';
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 8 - 3, -31 + bob);
      ctx.quadraticCurveTo(i * 8, -36 + bob, i * 8 + 3, -31 + bob);
      ctx.stroke();
    }

    // 前腿
    ctx.strokeStyle = '#f2a24b';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(7, -9);
    ctx.lineTo(7 + f, 0);
    ctx.moveTo(15, -9);
    ctx.lineTo(15 - f, 0);
    ctx.stroke();

    drawCatHead(21, -34 + bob, 13.5, happy, nap);
    if (nap) drawNapZ();
  }

  // 坐下打盹姿态的橘猫
  function drawCatSitting() {
    const fur = '#ffb347';
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 1.6, 18, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 卷到身前的尾巴
    ctx.strokeStyle = '#d98a2e';
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-14, -9);
    ctx.quadraticCurveTo(-2, 0, 14, -7);
    ctx.stroke();
    ctx.fillStyle = '#b8661f';
    ctx.beginPath();
    ctx.arc(14, -7, 3, 0, Math.PI * 2);
    ctx.fill();

    // 竖直身体
    const bg = ctx.createRadialGradient(-3, -30, 3, 0, -18, 24);
    bg.addColorStop(0, '#ffc47a');
    bg.addColorStop(1, fur);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(0, -18, 17, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd9a3';
    ctx.beginPath();
    ctx.ellipse(2, -14, 10, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    // 后爪与前腿
    ctx.fillStyle = '#ffd9a3';
    ctx.beginPath();
    ctx.ellipse(-3, -2, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f2a24b';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(6, -12);
    ctx.lineTo(6, -1);
    ctx.moveTo(13, -12);
    ctx.lineTo(13, -1);
    ctx.stroke();

    drawCatHead(8, -42, 12.5, false, true);
    drawNapZ();
  }

  // ==================== 角色挂载到板 ====================

  function drawCharacters() {
    // 玩家
    const psize = CFG.playerSizes[playerGear];
    const pLean = clamp(player.v * 0.0011, -0.13, 0.13);
    ctx.save();
    ctx.translate(pivotSX, pivotSY);
    ctx.rotate(world.theta);
    ctx.scale(viewScale * psize, viewScale * psize);
    ctx.translate(player.s, 0);
    ctx.scale(player.face >= 0 ? 1 : -1, 1);
    ctx.rotate(pLean * (player.face >= 0 ? 1 : -1));
    drawStickman(1, playerGear, playerPhase, Math.abs(player.v) > 8);
    ctx.restore();

    // 橘猫
    const sitting = catAI.mode === 'sit' && catAI.happy <= 0;
    const happy = catAI.happy > 0;
    const face = catAI.face || 1;
    const cLean = clamp(cat.v * 0.0009, -0.1, 0.1);
    ctx.save();
    ctx.translate(pivotSX, pivotSY);
    ctx.rotate(world.theta);
    ctx.scale(viewScale, viewScale);
    ctx.translate(cat.s, 0);
    ctx.scale(face >= 0 ? 1 : -1, 1);
    ctx.rotate(cLean * (face >= 0 ? 1 : -1));
    if (sitting) {
      drawCatSitting();
    } else {
      drawCatStanding(happy, false, catPhase, Math.abs(cat.v) > 8, world.theta);
    }
    ctx.restore();
  }

  // ==================== 倾斜仪表 ====================

  function drawGauge() {
    const w = 176;
    const h = 12;
    const x = cssW / 2;
    const y = 72;
    const ratio = clamp(world.theta / (CFG.critAngle * 1.3), -1, 1);
    const danger = Math.abs(world.theta) / CFG.critAngle;

    ctx.save();
    ctx.font = '600 11px system-ui, "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const deg = Math.round(world.theta * 180 / Math.PI);
    ctx.fillStyle = danger > 0.9 ? '#ff7788' : '#aab1dd';
    ctx.fillText('倾斜 ' + (deg > 0 ? '+' : '') + deg + '°', x, y - 8);

    roundRect(ctx, x - w / 2, y, w, h, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 危险红区
    ctx.fillStyle = 'rgba(255,59,78,0.28)';
    const critX = (w / 2) * (CFG.critAngle / (CFG.critAngle * 1.3));
    ctx.fillRect(x - w / 2, y + 1, w / 2 - critX, h - 2);
    ctx.fillRect(x + critX, y + 1, w / 2 - critX, h - 2);

    // 中央 3° 完美平衡区
    const flatW = (w / 2) * ((3 * Math.PI / 180) / (CFG.critAngle * 1.3));
    ctx.fillStyle = 'rgba(34,211,238,0.6)';
    ctx.fillRect(x - flatW, y + 1, flatW * 2, h - 2);

    // 临界刻度
    ctx.strokeStyle = 'rgba(255,120,140,0.8)';
    ctx.beginPath();
    ctx.moveTo(x - critX, y - 2);
    ctx.lineTo(x - critX, y + h + 2);
    ctx.moveTo(x + critX, y - 2);
    ctx.lineTo(x + critX, y + h + 2);
    ctx.stroke();

    // 指针
    const mx = x + ratio * (w / 2 - 6);
    const markerCol = danger > 0.9 ? '#ff3b4e' : '#ffffff';
    ctx.shadowColor = markerCol;
    ctx.shadowBlur = 8;
    ctx.fillStyle = markerCol;
    ctx.beginPath();
    ctx.arc(mx, y + h / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (dangerT > 0) {
      ctx.font = '800 13px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = 'rgba(255,90,110,' + (0.55 + 0.45 * Math.sin(animT * 14)) + ')';
      ctx.fillText('危险！快平衡！', x, y + h + 18);
    }
    ctx.restore();
  }

  // ==================== 危险边缘红色脉冲 ====================

  function drawVignette() {
    const danger = Math.abs(world.theta) / CFG.critAngle;
    let a = 0;
    if (danger > 0.55) {
      a += clamp((danger - 0.55) / 0.45, 0, 1) *
        (0.1 + 0.09 * (0.5 + 0.5 * Math.sin(animT * 10)));
    }
    if (dangerT > 0) {
      a += (dangerT / CFG.dangerHold) * 0.22 * (0.6 + 0.4 * Math.sin(animT * 18));
    }
    if (a <= 0) return;
    const g = ctx.createRadialGradient(
      cssW / 2, cssH * 0.5, Math.min(cssW, cssH) * 0.3,
      cssW / 2, cssH * 0.5, Math.max(cssW, cssH) * 0.72
    );
    g.addColorStop(0, 'rgba(255,59,78,0)');
    g.addColorStop(1, 'rgba(255,59,78,' + clamp(a, 0, 0.55) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);
  }

  // ==================== 飘字与中央公告 ====================

  function drawPopups() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '800 15px system-ui, "Microsoft YaHei", sans-serif';
    for (const p of popups) {
      const alpha = clamp(p.t / 0.5, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fillText(p.text, pivotSX + p.x * viewScale, pivotSY + p.y * viewScale);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function drawNotices() {
    if (notices.length === 0) return;
    ctx.save();
    ctx.textAlign = 'center';
    for (const n of notices) {
      const age = n.max - n.t;
      const alpha = Math.min(age / 0.25, n.t / 0.4);
      ctx.globalAlpha = clamp(alpha, 0, 1);
      const pop = 1 + (1 - clamp(age / 0.3, 0, 1)) * 0.12;
      ctx.font = '800 ' + Math.round(24 * pop) + 'px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#e8ecff';
      ctx.shadowColor = '#7c5cff';
      ctx.shadowBlur = 16;
      ctx.fillText(n.text, cssW / 2, cssH * 0.3);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
  // ==================== 总渲染 ====================

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    viewScale = clamp(Math.min(cssW / 780, cssH / 580), 0.42, 1.55);
    pivotSX = cssW / 2;
    pivotSY = Math.round(cssH * 0.6);

    drawBackground();
    if (!world) return;

    drawGroundLine();
    drawPivot();
    drawBoard();
    drawItems();
    drawCharacters();
    drawGauge();
    drawVignette();
    drawPopups();
    drawNotices();
  }

  // ==================== 主循环：rAF + 每帧 4 个固定子步 ====================

  let lastTs = 0;
  function frame(ts) {
    window.requestAnimationFrame(frame);
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    dt = Math.min(dt, 0.05); // 切后台等造成的大帧间隔不允许物理穿透

    animT += dt;
    if (gameState === 'playing') {
      update(dt);
      if (gameState === 'playing') {
        const h = dt / 4;
        for (let i = 0; i < 4; i++) world.step(h);
      }
    }
    render();
  }

  // ==================== 启动 ====================

  resize();
  buildBackdrop();
  resetGame();
  gameState = 'ready';
  window.requestAnimationFrame(frame);

})();