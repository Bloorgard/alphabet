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
  const low = MODES[current]?.startLow;
  balls = DOT_SLOTS.map((x) => low
    ? { x: x + 0.24, y: ROWS[2] - DOT_R - 0.012, vx: 0, vy: 0, alive: true }
    : { x, y: DOT_Y, vx: 0, vy: 0, alive: true });
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

function bounceOff(ball, bar, index, y, fromAbove) {
  const bounce = num('bounce');
  ball.y = fromAbove ? y - DOT_R : y + DOT_R;
  ball.vy = -ball.vy * bounce;
  if (fromAbove && Math.abs(ball.vy) < 0.08) ball.vy = 0;
  MODES[current].onHit?.(ball, index, ball.x);
  const along = clamp((ball.x - STEM_X) / (bar.end - STEM_X), 0, 1);
  /* подрезка — от удара, а не от касания: иначе лежащая точка сама уползает к обрыву */
  ball.vx += (along - 0.5) * num('spin') * clamp(Math.abs(ball.vy) / 0.6, 0, 1);
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
    if (ball.vy > 0 && py + DOT_R <= y && ball.y + DOT_R >= y) bounceOff(ball, bar, index, y, true);
    else if (ball.vy < 0 && py - DOT_R >= y && ball.y - DOT_R <= y) bounceOff(ball, bar, index, y, false);
  });
}

function stepBalls() {
  const gravity = num('grav');
  for (const ball of balls) {
    if (!ball.alive || ball.locked) continue;
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
  if (MODES[current].own) { MODES[current].step(); return; }
  MODES[current].aim?.();
  MODES[current].step?.();
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
  const base = alive === 2 ? 'Ё' : alive === 1 ? 'одна точка' : 'Е';
  const label = MODES[current].status?.() ?? `${base} · ${hits}`;
  ctx.fillStyle = alive === 1 ? RED : MUTED;
  ctx.font = `${Math.round(S * 0.022)}px 'DM Mono', ui-monospace, monospace`;
  ctx.textAlign = 'right';
  ctx.fillText(label, S * 0.96, S * 0.06);
  ctx.textAlign = 'left';
}

function drawWorld(overlay) {
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

  overlay?.();

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

/* ---------- цель: текст, потерявший ё ---------- */

const WORDS = [
  'ёж', 'ёлка', 'мёд', 'всё', 'поём', 'льёт', 'идёт', 'утёс', 'копьё', 'ружьё',
  'бельё', 'поёт', 'несёт', 'ёжик', 'лёд', 'шёпот', 'тёмный', 'чёрный', 'жёлтый',
  'зелёный', 'ёлочка', 'подъём', 'приём', 'вёдра', 'клён', 'лён', 'осёл', 'тёща',
];
const CHAR_W = 0.038;

function makeRow(index) {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const letters = [...word].map((ch) => ({
    ch: ch === 'ё' ? 'е' : ch,
    target: ch === 'ё',
    fixed: false,
  }));
  const width = letters.length * CHAR_W;
  const room = CANON[index] - STEM_X - width;
  return { letters, width, offset: STEM_X + Math.random() * Math.max(0, room), flash: 0, timer: 0 };
}

function dragRow(row, index, dx) {
  const room = CANON[index] - STEM_X - row.width;
  row.offset = clamp(row.offset + dx, STEM_X, STEM_X + Math.max(0, room));
}

function drawRows() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  modeState.rows.forEach((row, index) => {
    const y = ROWS[index];
    ctx.font = `${Math.round(S * 0.042)}px 'DM Mono', ui-monospace, monospace`;
    row.letters.forEach((letter, position) => {
      const x = (row.offset + (position + 0.5) * CHAR_W) * S;
      const hot = letter.fixed && row.flash > 0.05;
      ctx.fillStyle = hot ? RED : letter.target && !letter.fixed ? INK : MUTED;
      ctx.fillText(letter.fixed ? 'ё' : letter.ch, x, y * S - S * 0.014);
      if (letter.target && !letter.fixed) {
        ctx.strokeStyle = FAINT;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - CHAR_W * S * 0.5, y * S - S * 0.062, CHAR_W * S, S * 0.048);
      }
    });
  });
  ctx.textAlign = 'left';
}

