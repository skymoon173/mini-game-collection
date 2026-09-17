class Sudoku {
    constructor() {
        this.board = Array(9).fill().map(() => Array(9).fill(0));
        this.solution = null;
        this.selectedCell = null;
        this.initializeBoard();
        this.setupEventListeners();
        this.createHintOverlay();
    }

    initializeBoard() {
        const boardElement = document.getElementById('board');
        boardElement.innerHTML = '';
        
        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = i;
                cell.dataset.col = j;
                
                // 添加数字显示的 span
                const numberSpan = document.createElement('span');
                numberSpan.className = 'number';
                cell.appendChild(numberSpan);
                
                // 添加提示数字的容器
                const hints = document.createElement('div');
                hints.className = 'hints';
                cell.appendChild(hints);
                
                boardElement.appendChild(cell);
            }
        }
        
        this.generateNewGame();
    }

    setupEventListeners() {
        document.getElementById('board').addEventListener('click', (e) => {
            const cell = e.target.closest('.cell');
            if (!cell || cell.classList.contains('fixed')) return;
            
            this.selectCell(cell);
        });

        document.querySelectorAll('.num-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!this.selectedCell) return;
                
                if (btn.classList.contains('delete')) {
                    this.setNumber('');
                } else {
                    this.setNumber(btn.dataset.num);
                }
            });
        });

        document.getElementById('new-game').addEventListener('click', () => {
            this.generateNewGame();
        });

        document.getElementById('check').addEventListener('click', () => {
            this.checkSolution();
        });

        document.getElementById('solve').addEventListener('click', () => {
            this.showSolution();
        });

        // 点击提示按钮后仅提示下一步（全盘扫描后提示候选最少的空格及原理讲解）
        document.getElementById('hint').addEventListener('click', () => {
            this.showNextStepHint();
        });
    }

    selectCell(cell) {
        // 移除之前的选择
        document.querySelectorAll('.cell').forEach(c => {
            c.classList.remove('selected', 'highlight');
        });

        // 设置新的选择
        cell.classList.add('selected');
        this.selectedCell = cell;

        // 高亮相同行列和九宫格
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        this.highlightRelatedCells(row, col);
    }

    highlightRelatedCells(row, col) {
        const cells = document.querySelectorAll('.cell');
        const boxStartRow = Math.floor(row / 3) * 3;
        const boxStartCol = Math.floor(col / 3) * 3;

        cells.forEach(cell => {
            const cellRow = parseInt(cell.dataset.row);
            const cellCol = parseInt(cell.dataset.col);

            if (cellRow === row || cellCol === col || 
                (cellRow >= boxStartRow && cellRow < boxStartRow + 3 &&
                 cellCol >= boxStartCol && cellCol < boxStartCol + 3)) {
                cell.classList.add('highlight');
            }
        });
    }

    showHints(row, col) {
        if (this.board[row][col] !== 0) return;

        const possibleNumbers = this.getPossibleNumbers(row, col);
        const hintsElement = this.selectedCell.querySelector('.hints');
        if (!hintsElement) return;

        // 清空之前的提示
        hintsElement.innerHTML = '';
        
        // 如果有多个可能的数字，只显示最优选择
        if (possibleNumbers.length > 0) {
            const bestNumber = this.findBestMove(row, col, possibleNumbers);
            if (bestNumber) {
                const hint = document.createElement('div');
                hint.className = 'hint-content';
                hint.innerHTML = `
                    <div class="hint-number">${bestNumber}</div>
                    <div class="hint-reason">${this.getHintReason(row, col, bestNumber)}</div>
                `;
                hintsElement.appendChild(hint);
            }
        }
    }

    findBestMove(row, col, possibleNumbers) {
        // 找出最优的下一步
        // 1. 如果某个数字是该行/列/宫中唯一可能的位置
        // 2. 如果某个位置只有一个可能的数字
        // 3. 否则返回第一个可能的数字
        
        for (const num of possibleNumbers) {
            if (this.isUniqueInRegion(row, col, num)) {
                return num;
            }
        }
        
        return possibleNumbers[0];
    }

    isUniqueInRegion(row, col, num) {
        // 检查行
        let rowCount = 0;
        let rowPos = null;
        for (let j = 0; j < 9; j++) {
            if (this.board[row][j] === 0 && this.isValidMove(row, j, num)) {
                rowCount++;
                rowPos = j;
            }
        }
        if (rowCount === 1 && rowPos === col) return true;

        // 检查列
        let colCount = 0;
        let colPos = null;
        for (let i = 0; i < 9; i++) {
            if (this.board[i][col] === 0 && this.isValidMove(i, col, num)) {
                colCount++;
                colPos = i;
            }
        }
        if (colCount === 1 && colPos === row) return true;

        // 检查九宫格
        const boxRow = Math.floor(row / 3) * 3;
        const boxCol = Math.floor(col / 3) * 3;
        let boxCount = 0;
        let boxPos = null;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (this.board[boxRow + i][boxCol + j] === 0 && 
                    this.isValidMove(boxRow + i, boxCol + j, num)) {
                    boxCount++;
                    boxPos = [boxRow + i, boxCol + j];
                }
            }
        }
        if (boxCount === 1 && boxPos[0] === row && boxPos[1] === col) return true;

        return false;
    }

    getHintReason(row, col, num) {
        const reasons = [];
        
        // 检查行
        const rowNums = new Set();
        for (let j = 0; j < 9; j++) {
            if (this.board[row][j] !== 0) rowNums.add(this.board[row][j]);
        }
        if (rowNums.size === 8) reasons.push(`第${row + 1}行只缺${num}`);

        // 检查列
        const colNums = new Set();
        for (let i = 0; i < 9; i++) {
            if (this.board[i][col] !== 0) colNums.add(this.board[i][col]);
        }
        if (colNums.size === 8) reasons.push(`第${col + 1}列只缺${num}`);

        // 检查九宫格
        const boxRow = Math.floor(row / 3) * 3;
        const boxCol = Math.floor(col / 3) * 3;
        const boxNums = new Set();
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (this.board[boxRow + i][boxCol + j] !== 0) {
                    boxNums.add(this.board[boxRow + i][boxCol + j]);
                }
            }
        }
        if (boxNums.size === 8) reasons.push(`该九宫格只缺${num}`);

        // 如果是唯一可能的数字
        if (this.getPossibleNumbers(row, col).length === 1) {
            reasons.push(`这个位置只能填${num}`);
        }

        return reasons.join('<br>') || `可以填入${num}`;
    }

    getPossibleNumbers(row, col) {
        const numbers = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        
        // 检查行
        for (let i = 0; i < 9; i++) {
            numbers.delete(this.board[row][i]);
        }
        
        // 检查列
        for (let i = 0; i < 9; i++) {
            numbers.delete(this.board[i][col]);
        }
        
        // 检查九宫格
        const boxRow = Math.floor(row / 3) * 3;
        const boxCol = Math.floor(col / 3) * 3;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                numbers.delete(this.board[boxRow + i][boxCol + j]);
            }
        }
        
        return Array.from(numbers);
    }

    setNumber(num) {
        const row = parseInt(this.selectedCell.dataset.row);
        const col = parseInt(this.selectedCell.dataset.col);
        
        this.board[row][col] = num === '' ? 0 : parseInt(num);
        const numberSpan = this.selectedCell.querySelector('.number');
        if (numberSpan) {
            numberSpan.textContent = num;
        }
        const hints = this.selectedCell.querySelector('.hints');
        if (hints) {
            hints.textContent = '';  // 清除提示
        }
        this.selectedCell.classList.toggle('error', !this.isValidMove(row, col, parseInt(num)));

        // 更新相关单元格的提示
        this.updateRelatedHints(row, col);
    }

    updateRelatedHints(row, col) {
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            const cellRow = parseInt(cell.dataset.row);
            const cellCol = parseInt(cell.dataset.col);
            
            if (this.board[cellRow][cellCol] === 0 &&
                (cellRow === row || cellCol === col ||
                 (Math.floor(cellRow / 3) === Math.floor(row / 3) &&
                  Math.floor(cellCol / 3) === Math.floor(col / 3)))) {
                const hints = this.getPossibleNumbers(cellRow, cellCol);
                const hintsElement = cell.querySelector('.hints');
                if (hintsElement) {
                    hintsElement.textContent = hints.join(' ');
                }
            }
        });
    }

    isValidMove(row, col, num) {
        // 检查行
        for (let i = 0; i < 9; i++) {
            if (i !== col && this.board[row][i] === num) return false;
        }
        
        // 检查列
        for (let i = 0; i < 9; i++) {
            if (i !== row && this.board[i][col] === num) return false;
        }
        
        // 检查九宫格
        const boxRow = Math.floor(row / 3) * 3;
        const boxCol = Math.floor(col / 3) * 3;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (boxRow + i !== row && boxCol + j !== col &&
                    this.board[boxRow + i][boxCol + j] === num) return false;
            }
        }
        
        return true;
    }

    generateNewGame() {
        // 这里使用一个简单的数独谜题作为示例
        const puzzle = [
            [5,3,0,0,7,0,0,0,0],
            [6,0,0,1,9,5,0,0,0],
            [0,9,8,0,0,0,0,6,0],
            [8,0,0,0,6,0,0,0,3],
            [4,0,0,8,0,3,0,0,1],
            [7,0,0,0,2,0,0,0,6],
            [0,6,0,0,0,0,2,8,0],
            [0,0,0,4,1,9,0,0,5],
            [0,0,0,0,8,0,0,7,9]
        ];

        this.board = JSON.parse(JSON.stringify(puzzle));
        this.solution = this.solveSudoku(JSON.parse(JSON.stringify(puzzle)));
        
        // 更新界面
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            const value = puzzle[row][col];
            
            const numberSpan = cell.querySelector('.number');
            if (numberSpan) {
                numberSpan.textContent = value || '';
            }
            const hints = cell.querySelector('.hints');
            if (hints) {
                hints.textContent = '';
            }
            cell.classList.toggle('fixed', value !== 0);
        });
    }

    solveSudoku(board) {
        const find_empty = () => {
            for (let i = 0; i < 9; i++) {
                for (let j = 0; j < 9; j++) {
                    if (board[i][j] === 0) return [i, j];
                }
            }
            return null;
        };

        const valid = (num, pos) => {
            const [row, col] = pos;
            
            // 检查行
            for (let j = 0; j < 9; j++) {
                if (j !== col && board[row][j] === num) return false;
            }
            
            // 检查列
            for (let i = 0; i < 9; i++) {
                if (i !== row && board[i][col] === num) return false;
            }
            
            // 检查九宫格
            const box_row = Math.floor(row / 3) * 3;
            const box_col = Math.floor(col / 3) * 3;
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    if (box_row + i !== row && box_col + j !== col &&
                        board[box_row + i][box_col + j] === num) return false;
                }
            }
            
            return true;
        };

        const solve = () => {
            const empty = find_empty();
            if (!empty) return true;
            
            const [row, col] = empty;
            for (let num = 1; num <= 9; num++) {
                if (valid(num, [row, col])) {
                    board[row][col] = num;
                    if (solve()) return true;
                    board[row][col] = 0;
                }
            }
            return false;
        };

        solve();
        return board;
    }

    checkSolution() {
        const cells = document.querySelectorAll('.cell');
        let isComplete = true;
        
        cells.forEach(cell => {
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            const value = this.board[row][col];
            
            if (value === 0) {
                isComplete = false;
            } else {
                const isValid = this.isValidMove(row, col, value);
                cell.classList.toggle('error', !isValid);
            }
        });
        
        if (isComplete) {
            alert('恭喜！你已完成数独！');
        } else {
            alert('还没有完成数独，请继续努力！');
        }
    }

    showSolution() {
        if (!this.solution) return;
        
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            if (!cell.classList.contains('fixed')) {
                const numberSpan = cell.querySelector('.number');
                if (numberSpan) {
                    numberSpan.textContent = this.solution[row][col];
                }
                this.board[row][col] = this.solution[row][col];
            }
        });
    }

    createHintOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'hint-overlay';
        
        const dialog = document.createElement('div');
        dialog.className = 'hint-dialog';
        
        const close = document.createElement('div');
        close.className = 'hint-close';
        close.textContent = '×';
        close.onclick = () => overlay.style.display = 'none';
        
        dialog.appendChild(close);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        this.hintOverlay = overlay;
    }

    showHintDialog() {
        const row = parseInt(this.selectedCell.dataset.row);
        const col = parseInt(this.selectedCell.dataset.col);
        
        if (this.board[row][col] !== 0) {
            alert('这个位置已经填写了数字');
            return;
        }

        const dialog = this.hintOverlay.querySelector('.hint-dialog');
        dialog.innerHTML = '';
        
        // 添加关闭按钮
        const close = document.createElement('div');
        close.className = 'hint-close';
        close.textContent = '×';
        close.onclick = () => this.hintOverlay.style.display = 'none';
        dialog.appendChild(close);

        // 找出最佳提示
        const hint = this.findBestHint(row, col);
        if (!hint) {
            alert('没有找到合适的提示');
            return;
        }

        // 添加标题
        const title = document.createElement('div');
        title.className = 'hint-title';
        title.textContent = hint.title;
        dialog.appendChild(title);

        // 添加解释
        const explanation = document.createElement('div');
        explanation.className = 'hint-explanation';
        explanation.textContent = hint.explanation;
        dialog.appendChild(explanation);

        // 添加可视化演示
        const visual = this.createHintVisual(hint);
        dialog.appendChild(visual);

        // 显示提示
        this.hintOverlay.style.display = 'flex';
    }

    findBestHint(row, col) {
        const possibleNumbers = this.getPossibleNumbers(row, col);
        if (possibleNumbers.length === 0) return null;

        // 检查是否是唯一可能的数字
        if (possibleNumbers.length === 1) {
            return {
                type: 'single',
                number: possibleNumbers[0],
                title: '唯一可能的数字',
                explanation: `在这个位置只能填入 ${possibleNumbers[0]}，因为其他数字都与已有数字冲突。`,
                highlightCells: this.getConflictCells(row, col)
            };
        }

        // 检查行中唯一位置
        for (const num of possibleNumbers) {
            let count = 0;
            let lastCol = -1;
            for (let j = 0; j < 9; j++) {
                if (this.board[row][j] === 0 && this.isValidMove(row, j, num)) {
                    count++;
                    lastCol = j;
                }
            }
            if (count === 1 && lastCol === col) {
                return {
                    type: 'row',
                    number: num,
                    title: '行中唯一位置',
                    explanation: `数字 ${num} 在第 ${row + 1} 行只能放在这个位置，因为其他位置都不满足条件。`,
                    highlightCells: this.getRowCells(row, num)
                };
            }
        }

        // 检查列中唯一位置
        // ... 类似的逻辑 ...

        // 检查九宫格中唯一位置
        // ... 类似的逻辑 ...

        // 如果没有特殊情况，返回基本提示
        return {
            type: 'basic',
            number: possibleNumbers[0],
            title: '基本排除法',
            explanation: `这个位置可以填入 ${possibleNumbers.join(', ')}，建议从中选择一个尝试。`,
            highlightCells: this.getBasicHintCells(row, col)
        };
    }

    createHintVisual(hint) {
        const visual = document.createElement('div');
        visual.className = 'hint-visual';
        
        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                const cell = document.createElement('div');
                cell.className = 'hint-cell';
                
                // 设置数字
                cell.textContent = this.board[i][j] || '';
                
                // 设置高亮
                if (hint.highlightCells.some(([r, c]) => r === i && c === j)) {
                    cell.classList.add('highlight');
                }
                
                // 设置焦点单元格
                if (i === parseInt(this.selectedCell.dataset.row) && 
                    j === parseInt(this.selectedCell.dataset.col)) {
                    cell.classList.add('focus');
                }
                
                visual.appendChild(cell);
            }
        }
        
        return visual;
    }

    // 辅助方法
    getConflictCells(row, col) {
        const cells = [];
        // 获取行中的已填数字
        for (let j = 0; j < 9; j++) {
            if (this.board[row][j] !== 0) {
                cells.push([row, j]);
            }
        }
        // 获取列中的已填数字
        for (let i = 0; i < 9; i++) {
            if (this.board[i][col] !== 0) {
                cells.push([i, col]);
            }
        }
        // 获取九宫格中的已填数字
        const boxRow = Math.floor(row / 3) * 3;
        const boxCol = Math.floor(col / 3) * 3;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (this.board[boxRow + i][boxCol + j] !== 0) {
                    cells.push([boxRow + i, boxCol + j]);
                }
            }
        }
        return cells;
    }

    getRowCells(row, num) {
        const cells = [];
        for (let j = 0; j < 9; j++) {
            if (this.board[row][j] !== 0) {
                cells.push([row, j]);
            }
        }
        return cells;
    }

    getBasicHintCells(row, col) {
        return this.getConflictCells(row, col);
    }

    showFullHintExplanation() {
        if (!this.solution) {
            alert('当前棋盘没有计算出解答');
            return;
        }
        const dialog = this.hintOverlay.querySelector('.hint-dialog');
        dialog.innerHTML = '';

        // 添加关闭按钮
        const close = document.createElement('div');
        close.className = 'hint-close';
        close.textContent = '×';
        close.onclick = () => this.hintOverlay.style.display = 'none';
        dialog.appendChild(close);

        // 添加标题
        const title = document.createElement('div');
        title.className = 'hint-title';
        title.textContent = '全盘讲解与答案';
        dialog.appendChild(title);

        // 添加详细解释
        const explanation = document.createElement('div');
        explanation.className = 'hint-explanation';
        explanation.innerHTML = `本系统采用回溯算法求解数独，核心思路是：
        <br>1. 对每个空格计算候选数字（依据行、列、九宫格限制）。
        <br>2. 选择候选数字尝试填入，并递归求解剩余部分。
        <br>3. 如果发现冲突则回溯，尝试其它候选数字，直至找到完整解答。
        <br>下面是该数独题目的完整解答：`;
        dialog.appendChild(explanation);

        // 添加全盘答案的可视化图
        const visual = this.createFullSolutionVisual();
        dialog.appendChild(visual);

        // 显示提示覆盖层
        this.hintOverlay.style.display = 'flex';
    }

    createFullSolutionVisual() {
        const visual = document.createElement('div');
        visual.className = 'hint-visual';
        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                const cell = document.createElement('div');
                cell.className = 'hint-cell';
                cell.textContent = this.solution[i][j] || '';
                visual.appendChild(cell);
            }
        }
        return visual;
    }

    showNextStepHint() {
        if (!this.selectedCell) {
            alert("请先选中一个空格以获取提示");
            return;
        }
        
        const row = parseInt(this.selectedCell.dataset.row);
        const col = parseInt(this.selectedCell.dataset.col);

        if (this.board[row][col] !== 0) {
            alert("所选单元格已填写数字，请选择一个空格");
            return;
        }

        const candidates = this.getPossibleNumbers(row, col);
        if (!candidates || candidates.length === 0) {
            alert("该单元格无可行候选项！");
            return;
        }

        let hintTechnique = "";
        let explanationText = "";
        if (candidates.length === 1) {
            hintTechnique = "唯一候选";
            explanationText = `在第${row + 1}行第${col + 1}列，该空格仅有一个候选数字 ${candidates[0]}，应直接填写。`;
        } else {
            hintTechnique = "交替推导链";
            explanationText = `在第${row + 1}行第${col + 1}列，该空格的候选数字有 ${candidates.join(', ')}。通过交替推导链等推理技术（如 XYE、强链弱链等），可以逐步排除错误选项，从而确定正确数字。`;
        }

        const dialog = this.hintOverlay.querySelector('.hint-dialog');
        // 清空对话框内容
        dialog.innerHTML = '';

        // 添加关闭按钮
        const close = document.createElement('div');
        close.className = 'hint-close';
        close.textContent = '×';
        close.onclick = () => { this.hintOverlay.style.display = 'none'; };
        dialog.appendChild(close);

        // 添加标题显示所采用的技术
        const title = document.createElement('div');
        title.className = 'hint-title';
        title.textContent = `提示 - ${hintTechnique}`;
        dialog.appendChild(title);

        // 添加详细解释
        const explanation = document.createElement('div');
        explanation.className = 'hint-explanation';
        explanation.innerHTML = explanationText;
        dialog.appendChild(explanation);

        // 添加可视化演示：绘制整个棋盘，并在所选空格处显示候选数字（高亮显示）
        const visual = document.createElement('div');
        visual.className = 'hint-visual';
        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                const cellDiv = document.createElement('div');
                cellDiv.className = 'hint-cell';
                if (i === row && j === col) {
                    cellDiv.classList.add('focus');
                    // 显示候选数字
                    cellDiv.innerHTML = candidates.join('<br>');
                } else {
                    cellDiv.textContent = this.board[i][j] || '';
                }
                visual.appendChild(cellDiv);
            }
        }
        dialog.appendChild(visual);

        // 显示提示覆盖层
        this.hintOverlay.style.display = 'flex';
    }
}

// 修改最后的初始化部分
document.addEventListener('DOMContentLoaded', () => {
    new Sudoku();
}); 