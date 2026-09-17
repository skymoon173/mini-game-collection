import pygame
import cv2
import numpy as np
import random
import math

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
ORANGE = (255, 165, 0)
YELLOW = (255, 255, 0)
GREEN = (0, 255, 0)
GLOW = (255, 255, 153)  # 发光的颜色
GOLDEN = (255, 215, 0)  # 金色

# 设置帧率
clock = pygame.time.Clock()
FPS = 30

# 定义火柴人类
class StickFigure:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.speed_x = 0
        self.fire_size = 1
        self.sword_mode = False
        self.glow_sword_mode = False
        self.strong_mode = False
        self.sword_angle = 0  # 初始角度
        self.sword_direction = 1  # 初始方向
        self.golden_hair = False

    def update(self):
        self.x += self.speed_x
        if self.x < 0:
            self.x = 0
        elif self.x > SCREEN_WIDTH:
            self.x = SCREEN_WIDTH
        self.sword_angle += 5 * self.sword_direction  # 旋转速度
        if abs(self.sword_angle) >= 45:  # 摆动角度限制
            self.sword_direction *= -1

    def draw(self, move=None):
        # 清除屏幕
        screen.fill(WHITE)

        # 头
        head_color = GOLDEN if self.golden_hair else BLACK
        head_radius = 10 if not self.strong_mode else 15
        pygame.draw.circle(screen, head_color, (self.x, self.y), head_radius)
        # 身体
        body_start = self.y + head_radius
        body_end = self.y + 50 if not self.strong_mode else self.y + 75
        pygame.draw.line(screen, BLACK, (self.x, body_start), (self.x, body_end), 2)
        # 左腿
        left_leg_end = body_end + 20
        pygame.draw.line(screen, BLACK, (self.x, body_end), (self.x - 10, left_leg_end), 2)
        # 右腿
        pygame.draw.line(screen, BLACK, (self.x, body_end), (self.x + 10, left_leg_end), 2)

        if move == 'move_1':
            # 左臂上举，右臂下放
            pygame.draw.line(screen, BLACK, (self.x, body_start + 10), (self.x - 20, self.y), 2)
            pygame.draw.line(screen, BLACK, (self.x, body_start + 10), (self.x + 20, body_start + 30), 2)
            return self.draw_effect(self.x - 20, self.y, 'left')  # 左手火焰特效
        elif move == 'move_2':
            # 双臂上举
            pygame.draw.line(screen, BLACK, (self.x, body_start + 10), (self.x - 20, self.y), 2)
            pygame.draw.line(screen, BLACK, (self.x, body_start + 10), (self.x + 20, self.y), 2)
            left_effect = self.draw_effect(self.x - 20, self.y, 'left')  # 左手火焰特效
            right_effect = self.draw_effect(self.x + 20, self.y, 'right')  # 右手火焰特效
            return left_effect if left_effect else right_effect
        elif move == 'move_3':
            # 左臂下放，右臂上举
            pygame.draw.line(screen, BLACK, (self.x, body_start + 10), (self.x - 20, body_start + 40), 2)
            pygame.draw.line(screen, BLACK, (self.x, body_start + 10), (self.x + 20, self.y), 2)
            return self.draw_effect(self.x + 20, self.y, 'right')  # 右手火焰特效
        elif move == 'move_4':
            # 双臂左右伸展
            pygame.draw.line(screen, BLACK, (self.x, body_start + 10), (self.x - 20, body_start + 20), 2)
            pygame.draw.line(screen, BLACK, (self.x, body_start + 10), (self.x + 20, body_start + 20), 2)
            return None
        elif move == 'move_5':
            # 左臂下放，右臂向前
            pygame.draw.line(screen, BLACK, (self.x, body_start + 10), (self.x - 10, body_start + 40), 2)
            pygame.draw.line(screen, BLACK, (self.x, body_start + 10), (self.x + 20, body_start + 10), 2)
            return self.draw_effect(self.x + 20, body_start + 10, 'right')  # 右手火焰特效
        elif move == 'move_6':
            # 左臂向前，右臂下放
            pygame.draw.line(screen, BLACK, (self.x, body_start + 10), (self.x - 20, body_start + 10), 2)
            pygame.draw.line(screen, BLACK, (self.x, body_start + 10), (self.x + 10, body_start + 40), 2)
            return self.draw_effect(self.x - 20, body_start + 10, 'left')  # 左手火焰特效
        else:
            # 默认双臂放下
            pygame.draw.line(screen, BLACK, (self.x, body_start + 10), (self.x - 10, body_start + 40), 2)
            pygame.draw.line(screen, BLACK, (self.x, body_start + 10), (self.x + 10, body_start + 40), 2)
            return None

    def draw_effect(self, x, y, hand):
        if self.sword_mode:
            sword_height = 100 if not self.glow_sword_mode else 150
            sword_width = 20 if not self.glow_sword_mode else 30
            sword_color = RED if not self.glow_sword_mode else GLOW
            sword_points = [
                (x - sword_width // 2, y),
                (x + sword_width // 2, y),
                (x + sword_width // 4, y - sword_height),
                (x - sword_width // 4, y - sword_height)
            ]
            hand_x, hand_y = (x, y)
            rotated_sword_points = self.rotate_points(sword_points, self.sword_angle, (hand_x, hand_y))
            pygame.draw.polygon(screen, sword_color, rotated_sword_points)
            pygame.draw.polygon(screen, BLACK, rotated_sword_points, 2)
            return rotated_sword_points
        else:
            fire_height = random.randint(10, 20) * self.fire_size
            fire_points = [
                (x - random.randint(3, 5) * self.fire_size, y),
                (x, y - fire_height),
                (x + random.randint(3, 5) * self.fire_size, y)
            ]
            pygame.draw.polygon(screen, RED, fire_points)
            pygame.draw.polygon(screen, ORANGE, [
                (x - random.randint(2, 4) * self.fire_size, y),
                (x, y - fire_height + random.randint(2, 5) * self.fire_size),
                (x + random.randint(2, 4) * self.fire_size, y)
            ])
            pygame.draw.polygon(screen, YELLOW, [
                (x - random.randint(1, 2) * self.fire_size, y),
                (x, y - fire_height + random.randint(4, 8) * self.fire_size),
                (x + random.randint(1, 2) * self.fire_size, y)
            ])
            return fire_points

    def rotate_points(self, points, angle, center):
        angle_rad = math.radians(angle)
        cos_theta = math.cos(angle_rad)
        sin_theta = math.sin(angle_rad)
        cx, cy = center
        rotated_points = []
        for x, y in points:
            tx, ty = x - cx, y - cy
            rx = tx * cos_theta - ty * sin_theta
            ry = tx * sin_theta + ty * cos_theta
            rotated_points.append((rx + cx, ry + cy))
        return rotated_points

    def grow_fire(self):
        self.fire_size += 0.1

    def transform_to_sword(self):
        self.sword_mode = True

    def transform_to_glow_sword(self):
        self.glow_sword_mode = True

    def transform_to_strong(self):
        self.strong_mode = True

    def transform_to_golden_hair(self):
        self.golden_hair = True

# 定义垃圾类
class Trash(pygame.sprite.Sprite):
    def __init__(self, x, y):
        super().__init__()
        self.image = pygame.Surface((20, 20))
        self.image.fill(GREEN)
        self.rect = self.image.get_rect()
        self.rect.center = (x, y)
        self.speed_y = random.randint(1, 5)
        self.speed_x = random.randint(-2, 2)  # 水平速度，增加动感
        self.burning = False
        self.burn_countdown = 30  # 烧掉垃圾的动画帧数

    def update(self):
        if not self.burning:
            self.rect.y += self.speed_y
            self.rect.x += self.speed_x
            if self.rect.left < 0 or self.rect.right > SCREEN_WIDTH:
                self.speed_x = -self.speed_x  # 反弹效果
            if self.rect.top > SCREEN_HEIGHT:
                self.kill()
        else:
            self.burn_countdown -= 1
            if self.burn_countdown <= 0:
                self.kill()
            else:
                # 动态变化垃圾燃烧时的颜色
                self.image.fill((random.randint(100, 255), random.randint(0, 50), 0))
                # 逐渐缩小
                size = max(1, self.burn_countdown)
                self.image = pygame.Surface((size, size), pygame.SRCALPHA)
                pygame.draw.circle(self.image, ORANGE, (size // 2, size // 2), size // 2)

    def burn(self):
        self.burning = True
        self.image = pygame.Surface((20, 20), pygame.SRCALPHA)
        pygame.draw.circle(self.image, ORANGE, (10, 10), 10)

def points_collide(points, rect):
    if points is None:
        return False
    for point in points:
        if rect.collidepoint(point):
            return True
    return False

# 创建火柴人
stick_figure = StickFigure(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2)

# 初始化视频录制
is_recording = False
video_writer = None

# 创建垃圾组
trashes = pygame.sprite.Group()

# 统计烧垃圾的数目
burnt_trash_count = 0

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
    effect_points = stick_figure.draw(current_move)
    
    # 生成新的垃圾
    if random.random() < 0.02:
        trash = Trash(random.randint(0, SCREEN_WIDTH), 0)
        trashes.add(trash)

    trashes.update()
    trashes.draw(screen)

    # 检查火焰和垃圾的碰撞
    for trash in trashes:
        if current_move in ['move_1', 'move_2', 'move_3', 'move_5', 'move_6']:
            if stick_figure.sword_mode:
                if points_collide(effect_points, trash.rect):
                    if not trash.burning:
                        trash.burn()
                        stick_figure.grow_fire()
                        burnt_trash_count += 1
                        if burnt_trash_count >= 50:
                            stick_figure.transform_to_golden_hair()
                        elif burnt_trash_count >= 30:
                            stick_figure.transform_to_strong()
                        elif burnt_trash_count >= 20:
                            stick_figure.transform_to_glow_sword()
                        elif burnt_trash_count >= 10:
                            stick_figure.transform_to_sword()
            else:
                fire_top = stick_figure.y - (10 * stick_figure.fire_size)  # 火焰顶端的y坐标
                if trash.rect.collidepoint(stick_figure.x - 20, fire_top) or \
                   trash.rect.collidepoint(stick_figure.x + 20, fire_top):
                    if not trash.burning:
                        trash.burn()
                        stick_figure.grow_fire()
                        burnt_trash_count += 1
                        if burnt_trash_count >= 50:
                            stick_figure.transform_to_golden_hair()
                        elif burnt_trash_count >= 30:
                            stick_figure.transform_to_strong()
                        elif burnt_trash_count >= 20:
                            stick_figure.transform_to_glow_sword()
                        elif burnt_trash_count >= 10:
                            stick_figure.transform_to_sword()

    # 显示烧垃圾的数目
    font = pygame.font.SysFont(None, 36)
    score_text = font.render(f'烧垃圾的数目: {burnt_trash_count}', True, BLACK)
    screen.blit(score_text, (10, 50))
    
    # 如果正在录制，捕获屏幕并写入视频，并显示“录像中”
    if is_recording and video_writer is not None:
        frame = pygame.surfarray.array3d(screen)
        frame = cv2.transpose(frame)
        frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        video_writer.write(frame)
        
        # 显示“录像中”
        recording_text = font.render('录像中', True, RED)
        screen.blit(recording_text, (10, 10))

    pygame.display.flip()
    clock.tick(FPS)

# 停止视频录制
if video_writer is not None:
    video_writer.release()

pygame.quit()
