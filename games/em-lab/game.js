/* ============================================================
 * 《电磁场实验室》 game.js
 * 纯 Canvas 2D 实现，零外部依赖。四个实验：
 *   ① 点电荷电场  ② 电流与磁场  ③ 磁铁相互作用  ④ 安培环路定理
 * 物理量均为相对单位：k = 1，μ₀ = 2π（于是 B = μ₀I/(2πr) = I/r）
 * ============================================================ */
(function () {
'use strict';

/* ============================================================
 * 一、纯物理内核（无 DOM，可被 Node 直接引用做数值自测）
 * ============================================================ */

var MU0 = 2 * Math.PI; // 相对单位下的真空磁导率

/* 点电荷电场：E = k Σ qᵢ (r−rᵢ)/|r−rᵢ|³，soft2 为软化量避免奇点 */
function electricFieldAt(x, y, charges, soft2) {
  var ex = 0, ey = 0;
  for (var i = 0; i < charges.length; i++) {
    var c = charges[i];
    var dx = x - c.x, dy = y - c.y;
    var d2 = dx * dx + dy * dy + soft2;
    var inv = c.q / (d2 * Math.sqrt(d2));
    ex += dx * inv;
    ey += dy * inv;
  }
  return { x: ex, y: ey };
}

/* 电势：φ = Σ qᵢ / r（带软化） */
function potentialAt(x, y, charges, soft2) {
  var p = 0;
  for (var i = 0; i < charges.length; i++) {
    var c = charges[i];
    var dx = x - c.x, dy = y - c.y;
    p += c.q / Math.sqrt(dx * dx + dy * dy + soft2);
  }
  return p;
}

/* 长直载流导线磁场：B = μ₀I/(2πr)，方向 ẑ×r̂（向外电流为逆时针切向） */
function magneticFieldAt(x, y, wires, soft2) {
  var bx = 0, by = 0;
  for (var i = 0; i < wires.length; i++) {
    var w = wires[i];
    var dx = x - w.x, dy = y - w.y;
    var d2 = dx * dx + dy * dy + soft2;
    var k = w.I / d2; // μ₀/(2π)=1
    bx += -dy * k;
    by += dx * k;
  }
  return { x: bx, y: by };
}

/* 磁偶极子（磁极对）磁场：N 极 +m、S 极 −m，按 1/r² 径向场叠加。
 * magnets: [{cx,cy,ang,half,strength}]，N 极位于中心 + half·(cos,sin) */
function dipoleFieldAt(x, y, magnets, soft2) {
  var bx = 0, by = 0;
  for (var i = 0; i < magnets.length; i++) {
    var m = magnets[i];
    var px = m.half * Math.cos(m.ang), py = m.half * Math.sin(m.ang);
    // N 极（+）与 S 极（−）
    bx += dipoleContrib(x, y, m.cx + px, m.cy + py, m.strength, soft2);
    bx += dipoleContrib(x, y, m.cx - px, m.cy - py, -m.strength, soft2);
    by += dipoleContribY(x, y, m.cx + px, m.cy + py, m.strength, soft2);
    by += dipoleContribY(x, y, m.cx - px, m.cy - py, -m.strength, soft2);
  }
  return { x: bx, y: by };
}
function dipoleContrib(x, y, px, py, s, soft2) {
  var dx = x - px, dy = y - py;
  return s * dx / Math.pow(dx * dx + dy * dy + soft2, 1.5);
}
function dipoleContribY(x, y, px, py, s, soft2) {
  var dx = x - px, dy = y - py;
  return s * dy / Math.pow(dx * dx + dy * dy + soft2, 1.5);
}

/* 磁感线追踪：沿单位场向量做 RK4 积分。
 * dir=+1 从 N 极顺场而行（应终止于某 S 极）；dir=−1 从 S 极逆场追溯。
 * 返回 {pts, end}，end ∈ 'pole' | 'bound' | 'weak' | 'max' */
function traceFieldLine(sx, sy, dir, fieldFn, poles, targetKind, bounds) {
  var h = 5, maxSteps = 650;
  var x = sx, y = sy;
  var pts = [[x, y]];
  function unit(px, py) {
    var v = fieldFn(px, py);
    var m = Math.hypot(v.x, v.y);
    if (!isFinite(m) || m < 1e-10) return null;
    return [v.x / m, v.y / m];
  }
  for (var step = 0; step < maxSteps; step++) {
    if (x < bounds.l || x > bounds.r || y < bounds.t || y > bounds.b) {
      return { pts: pts, end: 'bound' };
    }
    for (var i = 0; i < poles.length; i++) {
      var pl = poles[i];
      if (pl.kind === targetKind) {
        if (Math.hypot(x - pl.x, y - pl.y) < 12) {
          pts.push([pl.x, pl.y]);
          return { pts: pts, end: 'pole', ex: pl.x, ey: pl.y, pole: i };
        }
      }
    }
    var k1 = unit(x, y);
    if (!k1) return { pts: pts, end: 'weak' };
    var k2 = unit(x + dir * h * 0.5 * k1[0], y + dir * h * 0.5 * k1[1]);
    if (!k2) return { pts: pts, end: 'weak' };
    var k3 = unit(x + dir * h * 0.5 * k2[0], y + dir * h * 0.5 * k2[1]);
    if (!k3) return { pts: pts, end: 'weak' };
    var k4 = unit(x + dir * h * k3[0], y + dir * h * k3[1]);
    if (!k4) return { pts: pts, end: 'weak' };
    x += dir * h * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6;
    y += dir * h * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6;
    pts.push([x, y]);
  }
  return { pts: pts, end: 'max' };
}

/* 点是否在闭合环路内（圆形 / 矩形） */
function pointInLoop(x, y, loop) {
  if (loop.shape === 'circle') {
    return Math.hypot(x - loop.cx, y - loop.cy) < loop.r;
  }
  return Math.abs(x - loop.cx) < loop.hw && Math.abs(y - loop.cy) < loop.hh;
}

/* 安培环路数值线积分：沿环路均匀采样 n 段（中点矩形公式），
 * 返回积分值、包围电流与 μ₀I_encl */
function ampereIntegral(wires, loop, n, soft2) {
  var integral = 0, encl = 0;
  var i, px, py, tx, ty, dl;
  if (loop.shape === 'circle') {
    var dth = 2 * Math.PI / n;
    for (i = 0; i < n; i++) {
      var th = (i + 0.5) * dth;
      px = loop.cx + loop.r * Math.cos(th);
      py = loop.cy + loop.r * Math.sin(th);
      tx = -Math.sin(th); ty = Math.cos(th); // 逆时针切向
      dl = loop.r * dth;
      var B = magneticFieldAt(px, py, wires, soft2);
      integral += (B.x * tx + B.y * ty) * dl;
    }
  } else {
    var hw = loop.hw, hh = loop.hh;
    var P = 4 * (hw + hh);
    // 四条边（逆时针，自左上角起）：上→右→下→左
    var edges = [
      { x0: loop.cx - hw, y0: loop.cy - hh, ux: 1, uy: 0, len: 2 * hw },
      { x0: loop.cx + hw, y0: loop.cy - hh, ux: 0, uy: 1, len: 2 * hh },
      { x0: loop.cx + hw, y0: loop.cy + hh, ux: -1, uy: 0, len: 2 * hw },
      { x0: loop.cx - hw, y0: loop.cy + hh, ux: 0, uy: -1, len: 2 * hh }
    ];
    var ds = P / n;
    for (i = 0; i < n; i++) {
      var s = (i + 0.5) * ds;
      // 每个样本独立沿周长定位所在边（累计量不可跨样本复用）
      var acc = 0, e = edges[3], k;
      for (k = 0; k < 4; k++) {
        if (s < acc + edges[k].len) { e = edges[k]; break; }
        acc += edges[k].len;
      }
      var u = s - acc;
      px = e.x0 + e.ux * u;
      py = e.y0 + e.uy * u;
      var B2 = magneticFieldAt(px, py, wires, soft2);
      integral += (B2.x * e.ux + B2.y * e.uy) * ds;
    }
  }
  for (i = 0; i < wires.length; i++) {
    if (pointInLoop(wires[i].x, wires[i].y, loop)) encl += wires[i].I;
  }
  return { integral: integral, iEncl: encl, mu0I: MU0 * encl };
}

/* Node 环境：导出纯物理函数供数值自测，随后结束（不执行浏览器部分） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MU0: MU0,
    electricFieldAt: electricFieldAt,
    potentialAt: potentialAt,
    magneticFieldAt: magneticFieldAt,
    dipoleFieldAt: dipoleFieldAt,
    traceFieldLine: traceFieldLine,
    pointInLoop: pointInLoop,
    ampereIntegral: ampereIntegral
  };
  return;
}

/* ============================================================
 * 二、浏览器应用部分
 * ============================================================ */

/* ---------- DOM ---------- */
var canvas = document.getElementById('cv');
var ctx = canvas.getContext('2d');
var canvasWrap = canvas.parentElement;
var readoutEl = document.getElementById('readout');
var formulaEl = document.getElementById('formula');
var hintEl = document.getElementById('hint');
var pauseBtn = document.getElementById('pauseBtn');
var resetBtn = document.getElementById('resetBtn');

/* ---------- 常量与工具 ---------- */
var DENSITY_COLS = [12, 18, 24]; // 疏 / 中 / 密（宽向箭头数，≤24）
var COL_PURPLE = '#7c5cff', COL_CYAN = '#22d3ee', COL_PINK = '#ff5ca8', COL_ORANGE = '#ffb347';
var COL_RED = '#f43f5e', COL_BLUE = '#3b82f6';
var MAG_LEN = 116, MAG_WID = 34, MAG_POLE = 46, MAG_STR = 20000; // 磁铁几何与极强

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function fmt(v, d) {
  if (Math.abs(v) < 0.0005) v = 0;
  var s = v.toFixed(d === undefined ? 3 : d);
  return (v > 0 ? '+' : '') + s;
}

/* 场强颜色：蓝（弱）→ 紫 → 粉（强），预生成 33 档字符串 */
var FIELD_COLORS = (function () {
  var stops = [[79, 124, 255], [124, 92, 255], [255, 92, 168]];
  var arr = [];
  for (var i = 0; i <= 32; i++) {
    var t = i / 32;
    var a = t < 0.5 ? stops[0] : stops[1];
    var b = t < 0.5 ? stops[1] : stops[2];
    var u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    arr.push('rgb(' +
      Math.round(a[0] + (b[0] - a[0]) * u) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * u) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * u) + ')');
  }
  return arr;
})();
function fieldColor(t) {
  return FIELD_COLORS[clamp(Math.round(t * 32), 0, 32)];
}
/* 对数归一化（避免电荷附近奇点导致整张图发蓝） */
function logNorm(m, max) {
  return Math.log(1 + 8 * m / max) / Math.log(9);
}

