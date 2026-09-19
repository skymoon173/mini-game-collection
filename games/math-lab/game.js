/* ============================================================
   数学实验室  game.js
   三大工具：高斯积分器 / 圆周率工坊 / 傅里叶变换台
   零依赖：全部数值算法（Simpson、erf 级数、拉马努金递推、
   基-2 迭代 FFT）与图表（Canvas 2D）均为本文件自行实现。
   ============================================================ */
(function () {
'use strict';

/* ****************************************************************
   第一部分：纯数值内核（可在 Node 下被自测脚本直接引用）
   **************************************************************** */

/* ---------- Simpson 复合求积（n 为偶数，默认 1000） ---------- */
function simpson(f, a, b, n) {
  if (!isFinite(a) || !isFinite(b) || typeof f !== 'function') return NaN;
  if (b === a) return 0;
  if (b < a) { const t = a; a = b; b = t; } // 除零/反向保护
  n = n || 1000;
  if (n % 2 !== 0) n += 1;
  const h = (b - a) / n;
  let s = 0, odd = 0, even = 0;
  const ya = f(a), yb = f(b);
  if (!isFinite(ya) || !isFinite(yb)) return NaN;
  for (let i = 1; i < n; i++) {
    const y = f(a + i * h);
    if (!isFinite(y)) return NaN;
    if (i & 1) odd += y; else even += y;
  }
  s = ya + yb + 4 * odd + 2 * even;
  return (h / 3) * s;
}

/* ---------- 黎曼和（矩形中点法），用于收敛动画 ---------- */
function riemannSum(f, a, b, n) {
  if (!isFinite(a) || !isFinite(b) || b <= a || n <= 0) return 0;
  const w = (b - a) / n;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const y = f(a + (i + 0.5) * w);
    s += isFinite(y) ? y * w : 0;
  }
  return s;
}

/* ---------- erf：小自变量 Taylor 幂级数；大自变量走不完全伽马连分式 ----------
   erf(x) = 2/√π · Σ (-1)^n x^(2n+1) / (n!(2n+1))
   大 x 时利用 erfc(x) = Q(1/2, x²)，Q 用 Lentz 连分式计算，
   分段衔接经数值验证，整体绝对误差 < 1e-10。                       */
function erfcLarge(x) {
  // 正则化上不完全伽马函数 Q(1/2, z) 的连分式（Numerical Recipes gcf）
  const a = 0.5, z = x * x;
  const FPMIN = 1e-300, EPS = 1e-15, ITMAX = 300;
  let b = z + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= ITMAX; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  // Γ(1/2) = √π
  return Math.exp(-z + a * Math.log(z) - 0.5 * Math.log(Math.PI)) * h;
}
function erf(x) {
  if (!isFinite(x)) return x > 0 ? 1 : -1;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  if (ax === 0) return 0;

  if (ax <= 3.5) {
    // Taylor 幂级数，项递推：t_n/t_{n-1} = -x²(2n-1) / (n(2n+1))
    const INV_SQRT_PI = 1 / Math.sqrt(Math.PI);
    let term = ax, sum = ax;
    for (let n = 1; n <= 120; n++) {
      term *= -ax * ax * (2 * n - 1) / (n * (2 * n + 1));
      sum += term;
      if (Math.abs(term) < 1e-17) break;
    }
    return sign * 2 * INV_SQRT_PI * sum;
  }
  return sign * (1 - erfcLarge(ax));
}

/* ---------- 正弦积分 Si(x)=∫₀ˣ sin t/t dt：整函数幂级数 ----------
   由 sin t/t 的幂级数逐项积分：
   Si(x) = Σ (-1)^n x^(2n+1) / ((2n+1)·(2n+1)!)
   项递推：t_n/t_{n-1} = -x²(2n−1) / (2n(2n+1)²)                */
function si(x) {
  if (!isFinite(x) || x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  let term = ax, sum = ax;
  for (let n = 1; n <= 200; n++) {
    term *= -ax * ax * (2 * n - 1) / (2 * n * (2 * n + 1) * (2 * n + 1));
    sum += term;
    if (Math.abs(term) < 1e-17) break;
  }
  return sign * sum;
}

/* ---------- sinc，x=0 处取极限 1（除零保护） ---------- */
function sinc(x) {
  if (Math.abs(x) < 1e-12) return 1;
  return Math.sin(x) / x;
}

/* ---------- 三种被积函数注册表 ---------- */
const FUNCS = {
  gauss: {
    name: 'f(x) = e^(−x²)',
    fn: function (x) { return Math.exp(-x * x); },
    domain: [-5, 5],
    yRange: [-0.05, 1.08],
    exact: function (a, b) { return Math.sqrt(Math.PI) / 2 * (erf(b) - erf(a)); },
    limitValue: Math.sqrt(Math.PI),
    limitText: '∫₋∞⁺∞ e^(−x²) dx = √π ≈ 1.7724538509',
    insight: 'e^(−x²) 没有初等原函数，但全空间积分恰好等于 √π；把一维高斯视为二维旋转对称分布即可推出。有限区间的精确值借助误差函数 erf 给出。'
  },
  exp: {
    name: 'f(x) = e^(−x)',
    fn: function (x) { return Math.exp(-x); },
    domain: [0, 5],
    yRange: [-0.05, 1.12],
    exact: function (a, b) { return Math.exp(-a) - Math.exp(-b); },
    limitValue: 1,
    limitText: '∫₀⁺∞ e^(−x) dx = 1',
    insight: 'e^(−x) 在正半轴上的反常积分收敛于 1，这正是指数分布归一化常数的来源。'
  },
  sinc: {
    name: 'f(x) = sin(x)/x',
    fn: sinc,
    domain: [-5, 5],
    yRange: [-0.32, 1.12],
    exact: function (a, b) { return si(b) - si(a); },
    limitValue: Math.PI,
    limitText: '∫₋∞⁺∞ sin(x)/x dx = π ≈ 3.1415926536',
    insight: 'sin(x)/x 在 x=0 处取极限值 1，它的全空间积分是著名的 Dirichlet 积分，答案恰好为 π。'
  }
};

/* ---------- 拉马努金圆周率公式（项间比值递推，避免巨数相除） ----------
   1/π = (2√2/9801) Σ (4k)!(1103+26390k) / ((k!)⁴ 396^(4k))
   t_k / t_{k-1} = (4k-3)(4k-2)(4k-1)(4k) / k⁴ / 396⁴
                   · (1103+26390k)/(1103+26390(k-1))              */
function ramanujanPartials(maxN) {
  const C = 1 / Math.pow(396, 4);
  let term = 1103, S = 0;
  const out = [];
  for (let k = 0; k < maxN; k++) {
    if (k >= 1) {
      const poly = (4 * k - 3) * (4 * k - 2) * (4 * k - 1) * (4 * k);
      const linear = (1103 + 26390 * k) / (1103 + 26390 * (k - 1));
      term = term * (poly / Math.pow(k, 4)) * C * linear;
    }
    S += term;
    const pi = 9801 / (2 * Math.SQRT2 * S);
    out.push({ k: k, x: k + 1, term: term, pi: pi, err: Math.abs(pi - Math.PI) });
  }
  return out;
}

/* ---------- 莱布尼茨级数：π/4 = 1 − 1/3 + 1/5 − 1/7 + … ---------- */
function leibnizPartials(maxN) {
  let s = 0;
  const out = [];
  for (let k = 0; k < maxN; k++) {
    s += (k % 2 ? -1 : 1) / (2 * k + 1);
    const pi = 4 * s;
    out.push({ x: k + 1, pi: pi, err: Math.abs(pi - Math.PI) });
  }
  return out;
}

/* ---------- 割圆术：单位圆内接正六边形起，边数逐次倍增 ----------
   初始边长 s₆ = 1；递推 s₂ₙ = √(2 − √(4 − sₙ²))（纯根式，不借助 π）。
   π ≈ 周长 / 直径 = n·sₙ/2。                                    */
function polygonPartials(maxIter) {
  let s = 1, n = 6;
  const out = [];
  for (let i = 0; i < maxIter; i++) {
    const pi = n * s / 2;
    out.push({ iter: i, x: n, pi: pi, err: Math.abs(pi - Math.PI) });
    const inner = Math.max(0, 4 - s * s); // 防负数开方
    s = Math.sqrt(2 - Math.sqrt(inner));
    n *= 2;
  }
  return out;
}

/* ---------- 可复现的伪随机数（mulberry32）---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 构造合成信号：3 个正弦分量 + 可选高斯白噪声 ----------
   comps: [{on,f,A,phiDeg}, …]；M 个采样点，采样率 fs。            */
function buildSignal(M, fs, comps, noiseOn, noiseAmp, seed) {
  const rng = mulberry32(seed | 0 || 1);
  const x = new Array(M);
  for (let n = 0; n < M; n++) {
    const t = n / fs;
    let v = 0;
    for (let c = 0; c < comps.length; c++) {
      const comp = comps[c];
      if (comp && comp.on && comp.A > 0) {
        v += comp.A * Math.sin(2 * Math.PI * comp.f * t + comp.phiDeg * Math.PI / 180);
      }
    }
    if (noiseOn && noiseAmp > 0) {
      // Box–Muller 高斯随机数
      const u1 = Math.max(1e-12, rng()), u2 = rng();
      const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v += noiseAmp * g;
    }
    x[n] = v;
  }
  return x;
}

/* ---------- 基-2 迭代 Cooley–Tukey FFT（原地，输入长度须为 2 的幂） ---------- */
function fftRadix2(re, im) {
  const n = re.length;
  if (n === 0 || (n & (n - 1)) !== 0) throw new Error('FFT 点数必须为 2 的幂');

  // 位逆序置换
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  // 蝶形迭代
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = -2 * Math.PI / len;
    const wr0 = Math.cos(ang), wi0 = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      for (let j = 0; j < half; j++) {
        const zr = re[i + j + half] * wr - im[i + j + half] * wi;
        const zi = re[i + j + half] * wi + im[i + j + half] * wr;
        re[i + j + half] = re[i + j] - zr;
        im[i + j + half] = im[i + j] - zi;
        re[i + j] += zr;
        im[i + j] += zi;
        const nwr = wr * wr0 - wi * wi0;
        wi = wr * wi0 + wi * wr0;
        wr = nwr;
      }
    }
  }
  return { re: re, im: im };
}

