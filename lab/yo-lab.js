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

const BODY_W = 0.26;
const BODY_H = 0.115;
const WHEEL_R = 0.024;
const WHEEL_X = 0.3;
const SCREEN_X = 0.36;
const BLOCK_W = 0.035;

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
    modeState.blocks.push({ x: previous + 0.55 + Math.random() * 0.75, h: 0.05 + Math.random() * 0.045, flash: 0 });
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

function wheelWorldX(index) {
  return modeState.car.x + (index === 0 ? -1 : 1) * WHEEL_X * BODY_W;
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
    { type: 'range', key: 'stiff', label: 'подвеска', min: 20, max: 200, step: 5, value: 80 },
    { type: 'range', key: 'damp', label: 'демпфер', min: 1, max: 14, step: 0.5, value: 6 },
    { type: 'range', key: 'travel', label: 'ход подвески', min: 0.04, max: 0.13, step: 0.005, value: 0.08 },
    { type: 'range', key: 'jump', label: 'прыжок', min: 0.4, max: 1.6, step: 0.05, value: 1 },
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
    let grounded = false;
    const grounds = [0, 1].map((index) => terrainAt(wheelWorldX(index)) - WHEEL_R);
    grounds.forEach((groundY) => {
      const hang = car.y + travel;
      if (hang <= groundY) return;
      grounded = true;
      force -= (hang - groundY) * num('stiff');
      force -= car.vy * num('damp');
    });

    car.vy += (num('grav') + force) * STEP;
    car.y += car.vy * STEP;
    car.ground = grounded && car.alive;

    /* упор подвески: колесо не должно наезжать на нижнюю линию корпуса */
    const limit = Math.min(...grounds) - (WHEEL_R + 0.022);
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
      wheel.y = Math.min(grounds[index], car.y + travel);
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
    ctx.lineWidth = S * 0.004;
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
    ctx.rotate(car.angle + (car.alive ? 0 : modeState.crash * 0.2));
    ctx.strokeStyle = INK;
    ctx.lineWidth = S * 0.011;
    ctx.lineCap = 'round';
    const half = BODY_W / 2 * S;
    const rows = [-BODY_H / 2, 0, BODY_H / 2].map((offset) => offset * S);
    ctx.beginPath();
    ctx.moveTo(half, rows[0]);
    ctx.lineTo(half, rows[2]);
    ctx.stroke();
    rows.forEach((y, index) => {
      ctx.beginPath();
      ctx.moveTo(index === 1 ? -half * 0.82 : -half, y);
      ctx.lineTo(half, y);
      ctx.stroke();
    });
    ctx.restore();

    /* точки-колёса */
    modeState.wheels.forEach((wheel, index) => {
      const sx = wheel.gone ? (wheel.x - camera) : (wheelWorldX(index) - camera);
      ctx.beginPath();
      ctx.arc(sx * S, wheel.y * S, WHEEL_R * S, 0, Math.PI * 2);
      ctx.fillStyle = wheel.gone && modeState.crash > 0.1 ? RED : INK;
      ctx.fill();
      if (!wheel.gone) {
        line(sx, wheel.y, SCREEN_X + (index === 0 ? -1 : 1) * WHEEL_X * BODY_W, car.y, INK, 1.5);
      }
    });

    drawStatus();
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
