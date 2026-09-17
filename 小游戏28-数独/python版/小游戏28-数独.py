import tkinter as tk
from tkinter import messagebox
import random

class SudokuGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Sudoku")
        self.board = [[0]*9 for _ in range(9)]
        self.entries = [[None]*9 for _ in range(9)]
        self.create_widgets()
        self.generate_sudoku()

    def create_widgets(self):
        for i in range(9):
            for j in range(9):
                self.entries[i][j] = tk.Entry(self.root, width=3, font=('Arial', 18), justify='center')
                self.entries[i][j].grid(row=i, column=j, padx=5, pady=5)

        self.validate_button = tk.Button(self.root, text="Validate", command=self.validate_sudoku)
        self.validate_button.grid(row=9, column=0, columnspan=3)

        self.solve_button = tk.Button(self.root, text="Solve", command=self.solve_sudoku)
        self.solve_button.grid(row=9, column=3, columnspan=3)

        self.new_game_button = tk.Button(self.root, text="New Game", command=self.generate_sudoku)
        self.new_game_button.grid(row=9, column=6, columnspan=3)

    def generate_sudoku(self):
        self.board = [[0]*9 for _ in range(9)]
        self.fill_board()
        self.remove_numbers()
        self.update_entries()

    def fill_board(self):
        def is_valid(board, row, col, num):
            for i in range(9):
                if board[row][i] == num or board[i][col] == num:
                    return False
            start_row, start_col = 3 * (row // 3), 3 * (col // 3)
            for i in range(3):
                for j in range(3):
                    if board[start_row + i][start_col + j] == num:
                        return False
            return True

        def solve(board):
            for row in range(9):
                for col in range(9):
                    if board[row][col] == 0:
                        for num in range(1, 10):
                            if is_valid(board, row, col, num):
                                board[row][col] = num
                                if solve(board):
                                    return True
                                board[row][col] = 0
                        return False
            return True

        self.board = [[0]*9 for _ in range(9)]
        for i in range(9):
            num = random.randint(1, 9)
            while not is_valid(self.board, i // 3 * 3 + i % 3, i // 3 * 3 + i // 3, num):
                num = random.randint(1, 9)
            self.board[i // 3 * 3 + i % 3][i // 3 * 3 + i // 3] = num
        solve(self.board)

    def remove_numbers(self, num_holes=40):
        holes_made = 0
        while holes_made < num_holes:
            row = random.randint(0, 8)
            col = random.randint(0, 8)
            if self.board[row][col] != 0:
                self.board[row][col] = 0
                holes_made += 1

    def update_entries(self):
        for i in range(9):
            for j in range(9):
                if self.board[i][j] == 0:
                    self.entries[i][j].delete(0, tk.END)
                    self.entries[i][j].config(state=tk.NORMAL)
                else:
                    self.entries[i][j].delete(0, tk.END)
                    self.entries[i][j].insert(0, str(self.board[i][j]))
                    self.entries[i][j].config(state=tk.DISABLED)

    def validate_sudoku(self):
        def is_valid_move(board, row, col, num):
            for i in range(9):
                if board[row][i] == num or board[i][col] == num:
                    return False
            start_row, start_col = 3 * (row // 3), 3 * (col // 3)
            for i in range(3):
                for j in range(3):
                    if board[start_row + i][start_col + j] == num:
                        return False
            return True

        for i in range(9):
            for j in range(9):
                if self.entries[i][j].get():
                    num = int(self.entries[i][j].get())
                    self.board[i][j] = num
                else:
                    self.board[i][j] = 0

        for i in range(9):
            for j in range(9):
                num = self.board[i][j]
                if num != 0:
                    self.board[i][j] = 0
                    if not is_valid_move(self.board, i, j, num):
                        messagebox.showerror("Error", f"Invalid move at row {i+1}, column {j+1}")
                        self.board[i][j] = num
                        return
                    self.board[i][j] = num
        messagebox.showinfo("Success", "The Sudoku puzzle is valid!")

    def solve_sudoku(self):
        def is_valid(board, row, col, num):
            for i in range(9):
                if board[row][i] == num or board[i][col] == num:
                    return False
            start_row, start_col = 3 * (row // 3), 3 * (col // 3)
            for i in range(3):
                for j in range(3):
                    if board[start_row + i][start_col + j] == num:
                        return False
            return True

        def solve(board):
            for row in range(9):
                for col in range(9):
                    if board[row][col] == 0:
                        for num in range(1, 10):
                            if is_valid(board, row, col, num):
                                board[row][col] = num
                                if solve(board):
                                    return True
                                board[row][col] = 0
                        return False
            return True

        self.board = [[int(self.entries[i][j].get()) if self.entries[i][j].get() else 0 for j in range(9)] for i in range(9)]
        solve(self.board)
        self.update_entries()

if __name__ == "__main__":
    root = tk.Tk()
    gui = SudokuGUI(root)
    root.mainloop()