/* ---------- 全局状态 ---------- */
var S = {
  tab: 'charge',
  paused: false,
  density: 1,
  W: 0, H: 0,
  ready: false,
  pointer: { x: -99, y: -99, inside: false },
  charge: {
    items: [], sel: -1, mode: 'select',
    probeSign: 1, probe: null, trail: [],
    showPot: true, grid: null, contours: null, dirty: true
  },
  current: {
    wires: [], needles: [], sel: null, mode: 'select',
    grid: null, dirty: true
  },
  magnet: {
    items: [], sel: -1, filings: [], lines: null, dirty: true
  },
  amp: {
    wires: [], sel: -1, mode: 'select', mag: 1,
    loop: { shape: 'circle', cx: 0, cy: 0, r: 110, hw: 130, hh: 90, size: 110 },
    grid: null, result: null, dirty: true
  }
};

/* ---------- 场景初始化 / 重置 ---------- */
function initCharge() {
  var t = S.charge;
  t.items = [
    { x: S.W * 0.32, y: S.H * 0.5, q: 1 },
    { x: S.W * 0.68, y: S.H * 0.5, q: -1 }
  ];
  t.sel = -1;
  t.probe = { x: S.W * 0.5, y: S.H * 0.18, vx: 0, vy: 0 };
  t.trail = [];
  t.dirty = true;
}
function initCurrent() {
  var t = S.current;
  t.wires = [{ x: S.W * 0.5, y: S.H * 0.5, I: 1 }];
  t.needles = [
    { x: S.W * 0.5 + 105, y: S.H * 0.5, ang: 0 },
    { x: S.W * 0.5 - 105, y: S.H * 0.5, ang: 0 },
    { x: S.W * 0.5, y: S.H * 0.5 + 105, ang: 0 }
  ];
  t.sel = null;
  t.dirty = true;
}
function initMagnet() {
  var t = S.magnet;
  /* 默认两磁铁 N 极均朝右：m1 右端 N 正对 m2 左端 S —— 异极相对 */
  t.items = [
    { cx: S.W * 0.29, cy: S.H * 0.52, ang: 0 },
    { cx: S.W * 0.71, cy: S.H * 0.52, ang: 0 }
  ];
  t.sel = -1;
  t.filings = makeFilings(120);
  t.lines = null;
  t.dirty = true;
}
function initAmp() {
  var t = S.amp;
  t.loop.shape = 'circle';
  t.loop.cx = S.W * 0.56; t.loop.cy = S.H * 0.52;
  t.loop.r = 110; t.loop.size = 110;
  t.loop.hw = 130; t.loop.hh = 90;
  t.wires = [{ x: t.loop.cx, y: t.loop.cy, I: 1 }];
  t.sel = -1;
  t.result = null;
  t.dirty = true;
  // 同步环路形状 / 尺寸控件状态
  document.querySelectorAll('[data-group="amShape"] .seg-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-value') === 'circle');
  });
  document.getElementById('amSize').value = 110;
  document.getElementById('amSizeVal').textContent = '110';
}
/* 生成铁屑位置（以 0~1 比例坐标存储，缩放窗口不失布） */
function makeFilings(n) {
  var arr = [];
  var cols = 15, rows = 8;
  for (var k = 0; k < n; k++) {
    var c = k % cols, r = Math.floor(k / cols);
    arr.push({
      fx: (c + 0.5 + (Math.random() - 0.5) * 0.8) / cols,
      fy: (r + 0.5 + (Math.random() - 0.5) * 0.85) / rows
    });
  }
  return arr;
}
function resetCurrentTab() {
  if (S.tab === 'charge') initCharge();
  else if (S.tab === 'current') initCurrent();
  else if (S.tab === 'magnet') initMagnet();
  else initAmp();
}

/* ---------- 缓存构建 ---------- */
function buildGrid(W, H, density, fieldFn) {
  var cols = DENSITY_COLS[density];
  var sx = W / cols, sy = sx;
  var rows = Math.max(1, Math.round(H / sy));
  sy = H / rows;
  var pts = [], max = 1e-9;
  for (var j = 0; j < rows; j++) {
    for (var i = 0; i < cols; i++) {
      var x = (i + 0.5) * sx, y = (j + 0.5) * sy;
      var v = fieldFn(x, y), m = Math.hypot(v.x, v.y);
      pts.push({ x: x, y: y, fx: v.x, fy: v.y, m: m });
      if (m > max) max = m;
    }
  }
  return { pts: pts, max: max, sx: sx, sy: sy };
}

