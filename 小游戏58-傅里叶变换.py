import numpy as np
import matplotlib.pyplot as plt

# 生成一个简单的信号，例如一个正弦波加上噪声
Fs = 500  # 采样频率
T = 1.0 / Fs  # 采样间隔
L = 1000  # 信号长度
t = np.linspace(0.0, L*T, L, endpoint=False)  # 时间向量
f1 = 50.0  # 信号频率
x = 0.7 * np.sin(2.0 * np.pi * f1 * t) + 0.5 * np.random.randn(L)

# 计算FFT
yf = np.fft.fft(x)
xf = np.fft.fftfreq(L, T)[:L//2]

# 绘制信号及其频谱
plt.figure(figsize=(12, 6))

plt.subplot(2, 1, 1)
plt.plot(t, x)
plt.title('时间域信号')
plt.xlabel('时间 (s)')
plt.ylabel('振幅')

plt.subplot(2, 1, 2)
plt.plot(xf, 2.0/L * np.abs(yf[:L//2]))
plt.title('频域信号')
plt.xlabel('频率 (Hz)')
plt.ylabel('振幅')

plt.tight_layout()
plt.show()
