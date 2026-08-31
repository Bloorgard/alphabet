# Лаборатория клеточных автоматов — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собрать отдельную страницу `automata/` — лабораторию двумерных
Life-like клеточных автоматов (B/S-правила), где клик по холсту сеет одну
клетку и запускает автомат по редактируемому правилу.

**Architecture:** Три файла. `automata-engine.js` — чистая логика (сетка,
подсчёт соседей, правило, шаг), без DOM, с CommonJS-экспортом для тестов в
Node и с fallback на `window.AutomataEngine` в браузере. `automata-ui.js` —
canvas-рендер, обработка клика, игровой цикл, обвязка вокруг движка.
`index.html` + `automata.css` — статическая разметка и стили, без сборки,
работает по `file://`.

**Tech Stack:** Ванильный JS (без модулей, без фреймворка — как весь
остальной сайт), Canvas 2D, тесты через встроенный `node:test` (Node 18+,
без npm-зависимостей).

## Global Constraints

- Страница живёт в `automata/`, вне `lab/` и вне контракта `lab/<буква>` —
  не обязана соблюдать цвет только из констант каркаса и панель по Tab.
- Публикуется вместе с сайтом (как `lab/`), никуда не залинкована с
  главной страницы.
- Никаких `<script type="module">` и никакого сборщика — открывается
  двойным кликом по `index.html`, без сервера (см. `AGENTS.md`, «Готово,
  когда»).
- Первая семья автоматов — только 2D тоталистические Life-like (B/S).
  Кольцевая сетка, 1D-автоматы Вольфрама, много-состояние — не в этом
  плане (см. спеку, раздел «Дальше»).

---

## Task 1: Статическая разметка и стили

**Files:**
- Create: `automata/index.html`
- Create: `automata/automata.css`

**Interfaces:**
- Produces: DOM-элементы с id, которые дальше читает `automata-ui.js`:
  `#grid` (canvas), `#status`, `#birth-checks`, `#survival-checks`,
  `#neighborhood` (select), `#boundary` (select), `#size` (range),
  `#size-value`, `#speed` (range), `#speed-value`, `#play`, `#step`,
  `#reset`, `#randomize`.

- [ ] **Step 1: Написать `automata/index.html`**

```html
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Клеточные автоматы · лаборатория</title>
<link rel="stylesheet" href="automata.css">
</head>
<body>
<header>
  <h1>Клеточные автоматы</h1>
  <p id="status">кликни по холсту, чтобы поставить точку</p>
</header>

<main>
  <div class="stage">
    <canvas id="grid"></canvas>
  </div>

  <aside class="controls">
    <section>
      <h2>Правило</h2>
      <div class="rule-row">
        <span class="rule-label">B</span>
        <div class="rule-checks" id="birth-checks"></div>
      </div>
      <div class="rule-row">
        <span class="rule-label">S</span>
        <div class="rule-checks" id="survival-checks"></div>
      </div>
      <button id="randomize" type="button">случайное правило</button>
    </section>

    <section>
      <h2>Сетка</h2>
      <label>окрестность
        <select id="neighborhood">
          <option value="moore">Мур (8)</option>
          <option value="vonneumann">фон Нейман (4)</option>
        </select>
      </label>
      <label>граница
        <select id="boundary">
          <option value="clamp">обрезать</option>
          <option value="wrap">завернуть в тор</option>
        </select>
      </label>
      <label>размер <span id="size-value">91</span>
        <input id="size" type="range" min="21" max="151" step="2" value="91">
      </label>
    </section>

    <section>
      <h2>Ход</h2>
      <label>скорость <span id="speed-value">10</span>/с
        <input id="speed" type="range" min="1" max="30" step="1" value="10">
      </label>
      <div class="buttons">
        <button id="play" type="button">пуск</button>
        <button id="step" type="button">шаг</button>
        <button id="reset" type="button">заново</button>
      </div>
    </section>
  </aside>
</main>
</body>
</html>
```

- [ ] **Step 2: Написать `automata/automata.css`**

