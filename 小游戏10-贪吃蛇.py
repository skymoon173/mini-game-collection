import pygame
import random

# 初始化Pygame
pygame.init()

# 设置屏幕宽度和高度
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption("五彩贪吃蛇游戏")

# 定义颜色
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
RED = (255, 0, 0)
GREEN = (0, 255, 0)
BLUE = (0, 0, 255)
YELLOW = (255, 255, 0)
PURPLE = (128, 0, 128)

COLORS = [RED, GREEN, BLUE, YELLOW, PURPLE]

# 设置帧率
clock = pygame.time.Clock()
FPS = 15

# 定义蛇类
class Snake:
    def __init__(self):
        self.size = 20
        self.body = [(100, 100), (80, 100), (60, 100)]
        self.direction = 'RIGHT'
        self.color = GREEN

    def move(self):
        head_x, head_y = self.body[0]

        if self.direction == 'RIGHT':
            head_x += self.size
        elif self.direction == 'LEFT':
            head_x -= self.size
        elif self.direction == 'UP':
            head_y -= self.size
        elif self.direction == 'DOWN':
            head_y += self.size

        # 插入新头
        self.body.insert(0, (head_x, head_y))
        self.body.pop()

    def grow(self):
        self.body.append(self.body[-1])
        self.color = random.choice(COLORS)

    def change_direction(self, direction):
        if direction == 'RIGHT' and self.direction != 'LEFT':
            self.direction = direction
        elif direction == 'LEFT' and self.direction != 'RIGHT':
            self.direction = direction
        elif direction == 'UP' and self.direction != 'DOWN':
            self.direction = direction
        elif direction == 'DOWN' and self.direction != 'UP':
            self.direction = direction

    def draw(self):
        for segment in self.body:
            pygame.draw.rect(screen, self.color, (segment[0], segment[1], self.size, self.size))

# 定义食物类
class Food:
    def __init__(self):
        self.size = 20
        self.position = (random.randint(0, (SCREEN_WIDTH // self.size) - 1) * self.size,
                         random.randint(0, (SCREEN_HEIGHT // self.size) - 1) * self.size)
        self.color = random.choice(COLORS)

    def draw(self):
        pygame.draw.rect(screen, self.color, (self.position[0], self.position[1], self.size, self.size))

    def respawn(self):
        self.position = (random.randint(0, (SCREEN_WIDTH // self.size) - 1) * self.size,
                         random.randint(0, (SCREEN_HEIGHT // self.size) - 1) * self.size)
        self.color = random.choice(COLORS)

# 创建蛇和食物
snake = Snake()
food = Food()

# 游戏主循环
running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_RIGHT:
                snake.change_direction('RIGHT')
            elif event.key == pygame.K_LEFT:
                snake.change_direction('LEFT')
            elif event.key == pygame.K_UP:
                snake.change_direction('UP')
            elif event.key == pygame.K_DOWN:
                snake.change_direction('DOWN')

    snake.move()

    # 检查蛇是否吃到食物
    if snake.body[0] == food.position:
        snake.grow()
        food.respawn()

    # 检查蛇是否碰到自己或边界
    head_x, head_y = snake.body[0]
    if head_x < 0 or head_x >= SCREEN_WIDTH or head_y < 0 or head_y >= SCREEN_HEIGHT or (head_x, head_y) in snake.body[1:]:
        running = False

    screen.fill(WHITE)
    snake.draw()
    food.draw()
    pygame.display.flip()
    clock.tick(FPS)

pygame.quit()
