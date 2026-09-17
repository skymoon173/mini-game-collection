import numpy as np
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
from matplotlib.animation import FuncAnimation

# 创建3D图形
fig = plt.figure()
ax = fig.add_subplot(111, projection='3d')

# 设置图形的范围
ax.set_xlim([-1, 1])
ax.set_ylim([-1, 1])
ax.set_zlim([-1, 1])

# 添加原子核 (球体)
u = np.linspace(0, 2 * np.pi, 100)
v = np.linspace(0, np.pi, 100)
x = 0.1 * np.outer(np.cos(u), np.sin(v))
y = 0.1 * np.outer(np.sin(u), np.sin(v))
z = 0.1 * np.outer(np.ones(np.size(u)), np.cos(v))
ax.plot_surface(x, y, z, color='r')

# 初始化电子轨道 (圆环)
theta = np.linspace(0, 2 * np.pi, 100)
x = np.cos(theta)
y = np.sin(theta)
z = np.zeros_like(theta)
electron, = ax.plot(x, y, z, label='Electron Orbit')

# 定义动画函数
def animate(i):
    # 更新电子的位置
    x = np.cos(theta + i * 0.1)
    y = np.sin(theta + i * 0.1)
    electron.set_data(x, y)
    electron.set_3d_properties(np.zeros_like(theta))
    return electron,

# 创建动画
ani = FuncAnimation(fig, animate, frames=200, interval=50, blit=True)

# 添加图例
ax.legend()

# 显示图形
plt.show()
