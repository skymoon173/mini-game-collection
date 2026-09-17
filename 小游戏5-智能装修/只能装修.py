import cv2
import numpy as np

def apply_renovation_effects(photo_path):
    image = cv2.imread(photo_path)
    if image is None:
        print("无法读取照片")
        return

    # 模拟墙壁颜色变化
    # 创建一个颜色遮罩
    mask = np.zeros_like(image)
    mask[:] = [0, 128, 255]  # BGR 颜色值
    alpha = 0.5  # 透明度
    image = cv2.addWeighted(mask, alpha, image, 1 - alpha, 0)

    # 添加简单的家具效果（例如矩形表示的桌子）
    start_point = (50, 200)
    end_point = (200, 300)
    color = (0, 255, 0)  # 绿色
    thickness = -1  # 填充矩形
    image = cv2.rectangle(image, start_point, end_point, color, thickness)

    # 显示效果图
    cv2.imshow('Renovated Room', image)
    cv2.imwrite('renovated_room.jpg', image)  # 保存效果图
    cv2.waitKey(0)
    cv2.destroyAllWindows()

photo_path = 'house.jpg'  # 假设你已经拍摄并保存了照片
apply_renovation_effects(photo_path)
