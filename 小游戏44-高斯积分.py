import numpy as np
import scipy.integrate as integrate
import matplotlib.pyplot as plt
import tkinter as tk
from tkinter import messagebox

def gaussian_function(x):
    return np.exp(-x**2)

def numerical_integration(a, b, n=1000):
    x = np.linspace(a, b, n)
    y = gaussian_function(x)
    integral = integrate.simps(y, x)
    return integral, x, y

def plot_gaussian(a, b, x, y, result):
    plt.figure(figsize=(10, 6))
    plt.plot(x, y, label='$e^{-x^2}$')
    plt.fill_between(x, y, where=[(xi >= a) and (xi <= b) for xi in x], color='skyblue', alpha=0.4)
    plt.title(f'Gaussian Integral from {a} to {b}\nResult: {result:.4f}')
    plt.xlabel('x')
    plt.ylabel('$e^{-x^2}$')
    plt.legend()
    plt.grid(True)
    plt.show()

def calculate_integral():
    try:
        a = float(entry_a.get())
        b = float(entry_b.get())
        result, x, y = numerical_integration(a, b)
        messagebox.showinfo("积分结果", f"积分结果在区间 [{a}, {b}] 为: {result:.4f}")
        plot_gaussian(a, b, x, y, result)
    except ValueError:
        messagebox.showerror("输入错误", "请输入有效的数字。")

# 创建主窗口
root = tk.Tk()
root.title("高斯积分计算器")

# 创建标签和输入框
label_a = tk.Label(root, text="请输入积分下限 a:")
label_a.pack()
entry_a = tk.Entry(root)
entry_a.pack()

label_b = tk.Label(root, text="请输入积分上限 b:")
label_b.pack()
entry_b = tk.Entry(root)
entry_b.pack()

# 创建计算按钮
button_calculate = tk.Button(root, text="计算积分", command=calculate_integral)
button_calculate.pack()

# 运行主循环
root.mainloop()
