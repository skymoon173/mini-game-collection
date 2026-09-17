import pygame
import math

# 初始化Pygame
pygame.init()
screen = pygame.display.set_mode((800, 600))
pygame.display.set_caption("磁铁之间的磁场作用")

# 定义颜色
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
RED = (255, 0, 0)
BLUE = (0, 0, 255)

# 定义磁铁类
class Magnet:
    def __init__(self, start_pos, end_pos):
        self.start_pos = start_pos  # 北极位置
        self.end_pos = end_pos      # 南极位置
        self.selected = False

    def draw(self, screen):
        pygame.draw.line(screen, BLACK, self.start_pos, self.end_pos, 5)
        pygame.draw.circle(screen, RED, self.start_pos, 10)
        pygame.draw.circle(screen, BLUE, self.end_pos, 10)
        font = pygame.font.Font(None, 24)
        n_text = font.render('N', True, WHITE)
        s_text = font.render('S', True, WHITE)
        screen.blit(n_text, (self.start_pos[0] - 6, self.start_pos[1] - 12))
        screen.blit(s_text, (self.end_pos[0] - 6, self.end_pos[1] - 12))

    def is_clicked(self, pos):
        return math.hypot(self.start_pos[0] - pos[0], self.start_pos[1] - pos[1]) < 10 or \
               math.hypot(self.end_pos[0] - pos[0], self.end_pos[1] - pos[1]) < 10

    def move(self, delta):
        self.start_pos = (self.start_pos[0] + delta[0], self.start_pos[1] + delta[1])
        self.end_pos = (self.end_pos[0] + delta[0], self.end_pos[1] + delta[1])

# 计算虚线点的函数
def get_field_lines(magnet1, magnet2, num_lines=10, segments=100):
    lines = []
    for i in range(num_lines):
        t = i / (num_lines - 1)
        start_x = magnet1.start_pos[0] * (1 - t) + magnet1.end_pos[0] * t
        start_y = magnet1.start_pos[1] * (1 - t) + magnet1.end_pos[1] * t

        end_x = magnet2.start_pos[0] * (1 - t) + magnet2.end_pos[0] * t
        end_y = magnet2.start_pos[1] * (1 - t) + magnet2.end_pos[1] * t

        points = [(start_x, start_y)]
        for j in range(1, segments):
            t2 = j / segments
            mid_x = start_x * (1 - t2) + end_x * t2
            mid_y = start_y * (1 - t2) + end_y * t2

            curvature = 100 * math.sin(t2 * math.pi)  # 调整曲率
            offset_x = curvature * (start_y - end_y) / math.hypot(start_x - end_x, start_y - end_y)
            offset_y = curvature * (end_x - start_x) / math.hypot(start_x - end_x, start_y - end_y)

            points.append((mid_x + offset_x, mid_y + offset_y))
        points.append((end_x, end_y))
        lines.append(points)
    return lines

# 主程序
def main():
    running = True
    magnets = []
    selected_magnet = None
    prev_mouse_pos = None

    while running:
        screen.fill(WHITE)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.MOUSEBUTTONDOWN:
                if event.button == 1:  # 左键增加磁铁或开始拖动磁铁
                    for magnet in magnets:
                        if magnet.is_clicked(event.pos):
                            selected_magnet = magnet
                            magnet.selected = True
                            prev_mouse_pos = event.pos
                            break
                    else:
                        start_pos = event.pos
                        end_pos = (start_pos[0] + 50, start_pos[1])
                        magnets.append(Magnet(start_pos, end_pos))
                elif event.button == 3:  # 右键删除磁铁
                    for magnet in magnets:
                        if magnet.is_clicked(event.pos):
                            magnets.remove(magnet)
                            break
            elif event.type == pygame.MOUSEBUTTONUP:
                if event.button == 1 and selected_magnet:  # 停止拖动磁铁
                    selected_magnet.selected = False
                    selected_magnet = None
                    prev_mouse_pos = None
            elif event.type == pygame.MOUSEMOTION:
                if selected_magnet and prev_mouse_pos:  # 拖动磁铁
                    delta = (event.pos[0] - prev_mouse_pos[0], event.pos[1] - prev_mouse_pos[1])
                    selected_magnet.move(delta)
                    prev_mouse_pos = event.pos

        # 绘制磁铁
        for magnet in magnets:
            magnet.draw(screen)

        # 绘制磁场曲线
        for i in range(len(magnets)):
            for j in range(i + 1, len(magnets)):
                lines = get_field_lines(magnets[i], magnets[j])
                for line in lines:
                    pygame.draw.lines(screen, BLACK, False, line, 1)

        pygame.display.flip()

    pygame.quit()

if __name__ == "__main__":
    main()
