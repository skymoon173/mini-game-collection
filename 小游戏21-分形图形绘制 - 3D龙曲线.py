import matplotlib.pyplot as plt
import numpy as np
import time

def dragon_curve_3d(ax, p1, p2, depth, delay):
    if depth == 0:
        ax.plot([p1[0], p2[0]], [p1[1], p2[1]], [p1[2], p2[2]], color='b')
        plt.draw()
        plt.pause(delay)  # Add delay to see drawing process
    else:
        mid = (p1 + p2) / 2
        direction = np.cross(p2 - p1, np.array([0, 0, 1]))
        direction = direction / np.linalg.norm(direction) * np.linalg.norm(p2 - p1) / 2
        mid = mid + direction
        dragon_curve_3d(ax, p1, mid, depth - 1, delay)
        dragon_curve_3d(ax, mid, p2, depth - 1, delay)

def draw_dragon_curve_3d(depth, delay):
    fig = plt.figure()
    ax = fig.add_subplot(111, projection='3d')

    # Define initial points
    p1 = np.array([0, 0, 0], dtype=float)
    p2 = np.array([1, 0, 0], dtype=float)

    # Draw the 3D dragon curve
    dragon_curve_3d(ax, p1, p2, depth, delay)

    # Set the aspect ratio
    ax.set_aspect('auto')

    # Set plot limits
    ax.set_xlim([-1, 2])
    ax.set_ylim([-1, 1])
    ax.set_zlim([-1, 1])

    plt.show()

# Draw a 3D dragon curve with a specified depth and delay
draw_dragon_curve_3d(10, 0.1)
