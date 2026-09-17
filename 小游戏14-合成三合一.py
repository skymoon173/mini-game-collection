import pygame
import sys
import random

# 初始化 Pygame
pygame.init()

# 设置屏幕大小和其他参数
SCREEN_WIDTH, SCREEN_HEIGHT = 600, 600
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption('Triple Town')

# 定义颜色
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
GRAY = (200, 200, 200)
COLORS = {
    'grass': (34, 139, 34),
    'bush': (0, 128, 0),
    'tree': (34, 139, 34),
    'house': (139, 69, 19),
    'castle': (128, 128, 128),
    'town': (105, 105, 105)
}

# 设置字体
FONT = pygame.font.Font(None, 36)

# 游戏网格大小
GRID_SIZE = 6
TILE_SIZE = SCREEN_WIDTH // GRID_SIZE
TILE_PADDING = 5

# 物品种类和合成规则
ITEMS = ['grass', 'bush', 'tree', 'house', 'castle', 'town']
MERGE_RULES = {
    'grass': 'bush',
    'bush': 'tree',
    'tree': 'house',
    'house': 'castle',
    'castle': 'town'
}

# 初始化游戏网格
def init_grid():
    grid = [[''] * GRID_SIZE for _ in range(GRID_SIZE)]
    return grid

# 随机选择一个物品
def random_item():
    return random.choice(ITEMS[:3])  # 初始只生成前3种物品

# 绘制网格和物品
def draw_grid(grid, cursor_pos):
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

    # 绘制光标
    cursor_rect = pygame.Rect(cursor_pos[1] * TILE_SIZE + TILE_PADDING, cursor_pos[0] * TILE_SIZE + TILE_PADDING, TILE_SIZE - TILE_PADDING, TILE_SIZE - TILE_PADDING)
    pygame.draw.rect(screen, BLACK, cursor_rect, 3)

# 放置和合成物品
def place_item(grid, item, x, y):
    if grid[x][y] == '':
        grid[x][y] = item
    elif grid[x][y] == item:
        grid[x][y] = MERGE_RULES.get(item, item)
    else:
        return False
    return True

# 主游戏循环
def main():
    grid = init_grid()
    current_item = random_item()
    cursor_pos = [0, 0]
    running = True

    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_LEFT and cursor_pos[1] > 0:
                    cursor_pos[1] -= 1
                elif event.key == pygame.K_RIGHT and cursor_pos[1] < GRID_SIZE - 1:
                    cursor_pos[1] += 1
                elif event.key == pygame.K_UP and cursor_pos[0] > 0:
                    cursor_pos[0] -= 1
                elif event.key == pygame.K_DOWN and cursor_pos[0] < GRID_SIZE - 1:
                    cursor_pos[0] += 1
                elif event.key == pygame.K_SPACE:
                    if place_item(grid, current_item, cursor_pos[0], cursor_pos[1]):
                        current_item = random_item()

        draw_grid(grid, cursor_pos)
        pygame.display.flip()

    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()
