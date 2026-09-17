import pygame
import sys
import random

# 初始化 Pygame
pygame.init()

# 设置屏幕大小和其他参数
SCREEN_WIDTH, SCREEN_HEIGHT = 400, 400
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption('1248 Game')

# 定义颜色
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
GRAY = (200, 200, 200)
COLORS = {
    2: (238, 228, 218),
    4: (237, 224, 200),
    8: (242, 177, 121),
    16: (245, 149, 99),
    32: (246, 124, 95),
    64: (246, 94, 59),
    128: (237, 207, 114),
    256: (237, 204, 97),
    512: (237, 200, 80),
    1024: (237, 197, 63),
    2048: (237, 194, 46),
}

# 设置字体
FONT = pygame.font.Font(None, 55)

# 游戏网格大小
GRID_SIZE = 4
TILE_SIZE = SCREEN_WIDTH // GRID_SIZE
TILE_PADDING = 10

# 初始化游戏网格
def init_grid():
    grid = [[0] * GRID_SIZE for _ in range(GRID_SIZE)]
    add_random_tile(grid)
    add_random_tile(grid)
    return grid

# 随机添加一个数字块
def add_random_tile(grid):
    empty_tiles = [(i, j) for i in range(GRID_SIZE) for j in range(GRID_SIZE) if grid[i][j] == 0]
    if empty_tiles:
        i, j = random.choice(empty_tiles)
        grid[i][j] = random.choice([2, 4])

# 绘制网格和数字块
def draw_grid(grid):
    screen.fill(GRAY)
    for i in range(GRID_SIZE):
        for j in range(GRID_SIZE):
            tile_value = grid[i][j]
            tile_rect = pygame.Rect(j * TILE_SIZE + TILE_PADDING, i * TILE_SIZE + TILE_PADDING, TILE_SIZE - TILE_PADDING, TILE_SIZE - TILE_PADDING)
            tile_color = COLORS.get(tile_value, WHITE)
            pygame.draw.rect(screen, tile_color, tile_rect)
            if tile_value:
                text_surface = FONT.render(str(tile_value), True, BLACK)
                text_rect = text_surface.get_rect(center=tile_rect.center)
                screen.blit(text_surface, text_rect)

# 移动和合并数字块
def move_and_merge(grid, direction):
    def move_row_left(row):
        new_row = [i for i in row if i != 0]
        for i in range(len(new_row) - 1):
            if new_row[i] == new_row[i + 1]:
                new_row[i] *= 2
                new_row[i + 1] = 0
        new_row = [i for i in new_row if i != 0]
        return new_row + [0] * (GRID_SIZE - len(new_row))

    if direction == 'left':
        grid = [move_row_left(row) for row in grid]
    elif direction == 'right':
        grid = [move_row_left(row[::-1])[::-1] for row in grid]
    elif direction == 'up':
        grid = [move_row_left(row) for row in zip(*grid)]
        grid = [list(row) for row in zip(*grid)]
    elif direction == 'down':
        grid = [move_row_left(row[::-1])[::-1] for row in zip(*grid)]
        grid = [list(row) for row in zip(*grid)]
    return grid

# 主游戏循环
def main():
    grid = init_grid()
    running = True

    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_LEFT:
                    grid = move_and_merge(grid, 'left')
                elif event.key == pygame.K_RIGHT:
                    grid = move_and_merge(grid, 'right')
                elif event.key == pygame.K_UP:
                    grid = move_and_merge(grid, 'up')
                elif event.key == pygame.K_DOWN:
                    grid = move_and_merge(grid, 'down')
                add_random_tile(grid)

        draw_grid(grid)
        pygame.display.flip()

    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()
