globalThis.GomokuComputer = (() => {
  const R = globalThis.GomokuRules;
  const center = Math.floor(R.area / 2);
  const victory = 1000000;
  const twoEnds = [0, 3, 28, 335, 6500];
  const oneEnd = [0, 1, 9, 55, 490];
  const gaps = [0, 0, 0, 34, 460];
  const nearby = Array.from({ length: R.area }, (_, position) => {
    const row = Math.floor(position / R.size);
    const column = position % R.size;
    const points = [];
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const next = R.point(row + dr, column + dc);
        if (next >= 0 && next !== position) points.push(next);
      }
    }
    return points;
  });

  function candidates(game) {
    const points = new Set();
    for (const position of game.moves) {
      for (const next of nearby[position]) if (!game.board[next]) points.add(next);
    }
    return points;
  }

  function score(board, position, color) {
    let total = 0;
    const row = Math.floor(position / R.size);
    const column = position % R.size;
    for (const [dr, dc] of R.axes) {
      const line = [];
      for (let offset = -4; offset <= 4; offset++) {
        const next = R.point(row + offset * dr, column + offset * dc);
        line.push(offset === 0 ? color : next < 0 ? -1 : board[next]);
      }
      let left = 3;
      let right = 5;
      while (line[left] === color) left--;
      while (line[right] === color) right++;
      const joined = right - left - 1;
      if (joined >= 5) return victory;
      const ends = Number(line[left] === 0) + Number(line[right] === 0);
      let value = ends === 2 ? twoEnds[joined] : ends === 1 ? oneEnd[joined] : 0;
      for (let start = 0; start <= 4; start++) {
        let own = 0;
        let open = 0;
        for (let index = start; index < start + 5; index++) {
          if (line[index] === color) own++;
          else if (line[index] === 0) open++;
        }
        if (own + open === 5) value = Math.max(value, gaps[own]);
      }
      total += value;
    }
    return total;
  }

  function rank(game) {
    return [...candidates(game)].map((position) => {
      const attack = score(game.board, position, game.turn);
      const block = score(game.board, position, R.other(game.turn));
      const centrality = R.size - Math.abs(Math.floor(position / R.size) - 7) - Math.abs(position % R.size - 7);
      return { position, attack, block, value: attack + block * 0.91 + centrality / 5 };
    }).sort((a, b) => b.value - a.value || a.position - b.position);
  }

  function forecast(game, option) {
    const next = R.play(game, option.position);
    if (next.result) return victory;
    let reply = 0;
    let threats = 0;
    for (const position of candidates(next)) {
      const response = score(next.board, position, next.turn);
      if (response >= victory) return -victory;
      reply = Math.max(reply, response);
      if (score(next.board, position, game.turn) >= victory) threats++;
    }
    return option.value - reply * 1.35 + (threats >= 2 ? victory / 2 : threats * 1200);
  }

  function choose(game, level, random = Math.random) {
    if (game.result) return null;
    if (!game.moves.length) return center;
    const options = rank(game);
    const win = options.find((option) => option.attack >= victory);
    if (win) return win.position;
    const blocks = options.filter((option) => option.block >= victory);
    const possible = blocks.length ? blocks : options;
    if (level === "advanced") {
      return possible.slice(0, 7).map((option) => ({ ...option, forecast: forecast(game, option) }))
        .sort((a, b) => b.forecast - a.forecast)[0].position;
    }
    const shortlist = possible.slice(0, 3).filter((option) => option.value >= possible[0].value * 0.78);
    return shortlist[Math.floor(random() * shortlist.length)].position;
  }

  return Object.freeze({ choose });
})();
