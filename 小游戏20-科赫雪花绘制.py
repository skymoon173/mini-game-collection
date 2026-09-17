import turtle
import math

def koch_curve(t, x1, y1, x2, y2, depth):
    if depth == 0:
        t.penup()
        t.goto(x1, y1)
        t.pendown()
        t.goto(x2, y2)
    else:
        # Calculate the points of the segment
        deltaX = x2 - x1
        deltaY = y2 - y1
        xA = x1 + deltaX / 3
        yA = y1 + deltaY / 3
        xB = x1 + 2 * deltaX / 3
        yB = y1 + 2 * deltaY / 3
        xC = (x1 + x2) / 2 + (y1 - y2) * math.sqrt(3) / 6
        yC = (y1 + y2) / 2 + (x2 - x1) * math.sqrt(3) / 6

        # Recursively draw the segments
        koch_curve(t, x1, y1, xA, yA, depth - 1)
        koch_curve(t, xA, yA, xC, yC, depth - 1)
        koch_curve(t, xC, yC, xB, yB, depth - 1)
        koch_curve(t, xB, yB, x2, y2, depth - 1)

def draw_koch_snowflake(depth):
    t = turtle.Turtle()
    t.speed(0)  # Fastest drawing

    # Length of each side of the initial triangle
    side_length = 300

    # Calculate the initial points of the triangle
    height = side_length * math.sqrt(3) / 2
    p1 = (-side_length / 2, -height / 3)
    p2 = (side_length / 2, -height / 3)
    p3 = (0, 2 * height / 3)

    # Draw the three sides of the initial triangle
    koch_curve(t, *p1, *p2, depth)
    koch_curve(t, *p2, *p3, depth)
    koch_curve(t, *p3, *p1, depth)

    turtle.done()

# Draw a Koch snowflake with a specified depth
draw_koch_snowflake(4)
