import random
import os

def generate_tic_tac_toe_code():
    return """
class TicTacToe:
    def __init__(self):
        self.board = [' ' for _ in range(9)]
        self.current_winner = None

    def print_board(self):
        for row in [self.board[i*3:(i+1)*3] for i in range(3)]:
            print('| ' + ' | '.join(row) + ' |')

    def available_moves(self):
        return [i for i, spot in enumerate(self.board) if spot == ' ']

    def empty_squares(self):
        return ' ' in self.board

    def num_empty_squares(self):
        return self.board.count(' ')

    def make_move(self, square, letter):
        if self.board[square] == ' ':
            self.board[square] = letter
            if self.winner(square, letter):
                self.current_winner = letter
            return True
        return False

    def winner(self, square, letter):
        row_ind = square // 3
        row = self.board[row_ind*3:(row_ind+1)*3]
        if all([spot == letter for spot in row]):
            return True

        col_ind = square % 3
        column = [self.board[col_ind+i*3] for i in range(3)]
        if all([spot == letter for spot in column]):
            return True

        if square % 2 == 0:
            diagonal1 = [self.board[i] for i in [0, 4, 8]]
            if all([spot == letter for spot in diagonal1]):
                return True
            diagonal2 = [self.board[i] for i in [2, 4, 6]]
            if all([spot == letter for spot in diagonal2]):
                return True
        return False

def minimax(state, player):
    max_player = 'X'
    other_player = 'O' if player == 'X' else 'X'

    if state.current_winner == other_player:
        return {'position': None, 'score': 1 * (state.num_empty_squares() + 1) if other_player == max_player else -1 * (state.num_empty_squares() + 1)}

    elif not state.empty_squares():
        return {'position': None, 'score': 0}

    if player == max_player:
        best = {'position': None, 'score': -float('inf')}
    else:
        best = {'position': None, 'score': float('inf')}

    for possible_move in state.available_moves():
        state.make_move(possible_move, player)
        sim_score = minimax(state, other_player)

        state.board[possible_move] = ' '
        state.current_winner = None
        sim_score['position'] = possible_move

        if player == max_player:
            if sim_score['score'] > best['score']:
                best = sim_score
        else:
            if sim_score['score'] < best['score']:
                best = sim_score

    return best

def play_game():
    game = TicTacToe()
    letter = 'X'

    while game.empty_squares():
        if letter == 'O':
            square = minimax(game, 'O')['position']
        else:
            square = int(input(f"{letter}'s turn. Input move (0-8): "))

        if game.make_move(square, letter):
            print(f'{letter} makes a move to square {square}')
            game.print_board()
            print('')

            if game.current_winner:
                print(f'{letter} wins!')
                return
            letter = 'O' if letter == 'X' else 'X'
        else:
            print('Invalid move. Try again.')

    print('It\'s a tie!')

if __name__ == '__main__':
    play_game()
"""

def generate_number_guessing_game_code():
    return """
import random

def play_game():
    number_to_guess = random.randint(1, 100)
    attempts = 0

    while True:
        guess = int(input("Guess the number (between 1 and 100): "))
        attempts += 1
        if guess < number_to_guess:
            print("Too low!")
        elif guess > number_to_guess:
            print("Too high!")
        else:
            print(f"Congratulations! You've guessed the number in {attempts} attempts.")
            break

if __name__ == '__main__':
    play_game()
"""

def generate_game_documentation(game_name, game_code):
    documentation = f"""
# {game_name} Game Documentation

## How to Play
- Follow the prompts in the terminal to play the game.

## Example Code
```python
{game_code}
"""
    return documentation

def create_game_and_documentation():
    games = {
"TicTacToe": generate_tic_tac_toe_code,
"NumberGuessing": generate_number_guessing_game_code
}
    game_name = random.choice(list(games.keys()))
    game_code = game_name
    game_doc = generate_game_documentation(game_name, game_code)
    game_file_name = f"{game_name.lower()}.py"
    doc_file_name = f"{game_name.lower()}_documentation.md"

    with open(game_file_name, "w") as code_file:
        code_file.write(game_code)

    with open(doc_file_name, "w") as doc_file:
        doc_file.write(game_doc)

    print(f"{game_name} game and documentation have been generated.")

if __name__ == 'main':
    create_game_and_documentation()