/* ---------- 加窗（矩形 / Hann），返回加窗样本与窗增益和 ---------- */
function applyWindow(samples, type) {
  const M = samples.length;
  const out = new Array(M);
  let sumW = 0;
  for (let n = 0; n < M; n++) {
    let w = 1;
    if (type === 'hann' && M > 1) w = 0.5 * (1 - Math.cos(2 * Math.PI * n / (M - 1)));
    out[n] = samples[n] * w;
    sumW += w;
  }
  return { x: out, sumW: sumW };
}

/* ---------- 单边幅度谱：补零到 nfft，按窗相干增益归一化 ---------- */
function amplitudeSpectrum(samples, winType, nfft) {
  const M = samples.length;
  const win = applyWindow(samples, winType);
  const re = new Array(nfft).fill(0);
  const im = new Array(nfft).fill(0);
  for (let i = 0; i < M && i < nfft; i++) re[i] = win.x[i]; // 点数不足时补零
  fftRadix2(re, im);
  const half = nfft >> 1;
  const mag = new Array(half + 1);
  for (let k = 0; k <= half; k++) {
    const m = Math.hypot(re[k], im[k]);
    // 直流与奈奎斯特分量不加倍；其余单边谱乘以 2
    const scale = (k === 0 || k === half) ? 1 / win.sumW : 2 / win.sumW;
    mag[k] = m * scale;
  }
  return mag;
}

/* ---------- 谱峰搜索：局部极大 + 非极大值抑制，按频率升序返回 ---------- */
function findPeaks(mag, maxPick) {
  maxPick = maxPick || 4;
  let maxMag = 0;
  for (let k = 1; k < mag.length - 1; k++) if (mag[k] > maxMag) maxMag = mag[k];
  const threshold = Math.max(0.03, 0.12 * maxMag);
  const cands = [];
  for (let k = 1; k < mag.length - 1; k++) {
    if (mag[k] >= threshold && mag[k] >= mag[k - 1] && mag[k] >= mag[k + 1]) {
      cands.push({ bin: k, amp: mag[k] });
    }
  }
  cands.sort(function (p, q) { return q.amp - p.amp; });
  // 按幅度排序后做 3 bin 距离的非极大值抑制
  const picked = [];
  for (let i = 0; i < cands.length && picked.length < maxPick; i++) {
    let ok = true;
    for (let j = 0; j < picked.length; j++) {
      if (Math.abs(cands[i].bin - picked[j].bin) < 3) { ok = false; break; }
    }
    if (ok) picked.push(cands[i]);
  }
  picked.sort(function (p, q) { return p.bin - q.bin; });
  return picked;
}

/* ---------- 供 Node / 浏览器共用的导出 ---------- */
const API = {
  simpson: simpson,
  riemannSum: riemannSum,
  erf: erf,
  erfc: function (x) { return 1 - erf(x); },
  si: si,
  sinc: sinc,
  FUNCS: FUNCS,
  ramanujanPartials: ramanujanPartials,
  leibnizPartials: leibnizPartials,
  polygonPartials: polygonPartials,
  mulberry32: mulberry32,
  buildSignal: buildSignal,
  fftRadix2: fftRadix2,
  applyWindow: applyWindow,
  amplitudeSpectrum: amplitudeSpectrum,
  findPeaks: findPeaks
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;

/* ****************************************************************
   第二部分：浏览器界面。Node 环境下到此为止。
   **************************************************************** */
if (typeof document === 'undefined') return;

const $ = function (id) { return document.getElementById(id); };
const COLORS = { primary: '#7c5cff', cyan: '#22d3ee', pink: '#ff5ca8', amber: '#ffb347',
  grid: 'rgba(255,255,255,.07)', axis: 'rgba(255,255,255,.28)', text: '#9aa3c7', textHi: '#e9ecff' };
const COMP_COLORS = ['#22d3ee', '#ff5ca8', '#ffb347'];
const FONT = '12px system-ui,-apple-target,"Segoe UI","Microsoft YaHei",sans-serif';

/* ---------- 通用：按设备像素比准备画布 ---------- */
function prepare(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w <= 0 || h <= 0) return null; // 隐藏标签页中的画布暂不绘制
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = FONT;
  return { ctx: ctx, w: w, h: h };
}