MODES.words = {
  label: 'слова',
  note: 'Три строки набраны без ё. Тяни строку по горизонтали и подставь её «е» под падающую точку: попал — слово исправлено, точка летит дальше. Потеряешь обе точки — текст останется без ё.',
  cursor: 'ew-resize',
  tools: COMMON_TOOLS,
  setup() {
    modeState.rows = ROWS.map((row, index) => makeRow(index));
    modeState.held = -1;
    modeState.score = 0;
    resetAll();
  },
  aim() { bars.forEach((bar, index) => { bar.goal = CANON[index]; }); },
  step() {
    modeState.rows.forEach((row, index) => {
      row.flash *= 0.94;
      if (row.timer > 0) {
        row.timer -= STEP;
        if (row.timer <= 0) modeState.rows[index] = makeRow(index);
      }
    });
  },
  onDown() { modeState.held = nearRow(pointer.y / S); },
  onMove() {
    if (modeState.held < 0) return;
    dragRow(modeState.rows[modeState.held], modeState.held, (pointer.x - pointer.px) / S);
  },
  onUp() { modeState.held = -1; },
  onHit(ball, index, x) {
    const row = modeState.rows[index];
    if (row.timer > 0) return;
    const position = Math.floor((x - row.offset) / CHAR_W);
    const letter = row.letters[position];
    if (!letter || !letter.target || letter.fixed) return;
    letter.fixed = true;
    row.flash = 1;
    modeState.score += 1;
    if (row.letters.every((item) => !item.target || item.fixed)) row.timer = 1.2;
  },
  status() { return `исправлено ${modeState.score}`; },
  draw() { drawWorld(drawRows); },
};

/* ---------- цель: та же, но без текста ---------- */

const MARK_W = 0.07;

function makeMark(index) {
  const room = CANON[index] - STEM_X - MARK_W;
  return { offset: STEM_X + Math.random() * Math.max(0, room), flash: 0 };
}

function drawMarks() {
  modeState.rows.forEach((mark, index) => {
    const y = ROWS[index];
    const hot = mark.flash > 0.05;
    ctx.fillStyle = hot ? RED : 'rgba(22,22,22,.1)';
    ctx.fillRect(mark.offset * S, y * S - S * 0.03, MARK_W * S, S * 0.03);
    line(mark.offset, y - 0.03, mark.offset, y, hot ? RED : INK, 1);
    line(mark.offset + MARK_W, y - 0.03, mark.offset + MARK_W, y, hot ? RED : INK, 1);
  });
}

MODES.targets = {
  label: 'мишени',
  note: 'То же самое без текста: на каждой строке одно гнездо. Тяни строку, подставляй гнездо под точку. Попал — гнездо переезжает.',
  cursor: 'ew-resize',
  tools: COMMON_TOOLS,
  setup() {
    modeState.rows = ROWS.map((row, index) => makeMark(index));
    modeState.held = -1;
    modeState.score = 0;
    resetAll();
  },
  aim() { bars.forEach((bar, index) => { bar.goal = CANON[index]; }); },
  step() { modeState.rows.forEach((mark) => { mark.flash *= 0.94; }); },
  onDown() { modeState.held = nearRow(pointer.y / S); },
  onMove() {
    if (modeState.held < 0) return;
    const index = modeState.held;
    const room = CANON[index] - STEM_X - MARK_W;
    const mark = modeState.rows[index];
    mark.offset = clamp(mark.offset + (pointer.x - pointer.px) / S, STEM_X, STEM_X + Math.max(0, room));
  },
  onUp() { modeState.held = -1; },
  onHit(ball, index, x) {
    const mark = modeState.rows[index];
    if (x < mark.offset || x > mark.offset + MARK_W) return;
    const flash = 1;
    modeState.rows[index] = makeMark(index);
    modeState.rows[index].flash = flash;
    modeState.score += 1;
  },
  status() { return `попаданий ${modeState.score}`; },
  draw() { drawWorld(drawMarks); },
};

/* ---------- цель: занести точки в гнёзда над буквой ---------- */

