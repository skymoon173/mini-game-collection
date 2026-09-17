import pygame
import sys
import random
import os
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

# 获取当前脚本的目录
script_dir = os.path.dirname(os.path.abspath(__file__))
# 构建 fireworks.png 的绝对路径
fireworks_path = os.path.join(script_dir, 'fireworks.png')

# 加载鞭炮动画图像
fireworks_img = pygame.image.load(fireworks_path).convert_alpha()

fireworks_frames = [fireworks_img.subsurface(pygame.Rect(i * 64, 0, 64, 64)) for i in range(4)]

# 初始化游戏网格
def init_grid(size):
    grid = [[0] * size for _ in range(size)]
    add_random_tile(grid)
    add_random_tile(grid)
    return grid

# 随机添加一个数字块
def add_random_tile(grid):
    empty_tiles = [(i, j) for i in range(len(grid)) for j in range(len(grid)) if grid[i][j] == 0]
    if empty_tiles:
        i, j = random.choice(empty_tiles)
        grid[i][j] = random.choice([2, 4])

# 绘制网格和数字块
def draw_grid(grid):
    screen.fill(GRAY)
    size = len(grid)
    tile_size = SCREEN_WIDTH // size
    for i in range(size):
        for j in range(size):
            tile_value = grid[i][j]
            tile_rect = pygame.Rect(j * tile_size + 10, i * tile_size + 10, tile_size - 20, tile_size - 20)
            tile_color = COLORS.get(tile_value, WHITE)
            pygame.draw.rect(screen, tile_color, tile_rect)
            if tile_value:
                text_surface = FONT.render(str(tile_value), True, BLACK)
                text_rect = text_surface.get_rect(center=tile_rect.center)
                screen.blit(text_surface, text_rect)

# 显示鞭炮动画
def show_fireworks():
    for frame in fireworks_frames:
        screen.blit(frame, (SCREEN_WIDTH // 2 - 32, SCREEN_HEIGHT // 2 - 32))
        pygame.display.flip()
        pygame.time.delay(100)

# 移动和合并数字块
def move_and_merge(grid, direction):
    size = len(grid)

    def move_row_left(row):
        new_row = [i for i in row if i != 0]
        for i in range(len(new_row) - 1):
            if new_row[i] == new_row[i + 1]:
                new_row[i] *= 2
                new_row[i + 1] = 0
        new_row = [i for i in new_row if i != 0]
        return new_row + [0] * (size - len(new_row))

    if direction == 'left':
        grid = [move_row_left(row) for row in grid]
    elif direction == 'right':
        grid = [move_row_left(row[::-1])[::-1] for row in grid]
    elif direction == 'up':
        grid = [list(row) for row in zip(*[move_row_left(row) for row in zip(*grid)])]
    elif direction == 'down':
        grid = [list(row) for row in zip(*[move_row_left(row[::-1])[::-1] for row in zip(*grid)])]
    return grid

# 检查是否需要扩展网格
def check_expand_grid(grid, expanded, next_expand_value):
    for row in grid:
        if next_expand_value in row:
            expanded[next_expand_value] = True
            return True
    return False

# 扩展网格大小
def expand_grid(grid):
    size = len(grid)
    new_size = size + 1
    new_grid = [[0] * new_size for _ in range(new_size)]
    for i in range(size):
        for j in range(size):
            new_grid[i][j] = grid[i][j]
    return new_grid

# 主游戏循环
def main():
    grid = init_grid(4)
    running = True
    expanded = {128: False, 2048: False}
    next_expand_value = 128

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

                if check_expand_grid(grid, expanded, next_expand_value):
                    show_fireworks()
                    grid = expand_grid(grid)
                    add_random_tile(grid)
                    if next_expand_value == 128:
                        next_expand_value = 2048

        draw_grid(grid)
        pygame.display.flip()

    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()
