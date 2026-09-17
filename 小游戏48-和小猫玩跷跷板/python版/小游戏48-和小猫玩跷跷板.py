import pygame
import pymunk
import pymunk.pygame_util
import sys

# 初始化Pygame和Pymunk
pygame.init()
pygame.display.set_caption("跷跷板游戏")

# 设置屏幕尺寸和颜色
screen_width = 800
screen_height = 600
screen = pygame.display.set_mode((screen_width, screen_height))

# 定义颜色
WHITE = (255, 255, 255, 255)
BLACK = (0, 0, 0, 255)
RED = (255, 0, 0, 255)
BLUE = (0, 0, 255, 255)

# 创建Pymunk空间
space = pymunk.Space()
space.gravity = (0, 900)  # 向下的重力

# 创建跷跷板
seesaw_body = pymunk.Body()
seesaw_body.position = (screen_width // 2, screen_height // 2)
seesaw_shape = pymunk.Segment(seesaw_body, (-300, 0), (300, 0), 20)
seesaw_shape.density = 1
seesaw_shape.friction = 1
space.add(seesaw_body, seesaw_shape)

# 创建跷跷板支点
pivot_body = pymunk.Body(body_type=pymunk.Body.STATIC)
pivot_body.position = seesaw_body.position
pivot_joint = pymunk.PivotJoint(pivot_body, seesaw_body, (screen_width // 2, screen_height // 2))
space.add(pivot_body, pivot_joint)

# 添加三角形支点
pivot_shape = pymunk.Poly(pivot_body, [(20, 20), (-20, 20), (0, -20)])
pivot_shape.color = BLACK
space.add(pivot_shape)

# 创建玩家和小猫
def create_character(position, color, radius=25, mass=100):
    body = pymunk.Body(mass, pymunk.moment_for_circle(mass, 0, radius))
    body.position = position
    shape = pymunk.Circle(body, radius)
    shape.elasticity = 0.5
    shape.color = color
    space.add(body, shape)
    return body, shape

player_body, player_shape = create_character((screen_width // 2 - 200, screen_height // 2 - 50), RED)
cat_body, cat_shape = create_character((screen_width // 2 + 200, screen_height // 2 - 50), BLUE)

# 创建Pymunk绘图工具
draw_options = pymunk.pygame_util.DrawOptions(screen)

# 游戏主循环
running = True
clock = pygame.time.Clock()

def apply_force(body, force):
    body.apply_force_at_local_point(force, (0, 0))

while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    keys = pygame.key.get_pressed()
    if keys[pygame.K_LEFT]:
        player_body.apply_impulse_at_local_point((-1000, 0))
    if keys[pygame.K_RIGHT]:
        player_body.apply_impulse_at_local_point((1000, 0))
    if keys[pygame.K_a]:
        cat_body.apply_impulse_at_local_point((-1000, 0))
    if keys[pygame.K_d]:
        cat_body.apply_impulse_at_local_point((1000, 0))
    if keys[pygame.K_w]:  # 增大小猫重量
        cat_body.mass += 10
        cat_body.moment = pymunk.moment_for_circle(cat_body.mass, 0, cat_shape.radius)
    if keys[pygame.K_s]:  # 减小小猫重量
        cat_body.mass = max(10, cat_body.mass - 10)
        cat_body.moment = pymunk.moment_for_circle(cat_body.mass, 0, cat_shape.radius)
    if keys[pygame.K_q]:  # 增大小猫大小
        cat_shape.unsafe_set_radius(cat_shape.radius + 1)
    if keys[pygame.K_e]:  # 减小小猫大小
        cat_shape.unsafe_set_radius(max(1, cat_shape.radius - 1))

    # 清屏
    screen.fill(WHITE)
    
    # 绘制Pymunk对象
    space.debug_draw(draw_options)
    
    # 更新物理空间
    space.step(1/60.0)
    
    # 检查跷跷板平衡状态
    if seesaw_body.angle > 0.5:
        print("小猫胜利了！")
        running = False
    elif seesaw_body.angle < -0.5:
        print("玩家胜利了！")
        running = False

    # 更新屏幕
    pygame.display.flip()
    clock.tick(60)

pygame.quit()
sys.exit()