/* 等势线（marching squares） */
var MC_TABLE = [
  null, [0, 3], [0, 1], [1, 3], [1, 2],
  [[0, 3], [1, 2]], [0, 2], [2, 3],
  [2, 3], [0, 2], [[0, 1], [2, 3]], [1, 2],
  [1, 3], [0, 1], [0, 3], null
];
function buildContours(W, H, charges) {
  var step = 9, soft = 144;
  var cols = Math.floor(W / step), rows = Math.floor(H / step);
  var vals = new Float32Array((cols + 1) * (rows + 1));
  var scale = 0.02;
  for (var j = 0; j <= rows; j++) {
    for (var i = 0; i <= cols; i++) {
      var x = i * step, y = j * step;
      var p = potentialAt(x, y, charges, soft);
      vals[j * (cols + 1) + i] = p;
      var near = false;
      for (var c = 0; c < charges.length; c++) {
        if (dist(x, y, charges[c].x, charges[c].y) < 22) { near = true; break; }
      }
      if (!near && Math.abs(p) > scale) scale = Math.abs(p);
    }
  }
  var fracs = [-0.9, -0.6, -0.32, -0.15, 0.15, 0.32, 0.6, 0.9];
  var groups = [];
  for (var li = 0; li < fracs.length; li++) {
    var L = fracs[li] * scale;
    var segs = [];
    for (var cy = 0; cy < rows; cy++) {
      for (var cx = 0; cx < cols; cx++) {
        var b00 = vals[cy * (cols + 1) + cx];
        var b10 = vals[cy * (cols + 1) + cx + 1];
        var b11 = vals[(cy + 1) * (cols + 1) + cx + 1];
        var b01 = vals[(cy + 1) * (cols + 1) + cx];
        var idx = (b00 > L ? 1 : 0) | (b10 > L ? 2 : 0) | (b11 > L ? 4 : 0) | (b01 > L ? 8 : 0);
        var spec = MC_TABLE[idx];
        if (!spec) continue;
        var x0 = cx * step, y0 = cy * step;
        var ep = [
          [x0 + step * interp(b00, b10, L), y0],                              // 0 上
          [x0 + step, y0 + step * interp(b10, b11, L)],                      // 1 右
          [x0 + step * interp(b01, b11, L), y0 + step],                      // 2 下
          [x0, y0 + step * interp(b00, b01, L)]                              // 3 左
        ];
        var pairs = spec[0] instanceof Array ? spec : [spec];
        for (var pi = 0; pi < pairs.length; pi++) {
          var a = ep[pairs[pi][0]], b = ep[pairs[pi][1]];
          segs.push(a[0], a[1], b[0], b[1]);
        }
      }
    }
    groups.push({ positive: L > 0, segs: segs });
  }
  return groups;
}
function interp(a, b, L) {
  if (Math.abs(b - a) < 1e-12) return 0.5;
  return clamp((L - a) / (b - a), 0, 1);
}

/* 磁铁磁感线（在每个 N 极周围播种顺追，每个 S 极周围逆追） */
function buildMagnetLines(W, H, mags) {
  var kernel = mags.map(function (m) {
    return { cx: m.cx, cy: m.cy, ang: m.ang, half: MAG_POLE, strength: MAG_STR };
  });
  var poles = [];
  mags.forEach(function (m, mi) {
    var px = MAG_POLE * Math.cos(m.ang), py = MAG_POLE * Math.sin(m.ang);
    poles.push({ x: m.cx + px, y: m.cy + py, kind: 'N', mag: mi });
    poles.push({ x: m.cx - px, y: m.cy - py, kind: 'S', mag: mi });
  });
  function field(x, y) { return dipoleFieldAt(x, y, kernel, 100); }
  function insideBody(x, y) {
    for (var i = 0; i < mags.length; i++) {
      var dx = x - mags[i].cx, dy = y - mags[i].cy, a = -mags[i].ang;
      var lx = dx * Math.cos(a) - dy * Math.sin(a);
      var ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) < MAG_LEN / 2 && Math.abs(ly) < MAG_WID / 2 + 2) return true;
    }
    return false;
  }
  var bounds = { l: -60, t: -60, r: W + 60, b: H + 60 };
  var lines = [];
  var NSEED = 16;
  for (var pi = 0; pi < poles.length; pi++) {
    var pl = poles[pi];
    var forward = pl.kind === 'N';
    for (var s = 0; s < NSEED; s++) {
      var th = (s / NSEED) * 2 * Math.PI;
      var sx = pl.x + 20 * Math.cos(th), sy = pl.y + 20 * Math.sin(th);
      if (insideBody(sx, sy)) continue;
      var ln = traceFieldLine(sx, sy, forward ? 1 : -1, field, poles,
        forward ? 'S' : 'N', bounds);
      if (ln.pts.length > 3) lines.push(ln);
    }
  }
  return lines;
}

/* ---------- 通用绘制 ---------- */
function drawGridArrows(grid) {
  var cell = Math.min(grid.sx, grid.sy);
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  for (var i = 0; i < grid.pts.length; i++) {
    var p = grid.pts[i];
    if (p.m < 1e-8) continue;
    var t = logNorm(p.m, grid.max);
    var ux = p.fx / p.m, uy = p.fy / p.m;
    var L = cell * (0.26 + 0.5 * t);
    var x1 = p.x - ux * L * 0.5, y1 = p.y - uy * L * 0.5;
    var x2 = p.x + ux * L * 0.5, y2 = p.y + uy * L * 0.5;
    ctx.strokeStyle = fieldColor(t);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    // 箭头两翼
    var ah = 4.2 + t * 2.2, ang = Math.atan2(uy, ux);
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ah * Math.cos(ang - 0.45), y2 - ah * Math.sin(ang - 0.45));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ah * Math.cos(ang + 0.45), y2 - ah * Math.sin(ang + 0.45));
    ctx.stroke();
  }
}

/* ---------- 标签①：点电荷电场 ---------- */
function stepChargePhysics() {
  var t = S.charge, p = t.probe;
  if (!p || drag) return;
  var GAIN = 9000, MAXA = 14, DAMP = 0.94, MAXV = 9;
  for (var s = 0; s < 2; s++) {
    var E = electricFieldAt(p.x, p.y, t.items, 144);
    var ax = E.x * t.probeSign * GAIN;
    var ay = E.y * t.probeSign * GAIN;
    var am = Math.hypot(ax, ay);
    if (am > MAXA) { ax *= MAXA / am; ay *= MAXA / am; }
    p.vx = (p.vx + ax * 0.5) * DAMP;
    p.vy = (p.vy + ay * 0.5) * DAMP;
    var vm = Math.hypot(p.vx, p.vy);
    if (vm > MAXV) { p.vx *= MAXV / vm; p.vy *= MAXV / vm; }
    p.x += p.vx * 0.5; p.y += p.vy * 0.5;
    if (p.x < 18) { p.x = 18; p.vx = Math.abs(p.vx) * 0.55; }
    if (p.x > S.W - 18) { p.x = S.W - 18; p.vx = -Math.abs(p.vx) * 0.55; }
    if (p.y < 18) { p.y = 18; p.vy = Math.abs(p.vy) * 0.55; }
    if (p.y > S.H - 18) { p.y = S.H - 18; p.vy = -Math.abs(p.vy) * 0.55; }
  }
  t.trail.push([p.x, p.y]);
  if (t.trail.length > 220) t.trail.shift();
}

function drawCharge() {
  var t = S.charge;
  if (t.dirty) {
    t.grid = buildGrid(S.W, S.H, S.density, function (x, y) {
      return electricFieldAt(x, y, t.items, 90);
    });
    t.contours = buildContours(S.W, S.H, t.items);
    t.dirty = false;
  }
  /* 等势线 */
  if (t.showPot && t.contours) {
    ctx.lineWidth = 1;
    for (var g = 0; g < t.contours.length; g++) {
      var grp = t.contours[g];
      ctx.strokeStyle = grp.positive ? 'rgba(255,92,168,.5)' : 'rgba(34,211,238,.5)';
      var d = grp.segs;
      ctx.beginPath();
      for (var k = 0; k < d.length; k += 4) {
        ctx.moveTo(d[k], d[k + 1]);
        ctx.lineTo(d[k + 2], d[k + 3]);
      }
      ctx.stroke();
    }
  }
  drawGridArrows(t.grid);
  /* 试探电荷拖尾 */
  if (t.probe && t.trail.length > 1) {
    for (var i2 = 1; i2 < t.trail.length; i2++) {
      var a = 0.05 + 0.5 * (i2 / t.trail.length);
      ctx.strokeStyle = 'rgba(255,179,71,' + a.toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t.trail[i2 - 1][0], t.trail[i2 - 1][1]);
      ctx.lineTo(t.trail[i2][0], t.trail[i2][1]);
      ctx.stroke();
    }
  }
  /* 点电荷 */
  for (var ci = 0; ci < t.items.length; ci++) {
    drawChargeBody(t.items[ci], ci === t.sel);
  }
  /* 试探电荷 */
  if (t.probe) drawProbe(t.probe, t.probeSign);
}

