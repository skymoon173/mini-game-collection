import pygame
import sys
import math

# 初始化Pygame
pygame.init()

# 设置窗口
WIDTH, HEIGHT = 800, 600
window = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Stick Figure Running")

# 定义颜色
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)

# 定义火柴人的参数
head_radius = 10
body_length = 50
arm_length = 30
leg_length = 30

# 设置帧率
clock = pygame.time.Clock()
FPS = 30

# 火柴人类
class StickFigure:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.frame = 0

    def draw(self, window):
        # 计算帧
        frame = self.frame // 5
        self.frame += 1
        if self.frame >= 60:
            self.frame = 0
        
        # 绘制头部
        pygame.draw.circle(window, BLACK, (self.x, self.y), head_radius)
        
        # 绘制身体
        pygame.draw.line(window, BLACK, (self.x, self.y + head_radius), (self.x, self.y + head_radius + body_length), 2)
        
        # 手臂和腿部的摆动
        arm_swing_angle = math.sin(math.radians(frame * 6)) * 30
        leg_swing_angle = math.cos(math.radians(frame * 6)) * 30

        # 手臂
        arm_y_offset = self.y + head_radius + 20
        pygame.draw.line(window, BLACK, (self.x, arm_y_offset), (self.x + arm_length * math.cos(math.radians(arm_swing_angle)), arm_y_offset + arm_length * math.sin(math.radians(arm_swing_angle))), 2)
        pygame.draw.line(window, BLACK, (self.x, arm_y_offset), (self.x - arm_length * math.cos(math.radians(arm_swing_angle)), arm_y_offset + arm_length * math.sin(math.radians(arm_swing_angle))), 2)

        # 腿部
        leg_y_offset = self.y + head_radius + body_length
        pygame.draw.line(window, BLACK, (self.x, leg_y_offset), (self.x + leg_length * math.cos(math.radians(leg_swing_angle)), leg_y_offset + leg_length * math.sin(math.radians(leg_swing_angle))), 2)
        pygame.draw.line(window, BLACK, (self.x, leg_y_offset), (self.x - leg_length * math.cos(math.radians(leg_swing_angle)), leg_y_offset + leg_length * math.sin(math.radians(leg_swing_angle))), 2)

    def update(self):
        # 让火柴人跑动
        self.x += 5
        if self.x > WIDTH:
            self.x = 0

# 创建火柴人实例
stick_figure = StickFigure(WIDTH // 2, HEIGHT // 2)

# 主循环
running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
    
    window.fill(WHITE)
    stick_figure.draw(window)
    stick_figure.update()
    
    pygame.display.flip()
    clock.tick(FPS)

pygame.quit()
sys.exit()
