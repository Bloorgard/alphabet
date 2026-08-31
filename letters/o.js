// О — кольцо всегда по центру. Оно не подчиняется правилу и никогда не
// гаснет, но считается соседом для остальных клеток — рядом с ним рождение
// идёт иначе, чем в пустоте. Клик ставит точку внутри, точки играют по
// выбранному правилу B/S: одни держатся в форме кольца, другие расползаются.

const INK = '#f1ede5';
const RED = '#e0210f';
const GRID = 91;

const RULES = {
  life: { label: 'жизнь', rule: 'B3/S23', birth: [3], survival: [2, 3] },
  highlife: { label: 'хайлайф', rule: 'B36/S23', birth: [3, 6], survival: [2, 3] },
  twoByTwo: { label: '2×2', rule: 'B36/S125', birth: [3, 6], survival: [1, 2, 5] },
  coral: { label: 'коралл', rule: 'B3/S45678', birth: [3], survival: [4, 5, 6, 7, 8] },
};

const DEFAULTS = {
  rate: 10,
  radius: 28,
  hideWall: false,
  showGrid: true,
};

const CONTROLS = [
  { key: 'rate', label: 'скорость', min: 1, max: 30, step: 1 },
  { key: 'radius', label: 'радиус кольца', min: 4, max: 44, step: 1 },
];

const SWITCHES = [
  { key: 'hideWall', label: 'скрыть кольцо' },
  { key: 'showGrid', label: 'линии сетки' },
];

function gridIndex(x, y) { return y * GRID + x; }

/* Брезенхэм для окружности: одна восьмушка зеркалится в семь остальных,
   поэтому кольцо симметрично при любом радиусе и его можно двигать вживую. */
function ringCells(cx, cy, radius) {
  if (radius <= 0) return [[cx, cy]];
  const points = [];
  let x = radius;
  let y = 0;
  let err = 1 - radius;
  const plot = (px, py) => {
    points.push(
      [cx + px, cy + py], [cx - px, cy + py], [cx + px, cy - py], [cx - px, cy - py],
      [cx + py, cy + px], [cx - py, cy + px], [cx + py, cy - px], [cx - py, cy - px],
    );
  };
  plot(x, y);
  while (x > y) {
    y += 1;
    if (err < 0) err += 2 * y + 1;
    else { x -= 1; err += 2 * (y - x) + 1; }
    plot(x, y);
  }
  return points;
}

function mooreCount(cells, x, y) {
  let count = 0;
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      if (!ox && !oy) continue;
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      if (cells[gridIndex(nx, ny)] === 1) count += 1;
    }
  }
  return count;
}

