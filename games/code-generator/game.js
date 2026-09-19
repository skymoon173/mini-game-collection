/* ============================================================
   小游戏代码工坊 · 主逻辑
   - 参数化生成四种单文件 HTML5 小游戏（井字棋 / 贪吃蛇 / 打砖块 / 记忆翻牌）
   - 轻量正则语法高亮、行号、复制 / 下载 / 页内 iframe 试运行
   - 零外部依赖
   ============================================================ */
(function () {
  'use strict';

  /* ============================================================
     一、常量与默认参数
     ============================================================ */

  // 四套主题：生成游戏时会把这些颜色真正写进它的 CSS 变量
  var THEMES = {
    neon: {
      name: '紫青霓虹', c1: '#7c5cff', c2: '#22d3ee',
      bg1: '#0b0e20', bg2: '#171a3a'
    },
    sunset: {
      name: '日落橙粉', c1: '#ff5ca8', c2: '#ffb347',
      bg1: '#1c0f1e', bg2: '#3b1730'
    },
    emerald: {
      name: '翡翠绿金', c1: '#34d399', c2: '#ffd166',
      bg1: '#08171a', bg2: '#10302b'
    },
    cyber: {
      name: '赛博蓝', c1: '#38bdf8', c2: '#818cf8',
      bg1: '#080d1f', bg2: '#10284a'
    }
  };

  var TYPES = ['ttt', 'snake', 'breakout', 'memory'];

  var TYPE_LABEL = {
    ttt: '井字棋',
    snake: '贪吃蛇',
    breakout: '打砖块',
    memory: '记忆翻牌'
  };

  var TYPE_TIP = {
    ttt: '与内置 AI 对战，三档难度，困难模式使用完整 minimax 算法。',
    snake: '吃光点变长，撞墙或撞到自己即失败；速度会随得分略微加快。',
    breakout: '移动挡板反弹小球，击碎全部砖块即通关，共有三条生命。',
    memory: '翻开卡片寻找相同汉字，全部配对成功即获胜。'
  };

  var DIFF_LABEL = { easy: '简单', normal: '普通', hard: '困难' };
  var SPEED_LABEL = { 160: '悠闲', 110: '标准', 75: '急速' };
  var BALL_LABEL = { 3.2: '轻柔', 4.3: '标准', 5.6: '迅猛' };

  // 随机灵感使用的标题库（均不超过 12 字）
  var TITLE_PRESETS = {
    ttt: ['霓虹井字棋', '人机大对战', '三子争锋', '棋逢对手'],
    snake: ['霓虹贪吃蛇', '光点吞噬者', '蛇形冲刺', '迷宫长蛇'],
    breakout: ['霓虹打砖块', '砖墙粉碎者', '反弹球挑战', '碎砖先锋'],
    memory: ['汉字翻翻乐', '记忆大挑战', '配对小工坊', '过目不忘']
  };

  var STORAGE_KEY = 'codegen-settings';

  function defaultSettings() {
    return {
      type: 'ttt',
      theme: 'neon',
      title: '井字棋',
      sound: true,
      scoreboard: true,
      best: true,
      live: false,
      ttt: { difficulty: 'hard' },
      snake: { grid: 18, speed: 110 },
      breakout: { rows: 5, ball: 4.3, paddle: 104 },
      memory: { size: 4 }
    };
  }

  /* ============================================================
     二、小工具
     ============================================================ */

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function j(v) {
    return JSON.stringify(v);
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // 深合并默认参数，保证旧版本本地配置缺字段时也可用
  function mergeSettings(raw) {
    var d = defaultSettings();
    if (!raw || typeof raw !== 'object') return d;
    Object.keys(d).forEach(function (k) {
      if (raw[k] !== undefined) {
        if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) {
          Object.keys(d[k]).forEach(function (sk) {
            if (raw[k][sk] !== undefined) d[k][sk] = raw[k][sk];
          });
        } else {
          d[k] = raw[k];
        }
      }
    });
    // 合法化
    if (TYPES.indexOf(d.type) === -1) d.type = 'ttt';
    if (!THEMES[d.theme]) d.theme = 'neon';
    d.title = String(d.title || '').slice(0, 12) || '小游戏';
    d.snake.grid = clamp(parseInt(d.snake.grid, 10) || 18, 10, 24);
    d.snake.speed = [160, 110, 75].indexOf(Number(d.snake.speed)) >= 0 ? Number(d.snake.speed) : 110;
    d.breakout.rows = clamp(parseInt(d.breakout.rows, 10) || 5, 3, 8);
    d.breakout.ball = [3.2, 4.3, 5.6].indexOf(Number(d.breakout.ball)) >= 0 ? Number(d.breakout.ball) : 4.3;
    d.breakout.paddle = clamp(parseInt(d.breakout.paddle, 10) || 104, 70, 150);
    d.memory.size = (Number(d.memory.size) === 6) ? 6 : 4;
    if (['easy', 'normal', 'hard'].indexOf(d.ttt.difficulty) === -1) d.ttt.difficulty = 'hard';
    return d;
  }

  function loadSettings() {
    try {
      return mergeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    } catch (err) {
      return defaultSettings();
    }
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (err) { /* 隐私模式等场景下静默失败 */ }
  }

  /* ============================================================
     三、生成游戏共用的 CSS 基座（四种游戏通用的界面骨架）
     ============================================================ */

  function baseCss(t) {
    return `* { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --c1: ${t.c1};          /* 主色 */
  --c2: ${t.c2};          /* 强调色 */
  --bg1: ${t.bg1};        /* 背景暗色 */
  --bg2: ${t.bg2};        /* 背景亮色 */
  --panel: rgba(255, 255, 255, .07);
  --line: rgba(255, 255, 255, .14);
  --ink: #eef1ff;
  --muted: rgba(238, 241, 255, .6);
}

html, body { height: 100%; }

body {
  font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  color: var(--ink);
  background: radial-gradient(circle at 50% 22%, var(--bg2), var(--bg1) 72%);
  min-height: 100vh;
  display: flex;
  justify-content: center;
  padding: 26px 14px 40px;
  -webkit-tap-highlight-color: transparent;
}

.app {
  width: min(580px, 100%);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.title {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 2px;
  text-align: center;
  background: linear-gradient(90deg, var(--c1), var(--c2));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.subtitle {
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  letter-spacing: 1px;
}

.hud {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 10px 14px;
  font-size: 14px;
}

.tag {
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .06);
  border: 1px solid var(--line);
}

.tag b { color: var(--c2); margin-left: 4px; }

.best-tag b { color: var(--c1); }

.status {
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  min-height: 24px;
}

.btn-row {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
}

.btn {
  appearance: none;
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  color: var(--ink);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 20px;
  cursor: pointer;
  transition: transform .08s ease, border-color .15s ease, box-shadow .2s ease;
}

.btn:hover { border-color: var(--c2); }
.btn:active { transform: translateY(1px) scale(.99); }

.btn-primary {
  color: #0b0e20;
  border: none;
  background: linear-gradient(135deg, var(--c1), var(--c2));
  box-shadow: 0 6px 20px -8px var(--c1);
}

.tip {
  text-align: center;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.8;
}

.stage {
  display: flex;
  justify-content: center;
}

.stage canvas {
  width: min(92vw, 480px);
  height: auto;
  display: block;
  background: rgba(0, 0, 0, .28);
  border: 1px solid var(--line);
  border-radius: 18px;
  touch-action: none;
}

/* 通用遮罩与对话框 */
.overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: rgba(5, 8, 20, .72);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.overlay[hidden] { display: none; }

.dialog {
  width: min(320px, 88vw);
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: center;
  background: rgba(18, 22, 46, .96);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 26px 22px;
}

.dialog h2 { font-size: 22px; }

.dialog p { color: var(--muted); font-size: 14px; line-height: 1.7; }

.dialog .big {
  font-size: 32px;
  font-weight: 800;
  color: var(--c2);
}
`;
  }

  /* ============================================================
     四、游戏一：井字棋（完整 minimax AI，三档难度）
     ============================================================ */

  function tttCss() {
    return `.board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  width: min(330px, 86vw);
  margin: 0 auto;
}

.cell {
  aspect-ratio: 1 / 1;
  appearance: none;
  font: inherit;
  font-size: 44px;
  font-weight: 800;
  color: var(--c2);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 18px;
  cursor: pointer;
  transition: transform .08s ease, background .15s ease, box-shadow .15s ease;
}

.cell.is-o { color: var(--c1); }

.cell:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: var(--c2);
  box-shadow: 0 8px 22px -10px var(--c2);
}

.cell:disabled { cursor: default; }

.cell.win {
  color: #0b0e20;
  background: linear-gradient(135deg, var(--c1), var(--c2));
  border-color: transparent;
}
`;
  }

  function tttBody(cfg, t) {
    return `  <main class="app">
    <h1 class="title">${escHtml(cfg.title)}</h1>
    <p class="subtitle">人机对战 · 难度：${DIFF_LABEL[cfg.ttt.difficulty]} · 主题：${t.name}</p>
${cfg.scoreboard || cfg.best ? `    <div class="hud">
${cfg.scoreboard ? `      <span class="tag">胜<b id="hud-win">0</b></span>
      <span class="tag">平<b id="hud-draw">0</b></span>
      <span class="tag">负<b id="hud-lose">0</b></span>
` : ''}${cfg.best ? `      <span class="tag best-tag">最佳连胜<b id="hud-best">0</b></span>
` : ''}    </div>` : ''}
    <p class="status" id="status">你执 X 先手，请落子</p>
    <div class="board" id="board">
      <button type="button" class="cell" data-i="0"></button>
      <button type="button" class="cell" data-i="1"></button>
      <button type="button" class="cell" data-i="2"></button>
      <button type="button" class="cell" data-i="3"></button>
      <button type="button" class="cell" data-i="4"></button>
      <button type="button" class="cell" data-i="5"></button>
      <button type="button" class="cell" data-i="6"></button>
      <button type="button" class="cell" data-i="7"></button>
      <button type="button" class="cell" data-i="8"></button>
    </div>
    <div class="btn-row">
      <button type="button" class="btn btn-primary" id="restart">重新开始</button>
    </div>
    <p class="tip">你执 X，电脑执 O；任意一行、一列或对角线三子相连即获胜。</p>
  </main>`;
  }

  function tttScript(cfg) {
    return `(function () {
  'use strict';

  // ===== 由工坊写入的生成参数 =====
  var CONFIG = {
    difficulty: ${j(cfg.ttt.difficulty)},   // easy 简单 / normal 普通 / hard 困难
    sound: ${j(cfg.sound)},
    scoreboard: ${j(cfg.scoreboard)},
    best: ${j(cfg.best)}
  };
  var BEST_KEY = 'codegen-best-ttt';

  // ===== 音效：WebAudio 简易蜂鸣 =====
  var audioCtx = null;
  function beep(freq, during, type, vol) {
    if (!CONFIG.sound) return;
    try {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
      }
      var osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol || 0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + during);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + during);
    } catch (err) {
      audioCtx = null;
    }
  }

  // ===== 局面状态 =====
  var LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],   // 三行
    [0, 3, 6], [1, 4, 7], [2, 5, 8],   // 三列
    [0, 4, 8], [2, 4, 6]               // 两条对角线
  ];
  var cells = Array.prototype.slice.call(document.querySelectorAll('.cell'));
  var statusEl = document.getElementById('status');

  var board = new Array(9).fill('');   // ''、'X'（玩家）或 'O'（电脑）
  var waiting = false;                 // 电脑思考时锁定玩家输入
  var finished = false;
  var winLine = [];
  var stats = { win: 0, draw: 0, lose: 0, streak: 0 };
  var bestStreak = loadBest();

  // 判断胜负：返回 { piece, line } 或 null
  function getWinner(b) {
    for (var i = 0; i < LINES.length; i++) {
      var a = LINES[i][0], m = LINES[i][1], c = LINES[i][2];
      if (b[a] && b[a] === b[m] && b[a] === b[c]) {
        return { piece: b[a], line: LINES[i] };
      }
    }
    return null;
  }

  function emptyCells(b) {
    var list = [];
    for (var i = 0; i < 9; i++) if (b[i] === '') list.push(i);
    return list;
  }

  // minimax 极小化极大：电脑 O 求最大分，玩家 X 求最小分
  // 局面越快分胜负分值越大，因此 AI 倾向速胜、拖负
  function minimax(b, aiTurn) {
    var win = getWinner(b);
    var left = emptyCells(b).length;
    if (win) {
      return { score: win.piece === 'O' ? (10 + left) : (-10 - left) };
    }
    if (left === 0) return { score: 0 };

    var best = { score: aiTurn ? -Infinity : Infinity, index: -1 };
    for (var i = 0; i < 9; i++) {
      if (b[i] !== '') continue;
      b[i] = aiTurn ? 'O' : 'X';
      var res = minimax(b, !aiTurn);
      b[i] = '';
      if ((aiTurn && res.score > best.score) ||
          (!aiTurn && res.score < best.score)) {
        best = { score: res.score, index: i };
      }
    }
    return best;
  }

  function bestMove() {
    return minimax(board.slice(), true).index;
  }

  function randomMove() {
    var list = emptyCells(board);
    return list[Math.floor(Math.random() * list.length)];
  }

  // 三档难度共用同一个完整 minimax；简单完全随机，普通偶有失误
  function aiChoose() {
    if (CONFIG.difficulty === 'easy') return randomMove();
    if (CONFIG.difficulty === 'normal') {
      return Math.random() < 0.6 ? bestMove() : randomMove();
    }
    return bestMove();
  }

  function paint() {
    for (var i = 0; i < 9; i++) {
      var cls = 'cell';
      if (board[i] === 'X') cls += ' is-x';
      if (board[i] === 'O') cls += ' is-o';
      if (winLine.indexOf(i) !== -1) cls += ' win';
      cells[i].className = cls;
      cells[i].textContent = board[i];
      cells[i].disabled = board[i] !== '' || waiting || finished;
    }
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function updateHud() {
    if (CONFIG.scoreboard) {
      document.getElementById('hud-win').textContent = stats.win;
      document.getElementById('hud-draw').textContent = stats.draw;
      document.getElementById('hud-lose').textContent = stats.lose;
    }
    if (CONFIG.best) {
      document.getElementById('hud-best').textContent = bestStreak;
    }
  }

  function loadBest() {
    if (!CONFIG.best) return 0;
    try {
      return parseInt(localStorage.getItem(BEST_KEY), 10) || 0;
    } catch (err) {
      return 0;
    }
  }

  function saveBest(v) {
    if (!CONFIG.best || v <= bestStreak) return;
    bestStreak = v;
    try {
      localStorage.setItem(BEST_KEY, String(bestStreak));
    } catch (err) { /* 存储不可用时忽略 */ }
  }

  function finish(piece, line) {
    finished = true;
    winLine = line;
    if (piece === 'X') {
      stats.win += 1;
      stats.streak += 1;
      saveBest(stats.streak);
      setStatus('你赢了！点击“重新开始”再战一局');
      beep(660, 0.12, 'square', 0.06);
      setTimeout(beep, 140, 990, 0.18, 'square', 0.06);
    } else if (piece === 'O') {
      stats.lose += 1;
      stats.streak = 0;
      setStatus('电脑获胜，别灰心，再来一局');
      beep(220, 0.28, 'sawtooth', 0.06);
    } else {
      stats.draw += 1;
      setStatus('平局，势均力敌');
      beep(440, 0.2, 'triangle', 0.06);
    }
    paint();
    updateHud();
  }

  // 落子后检查胜负或平局
  function checkResult() {
    var win = getWinner(board);
    if (win) {
      finish(win.piece, win.line);
      return true;
    }
    if (emptyCells(board).length === 0) {
      finish('', []);
      return true;
    }
    return false;
  }

  function playerPick(i) {
    if (finished || waiting || board[i] !== '') return;
    board[i] = 'X';
    beep(520, 0.07, 'square', 0.05);
    paint();
    if (checkResult()) return;
    waiting = true;
    setStatus('电脑思考中…');
    paint();
    setTimeout(aiTurn, 420);
  }

  function aiTurn() {
    if (finished) return;
    var i = aiChoose();
    board[i] = 'O';
    waiting = false;
    beep(360, 0.08, 'square', 0.05);
    paint();
    if (!checkResult()) setStatus('轮到你了（X）');
  }

  function reset() {
    board = new Array(9).fill('');
    waiting = false;
    finished = false;
    winLine = [];
    setStatus('你执 X 先手，请落子');
    paint();
    updateHud();
  }

  cells.forEach(function (cell) {
    cell.addEventListener('click', function () {
      playerPick(parseInt(cell.getAttribute('data-i'), 10));
    });
  });
  document.getElementById('restart').addEventListener('click', reset);

  reset();
})();`;
  }

  /* ============================================================
     五、游戏二：贪吃蛇（可调网格 10-24、初始速度）
     ============================================================ */

  function snakeCss() {
    return `#cv { aspect-ratio: 1 / 1; }

.pause-tip {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 4px;
  color: var(--c2);
  text-shadow: 0 2px 12px rgba(0, 0, 0, .8);
}

.stage { position: relative; }
`;
  }

  function snakeBody(cfg, t) {
    return `  <main class="app">
    <h1 class="title">${escHtml(cfg.title)}</h1>
    <p class="subtitle">${cfg.snake.grid} × ${cfg.snake.grid} 网格 · 初始速度：${SPEED_LABEL[cfg.snake.speed]} · 主题：${t.name}</p>
${cfg.scoreboard || cfg.best ? `    <div class="hud">
${cfg.scoreboard ? `      <span class="tag">得分<b id="hud-score">0</b></span>
` : ''}${cfg.best ? `      <span class="tag best-tag">最高<b id="hud-best">0</b></span>
` : ''}    </div>` : ''}
    <div class="stage">
      <canvas id="cv" width="480" height="480" aria-label="贪吃蛇游戏画布"></canvas>
      <span class="pause-tip" id="pause-tip" hidden>已暂停</span>
    </div>
    <div class="overlay" id="overlay">
      <div class="dialog">
        <h2 id="ov-title">准备好了吗？</h2>
        <p id="ov-text">方向键或 WASD 控制移动，吃到光点得分并变长；撞墙或撞到自己即结束。</p>
        <p class="big" id="ov-score" hidden></p>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" id="ov-btn">开始游戏</button>
        </div>
      </div>
    </div>
    <p class="tip">电脑：方向键 / WASD 转向，空格暂停；手机：在画面上滑动转向。</p>
  </main>`;
  }

  function snakeScript(cfg) {
    return `(function () {
  'use strict';

  // ===== 由工坊写入的生成参数 =====
  var CONFIG = {
    grid: ${j(cfg.snake.grid)},        // 每边格数（10-24）
    startSpeed: ${j(cfg.snake.speed)}, // 初始步进间隔，毫秒
    sound: ${j(cfg.sound)},
    scoreboard: ${j(cfg.scoreboard)},
    best: ${j(cfg.best)}
  };
  var BEST_KEY = 'codegen-best-snake';

  // ===== 音效：WebAudio 简易蜂鸣 =====
  var audioCtx = null;
  function beep(freq, during, type, vol) {
    if (!CONFIG.sound) return;
    try {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
      }
      var osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol || 0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + during);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + during);
    } catch (err) {
      audioCtx = null;
    }
  }

  // ===== 画布与主题色（颜色取自页面 CSS 变量，因此换主题立即变色） =====
  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d');
  var SIZE = cv.width;
  var CELL = SIZE / CONFIG.grid;
  var styles = getComputedStyle(document.documentElement);
  var C1 = styles.getPropertyValue('--c1').trim() || '#7c5cff';
  var C2 = styles.getPropertyValue('--c2').trim() || '#22d3ee';

  // ===== 游戏状态 =====
  var snake = [], food = { x: 0, y: 0 };
  var dir = { x: 1, y: 0 }, queued = { x: 1, y: 0 };
  var score = 0, interval = CONFIG.startSpeed, acc = 0, lastTs = 0;
  var alive = true, started = false, paused = false;

  var overlay = document.getElementById('overlay'),
      pauseTip = document.getElementById('pause-tip');
  var ovTitle = document.getElementById('ov-title'),
      ovText = document.getElementById('ov-text'),
      ovScore = document.getElementById('ov-score'),
      ovBtn = document.getElementById('ov-btn');

  function placeFood() {
    var p;
    do {
      p = {
        x: Math.floor(Math.random() * CONFIG.grid),
        y: Math.floor(Math.random() * CONFIG.grid)
      };
    } while (snake.some(function (s) { return s.x === p.x && s.y === p.y; }));
    food = p;
  }

  function reset() {
    var mid = Math.floor(CONFIG.grid / 2);
    snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid }
    ];
    dir = { x: 1, y: 0 };
    queued = { x: 1, y: 0 };
    score = 0; interval = CONFIG.startSpeed; acc = 0; lastTs = 0;
    alive = true; paused = false;
    placeFood();
    updateHud();
    draw();
  }

  function updateHud() {
    if (CONFIG.scoreboard) {
      document.getElementById('hud-score').textContent = score;
    }
    if (CONFIG.best) {
      var b = 0;
      try { b = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (err) { b = 0; }
      document.getElementById('hud-best').textContent = Math.max(b, score);
    }
  }

  function saveBest() {
    if (!CONFIG.best) return;
    try {
      var b = parseInt(localStorage.getItem(BEST_KEY), 10) || 0;
      if (score > b) localStorage.setItem(BEST_KEY, String(score));
    } catch (err) { /* 忽略 */ }
  }

  // 单步推进
  function step() {
    dir = queued;
    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // 撞墙
    if (head.x < 0 || head.y < 0 || head.x >= CONFIG.grid || head.y >= CONFIG.grid) {
      gameOver();
      return;
    }
    // 撞到自己（尾巴下一步会移走，最后一节可进入）
    for (var i = 0; i < snake.length - 1; i++) {
      if (snake[i].x === head.x && snake[i].y === head.y) {
        gameOver();
        return;
      }
    }

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 1;
      interval = Math.max(55, Math.round(interval * 0.985)); // 越吃越快
      beep(720, 0.06, 'square', 0.05);
      placeFood();
      updateHud();
    } else {
      snake.pop();
    }
  }

  function gameOver() {
    alive = false;
    started = false;
    saveBest();
    updateHud();
    beep(180, 0.3, 'sawtooth', 0.07);
    ovTitle.textContent = '游戏结束';
    ovText.textContent = '再来一局，挑战更高分数吧。';
    ovScore.textContent = '本局得分 ' + score;
    ovScore.hidden = false;
    ovBtn.textContent = '重新开始';
    overlay.hidden = false;
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

  function draw() {
    ctx.clearRect(0, 0, SIZE, SIZE);

    // 淡淡的网格点
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    for (var gx = 0; gx < CONFIG.grid; gx++) {
      for (var gy = 0; gy < CONFIG.grid; gy++) {
        ctx.beginPath();
        ctx.arc(gx * CELL + CELL / 2, gy * CELL + CELL / 2, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 食物：强调色光点
    ctx.save();
    ctx.shadowColor = C2;
    ctx.shadowBlur = 14;
    ctx.fillStyle = C2;
    ctx.beginPath();
    ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2,
            Math.max(3, CELL * 0.32), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 蛇身
    for (var i = snake.length - 1; i >= 0; i--) {
      var pad = Math.max(1, CELL * 0.08);
      ctx.fillStyle = i === 0 ? C2 : C1;
      roundRect(snake[i].x * CELL + pad, snake[i].y * CELL + pad,
                CELL - pad * 2, CELL - pad * 2, Math.max(2, CELL * 0.22));
      ctx.fill();
    }
  }

  function loop(ts) {
    if (started && alive && !paused) {
      if (!lastTs) lastTs = ts;
      acc += ts - lastTs;
      var guard = 0;
      while (acc >= interval && guard < 5) {
        step();
        acc -= interval;
        guard += 1;
        if (!alive) break;
      }
    }
    lastTs = ts;
    if (alive) draw();
    requestAnimationFrame(loop);
  }

  function start() {
    if (!alive) reset();
    started = true;
    paused = false;
    overlay.hidden = true;
    pauseTip.hidden = true;
    lastTs = 0;
    acc = 0;
  }

  function togglePause() {
    if (!started || !alive) return;
    paused = !paused;
    pauseTip.hidden = !paused;
    lastTs = 0;
  }

  function setDirection(x, y) {
    // 禁止直接反向；相对“已排队方向”判断，快速连按也不会撞死
    if (queued.x + x === 0 && queued.y + y === 0) return;
    queued = { x: x, y: y };
  }

  // ===== 键盘操作 =====
  var KEY_DIR = {
    ArrowUp: [0, -1], KeyW: [0, -1],
    ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0]
  };
  window.addEventListener('keydown', function (e) {
    if (KEY_DIR[e.code]) {
      e.preventDefault();
      if (!started || !alive) start();
      setDirection(KEY_DIR[e.code][0], KEY_DIR[e.code][1]);
    } else if (e.code === 'Space') {
      e.preventDefault();
      (!started || !alive) ? start() : togglePause();
    }
  });

  // ===== 触摸滑动操作 =====
  var touchX = 0, touchY = 0;
  cv.addEventListener('touchstart', function (e) {
    var p = e.touches[0];
    touchX = p.clientX; touchY = p.clientY;
  }, { passive: true });

  cv.addEventListener('touchend', function (e) {
    var p = e.changedTouches[0];
    var dx = p.clientX - touchX, dy = p.clientY - touchY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    if (!started || !alive) start();
    if (Math.abs(dx) > Math.abs(dy)) setDirection(dx > 0 ? 1 : -1, 0);
    else setDirection(0, dy > 0 ? 1 : -1);
  }, { passive: true });

  ovBtn.addEventListener('click', start);

  reset();
  requestAnimationFrame(loop);
})();`;
  }

  /* ============================================================
     六、游戏三：打砖块（行数 3-8、球速、挡板宽度）
     ============================================================ */

  function breakoutCss() {
    return `#cv { aspect-ratio: 480 / 440; }

.lives { color: var(--c2); }
`;
  }

  function breakoutBody(cfg, t) {
    return `  <main class="app">
    <h1 class="title">${escHtml(cfg.title)}</h1>
    <p class="subtitle">${cfg.breakout.rows} 行砖墙 · 球速：${BALL_LABEL[cfg.breakout.ball]} · 挡板 ${cfg.breakout.paddle} 像素 · 主题：${t.name}</p>
${cfg.scoreboard || cfg.best ? `    <div class="hud">
${cfg.scoreboard ? `      <span class="tag">分数<b id="hud-score">0</b></span>
      <span class="tag">生命<b id="hud-lives" class="lives">3</b></span>
` : ''}${cfg.best ? `      <span class="tag best-tag">最高<b id="hud-best">0</b></span>
` : ''}    </div>` : ''}
    <div class="stage">
      <canvas id="cv" width="480" height="440" aria-label="打砖块游戏画布"></canvas>
    </div>
    <div class="overlay" id="overlay">
      <div class="dialog">
        <h2 id="ov-title">准备好了吗？</h2>
        <p id="ov-text">移动鼠标或手指控制挡板，点击画面或按空格发球；击碎全部砖块即可通关。</p>
        <p class="big" id="ov-score" hidden></p>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" id="ov-btn">开始游戏</button>
        </div>
      </div>
    </div>
    <p class="tip">电脑：鼠标或 A / D、方向键移动挡板，空格发球；手机：手指拖动挡板。</p>
  </main>`;
  }

  function breakoutScript(cfg) {
    return `(function () {
  'use strict';

  // ===== 由工坊写入的生成参数 =====
  var CONFIG = {
    rows: ${j(cfg.breakout.rows)},       // 砖块行数（3-8）
    ballSpeed: ${j(cfg.breakout.ball)},  // 球速（像素/帧）
    paddleW: ${j(cfg.breakout.paddle)},  // 挡板宽度（像素）
    sound: ${j(cfg.sound)},
    scoreboard: ${j(cfg.scoreboard)},
    best: ${j(cfg.best)}
  };
  var BEST_KEY = 'codegen-best-breakout';

  // ===== 音效 =====
  var audioCtx = null;
  function beep(freq, during, type, vol) {
    if (!CONFIG.sound) return;
    try {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
      }
      var osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol || 0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + during);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + during);
    } catch (err) {
      audioCtx = null;
    }
  }

  // ===== 画布与主题色 =====
  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d');
  var W = cv.width;
  var H = cv.height;
  var styles = getComputedStyle(document.documentElement);
  var C1 = styles.getPropertyValue('--c1').trim() || '#7c5cff';
  var C2 = styles.getPropertyValue('--c2').trim() || '#22d3ee';

  // ===== 布局常量 =====
  var COLS = 8, SIDE = 14, GAP = 6, TOP = 58, BH = 16;
  var PADDLE_H = 12, PADDLE_Y = H - 32, R = 7;
  var BW = (W - SIDE * 2 - GAP * (COLS - 1)) / COLS;   // 单块砖宽

  // ===== 状态 =====
  var bricks = [], remaining = 0, lives = 3, score = 0;
  var stuck = true, running = false;                   // stuck：球停在挡板上等待发射
  var paddleX = (W - CONFIG.paddleW) / 2;
  var ball = { x: W / 2, y: PADDLE_Y - R - 1, vx: 0, vy: 0 };

  var overlay = document.getElementById('overlay'), ovBtn = document.getElementById('ov-btn');
  var ovTitle = document.getElementById('ov-title'), ovText = document.getElementById('ov-text'),
      ovScore = document.getElementById('ov-score');

  function buildBricks() {
    bricks = [];
    for (var r = 0; r < CONFIG.rows; r++) {
      for (var c = 0; c < COLS; c++) {
        bricks.push({
          x: SIDE + c * (BW + GAP),
          y: TOP + r * (BH + GAP),
          alive: true
        });
      }
    }
    remaining = bricks.length;
  }

  function updateHud() {
    if (CONFIG.scoreboard) {
      document.getElementById('hud-score').textContent = score;
      document.getElementById('hud-lives').textContent = lives;
    }
    if (CONFIG.best) {
      var b = 0;
      try { b = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (err) { b = 0; }
      document.getElementById('hud-best').textContent = Math.max(b, score);
    }
  }

  function saveBest() {
    if (!CONFIG.best) return;
    try {
      var b = parseInt(localStorage.getItem(BEST_KEY), 10) || 0;
      if (score > b) localStorage.setItem(BEST_KEY, String(score));
    } catch (err) { /* 忽略 */ }
  }

  function resetBall() {
    stuck = true;
    ball.x = paddleX + CONFIG.paddleW / 2;
    ball.y = PADDLE_Y - R - 1;
    ball.vx = 0;
    ball.vy = 0;
  }

  function startGame() {
    buildBricks();
    paddleX = (W - CONFIG.paddleW) / 2;
    lives = 3;
    score = 0;
    running = true;
    resetBall();
    updateHud();
    overlay.hidden = true;
  }

  function launch() {
    if (!running) return;
    if (!stuck) return;
    // 以接近垂直向上的小随机角度发球
    var angle = (Math.random() - 0.5) * 0.7;
    ball.vx = Math.sin(angle) * CONFIG.ballSpeed;
    ball.vy = -Math.cos(angle) * CONFIG.ballSpeed;
    stuck = false;
    beep(520, 0.06, 'square', 0.04);
  }

  function endGame(win) {
    running = false;
    saveBest();
    updateHud();
    beep(win ? 880 : 170, win ? 0.1 : 0.3, win ? 'square' : 'sawtooth', 0.06);
    if (win) setTimeout(beep, 130, 1180, 0.16, 'square', 0.06);
    ovTitle.textContent = win ? '通关成功！' : '游戏结束';
    ovText.textContent = win ? '所有砖块都被击碎了。' : '三条生命已用完，再挑战一次吧。';
    ovScore.textContent = '最终分数 ' + score; ovScore.hidden = false;
    ovBtn.textContent = '再来一局'; overlay.hidden = false;
  }

  function loseLife() {
    lives -= 1;
    beep(200, 0.18, 'sawtooth', 0.06);
    if (lives <= 0) endGame(false); else resetBall();
    updateHud();
  }

  // 挡板反弹：击中位置决定反弹角，边缘可以打出大斜线
  function bouncePaddle() {
    var rel = (ball.x - (paddleX + CONFIG.paddleW / 2)) / (CONFIG.paddleW / 2);
    rel = Math.max(-1, Math.min(1, rel));
    var angle = rel * 1.05;
    ball.vx = Math.sin(angle) * CONFIG.ballSpeed;
    ball.vy = -Math.abs(Math.cos(angle) * CONFIG.ballSpeed);
    ball.y = PADDLE_Y - R - 1;
  }

  function hitBricks() {
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      if (!b.alive) continue;
      if (ball.x + R > b.x && ball.x - R < b.x + BW &&
          ball.y + R > b.y && ball.y - R < b.y + BH) {
        // 用双向重叠量较小者判定从哪一侧撞入
        var ox = Math.min(ball.x + R - b.x, b.x + BW - (ball.x - R));
        var oy = Math.min(ball.y + R - b.y, b.y + BH - (ball.y - R));
        if (ox < oy) ball.vx = -ball.vx;
        else ball.vy = -ball.vy;
        b.alive = false;
        remaining -= 1;
        score += 10;
        beep(680 + (CONFIG.rows * 12) - i % 5 * 22, 0.05, 'square', 0.04);
        updateHud();
        if (remaining === 0) endGame(true);
        return;
      }
    }
  }

  function update() {
    if (!running) return;
    if (stuck) {
      ball.x = paddleX + CONFIG.paddleW / 2;
      return;
    }
    ball.x += ball.vx;
    ball.y += ball.vy;

    // 左右墙
    if (ball.x < R || ball.x > W - R) { ball.vx = -ball.vx; ball.x = Math.max(R, Math.min(W - R, ball.x)); beep(440, .04, 'square', .03); }
    // 顶部
    if (ball.y < R) { ball.y = R; ball.vy = -ball.vy; beep(440, .04, 'square', .03); }
    // 底部出界
    if (ball.y - R > H) { loseLife(); return; }

    // 挡板
    if (ball.vy > 0 &&
        ball.y + R >= PADDLE_Y && ball.y - R <= PADDLE_Y + PADDLE_H &&
        ball.x >= paddleX - R && ball.x <= paddleX + CONFIG.paddleW + R) {
      bouncePaddle();
      beep(500, .05, 'square', .04);
    }

    hitBricks();
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

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // 砖块：主色与强调色逐行交替
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      if (!b.alive) continue;
      var row = Math.floor(i / COLS);
      ctx.fillStyle = row % 2 === 0 ? C1 : C2;
      roundRect(b.x, b.y, BW, BH, 5);
      ctx.fill();
    }

    // 挡板
    var grad = ctx.createLinearGradient(paddleX, 0, paddleX + CONFIG.paddleW, 0);
    grad.addColorStop(0, C1);
    grad.addColorStop(1, C2);
    ctx.fillStyle = grad;
    roundRect(paddleX, PADDLE_Y, CONFIG.paddleW, PADDLE_H, 6);
    ctx.fill();

    // 球
    ctx.save();
    ctx.shadowColor = C2;
    ctx.shadowBlur = 12;
    ctx.fillStyle = C2;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // ===== 鼠标 / 触摸控制挡板 =====
  function moveToClient(clientX) {
    var rect = cv.getBoundingClientRect();
    var x = (clientX - rect.left) * (W / rect.width) - CONFIG.paddleW / 2;
    paddleX = Math.max(0, Math.min(W - CONFIG.paddleW, x));
  }

  cv.addEventListener('pointermove', function (e) { moveToClient(e.clientX); });
  cv.addEventListener('pointerdown', function (e) { moveToClient(e.clientX); launch(); });

  // ===== 键盘控制 =====
  window.addEventListener('keydown', function (e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      e.preventDefault();
      paddleX = Math.max(0, paddleX - 28);
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      e.preventDefault();
      paddleX = Math.min(W - CONFIG.paddleW, paddleX + 28);
    } else if (e.code === 'Space') {
      e.preventDefault();
      running ? launch() : startGame();
    }
  });

  ovBtn.addEventListener('click', startGame);

  buildBricks();
  resetBall();
  updateHud();
  loop();
})();`;
  }

  /* ============================================================
     七、游戏四：记忆翻牌（4x4 / 6x6 汉字配对）
     ============================================================ */

  function memoryCss() {
    return `.mem-grid {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  gap: 8px;
  width: min(440px, 92vw);
  margin: 0 auto;
}

.mem-grid.size6 { gap: 6px; }

.card {
  aspect-ratio: 3 / 4;
  appearance: none;
  border: none;
  background: none;
  padding: 0;
  perspective: 600px;
  cursor: pointer;
}

.card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform .35s ease;
}

.card.open .card-inner,
.card.done .card-inner {
  transform: rotateY(180deg);
}

.face {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  border: 1px solid var(--line);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.face.front {
  background: linear-gradient(135deg, var(--c1), var(--c2));
}

.face.front::after {
  content: '';
  width: 26%;
  height: 26%;
  border: 2px solid rgba(11, 14, 32, .55);
  transform: rotate(45deg);
  border-radius: 3px;
}

.face.back {
  background: var(--panel);
  color: var(--c2);
  font-size: 24px;
  font-weight: 800;
  transform: rotateY(180deg);
}

.size6 .face.back { font-size: 18px; }

.card.done .face.back {
  color: #0b0e20;
  background: linear-gradient(135deg, var(--c1), var(--c2));
}
`;
  }

  function memoryBody(cfg, t) {
    return `  <main class="app">
    <h1 class="title">${escHtml(cfg.title)}</h1>
    <p class="subtitle">${cfg.memory.size} × ${cfg.memory.size} 牌阵 · ${(cfg.memory.size * cfg.memory.size / 2)} 对汉字 · 主题：${t.name}</p>
${cfg.scoreboard || cfg.best ? `    <div class="hud">
${cfg.scoreboard ? `      <span class="tag">步数<b id="hud-moves">0</b></span>
      <span class="tag">用时<b id="hud-time">00:00</b></span>
` : ''}${cfg.best ? `      <span class="tag best-tag">最佳<b id="hud-best">—</b></span>
` : ''}    </div>` : ''}
    <div class="mem-grid ${cfg.memory.size === 6 ? 'size6' : 'size4'}" id="grid"></div>
    <div class="btn-row">
      <button type="button" class="btn btn-primary" id="restart">重新洗牌</button>
    </div>
    <div class="overlay" id="overlay" hidden>
      <div class="dialog">
        <h2>全部配对成功！</h2>
        <p id="result-text"></p>
        <p class="big" id="result-moves"></p>
        <div class="btn-row">
          <button type="button" class="btn btn-primary" id="again">再来一局</button>
        </div>
      </div>
    </div>
    <p class="tip">每次翻开两张卡片，相同即为配对成功；用最少的步数完成挑战。</p>
  </main>`;
  }

  function memoryScript(cfg) {
    return `(function () {
  'use strict';

  // ===== 由工坊写入的生成参数 =====
  var CONFIG = {
    size: ${j(cfg.memory.size)},       // 4 表示 4x4，6 表示 6x6
    sound: ${j(cfg.sound)},
    scoreboard: ${j(cfg.scoreboard)},
    best: ${j(cfg.best)}
  };
  var BEST_KEY = 'codegen-best-memory-' + CONFIG.size;

  // 牌面文字取自《千字文》前 18 个字，足够 6x6 的 18 对使用
  var SYMBOLS = ['天', '地', '玄', '黄', '宇', '宙', '洪', '荒',
                 '日', '月', '盈', '昃', '辰', '宿', '列', '张',
                 '寒', '来'];

  // ===== 音效 =====
  var audioCtx = null;
  function beep(freq, during, type, vol) {
    if (!CONFIG.sound) return;
    try {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
      }
      var osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol || 0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + during);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + during);
    } catch (err) {
      audioCtx = null;
    }
  }

  // ===== 状态 =====
  var gridEl = document.getElementById('grid');
  var total = CONFIG.size * CONFIG.size;
  var pairs = total / 2;
  var opened = [];        // 当前已翻开且尚未配对的卡片
  var lock = false;       // 两张不匹配时短暂锁定
  var moves = 0;
  var matched = 0;
  var started = false;
  var seconds = 0;
  var timerId = null;

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var k = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[k];
      arr[k] = tmp;
    }
    return arr;
  }

  function formatTime(s) {
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function loadBest() {
    if (!CONFIG.best) return null;
    try {
      var v = parseInt(localStorage.getItem(BEST_KEY), 10);
      return isNaN(v) ? null : v;
    } catch (err) {
      return null;
    }
  }

  function updateHud() {
    if (CONFIG.scoreboard) {
      document.getElementById('hud-moves').textContent = moves;
      document.getElementById('hud-time').textContent = formatTime(seconds);
    }
    if (CONFIG.best) {
      var b = loadBest();
      document.getElementById('hud-best').textContent = b === null ? '—' : b + ' 步';
    }
  }

  function startTimer() {
    if (timerId !== null) return;
    timerId = setInterval(function () {
      seconds += 1;
      updateHud();
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
  }

  // 根据牌阵大小生成全部卡片按钮
  function buildBoard() {
    gridEl.innerHTML = '';
    gridEl.style.setProperty('--cols', CONFIG.size);
    var deck = shuffle(SYMBOLS.slice(0, pairs).concat(SYMBOLS.slice(0, pairs)));
    deck.forEach(function (ch) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'card';
      card.dataset.ch = ch;

      var inner = document.createElement('span');
      inner.className = 'card-inner';
      var front = document.createElement('span');
      front.className = 'face front';
      var back = document.createElement('span');
      back.className = 'face back';
      back.textContent = ch;

      inner.appendChild(front);
      inner.appendChild(back);
      card.appendChild(inner);
      card.addEventListener('click', function () { flip(card); });
      gridEl.appendChild(card);
    });
  }

  function flip(card) {
    if (lock) return;
    if (card.classList.contains('open') || card.classList.contains('done')) return;

    if (!started) {
      started = true;
      startTimer();
    }

    card.classList.add('open');
    beep(500, 0.06, 'square', 0.04);
    opened.push(card);

    if (opened.length < 2) return;

    moves += 1;
    updateHud();
    var first = opened[0];
    var second = opened[1];

    if (first.dataset.ch === second.dataset.ch) {
      // 配对成功
      first.classList.add('done');
      second.classList.add('done');
      opened = [];
      matched += 1;
      beep(760, 0.1, 'triangle', 0.05);
      if (matched === pairs) win();
    } else {
      // 不匹配：短暂展示后翻回
      lock = true;
      beep(240, 0.12, 'sawtooth', 0.04);
      setTimeout(function () {
        first.classList.remove('open');
        second.classList.remove('open');
        opened = [];
        lock = false;
      }, 650);
    }
  }

  function win() {
    stopTimer();
    beep(660, 0.12, 'square', 0.06);
    setTimeout(beep, 140, 880, 0.14, 'square', 0.06);
    setTimeout(beep, 300, 1180, 0.2, 'square', 0.06);

    var record = false;
    if (CONFIG.best) {
      var b = loadBest();
      if (b === null || moves < b) {
        record = true;
        try { localStorage.setItem(BEST_KEY, String(moves)); } catch (err) { /* 忽略 */ }
      }
    }
    updateHud();

    document.getElementById('result-text').textContent =
      '用时 ' + formatTime(seconds) + (record ? '，刷新了最少步数纪录！' : '。');
    document.getElementById('result-moves').textContent = moves + ' 步';
    document.getElementById('overlay').hidden = false;
  }

  function restart() {
    stopTimer();
    opened = [];
    lock = false;
    moves = 0;
    matched = 0;
    started = false;
    seconds = 0;
    document.getElementById('overlay').hidden = true;
    buildBoard();
    updateHud();
  }

  document.getElementById('restart').addEventListener('click', restart);
  document.getElementById('again').addEventListener('click', restart);

  buildBoard();
  updateHud();
})();`;
  }

  /* ============================================================
     八、组装完整单文件 HTML
     ============================================================ */

  function trim(s) {
    return s.replace(/^\n+/, '').replace(/\s+$/, '');
  }

  function generateGame(cfg) {
    cfg = mergeSettings(cfg);
    var t = THEMES[cfg.theme];
    var css, body, script;

    if (cfg.type === 'ttt') {
      css = baseCss(t) + '\n\n' + tttCss();
      body = tttBody(cfg, t);
      script = tttScript(cfg);
    } else if (cfg.type === 'snake') {
      css = baseCss(t) + '\n\n' + snakeCss();
      body = snakeBody(cfg, t);
      script = snakeScript(cfg);
    } else if (cfg.type === 'breakout') {
      css = baseCss(t) + '\n\n' + breakoutCss();
      body = breakoutBody(cfg, t);
      script = breakoutScript(cfg);
    } else {
      css = baseCss(t) + '\n\n' + memoryCss();
      body = memoryBody(cfg, t);
      script = memoryScript(cfg);
    }

    return [
      '<!-- 由小游戏代码工坊生成 MIT -->',
      '<!DOCTYPE html>',
      '<html lang="zh-CN">',
      '<head>',
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '<title>' + escHtml(cfg.title) + '</title>',
      '<style>',
      trim(css),
      '</style>',
      '</head>',
      '<body>',
      trim(body),
      '<script>',
      trim(script),
      '<\/script>',
      '</body>',
      '</html>',
      ''
    ].join('\n');
  }

  /* ============================================================
     九、轻量语法高亮器（单次正则扫描，避免嵌套包裹）
     ============================================================ */

  function highlight(src) {
    var escaped = src.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    var tokenRe = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`)|\b(const|let|var|function|return|if|else|for|while|do|break|continue|new|typeof|instanceof|in|of|this|true|false|null|undefined|switch|case|default|try|catch|finally|throw|class|extends|super)\b|(\d+(?:\.\d+)?)\b/g;

    return escaped.replace(tokenRe, function (m, com, str, kw, num) {
      if (com) return '<span class="hl-com">' + m + '</span>';
      if (str) return '<span class="hl-str">' + m + '</span>';
      if (kw) return '<span class="hl-kw">' + m + '</span>';
      return '<span class="hl-num">' + m + '</span>';
    });
  }

  /* ============================================================
     十、工坊页面交互（仅在浏览器环境初始化）
     ============================================================ */

  function initWorkshop() {
    var $ = function (sel) { return document.querySelector(sel); };

    var segType = $('#seg-type');
    var themeGrid = $('#theme-grid');
    var titleInput = $('#f-title');
    var titleCount = $('#title-count');
    var typeOptions = $('#type-options');
    var typeTip = $('#type-tip');
    var soundBox = $('#f-sound');
    var scoreBox = $('#f-score');
    var bestBox = $('#f-best');
    var liveBox = $('#f-live');
    var btnGenerate = $('#btn-generate');
    var btnRandom = $('#btn-random');
    var btnRun = $('#btn-run');
    var btnCopy = $('#btn-copy');
    var btnDownload = $('#btn-download');
    var codeOut = $('#code-out');
    var codeGutter = $('#code-gutter');
    var codeMeta = $('#code-meta');
    var runMask = $('#run-mask');
    var runFrame = $('#run-frame');
    var runName = $('#run-name');
    var btnCloseRun = $('#btn-close-run');
    var btnNewtab = $('#btn-newtab');
    var toastEl = $('#toast');

    var settings = loadSettings();
    var currentCode = '';
    var liveTimer = null;
    var toastTimer = null;
    var blobUrl = null;

    /* ---------- 提示条 ---------- */
    function toast(msg) {
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        toastEl.classList.remove('show');
      }, 2000);
    }

    /* ---------- 脏标记 ---------- */
    function markDirty() {
      btnGenerate.classList.add('is-dirty');
    }

    function clearDirty() {
      btnGenerate.classList.remove('is-dirty');
    }

    /* ---------- 类型专属参数渲染 ---------- */
    function segRow(id, label, options, current) {
      var btns = options.map(function (o) {
        return '      <button type="button" class="seg-btn' +
          (o.v === current ? ' active' : '') +
          '" data-val="' + o.v + '">' + o.t + '</button>';
      }).join('\n');
      return '<div class="opt-row"><span>' + label + '</span><b class="opt-value" data-for="' + id + '"></b></div>' +
             '<div class="seg cols-' + options.length + '" data-opt="' + id + '">\n' + btns + '\n    </div>';
    }

    function rangeRow(id, label, min, max, step, val, unit) {
      return '<div class="opt-row"><span>' + label + '</span><b>' + val + unit + '</b></div>' +
             '<input type="range" data-opt="' + id + '" min="' + min + '" max="' + max +
             '" step="' + step + '" value="' + val + '">';
    }

    function selectRow(id, label, options, val) {
      var opts = options.map(function (o) {
        return '        <option value="' + o.v + '"' + (Number(o.v) === Number(val) ? ' selected' : '') +
               '>' + o.t + '</option>';
      }).join('\n');
      return '<div class="opt-row"><span>' + label + '</span>' +
             '<select class="opt-select" data-opt="' + id + '">\n' + opts + '\n      </select></div>';
    }

    function renderTypeOptions(type) {
      var html = '<label class="field-label">游戏参数</label>';
      if (type === 'ttt') {
        html += segRow('difficulty', 'AI 难度', [
          { v: 'easy', t: '简单' },
          { v: 'normal', t: '普通' },
          { v: 'hard', t: '困难' }
        ], settings.ttt.difficulty);
      } else if (type === 'snake') {
        html += rangeRow('grid', '网格大小', 10, 24, 1, settings.snake.grid, ' 格');
        html += selectRow('speed', '初始速度', [
          { v: 160, t: '悠闲' },
          { v: 110, t: '标准' },
          { v: 75, t: '急速' }
        ], settings.snake.speed);
      } else if (type === 'breakout') {
        html += rangeRow('rows', '砖块行数', 3, 8, 1, settings.breakout.rows, ' 行');
        html += selectRow('ball', '小球速度', [
          { v: 3.2, t: '轻柔' },
          { v: 4.3, t: '标准' },
          { v: 5.6, t: '迅猛' }
        ], settings.breakout.ball);
        html += rangeRow('paddle', '挡板宽度', 70, 150, 2, settings.breakout.paddle, ' 像素');
      } else {
        html += segRow('size', '牌阵大小', [
          { v: 4, t: '4 × 4（8 对）' },
          { v: 6, t: '6 × 6（18 对）' }
        ], settings.memory.size);
      }
      typeOptions.innerHTML = html;
      typeTip.textContent = TYPE_TIP[type];
    }

    function syncOptionLabels() {
      // 滑块行右侧的数值随拖动更新
      typeOptions.querySelectorAll('input[type="range"]').forEach(function (input) {
        var row = input.previousElementSibling;
        var b = row ? row.querySelector('b') : null;
        if (b) {
          var unit = input.dataset.opt === 'grid' ? ' 格' :
                     input.dataset.opt === 'rows' ? ' 行' : ' 像素';
          b.textContent = input.value + unit;
        }
      });
    }

    /* ---------- 读取 / 应用表单 ---------- */
    function readForm() {
      var type = segType.querySelector('.seg-btn.active').dataset.type;
      var theme = themeGrid.querySelector('.theme-card.active').dataset.theme;
      settings.type = type;
      settings.theme = theme;
      settings.title = titleInput.value.slice(0, 12) || '小游戏';
      settings.sound = soundBox.checked;
      settings.scoreboard = scoreBox.checked;
      settings.best = bestBox.checked;
      settings.live = liveBox.checked;

      var activeSeg = function (name) {
        var seg = typeOptions.querySelector('.seg[data-opt="' + name + '"]');
        return seg ? seg.querySelector('.seg-btn.active').dataset.val : null;
      };

      if (type === 'ttt') {
        settings.ttt.difficulty = activeSeg('difficulty');
      } else if (type === 'snake') {
        settings.snake.grid = parseInt(typeOptions.querySelector('[data-opt="grid"]').value, 10);
        settings.snake.speed = Number(typeOptions.querySelector('[data-opt="speed"]').value);
      } else if (type === 'breakout') {
        settings.breakout.rows = parseInt(typeOptions.querySelector('[data-opt="rows"]').value, 10);
        settings.breakout.ball = Number(typeOptions.querySelector('[data-opt="ball"]').value);
        settings.breakout.paddle = parseInt(typeOptions.querySelector('[data-opt="paddle"]').value, 10);
      } else {
        settings.memory.size = Number(activeSeg('size'));
      }
      return settings;
    }

    function setActive(container, attr, val) {
      container.querySelectorAll('[' + attr + ']').forEach(function (el) {
        el.classList.toggle('active', String(el.getAttribute(attr)) === String(val));
      });
    }

    function applyForm() {
      setActive(segType, 'data-type', settings.type);
      setActive(themeGrid, 'data-theme', settings.theme);
      titleInput.value = settings.title;
      titleCount.textContent = settings.title.length;
      soundBox.checked = !!settings.sound;
      scoreBox.checked = !!settings.scoreboard;
      bestBox.checked = !!settings.best;
      liveBox.checked = !!settings.live;
      renderTypeOptions(settings.type);
      syncOptionLabels();
    }

    /* ---------- 代码渲染 ---------- */
    function renderCode(code) {
      var lines = code.split('\n');
      var nums = [];
      for (var i = 1; i <= lines.length; i++) nums.push(i);
      codeGutter.textContent = nums.join('\n');
      codeOut.innerHTML = highlight(code);
      codeMeta.textContent = '共 ' + lines.length + ' 行 · 单文件 HTML · 内联 CSS/JS · 零依赖';
    }

    function applyToFrame(code) {
      // 始终把最新代码注入隐藏 iframe，打开试运行即可立即游玩
      runFrame.srcdoc = code;
    }

    function generate() {
      readForm();
      currentCode = generateGame(settings);
      renderCode(currentCode);
      applyToFrame(currentCode);
      runName.textContent = TYPE_LABEL[settings.type] + ' · ' + settings.title;
      saveSettings(settings);
      clearDirty();
    }

    /* ---------- 参数变化 ---------- */
    function scheduleChange() {
      readForm();
      titleCount.textContent = settings.title.length;
      if (liveBox.checked) {
        clearTimeout(liveTimer);
        liveTimer = setTimeout(generate, 120);
      } else {
        markDirty();
      }
    }

    // 类型切换
    segType.addEventListener('click', function (e) {
      var btn = e.target.closest('.seg-btn');
      if (!btn) return;
      setActive(segType, 'data-type', btn.dataset.type);
      settings.type = btn.dataset.type;
      renderTypeOptions(settings.type);
      scheduleChange();
    });

    // 主题切换
    themeGrid.addEventListener('click', function (e) {
      var card = e.target.closest('.theme-card');
      if (!card) return;
      setActive(themeGrid, 'data-theme', card.dataset.theme);
      settings.theme = card.dataset.theme;
      scheduleChange();
    });

    // 标题与开关
    titleInput.addEventListener('input', function () {
      titleCount.textContent = titleInput.value.length;
      scheduleChange();
    });
    soundBox.addEventListener('change', scheduleChange);
    scoreBox.addEventListener('change', scheduleChange);
    bestBox.addEventListener('change', scheduleChange);
    liveBox.addEventListener('change', function () {
      settings.live = liveBox.checked;
      saveSettings(settings);
      if (liveBox.checked) {
        clearDirty();
        generate();
      }
    });

    // 类型专属参数（事件委托，重渲染后依然有效）
    typeOptions.addEventListener('click', function (e) {
      var btn = e.target.closest('.seg-btn');
      if (!btn) return;
      var seg = btn.parentElement;
      seg.querySelectorAll('.seg-btn').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      scheduleChange();
    });
    typeOptions.addEventListener('input', function () {
      syncOptionLabels();
      scheduleChange();
    });
    typeOptions.addEventListener('change', scheduleChange);

    /* ---------- 按钮 ---------- */
    btnGenerate.addEventListener('click', generate);

    btnRandom.addEventListener('click', function () {
      settings = mergeSettings(settings);
      settings.type = pick(TYPES);
      settings.theme = pick(Object.keys(THEMES));
      settings.title = pick(TITLE_PRESETS[settings.type]);
      settings.sound = Math.random() < 0.8;
      settings.scoreboard = true;
      settings.best = Math.random() < 0.8;
      settings.ttt.difficulty = pick(['easy', 'normal', 'hard']);
      settings.snake.grid = 10 + Math.floor(Math.random() * 15);
      settings.snake.speed = pick([160, 110, 75]);
      settings.breakout.rows = 3 + Math.floor(Math.random() * 6);
      settings.breakout.ball = pick([3.2, 4.3, 5.6]);
      settings.breakout.paddle = 70 + Math.floor(Math.random() * 81);
      settings.memory.size = pick([4, 6]);
      applyForm();
      generate();
      toast('随机灵感已生成：' + TYPE_LABEL[settings.type] + ' · ' + THEMES[settings.theme].name);
    });

    // 试运行
    btnRun.addEventListener('click', function () {
      if (btnGenerate.classList.contains('is-dirty')) generate();
      applyToFrame(currentCode);
      runName.textContent = TYPE_LABEL[settings.type] + ' · ' + settings.title;
      runMask.hidden = false;
    });
    btnCloseRun.addEventListener('click', function () {
      runMask.hidden = true;
    });
    runMask.addEventListener('click', function (e) {
      if (e.target === runMask) runMask.hidden = true;
    });

    // 新标签打开（Blob URL，作为 iframe 的备用方案）
    btnNewtab.addEventListener('click', function () {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      var blob = new Blob([currentCode], { type: 'text/html;charset=utf-8' });
      blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    });

    // 复制：优先剪贴板 API，降级 textarea + execCommand
    btnCopy.addEventListener('click', function () {
      var done = function () { toast('代码已复制到剪贴板'); };
      var fail = function () { toast('复制失败，请手动选择代码复制'); };
      if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
        navigator.clipboard.writeText(currentCode).then(done, function () {
          legacyCopy() ? done() : fail();
        });
      } else {
        legacyCopy() ? done() : fail();
      }
    });

    function legacyCopy() {
      var ta = document.createElement('textarea');
      ta.value = currentCode;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      var ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (err) {
        ok = false;
      }
      document.body.removeChild(ta);
      return ok;
    }

    // 下载 HTML
    btnDownload.addEventListener('click', function () {
      var name = (settings.title || '小游戏').replace(/[\\/:*?"<>|]+/g, '').trim() || '小游戏';
      var blob = new Blob([currentCode], { type: 'text/html;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name + '.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      toast('已开始下载 ' + name + '.html');
    });

    /* ---------- 首屏：默认紫青霓虹井字棋，立即可见即可玩 ---------- */
    applyForm();
    generate();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initWorkshop);
    } else {
      initWorkshop();
    }
  }

  // Node 自测入口：浏览器中无 module 对象，此分支不会执行
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      generateGame: generateGame,
      highlight: highlight,
      mergeSettings: mergeSettings,
      defaultSettings: defaultSettings,
      THEMES: THEMES,
      TYPE_LABEL: TYPE_LABEL
    };
  }
})();
