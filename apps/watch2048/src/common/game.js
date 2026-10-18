// Pure, bounded 4x4 logic. No rendering, timers, storage or random spawns in a pass.
export const SIZE = 4;
export const DIRECTIONS = ['left', 'right', 'up', 'down'];
export function isValidBoard(board) {
  return Array.isArray(board) && board.length === 16 && board.every(n =>
    Number.isInteger(n) && (n === 0 || (n >= 2 && n <= 1073741824 && (n & (n - 1)) === 0)));
}
export function addTile(board, random = Math.random) {
  const empty = [];
  for (let i = 0; i < 16; i++) if (board[i] === 0) empty.push(i);
  if (!empty.length) return -1;
  const index = empty[Math.min(empty.length - 1, Math.floor(random() * empty.length))];
  board[index] = random() < 0.9 ? 2 : 4;
  return index;
}
export function newGame(random = Math.random) {
  const board = Array(16).fill(0);
  addTile(board, random); addTile(board, random);
  return board;
}
export function isGameOver(board) {
  for (let i = 0; i < 16; i++) {
    if (board[i] === 0) return false;
    if (i % 4 < 3 && board[i] === board[i + 1]) return false;
    if (i < 12 && board[i] === board[i + 4]) return false;
  }
  return true;
}
export function slide(board, direction) {
  if (DIRECTIONS.indexOf(direction) < 0) throw new Error('Invalid direction');
  const next = Array(16).fill(0), motions = [], merged = [];
  let gained = 0;
  for (let line = 0; line < 4; line++) {
    const indexes = [];
    for (let step = 0; step < 4; step++) {
      const p = direction === 'right' || direction === 'down' ? 3 - step : step;
      indexes.push(direction === 'left' || direction === 'right' ? line * 4 + p : p * 4 + line);
    }
    const sources = indexes.filter(i => board[i] !== 0);
    let target = 0;
    for (let i = 0; i < sources.length; i++) {
      const from = sources[i], to = indexes[target++];
      let value = board[from];
      motions.push({from, to});
      if (i + 1 < sources.length && value === board[sources[i + 1]]) {
        motions.push({from: sources[++i], to});
        value *= 2; gained += value; merged.push(to);
      }
      next[to] = value;
    }
  }
  return {board: next, gained, merged, motions, moved: next.some((n, i) => n !== board[i])};
}
export function planMove(board, direction, chain = false) {
  const frames = [];
  let current = board, gained = 0;
  // Four tiles per line can merge at most three times. Never an unbounded loop.
  for (let pass = 0; pass < (chain ? 3 : 1); pass++) {
    const result = slide(current, direction);
    if (!result.moved) break;
    frames.push({before: current, ...result});
    current = result.board; gained += result.gained;
    if (result.gained === 0) break;
  }
  return {board: current.slice(), gained, moved: frames.length > 0, frames};
}
export function move(board, direction, random = Math.random, chain = false) {
  const result = planMove(board, direction, chain);
  result.spawned = result.moved ? addTile(result.board, random) : -1;
  return result;
}
