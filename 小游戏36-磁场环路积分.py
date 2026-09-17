import pygame
import numpy as np

# 初始化 Pygame
pygame.init()

# 设置屏幕尺寸
width, height = 1024, 768
screen = pygame.display.set_mode((width, height))
pygame.display.set_caption("磁铁之间的磁场模拟器")

# 颜色定义
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
RED = (255, 0, 0)
CYAN = (0, 255, 255)

# 磁场计算函数
def magnetic_field(x, y, magnets):
    Bx, By = 0, 0
    mu0 = 4 * np.pi * 1e-7  # 真空磁导率
    for magnet in magnets:
        cx, cy, m = magnet
        rx, ry = x - cx, y - cy
        r = np.hypot(rx, ry)
        if r == 0:
            continue
        B = (mu0 * m) / (2 * np.pi * r**2)
        Bx += B * ry / r
        By -= B * rx / r
    return np.array([Bx, By])

def field_color(B, max_field_intensity):
    if max_field_intensity == 0 or np.isnan(max_field_intensity):
        return (0, 0, 255)  # 默认颜色
    norm = np.linalg.norm(B)
    color_intensity = min(255, int((norm / max_field_intensity) * 255))
    return (color_intensity, 0, 255 - color_intensity)

def draw_vector(screen, start, vec, color, is_dashed=False):
    end_pos = (start[0] + vec[0], start[1] + vec[1])
    if is_dashed:
        draw_dashed_line(screen, color, start, end_pos, 5)
    else:
        pygame.draw.line(screen, color, start, end_pos, 2)
    angle = np.arctan2(vec[1], vec[0])
    arrow_size = 5
    pygame.draw.polygon(screen, color, [
        end_pos,
        (end_pos[0] - arrow_size * np.cos(angle - np.pi / 6), end_pos[1] - arrow_size * np.sin(angle - np.pi / 6)),
        (end_pos[0] - arrow_size * np.cos(angle + np.pi / 6), end_pos[1] - arrow_size * np.sin(angle + np.pi / 6))
    ])

def draw_dashed_line(screen, color, start_pos, end_pos, width=1):
    total_length = np.linalg.norm(np.array(end_pos) - np.array(start_pos))
    num_dashes = int(total_length // 10)
    dash_length = total_length / (2 * num_dashes)
    for i in range(num_dashes):
        start = (start_pos[0] + i * 2 * dash_length, start_pos[1] + i * 2 * dash_length)
        end = (start_pos[0] + (i * 2 + 1) * dash_length, start_pos[1] + (i * 2 + 1) * dash_length)
        pygame.draw.line(screen, color, start, end, width)

# 环路积分路径
def draw_loop(screen, loop_points, color):
    if len(loop_points) < 2:
        return
    for i in range(len(loop_points) - 1):
        draw_dashed_line(screen, color, loop_points[i], loop_points[i + 1])
    draw_dashed_line(screen, color, loop_points[-1], loop_points[0])

# 主循环
running = True
magnets = [np.array([width // 2, height // 2, 1e-3])]
loop_points = []
dragging = False
selected_magnet = None

# 视角控制
zoom = 1.0

while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.MOUSEBUTTONDOWN:
            if event.button == 1:  # 左键按下
                for magnet in magnets:
                    if np.hypot(event.pos[0] - magnet[0], event.pos[1] - magnet[1]) < 10:
                        dragging = True
                        selected_magnet = magnet
                        break
                if not dragging:
                    magnets.append(np.array([event.pos[0], event.pos[1], 1e-3]))
            elif event.button == 3:  # 右键按下
                for magnet in magnets:
                    if np.hypot(event.pos[0] - magnet[0], event.pos[1] - magnet[1]) < 10:
                        magnets = [m for m in magnets if not np.array_equal(m, magnet)]
                        break
            elif event.button == 2:  # 中键按下
                loop_points.append(event.pos)
        elif event.type == pygame.MOUSEBUTTONUP:
            if event.button == 1:  # 左键抬起
                dragging = False
                selected_magnet = None
        elif event.type == pygame.MOUSEMOTION:
            if dragging and selected_magnet is not None:
                selected_magnet[0], selected_magnet[1] = event.pos
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_UP:
                zoom *= 1.1
            elif event.key == pygame.K_DOWN:
                zoom /= 1.1
            elif event.key == pygame.K_c:  # 按下 'c' 键清除环路
                loop_points = []

    screen.fill(BLACK)

    max_field_intensity = 0
    field_values = []

    # 计算所有点的磁场强度并找出最大值
    for x in range(0, width, 20):
        for y in range(0, height, 20):
            B = magnetic_field(x, y, magnets)
            field_values.append((x, y, B))
            max_field_intensity = max(max_field_intensity, np.linalg.norm(B))

    # 绘制磁场矢量
    for (x, y, B) in field_values:
        color = field_color(B, max_field_intensity)
        B_scaled = B * 1e-3 * zoom  # 缩放磁场矢量
        draw_vector(screen, (x, y), B_scaled, color, is_dashed=True)

    # 绘制磁铁
    for magnet in magnets:
        pygame.draw.circle(screen, RED, magnet[:2].astype(int), 10)

    # 绘制环路积分路径
    draw_loop(screen, loop_points, CYAN)

    pygame.display.flip()

pygame.quit()
