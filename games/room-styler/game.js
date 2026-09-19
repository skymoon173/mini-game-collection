/* ============================================================
 * 智能装修工坊 —— 纯前端房间装修工具
 * 流程：载入房间照片 → 光感增强 → 涂抹墙面换色（保留明暗纹理）
 *      → 拖放矢量家具贴纸 → 前后对比 → 导出对比图
 * 所有处理均在浏览器本地完成，照片不会被上传。
 * ============================================================ */
(function () {
  'use strict';

  /* ================= 基础工具 ================= */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // 下一帧执行：rAF 优先；页面不可见（后台标签/无头环境）时 rAF 会被暂停，
  // 用 setTimeout 兜底，保证回调恰好执行一次
  function nextFrame(cb) {
    var done = false, rafId = 0, timerId = 0;
    function fire() {
      if (done) return;
      done = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
      cb();
    }
    rafId = requestAnimationFrame(fire);
    timerId = setTimeout(fire, 60);
    return fire;
  }

  // 捕获指针可能因合成事件/指针已结束而抛错，统一安全包装
  function safeCapture(el, id) {
    try { el.setPointerCapture(id); } catch (err) { /* 忽略 */ }
  }

  // Canvas → PNG Blob：优先 toBlob；不支持、抛错或 1 秒内未回调时用 toDataURL 降级
  function canvasToPNGBlob(cv, cb) {
    var settled = false;
    function finish(blob) { if (!settled) { settled = true; cb(blob); } }
    function viaDataURL() {
      try {
        var url = cv.toDataURL('image/png');
        var bin = atob(String(url).split(',')[1]);
        var u8 = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        finish(new Blob([u8.buffer], { type: 'image/png' }));
      } catch (err) { finish(null); }
    }
    var timer = setTimeout(viaDataURL, 1000);
    if (typeof cv.toBlob === 'function') {
      try {
        cv.toBlob(function (blob) {
          clearTimeout(timer);
          if (blob) finish(blob); else viaDataURL();
        }, 'image/png');
      } catch (err) { clearTimeout(timer); viaDataURL(); }
    } else {
      clearTimeout(timer); viaDataURL();
    }
  }

  // #rrggbb → [r,g,b]
  function hexToRgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /* RGB → HSL，h:0~360，s/l:0~1 */
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    var d = max - min;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }

  /* HSL → RGB（返回 0~255 整数） */
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    function hue(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue(p, q, h + 1 / 3);
      g = hue(p, q, h);
      b = hue(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  /*
   * 墙面换色核心：替换色相 H 与适度饱和度 S，保留原亮度 L（保留光影纹理）。
   * amount 为蒙版强度 0~1，按强度与原像素混合。
   */
  function recolorPixel(r, g, b, targetHue, targetSat, amount) {
    var hsl = rgbToHsl(r, g, b);
    var nh = targetHue;
    var ns = clamp(hsl[1] * 0.15 + targetSat * 0.85, 0, 1); // 适度替换饱和度
    var nl = hsl[2];                                        // 亮度通道原样保留
    var nr = hslToRgb(nh, ns, nl);
    return [
      Math.round(lerp(r, nr[0], amount)),
      Math.round(lerp(g, nr[1], amount)),
      Math.round(lerp(b, nr[2], amount))
    ];
  }

  // 圆角矩形路径
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /* ============================================================
   * 程序化矢量家具库：每件家具在以 (0,0) 为中心的单位坐标系绘制，
   * w/h 为包围盒尺寸；通过保存的绘制函数 + 仿射变换参与渲染与导出。
   * ============================================================ */
  var FURNITURE = {
    /* ---------- 沙发 ---------- */
    sofa: {
      name: '沙发', w: 252, h: 152,
      draw: function (c) {
        // 落地阴影
        c.fillStyle = 'rgba(0,0,0,.22)';
        c.beginPath(); c.ellipse(0, 64, 120, 15, 0, 0, Math.PI * 2); c.fill();
        // 靠背
        c.fillStyle = '#39877d';
        rr(c, -108, -64, 216, 88, 20); c.fill();
        // 靠垫分块
        c.fillStyle = '#46a195';
        rr(c, -100, -56, 96, 60, 14); c.fill();
        rr(c, 4, -56, 96, 60, 14); c.fill();
        c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(0, -52); c.lineTo(0, 2); c.stroke();
        // 抱枕
        c.save();
        c.translate(-78, -46); c.rotate(-0.12);
        c.fillStyle = '#ffb347'; rr(c, -22, -18, 44, 38, 10); c.fill();
        c.restore();
        c.save();
        c.translate(78, -46); c.rotate(0.12);
        c.fillStyle = '#ff5ca8'; rr(c, -22, -18, 44, 38, 10); c.fill();
        c.restore();
        // 扶手
        c.fillStyle = '#327a72';
        rr(c, -126, -36, 32, 94, 14); c.fill();
        rr(c, 94, -36, 32, 94, 14); c.fill();
        // 座面
        c.fillStyle = '#4fae9f';
        rr(c, -98, -18, 196, 66, 20); c.fill();
        c.strokeStyle = 'rgba(0,0,0,.10)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(-2, -12); c.lineTo(-2, 42); c.stroke();
        // 椅脚
        c.fillStyle = '#5a4636';
        c.fillRect(-102, 44, 10, 16);
        c.fillRect(92, 44, 10, 16);
        c.fillRect(-44, 46, 9, 12);
        c.fillRect(35, 46, 9, 12);
      }
    },

    /* ---------- 绿植 ---------- */
    plant: {
      name: '绿植', w: 124, h: 188,
      draw: function (c) {
        c.fillStyle = 'rgba(0,0,0,.2)';
        c.beginPath(); c.ellipse(0, 88, 44, 10, 0, 0, Math.PI * 2); c.fill();
        // 茎
        c.strokeStyle = '#2f7d46'; c.lineCap = 'round';
        var stems = [
          [-34, -20], [30, -34], [0, -52], [-14, -80], [16, -90], [-46, -58], [44, -66]
        ];
        c.lineWidth = 4;
        for (var i = 0; i < stems.length; i++) {
          c.beginPath(); c.moveTo(0, 18);
          c.quadraticCurveTo(stems[i][0] * 0.3, -10, stems[i][0], stems[i][1] + 18);
          c.stroke();
        }
        // 叶片
        function leaf(x, y, ang, rx, ry, col) {
          c.save();
          c.translate(x, y); c.rotate(ang);
          c.fillStyle = col;
          c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); c.fill();
          c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(0, -ry + 4); c.lineTo(0, ry - 4); c.stroke();
          c.restore();
        }
        leaf(-36, -24, -0.7, 11, 27, '#3f9d5a');
        leaf(32, -38, 0.6, 11, 27, '#58b972');
        leaf(0, -58, 0, 12, 30, '#3f9d5a');
        leaf(-16, -84, -0.35, 10, 25, '#58b972');
        leaf(18, -94, 0.35, 10, 25, '#3f9d5a');
        leaf(-48, -62, -0.9, 10, 24, '#2f7d46');
        leaf(48, -70, 0.9, 10, 24, '#58b972');
        // 花盆
        c.fillStyle = '#c9744a';
        c.beginPath();
        c.moveTo(-40, 18); c.lineTo(40, 18); c.lineTo(32, 86); c.lineTo(-32, 86);
        c.closePath(); c.fill();
        c.fillStyle = 'rgba(0,0,0,.12)';
        c.beginPath();
        c.moveTo(20, 20); c.lineTo(38, 20); c.lineTo(31, 84); c.lineTo(22, 84);
        c.closePath(); c.fill();
        c.fillStyle = '#d9875c';
        rr(c, -44, 6, 88, 20, 8); c.fill();
        c.fillStyle = '#8a4f30';
        c.fillRect(-34, 10, 68, 6);
      }
    },

    /* ---------- 落地灯 ---------- */
    lamp: {
      name: '落地灯', w: 104, h: 214,
      draw: function (c) {
        // 光晕
        var glow = c.createRadialGradient(0, -68, 6, 0, -68, 78);
        glow.addColorStop(0, 'rgba(255,222,140,.42)');
        glow.addColorStop(1, 'rgba(255,222,140,0)');
        c.fillStyle = glow;
        c.beginPath(); c.arc(0, -68, 78, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(0,0,0,.22)';
        c.beginPath(); c.ellipse(0, 92, 38, 10, 0, 0, Math.PI * 2); c.fill();
        // 底座与灯杆
        c.fillStyle = '#3d4454';
        c.beginPath(); c.ellipse(0, 92, 36, 10, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#586075';
        c.fillRect(-3, -42, 6, 134);
        c.fillStyle = '#454d61';
        c.beginPath(); c.arc(0, -42, 6, 0, Math.PI * 2); c.fill();
        // 灯罩
        c.fillStyle = '#f2d98f';
        c.beginPath();
        c.moveTo(-46, -98); c.lineTo(46, -98); c.lineTo(28, -34); c.lineTo(-28, -34);
        c.closePath(); c.fill();
        c.fillStyle = 'rgba(0,0,0,.10)';
        c.beginPath();
        c.moveTo(14, -96); c.lineTo(44, -96); c.lineTo(27, -36); c.lineTo(12, -36);
        c.closePath(); c.fill();
        // 灯罩内暖光
        c.fillStyle = '#fff3c8';
        c.beginPath(); c.ellipse(0, -34, 28, 6, 0, 0, Math.PI * 2); c.fill();
      }
    },

    /* ---------- 挂画 ---------- */
    painting: {
      name: '挂画', w: 164, h: 124,
      draw: function (c) {
        c.fillStyle = 'rgba(0,0,0,.22)';
        c.beginPath(); c.ellipse(0, 58, 72, 10, 0, 0, Math.PI * 2); c.fill();
        // 画框
        c.fillStyle = '#b08a55';
        rr(c, -82, -60, 164, 118, 10); c.fill();
        c.fillStyle = '#8f6c3f';
        rr(c, -82, 30, 164, 28, 10); c.fill();
        // 画面
        c.fillStyle = '#f6f1e7';
        rr(c, -70, -48, 140, 92, 4); c.fill();
        // 抽象图案：圆日 + 山丘 + 小方块
        c.fillStyle = '#ff5ca8';
        c.beginPath(); c.arc(-26, -20, 18, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#22b8d0';
        c.beginPath();
        c.moveTo(-70, 44);
        c.quadraticCurveTo(-30, 6, 0, 26);
        c.quadraticCurveTo(30, 44, 70, 14);
        c.lineTo(70, 44); c.closePath(); c.fill();
        c.fillStyle = '#7c5cff';
        c.fillRect(26, -36, 20, 20);
        c.strokeStyle = '#ffb347'; c.lineWidth = 4; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-58, -38); c.lineTo(-10, -38); c.stroke();
      }
    },

    /* ---------- 地毯 ---------- */
    rug: {
      name: '地毯', w: 262, h: 162,
      draw: function (c) {
        c.fillStyle = 'rgba(0,0,0,.18)';
        c.beginPath(); c.ellipse(0, 8, 130, 76, 0, 0, Math.PI * 2); c.fill();
        // 两端流苏
        c.strokeStyle = '#caa06a'; c.lineWidth = 3; c.lineCap = 'round';
        for (var i = -3; i <= 3; i++) {
          c.beginPath(); c.moveTo(-126, i * 16); c.lineTo(-140, i * 16 + (i % 2 ? 4 : -4)); c.stroke();
          c.beginPath(); c.moveTo(126, i * 16); c.lineTo(140, i * 16 + (i % 2 ? -4 : 4)); c.stroke();
        }
        // 毯面
        c.fillStyle = '#b04a7a';
        c.beginPath(); c.ellipse(0, 0, 128, 74, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#f0e4ec';
        c.beginPath(); c.ellipse(0, 0, 110, 60, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(176,74,122,.55)'; c.lineWidth = 3;
        c.beginPath(); c.ellipse(0, 0, 96, 50, 0, 0, Math.PI * 2); c.stroke();
        // 中央菱纹
        c.fillStyle = '#d98ab0';
        for (var j = -2; j <= 2; j++) {
          c.save();
          c.translate(j * 34, 0); c.rotate(Math.PI / 4);
          c.fillRect(-7, -7, 14, 14);
          c.restore();
        }
      }
    },

    /* ---------- 圆桌 ---------- */
    table: {
      name: '圆桌', w: 172, h: 164,
      draw: function (c) {
        c.fillStyle = 'rgba(0,0,0,.22)';
        c.beginPath(); c.ellipse(0, 88, 46, 11, 0, 0, Math.PI * 2); c.fill();
        // 支柱与底盘
        c.fillStyle = '#8a663f';
        rr(c, -9, -8, 18, 88, 6); c.fill();
        c.fillStyle = '#a87f4e';
        c.beginPath(); c.ellipse(0, 84, 40, 11, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#8a663f';
        c.beginPath(); c.ellipse(0, 80, 40, 10, 0, 0, Math.PI * 2); c.fill();
        // 桌筒侧壁
        c.fillStyle = '#9a7145';
        c.beginPath();
        c.moveTo(-84, -32); c.lineTo(84, -32); c.lineTo(84, -18);
        c.ellipse(0, -18, 84, 16, 0, 0, Math.PI, false);
        c.closePath(); c.fill();
        // 桌面
        c.fillStyle = '#d2a86b';
        c.beginPath(); c.ellipse(0, -32, 84, 28, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,.20)';
        c.beginPath(); c.ellipse(-14, -38, 52, 11, -0.08, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(120,80,40,.35)'; c.lineWidth = 2;
        c.beginPath(); c.ellipse(0, -32, 84, 28, 0, 0, Math.PI * 2); c.stroke();
      }
    },

    /* ---------- 书架 ---------- */
    bookshelf: {
      name: '书架', w: 172, h: 214,
      draw: function (c) {
        c.fillStyle = 'rgba(0,0,0,.24)';
        c.beginPath(); c.ellipse(0, 104, 80, 12, 0, 0, Math.PI * 2); c.fill();
        // 外框与背板
        c.fillStyle = '#8d6e52';
        rr(c, -84, -102, 168, 204, 8); c.fill();
        c.fillStyle = '#6e5440';
        rr(c, -76, -94, 152, 188, 4); c.fill();
        // 隔板
        c.fillStyle = '#a9855f';
        var shelves = [-54, -6, 42];
        for (var s = 0; s < shelves.length; s++) {
          c.fillRect(-76, shelves[s], 152, 8);
        }
        c.fillRect(-76, 90, 152, 6);
        // 书本（确定性排布）
        var palette = ['#e85d75', '#f0a747', '#5aa9e6', '#5bbf8a', '#b07be0', '#e8d85a', '#e8805a'];
        var rows = [
          { top: -92, bottom: -56 },
          { top: -52, bottom: -8 },
          { top: -4, bottom: 40 }
        ];
        for (var r = 0; r < rows.length; r++) {
          var x = -70;
          var k = 0;
          while (x < 60) {
            var bw = 9 + ((k * 7 + r * 3) % 7);
            var bh = rows[r].bottom - rows[r].top - 4 - ((k * 5) % 12);
            c.fillStyle = palette[(k + r * 2) % palette.length];
            c.fillRect(x, rows[r].bottom - bh, bw, bh);
            c.fillStyle = 'rgba(255,255,255,.25)';
            c.fillRect(x + 2, rows[r].bottom - bh + 3, 2, bh - 6);
            x += bw + 3;
            k++;
          }
        }
        // 底格：横放书堆
        var stackCols = ['#5aa9e6', '#e85d75', '#f0a747'];
        for (var m = 0; m < 3; m++) {
          c.fillStyle = stackCols[m];
          c.fillRect(-60 + m * 34, 84 - m * 9, 30 + m * 12, 7);
        }
      }
    },

    /* ---------- 猫咪 ---------- */
    cat: {
      name: '猫咪', w: 144, h: 128,
      draw: function (c) {
        c.fillStyle = 'rgba(0,0,0,.2)';
        c.beginPath(); c.ellipse(0, 66, 52, 10, 0, 0, Math.PI * 2); c.fill();
        // 尾巴
        c.strokeStyle = '#e89b4e'; c.lineWidth = 13; c.lineCap = 'round';
        c.beginPath();
        c.moveTo(26, 44);
        c.bezierCurveTo(62, 54, 66, 4, 40, -2);
        c.stroke();
        c.strokeStyle = '#c97e36'; c.lineWidth = 4;
        c.beginPath();
        c.moveTo(30, 42);
        c.bezierCurveTo(56, 50, 58, 10, 40, 5);
        c.stroke();
        // 身体
        c.fillStyle = '#e89b4e';
        c.beginPath(); c.ellipse(0, 22, 38, 44, 0, 0, Math.PI * 2); c.fill();
        // 肚皮
        c.fillStyle = '#f7c98f';
        c.beginPath(); c.ellipse(0, 34, 22, 30, 0, 0, Math.PI * 2); c.fill();
        // 前爪
        c.fillStyle = '#f7c98f';
        c.beginPath(); c.ellipse(-15, 58, 12, 8, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(15, 58, 12, 8, 0, 0, Math.PI * 2); c.fill();
        // 耳朵
        c.fillStyle = '#e89b4e';
        c.beginPath();
        c.moveTo(-28, -50); c.lineTo(-8, -52); c.lineTo(-20, -72); c.closePath(); c.fill();
        c.beginPath();
        c.moveTo(28, -50); c.lineTo(8, -52); c.lineTo(20, -72); c.closePath(); c.fill();
        c.fillStyle = '#f3a7b8';
        c.beginPath();
        c.moveTo(-24, -53); c.lineTo(-13, -54); c.lineTo(-19, -65); c.closePath(); c.fill();
        c.beginPath();
        c.moveTo(24, -53); c.lineTo(13, -54); c.lineTo(19, -65); c.closePath(); c.fill();
        // 头
        c.fillStyle = '#e89b4e';
        c.beginPath(); c.arc(0, -30, 30, 0, Math.PI * 2); c.fill();
        // 头部斑纹
        c.strokeStyle = '#c97e36'; c.lineWidth = 3; c.lineCap = 'round';
        for (var st = -1; st <= 1; st++) {
          c.beginPath();
          c.moveTo(st * 8, -56);
          c.lineTo(st * 8 + (st === 0 ? 0 : st * 3), -46);
          c.stroke();
        }
        // 背部斑纹
        c.lineWidth = 3.5;
        c.beginPath(); c.arc(-14, 6, 16, -2.4, -1.0); c.stroke();
        c.beginPath(); c.arc(14, 2, 15, -2.1, -0.8); c.stroke();
        // 眼睛
        c.fillStyle = '#2f7d46';
        c.beginPath(); c.ellipse(-11, -32, 5.5, 7, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(11, -32, 5.5, 7, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#10131a';
        c.beginPath(); c.arc(-10, -31, 2.4, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(12, -31, 2.4, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(-11, -34, 1.3, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(11, -34, 1.3, 0, Math.PI * 2); c.fill();
        // 鼻嘴
        c.fillStyle = '#e07a92';
        c.beginPath();
        c.moveTo(-3.5, -22); c.lineTo(3.5, -22); c.lineTo(0, -18); c.closePath(); c.fill();
        c.strokeStyle = '#8a5a30'; c.lineWidth = 1.6;
        c.beginPath(); c.arc(-3, -17, 3, 0.2, Math.PI - 0.2); c.stroke();
        c.beginPath(); c.arc(3, -17, 3, 0.2, Math.PI - 0.2); c.stroke();
        // 胡须
        c.strokeStyle = 'rgba(60,40,20,.7)'; c.lineWidth = 1.2;
        for (var w = 0; w < 3; w++) {
          c.beginPath(); c.moveTo(-12, -21 + w * 3); c.lineTo(-30, -25 + w * 5); c.stroke();
          c.beginPath(); c.moveTo(12, -21 + w * 3); c.lineTo(30, -25 + w * 5); c.stroke();
        }
      }
    }
  };
  var STICKER_KINDS = ['sofa', 'plant', 'lamp', 'painting', 'rug', 'table', 'bookshelf', 'cat'];

  /* 贴纸数据模型 */
  var stickerSeq = 0;
  function createSticker(kind, x, y, scale) {
    return {
      id: ++stickerSeq,
      kind: kind,
      x: x, y: y,
      scale: (scale === undefined || scale === null) ? 1 : scale,
      rotation: 0,
      flip: false
    };
  }

  /* 世界坐标 → 贴纸局部坐标（考虑平移、旋转、翻转、缩放） */
  function toLocalPoint(st, x, y) {
    var dx = x - st.x, dy = y - st.y;
    var c = Math.cos(-st.rotation), s = Math.sin(-st.rotation);
    var lx = dx * c - dy * s;
    var ly = dx * s + dy * c;
    if (st.flip) lx = -lx;
    return { x: lx / st.scale, y: ly / st.scale };
  }

  /* 点是否命中贴纸包围盒 */
  function hitTestSticker(st, x, y) {
    var f = FURNITURE[st.kind];
    var p = toLocalPoint(st, x, y);
    return Math.abs(p.x) <= f.w / 2 && Math.abs(p.y) <= f.h / 2;
  }

  /* 历史栈（纯数据结构，蒙版与贴纸操作共用，默认上限 20 步） */
  function createHistory(limit) {
    if (!limit) limit = 20;
    var past = [], future = [];
    return {
      push: function (entry) {
        past.push(entry);
        if (past.length > limit) past.shift();
        future.length = 0;
      },
      // current：撤销前由调用方给出的“当前状态”快照，进入重做栈
      undo: function (current) {
        if (!past.length) return null;
        future.push(current);
        return past.pop();
      },
      redo: function (current) {
        if (!future.length) return null;
        past.push(current);
        return future.pop();
      },
      canUndo: function () { return past.length > 0; },
      canRedo: function () { return future.length > 0; },
      clear: function () { past.length = 0; future.length = 0; }
    };
  }

  /* ============================================================
   * 内置示例房间：Canvas 程序化绘制（地板 / 两面墙 / 窗户透光 / 空地毯区）
   * ============================================================ */
  var SAMPLE_W = 1280, SAMPLE_H = 960;
  function makeSampleRoom(cv) {
    cv.width = SAMPLE_W;
    cv.height = SAMPLE_H;
    var c = cv.getContext('2d');

    // 后墙
    var wallGrad = c.createLinearGradient(0, 0, 0, 600);
    wallGrad.addColorStop(0, '#e9e2d4');
    wallGrad.addColorStop(1, '#ded5c4');
    c.fillStyle = wallGrad;
    c.fillRect(0, 0, SAMPLE_W, 600);

    // 左墙（略暗，体现两面墙交界）
    c.fillStyle = '#cfc4ae';
    c.beginPath();
    c.moveTo(0, 0); c.lineTo(230, 110); c.lineTo(230, 600); c.lineTo(0, 720);
    c.closePath(); c.fill();
    // 墙角交界阴影线
    var corner = c.createLinearGradient(224, 110, 246, 110);
    corner.addColorStop(0, 'rgba(0,0,0,.18)');
    corner.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = corner;
    c.beginPath();
    c.moveTo(224, 110); c.lineTo(232, 110); c.lineTo(232, 600); c.lineTo(224, 612);
    c.closePath(); c.fill();

    // 地板
    var floor = c.createLinearGradient(0, 600, 0, 960);
    floor.addColorStop(0, '#b98e5f');
    floor.addColorStop(1, '#9a7146');
    c.fillStyle = floor;
    c.beginPath();
    c.moveTo(230, 600); c.lineTo(SAMPLE_W, 600); c.lineTo(SAMPLE_W, 960); c.lineTo(0, 960);
    c.lineTo(0, 720); c.closePath(); c.fill();
    // 地板透视纹理
    c.strokeStyle = 'rgba(80,50,20,.25)'; c.lineWidth = 3;
    for (var i = 0; i <= 9; i++) {
      var fx = 230 + (SAMPLE_W - 230) * i / 9;
      c.beginPath(); c.moveTo(fx, 600); c.lineTo(fx * 0.55 - 60, 960); c.stroke();
    }
    c.lineWidth = 2;
    for (var j = 1; j <= 4; j++) {
      var y = 600 + (960 - 600) * j / 5;
      c.beginPath(); c.moveTo(0, 720 + (y - 600) * 0.66); c.lineTo(SAMPLE_W, y); c.stroke();
    }
    // 踢脚线
    c.fillStyle = '#f3ece0';
    c.beginPath();
    c.moveTo(230, 600); c.lineTo(SAMPLE_W, 600); c.lineTo(SAMPLE_W, 628); c.lineTo(230, 628);
    c.closePath(); c.fill();
    c.fillStyle = '#e3d9c6';
    c.beginPath();
    c.moveTo(0, 720); c.lineTo(230, 600); c.lineTo(230, 628); c.lineTo(0, 750);
    c.closePath(); c.fill();

    // 窗户
    var wx = 760, wy = 120, ww = 360, wh = 330;
    c.fillStyle = '#fffaf0';
    c.fillRect(wx - 14, wy - 14, ww + 28, wh + 28);
    var sky = c.createLinearGradient(0, wy, 0, wy + wh);
    sky.addColorStop(0, '#aee3ff');
    sky.addColorStop(1, '#e7f6ff');
    c.fillStyle = sky;
    c.fillRect(wx, wy, ww, wh);
    // 窗外云与太阳
    c.fillStyle = 'rgba(255,236,170,.9)';
    c.beginPath(); c.arc(wx + 280, wy + 64, 34, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.85)';
    c.beginPath(); c.ellipse(wx + 96, wy + 96, 52, 20, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(wx + 130, wy + 84, 38, 16, 0, 0, Math.PI * 2); c.fill();
    // 窗棂
    c.strokeStyle = '#fffaf0'; c.lineWidth = 14;
    c.beginPath(); c.moveTo(wx + ww / 2, wy); c.lineTo(wx + ww / 2, wy + wh); c.stroke();
    c.beginPath(); c.moveTo(wx, wy + wh / 2); c.lineTo(wx + ww, wy + wh / 2); c.stroke();
    c.strokeStyle = 'rgba(160,150,130,.5)'; c.lineWidth = 2;
    c.strokeRect(wx, wy, ww, wh);

    // 透进窗内的光束
    var ray = c.createLinearGradient(wx, wy, wx - 420, 760);
    ray.addColorStop(0, 'rgba(255,240,190,.5)');
    ray.addColorStop(1, 'rgba(255,240,190,0)');
    c.fillStyle = ray;
    c.beginPath();
    c.moveTo(wx + 30, wy + wh - 40);
    c.lineTo(wx + ww - 40, wy + wh - 20);
    c.lineTo(wx + 260, 820);
    c.lineTo(wx - 220, 800);
    c.closePath(); c.fill();

    // 空地毯区域（椭圆提示，便于摆放家具）
    c.fillStyle = 'rgba(120,90,60,.18)';
    c.beginPath(); c.ellipse(560, 800, 300, 86, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 4; c.setLineDash([14, 12]);
    c.beginPath(); c.ellipse(560, 800, 300, 86, 0, 0, Math.PI * 2); c.stroke();
    c.setLineDash([]);

    return cv;
  }

  /* 对外暴露的纯函数（供自测桩使用） */
  var API = {
    FURNITURE: FURNITURE,
    STICKER_KINDS: STICKER_KINDS,
    rgbToHsl: rgbToHsl,
    hslToRgb: hslToRgb,
    recolorPixel: recolorPixel,
    createHistory: createHistory,
    createSticker: createSticker,
    toLocalPoint: toLocalPoint,
    hitTestSticker: hitTestSticker,
    makeSampleRoom: makeSampleRoom
  };

  /* ================= 以下为浏览器运行时 ================= */

  function init() {
    /* ---------- DOM ---------- */
    var $ = function (id) { return document.getElementById(id); };
    var canvas = $('canvas');
    var dctx = canvas.getContext('2d');
    var frame = $('canvasFrame');
    var emptyCard = $('emptyCard');
    var fileInput = $('fileInput');
    var processingEl = $('processing');
    var hintEl = $('stageHint');
    var sidebar = $('sidebar');
    var brushSizeInput = $('brushSize');
    var brushSizeVal = $('brushSizeVal');
    var customColorInput = $('customColor');

    // 离屏画布：原图 / 滤镜+换色结果 / 蒙版 / 蒙版彩色叠层
    var originalCanvas = document.createElement('canvas');
    var outputCanvas = document.createElement('canvas');
    var maskCanvas = document.createElement('canvas');
    var overlayCanvas = document.createElement('canvas');
    var octx = originalCanvas.getContext('2d');
    var outCtx = outputCanvas.getContext('2d');
    var maskCtx = maskCanvas.getContext('2d');
    var overCtx = overlayCanvas.getContext('2d');
    // 历史蒙版用半分辨率临时画布
    var tmpCanvas = document.createElement('canvas');
    var tmpCtx = tmpCanvas.getContext('2d');

    /* ---------- 状态 ---------- */
    var imgW = 0, imgH = 0, hasImage = false;
    var stickers = [];
    var history = createHistory(20);
    var selectedId = null;
    var currentUrl = null; // createObjectURL 引用，替换照片时 revoke

    var tool = 'brush';
    var currentColor = '#f1ece1';
    var brushSize = 44;
    var filters = { brightness: 0, contrast: 0, saturation: 0, temperature: 0 };

    var PREF_KEY = 'room-styler-prefs';

    // 指针与手势状态
    var pointers = new Map();
    var lastPos = new Map();     // 每根指针上一次落点（笔触插值用）
    var gesture = null;          // 贴纸操作手势
    var stroke = null;           // 涂抹手势
    var hover = { inside: false, x: 0, y: 0 };
    var libDrag = null;          // 贴纸库拖拽

    /* ---------- 偏好（仅工具偏好，绝不存照片） ---------- */
    function savePrefs() {
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify({
          tool: tool,
          color: currentColor,
          customColor: customColorInput.value,
          brushSize: brushSize,
          filters: filters
        }));
      } catch (e) { /* 隐私模式等场景忽略 */ }
    }
    function loadPrefs() {
      try {
        var raw = localStorage.getItem(PREF_KEY);
        if (!raw) return;
        var p = JSON.parse(raw);
        if (p) {
          if (p.tool === 'brush' || p.tool === 'eraser' || p.tool === 'select') tool = p.tool;
          if (typeof p.color === 'string') currentColor = p.color;
          if (typeof p.customColor === 'string') customColorInput.value = p.customColor;
          if (typeof p.brushSize === 'number') brushSize = p.brushSize;
          if (p.filters) {
            ['brightness', 'contrast', 'saturation', 'temperature'].forEach(function (k) {
              if (typeof p.filters[k] === 'number') filters[k] = p.filters[k];
            });
          }
        }
      } catch (e) { /* 忽略损坏数据 */ }
    }

    /* ---------- 工具函数 ---------- */
    function getSelected() {
      for (var i = 0; i < stickers.length; i++) {
        if (stickers[i].id === selectedId) return stickers[i];
      }
      return null;
    }
    function cloneStickers(list) {
      return list.map(function (s) {
        return { id: s.id, kind: s.kind, x: s.x, y: s.y, scale: s.scale, rotation: s.rotation, flip: s.flip };
      });
    }
    // 显示缩放：每图像像素对应的 CSS 像素
    function getViewScale() {
      var r = canvas.getBoundingClientRect();
      return imgW ? r.width / imgW : 1;
    }
    function clientToImage(e) {
      var r = canvas.getBoundingClientRect();
      return {
        x: clamp((e.clientX - r.left) / r.width * imgW, 0, imgW),
        y: clamp((e.clientY - r.top) / r.height * imgH, 0, imgH)
      };
    }
    function setProcessing(v) { processingEl.hidden = !v; }
    function setUndoRedoUI() {
      $('undoBtn').disabled = !history.canUndo();
      $('redoBtn').disabled = !history.canRedo();
    }

    /* ---------- 图像管线：滤镜 + HSL 换色（支持脏区域局部更新） ---------- */
    function processRegion(sx, sy, sw, sh) {
      if (!hasImage || sw <= 0 || sh <= 0) return;
      sx = clamp(sx, 0, imgW - 1);
      sy = clamp(sy, 0, imgH - 1);
      sw = Math.min(sw, imgW - sx);
      sh = Math.min(sh, imgH - sy);

      var src = octx.getImageData(sx, sy, sw, sh).data;
      var mask = maskCtx.getImageData(sx, sy, sw, sh).data;
      var img = outCtx.createImageData(sw, sh);
      var dst = img.data;

      var bf = 1 + (filters.brightness / 100) * 0.45;
      var cf = 1 + (filters.contrast / 100) * 0.7;
      var sf = 1 + (filters.saturation / 100);
      var tp = (filters.temperature / 100) * 36;
      var wall = hexToRgb(currentColor);
      var wallHsl = rgbToHsl(wall[0], wall[1], wall[2]);

      var n = sw * sh;
      for (var i = 0; i < n; i++) {
        var p = i * 4;
        var r = src[p], g = src[p + 1], b = src[p + 2];

        // 色温：暖→红黄偏移，冷→蓝偏移
        r += tp; b -= tp; g += tp * 0.12;
        // 亮度
        r *= bf; g *= bf; b *= bf;
        // 对比度
        r = (r - 128) * cf + 128;
        g = (g - 128) * cf + 128;
        b = (b - 128) * cf + 128;
        // 饱和度（基于亮度灰度混合）
        var gray = 0.299 * r + 0.587 * g + 0.114 * b;
        r = gray + (r - gray) * sf;
        g = gray + (g - gray) * sf;
        b = gray + (b - gray) * sf;

        // 墙面换色：按蒙版 alpha 混合，保留原亮度
        var a = mask[p + 3] / 255;
        if (a > 0.003) {
          var rec = recolorPixel(r, g, b, wallHsl[0], wallHsl[1], a);
          r = rec[0]; g = rec[1]; b = rec[2];
        }

        dst[p] = r < 0 ? 0 : (r > 255 ? 255 : r);
        dst[p + 1] = g < 0 ? 0 : (g > 255 ? 255 : g);
        dst[p + 2] = b < 0 ? 0 : (b > 255 ? 255 : b);
        dst[p + 3] = 255;
      }
      outCtx.putImageData(img, sx, sy);
    }

    // 全图重绘（下一帧执行，先让“处理中”提示绘制出来，避免同步计算时界面无反馈）
    var fullQueued = false;
    function requestFullRender() {
      if (!hasImage || fullQueued) return;
      fullQueued = true;
      setProcessing(true);
      nextFrame(function () {
        fullQueued = false;
        processRegion(0, 0, imgW, imgH);
        scheduleDraw();
        setProcessing(false);
      });
    }

    // 笔触脏区域局部重绘（按 rAF 合并）
    var regionQueued = false;
    var dirty = null;
    function unionDirty(x, y, r) {
      var x0 = Math.floor(x - r), y0 = Math.floor(y - r);
      var x1 = Math.ceil(x + r), y1 = Math.ceil(y + r);
      if (!dirty) dirty = { x0: x0, y0: y0, x1: x1, y1: y1 };
      else {
        if (x0 < dirty.x0) dirty.x0 = x0;
        if (y0 < dirty.y0) dirty.y0 = y0;
        if (x1 > dirty.x1) dirty.x1 = x1;
        if (y1 > dirty.y1) dirty.y1 = y1;
      }
    }
    function flushRegion() {
      regionQueued = false;
      if (!dirty || !hasImage) { dirty = null; return; }
      var b = dirty;
      dirty = null;
      var pad = 2;
      processRegion(b.x0 - pad, b.y0 - pad,
        b.x1 - b.x0 + pad * 2, b.y1 - b.y0 + pad * 2);
      scheduleDraw();
    }
    function scheduleRegion() {
      if (!regionQueued) {
        regionQueued = true;
        nextFrame(flushRegion);
      }
    }

    /* ---------- 蒙版 ---------- */
    function clearMaskCanvases() {
      maskCtx.setTransform(1, 0, 0, 1, 0, 0);
      maskCtx.clearRect(0, 0, imgW, imgH);
      overCtx.setTransform(1, 0, 0, 1, 0, 0);
      overCtx.clearRect(0, 0, imgW, imgH);
    }

    // 蒙版彩色叠层：用蒙版 alpha 整体重建（换墙色后调用）
    function rebuildOverlay() {
      if (!hasImage) return;
      var src = maskCtx.getImageData(0, 0, imgW, imgH).data;
      var img = overCtx.createImageData(imgW, imgH);
      var d = img.data;
      var col = hexToRgb(currentColor);
      for (var i = 0; i < imgW * imgH; i++) {
        var p = i * 4;
        d[p] = col[0];
        d[p + 1] = col[1];
        d[p + 2] = col[2];
        d[p + 3] = Math.round(src[p + 3] * 0.45);
      }
      overCtx.putImageData(img, 0, 0);
    }

    // 半分辨率 alpha 快照，控制历史内存
    function snapshotMask() {
      var hw = Math.max(1, Math.round(imgW / 2));
      var hh = Math.max(1, Math.round(imgH / 2));
      tmpCanvas.width = hw; tmpCanvas.height = hh;
      tmpCtx.imageSmoothingEnabled = true;
      tmpCtx.clearRect(0, 0, hw, hh);
      tmpCtx.drawImage(maskCanvas, 0, 0, hw, hh);
      var d = tmpCtx.getImageData(0, 0, hw, hh).data;
      var arr = new Uint8ClampedArray(hw * hh);
      for (var i = 0; i < hw * hh; i++) arr[i] = d[i * 4 + 3];
      return { w: hw, h: hh, a: arr };
    }
    function restoreMask(snap) {
      tmpCanvas.width = snap.w; tmpCanvas.height = snap.h;
      var img = tmpCtx.createImageData(snap.w, snap.h);
      for (var i = 0; i < snap.w * snap.h; i++) {
        var p = i * 4;
        img.data[p] = 255; img.data[p + 1] = 255; img.data[p + 2] = 255;
        img.data[p + 3] = snap.a[i];
      }
      tmpCtx.putImageData(img, 0, 0);
      maskCtx.setTransform(1, 0, 0, 1, 0, 0);
      maskCtx.clearRect(0, 0, imgW, imgH);
      maskCtx.imageSmoothingEnabled = true;
      maskCtx.drawImage(tmpCanvas, 0, 0, imgW, imgH);
      rebuildOverlay();
    }

    function pushMaskHistory() {
      history.push({ type: 'mask', data: snapshotMask() });
      setUndoRedoUI();
    }
    function pushStickersHistory() {
      history.push({ type: 'stickers', data: cloneStickers(stickers) });
    }
    // 构造与目标条目同类型的当前状态快照
    function currentSnapshotFor(e) {
      return e.type === 'mask'
        ? { type: 'mask', data: snapshotMask() }
        : { type: 'stickers', data: cloneStickers(stickers) };
    }

    /* ---------- 贴纸绘制与手柄 ---------- */
    function drawSticker(c, st) {
      c.save();
      c.translate(st.x, st.y);
      c.rotate(st.rotation);
      c.scale(st.flip ? -st.scale : st.scale, st.scale);
      FURNITURE[st.kind].draw(c);
      c.restore();
    }

    // 贴纸局部点 → 世界点
    function localToWorld(st, lx, ly) {
      if (st.flip) lx = -lx;
      var x = lx * st.scale, y = ly * st.scale;
      var co = Math.cos(st.rotation), si = Math.sin(st.rotation);
      return { x: st.x + x * co - y * si, y: st.y + x * si + y * co };
    }
    function getHandles(st) {
      var f = FURNITURE[st.kind];
      var w = f.w * st.scale, h = f.h * st.scale;
      return {
        tl: localToWorld(st, -w / 2, -h / 2),
        tr: localToWorld(st, w / 2, -h / 2),
        br: localToWorld(st, w / 2, h / 2),
        bl: localToWorld(st, -w / 2, h / 2),
        rotate: localToWorld(st, 0, -h / 2 - 44 / getViewScale()),
        del: localToWorld(st, w / 2 + 24 / getViewScale(), -h / 2 - 24 / getViewScale()),
        flip: localToWorld(st, -w / 2 - 24 / getViewScale(), -h / 2 - 24 / getViewScale())
      };
    }
    function hitHandle(st, x, y) {
      var hs = getHandles(st);
      var rad = 18 / getViewScale(); // 36px 触摸热区
      var keys = ['tl', 'tr', 'br', 'bl', 'rotate', 'del', 'flip'];
      for (var i = 0; i < keys.length; i++) {
        var p = hs[keys[i]];
        var dx = x - p.x, dy = y - p.y;
        if (dx * dx + dy * dy <= rad * rad) return keys[i];
      }
      return null;
    }
    function hitStickerTop(x, y) {
      for (var i = stickers.length - 1; i >= 0; i--) {
        if (hitTestSticker(stickers[i], x, y)) return stickers[i];
      }
      return null;
    }

    /* ---------- 主画面绘制 ---------- */
    var drawQueued = false;
    function scheduleDraw() {
      if (drawQueued) return;
      drawQueued = true;
      nextFrame(function () { drawQueued = false; drawScreen(); });
    }
    var showingBefore = false;

    function drawScreen() {
      if (!hasImage) return;
      dctx.setTransform(1, 0, 0, 1, 0, 0);
      dctx.clearRect(0, 0, imgW, imgH);
      if (showingBefore) {
        dctx.drawImage(originalCanvas, 0, 0);
        return;
      }
      dctx.drawImage(outputCanvas, 0, 0);
      dctx.drawImage(overlayCanvas, 0, 0);
      for (var i = 0; i < stickers.length; i++) drawSticker(dctx, stickers[i]);

      var sel = getSelected();
      if (tool === 'select' && sel) drawSelection(sel);
      if ((tool === 'brush' || tool === 'eraser') && hover.inside) drawBrushCursor();
    }

    function drawSelection(st) {
      var hs = getHandles(st);
      var k = getViewScale();
      var u = 1 / k; // 1 CSS 像素对应的图像像素
      var c = dctx;
      c.save();
      // 包围虚线框
      c.strokeStyle = 'rgba(255,255,255,.9)';
      c.lineWidth = 1.5 * u;
      c.setLineDash([7 * u, 6 * u]);
      c.beginPath();
      c.moveTo(hs.tl.x, hs.tl.y);
      c.lineTo(hs.tr.x, hs.tr.y);
      c.lineTo(hs.br.x, hs.br.y);
      c.lineTo(hs.bl.x, hs.bl.y);
      c.closePath(); c.stroke();
      c.setLineDash([]);
      // 旋转手柄连线
      c.strokeStyle = 'rgba(255,255,255,.7)';
      c.lineWidth = 1.5 * u;
      c.beginPath(); c.moveTo(hs.tl.x, hs.tl.y); c.lineTo(hs.tr.x, hs.tr.y); c.stroke();
      c.beginPath();
      c.moveTo((hs.tl.x + hs.tr.x) / 2, (hs.tl.y + hs.tr.y) / 2);
      c.lineTo(hs.rotate.x, hs.rotate.y);
      c.stroke();
      // 四角缩放手柄
      ['tl', 'tr', 'br', 'bl'].forEach(function (key) {
        var p = hs[key], s = 12 * u;
        c.fillStyle = '#fff';
        c.strokeStyle = '#7c5cff';
        c.lineWidth = 2.5 * u;
        rr(c, p.x - s, p.y - s, s * 2, s * 2, 3 * u);
        c.fill(); c.stroke();
      });
      // 旋转手柄（圆形 + 箭头）
      c.fillStyle = '#22d3ee';
      c.beginPath(); c.arc(hs.rotate.x, hs.rotate.y, 13 * u, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#06303a'; c.lineWidth = 2.4 * u; c.lineCap = 'round';
      c.beginPath();
      c.arc(hs.rotate.x, hs.rotate.y, 6.5 * u, -0.4, Math.PI * 1.3);
      c.stroke();
      c.beginPath();
      c.moveTo(hs.rotate.x + 8 * u, hs.rotate.y - 3 * u);
      c.lineTo(hs.rotate.x + 4 * u, hs.rotate.y - 8 * u);
      c.lineTo(hs.rotate.x + 10 * u, hs.rotate.y - 8 * u);
      c.closePath(); c.fillStyle = '#06303a'; c.fill();
      // 删除按钮（粉圆 + 叉）
      drawCircleButton(hs.del, '#ff5ca8', 13 * u, function () {
        c.strokeStyle = '#fff'; c.lineWidth = 2.6 * u; c.lineCap = 'round';
        c.beginPath();
        c.moveTo(hs.del.x - 5.5 * u, hs.del.y - 5.5 * u);
        c.lineTo(hs.del.x + 5.5 * u, hs.del.y + 5.5 * u);
        c.moveTo(hs.del.x + 5.5 * u, hs.del.y - 5.5 * u);
        c.lineTo(hs.del.x - 5.5 * u, hs.del.y + 5.5 * u);
        c.stroke();
      });
      // 翻转按钮（青圆 + 双向箭头）
      drawCircleButton(hs.flip, '#7c5cff', 13 * u, function () {
        c.strokeStyle = '#fff'; c.lineWidth = 2.4 * u; c.lineCap = 'round';
        var fx = hs.flip.x, fy = hs.flip.y, q = 6 * u;
        c.beginPath();
        c.moveTo(fx - q, fy); c.lineTo(fx + q, fy);
        c.stroke();
        c.beginPath();
        c.moveTo(fx - q, fy); c.lineTo(fx - q + 4 * u, fy - 4 * u);
        c.moveTo(fx - q, fy); c.lineTo(fx - q + 4 * u, fy + 4 * u);
        c.moveTo(fx + q, fy); c.lineTo(fx + q - 4 * u, fy - 4 * u);
        c.moveTo(fx + q, fy); c.lineTo(fx + q - 4 * u, fy + 4 * u);
        c.stroke();
      });
      c.restore();
    }
    function drawCircleButton(p, color, rad, inner) {
      dctx.fillStyle = color;
      dctx.beginPath(); dctx.arc(p.x, p.y, rad, 0, Math.PI * 2); dctx.fill();
      dctx.strokeStyle = 'rgba(255,255,255,.85)';
      dctx.lineWidth = Math.max(1, rad * 0.16);
      dctx.beginPath(); dctx.arc(p.x, p.y, rad, 0, Math.PI * 2); dctx.stroke();
      inner();
    }

    function drawBrushCursor() {
      var k = getViewScale();
      var rad = (brushSize / 2) / k;
      dctx.save();
      dctx.strokeStyle = 'rgba(0,0,0,.45)';
      dctx.lineWidth = 3 / k;
      dctx.beginPath(); dctx.arc(hover.x, hover.y, rad, 0, Math.PI * 2); dctx.stroke();
      dctx.strokeStyle = 'rgba(255,255,255,.95)';
      dctx.lineWidth = 1.4 / k;
      dctx.beginPath(); dctx.arc(hover.x, hover.y, rad, 0, Math.PI * 2); dctx.stroke();
      dctx.restore();
    }

    /* ---------- 软边笔刷涂抹 ---------- */
    function softDab(x, y, rad, rgb, comp) {
      var ctxm = maskCtx, ctxo = overCtx;
      function paint(ctx, peak) {
        ctx.save();
        ctx.globalCompositeOperation = comp;
        var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        var rgba = function (a) { return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')'; };
        g.addColorStop(0, rgba(peak));
        g.addColorStop(0.65, rgba(peak * 0.5));
        g.addColorStop(1, rgba(0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      var col = hexToRgb(currentColor);
      if (comp === 'destination-out') {
        // 橡皮擦：同时擦除蒙版与彩色叠层
        paint(ctxm, 0.9);
        ctxo.save();
        ctxo.globalCompositeOperation = 'destination-out';
        var g = ctxo.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, 'rgba(0,0,0,.9)');
        g.addColorStop(0.65, 'rgba(0,0,0,.45)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctxo.fillStyle = g;
        ctxo.beginPath(); ctxo.arc(x, y, rad, 0, Math.PI * 2); ctxo.fill();
        ctxo.restore();
      } else {
        paint(ctxm, 0.85);
        ctxo.save();
        var g2 = ctxo.createRadialGradient(x, y, 0, x, y, rad);
        g2.addColorStop(0, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',.32)');
        g2.addColorStop(0.65, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',.16)');
        g2.addColorStop(1, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0)');
        ctxo.fillStyle = g2;
        ctxo.beginPath(); ctxo.arc(x, y, rad, 0, Math.PI * 2); ctxo.fill();
        ctxo.restore();
      }
    }

    function dabAt(x, y) {
      var rad = (brushSize / 2) / getViewScale();
      var erasing = tool === 'eraser';
      softDab(x, y, rad, [255, 255, 255], erasing ? 'destination-out' : 'source-over');
      unionDirty(x, y, rad);
      scheduleRegion();
    }
    function dabSegment(p0, p1) {
      var rad = (brushSize / 2) / getViewScale();
      var dx = p1.x - p0.x, dy = p1.y - p0.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var steps = Math.max(1, Math.ceil(dist / (rad * 0.35)));
      for (var i = 1; i <= steps; i++) {
        dabAt(p0.x + dx * i / steps, p0.y + dy * i / steps);
      }
    }

    /* ---------- 贴纸手势（拖动 / 缩放 / 旋转 / 双指捏合） ---------- */
    function distOf(a, b) {
      var dx = a.x - b.x, dy = a.y - b.y;
      return Math.sqrt(dx * dx + dy * dy);
    }
    function startStickerGesture(st, mode, startPoint) {
      gesture = {
        mode: mode,
        st: st,
        start: {
          x: st.x, y: st.y, scale: st.scale, rotation: st.rotation,
          px: startPoint.x, py: startPoint.y
        }
      };
      if (mode === 'scale') {
        gesture.start.dist = distOf({ x: st.x, y: st.y }, startPoint);
      }
    }
    function beginPinch() {
      var pts = [];
      pointers.forEach(function (p) { pts.push(p); });
      if (pts.length < 2) return;
      var st = getSelected() || hitStickerTop((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      if (!st) return;
      selectedId = st.id;
      gesture = {
        mode: 'pinch',
        st: st,
        start: {
          x: st.x, y: st.y, scale: st.scale, rotation: st.rotation,
          dist: distOf(pts[0], pts[1]),
          angle: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x),
          midX: (pts[0].x + pts[1].x) / 2,
          midY: (pts[0].y + pts[1].y) / 2
        }
      };
    }
    function updateGesture() {
      if (!gesture) return;
      var st = gesture.st, s0 = gesture.start;
      if (gesture.mode === 'move' || gesture.mode === 'scale' || gesture.mode === 'rotate') {
        var p = pointers.get(gesture.pid) || pointers.values().next().value;
        if (!p) return;
        if (gesture.mode === 'move') {
          // 中心限制在画布范围内（贴纸本体可部分超界，但中心不会拖丢）
          st.x = clamp(s0.x + p.x - s0.px, 0, imgW);
          st.y = clamp(s0.y + p.y - s0.py, 0, imgH);
        } else if (gesture.mode === 'scale') {
          var d = distOf({ x: st.x, y: st.y }, p);
          st.scale = clamp(s0.scale * d / s0.dist, 0.12, 6);
        } else if (gesture.mode === 'rotate') {
          st.rotation = Math.atan2(p.y - st.y, p.x - st.x) + Math.PI / 2;
        }
      } else if (gesture.mode === 'pinch') {
        var pts = [];
        pointers.forEach(function (q) { pts.push(q); });
        if (pts.length < 2) return;
        var d2 = distOf(pts[0], pts[1]);
        var a2 = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
        var mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
        st.scale = clamp(s0.scale * d2 / s0.dist, 0.12, 6);
        st.rotation = s0.rotation + (a2 - s0.angle);
        st.x = clamp(s0.x + mx - s0.midX, 0, imgW);
        st.y = clamp(s0.y + my - s0.midY, 0, imgH);
      }
      scheduleDraw();
    }

    /* ---------- 画布指针事件（统一 Pointer Events） ---------- */
    canvas.addEventListener('pointerdown', function (e) {
      if (!hasImage) return;
      safeCapture(canvas, e.pointerId);
      var p = clientToImage(e);
      pointers.set(e.pointerId, p);

      lastPos.set(e.pointerId, p);

      if (tool === 'brush' || tool === 'eraser') {
        if (pointers.size === 1) {
          pushMaskHistory();
          stroke = { pid: e.pointerId };
          hover.inside = true; hover.x = p.x; hover.y = p.y;
          dabAt(p.x, p.y);
        }
        return;
      }

      // 选择摆放工具
      if (pointers.size === 2) {
        // 第二根手指落下：切换为双指捏合（第一指若已开始拖动则不重复入栈）
        if (!gesture) pushStickersHistory();
        beginPinch();
        return;
      }
      var sel = getSelected();
      if (sel) {
        var handle = hitHandle(sel, p.x, p.y);
        if (handle === 'del') {
          pushStickersHistory();
          stickers = stickers.filter(function (s) { return s.id !== sel.id; });
          selectedId = null;
          scheduleDraw();
          return;
        }
        if (handle === 'flip') {
          pushStickersHistory();
          sel.flip = !sel.flip;
          scheduleDraw();
          return;
        }
        if (handle === 'tl' || handle === 'tr' || handle === 'br' || handle === 'bl') {
          pushStickersHistory();
          startStickerGesture(sel, 'scale', p);
          gesture.pid = e.pointerId;
          return;
        }
        if (handle === 'rotate') {
          pushStickersHistory();
          startStickerGesture(sel, 'rotate', p);
          gesture.pid = e.pointerId;
          return;
        }
      }
      var target = hitStickerTop(p.x, p.y);
      if (target) {
        selectedId = target.id;
        pushStickersHistory();
        startStickerGesture(target, 'move', p);
        gesture.pid = e.pointerId;
      } else {
        selectedId = null;
        scheduleDraw();
      }
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!hasImage) return;
      var p = clientToImage(e);
      hover.inside = true; hover.x = p.x; hover.y = p.y;
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);

      if (stroke && stroke.pid === e.pointerId && pointers.size === 1) {
        var prev = lastPos.get(e.pointerId);
        if (prev) dabSegment(prev, p);
      }
      lastPos.set(e.pointerId, p);
      if (gesture) updateGesture();
      scheduleDraw();
    });

    function endPointer(e, cancel) {
      var wasStroke = stroke && stroke.pid === e.pointerId;
      pointers.delete(e.pointerId);
      lastPos.delete(e.pointerId);
      if (wasStroke) stroke = null;
      if (gesture && gesture.pid === e.pointerId && gesture.mode !== 'pinch') gesture = null;
      if (gesture && gesture.mode === 'pinch' && pointers.size < 2) {
        // 一根手指继续时退化为拖动
        var rest = pointers.values().next().value;
        if (rest) {
          startStickerGesture(gesture.st, 'move', rest);
          gesture.pid = pointers.keys().next().value;
        } else gesture = null;
      }
      if (!cancel) scheduleDraw();
    }
    canvas.addEventListener('pointerup', function (e) { endPointer(e, false); });
    canvas.addEventListener('pointercancel', function (e) { endPointer(e, true); });
    canvas.addEventListener('pointerleave', function () {
      hover.inside = false;
      scheduleDraw();
    });

    /* ---------- 照片载入 ---------- */
    function setupImage(source) {
      var sw = source.naturalWidth || source.width;
      var sh = source.naturalHeight || source.height;
      var scale = Math.min(1, 1600 / Math.max(sw, sh));
      imgW = Math.max(1, Math.round(sw * scale));
      imgH = Math.max(1, Math.round(sh * scale));

      originalCanvas.width = outputCanvas.width = maskCanvas.width = overlayCanvas.width = imgW;
      originalCanvas.height = outputCanvas.height = maskCanvas.height = overlayCanvas.height = imgH;
      canvas.width = imgW;
      canvas.height = imgH;

      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, imgW, imgH);
      octx.drawImage(source, 0, 0, imgW, imgH);
      clearMaskCanvases();

      stickers = [];
      selectedId = null;
      history.clear();
      setUndoRedoUI();
      hasImage = true;
      frame.classList.add('is-ready');
      processRegion(0, 0, imgW, imgH);
      scheduleDraw();
      updateHint();
    }

    function loadFile(file) {
      if (!file || !/^image\//.test(file.type)) {
        alert('请选择图片文件（JPG / PNG / WebP 等）');
        return;
      }
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      var url = URL.createObjectURL(file);
      currentUrl = url;
      setProcessing(true);
      var img = new Image();
      img.onload = function () {
        setupImage(img);
        setProcessing(false);
        URL.revokeObjectURL(url);
        if (currentUrl === url) currentUrl = null;
      };
      img.onerror = function () {
        setProcessing(false);
        URL.revokeObjectURL(url);
        if (currentUrl === url) currentUrl = null;
        alert('图片读取失败，请换一张试试');
      };
      img.src = url;
    }

    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (f) loadFile(f);
      fileInput.value = '';
    });

    // 示例房间：程序化绘制为同步操作，直接载入即可
    $('sampleBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      try {
        setupImage(makeSampleRoom(document.createElement('canvas')));
      } catch (err) {
        console.error('示例房间生成失败：', err);
        alert('示例房间生成失败，请刷新页面重试或直接上传照片');
      }
    });
    $('pickBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      fileInput.click();
    });
    emptyCard.addEventListener('click', function () { fileInput.click(); });

    // 拖拽上传
    ['dragover', 'dragenter'].forEach(function (ev) {
      emptyCard.addEventListener(ev, function (e) {
        e.preventDefault();
        emptyCard.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      emptyCard.addEventListener(ev, function (e) {
        e.preventDefault();
        emptyCard.classList.remove('drag-over');
      });
    });
    emptyCard.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFile(f);
    });
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) {
      e.preventDefault();
      if (hasImage) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) loadFile(f);
      }
    });

    $('newPhotoBtn').addEventListener('click', function () { fileInput.click(); });

    /* ---------- 工具与颜色 UI ---------- */
    function updateHint() {
      if (!hasImage) {
        hintEl.textContent = '先上传一张房间照片，或试试示例房间';
      } else if (tool === 'brush') {
        hintEl.textContent = '涂抹要换色的墙面区域';
      } else if (tool === 'eraser') {
        hintEl.textContent = '按住拖动擦除蒙版，被擦区域恢复墙面原色';
      } else {
        hintEl.textContent = '拖动家具移动；四角手柄缩放，顶部手柄旋转；双指捏合；侧键翻转与删除';
      }
    }
    function syncToolUI() {
      var btns = document.querySelectorAll('#toolGrid .tool-btn');
      btns.forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tool') === tool);
      });
    }
    document.querySelectorAll('#toolGrid .tool-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        tool = b.getAttribute('data-tool');
        syncToolUI();
        if (tool !== 'select') selectedId = null;
        updateHint();
        savePrefs();
        scheduleDraw();
        closeDrawer();
      });
    });

    function syncSwatchUI() {
      document.querySelectorAll('#swatches .swatch').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-color').toLowerCase() === currentColor.toLowerCase());
      });
    }
    document.querySelectorAll('#swatches .swatch').forEach(function (b) {
      b.addEventListener('click', function () {
        currentColor = b.getAttribute('data-color');
        customColorInput.value = currentColor;
        syncSwatchUI();
        savePrefs();
        if (hasImage) { rebuildOverlay(); requestFullRender(); }
      });
    });
    customColorInput.addEventListener('input', function () {
      currentColor = customColorInput.value;
      syncSwatchUI();
      savePrefs();
      if (hasImage) { rebuildOverlay(); requestFullRender(); }
    });
    brushSizeInput.value = String(brushSize);
    brushSizeVal.textContent = String(brushSize);
    brushSizeInput.addEventListener('input', function () {
      brushSize = Number(brushSizeInput.value);
      brushSizeVal.textContent = String(brushSize);
      savePrefs();
      scheduleDraw();
    });

    $('clearMask').addEventListener('click', function () {
      if (!hasImage) return;
      pushMaskHistory();
      clearMaskCanvases();
      requestFullRender();
    });

    /* ---------- 光感滑块 ---------- */
    var filterDefs = [
      { id: 'brightness', val: 'brightnessVal' },
      { id: 'contrast', val: 'contrastVal' },
      { id: 'saturation', val: 'saturationVal' },
      { id: 'temperature', val: 'temperatureVal' }
    ];
    function syncFilterUI() {
      filterDefs.forEach(function (d) {
        $(d.id).value = String(filters[d.id]);
        $(d.val).textContent = String(filters[d.id]);
      });
    }
    filterDefs.forEach(function (d) {
      $(d.id).addEventListener('input', function () {
        filters[d.id] = Number($(d.id).value);
        $(d.val).textContent = String(filters[d.id]);
        savePrefs();
        requestFullRender();
      });
    });
    $('autoBtn').addEventListener('click', function () {
      // 温和提亮 + 增饱和 + 暖色温的一键焕新组合
      filters.brightness = 18;
      filters.contrast = 10;
      filters.saturation = 22;
      filters.temperature = 26;
      syncFilterUI();
      savePrefs();
      requestFullRender();
    });
    $('resetFilterBtn').addEventListener('click', function () {
      filters.brightness = filters.contrast = filters.saturation = filters.temperature = 0;
      syncFilterUI();
      savePrefs();
      requestFullRender();
    });

    /* ---------- 贴纸库（缩略图程序化矢量绘制 + 点击/拖拽上画） ---------- */
    var lib = $('stickerLib');
    STICKER_KINDS.forEach(function (kind) {
      var f = FURNITURE[kind];
      var tile = document.createElement('div');
      tile.className = 'sticker-tile';
      tile.setAttribute('data-kind', kind);
      var tc = document.createElement('canvas');
      tc.width = 96; tc.height = 96;
      var tctx2 = tc.getContext('2d');
      tctx2.translate(48, 50);
      var ts = 78 / Math.max(f.w, f.h);
      tctx2.scale(ts, ts);
      f.draw(tctx2);
      tile.appendChild(tc);
      var lab = document.createElement('span');
      lab.textContent = f.name;
      tile.appendChild(lab);
      lib.appendChild(tile);

      tile.addEventListener('pointerdown', function (e) {
        if (!hasImage) {
          hintEl.textContent = '请先上传照片或打开示例房间，再摆放家具';
          return;
        }
        safeCapture(tile, e.pointerId);
        libDrag = {
          kind: kind,
          startX: e.clientX, startY: e.clientY,
          moved: false,
          ghost: null
        };
      });
    });

    // 贴纸库拖拽：浮动幽灵 + 落点检测
    var ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    document.body.appendChild(ghost);

    window.addEventListener('pointermove', function (e) {
      if (!libDrag) return;
      var dx = e.clientX - libDrag.startX, dy = e.clientY - libDrag.startY;
      if (!libDrag.moved && Math.hypot(dx, dy) > 8) {
        libDrag.moved = true;
        var f = FURNITURE[libDrag.kind];
        var gc = document.createElement('canvas');
        gc.width = 96; gc.height = 96;
        var gx = gc.getContext('2d');
        gx.translate(48, 50);
        var gs = 80 / Math.max(f.w, f.h);
        gx.scale(gs, gs);
        f.draw(gx);
        ghost.innerHTML = '';
        ghost.appendChild(gc);
        ghost.classList.add('on');
      }
      ghost.style.left = (e.clientX - 32) + 'px';
      ghost.style.top = (e.clientY - 32) + 'px';
    });
    window.addEventListener('pointerup', function (e) {
      if (!libDrag) return;
      var kind = libDrag.kind;
      var moved = libDrag.moved;
      ghost.classList.remove('on');
      libDrag = null;
      if (!hasImage) return;

      var r = canvas.getBoundingClientRect();
      var over = e.clientX >= r.left && e.clientX <= r.right &&
                 e.clientY >= r.top && e.clientY <= r.bottom;
      var st;
      var baseScale = clamp(imgW / 1300, 0.72, 1.25);
      if (moved && over) {
        st = createSticker(kind,
          (e.clientX - r.left) / r.width * imgW,
          (e.clientY - r.top) / r.height * imgH,
          baseScale);
      } else if (!moved) {
        st = createSticker(kind, imgW / 2, imgH / 2, baseScale);
      } else {
        return; // 拖到画布外，取消放置
      }
      stickers.push(st);
      selectedId = st.id;
      tool = 'select';
      syncToolUI();
      updateHint();
      pushStickersHistory();
      scheduleDraw();
      closeDrawer();
    });

    /* ---------- 对比与导出 ---------- */
    function compositeTo(c, withStickers) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, imgW, imgH);
      c.drawImage(outputCanvas, 0, 0);
      if (withStickers) {
        for (var i = 0; i < stickers.length; i++) drawSticker(c, stickers[i]);
      }
    }
    function downloadBlob(blob, name) {
      if (!blob) { alert('导出失败，请重试'); return; }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    }
    $('exportBtn').addEventListener('click', function () {
      if (!hasImage) return;
      setProcessing(true);
      nextFrame(function () {
        var ec = document.createElement('canvas');
        ec.width = imgW; ec.height = imgH;
        compositeTo(ec.getContext('2d'), true);
        canvasToPNGBlob(ec, function (blob) {
          setProcessing(false);
          downloadBlob(blob, '智能装修工坊-装修后.png');
        });
      });
    });
    $('exportCompareBtn').addEventListener('click', function () {
      if (!hasImage) return;
      setProcessing(true);
      nextFrame(function () {
        var gap = 48, labelH = 78;
        var W = imgW * 2 + gap, H = imgH + labelH;
        var ec = document.createElement('canvas');
        ec.width = W; ec.height = H;
        var c = ec.getContext('2d');
        c.fillStyle = '#0e1120';
        c.fillRect(0, 0, W, H);
        c.drawImage(originalCanvas, 0, 0);
        var right = document.createElement('canvas');
        right.width = imgW; right.height = imgH;
        compositeTo(right.getContext('2d'), true);
        c.drawImage(right, imgW + gap, 0);
        // 中间分隔缝
        c.fillStyle = '#7c5cff';
        c.fillRect(imgW + gap / 2 - 2, 0, 4, H);
        // “前 / 后”中文标注
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = '600 34px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif';
        c.fillStyle = '#9aa3c7';
        c.fillText('装修前', imgW / 2, imgH + labelH / 2);
        c.fillStyle = '#22d3ee';
        c.fillText('装修后', imgW + gap + imgW / 2, imgH + labelH / 2);
        canvasToPNGBlob(ec, function (blob) {
          setProcessing(false);
          downloadBlob(blob, '智能装修工坊-前后对比.png');
        });
      });
    });

    var compareBtn = $('compareBtn');
    function showBefore(v) {
      if (!hasImage) return;
      showingBefore = v;
      scheduleDraw();
    }
    compareBtn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      safeCapture(compareBtn, e.pointerId);
      showBefore(true);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      compareBtn.addEventListener(ev, function () { showBefore(false); });
    });

    /* ---------- 移动端抽屉 ---------- */
    var drawerBtn = $('drawerBtn');
    function openDrawer() {
      sidebar.classList.add('open');
      drawerBtn.classList.add('hidden');
    }
    function closeDrawer() {
      sidebar.classList.remove('open');
      drawerBtn.classList.remove('hidden');
    }
    drawerBtn.addEventListener('click', openDrawer);
    $('drawerClose').addEventListener('click', closeDrawer);

    /* ---------- 撤销 / 重做接线 ---------- */
    function finalizeHistory() {
      var limit = 20;
      var past = [], future = [];
      history = {
        push: function (entry) {
          past.push(entry);
          if (past.length > limit) past.shift();
          future.length = 0;
          setUndoRedoUI();
        },
        canUndo: function () { return past.length > 0; },
        canRedo: function () { return future.length > 0; },
        clear: function () { past = []; future = []; setUndoRedoUI(); }
      };
      // 应用一条历史记录：entry 为待恢复的“先前状态”
      function applyEntry(e) {
        if (e.type === 'mask') {
          restoreMask(e.data);
          requestFullRender();
        } else {
          stickers = cloneStickers(e.data);
          if (!getSelected()) selectedId = null;
          scheduleDraw();
        }
      }
      function undoOnce() {
        if (!past.length || !hasImage) return;
        // 1. 先捕获当前状态（与将被恢复的条目同类型）
        var goingToApply = past[past.length - 1];
        var currentSnap = currentSnapshotFor(goingToApply);
        // 2. 弹出先前状态并入重做栈
        var entry = past.pop();
        future.push(currentSnap);
        applyEntry(entry);
        setUndoRedoUI();
      }
      function redoOnce() {
        if (!future.length || !hasImage) return;
        var goingToApply = future[future.length - 1];
        var currentSnap = currentSnapshotFor(goingToApply);
        var entry = future.pop();
        past.push(currentSnap);
        applyEntry(entry);
        setUndoRedoUI();
      }
      $('undoBtn').onclick = function () { undoOnce(); };
      $('redoBtn').onclick = function () { redoOnce(); };
      // 键盘快捷键（可选增强）
      window.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) redoOnce(); else undoOnce();
        }
      });
    }

    /* ---------- 初始化 ---------- */
    loadPrefs();
    syncToolUI();
    syncSwatchUI();
    customColorInput.value = currentColor;
    brushSizeInput.value = String(brushSize);
    brushSizeVal.textContent = String(brushSize);
    syncFilterUI();
    finalizeHistory();
    setUndoRedoUI();
    updateHint();
  }

  /* 暴露测试接口；浏览器就绪后启动 */
  if (typeof window !== 'undefined') {
    window.RoomStyler = API;
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    }
  }
})();
