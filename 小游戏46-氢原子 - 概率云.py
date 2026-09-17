import numpy as np
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
from matplotlib.animation import FuncAnimation

# 设置随机种子以使结果可重复
np.random.seed(0)

# 定义氢原子1s轨道的概率密度函数
def hydrogen_1s_density(r):
    # 1s轨道的概率密度函数（未归一化）
    return np.exp(-2 * r)

# 生成随机样本点
def generate_samples(num_samples):
    # 生成球坐标系中的随机点
    theta = np.random.uniform(0, 2 * np.pi, num_samples)
    phi = np.random.uniform(0, np.pi, num_samples)
    r = np.random.exponential(scale=0.5, size=num_samples)  # 使用指数分布生成半径

    # 转换为笛卡尔坐标
    x = r * np.sin(phi) * np.cos(theta)
    y = r * np.sin(phi) * np.sin(theta)
    z = r * np.cos(phi)
    return x, y, z

# 创建3D图形
fig = plt.figure()
ax = fig.add_subplot(111, projection='3d')

# 设置图形的范围
ax.set_xlim([-5, 5])
ax.set_ylim([-5, 5])
ax.set_zlim([-5, 5])

# 生成初始样本点
num_samples = 1000
x, y, z = generate_samples(num_samples)
scat = ax.scatter(x, y, z, c='b', marker='o', s=1, alpha=0.5)

# 定义动画函数
def animate(i):
    # 生成新的样本点
    x, y, z = generate_samples(num_samples)
    scat._offsets3d = (x, y, z)
    return scat,

# 创建动画
ani = FuncAnimation(fig, animate, frames=200, interval=50, blit=True)

# 显示图形
plt.show()
