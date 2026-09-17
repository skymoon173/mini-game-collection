// pages/index/index.js
Page({

  /**
   * 页面的初始数据
   */
  data: {
    // 游戏状态
    board: [],
    solution: [],
    initialBoard: [],
    cells: [],
    notes: [],

    // 游戏设置
    difficulty: 'medium',
    mode: 'classic',
    notesMode: false,

    // 游戏统计
    timer: '00:00',
    timerSeconds: 0,
    timerInterval: null,
    hintsUsed: 0,
    errors: 0,
    isGameComplete: false,
    isLoading: false,

    // UI状态
    showThinkingPanel: false,
    showStatsModal: false,
    showSuccessModal: false,
    thinkingSteps: [],
    statsOverview: [],

    // 完成统计
    completionTime: '-',
    completionHints: '-',
    completionErrors: '-',

    // 历史记录
    history: [],
    redoStack: [],

    // 调试模式
    debugMode: true,

    // UI状态
    showSettingsModal: false,
    difficultyOptions: ['简单', '中等', '困难', '专家'],
    modeOptions: ['经典', '计时', '禅境'],
    difficultyIndex: 1,
    modeIndex: 0,
    settings: {
      soundEnabled: true,
      animationsEnabled: true,
      highlightSameNumbers: true
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    console.log('页面加载开始');
    try {
      this.initializeGame();
      console.log('游戏初始化完成');
    } catch (error) {
      console.error('页面加载出错:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    }
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function () {
    this.stopTimer();
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {
    this.stopTimer();
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  },

  // 初始化游戏
  initializeGame: function() {
    console.log('开始初始化游戏');
    try {
      this.createGrid();
      console.log('网格创建完成');
      this.loadSettings();
      console.log('设置加载完成');
      this.startNewGame();
      console.log('新游戏开始');
    } catch (error) {
      console.error('游戏初始化失败:', error);
      wx.showModal({
        title: '初始化失败',
        content: '游戏初始化时出现错误，请重启小程序',
        showCancel: false
      });
    }
  },

  // 创建网格
  createGrid: function() {
    const cells = [];
    for (let i = 0; i < 81; i++) {
      const row = Math.floor(i / 9);
      const col = i % 9;
      cells.push({
        index: i,
        row: row,
        col: col,
        value: '',
        showInput: true,
        showNotes: false,
        notes: [0, 0, 0, 0, 0, 0, 0, 0, 0], // 9个位置的笔记
        isSelected: false,
        isReadonly: false,
        isError: false,
        isHighlighted: false,
        isSameNumber: false
      });
    }
    this.setData({ cells: cells });
  },

  // 加载设置
  loadSettings: function() {
    try {
      const settings = wx.getStorageSync('sudoku-settings') || {
        soundEnabled: true,
        animationsEnabled: true,
        highlightSameNumbers: true
      };
      this.settings = settings;
    } catch (e) {
      this.settings = {
        soundEnabled: true,
        animationsEnabled: true,
        highlightSameNumbers: true
      };
    }
  },

  // 保存设置
  saveSettings: function() {
    try {
      wx.setStorageSync('sudoku-settings', this.settings);
    } catch (e) {
      console.error('保存设置失败', e);
    }
  },

  // 设置难度
  setDifficulty: function(e) {
    const difficulty = e.currentTarget.dataset.difficulty;
    this.setData({ difficulty: difficulty });
  },

  // 设置模式
  setMode: function(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ mode: mode });

    if (mode === 'timed' && !this.data.timerInterval) {
      this.startTimer();
    } else if (mode !== 'timed' && this.data.timerInterval) {
      this.stopTimer();
    }
  },

  // 切换笔记模式
  toggleNotesMode: function() {
    this.setData({ notesMode: !this.data.notesMode });
  },

  // 选择单元格
  selectCell: function(e) {
    if (this.data.isGameComplete || this.data.isLoading) return;

    const index = parseInt(e.currentTarget.dataset.index);
    const cells = this.data.cells.map((cell, i) => ({
      ...cell,
      isSelected: i === index
    }));

    this.setData({ cells: cells });
    this.updateHighlights();
  },

  // 更新高亮显示
  updateHighlights: function() {
    if (!this.settings.highlightSameNumbers) return;

    const selectedCell = this.data.cells.find(cell => cell.isSelected);
    if (!selectedCell || !selectedCell.value) {
      const cells = this.data.cells.map(cell => ({
        ...cell,
        isSameNumber: false
      }));
      this.setData({ cells: cells });
      return;
    }

    const selectedValue = selectedCell.value;
    const cells = this.data.cells.map(cell => ({
      ...cell,
      isSameNumber: !cell.isSelected && cell.value === selectedValue
    }));

    this.setData({ cells: cells });
  },

  // 处理单元格输入
  handleCellInput: function(e) {
    if (this.data.isGameComplete || this.data.isLoading) return;

    const index = parseInt(e.currentTarget.dataset.index);
    const value = e.detail.value;

    if (this.data.notesMode && value && /^[1-9]$/.test(value)) {
      // 添加笔记
      this.addNote(index, parseInt(value));
    } else if (value === '' || /^[1-9]$/.test(value)) {
      // 设置值
      this.setCellValue(index, value);
    }
  },

  // 添加笔记
  addNote: function(index, number) {
    const cells = [...this.data.cells];
    const notes = [...cells[index].notes];

    // 切换笔记状态
    notes[number - 1] = notes[number - 1] === number ? 0 : number;

    cells[index].notes = notes;
    cells[index].showNotes = notes.some(n => n > 0);
    cells[index].showInput = !cells[index].showNotes;
    cells[index].value = '';

    this.setData({ cells: cells });
    this.updateHighlights();
  },

  // 设置单元格值
  setCellValue: function(index, value) {
    this.saveToHistory();

    const cells = [...this.data.cells];
    const row = Math.floor(index / 9);
    const col = index % 9;

    // 清除之前的错误状态
    cells.forEach(cell => cell.isError = false);

    if (value && !this.isValidMove(row, col, parseInt(value))) {
      cells[index].isError = true;
      cells[index].value = value;
      this.setData({
        cells: cells,
        errors: this.data.errors + 1
      });
      this.showError();
      return;
    }

    cells[index].value = value;
    cells[index].notes = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    cells[index].showInput = true;
    cells[index].showNotes = false;

    this.setData({ cells: cells });
    this.updateHighlights();
    this.checkCompletion();
  },

  // 处理输入失焦
  handleCellBlur: function(e) {
    // 可以在这里添加额外的验证逻辑
  },

  // 开始新游戏
  startNewGame: function() {
    console.log('开始新游戏，当前难度:', this.data.difficulty);
    this.setData({ isLoading: true });

    // 延迟生成，给用户视觉反馈
    setTimeout(() => {
      this.resetGame();
      console.log('游戏重置完成');

      this.generatePuzzle();
      console.log('谜题生成完成，检查solution:', this.solution);

      this.updateCellsFromBoard();
      console.log('单元格更新完成，检查cells:', this.data.cells.slice(0, 9));

      this.setData({ isLoading: false });

      if (this.data.mode === 'timed') {
        this.startTimer();
      }

      // 动画效果
      this.animateCells();
    }, 500);
  },

  // 重置游戏
  resetGame: function() {
    this.board = Array(9).fill().map(() => Array(9).fill(0));
    this.solution = Array(9).fill().map(() => Array(9).fill(0));
    this.initialBoard = Array(9).fill().map(() => Array(9).fill(0));
    this.history = [];
    this.redoStack = [];

    this.setData({
      hintsUsed: 0,
      errors: 0,
      isGameComplete: false,
      timer: '00:00',
      timerSeconds: 0
    });

    this.stopTimer();
  },

  // 生成谜题
  generatePuzzle: function() {
    console.log('开始生成谜题，难度:', this.data.difficulty);

    // 使用简单方法生成完整解
    const success = this.fillBoardSimple(this.solution);
    console.log('完整解生成结果:', success, 'solution第一行:', this.solution[0]);

    if (!success) {
      console.error('无法生成有效解，重新尝试');
      // 清空solution并重试
      this.solution = Array(9).fill().map(() => Array(9).fill(0));
      return this.generatePuzzle(); // 递归重试
    }

    // 复制到游戏板
    for (let i = 0; i < 9; i++) {
      this.board[i] = [...this.solution[i]];
    }
    console.log('复制到游戏板完成，第一行:', this.board[0]);

    // 根据难度移除数字
    const holesToMake = this.getHolesForDifficulty();
    console.log('需要移除的数字数量:', holesToMake);

    this.removeNumbers(holesToMake);
    console.log('数字移除完成，第一行:', this.board[0]);

    // 设置初始板
    for (let i = 0; i < 9; i++) {
      this.initialBoard[i] = [...this.board[i]];
    }

    console.log('谜题生成完成');
  },

  // 获取难度对应的空洞数量
  getHolesForDifficulty: function() {
    switch (this.data.difficulty) {
      case 'easy': return 35;
      case 'medium': return 45;
      case 'hard': return 55;
      case 'expert': return 65;
      default: return 45;
    }
  },

  // 填充板（生成完整解）
  fillBoard: function(board) {
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (board[row][col] === 0) {
          const shuffled = [...numbers].sort(() => Math.random() - 0.5);

          for (const num of shuffled) {
            if (this.isValid(board, row, col, num)) {
              board[row][col] = num;
              if (this.fillBoard(board)) {
                return true;
              }
              board[row][col] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  },

  // 简单版本的fillBoard，避免递归深度问题
  fillBoardSimple: function(board) {
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (board[row][col] === 0) {
          const available = [];

          // 找到所有可用的数字
          for (const num of numbers) {
            if (this.isValid(board, row, col, num)) {
              available.push(num);
            }
          }

          if (available.length === 0) {
            return false; // 无解
          }

          // 随机选择一个可用的数字
          const randomIndex = Math.floor(Math.random() * available.length);
          board[row][col] = available[randomIndex];
        }
      }
    }

    // 验证最终结果是否有效
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const num = board[row][col];
        board[row][col] = 0;
        if (!this.isValid(board, row, col, num)) {
          board[row][col] = num;
          return false; // 无效解
        }
        board[row][col] = num;
      }
    }

    return true;
  },

  // 移除数字创建谜题
  removeNumbers: function(holesToMake) {
    const positions = Array.from({ length: 81 }, (_, i) => i);
    const shuffled = positions.sort(() => Math.random() - 0.5);

    let holesMade = 0;
    for (const pos of shuffled) {
      if (holesMade >= holesToMake) break;

      const row = Math.floor(pos / 9);
      const col = pos % 9;

      const temp = this.board[row][col];
      this.board[row][col] = 0;

      if (this.hasUniqueSolution()) {
        holesMade++;
      } else {
        this.board[row][col] = temp;
      }
    }
  },

  // 检查是否有唯一解
  hasUniqueSolution: function() {
    const boardCopy = this.board.map(row => [...row]);
    let solutions = 0;

    const countSolutions = (board) => {
      if (solutions > 1) return;

      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          if (board[row][col] === 0) {
            for (let num = 1; num <= 9; num++) {
              if (this.isValid(board, row, col, num)) {
                board[row][col] = num;
                countSolutions(board);
                board[row][col] = 0;
              }
            }
            return;
          }
        }
      }
      solutions++;
    };

    countSolutions(boardCopy);
    return solutions === 1;
  },

  // 验证移动是否有效
  isValid: function(board, row, col, num) {
    // 检查行
    for (let c = 0; c < 9; c++) {
      if (board[row][c] === num) return false;
    }

    // 检查列
    for (let r = 0; r < 9; r++) {
      if (board[r][col] === num) return false;
    }

    // 检查3x3宫格
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    for (let r = boxRow; r < boxRow + 3; r++) {
      for (let c = boxCol; c < boxCol + 3; c++) {
        if (board[r][c] === num) return false;
      }
    }

    return true;
  },

  // 检查移动是否有效（针对当前游戏板）
  isValidMove: function(row, col, num) {
    return this.isValid(this.board, row, col, num);
  },

  // 更新单元格显示
  updateCellsFromBoard: function() {
    const cells = this.data.cells.map(cell => {
      const row = cell.row;
      const col = cell.col;
      const boardValue = this.board[row][col];
      const isReadonly = this.initialBoard[row][col] !== 0;

      return {
        ...cell,
        value: boardValue !== 0 ? boardValue.toString() : '',
        showInput: boardValue === 0 && !isReadonly,
        showNotes: boardValue === 0 && cell.notes.some(n => n > 0),
        isReadonly: isReadonly,
        isError: false,
        isHighlighted: false,
        isSameNumber: false,
        isSelected: false
      };
    });

    this.setData({ cells: cells });
  },

  // 动画显示单元格
  animateCells: function() {
    if (!this.settings.animationsEnabled) return;

    // 简单的动画效果，可以通过CSS实现
    setTimeout(() => {
      // 可以在这里添加更多动画逻辑
    }, 100);
  },

  // 开始计时器
  startTimer: function() {
    if (this.data.timerInterval) return;

    this.timerSeconds = 0;
    const timerInterval = setInterval(() => {
      this.timerSeconds++;
      const minutes = Math.floor(this.timerSeconds / 60);
      const seconds = this.timerSeconds % 60;
      const timerStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

      this.setData({ timer: timerStr });
    }, 1000);

    this.setData({ timerInterval: timerInterval });
  },

  // 停止计时器
  stopTimer: function() {
    if (this.data.timerInterval) {
      clearInterval(this.data.timerInterval);
      this.setData({ timerInterval: null });
    }
  },

  // 获取提示
  getHint: function() {
    const emptyCells = [];
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (this.board[row][col] === 0 && this.initialBoard[row][col] === 0) {
          emptyCells.push({ row, col });
        }
      }
    }

    if (emptyCells.length > 0) {
      const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      this.board[randomCell.row][randomCell.col] = this.solution[randomCell.row][randomCell.col];

      const cells = [...this.data.cells];
      const index = randomCell.row * 9 + randomCell.col;
      cells[index].value = this.solution[randomCell.row][randomCell.col].toString();
      cells[index].showInput = false;
      cells[index].showNotes = false;
      cells[index].isHighlighted = true;

      this.setData({
        cells: cells,
        hintsUsed: this.data.hintsUsed + 1
      });

      // 移除高亮
      setTimeout(() => {
        cells[index].isHighlighted = false;
        this.setData({ cells: cells });
      }, 2000);

      this.checkCompletion();

      if (this.settings.soundEnabled) {
        this.playSound('hint');
      }
    }
  },

  // 撤销
  undo: function() {
    if (this.history.length > 0) {
      this.redoStack.push({
        board: this.board.map(row => [...row]),
        notes: this.data.cells.map(cell => [...cell.notes])
      });

      const state = this.history.pop();
      this.board = state.board;
      this.updateCellsFromNotes(state.notes);
    }
  },

  // 重做
  redo: function() {
    if (this.redoStack.length > 0) {
      this.history.push({
        board: this.board.map(row => [...row]),
        notes: this.data.cells.map(cell => [...cell.notes])
      });

      const state = this.redoStack.pop();
      this.board = state.board;
      this.updateCellsFromNotes(state.notes);
    }
  },

  // 保存到历史
  saveToHistory: function() {
    this.history.push({
      board: this.board.map(row => [...row]),
      notes: this.data.cells.map(cell => [...cell.notes])
    });
    this.redoStack = [];
  },

  // 从笔记更新单元格
  updateCellsFromNotes: function(notesData) {
    const cells = this.data.cells.map((cell, index) => ({
      ...cell,
      notes: [...notesData[index]],
      showNotes: notesData[index].some(n => n > 0),
      showInput: !notesData[index].some(n => n > 0)
    }));

    this.setData({ cells: cells });
    this.updateHighlights();
  },

  // 清除单元格
  clearCell: function() {
    const selectedCell = this.data.cells.find(cell => cell.isSelected);
    if (selectedCell && !selectedCell.isReadonly) {
      this.saveToHistory();

      const index = selectedCell.index;
      const row = Math.floor(index / 9);
      const col = index % 9;

      this.board[row][col] = 0;

      const cells = [...this.data.cells];
      cells[index].value = '';
      cells[index].notes = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      cells[index].showInput = true;
      cells[index].showNotes = false;

      this.setData({ cells: cells });
      this.updateHighlights();
    }
  },

  // 自动填充候选数
  autoFillCandidates: function() {
    const selectedCell = this.data.cells.find(cell => cell.isSelected);
    if (selectedCell && !selectedCell.isReadonly) {
      const index = selectedCell.index;
      const row = Math.floor(index / 9);
      const col = index % 9;

      if (this.board[row][col] === 0) {
        const candidates = this.getCandidates(row, col);
        const notes = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        candidates.forEach(num => {
          notes[num - 1] = num;
        });

        const cells = [...this.data.cells];
        cells[index].notes = notes;
        cells[index].showNotes = true;
        cells[index].showInput = false;

        this.setData({ cells: cells });
      }
    }
  },

  // 获取候选数
  getCandidates: function(row, col) {
    const candidates = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    // 移除同行数字
    for (let c = 0; c < 9; c++) {
      if (this.board[row][c] !== 0) {
        candidates.delete(this.board[row][c]);
      }
    }

    // 移除同列数字
    for (let r = 0; r < 9; r++) {
      if (this.board[r][col] !== 0) {
        candidates.delete(this.board[r][col]);
      }
    }

    // 移除同宫数字
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    for (let r = boxRow; r < boxRow + 3; r++) {
      for (let c = boxCol; c < boxCol + 3; c++) {
        if (this.board[r][c] !== 0) {
          candidates.delete(this.board[r][c]);
        }
      }
    }

    return Array.from(candidates);
  },

  // 验证数独
  validateBoard: function() {
    let isValid = true;
    const errorCells = [];

    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (this.board[row][col] !== 0) {
          const temp = this.board[row][col];
          this.board[row][col] = 0;
          if (!this.isValid(this.board, row, col, temp)) {
            isValid = false;
            errorCells.push(row * 9 + col);
          }
          this.board[row][col] = temp;
        }
      }
    }

    if (isValid) {
      wx.showToast({
        title: '验证通过！',
        icon: 'success'
      });
    } else {
      wx.showToast({
        title: `发现 ${errorCells.length} 个错误`,
        icon: 'none'
      });

      // 高亮错误单元格
      const cells = [...this.data.cells];
      errorCells.forEach(index => {
        cells[index].isError = true;
      });
      this.setData({ cells: cells });

      setTimeout(() => {
        errorCells.forEach(index => {
          cells[index].isError = false;
        });
        this.setData({ cells: cells });
      }, 2000);
    }
  },

  // 自动求解
  solveCompletely: function() {
    for (let i = 0; i < 9; i++) {
      this.board[i] = [...this.solution[i]];
    }
    this.updateCellsFromBoard();
    this.checkCompletion();
  },

  // 检查完成
  checkCompletion: function() {
    if (this.data.isGameComplete) return;

    const isComplete = this.board.every(row => row.every(cell => cell !== 0));
    const isCorrect = this.board.every((row, r) =>
      row.every((cell, c) => cell === this.solution[r][c])
    );

    if (isComplete && isCorrect) {
      this.completeGame();
    }
  },

  // 完成游戏
  completeGame: function() {
    this.setData({ isGameComplete: true });
    this.stopTimer();
    this.saveGameStats();

    // 显示成功模态框
    this.setData({
      showSuccessModal: true,
      completionTime: this.data.timer,
      completionHints: this.data.hintsUsed.toString(),
      completionErrors: this.data.errors.toString()
    });

    if (this.settings.soundEnabled) {
      this.playSound('complete');
    }
  },

  // 再玩一局
  playAgain: function() {
    this.setData({ showSuccessModal: false });
    this.startNewGame();
  },

  // 显示错误
  showError: function() {
    if (this.settings.soundEnabled) {
      this.playSound('error');
    }
  },

  // 播放声音
  playSound: function(type) {
    // 小程序中声音播放的简化实现
    console.log(`播放声音: ${type}`);
  },

  // 保存游戏统计
  saveGameStats: function() {
    try {
      const stats = wx.getStorageSync('sudoku-stats') || {};
      const key = `${this.data.difficulty}-${this.data.mode}`;

      if (!stats[key]) {
        stats[key] = {
          gamesPlayed: 0,
          bestTime: Infinity,
          totalTime: 0,
          totalHints: 0,
          totalErrors: 0
        };
      }

      stats[key].gamesPlayed++;
      stats[key].bestTime = Math.min(stats[key].bestTime, this.timerSeconds);
      stats[key].totalTime += this.timerSeconds;
      stats[key].totalHints += this.data.hintsUsed;
      stats[key].totalErrors += this.data.errors;

      wx.setStorageSync('sudoku-stats', stats);
    } catch (e) {
      console.error('保存统计失败', e);
    }
  },

  // 显示统计
  showStats: function() {
    try {
      const stats = wx.getStorageSync('sudoku-stats') || {};
      const statsOverview = [];

      const difficulties = ['easy', 'medium', 'hard', 'expert'];
      const modes = ['classic', 'timed', 'zen'];

      difficulties.forEach(difficulty => {
        const difficultyStats = modes.map(mode => stats[`${difficulty}-${mode}`]).filter(Boolean);
        if (difficultyStats.length > 0) {
          const category = {
            difficultyName: this.getDifficultyName(difficulty),
            stats: modes.map(mode => {
              const stat = stats[`${difficulty}-${mode}`];
              if (!stat) return null;

              return {
                modeName: this.getModeName(mode),
                gamesPlayed: stat.gamesPlayed || 0
              };
            }).filter(Boolean)
          };
          statsOverview.push(category);
        }
      });

      this.setData({
        statsOverview: statsOverview,
        showStatsModal: true
      });
    } catch (e) {
      console.error('加载统计失败', e);
      this.setData({
        statsOverview: [],
        showStatsModal: true
      });
    }
  },

  // 获取难度名称
  getDifficultyName: function(difficulty) {
    const names = {
      easy: '简单',
      medium: '中等',
      hard: '困难',
      expert: '专家'
    };
    return names[difficulty] || difficulty;
  },

  // 获取模式名称
  getModeName: function(mode) {
    const names = {
      classic: '经典',
      timed: '计时',
      zen: '禅境'
    };
    return names[mode] || mode;
  },

  // 关闭统计
  closeStats: function() {
    this.setData({ showStatsModal: false });
  },

  // 重置统计
  resetStats: function() {
    wx.showModal({
      title: '确认重置',
      content: '确定要重置所有统计数据吗？此操作无法撤销。',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.removeStorageSync('sudoku-stats');
            this.setData({
              statsOverview: [],
              showStatsModal: false
            });
            wx.showToast({
              title: '统计已重置',
              icon: 'success'
            });
          } catch (e) {
            wx.showToast({
              title: '重置失败',
              icon: 'error'
            });
          }
        }
      }
    });
  },

  // 显示思考链
  showThinkingChain: function() {
    const steps = this.generateThinkingSteps();
    this.setData({
      thinkingSteps: steps,
      showThinkingPanel: true
    });
  },

  // 关闭思考链
  closeThinkingChain: function() {
    this.setData({ showThinkingPanel: false });
  },

  // 生成思考步骤
  generateThinkingSteps: function() {
    const steps = [];

    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (this.board[row][col] === 0) {
          const candidates = this.getCandidates(row, col);
          if (candidates.length === 1) {
            steps.push({
              title: `单元格 (${row + 1}, ${col + 1}) - 唯一候选数`,
              description: `这个单元格只能填入数字 ${candidates[0]}，因为其他数字在同行、同列或同宫中已被使用。`
            });
          }
        }
      }
    }

    if (steps.length === 0) {
      steps.push({
        title: '分析中...',
        description: '当前没有明显的唯一候选数。尝试使用更高级的推理技术，如排除法或区块排除法。'
      });
    }

    return steps.slice(0, 5);
  },

  // 难度选择器变化
  onDifficultyChange: function(e) {
    const difficultyMap = ['easy', 'medium', 'hard', 'expert'];
    const difficulty = difficultyMap[e.detail.value];
    this.setData({
      difficultyIndex: e.detail.value,
      difficulty: difficulty
    });
  },

  // 模式选择器变化
  onModeChange: function(e) {
    const modeMap = ['classic', 'timed', 'zen'];
    const mode = modeMap[e.detail.value];
    this.setData({
      modeIndex: e.detail.value,
      mode: mode
    });

    if (mode === 'timed' && !this.data.timerInterval) {
      this.startTimer();
    } else if (mode !== 'timed' && this.data.timerInterval) {
      this.stopTimer();
    }
  },

  // 打开设置
  openSettings: function() {
    this.setData({ showSettingsModal: true });
  },

  // 关闭设置
  closeSettings: function() {
    this.setData({ showSettingsModal: false });
  },

  // 音效设置变化
  onSoundChange: function(e) {
    this.settings.soundEnabled = e.detail.value;
    this.saveSettings();
  },

  // 动画设置变化
  onAnimationChange: function(e) {
    this.settings.animationsEnabled = e.detail.value;
    this.saveSettings();
  },

  // 高亮设置变化
  onHighlightChange: function(e) {
    this.settings.highlightSameNumbers = e.detail.value;
    this.saveSettings();
  },

  // 手动初始化
  manualInit: function() {
    console.log('手动初始化游戏');
    wx.showLoading({
      title: '初始化中...'
    });

    try {
      this.resetGame();
      this.generatePuzzle();
      this.updateCellsFromBoard();

      wx.hideLoading();
      wx.showToast({
        title: '初始化完成',
        icon: 'success'
      });

      console.log('手动初始化完成');
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: '初始化失败',
        icon: 'error'
      });
      console.error('手动初始化失败:', error);
    }
  },

  // 测试功能
  testFunction: function() {
    console.log('=== 调试信息 ===');
    console.log('当前难度:', this.data.difficulty);
    console.log('当前模式:', this.data.mode);
    console.log('游戏状态:', this.data.isGameComplete);
    console.log('网格状态:', this.data.cells.length);
    console.log('历史记录长度:', this.history.length);
    console.log('当前棋盘状态:');
    console.table(this.board);

    wx.showModal({
      title: '调试信息',
      content: `难度: ${this.data.difficulty}\n模式: ${this.data.mode}\n单元格数量: ${this.data.cells.length}`,
      showCancel: false
    });
  },

  // 清除缓存
  clearStorage: function() {
    try {
      wx.removeStorageSync('sudoku-stats');
      wx.removeStorageSync('sudoku-settings');
      wx.showToast({
        title: '缓存已清除',
        icon: 'success'
      });
    } catch (e) {
      console.error('清除缓存失败:', e);
      wx.showToast({
        title: '清除失败',
        icon: 'error'
      });
    }
  }
})
