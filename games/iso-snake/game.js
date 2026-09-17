/* ============================================================
 * 立体贪吃蛇 —— 纯 Canvas 2D 等距投影（isometric）实现
 * 零依赖 / 无外部图片字体 / rAF + delta time
 *
 * 坐标系说明：
 *   逻辑网格坐标 (gx, gy)，取值 0..N-1；x 轴在基准视角朝屏幕右下，
 *   y 轴朝屏幕左下。视角旋转只对“旋转后的逻辑坐标”重新做等距投影，
 *   因此 Q/E 旋转时形状始终保持标准菱形，且按键永远相对当前视角。
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------- 常量配置 ---------------- */

  const N = 10;                      // 棋盘边长 10×10
  const BEST_KEY = 'best_iso-snake'; // 最高分本地存储键
  const BASE_HW = 48;                // 基准菱形半宽（像素）
  const BASE_HH = 24;                // 基准菱形半高（2:1 等距）
  const BASE_ZU = 22;                // 基准竖直单位高度
  const PLAT_T = 0.95;               // 悬浮平台厚度（逻辑竖直单位）
  const CUBE_INSET = 0.11;           // 蛇身方块相对格子的内缩
  const CUBE_H = 0.62;               // 蛇身方块高度
  const START_LEN = 3;               // 初始长度
  const TICK0 = 0.3;                 // 初始移动间隔（秒）
  const TICK_MIN = 0.095;            // 最快移动间隔
  const SPEED_STEP = 0.0055;         // 每吃一颗晶体加快的秒数
  const DIE_DELAY = 0.75;            // 死亡动画到结算遮罩的秒数

  // 强调色（RGB 数组，便于插值）
  const C_CYAN = [34, 211, 238];
  const C_PURPLE = [124, 92, 255];
  const C_PINK = [255, 92, 168];
  const C_AMBER = [255, 179, 71];

  /* ---------------- DOM 获取 ---------------- */

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const hudLen = document.getElementById('hudLen');
  const hudScore = document.getElementById('hudScore');
  const hudBest = document.getElementById('hudBest');
  const btnPause = document.getElementById('btnPause');

  const startOverlay = document.getElementById('startOverlay');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const endOverlay = document.getElementById('endOverlay');
  const btnStart = document.getElementById('btnStart');
  const btnResume = document.getElementById('btnResume');
  const btnAgain = document.getElementById('btnAgain');
  const recordTip = document.getElementById('recordTip');
  const endLen = document.getElementById('endLen');
  const endScore = document.getElementById('endScore');
  const endBest = document.getElementById('endBest');
  const touchControls = document.getElementById('touchControls');

  /* ---------------- 运行时状态 ---------------- */

  let state = 'ready'; // ready | playing | paused | dying | over
  let started = false; // 本局是否已首次输入方向（等待玩家适应等距视角后才开始移动）
  let body = [];       // 蛇身，元素 { x,y 当前逻辑位置, px,py 上一步逻辑位置 }
  let dir = { x: 1, y: 0 };
  let queue = [];      // 方向缓冲队列
  let food = { x: 5, y: 3 };
  let tick = TICK0;    // 当前移动间隔
  let timer = 0;       // 距下次移动累计时间
  let foods = 0;       // 已吃晶体数
  let score = 0;
  let best = loadBest();

  let targetK = 0;     // 目标视角（0..3，顺时针 90° 倍数）
  let viewAngle = 0;   // 当前渲染角（弧度，向目标平滑过渡）

  let particles = [];
  let eatPulse = 0;    // 吃到晶体时蛇头弹跳 1→0
  let dieT = 0;
  let shakeT = 0;
  let gemBorn = 0;     // 晶体出生时间（秒）

  let now = 0;
  let lastTs = 0;
  let stars = [];

  // 画布与投影尺寸（resize 时刷新）
  let W = 0, H = 0, dpr = 1;
  let HW = BASE_HW, HH = BASE_HH, ZU = BASE_ZU, ox = 0, oy = 0;

  const isTouch = !!(window.matchMedia &&
    (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window));
  if (isTouch) {
    document.body.classList.add('touch');
  }

  /* ---------------- 通用工具 ---------------- */

  function clamp(v, a, b) {
    return v < a ? a : (v > b ? b : v);
  }

  function rgba(c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  }

  // 两色插值
  function mix(c1, c2, t) {
    return [
      c1[0] + (c2[0] - c1[0]) * t,
      c1[1] + (c2[1] - c1[1]) * t,
      c1[2] + (c2[2] - c1[2]) * t
    ];
  }

  // 亮度缩放（f<1 变暗，f>1 提亮并截断）
  function shade(c, f) {
    return [
      clamp(c[0] * f, 0, 255),
      clamp(c[1] * f, 0, 255),
      clamp(c[2] * f, 0, 255)
    ];
  }

  // cubic 回弹缓动（晶体出现）
  function easeOutBack(t) {
    const c = 1.70158;
    const u = t - 1;
    return 1 + (c + 1) * u * u * u + c * u * u;
  }

  function loadBest() {
    try {
      return parseInt(localStorage.getItem(BEST_KEY), 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  function saveBest(v) {
    try {
      localStorage.setItem(BEST_KEY, String(v));
    } catch (e) {
      /* 本地存储不可用时静默忽略 */
    }
  }

  /* ---------------- 等距投影数学 ---------------- */

  // 逻辑坐标绕平台中心按当前视角旋转，返回旋转后逻辑坐标
  function rotateXY(x, y) {
    const dx = x - N / 2;
    const dy = y - N / 2;
    const ca = Math.cos(viewAngle);
    const sa = Math.sin(viewAngle);
    return {
      x: ca * dx - sa * dy + N / 2,
      y: sa * dx + ca * dy + N / 2
    };
  }

  // 等距投影：旋转后逻辑坐标 + 竖直高度 z → 屏幕坐标
  // x 轴→屏幕右下，y 轴→屏幕左下，z 轴→屏幕正上
  function iso(tx, ty, z) {
    return {
      x: ox + HW * (tx - ty),
      y: oy + HH * (tx + ty) - z * ZU
    };
  }

  function project(x, y, z) {
    const t = rotateXY(x, y);
    return iso(t.x, t.y, z || 0);
  }

  // 屏幕语义方向（up/down/left/right，相对当前视角）换算逻辑方向
  // 基准视角：up=(0,-1)、down=(0,1)、left=(-1,0)、right=(1,0)
  // 视角每顺时针转 90°，对逻辑方向做一次逆时针置换 Lcw^{-1}：(x,y)→(y,-x)
  const BASE_DIR = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  function screenToLogical(name) {
    const v = { x: BASE_DIR[name].x, y: BASE_DIR[name].y };
    for (let i = 0; i < targetK; i++) {
      const vx = v.x;
      v.x = v.y;
      v.y = -vx;
    }
    return v;
  }

  /* ---------------- 画布自适应（devicePixelRatio） ---------------- */

  function resize() {
    const rect = stage.getBoundingClientRect();
    W = Math.max(320, rect.width);
    H = Math.max(320, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 底部预留：移动端给触控按钮让位
    const bottomPad = isTouch ? 178 : 70;
    const availW = W * 0.94;
    const availH = H * 0.96 - bottomPad - 88;
    let s = Math.min(
      availW / (2 * N * BASE_HW),
      availH / (2 * N * BASE_HH + (PLAT_T + 2.4) * BASE_ZU)
    );
    s = clamp(s, 0.42, 2.2);
    HW = BASE_HW * s;
    HH = BASE_HH * s;
    ZU = BASE_ZU * s;

    // 逻辑中心 (N/2,N/2) 投影到画布中心偏上
    const cx = W / 2;
    const cy = (H - bottomPad) / 2 + (isTouch ? 6 : 18);
    ox = cx;                                   // 中心处 tx-ty=0
    oy = cy - N * HH;                          // 使中心屏幕 y = cy
    makeStars();
  }

  /* ---------------- 星空背景 ---------------- */

  function makeStars() {
    stars = [];
    const count = clamp(Math.round(W * H / 8500), 90, 320);
    for (let i = 0; i < count; i++) {
      const big = Math.random() < 0.12;
      stars.push({
        fx: Math.random(),
        fy: Math.random(),
        r: big ? 1.3 + Math.random() * 1.3 : 0.4 + Math.random() * 0.9,
        ph: Math.random() * Math.PI * 2,
        sp: 0.6 + Math.random() * 1.6,
        tint: Math.random(),
        big: big
      });
    }
  }

  function drawNebula(x, y, r, c, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(c, a));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function drawSky() {
    // 柔和星云
    drawNebula(W * 0.24, H * 0.26, Math.max(W, H) * 0.42, C_PURPLE, 0.14);
    drawNebula(W * 0.78, H * 0.32, Math.max(W, H) * 0.36, C_CYAN, 0.07);
    drawNebula(W * 0.62, H * 0.82, Math.max(W, H) * 0.4, C_PINK, 0.07);

    // 闪烁星点
    for (let i = 0; i < stars.length; i++) {
      const st = stars[i];
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(now * st.sp + st.ph));
      const col = st.tint < 0.7 ? [220, 228, 255] : (st.tint < 0.88 ? C_CYAN : C_PINK);
      const x = st.fx * W;
      const y = st.fy * H;
      ctx.globalAlpha = tw;
      ctx.fillStyle = rgba(col, 1);
      ctx.beginPath();
      ctx.arc(x, y, st.r, 0, Math.PI * 2);
      ctx.fill();
      if (st.big) {
        // 亮星十字光芒
        ctx.globalAlpha = tw * 0.5;
        ctx.strokeStyle = rgba(col, 1);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x - st.r * 3.2, y);
        ctx.lineTo(x + st.r * 3.2, y);
        ctx.moveTo(x, y - st.r * 3.2);
        ctx.lineTo(x, y + st.r * 3.2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- 多边形绘制工具 ---------------- */

  function tracePath(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
  }

  // 填充多边形，可选辉光描边
  function paint(pts, fillCol, fillA, strokeCol, strokeA, lineW, blur, blurCol) {
    tracePath(pts);
    if (fillCol) {
      ctx.fillStyle = rgba(fillCol, fillA == null ? 1 : fillA);
      ctx.fill();
    }
    if (strokeCol && strokeA > 0) {
      ctx.lineWidth = lineW || 1;
      ctx.strokeStyle = rgba(strokeCol, strokeA);
      ctx.lineJoin = 'round';
      if (blur > 0) {
        ctx.shadowBlur = blur;
        ctx.shadowColor = rgba(blurCol || strokeCol, 0.9);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  /* ---------------- 悬浮平台 ---------------- */

  function drawPlatformHalo() {
    const c = project(N / 2, N / 2, -PLAT_T);
    const rx = N * HW * 1.02;
    const ry = N * HH * 1.25 + PLAT_T * ZU * 0.6;
    const cy = c.y + PLAT_T * ZU * 0.25;
    const g = ctx.createRadialGradient(c.x, cy, 0, c.x, cy, rx);
    g.addColorStop(0, 'rgba(124,92,255,0.34)');
    g.addColorStop(0.55, 'rgba(80,70,200,0.16)');
    g.addColorStop(1, 'rgba(124,92,255,0)');
    ctx.save();
    ctx.translate(c.x, cy);
    ctx.scale(1, ry / rx);
    ctx.translate(-c.x, -cy);
    ctx.fillStyle = g;
    ctx.fillRect(c.x - rx, cy - rx, rx * 2, rx * 2);
    ctx.restore();
  }

  // 平台底部整块菱形底板 + 霓虹边缘
  function drawSlabBottom() {
    const pts = [
      project(0, 0, -PLAT_T),
      project(N, 0, -PLAT_T),
      project(N, N, -PLAT_T),
      project(0, N, -PLAT_T)
    ];
    paint(pts, [16, 12, 40], 0.96, null, 0);
    // 宽而柔和的外辉光
    paint(pts, null, 0, C_CYAN, 0.1, 12 * (HW / BASE_HW) + 4, 0);
    // 明亮的内描边
    paint(pts, null, 0, C_PURPLE, 0.85, 1.6, 10, C_PURPLE);
  }

  // 通用方块（平台格 / 蛇身共用）：
  // 中心逻辑 (bx,by)，半边长 u，竖直范围 [z0,z1]
  // 依据旋转后深度自动选出朝向观察者的两个侧面，视角旋转时依然正确
  function drawBlock(bx, by, u, z0, z1, topCol, sideLCol, sideRCol,
                     strokeCol, strokeA, blurAmt, blurCol) {
    // 四角逻辑坐标（索引 0..3：(-,-)、(+,-)、(+,+)、(-,+)）
    const base = [
      { x: bx - u, y: by - u },
      { x: bx + u, y: by - u },
      { x: bx + u, y: by + u },
      { x: bx - u, y: by + u }
    ];
    const rt = base.map(q => rotateXY(q.x, q.y));
    const top = rt.map(q => iso(q.x, q.y, z1));
    const bot = rt.map(q => iso(q.x, q.y, z0));

    // 前角：旋转后 tx+ty 最大（离观察者最近）；后角最小
    let fi = 0, bi = 0;
    for (let i = 1; i < 4; i++) {
      if (rt[i].x + rt[i].y > rt[fi].x + rt[fi].y) fi = i;
      if (rt[i].x + rt[i].y < rt[bi].x + rt[bi].y) bi = i;
    }
    const sides = [];
    for (let j = 0; j < 4; j++) {
      if (j !== fi && j !== bi) sides.push(j);
    }
    // 左右侧面按屏幕 x 判定：左侧略亮、右侧更暗
    let li, ri;
    if (top[sides[0]].x <= top[sides[1]].x) {
      li = sides[0];
      ri = sides[1];
    } else {
      li = sides[1];
      ri = sides[0];
    }

    paint([top[fi], top[li], bot[li], bot[fi]], sideLCol, 1, null, 0);
    paint([top[fi], top[ri], bot[ri], bot[fi]], sideRCol, 1, null, 0);

    // 顶面绕序：后 → 右 → 前 → 左
    const facePts = [top[bi], top[ri], top[fi], top[li]];
    if (strokeCol && strokeA > 0) {
      paint(facePts, topCol, 1, strokeCol, strokeA, 1.1, blurAmt || 0, blurCol);
    } else {
      paint(facePts, topCol, 1, null, 0);
    }
  }

  function drawPlatform() {
    // 收集格子并按旋转后深度（tx+ty）从远到近排序
    const cells = [];
    for (let gx = 0; gx < N; gx++) {
      for (let gy = 0; gy < N; gy++) {
        const t = rotateXY(gx + 0.5, gy + 0.5);
        cells.push({ gx: gx, gy: gy, d: t.x + t.y });
      }
    }
    cells.sort((a, b) => a.d - b.d);

    const topA = [74, 60, 168];
    const topB = [66, 54, 154];
    const sideL = [42, 33, 96];
    const sideR = [23, 18, 51];

    for (const c of cells) {
      const checker = (c.gx + c.gy) % 2 === 0;
      drawBlock(
        c.gx + 0.5, c.gy + 0.5, 0.5,
        -PLAT_T, 0,
        checker ? topA : topB,
        sideL, sideR,
        C_PURPLE, 0.2, 0, null
      );
    }
  }

  /* ---------------- 蛇身方块 ---------------- */

  function drawSnakeCube(bx, by, isHead, index, total) {
    const t = total > 1 ? index / (total - 1) : 0;
    const bump = isHead ? eatPulse : 0;
    const u = (0.5 - CUBE_INSET) * (1 + 0.07 * bump);
    const z0 = 0.02 + 0.05 * bump;
    const z1 = z0 + CUBE_H + 0.26 * bump;

    let topCol, strokeCol;
    if (isHead) {
      topCol = [158, 240, 255];
      strokeCol = C_CYAN;
    } else {
      // 身体由青到紫渐变
      topCol = mix(C_CYAN, C_PURPLE, t);
      strokeCol = shade(mix(C_CYAN, C_PURPLE, t), 1.25);
    }

    drawBlock(
      bx, by, u, z0, z1,
      topCol,
      shade(topCol, 0.7),
      shade(topCol, 0.48),
      strokeCol, isHead ? 0.95 : 0.55,
      isHead ? 16 : 6, strokeCol
    );

    if (isHead) {
      drawHeadFace(bx, by, u, z1);
    }
  }

  // 蛇头朝向标识：两只眼睛 + 头顶指向三角
  function drawHeadFace(bx, by, u, zTop) {
    const d = dir;
    const perp = { x: -d.y, y: d.x };
    const eyeR = Math.max(1.6, HW * 0.105);

    for (let s = -1; s <= 1; s += 2) {
      const ex = bx + d.x * u * 0.42 + perp.x * u * s * 0.6;
      const ey = by + d.y * u * 0.42 + perp.y * u * s * 0.6;
      const ep = project(ex, ey, zTop + 0.045);
      // 眼白
      ctx.fillStyle = '#eafdff';
      ctx.shadowBlur = 8;
      ctx.shadowColor = rgba(C_CYAN, 0.9);
      ctx.beginPath();
      ctx.arc(ep.x, ep.y, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // 瞳孔（朝前方偏移一点）
      const pp = project(ex + d.x * 0.05, ey + d.y * 0.05, zTop + 0.05);
      ctx.fillStyle = '#12324a';
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, eyeR * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 头顶发光指向三角
    const tip = project(bx + d.x * u * 0.95, by + d.y * u * 0.95, zTop + 0.05);
    const b1 = project(
      bx - d.x * u * 0.3 + perp.x * u * 0.34,
      by - d.y * u * 0.3 + perp.y * u * 0.34,
      zTop + 0.05
    );
    const b2 = project(
      bx - d.x * u * 0.3 - perp.x * u * 0.34,
      by - d.y * u * 0.3 - perp.y * u * 0.34,
      zTop + 0.05
    );
    paint([tip, b1, b2], [234, 253, 255], 1, C_CYAN, 0.9, 1, 8, C_CYAN);
  }

  /* ---------------- 发光晶体食物（旋转的双锥钻石） ---------------- */

  function avgLogical(ls) {
    let x = 0, y = 0;
    for (const q of ls) {
      x += q.x;
      y += q.y;
    }
    return { x: x / ls.length, y: y / ls.length };
  }

  function makeFacet(pts, centroidL, isTop, centerD, radius) {
    const t = rotateXY(centroidL.x, centroidL.y);
    const facing = clamp((t.x + t.y - centerD) / (radius * 1.15 + 0.0001), -1, 1);
    let col;
    if (isTop) {
      // 朝前（facing 大）更亮，带一点暖白高光
      col = mix([255, 130, 192], [255, 226, 241], (facing + 1) / 2);
      if (facing > 0.75) col = mix(col, [255, 245, 250], 0.5);
    } else {
      col = mix([188, 44, 112], [92, 20, 62], (facing + 1) / 2);
    }
    return {
      pts: pts,
      col: col,
      key: (pts[0].y + pts[1].y + pts[2].y) / 3
    };
  }

  function drawGem(lx, ly) {
    const age = clamp((now - gemBorn) / 0.3, 0, 1);
    const sc = easeOutBack(age);
    if (sc <= 0.02) return;

    const spin = now * 2.4;
    const bob = Math.sin(now * 3.0) * 0.09;
    const cx = lx;
    const cy = ly;
    const cz = 0.66 + bob;
    const r = 0.3 * sc;
    const ht = 0.38 * sc;
    const hb = 0.3 * sc;

    const apex = project(cx, cy, cz + ht);
    const bottom = project(cx, cy, cz - hb);
    const eq = [];   // 赤道四角屏幕坐标
    const eqL = [];  // 赤道四角逻辑坐标
    for (let i = 0; i < 4; i++) {
      const a = spin + i * Math.PI / 2;
      const qx = cx + r * Math.cos(a);
      const qy = cy + r * Math.sin(a);
      eq.push(project(qx, qy, cz));
      eqL.push({ x: qx, y: qy });
    }

    // 屏幕空间光晕
    const center = project(cx, cy, cz);
    const haloR = HW * 1.05;
    const g = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, haloR);
    g.addColorStop(0, 'rgba(255,92,168,0.32)');
    g.addColorStop(0.6, 'rgba(255,92,168,0.1)');
    g.addColorStop(1, 'rgba(255,92,168,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(center.x, center.y, haloR, 0, Math.PI * 2);
    ctx.fill();

    // 8 个三角面（上 4 下 4），按屏幕 y 从远到近排序
    const centerT = rotateXY(cx, cy);
    const centerD = centerT.x + centerT.y;
    const facets = [];
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4;
      facets.push(makeFacet([apex, eq[k], eq[n]],
        avgLogical([{ x: cx, y: cy }, eqL[k], eqL[n]]), true, centerD, r));
      facets.push(makeFacet([bottom, eq[n], eq[k]],
        avgLogical([{ x: cx, y: cy }, eqL[k], eqL[n]]), false, centerD, r));
    }
    facets.sort((a, b) => a.key - b.key);

    for (const fc of facets) {
      paint(fc.pts, fc.col, 1, [255, 214, 232], 0.45, 1, 0);
    }

    // 棱线辉光
    for (let m = 0; m < 4; m++) {
      const n = (m + 1) % 4;
      paint([eq[m], eq[n]], null, 0, [255, 225, 240], 0.5, 1, 10, C_PINK);
      paint([apex, eq[m]], null, 0, [255, 225, 240], 0.4, 1, 0);
      paint([eq[m], bottom], null, 0, C_PINK, 0.35, 1, 0);
    }
  }

  /* ---------------- 粒子 ---------------- */

  function spawnBurst(sx, sy, palette, n, power) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = (40 + Math.random() * 190) * power;
      const life = 0.45 + Math.random() * 0.5;
      particles.push({
        x: sx,
        y: sy,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 70 * power,
        life: life,
        max: life,
        size: (1.8 + Math.random() * 2.8) * (HW / BASE_HW),
        col: palette[(Math.random() * palette.length) | 0]
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
      p.vy += 430 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = rgba(p.col, 1);
      ctx.shadowBlur = 10;
      ctx.shadowColor = rgba(p.col, 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + 0.4 * a), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ---------------- 游戏逻辑 ---------------- */

  function reset() {
    body = [];
    // 初始蛇身位于棋盘中央，头部朝 +x，其余依次向左排列
    const sx = Math.floor(N / 2);
    const sy = Math.floor(N / 2);
    for (let i = 0; i < START_LEN; i++) {
      const x = sx - i;
      body.push({ x: x, y: sy, px: x, py: sy });
    }
    dir = { x: 1, y: 0 }; // 初始向右（基准视角下即屏幕右下）
    queue = [];
    tick = TICK0;
    timer = 0;
    foods = 0;
    score = 0;
    targetK = 0;
    viewAngle = 0;
    particles = [];
    eatPulse = 0;
    shakeT = 0;
    dieT = 0;
    started = false;
    spawnFood();
    updateHUD();
  }

  function spawnFood() {
    const free = [];
    for (let gx = 0; gx < N; gx++) {
      for (let gy = 0; gy < N; gy++) {
        let occupied = false;
        for (const s of body) {
          if (s.x === gx && s.y === gy) {
            occupied = true;
            break;
          }
        }
        if (!occupied) free.push({ x: gx, y: gy });
      }
    }
    if (free.length === 0) {
      food = null; // 棋盘填满（理论极难出现），安全兜底
      return;
    }
    food = free[(Math.random() * free.length) | 0];
    gemBorn = now;
  }

  function pressDirection(name) {
    if (state !== 'playing') return;
    const v = screenToLogical(name);
    if (!started) {
      // 开局首次输入：除 180° 反向外，接受任意方向并从此刻起开始移动
      if (v.x === -dir.x && v.y === -dir.y) return;
      if (v.x !== dir.x || v.y !== dir.y) dir = v;
      started = true;
      return;
    }
    const last = queue.length > 0 ? queue[queue.length - 1] : dir;
    // 禁止 180° 反向、忽略重复方向
    if ((v.x === -last.x && v.y === -last.y) ||
        (v.x === last.x && v.y === last.y)) {
      return;
    }
    if (queue.length < 3) queue.push(v);
  }

  function rotateView(cw) {
    if (state === 'dying' || state === 'over') return;
    targetK = (targetK + (cw ? 1 : 3)) % 4;
  }

  function step() {
    if (queue.length > 0) dir = queue.shift();
    const h = body[0];
    const nx = h.x + dir.x;
    const ny = h.y + dir.y;
    const grow = !!(food && nx === food.x && ny === food.y);

    // 撞平台边缘：坠落死亡
    if (nx < 0 || ny < 0 || nx >= N || ny >= N) {
      die();
      return;
    }
    // 撞自身：若本步不生长，尾巴会让出最后一格
    const limit = grow ? body.length : body.length - 1;
    for (let i = 0; i < limit; i++) {
      if (body[i].x === nx && body[i].y === ny) {
        die();
        return;
      }
    }

    // 记录移动前各节位置，用于链式滑动插值
    const oldPos = body.map(s => ({ x: s.x, y: s.y }));
    body.unshift({ x: nx, y: ny, px: oldPos[0].x, py: oldPos[0].y });
    if (!grow) {
      body.pop();
    }
    // 新蛇身第 k 节沿用上一步第 k 节（身后那一节）的位置，形成整体滑动
    for (let k = 1; k < body.length; k++) {
      const op = oldPos[Math.min(k, oldPos.length - 1)];
      body[k].px = op.x;
      body[k].py = op.y;
    }

    if (grow) onEat(nx, ny);
    timer -= tick;
  }

  function onEat(fx, fy) {
    foods++;
    score += 10;
    tick = Math.max(TICK_MIN, TICK0 - foods * SPEED_STEP);
    eatPulse = 1;
    const p = project(fx + 0.5, fy + 0.5, 0.95);
    spawnBurst(p.x, p.y, [C_PINK, C_AMBER, C_CYAN, [255, 230, 245]], 20, 1);
    spawnFood();
    updateHUD();
  }

  function die() {
    state = 'dying';
    dieT = 0;
    shakeT = 0.5;
    const h = body[0];
    const p = project(h.x + 0.5, h.y + 0.5, 0.7);
    spawnBurst(p.x, p.y, [[255, 92, 122], C_PINK, C_AMBER], 30, 1.25);
  }

  function finishGame() {
    state = 'over';
    const isRecord = score > best;
    if (isRecord) {
      best = score;
      saveBest(best);
    }
    recordTip.classList.toggle('show', isRecord);
    endLen.textContent = body.length;
    endScore.textContent = score;
    endBest.textContent = best;
    updateHUD();
    endOverlay.classList.add('show');
  }

  function updateHUD() {
    hudLen.textContent = body.length;
    hudScore.textContent = score;
    hudBest.textContent = best;
  }

  /* ---------------- 状态切换 ---------------- */

  function hideOverlays() {
    startOverlay.classList.remove('show');
    pauseOverlay.classList.remove('show');
    endOverlay.classList.remove('show');
  }

  function startGame() {
    reset();
    hideOverlays();
    state = 'playing';
    btnPause.textContent = '暂停';
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    pauseOverlay.classList.add('show');
    btnPause.textContent = '继续';
  }

  function resumeGame() {
    if (state !== 'paused') return;
    pauseOverlay.classList.remove('show');
    state = 'playing';
    btnPause.textContent = '暂停';
  }

  function togglePause() {
    if (state === 'playing') {
      pauseGame();
    } else if (state === 'paused') {
      resumeGame();
    }
  }

  /* ---------------- 每帧更新 ---------------- */

  function update(dt) {
    // 视角平滑旋转到最近的目标角
    const want = targetK * Math.PI / 2;
    let diff = want - viewAngle;
    diff = ((diff % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    if (Math.abs(diff) < 0.0009) {
      viewAngle = want;
    } else {
      viewAngle += diff * Math.min(1, dt * 11);
    }

    if (eatPulse > 0) eatPulse = Math.max(0, eatPulse - dt * 2.6);
    if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);

    if (state === 'playing') {
      if (started) timer += dt;
      let guard = 0;
      while (started && state === 'playing' && timer >= tick && guard < 8) {
        step();
        guard++;
      }
    } else if (state === 'dying') {
      dieT += dt;
      if (dieT >= DIE_DELAY) finishGame();
    }

    updateParticles(dt);
  }

  /* ---------------- 每帧渲染 ---------------- */

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawSky();

    ctx.save();
    if (shakeT > 0) {
      const mag = shakeT * 13;
      ctx.translate(
        (Math.random() * 2 - 1) * mag,
        (Math.random() * 2 - 1) * mag
      );
    }

    drawPlatformHalo();
    drawSlabBottom();
    drawPlatform();

    // 蛇身与晶体统一按深度排序后绘制
    const objs = [];
    const ph = state === 'playing' ? clamp(timer / tick, 0, 1) : 1;
    for (let i = 0; i < body.length; i++) {
      const s = body[i];
      const ix = s.px + (s.x - s.px) * ph + 0.5;
      const iy = s.py + (s.y - s.py) * ph + 0.5;
      const t = rotateXY(ix, iy);
      objs.push({ kind: 'seg', x: ix, y: iy, d: t.x + t.y, index: i });
    }
    if (food) {
      const ft = rotateXY(food.x + 0.5, food.y + 0.5);
      objs.push({ kind: 'food', x: food.x + 0.5, y: food.y + 0.5, d: ft.x + ft.y });
    }
    objs.sort((a, b) => a.d - b.d);

    for (const o of objs) {
      if (o.kind === 'food') {
        drawGem(o.x, o.y);
      } else {
        drawSnakeCube(o.x, o.y, o.index === 0, o.index, body.length);
      }
    }

    drawParticles();
    ctx.restore();

    // 开局等待输入的提示（不随屏幕震动）
    if (state === 'playing' && !started) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '600 20px system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.shadowColor = 'rgba(34,211,238,.9)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = 'rgba(238,240,255,.95)';
      ctx.fillText('按 方向键 / WASD 开始移动（Q/E 旋转视角）', W / 2, H * 0.14);
      ctx.restore();
    }
  }

  /* ---------------- 主循环（rAF + delta time） ---------------- */

  function frame(ts) {
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    dt = clamp(dt, 0, 0.05); // 切后台回来时防止大步长
    now += dt;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  /* ---------------- 事件绑定 ---------------- */

  const KEY_DIR = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right'
  };

  window.addEventListener('keydown', (e) => {
    const dirName = KEY_DIR[e.code];
    if (dirName) {
      e.preventDefault();
      pressDirection(dirName);
      return;
    }
    if (e.code === 'KeyQ') {
      e.preventDefault();
      rotateView(false);
    } else if (e.code === 'KeyE') {
      e.preventDefault();
      rotateView(true);
    } else if (e.code === 'Space') {
      e.preventDefault(); // 同时阻止按钮聚焦时被空格再次触发
      if (state === 'ready' || state === 'over') startGame();
      else togglePause();
    } else if (e.code === 'Escape') {
      e.preventDefault();
      togglePause();
    } else if (e.code === 'Enter') {
      if (state === 'ready' || state === 'over') startGame();
    }
  });

  btnPause.addEventListener('click', () => {
    togglePause();
    btnPause.blur();
  });
  btnStart.addEventListener('click', () => {
    startGame();
    btnStart.blur();
  });
  btnResume.addEventListener('click', () => {
    resumeGame();
    btnResume.blur();
  });
  btnAgain.addEventListener('click', () => {
    startGame();
    btnAgain.blur();
  });

  // 失焦 / 切到后台自动暂停
  window.addEventListener('blur', () => {
    if (state === 'playing') pauseGame();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') pauseGame();
  });

  // 触控方向键与旋转键
  touchControls.querySelectorAll('.tbtn').forEach((btn) => {
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      pressDirection(this.getAttribute('data-dir'));
    });
  });
  touchControls.querySelectorAll('.rbtn').forEach((btn) => {
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      rotateView(this.getAttribute('data-rot') === 'cw');
    });
  });

  window.addEventListener('resize', resize);

  /* ---------------- 启动 ---------------- */

  resize();
  reset();
  state = 'ready';
  updateHUD();
  requestAnimationFrame(frame);

})();