/* ---------- 通用：生成“好看”的线性刻度 ---------- */
function niceNum(range, round) {
  const expv = Math.floor(Math.log10(range));
  const frac = range / Math.pow(10, expv);
  let nf;
  if (round) nf = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
  else nf = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nf * Math.pow(10, expv);
}
function linearTicks(min, max, count) {
  count = count || 8;
  if (!isFinite(min) || !isFinite(max) || min === max) return [min];
  const step = niceNum(niceNum(max - min, false) / Math.max(1, count - 1), true);
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 0.5; v += step) {
    out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toFixed(10)));
  }
  return out;
}

/* ---------- 通用：在线性坐标系中画网格、轴与刻度标签 ---------- */
function drawLinearAxes(ctx, p, xr, yr, opt) {
  opt = opt || {};
  const X = function (v) { return p.x + (v - xr[0]) / (xr[1] - xr[0]) * p.w; };
  const Y = function (v) { return p.y + (yr[1] - v) / (yr[1] - yr[0]) * p.h; };
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = FONT;

  // 横向网格（y 刻度）
  const yt = linearTicks(yr[0], yr[1], opt.yCount || 7);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  yt.forEach(function (v) {
    if (v < yr[0] || v > yr[1]) return;
    const y = Y(v);
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath(); ctx.moveTo(p.x, y); ctx.lineTo(p.x + p.w, y); ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.fillText(opt.yFmt ? opt.yFmt(v) : String(v), p.x - 8, y);
  });

  // 纵向网格（x 刻度）
  const xt = linearTicks(xr[0], xr[1], opt.xCount || 10);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  xt.forEach(function (v) {
    if (v < xr[0] || v > xr[1]) return;
    const x = X(v);
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x, p.y + p.h); ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.fillText(opt.xFmt ? opt.xFmt(v) : String(v), x, p.y + p.h + 7);
  });

  // 零轴强调
  if (yr[0] < 0 && yr[1] > 0) {
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath(); ctx.moveTo(p.x, Y(0)); ctx.lineTo(p.x + p.w, Y(0)); ctx.stroke();
  }
  if (xr[0] < 0 && xr[1] > 0) {
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath(); ctx.moveTo(X(0), p.y); ctx.lineTo(X(0), p.y + p.h); ctx.stroke();
  }

  // 边框
  ctx.strokeStyle = COLORS.axis;
  ctx.strokeRect(p.x, p.y, p.w, p.h);

  // 轴标题
  if (opt.xTitle) {
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(opt.xTitle, p.x + p.w, p.y + p.h + 30);
  }
  if (opt.yTitle) {
    ctx.save();
    ctx.fillStyle = COLORS.text;
    ctx.translate(14, p.y + p.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(opt.yTitle, 0, 0);
    ctx.restore();
  }
  ctx.restore();
  return { X: X, Y: Y };
}

/* ---------- 数字 / 科学计数格式化 ---------- */
function supUnicode(n) {
  const map = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  return String(n).split('').map(function (ch) { return map[ch] || ch; }).join('');
}
function sci(v) {
  if (!isFinite(v)) return '—';
  if (v === 0) return '0';
  if (Math.abs(v) >= 1e-3 && Math.abs(v) < 1e6) return v.toPrecision(6).replace(/0+$/, '').replace(/\.$/, '');
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / Math.pow(10, e);
  return (m >= 0 ? m.toFixed(2) : '−' + Math.abs(m).toFixed(2)) + '×10' + supUnicode(e);
}

/* ****************************************************************
   标签切换
   **************************************************************** */
const labs = {};
document.querySelectorAll('.tab-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
    const name = btn.dataset.tab;
    document.querySelectorAll('.tab-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'panel-' + name);
    });
    if (labs[name] && labs[name].redraw) labs[name].redraw();
  });
});

window.addEventListener('resize', function () {
  Object.keys(labs).forEach(function (k) {
    const panel = $('panel-' + (k === 'gauss' ? 'gauss' : k === 'pi' ? 'pi' : 'fourier'));
    if (panel.classList.contains('active')) labs[k].redraw();
  });
});

/* ****************************************************************
   工具一：高斯积分器
   **************************************************************** */
