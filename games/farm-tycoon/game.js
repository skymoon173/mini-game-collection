/* ============================================================
 * 星空农场 —— 零依赖 Canvas 农场经营游戏
 * rAF + delta time 驱动，localStorage 自动存档（键 farm-save）
 * ============================================================ */
(function () {
  'use strict';

  /* ===================== 常量配置 ===================== */

  const SAVE_KEY = 'farm-save';       // 存档键名
  const DAY_LEN = 60;                 // 每 60 秒为一天
  const MAX_COLS = 8;                 // 耕地最大列数
  const MAX_ROWS = 4;                 // 耕地最大行数
  const PLOT_COUNT = MAX_COLS * MAX_ROWS;
  const OFFLINE_CAP = 6 * 3600;       // 离开页面后的补算上限（秒）
  const SAVE_INTERVAL = 5;            // 自动保存间隔（秒）
  const GOAL_REWARD = 30;             // 今日目标奖励金币

  // 三种作物：成本 / 生长周期（秒）/ 基准收购价
  const CROPS = {
    wheat: { name: '小麦', cost: 6, time: 40, base: 12, dot: 'dot-wheat' },
    corn: { name: '玉米', cost: 14, time: 75, base: 32, dot: 'dot-corn' },
    strawberry: { name: '草莓', cost: 28, time: 120, base: 62, dot: 'dot-strawberry' }
  };
  const CROP_KEYS = ['wheat', 'corn', 'strawberry'];

  // 土地扩展路线：6x3 → 7x3 → 8x3 → 8x4
  const EXPANSIONS = [
    { fc: 6, fr: 3, nc: 7, nr: 3, cost: 180 },
    { fc: 7, fr: 3, nc: 8, nr: 3, cost: 380 },
    { fc: 8, fr: 3, nc: 8, nr: 4, cost: 650 }
  ];
  const SPRINKLER_COST = 150;         // 洒水器价格
  const SCARECROW_COST = 120;         // 稻草人价格

  /* ===================== DOM 引用 ===================== */

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('farm');
  const ctx = canvas.getContext('2d');

  const hudGold = document.getElementById('hudGold');
  const hudDay = document.getElementById('hudDay');
  const hudWeather = document.getElementById('hudWeather');
  const wIconSun = document.getElementById('wIconSun');
  const wIconRain = document.getElementById('wIconRain');
  const hudEvent = document.getElementById('hudEvent');
  const dayBarFill = document.getElementById('dayBarFill');

  const toastWrap = document.getElementById('toastWrap');
  const cropPop = document.getElementById('cropPop');
  const guideOverlay = document.getElementById('guideOverlay');
  const btnGuide = document.getElementById('btnGuide');

  const marketList = document.getElementById('marketList');
  const marketFoot = document.getElementById('marketFoot');
  const shopList = document.getElementById('shopList');

  const goalNow = document.getElementById('goalNow');
  const goalTarget = document.getElementById('goalTarget');
  const goalReward = document.getElementById('goalReward');
  const goalFill = document.getElementById('goalFill');
  const goalStatus = document.getElementById('goalStatus');
  const btnRestart = document.getElementById('btnRestart');

  /* ===================== 游戏状态 ===================== */

  let state = null;                  // 全局状态对象
  let viewW = 0;                     // 画布 CSS 像素宽
  let viewH = 0;                     // 画布 CSS 像素高
  let geo = null;                    // 当前田地几何信息
  let hoverKey = -1;                 // 鼠标悬停的格子编号
  let popupKey = -1;                 // 作物弹层对应的格子编号
  let animTime = 0;                  // 动画累计时间（秒）
  let saveTimer = 0;                 // 自动保存计时
  let pestTimer = 40 + Math.random() * 20; // 距下一次散生虫害的秒数
  let hudTimer = 0;                  // HUD 刷新节流

  // 环境粒子
  const stars = [];
  const fireflies = [];
  const rainDrops = [];
  const floaters = [];              // 画布飘字（收获金额等）

  for (let i = 0; i < 110; i++) {
    stars.push({ x: Math.random(), y: Math.random() * 0.85, r: 0.6 + Math.random() * 1.3, ph: Math.random() * Math.PI * 2, sp: 0.5 + Math.random() * 1.6 });
  }
  for (let i = 0; i < 16; i++) {
    fireflies.push({ x: Math.random(), y: Math.random(), ph: Math.random() * Math.PI * 2, sp: 0.012 + Math.random() * 0.03, amp: 0.01 + Math.random() * 0.02, hue: Math.random() < 0.5 ? '#ffe27a' : '#9dff9b' });
  }
  for (let i = 0; i < 130; i++) {
    rainDrops.push({ x: Math.random(), y: Math.random(), sp: 0.9 + Math.random() * 0.5, len: 10 + Math.random() * 12 });
  }

  /* ===================== 工具函数 ===================== */

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function plotIndex(col, row) {
    return row * MAX_COLS + col;
  }

  // 生成一块全新的田地数据
  function makePlots() {
    const arr = [];
    for (let i = 0; i < PLOT_COUNT; i++) {
      arr.push({ c: null, p: 0, pest: false, ph: Math.random() * Math.PI * 2 });
    }
    return arr;
  }

  // 每日行情：每种作物在 ±25% 内浮动
  function rollPrices() {
    const p = {};
    CROP_KEYS.forEach(k => { p[k] = 0.75 + Math.random() * 0.5; });
    return p;
  }

  // 默认（全新）状态
  function defaultState() {
    return {
      v: 1,
      gold: 50,
      day: 1,
      cols: 6,
      rows: 3,
      sprinkler: false,
      scarecrow: false,
      plots: makePlots(),
      prices: rollPrices(),
      weather: 'sun',
      harvestDay: false,
      dayElapsed: 0,
      dayEarned: 0,
      totalEarned: 0,
      goal: 120,
      goalClaimed: false,
      guideDone: false,
      lastTs: Date.now()
    };
  }

  // 某作物今日单个收购价（含丰收日加成）
  function sellValue(key) {
    const factor = state.prices[key] * (state.harvestDay ? 1.5 : 1);
    return Math.max(1, Math.round(CROPS[key].base * factor));
  }

  // 当前全局生长速度倍率
  function growthSpeed() {
    return (state.sprinkler ? 1.3 : 1) * (state.weather === 'rain' ? 1.5 : 1);
  }

  function nextExpansion() {
    return EXPANSIONS.find(e => e.fc === state.cols && e.fr === state.rows) || null;
  }

  /* ===================== 存档 / 读档 ===================== */

  function save() {
    try {
      state.lastTs = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) {
      // 本地存储不可用时静默忽略，游戏仍可进行
    }
  }

  function load() {
    const d = defaultState();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return d;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.plots)) return d;

      // 逐字段合并，保证旧存档缺少新字段时依然可用
      d.gold = typeof s.gold === 'number' ? s.gold : d.gold;
      d.day = s.day || 1;
      d.cols = clamp(s.cols || 6, 6, MAX_COLS);
      d.rows = clamp(s.rows || 3, 3, MAX_ROWS);
      d.sprinkler = !!s.sprinkler;
      d.scarecrow = !!s.scarecrow;
      d.weather = s.weather === 'rain' ? 'rain' : 'sun';
      d.harvestDay = !!s.harvestDay;
      d.dayElapsed = typeof s.dayElapsed === 'number' ? s.dayElapsed : 0;
      d.dayEarned = s.dayEarned || 0;
      d.totalEarned = s.totalEarned || 0;
      d.goal = s.goal || 120;
      d.goalClaimed = !!s.goalClaimed;
      d.guideDone = !!s.guideDone;
      d.prices = s.prices && typeof s.prices.wheat === 'number' ? s.prices : rollPrices();
      d.lastTs = typeof s.lastTs === 'number' ? s.lastTs : Date.now();

      // 地块按最大容量对齐，先全部重置再覆盖
      for (let i = 0; i < PLOT_COUNT; i++) {
        d.plots[i] = { c: null, p: 0, pest: false, ph: Math.random() * Math.PI * 2 };
      }
      s.plots.forEach((pl, i) => {
        if (i >= PLOT_COUNT || !pl) return;
        d.plots[i] = {
          c: CROPS[pl.c] ? pl.c : null,
          p: clamp(typeof pl.p === 'number' ? pl.p : 0, 0, 1),
          pest: !!pl.pest,
          ph: typeof pl.ph === 'number' ? pl.ph : Math.random() * Math.PI * 2
        };
      });
    } catch (e) {
      return defaultState();
    }
    return d;
  }

  /* ===================== 时间模拟（切走补算） ===================== */

  // 让全部作物生长 dt 秒（虫害地块暂停）
  function growBy(dt) {
    const sp = growthSpeed();
    state.plots.forEach(pl => {
      if (pl.c && pl.p < 1 && !pl.pest) {
        pl.p = clamp(pl.p + dt * sp / CROPS[pl.c].time, 0, 1);
      }
    });
  }

  // 虫害爆发：感染若干正在生长的作物
  function infectPests(count) {
    const pool = [];
    state.plots.forEach((pl, i) => {
      const col = i % MAX_COLS;
      const row = Math.floor(i / MAX_COLS);
      if (pl.c && pl.p < 1 && !pl.pest && col < state.cols && row < state.rows) pool.push(i);
    });
    for (let n = 0; n < count && pool.length > 0; n++) {
      const k = Math.floor(Math.random() * pool.length);
      state.plots[pool.splice(k, 1)[0]].pest = true;
    }
  }

  // 进入新的一天；active 为 true 时会播报事件并投放虫害
  function startNewDay(active) {
    state.day += 1;
    state.dayElapsed = 0;
    state.dayEarned = 0;
    state.prices = rollPrices();
    state.weather = Math.random() < 0.3 ? 'rain' : 'sun';
    state.harvestDay = Math.random() < 0.15;
    state.goal = 100 + state.day * 30;
    state.goalClaimed = false;

    if (active) {
      if (state.weather === 'rain') toast('雨天降临，作物生长加速 50%', 'cyan');
      if (state.harvestDay) toast('今日丰收日，收购价 x1.5', 'pink');

      // 每日虫害事件：稻草人显著降低概率
      const pestChance = state.scarecrow ? 0.1 : 0.34;
      if (Math.random() < pestChance) {
        const before = state.plots.filter(pl => pl.pest).length;
        const wave = 1 + Math.min(2, Math.floor((state.day - 1) / 3));
        infectPests(wave);
        const after = state.plots.filter(pl => pl.pest).length;
        if (after > before) toast('虫害爆发，点击红色害虫除虫', 'pink');
      }
      refreshPanels();
    }
  }

  // 一次性模拟 sec 秒（用于离线 / 标签页切回），期间不投放新虫害
  function simulate(sec) {
    let remain = sec;
    let slice = Math.min(remain, DAY_LEN - state.dayElapsed);
    growBy(slice);
    state.dayElapsed += slice;
    remain -= slice;

    let guard = 0;
    while (remain > 0.001 && guard < 2000) {
      startNewDay(false);
      slice = Math.min(remain, DAY_LEN);
      growBy(slice);
      state.dayElapsed = slice;
      remain -= slice;
      guard += 1;
    }
  }

  /* ===================== 玩家操作 ===================== */

  // 播种
  function plant(key, plotKey) {
    const pl = state.plots[plotKey];
    const crop = CROPS[key];
    if (!pl || pl.c || state.gold < crop.cost) {
      sfx.error();
      return;
    }
    state.gold -= crop.cost;
    pl.c = key;
    pl.p = 0;
    pl.pest = false;
    pl.ph = Math.random() * Math.PI * 2;
    sfx.plant();
    const r = tileRect(plotKey % MAX_COLS, Math.floor(plotKey / MAX_COLS));
    addFloater(r.x + r.t / 2, r.y + r.t - 6, '-' + crop.cost, '#ff9db7');
    hidePopup();
    refreshHUD();
    save();
  }

  // 收获
  function harvest(plotKey) {
    const pl = state.plots[plotKey];
    if (!pl.c || pl.p < 1 || pl.pest) return;
    const gain = sellValue(pl.c);
    state.gold += gain;
    state.dayEarned += gain;
    state.totalEarned += gain;
    const col = plotKey % MAX_COLS;
    const row = Math.floor(plotKey / MAX_COLS);
    const r = tileRect(col, row);
    addFloater(r.x + r.t / 2, r.y + 8, '+' + gain, '#ffd86b');
    pl.c = null;
    pl.p = 0;
    pl.pest = false;
    sfx.harvest();
    checkGoal();
    refreshHUD();
    refreshGoal();
    save();
  }

  // 除虫
  function removePest(plotKey) {
    const pl = state.plots[plotKey];
    if (!pl.pest) return;
    pl.pest = false;
    const col = plotKey % MAX_COLS;
    const row = Math.floor(plotKey / MAX_COLS);
    const r = tileRect(col, row);
    addFloater(r.x + r.t / 2, r.y + r.t - 8, '除虫完成', '#ff8fb0');
    sfx.plant();
    save();
  }

  // 今日目标结算
  function checkGoal() {
    if (!state.goalClaimed && state.dayEarned >= state.goal) {
      state.goalClaimed = true;
      state.gold += GOAL_REWARD;
      toast('今日目标达成，奖励 +' + GOAL_REWARD + ' 金币', 'amber');
      sfx.buy();
    }
  }

  // 购买商店物品
  function buy(kind) {
    if (kind === 'land') {
      const ex = nextExpansion();
      if (!ex) return;
      if (state.gold < ex.cost) { sfx.error(); toast('金币不足，无法扩展耕地', 'pink'); return; }
      state.gold -= ex.cost;
      state.cols = ex.nc;
      state.rows = ex.nr;
      computeGeo();
      toast('新的耕地已开垦：' + ex.nc + ' x ' + ex.nr, 'cyan');
    } else if (kind === 'sprinkler') {
      if (state.sprinkler) return;
      if (state.gold < SPRINKLER_COST) { sfx.error(); toast('金币不足，无法购买洒水器', 'pink'); return; }
      state.gold -= SPRINKLER_COST;
      state.sprinkler = true;
      toast('洒水器开始运转，生长速度 +30%', 'cyan');
    } else if (kind === 'scarecrow') {
      if (state.scarecrow) return;
      if (state.gold < SCARECROW_COST) { sfx.error(); toast('金币不足，无法购买稻草人', 'pink'); return; }
      state.gold -= SCARECROW_COST;
      state.scarecrow = true;
      toast('稻草人已就位，虫害大幅减少', 'cyan');
    }
    sfx.buy();
    refreshHUD();
    refreshShop();
    refreshGoal();
    save();
  }

  // 重新开始
  function restart() {
    const ok = window.confirm('确定要清空当前存档，重新经营星空农场吗？');
    if (!ok) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 忽略 */ }
    state = defaultState();
    hoverKey = -1;
    hidePopup();
    computeGeo();
    refreshHUD();
    refreshPanels();
    toast('新的农场已开启', 'cyan');
    save();
  }

  /* ===================== 轻量音效（WebAudio 合成） ===================== */

  let audioCtx = null;

  function ensureAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) {
      try { audioCtx = new AC(); } catch (e) { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function tone(f0, f1, dur, vol, type, delay) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + (delay || 0);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  const sfx = {
    plant() { tone(520, 700, 0.1, 0.07, 'triangle'); },
    harvest() { tone(680, 990, 0.12, 0.08, 'triangle'); tone(990, 1320, 0.12, 0.06, 'sine', 0.08); },
    buy() { tone(320, 520, 0.16, 0.08, 'triangle'); },
    error() { tone(220, 150, 0.14, 0.05, 'sawtooth'); },
    pest() { tone(200, 260, 0.18, 0.05, 'square'); }
  };

  /* ===================== 界面刷新 ===================== */

  function refreshHUD() {
    hudGold.textContent = String(state.gold);
    hudDay.textContent = String(state.day);
    if (state.weather === 'rain') {
      hudWeather.textContent = '雨天';
      wIconSun.classList.add('hidden');
      wIconRain.classList.remove('hidden');
    } else {
      hudWeather.textContent = '晴天';
      wIconSun.classList.remove('hidden');
      wIconRain.classList.add('hidden');
    }
    hudEvent.classList.toggle('hidden', !state.harvestDay);
    dayBarFill.style.width = (clamp(state.dayElapsed / DAY_LEN, 0, 1) * 100).toFixed(1) + '%';
  }

  function refreshMarket() {
    marketList.innerHTML = '';
    CROP_KEYS.forEach(key => {
      const crop = CROPS[key];
      const f = state.prices[key];
      const price = Math.round(crop.base * f);
      const pct = Math.round((f - 1) * 100);
      let trendHtml;
      if (pct >= 8) trendHtml = '<span class="goods-trend trend-up">涨 ' + pct + '%</span>';
      else if (pct <= -8) trendHtml = '<span class="goods-trend trend-down">跌 ' + Math.abs(pct) + '%</span>';
      else trendHtml = '<span class="goods-trend trend-flat">平稳 ' + (pct > 0 ? '+' : '') + pct + '%</span>';

      const row = document.createElement('div');
      row.className = 'goods-row';
      row.innerHTML =
        '<div class="goods-info">' +
          '<div class="goods-name"><span class="dot ' + crop.dot + '"></span>' + crop.name + '</div>' +
          '<div class="goods-sub">种子 ' + crop.cost + ' 金 · ' + crop.time + ' 秒成熟</div>' +
        '</div>' +
        '<span class="goods-price">' + price + '</span>' +
        trendHtml;
      marketList.appendChild(row);
    });
    const remain = Math.max(0, Math.ceil(DAY_LEN - state.dayElapsed));
    marketFoot.textContent = '距第 ' + (state.day + 1) + ' 天还有 ' + remain + ' 秒 · 行情每日随机浮动 ±25%' +
      (state.harvestDay ? ' · 今日售价额外 x1.5' : '');
  }

  function refreshShop() {
    shopList.innerHTML = '';

    // 土地扩展
    const ex = nextExpansion();
    const land = document.createElement('div');
    land.className = 'shop-item';
    if (ex) {
      const poor = state.gold < ex.cost;
      land.innerHTML =
        '<div class="shop-info">' +
          '<div class="shop-name">扩展耕地</div>' +
          '<div class="shop-desc">' + state.cols + ' x ' + state.rows + ' → ' + ex.nc + ' x ' + ex.nr + '，获得更多可种植格</div>' +
        '</div>' +
        '<button class="btn-buy' + (poor ? ' is-poor' : '') + '" data-buy="land">' + ex.cost + ' 金</button>';
    } else {
      land.innerHTML =
        '<div class="shop-info">' +
          '<div class="shop-name">扩展耕地</div>' +
          '<div class="shop-desc">已扩展至上限 ' + MAX_COLS + ' x ' + MAX_ROWS + '</div>' +
        '</div>' +
        '<button class="btn-buy is-off" disabled>已满级</button>';
    }
    shopList.appendChild(land);

    // 洒水器
    const spr = document.createElement('div');
    spr.className = 'shop-item';
    if (state.sprinkler) {
      spr.innerHTML =
        '<div class="shop-info"><div class="shop-name">洒水器</div>' +
        '<div class="shop-desc">所有作物生长速度 +30%</div></div>' +
        '<button class="btn-buy is-off" disabled>已拥有</button>';
    } else {
      const poor = state.gold < SPRINKLER_COST;
      spr.innerHTML =
        '<div class="shop-info"><div class="shop-name">洒水器</div>' +
        '<div class="shop-desc">所有作物生长速度 +30%，日夜自动浇灌</div></div>' +
        '<button class="btn-buy' + (poor ? ' is-poor' : '') + '" data-buy="sprinkler">' + SPRINKLER_COST + ' 金</button>';
    }
    shopList.appendChild(spr);

    // 稻草人
    const sc = document.createElement('div');
    sc.className = 'shop-item';
    if (state.scarecrow) {
      sc.innerHTML =
        '<div class="shop-info"><div class="shop-name">稻草人</div>' +
        '<div class="shop-desc">大幅降低随机虫害发生概率</div></div>' +
        '<button class="btn-buy is-off" disabled>已拥有</button>';
    } else {
      const poor = state.gold < SCARECROW_COST;
      sc.innerHTML =
        '<div class="shop-info"><div class="shop-name">稻草人</div>' +
        '<div class="shop-desc">伫立田边，大幅降低虫害侵扰</div></div>' +
        '<button class="btn-buy' + (poor ? ' is-poor' : '') + '" data-buy="scarecrow">' + SCARECROW_COST + ' 金</button>';
    }
    shopList.appendChild(sc);
  }

  function refreshGoal() {
    goalNow.textContent = String(Math.min(state.dayEarned, state.goal));
    goalTarget.textContent = String(state.goal);
    goalReward.textContent = String(GOAL_REWARD);
    goalFill.style.width = clamp(state.dayEarned / state.goal, 0, 1) * 100 + '%';
    if (state.goalClaimed) {
      goalStatus.textContent = '已达成 · ' + GOAL_REWARD + ' 金币已发放';
      goalStatus.classList.add('done');
    } else {
      goalStatus.textContent = '目标进行中，继续收获吧';
      goalStatus.classList.remove('done');
    }
  }

  function refreshPanels() {
    refreshMarket();
    refreshShop();
    refreshGoal();
  }

  /* ===================== 提示气泡 / 作物弹层 ===================== */

  function toast(text, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' t-' + kind : '');
    el.textContent = text;
    toastWrap.appendChild(el);
    window.setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3100);
  }

  function showPopup(plotKey) {
    popupKey = plotKey;
    cropPop.innerHTML = '';
    CROP_KEYS.forEach(key => {
      const crop = CROPS[key];
      const poor = state.gold < crop.cost;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'crop-card' + (poor ? ' is-poor' : '');
      btn.dataset.plant = key;
      btn.innerHTML =
        '<span class="cc-name"><span class="dot ' + crop.dot + '"></span>' + crop.name + '</span>' +
        '<span class="cc-line">种子 <b>' + crop.cost + '</b> 金币</span>' +
        '<span class="cc-line"><b>' + crop.time + '</b> 秒成熟</span>' +
        '<span class="cc-line">今日约 <b>' + sellValue(key) + '</b> 金币</span>';
      cropPop.appendChild(btn);
    });
    cropPop.classList.remove('hidden');
    cropPop.classList.toggle('col', viewW < 560);

    // 定位到被点格子旁，超出舞台则翻转 / 压缩
    const col = plotKey % MAX_COLS;
    const row = Math.floor(plotKey / MAX_COLS);
    const r = tileRect(col, row);
    let px = r.x + r.t + 10;
    let py = r.y;
    const popW = cropPop.offsetWidth || 460;
    const popH = cropPop.offsetHeight || 120;
    if (px + popW > viewW - 8) px = r.x - popW - 10;
    if (px < 8) px = 8;
    py = clamp(py, 8, viewH - popH - 8);
    cropPop.style.left = px + 'px';
    cropPop.style.top = py + 'px';
  }

  function hidePopup() {
    popupKey = -1;
    cropPop.classList.add('hidden');
  }

  function addFloater(x, y, text, color) {
    floaters.push({ x, y, text, color, life: 1.3 });
  }

  /* ===================== 画布几何 ===================== */

  function resize() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    viewW = rect.width;
    viewH = rect.height;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    computeGeo();
  }

  // 计算田地格子布局
  function computeGeo() {
    if (!state) return;
    const gap = 10;
    const padTop = 76;
    const padBottom = 40;
    const padX = 26;
    const availW = viewW - padX * 2 - 46; // 预留右侧扩展按钮空间
    const availH = viewH - padTop - padBottom;
    let t = Math.floor(Math.min(
      (availW - gap * (state.cols - 1)) / state.cols,
      (availH - gap * (state.rows - 1)) / state.rows
    ));
    t = clamp(t, 34, 116);
    const gw = t * state.cols + gap * (state.cols - 1);
    const gh = t * state.rows + gap * (state.rows - 1);
    geo = {
      t,
      gap,
      ox: Math.round((viewW - gw) / 2),
      oy: Math.round(padTop + (availH - gh) / 2),
      gw,
      gh
    };
  }

  function tileRect(col, row) {
    return {
      x: geo.ox + col * (geo.t + geo.gap),
      y: geo.oy + row * (geo.t + geo.gap),
      t: geo.t
    };
  }

  // 扩展按钮的矩形（右侧或下侧的虚框加号）
  function expandRect() {
    const ex = nextExpansion();
    if (!ex) return null;
    if (ex.nc > state.cols) {
      return { x: geo.ox + geo.gw + geo.gap, y: geo.oy + geo.gh / 2 - geo.t / 2, t: geo.t };
    }
    return { x: geo.ox + geo.gw / 2 - geo.t / 2, y: geo.oy + geo.gh + geo.gap, t: geo.t };
  }

  /* ===================== Canvas 绘制：背景 ===================== */

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawSky(dt) {
    // 星光
    const dim = state.weather === 'rain' ? 0.35 : 1;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(animTime * s.sp + s.ph));
      ctx.globalAlpha = tw * dim * 0.8;
      ctx.fillStyle = '#dfe6ff';
      ctx.beginPath();
      ctx.arc(s.x * viewW, s.y * viewH, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 晴天时画一弯新月
    if (state.weather === 'sun') {
      const mx = viewW - 70;
      const my = 96;
      ctx.save();
      ctx.shadowColor = 'rgba(205,212,255,0.8)';
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#eef0ff';
      ctx.beginPath();
      ctx.arc(mx, my, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(19,22,48,0.9)';
      ctx.beginPath();
      ctx.arc(mx + 8, my - 5, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      // 雨天整体偏蓝压暗
      ctx.fillStyle = 'rgba(70,100,190,0.10)';
      ctx.fillRect(0, 0, viewW, viewH);
    }

    // 萤火虫
    for (let i = 0; i < fireflies.length; i++) {
      const f = fireflies[i];
      f.x += f.sp * dt;
      if (f.x > 1.05) f.x = -0.05;
      const fx = f.x * viewW;
      const fy = (f.y + Math.sin(animTime * 0.8 + f.ph) * f.amp) * viewH;
      const blink = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(animTime * 2.2 + f.ph * 2));
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 7);
      g.addColorStop(0, f.hue);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = blink * 0.8;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fx, fy, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFieldGlow() {
    const cx = geo.ox + geo.gw / 2;
    const cy = geo.oy + geo.gh / 2;
    const r = Math.max(geo.gw, geo.gh) * 0.75;
    const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    g.addColorStop(0, 'rgba(124,92,255,0.14)');
    g.addColorStop(1, 'rgba(124,92,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  /* ===================== Canvas 绘制：田地格子 ===================== */

  function drawTiles() {
    for (let row = 0; row < state.rows; row++) {
      for (let col = 0; col < state.cols; col++) {
        const key = plotIndex(col, row);
        const r = tileRect(col, row);
        const hover = key === hoverKey && popupKey === -1;

        // 土壤底板
        const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.t);
        g.addColorStop(0, '#43305f');
        g.addColorStop(1, '#251f42');
        roundRect(r.x, r.y, r.t, r.t, 12);
        ctx.fillStyle = g;
        ctx.fill();

        // 土壤犁沟纹理
        ctx.save();
        roundRect(r.x, r.y, r.t, r.t, 12);
        ctx.clip();
        ctx.strokeStyle = 'rgba(20,14,38,0.55)';
        ctx.lineWidth = 2;
        for (let i = 1; i <= 2; i++) {
          const yy = r.y + (r.t / 3) * i;
          ctx.beginPath();
          ctx.moveTo(r.x + 8, yy);
          ctx.lineTo(r.x + r.t - 8, yy);
          ctx.stroke();
        }
        ctx.restore();

        // 发光描边
        ctx.lineWidth = hover ? 2 : 1.4;
        ctx.strokeStyle = hover ? 'rgba(34,211,238,0.9)' : 'rgba(146,110,255,0.32)';
        if (hover) {
          ctx.shadowColor = 'rgba(34,211,238,0.7)';
          ctx.shadowBlur = 12;
        }
        roundRect(r.x, r.y, r.t, r.t, 12);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    // 下一块土地的虚框引导
    const er = expandRect();
    if (er) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      roundRect(er.x, er.y, er.t, er.t, 12);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(er.x + er.t / 2, er.y + er.t * 0.32);
      ctx.lineTo(er.x + er.t / 2, er.y + er.t * 0.68);
      ctx.moveTo(er.x + er.t * 0.32, er.y + er.t / 2);
      ctx.lineTo(er.x + er.t * 0.68, er.y + er.t / 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '11px system-ui, "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('开垦', er.x + er.t / 2, er.y + er.t * 0.86);
      ctx.restore();
    }
  }

  /* ===================== Canvas 绘制：作物 ===================== */

  // 通用：种子阶段的土丘 + 种子
  function drawSeed(r, color) {
    ctx.fillStyle = 'rgba(15,10,30,0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.2, r * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(-r * 0.05, -r * 0.02, r * 0.055, 0, Math.PI * 2);
    ctx.arc(r * 0.08, r * 0.02, r * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  // 叶片
  function leaf(x, y, w, h, ang, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, -h / 2, w, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawWheat(stage, r, sway) {
    const s = r / 84;
    if (stage === 0) { drawSeed(r, '#d9a441'); return; }

    if (stage === 1) {
      ctx.strokeStyle = '#5fca6f';
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(sway * 8, -10 * s, sway * 10, -16 * s);
      ctx.stroke();
      leaf(0, -6 * s, 4 * s, 10 * s, -0.6, '#67d377');
      leaf(sway * 6, -10 * s, 4 * s, 9 * s, 0.5, '#57bd67');
      return;
    }

    if (stage === 2) {
      for (let i = -1; i <= 1; i++) {
        const bx = i * 9 * s;
        ctx.strokeStyle = '#55b966';
        ctx.lineWidth = 2.6 * s;
        ctx.beginPath();
        ctx.moveTo(bx, 0);
        ctx.quadraticCurveTo(bx + sway * 10, -16 * s, bx + sway * 14, -30 * s);
        ctx.stroke();
        leaf(bx, -14 * s, 3.6 * s, 12 * s, i % 2 === 0 ? -0.55 : 0.55, '#5fc872');
      }
      return;
    }

    // 成熟：金色麦穗
    ctx.save();
    ctx.shadowColor = 'rgba(255,216,107,0.55)';
    ctx.shadowBlur = 10;
    for (let i = 0; i < 4; i++) {
      const bx = (i - 1.5) * 8 * s;
      const topX = bx + sway * (14 + i * 2);
      const topY = (-34 - (i % 2) * 5) * s;
      ctx.strokeStyle = '#7fbf62';
      ctx.lineWidth = 2.4 * s;
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.quadraticCurveTo(bx + sway * 10, -20 * s, topX, topY + 8 * s);
      ctx.stroke();

      const gg = ctx.createLinearGradient(topX, topY - 10 * s, topX, topY + 10 * s);
      gg.addColorStop(0, '#ffe591');
      gg.addColorStop(1, '#e0952c');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.ellipse(topX, topY, 4.2 * s, 10 * s, sway * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // 麦芒
      ctx.strokeStyle = 'rgba(255,230,150,0.9)';
      ctx.lineWidth = 1 * s;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(topX + k * 2.4 * s, topY - 6 * s);
        ctx.lineTo(topX + k * 4.4 * s, topY - 13 * s);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawCorn(stage, r, sway) {
    const s = r / 84;
    if (stage === 0) { drawSeed(r, '#f2c142'); return; }

    if (stage === 1) {
      ctx.strokeStyle = '#4fae63';
      ctx.lineWidth = 3.2 * s;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(sway * 6, -10 * s, sway * 8, -18 * s);
      ctx.stroke();
      leaf(0, -8 * s, 5 * s, 12 * s, -0.7, '#5cc474');
      leaf(sway * 6, -12 * s, 5 * s, 11 * s, 0.6, '#48a85e');
      return;
    }

    // 茎秆与长叶
    ctx.strokeStyle = '#4aa45f';
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(sway * 8, -20 * s, sway * 12, -40 * s);
    ctx.stroke();
    leaf(0, -16 * s, 7 * s, 20 * s, -0.85, '#53b86a');
    leaf(sway * 8, -26 * s, 6 * s, 17 * s, 0.7, '#459e5b');

    if (stage === 2) {
      leaf(0, -28 * s, 5 * s, 14 * s, -0.4, '#5cc474');
      return;
    }

    // 成熟：玉米棒
    const cx = sway * 10 + 5 * s;
    const cy = -26 * s;
    ctx.save();
    ctx.shadowColor = 'rgba(255,200,77,0.5)';
    ctx.shadowBlur = 10;
    // 苞叶
    ctx.fillStyle = '#4fa764';
    ctx.beginPath();
    ctx.moveTo(cx - 7 * s, cy - 10 * s);
    ctx.quadraticCurveTo(cx - 12 * s, cy + 2 * s, cx - 4 * s, cy + 13 * s);
    ctx.quadraticCurveTo(cx - 6 * s, cy, cx - 7 * s, cy - 10 * s);
    ctx.fill();
    const cg = ctx.createLinearGradient(cx, cy - 11 * s, cx, cy + 12 * s);
    cg.addColorStop(0, '#ffe082');
    cg.addColorStop(1, '#e59a28');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 6 * s, 12 * s, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // 玉米粒点阵
    ctx.fillStyle = 'rgba(255,245,200,0.85)';
    for (let yy = -2; yy <= 2; yy++) {
      for (let xx = -1; xx <= 1; xx++) {
        ctx.beginPath();
        ctx.arc(cx + xx * 3.1 * s + (yy % 2) * 1.5 * s, cy + yy * 3.6 * s, 0.9 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawStrawberry(stage, r, sway) {
    const s = r / 84;
    if (stage === 0) { drawSeed(r, '#e8a3ad'); return; }

    // 暗绿色叶丛（各阶段都有）
    const leafColor = stage >= 2 ? '#3f9e57' : '#57bd67';
    for (let i = 0; i < 4; i++) {
      const a = -0.9 + i * 0.55 + sway * 0.3;
      leaf(Math.cos(a) * 6 * s, -4 * s + Math.sin(a) * 2 * s, 6 * s, 13 * s, a, leafColor);
    }

    if (stage === 1) return;

    if (stage === 2) {
      // 白色小花
      const fx = sway * 8;
      const fy = -14 * s;
      ctx.fillStyle = '#f4f2ff';
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 / 5) * i;
        ctx.beginPath();
        ctx.ellipse(fx + Math.cos(a) * 4 * s, fy + Math.sin(a) * 4 * s, 2.6 * s, 4 * s, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffd86b';
      ctx.beginPath();
      ctx.arc(fx, fy, 2.4 * s, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // 成熟：红色草莓果实
    ctx.save();
    ctx.shadowColor = 'rgba(255,77,109,0.55)';
    ctx.shadowBlur = 10;
    const berries = [{ x: sway * 8 - 4 * s, y: -15 * s, sc: 1 }, { x: sway * 10 + 6 * s, y: -11 * s, sc: 0.8 }];
    berries.forEach(b => {
      const bg = ctx.createLinearGradient(b.x, b.y - 8 * s, b.x, b.y + 10 * s);
      bg.addColorStop(0, '#ff6d88');
      bg.addColorStop(1, '#c81e4a');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 7 * b.sc * s);
      ctx.bezierCurveTo(b.x + 8 * b.sc * s, b.y - 9 * b.sc * s, b.x + 7 * b.sc * s, b.y + 4 * b.sc * s, b.x, b.y + 10 * b.sc * s);
      ctx.bezierCurveTo(b.x - 7 * b.sc * s, b.y + 4 * b.sc * s, b.x - 8 * b.sc * s, b.y - 9 * b.sc * s, b.x, b.y - 7 * b.sc * s);
      ctx.fill();

      // 种子点
      ctx.fillStyle = 'rgba(255,233,168,0.95)';
      const dots = [[-3, -2], [3, -2], [0, 1], [-3, 3], [3, 3], [0, 6]];
      dots.forEach(d => {
        ctx.beginPath();
        ctx.ellipse(b.x + d[0] * b.sc * s, b.y + d[1] * b.sc * s, 0.8 * s, 1.3 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      });

      // 顶部萼片
      ctx.fillStyle = '#3f9e57';
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI + (Math.PI / 4) * i;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y - 7 * b.sc * s);
        ctx.lineTo(b.x + Math.cos(a) * 4.5 * b.sc * s, b.y - 7 * b.sc * s + Math.sin(a) * 3.2 * b.sc * s);
        ctx.lineTo(b.x + Math.cos(a + 0.4) * 2 * b.sc * s, b.y - 7 * b.sc * s + Math.sin(a + 0.4) * 2 * b.sc * s);
        ctx.closePath();
        ctx.fill();
      }
    });
    ctx.restore();
  }

  // 成熟标记：头顶金色四角星
  function drawMatureMark(cx, topY) {
    const y = topY - 12 + Math.sin(animTime * 3.2) * 3;
    const pulse = 1 + Math.sin(animTime * 4.5) * 0.12;
    ctx.save();
    ctx.translate(cx, y);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = 'rgba(255,216,107,0.9)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#ffd86b';
    ctx.beginPath();
    const R = 8, r2 = 3.2;
    for (let i = 0; i < 8; i++) {
      const ang = (Math.PI / 4) * i - Math.PI / 2;
      const rad = i % 2 === 0 ? R : r2;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 害虫与警告标
  function drawPest(cx, cy, s) {
    const wig = Math.sin(animTime * 12) * 2 * s;
    ctx.save();
    // 警告标
    const wy = cy - 26 * s;
    ctx.fillStyle = '#ff5ca8';
    ctx.shadowColor = 'rgba(255,92,168,0.9)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(cx, wy - 8 * s);
    ctx.lineTo(cx - 8 * s, wy + 6 * s);
    ctx.lineTo(cx + 8 * s, wy + 6 * s);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - 1.2 * s, wy - 4 * s, 2.4 * s, 5 * s);
    ctx.beginPath();
    ctx.arc(cx, wy + 3.4 * s, 1.4 * s, 0, Math.PI * 2);
    ctx.fill();

    // 虫身
    ctx.fillStyle = '#33224a';
    ctx.strokeStyle = '#8a6bd8';
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 9 * s, 6.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 虫头
    ctx.beginPath();
    ctx.arc(cx + 8 * s, cy - 2 * s, 4 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 腿
    ctx.strokeStyle = '#b59cf0';
    ctx.lineWidth = 1.4 * s;
    for (let i = -1; i <= 1; i++) {
      const lx = cx + i * 4.5 * s;
      ctx.beginPath();
      ctx.moveTo(lx, cy + 4 * s);
      ctx.lineTo(lx - 4 * s, cy + 10 * s + wig * (i + 2) * 0.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(lx, cy + 4 * s);
      ctx.lineTo(lx + 4 * s, cy + 10 * s - wig * (i + 2) * 0.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlants() {
    for (let row = 0; row < state.rows; row++) {
      for (let col = 0; col < state.cols; col++) {
        const key = plotIndex(col, row);
        const pl = state.plots[key];
        if (!pl.c) continue;
        const r = tileRect(col, row);
        const cx = r.x + r.t / 2;
        const baseY = r.y + r.t * 0.8;
        const stage = pl.p >= 1 ? 3 : Math.min(2, Math.floor(pl.p * 3.6));
        const sway = Math.sin(animTime * 1.8 + pl.ph) * 0.07;

        // 根部阴影
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(cx, baseY + 2, r.t * 0.18, r.t * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();

        // 成熟微光
        if (pl.p >= 1) {
          const g = ctx.createRadialGradient(cx, baseY - r.t * 0.3, 2, cx, baseY - r.t * 0.3, r.t * 0.5);
          const glowColor = pl.c === 'strawberry' ? '255,92,168' : pl.c === 'corn' ? '255,200,77' : '255,216,107';
          g.addColorStop(0, 'rgba(' + glowColor + ',0.22)');
          g.addColorStop(1, 'rgba(' + glowColor + ',0)');
          ctx.fillStyle = g;
          ctx.fillRect(r.x, r.y - 10, r.t, r.t + 20);
        }

        ctx.save();
        ctx.translate(cx, baseY);
        const ss = r.t / 84;
        ctx.scale(ss, ss);
        const unit = 84; // 在单位坐标系中绘制，缩放由 ss 完成
        if (pl.c === 'wheat') drawWheat(stage, unit, sway * 10);
        if (pl.c === 'corn') drawCorn(stage, unit, sway * 10);
        if (pl.c === 'strawberry') drawStrawberry(stage, unit, sway * 10);
        ctx.restore();

        // 生长进度条
        const bw = r.t * 0.62;
        const bx = r.x + (r.t - bw) / 2;
        const by = r.y + r.t - 7;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        roundRect(bx, by, bw, 4, 2);
        ctx.fill();
        if (pl.p > 0) {
          const pg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
          if (pl.p >= 1) {
            pg.addColorStop(0, '#ffd86b');
            pg.addColorStop(1, '#ffb347');
          } else {
            pg.addColorStop(0, '#7c5cff');
            pg.addColorStop(1, '#22d3ee');
          }
          ctx.fillStyle = pg;
          roundRect(bx, by, bw * pl.p, 4, 2);
          ctx.fill();
        }

        if (pl.pest) drawPest(cx, r.y + r.t * 0.44, r.t / 84);
        if (pl.p >= 1 && !pl.pest) drawMatureMark(cx, r.y + 4);
      }
    }
  }

  /* ===================== Canvas 绘制：装饰物 / 天气 ===================== */

  // 洒水器（田地左上）
  function drawSprinkler() {
    const x = geo.ox + 18;
    const y = geo.oy - 30;
    ctx.save();
    ctx.strokeStyle = 'rgba(34,211,238,0.85)';
    ctx.fillStyle = 'rgba(34,211,238,0.9)';
    ctx.shadowColor = 'rgba(34,211,238,0.8)';
    ctx.shadowBlur = 8;
    // 底座
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + 12);
    ctx.lineTo(x, y + 2);
    ctx.stroke();
    // 旋转摇臂
    const a = animTime * 3;
    ctx.beginPath();
    ctx.moveTo(x - 8 * Math.cos(a), y + 2 - 8 * Math.sin(a) * 0.4);
    ctx.lineTo(x + 8 * Math.cos(a), y + 2 + 8 * Math.sin(a) * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y + 2, 2.4, 0, Math.PI * 2);
    ctx.fill();
    // 交替水滴
    const ph = animTime % 1.2;
    ctx.globalAlpha = 0.8 - ph / 1.5;
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.arc(x + i * (7 + ph * 10), y + 3 + ph * 13, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 稻草人（田地右上）
  function drawScarecrow() {
    const x = geo.ox + geo.gw - 18;
    const y = geo.oy - 30;
    ctx.save();
    ctx.lineCap = 'round';
    // 木杆
    ctx.strokeStyle = '#8a6a4f';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(x, y + 16);
    ctx.lineTo(x, y - 12);
    ctx.moveTo(x - 9, y - 4);
    ctx.lineTo(x + 9, y - 4);
    ctx.stroke();
    // 身体（小披风）
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x - 7, y + 13);
    ctx.lineTo(x + 7, y + 13);
    ctx.closePath();
    ctx.fill();
    // 头
    ctx.fillStyle = '#e8c99b';
    ctx.beginPath();
    ctx.arc(x, y - 9, 4.6, 0, Math.PI * 2);
    ctx.fill();
    // 帽子
    ctx.fillStyle = '#7c5cff';
    ctx.beginPath();
    ctx.moveTo(x - 6.5, y - 11);
    ctx.lineTo(x + 6.5, y - 11);
    ctx.lineTo(x, y - 20);
    ctx.closePath();
    ctx.fill();
    // 眼睛
    ctx.fillStyle = '#3a2b52';
    ctx.fillRect(x - 2, y - 10, 1.3, 1.3);
    ctx.fillRect(x + 1, y - 10, 1.3, 1.3);
    ctx.restore();
  }

  function drawRain(dt) {
    if (state.weather !== 'rain') return;
    ctx.save();
    ctx.strokeStyle = 'rgba(160,195,255,0.35)';
    ctx.lineWidth = 1.2;
    rainDrops.forEach(d => {
      d.y += d.sp * dt * 1.6;
      d.x -= dt * 0.12;
      if (d.y > 1.05) { d.y = -0.05; d.x = Math.random(); }
      if (d.x < -0.05) d.x = 1.05;
      const x = d.x * viewW;
      const y = d.y * viewH;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + d.len);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawFloaters(dt) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= dt;
      if (f.life <= 0) { floaters.splice(i, 1); continue; }
      const t = 1.3 - f.life;
      ctx.save();
      ctx.globalAlpha = clamp(f.life / 0.5, 0, 1);
      ctx.fillStyle = f.color;
      ctx.font = 'bold 15px system-ui, "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 4;
      ctx.fillText(f.text, f.x, f.y - t * 30);
      ctx.restore();
    }
  }

  function draw(dt) {
    ctx.clearRect(0, 0, viewW, viewH);
    drawSky(dt);
    computeGeo();
    drawFieldGlow();
    drawTiles();
    drawPlants();
    if (state.sprinkler) drawSprinkler();
    if (state.scarecrow) drawScarecrow();
    drawRain(dt);
    drawFloaters(dt);
  }

  /* ===================== 交互：点击 / 悬停 ===================== */

  function hitTile(mx, my) {
    for (let row = 0; row < state.rows; row++) {
      for (let col = 0; col < state.cols; col++) {
        const r = tileRect(col, row);
        if (mx >= r.x && mx <= r.x + r.t && my >= r.y && my <= r.y + r.t) {
          return plotIndex(col, row);
        }
      }
    }
    return -1;
  }

  function hitExpand(mx, my) {
    const er = expandRect();
    if (!er) return false;
    return mx >= er.x && mx <= er.x + er.t && my >= er.y && my <= er.y + er.t;
  }

  function eventPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onTap(e) {
    ensureAudio();
    const p = eventPos(e);

    // 点了扩展引导框 → 关闭弹层并提示去商店
    if (hitExpand(p.x, p.y)) {
      hidePopup();
      toast('可在右侧商店开垦更多土地', 'cyan');
      shopList.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }],
        { duration: 360 }
      );
      return;
    }

    const key = hitTile(p.x, p.y);
    if (key < 0) { hidePopup(); return; }
    const pl = state.plots[key];

    if (pl.pest) {
      removePest(key);
      return;
    }
    if (pl.c && pl.p >= 1) {
      harvest(key);
      return;
    }
    if (pl.c) {
      // 生长中：提示剩余时间
      const sp = growthSpeed();
      const left = Math.ceil((1 - pl.p) * CROPS[pl.c].time / sp);
      const col = key % MAX_COLS;
      const row = Math.floor(key / MAX_COLS);
      const r = tileRect(col, row);
      addFloater(r.x + r.t / 2, r.y + 8, '还剩 ' + left + ' 秒', '#9dffe6');
      hidePopup();
      return;
    }
    // 空地 → 打开作物选择
    if (popupKey === key) hidePopup();
    else showPopup(key);
  }

  function onMove(e) {
    const p = eventPos(e);
    const key = hitTile(p.x, p.y);
    hoverKey = key;
    if (hitExpand(p.x, p.y) || key >= 0) canvas.style.cursor = 'pointer';
    else canvas.style.cursor = 'default';
  }

  /* ===================== 主循环 ===================== */

  function tick(dt) {
    growBy(dt);
    state.dayElapsed += dt;
    if (state.dayElapsed >= DAY_LEN) {
      state.dayElapsed -= DAY_LEN;
      startNewDay(true);
      refreshHUD();
    }

    // 散生虫害：第 1 天为新手保护期，之后按随机间隔抽检
    pestTimer -= dt;
    if (pestTimer <= 0 && state.day >= 2) {
      pestTimer = 35 + Math.random() * 25;
      const chance = state.scarecrow ? 0.08 : 0.32;
      const hasGrowing = state.plots.some(pl => pl.c && pl.p < 1 && !pl.pest);
      if (hasGrowing && Math.random() < chance) {
        const before = state.plots.filter(pl => pl.pest).length;
        infectPests(1);
        const after = state.plots.filter(pl => pl.pest).length;
        if (after > before) {
          toast('一株作物遭虫了，快点击除虫', 'pink');
          sfx.pest();
        }
      }
    }

    saveTimer += dt;
    if (saveTimer >= SAVE_INTERVAL) {
      saveTimer = 0;
      save();
    }

    hudTimer += dt;
    if (hudTimer >= 0.25) {
      hudTimer = 0;
      refreshHUD();
      refreshMarket();
    }
  }

  let lastFrame = performance.now();

  function frame(now) {
    const dt = Math.min(1, (now - lastFrame) / 1000);
    lastFrame = now;
    animTime += dt;
    tick(dt);
    draw(dt);
    requestAnimationFrame(frame);
  }

  /* ===================== 事件绑定与初始化 ===================== */

  canvas.addEventListener('pointerdown', onTap);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', () => { hoverKey = -1; });

  cropPop.addEventListener('click', e => {
    const btn = e.target.closest('[data-plant]');
    if (!btn || btn.classList.contains('is-poor')) return;
    plant(btn.dataset.plant, popupKey);
  });

  shopList.addEventListener('click', e => {
    const btn = e.target.closest('[data-buy]');
    if (!btn) return;
    ensureAudio();
    buy(btn.dataset.buy);
  });

  btnRestart.addEventListener('click', () => { ensureAudio(); restart(); });

  btnGuide.addEventListener('click', () => {
    ensureAudio();
    state.guideDone = true;
    guideOverlay.classList.add('hidden');
    save();
  });

  window.addEventListener('resize', resize);

  // 标签页切走：存档；切回：按时间戳补算
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      save();
    } else {
      const elapsed = Math.min((Date.now() - state.lastTs) / 1000, OFFLINE_CAP);
      if (elapsed > 0.5) simulate(elapsed);
      state.lastTs = Date.now();
      lastFrame = performance.now();
      refreshHUD();
      refreshPanels();
      save();
    }
  });

  window.addEventListener('beforeunload', save);

  function init() {
    state = load();
    resize();

    // 离线时间补算
    const elapsed = Math.min((Date.now() - state.lastTs) / 1000, OFFLINE_CAP);
    if (elapsed > 0.5) simulate(elapsed);
    state.lastTs = Date.now();

    refreshHUD();
    refreshPanels();

    if (!state.guideDone) guideOverlay.classList.remove('hidden');

    // 开局天气提示
    if (state.weather === 'rain') window.setTimeout(() => toast('雨天，作物生长加速 50%', 'cyan'), 600);

    save();
    requestAnimationFrame(frame);
  }

  init();
})();
