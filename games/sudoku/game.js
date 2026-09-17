/* ============================================================
 * 霓虹数独 game.js
 * 纯原生 JavaScript（零依赖）：
 *   1. 回溯 + 随机候选顺序生成完整终盘
 *   2. 按难度随机挖空，逐格校验唯一解（MRV 位掩码加速）
 *   3. DOM 棋盘渲染、候选笔记、提示、撤销、计时、本地最佳
 * 全部代码包裹在 IIFE 中；生成函数同时导出以便 Node 自测
 * ============================================================ */
(function () {
  'use strict';

  /* ===================== 常量配置 ===================== */

  var SIZE = 9;                 // 棋盘边长
  var FULL_MASK = 0x1ff;        // 9 个候选位全开 111111111
  var MAX_ERRORS = 3;           // 错误次数上限
  var MAX_HINTS = 3;            // 提示次数上限
  var MAX_HISTORY = 300;        // 撤销栈上限
  var TICK_MS = 1000;           // 计时器间隔

  // 各难度保留的已知格数量区间
  var DIFFICULTIES = {
    easy: { name: '简单', storageKey: 'best_sudoku_easy', minClues: 38, maxClues: 42 },
    normal: { name: '普通', storageKey: 'best_sudoku_normal', minClues: 30, maxClues: 34 },
    hard: { name: '困难', storageKey: 'best_sudoku_hard', minClues: 24, maxClues: 28 }
  };

  // 预计算 0~511 每个值二进制中 1 的数量（候选数个数）
  var POPCOUNT = new Array(512);
  POPCOUNT[0] = 0;
  for (var i = 1; i < 512; i++) {
    POPCOUNT[i] = POPCOUNT[i >> 1] + (i & 1);
  }

  // 单个二进制位 -> 对应数字（1<<(n-1) 映射到 n）
  var BIT_NUMBER = {};
  for (var n = 1; n <= 9; n++) {
    BIT_NUMBER[1 << (n - 1)] = n;
  }

  /* ===================== 基础工具 ===================== */

  // 创建全 0 的 9x9 数组
  function createGrid() {
    var grid = [];
    for (var r = 0; r < SIZE; r++) {
      grid.push([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    }
    return grid;
  }

  // 深拷贝 9x9 数组
  function cloneGrid(grid) {
    var copy = [];
    for (var r = 0; r < SIZE; r++) {
      copy.push(grid[r].slice());
    }
    return copy;
  }

  // Fisher-Yates 洗牌
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  // 区间 [min, max] 内的随机整数
  function randomInt(min, max) {
    return min + ((Math.random() * (max - min + 1)) | 0);
  }

  // 让主线程获得喘息机会，避免挖空循环卡住浏览器
  function nextFrame() {
    return new Promise(function (resolve) {
      setTimeout(resolve, 0);
    });
  }

  // 判断数字 n 放在 (r,c) 是否符合行、列、宫规则
  function canPlace(grid, r, c, n) {
    var boxR = (r / 3 | 0) * 3;
    var boxC = (c / 3 | 0) * 3;
    for (var k = 0; k < SIZE; k++) {
      if (grid[r][k] === n || grid[k][c] === n) return false;
      if (grid[boxR + ((k / 3) | 0)][boxC + (k % 3)] === n) return false;
    }
    return true;
  }

  // 根据当前盘面构建行/列/宫已占用数字的位掩码
  function buildMasks(grid) {
    var rows = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    var cols = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    var boxes = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var v = grid[r][c];
        if (v !== 0) {
          var bit = 1 << (v - 1);
          var b = (r / 3 | 0) * 3 + (c / 3 | 0);
          rows[r] |= bit;
          cols[c] |= bit;
          boxes[b] |= bit;
        }
      }
    }
    return { rows: rows, cols: cols, boxes: boxes };
  }

  /* ===================== 终盘生成（回溯） ===================== */

  // 递归填充完整合法终盘，候选数字随机打乱保证每局不同
  function fillSolution(grid) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (grid[r][c] === 0) {
          var nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
          for (var k = 0; k < nums.length; k++) {
            var num = nums[k];
            if (canPlace(grid, r, c, num)) {
              grid[r][c] = num;
              if (fillSolution(grid)) return true;
              grid[r][c] = 0;
            }
          }
          return false; // 所有候选都冲突，回溯
        }
      }
    }
    return true;
  }

  /* ===================== 解数统计（唯一解校验，MRV 加速） ===================== */

  // 统计盘面解的数量，达到 limit 后立即返回；唯一解校验时传 2
  function countSolutions(grid, limit) {
    var masks = buildMasks(grid);
    var rows = masks.rows;
    var cols = masks.cols;
    var boxes = masks.boxes;

    var empties = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (grid[r][c] === 0) empties.push([r, c]);
      }
    }

    var count = 0;

    function search() {
      // 每一步选择候选数最少的空格（MRV 启发式），大幅减少分支
      var bestIdx = -1;
      var bestMask = 0;
      var bestLen = 10;

      for (var i = 0; i < empties.length; i++) {
        var pos = empties[i];
        var er = pos[0];
        var ec = pos[1];
        if (grid[er][ec] !== 0) continue;

        var b = (er / 3 | 0) * 3 + (ec / 3 | 0);
        var avail = FULL_MASK & ~(rows[er] | cols[ec] | boxes[b]);
        var len = POPCOUNT[avail];
        if (len === 0) return;                       // 死路
        if (len < bestLen) {
          bestLen = len;
          bestMask = avail;
          bestIdx = i;
          if (len === 1) break;
        }
      }

      if (bestIdx === -1) {                          // 没有空格：得到一解
        count++;
        return;
      }

      var target = empties[bestIdx];
      var tr = target[0];
      var tc = target[1];
      var tb = (tr / 3 | 0) * 3 + (tc / 3 | 0);
      var mask = bestMask;

      while (mask) {
        var bit = mask & -mask;
        mask &= mask - 1;
        var num = BIT_NUMBER[bit];

        grid[tr][tc] = num;
        rows[tr] |= bit;
        cols[tc] |= bit;
        boxes[tb] |= bit;

        search();

        grid[tr][tc] = 0;
        rows[tr] &= ~bit;
        cols[tc] &= ~bit;
        boxes[tb] &= ~bit;

        if (count >= limit) return;
      }
    }

    search();
    return count;
  }

  // 求解盘面并返回解盘副本（无解返回 null），供自测使用
  function solveGrid(input) {
    var grid = cloneGrid(input);
    var masks = buildMasks(grid);
    var rows = masks.rows;
    var cols = masks.cols;
    var boxes = masks.boxes;

    function search() {
      var bestIdx = -1;
      var bestMask = 0;
      var bestLen = 10;

      for (var r = 0; r < SIZE; r++) {
        for (var c = 0; c < SIZE; c++) {
          if (grid[r][c] !== 0) continue;
          var b = (r / 3 | 0) * 3 + (c / 3 | 0);
          var avail = FULL_MASK & ~(rows[r] | cols[c] | boxes[b]);
          var len = POPCOUNT[avail];
          if (len === 0) return false;
          if (len < bestLen) {
            bestLen = len;
            bestMask = avail;
            bestIdx = r * SIZE + c;
            if (len === 1) break;
          }
        }
        if (bestLen === 1) break;
      }

      if (bestIdx === -1) return true;

      var tr = (bestIdx / SIZE | 0);
      var tc = bestIdx % SIZE;
      var tb = (tr / 3 | 0) * 3 + (tc / 3 | 0);
      var mask = bestMask;

      while (mask) {
        var bit = mask & -mask;
        mask &= mask - 1;
        var num = BIT_NUMBER[bit];

        grid[tr][tc] = num;
        rows[tr] |= bit;
        cols[tc] |= bit;
        boxes[tb] |= bit;

        if (search()) return true;

        grid[tr][tc] = 0;
        rows[tr] &= ~bit;
        cols[tc] &= ~bit;
        boxes[tb] &= ~bit;
      }
      return false;
    }

    return search() ? grid : null;
  }

  /* ===================== 题目生成（挖空 + 唯一解） ===================== */

  // 依据难度生成 { puzzle, solution }；异步执行并定期让出主线程
  async function generateGame(diffKey) {
    var conf = DIFFICULTIES[diffKey];
    var targetClues = randomInt(conf.minClues, conf.maxClues);

    var solution = createGrid();
    fillSolution(solution);

    var puzzle = cloneGrid(solution);
    var clues = SIZE * SIZE;
    var attempts = 0;

    // 每轮把当前仍保留数字的位置重新洗牌后尝试挖除
    var removedThisPass = true;
    while (clues > targetClues && removedThisPass) {
      removedThisPass = false;
      var positions = [];
      for (var idx = 0; idx < SIZE * SIZE; idx++) {
        if (puzzle[(idx / SIZE | 0)][idx % SIZE] !== 0) positions.push(idx);
      }
      shuffle(positions);

      for (var p = 0; p < positions.length; p++) {
        if (clues <= targetClues) break;

        var pos = positions[p];
        var r = (pos / SIZE | 0);
        var c = pos % SIZE;
        var backup = puzzle[r][c];

        puzzle[r][c] = 0;
        if (countSolutions(puzzle, 2) !== 1) {
          puzzle[r][c] = backup;      // 破坏唯一解，恢复
        } else {
          clues--;
          removedThisPass = true;
        }

        attempts++;
        if (attempts % 10 === 0) {
          await nextFrame();          // 定期交还渲染线程
        }
      }
    }

    return { puzzle: puzzle, solution: solution, clues: clues };
  }

  /* ===================== 以下为浏览器 UI 逻辑 ===================== */

  if (typeof document === 'undefined') {
    // Node 自测环境：导出算法接口后直接返回
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = {
        generateGame: generateGame,
        countSolutions: countSolutions,
        solveGrid: solveGrid,
        fillSolution: fillSolution,
        DIFFICULTIES: DIFFICULTIES
      };
    }
    return;
  }

  var $ = function (id) {
    return document.getElementById(id);
  };

  /* ---------- DOM 引用 ---------- */

  var boardEl = $('board');
  var timeText = $('timeText');
  var diffText = $('diffText');
  var errorText = $('errorText');
  var hintBadge = $('hintBadge');
  var hintBtn = $('hintBtn');
  var noteBtn = $('noteBtn');
  var undoBtn = $('undoBtn');
  var pauseBtn = $('pauseBtn');
  var eraseBtn = $('eraseBtn');
  var newBtn = $('newBtn');
  var loadingCover = $('loadingCover');
  var pauseCover = $('pauseCover');
  var pauseResumeBtn = $('pauseResumeBtn');
  var startOverlay = $('startOverlay');
  var winOverlay = $('winOverlay');
  var failOverlay = $('failOverlay');
  var winTime = $('winTime');
  var winRecord = $('winRecord');
  var winAgainBtn = $('winAgainBtn');
  var winChooseBtn = $('winChooseBtn');
  var failRetryBtn = $('failRetryBtn');
  var failChooseBtn = $('failChooseBtn');
  var failContinueBtn = $('failContinueBtn');
  var continueChk = $('continueChk');

  /* ---------- 游戏运行时状态 ---------- */

  var state = null;
  var cellEls = [];   // 9x9 的格子 DOM 缓存

  function createState() {
    return {
      diffKey: null,
      puzzle: null,
      solution: null,
      values: null,       // 当前盘面数字（0 为空）
      notes: null,        // 候选数，按位掩码存储
      given: null,        // 是否为题目给定数字
      hinted: null,       // 是否为提示填入的数字
      sel: { r: 4, c: 4 },
      noteMode: false,
      errors: 0,
      unlimited: false,   // 达到上限并允许继续后，不再累计失败
      hintsLeft: MAX_HINTS,
      history: [],
      seconds: 0,
      timerId: null,
      paused: false,
      finished: false,
      failed: false,
      generating: false,
      allowContinue: false
    };
  }

  // 输入是否被锁定（遮罩、暂停、结束等状态）
  function inputLocked() {
    return !state ||
      !state.solution ||
      state.generating ||
      state.paused ||
      state.finished ||
      state.failed;
  }

  /* ---------- 本地最佳时间 ---------- */

  function getBestSeconds(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null) return null;
      var val = parseInt(raw, 10);
      return isNaN(val) ? null : val;
    } catch (e) {
      return null;
    }
  }

  function setBestSeconds(key, seconds) {
    try {
      localStorage.setItem(key, String(seconds));
    } catch (e) {
      /* 本地存储不可用时静默忽略 */
    }
  }

  // 秒数格式化为 mm:ss（超过 1 小时显示 h:mm:ss）
  function formatTime(total) {
    var h = (total / 3600) | 0;
    var m = ((total % 3600) / 60) | 0;
    var s = total % 60;
    var mm = m < 10 ? '0' + m : '' + m;
    var ss = s < 10 ? '0' + s : '' + s;
    return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  function refreshBestLabels() {
    Object.keys(DIFFICULTIES).forEach(function (key) {
      var el = $('best-' + key);
      if (!el) return;
      var best = getBestSeconds(DIFFICULTIES[key].storageKey);
      el.textContent = best === null ? '--:--' : formatTime(best);
    });
  }

  /* ---------- 棋盘 DOM 构建 ---------- */

  function buildBoardDom() {
    boardEl.innerHTML = '';
    cellEls = [];

    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) {
        var cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        if (c === 2 || c === 5) cell.classList.add('thick-r');
        if (r === 2 || r === 5) cell.classList.add('thick-b');

        var num = document.createElement('span');
        num.className = 'cell-num';
        cell.appendChild(num);

        var notes = document.createElement('div');
        notes.className = 'cell-notes';
        for (var k = 1; k <= 9; k++) {
          var note = document.createElement('span');
          note.className = 'note';
          note.dataset.n = k;
          notes.appendChild(note);
        }
        cell.appendChild(notes);

        boardEl.appendChild(cell);
        row.push(cell);
      }
      cellEls.push(row);
    }
  }

  /* ---------- 渲染 ---------- */

  function sameBox(r1, c1, r2, c2) {
    return ((r1 / 3 | 0) === (r2 / 3 | 0)) && ((c1 / 3 | 0) === (c2 / 3 | 0));
  }

  // 根据当前状态刷新整个棋盘（81 格，性能足够）
  function renderBoard() {
    var selR = state.sel.r;
    var selC = state.sel.c;
    var selValue = state.values[selR][selC];

    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var cell = cellEls[r][c];
        var v = state.values[r][c];

        cell.classList.toggle('given', !!state.given[r][c]);
        cell.classList.toggle('user', !state.given[r][c] && !state.hinted[r][c] && v !== 0);
        cell.classList.toggle('hinted', !!state.hinted[r][c]);
        cell.classList.toggle('error', v !== 0 && v !== state.solution[r][c]);
        cell.classList.toggle('selected', r === selR && c === selC);
        cell.classList.toggle(
          'peer',
          !(r === selR && c === selC) &&
          (r === selR || c === selC || sameBox(r, c, selR, selC))
        );
        cell.classList.toggle(
          'same',
          !(r === selR && c === selC) &&
          selValue !== 0 && v === selValue
        );

        cell.querySelector('.cell-num').textContent = v === 0 ? '' : String(v);

        var noteSpans = cell.querySelectorAll('.note');
        var mask = state.notes[r][c];
        for (var k = 0; k < 9; k++) {
          var num = k + 1;
          noteSpans[k].textContent = (mask & (1 << k)) !== 0 ? String(num) : '';
        }
      }
    }
  }

  // 刷新顶部状态条与功能按钮
  function renderHud() {
    timeText.textContent = formatTime(state.seconds);
    diffText.textContent = state.diffKey ? DIFFICULTIES[state.diffKey].name : '--';
    errorText.textContent = state.unlimited ? '3+' : state.errors + '/' + MAX_ERRORS;
    errorText.classList.toggle('danger', state.errors >= MAX_ERRORS);

    hintBadge.textContent = String(state.hintsLeft);
    hintBtn.disabled = state.hintsLeft <= 0 || inputLocked();
    undoBtn.disabled = state.history.length === 0 || inputLocked();
    noteBtn.classList.toggle('active', state.noteMode);
    pauseBtn.textContent = state.paused ? '继续' : '暂停';
  }

  /* ---------- 计时器 ---------- */

  function stopTimer() {
    if (state && state.timerId !== null) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function startTimer() {
    stopTimer();
    state.timerId = setInterval(function () {
      if (!state.paused && !state.finished && !state.failed) {
        state.seconds++;
        timeText.textContent = formatTime(state.seconds);
      }
    }, TICK_MS);
  }

  /* ---------- 选中格子 ---------- */

  function selectCell(r, c) {
    state.sel.r = r;
    state.sel.c = c;
    renderBoard();
  }

  function moveSelection(dr, dc) {
    var r = (state.sel.r + dr + SIZE) % SIZE;
    var c = (state.sel.c + dc + SIZE) % SIZE;
    selectCell(r, c);
  }

  /* ---------- 撤销历史 ---------- */

  // 在修改格子前压入快照；整盘候选笔记一并备份，
  // 这样撤销“填入正确数字”时能恢复被联动清除的候选数
  function pushHistory(r, c) {
    state.history.push({
      r: r,
      c: c,
      value: state.values[r][c],
      hinted: state.hinted[r][c],
      notesAll: cloneGrid(state.notes)
    });
    if (state.history.length > MAX_HISTORY) state.history.shift();
  }

  function undo() {
    if (inputLocked() || state.history.length === 0) return;
    var snap = state.history.pop();
    state.values[snap.r][snap.c] = snap.value;
    state.hinted[snap.r][snap.c] = snap.hinted;
    state.notes = snap.notesAll;
    selectCell(snap.r, snap.c);
    renderHud();
  }

  /* ---------- 候选笔记联动 ---------- */

  // 填入正确数字后，清除同行/同列/同宫的该候选数
  function clearPeerNotes(r, c, num) {
    var bit = 1 << (num - 1);
    for (var k = 0; k < SIZE; k++) {
      state.notes[r][k] &= ~bit;
      state.notes[k][c] &= ~bit;
      var rr = ((r / 3 | 0) * 3) + ((k / 3) | 0);
      var cc = ((c / 3 | 0) * 3) + (k % 3);
      state.notes[rr][cc] &= ~bit;
    }
  }

  /* ---------- 填写 / 擦除 ---------- */

  function inputNumber(num) {
    if (inputLocked()) return;

    var r = state.sel.r;
    var c = state.sel.c;
    if (state.given[r][c]) return;

    pushHistory(r, c);

    if (state.noteMode) {
      // 笔记模式：空格中切换候选数，再次输入取消
      if (state.values[r][c] === 0) {
        state.notes[r][c] ^= 1 << (num - 1);
      }
    } else {
      if (state.values[r][c] === num) {
        // 再次输入相同数字视为清除
        state.values[r][c] = 0;
        state.hinted[r][c] = false;
      } else {
        state.values[r][c] = num;
        state.notes[r][c] = 0;
        if (num === state.solution[r][c]) {
          state.hinted[r][c] = false;
          clearPeerNotes(r, c, num);
        } else {
          handleWrongAnswer();
        }
      }
    }

    renderBoard();
    renderHud();
    checkWin();
  }

  function eraseCell() {
    if (inputLocked()) return;

    var r = state.sel.r;
    var c = state.sel.c;
    if (state.given[r][c]) return;
    if (state.values[r][c] === 0 && state.notes[r][c] === 0) return;

    pushHistory(r, c);
    if (state.values[r][c] !== 0) {
      // 第一次擦除数字
      state.values[r][c] = 0;
      state.hinted[r][c] = false;
    } else {
      // 空格再擦除则清空候选笔记
      state.notes[r][c] = 0;
    }

    renderBoard();
    renderHud();
  }

  // 填错处理：累计错误，达到上限按配置决定失败或继续
  function handleWrongAnswer() {
    if (state.unlimited) return;
    state.errors++;
    if (state.errors >= MAX_ERRORS) {
      if (state.allowContinue) {
        state.unlimited = true;
      } else {
        triggerFail();
      }
    }
  }

  /* ---------- 提示 ---------- */

  function useHint() {
    if (inputLocked() || state.hintsLeft <= 0) return;

    // 优先填充当前选中格；若已正确则全盘寻找第一个未正确格
    var r = state.sel.r;
    var c = state.sel.c;
    if (state.values[r][c] === state.solution[r][c]) {
      var found = false;
      for (var i = 0; i < SIZE && !found; i++) {
        for (var j = 0; j < SIZE; j++) {
          if (!state.given[i][j] && state.values[i][j] !== state.solution[i][j]) {
            r = i;
            c = j;
            found = true;
            break;
          }
        }
      }
      if (!found) return;
    }
    if (state.given[r][c]) return;

    selectCell(r, c);
    pushHistory(r, c);

    var answer = state.solution[r][c];
    state.values[r][c] = answer;
    state.notes[r][c] = 0;
    state.hinted[r][c] = true;
    state.hintsLeft--;
    clearPeerNotes(r, c, answer);

    renderBoard();
    renderHud();
    checkWin();
  }

  /* ---------- 胜负判定 ---------- */

  function checkWin() {
    if (state.finished) return;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (state.values[r][c] !== state.solution[r][c]) return;
      }
    }
    triggerWin();
  }

  function triggerWin() {
    state.finished = true;
    stopTimer();

    var conf = DIFFICULTIES[state.diffKey];
    var prevBest = getBestSeconds(conf.storageKey);
    var isRecord = prevBest === null || state.seconds < prevBest;
    if (isRecord) setBestSeconds(conf.storageKey, state.seconds);

    winTime.textContent = formatTime(state.seconds);
    winRecord.textContent = isRecord ? '刷新最佳纪录，太强了！' : '全部填写正确，继续挑战更快速度吧';
    winOverlay.classList.remove('hidden');
  }

  function triggerFail() {
    state.failed = true;
    stopTimer();
    failContinueBtn.classList.toggle('hidden', !state.allowContinue);
    failOverlay.classList.remove('hidden');
  }

  /* ---------- 暂停 / 继续 ---------- */

  function pauseGame() {
    if (!state.solution || state.generating || state.finished || state.failed || state.paused) return;
    state.paused = true;
    stopTimer();
    pauseCover.classList.remove('hidden');
    renderHud();
  }

  function resumeGame() {
    if (!state.paused) return;
    state.paused = false;
    pauseCover.classList.add('hidden');
    startTimer();
    renderHud();
  }

  function togglePause() {
    if (state.paused) {
      resumeGame();
    } else {
      pauseGame();
    }
  }

  /* ---------- 开局 / 换局 ---------- */

  function showStartOverlay() {
    stopTimer();
    refreshBestLabels();
    winOverlay.classList.add('hidden');
    failOverlay.classList.add('hidden');
    pauseCover.classList.add('hidden');
    loadingCover.classList.add('hidden');
    startOverlay.classList.remove('hidden');
  }

  async function startGame(diffKey) {
    if (state && state.generating) return;

    stopTimer();
    winOverlay.classList.add('hidden');
    failOverlay.classList.add('hidden');
    pauseCover.classList.add('hidden');
    startOverlay.classList.add('hidden');

    state = createState();
    state.diffKey = diffKey;
    state.allowContinue = !!continueChk.checked;
    state.generating = true;

    buildBoardDom();
    loadingCover.classList.remove('hidden');
    renderHud();

    // 先让“生成中”遮挡绘制出来，再执行计算
    await nextFrame();

    var generated = await generateGame(diffKey);

    state.puzzle = generated.puzzle;
    state.solution = generated.solution;
    state.values = cloneGrid(generated.puzzle);
    state.notes = createGrid();
    state.given = createGrid();
    state.hinted = createGrid();

    var firstEmpty = null;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (generated.puzzle[r][c] !== 0) {
          state.given[r][c] = 1;
        } else if (firstEmpty === null) {
          firstEmpty = { r: r, c: c };
        }
      }
    }
    if (firstEmpty) state.sel = firstEmpty;

    state.generating = false;
    loadingCover.classList.add('hidden');
    renderBoard();
    renderHud();
    startTimer();
  }

  /* ---------- 事件绑定 ---------- */

  // 棋盘点击：事件委托
  boardEl.addEventListener('click', function (e) {
    var cell = e.target.closest('.cell');
    if (!cell || inputLocked()) return;
    selectCell(parseInt(cell.dataset.r, 10), parseInt(cell.dataset.c, 10));
  });

  // 数字按钮 1-9
  document.querySelectorAll('.num-btn[data-num]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      inputNumber(parseInt(btn.dataset.num, 10));
    });
  });

  eraseBtn.addEventListener('click', eraseCell);
  hintBtn.addEventListener('click', useHint);
  undoBtn.addEventListener('click', undo);
  pauseBtn.addEventListener('click', togglePause);
  pauseResumeBtn.addEventListener('click', resumeGame);
  newBtn.addEventListener('click', showStartOverlay);

  // 笔记模式切换
  noteBtn.addEventListener('click', function () {
    if (!state || !state.solution || state.generating) return;
    state.noteMode = !state.noteMode;
    renderHud();
  });

  // 难度选择
  document.querySelectorAll('.diff-card').forEach(function (btn) {
    btn.addEventListener('click', function () {
      startGame(btn.dataset.diff);
    });
  });

  // 胜利 / 失败遮罩按钮
  winAgainBtn.addEventListener('click', function () {
    if (state) startGame(state.diffKey);
  });
  winChooseBtn.addEventListener('click', showStartOverlay);
  failRetryBtn.addEventListener('click', function () {
    if (state) startGame(state.diffKey);
  });
  failChooseBtn.addEventListener('click', showStartOverlay);
  failContinueBtn.addEventListener('click', function () {
    state.failed = false;
    state.unlimited = true;   // 继续后不再因错误次数弹出失败遮罩
    failOverlay.classList.add('hidden');
    startTimer();
    renderHud();
  });

  // 物理键盘：数字、方向、Backspace、N、空格/P 暂停
  document.addEventListener('keydown', function (e) {
    if (!state || !state.solution || state.generating) return;
    if (state.finished || state.failed) return;

    if (e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      if (!state.paused) inputNumber(parseInt(e.key, 10));
      return;
    }

    switch (e.key) {
      case 'Backspace':
      case 'Delete':
        e.preventDefault();
        if (!state.paused) eraseCell();
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!state.paused) moveSelection(-1, 0);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!state.paused) moveSelection(1, 0);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (!state.paused) moveSelection(0, -1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (!state.paused) moveSelection(0, 1);
        break;
      case 'n':
      case 'N':
        e.preventDefault();
        if (!state.paused) {
          state.noteMode = !state.noteMode;
          renderHud();
        }
        break;
      case ' ':
      case 'p':
      case 'P':
        e.preventDefault();
        togglePause();
        break;
      default:
        break;
    }
  });

  /* ---------- 初始化 ---------- */

  state = createState();
  renderHud();
  showStartOverlay();
})();