function drawChargeBody(c, selected) {
  var col = c.q > 0 ? COL_PINK : COL_CYAN;
  var g = ctx.createRadialGradient(c.x - 5, c.y - 5, 2, c.x, c.y, 18);
  g.addColorStop(0, c.q > 0 ? 'rgba(255,150,200,.95)' : 'rgba(140,240,250,.95)');
  g.addColorStop(1, c.q > 0 ? 'rgba(214,40,110,.9)' : 'rgba(20,140,200,.9)');
  ctx.beginPath();
  ctx.arc(c.x, c.y, 15, 0, 2 * Math.PI);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = col;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '700 17px system-ui, "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(c.q > 0 ? '+' : '−', c.x, c.y + 1);
  if (selected) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, 20, 0, 2 * Math.PI);
    ctx.strokeStyle = COL_ORANGE;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawProbe(p, sign) {
  var col = sign > 0 ? COL_PINK : (sign < 0 ? COL_CYAN : '#cbd5e1');
  ctx.beginPath();
  ctx.arc(p.x, p.y, 8, 0, 2 * Math.PI);
  ctx.fillStyle = col;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
}

/* ---------- 标签②：电流与磁场 ---------- */
function drawCurrent() {
  var t = S.current;
  if (t.dirty) {
    t.grid = buildGrid(S.W, S.H, S.density, function (x, y) {
      return magneticFieldAt(x, y, t.wires, 64);
    });
    t.dirty = false;
  }
  /* 同心圆场线（虚线） */
  for (var wi = 0; wi < t.wires.length; wi++) {
    var w = t.wires[wi];
    var col = w.I > 0 ? 'rgba(255,92,168,' : 'rgba(34,211,238,';
    ctx.setLineDash([5, 7]);
    ctx.lineWidth = 1.2;
    for (var r = 28; r < Math.hypot(S.W, S.H); r += 22) {
      ctx.beginPath();
      ctx.arc(w.x, w.y, r, 0, 2 * Math.PI);
      ctx.strokeStyle = col + '0.32)';
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // 环流方向箭头（4 个）
    for (var k = 0; k < 4; k++) {
      var th = k * Math.PI / 2 + 0.35;
      var ax = w.x + 44 * Math.cos(th), ay = w.y + 44 * Math.sin(th);
      var tang = th + (w.I > 0 ? Math.PI / 2 : -Math.PI / 2);
      ctx.strokeStyle = col + '0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(ax - 6 * Math.cos(tang), ay - 6 * Math.sin(tang));
      ctx.lineTo(ax + 6 * Math.cos(tang), ay + 6 * Math.sin(tang));
      var ah2 = 5;
      ctx.moveTo(ax + 6 * Math.cos(tang), ay + 6 * Math.sin(tang));
      ctx.lineTo(ax + 6 * Math.cos(tang) - ah2 * Math.cos(tang - 0.5),
                 ay + 6 * Math.sin(tang) - ah2 * Math.sin(tang - 0.5));
      ctx.moveTo(ax + 6 * Math.cos(tang), ay + 6 * Math.sin(tang));
      ctx.lineTo(ax + 6 * Math.cos(tang) - ah2 * Math.cos(tang + 0.5),
                 ay + 6 * Math.sin(tang) - ah2 * Math.sin(tang + 0.5));
      ctx.stroke();
    }
  }
  drawGridArrows(t.grid);
  /* 小磁针 */
  for (var ni = 0; ni < t.needles.length; ni++) {
    var nd = t.needles[ni];
    var B = magneticFieldAt(nd.x, nd.y, t.wires, 64);
    var target = Math.atan2(B.y, B.x);
    if (Math.hypot(B.x, B.y) > 1e-6) nd.ang = turnAngle(nd.ang, target, 0.18);
    drawNeedle(nd, t.sel && t.sel.t === 'n' && t.sel.i === ni);
  }
  /* 导线 */
  for (var wi2 = 0; wi2 < t.wires.length; wi2++) {
    drawWire(t.wires[wi2], false,
      t.sel && t.sel.t === 'w' && t.sel.i === wi2);
  }
}

/* 角度插值（处理 ±π 跨越） */
function turnAngle(from, to, rate) {
  var d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return from + d * rate;
}

function drawNeedle(n, selected) {
  ctx.save();
  ctx.translate(n.x, n.y);
  ctx.rotate(n.ang);
  // 北半（红粉）南半（浅白）菱形指针
  ctx.beginPath();
  ctx.moveTo(13, 0); ctx.lineTo(0, -5); ctx.lineTo(-13, 0); ctx.lineTo(0, 5);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(13, 0); ctx.lineTo(0, -5); ctx.lineTo(0, 5);
  ctx.closePath();
  ctx.fillStyle = COL_PINK;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-13, 0); ctx.lineTo(0, -5); ctx.lineTo(0, 5);
  ctx.closePath();
  ctx.fillStyle = '#e2e8f0';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(13, 0); ctx.lineTo(0, -5); ctx.lineTo(-13, 0); ctx.lineTo(0, 5);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 2.4, 0, 2 * Math.PI);
  ctx.fillStyle = COL_ORANGE;
  ctx.fill();
  ctx.restore();
  if (selected) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, 18, 0, 2 * Math.PI);
    ctx.strokeStyle = COL_ORANGE;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawWire(w, showLabel, selected) {
  var col = w.I > 0 ? COL_PINK : COL_CYAN;
  ctx.beginPath();
  ctx.arc(w.x, w.y, 13, 0, 2 * Math.PI);
  ctx.fillStyle = w.I > 0 ? 'rgba(255,92,168,.22)' : 'rgba(34,211,238,.22)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = col;
  ctx.stroke();
  if (w.I > 0) {
    // ⊙ 向外：中心点
    ctx.beginPath();
    ctx.arc(w.x, w.y, 3.2, 0, 2 * Math.PI);
    ctx.fillStyle = col;
    ctx.fill();
  } else {
    // ⊗ 向里：叉
    ctx.beginPath();
    ctx.moveTo(w.x - 5.5, w.y - 5.5); ctx.lineTo(w.x + 5.5, w.y + 5.5);
    ctx.moveTo(w.x + 5.5, w.y - 5.5); ctx.lineTo(w.x - 5.5, w.y + 5.5);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (showLabel) {
    ctx.font = '600 11px system-ui, "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#cfd4ff';
    ctx.fillText('I=' + fmt(w.I, 1), w.x, w.y + 30);
  }
  if (selected) {
    ctx.beginPath();
    ctx.arc(w.x, w.y, 19, 0, 2 * Math.PI);
    ctx.strokeStyle = COL_ORANGE;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/* ---------- 标签③：磁铁相互作用 ---------- */
function drawMagnet() {
  var t = S.magnet;
  if (t.dirty) {
    t.lines = buildMagnetLines(S.W, S.H, t.items);
    t.dirty = false;
  }
  var kernel = t.items.map(function (m) {
    return { cx: m.cx, cy: m.cy, ang: m.ang, half: MAG_POLE, strength: MAG_STR };
  });
  /* 磁感线：宽底光 + 亮线 */
  for (var i = 0; i < t.lines.length; i++) {
    strokeLinePts(t.lines[i].pts, 'rgba(103,232,249,.13)', 4.5);
  }
  for (var i3 = 0; i3 < t.lines.length; i3++) {
    strokeLinePts(t.lines[i3].pts, 'rgba(165,243,252,.8)', 1.5);
  }
  /* 铁屑 */
  for (var f = 0; f < t.filings.length; f++) {
    var fd = t.filings[f];
    var fx = fd.fx * S.W, fy = fd.fy * S.H;
    if (insideAnyMagnet(fx, fy, t.items)) continue;
    var B = dipoleFieldAt(fx, fy, kernel, 225);
    var bm = Math.hypot(B.x, B.y);
    if (bm < 1e-7) continue;
    var ang = Math.atan2(B.y, B.x);
    var alpha = 0.18 + 0.6 * clamp(bm / 3.2, 0, 1);
    ctx.strokeStyle = 'rgba(214,221,255,' + alpha.toFixed(3) + ')';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(fx - 5.5 * Math.cos(ang), fy - 5.5 * Math.sin(ang));
    ctx.lineTo(fx + 5.5 * Math.cos(ang), fy + 5.5 * Math.sin(ang));
    ctx.stroke();
  }
  /* 磁铁本体 */
  for (var mi = 0; mi < t.items.length; mi++) {
    drawMagnetBody(t.items[mi], mi === t.sel);
  }
}
function strokeLinePts(pts, style, w) {
  ctx.strokeStyle = style;
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}
function insideAnyMagnet(x, y, mags) {
  for (var i = 0; i < mags.length; i++) {
    var dx = x - mags[i].cx, dy = y - mags[i].cy, a = -mags[i].ang;
    var lx = dx * Math.cos(a) - dy * Math.sin(a);
    var ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) < MAG_LEN / 2 && Math.abs(ly) < MAG_WID / 2) return true;
  }
  return false;
}
function drawMagnetBody(m, selected) {
  ctx.save();
  ctx.translate(m.cx, m.cy);
  ctx.rotate(m.ang);
  var L = MAG_LEN, Wd = MAG_WID, r = 7;
  // S 半（蓝，左）与 N 半（红，右）
  ctx.fillStyle = COL_BLUE;
  roundedRect(-L / 2, -Wd / 2, L / 2 + 2, Wd, r);
  ctx.fill();
  ctx.fillStyle = COL_RED;
  roundedRect(-2, -Wd / 2, L / 2 + 2, Wd, r);
  ctx.fill();
  // 描边
  ctx.beginPath();
  roundedRectPath(-L / 2, -Wd / 2, L, Wd, r);
  ctx.strokeStyle = selected ? COL_ORANGE : 'rgba(255,255,255,.45)';
  ctx.lineWidth = selected ? 2.4 : 1.4;
  ctx.stroke();
  // 中央分界线
  ctx.beginPath();
  ctx.moveTo(0, -Wd / 2 + 2); ctx.lineTo(0, Wd / 2 - 2);
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // N / S 文字
  ctx.fillStyle = '#fff';
  ctx.font = '700 17px system-ui, "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', L * 0.26, 1);
  ctx.fillText('S', -L * 0.26, 1);
  ctx.restore();
  // 旋转手柄（选中时显示于 N 极端）
  if (selected) {
    var hx = m.cx + (MAG_LEN / 2 + 20) * Math.cos(m.ang);
    var hy = m.cy + (MAG_LEN / 2 + 20) * Math.sin(m.ang);
    ctx.beginPath();
    ctx.moveTo(m.cx + (MAG_LEN / 2) * Math.cos(m.ang), m.cy + (MAG_LEN / 2) * Math.sin(m.ang));
    ctx.lineTo(hx, hy);
    ctx.strokeStyle = 'rgba(34,211,238,.7)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx, hy, 8, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(34,211,238,.3)';
    ctx.fill();
    ctx.strokeStyle = COL_CYAN;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  roundedRectPath(x, y, w, h, r);
}
function roundedRectPath(x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- 标签④：安培环路定理 ---------- */
function drawAmpere() {
  var t = S.amp;
  if (t.dirty) {
    t.grid = buildGrid(S.W, S.H, S.density, function (x, y) {
      return magneticFieldAt(x, y, t.wires, 16);
    });
    t.dirty = false;
  }
  drawGridArrows(t.grid);
  var L = t.loop;
  t.result = ampereIntegral(t.wires, L, 96, 4);

  /* 环路填充与虚线 */
  ctx.beginPath();
  if (L.shape === 'circle') ctx.arc(L.cx, L.cy, L.r, 0, 2 * Math.PI);
  else ctx.rect(L.cx - L.hw, L.cy - L.hh, 2 * L.hw, 2 * L.hh);
  ctx.fillStyle = 'rgba(34,211,238,.05)';
  ctx.fill();
  ctx.strokeStyle = COL_CYAN;
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 7]);
  ctx.stroke();
  ctx.setLineDash([]);

  /* 8 个 dl 切向箭头（逆时针） */
  for (var k = 0; k < 8; k++) {
    var pos = loopPointAt(L, k / 8 + 0.02);
    var tg = loopTangentAt(L, k / 8 + 0.02);
    ctx.strokeStyle = 'rgba(255,179,71,.95)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(pos.x - 7 * tg.x, pos.y - 7 * tg.y);
    ctx.lineTo(pos.x + 7 * tg.x, pos.y + 7 * tg.y);
    var aa = Math.atan2(tg.y, tg.x);
    ctx.moveTo(pos.x + 7 * tg.x, pos.y + 7 * tg.y);
    ctx.lineTo(pos.x + 7 * tg.x - 5.5 * Math.cos(aa - 0.45),
               pos.y + 7 * tg.y - 5.5 * Math.sin(aa - 0.45));
    ctx.moveTo(pos.x + 7 * tg.x, pos.y + 7 * tg.y);
    ctx.lineTo(pos.x + 7 * tg.x - 5.5 * Math.cos(aa + 0.45),
               pos.y + 7 * tg.y - 5.5 * Math.sin(aa + 0.45));
    ctx.stroke();
  }
  ctx.font = '600 11px system-ui, "Microsoft YaHei", sans-serif';
  ctx.fillStyle = COL_ORANGE;
  var lp0 = loopPointAt(L, 0.02);
  ctx.fillText('dl', lp0.x + 12, lp0.y - 8);

  /* 尺寸手柄 */
  var hx2, hy2;
  if (L.shape === 'circle') { hx2 = L.cx + L.r; hy2 = L.cy; }
  else { hx2 = L.cx + L.hw; hy2 = L.cy + L.hh; }
  ctx.beginPath();
  ctx.arc(hx2, hy2, 8, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(255,179,71,.35)';
  ctx.fill();
  ctx.strokeStyle = COL_ORANGE;
  ctx.lineWidth = 2;
  ctx.stroke();

  /* 导线（被包围者加橙色光环） */
  for (var wi = 0; wi < t.wires.length; wi++) {
    var w2 = t.wires[wi];
    var inside = pointInLoop(w2.x, w2.y, L);
    if (inside) {
      ctx.beginPath();
      ctx.arc(w2.x, w2.y, 21, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(255,179,71,.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    drawWire(w2, true, wi === t.sel);
  }
}
function loopPointAt(L, u) {
  if (L.shape === 'circle') {
    var th = u * 2 * Math.PI;
    return { x: L.cx + L.r * Math.cos(th), y: L.cy + L.r * Math.sin(th) };
  }
  var hw = L.hw, hh = L.hh, P = 4 * (hw + hh), s = u * P;
  if (s < 2 * hw) return { x: L.cx - hw + s, y: L.cy - hh };
  s -= 2 * hw;
  if (s < 2 * hh) return { x: L.cx + hw, y: L.cy - hh + s };
  s -= 2 * hh;
  if (s < 2 * hw) return { x: L.cx + hw - s, y: L.cy + hh };
  s -= 2 * hw;
  return { x: L.cx - hw, y: L.cy + hh - s };
}
function loopTangentAt(L, u) {
  if (L.shape === 'circle') {
    var th = u * 2 * Math.PI;
    return { x: -Math.sin(th), y: Math.cos(th) };
  }
  var hw = L.hw, hh = L.hh, P = 4 * (hw + hh), s = u * P;
  if (s < 2 * hw) return { x: 1, y: 0 };
  if (s < 2 * hw + 2 * hh) return { x: 0, y: 1 };
  if (s < 4 * hw + 2 * hh) return { x: -1, y: 0 };
  return { x: 0, y: -1 };
}
function nearLoopEdge(x, y, L) {
  if (L.shape === 'circle') {
    return Math.abs(dist(x, y, L.cx, L.cy) - L.r) < 15;
  }
  var dx = Math.abs(x - L.cx), dy = Math.abs(y - L.cy);
  var onX = dx > L.hw - 15 && dx < L.hw + 15 && dy < L.hh;
  var onY = dy > L.hh - 15 && dy < L.hh + 15 && dx < L.hw;
  return onX || onY;
}

/* ---------- 读数 ---------- */
function updateReadout() {
  var txt = '';
  if (S.tab === 'charge') {
    var t = S.charge;
    txt += '<span class="rd-title">点电荷电场</span>';
    txt += '电荷数：' + t.items.length + ' / 8\n';
    if (S.pointer.inside) {
      var E = electricFieldAt(S.pointer.x, S.pointer.y, t.items, 90);
      var ph = potentialAt(S.pointer.x, S.pointer.y, t.items, 144);
      txt += '指针处：Ex=' + fmt(E.x, 4) + '，Ey=' + fmt(E.y, 4) +
             '，|E|=' + fmt(Math.hypot(E.x, E.y), 4) + '，φ=' + fmt(ph, 3) + '\n';
    }
    if (t.sel >= 0) txt += '选中：q = ' + (t.items[t.sel].q > 0 ? '+1' : '−1') + '\n';
    if (t.probe) {
      txt += '试探电荷 q=' + (t.probeSign > 0 ? '+1' : t.probeSign < 0 ? '−1' : '0（中性，不受力）') +
             '，|v|=' + fmt(Math.hypot(t.probe.vx, t.probe.vy), 2);
    }
  } else if (S.tab === 'current') {
    var c = S.current;
    txt += '<span class="rd-title">电流与磁场</span>';
    txt += '导线数：' + c.wires.length + ' / 8，磁针数：' + c.needles.length + '\n';
    if (S.pointer.inside) {
      var B = magneticFieldAt(S.pointer.x, S.pointer.y, c.wires, 64);
      txt += '指针处：Bx=' + fmt(B.x, 4) + '，By=' + fmt(B.y, 4) +
             '，|B|=' + fmt(Math.hypot(B.x, B.y), 4) + '\n';
    }
    if (c.sel) {
      txt += c.sel.t === 'w'
        ? '选中：导线，I=' + fmt(c.wires[c.sel.i].I, 0) + '（点按可换向）'
        : '选中：小磁针';
    }
  } else if (S.tab === 'magnet') {
    var mg = S.magnet;
    txt += '<span class="rd-title">磁铁相互作用</span>';
    for (var i = 0; i < mg.items.length; i++) {
      var deg = (mg.items[i].ang * 180 / Math.PI) % 360;
      if (deg < 0) deg += 360;
      txt += '磁铁' + (i + 1) + ' 朝向：' + deg.toFixed(0) + '°\n';
    }
    if (mg.items.length === 2) txt += facingDescription(mg.items);
  } else {
    var a = S.amp, r = a.result;
    txt += '<span class="rd-title">安培环路定理验证</span>';
    if (r) {
      var denom = Math.abs(r.mu0I) > 1e-6 ? Math.abs(r.mu0I) : 1;
      var err = Math.abs(r.integral - r.mu0I) / denom * 100;
      var list = a.wires.filter(function (w) { return pointInLoop(w.x, w.y, a.loop); })
        .map(function (w) { return fmt(w.I, 1); }).join('，');
      txt += '∮ B·dl = ' + fmt(r.integral, 3) + '\n';
      txt += '<span class="rd-eq">μ₀ I_encl = 2π × (' +
             (list || '0') + ') = ' + fmt(r.mu0I, 3) + '</span>\n';
      txt += 'I_encl = ' + fmt(r.iEncl, 2) + '（环路包围 ' +
             a.wires.filter(function (w) { return pointInLoop(w.x, w.y, a.loop); }).length + ' 根导线）\n';
      txt += '相对误差：' + err.toFixed(2) + ' %\n';
      txt += err < 5 ? '<span class="rd-ok">结论：两边数值一致，符合安培环路定理</span>'
                     : '<span class="rd-bad">结论：偏差较大（导线可能与环路相交）</span>';
    }
  }
  readoutEl.innerHTML = txt;
}
/* 判断两磁铁相向端是异极还是同极 */
function facingDescription(mags) {
  var m1 = mags[0], m2 = mags[1];
  var base = Math.atan2(m2.cy - m1.cy, m2.cx - m1.cx);
  var n1 = Math.cos(m1.ang - base) > 0 ? 'N' : 'S';      // m1 朝向对方的极
  var n2 = Math.cos(m2.ang - (base + Math.PI)) > 0 ? 'N' : 'S'; // m2 朝向对方的极
  if (n1 === n2) return '当前：同极相对（' + n1 + '–' + n2 + '）——磁感线应相互排斥、不跨接';
  return '当前：异极相对（' + n1 + '–' + n2 + '）——磁感线应从 N 极跨接到 S 极';
}

/* ---------- 交互 ---------- */
var drag = null; // {kind, ...}

function eventPos(e) {
  var rc = canvas.getBoundingClientRect();
  return { x: e.clientX - rc.left, y: e.clientY - rc.top };
}
function hitCharge(x, y) {
  var items = S.charge.items;
  for (var i = items.length - 1; i >= 0; i--) {
    if (dist(x, y, items[i].x, items[i].y) < 18) return i;
  }
  return -1;
}
function hitWire(x, y, wires) {
  for (var i = wires.length - 1; i >= 0; i--) {
    if (dist(x, y, wires[i].x, wires[i].y) < 17) return i;
  }
  return -1;
}
function hitNeedle(x, y) {
  var ns = S.current.needles;
  for (var i = ns.length - 1; i >= 0; i--) {
    if (dist(x, y, ns[i].x, ns[i].y) < 16) return i;
  }
  return -1;
}
function magnetBodyHit(x, y, m) {
  var dx = x - m.cx, dy = y - m.cy, a = -m.ang;
  var lx = dx * Math.cos(a) - dy * Math.sin(a);
  var ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) < MAG_LEN / 2 + 7 && Math.abs(ly) < MAG_WID / 2 + 7;
}

canvas.addEventListener('pointerdown', function (e) {
  if (e.button === 2) return; // 右键交给 contextmenu
  canvas.setPointerCapture(e.pointerId);
  var p = eventPos(e);
  S.pointer.x = p.x; S.pointer.y = p.y; S.pointer.inside = true;
  var down = { x: p.x, y: p.y, moved: false };

  if (S.tab === 'charge') {
    var t = S.charge;
    if (t.mode !== 'select') {
      if (t.items.length < 8) {
        var nc = { x: p.x, y: p.y, q: t.mode === 'addp' ? 1 : -1 };
        t.items.push(nc); t.sel = t.items.length - 1; t.dirty = true;
      }
      drag = { kind: 'none' };
      return;
    }
    if (t.probe && dist(p.x, p.y, t.probe.x, t.probe.y) < 13) {
      t.probe.vx = 0; t.probe.vy = 0;
      drag = { kind: 'probe', down: down };
    } else {
      var hi = hitCharge(p.x, p.y);
      t.sel = hi;
      if (hi >= 0) drag = { kind: 'charge', i: hi, down: down };
      else drag = { kind: 'none', down: down };
    }
  } else if (S.tab === 'current') {
    var c = S.current;
    if (c.mode !== 'select') {
      if (c.wires.length < 8) {
        c.wires.push({ x: p.x, y: p.y, I: c.mode === 'addOut' ? 1 : -1 });
        c.dirty = true;
      }
      drag = { kind: 'none' };
      return;
    }
    var hw = hitWire(p.x, p.y, c.wires);
    var hn = -1;
    if (hw < 0) hn = hitNeedle(p.x, p.y);
    if (hw >= 0) {
      c.sel = { t: 'w', i: hw };
      drag = { kind: 'wire', i: hw, down: down };
    } else if (hn >= 0) {
      c.sel = { t: 'n', i: hn };
      drag = { kind: 'needle', i: hn, down: down };
    } else {
      c.sel = null;
      drag = { kind: 'none', down: down };
    }
  } else if (S.tab === 'magnet') {
    var mg = S.magnet;
    // 旋转手柄优先
    if (mg.sel >= 0) {
      var m0 = mg.items[mg.sel];
      var hx = m0.cx + (MAG_LEN / 2 + 20) * Math.cos(m0.ang);
      var hy = m0.cy + (MAG_LEN / 2 + 20) * Math.sin(m0.ang);
      if (dist(p.x, p.y, hx, hy) < 13) {
        drag = { kind: 'rotate', i: mg.sel, down: down };
        return;
      }
    }
    var found = -1;
    for (var mi = mg.items.length - 1; mi >= 0; mi--) {
      if (magnetBodyHit(p.x, p.y, mg.items[mi])) { found = mi; break; }
    }
    mg.sel = found;
    drag = found >= 0
      ? { kind: 'magnet', i: found, dx: p.x - mg.items[found].cx, dy: p.y - mg.items[found].cy, down: down }
      : { kind: 'none', down: down };
  } else {
    var a = S.amp, L = a.loop;
    if (a.mode !== 'select') {
      if (a.wires.length < 6) {
        a.wires.push({ x: p.x, y: p.y, I: (a.mode === 'addOut' ? 1 : -1) * a.mag });
        a.dirty = true;
      }
      drag = { kind: 'none' };
      return;
    }
    // 尺寸手柄
    var hx2 = L.shape === 'circle' ? L.cx + L.r : L.cx + L.hw;
    var hy2 = L.shape === 'circle' ? L.cy : L.cy + L.hh;
    if (dist(p.x, p.y, hx2, hy2) < 13) {
      drag = { kind: 'size', down: down };
    } else if (nearLoopEdge(p.x, p.y, L)) {
      drag = { kind: 'loop', dx: p.x - L.cx, dy: p.y - L.cy, down: down };
    } else {
      var aw = hitWire(p.x, p.y, a.wires);
      a.sel = aw;
      drag = aw >= 0 ? { kind: 'awire', i: aw, down: down } : { kind: 'none', down: down };
    }
  }
});

canvas.addEventListener('pointermove', function (e) {
  var p = eventPos(e);
  S.pointer.x = p.x; S.pointer.y = p.y; S.pointer.inside = true;
  if (!drag || drag.kind === 'none') return;
  if (drag.down && dist(p.x, p.y, drag.down.x, drag.down.y) > 4) drag.down.moved = true;

  if (S.tab === 'charge') {
    var t = S.charge;
    if (drag.kind === 'charge') {
      var c = t.items[drag.i];
      c.x = clamp(p.x, 18, S.W - 18); c.y = clamp(p.y, 18, S.H - 18);
      t.dirty = true;
    } else if (drag.kind === 'probe' && t.probe) {
      t.probe.x = clamp(p.x, 12, S.W - 12); t.probe.y = clamp(p.y, 12, S.H - 12);
      t.probe.vx = 0; t.probe.vy = 0;
    }
  } else if (S.tab === 'current') {
    var cu = S.current;
    if (drag.kind === 'wire') {
      cu.wires[drag.i].x = clamp(p.x, 16, S.W - 16);
      cu.wires[drag.i].y = clamp(p.y, 16, S.H - 16);
      cu.dirty = true;
    } else if (drag.kind === 'needle') {
      cu.needles[drag.i].x = clamp(p.x, 14, S.W - 14);
      cu.needles[drag.i].y = clamp(p.y, 14, S.H - 14);
    }
  } else if (S.tab === 'magnet') {
    var mg = S.magnet;
    if (drag.kind === 'magnet') {
      var m = mg.items[drag.i];
      m.cx = clamp(p.x - drag.dx, MAG_LEN / 2, S.W - MAG_LEN / 2);
      m.cy = clamp(p.y - drag.dy, MAG_WID / 2, S.H - MAG_WID / 2);
      mg.dirty = true;
    } else if (drag.kind === 'rotate') {
      mg.items[drag.i].ang = Math.atan2(
        p.y - mg.items[drag.i].cy, p.x - mg.items[drag.i].cx);
      mg.dirty = true;
    }
  } else {
    var a = S.amp, L = a.loop;
    if (drag.kind === 'loop') {
      L.cx = clamp(p.x - drag.dx, 60, S.W - 60);
      L.cy = clamp(p.y - drag.dy, 60, S.H - 60);
    } else if (drag.kind === 'size') {
      if (L.shape === 'circle') {
        L.r = clamp(dist(p.x, p.y, L.cx, L.cy), 50, 200);
        L.size = L.r;
      } else {
        var v = (Math.abs(p.x - L.cx) / 1.18 + Math.abs(p.y - L.cy) / 0.82) / 2;
        L.size = clamp(v, 50, 200);
        L.hw = L.size * 1.18; L.hh = L.size * 0.82;
      }
      document.getElementById('amSize').value = Math.round(L.size);
      document.getElementById('amSizeVal').textContent = Math.round(L.size);
    } else if (drag.kind === 'awire') {
      a.wires[drag.i].x = clamp(p.x, 16, S.W - 16);
      a.wires[drag.i].y = clamp(p.y, 16, S.H - 16);
      a.dirty = true;
    }
  }
});

canvas.addEventListener('pointerup', function () {
  if (!drag) return;
  var moved = drag.down && drag.down.moved;
  // 点按（未拖动）行为：导线切换电流方向
  if (!moved) {
    if (S.tab === 'current' && drag.kind === 'wire') {
      var w = S.current.wires[drag.i];
      w.I = -w.I; S.current.dirty = true;
    } else if (S.tab === 'ampere' && drag.kind === 'awire') {
      var w2 = S.amp.wires[drag.i];
      w2.I = -w2.I; S.amp.dirty = true;
    }
  }
  drag = null;
});

canvas.addEventListener('pointerleave', function () {
  S.pointer.inside = false;
});

/* 双击添加电荷（桌面快捷方式，符号跟随当前工具） */
canvas.addEventListener('dblclick', function (e) {
  if (S.tab !== 'charge') return;
  var t = S.charge, p = eventPos(e);
  if (t.items.length >= 8) return;
  if (hitCharge(p.x, p.y) >= 0) return;
  t.items.push({ x: p.x, y: p.y, q: t.mode === 'addn' ? -1 : 1 });
  t.sel = t.items.length - 1;
  t.dirty = true;
});

/* 右键删除 */
canvas.addEventListener('contextmenu', function (e) {
  e.preventDefault();
  var p = eventPos(e);
  if (S.tab === 'charge') {
    var t = S.charge;
    if (t.probe && dist(p.x, p.y, t.probe.x, t.probe.y) < 13) {
      t.probe = null; t.trail = []; return;
    }
    var i = hitCharge(p.x, p.y);
    if (i >= 0) {
      t.items.splice(i, 1);
      if (t.sel === i) t.sel = -1;
      else if (t.sel > i) t.sel--;
      t.dirty = true;
    }
  } else if (S.tab === 'current') {
    var c = S.current;
    var iw = hitWire(p.x, p.y, c.wires);
    if (iw >= 0) {
      c.wires.splice(iw, 1);
      c.sel = null; c.dirty = true;
      return;
    }
    var in2 = hitNeedle(p.x, p.y);
    if (in2 >= 0) {
      c.needles.splice(in2, 1);
      c.sel = null;
    }
  } else if (S.tab === 'ampere') {
    var a = S.amp;
    var ia = hitWire(p.x, p.y, a.wires);
    if (ia >= 0) {
      a.wires.splice(ia, 1);
      if (a.sel === ia) a.sel = -1;
      else if (a.sel > ia) a.sel--;
      a.dirty = true;
    }
  }
});

/* 键盘：Delete 删除选中，空格暂停 */
window.addEventListener('keydown', function (e) {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    deleteSelected();
  } else if (e.key === ' ' && e.target === document.body) {
    e.preventDefault();
    togglePause();
  }
});
function deleteSelected() {
  if (S.tab === 'charge') {
    var t = S.charge;
    if (t.sel >= 0 && t.sel < t.items.length) {
      t.items.splice(t.sel, 1); t.sel = -1; t.dirty = true;
    }
  } else if (S.tab === 'current') {
    var c = S.current;
    if (c.sel && c.sel.t === 'w') {
      c.wires.splice(c.sel.i, 1); c.sel = null; c.dirty = true;
    } else if (c.sel && c.sel.t === 'n') {
      c.needles.splice(c.sel.i, 1); c.sel = null;
    }
  } else if (S.tab === 'ampere') {
    var a = S.amp;
    if (a.sel >= 0 && a.sel < a.wires.length) {
      a.wires.splice(a.sel, 1); a.sel = -1; a.dirty = true;
    }
  }
}

/* ---------- 工具栏控件 ---------- */
var SEG_GROUPS = {
  chTool: function (v) { S.charge.mode = v; },
  chProbe: function (v) {
    S.charge.probeSign = parseInt(v, 10);
  },
  cuTool: function (v) { S.current.mode = v; },
  amTool: function (v) { S.amp.mode = v; },
  amShape: function (v) {
    S.amp.loop.shape = v;
    if (v === 'rect') {
      S.amp.loop.hw = S.amp.loop.size * 1.18;
      S.amp.loop.hh = S.amp.loop.size * 0.82;
    }
  },
  density: function (v) {
    S.density = parseInt(v, 10);
    S.charge.dirty = S.current.dirty = S.amp.dirty = true;
  }
};
document.querySelectorAll('[data-group]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var g = btn.getAttribute('data-group');
    btn.parentElement.querySelectorAll('.seg-btn').forEach(function (b) {
      b.classList.remove('active');
    });
    btn.classList.add('active');
    if (SEG_GROUPS[g]) SEG_GROUPS[g](btn.getAttribute('data-value'));
  });
});

