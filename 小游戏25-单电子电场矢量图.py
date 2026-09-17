import pygame
import numpy as np

# 初始化 Pygame
pygame.init()

# 设置屏幕尺寸
width, height = 800, 600
screen = pygame.display.set_mode((width, height))
pygame.display.set_caption("二维电场模拟器")

# 颜色定义
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
RED = (255, 0, 0)
GREEN = (0, 255, 0)
BLUE = (0, 0, 255)

# 矢量场函数
def electric_field(x, y, charges):
    Ex, Ey = 0, 0
    k = 9e9  # 静电常数
    for charge in charges:
        cx, cy, q = charge
        rx, ry = x - cx, y - cy
        r = np.hypot(rx, ry)
        if r == 0:
            continue
        E = k * q / r**2
        Ex += E * rx / r
        Ey += E * ry / r
    return np.array([Ex, Ey])

def field_color(E, max_field_intensity):
    if max_field_intensity == 0 or np.isnan(max_field_intensity):
        return (0, 0, 255)  # 默认颜色
    norm = np.linalg.norm(E)
    color_intensity = min(255, int((norm / max_field_intensity) * 255))
    return (color_intensity, 0, 255 - color_intensity)

def draw_vector(screen, start, vec, color):
    end_pos = (start[0] + vec[0], start[1] + vec[1])
    pygame.draw.line(screen, color, start, end_pos, 2)
    angle = np.arctan2(vec[1], vec[0])
    arrow_size = 5
    pygame.draw.polygon(screen, color, [
        end_pos,
        (end_pos[0] - arrow_size * np.cos(angle - np.pi / 6), end_pos[1] - arrow_size * np.sin(angle - np.pi / 6)),
        (end_pos[0] - arrow_size * np.cos(angle + np.pi / 6), end_pos[1] - arrow_size * np.sin(angle + np.pi / 6))
    ])

# 绘制强度柱状图
def draw_color_bar(screen, x, y, width, height, max_field_intensity):
    for i in range(256):
        color = (i, 0, 255 - i)
        pygame.draw.rect(screen, color, (x, y + height - (i + 1) * height / 256, width, height / 256))
    # 显示最大电场强度
    font = pygame.font.Font(None, 24)
    text = font.render(f"{max_field_intensity:.2e}", True, WHITE)
    screen.blit(text, (x, y - 20))

# 主循环
running = True
charges = [np.array([width // 2, height // 2, 1e-9])]
dragging = False
selected_charge = None

# 视角控制
zoom = 1.0

while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.MOUSEBUTTONDOWN:
            if event.button == 1:  # 左键按下
                for charge in charges:
                    if np.hypot(event.pos[0] - charge[0], event.pos[1] - charge[1]) < 10:
                        dragging = True
                        selected_charge = charge
                        break
                if not dragging:
                    charges.append(np.array([event.pos[0], event.pos[1], 1e-9]))
            elif event.button == 3:  # 右键按下
                for charge in charges:
                    if np.hypot(event.pos[0] - charge[0], event.pos[1] - charge[1]) < 10:
                        charges = [c for c in charges if not np.array_equal(c, charge)]
                        break
        elif event.type == pygame.MOUSEBUTTONUP:
            if event.button == 1:  # 左键抬起
                dragging = False
                selected_charge = None
        elif event.type == pygame.MOUSEMOTION:
            if dragging and selected_charge is not None:
                selected_charge[0], selected_charge[1] = event.pos
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_UP:
                zoom *= 1.1
            elif event.key == pygame.K_DOWN:
                zoom /= 1.1

    screen.fill(BLACK)

    max_field_intensity = 0
    field_values = []

    # 计算所有点的电场强度并找出最大值
    for x in range(0, width - 100, 20):  # 留出空间给柱状图
        for y in range(0, height, 20):
            E = electric_field(x, y, charges)
            field_values.append((x, y, E))
            max_field_intensity = max(max_field_intensity, np.linalg.norm(E))

    # 绘制电场矢量
    for (x, y, E) in field_values:
        color = field_color(E, max_field_intensity)
        E_scaled = E * 1e-7 * zoom
        draw_vector(screen, (x, y), E_scaled, color)

    # 绘制电荷
    for charge in charges:
        pygame.draw.circle(screen, GREEN, charge[:2].astype(int), 10)

    # 绘制强度柱状图
    draw_color_bar(screen, width - 80, 20, 60, height - 40, max_field_intensity)

    pygame.display.flip()

pygame.quit()
