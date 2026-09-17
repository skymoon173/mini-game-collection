import pygame
import numpy as np

# 初始化 Pygame
pygame.init()

# 设置屏幕尺寸
width, height = 1024, 768
screen = pygame.display.set_mode((width, height))
pygame.display.set_caption("电场和磁场模拟器")

# 颜色定义
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
RED = (255, 0, 0)
GREEN = (0, 255, 0)
BLUE = (0, 0, 255)
CYAN = (0, 255, 255)

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

def magnetic_field(x, y, current_loops):
    Bx, By = 0, 0
    mu0 = 4 * np.pi * 1e-7  # 真空磁导率
    for loop in current_loops:
        cx, cy, I = loop
        rx, ry = x - cx, y - cy
        r = np.hypot(rx, ry)
        if r == 0:
            continue
        B = (mu0 * I) / (2 * np.pi * r)
        Bx -= B * ry / r
        By += B * rx / r
    return np.array([Bx, By])

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
def draw_color_bar(screen, x, y, width, height, max_field_intensity, label):
    for i in range(256):
        color = (i, 0, 255 - i)
        pygame.draw.rect(screen, color, (x, y + height - (i + 1) * height / 256, width, height / 256))
    # 显示最大电场强度
    font = pygame.font.Font(None, 24)
    text = font.render(f"{max_field_intensity:.2e}", True, WHITE)
    screen.blit(text, (x + width // 2 - text.get_width() // 2, y - 40))
    label_text = font.render(label, True, WHITE)
    screen.blit(label_text, (x + width // 2 - label_text.get_width() // 2, y - 20))

# 主循环
running = True
charges = [np.array([width // 2, height // 2, 1e-9])]
current_loops = [np.array([width // 3, height // 3, 1e-3])]
dragging = False
selected_charge = None
selected_current_loop = None

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
                for loop in current_loops:
                    if np.hypot(event.pos[0] - loop[0], event.pos[1] - loop[1]) < 10:
                        dragging = True
                        selected_current_loop = loop
                        break
                if not dragging:
                    charges.append(np.array([event.pos[0], event.pos[1], 1e-9]))
            elif event.button == 3:  # 右键按下
                for charge in charges:
                    if np.hypot(event.pos[0] - charge[0], event.pos[1] - charge[1]) < 10:
                        charges = [c for c in charges if not np.array_equal(c, charge)]
                        break
                # 删除电流环功能取消
        elif event.type == pygame.MOUSEBUTTONUP:
            if event.button == 1:  # 左键抬起
                dragging = False
                selected_charge = None
                selected_current_loop = None
        elif event.type == pygame.MOUSEMOTION:
            if dragging:
                if selected_charge is not None:
                    selected_charge[0], selected_charge[1] = event.pos
                if selected_current_loop is not None:
                    selected_current_loop[0], selected_current_loop[1] = event.pos
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_UP:
                zoom *= 1.1
            elif event.key == pygame.K_DOWN:
                zoom /= 1.1

    screen.fill(BLACK)

    max_field_intensity_electric = 0
    max_field_intensity_magnetic = 0
    electric_field_values = []
    magnetic_field_values = []

    # 计算所有点的电场和磁场强度并找出最大值
    for x in range(0, width - 100, 20):  # 留出空间给柱状图
        for y in range(0, height, 20):
            E = electric_field(x, y, charges)
            B = magnetic_field(x, y, current_loops)
            electric_field_values.append((x, y, E))
            magnetic_field_values.append((x, y, B))
            max_field_intensity_electric = max(max_field_intensity_electric, np.linalg.norm(E))
            max_field_intensity_magnetic = max(max_field_intensity_magnetic, np.linalg.norm(B))

    # 绘制电场矢量
    for (x, y, E) in electric_field_values:
        color = field_color(E, max_field_intensity_electric)
        E_scaled = E * 1e-7 * zoom
        draw_vector(screen, (x, y), E_scaled, color)

    # 绘制磁场矢量
    for (x, y, B) in magnetic_field_values:
        color = field_color(B, max_field_intensity_magnetic)
        B_scaled = B * 1e-7 * zoom
        draw_vector(screen, (x, y), B_scaled, CYAN)

    # 绘制电荷和电流环
    for charge in charges:
        pygame.draw.circle(screen, GREEN, charge[:2].astype(int), 10)
    for loop in current_loops:
        pygame.draw.circle(screen, RED, loop[:2].astype(int), 10)  # 用圆形表示电流环

    # 绘制强度柱状图
    draw_color_bar(screen, width - 80, 20, 60, height // 2 - 30, max_field_intensity_electric, "Electric Field")
    draw_color_bar(screen, width - 80, height // 2 + 20, 60, height // 2 - 30, max_field_intensity_magnetic, "Magnetic Field")

    pygame.display.flip()

pygame.quit()
