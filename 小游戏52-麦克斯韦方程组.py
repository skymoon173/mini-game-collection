import numpy as np
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from mpl_toolkits.mplot3d import Axes3D

# 设置常量
c = 3e8  # 光速，单位：m/s
frequency = 1e9  # 频率，单位：Hz
wavelength = c / frequency  # 波长，单位：m
k = 2 * np.pi / wavelength  # 波数
omega = 2 * np.pi * frequency  # 角频率

# 设置空间和时间网格
z = np.linspace(0, 2 * wavelength, 100)
x = np.linspace(-1, 1, 10)
y = np.linspace(-1, 1, 10)
t = np.linspace(0, 1 / frequency, 200)  # 时间点
X, Z = np.meshgrid(x, z)
Y, Z = np.meshgrid(y, z)

# 创建图形和轴
fig = plt.figure()
ax = fig.add_subplot(111, projection='3d')

# 设置轴限制
ax.set_xlim(-1, 1)
ax.set_ylim(-1, 1)
ax.set_zlim(0, 2 * wavelength)
ax.set_xlabel('X')
ax.set_ylabel('Y')
ax.set_zlabel('Z')

# 初始化电场和磁场的矢量
quiver_E = ax.quiver(X, np.zeros_like(X), Z, np.zeros_like(X), np.zeros_like(X), np.zeros_like(Z), color='b', length=0.1, normalize=True)
quiver_B = ax.quiver(np.zeros_like(Y), Y, Z, np.zeros_like(Y), np.zeros_like(Y), np.zeros_like(Z), color='r', length=0.1, normalize=True)

# 动画更新函数
def update(frame):
    global quiver_E, quiver_B
    
    E = np.sin(k * Z - omega * t[frame])
    B = np.sin(k * Z - omega * t[frame] + np.pi / 2)  # B场与E场相位差90度
    
    # 移除之前的矢量图
    if quiver_E:
        quiver_E.remove()
    if quiver_B:
        quiver_B.remove()
    
    # 绘制新的矢量图
    quiver_E = ax.quiver(X, np.zeros_like(X), Z, E, np.zeros_like(E), np.zeros_like(Z), color='b', length=0.1, normalize=True)
    quiver_B = ax.quiver(np.zeros_like(Y), Y, Z, np.zeros_like(B), B, np.zeros_like(Z), color='r', length=0.1, normalize=True)
    
    return quiver_E, quiver_B

# 创建动画
ani = animation.FuncAnimation(fig, update, frames=len(t), blit=False)

# 展示动画
plt.show()
