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
  const saveRuleButton = document.getElementById('save-rule');
  const savedRulesEl = document.getElementById('saved-rules');
  const saveTemplateButton = document.getElementById('save-template');
  const savedTemplatesEl = document.getElementById('saved-templates');

  const SAVED_RULES_KEY = 'automata-saved-rules';
  const SAVED_TEMPLATES_KEY = 'automata-saved-templates';

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
    pendingTemplate: null,
  };

  function resetGrid() {
    state.grid = engine.createGrid(state.size);
    state.generation = 0;
    state.seeded = false;
    state.playing = false;
    state.pendingTemplate = null;
    playButton.textContent = 'пуск';
    playButton.setAttribute('aria-pressed', 'false');
  }

  function updateStatus() {
    const ruleText = engine.ruleToString(state.rule);
    if (state.pendingTemplate) {
      statusEl.textContent = `клик поставит шаблон (${state.pendingTemplate.length} точ.) · правило ${ruleText}`;
      return;
    }
    if (!state.seeded) {
      statusEl.textContent = `кликни по холсту, чтобы поставить точки · правило ${ruleText}`;
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

  function loadSavedRules() {
    try {
      const raw = localStorage.getItem(SAVED_RULES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      return [];
    }
  }

  function persistSavedRules(rules) {
    try {
      localStorage.setItem(SAVED_RULES_KEY, JSON.stringify(rules));
    } catch (error) {
      // localStorage недоступен (приватный режим и т.п.) — просто не сохраняем
    }
  }

  function applyRule(rule) {
    state.rule = rule;
    syncRuleChecks();
    updateStatus();
  }

  function renderSavedRules() {
    const rules = loadSavedRules();
    savedRulesEl.innerHTML = '';
    rules.forEach((rule, index) => {
      const chip = document.createElement('div');
      chip.className = 'rule-chip';

      const loadButton = document.createElement('button');
      loadButton.type = 'button';
      loadButton.textContent = engine.ruleToString(rule);
      loadButton.addEventListener('click', () => applyRule(engine.createRule(
        rule.birth.map((on, count) => (on ? count : null)).filter((count) => count !== null),
        rule.survival.map((on, count) => (on ? count : null)).filter((count) => count !== null),
      )));

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'rule-chip-remove';
      removeButton.textContent = '×';
      removeButton.setAttribute('aria-label', 'удалить сохранённое правило');
      removeButton.addEventListener('click', () => {
        const remaining = loadSavedRules();
        remaining.splice(index, 1);
        persistSavedRules(remaining);
        renderSavedRules();
      });

      chip.append(loadButton, removeButton);
      savedRulesEl.append(chip);
    });
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

  function pauseForEditing() {
    state.playing = false;
    playButton.textContent = 'пуск';
    playButton.setAttribute('aria-pressed', 'false');
  }

  function toggleCell(x, y) {
    if (x < 0 || y < 0 || x >= state.size || y >= state.size) return;
    const index = engine.gridIndex(x, y, state.size);
    state.grid[index] = state.grid[index] ? 0 : 1;
    state.seeded = true;
    pauseForEditing();
    updateStatus();
  }

  function placeTemplate(offsets, cx, cy) {
    offsets.forEach(([dx, dy]) => {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= state.size || y >= state.size) return;
      state.grid[engine.gridIndex(x, y, state.size)] = 1;
    });
    state.seeded = true;
    state.pendingTemplate = null;
    pauseForEditing();
    updateStatus();
  }

  function captureTemplate() {
    const points = [];
    for (let y = 0; y < state.size; y += 1) {
      for (let x = 0; x < state.size; x += 1) {
        if (state.grid[engine.gridIndex(x, y, state.size)]) points.push([x, y]);
      }
    }
    if (!points.length) return null;
    const cx = Math.round(points.reduce((sum, [x]) => sum + x, 0) / points.length);
    const cy = Math.round(points.reduce((sum, [, y]) => sum + y, 0) / points.length);
    return points.map(([x, y]) => [x - cx, y - cy]);
  }

  function loadSavedTemplates() {
    try {
      const raw = localStorage.getItem(SAVED_TEMPLATES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      return [];
    }
  }

  function persistSavedTemplates(templates) {
    try {
      localStorage.setItem(SAVED_TEMPLATES_KEY, JSON.stringify(templates));
    } catch (error) {
      // localStorage недоступен — просто не сохраняем
    }
  }

  function renderSavedTemplates() {
    const templates = loadSavedTemplates();
    savedTemplatesEl.innerHTML = '';
    templates.forEach((template, index) => {
      const chip = document.createElement('div');
      chip.className = 'rule-chip';

      const loadButton = document.createElement('button');
      loadButton.type = 'button';
      loadButton.textContent = `${template.offsets.length} точ.`;
      loadButton.addEventListener('click', () => {
        state.pendingTemplate = template.offsets;
        updateStatus();
      });

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'rule-chip-remove';
      removeButton.textContent = '×';
      removeButton.setAttribute('aria-label', 'удалить сохранённый шаблон');
      removeButton.addEventListener('click', () => {
        const remaining = loadSavedTemplates();
        remaining.splice(index, 1);
        persistSavedTemplates(remaining);
        renderSavedTemplates();
      });

      chip.append(loadButton, removeButton);
      savedTemplatesEl.append(chip);
    });
  }

  function stepOnce() {
    if (!state.seeded) return;
    state.grid = engine.stepGrid(state.grid, state.size, state.rule, state.neighborhood, state.boundary);
    state.generation += 1;
    updateStatus();
  }

  canvas.addEventListener('click', (event) => {
    const { x, y } = cellFromEvent(event);
    if (state.pendingTemplate) {
      placeTemplate(state.pendingTemplate, x, y);
      return;
    }
    toggleCell(x, y);
  });

  playButton.addEventListener('click', () => {
    if (!state.seeded) return;
    state.playing = !state.playing;
    playButton.textContent = state.playing ? 'пауза' : 'пуск';
    playButton.setAttribute('aria-pressed', String(state.playing));
  });

  stepButton.addEventListener('click', () => {
    pauseForEditing();
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
    const rule = engine.randomRule(0.4);
    rule.birth[0] = false;
    applyRule(rule);
  });

  saveRuleButton.addEventListener('click', () => {
    const ruleText = engine.ruleToString(state.rule);
    const rules = loadSavedRules();
    const isDuplicate = rules.some((rule) => engine.ruleToString(rule) === ruleText);
    if (isDuplicate) return;
    rules.push({ birth: state.rule.birth, survival: state.rule.survival });
    persistSavedRules(rules);
    renderSavedRules();
  });

  saveTemplateButton.addEventListener('click', () => {
    const offsets = captureTemplate();
    if (!offsets) return;
    const templates = loadSavedTemplates();
    templates.push({ offsets });
    persistSavedTemplates(templates);
    renderSavedTemplates();
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
  renderSavedRules();
  renderSavedTemplates();
  requestAnimationFrame(frame);
})();