document.getElementById('chProbeBtn').addEventListener('click', function () {
  var t = S.charge;
  t.probe = { x: S.W * 0.5, y: S.H * 0.2, vx: 0, vy: 0 };
  t.trail = [];
});
var chPotBtn = document.getElementById('chPotBtn');
chPotBtn.addEventListener('click', function () {
  S.charge.showPot = !S.charge.showPot;
  chPotBtn.textContent = '等势线：' + (S.charge.showPot ? '开' : '关');
  chPotBtn.classList.toggle('toggle-on', S.charge.showPot);
  chPotBtn.classList.toggle('toggle-off', !S.charge.showPot);
});
document.getElementById('chDelBtn').addEventListener('click', deleteSelected);

document.getElementById('cuNeedleBtn').addEventListener('click', function () {
  var c = S.current;
  if (c.needles.length >= 12) return;
  var x, y, ok = false, tries = 0;
  while (!ok && tries < 30) {
    x = 50 + Math.random() * (S.W - 100);
    y = 50 + Math.random() * (S.H - 100);
    ok = hitWire(x, y, c.wires) < 0 && hitNeedle(x, y) < 0;
    tries++;
  }
  c.needles.push({ x: x, y: y, ang: 0 });
});
document.getElementById('cuDelBtn').addEventListener('click', deleteSelected);

