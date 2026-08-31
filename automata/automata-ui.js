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
  const birthChecksEl = document.getElementById('birth-checks');
  const survivalChecksEl = document.getElementById('survival-checks');
  const neighborhoodEl = document.getElementById('neighborhood');
  const boundaryEl = document.getElementById('boundary');
  const sizeValueEl = document.getElementById('size-value');
  const speedEl = document.getElementById('speed');
  const speedValueEl = document.getElementById('speed-value');
  const randomizeButton = document.getElementById('randomize');

  const state = {
    size: Number(sizeEl.value),
    grid: null,
    rule: engine.createRule([3], [2, 3]),
    neighborhood: neighborhoodEl.value,
    boundary: boundaryEl.value,
    generation: 0,
    seeded: false,
    playing: false,
    stepsPerSecond: Number(speedEl.value),
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

  function resizeCanvas() {
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    const delta = Math.min((time - lastTime) / 1000, 0.25);
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

  buildRuleChecks(birthChecksEl, 'birth');
  buildRuleChecks(survivalChecksEl, 'survival');

  randomizeButton.addEventListener('click', () => {
    state.rule = engine.randomRule(0.4);
    state.rule.birth[0] = false;
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

  window.addEventListener('resize', resizeCanvas);
  resetGrid();
  resizeCanvas();
  updateStatus();
  requestAnimationFrame(frame);
})();
