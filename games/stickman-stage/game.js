/* =========================================================
 * 火柴人舞台 —— 纯 Canvas2D + WebAudio 的火柴人表演导演台
 * 零依赖：无图片 / 无外部字体 / 无音频文件
 * 旧版七款火柴人小游戏精华重制版
 * ========================================================= */
(function () {
  'use strict';

  /* ---------------- 通用工具 ---------------- */
  const TAU = Math.PI * 2;
  const D90 = Math.PI / 2;
  const clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  const lerp = function (a, b, t) { return a + (b - a) * t; };
  const rand = function (a, b) { return a + Math.random() * (b - a); };
  const randInt = function (a, b) { return Math.floor(rand(a, b + 1)); };
  const pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  const smooth = function (t) { return t * t * (3 - 2 * t); };
  // 周期为 1 的对称三角波，返回 -1 ~ 1
  const tri = function (t) {
    const x = t - Math.floor(t);
    return 1 - 4 * Math.abs(x - 0.5);
  };

  /* ---------------- DOM 引用 ---------------- */
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const stageBox = document.getElementById('stageBox');
  const musicChip = document.getElementById('musicChip');
  const musicText = document.getElementById('musicText');
  const exciteFill = document.getElementById('exciteFill');
  const bestVal = document.getElementById('bestVal');
  const bpmRange = document.getElementById('bpmRange');
  const bpmVal = document.getElementById('bpmVal');
  const muteBtn = document.getElementById('muteBtn');
  const autoBtn = document.getElementById('autoBtn');
  const shotBtn = document.getElementById('shotBtn');
  const beatBtn = document.getElementById('beatBtn');
  const introOverlay = document.getElementById('introOverlay');
  const introStart = document.getElementById('introStart');

  const moveBtns = Array.prototype.slice.call(document.querySelectorAll('[data-move]'));
  const fxBtns = {
    fire: document.querySelector('[data-fx="fire"]'),
    burn: document.querySelector('[data-fx="burn"]'),
    sword: document.querySelector('[data-fx="sword"]'),
    trans: document.querySelector('[data-fx="transform"]')
  };
  const fxStates = {
    fire: document.getElementById('state-fire'),
    burn: document.getElementById('state-burn'),
    sword: document.getElementById('state-sword'),
    trans: document.getElementById('state-trans')
  };

  /* ---------------- 画布与自适应（含 devicePixelRatio） ---------------- */
  const view = { w: 800, h: 500, dpr: 1, floorY: 380, homeX: 320, binX: 500 };
  let bgGradient = null;
  let stars = [];

  function resizeStage() {
    const rect = stageBox.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(300, Math.floor(rect.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    view.w = w;
    view.h = h;
    view.dpr = dpr;
    view.floorY = Math.round(h * 0.74);
    const narrowLayout = w < 520;
    view.homeX = Math.round(clamp(w * (narrowLayout ? 0.34 : 0.37), 70, w - 70));
    view.binX = Math.round(clamp(w * (narrowLayout ? 0.62 : 0.64), 0, w - 46));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    bgGradient = ctx.createRadialGradient(w * 0.5, h * 0.3, 20, w * 0.5, h * 0.42, Math.max(w, h) * 0.85);
    bgGradient.addColorStop(0, '#171a3a');
    bgGradient.addColorStop(1, '#0b0e20');
    // 背景星点
    stars = [];
    const n = Math.round(w * h / 9000);
    for (let i = 0; i < n; i++) {
      stars.push({ x: rand(0, w), y: rand(0, view.floorY * 0.86), r: rand(0.5, 1.6), a: rand(0.12, 0.5), p: rand(0, TAU) });
    }
    spotX = view.homeX;
  }
  window.addEventListener('resize', resizeStage);

  /* ---------------- 通用对象池 ---------------- */
  function Pool(factory, size) {
    this.items = [];
    for (let i = 0; i < size; i++) this.items.push(factory());
    this.cursor = 0;
  }
  Pool.prototype.next = function () {
    for (let i = 0; i < this.items.length; i++) {
      this.cursor = (this.cursor + 1) % this.items.length;
      if (!this.items[this.cursor].active) return this.items[this.cursor];
    }
    // 池满时循环覆盖最旧对象，避免粒子无限增长造成卡顿
    this.cursor = (this.cursor + 1) % this.items.length;
    return this.items[this.cursor];
  };
  Pool.prototype.eachActive = function (fn) {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.active) fn(it);
    }
  };
  Pool.prototype.clear = function () {
    for (let i = 0; i < this.items.length; i++) this.items[i].active = false;
  };

  // 粒子：火焰 / 烟雾 / 金焰 / 火花 / 火箭 / 柔光
  function makeParticle() {
    return {
      active: false, kind: '', x: 0, y: 0, vx: 0, vy: 0,
      life: 0, max: 1, size: 1, hue: 0, drag: 0, grav: 0, sway: 0
    };
  }
  const particles = new Pool(makeParticle, 720);

  function spawnParticle(kind, x, y, opt) {
    const p = particles.next();
    p.active = true;
    p.kind = kind;
    p.x = x; p.y = y;
    p.vx = opt.vx || 0; p.vy = opt.vy || 0;
    p.max = opt.life != null ? opt.life : 0.6;
    p.life = p.max;
    p.size = opt.size != null ? opt.size : 6;
    p.hue = opt.hue != null ? opt.hue : 0;
    p.drag = opt.drag != null ? opt.drag : 0;
    p.grav = opt.grav != null ? opt.grav : 0;
    p.sway = opt.sway != null ? opt.sway : 0;
    return p;
  }

  // 剑光轨迹
  const slashes = new Pool(function () {
    return { active: false, cx: 0, cy: 0, r: 80, a0: 0, a1: 0, life: 1, max: 1, w: 6 };
  }, 12);

  // 冲击波圆环
  const rings = new Pool(function () {
    return { active: false, x: 0, y: 0, r: 10, vr: 300, life: 1, max: 1, color: '255,255,255' };
  }, 16);

  function spawnRing(x, y, color, vr, maxLife) {
    const r = rings.next();
    r.active = true; r.x = x; r.y = y; r.r = 8; r.vr = vr || 340;
    r.max = maxLife || 0.55; r.life = r.max; r.color = color;
  }

  // 飞行火球
  const fireballs = new Pool(function () {
    return { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 2 };
  }, 8);

  // 漂浮文字
  const floatTexts = new Pool(function () {
    return { active: false, x: 0, y: 0, vy: -34, life: 1, max: 1, text: '', color: '#fff', size: 16 };
  }, 24);

  function spawnText(x, y, text, color, size, life) {
    const t = floatTexts.next();
    t.active = true; t.x = x; t.y = y; t.vy = -36;
    t.text = text; t.color = color || '#fff';
    t.size = size || 16; t.max = life || 1.1; t.life = t.max;
  }
  /* ---------------- 节拍时钟（动画与鼓点共用） ---------------- */
  const beat = {
    bpm: 112,
    clock: 0,        // 累计拍数（浮点），所有动作相位都由它驱动
    pulse: 0,        // 每拍重音冲击，指数衰减
    lastInt: -1
  };
  let spotX = 320;

  /* WebAudio 纯合成鼓点：底鼓 + 踩镲，无任何音频文件 */
  const audio = {
    ctx: null, master: null, noiseBuf: null,
    started: false, muted: false,
    timer: 0, nextStep: 0, mapBeat: 0, mapTime: 0,

    ensure: function () {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      // 预生成白噪声缓冲，供踩镲使用
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.started = true;
      this.mapBeat = beat.clock;
      this.mapTime = this.ctx.currentTime + 0.08;
      this.nextStep = Math.ceil(beat.clock * 2);
      this.timer = window.setInterval(this.schedule.bind(this), 25);
    },

    // 拍数 -> 音频上下文时间
    timeOf: function (b) {
      return this.mapTime + (b - this.mapBeat) * (60 / beat.bpm);
    },
    // BPM 改变时以当前拍为新的映射起点，保证不抢拍不掉拍
    remap: function () {
      if (!this.ctx) return;
      this.mapBeat = beat.clock;
      this.mapTime = this.ctx.currentTime;
    },
    setMuted: function (m) {
      this.muted = m;
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    },

    schedule: function () {
      if (!this.ctx) return;
      const ahead = this.ctx.currentTime + 0.14;
      while (this.timeOf(this.nextStep / 2) < ahead) {
        const b = this.nextStep / 2;
        const t = this.timeOf(b);
        if (this.nextStep % 2 === 0) this.kick(t);
        this.hat(t, this.nextStep % 2 === 0 ? 0.09 : 0.17);
        this.nextStep++;
      }
    },
    // 底鼓：正弦下滑音 + 快速衰减包络
    kick: function (t) {
      const c = this.ctx;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(155, t);
      osc.frequency.exponentialRampToValueAtTime(46, t + 0.12);
      g.gain.setValueAtTime(0.95, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + 0.24);
    },
    // 踩镲：高通白噪声 + 短包络
    hat: function (t, vol) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7200;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.connect(hp); hp.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + 0.07);
    }
  };

  /* ---------------- 特效与表演状态 ---------------- */
  const FX_CONF = {
    fire: { dur: 6, cd: 8, name: '手部火焰' },
    burn: { dur: 8, cd: 6, name: '垃圾焚烧' },
    sword: { dur: 9, cd: 10, name: '发光宝剑' },
    trans: { dur: 8, cd: 16, name: '超级变身' }
  };
  const fx = {};
  Object.keys(FX_CONF).forEach(function (k) {
    fx[k] = { active: false, t: 0, cdt: 0 };
  });

  const state = {
    move: 0,
    auto: false,
    dirTimer: 1,
    excite: 0,
    best: 0,
    celebrate: 0,
    cheerArmed: true,
    rocketQueue: [],
    cheerWordT: 0,
    swordSwing: 1,     // >=1 表示挥砍结束
    slashCd: 0,
    hop: 0
  };

  try {
    state.best = parseInt(localStorage.getItem('best_stickman-stage') || '0', 10) || 0;
  } catch (e) { state.best = 0; }
  bestVal.textContent = state.best;

  const actor = {
    scale: 1,
    joints: null,
    handL: { x: 0, y: 0 },
    handR: { x: 0, y: 0 },
    shoulder: { x: 0, y: 0 },
    head: { x: 0, y: 0 }
  };

  function beatOffset() {
    return Math.abs(beat.clock - Math.round(beat.clock));
  }

  // 增加观众兴奋度并更新历史峰值
  function addExcite(v) {
    state.excite = clamp(state.excite + v, 0, 100);
    if (state.excite > state.best) {
      state.best = Math.round(state.excite);
      bestVal.textContent = state.best;
      try { localStorage.setItem('best_stickman-stage', String(state.best)); } catch (e) {}
    }
  }

  // 切换动作：踩在拍点上有额外兴奋度
  function selectMove(i, fromAuto) {
    state.move = i;
    for (let k = 0; k < moveBtns.length; k++) {
      moveBtns[k].classList.toggle('on', Number(moveBtns[k].getAttribute('data-move')) === i);
    }
    if (!fromAuto) {
      const on = beatOffset() < 0.14;
      addExcite(on ? 6 : 2);
      spawnText(actor.head.x, actor.head.y - 42, on ? '合拍 +6' : '+2', on ? '#22d3ee' : '#9aa0c8', on ? 20 : 14);
    }
  }

  function igniteBin(points) {
    fx.burn.active = true;
    fx.burn.t = FX_CONF.burn.dur;
    fx.burn.cdt = FX_CONF.burn.cd;
    addExcite(points);
    spawnText(view.binX, view.floorY - 92, points >= 10 ? '点燃成功！' : '焚烧发电启动', '#ffb347', points >= 10 ? 20 : 17);
    spawnRing(view.binX, view.floorY - 30, '255,150,60', 260, 0.5);
  }

  // 开启特效（冷却结束才允许）
  function toggleFx(name) {
    const f = fx[name];
    const conf = FX_CONF[name];
    if (f.active || f.cdt > 0) return;
    f.active = true;
    f.t = conf.dur;
    f.cdt = conf.cd;
    if (name === 'fire') {
      addExcite(8);
      spawnText(actor.head.x, actor.head.y - 42, '火焰燃起 +8', '#ff7a3c', 19);
      burstFire(actor.handL, 14);
      burstFire(actor.handR, 14);
    } else if (name === 'burn') {
      igniteBin(6);
    } else if (name === 'sword') {
      addExcite(8);
      spawnText(actor.head.x, actor.head.y - 42, '宝剑出鞘 +8', '#22d3ee', 19);
      doSwing();
    } else if (name === 'trans') {
      addExcite(15);
      spawnText(actor.head.x, actor.head.y - 56, '超级变身 +15', '#ffd34d', 24);
      spawnRing(actor.head.x, actor.head.y, '255,211,77', 460, 0.8);
      for (let i = 0; i < 36; i++) {
        spawnParticle('spark', actor.head.x, actor.head.y + 20, {
          vx: rand(-190, 190), vy: rand(-240, -40), life: rand(0.6, 1.2),
          size: rand(2, 3.6), grav: 320, drag: 0.98, hue: 4
        });
      }
    }
  }

  // 宝剑挥砍：快速扫过一道剑光
  function doSwing() {
    if (!fx.sword.active || state.slashCd > 0) return;
    state.slashCd = 0.28;
    state.swordSwing = 0;
    const sh = actor.shoulder;
    const s = actor.scale;
    const arc = slashes.next();
    arc.active = true;
    arc.cx = sh.x; arc.cy = sh.y;
    arc.r = 108 * s;
    arc.a0 = -D90 - 1.15; arc.a1 = -D90 + 1.15;
    arc.max = 0.34; arc.life = arc.max; arc.w = 9 * s;
    for (let i = 0; i < 14; i++) {
      const a = rand(arc.a0, arc.a1);
      spawnParticle('spark', sh.x + Math.cos(a) * arc.r, sh.y + Math.sin(a) * arc.r, {
        vx: rand(-50, 50), vy: rand(-60, 30), life: rand(0.25, 0.5),
        size: rand(1.5, 3), drag: 0.9, hue: 2
      });
    }
  }

  // 投掷火球
  function throwFireball(tx, ty) {
    const from = actor.handR;
    const fb = fireballs.next();
    fb.active = true;
    fb.x = from.x; fb.y = from.y;
    const dx = tx - from.x;
    const dy = (ty != null ? ty : view.floorY - 30) - from.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = 640;
    fb.vx = dx / d * speed;
    fb.vy = dy / d * speed - 60; // 略微上抛
    fb.life = 2.4;
  }

  // 空格：合拍特效（根据当前持有特效演出）
  function beatAction() {
    const on = beatOffset() < 0.14;
    if (fx.sword.active) doSwing();
    if (fx.fire.active) throwFireball(view.binX, view.floorY - 40);
    if (fx.trans.active) spawnRing(actor.head.x, actor.head.y + 20, '255,211,77', 420, 0.7);
    spawnRing(actor.head.x, actor.head.y + 20, on ? '34,211,238' : '154,160,200', on ? 400 : 230, on ? 0.6 : 0.4);
    state.hop = 1;
    if (on) {
      addExcite(12);
      beat.pulse = 1;
      spawnText(actor.head.x, actor.head.y - 58, '合拍 +12', '#22d3ee', 23);
      for (let i = 0; i < 16; i++) {
        const a = rand(0, TAU);
        spawnParticle('spark', actor.head.x, actor.head.y + 10, {
          vx: Math.cos(a) * rand(120, 230), vy: Math.sin(a) * rand(120, 230) - 60,
          life: rand(0.4, 0.8), size: rand(1.6, 3), grav: 240, drag: 0.96, hue: 2
        });
      }
    } else {
      addExcite(2);
      spawnText(actor.head.x, actor.head.y - 50, '差一点 +2', '#9aa0c8', 14);
    }
  }

  /* ---------------- 自动导演：随机切动作、上特效 ---------------- */
  function directorTick() {
    if (!state.auto) return;
    state.dirTimer--;
    if (state.dirTimer <= 0) {
      let m = state.move;
      while (m === state.move) m = randInt(0, 5);
      selectMove(m, true);
      state.dirTimer = randInt(2, 4);
    }
    if (Math.random() < 0.26) {
      const bag = ['fire', 'burn', 'sword', 'sword', 'trans'];
      const name = pick(bag);
      if (!fx[name].active && fx[name].cdt <= 0) toggleFx(name);
    }
  }
  /* ---------------- 火柴人关节运动学 ----------------
   * 角度约定：0 指向右，π/2 朝下，-π/2 朝上。
   * 每个姿态给出躯干、头、左右大臂小臂、左右大腿小腿的绝对角度。
   * 所有角度均由 beat.clock（拍数）的正弦/相位驱动，天然合拍。 */
  const LIMB = {
    headR: 13, torso: 50, shoulder: 40, headC: 62,
    upperArm: 23, foreArm: 24, thigh: 26, shin: 27
  };

  function makePose(bt) {
    const D = D90, U = -D90;
    const p = bt * TAU;
    const s = Math.sin(p);
    const pose = {
      hx: view.homeX, hy: view.floorY - 52, rot: 0,
      torso: U, headTilt: 0,
      la: [D - 0.18, D - 0.05], ra: [D + 0.18, D + 0.05],
      ll: [D - 0.09, D + 0.03], rl: [D + 0.09, D + 0.03],
      eyeMode: 'dot'
    };

    if (state.move === 0) {
      // ① 原地迪斯科：双臂交替上举、摆胯、弹膝
      pose.hy -= Math.abs(Math.sin(bt * Math.PI)) * 6;
      pose.hx += s * 7;
      pose.torso = U + s * 0.05;
      pose.headTilt = -s * 0.09;
      pose.la = [U - 0.55 - 0.55 * s, U - 1.25 - 0.55 * s];
      pose.ra = [U - 0.55 + 0.55 * s, U - 1.25 + 0.55 * s];
      pose.ll = [D - 0.1 + 0.16 * s, D + 0.3 + 0.28 * s];
      pose.rl = [D - 0.1 - 0.16 * s, D + 0.3 - 0.28 * s];

    } else if (state.move === 1) {
      // ② 双臂挥舞：双臂一同在头顶左右挥动
      const sw = s * 1.05;
      pose.hy -= Math.abs(Math.sin(bt * Math.PI)) * 8;
      pose.torso = U - 0.05;
      pose.headTilt = sw * 0.05;
      pose.la = [U + sw - 0.2, U + sw - 0.55];
      pose.ra = [U + sw + 0.2, U + sw - 0.15];
      pose.ll = [D - 0.08, D + 0.22 + 0.1 * s];
      pose.rl = [D + 0.08, D + 0.22 - 0.1 * s];

    } else if (state.move === 2) {
      // ③ 太空步滑行：身体后倾、双脚交替滑步、整体平滑漂移
      const p2 = bt * Math.PI;
      const sw = Math.sin(p2);
      pose.hx = view.homeX + tri(bt / 2) * 52;
      pose.hy -= Math.abs(Math.sin(p2)) * 3;
      pose.torso = U - 0.1;
      pose.headTilt = 0.06 * sw;
      pose.la = [D - 0.3 - 0.22 * sw, D - 0.05 - 0.22 * sw];
      pose.ra = [D - 0.3 + 0.22 * sw, D - 0.05 + 0.22 * sw];
      pose.ll = [D + 0.3 * sw, D + 0.35 + 0.45 * Math.max(0, -sw)];
      pose.rl = [D - 0.3 * sw, D + 0.35 + 0.45 * Math.max(0, sw)];

    } else if (state.move === 3 || state.move === 4) {
      // ④ 诡异跑：原地高抬腿 + 不正常的关节角度
      // ⑤ 更诡异跑：在诡异跑循环中插入 360° 翻跟头
      let flipping = false;
      if (state.move === 4) {
        const cyc = bt / 4 - Math.floor(bt / 4);
        if (cyc >= 0.72) {
          flipping = true;
          const t = (cyc - 0.72) / 0.28;
          pose.rot = t * TAU;
          pose.hy += -Math.sin(t * Math.PI) * 105;
          pose.torso = U;
          pose.la = [-0.5, -1.9];
          pose.ra = [D + 0.5, D + 1.9];
          pose.ll = [D - 0.9, D + 1.25];
          pose.rl = [D + 0.9, D + 1.25];
        }
      }
      if (!flipping) {
        const q = bt * TAU;
        const sq = Math.sin(q), cq = Math.cos(q);
        const jitter = Math.sin(bt * 17.13) * 0.07 + Math.sin(bt * 9.7) * 0.04;
        pose.hy -= Math.abs(Math.sin(bt * Math.PI)) * 5;
        pose.torso = U + 0.14 + jitter * 0.5;
        pose.headTilt = jitter * 2.2;
        pose.eyeMode = 'x';
        pose.la = [-0.15 - 0.85 * sq + jitter, -0.15 - 0.85 * sq - 1.15 * cq + jitter];
        pose.ra = [-0.15 + 0.85 * sq - jitter, -0.15 + 0.85 * sq + 1.15 * cq - jitter];
        pose.ll = [D - 1.05 * sq, D + 0.35 - 1.25 * sq];
        pose.rl = [D + 1.05 * sq, D + 0.35 + 1.25 * sq];
      }

    } else if (state.move === 5) {
      // ⑥ 谢幕鞠躬：8 拍一个完整的鞠躬-停留-起身循环
      const c = bt / 8 - Math.floor(bt / 8);
      let env = 0;
      if (c < 0.12) env = c / 0.12;
      else if (c < 0.42) env = 1;
      else if (c < 0.58) env = 1 - (c - 0.42) / 0.16;
      const d = smooth(env) * 1.28;
      pose.torso = U + d;
      pose.headTilt = d * 0.15;
      pose.la = [lerp(D - 0.18, -0.25, d), lerp(D - 0.08, 0.1, d)];
      pose.ra = [lerp(D + 0.18, 0.25, d), lerp(D + 0.08, 0.6, d)];
      pose.ll = [D - 0.09, D + 0.04];
      pose.rl = [D + 0.09, D + 0.04];
    }

    // 超级变身：整体放大、上升气焰由粒子系统负责
    pose.hy -= (state.hop * 16);
    return pose;
  }

  // 由姿态计算缩放后的局部关节坐标（原点在髋部）
  function computeJoints(pose, sc) {
    const L = LIMB;
    const j = {};
    j.hip = { x: 0, y: 0 };
    j.neck = { x: Math.cos(pose.torso) * L.torso * sc, y: Math.sin(pose.torso) * L.torso * sc };
    j.shoulder = { x: Math.cos(pose.torso) * L.shoulder * sc, y: Math.sin(pose.torso) * L.shoulder * sc };
    j.head = { x: Math.cos(pose.torso) * L.headC * sc, y: Math.sin(pose.torso) * L.headC * sc };
    j.headUp = pose.torso + pose.headTilt;
    j.elbowL = { x: j.shoulder.x + Math.cos(pose.la[0]) * L.upperArm * sc, y: j.shoulder.y + Math.sin(pose.la[0]) * L.upperArm * sc };
    j.handL = { x: j.elbowL.x + Math.cos(pose.la[1]) * L.foreArm * sc, y: j.elbowL.y + Math.sin(pose.la[1]) * L.foreArm * sc };
    j.elbowR = { x: j.shoulder.x + Math.cos(pose.ra[0]) * L.upperArm * sc, y: j.shoulder.y + Math.sin(pose.ra[0]) * L.upperArm * sc };
    j.handR = { x: j.elbowR.x + Math.cos(pose.ra[1]) * L.foreArm * sc, y: j.elbowR.y + Math.sin(pose.ra[1]) * L.foreArm * sc };
    j.kneeL = { x: Math.cos(pose.ll[0]) * L.thigh * sc, y: Math.sin(pose.ll[0]) * L.thigh * sc };
    j.footL = { x: j.kneeL.x + Math.cos(pose.ll[1]) * L.shin * sc, y: j.kneeL.y + Math.sin(pose.ll[1]) * L.shin * sc };
    j.kneeR = { x: Math.cos(pose.rl[0]) * L.thigh * sc, y: Math.sin(pose.rl[0]) * L.thigh * sc };
    j.footR = { x: j.kneeR.x + Math.cos(pose.rl[1]) * L.shin * sc, y: j.kneeR.y + Math.sin(pose.rl[1]) * L.shin * sc };
    return j;
  }

  function limbLine(a, b) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // 在已摆好的局部坐标系中绘制火柴人
  function paintFigureLocal(pose, j, sc, opt) {
    const L = LIMB;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = opt.stroke;
    ctx.fillStyle = opt.headFill;
    ctx.lineWidth = opt.width;
    if (opt.glow) {
      ctx.shadowColor = opt.glowColor;
      ctx.shadowBlur = opt.glow;
    } else {
      ctx.shadowBlur = 0;
    }
    // 躯干
    limbLine(j.hip, j.neck);
    // 四肢
    limbLine(j.shoulder, j.elbowL); limbLine(j.elbowL, j.handL);
    limbLine(j.shoulder, j.elbowR); limbLine(j.elbowR, j.handR);
    limbLine(j.hip, j.kneeL); limbLine(j.kneeL, j.footL);
    limbLine(j.hip, j.kneeR); limbLine(j.kneeR, j.footR);

    // 金色头发（超级变身）：先用尖刺描出头顶
    if (opt.hair) {
      ctx.fillStyle = '#ffd34d';
      ctx.shadowColor = '#ffb347';
      ctx.shadowBlur = 16;
      for (let i = -2; i <= 2; i++) {
        const a = j.headUp + i * 0.33;
        const tip = { x: j.head.x + Math.cos(a) * (L.headR + 11 + Math.abs(i) * -3) * sc,
                      y: j.head.y + Math.sin(a) * (L.headR + 11 + Math.abs(i) * -3) * sc };
        const b1a = a - 0.16, b2a = a + 0.16;
        ctx.beginPath();
        ctx.moveTo(j.head.x + Math.cos(b1a) * L.headR * sc, j.head.y + Math.sin(b1a) * L.headR * sc);
        ctx.lineTo(tip.x, tip.y);
        ctx.lineTo(j.head.x + Math.cos(b2a) * L.headR * sc, j.head.y + Math.sin(b2a) * L.headR * sc);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 头部
    ctx.shadowBlur = opt.glow || 0;
    ctx.beginPath();
    ctx.arc(j.head.x, j.head.y, L.headR * sc, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // 表情：普通两点；诡异跑时画叉号眼
    if (opt.face !== false) {
      const perp = j.headUp + D90;
      const ex = Math.cos(perp) * 5 * sc, ey = Math.sin(perp) * 5 * sc;
      const fx = Math.cos(j.headUp) * 2 * sc, fy = Math.sin(j.headUp) * 2 * sc;
      const e1 = { x: j.head.x + ex + fx, y: j.head.y + ey + fy };
      const e2 = { x: j.head.x - ex + fx, y: j.head.y - ey + fy };
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1.4, 2 * sc);
      ctx.strokeStyle = opt.eyeColor;
      if (pose.eyeMode === 'x') {
        const r = 3.2 * sc;
        [e1, e2].forEach(function (e) {
          ctx.beginPath();
          ctx.moveTo(e.x - r, e.y - r); ctx.lineTo(e.x + r, e.y + r);
          ctx.moveTo(e.x + r, e.y - r); ctx.lineTo(e.x - r, e.y + r);
          ctx.stroke();
        });
      } else {
        ctx.fillStyle = opt.eyeColor;
        ctx.beginPath(); ctx.arc(e1.x, e1.y, 2.1 * sc, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(e2.x, e2.y, 2.1 * sc, 0, TAU); ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
  }

  // 世界坐标绘制（含镜面倒影复用）
  function drawFigure(pose, reflection) {
    const sc = actor.scale;
    const j = computeJoints(pose, sc);
    let dy = 0;
    if (pose.rot === 0) {
      const minFoot = Math.min(j.footL.y, j.footR.y);
      // 保证最低的那只脚始终落在地面上，弯腿时整个人自然抬起
      dy = clamp(view.floorY - (pose.hy + minFoot), -400, 0);
    }
    const cosr = Math.cos(pose.rot), sinr = Math.sin(pose.rot);
    function toWorld(pt) {
      return {
        x: pose.hx + pt.x * cosr - pt.y * sinr,
        y: pose.hy + dy + pt.x * sinr + pt.y * cosr
      };
    }
    // 记录世界坐标供特效发射器使用（仅正身）
    if (!reflection) {
      actor.handL = toWorld(j.handL);
      actor.handR = toWorld(j.handR);
      actor.shoulder = toWorld(j.shoulder);
      actor.head = toWorld(j.head);
      actor.joints = j;
    }
    ctx.save();
    ctx.translate(pose.hx, pose.hy + dy);
    ctx.rotate(pose.rot);
    const golden = fx.trans.active;
    const opt = reflection ? {
      stroke: 'rgba(150,170,255,0.55)', headFill: 'rgba(140,160,255,0.35)',
      width: 3.5, glow: 0, face: false, hair: false
    } : {
      stroke: golden ? '#ffd34d' : '#dfe4ff',
      headFill: golden ? '#3a2e10' : '#101226',
      eyeColor: golden ? '#fff2b0' : '#cfe9ff',
      width: golden ? 6 * sc : 4.6 * sc,
      glow: golden ? 22 : 8,
      glowColor: golden ? '#ffb347' : 'rgba(124,92,255,0.9)',
      hair: golden, face: true
    };
    paintFigureLocal(pose, j, sc, opt);
    ctx.restore();
    return { dy: dy };
  }

  // 发光宝剑：多边形剑刃 + 辉光
  function drawSword(handX, handY, ang, sc) {
    ctx.save();
    ctx.translate(handX, handY);
    ctx.rotate(ang + D90);
    ctx.scale(sc, sc);
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 18;
    // 剑柄
    ctx.fillStyle = '#2b3152';
    ctx.fillRect(-3, 0, 6, 13);
    // 护手
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.moveTo(-12, -1); ctx.lineTo(12, -1); ctx.lineTo(9, -6); ctx.lineTo(-9, -6);
    ctx.closePath(); ctx.fill();
    // 剑刃（多边形收尖）
    const grad = ctx.createLinearGradient(0, -6, 0, -96);
    grad.addColorStop(0, '#bff6ff');
    grad.addColorStop(0.7, '#22d3ee');
    grad.addColorStop(1, '#e8ffff');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(5, -6); ctx.lineTo(3, -84); ctx.lineTo(0, -98);
    ctx.lineTo(-3, -84); ctx.lineTo(-5, -6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 剑刃中线高光
    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, -90); ctx.stroke();
    ctx.restore();
  }
  /* ---------------- 粒子生成 ---------------- */
  function emitFire(x, y, n, scaleSize) {
    for (let i = 0; i < n; i++) {
      spawnParticle('fire', x + rand(-4, 4), y, {
        vx: rand(-26, 26), vy: rand(-120, -50),
        life: rand(0.32, 0.62), size: rand(5, 9) * (scaleSize || 1)
      });
    }
  }
  function burstFire(pt, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      spawnParticle('fire', pt.x, pt.y, {
        vx: Math.cos(a) * rand(30, 150), vy: Math.sin(a) * rand(30, 150) - 40,
        life: rand(0.3, 0.6), size: rand(5, 10)
      });
    }
  }
  function emitSmoke(x, y, n) {
    for (let i = 0; i < n; i++) {
      spawnParticle('smoke', x + rand(-10, 10), y, {
        vx: rand(-12, 12), vy: rand(-46, -24),
        life: rand(1.2, 2.1), size: rand(7, 11), sway: rand(0, TAU)
      });
    }
  }
  function emitAura(n) {
    const c = actor.head;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const r = rand(26, 44) * actor.scale;
      spawnParticle('aura', c.x + Math.cos(a) * r, c.y + Math.sin(a) * r + 30, {
        vx: Math.cos(a) * 30, vy: rand(-130, -60),
        life: rand(0.5, 1.0), size: rand(3, 6)
      });
    }
  }

  // 烟花：火箭升空后在顶点炸成金色彩星
  function launchRocket() {
    const p = spawnParticle('rocket', rand(view.w * 0.2, view.w * 0.8), view.floorY, {
      vx: rand(-20, 20), vy: rand(-430, -360), life: rand(0.55, 0.8),
      size: 3, hue: 4
    });
    p.grav = 30;
  }
  function fireworkBurst(x, y) {
    spawnRing(x, y, '255,211,77', 300, 0.5);
    const count = 48;
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU + rand(-0.06, 0.06);
      const sp = rand(90, 260);
      const star = i % 6 === 0;
      spawnParticle('spark', x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.8, 1.7), size: star ? 4.4 : rand(1.8, 3.2),
        grav: 230, drag: 0.97, hue: Math.random() < 0.6 ? 4 : pick([2, 3])
      });
    }
  }
  function triggerCelebrate() {
    state.celebrate = 2.6;
    state.cheerArmed = false;
    state.rocketQueue = [0, 0.45, 0.95, 1.45, 2.0];
    state.cheerWordT = 0;
    exciteFill.classList.add('full');
  }

  /* ---------------- 粒子 / 飞行物更新 ---------------- */
  function updateParticles(dt) {
    particles.eachActive(function (p) {
      p.life -= dt;
      if (p.life <= 0) {
        if (p.kind === 'rocket') fireworkBurst(p.x, p.y);
        p.active = false;
        return;
      }
      if (p.kind === 'fire') {
        p.vy -= 120 * dt;
        p.vx *= Math.pow(0.92, dt * 60);
        p.x += Math.sin(p.life * 26) * 22 * dt;
      } else if (p.kind === 'smoke') {
        p.vy -= 16 * dt;
        p.x += Math.sin(beat.clock * 2 + p.sway) * 14 * dt;
        p.vx *= Math.pow(0.95, dt * 60);
      } else if (p.kind === 'spark') {
        p.vy += p.grav * dt;
        p.vx *= Math.pow(p.drag, dt * 60);
        p.vy *= Math.pow(p.drag, dt * 60);
      } else if (p.kind === 'rocket') {
        p.vy += p.grav * dt;
        if (Math.random() < 0.8) {
          spawnParticle('fire', p.x + rand(-2, 2), p.y + 6, {
            vx: rand(-14, 14), vy: rand(30, 90), life: rand(0.2, 0.4), size: rand(3, 5)
          });
        }
      } else if (p.kind === 'aura') {
        p.vy -= 60 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    });
  }

  function updateFireballs(dt) {
    fireballs.eachActive(function (f) {
      f.life -= dt;
      f.vy += 130 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (Math.random() < 0.9) {
        spawnParticle('fire', f.x + rand(-3, 3), f.y + rand(-3, 3), {
          vx: rand(-30, 30), vy: rand(-30, 40), life: rand(0.18, 0.38), size: rand(3, 6)
        });
      }
      const hitBin = Math.abs(f.x - view.binX) < 36 && f.y > view.floorY - 64 && f.y < view.floorY + 8;
      if (hitBin) {
        igniteBin(10);
        f.active = false;
        return;
      }
      if (f.y >= view.floorY - 3 || f.life <= 0 || f.x < -40 || f.x > view.w + 40) {
        for (let i = 0; i < 8; i++) {
          spawnParticle('fire', f.x, Math.min(f.y, view.floorY), {
            vx: rand(-70, 70), vy: rand(-90, -20), life: rand(0.2, 0.45), size: rand(3, 6)
          });
        }
        f.active = false;
      }
    });
  }

  /* ---------------- 舞台器件绘制 ---------------- */
  function drawStars() {
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      ctx.globalAlpha = s.a * (0.55 + 0.45 * Math.sin(beat.clock * 2 + s.p));
      ctx.fillStyle = '#cfd6ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSpeaker(cx, flip) {
    const pulse = beat.pulse;
    const w = 76, h = 128;
    const x = cx - w / 2, y = view.floorY - h;
    ctx.save();
    ctx.fillStyle = '#0d1026';
    ctx.strokeStyle = 'rgba(124,92,255,' + (0.35 + 0.3 * pulse) + ')';
    ctx.lineWidth = 1.6;
    roundRect(x, y, w, h, 8);
    ctx.fill(); ctx.stroke();
    // 低音喇叭：随节拍胀缩
    const bx = cx, by = y + h * 0.62, br = w * 0.3 * (1 + 0.18 * pulse);
    let g = ctx.createRadialGradient(bx, by, 2, bx, by, br);
    g.addColorStop(0, '#22d3ee');
    g.addColorStop(0.55, '#2b3152');
    g.addColorStop(1, '#05060f');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(34,211,238,' + (0.5 + 0.4 * pulse) + ')';
    ctx.beginPath(); ctx.arc(bx, by, br * 0.62, 0, TAU); ctx.stroke();
    // 高音喇叭
    const tr = w * 0.12 * (1 + 0.1 * pulse);
    g = ctx.createRadialGradient(bx, y + 24, 1, bx, y + 24, tr);
    g.addColorStop(0, '#ff5ca8');
    g.addColorStop(1, '#1a1d38');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx, y + 24, tr, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawFloorAndLights(pose, dt) {
    const w = view.w, h = view.h, fy = view.floorY;
    // 地面
    const g = ctx.createLinearGradient(0, fy, 0, h);
    g.addColorStop(0, '#10132b');
    g.addColorStop(1, '#06070f');
    ctx.fillStyle = g;
    ctx.fillRect(0, fy, w, h - fy);

    // 透视网格
    ctx.strokeStyle = 'rgba(124,92,255,0.16)';
    ctx.lineWidth = 1;
    const vx = w / 2;
    ctx.beginPath();
    for (let i = -12; i <= 12; i++) {
      ctx.moveTo(vx + i * 36, fy);
      ctx.lineTo(vx + i * 260, h);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(34,211,238,0.12)';
    ctx.beginPath();
    for (let k = 0; k < 12; k++) {
      let v = (k / 12 + beat.clock * 0.06) % 1;
      const y = fy + (h - fy) * v * v;
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();

    // 舞台前沿霓虹线
    ctx.save();
    ctx.shadowColor = '#7c5cff';
    ctx.shadowBlur = 14 + 14 * beat.pulse;
    ctx.strokeStyle = 'rgba(150,130,255,' + (0.55 + 0.35 * beat.pulse) + ')';
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(0, fy + 1); ctx.lineTo(w, fy + 1); ctx.stroke();
    ctx.restore();

    // 聚光灯灯池（随角色移动）
    const pool = ctx.createRadialGradient(spotX, fy, 10, spotX, fy, 210);
    pool.addColorStop(0, 'rgba(225,228,255,0.20)');
    pool.addColorStop(1, 'rgba(225,228,255,0)');
    ctx.fillStyle = pool;
    ctx.beginPath(); ctx.ellipse(spotX, fy, 210, 34, 0, 0, TAU); ctx.fill();

    // 镜面倒影（裁剪在地面区域内）
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, fy, w, h - fy);
    ctx.clip();
    ctx.globalAlpha = 0.2;
    ctx.translate(0, fy);
    ctx.scale(1, -1);
    ctx.translate(0, -fy);
    drawFigure(pose, true);
    ctx.restore();

    // 倒影渐隐遮罩 + 地面光泽
    const fade = ctx.createLinearGradient(0, fy, 0, h);
    fade.addColorStop(0, 'rgba(13,15,36,0.25)');
    fade.addColorStop(1, 'rgba(6,7,15,0.92)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, fy, w, h - fy);
  }

  function drawSpotCone() {
    const sx = spotX;
    const g = ctx.createLinearGradient(0, 0, 0, view.floorY);
    g.addColorStop(0, 'rgba(214,218,255,0.16)');
    g.addColorStop(1, 'rgba(214,218,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sx - 7, -10);
    ctx.lineTo(sx - 185, view.floorY + 26);
    ctx.lineTo(sx + 185, view.floorY + 26);
    ctx.lineTo(sx + 7, -10);
    ctx.closePath();
    ctx.fill();
  }

  function drawBin() {
    const x = view.binX, fy = view.floorY;
    const topY = fy - 58, ht = 34, hb = 26;
    ctx.save();
    // 桶身（梯形）
    const bodyG = ctx.createLinearGradient(x - ht, topY, x + ht, fy);
    bodyG.addColorStop(0, '#3a4060');
    bodyG.addColorStop(1, '#20243c');
    ctx.fillStyle = bodyG;
    ctx.strokeStyle = 'rgba(180,190,230,0.5)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - ht, topY);
    ctx.lineTo(x + ht, topY);
    ctx.lineTo(x + hb, fy);
    ctx.lineTo(x - hb, fy);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 桶口
    ctx.fillStyle = '#05060f';
    ctx.beginPath(); ctx.ellipse(x, topY, ht, 7, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(180,190,230,0.55)';
    ctx.stroke();
    // 桶身竖纹
    ctx.strokeStyle = 'rgba(10,12,26,0.55)';
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      const tX = x + i * 12, bX = x + i * 9;
      ctx.moveTo(tX, topY + 4); ctx.lineTo(bX, fy - 2);
    }
    ctx.stroke();
    // 燃烧时桶口辉光
    if (fx.burn.active) {
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(x, topY, 2, x, topY, 60 + 26 * beat.pulse);
      glow.addColorStop(0, 'rgba(255,170,60,0.55)');
      glow.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, topY, 60 + 26 * beat.pulse, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }
  /* ---------------- 粒子 / 光效渲染 ---------------- */
  const SPARK_RGB = { 2: '110,235,255', 3: '255,120,180', 4: '255,211,77', 5: '235,238,255' };

  function drawStar(x, y, r, alpha) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = i * Math.PI / 4;
      const rr = i % 2 === 0 ? r : r * 0.4;
      const px = x + Math.cos(ang) * rr, py = y + Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.globalAlpha = alpha;
    ctx.fill();
  }

  function drawParticles(additive) {
    if (additive) ctx.globalCompositeOperation = 'lighter';
    particles.eachActive(function (p) {
      const q = p.life / p.max;
      if (p.kind === 'fire') {
        if (!additive) return;
        const r = p.size * (0.35 + 0.65 * q);
        let col;
        if (q > 0.55) col = '255,70,30';
        else if (q > 0.28) col = '255,150,40';
        else col = '255,225,130';
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, 'rgba(' + col + ',' + (0.9 * q) + ')');
        g.addColorStop(1, 'rgba(' + col + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      } else if (p.kind === 'smoke') {
        if (additive) return;
        const r = p.size * (1 + (1 - q) * 1.7);
        ctx.fillStyle = 'rgba(110,114,140,' + (0.2 * q) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      } else if (p.kind === 'aura') {
        if (!additive) return;
        ctx.fillStyle = 'rgba(255,210,90,' + (0.7 * q) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * q), 0, TAU); ctx.fill();
      } else if (p.kind === 'spark') {
        if (!additive) return;
        const rgb = SPARK_RGB[p.hue] || SPARK_RGB[5];
        if (p.size > 4) {
          ctx.fillStyle = 'rgb(' + rgb + ')';
          drawStar(p.x, p.y, p.size * (0.5 + 0.5 * q), q);
        } else {
          ctx.fillStyle = 'rgba(' + rgb + ',' + q + ')';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * q), 0, TAU); ctx.fill();
        }
      } else if (p.kind === 'rocket') {
        if (!additive) return;
        ctx.fillStyle = 'rgba(255,225,150,' + q + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawSlashes() {
    ctx.globalCompositeOperation = 'lighter';
    slashes.eachActive(function (s) {
      const q = s.life / s.max;
      ctx.strokeStyle = 'rgba(180,245,255,' + (0.85 * q) + ')';
      ctx.lineWidth = s.w * q;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(s.cx, s.cy, s.r, s.a0, s.a1);
      ctx.stroke();
      ctx.shadowBlur = 0;
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawRingsAndFireballs() {
    ctx.globalCompositeOperation = 'lighter';
    rings.eachActive(function (r) {
      const q = r.life / r.max;
      ctx.strokeStyle = 'rgba(' + r.color + ',' + (0.8 * q) + ')';
      ctx.lineWidth = 3.5 * q + 0.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
    });
    fireballs.eachActive(function (f) {
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 13);
      g.addColorStop(0, 'rgba(255,240,180,0.95)');
      g.addColorStop(0.4, 'rgba(255,150,50,0.8)');
      g.addColorStop(1, 'rgba(255,80,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y, 13, 0, TAU); ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawTexts() {
    ctx.textAlign = 'center';
    floatTexts.eachActive(function (t) {
      const q = t.life / t.max;
      ctx.globalAlpha = Math.min(1, q * 1.6);
      ctx.font = 'bold ' + t.size + 'px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 10;
      ctx.fillText(t.text, t.x, t.y);
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;

    // 环保提示文字：垃圾焚烧发电中
    if (fx.burn.active) {
      const small = view.w < 520;
      const y = view.floorY - 84 + Math.sin(beat.clock * TAU * 2) * 3;
      const labelX = clamp(view.binX + (small ? 0 : 26), 80, view.w - 80);
      const boltX = labelX - (small ? 78 : 102);
      ctx.font = 'bold ' + (small ? 13 : 17) + 'px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#ffd98a';
      ctx.shadowColor = '#ff8a3c';
      ctx.shadowBlur = 12;
      ctx.fillText('垃圾焚烧发电中', labelX, y);
      // 小闪电图标
      const s = small ? 0.75 : 1;
      ctx.beginPath();
      ctx.moveTo(boltX + 8 * s, y - 13 * s); ctx.lineTo(boltX, y + 2 * s);
      ctx.lineTo(boltX + 6 * s, y + 2 * s); ctx.lineTo(boltX, y + 17 * s);
      ctx.lineTo(boltX + 14 * s, y - 3 * s); ctx.lineTo(boltX + 8 * s, y - 3 * s);
      ctx.closePath();
      ctx.fillStyle = '#ffe27a';
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 兴奋度满槽：金色烟花 + 全场欢呼文字
    if (state.celebrate > 0) {
      const total = 2.6;
      const pop = 1 - state.celebrate / total;
      const scale = pop < 0.18 ? smooth(pop / 0.18) * 1.15 : 1 + Math.sin(pop * 18) * 0.03;
      const alpha = state.celebrate < 0.7 ? state.celebrate / 0.7 : 1;
      ctx.save();
      ctx.translate(view.w / 2, view.h * 0.3);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.font = '900 46px system-ui, "Microsoft YaHei", sans-serif';
      ctx.shadowColor = '#ffd34d';
      ctx.shadowBlur = 26;
      ctx.fillStyle = '#ffe9a0';
      ctx.fillText('全场欢呼！', 0, 0);
      ctx.font = 'bold 18px system-ui, "Microsoft YaHei", sans-serif';
      ctx.shadowColor = '#ff5ca8';
      ctx.fillStyle = '#ff9ecb';
      ctx.fillText('观众席彻底沸腾了', 0, 32);
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  }

  // 超级变身倒计时环
  function drawTransformRing() {
    if (!fx.trans.active) return;
    const h = actor.head;
    const r = 30 * actor.scale;
    const q = fx.trans.t / FX_CONF.trans.dur;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ffd34d';
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(h.x, h.y, r, -D90, -D90 + TAU * q);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  /* ---------------- 每帧更新 ---------------- */
  function update(dt, pose) {
    // 特效计时
    Object.keys(fx).forEach(function (k) {
      const f = fx[k];
      if (f.active) {
        f.t -= dt;
        if (f.t <= 0) f.active = false;
      }
      if (f.cdt > 0) f.cdt = Math.max(0, f.cdt - dt);
    });

    // 变身体型过渡、合拍小跳、挥砍节奏
    const targetScale = fx.trans.active ? 1.34 : 1;
    actor.scale += (targetScale - actor.scale) * Math.min(1, dt * 6);
    if (state.slashCd > 0) state.slashCd -= dt;
    if (state.swordSwing < 1) state.swordSwing = Math.min(1, state.swordSwing + dt / 0.24);
    state.hop *= Math.pow(0.001, dt);

    // 聚光灯追随角色
    spotX += (pose.hx - spotX) * Math.min(1, dt * 4.5);

    // 各类粒子发射
    if (fx.fire.active) {
      const fs = 1 + 0.45 * beat.pulse;
      emitFire(actor.handL.x, actor.handL.y, Math.round(dt * 165), fs);
      emitFire(actor.handR.x, actor.handR.y, Math.round(dt * 165), fs);
    }
    if (fx.burn.active) {
      const n = Math.round(dt * (150 + 200 * beat.pulse));
      for (let i = 0; i < n; i++) {
        spawnParticle('fire', view.binX + rand(-13, 13), view.floorY - 60, {
          vx: rand(-20, 20), vy: rand(-150, -70),
          life: rand(0.35, 0.7), size: rand(5, 10) * (1 + 0.3 * beat.pulse)
        });
      }
      emitSmoke(view.binX, view.floorY - 62, Math.round(dt * 26));
    }
    if (fx.trans.active) emitAura(Math.round(dt * 90));

    updateParticles(dt);
    updateFireballs(dt);
    slashes.eachActive(function (s) { s.life -= dt; if (s.life <= 0) s.active = false; });
    rings.eachActive(function (r) { r.life -= dt; r.r += r.vr * dt; if (r.life <= 0) r.active = false; });
    floatTexts.eachActive(function (t) {
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.pow(0.96, dt * 60);
      if (t.life <= 0) t.active = false;
    });

    // 兴奋度：特效演出中持续微增，闲置时缓慢衰减
    let trickle = 0;
    if (fx.fire.active) trickle += 1.4;
    if (fx.sword.active) trickle += 1.4;
    if (fx.trans.active) trickle += 2.0;
    state.excite = clamp(state.excite + (trickle - 2.8) * dt, 0, 100);
    if (!state.cheerArmed && state.excite < 35) state.cheerArmed = true;
    if (state.excite >= 100 && state.cheerArmed && state.celebrate <= 0) {
      state.excite = 0;
      triggerCelebrate();
    }

    // 庆祝演出
    if (state.celebrate > 0) {
      state.celebrate -= dt;
      for (let i = state.rocketQueue.length - 1; i >= 0; i--) {
        state.rocketQueue[i] -= dt;
        if (state.rocketQueue[i] <= 0) {
          launchRocket();
          state.rocketQueue.splice(i, 1);
        }
      }
      state.cheerWordT -= dt;
      if (state.cheerWordT <= 0) {
        state.cheerWordT = 0.45;
        const words = ['安可！', '太棒了！', '好！', '再来一个！', '观众沸腾了！'];
        spawnText(rand(view.w * 0.2, view.w * 0.8), rand(view.h * 0.4, view.h * 0.66),
          pick(words), pick(['#ffd34d', '#22d3ee', '#ff5ca8']), rand(16, 22), 1.3);
      }
      if (state.celebrate <= 0) exciteFill.classList.remove('full');
    }

    syncUI(dt);
  }

  /* ---------------- 整帧渲染 ---------------- */
  function render(pose) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, view.w, view.h);

    drawStars();
    const spX = Math.max(66, view.w * 0.07);
    drawSpeaker(spX, false);
    drawSpeaker(view.w - spX, true);

    drawSpotCone();
    drawFloorAndLights(pose);
    drawBin();
    drawParticles(false);                 // 烟雾（普通混合）
    drawFigure(pose, false);

    // 宝剑跟随右手，挥砍时快速扫过
    if (fx.sword.active) {
      const sw = state.swordSwing >= 1
        ? 0.18 * Math.sin(beat.clock * Math.PI)
        : -1.05 + 2.1 * smooth(state.swordSwing);
      drawSword(actor.handR.x, actor.handR.y, -D90 - 0.2 + sw, actor.scale);
    }
    drawTransformRing();

    drawParticles(true);                  // 火焰 / 金焰 / 火花（加色混合）
    drawSlashes();
    drawRingsAndFireballs();
    drawTexts();
  }

  /* ---------------- UI 同步 ---------------- */
  let uiT = 0;
  function syncUI(dt) {
    uiT -= dt;
    if (uiT > 0) return;
    uiT = 0.1;
    Object.keys(fx).forEach(function (k) {
      const f = fx[k], btn = fxBtns[k], lab = fxStates[k], conf = FX_CONF[k];
      btn.classList.toggle('on', f.active);
      btn.classList.toggle('cooling', !f.active && f.cdt > 0);
      if (f.active) lab.textContent = '持续 ' + f.t.toFixed(1) + ' 秒';
      else if (f.cdt > 0) lab.textContent = '冷却 ' + f.cdt.toFixed(1) + ' 秒';
      else lab.textContent = '就绪';
    });
    exciteFill.style.width = state.excite.toFixed(1) + '%';
    // 音乐角标
    if (!audio.started) {
      musicChip.className = 'music-chip';
      musicText.textContent = '点击启动鼓点';
    } else if (audio.muted) {
      musicChip.className = 'music-chip muted';
      musicText.textContent = beat.bpm + ' BPM 已静音';
    } else {
      musicChip.className = 'music-chip playing';
      musicText.textContent = beat.bpm + ' BPM 演奏中';
    }
  }

  /* ---------------- 截屏 ---------------- */
  function screenshot() {
    try {
      const a = document.createElement('a');
      a.download = '火柴人舞台-舞台截图.png';
      a.href = canvas.toDataURL('image/png');
      document.body.appendChild(a);
      a.click();
      a.remove();
      spawnText(view.w / 2, view.h * 0.32, '已保存当前舞台画面', '#22d3ee', 18, 1.2);
    } catch (e) {
      spawnText(view.w / 2, view.h * 0.32, '截屏失败', '#ff5ca8', 16, 1.2);
    }
  }

  /* ---------------- 输入绑定 ---------------- */
  function bindInput() {
    // 数字键 / 特效键 / 空格
    window.addEventListener('keydown', function (e) {
      if (e.target && e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k >= '1' && k <= '6') {
        selectMove(Number(k) - 1, false);
      } else if (k === 'f') {
        toggleFx('fire');
      } else if (k === 'b') {
        toggleFx('burn');
      } else if (k === 's') {
        toggleFx('sword');
      } else if (k === 't') {
        toggleFx('trans');
      } else if (k === ' ') {
        e.preventDefault();
        beatAction();
      } else {
        return;
      }
    });

    moveBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectMove(Number(btn.getAttribute('data-move')), false);
      });
    });
    Object.keys(fxBtns).forEach(function (k) {
      fxBtns[k].addEventListener('click', function () { toggleFx(k); });
    });

    muteBtn.addEventListener('click', function () {
      audio.setMuted(!audio.muted);
      muteBtn.querySelector('.label').textContent = audio.muted ? '鼓点：关' : '鼓点：开';
    });
    autoBtn.addEventListener('click', function () {
      state.auto = !state.auto;
      autoBtn.classList.toggle('on', state.auto);
      autoBtn.querySelector('.label').textContent = state.auto ? '自动导演：开' : '自动导演：关';
      if (state.auto) state.dirTimer = 0;
    });
    shotBtn.addEventListener('click', screenshot);
    beatBtn.addEventListener('click', beatAction);

    bpmRange.addEventListener('input', function () {
      beat.bpm = Number(bpmRange.value);
      bpmVal.textContent = beat.bpm;
      audio.remap();
    });

    // 舞台点击：火焰时投掷火球，持剑时挥砍
    canvas.addEventListener('pointerdown', function (e) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (fx.fire.active) throwFireball(x, y);
      else if (fx.sword.active) doSwing();
    });

    introStart.addEventListener('click', function () {
      introOverlay.classList.add('hidden');
      audio.ensure();
    });
    document.addEventListener('pointerdown', function once() {
      audio.ensure();
    }, { once: true });
    window.addEventListener('keydown', function once() {
      audio.ensure();
    }, { once: true });
  }

  /* ---------------- 主循环：rAF + delta ---------------- */
  let lastTime = 0;
  function frame(now) {
    if (!lastTime) lastTime = now;
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    dt = clamp(dt, 0, 0.05);

    beat.clock += dt * beat.bpm / 60;
    const ib = Math.floor(beat.clock);
    if (ib !== beat.lastInt) {
      beat.lastInt = ib;
      beat.pulse = 1;
      directorTick();
    }
    beat.pulse *= Math.pow(0.002, dt);

    const pose = makePose(beat.clock);
    update(dt, pose);
    render(pose);
    requestAnimationFrame(frame);
  }

  /* ---------------- 启动 ---------------- */
  resizeStage();
  bindInput();
  // 初始动作直接置位，不触发兴奋度与提示文字
  state.move = 0;
  moveBtns[0].classList.add('on');
  requestAnimationFrame(frame);
})();