import pygame
from pygame.locals import *
from OpenGL.GL import *
from OpenGL.GLU import *
import random
from collections import deque

# 初始化Pygame
pygame.init()
display = (800, 600)
screen = pygame.display.set_mode(display, DOUBLEBUF | OPENGL)
pygame.display.set_caption("3D 贪吃蛇游戏")

# 定义颜色
WHITE = (1, 1, 1)
BLACK = (0, 0, 0)
SOFT_RED = (0.9, 0.3, 0.3)
SOFT_GREEN = (0.3, 0.9, 0.3)
SOFT_BLUE = (0.3, 0.3, 0.9)
SOFT_YELLOW = (0.9, 0.9, 0.3)
SOFT_PURPLE = (0.7, 0.3, 0.7)

COLORS = [SOFT_RED, SOFT_GREEN, SOFT_BLUE, SOFT_YELLOW, SOFT_PURPLE]

# 设置视角
def setup_view():
    glMatrixMode(GL_PROJECTION)
    glLoadIdentity()
    gluPerspective(45, (display[0] / display[1]), 0.1, 100.0)
    glMatrixMode(GL_MODELVIEW)

# 定义立方体
def draw_cube(position, color):
    vertices = [
        [1, 1, -1],
        [1, -1, -1],
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, 1],
        [1, -1, 1],
        [-1, -1, 1],
        [-1, 1, 1]
    ]
    edges = (
        (0, 1), (1, 2), (2, 3), (3, 0),
        (4, 5), (5, 6), (6, 7), (7, 4),
        (0, 4), (1, 5), (2, 6), (3, 7)
    )
    surfaces = (
        (0, 1, 2, 3),
        (4, 5, 6, 7),
        (0, 1, 5, 4),
        (2, 3, 7, 6),
        (1, 2, 6, 5),
        (4, 7, 3, 0)
    )
    glPushMatrix()
    glTranslatef(*position)
    glBegin(GL_QUADS)
    glColor3fv(color)
    for surface in surfaces:
        for vertex in surface:
            glVertex3fv(vertices[vertex])
    glEnd()
    glBegin(GL_LINES)
    glColor3fv(BLACK)
    for edge in edges:
        for vertex in edge:
            glVertex3fv(vertices[vertex])
    glEnd()
    glPopMatrix()

# 定义地板
def draw_floor():
    glBegin(GL_QUADS)
    for x in range(-200, 200, 20):
        for z in range(-200, 200, 20):
            if (x + z) % 40 == 0:
                glColor3fv(SOFT_GREEN)
            else:
                glColor3fv(SOFT_BLUE)
            glVertex3f(x, -2, z)
            glVertex3f(x + 20, -2, z)
            glVertex3f(x + 20, -2, z + 20)
            glVertex3f(x, -2, z + 20)
    glEnd()

# 定义天空
def draw_sky():
    glBegin(GL_QUADS)
    glColor3fv(SOFT_BLUE)
    for x in range(-200, 200, 20):
        for z in range(-200, 200, 20):
            if (x + z) % 40 == 0:
                glColor3fv(SOFT_BLUE)
            else:
                glColor3fv(SOFT_PURPLE)
            glVertex3f(x, 100, z)
            glVertex3f(x + 20, 100, z)
            glVertex3f(x + 20, 100, z + 20)
            glVertex3f(x, 100, z + 20)
    glEnd()

# 定义蛇类
class Snake:
    def __init__(self):
        self.size = 2
        self.body = [(0, 0, 0), (-2, 0, 0), (-4, 0, 0)]
        self.direction = (2, 0, 0)
        self.color = SOFT_GREEN
        self.direction_queue = deque()

    def move(self):
        if self.direction_queue:
            self.direction = self.direction_queue.popleft()
        head = self.body[0]
        new_head = (head[0] + self.direction[0], head[1] + self.direction[1], head[2] + self.direction[2])
        self.body = [new_head] + self.body[:-1]

    def grow(self):
        self.body.append(self.body[-1])
        self.color = random.choice(COLORS)

    def change_direction(self, direction):
        if direction == 'RIGHT' and self.direction != (-2, 0, 0):
            self.direction_queue.append((2, 0, 0))
        elif direction == 'LEFT' and self.direction != (2, 0, 0):
            self.direction_queue.append((-2, 0, 0))
        elif direction == 'UP' and self.direction != (0, -2, 0):
            self.direction_queue.append((0, 2, 0))
        elif direction == 'DOWN' and self.direction != (0, 2, 0):
            self.direction_queue.append((0, -2, 0))
        elif direction == 'FORWARD' and self.direction != (0, 0, -2):
            self.direction_queue.append((0, 0, 2))
        elif direction == 'BACKWARD' and self.direction != (0, 0, 2):
            self.direction_queue.append((0, 0, -2))

    def draw(self):
        for segment in self.body:
            draw_cube(segment, self.color)

# 定义食物类
class Food:
    def __init__(self):
        self.position = (random.randint(-20, 20) * 2, 0, random.randint(-20, 20) * 2)
        self.color = random.choice(COLORS)

    def draw(self):
        draw_cube(self.position, self.color)

    def respawn(self):
        self.position = (random.randint(-20, 20) * 2, 0, random.randint(-20, 20) * 2)
        self.color = random.choice(COLORS)

# 创建蛇和食物
snake = Snake()
food = Food()

# 初始化时钟
clock = pygame.time.Clock()

# 设置帧率
FPS = 15

# 游戏主循环
running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_RIGHT:
                snake.change_direction('RIGHT')
            elif event.key == pygame.K_LEFT:
                snake.change_direction('LEFT')
            elif event.key == pygame.K_UP:
                snake.change_direction('UP')
            elif event.key == pygame.K_DOWN:
                snake.change_direction('DOWN')
            elif event.key == pygame.K_w:
                snake.change_direction('FORWARD')
            elif event.key == pygame.K_s:
                snake.change_direction('BACKWARD')

    snake.move()

    # 检查蛇是否吃到食物
    if snake.body[0] == food.position:
        snake.grow()
        food.respawn()

    # 检查蛇是否碰到自己
    if snake.body[0] in snake.body[1:]:
        running = False

    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT)
    glClearColor(0.7, 0.9, 1, 1)  # 设置背景颜色为天空蓝

    # 获取蛇头的位置
    head_x, head_y, head_z = snake.body[0]

    # 设置相机位置，跟随蛇的头部
    camera_x = head_x - snake.direction[0] * 10
    camera_y = head_y + 10
    camera_z = head_z - snake.direction[2] * 10

    # 重置视图
    glLoadIdentity()
    gluLookAt(camera_x, camera_y, camera_z, head_x, head_y, head_z, 0, 1, 0)

    setup_view()
    draw_floor()
    draw_sky()
    snake.draw()
    food.draw()
    pygame.display.flip()
    clock.tick(FPS)

pygame.quit()