function initGaussLab() {
  const cv = $('cvGauss');
  const st = {
    fnKey: 'gauss', a: -1.5, b: 1.5,
    limit: false,
    riem: { playing: false, n: 4, raf: 0, lastStep: 0 }
  };

  const current = function () { return FUNCS[st.fnKey]; };

  /* 根据当前函数定义域校正 a、b（保证 a < b） */
  function clampAB() {
    const dom = current().domain;
    const minGap = 0.02;
    st.a = Math.max(dom[0], Math.min(dom[1] - minGap, st.a));
    st.b = Math.max(dom[0] + minGap, Math.min(dom[1], st.b));
    if (st.b <= st.a) st.b = Math.min(dom[1], st.a + minGap);
  }

  function syncControls() {
    const dom = current().domain;
    [['gASlide', st.a], ['gBSlide', st.b]].forEach(function (pair) {
      const el = $(pair[0]);
      el.min = dom[0]; el.max = dom[1];
      el.value = pair[1];
    });
    $('gAInput').min = dom[0]; $('gAInput').max = dom[1];
    $('gBInput').min = dom[0]; $('gBInput').max = dom[1];
    $('gAInput').value = st.a.toFixed(2);
    $('gBInput').value = st.b.toFixed(2);
    $('gAVal').textContent = (st.a < 0 ? '−' + Math.abs(st.a).toFixed(2) : st.a.toFixed(2));
    $('gBVal').textContent = (st.b < 0 ? '−' + Math.abs(st.b).toFixed(2) : st.b.toFixed(2));
  }

  function layout(w, h) {
    return { x: 58, y: 20, w: w - 82, h: h - 60 };
  }

  /* 主绘制：网格、曲线、区间填充、手柄、黎曼矩形 */
  function draw() {
    const prepared = prepare(cv);
    if (!prepared) return;
    const ctx = prepared.ctx, w = prepared.w, h = prepared.h;
    const def = current();
    const dom = def.domain;
    const p = layout(w, h);
    const xr = dom, yr = def.yRange;
    const mp = drawLinearAxes(ctx, p, xr, yr, {
      xTitle: 'x', yTitle: 'f(x)',
      xFmt: function (v) { return (v < 0 ? '−' + Math.abs(v) : v).toString(); },
      yFmt: function (v) { return v.toFixed(v % 1 ? 1 : 0); }
    });
    const X = mp.X, Y = mp.Y;

    // 区间填充
    const fillLeft = st.limit ? dom[0] : st.a;
    const fillRight = st.limit ? dom[1] : st.b;
    const grad = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    grad.addColorStop(0, 'rgba(124,92,255,.42)');
    grad.addColorStop(1, 'rgba(34,211,238,.10)');
    ctx.beginPath();
    ctx.moveTo(X(fillLeft), Y(0));
    const STEPS = 480;
    for (let i = 0; i <= STEPS; i++) {
      const x = fillLeft + (fillRight - fillLeft) * i / STEPS;
      ctx.lineTo(X(x), Y(def.fn(x)));
    }
    ctx.lineTo(X(fillRight), Y(0));
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // 黎曼矩形（中点法）
    if (st.riem.n > 0 && !st.limit) {
      const n = st.riem.n;
      const rw = (st.b - st.a) / n;
      ctx.fillStyle = 'rgba(255,179,71,.18)';
      ctx.strokeStyle = 'rgba(255,179,71,.55)';
      ctx.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        const x0 = st.a + i * rw, x1 = x0 + rw;
        const fv = def.fn(x0 + rw / 2);
        const y0 = Y(Math.max(0, Math.min(yr[1], fv)));
        const base = Y(0);
        const top = Math.min(y0, base), hgt = Math.abs(base - y0);
        ctx.fillRect(X(x0) + 0.5, top, X(x1) - X(x0) - 1, hgt);
        if (n <= 60) ctx.strokeRect(X(x0) + 0.5, top, X(x1) - X(x0) - 1, hgt);
      }
    }

    // 函数曲线
    ctx.beginPath();
    for (let i = 0; i <= 600; i++) {
      const x = dom[0] + (dom[1] - dom[0]) * i / 600;
      const y = def.fn(x);
      const px = X(x), py = Y(Math.max(yr[0], Math.min(yr[1], y)));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2.4;
    ctx.shadowColor = 'rgba(34,211,238,.55)';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 边界虚线 + 拖动手柄
    function boundary(xv, label) {
      if (xv < dom[0] || xv > dom[1]) return;
      const px = X(xv);
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(px, p.y); ctx.lineTo(px, p.y + p.h); ctx.stroke();
      ctx.setLineDash([]);
      if (!st.riem.playing) {
        ctx.beginPath(); ctx.arc(px, Y(0), 7, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = COLORS.pink; ctx.stroke();
      }
      ctx.fillStyle = COLORS.textHi;
      ctx.font = '600 13px system-ui,"Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(label, px, p.y - 2);
      ctx.font = FONT;
    }
    if (st.limit) {
      boundary(dom[0], st.fnKey === 'exp' ? '0' : '−∞');
      boundary(dom[1], '+∞');
    } else {
      boundary(st.a, 'a = ' + st.a.toFixed(2));
      boundary(st.b, 'b = ' + st.b.toFixed(2));
    }

    // 左上角公式
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.textHi;
    ctx.font = '600 14px ui-monospace,Consolas,monospace';
    ctx.fillText(def.name, p.x + 10, p.y + 8);
    if (st.limit) {
      ctx.fillStyle = COLORS.amber;
      ctx.fillText(def.limitText, p.x + 10, p.y + 28);
    }
    ctx.font = FONT;
  }

  /* 更新读数面板 */
  function updateReadouts() {
    const def = current();
    let simpVal, exactVal;
    if (st.limit) {
      simpVal = simpson(def.fn, def.domain[0], def.domain[1], 1000);
      exactVal = def.limitValue;
    } else {
      simpVal = simpson(def.fn, st.a, st.b, 1000);
      exactVal = def.exact(st.a, st.b);
    }
    $('gSimp').textContent = isFinite(simpVal) ? simpVal.toFixed(10) : '—';
    $('gExact').textContent = isFinite(exactVal) ? exactVal.toFixed(10) : '—';
    const diff = Math.abs(simpVal - exactVal);
    $('gDiff').textContent = isFinite(diff) ? sci(diff) : '—';
    const rv = (st.limit || st.riem.n <= 0)
      ? null
      : riemannSum(def.fn, st.a, st.b, st.riem.n);
    $('gRiemVal').textContent = rv === null ? '—' : rv.toFixed(8);
    $('gRiemState').textContent = st.limit
      ? '无穷区间极限模式：积分趋于 ' + def.limitValue.toFixed(10)
      : '矩形数 n = ' + st.riem.n + '　·　提示：也可直接拖动图中 a、b 手柄';
    $('gInsight').textContent = def.insight;
  }

  function refresh() {
    clampAB();
    syncControls();
    updateReadouts();
    draw();
  }

  /* ---------- 黎曼和收敛动画：n 从 4 增至 200 ---------- */
  function stopRiem() {
    st.riem.playing = false;
    if (st.riem.raf) cancelAnimationFrame(st.riem.raf);
    $('gRiemBtn').textContent = '播放黎曼和收敛';
  }
  function playRiem() {
    st.limit = false;
    st.riem.playing = true;
    st.riem.n = 4;
    st.riem.lastStep = performance.now();
    $('gRiemBtn').textContent = '停止动画';
    const tick = function (now) {
      if (!st.riem.playing) return;
      if (now - st.riem.lastStep > 45) {
        st.riem.lastStep = now;
        st.riem.n = Math.min(200, st.riem.n + 2);
        updateReadouts();
        draw();
        if (st.riem.n >= 200) { stopRiem(); return; }
      }
      st.riem.raf = requestAnimationFrame(tick);
    };
    st.riem.raf = requestAnimationFrame(tick);
  }

  /* ---------- 画布上拖动 a、b 手柄 ---------- */
  let dragging = null;
  function eventToX(evt) {
    const rect = cv.getBoundingClientRect();
    const prepared = prepare(cv);
    if (!prepared) return 0;
    const p = layout(prepared.w, prepared.h);
    const dom = current().domain;
    const frac = ((evt.clientX - rect.left) - p.x) / p.w;
    return dom[0] + frac * (dom[1] - dom[0]);
  }
  cv.addEventListener('pointerdown', function (evt) {
    if (st.limit || st.riem.playing) return;
    const x = eventToX(evt);
    if (Math.abs(x - st.a) <= Math.abs(x - st.b)) dragging = 'a';
    else dragging = 'b';
    cv.setPointerCapture(evt.pointerId);
    moveHandle(evt);
  });
  function moveHandle(evt) {
    if (!dragging) return;
    const x = eventToX(evt);
    if (dragging === 'a') st.a = x; else st.b = x;
    refresh();
  }
  cv.addEventListener('pointermove', moveHandle);
  cv.addEventListener('pointerup', function () { dragging = null; });
  cv.addEventListener('pointercancel', function () { dragging = null; });

  /* ---------- 控件绑定 ---------- */
  document.querySelectorAll('#gFuncSeg .seg-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#gFuncSeg .seg-btn').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      st.fnKey = btn.dataset.fn;
      stopRiem();
      st.riem.n = 0; // 切函数后先不显示矩形
      st.limit = false;
      $('gLimitBtn').textContent = '无穷区间极限';
      const dom = current().domain;
      if (st.fnKey === 'exp') { st.a = 0.2; st.b = 2; }
      else { st.a = Math.max(dom[0], Math.min(dom[1], -1.5)); st.b = 1.5; }
      refresh();
    });
  });

  function bindSlide(slideId, inputId, key) {
    const slide = $(slideId), input = $(inputId);
    slide.addEventListener('input', function () {
      st[key] = parseFloat(slide.value);
      st.limit = false; $('gLimitBtn').textContent = '无穷区间极限';
      refresh();
    });
    input.addEventListener('change', function () {
      const v = parseFloat(input.value);
      if (isNaN(v)) { syncControls(); return; } // 拒绝 NaN
      st[key] = v;
      st.limit = false; $('gLimitBtn').textContent = '无穷区间极限';
      refresh();
    });
  }
  bindSlide('gASlide', 'gAInput', 'a');
  bindSlide('gBSlide', 'gBInput', 'b');

  $('gLimitBtn').addEventListener('click', function () {
    stopRiem();
    st.riem.n = 0;
    st.limit = !st.limit;
    $('gLimitBtn').textContent = st.limit ? '返回有限区间' : '无穷区间极限';
    refresh();
  });
  $('gRiemBtn').addEventListener('click', function () {
    if (st.riem.playing) stopRiem();
    else { st.riem.n = 4; playRiem(); }
  });

  refresh();
  return { redraw: function () { syncControls(); draw(); } };
}

