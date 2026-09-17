from PIL import Image, ImageDraw

# 创建飞机图像
def create_player_image():
    player_image = Image.new("RGBA", (50, 50), (0, 0, 0, 0))
    draw = ImageDraw.Draw(player_image)
    # 绘制一个绿色的三角形代表飞机
    draw.polygon([(25, 0), (0, 50), (50, 50)], fill="green")
    player_image.save("player.png")

# 创建敌人图像
def create_enemy_image():
    enemy_image = Image.new("RGBA", (50, 50), (0, 0, 0, 0))
    draw = ImageDraw.Draw(enemy_image)
    # 绘制一个红色的矩形代表敌人
    draw.rectangle([(0, 0), (50, 50)], fill="red")
    enemy_image.save("enemy.png")

create_player_image()
create_enemy_image()