```css
:root {
  color-scheme: light dark;
  --ink: #161616;
  --paper: #f1ede5;
  --alive: #161616;
  --dead: #f1ede5;
  --line: rgba(22,22,22,.16);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  background: var(--paper);
  color: var(--ink);
  font: 15px/1.4 ui-monospace, 'SFMono-Regular', Consolas, monospace;
  padding: 16px;
}

header h1 { margin: 0 0 4px; font-size: 18px; }
header p { margin: 0 0 16px; color: rgba(22,22,22,.6); }

main {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  align-items: flex-start;
}

.stage {
  flex: 1 1 480px;
  min-width: 0;
  aspect-ratio: 1 / 1;
  border: 1px solid var(--line);
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.controls {
  flex: 0 0 260px;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.controls section {
  border-top: 1px solid var(--line);
  padding-top: 12px;
}

.controls h2 {
  margin: 0 0 8px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: rgba(22,22,22,.6);
}

.controls label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.controls select,
.controls input[type="range"] {
  flex: 1;
}

.rule-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.rule-label {
  width: 14px;
  font-weight: 600;
}

.rule-checks {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.rule-checks label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  margin: 0;
}

.buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

button {
  font: inherit;
  padding: 6px 10px;
  border: 1px solid var(--ink);
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}

button[aria-pressed="true"] {
  background: var(--ink);
  color: var(--paper);
}

@media (prefers-color-scheme: dark) {
  :root {
    --ink: #f1ede5;
    --paper: #161616;
    --alive: #f1ede5;
    --dead: #161616;
    --line: rgba(241,237,229,.16);
  }
}
```

- [ ] **Step 3: Открыть `automata/index.html` двойным кликом (`file://`)**

Проверить: заголовок и статус видны, справа блок «Правило/Сетка/Ход» с
пустыми пока областями чекбоксов, узкое и широкое окно — без горизонтальной
прокрутки, консоль пуста (скриптов ещё нет, поэтому ошибок про них тоже нет).

- [ ] **Step 4: Commit**

```bash
git add automata/index.html automata/automata.css
git commit -m "Добавить разметку и стили лаборатории автоматов"
```

---

## Task 2: Движок автомата (чистая логика + тесты)

**Files:**
- Create: `automata/automata-engine.js`
- Test: `automata/automata-engine.test.js`

**Interfaces:**
- Produces: объект `AutomataEngine` (глобальный `window.AutomataEngine` в
  браузере, `module.exports` в Node) с полями:
  - `createGrid(size): Uint8Array`
  - `gridIndex(x, y, size): number`
  - `countNeighbors(grid, x, y, size, neighborhood, boundary): number` —
    `neighborhood` один из `'moore' | 'vonneumann'`, `boundary` один из
    `'wrap' | 'clamp'`
  - `createRule(birthCounts: number[], survivalCounts: number[]): { birth: boolean[9], survival: boolean[9] }`
  - `stepGrid(grid, size, rule, neighborhood, boundary): Uint8Array` — не
    мутирует вход, возвращает новую сетку
  - `randomRule(density = 0.5): { birth: boolean[9], survival: boolean[9] }`
  - `ruleToString(rule): string` — вид `"B3/S23"`

- [ ] **Step 1: Написать тесты `automata/automata-engine.test.js`**

```js
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
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `node --test automata/automata-engine.test.js`
Expected: FAIL — `Cannot find module './automata-engine.js'` (файла ещё нет).

- [ ] **Step 3: Написать `automata/automata-engine.js`**

```js
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
```

- [ ] **Step 4: Запустить тесты и убедиться, что они проходят**

Run: `node --test automata/automata-engine.test.js`
Expected: PASS, 6 из 6.

- [ ] **Step 5: Commit**

```bash
git add automata/automata-engine.js automata/automata-engine.test.js
git commit -m "Добавить движок клеточного автомата с тестами"
```

---

## Task 3: Базовое взаимодействие — клик, шаг, пуск/пауза

**Files:**
- Create: `automata/automata-ui.js`
- Modify: `automata/index.html` — добавить `<script>`-теги перед `</body>`

**Interfaces:**
- Consumes: `window.AutomataEngine` из Task 2 (`createGrid`, `gridIndex`,
  `createRule`, `stepGrid`), DOM-элементы из Task 1.
- Produces: работающий цикл «клик сеет клетку → автомат живёт по
  зафиксированному правилу B3/S23» — Task 4 достроит поверх него редактор
  правил и остальные элементы управления.

- [ ] **Step 1: Добавить скрипты в `automata/index.html`**

Перед `</body>` (после `</main>`):

```html
<script src="automata-engine.js"></script>
<script src="automata-ui.js"></script>
```

- [ ] **Step 2: Написать `automata/automata-ui.js`**

```js
/* automata/automata-ui.js
   Рендер, клик-посев, игровой цикл. Обвязка вокруг AutomataEngine. */

