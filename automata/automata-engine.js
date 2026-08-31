/* automata/automata-engine.js
   Чистая логика клеточного автомата: сетка, соседи, правило, шаг.
   Без DOM — грузится в браузере через <script> и требуется в Node для тестов. */

const NEIGHBOR_OFFSETS = {
  moore: [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1],
  ],
  vonneumann: [
    [0, -1],
    [-1, 0], [1, 0],
    [0, 1],
  ],
};

function createGrid(size) {
  return new Uint8Array(size * size);
}

function gridIndex(x, y, size) {
  return y * size + x;
}

function countNeighbors(grid, x, y, size, neighborhood, boundary) {
  const offsets = NEIGHBOR_OFFSETS[neighborhood];
  let count = 0;
  for (const [dx, dy] of offsets) {
    let nx = x + dx;
    let ny = y + dy;
    if (boundary === 'wrap') {
      nx = (nx + size) % size;
      ny = (ny + size) % size;
    } else if (nx < 0 || ny < 0 || nx >= size || ny >= size) {
      continue;
    }
    count += grid[gridIndex(nx, ny, size)];
  }
  return count;
}

function createRule(birthCounts, survivalCounts) {
  const birth = new Array(9).fill(false);
  const survival = new Array(9).fill(false);
  for (const count of birthCounts) birth[count] = true;
  for (const count of survivalCounts) survival[count] = true;
  return { birth, survival };
}

function stepGrid(grid, size, rule, neighborhood, boundary) {
  const next = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = gridIndex(x, y, size);
      const alive = grid[index] === 1;
      const count = countNeighbors(grid, x, y, size, neighborhood, boundary);
      next[index] = (alive ? rule.survival[count] : rule.birth[count]) ? 1 : 0;
    }
  }
  return next;
}

function randomRule(density = 0.5) {
  const birth = new Array(9).fill(false).map(() => Math.random() < density);
  const survival = new Array(9).fill(false).map(() => Math.random() < density);
  return { birth, survival };
}

function ruleToString(rule) {
  const birth = rule.birth
    .map((on, count) => (on ? count : null))
    .filter((count) => count !== null)
    .join('');
  const survival = rule.survival
    .map((on, count) => (on ? count : null))
    .filter((count) => count !== null)
    .join('');
  return `B${birth}/S${survival}`;
}

const AutomataEngine = {
  NEIGHBOR_OFFSETS,
  createGrid,
  gridIndex,
  countNeighbors,
  createRule,
  stepGrid,
  randomRule,
  ruleToString,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AutomataEngine;
} else {
  window.AutomataEngine = AutomataEngine;
}
