import math
import matplotlib.pyplot as plt

def calculate_pi(n):
    sum = 0
    for k in range(n):
        numerator = math.factorial(4*k) * (1103 + 26390*k)
        denominator = (math.factorial(k) ** 4) * (396 ** (4*k))
        sum += numerator / denominator
    pi_approx = (2 * math.sqrt(2) / 9801) * sum
    pi_approx = 1 / pi_approx
    return pi_approx

def play_pi_game():
    print("欢迎来到π近似计算游戏!")
    print("通过输入项数来计算π的近似值，并可视化结果。")
    
    while True:
        try:
            n = int(input("请输入项数 (输入0退出游戏): "))
            if n == 0:
                break
            
            # 计算π近似值
            pi_approx = calculate_pi(n)
            pi_error = abs(math.pi - pi_approx)
            
            # 打印结果
            print(f"计算出的π近似值为: {pi_approx}")
            print(f"与实际π值的差距为: {pi_error}\n")
            
            # 可视化
            plot_pi_approximation(n, pi_approx, pi_error)
            
        except ValueError:
            print("请输入一个有效的整数。\n")

def plot_pi_approximation(n, pi_approx, pi_error):
    plt.figure(figsize=(10, 6))
    
    # 绘制实际π值的水平线
    plt.axhline(y=math.pi, color='r', linestyle='-', label='实际π值')
    
    # 绘制计算出的π近似值
    plt.plot(n, pi_approx, 'bo', label='计算的π值')
    
    # 设置图表标题和标签
    plt.title(f'项数: {n}, 计算的π值: {pi_approx:.15f}, 差距: {pi_error:.15f}')
    plt.xlabel('项数')
    plt.ylabel('π值')
    
    # 添加图例
    plt.legend()
    
    # 显示图表
    plt.show()

if __name__ == "__main__":
    play_pi_game()
