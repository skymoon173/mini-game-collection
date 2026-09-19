/* ============================================================
   分形艺术馆 —— 交互逻辑
   纯 Canvas 2D 数学绘制，零依赖。四个展品：
   ① 科赫雪花（逐级生长 + 逐笔描边）
   ② 龙曲线 · 经典二维（折叠翻倍 + 一笔画）
   ③ 龙曲线 · 三维变体（中点抬升 + 透视投影 + 拖拽自转）
   ④ 分形树（递归树 + 微风 + 光点叶 + 落叶彩蛋）
   ============================================================ */
(function (host) {
  'use strict';

  /* ============================================================
     一、通用工具（纯函数，Node 环境也可调用，便于自测）
     ============================================================ */

  const SQRT3_6 = Math.sqrt(3) / 6;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  // 主题色（RGB 数组，便于插值）
  const C_CYAN = [34, 211, 238];
  const C_PURPLE = [124, 92, 255];
  const C_PINK = [255, 92, 168];
  const C_AMBER = [255, 179, 71];
  const C_FAR = [42, 38, 96];
  const C_NEAR = [196, 240, 255];

  function mixRgb(a, b, t) {
    return [
      Math.round(lerp(a[0], b[0], t)),
      Math.round(lerp(a[1], b[1], t)),
      Math.round(lerp(a[2], b[2], t))
    ];
  }
  // 三段渐变：青 → 紫 → 粉
  function rampCyanPurplePink(t) {
    t = clamp(t, 0, 1);
    return t < 0.5 ? mixRgb(C_CYAN, C_PURPLE, t * 2) : mixRgb(C_PURPLE, C_PINK, (t - 0.5) * 2);
  }
  // 三维深度渐变：远暗紫 → 主紫 → 近亮青
  function rampDepth(t) {
    t = clamp(t, 0, 1);
    return t < 0.55 ? mixRgb(C_FAR, C_PURPLE, t / 0.55) : mixRgb(C_PURPLE, C_NEAR, (t - 0.55) / 0.45);
  }
  const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';

  /* ------------------------------------------------------------
     科赫曲线层级生成
     base：Float64Array，扁平线段 [x1,y1,x2,y2,...]
     sign：+1 凸起在前进方向左侧（单条曲线向上凸）；-1 向右（雪花边向外凸）
     返回 levels[d]：第 d 阶的全部线段（扁平数组）
     ------------------------------------------------------------ */
  function buildKochLevels(base, maxDepth, sign) {
    const levels = [Float64Array.from(base)];
    for (let d = 1; d <= maxDepth; d++) {
      const prev = levels[d - 1];
      const next = new Float64Array(prev.length * 4);
      let w = 0;
      for (let i = 0; i < prev.length; i += 4) {
        const x1 = prev[i], y1 = prev[i + 1], x2 = prev[i + 2], y2 = prev[i + 3];
        const dx = (x2 - x1) / 3, dy = (y2 - y1) / 3;
        const ax = x1 + dx, ay = y1 + dy;           // 三等分点 A
        const bx = x1 + 2 * dx, by = y1 + 2 * dy;   // 三等分点 B
        // 凸起顶点 C（中点沿垂直方向偏移 √3/6 倍边长）
        const cx = (x1 + x2) / 2 + sign * (y1 - y2) * SQRT3_6;
        const cy = (y1 + y2) / 2 + sign * (x2 - x1) * SQRT3_6;
        next[w++] = x1; next[w++] = y1; next[w++] = ax; next[w++] = ay;
        next[w++] = ax; next[w++] = ay; next[w++] = cx; next[w++] = cy;
        next[w++] = cx; next[w++] = cy; next[w++] = bx; next[w++] = by;
        next[w++] = bx; next[w++] = by; next[w++] = x2; next[w++] = y2;
      }
      levels[d] = next;
    }
    return levels;
  }

  /* ------------------------------------------------------------
     二维龙曲线：折线绕末端旋转 90° 后翻倍拼接，O(n) 迭代生成
     返回扁平顶点 [x0,y0,x1,y1,...]，共 2^depth + 1 个顶点
     ------------------------------------------------------------ */
  function buildDragon2(depth) {
    let v = new Float64Array([0, 0, 1, 0]);
    for (let k = 0; k < depth; k++) {
      const m = v.length / 2;                 // 旧顶点数
      const out = new Float64Array(2 * (2 * m - 1));
      out.set(v);                             // 前半保留原折线
      let w = v.length;
      const ex = v[v.length - 2], ey = v[v.length - 1]; // 末端为旋转中心
      for (let i = m - 2; i >= 0; i--) {
        const dx = v[i * 2] - ex, dy = v[i * 2 + 1] - ey;
        out[w++] = ex - dy;                   // (dx,dy) 逆时针旋转 90° → (-dy,dx)
        out[w++] = ey + dx;
      }
      v = out;
    }
    return v;
  }

  /* ------------------------------------------------------------
     三维龙曲线（对应原版 Python 规则）：
     mid = (p1+p2)/2 + normalize((p2-p1) × ẑ) × |p2-p1|/2
     每阶把所有线段二分，O(n) 迭代，返回扁平 xyz 顶点
     ------------------------------------------------------------ */
  function buildDragon3(depth) {
    let v = new Float64Array([0, 0, 0, 1, 0, 0]);
    for (let k = 0; k < depth; k++) {
      const m = v.length / 3;
      const out = new Float64Array(3 * (2 * m - 1));
      // 交错排列：v0, m0, v1, m1, v2 …（对应递归 p1 → mid → p2 的访问顺序）
      let w = 0;
      for (let i = 0; i < m - 1; i++) {
        const a = i * 3, b = (i + 1) * 3;
        out[w++] = v[a]; out[w++] = v[a + 1]; out[w++] = v[a + 2];
        const dx = v[b] - v[a], dy = v[b + 1] - v[a + 1], dz = v[b + 2] - v[a + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const h = Math.sqrt(dx * dx + dy * dy) || 1e-9;   // 叉积 (d × ẑ) = (dy,-dx,0)
        const lift = len / 2;
        out[w++] = (v[a] + v[b]) / 2 + (dy / h) * lift;
        out[w++] = (v[a + 1] + v[b + 1]) / 2 + (-dx / h) * lift;
        out[w++] = (v[a + 2] + v[b + 2]) / 2;
      }
      out[w++] = v[v.length - 3];
      out[w++] = v[v.length - 2];
      out[w++] = v[v.length - 1];
      v = out;
    }
    return v;
  }

  /* ============================================================
     二、浏览器侧状态（DOM 相关操作均延迟到 boot 内执行）
     ============================================================ */

  const SETTINGS_KEY = 'fractal-settings';
  const DEFAULT_SETTINGS = {
    hall: 'koch',
    koch: { depth: 4, mode: 'snowflake', speed: 1.5 },
    dragon2: { depth: 12, speed: 2 },
    dragon3: { depth: 10, az: -0.7, el: 0.35, zoom: 1, auto: true },
    tree: { depth: 9, angle: 25, ratio: 72, wind: true }
  };

  let settings = null;
  let activeName = '';
  const halls = {};

  // 读取 localStorage 设置并与默认值合并（含范围校正）
  function loadSettings() {
    const s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    try {
      const raw = host.localStorage && host.localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          if (typeof data.hall === 'string') s.hall = data.hall;
          const merge = (dst, src, keys) => {
            if (!src) return;
            keys.forEach((k) => { if (src[k] !== undefined) dst[k] = src[k]; });
          };
          merge(s.koch, data.koch, ['depth', 'mode', 'speed']);
          merge(s.dragon2, data.dragon2, ['depth', 'speed']);
          merge(s.dragon3, data.dragon3, ['depth', 'az', 'el', 'zoom', 'auto']);
          merge(s.tree, data.tree, ['depth', 'angle', 'ratio', 'wind']);
        }
      }
    } catch (e) { /* 存储不可用时使用默认值 */ }
    // 范围校正
    s.koch.depth = clamp(s.koch.depth | 0, 0, 6);
    s.koch.mode = s.koch.mode === 'curve' ? 'curve' : 'snowflake';
    s.koch.speed = clamp(+s.koch.speed || 1.5, 0.5, 3);
    s.dragon2.depth = clamp(s.dragon2.depth | 0, 1, 16);
    s.dragon2.speed = clamp(+s.dragon2.speed || 2, 0.5, 4);
    s.dragon3.depth = clamp(s.dragon3.depth | 0, 1, 12);
    s.dragon3.az = +s.dragon3.az || -0.7;
    s.dragon3.el = clamp(+s.dragon3.el || 0.35, -1.45, 1.45);
    s.dragon3.zoom = clamp(+s.dragon3.zoom || 1, 0.5, 4);
    s.dragon3.auto = s.dragon3.auto !== false;
    s.tree.depth = clamp(s.tree.depth | 0, 1, 12);
    s.tree.angle = clamp(s.tree.angle | 0, 15, 45);
    s.tree.ratio = clamp(s.tree.ratio | 0, 55, 85);
    s.tree.wind = s.tree.wind !== false;
    if (['koch', 'dragon2', 'dragon3', 'tree'].indexOf(s.hall) < 0) s.hall = 'koch';
    return s;
  }

  let saveTimer = null;
  function saveSettings() {
    if (!host.localStorage) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { host.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* 忽略 */ }
    }, 250);
  }

  // 当前画布导出 PNG（toDataURL 触发下载）
  function exportPNG() {
    const hall = halls[activeName];
    if (!hall || typeof document === 'undefined') return;
    hall.render(); // 强制按当前状态完整绘制一帧（含背景）
    const url = hall.canvas.toDataURL('image/png');
    const a = document.createElement('a');
    const nameMap = { koch: '科赫雪花', dragon2: '龙曲线', dragon3: '三维龙曲线', tree: '分形树' };
    a.href = url;
    a.download = '分形艺术馆-' + nameMap[activeName] + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ============================================================
     三、浏览器启动
     ============================================================ */

  function boot() {
    const $ = (id) => document.getElementById(id);
    const doc = document;

    settings = loadSettings();

    /* ---------- 画布适配 devicePixelRatio ---------- */
    function fitCanvas(canvas) {
      const dpr = Math.min(host.devicePixelRatio || 1, 2);
      const parent = canvas.parentElement;
      const w = canvas.clientWidth || parent.clientWidth;
      const h = canvas.clientHeight || parent.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx, w, h };
    }

    // 绘制与页面一致的径向背景（保证导出 PNG 也带背景）
    function paintBackground(ctx, w, h, cache) {
      if (!cache.grad || cache.w !== w || cache.h !== h) {
        cache.w = w; cache.h = h;
        cache.grad = ctx.createRadialGradient(w / 2, h * 0.3, 0, w / 2, h * 0.42, Math.max(w, h) * 0.95);
        cache.grad.addColorStop(0, '#171a3a');
        cache.grad.addColorStop(1, '#0b0e20');
      }
      ctx.fillStyle = cache.grad;
      ctx.fillRect(0, 0, w, h);
    }

    /* ---------- 发光点精灵（离屏 Canvas 缓存，零图片依赖） ---------- */
    const glowCache = new Map();
    function glowSprite(rgb) {
      const key = rgb.join(',');
      let s = glowCache.get(key);
      if (s) return s;
      s = doc.createElement('canvas');
      s.width = s.height = 64;
      const c = s.getContext('2d');
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, rgba(rgb, 1));
      g.addColorStop(0.25, rgba(rgb, 0.55));
      g.addColorStop(1, rgba(rgb, 0));
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
      glowCache.set(key, s);
      return s;
    }
    function drawGlow(ctx, x, y, r, rgb, alpha) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(glowSprite(rgb), x - r, y - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    }

    /* ---------- “生成中”提示与延迟调度 ---------- */
    const toastEl = $('toast');
    let toastDepth = 0;
    function toastShow() { toastDepth++; toastEl.hidden = false; }
    function toastHide() { toastDepth = Math.max(0, toastDepth - 1); if (toastDepth === 0) toastEl.hidden = true; }
    // heavy=true 时推迟到下一帧生成，让“生成中”先绘制出来，避免卡主线程
    function scheduleGen(heavy, fn) {
      if (!heavy) { fn(); return; }
      toastShow();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try { fn(); } finally { toastHide(); }
      }));
    }

    /* ==========================================================
       展品 ① 科赫雪花
       ========================================================== */
    const koch = (function () {
      const canvas = $('kochCanvas');
      const ctx = canvas.getContext('2d');
      const bgCache = {};

      const st = {
        w: 0, h: 0,
        mode: 'snowflake',
        target: 4, cur: 4,
        levels: null, sign: -1,
        fit: { s: 1, ox: 0, oy: 0 },
        prog: 1, playing: false, speed: 1.5,
        dirty: true, genToken: 0
      };
      const MORPH_SEC = 0.5; // 每一阶生长动画时长（秒）

      // 由初始形态生成基础边
      function baseSegments(mode) {
        if (mode === 'curve') {
          return new Float64Array([-150, 0, 150, 0]);
        }
        const side = 300, h3 = side * Math.sqrt(3) / 2;
        const p1 = [-side / 2, -h3 / 3], p2 = [side / 2, -h3 / 3], p3 = [0, 2 * h3 / 3];
        // 顶点按逆时针排列，凸起方向取 -1（边的外侧）
        return new Float64Array([
          p1[0], p1[1], p2[0], p2[1],
          p2[0], p2[1], p3[0], p3[1],
          p3[0], p3[1], p1[0], p1[1]
        ]);
      }

      // 按最高已生成阶的包围盒计算居中缩放（降阶回缩动画期间视角不跳动）
      function computeFit() {
        const lv = st.levels[st.levels.length - 1];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < lv.length; i += 4) {
          minX = Math.min(minX, lv[i], lv[i + 2]);
          maxX = Math.max(maxX, lv[i], lv[i + 2]);
          minY = Math.min(minY, lv[i + 1], lv[i + 3]);
          maxY = Math.max(maxY, lv[i + 1], lv[i + 3]);
        }
        const m = 40;
        const s = Math.min((st.w - 2 * m) / (maxX - minX), (st.h - 2 * m) / (maxY - minY));
        st.fit.s = s;
        st.fit.ox = st.w / 2 - (minX + maxX) / 2 * s;
        st.fit.oy = st.h / 2 + (minY + maxY) / 2 * s; // y 轴翻转
      }

      function rebuild(growFromZero) {
        st.sign = st.mode === 'curve' ? 1 : -1;
        if (growFromZero) { st.cur = 0; st.playing = false; }
        // 逐级生长时完整呈现当前阶折线；“逐笔描边”由播放按钮另行控制
        st.prog = 1;
        // 降阶时仍保留更深的层级，保证“凸起折回”的补间动画有数据可用
        const buildTo = Math.max(st.target, Math.ceil(st.cur));
        st.levels = buildKochLevels(baseSegments(st.mode), buildTo, st.sign);
        st.cur = clamp(st.cur, 0, buildTo);
        computeFit();
        st.dirty = true;
        updateFacts();
        syncPlayButton();
      }

      function updateFacts() {
        const sides = st.mode === 'curve' ? 1 : 3;
        const n = st.target;
        const seg = sides * Math.pow(4, n);
        const ratio = Math.pow(4 / 3, n);
        $('kochSegVal').innerHTML = (sides === 3 ? '3 × 4' + sup(n) + ' = ' : '4' + sup(n) + ' = ') + seg;
        $('kochLenVal').textContent = '× ' + ratio.toFixed(3);
        $('kochLenLabel').textContent = st.mode === 'curve' ? '长度 / 初始长度' : '周长 / 初始周长';
        $('kochFact').innerHTML = st.mode === 'curve'
          ? '科赫曲线：每条边的中间三分之一替换为等边凸起，无限迭代后有限区间内容纳无限长度。当前线段 <b>' + seg + '</b> 条，长度比 <b>(4/3)<sup>' + n + '</sup> = ' + ratio.toFixed(3) + '</b>，自相似维数 <b>log 4 / log 3 ≈ 1.262</b>。'
          : '科赫雪花：周长随深度按 <b>4/3</b> 倍率增长并趋于无穷，而围成的面积始终有限。当前线段 <b>3 × 4<sup>' + n + '</sup> = ' + seg + '</b> 条，周长比 <b>3 × (4/3)<sup>' + n + '</sup> = ' + (3 * ratio).toFixed(3) + '</b>，维数 <b>≈ 1.262</b>。';
      }
      function sup(n) { return '<sup>' + n + '</sup>'; }

      function syncPlayButton() {
        $('kochPlayBtn').textContent = st.playing ? '暂停描边' : '播放描边';
      }

      function render() {
        paintBackground(ctx, st.w, st.h, bgCache);
        if (!st.levels || st.w < 2) return;

        const d = Math.min(Math.floor(st.cur), st.target);
        const u = easeInOut(st.cur - d);
        const P = st.levels[d];
        const C = u > 0.001 && st.levels[d + 1] ? st.levels[d + 1] : null;
        const segNow = P.length / 4;
        const pieceCount = C ? segNow * 4 : segNow;
        const limit = st.prog * pieceCount;
        const full = Math.floor(limit);
        const frac = limit - full;

        const { s, ox, oy } = st.fit;
        const X = (x) => ox + x * s;
        const Y = (y) => oy - y * s;

        // 当前阶颜色：青（浅阶）→ 紫 → 粉（深阶）
        const col = C ? mixRgb(rampCyanPurplePink(d / 6), rampCyanPurplePink((d + 1) / 6), u)
                      : rampCyanPurplePink(d / 6);
        ctx.strokeStyle = rgba(col, 0.92);
        ctx.lineWidth = clamp(st.h * 0.0024, 1, 2.6);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        const path = new Path2D();
        let penX = 0, penY = 0, started = false;
        for (let p = 0; p < pieceCount; p++) {
          let x0, y0, x1, y1;
          if (C) {
            // 生长补间：父段直线四等分点 R 向子段折点 Q 插值
            const i = p >> 2, k = p & 3, j = i * 4;
            const px1 = P[j], py1 = P[j + 1], px2 = P[j + 2], py2 = P[j + 3];
            const cj = (j * 4 + k * 4);
            const qx0 = C[cj], qy0 = C[cj + 1], qx1 = C[cj + 2], qy1 = C[cj + 3];
            const rx0 = px1 + (px2 - px1) * k / 4, ry0 = py1 + (py2 - py1) * k / 4;
            const rx1 = px1 + (px2 - px1) * (k + 1) / 4, ry1 = py1 + (py2 - py1) * (k + 1) / 4;
            x0 = lerp(rx0, qx0, u); y0 = lerp(ry0, qy0, u);
            x1 = lerp(rx1, qx1, u); y1 = lerp(ry1, qy1, u);
          } else {
            const j = p * 4;
            x0 = P[j]; y0 = P[j + 1]; x1 = P[j + 2]; y1 = P[j + 3];
          }
          let ex = x1, ey = y1;
          if (p > full) break;
          if (p === full && frac < 1) { ex = lerp(x0, x1, frac); ey = lerp(y0, y1, frac); }
          const sx0 = X(x0), sy0 = Y(y0), sx1 = X(ex), sy1 = Y(ey);
          if (!started) { path.moveTo(sx0, sy0); started = true; }
          path.lineTo(sx1, sy1);
          penX = sx1; penY = sy1;
        }
        ctx.stroke(path);

        // 描边笔尖光点
        if (started && st.prog > 0 && st.prog < 1) {
          drawGlow(ctx, penX, penY, 13, C_CYAN, 0.55);
          drawGlow(ctx, penX, penY, 5, [255, 255, 255], 0.95);
        }
        st.dirty = false;
      }

      function frame(dt) {
        let moving = false;
        if (st.cur < st.target) { st.cur = Math.min(st.target, st.cur + dt / MORPH_SEC); moving = true; }
        else if (st.cur > st.target) { st.cur = Math.max(st.target, st.cur - dt / MORPH_SEC); moving = true; }
        if (st.playing && st.prog < 1) {
          st.prog = Math.min(1, st.prog + dt * st.speed / 12); // 12 秒 / 速度倍率
          moving = true;
          if (st.prog >= 1) { st.playing = false; syncPlayButton(); }
        }
        if (moving || st.dirty) render();
      }

      return {
        canvas,
        enter() {
          const r = fitCanvas(canvas);
          st.w = r.w; st.h = r.h;
          st.target = settings.koch.depth;
          st.mode = settings.koch.mode;
          st.speed = settings.koch.speed;
          rebuild(st.levels === null); // 首次进入从三角形逐级生长
          render();
        },
        exit() { st.playing = false; },
        resize() {
          const r = fitCanvas(canvas);
          st.w = r.w; st.h = r.h;
          if (st.levels) computeFit();
          render();
        },
        render, frame,
        setDepth(n) {
          st.target = n;
          settings.koch.depth = n; saveSettings();
          $('kochDepthVal').textContent = n;
          rebuild(false); // 深度 6 仅 12288 段，生成耗时远小于 20ms
        },
        setMode(mode) {
          st.mode = mode;
          settings.koch.mode = mode; saveSettings();
          rebuild(true);
        },
        setSpeed(v) {
          st.speed = v;
          settings.koch.speed = v; saveSettings();
          $('kochSpeedVal').textContent = v.toFixed(1);
        },
        togglePlay() {
          if (st.playing) { st.playing = false; }
          else { if (st.prog >= 1) st.prog = 0; st.playing = true; }
          syncPlayButton();
        },
        replay() { st.prog = 0; st.playing = true; syncPlayButton(); }
      };
    })();

    /* ==========================================================
       展品 ② 二维龙曲线（折叠翻倍 + 一笔画发光拖尾）
       ========================================================== */
    const dragon2 = (function () {
      const canvas = $('d2Canvas');
      const ctx = canvas.getContext('2d');
      const bgCache = {};

      const st = {
        w: 0, h: 0,
        depth: 12, pts: null, segCount: 0,
        fit: { s: 1, ox: 0, oy: 0 },
        prog: 0, playing: false, speed: 2,
        head: { x: 0, y: 0 },
        trail: [],
        dirty: true, genToken: 0
      };
      const BUCKETS = 64;
      const DRAW_SEC = 9; // 一倍速画完整条曲线用时

      function computeFit() {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < st.pts.length; i += 2) {
          minX = Math.min(minX, st.pts[i]); maxX = Math.max(maxX, st.pts[i]);
          minY = Math.min(minY, st.pts[i + 1]); maxY = Math.max(maxY, st.pts[i + 1]);
        }
        const m = 56;
        const s = Math.min((st.w - 2 * m) / (maxX - minX), (st.h - 2 * m) / (maxY - minY));
        st.fit.s = s;
        st.fit.ox = st.w / 2 - (minX + maxX) / 2 * s;
        st.fit.oy = st.h / 2 + (minY + maxY) / 2 * s;
      }

      function updateFacts() {
        const seg = Math.pow(2, st.depth);
        $('d2SegVal').textContent = '2' + '<sup>' + st.depth + '</sup> = ' + seg;
        $('d2VertVal').textContent = seg + 1;
        $('d2Fact').innerHTML =
          '折叠规则：D<sub>n</sub> = D<sub>n-1</sub> + L + 翻转(reverse(D<sub>n-1</sub>))，即把整条折线绕末端旋转 90° 后接上。'
          + '当前 <b>2<sup>' + st.depth + '</sup> = ' + seg + '</b> 条线段、<b>' + (seg + 1) + '</b> 个顶点；'
          + '折线遍历每个折叠格点且永不自交，自相似维数恰为 <b>2</b>。';
      }

      function syncButton() {
        const btn = $('d2DrawBtn');
        if (st.playing) btn.textContent = '暂停绘制';
        else if (st.prog >= st.segCount) btn.textContent = '再画一次';
        else btn.textContent = '一笔画绘制';
      }

      function render() {
        paintBackground(ctx, st.w, st.h, bgCache);
        if (!st.pts || st.w < 2) return;
        const { s, ox, oy } = st.fit;
        const X = (x) => ox + x * s;
        const Y = (y) => oy - y * s;

        const limit = Math.min(st.prog, st.segCount);
        const full = Math.floor(limit);

        // 按路径位置分桶上色（青 → 紫 → 粉），同色合并为单条路径
        const paths = new Array(BUCKETS);
        for (let b = 0; b < BUCKETS; b++) paths[b] = new Path2D();
        for (let i = 0; i < full; i++) {
          const b = Math.min(BUCKETS - 1, (i * BUCKETS / st.segCount) | 0);
          const x0 = X(st.pts[i * 2]), y0 = Y(st.pts[i * 2 + 1]);
          const x1 = X(st.pts[i * 2 + 2]), y1 = Y(st.pts[i * 2 + 3]);
          paths[b].moveTo(x0, y0);
          paths[b].lineTo(x1, y1);
        }
        ctx.lineWidth = clamp(st.h * 0.0022, 1, 2.4);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let b = 0; b < BUCKETS; b++) {
          ctx.strokeStyle = rgba(rampCyanPurplePink(b / (BUCKETS - 1)), 0.9);
          ctx.stroke(paths[b]);
        }

        // 笔尖位置（含段内插值）
        if (limit < st.segCount && limit >= 0) {
          const i = full, f = limit - full;
          const hx = lerp(st.pts[i * 2], st.pts[i * 2 + 2], f);
          const hy = lerp(st.pts[i * 2 + 1], st.pts[i * 2 + 3], f);
          st.head.x = X(hx); st.head.y = Y(hy);
        }

        // 拖尾
        for (let i = 0; i < st.trail.length; i++) {
          const q = st.trail[i], t = i / st.trail.length;
          drawGlow(ctx, q.x, q.y, 4 + t * 7, C_PURPLE, t * 0.4);
        }
        // 发光笔尖
        if (st.playing || limit < st.segCount) {
          drawGlow(ctx, st.head.x, st.head.y, 16, C_CYAN, 0.55);
          drawGlow(ctx, st.head.x, st.head.y, 6, [255, 255, 255], 0.95);
        }
        st.dirty = false;
      }

      function frame(dt) {
        let moving = false;
        if (st.playing && st.prog < st.segCount) {
          st.prog = Math.min(st.segCount, st.prog + dt * st.speed / DRAW_SEC * st.segCount);
          st.trail.push({ x: st.head.x, y: st.head.y });
          if (st.trail.length > 36) st.trail.shift();
          moving = true;
          if (st.prog >= st.segCount) { st.playing = false; st.trail.length = 0; syncButton(); }
        }
        if (moving || st.dirty) render();
      }

      return {
        canvas,
        enter() {
          const r = fitCanvas(canvas);
          st.w = r.w; st.h = r.h;
          st.depth = settings.dragon2.depth;
          st.speed = settings.dragon2.speed;
          const token = ++st.genToken;
          scheduleGen(st.depth >= 15, () => {
            if (token !== st.genToken) return;
            st.pts = buildDragon2(st.depth);
            st.segCount = st.pts.length / 2 - 1;
            st.prog = st.segCount;
            st.trail.length = 0;
            computeFit();
            updateFacts();
            syncButton();
            render();
          });
        },
        exit() { st.playing = false; st.genToken++; },
        resize() {
          const r = fitCanvas(canvas);
          st.w = r.w; st.h = r.h;
          if (st.pts) computeFit();
          render();
        },
        render, frame,
        setDepth(n) {
          st.depth = n;
          settings.dragon2.depth = n; saveSettings();
          $('d2DepthVal').textContent = n;
          const token = ++st.genToken;
          scheduleGen(n >= 15, () => {
            if (token !== st.genToken) return;
            st.pts = buildDragon2(n);
            st.segCount = st.pts.length / 2 - 1;
            st.prog = st.segCount; // 切换深度后直接呈现完整图形
            st.playing = false;
            st.trail.length = 0;
            computeFit();
            updateFacts();
            syncButton();
            render();
          });
        },
        setSpeed(v) {
          st.speed = v;
          settings.dragon2.speed = v; saveSettings();
          $('d2SpeedVal').textContent = v.toFixed(1);
        },
        draw() {
          if (st.playing) { st.playing = false; }
          else {
            if (st.prog >= st.segCount) st.prog = 0;
            st.playing = true;
            st.trail.length = 0;
          }
          syncButton();
        }
      };
    })();

    /* ==========================================================
       展品 ③ 三维龙曲线（透视投影 / 深度排序 / 辉光 / 拖拽自转）
       ========================================================== */
    const dragon3 = (function () {
      const canvas = $('d3Canvas');
      const ctx = canvas.getContext('2d');
      const bgCache = {};

      const DEFAULT_VIEW = { az: -0.7, el: 0.35, zoom: 1 };
      const st = {
        w: 0, h: 0,
        depth: 10, verts: null, vCount: 0, segCount: 0,
        cx: 0, cy: 0, cz: 0, radius: 1,
        az: DEFAULT_VIEW.az, el: DEFAULT_VIEW.el, zoom: 1, auto: true,
        dragging: false, lastX: 0, lastY: 0,
        sx: null, sy: null, zv: null, order: null,
        angText: '', zoomText: ''
      };
      const DB = 48; // 深度颜色桶数
      const depthStyles = [];
      for (let i = 0; i < DB; i++) {
        const t = i / (DB - 1);
        depthStyles.push({
          color: rgba(rampDepth(t), 0.25 + 0.75 * t),
          lw: 0.7 + 1.3 * t
        });
      }

      function rebuild() {
        st.verts = buildDragon3(st.depth);
        st.vCount = st.verts.length / 3;
        st.segCount = st.vCount - 1;
        // 包围盒中心与包围球半径
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < st.verts.length; i += 3) {
          const x = st.verts[i], y = st.verts[i + 1], z = st.verts[i + 2];
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }
        st.cx = (minX + maxX) / 2;
        st.cy = (minY + maxY) / 2;
        st.cz = (minZ + maxZ) / 2;
        let r2 = 0;
        for (let i = 0; i < st.verts.length; i += 3) {
          const dx = st.verts[i] - st.cx, dy = st.verts[i + 1] - st.cy, dz = st.verts[i + 2] - st.cz;
          r2 = Math.max(r2, dx * dx + dy * dy + dz * dz);
        }
        st.radius = Math.sqrt(r2) || 1;
        st.sx = new Float32Array(st.vCount);
        st.sy = new Float32Array(st.vCount);
        st.zv = new Float32Array(st.vCount);
        st.order = new Uint32Array(st.segCount);
        for (let i = 0; i < st.segCount; i++) st.order[i] = i;
        updateFacts();
      }

      function updateFacts() {
        const seg = Math.pow(2, st.depth);
        $('d3SegVal').innerHTML = '2<sup>' + st.depth + '</sup> = ' + seg + ' / ' + (seg + 1);
        $('d3Fact').innerHTML =
          '三维变体规则：中点 <b>m = (p₁+p₂)/2 + ((p₂−p₁)×ẑ) / 2</b>，在水平垂直方向抬升后继续二分递归。'
          + '当前 <b>' + seg + '</b> 段、<b>' + (seg + 1) + '</b> 顶点；按深度排序绘制，近处亮、远处暗。可拖拽旋转、滚轮缩放。';
      }

      function render() {
        paintBackground(ctx, st.w, st.h, bgCache);
        if (!st.verts || st.w < 2) return;

        const ca = Math.cos(st.az), sa = Math.sin(st.az);
        const ce = Math.cos(st.el), se = Math.sin(st.el);
        const base = Math.min(st.w, st.h) * 0.4 / st.radius;
        const dCam = 4.2 * st.radius;
        const v = st.verts;
        let minZ = Infinity, maxZ = -Infinity;

        // 三维 → 二维透视投影
        for (let i = 0; i < st.vCount; i++) {
          const x = v[i * 3] - st.cx, y = v[i * 3 + 1] - st.cy, z = v[i * 3 + 2] - st.cz;
          const x1 = x * ca + z * sa;           // 绕 Y 轴（方位角）
          const z1 = -x * sa + z * ca;
          const y1 = y * ce - z1 * se;          // 绕 X 轴（俯仰角）
          const z2 = y * se + z1 * ce;
          const persp = dCam / (dCam - z2);
          st.zv[i] = z2;
          st.sx[i] = st.w / 2 + x1 * persp * base * st.zoom;
          st.sy[i] = st.h / 2 - y1 * persp * base * st.zoom;
          if (z2 < minZ) minZ = z2;
          if (z2 > maxZ) maxZ = z2;
        }
        const zRange = maxZ - minZ || 1;

        // 线段按平均深度从远到近排序
        st.order.sort((a, b) => (st.zv[a] + st.zv[a + 1]) - (st.zv[b] + st.zv[b + 1]));

        ctx.lineCap = 'round';
        // 辉光层：段数较少时整图宽线低透明度打底
        if (st.segCount <= 3072) {
          const gp = new Path2D();
          for (let k = 0; k < st.segCount; k++) {
            const i = st.order[k];
            gp.moveTo(st.sx[i], st.sy[i]);
            gp.lineTo(st.sx[i + 1], st.sy[i + 1]);
          }
          ctx.strokeStyle = 'rgba(124,92,255,0.10)';
          ctx.lineWidth = 3.4;
          ctx.stroke(gp);
        }

        // 主层：深度相近的连续段合并为同一路径，减少描边次数
        let path = new Path2D();
        let curBucket = -1;
        const flush = () => {
          if (curBucket >= 0) {
            const sty = depthStyles[curBucket];
            ctx.strokeStyle = sty.color;
            ctx.lineWidth = sty.lw;
            ctx.stroke(path);
          }
        };
        for (let k = 0; k < st.segCount; k++) {
          const i = st.order[k];
          const t = ((st.zv[i] + st.zv[i + 1]) / 2 - minZ) / zRange;
          const b = clamp((t * DB) | 0, 0, DB - 1);
          if (b !== curBucket) {
            flush();
            path = new Path2D();
            curBucket = b;
          }
          path.moveTo(st.sx[i], st.sy[i]);
          path.lineTo(st.sx[i + 1], st.sy[i + 1]);
        }
        flush();

        // 实时视角读数（数值变化时才写 DOM）
        const angText = Math.round(st.az * 180 / Math.PI) + '° / ' + Math.round(st.el * 180 / Math.PI) + '°';
        const zoomText = st.zoom.toFixed(2) + ' ×';
        if (angText !== st.angText) { st.angText = angText; $('d3AngVal').textContent = angText; }
        if (zoomText !== st.zoomText) { st.zoomText = zoomText; $('d3ZoomVal').textContent = zoomText; }
      }

      function frame(dt) {
        if (st.auto && !st.dragging) st.az += dt * 0.15;
        render(); // 自转/交互需要持续渲染
      }

      /* ----- 指针交互（鼠标 + 触摸统一） ----- */
      function onDown(e) {
        st.dragging = true;
        st.lastX = e.clientX; st.lastY = e.clientY;
        canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      }
      function onMove(e) {
        if (!st.dragging) return;
        const dx = e.clientX - st.lastX, dy = e.clientY - st.lastY;
        st.lastX = e.clientX; st.lastY = e.clientY;
        st.az += dx * 0.008;
        st.el = clamp(st.el + dy * 0.008, -1.45, 1.45);
      }
      function onUp() { st.dragging = false; }
      function onWheel(e) {
        e.preventDefault();
        st.zoom = clamp(st.zoom * Math.exp(-e.deltaY * 0.001), 0.5, 4);
        settings.dragon3.az = st.az;
        settings.dragon3.el = st.el;
        settings.dragon3.zoom = st.zoom;
        saveSettings();
      }

      return {
        canvas,
        enter() {
          const r = fitCanvas(canvas);
          st.w = r.w; st.h = r.h;
          st.depth = settings.dragon3.depth;
          st.az = settings.dragon3.az;
          st.el = settings.dragon3.el;
          st.zoom = settings.dragon3.zoom;
          st.auto = settings.dragon3.auto;
          rebuild();
          canvas.addEventListener('pointerdown', onDown);
          host.addEventListener('pointermove', onMove);
          host.addEventListener('pointerup', onUp);
          canvas.addEventListener('wheel', onWheel, { passive: false });
        },
        exit() {
          st.dragging = false;
          canvas.removeEventListener('pointerdown', onDown);
          host.removeEventListener('pointermove', onMove);
          host.removeEventListener('pointerup', onUp);
          canvas.removeEventListener('wheel', onWheel);
          // 退出时保存视角
          settings.dragon3.az = st.az;
          settings.dragon3.el = st.el;
          settings.dragon3.zoom = st.zoom;
          saveSettings();
        },
        resize() {
          const r = fitCanvas(canvas);
          st.w = r.w; st.h = r.h;
        },
        render, frame,
        setDepth(n) {
          st.depth = n;
          settings.dragon3.depth = n; saveSettings();
          $('d3DepthVal').textContent = n;
          rebuild(); // 最深 12 阶仅 4096 段，O(n) 直接生成
        },
        setAuto(v) {
          st.auto = v;
          settings.dragon3.auto = v; saveSettings();
        },
        resetView() {
          st.az = DEFAULT_VIEW.az;
          st.el = DEFAULT_VIEW.el;
          st.zoom = DEFAULT_VIEW.zoom;
          settings.dragon3.az = st.az;
          settings.dragon3.el = st.el;
          settings.dragon3.zoom = st.zoom;
          saveSettings();
        }
      };
    })();

    /* ==========================================================
       展品 ④ 分形树（递归二叉 + 微风 + 光点叶 + 落叶彩蛋）
       ========================================================== */
    const tree = (function () {
      const canvas = $('treeCanvas');
      const ctx = canvas.getContext('2d');
      const bgCache = {};

      const st = {
        w: 0, h: 0,
        depth: 9, angleDeg: 25, ratio: 0.72, wind: true,
        t: 0, dt: 0,
        leafX: null, leafY: null, leafPhase: null, leafSize: null, leafCount: 0,
        falling: [], pending: 0,
        dirty: true
      };

      function allocLeaves() {
        const tips = Math.pow(2, st.depth);
        st.leafX = new Float32Array(tips);
        st.leafY = new Float32Array(tips);
        st.leafPhase = new Float32Array(tips);
        st.leafSize = new Float32Array(tips);
        for (let i = 0; i < tips; i++) {
          st.leafPhase[i] = Math.random() * Math.PI * 2;
          st.leafSize[i] = 3 + Math.random() * 3;
        }
      }

      function updateFacts() {
        const tips = Math.pow(2, st.depth);
        $('treeLeafVal').innerHTML = '2<sup>' + st.depth + '</sup> = ' + tips;
        $('treeBranchVal').textContent = tips - 1;
        $('treeFact').innerHTML =
          '递归规则：每根枝条末端旋转 <b>±' + st.angleDeg + '°</b> 复制为两枝，长度乘 <b>' + st.ratio.toFixed(2)
          + '</b>。当前末端 <b>' + tips + '</b> 个生长点、<b>' + (tips - 1) + '</b> 段枝条；'
          + '微风下摆动角按正弦变化，末端为光点粒子。';
      }

      // 递归画枝，末端记录叶点
      function branch(x, y, a, len, level, baseW) {
        const depthRatio = level / st.depth;
        const sway = st.wind
          ? Math.sin(st.t * 1.5 + x * 0.012 + level * 0.7) * (0.012 + level * 0.006)
          : 0;
        const aa = a + sway;
        const x2 = x + Math.cos(aa) * len;
        const y2 = y + Math.sin(aa) * len;

        ctx.strokeStyle = rgba(mixRgb(C_PURPLE, C_CYAN, depthRatio), 0.92);
        ctx.lineWidth = Math.max(0.6, baseW * (1 - depthRatio * 0.92));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        if (level >= st.depth) {
          const idx = st.leafCount++;
          if (idx < st.leafX.length) { st.leafX[idx] = x2; st.leafY[idx] = y2; }
          return;
        }
        const ar = st.angleDeg * Math.PI / 180;
        branch(x2, y2, aa - ar, len * st.ratio, level + 1, baseW);
        branch(x2, y2, aa + ar, len * st.ratio, level + 1, baseW);
      }

      function render() {
        paintBackground(ctx, st.w, st.h, bgCache);
        if (st.w < 2) return;

        // 初始枝条长度：同时约束树高与展宽
        let geoLen = 0;
        for (let k = 0; k < st.depth; k++) geoLen += Math.pow(st.ratio, k);
        const byHeight = (st.h - 80) / geoLen * 0.98;
        const sinA = Math.sin(st.angleDeg * Math.PI / 180);
        const byWidth = (st.w * 0.46) / (sinA * geoLen);
        const len0 = Math.min(byHeight, byWidth);
        const baseW = clamp(st.w * 0.005, 1.5, 8);

        st.leafCount = 0;
        ctx.lineCap = 'round';
        branch(st.w / 2, st.h - 26, -Math.PI / 2, len0, 0, baseW);

        // 光点叶（粉 / 琥珀交替，带轻微闪烁）
        for (let i = 0; i < st.leafCount; i++) {
          const tw = 0.7 + 0.3 * Math.sin(st.t * 2 + st.leafPhase[i]);
          const col = (i & 1) ? C_PINK : C_AMBER;
          const r = st.leafSize[i] * (1 + 0.15 * Math.sin(st.t * 2.4 + st.leafPhase[i]));
          drawGlow(ctx, st.leafX[i], st.leafY[i], r * 2.4, col, 0.35 * tw);
          drawGlow(ctx, st.leafX[i], st.leafY[i], r * 0.9, col, 0.85 * tw);
        }

        // 飘落中的叶子（按帧时间步进，正弦横向漂移）
        for (let i = st.falling.length - 1; i >= 0; i--) {
          const p = st.falling[i];
          p.y += p.vy * st.dt;
          p.x += Math.sin(st.t * 2.2 + p.phase) * 26 * st.dt;
          const fade = clamp((st.h + 24 - p.y) / 120, 0, 1);
          drawGlow(ctx, p.x, p.y, p.size * 2.2, p.col, 0.3 * fade);
          drawGlow(ctx, p.x, p.y, p.size, p.col, 0.9 * fade);
          if (p.y > st.h + 24) st.falling.splice(i, 1);
        }
        st.dirty = false;
      }

      function frame(dt) {
        st.t += dt;
        st.dt = dt;
        // 消费落叶请求
        while (st.pending > 0) {
          st.pending--;
          if (st.leafCount > 0 && st.falling.length < 20) {
            const idx = (Math.random() * st.leafCount) | 0;
            st.falling.push({
              x: st.leafX[idx], y: st.leafY[idx],
              vy: 26 + Math.random() * 22,
              phase: Math.random() * Math.PI * 2,
              size: 3.5 + Math.random() * 2.5,
              col: (idx & 1) ? C_PINK : C_AMBER
            });
          }
        }
        if (st.wind || st.falling.length > 0 || st.dirty) render();
      }

      return {
        canvas,
        enter() {
          const r = fitCanvas(canvas);
          st.w = r.w; st.h = r.h;
          st.depth = settings.tree.depth;
          st.angleDeg = settings.tree.angle;
          st.ratio = settings.tree.ratio / 100;
          st.wind = settings.tree.wind;
          allocLeaves();
          st.falling.length = 0;
          st.t = 0;
          updateFacts();
          st.dirty = true;
        },
        exit() {},
        resize() {
          const r = fitCanvas(canvas);
          st.w = r.w; st.h = r.h;
          st.dirty = true;
        },
        render, frame,
        setDepth(n) {
          st.depth = n;
          settings.tree.depth = n; saveSettings();
          $('treeDepthVal').textContent = n;
          allocLeaves();
          updateFacts();
          st.dirty = true;
        },
        setAngle(v) {
          st.angleDeg = v;
          settings.tree.angle = v; saveSettings();
          $('treeAngleVal').textContent = v;
          updateFacts();
          st.dirty = true;
        },
        setRatio(v) {
          st.ratio = v / 100;
          settings.tree.ratio = v; saveSettings();
          $('treeRatioVal').textContent = v;
          updateFacts();
          st.dirty = true;
        },
        setWind(v) {
          st.wind = v;
          settings.tree.wind = v; saveSettings();
          st.dirty = true;
        },
        dropLeaf() { st.pending++; }
      };
    })();

    halls.koch = koch;
    halls.dragon2 = dragon2;
    halls.dragon3 = dragon3;
    halls.tree = tree;

    /* ---------- 展品切换 ---------- */
    const tabEls = doc.querySelectorAll('.tab');
    const hallEls = doc.querySelectorAll('.hall');

    function enterHall(name) {
      if (activeName && halls[activeName]) halls[activeName].exit();
      activeName = name;
      settings.hall = name;
      saveSettings();
      tabEls.forEach((b) => b.classList.toggle('active', b.dataset.hall === name));
      hallEls.forEach((sec) => sec.classList.toggle('active', sec.id === 'sec-' + name));
      $('tipBar').textContent = doc.getElementById('sec-' + name).dataset.tip;
      // 等 display 生效后再测量画布
      requestAnimationFrame(() => halls[name].enter());
    }

    tabEls.forEach((btn) => btn.addEventListener('click', () => enterHall(btn.dataset.hall)));

    /* ---------- 控件绑定：科赫 ---------- */
    $('kochDepth').addEventListener('input', (e) => koch.setDepth(parseInt(e.target.value, 10)));
    $('kochSpeed').addEventListener('input', (e) => koch.setSpeed(parseFloat(e.target.value)));
    $('kochPlayBtn').addEventListener('click', () => koch.togglePlay());
    $('kochReplayBtn').addEventListener('click', () => koch.replay());
    doc.querySelectorAll('[data-koch-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        doc.querySelectorAll('[data-koch-mode]').forEach((b) => b.classList.toggle('active', b === btn));
        koch.setMode(btn.dataset.kochMode);
      });
    });

    /* ---------- 控件绑定：二维龙曲线 ---------- */
    $('d2Depth').addEventListener('input', (e) => dragon2.setDepth(parseInt(e.target.value, 10)));
    $('d2Speed').addEventListener('input', (e) => dragon2.setSpeed(parseFloat(e.target.value)));
    $('d2DrawBtn').addEventListener('click', () => dragon2.draw());

    /* ---------- 控件绑定：三维龙曲线 ---------- */
    $('d3Depth').addEventListener('input', (e) => dragon3.setDepth(parseInt(e.target.value, 10)));
    $('d3Auto').addEventListener('change', (e) => dragon3.setAuto(e.target.checked));
    $('d3ResetBtn').addEventListener('click', () => dragon3.resetView());

    /* ---------- 控件绑定：分形树 ---------- */
    $('treeDepth').addEventListener('input', (e) => tree.setDepth(parseInt(e.target.value, 10)));
    $('treeAngle').addEventListener('input', (e) => tree.setAngle(parseInt(e.target.value, 10)));
    $('treeRatio').addEventListener('input', (e) => tree.setRatio(parseInt(e.target.value, 10)));
    $('treeWind').addEventListener('change', (e) => tree.setWind(e.target.checked));
    $('leafFallBtn').addEventListener('click', () => tree.dropLeaf());

    /* ---------- 导出 PNG ---------- */
    $('exportBtn').addEventListener('click', exportPNG);

    /* ---------- 按保存的设置初始化控件 ---------- */
    function applySettingsToUI() {
      $('kochDepth').value = settings.koch.depth;
      $('kochDepthVal').textContent = settings.koch.depth;
      $('kochSpeed').value = settings.koch.speed;
      $('kochSpeedVal').textContent = settings.koch.speed.toFixed(1);
      doc.querySelectorAll('[data-koch-mode]').forEach((b) => {
        b.classList.toggle('active', b.dataset.kochMode === settings.koch.mode);
      });

      $('d2Depth').value = settings.dragon2.depth;
      $('d2DepthVal').textContent = settings.dragon2.depth;
      $('d2Speed').value = settings.dragon2.speed;
      $('d2SpeedVal').textContent = settings.dragon2.speed.toFixed(1);

      $('d3Depth').value = settings.dragon3.depth;
      $('d3DepthVal').textContent = settings.dragon3.depth;
      $('d3Auto').checked = settings.dragon3.auto;

      $('treeDepth').value = settings.tree.depth;
      $('treeDepthVal').textContent = settings.tree.depth;
      $('treeAngle').value = settings.tree.angle;
      $('treeAngleVal').textContent = settings.tree.angle;
      $('treeRatio').value = settings.tree.ratio;
      $('treeRatioVal').textContent = settings.tree.ratio;
      $('treeWind').checked = settings.tree.wind;
    }
    applySettingsToUI();

    /* ---------- 窗口尺寸变化 ---------- */
    let resizeTimer = null;
    host.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (halls[activeName]) halls[activeName].resize(); }, 100);
    });

    /* ---------- 全局动画循环：只驱动当前展品 ---------- */
    let last = performance.now();
    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const hall = halls[activeName];
      if (hall) hall.frame(dt);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    // 进入上次参观的展品
    enterHall(settings.hall);
  }

  /* ============================================================
     四、对外自测接口（浏览器挂载到全局，Node 中用于自动化测试）
     ============================================================ */
  host.__FRACTAL__ = {
    buildKochLevels,
    buildDragon2,
    buildDragon3,
    exportPNG,
    version: '1.0'
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
