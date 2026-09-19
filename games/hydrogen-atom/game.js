/* ============================================================================
 * 《氢原子探秘》—— 玻尔轨道模型 × 量子电子云模型 互动教学可视化
 * 纯 Canvas 2D + WebAudio，零依赖。
 *
 * 物理公式来源：量子力学教科书标准形式（原子单位 a0 = 1）
 *   径向波函数 R_nl(r) = sqrt[(2/n)^3 · (n-l-1)! / (2n (n+l)!)]
 *                        · e^(-r/n) · (2r/n)^l · L_{n-l-1}^{2l+1}(2r/n)
 *   角向部分为实球谐函数 Y_lm（px/py/dxy 等为复球谐的实线性组合）
 *   概率密度 |ψ|² = |R_nl(r)|² · |Y_lm(θ,φ)|²
 *   体积元 r²sinθ dr dθ dφ 使径向 P(r)=r²|R|² 与角向 sinθ|Y|² 可分离采样
 * ========================================================================== */
(function () {
'use strict';

/* ============================ 物理常量 ============================ */

const RYDBERG_EV = 13.6;          // 氢原子基态能量绝对值（电离能，eV）
const A0_ANGSTROM = 0.529;        // 玻尔半径（埃，近似 0.529177）
const FOCAL = 55;                 // 透视焦距（原子单位）

// 六个量子态的定义与绘图径向范围（a0）
const STATES = {
  '1s': { n: 1, l: 0, plotR: 8 },
  '2s': { n: 2, l: 0, plotR: 16 },
  '2p': { n: 2, l: 1, plotR: 16 },
  '3s': { n: 3, l: 0, plotR: 26 },
  '3p': { n: 3, l: 1, plotR: 26 },
  '3d': { n: 3, l: 2, plotR: 26 }
};

// p 态空间取向（实轨道）
const P_ORIENTS = [
  { kind: 'px',  label: 'px',  color: '#ff5ca8' },
  { kind: 'py',  label: 'py',  color: '#22d3ee' },
  { kind: 'pz',  label: 'pz',  color: '#ffb347' },
  { kind: 'pal', label: '三色叠加', color: '#7c5cff' }
];

// d 态空间取向（实轨道）
const D_ORIENTS = [
  { kind: 'dz2',    label: 'dz²',     color: '#22d3ee' },
  { kind: 'dxz',    label: 'dxz',     color: '#ff5ca8' },
  { kind: 'dyz',    label: 'dyz',     color: '#a78bfa' },
  { kind: 'dxy',    label: 'dxy',     color: '#ffb347' },
  { kind: 'dx2y2',  label: 'dx²−y²',  color: '#f472b6' }
];

// 单色态/单取向时的主色
const STATE_COLORS = {
  '1s': '#22d3ee', '2s': '#7c5cff', '2p': '#22d3ee',
  '3s': '#ffb347', '3p': '#a78bfa', '3d': '#ff5ca8'
};

// 轨道通俗解释（教学信息卡用）
const DESC = {
  '1s': '电子像一团紧贴原子核的球形雾，在距核约 1 个玻尔半径处出现概率最大，没有任何择优方向。',
  '2s': '比 1s 更大的球形雾，内部包着一层“空心”球壳（径向节面）；电子既可能出现在离核很近处，也可能出现在远处。',
  '2p': '哑铃形的两叶概率云，两叶之间穿过原子核的平面是角向节面，电子只出现在节面两侧的两叶中。',
  '3s': '更加弥散的球形云，含有两个同心的“空心”球壳（两个径向节面），一共三层球壳结构。',
  '3p': '哑铃形两叶云内部又多出一个径向节面，整体比 2p 更舒展，电子可以离核更远。',
  '3d': '形状复杂的多叶概率云（dxy 等为四叶花瓣形，dz² 为双叶加赤道环），空间方向性最强。'
};

/* ====================== 数学：阶乘 / 关联拉盖尔 ====================== */

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];

// 关联拉盖尔多项式 L_k^α(x)，递推：(j+1)L_{j+1}=(2j+α+1-x)L_j-(j+α)L_{j-1}
function assocLaguerre(k, alpha, x) {
  let l0 = 1;
  if (k === 0) return l0;
  let l1 = 1 + alpha - x;
  if (k === 1) return l1;
  for (let j = 1; j < k; j++) {
    const l2 = ((2 * j + 1 + alpha - x) * l1 - (j + alpha) * l0) / (j + 1);
    l0 = l1;
    l1 = l2;
  }
  return l1;
}

// 氢原子径向波函数 R_nl(r)（原子单位 a0=1），返回值单位为 a0^(-3/2)
function radialRnL(n, l, r) {
  const rho = (2 * r) / n;
  const norm = Math.sqrt(Math.pow(2 / n, 3) * FACT[n - l - 1] / (2 * n * FACT[n + l]));
  return norm * Math.exp(-rho / 2) * Math.pow(rho, l) *
         assocLaguerre(n - l - 1, 2 * l + 1, rho);
}

// 径向概率密度 P(r) = r² |R_nl(r)|²
function radialProb(n, l, r) {
  const rv = radialRnL(n, l, r);
  return r * r * rv * rv;
}

/*
 * 角向概率密度 |Y_lm(θ,φ)|²（已对立体角归一：∫ 密度 dΩ = 1）。
 * u = cosθ。采用实球谐函数，对应常见的 px/py/pz、dxy 等轨道。
 */
function angularDensity(kind, u, phi) {
  const PI = Math.PI;
  const u2 = u * u;
  const s2 = 1 - u2;                 // sin²θ
  const c = Math.cos(phi), s = Math.sin(phi);
  switch (kind) {
    case 's':
      return 1 / (4 * PI);
    case 'pz':
      return (3 / (4 * PI)) * u2;
    case 'px':
      return (3 / (4 * PI)) * s2 * c * c;
    case 'py':
      return (3 / (4 * PI)) * s2 * s * s;
    case 'dz2': {
      const t = 3 * u2 - 1;
      return (5 / (16 * PI)) * t * t;
    }
    case 'dxz':
      return (15 / (4 * PI)) * s2 * u2 * c * c;
    case 'dyz':
      return (15 / (4 * PI)) * s2 * u2 * s * s;
    case 'dxy': {
      const q = Math.sin(2 * phi);
      return (15 / (16 * PI)) * s2 * s2 * q * q;
    }
    case 'dx2y2': {
      const q = Math.cos(2 * phi);
      return (15 / (16 * PI)) * s2 * s2 * q * q;
    }
    default:
      return 1 / (4 * PI);
  }
}

/* ====================== 采样器：径向 CDF + 角向 CDF ====================== */

// 在升序数组中二分查找第一个 >= v 的下标
function bisect(cdf, v) {
  let lo = 0, hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/*
 * 创建某一轨道（n,l,角向类型）的概率云采样器。
 * 径向：在 [0, rMax] 上等距网格积分 P(r) 得累积分布；
 * 角向：在 u=cosθ∈[-1,1]、φ∈[0,2π] 网格上按 |Y|² 建二维累积分布。
 * 体积元中 r² 已并入径向、sinθ 通过 du=-sinθdθ 并入均匀 u，故两者独立。
 */
function createSampler(n, l, kind) {
  const rMax = n * 10 + 4;
  const NR = 1024;
  const dr = rMax / NR;

  // 径向网格与 CDF
  const rcdf = new Float64Array(NR + 1);
  let peak = 1e-12;
  let prev = 0;
  for (let i = 0; i < NR; i++) {
    const r = (i + 0.5) * dr;
    const p = radialProb(n, l, r);
    if (p > peak) peak = p;
    rcdf[i + 1] = rcdf[i] + p * dr;   // 矩形积分
    prev = p;
  }
  const rTotal = rcdf[NR] || 1;
  for (let i = 1; i <= NR; i++) rcdf[i] /= rTotal;

  // 角向网格与 CDF（s 态球对称，直接均匀采样即可）
  const isS = (kind === 's');
  const NU = 96, NP = 192;
  let acdf = null;
  if (!isS) {
    const du = 2 / NU, dphi = 2 * Math.PI / NP;
    acdf = new Float64Array(NU * NP + 1);
    let k = 0;
    for (let iu = 0; iu < NU; iu++) {
      const u = -1 + (iu + 0.5) * du;
      for (let ip = 0; ip < NP; ip++) {
        const phi = (ip + 0.5) * dphi;
        acdf[k + 1] = acdf[k] + angularDensity(kind, u, phi) * du * dphi;
        k++;
      }
    }
    const aTotal = acdf[k] || 1;
    for (let i = 1; i <= k; i++) acdf[i] /= aTotal;
  }

  // 向预分配数组填充 count 个采样点（三维坐标 + 径向权重）
  function fill(pts, wts, count) {
    const du = 2 / NU, dphi = 2 * Math.PI / NP;
    for (let m = 0; m < count; m++) {
      // 半径采样
      const ir = bisect(rcdf, Math.random());
      const r = (ir + Math.random()) * dr;
      let u, phi;
      if (isS) {
        u = 2 * Math.random() - 1;
        phi = 2 * Math.PI * Math.random();
      } else {
        const ia = bisect(acdf, Math.random());
        const cell = Math.min(ia, NU * NP - 1);
        const iu = (cell / NP) | 0;
        const ip = cell - iu * NP;
        u = -1 + (iu + Math.random()) * du;
        phi = (ip + Math.random()) * dphi;
      }
      const su = Math.sqrt(Math.max(0, 1 - u * u));
      const o = m * 3;
      pts[o] = r * su * Math.cos(phi);
      pts[o + 1] = r * su * Math.sin(phi);
      pts[o + 2] = r * u;
      // 权重：径向概率的弱幂次映射，用于点亮度微调
      const pr = radialProb(n, l, r) / peak;
      wts[m] = 0.3 + 0.7 * Math.pow(Math.min(1, pr), 0.4);
    }
  }

  return { fill: fill, rMax: rMax, radialPeak: peak };
}

// 在稠密网格上寻找 P(r) 的全部局部极大值（峰），返回峰位数组（a0）
function findRadialPeaks(n, l, rMax, step) {
  const peaks = [];
  let gMax = 1e-12;
  const ni = Math.floor(rMax / step);
  const vals = new Float64Array(ni + 1);
  for (let i = 0; i <= ni; i++) {
    vals[i] = radialProb(n, l, i * step);
    if (vals[i] > gMax) gMax = vals[i];
  }
  for (let i = 2; i < ni - 1; i++) {
    if (vals[i] > vals[i - 1] && vals[i] >= vals[i + 1] && vals[i] > 0.004 * gMax) {
      // 抛物线插值细化峰位
      const y0 = vals[i - 1], y1 = vals[i], y2 = vals[i + 1];
      const denom = (y0 - 2 * y1 + y2);
      const off = denom !== 0 ? 0.5 * (y0 - y2) / denom : 0;
      peaks.push((i + Math.max(-0.5, Math.min(0.5, off))) * step);
    }
  }
  return peaks.sort((a, b) => a - b);
}

/* 以下为纯物理 API，供 Node 自测与页面共用 */
const PhysicsAPI = {
  assocLaguerre: assocLaguerre,
  radialRnL: radialRnL,
  radialProb: radialProb,
  angularDensity: angularDensity,
  createSampler: createSampler,
  findRadialPeaks: findRadialPeaks,
  STATES: STATES
};

/* **********************************************************************
 * 以下为浏览器渲染/交互部分，Node 环境不执行
 * ********************************************************************** */
function boot() {
  if (typeof document === 'undefined') return;

  /* ---------------- DOM 引用 ---------------- */
  const view = document.getElementById('view');
  const ctx = view.getContext('2d');
  const radialCanvas = document.getElementById('radialCanvas');
  const rctx = radialCanvas.getContext('2d');
  const stage = document.getElementById('stage');
  const panel = document.getElementById('panel');
  const caption = document.getElementById('caption');
  const labelL = document.getElementById('labelL');
  const labelR = document.getElementById('labelR');

  const modeTabs = document.getElementById('modeTabs');
  const nTabs = document.getElementById('nTabs');
  const stateTabs = document.getElementById('stateTabs');
  const orientWrap = document.getElementById('orientWrap');
  const orientTabs = document.getElementById('orientTabs');
  const bohrGroup = document.getElementById('bohrGroup');
  const cloudGroup = document.getElementById('cloudGroup');
  const radialGroup = document.getElementById('radialGroup');
  const infoCard = document.getElementById('infoCard');
  const pointSlider = document.getElementById('pointCount');
  const pointVal = document.getElementById('pointCountVal');
  const autoRotateChk = document.getElementById('autoRotate');
  const soundChk = document.getElementById('soundOn');
  const allOrbitsChk = document.getElementById('allOrbits');

  /* ---------------- 全局状态 ---------------- */
  let mode = 'bohr';                 // bohr | cloud | compare
  let bohrN = 1;                     // 玻尔能级
  let cloudState = '1s';             // 当前量子态
  const orientChoice = { '2p': 'pz', '3d': 'dxy' }; // 各态取向记忆
  let pointCount = 4000;
  let showAllOrbits = false;
  let autoRotate = true;
  let soundOn = true;

  // 相机：偏航角、俯仰角、缩放
  let yaw = 0.75, pitch = 0.32, zoom = 1;
  let viewW = 0, viewH = 0, dpr = 1;

  /* ---------------- 工具 ---------------- */
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---------------- 电子云层（支持渐隐/渐显与分批生成） ---------------- */
  let layers = [];
  let rebuildTimer = null;

  // 当前量子态对应的图层配置（三取向叠加时拆成三色图层）
  function currentLayerSpecs() {
    const st = STATES[cloudState];
    if (cloudState === '2p' && orientChoice['2p'] === 'pal') {
      const per = Math.floor(pointCount / 3);
      return [
        { n: st.n, l: st.l, kind: 'px', color: '#ff5ca8', count: per },
        { n: st.n, l: st.l, kind: 'py', color: '#22d3ee', count: per },
        { n: st.n, l: st.l, kind: 'pz', color: '#ffb347', count: per }
      ];
    }
    let kind = 's';
    let color = STATE_COLORS[cloudState];
    if (cloudState === '2p') {
      kind = orientChoice['2p'];
      color = (P_ORIENTS.find(o => o.kind === kind) || {}).color || color;
    } else if (cloudState === '3d') {
      kind = orientChoice['3d'];
      color = (D_ORIENTS.find(o => o.kind === kind) || {}).color || color;
    }
    return [{ n: st.n, l: st.l, kind: kind, color: color, count: pointCount }];
  }

  // 重建电子云：旧层渐隐，新层先生成 500 点，其余帧内补齐
  function rebuildCloud() {
    layers.forEach(layer => { layer.target = 0; layer.dying = true; });
    const specs = currentLayerSpecs();
    specs.forEach(spec => {
      const sampler = createSampler(spec.n, spec.l, spec.kind);
      const layer = {
        pts: new Float32Array(spec.count * 3),
        wts: new Float32Array(spec.count),
        ready: 0, total: spec.count,
        alpha: 0, target: 1, dying: false,
        color: spec.color, rgb: hexToRgb(spec.color),
        extent: STATES[cloudState].plotR,
        sampler: sampler
      };
      const first = Math.min(500, spec.count);
      sampler.fill(layer.pts, layer.wts, first);
      layer.ready = first;
      layers.push(layer);
    });
  }

  function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(rebuildCloud, 120);
  }

  // 每帧补齐在制图层，并推进透明度过渡
  function updateLayers(dt) {
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (!layer.dying && layer.ready < layer.total) {
        const add = Math.min(1400, layer.total - layer.ready);
        layer.sampler.fill(layer.pts.subarray(layer.ready * 3),
                           layer.wts.subarray(layer.ready), add);
        layer.ready += add;
      }
      layer.alpha += (layer.target - layer.alpha) * Math.min(1, dt * 5.5);
      if (layer.dying && layer.alpha < 0.02) layers.splice(i, 1);
    }
  }

  /* ---------------- 玻尔模型状态与跃迁动画 ---------------- */
  const electron = {
    n: 1, angle: 0,
    x: 1, y: 0, z: 0,
    trans: null,       // 跃迁进行时 {from,to,t,dur,a0,spins}
    flash: 0
  };
  const trail = [];    // 电子尾迹世界坐标 {x,y,z}

  function bohrOmega(n) {
    // 可视化节奏：角速度随 n 增大而减小（物理周期 ∝ n³），并保留下限
    return Math.max(0.1, 2.2 / Math.pow(n, 2.4));
  }

  function setBohrLevel(k) {
    if (k === electron.n || electron.trans) return;
    if (k < electron.n) {
      // 向低能级：螺旋跃迁 + 发光 + 音效
      electron.trans = {
        from: electron.n, to: k, t: 0, dur: 1.5,
        a0: electron.angle, spins: 3 + (electron.n - k)
      };
      playChime();
    } else {
      // 向高能级：吸收能量，直接进入外层轨道
      electron.n = k;
      trail.length = 0;
    }
    updateInfo();
  }

  function updateBohr(dt) {
    if (electron.trans) {
      const tr = electron.trans;
      tr.t += dt;
      const p = clamp(tr.t / tr.dur, 0, 1);
      const e = 1 - p;
      const ri = tr.from * tr.from, rf = tr.to * tr.to;
      // 先慢后快的螺旋下落
      const radius = rf + (ri - rf) * e * e * e;
      electron.angle = tr.a0 + tr.spins * 2 * Math.PI * (1 - e * e);
      electron.x = radius * Math.cos(electron.angle);
      electron.z = radius * Math.sin(electron.angle);
      electron.y = 0;
      if (p >= 1) {
        electron.n = tr.to;
        electron.trans = null;
        electron.flash = 0.7;
        updateInfo();
      }
    } else {
      electron.angle += bohrOmega(electron.n) * dt;
      const radius = electron.n * electron.n;
      electron.x = radius * Math.cos(electron.angle);
      electron.z = radius * Math.sin(electron.angle);
      electron.y = 0;
    }
    if (electron.flash > 0) electron.flash = Math.max(0, electron.flash - dt * 0.9);

    // 尾迹
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(electron.x - last.x, electron.y - last.y, electron.z - last.z) > 0.04) {
      trail.push({ x: electron.x, y: electron.y, z: electron.z });
      if (trail.length > 46) trail.shift();
    }
  }

  /* ---------------- WebAudio：轻柔“叮咚”跃迁音效（纯合成） ---------------- */
  let audioCtx = null;
  function ensureAudio() {
    if (audioCtx) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
    return audioCtx;
  }
  function playChime() {
    if (!soundOn) return;
    const ac = ensureAudio();
    if (!ac) return;
    const t0 = ac.currentTime;
    // 两个正弦分音（E5、B5），指数衰减包络，模拟柔和钟鸣
    const freqs = [659.25, 987.77];
    freqs.forEach((f, idx) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const peak = idx === 0 ? 0.1 : 0.05;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + 1.35);
    });
  }

  /* ---------------- 相机旋转与透视投影 ---------------- */
  function makeTransform() {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    // 返回世界坐标 -> 视坐标（x1,y1,z1，z1 朝向相机）
    return function (x, y, z, out) {
      const x1 = x * cy - z * sy;
      const z1 = x * sy + z * cy;
      const y1 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      out[0] = x1; out[1] = y1; out[2] = z2;
    };
  }

  // 视图划分（对照模式：宽屏左右分，竖屏上下分）
  function getViewports() {
    if (mode !== 'compare') {
      return [{ x: 0, y: 0, w: viewW, h: viewH, cx: viewW / 2, cy: viewH / 2 }];
    }
    if (viewW >= viewH) {
      return [
        { x: 0, y: 0, w: viewW / 2, h: viewH, cx: viewW / 4, cy: viewH / 2 },
        { x: viewW / 2, y: 0, w: viewW / 2, h: viewH, cx: 3 * viewW / 4, cy: viewH / 2 }
      ];
    }
    return [
      { x: 0, y: 0, w: viewW, h: viewH / 2, cx: viewW / 2, cy: viewH / 4 },
      { x: 0, y: viewH / 2, w: viewW, h: viewH / 2, cx: viewW / 2, cy: 3 * viewH / 4 }
    ];
  }

  const RING_SEG = 180;
  const ringCos = new Float32Array(RING_SEG + 1);
  const ringSin = new Float32Array(RING_SEG + 1);
  for (let i = 0; i <= RING_SEG; i++) {
    const a = (i / RING_SEG) * Math.PI * 2;
    ringCos[i] = Math.cos(a);
    ringSin[i] = Math.sin(a);
  }

  /* ---------------- 绘制：玻尔模型 ---------------- */
  function drawBohr(vp) {
    const transform = makeTransform();
    const maxR = showAllOrbits ? 36 : electron.n * electron.n;
    const unit = Math.min(vp.w, vp.h) / (2 * (maxR * 1.18 + 1.6)) * zoom;
    const oc = [0, 0, 0];

    // 全部允许轨道（淡色叠加）
    if (showAllOrbits) {
      for (let nn = 1; nn <= 6; nn++) {
        if (nn === electron.n) continue;
        drawRing(nn * nn, vp, unit, transform, '124,92,255', 0.2, 1, false, oc);
      }
    }

    // 选定轨道：后半圈（远离观察者）虚线淡绘
    drawRing(electron.n * electron.n, vp, unit, transform, '34,211,238', 0.28, 1, true, oc, true);

    // 尾迹
    drawTrail(vp, unit, transform, oc);

    // 发光原子核
    drawNucleus(vp, unit);

    // 电子
    drawElectron(vp, unit, transform, oc);

    // 前半圈实线覆盖，制造环绕遮挡感
    drawRing(electron.n * electron.n, vp, unit, transform, '34,211,238', 0.95, 1.6, false, oc, false);

    // 跃迁结束闪光
    if (electron.flash > 0) {
      const q = 0.7 - electron.flash;
      const fr = unit * (1.2 + q * 4);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = electron.flash;
      ctx.strokeStyle = '#bff6ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(vp.cx, vp.cy, fr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 绘制圆形轨道（轨道平面取 x-z 平面）。backOnly/frontOnly 用于前后半圈分绘
  function drawRing(radius, vp, unit, transform, rgb, alpha, width, dashed, oc, halfFlag) {
    const drawHalf = (halfFlag === true || halfFlag === false);
    const wantBack = halfFlag === true;
    ctx.save();
    ctx.strokeStyle = 'rgba(' + rgb + ',' + alpha + ')';
    ctx.lineWidth = width;
    if (dashed) ctx.setLineDash([5, 6]);
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= RING_SEG; i++) {
      transform(radius * ringCos[i], 0, radius * ringSin[i], oc);
      const isBack = oc[2] < 0;
      const draw = !drawHalf || (wantBack ? isBack : !isBack);
      const persp = clamp(FOCAL / (FOCAL - oc[2]), 0.45, 2.6);
      const sx = vp.cx + oc[0] * unit * persp;
      const sy = vp.cy - oc[1] * unit * persp;
      if (draw) {
        if (!pen) { ctx.moveTo(sx, sy); pen = true; }
        else ctx.lineTo(sx, sy);
      } else {
        pen = false;
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawTrail(vp, unit, transform, oc) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i];
      transform(a.x, a.y, a.z, oc);
      const p1 = FOCAL / (FOCAL - oc[2]);
      const x1 = vp.cx + oc[0] * unit * p1, y1 = vp.cy - oc[1] * unit * p1;
      transform(b.x, b.y, b.z, oc);
      const p2 = FOCAL / (FOCAL - oc[2]);
      const x2 = vp.cx + oc[0] * unit * p2, y2 = vp.cy - oc[1] * unit * p2;
      ctx.strokeStyle = 'rgba(34,211,238,' + (0.05 + 0.3 * i / trail.length) + ')';
      ctx.lineWidth = 1 + 1.5 * i / trail.length;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawNucleus(vp, unit) {
    const t = performance.now() * 0.002;
    const base = clamp(unit * 1.15, 9, 24);
    const pulse = 1 + 0.08 * Math.sin(t);
    const r = base * pulse;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(vp.cx, vp.cy, 0, vp.cx, vp.cy, r * 2.6);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, '#ff7a6b');
    g.addColorStop(0.55, 'rgba(255,77,77,0.55)');
    g.addColorStop(1, 'rgba(255,92,168,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(vp.cx, vp.cy, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 核心实球
    const g2 = ctx.createRadialGradient(vp.cx - r * 0.3, vp.cy - r * 0.3, r * 0.1, vp.cx, vp.cy, r);
    g2.addColorStop(0, '#ffe9e6');
    g2.addColorStop(0.5, '#ff5252');
    g2.addColorStop(1, '#b71c3a');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(vp.cx, vp.cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawElectron(vp, unit, transform, oc) {
    transform(electron.x, electron.y, electron.z, oc);
    const persp = clamp(FOCAL / (FOCAL - oc[2]), 0.45, 2.6);
    const sx = vp.cx + oc[0] * unit * persp;
    const sy = vp.cy - oc[1] * unit * persp;
    const r = clamp(unit * 0.85 * persp, 5.5, 15) * (electron.trans ? 1 + 0.35 * Math.sin(performance.now() * 0.02) : 1);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.6);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.3, 'rgba(165,243,252,0.9)');
    g.addColorStop(0.6, 'rgba(34,211,238,0.45)');
    g.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#eafdff';
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ---------------- 绘制：电子云 ---------------- */
  function drawCloud(vp) {
    const transform = makeTransform();
    const st = STATES[cloudState];
    const extent = st.plotR;
    const unit = (Math.min(vp.w, vp.h) * 0.42 / extent) * zoom;
    const oc = [0, 0, 0];

    // 参考坐标轴
    drawAxes(vp, unit, transform, extent, oc);

    // 中心一个极淡的核标记
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const ng = ctx.createRadialGradient(vp.cx, vp.cy, 0, vp.cx, vp.cy, 9);
    ng.addColorStop(0, 'rgba(255,120,110,0.8)');
    ng.addColorStop(1, 'rgba(255,77,77,0)');
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.arc(vp.cx, vp.cy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 云点（加法混合，密度越大越亮）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li];
      if (layer.alpha < 0.02) continue;
      const rgb = layer.rgb;
      const pts = layer.pts, wts = layer.wts;
      const ready = layer.ready;
      for (let m = 0; m < ready; m++) {
        const o = m * 3;
        transform(pts[o], pts[o + 1], pts[o + 2], oc);
        const persp = clamp(FOCAL / (FOCAL - oc[2]), 0.5, 2.4);
        const depth = clamp((oc[2] / extent + 1) * 0.5, 0, 1);
        const a = layer.alpha * wts[m] * (0.22 + 0.78 * depth);
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
        const size = (1.2 + persp * 0.9) * (pointCount > 4500 ? 0.85 : 1);
        ctx.fillRect(vp.cx + oc[0] * unit * persp - size / 2,
                     vp.cy - oc[1] * unit * persp - size / 2, size, size);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // 三条浅色参考轴，帮助辨认 p/d 轨道取向
  function drawAxes(vp, unit, transform, len, oc) {
    const axes = [
      { a: [len, 0, 0], t: 'x', c: 'rgba(255,92,168,0.55)' },
      { a: [0, len, 0], t: 'y', c: 'rgba(255,179,71,0.55)' },
      { a: [0, 0, len], t: 'z', c: 'rgba(34,211,238,0.55)' }
    ];
    ctx.save();
    ctx.font = '12px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif';
    axes.forEach(ax => {
      transform(-ax.a[0], -ax.a[1], -ax.a[2], oc);
      const p0 = FOCAL / (FOCAL - oc[2]);
      const x0 = vp.cx + oc[0] * unit * p0, y0 = vp.cy - oc[1] * unit * p0;
      transform(ax.a[0], ax.a[1], ax.a[2], oc);
      const p1 = FOCAL / (FOCAL - oc[2]);
      const x1 = vp.cx + oc[0] * unit * p1, y1 = vp.cy - oc[1] * unit * p1;
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.fillStyle = ax.c;
      ctx.fillText(ax.t, x1 + 4, y1 - 4);
    });
    ctx.restore();
  }

  /* ---------------- 径向概率密度曲线图 ---------------- */
  function drawRadialPlot() {
    const cssW = radialCanvas.clientWidth || 300;
    const cssH = radialCanvas.clientHeight || 172;
    dpr = window.devicePixelRatio || 1;
    if (radialCanvas.width !== Math.round(cssW * dpr)) {
      radialCanvas.width = Math.round(cssW * dpr);
      radialCanvas.height = Math.round(cssH * dpr);
    }
    rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rctx.clearRect(0, 0, cssW, cssH);

    const st = STATES[cloudState];
    const n = st.n, l = st.l, rMax = st.plotR;
    const ml = 40, mr = 14, mt = 14, mb = 26;
    const pw = cssW - ml - mr, ph = cssH - mt - mb;

    // 计算曲线与峰
    const step = 0.02;
    const ni = Math.floor(rMax / step);
    let yMax = 1e-9;
    const vals = new Float64Array(ni + 1);
    for (let i = 0; i <= ni; i++) {
      vals[i] = radialProb(n, l, i * step);
      if (vals[i] > yMax) yMax = vals[i];
    }
    const peaks = findRadialPeaks(n, l, rMax, 0.01);
    const color = currentLayerSpecs()[0].color;

    // 网格与纵轴刻度（相对概率）
    rctx.strokeStyle = 'rgba(255,255,255,0.08)';
    rctx.fillStyle = 'rgba(210,214,245,0.6)';
    rctx.font = '10px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif';
    rctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const y = mt + ph - (g / 4) * ph;
      rctx.beginPath();
      rctx.moveTo(ml, y);
      rctx.lineTo(ml + pw, y);
      rctx.stroke();
      rctx.fillText((g / 4).toFixed(2), 8, y + 3);
    }
    // 横轴刻度
    const tickStep = rMax <= 8 ? 2 : (rMax <= 16 ? 4 : 5);
    rctx.textAlign = 'center';
    for (let rv = 0; rv <= rMax + 0.01; rv += tickStep) {
      const x = ml + (rv / rMax) * pw;
      rctx.strokeStyle = 'rgba(255,255,255,0.06)';
      rctx.beginPath();
      rctx.moveTo(x, mt);
      rctx.lineTo(x, mt + ph);
      rctx.stroke();
      rctx.fillStyle = 'rgba(210,214,245,0.6)';
      rctx.fillText(String(rv), x, mt + ph + 15);
    }
    rctx.textAlign = 'left';
    rctx.fillStyle = 'rgba(210,214,245,0.65)';
    rctx.fillText('r / a₀', ml + pw - 30, cssH - 4);

    // 峰位虚线
    peaks.forEach((pr, idx) => {
      const x = ml + (pr / rMax) * pw;
      rctx.strokeStyle = 'rgba(255,179,71,0.75)';
      rctx.setLineDash([4, 4]);
      rctx.beginPath();
      rctx.moveTo(x, mt);
      rctx.lineTo(x, mt + ph);
      rctx.stroke();
      rctx.setLineDash([]);
      rctx.fillStyle = '#ffb347';
      // 多峰时标签上下错开
      const ly = mt + 10 + (idx % 2) * 12;
      rctx.fillText(pr.toFixed(2), Math.min(x + 3, ml + pw - 34), ly);
    });

    // 曲线填充
    const grad = rctx.createLinearGradient(0, mt, 0, mt + ph);
    const rgb = hexToRgb(color);
    grad.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.35)');
    grad.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.02)');
    rctx.fillStyle = grad;
    rctx.beginPath();
    rctx.moveTo(ml, mt + ph);
    for (let i = 0; i <= ni; i++) {
      const x = ml + (i / ni) * pw;
      const y = mt + ph - (vals[i] / yMax) * ph;
      rctx.lineTo(x, y);
    }
    rctx.lineTo(ml + pw, mt + ph);
    rctx.closePath();
    rctx.fill();

    // 曲线描边
    rctx.strokeStyle = color;
    rctx.lineWidth = 2;
    rctx.beginPath();
    for (let i = 0; i <= ni; i++) {
      const x = ml + (i / ni) * pw;
      const y = mt + ph - (vals[i] / yMax) * ph;
      if (i === 0) rctx.moveTo(x, y);
      else rctx.lineTo(x, y);
    }
    rctx.stroke();
  }

  /* ---------------- 教学信息卡 ---------------- */
  function mText(kind) {
    switch (kind) {
      case 'pz': return 'm = 0';
      case 'px':
      case 'py': return 'm = +1 与 −1 的实轨道组合';
      case 'pal': return 'm = −1、0、+1（三个等价取向）';
      case 'dz2': return 'm = 0';
      case 'dxz':
      case 'dyz': return 'm = +1 与 −1 的实轨道组合';
      case 'dxy':
      case 'dx2y2': return 'm = +2 与 −2 的实轨道组合';
      default: return 'm = 0';
    }
  }

  function bohrBlock() {
    const n = electron.n;
    const rA0 = n * n;
    return '<div class="info-block">' +
      '<div class="info-head"><b>玻尔模型</b><span>第 ' + n + ' 能级（定态）</span></div>' +
      '<div class="info-row"><span>能量 Eₙ</span><b>' + (-RYDBERG_EV / (n * n)).toFixed(2) + ' eV</b></div>' +
      '<div class="info-row"><span>轨道半径</span><b>' + rA0 + ' a₀ ≈ ' + (rA0 * A0_ANGSTROM).toFixed(2) + ' 埃</b></div>' +
      '<div class="info-row"><span>轨道角动量</span><b>L = nℏ = ' + n + 'ℏ</b></div>' +
      '<div class="info-row"><span>轨道速度节奏</span><b>约为基态的 ' + (1 / Math.pow(n, 2.4)).toFixed(3) + ' 倍</b></div>' +
      '<div class="info-desc">电子沿半径为 n²a₀ 的确定圆轨道运动；降低能级时螺旋落向内层并放出一个能量确定的光子（叮咚声为示意）。</div>' +
    '</div>';
  }

  function cloudBlock() {
    const key = cloudState;
    const st = STATES[key];
    const n = st.n, l = st.l;
    let kind = 's', oriLabel = '';
    if (key === '2p') {
      kind = orientChoice['2p'];
      oriLabel = (P_ORIENTS.find(o => o.kind === kind) || {}).label || '';
    } else if (key === '3d') {
      kind = orientChoice['3d'];
      oriLabel = (D_ORIENTS.find(o => o.kind === kind) || {}).label || '';
    }
    const lName = ['s', 'p', 'd'][l];
    const L = l === 0 ? '0' : '√' + (l * (l + 1)) + ' ℏ';
    return '<div class="info-block">' +
      '<div class="info-head"><b>' + key + (oriLabel && oriLabel.length <= 3 ? '（' + oriLabel + '）' : '') + '</b>' +
      '<span>n=' + n + '，l=' + l + '（' + lName + ' 亚层）</span></div>' +
      '<div class="info-row"><span>能量 Eₙ</span><b>' + (-RYDBERG_EV / (n * n)).toFixed(2) + ' eV</b></div>' +
      '<div class="info-row"><span>角动量大小</span><b>√l(l+1)ℏ = ' + L + '</b></div>' +
      '<div class="info-row"><span>角动量投影</span><b>' + (kind === 's' ? 'm = 0' : mText(kind)) + '</b></div>' +
      '<div class="info-row"><span>亚层简并度</span><b>2l+1 = ' + (2 * l + 1) + '</b></div>' +
      '<div class="info-row"><span>主能级简并度</span><b>n² = ' + (n * n) + '（不计自旋）</b></div>' +
      '<div class="info-desc">' + DESC[key] + '</div>' +
    '</div>';
  }

  function updateInfo() {
    if (mode === 'bohr') infoCard.innerHTML = bohrBlock();
    else if (mode === 'cloud') infoCard.innerHTML = cloudBlock();
    else infoCard.innerHTML = bohrBlock() + cloudBlock();
  }

  /* ---------------- UI：取向按钮构建/显隐 ---------------- */
  function buildOrientTabs() {
    orientTabs.innerHTML = '';
    if (cloudState === '2p' || cloudState === '3d') {
      orientWrap.classList.remove('hidden');
      const list = cloudState === '2p' ? P_ORIENTS : D_ORIENTS;
      const cur = orientChoice[cloudState];
      list.forEach(o => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = o.label;
        if (o.kind === cur) btn.classList.add('active');
        btn.addEventListener('click', () => {
          orientChoice[cloudState] = o.kind;
          buildOrientTabs();
          rebuildCloud();
          drawRadialPlot();
          updateInfo();
        });
        orientTabs.appendChild(btn);
      });
    } else {
      orientWrap.classList.add('hidden');
    }
  }

  const CAPTIONS = {
    bohr: '玻尔模型：电子在确定的圆形轨道上绕核运动，跃迁时吸收或发射能量确定的光子。',
    cloud: '电子云模型：波函数只给出电子在各处出现的概率，点越密概率越大，不存在确定轨道。',
    compare: '玻尔模型中电子沿确定的轨道运动；量子力学中不存在轨道，只有概率分布（电子云）。'
  };

  function applyMode() {
    Array.prototype.forEach.call(modeTabs.children, btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    bohrGroup.classList.toggle('hidden', mode === 'cloud');
    cloudGroup.classList.toggle('hidden', mode === 'bohr');
    radialGroup.classList.toggle('hidden', mode === 'bohr');
    caption.textContent = CAPTIONS[mode];
    positionLabels();
    updateInfo();
  }

  // 对照模式视图标签定位
  function positionLabels() {
    const vps = getViewports();
    if (mode !== 'compare' || vps.length < 2) {
      labelL.style.display = 'none';
      labelR.style.display = 'none';
      return;
    }
    const vertical = viewW >= viewH;
    labelL.style.display = 'block';
    labelR.style.display = 'block';
    if (vertical) {
      labelL.style.left = '14px';
      labelL.style.top = '14px';
      labelR.style.left = (viewW / 2 + 14) + 'px';
      labelR.style.top = '14px';
    } else {
      labelL.style.left = '14px';
      labelL.style.top = '14px';
      labelR.style.left = '14px';
      labelR.style.top = (viewH / 2 + 14) + 'px';
    }
  }

  /* ---------------- 画布尺寸 ---------------- */
  function resize() {
    dpr = window.devicePixelRatio || 1;
    viewW = stage.clientWidth;
    viewH = stage.clientHeight;
    view.width = Math.round(viewW * dpr);
    view.height = Math.round(viewH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    positionLabels();
    drawRadialPlot();
  }

  /* ---------------- 主渲染帧 ---------------- */
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    if (autoRotate && pointers.size === 0) yaw += dt * 0.12;

    updateLayers(dt);
    updateBohr(dt);

    ctx.clearRect(0, 0, viewW, viewH);
    const vps = getViewports();

    if (mode === 'bohr') {
      drawBohr(vps[0]);
    } else if (mode === 'cloud') {
      drawCloud(vps[0]);
    } else {
      drawBohr(vps[0]);
      drawCloud(vps[1]);
      // 分屏分隔线
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (viewW >= viewH) {
        ctx.moveTo(viewW / 2, 0);
        ctx.lineTo(viewW / 2, viewH);
      } else {
        ctx.moveTo(0, viewH / 2);
        ctx.lineTo(viewW, viewH / 2);
      }
      ctx.stroke();
      ctx.restore();
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- 指针交互：拖拽旋转 / 滚轮缩放 / 双指捏合 ---------------- */
  const pointers = new Map();
  let pinchD0 = 0, pinchZ0 = 1;

  view.addEventListener('pointerdown', ev => {
    ensureAudio();
    view.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      pinchD0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchZ0 = zoom;
    }
  });

  view.addEventListener('pointermove', ev => {
    const prev = pointers.get(ev.pointerId);
    if (!prev) return;
    const dx = ev.clientX - prev.x, dy = ev.clientY - prev.y;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 1) {
      yaw += dx * 0.006;
      pitch = clamp(pitch + dy * 0.006, -1.45, 1.45);
    } else if (pointers.size >= 2) {
      const pts = Array.from(pointers.values());
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchD0 > 0) zoom = clamp(pinchZ0 * d / pinchD0, 0.4, 3);
    }
  });

  function endPointer(ev) { pointers.delete(ev.pointerId); }
  view.addEventListener('pointerup', endPointer);
  view.addEventListener('pointercancel', endPointer);

  view.addEventListener('wheel', ev => {
    ev.preventDefault();
    zoom = clamp(zoom * Math.exp(-ev.deltaY * 0.0011), 0.4, 3);
  }, { passive: false });

  /* ---------------- 控件绑定 ---------------- */
  modeTabs.addEventListener('click', ev => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    mode = btn.dataset.mode;
    applyMode();
  });

  nTabs.addEventListener('click', ev => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    const k = parseInt(btn.dataset.n, 10);
    Array.prototype.forEach.call(nTabs.children, b => {
      b.classList.toggle('active', parseInt(b.dataset.n, 10) === k);
    });
    setBohrLevel(k);
  });

  stateTabs.addEventListener('click', ev => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    cloudState = btn.dataset.state;
    Array.prototype.forEach.call(stateTabs.children, b => {
      b.classList.toggle('active', b.dataset.state === cloudState);
    });
    buildOrientTabs();
    rebuildCloud();
    drawRadialPlot();
    updateInfo();
  });

  pointSlider.addEventListener('input', () => {
    pointCount = parseInt(pointSlider.value, 10);
    pointVal.textContent = String(pointCount);
    scheduleRebuild();
  });

  autoRotateChk.addEventListener('change', () => { autoRotate = autoRotateChk.checked; });
  soundChk.addEventListener('change', () => {
    soundOn = soundChk.checked;
    if (soundOn) { ensureAudio(); playChime(); }
  });
  allOrbitsChk.addEventListener('change', () => { showAllOrbits = allOrbitsChk.checked; });

  // 移动端面板折叠
  const panelToggle = document.getElementById('panelToggle');
  panelToggle.addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    panelToggle.textContent = open ? '收起面板 ▼' : '控制面板 ▲';
  });

  window.addEventListener('resize', resize);

  /* ---------------- 启动 ---------------- */
  buildOrientTabs();
  rebuildCloud();
  applyMode();
  resize();
  requestAnimationFrame(t => { lastT = t; requestAnimationFrame(frame); });
}

/* Node 环境导出物理 API 供自测；浏览器直接启动 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PhysicsAPI;
}
if (typeof window !== 'undefined') {
  boot();
}

})();
