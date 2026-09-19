/* ============================================================
 * 星空作曲机 game.js
 * 纯 WebAudio API 实现：随机旋律生成 + 16 步音序器 + WAV 导出
 * 零第三方依赖，全部声音由振荡器与噪声实时合成
 * ============================================================ */
(function (global) {
  'use strict';

  /* ===================== 基础工具 ===================== */

  // FNV-1a 字符串哈希：把“参数+种子”变成 32 位整数
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // 带种子的伪随机数发生器（mulberry32），同种子必得同序列
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function weightedPick(items, weights, rng) {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    let x = rng() * total;
    for (let i = 0; i < items.length; i++) {
      x -= weights[i];
      if (x <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  // 从 [音程度数, 权重] 表中选取一次音程跳动
  function weightedDelta(pairs, rng) {
    let total = 0;
    for (let i = 0; i < pairs.length; i++) total += pairs[i][1];
    let x = rng() * total;
    for (let i = 0; i < pairs.length; i++) {
      x -= pairs[i][1];
      if (x <= 0) return pairs[i][0];
    }
    return pairs[pairs.length - 1][0];
  }

  /* ===================== 乐理数据 ===================== */

  const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const SCALE_MAJ = [0, 2, 4, 5, 7, 9, 11];          // 自然大调
  const SCALE_MIN = [0, 2, 3, 5, 7, 8, 10];          // 自然小调
  const SCALE_PENTA = [0, 2, 4, 7, 9];               // 宫 商 角 徵 羽（五声正音）

  const KEYS = [
    { id: 'C', name: 'C大调', root: 0, mode: 'maj' },
    { id: 'G', name: 'G大调', root: 7, mode: 'maj' },
    { id: 'F', name: 'F大调', root: 5, mode: 'maj' },
    { id: 'a', name: 'a小调', root: 9, mode: 'min' },
    { id: 'e', name: 'e小调', root: 4, mode: 'min' },
    { id: 'd', name: 'd小调', root: 2, mode: 'min' }
  ];

  const STYLES = [
    { id: 'light', name: '轻快' },
    { id: 'mystery', name: '神秘' },
    { id: 'jazz', name: '爵士摇摆' },
    { id: 'electro', name: '电子' },
    { id: 'penta', name: '中国五声' }
  ];

  // 各风格的马尔可夫音程走向：以级进（±1、±2 度）为主，偶尔跳进
  const MEL_STEPS = {
    light:   [[-3, 1], [-2, 3], [-1, 5], [0, 3], [1, 5], [2, 3], [3, 1], [4, 0.5]],
    mystery: [[-5, 0.5], [-4, 1], [-3, 3], [-2, 2], [-1, 3], [0, 4], [1, 2], [2, 2], [3, 3], [4, 1], [5, 0.5]],
    jazz:    [[-4, 0.6], [-3, 2], [-2, 3], [-1, 4], [0, 3], [1, 4], [2, 3], [3, 2], [4, 1]],
    electro: [[-3, 1], [-2, 3], [-1, 2], [0, 6], [1, 2], [2, 3], [3, 1]],
    penta:   [[-3, 1], [-2, 2], [-1, 4], [0, 3], [1, 4], [2, 2], [3, 1]]
  };

  // 各风格的音符时值候选（以 16 分音符为 1 步）
  const MEL_DURS = {
    light: [1, 1, 2, 2, 2, 3, 4],
    mystery: [2, 2, 3, 4, 4],
    jazz: [1, 2, 2, 3, 3],
    electro: [1, 1, 1, 2, 2],
    penta: [1, 2, 2, 2, 4]
  };

  function scaleOfKey(key) {
    return key.mode === 'maj' ? SCALE_MAJ : SCALE_MIN;
  }

  // 调内 I / vi / IV / V 四个和弦功能（小调对应 i / VI / iv / V）
  function chordFunctions(mode) {
    if (mode === 'maj') {
      return [
        { deg: 0, q: 'maj', sym: 'I'  },
        { deg: 5, q: 'min', sym: 'vi' },
        { deg: 3, q: 'maj', sym: 'IV' },
        { deg: 4, q: 'maj', sym: 'V'  }
      ];
    }
    return [
      { deg: 0, q: 'min', sym: 'i'  },
      { deg: 5, q: 'maj', sym: 'VI' },
      { deg: 3, q: 'min', sym: 'iv' },
      { deg: 4, q: 'maj', sym: 'V'  }
    ];
  }

  // 由功能和弦构造具体音高：返回根音音名集合、音程偏移与显示名
  function makeChord(key, fn, seventh) {
    let arr = scaleOfKey(key);
    let idx = ((fn.deg % 7) + 7) % 7;
    let rootPc = (key.root + arr[idx]) % 12;
    let offsets;
    if (!seventh) {
      offsets = fn.q === 'maj' ? [0, 4, 7] : [0, 3, 7];
    } else if (fn.sym === 'V') {
      offsets = [0, 4, 7, 10];           // 属七
    } else if (fn.q === 'maj') {
      offsets = [0, 4, 7, 11];           // 大七
    } else {
      offsets = [0, 3, 7, 10];           // 小七
    }
    let suffix = '';
    if (seventh) suffix = fn.sym === 'V' ? '7' : (fn.q === 'maj' ? 'maj7' : 'm7');
    else suffix = fn.q === 'min' ? 'm' : '';
    return { rootPc: rootPc, offsets: offsets, name: NOTE_NAMES[rootPc] + suffix, sym: fn.sym };
  }

  /* ===================== 音阶坐标换算 ===================== */

  // k 为音阶内度数序号（每 arr.length 个度数跨一个八度），映射为 MIDI 音高
  function mapK(k, arr, keyRoot) {
    let len = arr.length;
    let oct = Math.floor(k / len);
    let idx = k - oct * len;
    return 60 + keyRoot + 12 * oct + arr[idx];
  }

  // 把度数序号限制在 C4(60) 至 C6(84) 范围
  function clampK(k, arr, keyRoot) {
    let guard = 0;
    while (mapK(k, arr, keyRoot) < 60 && guard++ < 24) k++;
    while (mapK(k, arr, keyRoot) > 84 && guard++ < 48) k--;
    return k;
  }

  // 找到距离当前度数最近的、落在指定音名(pitch class)上的度数
  function nearestKToPc(curK, pc, arr, keyRoot) {
    pc = ((pc % 12) + 12) % 12;
    for (let d = 0; d <= 14; d++) {
      let cands = [curK + d, curK - d];
      for (let i = 0; i < 2; i++) {
        if (mapK(cands[i], arr, keyRoot) % 12 === pc) return clampK(cands[i], arr, keyRoot);
      }
    }
    return clampK(curK, arr, keyRoot);
  }

  // 由 MIDI 音高反查最近的音阶度数（供拖拽编辑使用）
  function kForMidi(midi, arr, keyRoot) {
    let best = 0, bestDist = Infinity;
    for (let k = -8; k <= 40; k++) {
      let d = Math.abs(mapK(k, arr, keyRoot) - midi);
      if (d < bestDist) { bestDist = d; best = k; }
    }
    return best;
  }

  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  function midiName(m) {
    return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  }

  // 贝斯音高：和弦根音放到低八度（C2 起算，保持在调内同一八度圈）
  function bassRootMidi(keyRoot, rootPc) {
    return 36 + ((rootPc - keyRoot + 12) % 12);
  }

  /* ===================== 自动作曲 ===================== */

  /**
   * 按参数与种子生成整首循环
   * cfg: { keyId, styleId, complexity(1-5), seed(整数), inspiration(灵感次数) }
   */
  function generateSong(cfg) {
    let key = KEYS.filter(function (k) { return k.id === cfg.keyId; })[0] || KEYS[0];
    let styleId = (STYLES.filter(function (s) { return s.id === cfg.styleId; })[0] || STYLES[0]).id;
    let complexity = Math.min(5, Math.max(1, cfg.complexity | 0));
    let base = hashSeed(key.id + '|' + styleId + '|' + complexity + '|' + (cfg.seed | 0));

    // 各声部分轨独立随机流；灵感再生成只扰动旋律流
    let rChord = mulberry32(base ^ 0x9e3779b9);
    let rBass  = mulberry32(base ^ 0x85ebca6b);
    let rDrum  = mulberry32(base ^ 0xc2b2ae35);
    let rMel   = mulberry32((base ^ hashSeed('melody:' + (cfg.inspiration | 0))) >>> 0);

    let bars = complexity >= 3 ? 4 : 2;      // 复杂度 1-2 两小节，3-5 四小节
    let N = bars * 16;
    let song = {
      bars: bars, steps: N,
      keyId: key.id, keyRoot: key.root, mode: key.mode, style: styleId,
      melody: new Array(N).fill(0), melLen: new Array(N).fill(0),
      bass: new Array(N).fill(0), bassLen: new Array(N).fill(0),
      kick: new Array(N).fill(0), hat: new Array(N).fill(0), snare: new Array(N).fill(0),
      chords: [], chordIdx: new Array(N).fill(0)
    };
    genChords(song, key, styleId, complexity, rChord);
    genBass(song, key, styleId, complexity, rBass);
    genDrums(song, styleId, complexity, rDrum);
    genMelody(song, key, styleId, complexity, rMel);
    return song;
  }

  // 和弦进行：每小节从 I/vi/IV/V 中选取，复杂度越高换得越勤，爵士风格加七音
  function genChords(song, key, styleId, c, rng) {
    let fns = chordFunctions(key.mode);
    let seventh = styleId === 'jazz';
    let halfBar = c === 5 || (c === 4 && rng() < 0.5);
    let segCount = song.bars * (halfBar ? 2 : 1);
    let picks = [];
    for (let i = 0; i < segCount; i++) {
      let fn;
      if (i === 0) {
        fn = fns[0];                                  // 开头稳定在主和弦
      } else if (i === segCount - 1 && segCount > 1) {
        fn = rng() < 0.55 ? fns[3] : fns[0];          // 结尾倾向属和弦，便于循环解决
      } else {
        let pool = [fns[0], fns[1], fns[2], fns[3]];
        let weights = [1.4, 2.4, 2.2, 2.4];
        do {
          fn = weightedPick(pool, weights, rng);
        } while (picks.length && fn.sym === picks[picks.length - 1].sym && rng() < 0.7);
      }
      picks.push(fn);
    }
    picks.forEach(function (fn, i) {
      let start = halfBar ? i * 8 : i * 16;
      let ch = makeChord(key, fn, seventh);
      ch.start = start;
      ch.len = halfBar ? 8 : 16;
      song.chords.push(ch);
    });
    song.chords.sort(function (a, b) { return a.start - b.start; });
    song.chords.forEach(function (ch, ci) {
      for (let s = ch.start; s < ch.start + ch.len && s < song.steps; s++) song.chordIdx[s] = ci;
    });
  }

  // 贝斯：跟随每段和弦根音，节奏型随风格变化
  function genBass(song, key, styleId, c) {
    for (let bar = 0; bar < song.bars; bar++) {
      let base = bar * 16;
      for (let sub = 0; sub < 16; sub++) {
        let p = base + sub;
        if (song.bass[p]) continue;
        let ch = song.chords[song.chordIdx[p]];
        let root = bassRootMidi(key.root, ch.rootPc);
        let on = false, midi = root, len = 2;
        if (styleId === 'electro') {
          if (sub % 2 === 0) { on = true; len = c >= 5 ? 1 : 2; if (sub % 8 === 6) midi = root + 12; }
        } else if (styleId === 'jazz') {
          if (sub % 4 === 0) { on = true; len = 3; }                       // 行走贝斯四分音
          if (c >= 4 && (sub === 6 || sub === 14)) { on = true; midi = root + 7; len = 1; }
        } else if (styleId === 'light') {
          if (sub === 0) { on = true; len = 7; }
          else if (sub === 8) { on = true; len = 4; }
          if (c >= 3 && sub === 12) { on = true; midi = root + 7; len = 3; }
        } else if (styleId === 'mystery') {
          if (sub === 0) { on = true; len = 12; }
          else if (c >= 3 && sub === 8) { on = true; len = 6; }
          if (c >= 5 && sub === 14) { on = true; midi = root + 7; len = 1; }
        } else { // penta 中国五声：宫音与徵音（纯五度）交替拨弦
          if (sub === 0 || sub === 8) { on = true; len = 4; }
          if (sub === 4 || sub === 12) { on = true; midi = root + 7; len = 3; }
          if (c >= 4 && sub === 14) { on = true; midi = root + 12; len = 1; }
        }
        if (on) { song.bass[p] = midi; song.bassLen[p] = len; }
      }
    }
  }

  // 鼓组：底鼓/踩镲/军鼓三小轨，按风格给节奏型，复杂度提升加花
  function genDrums(song, styleId, c, rng) {
    function put(arr, bar, sub, v) {
      let p = bar * 16 + sub;
      if (!arr[p] || v > arr[p]) arr[p] = v;
    }
    for (let bar = 0; bar < song.bars; bar++) {
      if (styleId === 'electro') {                         // 四四拍底鼓 + 反拍军鼓
        [0, 4, 8, 12].forEach(function (s) { put(song.kick, bar, s, 118); });
        [4, 12].forEach(function (s) { put(song.snare, bar, s, 108); });
        for (let e1 = 0; e1 < 16; e1 += 2) put(song.hat, bar, e1, e1 % 4 === 2 ? 95 : 70);
        if (c >= 4) for (let o1 = 1; o1 < 16; o1 += 2) if (rng() < 0.35) put(song.hat, bar, o1, 55);
      } else if (styleId === 'light') {
        [0, 8].forEach(function (s) { put(song.kick, bar, s, 112); });
        [4, 12].forEach(function (s) { put(song.snare, bar, s, 100); });
        for (let e2 = 0; e2 < 16; e2 += 2) put(song.hat, bar, e2, e2 % 4 === 2 ? 85 : 60);
        if (c >= 3 && rng() < 0.5) put(song.kick, bar, 10, 100);
        if (c >= 4) for (let o2 = 1; o2 < 16; o2 += 2) if (rng() < 0.3) put(song.hat, bar, o2, 50);
      } else if (styleId === 'mystery') {                  // 稀疏、幽暗
        put(song.kick, bar, 0, 110);
        if (c >= 3 && rng() < 0.6) put(song.kick, bar, 8, 100);
        put(song.snare, bar, 14, 58);                      // 极轻军鼓边击收句
        if (c >= 2) put(song.snare, bar, 4, 92);
        if (c >= 4 && rng() < 0.5) put(song.snare, bar, 12, 92);
        [2, 6, 10, 14].forEach(function (s) { put(song.hat, bar, s, 55); });
        if (c >= 4 && rng() < 0.5) put(song.hat, bar, 8, 60);
      } else if (styleId === 'jazz') {                     // 摇摆镲片 + 补偿式底鼓军鼓
        [0, 8].forEach(function (s) { put(song.kick, bar, s, 100); });
        [4, 12].forEach(function (s) { put(song.snare, bar, s, 112); });
        for (let e3 = 0; e3 < 16; e3 += 2) put(song.hat, bar, e3, e3 % 4 === 2 ? 92 : 64);
        if (c >= 3 && rng() < 0.6) put(song.kick, bar, rng() < 0.5 ? 10 : 14, 90);
        if (c >= 4) [7, 15].forEach(function (s) { if (rng() < 0.6) put(song.snare, bar, s, 60); });
        if (c >= 5 && bar === song.bars - 1) [13, 14, 15].forEach(function (s) { put(song.snare, bar, s, 55); });
      } else {                                             // penta：锣鼓点式稀疏骨架
        [0, 8].forEach(function (s) { put(song.kick, bar, s, 112); });
        [2, 6, 10, 14].forEach(function (s) { put(song.hat, bar, s, 60); });
        put(song.snare, bar, 12, 100);
        if (c >= 3 && rng() < 0.6) put(song.snare, bar, 4, 88);
        if (c >= 4 && rng() < 0.5) put(song.kick, bar, 15, 95);
      }
    }
  }

  function pickDur(durs, rng, pos, N) {
    let d = durs[Math.floor(rng() * durs.length)];
    if (pos + d > N) d = N - pos;
    return Math.max(1, d);
  }

  // 旋律：马尔可夫式音程走向，强拍贴合和弦音，末小节落音倾向主音
  function genMelody(song, key, styleId, c, rng) {
    let arr = styleId === 'penta' ? SCALE_PENTA : scaleOfKey(key);
    let durs = MEL_DURS[styleId];
    let steps = MEL_STEPS[styleId];
    let densityMul = { light: 1.12, mystery: 0.78, jazz: 1.0, electro: 1.05, penta: 0.92 }[styleId];
    let density = [0.25, 0.34, 0.44, 0.55, 0.66][c - 1] * densityMul;
    let N = song.steps;
    let k = arr.length;                 // 从高八度主音出发
    let pos = 0;

    function chordAt(p) { return song.chords[song.chordIdx[p]]; }
    function put(p, midi, len) { song.melody[p] = midi; song.melLen[p] = Math.min(len, N - p); }
    // 选取和弦音；五声风格下只取宫商角徵羽之内的音，杜绝偏音
    function pickChordPc(ch, r) {
      let count = Math.min(3, ch.offsets.length);
      let cands = [];
      for (let ci = 0; ci < count; ci++) cands.push((ch.rootPc + ch.offsets[ci]) % 12);
      if (styleId === 'penta') {
        let pentaPcs = SCALE_PENTA.map(function (iv) { return (key.root + iv) % 12; });
        let filtered = cands.filter(function (pc) { return pentaPcs.indexOf(pc) >= 0; });
        if (filtered.length) cands = filtered;
      }
      return cands[Math.floor(r() * cands.length)];
    }

    // 起句：多半在强拍以主和弦音进入
    if (rng() < 0.82) {
      let ch0 = chordAt(0);
      let pc0 = pickChordPc(ch0, rng);
      k = nearestKToPc(k, pc0, arr, key.root);
      let start = (styleId === 'electro' || styleId === 'jazz') && rng() < 0.3 ? 1 : 0;
      let d0 = pickDur(durs, rng, start, N);
      put(start, mapK(k, arr, key.root), d0);
      pos = start + d0;
    }
    while (pos < N) {
      let inBar = pos % 16;
      if ((inBar === 14 || inBar === 15) && rng() < 0.5) { pos++; continue; }  // 句末换气
      if (rng() > density) { pos++; continue; }                                 // 密度控制（休止）
      let ch = chordAt(pos);
      if (pos % 4 === 0 && rng() < 0.45) {
        // 强拍倾向和弦音（五声风格自动过滤偏音）
        let pc = pickChordPc(ch, rng);
        k = nearestKToPc(k, pc, arr, key.root);
      } else {
        // 马尔可夫式度数跳动：同音级进为主，偶尔跳进
        k = clampK(k + weightedDelta(steps, rng), arr, key.root);
      }
      if (pos >= N - 4 && rng() < 0.72) k = nearestKToPc(k, key.root, arr, key.root); // 落音归主
      let len = pickDur(durs, rng, pos, N);
      put(pos, mapK(k, arr, key.root), len);
      pos += len;
    }
    // 保证收束：末两步若空白则补一个主音
    let lastStart = -1;
    for (let i = N - 1; i >= 0; i--) if (song.melody[i]) { lastStart = i; break; }
    if (lastStart < N - 4 && !song.melody[N - 2]) {
      k = nearestKToPc(k, key.root, arr, key.root);
      put(N - 2, mapK(k, arr, key.root), 2);
    }
  }

  /* ===================== WAV 编码（16bit PCM） ===================== */

  function encodeWAV(buffer) {
    let channels = buffer.numberOfChannels;
    let sampleRate = buffer.sampleRate;
    let frames = buffer.length;
    let dataSize = frames * channels * 2;
    let ab = new ArrayBuffer(44 + dataSize);
    let dv = new DataView(ab);
    function wstr(off, s) { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); }
    // 44 字节标准 WAV 头
    wstr(0, 'RIFF');
    dv.setUint32(4, 36 + dataSize, true);
    wstr(8, 'WAVE');
    wstr(12, 'fmt ');
    dv.setUint32(16, 16, true);                 // PCM 块大小
    dv.setUint16(20, 1, true);                  // PCM 格式
    dv.setUint16(22, channels, true);
    dv.setUint32(24, sampleRate, true);
    dv.setUint32(28, sampleRate * channels * 2, true);
    dv.setUint16(32, channels * 2, true);
    dv.setUint16(34, 16, true);
    wstr(36, 'data');
    dv.setUint32(40, dataSize, true);
    let chans = [];
    for (let ch = 0; ch < channels; ch++) chans.push(buffer.getChannelData(ch));
    let off = 44;
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < channels; c++) {
        let s = Math.max(-1, Math.min(1, chans[c][i]));
        dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        off += 2;
      }
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  // 供 Node 自测与各模块共用的纯逻辑接口
  const API = {
    KEYS: KEYS, STYLES: STYLES, NOTE_NAMES: NOTE_NAMES,
    SCALE_MAJ: SCALE_MAJ, SCALE_MIN: SCALE_MIN, SCALE_PENTA: SCALE_PENTA,
    hashSeed: hashSeed, mulberry32: mulberry32,
    generateSong: generateSong, encodeWAV: encodeWAV,
    midiToFreq: midiToFreq, midiName: midiName, mapK: mapK, kForMidi: kForMidi,
    scaleOfKey: scaleOfKey, bassRootMidi: bassRootMidi,
    createGraph: createGraph, scheduleStep: scheduleStep, createScheduler: createScheduler
  };

  // 浏览器环境才初始化界面；Node 自测环境仅导出纯逻辑
  if (typeof document !== 'undefined') {
    initBrowser(API);
  }
  global.ComposerAPI = API;

  /* ===================== 以下为浏览器音频引擎与界面 ===================== */
  function makeNoiseBuffer(ctx) {
    let len = Math.floor(ctx.sampleRate * 1.2);
    let buf = ctx.createBuffer(1, len, ctx.sampleRate);
    let d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // 音频总线：三条声部母线经压缩器、主控送到分析器与输出
  function createGraph(ctx, withAnalyser) {
    let master = ctx.createGain();
    master.gain.value = 0.9;
    let comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;

    let melBus = ctx.createGain();  melBus.gain.value = 0.32;
    let bassBus = ctx.createGain(); bassBus.gain.value = 0.42;
    let drumBus = ctx.createGain(); drumBus.gain.value = 0.95;
    melBus.connect(comp);
    bassBus.connect(comp);
    drumBus.connect(comp);
    comp.connect(master);

    let analyser = null;
    if (withAnalyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      master.connect(analyser);
      analyser.connect(ctx.destination);
    } else {
      master.connect(ctx.destination);
    }
    return {
      ctx: ctx, master: master, comp: comp, analyser: analyser,
      melBus: melBus, bassBus: bassBus, drumBus: drumBus,
      noise: makeNoiseBuffer(ctx)
    };
  }

  /* ---------- 旋律：方波/三角波 + 轻包络 + 低通 ---------- */
  function playMelody(eng, t, midi, durSec, vel) {
    let ctx = eng.ctx;
    let osc = ctx.createOscillator();
    osc.type = eng.waveform || 'triangle';
    osc.frequency.value = midiToFreq(midi);
    let filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = osc.type === 'square' ? 1900 : 2600;
    filt.Q.value = 0.4;
    let g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(filt); filt.connect(g); g.connect(eng.melBus);

    let attack = 0.006, decay = 0.09, sustain = 0.55, rel = 0.14;
    let peak = 0.95 * vel;
    let endT = Math.max(t + attack + 0.02, t + durSec);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.linearRampToValueAtTime(peak * sustain, t + attack + decay);
    g.gain.setValueAtTime(peak * sustain, endT);
    g.gain.exponentialRampToValueAtTime(0.0001, endT + rel);
    osc.start(t);
    osc.stop(endT + rel + 0.05);
  }

  /* ---------- 贝斯：正弦 + 柔和包络 ---------- */
  function playBass(eng, t, midi, durSec, vel) {
    let ctx = eng.ctx;
    let osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = midiToFreq(midi);
    let g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g); g.connect(eng.bassBus);
    let attack = 0.008, rel = 0.12;
    let endT = Math.max(t + attack + 0.02, t + durSec);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9 * vel, t + attack);
    g.gain.exponentialRampToValueAtTime(0.5 * vel, t + attack + 0.12);
    g.gain.setValueAtTime(0.5 * vel, endT);
    g.gain.exponentialRampToValueAtTime(0.0001, endT + rel);
    osc.start(t);
    osc.stop(endT + rel + 0.05);
  }

  /* ---------- 底鼓：频率下滑的正弦爆音 150Hz 降至 45Hz ---------- */
  function playKick(eng, t, vel) {
    let ctx = eng.ctx;
    let osc = ctx.createOscillator();
    let g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    g.gain.setValueAtTime(0.95 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    osc.connect(g); g.connect(eng.drumBus);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  /* ---------- 踩镲：高通滤波后的白噪声短音 ---------- */
  function playHat(eng, t, vel) {
    let ctx = eng.ctx;
    let src = ctx.createBufferSource();
    src.buffer = eng.noise;
    let hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7800;
    let g = ctx.createGain();
    g.gain.setValueAtTime(0.3 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(hp); hp.connect(g); g.connect(eng.drumBus);
    src.start(t);
    src.stop(t + 0.08);
  }

  /* ---------- 军鼓：带通噪声爆音 + 短促金属腔体 ---------- */
  function playSnare(eng, t, vel) {
    let ctx = eng.ctx;
    let src = ctx.createBufferSource();
    src.buffer = eng.noise;
    let bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.9;
    let g = ctx.createGain();
    g.gain.setValueAtTime(0.36 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
    src.connect(bp); bp.connect(g); g.connect(eng.drumBus);
    src.start(t);
    src.stop(t + 0.22);

    let osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.09);
    let g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.26 * vel, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(g2); g2.connect(eng.drumBus);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  // 触发某一步上的全部音符；爵士风格对反拍八分音符施加摇摆延时
  function scheduleStep(eng, song, step, time) {
    let sps = eng.secPerStep;
    let t = time;
    if (eng.swing && step % 4 === 2) t += sps * 0.66;
    let accent = step % 4 === 0 ? 1 : 0.86;
    if (song.melody[step]) {
      playMelody(eng, t, song.melody[step], Math.max(0.08, song.melLen[step] * sps * 0.96), 0.95 * accent);
    }
    if (song.bass[step]) {
      playBass(eng, t, song.bass[step], Math.max(0.08, song.bassLen[step] * sps * 0.94), 0.95 * accent);
    }
    if (song.kick[step])  playKick(eng, t, song.kick[step] / 127);
    if (song.hat[step])   playHat(eng, t, song.hat[step] / 127);
    if (song.snare[step]) playSnare(eng, t, song.snare[step] / 127);
  }

  // lookahead 调度：setInterval 轮询，用 AudioContext 时间精确排程，避免节奏卡顿
  function createScheduler(engineRef, songRef) {
    let timer = 0;
    function tick() {
      let eng = engineRef();
      let song = songRef();
      if (!eng || !eng.playing || !song) return;
      while (eng.nextTime < eng.ctx.currentTime + 0.12) {
        let s = eng.step % song.steps;
        scheduleStep(eng, song, s, eng.nextTime);
        eng.queue.push({ step: s, time: eng.nextTime });
        eng.step++;
        eng.nextTime += eng.secPerStep;
      }
    }
    return {
      start: function () { if (!timer) timer = setInterval(tick, 25); },
      stop: function () { if (timer) { clearInterval(timer); timer = 0; } }
    };
  }
  function initBrowser(api) {
    let STORAGE_KEY = 'composer-settings';
    function $(id) { return document.getElementById(id); }

    /* ---------- 设置与状态 ---------- */
    function loadSettings() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; }
      catch (e) { return null; }
    }
    let saved = loadSettings() || {};
    let cfg = {
      keyId: saved.keyId || 'C',
      styleId: saved.styleId || 'light',
      complexity: Math.min(5, Math.max(1, saved.complexity || 3)),
      bpm: Math.min(200, Math.max(60, saved.bpm || 112)),
      waveform: saved.waveform === 'square' ? 'square' : 'triangle',
      seed: saved.seed || (Math.floor(Math.random() * 900000) + 100000),
      inspiration: 0
    };
    function saveSettings() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          keyId: cfg.keyId, styleId: cfg.styleId, complexity: cfg.complexity,
          bpm: cfg.bpm, waveform: cfg.waveform, seed: cfg.seed
        }));
      } catch (e) { /* 隐私模式等场景静默忽略 */ }
    }

    let song = null;
    let engine = null;
    let scheduler = null;
    let inputMidi = 72;
    let undoStack = [];
    let redoStack = [];
    let undoPushed = false;

    /* ---------- 常用元素 ---------- */
    let keySelect = $('keySelect'), styleSelect = $('styleSelect');
    let complexitySeg = $('complexitySeg');
    let bpmRange = $('bpmRange'), bpmValue = $('bpmValue'), waveSelect = $('waveSelect');
    let seedInput = $('seedInput');
    let playBtn = $('playBtn'), regenBtn = $('regenBtn'), inspireBtn = $('inspireBtn');
    let undoBtn = $('undoBtn'), redoBtn = $('redoBtn'), diceBtn = $('diceBtn'), exportBtn = $('exportBtn');
    let pianoEl = $('piano'), inputNote = $('inputNote');
    let seqEl = $('seq'), chordText = $('chordText'), barText = $('barText');

    api.KEYS.forEach(function (k) {
      let o = document.createElement('option');
      o.value = k.id; o.textContent = k.name;
      keySelect.appendChild(o);
    });
    api.STYLES.forEach(function (s) {
      let o = document.createElement('option');
      o.value = s.id; o.textContent = s.name;
      styleSelect.appendChild(o);
    });
    keySelect.value = cfg.keyId;
    styleSelect.value = cfg.styleId;
    bpmRange.value = String(cfg.bpm);
    bpmValue.textContent = String(cfg.bpm);
    waveSelect.value = cfg.waveform;
    seedInput.value = String(cfg.seed);
    Array.prototype.forEach.call(complexitySeg.querySelectorAll('button'), function (b) {
      b.classList.toggle('active', Number(b.dataset.c) === cfg.complexity);
    });

    function currentKey() {
      return api.KEYS.filter(function (k) { return k.id === cfg.keyId; })[0];
    }
    function currentScaleArr() {
      return cfg.styleId === 'penta' ? api.SCALE_PENTA : api.scaleOfKey(currentKey());
    }
    function isInScale(m) {
      let pc = ((m % 12) - currentKey().root + 120) % 12;
      return currentScaleArr().indexOf(pc) >= 0;
    }

    /* ---------- 钢琴键盘（选定当前输入音） ---------- */
    function buildPiano() {
      pianoEl.innerHTML = '';
      let lo = 60, hi = 84;
      let blacks = [1, 3, 6, 8, 10];
      let whites = [];
      for (let m = lo; m <= hi; m++) if (blacks.indexOf(m % 12) < 0) whites.push(m);
      let wt = whites.length;
      whites.forEach(function (mm, i) {
        let b = document.createElement('button');
        b.type = 'button';
        b.className = 'pkey white';
        b.style.left = (i / wt * 100) + '%';
        b.style.width = (100 / wt) + '%';
        b.dataset.midi = String(mm);
        if (isInScale(mm)) b.classList.add('inscale');
        b.addEventListener('click', function () { setInput(mm); });
        pianoEl.appendChild(b);
      });
      let wi = 0;
      for (let m2 = lo; m2 <= hi; m2++) {
        if (blacks.indexOf(m2 % 12) < 0) { wi++; continue; }
        let bb = document.createElement('button');
        bb.type = 'button';
        bb.className = 'pkey black';
        bb.style.left = (wi / wt * 100) + '%';
        bb.style.width = (64 / wt) + '%';
        bb.style.transform = 'translateX(-50%)';
        bb.dataset.midi = String(m2);
        if (isInScale(m2)) bb.classList.add('inscale');
        bb.addEventListener('click', function () { setInput(Number(this.dataset.midi)); });
        pianoEl.appendChild(bb);
      }
      setInput(inputMidi);
    }
    function setInput(m) {
      inputMidi = m;
      inputNote.textContent = api.midiName(m);
      Array.prototype.forEach.call(pianoEl.querySelectorAll('.pkey'), function (b) {
        b.classList.toggle('selected', Number(b.dataset.midi) === m);
      });
    }

    /* ---------- 步进音序器网格 ---------- */
    let refs = { lamp: [], mel: [], bass: [], kick: [], hat: [], snare: [] };

    function pitchColor(m) {
      let h = 205 - ((m - 60) / 24) * 185;
      return 'hsl(' + Math.round(h) + ',85%,64%)';
    }
    function addLabel(text) {
      let d = document.createElement('div');
      d.className = 'row-label';
      d.textContent = text;
      seqEl.appendChild(d);
      return d;
    }
    function makeCell(extra, step) {
      let d = document.createElement('div');
      d.className = 'cell ' + extra;
      if (step % 16 === 0) d.classList.add('barstart');
      else if (step % 4 === 0) d.classList.add('beat');
      return d;
    }
    function buildGrid() {
      let N = song.steps;
      seqEl.style.setProperty('--steps', String(N));
      seqEl.innerHTML = '';
      refs = { lamp: [], mel: [], bass: [], kick: [], hat: [], snare: [] };

      addLabel('和弦');
      song.chords.forEach(function (ch) {
        let d = document.createElement('div');
        d.className = 'chord-label';
        d.textContent = ch.name;
        d.style.gridColumn = 'span ' + ch.len;
        seqEl.appendChild(d);
      });

      addLabel('步进');
      for (let s0 = 0; s0 < N; s0++) {
        let lc = makeCell('lamp', s0);
        refs.lamp.push(lc);
        seqEl.appendChild(lc);
      }

      let rows = [
        ['mel', '旋律'], ['bass', '贝斯'],
        ['kick', '底鼓'], ['hat', '踩镲'], ['snare', '军鼓']
      ];
      rows.forEach(function (r) {
        addLabel(r[1]);
        for (let s = 0; s < N; s++) {
          let c = makeCell('', s);
          if (r[0] === 'kick' || r[0] === 'hat' || r[0] === 'snare') {
            let dot = document.createElement('span');
            dot.className = 'drum-dot';
            c.appendChild(dot);
          }
          refs[r[0]].push(c);
          seqEl.appendChild(c);
        }
      });

      bindMelodyCells();
      bindBassCells();
      bindDrumCells(refs.kick, song.kick, 'on-kick');
      bindDrumCells(refs.hat, song.hat, 'on-hat');
      bindDrumCells(refs.snare, song.snare, 'on-snr');
      renderAllCells();
    }

    function renderAllCells() {
      for (let s = 0; s < song.steps; s++) {
        let mc = refs.mel[s];
        mc.textContent = '';
        mc.style.background = '';
        if (song.melody[s]) {
          mc.textContent = api.midiName(song.melody[s]);
          mc.style.background = pitchColor(song.melody[s]);
        }
        let bc = refs.bass[s];
        bc.textContent = '';
        bc.classList.toggle('on-bass', !!song.bass[s]);
        if (song.bass[s]) bc.textContent = api.midiName(song.bass[s]);
        refs.kick[s].classList.toggle('on-kick', !!song.kick[s]);
        refs.hat[s].classList.toggle('on-hat', !!song.hat[s]);
        refs.snare[s].classList.toggle('on-snr', !!song.snare[s]);
      }
      applyTails();
    }
    function applyTails() {
      let all = refs.mel.concat(refs.bass);
      all.forEach(function (c) { c.classList.remove('tail'); });
      for (let s = 0; s < song.steps; s++) {
        let pair = [[song.melody, song.melLen, refs.mel], [song.bass, song.bassLen, refs.bass]];
        pair.forEach(function (pp) {
          let arr = pp[0], lens = pp[1], cells = pp[2];
          if (arr[s]) {
            for (let k = 1; k < lens[s] && s + k < song.steps; k++) cells[s + k].classList.add('tail');
          }
        });
      }
    }

    /* ---------- 编辑：撤销/重做（各保留 10 步） ---------- */
    function cloneSong(x) { return JSON.parse(JSON.stringify(x)); }
    function beginEdit() {
      if (undoPushed || !song) return;
      undoStack.push(cloneSong(song));
      if (undoStack.length > 10) undoStack.shift();
      redoStack = [];
      undoPushed = true;
      updateUndoButtons();
    }
    function pushUndoNow() {
      if (!song) return;
      undoStack.push(cloneSong(song));
      if (undoStack.length > 10) undoStack.shift();
      redoStack = [];
      updateUndoButtons();
    }
    function updateUndoButtons() {
      undoBtn.disabled = undoStack.length === 0;
      redoBtn.disabled = redoStack.length === 0;
    }
    undoBtn.addEventListener('click', function () {
      if (!undoStack.length || !song) return;
      redoStack.push(cloneSong(song));
      song = undoStack.pop();
      afterSongChanged(true);
    });
    redoBtn.addEventListener('click', function () {
      if (!redoStack.length || !song) return;
      undoStack.push(cloneSong(song));
      song = redoStack.pop();
      afterSongChanged(true);
    });

    /* ---------- 旋律格：点击开关 / 上下拖拽改音高 ---------- */
    let drag = null;
    function bindMelodyCells() {
      refs.mel.forEach(function (c, s) {
        c.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          if (c.setPointerCapture) c.setPointerCapture(e.pointerId);
          drag = {
            step: s, startY: e.clientY, moved: false,
            k0: song.melody[s] ? api.kForMidi(song.melody[s], currentScaleArr(), song.keyRoot) : 0
          };
        });
        c.addEventListener('pointermove', function (e) {
          if (!drag || drag.step !== s || !song.melody[s]) return;
          let dy = e.clientY - drag.startY;
          if (Math.abs(dy) < 12) return;
          if (!drag.moved) { drag.moved = true; beginEdit(); }
          let kk = drag.k0 + Math.round(-dy / 16);
          let midi = api.mapK(clampK(kk, currentScaleArr(), song.keyRoot), currentScaleArr(), song.keyRoot);
          if (midi !== song.melody[s]) {
            song.melody[s] = midi;
            renderAllCells();
          }
        });
        function finish() {
          if (!drag || drag.step !== s) return;
          if (!drag.moved) {
            beginEdit();
            if (song.melody[s]) { song.melody[s] = 0; song.melLen[s] = 0; }
            else { song.melody[s] = inputMidi; song.melLen[s] = 2; }
            renderAllCells();
          }
          drag = null;
          undoPushed = false;
          updateUndoButtons();
        }
        c.addEventListener('pointerup', finish);
        c.addEventListener('pointercancel', function () { drag = null; undoPushed = false; });
      });
    }

    /* ---------- 贝斯格：点击开关（音高跟随该步和弦根音） ---------- */
    function bindBassCells() {
      refs.bass.forEach(function (c, s) {
        c.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          beginEdit();
          if (song.bass[s]) {
            song.bass[s] = 0; song.bassLen[s] = 0;
          } else {
            let ch = song.chords[song.chordIdx[s]];
            song.bass[s] = api.bassRootMidi(song.keyRoot, ch.rootPc);
            song.bassLen[s] = 4;
          }
          renderAllCells();
          undoPushed = false;
          updateUndoButtons();
        });
      });
    }

    /* ---------- 鼓格：点击开关 ---------- */
    function bindDrumCells(cells, arr, onClass) {
      cells.forEach(function (c, s) {
        c.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          beginEdit();
          arr[s] = arr[s] ? 0 : 100;
          c.classList.toggle(onClass, !!arr[s]);
          undoPushed = false;
          updateUndoButtons();
        });
      });
    }
    /* ---------- 换曲后的统一刷新 ---------- */
    function afterSongChanged() {
      if (!song) return;
      buildGrid();
      chordText.textContent = song.chords.map(function (c) { return c.name; }).join(' – ');
      barText.textContent = '1/' + song.bars;
      particles.length = 0;
      lastParticleStep = -1;
      if (engine) {
        engine.queue.length = 0;
        engine.lastFired = null;
        engine.step = 0;
        if (engine.playing) engine.nextTime = engine.ctx.currentTime + 0.06; // 立即对齐，不串拍
      }
      prevLit = -1;
      updateUndoButtons();
    }

    function regenerateAll() {
      if (song) pushUndoNow();
      cfg.inspiration = 0;
      song = api.generateSong(cfg);
      afterSongChanged();
    }
    function regenerateMelodyOnly() {
      if (!song) return;
      pushUndoNow();
      cfg.inspiration++;
      let keep = {
        chords: song.chords.slice(), chordIdx: song.chordIdx.slice(),
        bass: song.bass.slice(), bassLen: song.bassLen.slice(),
        kick: song.kick.slice(), hat: song.hat.slice(), snare: song.snare.slice()
      };
      song = api.generateSong(cfg);
      song.chords = keep.chords;
      song.chordIdx = keep.chordIdx;
      song.bass = keep.bass; song.bassLen = keep.bassLen;
      song.kick = keep.kick; song.hat = keep.hat; song.snare = keep.snare;
      afterSongChanged();
    }
    regenBtn.addEventListener('click', regenerateAll);
    inspireBtn.addEventListener('click', regenerateMelodyOnly);

    diceBtn.addEventListener('click', function () {
      cfg.seed = Math.floor(Math.random() * 900000) + 100000;
      seedInput.value = String(cfg.seed);
      saveSettings();
      if (song) regenerateAll();
    });

    /* ---------- 参数控件 ---------- */
    keySelect.addEventListener('change', function () {
      cfg.keyId = keySelect.value;
      saveSettings();
      if (song) { buildPiano(); regenerateAll(); }
    });
    styleSelect.addEventListener('change', function () {
      cfg.styleId = styleSelect.value;
      saveSettings();
      if (engine) engine.swing = cfg.styleId === 'jazz';
      if (song) { buildPiano(); regenerateAll(); }
    });
    Array.prototype.forEach.call(complexitySeg.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        cfg.complexity = Number(b.dataset.c);
        complexitySeg.querySelectorAll('button').forEach(function (x) {
          x.classList.toggle('active', x === b);
        });
        saveSettings();
        if (song) regenerateAll();
      });
    });
    bpmRange.addEventListener('input', function () {
      cfg.bpm = Number(bpmRange.value);
      bpmValue.textContent = String(cfg.bpm);
      saveSettings();
      if (engine) engine.secPerStep = 60 / cfg.bpm / 4;
    });
    waveSelect.addEventListener('change', function () {
      cfg.waveform = waveSelect.value;
      saveSettings();
      if (engine) engine.waveform = cfg.waveform;
    });
    seedInput.addEventListener('change', function () {
      let v = parseInt(seedInput.value, 10);
      if (!isFinite(v) || v < 1) v = Math.floor(Math.random() * 900000) + 100000;
      cfg.seed = v;
      seedInput.value = String(v);
      saveSettings();
      if (song) regenerateAll();
    });

    /* ---------- 音频引擎与走带 ---------- */
    function ensureEngine() {
      if (engine) return engine;
      let AC = window.AudioContext || window.webkitAudioContext;
      let ctx = new AC();
      let g = createGraph(ctx, true);
      engine = Object.assign(g, {
        step: 0, nextTime: 0, playing: false,
        waveform: cfg.waveform,
        secPerStep: 60 / cfg.bpm / 4,
        swing: cfg.styleId === 'jazz',
        queue: [], lastFired: null
      });
      scheduler = createScheduler(function () { return engine; }, function () { return song; });
      return engine;
    }
    function playTransport() {
      let eng = ensureEngine();
      if (eng.ctx.state === 'suspended' && eng.ctx.resume) eng.ctx.resume();
      eng.playing = true;
      eng.nextTime = eng.ctx.currentTime + 0.08;
      scheduler.start();
      playBtn.textContent = '暂停';
    }
    function pauseTransport() {
      if (!engine) return;
      engine.playing = false;
      scheduler.stop();
      playBtn.textContent = '播放';
    }
    playBtn.addEventListener('click', function () {
      if (!song) return;
      if (engine && engine.playing) pauseTransport();
      else playTransport();
    });

    /* ---------- 离线渲染并导出 WAV ---------- */
    let exporting = false;
    exportBtn.addEventListener('click', function () {
      if (!song || exporting) return;
      exporting = true;
      exportBtn.disabled = true;
      exportBtn.textContent = '导出中…';
      let sr = 44100;
      let sps = 60 / cfg.bpm / 4;
      let total = song.steps * sps + 1.0;
      let off = new OfflineAudioContext(2, Math.ceil(total * sr), sr);
      let g = createGraph(off, false);
      let eng = Object.assign(g, {
        secPerStep: sps, swing: cfg.styleId === 'jazz',
        waveform: cfg.waveform, queue: [], playing: false
      });
      let start = 0.06;
      for (let i = 0; i < song.steps; i++) scheduleStep(eng, song, i, start + i * sps);
      off.startRendering().then(function (rendered) {
        let blob = api.encodeWAV(rendered);
        let url = URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.href = url;
        a.download = '星空作曲机_' + cfg.keyId + '_' + cfg.styleId + '_' + cfg.seed + '.wav';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      })['catch'](function () {
        exportBtn.textContent = '导出失败，请重试';
        setTimeout(function () { exportBtn.textContent = '导出 WAV'; }, 1800);
      })['finally'](function () {
        exporting = false;
        exportBtn.disabled = false;
        if (exportBtn.textContent.indexOf('失败') < 0) exportBtn.textContent = '导出 WAV';
      });
    });

    /* ===================== Canvas 可视化 ===================== */
    let cv = $('viz'), cx = cv.getContext('2d');
    let cssW = 0, cssH = 0;
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    let particles = [];
    let stars = [];
    let lastParticleStep = -1;
    let prevLit = -1;
    let freqData = null;
    let lastFrameT = 0;

    for (let si = 0; si < 90; si++) {
      stars.push({
        x: Math.random(), y: Math.random() * 0.9,
        r: 0.5 + Math.random() * 1.3,
        ph: Math.random() * Math.PI * 2, sp: 0.6 + Math.random() * 1.6
      });
    }

    function resizeCanvas() {
      let rect = cv.getBoundingClientRect();
      cssW = rect.width;
      cssH = rect.height;
      let bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
      if (cv.width !== bw || cv.height !== bh) {
        cv.width = bw;
        cv.height = bh;
      }
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', resizeCanvas);

    function modN(v) { return ((v % song.steps) + song.steps) % song.steps; }

    // 由调度队列推算带小数的当前步进，用于平滑滚动与粒子
    function getVisualStep() {
      let e = engine, n = song.steps;
      if (!e || !e.playing) {
        return e && e.lastFired ? e.lastFired.step : (e ? e.step % n : 0);
      }
      while (e.queue.length && e.queue[0].time <= e.ctx.currentTime) {
        e.lastFired = e.queue.shift();
      }
      if (!e.queue.length) return e.lastFired ? e.lastFired.step : 0;
      let b = e.queue[0];
      if (!e.lastFired) return (b.step - 1 + n) % n;
      let f = (e.ctx.currentTime - e.lastFired.time) / (b.time - e.lastFired.time);
      f = Math.max(0, Math.min(0.999, f));
      return (e.lastFired.step + f) % n;
    }

    function roundRect(x0, y0, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      cx.beginPath();
      cx.moveTo(x0 + r, y0);
      cx.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
      cx.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
      cx.arcTo(x0, y0 + h, x0, y0, r);
      cx.arcTo(x0, y0, x0 + w, y0, r);
      cx.closePath();
    }

    function spawnParticles(step, hx, yOfMidi) {
      if (step === lastParticleStep) return;
      lastParticleStep = step;
      let cxp = hx + colW() / 2;
      function burst(color, y, n, spread) {
        for (let i = 0; i < n; i++) {
          particles.push({
            x: cxp + (Math.random() - 0.5) * 8, y: y,
            vx: (Math.random() - 0.5) * spread,
            vy: -20 - Math.random() * 70,
            life: 0.55 + Math.random() * 0.35, age: 0,
            color: color, size: 1.6 + Math.random() * 2.2
          });
        }
      }
      if (song.melody[step]) burst(pitchColor(song.melody[step]), yOfMidi(song.melody[step]), 7, 46);
      if (song.bass[step]) burst('#34d399', cssH - 54 - 36, 3, 30);
      if (song.kick[step]) burst('#ffb347', cssH - 54 - 15, 4, 36);
      if (song.hat[step]) burst('#22d3ee', cssH - 54 - 15, 3, 26);
      if (song.snare[step]) burst('#ff5ca8', cssH - 54 - 15, 4, 40);
    }
    function colW() { return Math.min(44, cssW / 22); }

    function frame(now) {
      requestAnimationFrame(frame);
      if (!song) return;
      resizeCanvas();
      let dt = lastFrameT ? Math.min(0.05, (now - lastFrameT) / 1000) : 0.016;
      lastFrameT = now;
      let tSec = now / 1000;

      cx.clearRect(0, 0, cssW, cssH);
      // 星空背景
      for (let i = 0; i < stars.length; i++) {
        let st = stars[i];
        let a = 0.2 + 0.5 * (Math.sin(tSec * st.sp + st.ph) * 0.5 + 0.5);
        cx.fillStyle = 'rgba(200,214,255,' + a.toFixed(3) + ')';
        cx.fillRect(st.x * cssW, st.y * (cssH - 54), st.r, st.r);
      }

      let specH = 54;
      let rollH = cssH - specH;
      let fStep = getVisualStep();
      let curStep = Math.floor(fStep);
      let curBar = Math.floor(fStep / 16);
      barText.textContent = (curBar + 1) + '/' + song.bars;

      // 步进灯
      if (curStep !== prevLit) {
        if (prevLit >= 0 && refs.lamp[prevLit]) refs.lamp[prevLit].classList.remove('cur');
        if (refs.lamp[curStep]) refs.lamp[curStep].classList.add('cur');
        ['mel', 'bass', 'kick', 'hat', 'snare'].forEach(function (k) {
          if (prevLit >= 0 && refs[k][prevLit]) refs[k][prevLit].classList.remove('cur');
          if (refs[k][curStep]) refs[k][curStep].classList.add('cur');
        });
        prevLit = curStep;
      }

      let headX = cssW * 0.3;
      let cwpx = colW();
      let rows = 25;
      let melTop = 8, melH = rollH - 56;
      let rowH = melH / rows;
      function yOfMidi(m) { return melTop + (84 - m) * rowH; }
      function sx(s) { return headX - modN(fStep - s) * cwpx; }

      // 当前小节高亮
      for (let bs = curBar * 16; bs < Math.min(song.steps, curBar * 16 + 16); bs++) {
        cx.fillStyle = 'rgba(124,92,255,0.10)';
        cx.fillRect(sx(bs) - 1, 0, cwpx + 2, rollH - 40);
      }
      // 音高网格线（调内音更亮）
      for (let m = 60; m <= 84; m++) {
        let y = yOfMidi(m);
        let ins = isInScale(m);
        cx.fillStyle = ins ? 'rgba(124,92,255,0.14)' : 'rgba(255,255,255,0.045)';
        cx.fillRect(0, y, cssW, 1);
      }
      // 小节竖线
      for (let bb = 0; bb <= song.bars; bb++) {
        let xx = sx(bb * 16);
        if (xx > -20 && xx < cssW + 20) {
          cx.fillStyle = 'rgba(255,255,255,0.10)';
          cx.fillRect(xx, 0, 1, rollH - 40);
        }
      }

      // 绘制音符（含循环卷绕时的复制）
      function noteRect(x0, y0, w, h, color, active) {
        if (x0 + w < -20 || x0 > cssW + 20) return;
        cx.fillStyle = color;
        if (active) { cx.shadowColor = color; cx.shadowBlur = 14; }
        roundRect(x0, y0, w, h, 4);
        cx.fill();
        cx.shadowBlur = 0;
      }
      for (let s = 0; s < song.steps; s++) {
        let active = s === curStep;
        let shifts = [0, song.steps * cwpx, -song.steps * cwpx];
        if (song.melody[s]) {
          let wm = Math.max(6, song.melLen[s] * cwpx - 3);
          let ym = yOfMidi(song.melody[s]) + rowH * 0.12;
          for (let z1 = 0; z1 < 3; z1++) noteRect(sx(s) + shifts[z1], ym, wm, rowH * 0.76, pitchColor(song.melody[s]), active);
        }
        if (song.bass[s]) {
          let wb = Math.max(5, song.bassLen[s] * cwpx - 3);
          for (let z2 = 0; z2 < 3; z2++) noteRect(sx(s) + shifts[z2], rollH - 38, wb, 12, '#34d399', active);
        }
        let dotY = [[song.kick, -6, 4, '#ffb347'], [song.snare, 0, 3.4, '#ff5ca8'], [song.hat, 6, 2.6, '#22d3ee']];
        for (let dd = 0; dd < 3; dd++) {
          if (!dotY[dd][0][s]) continue;
          for (let z3 = 0; z3 < 3; z3++) {
            let dx = sx(s) + shifts[z3] + cwpx / 2;
            if (dx < -10 || dx > cssW + 10) continue;
            cx.fillStyle = dotY[dd][3];
            cx.beginPath();
            cx.arc(dx, rollH - 16 + dotY[dd][1], dotY[dd][2], 0, Math.PI * 2);
            cx.fill();
          }
        }
      }

      // 播放头竖线
      cx.fillStyle = 'rgba(34,211,238,0.85)';
      cx.fillRect(headX - 0.5, 0, 1.5, rollH - 40);

      // 粒子
      spawnParticles(curStep, headX, yOfMidi);
      for (let p = particles.length - 1; p >= 0; p--) {
        let pt = particles[p];
        pt.age += dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += 130 * dt;
        let alpha = 1 - pt.age / pt.life;
        if (alpha <= 0) { particles.splice(p, 1); continue; }
        cx.globalAlpha = alpha;
        cx.fillStyle = pt.color;
        cx.beginPath();
        cx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        cx.fill();
      }
      cx.globalAlpha = 1;

      // 频谱
      if (engine && engine.analyser) {
        if (!freqData || freqData.length !== engine.analyser.frequencyBinCount) {
          freqData = new Uint8Array(engine.analyser.frequencyBinCount);
        }
        engine.analyser.getByteFrequencyData(freqData);
        let bars = 56;
        let gap = 2;
        let bwpx = (cssW - gap * (bars - 1)) / bars;
        for (let bi = 0; bi < bars; bi++) {
          let bin = Math.min(freqData.length - 1, Math.floor(Math.pow(bi / bars, 1.8) * freqData.length * 0.72) + 1);
          let v = freqData[bin] / 255;
          let bh = Math.max(2, v * (specH - 10));
          let bx = bi * (bwpx + gap);
          let grad = cx.createLinearGradient(0, cssH - 4 - bh, 0, cssH - 4);
          grad.addColorStop(0, 'rgba(34,211,238,0.9)');
          grad.addColorStop(1, 'rgba(124,92,255,0.55)');
          cx.fillStyle = grad;
          roundRect(bx, cssH - 4 - bh, bwpx, bh, 2);
          cx.fill();
        }
      } else {
        cx.fillStyle = 'rgba(154,163,199,0.35)';
        cx.font = '12px system-ui, sans-serif';
        cx.fillText('点击“开始创作”后激活音频与频谱', 16, cssH - 24);
      }
    }

    /* ---------- 开场引导：用户点击后才创建 AudioContext ---------- */
    $('startBtn').addEventListener('click', function () {
      $('intro').classList.add('hidden');
      buildPiano();
      song = api.generateSong(cfg);
      undoStack = [];
      redoStack = [];
      updateUndoButtons();
      buildGrid();
      chordText.textContent = song.chords.map(function (c) { return c.name; }).join(' – ');
      barText.textContent = '1/' + song.bars;
      resizeCanvas();
      requestAnimationFrame(frame);
    });
  }

})(typeof window !== 'undefined' ? window : globalThis);