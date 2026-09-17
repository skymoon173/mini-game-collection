import pygame
import sys
import math

# 初始化 Pygame
pygame.init()

# 设置屏幕大小和其他参数
SCREEN_WIDTH, SCREEN_HEIGHT = 800, 600
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption('Newtonian Physics Game with Rolling Spiral Ball')

# 定义颜色
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
RED = (255, 0, 0)

# 定义物体属性
class Ball:
    def __init__(self, x, y, radius, mass=1):
        self.x = x
        self.y = y
        self.radius = radius
        self.mass = mass
        self.color = RED
        self.velocity = [0, 0]  # x and y velocity
        self.acceleration = [0, 0.5]  # x and y acceleration, gravity
        self.angle = 0  # 记录球的旋转角度
        self.pattern_surface = self.create_pattern_surface()

    def create_pattern_surface(self):
        # 创建带有螺旋图案的表面
        surface = pygame.Surface((self.radius * 2, self.radius * 2), pygame.SRCALPHA)
        surface = surface.convert_alpha()

        # 在球的表面上绘制螺旋图案
        center = (self.radius, self.radius)
        for i in range(0, 360, 10):
            angle = math.radians(i)
            end_x = self.radius + self.radius * math.cos(angle)
            end_y = self.radius + self.radius * math.sin(angle)
            pygame.draw.line(surface, BLACK, center, (end_x, end_y), 2)
        
        return surface

    def apply_force(self, force):
        # F = ma -> a = F/m
        self.acceleration[0] += force[0] / self.mass
        self.acceleration[1] += force[1] / self.mass

    def update(self):
        # 更新速度和位置
        self.velocity[0] += self.acceleration[0]
        self.velocity[1] += self.acceleration[1]
        self.x += self.velocity[0]
        self.y += self.velocity[1]

        # 重置加速度
        self.acceleration = [0, 0.5]  # 每次更新后只保留重力

        # 碰撞检测：与地面和墙壁
        if self.y + self.radius > SCREEN_HEIGHT:
            self.y = SCREEN_HEIGHT - self.radius
            self.velocity[1] = -self.velocity[1] * 0.7  # 弹跳并损失一些能量

        if self.x - self.radius < 0:
            self.x = self.radius
            self.velocity[0] = -self.velocity[0]

        if self.x + self.radius > SCREEN_WIDTH:
            self.x = SCREEN_WIDTH - self.radius
            self.velocity[0] = -self.velocity[0]

        # 更新旋转角度
        self.angle += self.velocity[0] / self.radius

    def draw(self):
        # 旋转表面
        rotated_surface = pygame.transform.rotate(self.pattern_surface, math.degrees(self.angle))
        rotated_rect = rotated_surface.get_rect(center=(self.x, self.y))

        # 绘制旋转后的表面
        screen.blit(rotated_surface, rotated_rect.topleft)

# 初始化游戏
ball = Ball(400, 300, 40)

# 主游戏循环
running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_LEFT:
                ball.apply_force([-5, 0])
            elif event.key == pygame.K_RIGHT:
                ball.apply_force([5, 0])
            elif event.key == pygame.K_UP:
                ball.apply_force([0, -5])
            elif event.key == pygame.K_DOWN:
                ball.apply_force([0, 5])

    # 更新物体状态
    ball.update()

    # 绘制游戏界面
    screen.fill(WHITE)
    ball.draw()
    pygame.display.flip()

    # 设置帧率
    pygame.time.Clock().tick(60)

pygame.quit()
sys.exit()