export function mountO(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { ...DEFAULTS };
  const state = {
    rule: RULES.life,
    wall: new Set(),
    cells: new Uint8Array(GRID * GRID),
    front: new Uint8Array(GRID * GRID),
    generation: 0,
    started: false,
    clock: 0,
  };

  let W = 1;
  let H = 1;
  let S = 1;
  let ox = 0;
  let oy = 0;
  let last = performance.now();
  let frameId = 0;
  let ruleButtons = [];
  let ruleNote = null;

  function resize() {
    const bounds = workspace.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, bounds.width);
    H = Math.max(1, bounds.height);
    S = Math.min(W, H);
    ox = (W - S) / 2;
    oy = (H - S) / 2;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* Пересобирает только стену: старые её клетки снаружи нового радиуса
     гаснут, новые оживают, точки и поколение внутри не трогаются. */
  function resizeWall() {
    const center = Math.floor(GRID / 2);
    const radius = Math.round(params.radius);
    const previous = state.wall;
    const wall = new Set();
    ringCells(center, center, radius).forEach(([x, y]) => {
      if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
      wall.add(`${x},${y}`);
    });
    state.wall = wall;
    previous.forEach((key) => {
      if (wall.has(key)) return;
      const [x, y] = key.split(',').map(Number);
      state.cells[gridIndex(x, y)] = 0;
    });
    wall.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      state.cells[gridIndex(x, y)] = 1;
    });
    state.started = state.started || wall.size > 0;
  }

  function reset() {
    state.cells = new Uint8Array(GRID * GRID);
    state.front = new Uint8Array(GRID * GRID);
    state.generation = 0;
    state.started = false;
    state.clock = 0;
    state.wall = new Set();
    resizeWall();
  }

  function selectRule(name) {
    state.rule = RULES[name];
    for (const [key, button] of ruleButtons) button.setAttribute('aria-pressed', String(key === name));
    if (ruleNote) ruleNote.textContent = state.rule.rule;
  }

  function toggleCell(x, y) {
    const key = `${x},${y}`;
    if (state.wall.has(key)) return;
    const index = gridIndex(x, y);
    state.cells[index] = state.cells[index] ? 0 : 1;
    state.started = true;
  }

  function step() {
    if (!state.started) return;
    const next = new Uint8Array(GRID * GRID);
    const front = new Uint8Array(GRID * GRID);
    for (let y = 0; y < GRID; y += 1) {
      for (let x = 0; x < GRID; x += 1) {
        const index = gridIndex(x, y);
        const alive = state.cells[index] === 1;
        const count = mooreCount(state.cells, x, y);
        const allowed = alive ? state.rule.survival : state.rule.birth;
        const value = allowed.includes(count) ? 1 : 0;
        next[index] = value;
        if (value !== state.cells[index]) front[index] = 1;
      }
    }
    state.wall.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      next[gridIndex(x, y)] = 1;
    });
    state.cells = next;
    state.front = front;
    state.generation += 1;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const cell = S / GRID;

    if (params.showGrid) {
      ctx.strokeStyle = 'rgba(241, 237, 229, .06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < GRID; i += 1) {
        const at = ox + Math.round((i / GRID) * S) + 0.5;
        ctx.moveTo(at, oy);
        ctx.lineTo(at, oy + S);
        const atY = oy + Math.round((i / GRID) * S) + 0.5;
        ctx.moveTo(ox, atY);
        ctx.lineTo(ox + S, atY);
      }
      ctx.stroke();
    }

    for (let y = 0; y < GRID; y += 1) {
      for (let x = 0; x < GRID; x += 1) {
        const index = gridIndex(x, y);
        if (!state.cells[index] || state.wall.has(`${x},${y}`)) continue;
        ctx.fillStyle = state.front[index] ? RED : INK;
        ctx.fillRect(ox + x * cell, oy + y * cell, cell + 0.5, cell + 0.5);
      }
    }
    if (!params.hideWall) {
      ctx.fillStyle = INK;
      state.wall.forEach((key) => {
        const [x, y] = key.split(',').map(Number);
        ctx.fillRect(ox + x * cell, oy + y * cell, cell + 0.5, cell + 0.5);
      });
    }
  }

  function loop(now) {
    const delta = Math.min((now - last) / 1000, 0.25);
    last = now;
    if (state.started) {
      state.clock += delta;
      const interval = 1 / params.rate;
      while (state.clock >= interval) {
        step();
        state.clock -= interval;
      }
    }
    draw();
    frameId = requestAnimationFrame(loop);
  }

  function cellFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left - ox) / S) * GRID);
    const y = Math.floor(((event.clientY - rect.top - oy) / S) * GRID);
    return { x, y };
  }

  function onDown(event) {
    const { x, y } = cellFromEvent(event);
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    toggleCell(x, y);
  }

  function buildPanel() {
    const panel = document.createElement('div');
    panel.className = 'sketch-panel';
    panel.dataset.letterLayer = '';
    panel.hidden = true;

    const modes = document.createElement('div');
    modes.className = 'sketch-modes';
    panel.append(modes);

    ruleNote = document.createElement('p');
    panel.append(ruleNote);

    for (const [name, info] of Object.entries(RULES)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sketch-mode';
      button.textContent = info.label;
      button.addEventListener('click', () => selectRule(name));
      modes.append(button);
      ruleButtons.push([name, button]);
    }

    for (const control of CONTROLS) {
      const label = document.createElement('label');
      label.textContent = control.label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = control.min;
      input.max = control.max;
      input.step = control.step;
      input.value = params[control.key];
      input.addEventListener('input', () => {
        params[control.key] = Number(input.value);
        if (control.key === 'radius') resizeWall();
      });
      label.append(input);
      panel.append(label);
    }

    for (const item of SWITCHES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sketch-switch';
      button.textContent = item.label;
      button.setAttribute('aria-pressed', String(params[item.key]));
      button.addEventListener('click', () => {
        params[item.key] = !params[item.key];
        button.setAttribute('aria-pressed', String(params[item.key]));
      });
      panel.append(button);
    }

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'sketch-action';
    resetButton.textContent = 'заново';
    resetButton.addEventListener('click', reset);
    panel.append(resetButton);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'sketch-toggle';
    toggle.dataset.letterLayer = '';
    toggle.textContent = 'параметры (tab)';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
    });

    workspace.append(panel, toggle);
    return { panel, toggle };
  }

  function onKeyDown(event) {
    if (event.key !== 'Tab' || event.target.closest('input, textarea')) return;
    event.preventDefault();
    toggle.click();
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'клик ставит точку · кольцо держит форму';
  workspace.append(hint);

  const { panel, toggle } = buildPanel();
  selectRule('life');

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(workspace);
  canvas.addEventListener('pointerdown', onDown);
  document.addEventListener('keydown', onKeyDown);

  resize();
  reset();
  frameId = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    document.removeEventListener('keydown', onKeyDown);
    panel.remove();
    toggle.remove();
    hint.remove();
    ctx.clearRect(0, 0, W, H);
  };
}
