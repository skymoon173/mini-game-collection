import pygame
import sys
import random

# 初始化 Pygame
pygame.init()

# 设置屏幕大小和其他参数
SCREEN_WIDTH, SCREEN_HEIGHT = 500, 500
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption('Merge Cats')

# 定义颜色
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
GRAY = (200, 200, 200)
COLORS = {
    'kitten': (255, 182, 193),
    'cat': (255, 160, 122),
    'big_cat': (255, 127, 80),
    'super_cat': (255, 69, 0)
}

# 设置字体
FONT = pygame.font.Font(None, 36)

# 游戏网格大小
GRID_SIZE = 5
TILE_SIZE = SCREEN_WIDTH // GRID_SIZE
TILE_PADDING = 5

# 猫咪种类和合成规则
CATS = ['kitten', 'cat', 'big_cat', 'super_cat']
MERGE_RULES = {
    'kitten': 'cat',
    'cat': 'big_cat',
    'big_cat': 'super_cat'
}

# 初始化游戏网格
def init_grid():
    grid = [[''] * GRID_SIZE for _ in range(GRID_SIZE)]
    return grid

# 随机选择一个猫咪
def random_cat():
    return random.choice(CATS[:2])  # 初始只生成前2种猫咪

# 绘制网格和猫咪
def draw_grid(grid):
    screen.fill(GRAY)
    for i in range(GRID_SIZE):
        for j in range(GRID_SIZE):
            tile_value = grid[i][j]
            tile_rect = pygame.Rect(j * TILE_SIZE + TILE_PADDING, i * TILE_SIZE + TILE_PADDING, TILE_SIZE - TILE_PADDING, TILE_SIZE - TILE_PADDING)
            tile_color = COLORS.get(tile_value, WHITE)
            pygame.draw.rect(screen, tile_color, tile_rect)
            if tile_value:
                text_surface = FONT.render(tile_value, True, BLACK)
                text_rect = text_surface.get_rect(center=tile_rect.center)
                screen.blit(text_surface, text_rect)

# 放置和合成猫咪
def place_cat(grid, cat, x, y):
    if grid[x][y] == '':
        grid[x][y] = cat
    elif grid[x][y] == cat:
        grid[x][y] = MERGE_RULES.get(cat, cat)
    else:
        return False
    return True

# 主游戏循环
def main():
    grid = init_grid()
    current_cat = random_cat()
    running = True

    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.MOUSEBUTTONDOWN:
                x, y = event.pos
                grid_x, grid_y = x // TILE_SIZE, y // TILE_SIZE
                if place_cat(grid, current_cat, grid_x, grid_y):
                    current_cat = random_cat()

        draw_grid(grid)
        pygame.display.flip()

    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()
