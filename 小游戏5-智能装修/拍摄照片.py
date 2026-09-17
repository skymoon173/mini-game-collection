import cv2

def capture_photo():
    cap = cv2.VideoCapture(0)  # 打开摄像头
    ret, frame = cap.read()    # 读取一帧
    cap.release()              # 释放摄像头
    if ret:
        cv2.imwrite('house.jpg', frame)  # 保存照片
        return 'house.jpg'
    else:
        print("摄像头读取失败")
        return None

photo_path = capture_photo()
if photo_path:
    print(f"照片已保存到 {photo_path}")
else:
    print("拍照失败")
