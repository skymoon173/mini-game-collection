import pygame
import cv2
import numpy as np

# 初始化Pygame
pygame.init()

# 设置屏幕宽度和高度
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption("火柴人跳舞游戏")

# 定义颜色
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
RED = (255, 0, 0)

# 设置帧率
clock = pygame.time.Clock()
FPS = 30

# 定义火柴人类
class StickFigure:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.speed_x = 0

    def update(self):
        self.x += self.speed_x
        if self.x < 0:
            self.x = 0
        elif self.x > SCREEN_WIDTH:
            self.x = SCREEN_WIDTH

    def draw(self, move=None):
        # 头
        pygame.draw.circle(screen, BLACK, (self.x, self.y), 10)
        # 身体
        pygame.draw.line(screen, BLACK, (self.x, self.y + 10), (self.x, self.y + 50), 2)
        # 左腿
        pygame.draw.line(screen, BLACK, (self.x, self.y + 50), (self.x - 10, self.y + 70), 2)
        # 右腿
        pygame.draw.line(screen, BLACK, (self.x, self.y + 50), (self.x + 10, self.y + 70), 2)

        if move == 'move_1':
            # 左臂上举，右臂下放
            pygame.draw.line(screen, BLACK, (self.x, self.y + 20), (self.x - 20, self.y), 2)
            pygame.draw.line(screen, BLACK, (self.x, self.y + 20), (self.x + 20, self.y + 40), 2)
        elif move == 'move_2':
            # 双臂上举
            pygame.draw.line(screen, BLACK, (self.x, self.y + 20), (self.x - 20, self.y), 2)
            pygame.draw.line(screen, BLACK, (self.x, self.y + 20), (self.x + 20, self.y), 2)
        elif move == 'move_3':
            # 左臂下放，右臂上举
            pygame.draw.line(screen, BLACK, (self.x, self.y + 20), (self.x - 20, self.y + 40), 2)
            pygame.draw.line(screen, BLACK, (self.x, self.y + 20), (self.x + 20, self.y), 2)
        elif move == 'move_4':
            # 双臂左右伸展
            pygame.draw.line(screen, BLACK, (self.x, self.y + 20), (self.x - 20, self.y + 20), 2)
            pygame.draw.line(screen, BLACK, (self.x, self.y + 20), (self.x + 20, self.y + 20), 2)
        elif move == 'move_5':
            # 左臂下放，右臂向前
            pygame.draw.line(screen, BLACK, (self.x, self.y + 20), (self.x - 10, self.y + 40), 2)
            pygame.draw.line(screen, BLACK, (self.x, self.y + 20), (self.x + 20, self.y + 10), 2)
        elif move == 'move_6':
            # 左臂向前，右臂下放
            pygame.draw.line(screen, BLACK, (self.x, self.y + 20), (self.x - 20, self.y + 10), 2)
            pygame.draw.line(screen, BLACK, (self.x, self.y + 20), (self.x + 10, self.y + 40), 2)
        else:
            # 默认双臂放下
            pygame.draw.line(screen, BLACK, (self.x, self.y + 20), (self.x - 10, self.y + 40), 2)
            pygame.draw.line(screen, BLACK, (self.x, self.y + 20), (self.x + 10, self.y + 40), 2)

# 创建火柴人
stick_figure = StickFigure(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2)

# 初始化视频录制
is_recording = False
video_writer = None

# 游戏主循环
running = True
current_move = None
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_LEFT:
                stick_figure.speed_x = -5
            elif event.key == pygame.K_RIGHT:
                stick_figure.speed_x = 5
            elif event.key == pygame.K_1:
                current_move = 'move_1'
            elif event.key == pygame.K_2:
                current_move = 'move_2'
            elif event.key == pygame.K_3:
                current_move = 'move_3'
            elif event.key == pygame.K_4:
                current_move = 'move_4'
            elif event.key == pygame.K_5:
                current_move = 'move_5'
            elif event.key == pygame.K_6:
                current_move = 'move_6'
            elif event.key == pygame.K_s:
                if not is_recording:
                    # 开始录像
                    is_recording = True
                    fourcc = cv2.VideoWriter_fourcc(*'XVID')
                    video_writer = cv2.VideoWriter('recording.avi', fourcc, FPS, (SCREEN_WIDTH, SCREEN_HEIGHT))
            elif event.key == pygame.K_t:
                if is_recording:
                    # 停止录像
                    is_recording = False
                    video_writer.release()
                    video_writer = None
        elif event.type == pygame.KEYUP:
            if event.key == pygame.K_LEFT or event.key == pygame.K_RIGHT:
                stick_figure.speed_x = 0
    
    stick_figure.update()
    screen.fill(WHITE)  # 清除屏幕
    stick_figure.draw(current_move)
    
    # 如果正在录制，捕获屏幕并写入视频，并显示“录像中”
    if is_recording and video_writer is not None:
        frame = pygame.surfarray.array3d(screen)
        frame = cv2.transpose(frame)
        frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        video_writer.write(frame)
        
        # 显示“录像中”
        font = pygame.font.SysFont(None, 48)
        text = font.render('录像中', True, RED)
        screen.blit(text, (10, 10))

    pygame.display.flip()
    clock.tick(FPS)

# 停止视频录制
if video_writer is not None:
    video_writer.release()

pygame.quit()