(function () {
  const engine = window.AutomataEngine;

  const canvas = document.getElementById('grid');
  const ctx = canvas.getContext('2d');
  const statusEl = document.getElementById('status');

  const sizeEl = document.getElementById('size');
  const playButton = document.getElementById('play');
  const stepButton = document.getElementById('step');
  const resetButton = document.getElementById('reset');

  const state = {
    size: Number(sizeEl.value),
    grid: null,
    rule: engine.createRule([3], [2, 3]),
    neighborhood: 'moore',
    boundary: 'clamp',
    generation: 0,
    seeded: false,
    playing: false,
    stepsPerSecond: 10,
    accumulator: 0,
  };

  function resetGrid() {
    state.grid = engine.createGrid(state.size);
    state.generation = 0;
    state.seeded = false;
    state.playing = false;
    playButton.textContent = 'пуск';
    playButton.setAttribute('aria-pressed', 'false');
  }

  function updateStatus() {
    const ruleText = engine.ruleToString(state.rule);
    if (!state.seeded) {
      statusEl.textContent = `кликни по холсту, чтобы поставить точку · правило ${ruleText}`;
      return;
    }
    statusEl.textContent = `поколение ${state.generation} · правило ${ruleText}`;
  }

  function resizeCanvas() {
    const box = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
  }

  function cellFromEvent(event) {
    const box = canvas.getBoundingClientRect();
    const relativeX = (event.clientX - box.left) / box.width;
    const relativeY = (event.clientY - box.top) / box.height;
    return {
      x: Math.floor(relativeX * state.size),
      y: Math.floor(relativeY * state.size),
    };
  }

  function seedAt(x, y) {
    if (x < 0 || y < 0 || x >= state.size || y >= state.size) return;
    resetGrid();
    state.grid[engine.gridIndex(x, y, state.size)] = 1;
    state.seeded = true;
    state.playing = true;
    playButton.textContent = 'пауза';
    playButton.setAttribute('aria-pressed', 'true');
    updateStatus();
  }

  function stepOnce() {
    if (!state.seeded) return;
    state.grid = engine.stepGrid(state.grid, state.size, state.rule, state.neighborhood, state.boundary);
    state.generation += 1;
    updateStatus();
  }

  canvas.addEventListener('click', (event) => {
    const { x, y } = cellFromEvent(event);
    seedAt(x, y);
  });

  playButton.addEventListener('click', () => {
    if (!state.seeded) return;
    state.playing = !state.playing;
    playButton.textContent = state.playing ? 'пауза' : 'пуск';
    playButton.setAttribute('aria-pressed', String(state.playing));
  });

  stepButton.addEventListener('click', () => {
    state.playing = false;
    playButton.textContent = 'пуск';
    playButton.setAttribute('aria-pressed', 'false');
    stepOnce();
  });

  resetButton.addEventListener('click', () => {
    resetGrid();
    updateStatus();
  });

  function draw() {
    const cell = canvas.width / state.size;
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--dead');
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--alive');
    for (let y = 0; y < state.size; y += 1) {
      for (let x = 0; x < state.size; x += 1) {
        if (state.grid[engine.gridIndex(x, y, state.size)]) {
          ctx.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell));
        }
      }
    }
  }

  let lastTime = performance.now();

  function frame(time) {
    const delta = (time - lastTime) / 1000;
    lastTime = time;
    if (state.playing) {
      state.accumulator += delta;
      const interval = 1 / state.stepsPerSecond;
      while (state.accumulator >= interval) {
        stepOnce();
        state.accumulator -= interval;
      }
    }
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resizeCanvas);
  resetGrid();
  resizeCanvas();
  updateStatus();
  requestAnimationFrame(frame);
})();
```

- [ ] **Step 3: Открыть `automata/index.html` (`file://`) и проверить руками**

Клик по холсту ставит одну тёмную клетку и сразу запускает игру жизни
(B3/S23) — узор должен эволюционировать. Кнопка «пауза»/«пуск» переключает
состояние и текст. «шаг» продвигает на одно поколение и ставит на паузу.
«заново» очищает холст и возвращает статус «кликни по холсту…». Консоль
чиста.

- [ ] **Step 4: Commit**

```bash
git add automata/index.html automata/automata-ui.js
git commit -m "Добавить клик-посев и игровой цикл автомата"
```

---

## Task 4: Редактор правил и остальные элементы управления

**Files:**
- Modify: `automata/automata-ui.js`

**Interfaces:**
- Consumes: `state`, `updateStatus()`, `resetGrid()` из Task 3 (те же имена,
  меняются не переименовываются).
- Produces: интерактивные `#birth-checks`/`#survival-checks`,
  `#randomize`, `#neighborhood`, `#boundary`, `#size`/`#size-value`,
  `#speed`/`#speed-value`, читающие и меняющие `state`.

- [ ] **Step 1: Добавить получение оставшихся элементов управления**

В начало IIFE, рядом с уже объявленными константами (после `const resetButton = ...`):