function rotateSelectedMagnet(delta) {
  var mg = S.magnet;
  if (mg.sel < 0) mg.sel = 0;
  mg.items[mg.sel].ang += delta;
  mg.dirty = true;
}
document.getElementById('mgRotLBtn').addEventListener('click', function () {
  rotateSelectedMagnet(-Math.PI / 12);
});
document.getElementById('mgRotRBtn').addEventListener('click', function () {
  rotateSelectedMagnet(Math.PI / 12);
});
document.getElementById('mgFlipBtn').addEventListener('click', function () {
  rotateSelectedMagnet(Math.PI);
});
document.getElementById('mgReseedBtn').addEventListener('click', function () {
  S.magnet.filings = makeFilings(120);
});

var amMag = document.getElementById('amMag'), amMagVal = document.getElementById('amMagVal');
amMag.addEventListener('input', function () {
  var a = S.amp;
  a.mag = parseFloat(amMag.value);
  amMagVal.textContent = a.mag.toFixed(1);
  if (a.sel >= 0 && a.sel < a.wires.length) {
    var w = a.wires[a.sel];
    w.I = (w.I >= 0 ? 1 : -1) * a.mag;
  }
});
var amSize = document.getElementById('amSize'), amSizeVal = document.getElementById('amSizeVal');
amSize.addEventListener('input', function () {
  var L = S.amp.loop;
  L.size = parseInt(amSize.value, 10);
  amSizeVal.textContent = amSize.value;
  if (L.shape === 'circle') L.r = L.size;
  else { L.hw = L.size * 1.18; L.hh = L.size * 0.82; }
});
document.getElementById('amDelBtn').addEventListener('click', deleteSelected);

