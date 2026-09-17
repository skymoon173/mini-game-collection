// Game State
class SudokuGame {
    constructor() {
        this.board = Array(9).fill().map(() => Array(9).fill(0));
        this.solution = Array(9).fill().map(() => Array(9).fill(0));
        this.initialBoard = Array(9).fill().map(() => Array(9).fill(0));
        this.notes = Array(9).fill().map(() => Array(9).fill().map(() => new Set()));
        this.history = [];
        this.redoStack = [];

        this.difficulty = 'medium';
        this.mode = 'classic';
        this.notesMode = false;
        this.timer = 0;
        this.timerInterval = null;
        this.hintsUsed = 0;
        this.errors = 0;
        this.isGameComplete = false;

        this.settings = {
            soundEnabled: true,
            animationsEnabled: true,
            highlightSameNumbers: true
        };

        this.initialize();
    }

    initialize() {
        this.createGrid();
        this.loadSettings();
        this.bindEvents();
        this.startNewGame();
    }

    createGrid() {
        const grid = document.getElementById('sudoku-grid');
        grid.innerHTML = '';

        for (let i = 0; i < 81; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.index = i;
            cell.dataset.row = Math.floor(i / 9);
            cell.dataset.col = i % 9;

            const input = document.createElement('input');
            input.type = 'text';
            input.maxLength = 1;
            input.pattern = '[1-9]';

            const notesDiv = document.createElement('div');
            notesDiv.className = 'notes';

            for (let j = 0; j < 9; j++) {
                const noteSpan = document.createElement('span');
                notesDiv.appendChild(noteSpan);
            }

            cell.appendChild(input);
            cell.appendChild(notesDiv);
            grid.appendChild(cell);
        }
    }

