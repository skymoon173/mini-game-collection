/* ============================================================
 * 牛顿第二定律实验室  game.js
 * 纯 Canvas 2D，零外部依赖
 * 物理：半隐式欧拉积分 + 固定子步 1/120 s
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------- DOM ---------------- */
  const $ = (id) => document.getElementById(id);

  const worldCanvas = $('world');
  const chartCanvas = $('chart');
  const stage = $('stage');
  const ctx = worldCanvas.getContext('2d');
  const cctx = chartCanvas.getContext('2d');

  // 控件
  const massSlider = $('massSlider');
  const gSlider = $('gSlider');
  const eSlider = $('eSlider');
  const massVal = $('massVal');
  const gVal = $('gVal');
  const eVal = $('eVal');
  const dragToggle = $('dragToggle');
  const trailToggle = $('trailToggle');
  const chartToggle = $('chartToggle');
  const resetBtn = $('resetBtn');
  const clearBtn = $('clearBtn');
  const chartClearBtn = $('chartClearBtn');
  const pauseBtn = $('pauseBtn');
  const btnResume = $('btnResume');
  const btnStart = $('btnStart');
  const panel = $('panel');
  const panelToggle = $('panelToggle');
  const chartGroup = $('chartGroup');

  // 读数
  const rX = $('rX'), rY = $('rY'), rV = $('rV'), rA = $('rA');
  const rKE = $('rKE'), rPE = $('rPE'), rE = $('rE'), rG = $('rG');

  // 公式条
  const formulaBar = $('formulaBar');
  const fF = $('fF'), fM = $('fM'), fA = $('fA');
  const banner = $('banner');
  const pauseOverlay = $('pauseOverlay');
  const introOverlay = $('introOverlay');

  /* ---------------- 物理常量 ---------------- */
  const PPM = 60;                 // 像素/米
  const FIXED_DT = 1 / 120;       // 固定物理子步（秒）
  const WALL = 14;                // 墙厚（像素）
  const GROUND_H = 56;            // 地面厚度（像素）
  const F_MAX = 150;              // 最大蓄力（牛）
  const LAUNCH_MIN = 4;           // 最小有效发射力（牛）
  const PULSE_T = 0.18;           // 发射力脉冲持续时间（秒）
  const CHARGE_TIME = 1.1;        // 空格蓄满时间（秒）
  const DRAG_FULL = 190;          // 拖拽满力距离（像素）
  const KEY_FORCE = 42;           // 方向键持续施力（牛）
  const MU = 0.22;                // 地面动摩擦因数
  const REST_V = 0.45;            // 落地后小于此速度即静止（米/秒）
  const AIR_RHO = 1.225;          // 空气密度 kg/m^3
  const AIR_CD = 0.47;            // 球体阻力系数
  const ARROW_K = 8;              // 矢量统一比例：8 像素 /（米/秒）或（米/秒^2）
  const MAX_ARROW = 150;          // 矢量最大像素长度
  const CHART_WIN = 20;           // 图表时间窗口（秒）
  const SAMPLE_DT = 0.05;         // 图表采样间隔（秒）

  // 配色
  const COL = {
    yellow: '#ffd34d',
    cyan: '#22d3ee',
    pink: '#ff5ca8',
    amber: '#ffb347',
    purple: '#7c5cff'
  };

  /* ---------------- 状态 ---------------- */
  const params = {
    mass: 1,          // kg
    g: 9.8,           // m/s^2
    air: false,       // 空气阻力
    e: 0.78,          // 恢复系数
    trail: true,      // 轨迹残影
    chart: true       // 速度曲线
  };

  const ball = {
    x: 0, y: 0,
    vx: 0, vy: 0,     // 像素/秒
    r: 16,            // 半径（像素），随质量缩放
    angle: 0,         // 自转角度（弧度）
    omega: 0,         // 角速度（弧度/秒）
    onGround: false,
    pulse: { fx: 0, fy: 0, t: 0 },  // 发射力脉冲
    lastDrag: { x: 0, y: 0, mag: 0 }
  };

  // 键盘持续按下状态
  const keys = { left: false, right: false, up: false, down: false };

  // 蓄力状态：mode = null | 'drag' | 'space'
  const charge = { mode: null, sx: 0, sy: 0, x: 0, y: 0, t: 0, angle: -Math.PI / 2, pid: -1 };
  let pointer = { x: -9999, y: -9999 };

  const trail = [];                // 轨迹点
  const samples = [];              // v-t 采样 {t, v}
  let simTime = 0;                 // 模拟计时（暂停时不增长）
  let sampleAcc = 0;
  let aSmooth = 0;                 // 实测加速度平滑值
  let lastLaunch = null;           // 上一次发射，用于动态结论对比
  let bannerTimer = null;

  // 画布尺寸（CSS 像素）
  let W = 320, H = 260, DPR = 1;
  let cW = 200, cH = 118, chartDPR = 1;

  // 运行状态
  let introOpen = true;
  let paused = false;

  /* ---------------- 工具 ---------------- */
  const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
  const fmt = (v, d) => (isFinite(v) ? v.toFixed(d) : '-');

  // 半径随质量缩放：r = 16 * 立方根(m)，限制在 12~38 像素
  function radiusFor(m) { return clamp(16 * Math.cbrt(m), 12, 38); }

  // 场地内部边界
  function bounds() {
    return { l: WALL, t: WALL, r: W - WALL, b: H - GROUND_H };
  }

  function keepInBounds() {
    const bd = bounds();
    ball.x = clamp(ball.x, bd.l + ball.r, bd.r - ball.r);
    ball.y = Math.min(ball.y, bd.b - ball.r);
  }
  /* ---------------- 空气阻力（F = 1/2 ρ Cd A v^2） ---------------- */
  function dragForce(vxM, vyM, radiusPx) {
    const sp = Math.hypot(vxM, vyM);
    if (sp < 1e-4) return { x: 0, y: 0, mag: 0 };
    const R = radiusPx / PPM;
    const mag = 0.5 * AIR_RHO * AIR_CD * Math.PI * R * R * sp * sp;
    return { x: -mag * vxM / sp, y: -mag * vyM / sp, mag: mag };
  }

  // 玩家当前施加的力（发射脉冲 + 方向键）；蓄力瞄准期间不计方向键力
  function appliedForce() {
    let x = 0, y = 0;
    if (ball.pulse.t > 0) { x += ball.pulse.fx; y += ball.pulse.fy; }
    if (!charge.mode) {
      if (keys.left) x -= KEY_FORCE;
      if (keys.right) x += KEY_FORCE;
      if (keys.up) y -= KEY_FORCE;
      if (keys.down) y += KEY_FORCE;
    }
    return { x, y, mag: Math.hypot(x, y) };
  }

  /* ---------------- 物理子步：半隐式欧拉 ---------------- */
  function step(dt) {
    const m = params.mass;

    // 1) 求合力（牛）
    let Fx = 0;
    let Fy = m * params.g;                 // 重力 G = mg，方向向下
    const af = appliedForce();
    Fx += af.x;
    Fy += af.y;

    const vMx = ball.vx / PPM;
    const vMy = ball.vy / PPM;
    const drag = params.air ? dragForce(vMx, vMy, ball.r) : { x: 0, y: 0, mag: 0 };
    Fx += drag.x;
    Fy += drag.y;
    ball.lastDrag = drag;

    // 2) 牛顿第二定律 a = F / m
    const ax = Fx / m;
    const ay = Fy / m;

    // 3) 半隐式欧拉：先更新速度，再更新位置
    ball.vx += ax * PPM * dt;
    ball.vy += ay * PPM * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.pulse.t = Math.max(0, ball.pulse.t - dt);

    // 4) 碰撞约束
    ball.onGround = false;
    const bd = bounds();

    if (ball.x - ball.r < bd.l) {
      ball.x = bd.l + ball.r;
      if (ball.vx < 0) {
        ball.vx = -ball.vx * params.e;
        if (Math.abs(ball.vx) < REST_V * PPM) ball.vx = 0;
      }
    } else if (ball.x + ball.r > bd.r) {
      ball.x = bd.r - ball.r;
      if (ball.vx > 0) {
        ball.vx = -ball.vx * params.e;
        if (Math.abs(ball.vx) < REST_V * PPM) ball.vx = 0;
      }
    }

    if (ball.y + ball.r > bd.b) {
      ball.y = bd.b - ball.r;
      if (ball.vy > 0) {
        ball.vy = -ball.vy * params.e;            // 法向恢复
        if (Math.abs(ball.vy) < REST_V * PPM) ball.vy = 0;  // 微小弹跳直接静止
      }
      ball.onGround = true;
      // 库仑动摩擦：a_f = μ g，方向与水平速度相反
      if (Math.abs(ball.vx) > 1e-6) {
        const maxD = MU * params.g * PPM * dt;
        if (Math.abs(ball.vx) <= maxD) ball.vx = 0;
        else ball.vx -= Math.sign(ball.vx) * maxD;
      }
    }

    // 5) 滚动自转：接地时无滑动滚动 ω = v / r，离地后保持惯性自转
    if (ball.onGround) ball.omega = ball.vx / ball.r;
    ball.angle += ball.omega * dt;
  }

  /* ---------------- 发射与动态结论 ---------------- */
  function launch(fx, fy) {
    const mag = Math.hypot(fx, fy);
    if (mag < LAUNCH_MIN) return;
    const a = mag / params.mass;
    const prev = lastLaunch;

    let txt = '';
    if (prev && prev.F > 5) {
      const rm = params.mass / prev.m;
      const rF = mag / prev.F;
      if (rF > 0.7 && rF < 1.4 && rm >= 1.55) {
        txt = '力几乎相同（' + fmt(mag, 1) + ' N），质量约加倍：a 由 ' + fmt(prev.a, 2) +
              ' 减为 ' + fmt(a, 2) + ' m/s²，约为原来的一半。';
      } else if (rF > 0.7 && rF < 1.4 && rm <= 0.66) {
        txt = '力几乎相同（' + fmt(mag, 1) + ' N），质量约减半：a 由 ' + fmt(prev.a, 2) +
              ' 增至 ' + fmt(a, 2) + ' m/s²，约为原来的两倍。';
      } else if (rm > 0.8 && rm < 1.25 && rF >= 1.55) {
        txt = '质量不变而作用力约加倍，a 也成比例加倍：' + fmt(prev.a, 2) +
              ' → ' + fmt(a, 2) + ' m/s²。';
      } else if (rm > 0.8 && rm < 1.25 && rF <= 0.66) {
        txt = '质量不变而作用力约减半，a 也随之减半：' + fmt(prev.a, 2) +
              ' → ' + fmt(a, 2) + ' m/s²。';
      }
    }
    if (!txt) {
      txt = '本次施力 F = ' + fmt(mag, 1) + ' N，质量 m = ' + fmt(params.mass, 1) +
            ' kg，由 F = m·a 得 a = ' + fmt(a, 2) + ' m/s²。';
    }

    ball.pulse = { fx: fx, fy: fy, t: PULSE_T };
    lastLaunch = { m: params.mass, F: mag, a: a };
    showBanner(txt);
  }

  function showBanner(text) {
    banner.textContent = text;
    banner.classList.add('show');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.remove('show'), 5200);
  }
  /* ---------------- 画布尺寸（devicePixelRatio 自适应） ---------------- */
  function resize() {
    const rect = stage.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(260, Math.floor(rect.width));
    H = Math.max(260, Math.floor(rect.height));
    worldCanvas.width = Math.round(W * DPR);
    worldCanvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    keepInBounds();
    resizeChart();
  }

  function resizeChart() {
    const rect = chartCanvas.getBoundingClientRect();
    chartDPR = Math.min(window.devicePixelRatio || 1, 2);
    cW = Math.max(50, Math.floor(rect.width));
    cH = Math.max(50, Math.floor(rect.height));
    chartCanvas.width = Math.round(cW * chartDPR);
    chartCanvas.height = Math.round(cH * chartDPR);
    cctx.setTransform(chartDPR, 0, 0, chartDPR, 0, 0);
  }

  function resetBall() {
    const bd = bounds();
    ball.x = (bd.l + bd.r) / 2;
    ball.y = (bd.t + bd.b) / 2;
    ball.vx = 0;
    ball.vy = 0;
    ball.angle = 0;
    ball.omega = 0;
    ball.onGround = false;
    ball.pulse = { fx: 0, fy: 0, t: 0 };
    trail.length = 0;
  }

  /* ---------------- 输入：鼠标/触摸拖拽蓄力 ---------------- */
  function pointerPos(e) {
    const rect = worldCanvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  worldCanvas.addEventListener('pointerdown', (e) => {
    if (paused || introOpen || charge.mode) return;
    try { worldCanvas.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    const p = pointerPos(e);
    pointer = p;
    charge.mode = 'drag';
    charge.sx = p.x; charge.sy = p.y;
    charge.x = p.x; charge.y = p.y;
    charge.pid = e.pointerId;
  });

  worldCanvas.addEventListener('pointermove', (e) => {
    pointer = pointerPos(e);
    if (charge.mode === 'drag' && e.pointerId === charge.pid) {
      charge.x = pointer.x;
      charge.y = pointer.y;
    }
  });

  function endPointer(e) {
    if (charge.mode !== 'drag' || e.pointerId !== charge.pid) return;
    const v = dragVector();
    charge.mode = null;
    launch(v.fx, v.fy);
  }
  worldCanvas.addEventListener('pointerup', endPointer);
  worldCanvas.addEventListener('pointercancel', () => { charge.mode = null; });

  // 拖拽向量 → 力（沿拖拽方向，大小与拖拽距离成正比）
  function dragVector() {
    const dx = charge.x - charge.sx;
    const dy = charge.y - charge.sy;
    const len = Math.hypot(dx, dy);
    const mag = clamp(len / DRAG_FULL, 0, 1) * F_MAX;
    let ux = 0, uy = -1;
    if (len > 1e-3) { ux = dx / len; uy = dy / len; }
    return { fx: ux * mag, fy: uy * mag, mag: mag };
  }

  /* ---------------- 输入：键盘（空格蓄力 / 方向键施力） ---------------- */
  const keyMap = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

  window.addEventListener('keydown', (e) => {
    const tag = ((e.target && e.target.tagName) || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    if (e.code === 'Space') {
      if (tag === 'button' && e.target.blur) e.target.blur();
      if (introOpen || paused) return;
      e.preventDefault();
      if (!charge.mode && !e.repeat) {
        charge.mode = 'space';
        charge.t = 0;
        charge.angle = -Math.PI / 2;   // 默认竖直向上
      }
      return;
    }
    const k = keyMap[e.key];
    if (k) {
      e.preventDefault();
      keys[k] = true;
    }
    if (e.key === 'r' || e.key === 'R') resetBall();
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      if (charge.mode === 'space') {
        const mag = F_MAX * clamp(charge.t / CHARGE_TIME, 0, 1);
        const ang = charge.angle;
        charge.mode = null;
        e.preventDefault();
        launch(Math.cos(ang) * mag, Math.sin(ang) * mag);
      }
      return;
    }
    const k = keyMap[e.key];
    if (k) keys[k] = false;
  });

  /* ---------------- 控件绑定 ---------------- */
  function syncMass() {
    params.mass = parseFloat(massSlider.value);
    ball.r = radiusFor(params.mass);
    keepInBounds();
    massVal.textContent = fmt(params.mass, 1);
  }
  function syncG() {
    params.g = parseFloat(gSlider.value);
    gVal.textContent = fmt(params.g, 2);
    document.querySelectorAll('[data-g]').forEach((btn) => {
      btn.classList.toggle('active', Math.abs(parseFloat(btn.dataset.g) - params.g) < 0.011);
    });
  }
  function syncE() {
    params.e = parseFloat(eSlider.value);
    eVal.textContent = fmt(params.e, 2);
  }
  massSlider.addEventListener('input', syncMass);
  gSlider.addEventListener('input', syncG);
  eSlider.addEventListener('input', syncE);

  document.querySelectorAll('[data-g]').forEach((btn) => {
    btn.addEventListener('click', () => {
      gSlider.value = btn.dataset.g;
      syncG();
    });
  });

  dragToggle.addEventListener('change', () => { params.air = dragToggle.checked; });
  trailToggle.addEventListener('change', () => {
    params.trail = trailToggle.checked;
    if (!params.trail) trail.length = 0;
  });
  chartToggle.addEventListener('change', () => {
    params.chart = chartToggle.checked;
    chartGroup.style.display = params.chart ? '' : 'none';
    if (params.chart) resizeChart();
  });

  resetBtn.addEventListener('click', () => { resetBall(); });
  clearBtn.addEventListener('click', () => {
    trail.length = 0;
    samples.length = 0;
  });
  chartClearBtn.addEventListener('click', () => { samples.length = 0; });

  // 面板折叠（移动端）
  panelToggle.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    panelToggle.textContent = collapsed ? '展开' : '收起';
    if (!collapsed) resizeChart();
  });
  if (window.matchMedia && window.matchMedia('(max-width: 860px)').matches) {
    panel.classList.add('collapsed');
    panelToggle.textContent = '展开';
  }

  /* ---------------- 暂停 / 引导 ---------------- */
  function setPaused(v) {
    if (introOpen && v) return;
    paused = v;
    pauseOverlay.classList.toggle('hidden', !v);
    pauseBtn.textContent = v ? '继续' : '暂停';
  }
  pauseBtn.addEventListener('click', () => setPaused(!paused));
  btnResume.addEventListener('click', () => setPaused(false));
  btnStart.addEventListener('click', () => {
    introOpen = false;
    introOverlay.classList.add('hidden');
    btnStart.blur();
    resetBall();
  });

  // 失焦 / 切到后台自动暂停计时
  window.addEventListener('blur', () => setPaused(true));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPaused(true);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !introOpen) setPaused(!paused);
  });

  window.addEventListener('resize', resize);
  /* ---------------- 渲染：矢量箭头 ---------------- */
  function drawVector(x0, y0, ux, uy, color, label) {
    const mag = Math.hypot(ux, uy);
    if (mag < 0.02) return;
    const len = Math.min(mag * ARROW_K, MAX_ARROW);
    const nx = ux / mag, ny = uy / mag;
    const tipX = x0 + nx * len;
    const tipY = y0 + ny * len;
    const head = 9;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    // 箭头头部
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - nx * head - ny * head * 0.55, tipY - ny * head + nx * head * 0.55);
    ctx.lineTo(tipX - nx * head + ny * head * 0.55, tipY - ny * head - nx * head * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 数值标签
    ctx.save();
    ctx.font = '600 11px system-ui, "Microsoft YaHei", sans-serif';
    const tw = ctx.measureText(label).width;
    let lx = tipX + nx * 8 - tw / 2;
    let ly = tipY + ny * 8 - 6;
    lx = clamp(lx, 2, W - tw - 6);
    ly = clamp(ly, 12, H - 6);
    ctx.fillStyle = 'rgba(8,10,26,.72)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    roundRectPath(lx - 5, ly - 10, tw + 10, 17, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(label, lx, ly + 2.5);
    ctx.restore();
  }

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------------- 渲染：场地（墙、地面、法线） ---------------- */
  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.035)';
    ctx.lineWidth = 1;
    for (let x = WALL; x < W - WALL; x += PPM) {
      ctx.beginPath(); ctx.moveTo(x, WALL); ctx.lineTo(x, H - GROUND_H); ctx.stroke();
    }
    for (let y = WALL; y < H - GROUND_H; y += PPM) {
      ctx.beginPath(); ctx.moveTo(WALL, y); ctx.lineTo(W - WALL, y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawNormalArrow(x, yTop, h) {
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yTop - h);
    ctx.moveTo(x - 4, yTop - h + 5);
    ctx.lineTo(x, yTop - h);
    ctx.lineTo(x + 4, yTop - h + 5);
    ctx.stroke();
  }

  function drawArena() {
    const bd = bounds();

    // 左右墙体
    ctx.save();
    ctx.fillStyle = 'rgba(124,92,255,.13)';
    ctx.fillRect(0, 0, WALL, H);
    ctx.fillRect(W - WALL, 0, WALL, H);
    ctx.shadowColor = COL.purple;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(124,92,255,.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bd.l, 0); ctx.lineTo(bd.l, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bd.r, 0); ctx.lineTo(bd.r, H); ctx.stroke();
    ctx.restore();

    // 地面
    ctx.save();
    const gg = ctx.createLinearGradient(0, bd.b, 0, H);
    gg.addColorStop(0, 'rgba(20,24,58,.95)');
    gg.addColorStop(1, 'rgba(10,12,30,.98)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, bd.b, W, GROUND_H);
    ctx.shadowColor = COL.cyan;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = COL.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, bd.b); ctx.lineTo(W, bd.b); ctx.stroke();
    ctx.restore();

    // 地面法线箭头
    ctx.save();
    ctx.strokeStyle = 'rgba(34,211,238,.7)';
    ctx.lineWidth = 1.5;
    for (let x = bd.l + 44; x < bd.r - 20; x += 72) drawNormalArrow(x, bd.b - 2, 15);
    ctx.font = '11px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = 'rgba(34,211,238,.85)';
    ctx.fillText('支持力 N（地面法线）', bd.l + 8, bd.b - 24);
    ctx.restore();
  }

  /* ---------------- 渲染：轨迹 ---------------- */
  function drawTrail() {
    if (!params.trail || trail.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 1; i < trail.length; i++) {
      const a = i / trail.length;
      ctx.globalAlpha = a * 0.5;
      ctx.strokeStyle = COL.cyan;
      ctx.lineWidth = 1 + a * 2.2;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------- 渲染：发光螺旋花纹球 ---------------- */
  function drawBall() {
    const r = ball.r;

    // 外发光晕
    ctx.save();
    const halo = ctx.createRadialGradient(ball.x, ball.y, 2, ball.x, ball.y, r * 2.3);
    halo.addColorStop(0, 'rgba(124,92,255,.35)');
    halo.addColorStop(0.55, 'rgba(124,92,255,.10)');
    halo.addColorStop(1, 'rgba(124,92,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r * 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(ball.x, ball.y);

    // 球体
    ctx.shadowColor = 'rgba(124,92,255,.9)';
    ctx.shadowBlur = 18;
    const body = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.12, 0, 0, r);
    body.addColorStop(0, '#b9a4ff');
    body.addColorStop(0.55, '#7c5cff');
    body.addColorStop(1, '#462bc8');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 螺旋花纹（随滚动真实旋转）
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r - 0.5, 0, Math.PI * 2);
    ctx.clip();
    ctx.rotate(ball.angle);

    // 放射纹路
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.stroke();
    }
    // 阿基米德螺旋
    ctx.strokeStyle = 'rgba(34,211,238,.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const turns = Math.PI * 5;
    for (let t = 0; t <= turns; t += 0.12) {
      const rr = (t / turns) * (r - 2.5);
      const px = Math.cos(t) * rr;
      const py = Math.sin(t) * rr;
      if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 边缘高光
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r - 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------- 渲染：三个物理矢量 ---------------- */
  function drawVectors() {
    const vxM = ball.vx / PPM;
    const vyM = ball.vy / PPM;
    const speed = Math.hypot(vxM, vyM);

    // 重力 G = mg（黄色），按加速度比例绘制
    drawVector(ball.x, ball.y, 0, params.g, COL.yellow,
      'G=' + fmt(params.mass * params.g, 1) + ' N');

    // 速度 v（青色）
    if (speed > 0.03) {
      drawVector(ball.x, ball.y, vxM, vyM, COL.cyan,
        'v=' + fmt(speed, 2) + ' m/s');
    }

    // 施加力 / 合力（粉色）：含空气阻力时画 F合，统一按 a=F/m 比例
    const af = appliedForce();
    let px = af.x, py = af.y;
    if (params.air) { px += ball.lastDrag.x; py += ball.lastDrag.y; }
    const fMag = Math.hypot(px, py);
    if (fMag > 0.3) {
      const lab = (params.air ? 'F合=' : 'F=') + fmt(fMag, 1) + ' N  a=' +
                  fmt(fMag / params.mass, 2);
      drawVector(ball.x, ball.y, px / params.mass, py / params.mass, COL.pink, lab);
    }
  }
  /* ---------------- 渲染：蓄力指示 ---------------- */
  function drawChargeGuide() {
    if (!charge.mode) return;
    let ux = 0, uy = -1, ratio = 0, mag = 0;

    if (charge.mode === 'drag') {
      const v = dragVector();
      mag = v.mag;
      ratio = mag / F_MAX;
      const dx = charge.x - charge.sx, dy = charge.y - charge.sy;
      const len = Math.hypot(dx, dy);
      if (len > 4) { ux = dx / len; uy = dy / len; }
    } else {
      ratio = clamp(charge.t / CHARGE_TIME, 0, 1);
      mag = ratio * F_MAX;
      ux = Math.cos(charge.angle);
      uy = Math.sin(charge.angle);
    }

    // 方向箭头（虚线）
    const len = 30 + 120 * ratio;
    ctx.save();
    ctx.strokeStyle = COL.pink;
    ctx.fillStyle = COL.pink;
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 6]);
    ctx.shadowColor = COL.pink;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(ball.x + ux * len, ball.y + uy * len);
    ctx.stroke();
    ctx.setLineDash([]);
    const tx = ball.x + ux * len, ty = ball.y + uy * len;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - ux * 9 - uy * 5, ty - uy * 9 + ux * 5);
    ctx.lineTo(tx - ux * 9 + uy * 5, ty - uy * 9 - ux * 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 球周力度环
    ctx.save();
    ctx.strokeStyle = COL.amber;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.shadowColor = COL.amber;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r + 8, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 力度文字
    const text = '蓄力 ' + fmt(mag, 0) + ' N · 松开发射';
    ctx.save();
    ctx.font = '600 12px system-ui, "Microsoft YaHei", sans-serif';
    const tw = ctx.measureText(text).width;
    const bx = clamp(ball.x - (tw + 20) / 2, 6, W - tw - 26);
    const by = clamp(ball.y - ball.r - 34, 6, H - 40);
    ctx.fillStyle = 'rgba(8,10,26,.78)';
    ctx.strokeStyle = COL.pink;
    roundRectPath(bx, by, tw + 20, 24, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd7ea';
    ctx.fillText(text, bx + 10, by + 16);
    ctx.restore();
  }

  /* ---------------- 渲染：质量标签与图例 ---------------- */
  function drawTags() {
    if (!charge.mode) {
      const text = 'm = ' + fmt(params.mass, 1) + ' kg';
      ctx.save();
      ctx.font = '600 11px system-ui, "Microsoft YaHei", sans-serif';
      const tw = ctx.measureText(text).width;
      const bx = clamp(ball.x - (tw + 16) / 2, 4, W - tw - 20);
      const by = clamp(ball.y - ball.r - 26, 4, H - 20);
      ctx.fillStyle = 'rgba(8,10,26,.62)';
      roundRectPath(bx, by, tw + 16, 18, 6);
      ctx.fill();
      ctx.fillStyle = '#cdd6ff';
      ctx.fillText(text, bx + 8, by + 13);
      ctx.restore();
    }

    // 右上角图例
    ctx.save();
    ctx.font = '11px system-ui, "Microsoft YaHei", sans-serif';
    const items = [
      [COL.yellow, 'G 重力'],
      [COL.cyan, 'v 速度'],
      [COL.pink, params.air ? 'F合 合力' : 'F 施加力']
    ];
    let x = W - 10;
    for (let i = items.length - 1; i >= 0; i--) {
      const tw = ctx.measureText(items[i][1]).width;
      x -= tw + 22;
      ctx.fillStyle = items[i][0];
      ctx.beginPath();
      ctx.arc(x + 4, 16, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(205,214,255,.85)';
      ctx.fillText(items[i][1], x + 12, 20);
      x -= 14;
    }
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawGrid();
    drawArena();
    drawTrail();
    drawVectors();
    drawBall();
    drawChargeGuide();
    drawTags();
  }

  /* ---------------- v-t 迷你图表 ---------------- */
  function drawChart() {
    cctx.clearRect(0, 0, cW, cH);
    const padL = 32, padR = 8, padT = 8, padB = 16;
    const pw = cW - padL - padR;
    const ph = cH - padT - padB;

    let vMax = 2;
    for (let i = 0; i < samples.length; i++) if (samples[i].v > vMax) vMax = samples[i].v;
    vMax *= 1.15;

    // 网格与纵轴刻度
    cctx.save();
    cctx.strokeStyle = 'rgba(255,255,255,.08)';
    cctx.fillStyle = 'rgba(139,149,196,.9)';
    cctx.lineWidth = 1;
    cctx.font = '9px system-ui, sans-serif';
    cctx.textAlign = 'right';
    cctx.textBaseline = 'middle';
    for (let i = 0; i <= 3; i++) {
      const y = padT + ph * i / 3;
      cctx.beginPath();
      cctx.moveTo(padL, y);
      cctx.lineTo(cW - padR, y);
      cctx.stroke();
      cctx.fillText(fmt(vMax * (1 - i / 3), 0), padL - 4, y);
    }
    // 横轴刻度（相对秒）
    cctx.textAlign = 'center';
    cctx.textBaseline = 'top';
    for (let i = 0; i <= 2; i++) {
      const x = padL + pw * i / 2;
      const lab = i === 2 ? '0s' : ('-' + (CHART_WIN * (1 - i / 2)) + 's');
      cctx.fillText(lab, x, cH - padB + 4);
    }
    cctx.restore();

    if (samples.length < 2) {
      cctx.save();
      cctx.fillStyle = 'rgba(139,149,196,.75)';
      cctx.font = '11px system-ui, "Microsoft YaHei", sans-serif';
      cctx.textAlign = 'center';
      cctx.textBaseline = 'middle';
      cctx.fillText('发射小球后开始记录速度', cW / 2, cH / 2);
      cctx.restore();
      return;
    }

    const t0 = simTime - CHART_WIN;
    const toX = (t) => padL + clamp((t - t0) / CHART_WIN, 0, 1) * pw;
    const toY = (v) => padT + ph - clamp(v / vMax, 0, 1) * ph;

    // 面积
    cctx.save();
    const area = cctx.createLinearGradient(0, padT, 0, padT + ph);
    area.addColorStop(0, 'rgba(34,211,238,.28)');
    area.addColorStop(1, 'rgba(34,211,238,0)');
    cctx.fillStyle = area;
    cctx.beginPath();
    cctx.moveTo(toX(samples[0].t), padT + ph);
    for (let i = 0; i < samples.length; i++) cctx.lineTo(toX(samples[i].t), toY(samples[i].v));
    cctx.lineTo(toX(samples[samples.length - 1].t), padT + ph);
    cctx.closePath();
    cctx.fill();

    // 曲线
    cctx.strokeStyle = COL.cyan;
    cctx.lineWidth = 1.8;
    cctx.shadowColor = COL.cyan;
    cctx.shadowBlur = 5;
    cctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const x = toX(samples[i].t), y = toY(samples[i].v);
      if (i === 0) cctx.moveTo(x, y); else cctx.lineTo(x, y);
    }
    cctx.stroke();
    cctx.restore();
  }

  /* ---------------- HUD 读数与公式条 ---------------- */
  function setRead(el, v, unit, d) {
    el.innerHTML = fmt(v, d) + ' <i>' + unit + '</i>';
  }

  function updateHUD() {
    const bd = bounds();
    const xM = (ball.x - bd.l) / PPM;
    const hM = Math.max(0, (bd.b - ball.y) / PPM);
    const speed = Math.hypot(ball.vx, ball.vy) / PPM;
    const ke = 0.5 * params.mass * speed * speed;
    const pe = params.mass * params.g * hM;

    setRead(rX, xM, 'm', 2);
    setRead(rY, hM, 'm', 2);
    setRead(rV, speed, 'm/s', 2);
    setRead(rA, aSmooth, 'm/s²', 2);
    setRead(rKE, ke, 'J', 1);
    setRead(rPE, pe, 'J', 1);
    setRead(rE, ke + pe, 'J', 1);
    setRead(rG, params.mass * params.g, 'N', 1);

    // 公式条：蓄力时显示预览值
    const af = appliedForce();
    let showF = af.mag;
    if (charge.mode === 'drag') showF = dragVector().mag;
    else if (charge.mode === 'space') showF = F_MAX * clamp(charge.t / CHARGE_TIME, 0, 1);

    fF.textContent = fmt(showF, 1);
    fM.textContent = fmt(params.mass, 1);
    fA.textContent = fmt(showF / params.mass, 2);
    formulaBar.classList.toggle('hot', showF > 0.5);
  }
  /* ---------------- 主循环：rAF + 固定子步 ---------------- */
  const perf = window.performance || performance;
  let lastT = perf.now();

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - lastT) / 1000;
    lastT = now;

    // 引导或暂停：冻结物理与计时，仅保留静态画面
    if (introOpen || paused) {
      render();
      drawChart();
      return;
    }
    dt = clamp(dt, 0, 0.05);

    // 空格蓄力的时间增长与左右瞄准
    if (charge.mode === 'space') {
      charge.t += dt;
      if (keys.left) charge.angle -= 2.7 * dt;
      if (keys.right) charge.angle += 2.7 * dt;
    }

    // 实测加速度（用于读数）
    const v0x = ball.vx, v0y = ball.vy;

    // 固定步长积分
    let acc = dt;
    let n = 0;
    while (acc >= FIXED_DT && n < 24) {
      step(FIXED_DT);
      simTime += FIXED_DT;
      acc -= FIXED_DT;
      n++;
    }
    if (n === 24) acc = 0;   // 防止卡顿后死亡螺旋

    const aNow = Math.hypot(ball.vx - v0x, ball.vy - v0y) / PPM / Math.max(dt, 1e-6);
    aSmooth += (aNow - aSmooth) * 0.25;

    // 轨迹
    if (params.trail) {
      trail.push({ x: ball.x, y: ball.y });
      if (trail.length > 720) trail.shift();
    }

    // v-t 采样
    if (params.chart) {
      sampleAcc += dt;
      if (sampleAcc >= SAMPLE_DT) {
        sampleAcc = 0;
        samples.push({ t: simTime, v: Math.hypot(ball.vx, ball.vy) / PPM });
        const cut = simTime - CHART_WIN;
        while (samples.length && samples[0].t < cut) samples.shift();
      }
    }

    updateHUD();
    render();
    drawChart();
  }

  /* ---------------- 初始化 ---------------- */
  ball.r = radiusFor(params.mass);
  resize();
  resetBall();
  syncMass();
  syncG();
  syncE();
  requestAnimationFrame(frame);

  /* ---------------- 自测钩子（不影响正常运行） ---------------- */
  window.__newtonLab = {
    constants: { FIXED_DT: FIXED_DT, PPM: PPM, PULSE_T: PULSE_T, F_MAX: F_MAX },
    params: params,
    ball: ball,
    state: () => ({
      x: ball.x, y: ball.y,
      vx: ball.vx, vy: ball.vy,
      vM: Math.hypot(ball.vx, ball.vy) / PPM,
      r: ball.r, onGround: ball.onGround
    }),
    bounds: bounds,
    reset: resetBall,
    setMass: (m) => {
      params.mass = m;
      ball.r = radiusFor(m);
      keepInBounds();
      massSlider.value = String(m);
      massVal.textContent = fmt(m, 1);
    },
    setG: (g) => { params.g = g; gSlider.value = String(g); gVal.textContent = fmt(g, 2); },
    setRestitution: (e) => { params.e = e; },
    setAir: (v) => { params.air = v; },
    step: (n) => {
      for (let i = 0; i < n; i++) { step(FIXED_DT); simTime += FIXED_DT; }
    },
    launch: launch,
    clear: () => { trail.length = 0; samples.length = 0; }
  };
})();