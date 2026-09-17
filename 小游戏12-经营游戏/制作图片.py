from PIL import Image, ImageDraw

def create_wheat_image(filename):
    # 创建一个白色背景的图像
    img = Image.new('RGBA', (100, 100), 'white')
    draw = ImageDraw.Draw(img)

    # 绘制小麦的茎
    draw.line((50, 20, 50, 80), fill='green', width=5)
    
    # 绘制小麦的穗
    for i in range(20, 60, 10):
        draw.ellipse((40, i, 60, i+20), fill='gold')

    # 保存图像
    img.save(filename)

def create_corn_image(filename):
    # 创建一个白色背景的图像
    img = Image.new('RGBA', (100, 100), 'white')
    draw = ImageDraw.Draw(img)

    # 绘制玉米的茎
    draw.line((50, 20, 50, 80), fill='green', width=5)
    
    # 绘制玉米棒
    draw.ellipse((40, 40, 60, 80), fill='yellow')

    # 绘制玉米叶
    draw.polygon([(50, 30), (30, 50), (50, 50)], fill='green')
    draw.polygon([(50, 30), (70, 50), (50, 50)], fill='green')

    # 保存图像
    img.save(filename)

# 生成 wheat.png 和 corn.png
create_wheat_image('wheat.png')
create_corn_image('corn.png')
