import "../../games/gomoku/rules.js";
import "../../games/gomoku/computer.js";

const rules = globalThis.GomokuRules;
const computer = globalThis.GomokuComputer;

export const games = Object.freeze({
  gomoku: {
    seats: 2,
    start: rules.fresh,
    turn: (state) => state.turn - 1,
    move: (state, action) => rules.play(state, action.position),
    computer: (state, level) => rules.play(state, computer.choose(state, level)),
    finished: (state) => Boolean(state.result),
    view: (state) => ({ moves: state.moves }),
  },
});