/* ****************************************************************
   工具二：圆周率工坊
   **************************************************************** */
function initPiLab() {
  const cv = $('cvPiErr');
  const PI_STR = Math.PI.toFixed(15);

  // 三种算法的全量数据（拉马努金始终作为参考曲线）
  const DATA = {
    ram: ramanujanPartials(8),
    lei: leibnizPartials(500),
    poly: polygonPartials(19)
  };
  const MODE_CFG = {
    ram: { min: 1, max: 8, def: 3, color: COLORS.cyan, name: '拉马努金部分和',
      detail: function (n) { return 'k = 0 … ' + (n - 1); } },
    lei: { min: 1, max: 500, def: 100, color: COLORS.pink, name: '莱布尼茨部分和',
      detail: function (n) { return '前 ' + n + ' 项（π/4 = 1 − 1/3 + 1/5 − …）'; } },
    poly: { min: 1, max: 19, def: 10, color: COLORS.amber, name: '割圆术近似',
      detail: function (n) { return '正 ' + (6 * Math.pow(2, n - 1)) + ' 边形（从正六边形倍增 ' + (n - 1) + ' 次）'; } }
  };

  const st = { mode: 'ram', N: 3, animStart: 0, playing: false, timer: 0, raf: 0, rollToken: 0 };

  /* 两个定长字符串从头匹配的数字个数 */
  function leadingDigits(a, b) {
    let c = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) break;
      if (/\d/.test(a[i])) c++;
    }
    return c;
  }

  /* 大数字滚动（老虎机式逐位滚动后落定） */
  function renderDigits(valueText, animate) {
    const el = $('piDigits');
    const token = ++st.rollToken;
    const match = leadingDigits(valueText, PI_STR);
    el.innerHTML = '';
    for (let i = 0; i < valueText.length; i++) {
      const ch = valueText[i];
      const span = document.createElement('span');
      const isDigit = /\d/.test(ch);
      span.className = 'ch ' + (isDigit ? 'rest' : 'sym');
      span.textContent = ch;
      el.appendChild(span);
      if (isDigit && animate) {
        const delay = i * 16;
        setTimeout((function (s, idx) {
          return function () {
            if (token !== st.rollToken) return;
            const iv = setInterval(function () {
              s.textContent = String(Math.floor(Math.random() * 10));
            }, 45);
            setTimeout(function () {
              clearInterval(iv);
              if (token !== st.rollToken) return;
              s.textContent = valueText[idx];
              s.className = 'ch ' + (idx < match ? 'ok' : idx === match ? 'bad' : 'rest');
            }, 380);
          };
        })(span, i), delay);
      } else if (isDigit) {
        span.className = 'ch ' + (i < match ? 'ok' : i === match ? 'bad' : 'rest');
      }
    }
  }

  /* 逐项步骤表 */
  function renderSteps() {
    const list = $('piStepList');
    list.innerHTML = '';
    if (st.mode === 'ram') {
      for (let i = 0; i < st.N; i++) {
        const d = DATA.ram[i];
        const li = document.createElement('li');
        li.className = 'step-row' + (i === st.N - 1 ? ' latest' : '');
        li.innerHTML = '<span class="s-k">' + d.k + '</span>' +
          '<span class="s-pi">' + d.pi.toFixed(15) + '</span>' +
          '<span class="s-err">' + sci(d.err) + '</span>';
        list.appendChild(li);
      }
    } else if (st.mode === 'poly') {
      for (let i = 0; i < st.N; i++) {
        const d = DATA.poly[i];
        const li = document.createElement('li');
        li.className = 'step-row' + (i === st.N - 1 ? ' latest' : '');
        li.innerHTML = '<span class="s-k">' + d.iter + '</span>' +
          '<span class="s-pi">' + d.pi.toFixed(15) + '</span>' +
          '<span class="s-err">' + sci(d.err) + '</span>';
        list.appendChild(li);
      }
    } else {
      // 莱布尼茨：对数采样若干检查点
      const pts = [1, 2, 5, 10, 25, 50, 100, 200, 350, 500].filter(function (v) { return v <= st.N; });
      pts.forEach(function (n, idx) {
        const d = DATA.lei[n - 1];
        const li = document.createElement('li');
        li.className = 'step-row' + (idx === pts.length - 1 ? ' latest' : '');
        li.innerHTML = '<span class="s-k">' + n + '</span>' +
          '<span class="s-pi">' + d.pi.toFixed(15) + '</span>' +
          '<span class="s-err">' + sci(d.err) + '</span>';
        list.appendChild(li);
      });
    }
    list.parentElement.scrollTop = list.parentElement.scrollHeight;
  }

  /* 刷新左侧数据面板 */
  function refreshPanel(animate) {
    const cfg = MODE_CFG[st.mode];
    const d = DATA[st.mode][st.N - 1];
    $('piAlgName').textContent = cfg.name;
    $('piAlgDetail').textContent = cfg.detail(st.N);
    renderDigits(d.pi.toFixed(15), animate);
    $('piCorrect').textContent = leadingDigits(d.pi.toFixed(15), PI_STR) + ' 位';
    $('piErr').textContent = sci(d.err);
    $('piNVal').textContent = st.mode === 'poly'
      ? '倍增 ' + st.N + ' 次（' + (6 * Math.pow(2, st.N - 1)) + ' 边形）'
      : st.N + ' 项';
    renderSteps();
  }

  /* 双对数误差图 */
  const XR = [0.8, 3e6], YE = [3e-16, 3];
  function logMap(v, range, lo, hi) {
    return lo + (Math.log10(v) - Math.log10(range[0])) /
      (Math.log10(range[1]) - Math.log10(range[0])) * (hi - lo);
  }
  function easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function drawChart(now) {
    const prepared = prepare(cv);
    if (!prepared) return;
    const ctx = prepared.ctx, w = prepared.w, h = prepared.h;
    const p = { x: 62, y: 22, w: w - 88, h: h - 72 };
    const X = function (v) { return logMap(v, XR, p.x, p.x + p.w); };
    const Y = function (v) { return logMap(Math.max(2e-16, v), YE, p.y + p.h, p.y); };

    // 对数网格
    ctx.font = FONT;
    ctx.lineWidth = 1;
    for (let e = -15; e <= 0; e++) {
      const v = Math.pow(10, e);
      const y = Y(v);
      ctx.strokeStyle = (e === 0 || e % 5 === 0) ? 'rgba(255,255,255,.13)' : COLORS.grid;
      ctx.beginPath(); ctx.moveTo(p.x, y); ctx.lineTo(p.x + p.w, y); ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText('10' + supUnicode(e), p.x - 8, y);
    }
    [1, 10, 100, 1e3, 1e4, 1e5, 1e6].forEach(function (v, i) {
      const x = X(v);
      ctx.strokeStyle = i % 2 ? COLORS.grid : 'rgba(255,255,255,.13)';
      ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x, p.y + p.h); ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(v >= 1000 ? v / 1000 + 'k' : String(v), x, p.y + p.h + 7);
    });
    ctx.strokeStyle = COLORS.axis;
    ctx.strokeRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('计算量：累加项数 / 正多边形边数（对数轴）', p.x + p.w, p.y + p.h + 32);
    ctx.save();
    ctx.translate(16, p.y + p.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('|π̂ − π| 绝对误差（对数轴）', 0, 0);
    ctx.restore();

    // 参考与当前序列
    const elapsed = now - st.animStart;
    function series(key, active) {
      const arr = DATA[key];
      const n = active ? st.N : (key === 'ram' ? 8 : 0);
      if (n <= 0) return;
      const color = MODE_CFG[key].color;
      const stagger = key === 'ram' ? 110 : key === 'poly' ? 70 : 2.2;
      const dropDur = 420;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const d = arr[i];
        const delay = (n - 1 - i) * stagger; // 右侧点先坠落
        const t = Math.max(0, Math.min(1, (elapsed - delay) / dropDur));
        if (t <= 0) continue;
        const py = Y(Math.max(2e-16, d.err || 2e-16));
        // 从画布顶部带回弹落到目标位置（右侧点先开始）
        const yShown = active ? p.y - 30 + easeOutBack(t) * (py - (p.y - 30)) : py;
        pts.push({ x: X(d.x), y: yShown, tx: X(d.x), ty: py, arrived: t >= 1 });
      }
      // 已落点之间的连线（从右向左生长）
      if (pts.length > 1) {
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          if (i === 0) ctx.moveTo(pts[i].x, pts[i].ty);
          else ctx.lineTo(pts[i].x, pts[i].ty);
        }
        ctx.strokeStyle = active ? color : 'rgba(34,211,238,.32)';
        ctx.globalAlpha = active ? 0.95 : 0.55;
        ctx.lineWidth = active ? 2.2 : 1.2;
        ctx.setLineDash(active ? [] : [4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      // 点
      pts.forEach(function (pt, i) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, active ? (i === pts.length - 1 ? 6 : 3.6) : 3, 0, Math.PI * 2);
        ctx.fillStyle = active ? color : 'rgba(34,211,238,.45)';
        ctx.fill();
        if (active && i === pts.length - 1) {
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        }
      });
      return pts;
    }

    // 非当前模式画为暗色参考；当前模式彩色动画
    (['lei', 'poly', 'ram']).forEach(function (key) {
      if (key === st.mode) return;
      series(key, false);
    });
    const pts = series(st.mode, true);

    // 当前点的误差读数
    if (pts && pts.length) {
      const last = pts[pts.length - 1];
      const d = DATA[st.mode][st.N - 1];
      ctx.fillStyle = MODE_CFG[st.mode].color;
      ctx.font = '600 12.5px system-ui,"Microsoft YaHei",sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      const label = st.mode === 'poly'
        ? '正' + d.x + ' 边形：误差 ' + sci(d.err)
        : '第 ' + d.x + ' 项：误差 ' + sci(d.err);
      let lx = last.tx + 10;
      if (lx > p.x + p.w - 200) lx = last.tx - 10 - ctx.measureText(label).width;
      ctx.fillText(label, lx, Math.max(p.y + 14, last.ty - 10));
      ctx.font = FONT;
    }

    // 动画尚未结束则继续
    const totalAnim = (st.N - 1) * (st.mode === 'ram' ? 110 : st.mode === 'poly' ? 70 : 2.2) + 420;
    if (elapsed < totalAnim) {
      st.raf = requestAnimationFrame(drawChart);
    } else {
      st.raf = 0;
    }
  }

  function redrawChart() {
    st.animStart = performance.now();
    if (st.raf) cancelAnimationFrame(st.raf);
    st.raf = requestAnimationFrame(drawChart);
  }

  function stopPlay() {
    st.playing = false;
    if (st.timer) { clearInterval(st.timer); st.timer = 0; }
    if (st.rafStep) { cancelAnimationFrame(st.rafStep); st.rafStep = 0; }
    $('piPlayBtn').textContent = '播放收敛';
  }

  /* 播放：逐项/逐倍增加，拉马努金慢速滚动数字，对比算法快速扫过 */
  function play() {
    stopPlay();
    st.playing = true;
    $('piPlayBtn').textContent = '停止';
    st.N = MODE_CFG[st.mode].min;
    refreshPanel(st.mode === 'ram' || st.mode === 'poly');
    redrawChart();

    if (st.mode === 'lei') {
      // 莱布尼茨在约 5 秒内扫到 500 项
      let last = performance.now();
      const stepFrame = function (now) {
        if (!st.playing) return;
        const dt = now - last;
        if (dt > 30) {
          last = now;
          st.N = Math.min(500, st.N + Math.max(1, Math.round(dt * 100 / 1000)));
          const slider = $('piSlider');
          slider.value = st.N;
          refreshPanel(false);
          redrawChart();
          if (st.N >= 500) { stopPlay(); return; }
        }
        st.rafStep = requestAnimationFrame(stepFrame);
      };
      st.rafStep = requestAnimationFrame(stepFrame);
    } else {
      const interval = st.mode === 'ram' ? 850 : 500;
      st.timer = setInterval(function () {
        if (st.N >= MODE_CFG[st.mode].max) { stopPlay(); return; }
        st.N += 1;
        $('piSlider').value = st.N;
        refreshPanel(true);
        redrawChart();
      }, interval);
    }
  }

  function setMode(mode) {
    stopPlay();
    st.mode = mode;
    st.N = MODE_CFG[mode].def;
    const slider = $('piSlider');
    slider.min = MODE_CFG[mode].min;
    slider.max = MODE_CFG[mode].max;
    slider.step = 1;
    slider.value = st.N;
    $('piSlideLabel').textContent = mode === 'ram'
      ? '累加项数（每多 1 项约多 8 位正确数字）'
      : mode === 'lei'
        ? '莱布尼茨累加项数（误差约正比于 1/n，收敛很慢）'
        : '倍增次数（正 6 边形起，边数逐次翻倍，误差约正比于 1/n²）';
    document.querySelectorAll('#piModeSeg .seg-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    $('piInsight').textContent = mode === 'ram'
      ? '拉马努金公式每多算一项，正确位数约增加 8 位：仅 2 项（k = 0、1）就给出约 15 位正确数字，这种超指数收敛来自分母中 396 的 4k 次方。'
      : mode === 'lei'
        ? '莱布尼茨级数要到第 500 项才勉强获得 3 位小数——在双对数图上它只是一条缓缓下行的直线，与几乎垂直坠落的拉马努金曲线对照，便知拉马努金的伟大。'
        : '割圆术用内接正多边形周长逼近圆周长，边数翻倍一次误差约减为四分之一；刘徽当年算到正 3072 边形得到 π ≈ 3.1416，已是公元三世纪的奇迹。';
    refreshPanel(true);
    redrawChart();
  }

  document.querySelectorAll('#piModeSeg .seg-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { setMode(btn.dataset.mode); });
  });
  $('piSlider').addEventListener('input', function () {
    stopPlay();
    st.N = parseInt($('piSlider').value, 10);
    refreshPanel(false);
    redrawChart();
  });
  $('piPlayBtn').addEventListener('click', function () {
    if (st.playing) stopPlay(); else play();
  });

  // 真值与初始状态
  $('piTrueDigits').textContent = PI_STR;
  setMode('ram');

  return {
    redraw: function () {
      $('piTrueDigits').textContent = PI_STR;
      refreshPanel(false);
      redrawChart();
    }
  };
}

