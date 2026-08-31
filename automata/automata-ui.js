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
  const toolButtons = {
    point: document.getElementById('tool-point'),
    line: document.getElementById('tool-line'),
    rect: document.getElementById('tool-rect'),
    circle: document.getElementById('tool-circle'),
  };

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
    tool: 'point',
    drawAnchor: null,
    previewCells: null,
  };

  function resetGrid() {
    state.grid = engine.createGrid(state.size);
    state.generation = 0;
    state.seeded = false;
    state.playing = false;
    state.pendingTemplate = null;
    state.drawAnchor = null;
    state.previewCells = null;
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

  function linePoints(x0, y0, x1, y1) {
    const points = [];
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      points.push([x, y]);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
    return points;
  }

  function rectPoints(x0, y0, x1, y1) {
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    const top = Math.min(y0, y1);
    const bottom = Math.max(y0, y1);
    const points = [];
    for (let x = left; x <= right; x += 1) { points.push([x, top], [x, bottom]); }
    for (let y = top; y <= bottom; y += 1) { points.push([left, y], [right, y]); }
    return points;
  }

  function ellipsePoints(cx, cy, rx, ry) {
    if (rx === 0 && ry === 0) return [[cx, cy]];
    const steps = Math.max(16, Math.ceil((rx + ry) * 4));
    const points = [];
    let prev = null;
    for (let i = 0; i <= steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      const x = cx + Math.round(rx * Math.cos(angle));
      const y = cy + Math.round(ry * Math.sin(angle));
      if (prev) points.push(...linePoints(prev[0], prev[1], x, y));
      else points.push([x, y]);
      prev = [x, y];
    }
    return points;
  }

  function shapePoints(tool, anchor, current, square) {
    const dx = current.x - anchor.x;
    const dy = current.y - anchor.y;
    if (tool === 'line') return linePoints(anchor.x, anchor.y, current.x, current.y);
    const side = square ? Math.max(Math.abs(dx), Math.abs(dy)) : null;
    const ex = square ? anchor.x + Math.sign(dx || 1) * side : current.x;
    const ey = square ? anchor.y + Math.sign(dy || 1) * side : current.y;
    if (tool === 'rect') return rectPoints(anchor.x, anchor.y, ex, ey);
    const cx = Math.round((anchor.x + ex) / 2);
    const cy = Math.round((anchor.y + ey) / 2);
    const rx = Math.round(Math.abs(ex - anchor.x) / 2);
    const ry = Math.round(Math.abs(ey - anchor.y) / 2);
    return ellipsePoints(cx, cy, rx, ry);
  }

  function setTool(tool) {
    state.tool = tool;
    Object.entries(toolButtons).forEach(([name, button]) => {
      button.setAttribute('aria-pressed', String(name === tool));
    });
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

  function commitPreview() {
    if (!state.previewCells) return;
    state.previewCells.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      if (x < 0 || y < 0 || x >= state.size || y >= state.size) return;
      state.grid[engine.gridIndex(x, y, state.size)] = 1;
    });
    state.previewCells = null;
    state.seeded = true;
    pauseForEditing();
    updateStatus();
  }

  function updatePreview(anchor, current, shiftKey) {
    const points = shapePoints(state.tool, anchor, current, shiftKey);
    state.previewCells = new Set(points.map(([x, y]) => `${x},${y}`));
  }

  canvas.addEventListener('mousedown', (event) => {
    const point = cellFromEvent(event);
    if (state.pendingTemplate) {
      placeTemplate(state.pendingTemplate, point.x, point.y);
      return;
    }
    if (state.tool === 'point') {
      toggleCell(point.x, point.y);
      return;
    }
    state.drawAnchor = point;
    updatePreview(point, point, event.shiftKey);
  });

  window.addEventListener('mousemove', (event) => {
    if (!state.drawAnchor) return;
    updatePreview(state.drawAnchor, cellFromEvent(event), event.shiftKey);
  });

  window.addEventListener('mouseup', () => {
    if (!state.drawAnchor) return;
    state.drawAnchor = null;
    commitPreview();
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
    if (state.previewCells) {
      state.previewCells.forEach((key) => {
        const [x, y] = key.split(',').map(Number);
        if (x < 0 || y < 0 || x >= state.size || y >= state.size) return;
        ctx.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell));
      });
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

  Object.entries(toolButtons).forEach(([name, button]) => {
    button.addEventListener('click', () => setTool(name));
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
