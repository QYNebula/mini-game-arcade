globalThis.GomokuRules = (() => {
  const size = 15;
  const area = size * size;
  const black = 1;
  const white = 2;
  const axes = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const other = (color) => color === black ? white : black;

  function point(row, column) {
    return row >= 0 && row < size && column >= 0 && column < size ? row * size + column : -1;
  }

  function winningLine(board, position, color) {
    const row = Math.floor(position / size);
    const column = position % size;
    for (const [dr, dc] of axes) {
      const line = [position];
      for (const direction of [1, -1]) {
        for (let step = 1; step < size; step++) {
          const next = point(row + step * direction * dr, column + step * direction * dc);
          if (next < 0 || board[next] !== color) break;
          if (direction === 1) line.push(next);
          else line.unshift(next);
        }
      }
      if (line.length >= 5) return line;
    }
    return null;
  }

  function fresh() {
    return { board: Array(area).fill(0), moves: [], turn: black, result: null };
  }

  function play(game, position) {
    if (game.result || !Number.isInteger(position) || position < 0 || position >= area || game.board[position]) return null;
    const board = game.board.slice();
    const moves = [...game.moves, position];
    board[position] = game.turn;
    const line = winningLine(board, position, game.turn);
    const result = line ? { winner: game.turn, line } : moves.length === area ? { winner: 0, line: [] } : null;
    return { board, moves, turn: other(game.turn), result };
  }

  function restore(moves) {
    if (!Array.isArray(moves) || moves.length > area) return null;
    let game = fresh();
    for (const position of moves) {
      game = play(game, position);
      if (!game) return null;
    }
    return game;
  }

  return Object.freeze({ size, area, black, white, axes, other, point, fresh, play, restore });
})();
