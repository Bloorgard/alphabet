const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createGrid,
  gridIndex,
  countNeighbors,
  createRule,
  stepGrid,
  randomRule,
  ruleToString,
} = require('./automata-engine.js');

test('countNeighbors: moore, wrap — противоположный край соседствует', () => {
  const grid = createGrid(3);
  grid[gridIndex(0, 0, 3)] = 1;
  const count = countNeighbors(grid, 2, 2, 3, 'moore', 'wrap');
  assert.equal(count, 1);
});

test('countNeighbors: moore, clamp — за краем соседей нет', () => {
  const grid = createGrid(3);
  grid[gridIndex(0, 0, 3)] = 1;
  const count = countNeighbors(grid, 2, 2, 3, 'moore', 'clamp');
  assert.equal(count, 0);
});

test('countNeighbors: vonneumann не считает диагональных соседей', () => {
  const grid = createGrid(3);
  grid[gridIndex(0, 0, 3)] = 1;
  const vonCount = countNeighbors(grid, 1, 1, 3, 'vonneumann', 'clamp');
  assert.equal(vonCount, 0);
  const mooreCount = countNeighbors(grid, 1, 1, 3, 'moore', 'clamp');
  assert.equal(mooreCount, 1);
});

test('ruleToString форматирует B/S по возрастанию счёта', () => {
  const rule = createRule([6, 3], [3, 2]);
  assert.equal(ruleToString(rule), 'B36/S23');
});

test('randomRule возвращает булевы массивы длины 9', () => {
  const rule = randomRule(1);
  assert.equal(rule.birth.length, 9);
  assert.equal(rule.survival.length, 9);
  assert.ok(rule.birth.every((value) => typeof value === 'boolean'));
  assert.ok(rule.birth.every((value) => value === true));
});

test('stepGrid: B3/S23 превращает горизонтальную мигалку в вертикальную', () => {
  const size = 5;
  const rule = createRule([3], [2, 3]);
  const grid = createGrid(size);
  grid[gridIndex(1, 2, size)] = 1;
  grid[gridIndex(2, 2, size)] = 1;
  grid[gridIndex(3, 2, size)] = 1;

  const next = stepGrid(grid, size, rule, 'moore', 'clamp');

  const alive = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (next[gridIndex(x, y, size)]) alive.push(`${x},${y}`);
    }
  }
  assert.deepEqual(alive.sort(), ['2,1', '2,2', '2,3'].sort());
});
