/* Полигон Ё: точки как предмет игры, перекладины как платформы.
   Физика у режимов общая — сравнивается только схема управления. */

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const modesBar = document.getElementById('modes');
const toolsBar = document.getElementById('tools');
const note = document.getElementById('note');
const stage = document.getElementById('stage');

const INK = '#161616';
const RED = '#e0210f';
const MUTED = '#8b877f';
const FAINT = 'rgba(22,22,22,.16)';
const STEP = 1 / 60;

/* Геометрия в долях кадра: канон — верхняя длинная, средняя короткая,
   нижняя самая длинная. Игрок меняет только вылет. */
const ROWS = [0.26, 0.5, 0.74];
const CANON = [0.8, 0.66, 0.84];
const STEM_X = 0.22;
const MIN_END = 0.34;
const MAX_END = 0.94;
const DOT_SLOTS = [0.34, 0.46];
const DOT_Y = 0.1;
const DOT_R = 0.019;

let S = 600;
let dpr = 1;
let current = '';
let modeState = {};
const toolValues = {};
const pointer = { x: 0, y: 0, px: 0, py: 0, down: false };

const bars = ROWS.map((row, index) => ({ end: CANON[index], goal: CANON[index], vel: 0 }));
let balls = [];
let angle = 0;
let hits = 0;

function clamp(value, min, max) { return value < min ? min : value > max ? max : value; }
function slot(key) { return `${current}:${key}`; }
function num(key) { return Number(toolValues[slot(key)]); }
function on(key) { return Boolean(toolValues[slot(key)]); }

function nearRow(y, radius = 0.09) {
  let best = -1;
  let distance = radius;
  ROWS.forEach((row, index) => {
    const gap = Math.abs(y - row);
    if (gap < distance) { distance = gap; best = index; }
  });
  return best;
}

/* ---------- общее состояние ---------- */

function resetAll() {
  balls = DOT_SLOTS.map((x) => ({ x, y: DOT_Y, vx: 0, vy: 0, alive: true }));
  bars.forEach((bar, index) => { bar.end = CANON[index]; bar.goal = CANON[index]; bar.vel = 0; });
  angle = 0;
  hits = 0;
}

function aliveCount() { return balls.filter((ball) => ball.alive).length; }

function stepBars() {
  const spring = num('spring');
  for (const bar of bars) {
    const previous = bar.end;
    bar.end += (clamp(bar.goal, MIN_END, MAX_END) - bar.end) * spring;
    bar.vel = (bar.end - previous) / STEP;
  }
}

function bounceOff(ball, bar, y, fromAbove) {
  const bounce = num('bounce');
  ball.y = fromAbove ? y - DOT_R : y + DOT_R;
  ball.vy = -ball.vy * bounce;
  const along = clamp((ball.x - STEM_X) / (bar.end - STEM_X), 0, 1);
  ball.vx += (along - 0.5) * num('spin');
  ball.vx += bar.vel * num('kick');
  hits += 1;
}

function collide(ball, px, py) {
  const bounce = num('bounce');
  if (ball.y - DOT_R < 0 && ball.vy < 0) { ball.y = DOT_R; ball.vy = -ball.vy * bounce; }
  if (ball.x + DOT_R > 1 && ball.vx > 0) { ball.x = 1 - DOT_R; ball.vx = -ball.vx * bounce; }
  /* стойка держит поле слева по всей высоте: играем справа от буквы */
  if (ball.x - DOT_R < STEM_X && ball.vx < 0) { ball.x = STEM_X + DOT_R; ball.vx = -ball.vx * bounce; }

  bars.forEach((bar, index) => {
    const y = ROWS[index];
    if (ball.x < STEM_X - DOT_R || ball.x > bar.end + DOT_R) return;
    if (ball.vy > 0 && py + DOT_R <= y && ball.y + DOT_R >= y) bounceOff(ball, bar, y, true);
    else if (ball.vy < 0 && py - DOT_R >= y && ball.y - DOT_R <= y) bounceOff(ball, bar, y, false);
  });
}

function stepBalls() {
  const gravity = num('grav');
  for (const ball of balls) {
    if (!ball.alive) continue;
    ball.vx += Math.sin(angle) * gravity * STEP;
    ball.vy += Math.cos(angle) * gravity * STEP;
    const px = ball.x;
    const py = ball.y;
    ball.x += ball.vx * STEP;
    ball.y += ball.vy * STEP;
    collide(ball, px, py);
    if (ball.y - DOT_R > 1.2) ball.alive = false;
  }
}

