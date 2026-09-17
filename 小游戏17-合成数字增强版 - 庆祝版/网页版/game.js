const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const TILE_SIZE = 100;
const GRID_SIZE = 4;
const COLORS = {
    0: '#cdc1b4',
    2: '#eee4da',
    4: '#ede0c8',
    8: '#f2b179',
    16: '#f59563',
    32: '#f67c5f',
    64: '#f65e3b',
    128: '#edcf72',
    256: '#edcc61',
    512: '#edc850',
    1024: '#edc53f',
    2048: '#edc22e'
};

let grid = initGrid(GRID_SIZE);
let nextExpandValue = 128;

function initGrid(size) {
    const grid = [];
    for (let i = 0; i < size; i++) {
        grid[i] = new Array(size).fill(0);
    }
    addRandomTile(grid);
    addRandomTile(grid);
    return grid;
}

function addRandomTile(grid) {
    const emptyTiles = [];
    for (let i = 0; i < grid.length; i++) {
        for (let j = 0; j < grid[i].length; j++) {
            if (grid[i][j] === 0) {
                emptyTiles.push([i, j]);
            }
        }
    }
    if (emptyTiles.length > 0) {
        const [i, j] = emptyTiles[Math.floor(Math.random() * emptyTiles.length)];
        grid[i][j] = Math.random() < 0.9 ? 2 : 4;
    }
}

function drawGrid(grid) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < grid.length; i++) {
        for (let j = 0; j < grid[i].length; j++) {
            drawTile(i, j, grid[i][j]);
        }
    }
}

function drawTile(row, col, value) {
    ctx.fillStyle = COLORS[value];
    ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE - 5, TILE_SIZE - 5);
    if (value) {
        ctx.fillStyle = '#776e65';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(value, col * TILE_SIZE + TILE_SIZE / 2, row * TILE_SIZE + TILE_SIZE / 2);
    }
}

function moveAndMerge(grid, direction) {
    const size = grid.length;

    function moveRowLeft(row) {
        const newRow = row.filter(val => val !== 0);
        for (let i = 0; i < newRow.length - 1; i++) {
            if (newRow[i] === newRow[i + 1]) {
                newRow[i] *= 2;
                newRow[i + 1] = 0;
                if (newRow[i] === nextExpandValue) {
                    showFireworks();
                    if (nextExpandValue === 128) {
                        nextExpandValue = 2048;
                    } else {
                        nextExpandValue = null;
                    }
                }
            }
        }
        return [...newRow.filter(val => val !== 0), ...new Array(size - newRow.filter(val => val !== 0).length).fill(0)];
    }

    if (direction === 'left') {
        return grid.map(row => moveRowLeft(row));
    } else if (direction === 'right') {
        return grid.map(row => moveRowLeft(row.slice().reverse()).reverse());
    } else if (direction === 'up') {
        return transpose(moveAndMerge(transpose(grid), 'left'));
    } else if (direction === 'down') {
        return transpose(moveAndMerge(transpose(grid), 'right'));
    }
}

function transpose(matrix) {
    return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
}

function handleKey(event) {
    const directions = {
        'ArrowLeft': 'left',
        'ArrowRight': 'right',
        'ArrowUp': 'up',
        'ArrowDown': 'down'
    };

    if (directions[event.key]) {
        grid = moveAndMerge(grid, directions[event.key]);
        addRandomTile(grid);
        drawGrid(grid);
    }
}

function showFireworks() {
    const fireworks = new Image();
    fireworks.src = 'fireworks.png';
    fireworks.onload = () => {
        for (let i = 0; i < 4; i++) {
            setTimeout(() => {
                ctx.drawImage(fireworks, i * 64, 0, 64, 64, canvas.width / 2 - 32, canvas.height / 2 - 32, 64, 64);
            }, i * 100);
        }
    };
}

document.addEventListener('keydown', handleKey);
drawGrid(grid);
