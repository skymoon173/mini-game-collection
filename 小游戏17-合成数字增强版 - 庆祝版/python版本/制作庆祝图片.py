from PIL import Image, ImageDraw

def create_fireworks_frame(draw, center, colors, size=64):
    """绘制单个鞭炮帧"""
    for i, color in enumerate(colors):
        radius = (i + 1) * (size // (2 * len(colors)))
        draw.ellipse((center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius), outline=color, width=2)

def create_fireworks_image(filename):
    """创建鞭炮动画图像"""
    frames = 4
    size = 64
    colors = ['red', 'yellow', 'orange', 'white']
    img = Image.new('RGBA', (size * frames, size), (0, 0, 0, 0))

    for i in range(frames):
        frame = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(frame)
        create_fireworks_frame(draw, (size // 2, size // 2), colors[:i + 1])
        img.paste(frame, (i * size, 0))

    img.save(filename)

# 生成 fireworks.png
create_fireworks_image('fireworks.png')
