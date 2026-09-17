from PIL import Image, ImageDraw

def create_farmer_image(filename):
    # 创建一个白色背景的图像
    img = Image.new('RGBA', (100, 100), 'white')
    draw = ImageDraw.Draw(img)
    
    # 绘制头部
    draw.ellipse((35, 10, 65, 40), fill='peachpuff', outline='black')
    
    # 绘制身体
    draw.rectangle((40, 40, 60, 80), fill='blue', outline='black')
    
    # 绘制手臂
    draw.line((40, 50, 30, 70), fill='peachpuff', width=5)
    draw.line((60, 50, 70, 70), fill='peachpuff', width=5)
    
    # 绘制腿
    draw.line((45, 80, 45, 100), fill='black', width=5)
    draw.line((55, 80, 55, 100), fill='black', width=5)
    
    # 绘制帽子
    draw.rectangle((30, 0, 70, 10), fill='brown', outline='black')
    draw.rectangle((25, 10, 75, 20), fill='brown', outline='black')

    # 保存图像
    img.save(filename)

# 生成 farmer.png
create_farmer_image('farmer.png')
