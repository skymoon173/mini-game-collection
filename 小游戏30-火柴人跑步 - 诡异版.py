import pygame
import sys
import random
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
upper_arm_length = 20
lower_arm_length = 20
upper_leg_length = 20
lower_leg_length = 20

# 设置帧率
clock = pygame.time.Clock()
FPS = 30

# 火柴人类
class StickFigure:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.frame = 0
        self.randomize_pose()

    def randomize_pose(self):
        # 随机化起始帧，以改变跑步姿势
        self.start_frame = random.randint(0, 59)

    def draw_limb(self, window, start_pos, lengths, angles):
        # 计算关节和末端位置
        x, y = start_pos
        x1 = x + lengths[0] * math.cos(math.radians(angles[0]))
        y1 = y + lengths[0] * math.sin(math.radians(angles[0]))
        x2 = x1 + lengths[1] * math.cos(math.radians(angles[0] + angles[1]))
        y2 = y1 + lengths[1] * math.sin(math.radians(angles[0] + angles[1]))
        pygame.draw.line(window, BLACK, (x, y), (x1, y1), 2)
        pygame.draw.line(window, BLACK, (x1, y1), (x2, y2), 2)

    def draw(self, window):
        frame = (self.frame + self.start_frame) % 60
        self.frame += 1
        if self.frame >= 60:
            self.frame = 0
        
        # 绘制头部
        pygame.draw.circle(window, BLACK, (self.x, self.y), head_radius)
        
        # 绘制身体
        pygame.draw.line(window, BLACK, (self.x, self.y + head_radius), (self.x, self.y + head_radius + body_length), 2)
        
        # 手臂的角度摆动
        arm_swing_angle = math.sin(math.radians(frame * 6)) * 30
        self.draw_limb(window, (self.x, self.y + head_radius + 10), [upper_arm_length, lower_arm_length], [arm_swing_angle, arm_swing_angle])
        self.draw_limb(window, (self.x, self.y + head_radius + 10), [upper_arm_length, lower_arm_length], [-arm_swing_angle, -arm_swing_angle])
        
        # 腿部的跑步动作
        leg_swing_angle = math.sin(math.radians(frame * 6)) * 45
        self.draw_limb(window, (self.x, self.y + head_radius + body_length), [upper_leg_length, lower_leg_length], [leg_swing_angle, -leg_swing_angle])
        self.draw_limb(window, (self.x, self.y + head_radius + body_length), [upper_leg_length, lower_leg_length], [-leg_swing_angle, leg_swing_angle])

    def update(self):
        self.x += 5
        if self.x > WIDTH:
            self.x = 0
            self.randomize_pose()

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