function stepWorld() {
  if (on('pause')) return;
  MODES[current].aim?.();
  stepBars();
  stepBalls();
}

/* ---------- общая графика ---------- */

function line(x1, y1, x2, y2, color = INK, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1 * S, y1 * S);
  ctx.lineTo(x2 * S, y2 * S);
  ctx.stroke();
}

function dot(x, y, color, filled) {
  ctx.beginPath();
  ctx.arc(x * S, y * S, DOT_R * S, 0, Math.PI * 2);
  if (filled) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawStatus() {
  const alive = aliveCount();
  const label = alive === 2 ? 'Ё' : alive === 1 ? 'одна точка' : 'Е';
  ctx.fillStyle = alive === 1 ? RED : MUTED;
  ctx.font = `${Math.round(S * 0.022)}px 'DM Mono', ui-monospace, monospace`;
  ctx.textAlign = 'right';
  ctx.fillText(`${label} · ${hits}`, S * 0.96, S * 0.06);
  ctx.textAlign = 'left';
}

function drawWorld() {
  ctx.save();
  ctx.translate(0.5 * S, 0.5 * S);
  ctx.rotate(angle);
  ctx.translate(-0.5 * S, -0.5 * S);

  if (on('ghost')) {
    ROWS.forEach((row, index) => line(STEM_X, row, CANON[index], row, FAINT, 1));
  }

  const held = modeState.held ?? -1;
  line(STEM_X, ROWS[0], STEM_X, ROWS[2], INK, S * 0.016);
  bars.forEach((bar, index) => {
    line(STEM_X, ROWS[index], bar.end, ROWS[index], INK, S * 0.013);
    if (index === held) dot(bar.end, ROWS[index], INK, false);
  });

  const alive = aliveCount();
  balls.forEach((ball, index) => {
    if (ball.alive) dot(ball.x, ball.y, alive === 1 ? RED : INK, true);
    else dot(DOT_SLOTS[index], DOT_Y, FAINT, false);
  });

  ctx.restore();
  drawStatus();
}

/* ---------- режимы ---------- */

const COMMON_TOOLS = [
  { type: 'range', key: 'grav', label: 'тяжесть', min: 0.6, max: 3, step: 0.1, value: 1.6 },
  { type: 'range', key: 'bounce', label: 'упругость', min: 0.85, max: 1.05, step: 0.01, value: 1 },
  { type: 'range', key: 'spring', label: 'возврат', min: 0.05, max: 0.6, step: 0.01, value: 0.22 },
  { type: 'range', key: 'spin', label: 'подрезка', min: 0, max: 2, step: 0.05, value: 0.35 },
  { type: 'range', key: 'kick', label: 'отдача', min: 0, max: 0.4, step: 0.02, value: 0.12 },
  { type: 'toggle', key: 'ghost', label: 'форма', value: true },
  { type: 'toggle', key: 'pause', label: 'пауза', value: false },
  { type: 'button', label: 'вернуть точки', action: () => resetAll() },
];

const MODES = {};

/* 1. вылет: одна рука тянет конец ближайшей перекладины */
MODES.reach = {
  label: 'вылет',
  note: 'Тяни за конец ближайшей перекладины: вылет держится, пока держишь. Отпустил — буква стягивается к своей форме. Две точки одной рукой не удержать.',
  cursor: 'ew-resize',
  tools: COMMON_TOOLS,
  setup() { modeState.held = -1; resetAll(); },
  aim() {
    bars.forEach((bar, index) => { if (index !== modeState.held) bar.goal = CANON[index]; });
  },
  onDown() { modeState.held = nearRow(pointer.y / S); },
  onMove() {
    if (modeState.held < 0) return;
    bars[modeState.held].goal = clamp(pointer.x / S, MIN_END, MAX_END);
  },
  onUp() { modeState.held = -1; },
  draw: drawWorld,
};

/* 2. клавиши: каждой перекладине своя, можно держать две */
MODES.keys = {
  label: 'клавиши',
  note: 'Клавиши 1 / 2 / 3 выдвигают перекладины, удержание держит вылет. Две руки — две точки, но третья перекладина всегда без присмотра.',
  tools: COMMON_TOOLS,
  setup() { modeState.pressed = new Set(); resetAll(); },
  aim() {
    bars.forEach((bar, index) => {
      bar.goal = modeState.pressed.has(index) ? MAX_END : CANON[index];
    });
  },
  onKey(event, down) {
    const index = ['1', '2', '3'].indexOf(event.key);
    if (index < 0) return;
    if (down) modeState.pressed.add(index);
    else modeState.pressed.delete(index);
  },
  draw: drawWorld,
};

/* 3. наклон: буква качается целиком, вылет канонический */
MODES.tilt = {
  label: 'наклон',
  note: 'Указатель качает букву целиком: перекладины наклоняются, точки скатываются к краю. Вылет не трогаем — работает только крен.',
  cursor: 'grab',
  tools: [...COMMON_TOOLS, { type: 'range', key: 'lean', label: 'крен', min: 0.05, max: 0.4, step: 0.01, value: 0.2 }],
  setup() { resetAll(); },
  aim() {
    bars.forEach((bar, index) => { bar.goal = CANON[index]; });
    const target = clamp((pointer.x / S - 0.5) * 2, -1, 1) * num('lean');
    angle += (target - angle) * 0.12;
  },
  draw: drawWorld,
};

/* ---------- панель ---------- */

function renderTools(mode) {
  toolsBar.innerHTML = '';
  for (const tool of mode.tools) {
    if (tool.type === 'button') {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tool.label;
      button.addEventListener('click', tool.action);
      toolsBar.append(button);
      continue;
    }
    const key = slot(tool.key);
    const value = key in toolValues ? toolValues[key] : tool.value;
    toolValues[key] = value;
    if (tool.type === 'toggle') {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.tool = tool.key;
      button.textContent = tool.label;
      button.setAttribute('aria-pressed', String(value));
      button.addEventListener('click', () => {
        toolValues[key] = !toolValues[key];
        button.setAttribute('aria-pressed', String(toolValues[key]));
      });
      toolsBar.append(button);
      continue;
    }
    const label = document.createElement('label');
    const input = document.createElement('input');
    const output = document.createElement('output');
    input.type = 'range';
    input.min = tool.min;
    input.max = tool.max;
    input.step = tool.step;
    input.value = value;
    output.value = String(value);
    input.addEventListener('input', () => {
      toolValues[key] = Number(input.value);
      output.value = input.value;
    });
    label.append(tool.label, input, output);
    toolsBar.append(label);
  }
}

function setMode(name) {
  current = name;
  const mode = MODES[name];
  modeState = {};
  renderTools(mode);
  mode.setup?.();
  canvas.style.cursor = mode.cursor || 'default';
  note.textContent = mode.note;
  const names = Object.keys(MODES);
  stage.dataset.index = `${String(names.indexOf(name) + 1).padStart(2, '0')} / ${String(names.length).padStart(2, '0')}`;
  for (const button of modesBar.children) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === name));
  }
}