function drawNests() {
  DOT_SLOTS.forEach((x, index) => {
    if (modeState.locked?.[index]) return;
    ctx.beginPath();
    ctx.arc(x * S, DOT_Y * S, DOT_R * 1.9 * S, 0, Math.PI * 2);
    ctx.strokeStyle = FAINT;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

MODES.nests = {
  label: 'гнёзда',
  startLow: true,
  note: 'Точки лежат внизу, над буквой два пустых гнезда. Тапни строку в момент касания — перекладина подбивает точку выше. Занеси обе, не уронив за край.',
  cursor: 'pointer',
  tools: [...COMMON_TOOLS, { type: 'range', key: 'boost', label: 'подбив', min: 1.05, max: 1.8, step: 0.05, value: 1.4 }],
  setup() {
    modeState.charge = { index: -1, time: 0 };
    modeState.locked = [false, false];
    resetAll();
  },
  aim() { bars.forEach((bar, index) => { bar.goal = CANON[index]; }); },
  step() {
    if (modeState.charge.time > 0) modeState.charge.time -= STEP;
    balls.forEach((ball) => {
      if (!ball.alive || ball.locked) return;
      DOT_SLOTS.forEach((x, index) => {
        if (modeState.locked[index]) return;
        if (Math.hypot(ball.x - x, ball.y - DOT_Y) > DOT_R * 2.2) return;
        modeState.locked[index] = true;
        ball.locked = true;
        ball.x = x;
        ball.y = DOT_Y;
        ball.vx = 0;
        ball.vy = 0;
      });
    });
  },
  onDown() {
    const index = nearRow(pointer.y / S);
    if (index < 0) return;
    modeState.charge = { index, time: 0.18 };
    balls.forEach((ball) => {
      if (!ball.alive || ball.locked) return;
      const resting = Math.abs(ball.y - (ROWS[index] - DOT_R)) < 0.012 && Math.abs(ball.vy) < 0.1;
      if (resting && ball.x > STEM_X && ball.x < bars[index].end) ball.vy = -num('boost') * 0.7;
    });
  },
  onHit(ball, index) {
    if (modeState.charge.time > 0 && modeState.charge.index === index) ball.vy *= num('boost');
  },
  status() {
    const done = modeState.locked.filter(Boolean).length;
    return done === 2 ? 'Ё собрана' : `в гнёздах ${done} / 2`;
  },
  draw() { drawWorld(drawNests); },
};

/* ---------- ход: Ё едет на своих точках ---------- */

/* пропорции с эскиза: корпус 489x112 при кадре 1200, колёса r=31 на базе 220.
   SCALE ужимает букву целиком, чтобы в кадр влезало больше карты. */
const SCALE = 0.62;
const BODY_W = 0.407 * SCALE;
const BODY_H = 0.093 * SCALE;
const WHEEL_R = 0.026 * SCALE;
const WHEEL_X = 0.225;
const STROKE = 0.0092 * SCALE;
const SCREEN_X = 0.36;
const BLOCK_W = 0.035 * SCALE;

function terrainAt(x) {
  const amp = num('relief');
  return 0.72
    + Math.sin(x * 2.1) * 0.05 * amp
    + Math.sin(x * 5.3 + 1.7) * 0.018 * amp
    + Math.sin(x * 0.73 + 0.4) * 0.035 * amp;
}

function seedBlocks() {
  const car = modeState.car;
  while (modeState.blocks.length < 4) {
    const previous = modeState.blocks.at(-1)?.x ?? car.x + 0.8;
    modeState.blocks.push({ x: previous + 0.95 + Math.random() * 0.85, h: (0.05 + Math.random() * 0.045) * SCALE, flash: 0 });
  }
  modeState.blocks = modeState.blocks.filter((block) => block.x > car.x - 0.6);
}

function resetRide() {
  modeState.car = { x: 0, y: 0.5, vy: 0, angle: 0, alive: true, ground: false };
  modeState.blocks = [];
  modeState.wheels = [{ y: 0.6, gone: false, vx: 0, vy: 0 }, { y: 0.6, gone: false, vx: 0, vy: 0 }];
  modeState.crash = 0;
  seedBlocks();
}

/* точка крепления колеса едет вместе с накренённым корпусом */
function carRotation() {
  const car = modeState.car;
  return car.angle + (car.alive ? 0 : modeState.crash * 0.2);
}

function attachPoint(index) {
  const car = modeState.car;
  const rotation = carRotation();
  const lx = (index === 0 ? -1 : 1) * WHEEL_X * BODY_W;
  const ly = BODY_H / 2;
  return {
    x: car.x + lx * Math.cos(rotation) - ly * Math.sin(rotation),
    y: car.y - BODY_H / 2 + lx * Math.sin(rotation) + ly * Math.cos(rotation),
  };
}

function wheelWorldX(index) {
  return attachPoint(index).x;
}

function crashRide(block) {
  if (!modeState.car.alive) return;
  modeState.car.alive = false;
  modeState.crash = 1;
  if (block) block.flash = 1;
  modeState.wheels.forEach((wheel, index) => {
    wheel.gone = true;
    wheel.vx = 0.35 + index * 0.1;
    wheel.vy = -0.35;
    wheel.x = wheelWorldX(index);
  });
}

MODES.ride = {
  label: 'ход',
  own: true,
  note: 'Ё перевёрнута и едет на собственных точках: подвеска отрабатывает рельеф, пробел или тап — прыжок. Задел тумбу — точки отваливаются, дальше едет Е.',
  cursor: 'pointer',
  tools: [
    { type: 'range', key: 'speed', label: 'ход', min: 0.2, max: 1.2, step: 0.05, value: 0.6 },
    { type: 'range', key: 'grav', label: 'тяжесть', min: 0.8, max: 4, step: 0.1, value: 2.2 },
    { type: 'range', key: 'stiff', label: 'подвеска', min: 8, max: 120, step: 2, value: 34 },
    { type: 'range', key: 'damp', label: 'демпфер', min: 0.4, max: 10, step: 0.2, value: 2.4 },
    { type: 'range', key: 'travel', label: 'ход подвески', min: 0.02, max: 0.08, step: 0.002, value: 0.036 },
    { type: 'range', key: 'jump', label: 'прыжок', min: 0.4, max: 2, step: 0.05, value: 1.45 },
    { type: 'range', key: 'relief', label: 'рельеф', min: 0, max: 2, step: 0.1, value: 1 },
    { type: 'toggle', key: 'pause', label: 'пауза', value: false },
    { type: 'button', label: 'заново', action: () => resetRide() },
  ],
  setup() { resetRide(); },
  jump() {
    const car = modeState.car;
    if (!car.alive || !car.ground) return;
    car.vy = -num('jump');
    car.ground = false;
  },
  step() {
    const car = modeState.car;
    const travel = num('travel');
    modeState.crash *= 0.97;
    modeState.blocks.forEach((block) => { block.flash *= 0.94; });

    if (car.alive) {
      car.x += num('speed') * STEP;
      seedBlocks();
    }

    /* подвеска: каждое колесо тянет корпус вверх пропорционально сжатию */
    let force = 0;
    let contacts = 0;
    const attach = [0, 1].map((index) => attachPoint(index));
    const grounds = attach.map((point) => terrainAt(point.x) - WHEEL_R);
    grounds.forEach((groundY, index) => {
      const hang = attach[index].y + travel;
      if (hang <= groundY) return;
      contacts += 1;
      force -= (hang - groundY) * num('stiff');
      force -= car.vy * num('damp');
    });
    /* вес снимаем с пружины: иначе мягкая подвеска просто садится на упор и не качает */
    if (contacts) force -= num('grav') * contacts / 2;
    const grounded = contacts > 0;

    car.vy += (num('grav') + force) * STEP;
    car.y += car.vy * STEP;
    car.ground = grounded && car.alive;

    /* упор подвески: колесо не должно наезжать на нижнюю линию корпуса */
    const limit = Math.min(...grounds) - (WHEEL_R + 0.005);
    if (car.y > limit) { car.y = limit; if (car.vy > 0) car.vy = 0; }

    const slope = Math.atan2(grounds[1] - grounds[0], 2 * WHEEL_X * BODY_W);
    car.angle += ((car.alive && grounded ? slope : car.angle * 0.9) - car.angle) * 0.18;

    modeState.wheels.forEach((wheel, index) => {
      if (wheel.gone) {
        wheel.x += wheel.vx * STEP;
        wheel.vy += num('grav') * STEP;
        wheel.y += wheel.vy * STEP;
        const groundY = terrainAt(wheel.x) - WHEEL_R;
        if (wheel.y > groundY) { wheel.y = groundY; wheel.vy = -wheel.vy * 0.35; wheel.vx *= 0.99; }
        return;
      }
      wheel.y = Math.min(grounds[index], attach[index].y + travel);
    });

    if (!car.alive) return;
    const lowest = car.y + travel + WHEEL_R;
    for (const block of modeState.blocks) {
      const top = terrainAt(block.x) - block.h;
      const overlap = Math.abs(block.x - car.x) < BLOCK_W / 2 + BODY_W / 2;
      if (overlap && lowest > top) crashRide(block);
    }
  },
  onDown() { this.jump(); },
  onKey(event, down) {
    if (event.code !== 'Space' || !down) return;
    event.preventDefault();
    this.jump();
  },
  status() {
    const car = modeState.car;
    return car.alive ? `Ё · ${car.x.toFixed(1)}` : `Е · ${car.x.toFixed(1)}`;
  },
  draw() {
    const car = modeState.car;
    const camera = car.x - SCREEN_X;

    /* рельеф */
    ctx.strokeStyle = INK;
    ctx.lineWidth = S * STROKE;
    ctx.beginPath();
    for (let sx = 0; sx <= 1.001; sx += 0.005) {
      const y = terrainAt(camera + sx) * S;
      if (sx === 0) ctx.moveTo(0, y);
      else ctx.lineTo(sx * S, y);
    }
    ctx.stroke();

    /* тумбы */
    for (const block of modeState.blocks) {
      const sx = (block.x - camera) * S;
      if (sx < -S * 0.1 || sx > S * 1.1) continue;
      const base = terrainAt(block.x) * S;
      ctx.fillStyle = block.flash > 0.05 ? RED : INK;
      ctx.fillRect(sx - BLOCK_W * S / 2, base - block.h * S, BLOCK_W * S, block.h * S);
    }

    /* корпус: Ё, повёрнутая на пол-оборота */
    ctx.save();
    ctx.translate(SCREEN_X * S, (car.y - BODY_H / 2) * S);
    ctx.rotate(carRotation());
    ctx.strokeStyle = INK;
    ctx.lineWidth = S * STROKE;
    ctx.lineCap = 'butt';
    const half = BODY_W / 2 * S;
    const rows = [-BODY_H / 2, 0, BODY_H / 2].map((offset) => offset * S);
    ctx.beginPath();
    ctx.moveTo(half, rows[0]);
    ctx.lineTo(half, rows[2]);
    ctx.stroke();
    rows.forEach((y, index) => {
      ctx.beginPath();
      ctx.moveTo(index === 0 ? -half * 0.985 : -half, y);
      ctx.lineTo(half, y);
      ctx.stroke();
    });
    ctx.restore();

    /* точки-колёса */
    modeState.wheels.forEach((wheel, index) => {
      const point = attachPoint(index);
      const sx = (wheel.gone ? wheel.x : point.x) - camera;
      ctx.beginPath();
      ctx.arc(sx * S, wheel.y * S, WHEEL_R * S, 0, Math.PI * 2);
      ctx.fillStyle = wheel.gone && modeState.crash > 0.1 ? RED : INK;
      ctx.fill();
    });

    drawStatus();
  },
};

/* ---------- трасса: Ё как мотоцикл ---------- */

const TRACK_SCALE = 0.62;
const T_BODY_W = 0.407 * TRACK_SCALE;
const T_BODY_H = 0.093 * TRACK_SCALE;
const T_WHEEL_BASE = 0.016;
const T_WHEEL_X = 0.4;
const T_WHEEL_DROP = 0.048;
const T_STROKE = 0.0092 * TRACK_SCALE;
const T_SCREEN_X = 0.3;
const T_INERTIA = 0.02;
const T_SUBSTEPS = 3;
let tDt = STEP;
const T_LIGHT = '#f2eee6';
const T_DARK = '#101010';

function hash1(i) {
  const x = Math.sin(i * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const t = f * f * (3 - 2 * f);
  return (hash1(i) + (hash1(i + 1) - hash1(i)) * t) - 0.5;
}

/* трамплины: редкие гладкие горбы, с которых на скорости отрывает */
function trackBumps(x) {
  let sum = 0;
  const cell = Math.floor(x / 3.4);
  for (let k = cell - 1; k <= cell + 1; k += 1) {
    const center = k * 3.4 + hash1(k * 3.7) * 2.2;
    const width = 0.3 + hash1(k * 9.1) * 0.28;
    const height = 0.06 + hash1(k * 5.3) * 0.09;
    const d = (x - center) / width;
    if (Math.abs(d) < 1.8) sum -= height * Math.exp(-d * d * 2.2);
  }
  return sum;
}

/* сложность привязана к месту на трассе, а не ко времени: рельеф позади
   остаётся тем же, а впереди растёт */
function trackGrowth(x) {
  return 1 + clamp(x / 45, 0, 1) * 1.1;
}

function trackAt(x) {
  const relief = num('relief') * trackGrowth(x);
  return 0.62
    + (noise1(x * 0.42) * 0.2
      + noise1(x * 1.15 + 11.3) * 0.075
      + Math.sin(x * 2.4 + 0.4) * 0.014
      + trackBumps(x)) * relief;
}

function trackSlope(x) {
  const step = 0.004;
  return (trackAt(x + step) - trackAt(x - step)) / (2 * step);
}

function resetTrack(keepPlace = false) {
  const from = keepPlace ? modeState.bike.x : 0;
  modeState.bike = {
    x: from, y: trackAt(from) - (T_BODY_H / 2 + Math.max(T_WHEEL_DROP, (num('wheel') || T_WHEEL_BASE) * 1.15) + (num('wheel') || T_WHEEL_BASE)),
    vx: 0, vy: 0,
    angle: 0, omega: 0,
    wheelsOn: [false, false],
  };
  modeState.phase = 'ride';
  modeState.timer = 0;
  modeState.runStart = from;
  modeState.camY = modeState.bike.y;
  modeState.wheelDrop = [0, 0];
  modeState.best = modeState.best ?? 0;
}

/* лёжа точки подтягиваются к корпусу и читаются как диакритика,
   на ходу отъезжают на подвеску */
function wheelR() {
  return num('wheel');
}

/* момент инерции растёт вместе с разносом масс: у большого колеса
   и плечо больше, и раскрутить тело тяжелее */
function trackInertia() {
  const reach = wheelOffset() + wheelR();
  const base = T_BODY_H / 2 + T_WHEEL_DROP + T_WHEEL_BASE;
  return T_INERTIA * (reach / base) ** 2;
}

/* точки стоят на одном вылете всегда: лежащая буква — это её нормальный
   вид, и подтянутая подвеска ломала бы его. Большое колесо отодвигает
   крепление, иначе оно накрывает саму букву. */
function wheelOffset() {
  return T_BODY_H / 2 + Math.max(T_WHEEL_DROP, wheelR() * 1.15);
}

function bikePoint(lx, ly) {
  const bike = modeState.bike;
  const cos = Math.cos(bike.angle);
  const sin = Math.sin(bike.angle);
  return { x: bike.x + lx * cos - ly * sin, y: bike.y + lx * sin + ly * cos };
}

function bodyCorners() {
  return [
    [-T_BODY_W / 2, -T_BODY_H / 2], [T_BODY_W / 2, -T_BODY_H / 2],
    [T_BODY_W / 2, T_BODY_H / 2], [-T_BODY_W / 2, T_BODY_H / 2],
  ].map(([lx, ly]) => bikePoint(lx, ly));
}

function runDistance() {
  return Math.max(0, modeState.bike.x - modeState.runStart);
}

/* нормаль к рельефу, вверх от поверхности */
function trackNormal(x) {
  const slope = trackSlope(x);
  const norm = Math.hypot(slope, 1);
  return { x: slope / norm, y: -1 / norm, tx: 1 / norm, ty: slope / norm };
}

/* тяга только на задней точке, тормоз — на обеих и сильнее на передней:
   иначе на переднее колесо не встать, к нему нечего приложить */
function wheelContact(index, throttle = 0, brake = 0) {
  const bike = modeState.bike;
  const local = (index === 0 ? -1 : 1) * T_WHEEL_X * T_BODY_W;
  const point = bikePoint(local, wheelOffset());
  const radius = wheelR();
  const drop = point.y + radius - trackAt(point.x);
  modeState.wheelDrop[index] = 0;
  bike.wheelsOn[index] = drop > 0;
  if (drop <= 0) return false;
  /* колесо всегда катится по поверхности: проседает корпус, а не оно */
  modeState.wheelDrop[index] = drop;

  const n = trackNormal(point.x);
  /* на склоне вертикальный зазор длиннее настоящего — меряем по нормали */
  const depth = drop * -n.y;
  const rx = point.x - bike.x;
  const ry = point.y - bike.y;
  const vpx = bike.vx - bike.omega * ry;
  const vpy = bike.vy + bike.omega * rx;
  const vn = vpx * n.x + vpy * n.y;
  const vt = vpx * n.tx + vpy * n.ty;

  const normal = Math.max(0, clamp(depth, 0, 0.06) * num('stiff') - vn * num('damp'));
  let along = -vt * num('grip');
  if (index === 0) along += throttle * num('power');
  along -= vt * brake * (index === 1 ? 3.5 : 1.5);

  const fx = n.x * normal + n.tx * along;
  const fy = n.y * normal + n.ty * along;
  bike.vx += fx * tDt;
  bike.vy += fy * tDt;
  bike.omega += (rx * fy - ry * fx) / trackInertia() * tDt;
  return true;
}

function stepTrackRide() {
  const bike = modeState.bike;
  const keys = modeState.keys;
  const throttle = keys.has('ArrowUp') || modeState.tap ? 1 : 0;
  const brake = keys.has('ArrowDown') ? 1 : 0;
  const lean = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);

  bike.vy += num('grav') * tDt;

  let contacts = 0;
  [0, 1].forEach((index) => {
    if (wheelContact(index, throttle, brake)) contacts += 1;
  });

  bike.omega += lean * num('lean') * (contacts ? 0.35 : 1) * tDt;
  bike.omega *= contacts ? 1 - 0.03 * (tDt / STEP) : 1 - 0.005 * (tDt / STEP);
  bike.omega = clamp(bike.omega, -5, 5);
  bike.vx = clamp(bike.vx, -1.2, 2.4);

  bike.x += bike.vx * tDt;
  bike.y += bike.vy * tDt;
  bike.angle += bike.omega * tDt;

  /* допуск в толщину линии: касание мельче неё не видно глазу,
     и краш по нему читается как несправедливый */
  for (const corner of bodyCorners()) {
    if (corner.y > trackAt(corner.x) + T_STROKE) {
      modeState.phase = 'fall';
      modeState.timer = 0;
      modeState.best = Math.max(modeState.best, runDistance());
      return;
    }
  }
}

/* падение: корпус разговаривает с землёй сам, и его доворачивает
   в нормальное положение буквы — точками вверх */
/* на кувырке удар приходит быстрее, чем успевает сработать пружина,
   поэтому колесо ещё и выталкивается из земли позиционно */
function pushWheelsOut(passes = 1) {
  const bike = modeState.bike;
  for (let pass = 0; pass < passes; pass += 1) [0, 1].forEach((index) => {
    const local = (index === 0 ? -1 : 1) * T_WHEEL_X * T_BODY_W;
    const point = bikePoint(local, wheelOffset());
    const drop = point.y + wheelR() - trackAt(point.x);
    if (drop <= 0) return;
    const n = trackNormal(point.x);
    const depth = drop * -n.y;
    bike.x += n.x * depth;
    bike.y += n.y * depth;
    const vn = bike.vx * n.x + bike.vy * n.y;
    if (vn < 0) { bike.vx -= n.x * vn; bike.vy -= n.y * vn; }
  });
}

function stepTrackFall() {
  const bike = modeState.bike;
  bike.vy += num('grav') * tDt;
  modeState.timer += tDt;
  [0, 1].forEach((index) => wheelContact(index));

  bodyCorners().forEach((corner, index) => {
    const ground = trackAt(corner.x);
    const depth = corner.y - ground;
    if (depth <= 0) return;
    const n = trackNormal(corner.x);
    const local = [
      [-T_BODY_W / 2, -T_BODY_H / 2], [T_BODY_W / 2, -T_BODY_H / 2],
      [T_BODY_W / 2, T_BODY_H / 2], [-T_BODY_W / 2, T_BODY_H / 2],
    ][index];
    const rx = corner.x - bike.x;
    const ry = corner.y - bike.y;
    const vpx = bike.vx - bike.omega * ry;
    const vpy = bike.vy + bike.omega * rx;
    const vn = vpx * n.x + vpy * n.y;
    const normal = Math.max(0, clamp(depth, 0, 0.05) * 240 - vn * 16);
    const friction = -(vpx * n.tx + vpy * n.ty) * 4;
    const fx = n.x * normal + n.tx * friction;
    const fy = n.y * normal + n.ty * friction;
    bike.vx += fx * tDt;
    bike.vy += fy * tDt;
    bike.omega += (rx * fy - ry * fx) / trackInertia() * tDt;
    void local;
  });

  /* мягкая подкрутка к ближайшему обороту: буква ложится правильной стороной */
  const target = bike.angle > 0 ? Math.PI : -Math.PI;
  bike.omega += (target - bike.angle) * 2.4 * tDt;
  bike.omega = clamp(bike.omega * (1 - 0.015 * (tDt / STEP)), -6, 6);
  bike.vx *= 1 - 0.01 * (tDt / STEP);

  bike.x += bike.vx * tDt;
  bike.y += bike.vy * tDt;
  bike.angle += bike.omega * tDt;
  pushWheelsOut();

  const settled = Math.abs(bike.omega) < 0.35 && Math.abs(bike.vy) < 0.12;
  if (modeState.timer > 0.7 && settled) {
    modeState.phase = 'rest';
    modeState.timer = 0;
    modeState.restAngle = bike.angle;
  }
}

/* покой: буква укладывается ровно по рельефу и ждёт «продолжить» */
function stepTrackRest() {
  const bike = modeState.bike;
  modeState.timer += STEP;
  const turn = bike.angle > 0 ? Math.PI : -Math.PI;
  const target = turn + Math.atan(trackSlope(bike.x));
  bike.angle += (target - bike.angle) * 0.12;
  bike.omega = 0;
  bike.vx *= 0.9;
  bike.vy = 0;
  const lie = trackAt(bike.x) - T_BODY_H / 2 - T_STROKE * 2;
  bike.y += (lie - bike.y) * 0.12;
}

/* оживление: буква докручивает оборот и снова встаёт на точки */
function stepTrackRevive() {
  const bike = modeState.bike;
  modeState.timer += STEP;
  const t = clamp(modeState.timer / 0.55, 0, 1);
  const ease = t * t * (3 - 2 * t);
  const from = modeState.reviveFrom;
  const lift = Math.sin(Math.PI * t) * 0.09;
  bike.angle = from.angle + (from.turn - from.angle) * ease;
  bike.y = from.y + (from.stand - from.y) * ease - lift;
  if (t < 1) return;
  bike.angle = 0;
  bike.omega = 0;
  bike.vx = 0;
  bike.vy = 0;
  modeState.phase = 'ride';
  modeState.runStart = bike.x;
}

function reviveTrack() {
  if (modeState.phase !== 'rest') return;
  const bike = modeState.bike;
  modeState.phase = 'revive';
  modeState.timer = 0;
  modeState.reviveFrom = {
    angle: bike.angle,
    turn: bike.angle > 0 ? Math.PI * 2 : -Math.PI * 2,
    y: bike.y,
    stand: trackAt(bike.x) - (T_BODY_H / 2 + Math.max(T_WHEEL_DROP, wheelR() * 1.15) + wheelR()),
  };
}

MODES.track = {
  label: 'трасса',
  own: true,
  dark: true,
  note: 'Ё едет сама: ↑ газ, ↓ тормоз, ← и → наклоняют корпус. Прыжка нет — прыгаешь с рельефа. Легла корпусом на землю — оказалась правильной Ё; пробел или клик поднимают её обратно.',
  cursor: 'pointer',
  tools: [
    { type: 'range', key: 'power', label: 'тяга', min: 0.5, max: 7, step: 0.1, value: 3.4 },
    { type: 'range', key: 'grav', label: 'тяжесть', min: 0.8, max: 4, step: 0.1, value: 2 },
    { type: 'range', key: 'stiff', label: 'подвеска', min: 80, max: 600, step: 10, value: 260 },
    { type: 'range', key: 'damp', label: 'демпфер', min: 2, max: 40, step: 1, value: 14 },
    { type: 'range', key: 'grip', label: 'сцепление', min: 0.5, max: 8, step: 0.1, value: 2 },
    { type: 'range', key: 'lean', label: 'наклон', min: 1, max: 12, step: 0.5, value: 5 },
    { type: 'range', key: 'relief', label: 'рельеф', min: 0.4, max: 2, step: 0.1, value: 1 },
    { type: 'range', key: 'wheel', label: 'колесо', min: 0.008, max: 0.13, step: 0.002, value: 0.016 },
    { type: 'toggle', key: 'night', label: 'ночь', value: true },
    { type: 'toggle', key: 'digits', label: 'цифры', value: true },
    { type: 'toggle', key: 'pause', label: 'пауза', value: false },
    { type: 'button', label: 'заново', action: () => resetTrack() },
  ],
  setup() { modeState.keys = new Set(); modeState.best = 0; resetTrack(); },
  step() {
    /* подшаги: за целый кадр колесо проходит больше своего радиуса
       и на скорости протыкает бугор насквозь */
    if (modeState.phase === 'ride' || modeState.phase === 'fall') {
      tDt = STEP / T_SUBSTEPS;
      for (let i = 0; i < T_SUBSTEPS; i += 1) {
        if (modeState.phase === 'ride') stepTrackRide();
        else if (modeState.phase === 'fall') stepTrackFall();
        else break;
      }
      tDt = STEP;
    } else if (modeState.phase === 'rest') stepTrackRest();
    else stepTrackRevive();
    modeState.camY += (modeState.bike.y - modeState.camY) * 0.06;
  },
  onDown() {
    if (modeState.phase === 'rest') { reviveTrack(); return; }
    modeState.tap = true;
  },
  onUp() { modeState.tap = false; },
  onKey(event, down) {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) return;
    event.preventDefault();
    if (event.code === 'Space') { if (down) reviveTrack(); return; }
    if (down) modeState.keys.add(event.code);
    else modeState.keys.delete(event.code);
  },
  draw() {
    const bike = modeState.bike;
    const camX = bike.x - T_SCREEN_X;
    const camY = modeState.camY - 0.55;
    const resting = modeState.phase === 'rest';
    /* буква одного цвета с землёй: на небе она видна, а коснувшись — краснеет */
    const night = on('night');
    const sky = night ? T_DARK : T_LIGHT;
    const ground = night ? T_LIGHT : T_DARK;
    const touched = modeState.phase === 'fall' || resting;
    const ink = touched ? RED : ground;

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, S, S);

    ctx.beginPath();
    for (let sx = 0; sx <= 1.001; sx += 0.004) {
      const y = (trackAt(camX + sx) - camY) * S;
      if (sx === 0) ctx.moveTo(0, y);
      else ctx.lineTo(sx * S, y);
    }
    ctx.lineTo(S, S);
    ctx.lineTo(0, S);
    ctx.closePath();
    ctx.fillStyle = ground;
    ctx.fill();

    ctx.save();
    ctx.translate((bike.x - camX) * S, (bike.y - camY) * S);
    ctx.rotate(bike.angle);
    const half = T_BODY_W / 2 * S;
    const top = -T_BODY_H / 2 * S;
    const bottom = T_BODY_H / 2 * S;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    ctx.strokeStyle = ink;
    ctx.lineWidth = S * T_STROKE;
    ctx.beginPath();
    ctx.moveTo(-half, top);
    ctx.lineTo(half, top);
    ctx.lineTo(half, bottom);
    ctx.lineTo(-half, bottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
    ctx.restore();

    [0, 1].forEach((index) => {
      const local = (index === 0 ? -1 : 1) * T_WHEEL_X * T_BODY_W;
      const point = bikePoint(local, wheelOffset());
      const x = (point.x - camX) * S;
      const y = (point.y - camY - modeState.wheelDrop[index]) * S;
      ctx.beginPath();
      ctx.arc(x, y, wheelR() * S, 0, Math.PI * 2);
      ctx.fillStyle = ink;
      ctx.fill();
    });

    /* счёт и «продолжить» живут рядом с буквой, а не в углу кадра */
    const anchorX = (bike.x - camX) * S;
    const anchorY = (bike.y - camY) * S;
    if (!on('digits')) return;
    ctx.textAlign = 'center';
    ctx.fillStyle = ground;
    ctx.globalAlpha = 0.5;
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = `${S * 0.004}px`;
    ctx.font = `${Math.round(S * 0.021)}px 'DM Mono', ui-monospace, monospace`;
    const above = Math.max(0.12, wheelR() + 0.09);
    ctx.fillText(runDistance().toFixed(1), anchorX, anchorY - above * S);
    if (resting) ctx.fillText(`лучший ${modeState.best.toFixed(1)}`, anchorX, anchorY - (above + 0.035) * S);
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  },
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