function togglePause() {
  S.paused = !S.paused;
  pauseBtn.textContent = S.paused ? '继续' : '暂停';
  pauseBtn.classList.toggle('is-paused', S.paused);
}
pauseBtn.addEventListener('click', togglePause);
resetBtn.addEventListener('click', resetCurrentTab);

/* ---------- 标签切换 ---------- */
var TAB_INFO = {
  charge: {
    formula: 'E = k Σ qᵢ r̂ / r² ，　φ = Σ qᵢ / r　（k = 1，相对单位）',
    hint: '双击空白处添加电荷（或选“添加”工具后点按画布），拖动移动，右键或选中后按 Delete 删除（最多 8 个）；试探电荷满足 F = qE，带阻尼与边界反弹。'
  },
  current: {
    formula: 'B = μ₀ I / (2π r)，方向沿圆周切向（右手螺旋定则）　（相对单位 μ₀ = 2π）',
    hint: '用工具在空白处点按添加导线；点按已有导线在 ⊙ 向外（红）与 ⊗ 向里（蓝）间切换；可拖动，右键删除；小磁针沿 B 方向实时偏转。'
  },
  magnet: {
    formula: '磁偶极子（磁极对）近似：B 由 N、S 两极的 1/r² 场叠加，磁感线自 N 极出发回到 S 极',
    hint: '拖动磁铁移动；选中后拖动 N 极端的青色圆点旋转（也可用上方按钮）；异极相对时场线跨接，同极相对时场线相斥；铁屑沿 B 方向排列。'
  },
  ampere: {
    formula: '∮ B·dl = μ₀ I_encl ，　B = μ₀ I / (2π r)',
    hint: '拖动环路边缘移动整个环路，拖橙色圆点改变尺寸；点按导线切换电流方向，滑块调节 |I|；环路不包围导线时积分应接近 0。'
  }
};
document.querySelectorAll('.tab-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    S.tab = btn.getAttribute('data-tab');
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.classList.toggle('active', b === btn);
    });
    document.querySelectorAll('.tool-page').forEach(function (pg) {
      pg.classList.toggle('active', pg.getAttribute('data-page') === S.tab);
    });
    formulaEl.textContent = TAB_INFO[S.tab].formula;
    hintEl.textContent = TAB_INFO[S.tab].hint;
    S.pointer.inside = false;
    drag = null;
  });
});