    bindEvents() {
        // Difficulty buttons
        document.querySelectorAll('.btn-difficulty').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setDifficulty(btn.dataset.difficulty);
            });
        });

        // Mode buttons
        document.querySelectorAll('.btn-mode').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setMode(btn.dataset.mode);
            });
        });

        // Action buttons
        document.getElementById('btn-new-game').addEventListener('click', () => this.startNewGame());
        document.getElementById('btn-validate').addEventListener('click', () => this.validateBoard());
        document.getElementById('btn-solve').addEventListener('click', () => this.solveCompletely());
        document.getElementById('btn-show-steps').addEventListener('click', () => this.showThinkingChain());

        // Tool buttons
        document.getElementById('btn-notes').addEventListener('click', () => this.toggleNotesMode());
        document.getElementById('btn-hint').addEventListener('click', () => this.getHint());
        document.getElementById('btn-undo').addEventListener('click', () => this.undo());
        document.getElementById('btn-redo').addEventListener('click', () => this.redo());
        document.getElementById('btn-clear').addEventListener('click', () => this.clearCell());
        document.getElementById('btn-auto-fill').addEventListener('click', () => this.autoFillCandidates());

        // Settings and Stats
        document.getElementById('open-settings').addEventListener('click', () => this.openSettings());
        document.getElementById('close-settings').addEventListener('click', () => this.closeSettings());
        document.getElementById('show-stats').addEventListener('click', () => this.showStats());
        document.getElementById('close-stats').addEventListener('click', () => this.closeStats());
        document.getElementById('reset-stats').addEventListener('click', () => this.resetStats());
        document.getElementById('close-thinking').addEventListener('click', () => this.closeThinkingChain());

        // Success modal
        document.getElementById('play-again').addEventListener('click', () => {
            this.closeSuccessModal();
            this.startNewGame();
        });

        // Cell events
        document.addEventListener('click', (e) => {
            if (e.target.closest('.cell')) {
                this.selectCell(e.target.closest('.cell'));
            } else if (!e.target.closest('.modal-content')) {
                this.deselectAllCells();
            }
        });

        document.addEventListener('input', (e) => {
            if (e.target.closest('.cell input')) {
                this.handleCellInput(e.target.closest('.cell'), e.target.value);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key >= '1' && e.key <= '9') {
                this.handleNumberInput(e.key);
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                this.clearSelectedCell();
            }
        });

        // Settings checkboxes
        document.getElementById('sound-enabled').addEventListener('change', (e) => {
            this.settings.soundEnabled = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('animations-enabled').addEventListener('change', (e) => {
            this.settings.animationsEnabled = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('highlight-same-numbers').addEventListener('change', (e) => {
            this.settings.highlightSameNumbers = e.target.checked;
            this.saveSettings();
        });
    }

    setDifficulty(difficulty) {
        this.difficulty = difficulty;
        document.querySelectorAll('.btn-difficulty').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.difficulty === difficulty);
        });
    }

    setMode(mode) {
        this.mode = mode;
        document.querySelectorAll('.btn-mode').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        if (mode === 'timed' && !this.timerInterval) {
            this.startTimer();
        } else if (mode !== 'timed' && this.timerInterval) {
            this.stopTimer();
        }
    }

    toggleNotesMode() {
        this.notesMode = !this.notesMode;
        document.getElementById('btn-notes').classList.toggle('active', this.notesMode);
    }

    selectCell(cell) {
        document.querySelectorAll('.cell').forEach(c => c.classList.remove('selected'));
        cell.classList.add('selected');

        // Focus the input element
        const input = cell.querySelector('input');
        if (input && !cell.classList.contains('readonly')) {
            input.focus();
        }

        this.updateHighlights();
    }

    deselectAllCells() {
        document.querySelectorAll('.cell').forEach(c => c.classList.remove('selected'));
        this.updateHighlights();
    }

    updateHighlights() {
        if (!this.settings.highlightSameNumbers) return;

        const selectedCell = document.querySelector('.cell.selected');
        if (!selectedCell) {
            document.querySelectorAll('.cell').forEach(c => c.classList.remove('same-number'));
            return;
        }

        const selectedValue = selectedCell.querySelector('input').value;
        if (!selectedValue) {
            document.querySelectorAll('.cell').forEach(c => c.classList.remove('same-number'));
            return;
        }

        document.querySelectorAll('.cell').forEach(cell => {
            const input = cell.querySelector('input');
            if (cell !== selectedCell && input.value === selectedValue) {
                cell.classList.add('same-number');
            } else {
                cell.classList.remove('same-number');
            }
        });
    }

    handleCellInput(cell, value) {
        if (this.isGameComplete) return;

        const index = parseInt(cell.dataset.index);
        const row = Math.floor(index / 9);
        const col = index % 9;
        const input = cell.querySelector('input');

        if (this.notesMode && value) {
            // Add note
            if (!this.notes[row][col].has(parseInt(value))) {
                this.notes[row][col].add(parseInt(value));
            }
            this.updateCellDisplay(cell);
            input.value = '';
            input.focus();
        } else {
            // Set value
            this.saveToHistory();
            this.board[row][col] = value ? parseInt(value) : 0;
            this.notes[row][col].clear();
            this.updateCellDisplay(cell);

            if (value && !this.isValidMove(row, col, parseInt(value))) {
                this.showError(cell);
                this.errors++;
                this.updateStats();
            } else {
                this.checkCompletion();
            }
        }

        this.updateHighlights();
    }

    handleNumberInput(number) {
        const selectedCell = document.querySelector('.cell.selected');
        if (selectedCell && !selectedCell.classList.contains('readonly')) {
            this.handleCellInput(selectedCell, number);
        }
    }

    clearSelectedCell() {
        const selectedCell = document.querySelector('.cell.selected');
        if (selectedCell && !selectedCell.classList.contains('readonly')) {
            this.saveToHistory();
            const index = parseInt(selectedCell.dataset.index);
            const row = Math.floor(index / 9);
            const col = index % 9;
            this.board[row][col] = 0;
            this.notes[row][col].clear();
            this.updateCellDisplay(selectedCell);

            // Clear input value and focus it
            const input = selectedCell.querySelector('input');
            input.value = '';
            input.focus();

            this.updateHighlights();
        }
    }

    updateCellDisplay(cell) {
        const index = parseInt(cell.dataset.index);
        const row = Math.floor(index / 9);
        const col = index % 9;
        const input = cell.querySelector('input');
        const notesDiv = cell.querySelector('.notes');

        if (this.board[row][col] !== 0) {
            input.value = this.board[row][col].toString();
            input.style.display = 'block';
            notesDiv.style.display = 'none';
        } else {
            input.value = '';
            input.style.display = this.notes[row][col].size > 0 ? 'none' : 'block';
            notesDiv.style.display = this.notes[row][col].size > 0 ? 'grid' : 'none';

            // Update notes display
            const noteSpans = notesDiv.querySelectorAll('span');
            noteSpans.forEach((span, i) => {
                span.textContent = this.notes[row][col].has(i + 1) ? (i + 1).toString() : '';
            });
        }
    }

    showError(cell) {
        cell.classList.add('error');
        setTimeout(() => {
            cell.classList.remove('error');
        }, 1000);

        if (this.settings.soundEnabled) {
            this.playSound('error');
        }
    }

    saveToHistory() {
        this.history.push({
            board: this.board.map(row => [...row]),
            notes: this.notes.map(row => row.map(set => new Set(set)))
        });
        this.redoStack = [];
    }

    undo() {
        if (this.history.length > 0) {
            this.redoStack.push({
                board: this.board.map(row => [...row]),
                notes: this.notes.map(row => row.map(set => new Set(set)))
            });

            const state = this.history.pop();
            this.board = state.board;
            this.notes = state.notes;
            this.updateAllCells();
        }
    }

    redo() {
        if (this.redoStack.length > 0) {
            this.history.push({
                board: this.board.map(row => [...row]),
                notes: this.notes.map(row => row.map(set => new Set(set)))
            });

            const state = this.redoStack.pop();
            this.board = state.board;
            this.notes = state.notes;
            this.updateAllCells();
        }
    }

    updateAllCells() {
        document.querySelectorAll('.cell').forEach(cell => {
            this.updateCellDisplay(cell);
            this.updateCellReadonlyState(cell);
        });
        this.updateHighlights();
    }

    updateCellReadonlyStates() {
        document.querySelectorAll('.cell').forEach(cell => {
            this.updateCellReadonlyState(cell);
        });
    }

    updateCellReadonlyState(cell) {
        const index = parseInt(cell.dataset.index);
        const row = Math.floor(index / 9);
        const col = index % 9;

        if (this.initialBoard[row][col] !== 0) {
            cell.classList.add('readonly');
            cell.querySelector('input').readOnly = true;
        } else {
            cell.classList.remove('readonly');
            cell.querySelector('input').readOnly = false;
        }
    }

    clearCell() {
        this.clearSelectedCell();
    }

    autoFillCandidates() {
        const selectedCell = document.querySelector('.cell.selected');
        if (selectedCell && !selectedCell.classList.contains('readonly')) {
            const index = parseInt(selectedCell.dataset.index);
            const row = Math.floor(index / 9);
            const col = index % 9;

            if (this.board[row][col] === 0) {
                const candidates = this.getCandidates(row, col);
                this.notes[row][col] = new Set(candidates);
                this.updateCellDisplay(selectedCell);
            }
        }
    }

    getCandidates(row, col) {
        const candidates = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

        // Remove numbers from same row
        for (let c = 0; c < 9; c++) {
            if (this.board[row][c] !== 0) {
                candidates.delete(this.board[row][c]);
            }
        }

        // Remove numbers from same column
        for (let r = 0; r < 9; r++) {
            if (this.board[r][col] !== 0) {
                candidates.delete(this.board[r][col]);
            }
        }

        // Remove numbers from same 3x3 box
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
    }

    getHint() {
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
            this.notes[randomCell.row][randomCell.col].clear();

            const cellIndex = randomCell.row * 9 + randomCell.col;
            const cell = document.querySelector(`.cell[data-index="${cellIndex}"]`);
            this.updateCellDisplay(cell);
            cell.classList.add('highlight');

            setTimeout(() => {
                cell.classList.remove('highlight');
            }, 2000);

            this.hintsUsed++;
            this.updateStats();
            this.checkCompletion();

            if (this.settings.soundEnabled) {
                this.playSound('hint');
            }
        }
    }

    startNewGame() {
        this.resetGame();

        // Show loading animation
        this.showLoadingAnimation();

        // Generate puzzle with a small delay for animation
        setTimeout(() => {
            this.generatePuzzle();
            this.updateAllCells();
            this.updateStats();
            this.hideLoadingAnimation();

            if (this.mode === 'timed') {
                this.startTimer();
            }

            // Animate cells appearing
            this.animateCells();
        }, 500);
    }

    showLoadingAnimation() {
        const grid = document.getElementById('sudoku-grid');
        grid.style.opacity = '0.3';

        // Add loading overlay
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-spinner">
                <i class="fas fa-spinner fa-spin"></i>
                <span>生成数独中...</span>
            </div>
        `;
        grid.parentElement.appendChild(overlay);
    }

    hideLoadingAnimation() {
        const grid = document.getElementById('sudoku-grid');
        grid.style.opacity = '1';

        const overlay = document.querySelector('.loading-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    animateCells() {
        if (!this.settings.animationsEnabled) return;

        const cells = document.querySelectorAll('.cell');
        cells.forEach((cell, index) => {
            cell.style.opacity = '0';
            cell.style.transform = 'scale(0.8)';

            setTimeout(() => {
                cell.style.transition = 'all 0.3s ease-out';
                cell.style.opacity = '1';
                cell.style.transform = 'scale(1)';
            }, index * 10); // Stagger the animations
        });
    }

    resetGame() {
        this.board = Array(9).fill().map(() => Array(9).fill(0));
        this.solution = Array(9).fill().map(() => Array(9).fill(0));
        this.initialBoard = Array(9).fill().map(() => Array(9).fill(0));
        this.notes = Array(9).fill().map(() => Array(9).fill().map(() => new Set()));
        this.history = [];
        this.redoStack = [];
        this.hintsUsed = 0;
        this.errors = 0;
        this.isGameComplete = false;
        this.stopTimer();
        this.timer = 0;
    }

    generatePuzzle() {
        // Generate a complete valid Sudoku
        this.fillBoard(this.solution);

        // Copy solution to board
        this.board = this.solution.map(row => [...row]);

        // Remove numbers based on difficulty
        const holesToMake = this.getHolesForDifficulty();
        this.removeNumbers(holesToMake);

        // Set initial board
        this.initialBoard = this.board.map(row => [...row]);

        // Mark readonly cells
        this.updateCellReadonlyStates();
    }

    getHolesForDifficulty() {
        switch (this.difficulty) {
            case 'easy': return 35;
            case 'medium': return 45;
            case 'hard': return 55;
            case 'expert': return 65;
            default: return 45;
        }
    }

    fillBoard(board) {
        const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
                if (board[row][col] === 0) {
                    // Shuffle numbers for randomness
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
}

    removeNumbers(holesToMake) {
        const positions = Array.from({ length: 81 }, (_, i) => i);
        const shuffled = positions.sort(() => Math.random() - 0.5);

        let holesMade = 0;
        for (const pos of shuffled) {
            if (holesMade >= holesToMake) break;

            const row = Math.floor(pos / 9);
            const col = pos % 9;

            const temp = this.board[row][col];
            this.board[row][col] = 0;

            // Check if the puzzle still has a unique solution
            if (this.hasUniqueSolution()) {
                holesMade++;
            } else {
                this.board[row][col] = temp;
            }
        }
    }

    hasUniqueSolution() {
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
    }

    isValid(board, row, col, num) {
        // Check row
        for (let c = 0; c < 9; c++) {
            if (board[row][c] === num) return false;
        }

        // Check column
        for (let r = 0; r < 9; r++) {
            if (board[r][col] === num) return false;
        }

        // Check 3x3 box
        const boxRow = Math.floor(row / 3) * 3;
        const boxCol = Math.floor(col / 3) * 3;
        for (let r = boxRow; r < boxRow + 3; r++) {
            for (let c = boxCol; c < boxCol + 3; c++) {
                if (board[r][c] === num) return false;
            }
        }

        return true;
    }

    isValidMove(row, col, num) {
        return this.isValid(this.board, row, col, num);
    }

    validateBoard() {
        let isValid = true;
        const errors = [];

        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                if (this.board[row][col] !== 0) {
                    const temp = this.board[row][col];
                    this.board[row][col] = 0;
                    if (!this.isValid(this.board, row, col, temp)) {
                        isValid = false;
                        errors.push({ row, col });
                    }
                    this.board[row][col] = temp;
                }
            }
        }

        if (isValid) {
            alert('数独 puzzle 验证通过！');
            if (this.settings.soundEnabled) {
                this.playSound('success');
            }
        } else {
            alert(`发现 ${errors.length} 个错误。`);
            // Highlight error cells
            errors.forEach(({ row, col }) => {
                const index = row * 9 + col;
                const cell = document.querySelector(`.cell[data-index="${index}"]`);
                this.showError(cell);
            });
        }
    }

    solveCompletely() {
        this.board = this.solution.map(row => [...row]);
        this.updateAllCells();
        this.checkCompletion();
    }

    checkCompletion() {
        if (this.isGameComplete) return;

        const isComplete = this.board.every(row => row.every(cell => cell !== 0));
        const isCorrect = this.board.every((row, r) =>
            row.every((cell, c) => cell === this.solution[r][c])
        );

        if (isComplete && isCorrect) {
            this.completeGame();
        }
    }

    completeGame() {
        this.isGameComplete = true;
        this.stopTimer();

        // Update stats
        this.saveGameStats();

        // Create celebration particles
        this.createCelebrationParticles();

        // Show success modal with delay
        setTimeout(() => {
            this.showSuccessModal();
        }, 1000);

        if (this.settings.soundEnabled) {
            this.playSound('complete');
        }
    }

    createCelebrationParticles() {
        if (!this.settings.animationsEnabled) return;

        const container = document.querySelector('.sudoku-container');
        const particleCount = 50;

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';

            // Random position
            particle.style.left = Math.random() * 100 + '%';
            particle.style.top = Math.random() * 100 + '%';

            // Random color
            const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24'];
            particle.style.background = colors[Math.floor(Math.random() * colors.length)];

            // Random delay
            particle.style.animationDelay = Math.random() * 0.5 + 's';

            container.appendChild(particle);

            // Remove particle after animation
            setTimeout(() => {
                particle.remove();
            }, 1000);
        }
    }

    startTimer() {
        if (this.timerInterval) return;

        this.timerInterval = setInterval(() => {
            this.timer++;
            this.updateTimerDisplay();
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    updateTimerDisplay() {
        const minutes = Math.floor(this.timer / 60);
        const seconds = this.timer % 60;
        document.getElementById('timer').textContent =
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    updateStats() {
        document.getElementById('hints-used').textContent = this.hintsUsed;
        document.getElementById('errors').textContent = this.errors;
    }

    showThinkingChain() {
        const panel = document.getElementById('thinking-panel');
        const stepsContainer = document.getElementById('thinking-steps');

        // Generate thinking steps
        const steps = this.generateThinkingSteps();
        stepsContainer.innerHTML = '';

        steps.forEach(step => {
            const stepDiv = document.createElement('div');
            stepDiv.className = 'thinking-step';
            stepDiv.innerHTML = `
                <div class="step-title">${step.title}</div>
                <div class="step-description">${step.description}</div>
            `;
            stepsContainer.appendChild(stepDiv);
        });

        panel.classList.add('open');
    }

    closeThinkingChain() {
        document.getElementById('thinking-panel').classList.remove('open');
    }

    generateThinkingSteps() {
        const steps = [];

        // Analyze current board state and suggest next moves
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

        return steps.slice(0, 5); // Limit to 5 steps
    }

    showSuccessModal() {
        const modal = document.getElementById('success-modal');
        const time = document.getElementById('timer').textContent;

        document.getElementById('completion-time').textContent = time;
        document.getElementById('completion-hints').textContent = this.hintsUsed;
        document.getElementById('completion-errors').textContent = this.errors;

        modal.classList.add('open');
    }

    closeSuccessModal() {
        document.getElementById('success-modal').classList.remove('open');
    }

    showStats() {
        const modal = document.getElementById('stats-modal');
        const overview = document.getElementById('stats-overview');
        const stats = this.getStats();

        overview.innerHTML = '';

        const difficulties = ['easy', 'medium', 'hard', 'expert'];
        const modes = ['classic', 'timed', 'zen'];

        difficulties.forEach(difficulty => {
            const difficultyStats = modes.map(mode => stats[`${difficulty}-${mode}`]).filter(Boolean);
            if (difficultyStats.length > 0) {
                const categoryDiv = document.createElement('div');
                categoryDiv.className = 'stats-category';

                const difficultyNames = {
                    easy: '简单',
                    medium: '中等',
                    hard: '困难',
                    expert: '专家'
                };

                categoryDiv.innerHTML = `
                    <h4><i class="fas fa-chart-line"></i> ${difficultyNames[difficulty]}难度</h4>
                    <div class="stats-grid">
                        ${modes.map(mode => {
                            const stat = stats[`${difficulty}-${mode}`];
                            if (!stat) return '';

                            const avgTime = stat.totalTime ? Math.round(stat.totalTime / stat.gamesPlayed / 60) : 0;
                            const avgHints = stat.totalHints ? Math.round(stat.totalHints / stat.gamesPlayed) : 0;
                            const bestTime = stat.bestTime < Infinity ? Math.floor(stat.bestTime / 60) + ':' + (stat.bestTime % 60).toString().padStart(2, '0') : '--:--';

                            return `
                                <div class="stat-card">
                                    <span class="stat-label">${mode === 'classic' ? '经典' : mode === 'timed' ? '计时' : '禅境'}</span>
                                    <span class="stat-value">${stat.gamesPlayed}</span>
                                    <small>场游戏</small>
                                </div>
                                <div class="stat-card">
                                    <span class="stat-label">最佳时间</span>
                                    <span class="stat-value">${bestTime}</span>
                                </div>
                                <div class="stat-card">
                                    <span class="stat-label">平均提示</span>
                                    <span class="stat-value">${avgHints}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;

                overview.appendChild(categoryDiv);
            }
        });

        if (overview.children.length === 0) {
            overview.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">暂无游戏统计数据</p>';
        }

        modal.classList.add('open');
    }

    closeStats() {
        document.getElementById('stats-modal').classList.remove('open');
    }

    resetStats() {
        if (confirm('确定要重置所有统计数据吗？此操作无法撤销。')) {
            localStorage.removeItem('sudoku-stats');
            this.closeStats();
            alert('统计数据已重置！');
        }
    }

    getStats() {
        return JSON.parse(localStorage.getItem('sudoku-stats') || '{}');
    }

    openSettings() {
        document.getElementById('settings-modal').classList.add('open');
    }

    closeSettings() {
        document.getElementById('settings-modal').classList.remove('open');
    }

    playSound(type) {
        if (!this.settings.soundEnabled) return;

        try {
            // Create audio context
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Create oscillator for different sound types
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            switch (type) {
                case 'hint':
                    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                    oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.2);
                    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
                    oscillator.start(audioContext.currentTime);
                    oscillator.stop(audioContext.currentTime + 0.2);
                    break;

                case 'error':
                    oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
                    oscillator.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.3);
                    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                    oscillator.start(audioContext.currentTime);
                    oscillator.stop(audioContext.currentTime + 0.3);
                    break;

                case 'success':
                    // Play a pleasant ascending melody
                    const frequencies = [523, 659, 784]; // C, E, G
                    frequencies.forEach((freq, index) => {
                        setTimeout(() => {
                            const osc = audioContext.createOscillator();
                            const gain = audioContext.createGain();
                            osc.connect(gain);
                            gain.connect(audioContext.destination);
                            osc.frequency.setValueAtTime(freq, audioContext.currentTime);
                            gain.gain.setValueAtTime(0.1, audioContext.currentTime);
                            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                            osc.start(audioContext.currentTime);
                            osc.stop(audioContext.currentTime + 0.3);
                        }, index * 150);
                    });
                    break;

                case 'complete':
                    // Play a celebratory sound
                    const completeOsc = audioContext.createOscillator();
                    const completeGain = audioContext.createGain();
                    completeOsc.connect(completeGain);
                    completeGain.connect(audioContext.destination);

                    // Create a more complex sound
                    completeOsc.frequency.setValueAtTime(523, audioContext.currentTime);
                    completeOsc.frequency.setValueAtTime(659, audioContext.currentTime + 0.1);
                    completeOsc.frequency.setValueAtTime(784, audioContext.currentTime + 0.2);
                    completeOsc.frequency.setValueAtTime(1047, audioContext.currentTime + 0.3);

                    completeGain.gain.setValueAtTime(0.15, audioContext.currentTime);
                    completeGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

                    completeOsc.start(audioContext.currentTime);
                    completeOsc.stop(audioContext.currentTime + 0.5);
                    break;
            }
        } catch (error) {
            console.log('Web Audio API not supported or sound disabled');
        }
    }

    saveSettings() {
        localStorage.setItem('sudoku-settings', JSON.stringify(this.settings));
    }

    loadSettings() {
        const saved = localStorage.getItem('sudoku-settings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
            document.getElementById('sound-enabled').checked = this.settings.soundEnabled;
            document.getElementById('animations-enabled').checked = this.settings.animationsEnabled;
            document.getElementById('highlight-same-numbers').checked = this.settings.highlightSameNumbers;
        }
    }

    saveGameStats() {
        const stats = JSON.parse(localStorage.getItem('sudoku-stats') || '{}');
        const key = `${this.difficulty}-${this.mode}`;

        if (!stats[key]) {
            stats[key] = { gamesPlayed: 0, bestTime: Infinity, totalTime: 0, totalHints: 0, totalErrors: 0 };
        }

        stats[key].gamesPlayed++;
        stats[key].bestTime = Math.min(stats[key].bestTime, this.timer);
        stats[key].totalTime += this.timer;
        stats[key].totalHints += this.hintsUsed;
        stats[key].totalErrors += this.errors;

        localStorage.setItem('sudoku-stats', JSON.stringify(stats));
    }
}

// Initialize the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SudokuGame();
});