```js
  const birthChecksEl = document.getElementById('birth-checks');
  const survivalChecksEl = document.getElementById('survival-checks');
  const neighborhoodEl = document.getElementById('neighborhood');
  const boundaryEl = document.getElementById('boundary');
  const sizeValueEl = document.getElementById('size-value');
  const speedEl = document.getElementById('speed');
  const speedValueEl = document.getElementById('speed-value');
  const randomizeButton = document.getElementById('randomize');
```

- [ ] **Step 2: Завести начальные значения из разметки вместо жёстко зашитых**

В объекте `state` заменить:

```js
    neighborhood: 'moore',
    boundary: 'clamp',
```

на:

```js
    neighborhood: neighborhoodEl.value,
    boundary: boundaryEl.value,
```

и:

```js
    stepsPerSecond: 10,
```

на:

```js
    stepsPerSecond: Number(speedEl.value),
```

- [ ] **Step 3: Построить чекбоксы правила**

После объявления `updateStatus` (до `resizeCanvas`), добавить:

```js
  function buildRuleChecks(container, kind) {
    container.innerHTML = '';
    for (let count = 0; count <= 8; count += 1) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = `${kind}-${count}`;
      input.checked = state.rule[kind][count];
      input.addEventListener('change', () => {
        state.rule[kind][count] = input.checked;
        updateStatus();
      });
      label.append(input, String(count));
      container.append(label);
    }
  }

  function syncRuleChecks() {
    for (let count = 0; count <= 8; count += 1) {
      document.getElementById(`birth-${count}`).checked = state.rule.birth[count];
      document.getElementById(`survival-${count}`).checked = state.rule.survival[count];
    }
  }
```

Обработчик каждой чекбоксины читает `state.rule[kind][count]` заново при
каждом изменении, а не хранит ссылку на массив в замыкании — иначе после
«случайного правила», подменяющего `state.rule` целиком, старые чекбоксы
продолжали бы менять уже выброшенный объект.

- [ ] **Step 4: Вызвать построение чекбоксов и повесить остальные обработчики**

Перед `window.addEventListener('resize', resizeCanvas);` в конце файла
добавить:

```js
  buildRuleChecks(birthChecksEl, 'birth');
  buildRuleChecks(survivalChecksEl, 'survival');

  randomizeButton.addEventListener('click', () => {
    state.rule = engine.randomRule(0.4);
    syncRuleChecks();
    updateStatus();
  });

  neighborhoodEl.addEventListener('change', () => {
    state.neighborhood = neighborhoodEl.value;
  });

  boundaryEl.addEventListener('change', () => {
    state.boundary = boundaryEl.value;
  });

  sizeEl.addEventListener('input', () => {
    state.size = Number(sizeEl.value);
    sizeValueEl.textContent = String(state.size);
    resetGrid();
    updateStatus();
  });

  speedEl.addEventListener('input', () => {
    state.stepsPerSecond = Number(speedEl.value);
    speedValueEl.textContent = String(state.stepsPerSecond);
  });
```

- [ ] **Step 5: Открыть `automata/index.html` (`file://`) и проверить руками**

Чекбоксы B/S показывают 0–8 в обоих рядах, дефолт совпадает с B3/S23
(отмечены «3» в рождении, «2» и «3» в выживании). Снятие/установка галочки
сразу меняет строку правила в статусе. «случайное правило» перерисовывает
галочки и меняет правило на лету — если холст уже засеян, следующий шаг
уже идёт по новому правилу. Смена окрестности/границы/размера/скорости
работает без ошибок в консоли; смена размера очищает холст и возвращает
«кликни по холсту…».

- [ ] **Step 6: Commit**

```bash
git add automata/automata-ui.js
git commit -m "Добавить редактор правил и элементы управления сеткой"
```

---

## Task 5: Финальная проверка по чек-листу «Готово, когда»

**Files:** (без изменений кода — только проверка и, если нужно, точечные
правки по месту)

- [ ] **Step 1: Пройти чек-лист из `AGENTS.md`**

- Страница открыта в браузере, узкое и широкое окно — без горизонтальной
  прокрутки, панель управления не разъезжается.
- Консоль чиста на всех действиях: клик, пуск/пауза, шаг, заново, смена
  правила/сетки/скорости.
- Открывается по `file://` двойным кликом.
- Ховер на кнопках не прячет содержимое впустую.
- Временные файлы отсутствуют, дерево чистое.

- [ ] **Step 2: Прогнать тесты движка ещё раз**

Run: `node --test automata/automata-engine.test.js`
Expected: PASS, 6 из 6.

- [ ] **Step 3: Commit (если были точечные правки на Step 1)**

```bash
git add -A
git commit -m "Поправить мелочи после финальной проверки лаборатории автоматов"
```

Если правок не было — commit не нужен.