/* ---------- 自适应画布（devicePixelRatio） ---------- */
function resize() {
  var w = canvasWrap.clientWidth, h = canvasWrap.clientHeight;
  if (w === 0 || h === 0) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  S.W = w; S.H = h;
  if (!S.ready) {
    S.ready = true;
    initCharge(); initCurrent(); initMagnet(); initAmp();
  } else {
    // 尺寸变化：约束对象在画布内，并令所有缓存失效
    S.charge.items.forEach(function (c) {
      c.x = clamp(c.x, 18, w - 18); c.y = clamp(c.y, 18, h - 18);
    });
    if (S.charge.probe) {
      S.charge.probe.x = clamp(S.charge.probe.x, 12, w - 12);
      S.charge.probe.y = clamp(S.charge.probe.y, 12, h - 12);
    }
    S.current.wires.forEach(function (ww) {
      ww.x = clamp(ww.x, 16, w - 16); ww.y = clamp(ww.y, 16, h - 16);
    });
    S.current.needles.forEach(function (nn) {
      nn.x = clamp(nn.x, 14, w - 14); nn.y = clamp(nn.y, 14, h - 14);
    });
    S.magnet.items.forEach(function (mm) {
      mm.cx = clamp(mm.cx, MAG_LEN / 2, w - MAG_LEN / 2);
      mm.cy = clamp(mm.cy, MAG_WID / 2, h - MAG_WID / 2);
    });
    var L = S.amp.loop;
    L.cx = clamp(L.cx, 70, w - 70); L.cy = clamp(L.cy, 70, h - 70);
    L.r = clamp(L.r, 50, Math.min(200, Math.min(w, h) / 2 - 10));
    S.amp.wires.forEach(function (ww) {
      ww.x = clamp(ww.x, 16, w - 16); ww.y = clamp(ww.y, 16, h - 16);
    });
    S.charge.dirty = S.current.dirty = S.magnet.dirty = S.amp.dirty = true;
  }
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvasWrap);

/* ---------- 主循环 ---------- */
formulaEl.textContent = TAB_INFO.charge.formula;
hintEl.textContent = TAB_INFO.charge.hint;
resize();

function frame() {
  ctx.clearRect(0, 0, S.W, S.H);
  if (S.ready) {
    if (S.tab === 'charge') {
      if (!S.paused) stepChargePhysics();
      drawCharge();
    } else if (S.tab === 'current') {
      drawCurrent();
    } else if (S.tab === 'magnet') {
      drawMagnet();
    } else {
      drawAmpere();
    }
    updateReadout();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

})();
