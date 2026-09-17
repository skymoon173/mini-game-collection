import pygame
import random

# 初始化Pygame
pygame.init()

# 设置屏幕宽度和高度
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption("横版动作游戏")

# 定义颜色
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
RED = (255, 0, 0)

# 设置帧率
clock = pygame.time.Clock()
FPS = 60

# 定义角色类
class Player(pygame.sprite.Sprite):
    def __init__(self):
        super().__init__()
        self.image = pygame.Surface((50, 50))
        self.image.fill(RED)
        self.rect = self.image.get_rect()
        self.rect.center = (SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2)
        self.speed_x = 0
        self.speed_y = 0
        self.jump = False

    def update(self):
        self.speed_y += 1  # 重力效果
        keys = pygame.key.get_pressed()
        if keys[pygame.K_LEFT]:
            self.speed_x = -5
        elif keys[pygame.K_RIGHT]:
            self.speed_x = 5
        else:
            self.speed_x = 0

        if keys[pygame.K_SPACE] and not self.jump:
            self.speed_y = -20
            self.jump = True

        self.rect.x += self.speed_x
        self.rect.y += self.speed_y

        if self.rect.bottom > SCREEN_HEIGHT:
            self.rect.bottom = SCREEN_HEIGHT
            self.jump = False

# 定义敌人类
class Enemy(pygame.sprite.Sprite):
    def __init__(self):
        super().__init__()
        self.image = pygame.Surface((50, 50))
        self.image.fill(BLACK)
        self.rect = self.image.get_rect()
        self.rect.x = random.randint(SCREEN_WIDTH, SCREEN_WIDTH + 100)
        self.rect.y = SCREEN_HEIGHT - 50

    def update(self):
        self.rect.x -= 5
        if self.rect.right < 0:
            self.rect.x = random.randint(SCREEN_WIDTH, SCREEN_WIDTH + 100)

# 创建角色和敌人群组
player = Player()
all_sprites = pygame.sprite.Group()
all_sprites.add(player)

enemies = pygame.sprite.Group()
for i in range(5):
    enemy = Enemy()
    all_sprites.add(enemy)
    enemies.add(enemy)

# 游戏主循环
running = True
while running:                   
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False                        
           
    all_sprites.update()   

    # 检查碰撞
    if pygame.sprite.spritecollide(player, enemies, False):
        running = False

    screen.fill(WHITE)
    all_sprites.draw(screen)
    pygame.display.flip()
    clock.tick(FPS)

pygame.quit()