/* ****************************************************************
   工具三：傅里叶变换台
   **************************************************************** */
function initFourierLab() {
  const cvT = $('cvTime'), cvF = $('cvFreq');
  const FS = 512, M = 256; // 固定采样率 512Hz、256 个采样点（0.5 秒）
  const st = {
    comps: [
      { on: true, f: 12, A: 0.8, phiDeg: 0 },
      { on: true, f: 37, A: 0.45, phiDeg: 0 },
      { on: true, f: 88, A: 0.3, phiDeg: 45 }
    ],
    noiseOn: false,
    noiseAmp: 0.12,
    seed: 20260919,
    nfft: 512,
    win: 'rect',
    hoverBin: -1
  };

  /* ---------- 动态构建三个分量控制行 ---------- */
  const rowsEl = $('fCompRows');
  st.comps.forEach(function (comp, idx) {
    const row = document.createElement('div');
    row.className = 'comp-row' + (comp.on ? '' : ' off');
    row.innerHTML =
      '<span class="comp-tag" style="background:' + COMP_COLORS[idx] + '">' + (idx + 1) + '</span>' +
      '<div class="comp-cell"><label>启用 <input type="checkbox" ' + (comp.on ? 'checked' : '') + ' data-k="on"></label></div>' +
      '<div class="comp-cell"><label>频率 Hz <span class="cv" data-v="f">' + comp.f + '</span></label>' +
        '<input class="slider" type="range" min="1" max="200" step="1" value="' + comp.f + '" data-k="f"></div>' +
      '<div class="comp-cell"><label>振幅 / 相位° <span class="cv"><span data-v="A">' + comp.A.toFixed(2) + '</span> · <span data-v="phi">' + comp.phiDeg + '°</span></span></label>' +
        '<div style="display:flex;gap:8px"><input class="slider" type="range" min="0" max="1" step="0.01" value="' + comp.A + '" data-k="A">' +
        '<input class="slider" type="range" min="0" max="360" step="5" value="' + comp.phiDeg + '" data-k="phi"></div></div>';
    rowsEl.appendChild(row);

    row.querySelector('[data-k="on"]').addEventListener('change', function (e) {
      comp.on = e.target.checked;
      row.classList.toggle('off', !comp.on);
      refresh();
    });
    [['f', 0], ['A', 2], ['phi', 2]].forEach(function (pair) {
      const key = pair[0], decimals = pair[1];
      const input = row.querySelector('[data-k="' + key + '"]');
      const label = row.querySelector('[data-v="' + key + '"]');
      input.addEventListener('input', function () {
        const v = parseFloat(input.value);
        comp[key] = key === 'f' || key === 'phi' ? Math.round(v) : v;
        label.textContent = key === 'phi' ? comp[key] + '°' : comp[key].toFixed(decimals);
        refresh();
      });
    });
  });

  $('fNoiseOn').addEventListener('change', function (e) {
    st.noiseOn = e.target.checked;
    $('fNoiseAmp').disabled = !st.noiseOn;
    refresh();
  });
  $('fNoiseAmp').addEventListener('input', function () {
    const v = parseFloat($('fNoiseAmp').value);
    if (isNaN(v)) return;
    st.noiseAmp = v;
    $('fNoiseAmpVal').textContent = v.toFixed(2);
    refresh();
  });
  $('fReseedBtn').addEventListener('click', function () {
    st.seed = (Math.random() * 4294967296) >>> 0;
    refresh();
  });
  document.querySelectorAll('#fNSeg .seg-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      st.nfft = parseInt(btn.dataset.n, 10);
      document.querySelectorAll('#fNSeg .seg-btn').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      refresh();
    });
  });
  document.querySelectorAll('#fWinSeg .seg-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      st.win = btn.dataset.win;
      document.querySelectorAll('#fWinSeg .seg-btn').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      refresh();
    });
  });

  /* ---------- 时域图 ---------- */
  function drawTime(signal, compSignals) {
    const prepared = prepare(cvT);
    if (!prepared) return;
    const ctx = prepared.ctx, w = prepared.w, h = prepared.h;
    const p = { x: 58, y: 16, w: w - 82, h: h - 48 };
    const xr = [0, M / FS];
    let ymax = 0.1;
    signal.forEach(function (v) { ymax = Math.max(ymax, Math.abs(v)); });
    ymax *= 1.15;
    const yr = [-ymax, ymax];
    const mp = drawLinearAxes(ctx, p, xr, yr, {
      xTitle: '时间 t（秒）', yCount: 4,
      xFmt: function (v) { return v.toFixed(2); },
      yFmt: function (v) { return v.toFixed(1); }
    });

    // 三个分量用各自颜色淡画
    compSignals.forEach(function (cs, idx) {
      if (!cs) return;
      ctx.beginPath();
      for (let n = 0; n < M; n++) {
        const px = mp.X(n / FS), py = mp.Y(cs[n]);
        if (n === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = COMP_COLORS[idx];
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // Hann 窗轮廓
    if (st.win === 'hann') {
      ctx.beginPath();
      for (let n = 0; n < M; n++) {
        const wn = 0.5 * (1 - Math.cos(2 * Math.PI * n / (M - 1)));
        const px = mp.X(n / FS), py = mp.Y(ymax * wn);
        if (n === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = 'rgba(255,179,71,.5)';
      ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    }

    // 合成信号主线 + 采样点
    ctx.beginPath();
    for (let n = 0; n < M; n++) {
      const px = mp.X(n / FS), py = mp.Y(signal[n]);
      if (n === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = '#e9ecff';
    ctx.lineWidth = 1.8;
    ctx.shadowColor = 'rgba(255,255,255,.35)';
    ctx.shadowBlur = 5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(233,236,255,.55)';
    for (let n = 0; n < M; n += 8) {
      ctx.beginPath(); ctx.arc(mp.X(n / FS), mp.Y(signal[n]), 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ---------- 频域幅度谱 ---------- */
  function drawSpectrum(mag) {
    const prepared = prepare(cvF);
    if (!prepared) return;
    const ctx = prepared.ctx, w = prepared.w, h = prepared.h;
    const p = { x: 58, y: 18, w: w - 82, h: h - 54 };
    const half = st.nfft >> 1;
    const binHz = FS / st.nfft;
    const xr = [0, FS / 2]; // 显示至奈奎斯特频率 256Hz

    let ymax = 0.05;
    for (let k = 0; k <= half; k++) ymax = Math.max(ymax, mag[k]);
    ymax *= 1.14;
    const yr = [0, ymax];
    const mp = drawLinearAxes(ctx, p, xr, yr, {
      xTitle: '频率（Hz，奈奎斯特频率 256 Hz）', yTitle: '幅度',
      xCount: 9, yCount: 5,
      xFmt: function (v) { return String(v); },
      yFmt: function (v) { return v.toFixed(2); }
    });

    // 谱线：填充面积 + 折线
    ctx.beginPath();
    ctx.moveTo(mp.X(0), mp.Y(0));
    for (let k = 0; k <= half; k++) {
      ctx.lineTo(mp.X(k * binHz), mp.Y(Math.min(ymax, mag[k])));
    }
    ctx.lineTo(mp.X(FS / 2), mp.Y(0));
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    grad.addColorStop(0, 'rgba(124,92,255,.45)');
    grad.addColorStop(1, 'rgba(124,92,255,.04)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    for (let k = 0; k <= half; k++) {
      const px = mp.X(k * binHz), py = mp.Y(Math.min(ymax, mag[k]));
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = COLORS.primary;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // 分量理论频率参考虚线
    st.comps.forEach(function (comp) {
      if (!comp.on || comp.A <= 0) return;
      const x = mp.X(comp.f);
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x, p.y + p.h); ctx.stroke();
      ctx.setLineDash([]);
    });

    // 谱峰标注
    const peaks = findPeaks(mag, 4);
    peaks.forEach(function (pk) {
      const f = pk.bin * binHz;
      const x = mp.X(f), y = mp.Y(Math.min(ymax, pk.amp));
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.cyan; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
      const label = f.toFixed(f % 1 ? 1 : 0) + ' Hz';
      ctx.font = '600 12.5px system-ui,"Microsoft YaHei",sans-serif';
      ctx.fillStyle = COLORS.cyan;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      let lx = x;
      if (lx < p.x + 30) lx = p.x + 30;
      if (lx > p.x + p.w - 30) lx = p.x + p.w - 30;
      ctx.fillText(label, lx, y - 8);
      ctx.fillStyle = 'rgba(233,236,255,.85)';
      ctx.font = '11px system-ui,"Microsoft YaHei",sans-serif';
      ctx.fillText('幅度 ' + pk.amp.toFixed(2), lx, y - 23);
      ctx.font = FONT;
    });

    // 悬停十字线与读数
    const tip = $('fSpecTip');
    if (st.hoverBin >= 0 && st.hoverBin <= half) {
      const f = st.hoverBin * binHz;
      const a = mag[st.hoverBin];
      const x = mp.X(f), y = mp.Y(Math.min(ymax, a));
      ctx.strokeStyle = 'rgba(34,211,238,.7)';
      ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x, p.y + p.h); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.pink; ctx.fill();

      const rect = cvF.getBoundingClientRect();
      const cardRect = cvF.closest('.canvas-card').getBoundingClientRect();
      tip.hidden = false;
      tip.innerHTML = '频率 <b>' + f.toFixed(1) + ' Hz</b><br>幅度 <b>' + a.toFixed(4) + '</b>' +
        '<br>bin #' + st.hoverBin + ' / ' + half;
      tip.style.left = (rect.left - cardRect.left + x) + 'px';
      tip.style.top = (rect.top - cardRect.top + y) + 'px';
    } else {
      tip.hidden = true;
    }
  }

  /* 悬停：由横坐标换算最近 bin */
  cvF.addEventListener('mousemove', function (evt) {
    const rect = cvF.getBoundingClientRect();
    const p = { x: 58, w: cvF.clientWidth - 82 };
    const frac = ((evt.clientX - rect.left) - p.x) / p.w;
    if (frac < 0 || frac > 1) { st.hoverBin = -1; }
    else {
      const f = frac * FS / 2;
      st.hoverBin = Math.round(f / (FS / st.nfft));
    }
    requestAnimationFrame(function () { refresh(false); });
  });
  cvF.addEventListener('mouseleave', function () {
    st.hoverBin = -1;
    refresh(false);
  });

  /* ---------- 总刷新 ---------- */
  function refresh(redrawTime) {
    const signal = buildSignal(M, FS, st.comps, st.noiseOn, st.noiseAmp, st.seed);
    const compSignals = st.comps.map(function (comp) {
      if (!comp.on || comp.A <= 0) return null;
      return buildSignal(M, FS, [Object.assign({}, comp, { on: true })], false, 0, st.seed);
    });
    const mag = amplitudeSpectrum(signal, st.win, st.nfft);
    if (redrawTime !== false) drawTime(signal, compSignals);
    drawSpectrum(mag);

    // 结论文字
    const peaks = findPeaks(mag, 4);
    const fTxt = peaks.map(function (pk) {
      return (pk.bin * FS / st.nfft).toFixed(1);
    }).join('、');
    $('fInsight').textContent =
      '当前谱峰约在 ' + (fTxt || '—') + ' Hz；' +
      (st.win === 'hann'
        ? 'Hann 窗把能量在频域展宽，却显著压低非整周期频率的泄漏旁瓣，代价是主瓣变宽、频率分辨率下降。'
        : '矩形窗主瓣最窄、频率分辨率最高，但分量频率不落在 bin 上时旁瓣泄漏明显，可切换 Hann 窗对比。') +
      ' 补零到 ' + st.nfft + ' 点只让谱线看起来更平滑（频域插值），并不增加真实分辨率。';
  }

  refresh();
  return { redraw: function () { refresh(); } };
}

/* ****************************************************************
   启动
   **************************************************************** */
labs.gauss = initGaussLab();
labs.pi = initPiLab();
labs.fourier = initFourierLab();

})();