Object.entries(MODES).forEach(([name, mode]) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.mode = name;
  button.textContent = mode.label;
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => setMode(name));
  modesBar.append(button);
});

/* ---------- сцена ---------- */

function resize() {
  const bounds = canvas.getBoundingClientRect();
  S = Math.max(1, bounds.width);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(S * dpr);
  canvas.height = Math.round(S * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function track(event) {
  const bounds = canvas.getBoundingClientRect();
  pointer.px = pointer.x;
  pointer.py = pointer.y;
  pointer.x = event.clientX - bounds.left;
  pointer.y = event.clientY - bounds.top;
}

canvas.addEventListener('pointerdown', (event) => {
  track(event);
  pointer.px = pointer.x;
  pointer.py = pointer.y;
  pointer.down = true;
  try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* Safari may reject capture */ }
  MODES[current].onDown?.(event);
});

canvas.addEventListener('pointermove', (event) => {
  track(event);
  MODES[current].onMove?.(event);
});

window.addEventListener('pointerup', () => {
  pointer.down = false;
  MODES[current].onUp?.();
});

window.addEventListener('keydown', (event) => MODES[current].onKey?.(event, true));
window.addEventListener('keyup', (event) => MODES[current].onKey?.(event, false));

let last = performance.now();
let debt = 0;
function frame(now) {
  debt = Math.min(0.1, debt + (now - last) / 1000);
  last = now;
  while (debt >= STEP) {
    stepWorld();
    debt -= STEP;
  }
  ctx.clearRect(0, 0, S, S);
  MODES[current].draw();
  requestAnimationFrame(frame);
}

resize();
setMode('reach');
new ResizeObserver(resize).observe(canvas);
requestAnimationFrame(frame);
