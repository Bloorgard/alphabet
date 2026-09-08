/* Х · крест на пересечении.

   Штурм отверг типовые ассоциации (крестик-крестик, вычеркнуть, умножение) —
   они не используют форму буквы, а декорируют готовую идею контуром Х
   (тест на замену из AGENTS.md: подставь вместо Х любой другой значок
   «крест» — ничего не изменится). Взяли четыре идеи, которые опираются
   именно на то, чего у других букв нет: одну точку, где сходятся четыре
   луча, и две полные диагонали симметрии разом. Ножницы (пантограф) штурм
   тоже прошли, но в полигоне себя не оправдали: цепочка X-звеньев не
   ссылалась на форму буквы сильнее, чем на любой другой крестик — идею
   убрали.

   - «резонанс» (фигуры Хладни) — на квадратной пластине есть режим
     колебаний, при котором песок сам ложится в диагональный крест; игрок
     ищет его среди прочих узоров, крутя номера мод, а не рисует крест
     заранее.
   - «крестик» (вышивка) — настоящий ремесленный факт: крестик шьётся
     двумя проходами по ряду, и сбитое направление второго прохода видно
     как разнобой блеска ниток, а не абстрактная ошибка.
   - «мозаика» (Truchet) — квадратная плитка, разбитая по диагонали, и
     есть классический truchet-тайл; крест собирается или рассыпается из
     плиток, а не рисуется поверх шума.
*/

/* ---------- резонанс: фигуры Хладни ---------- */

const CHLADNI_MARGIN = 0.055;
const CHLADNI_GRID = 96;

function chladniField(n, m, x, y, balance = 1) {
  const u = (x - 0.5) * 2 / (1 - 2 * CHLADNI_MARGIN);
  const v = (y - 0.5) * 2 / (1 - 2 * CHLADNI_MARGIN);
  return Math.cos(n * Math.PI * u) * Math.cos(m * Math.PI * v)
    - balance * Math.cos(m * Math.PI * u) * Math.cos(n * Math.PI * v);
}

function chladniSpawn() {
  return {
    x: CHLADNI_MARGIN + Math.random() * (1 - 2 * CHLADNI_MARGIN),
    y: CHLADNI_MARGIN + Math.random() * (1 - 2 * CHLADNI_MARGIN),
    vx: 0, vy: 0, size: 0.45 + Math.random() * 0.65,
    weight: 0.65 + Math.random() * 0.7, tone: Math.floor(Math.random() * 4),
  };
}

function chladniSetup() {
  const count = CHLADNI_GRID + 1;
  modeState.field = new Float32Array(count * count);
  modeState.targetField = new Float32Array(count * count);
  modeState.waves = [];
  modeState.time = 0;
  modeState.lastTouch = -1;
  modeState.grains = Array.from({ length: num('grains') }, chladniSpawn);
  chladniRetune();
  modeState.field.set(modeState.targetField);
  for (let i = 0; i < 12; i++) chladniStep();
}

function chladniRetune() {
  const n = num('n'), m = num('m'), balance = num('balance');
  const count = CHLADNI_GRID + 1;
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      modeState.targetField[y * count + x] = chladniField(n, m, x / CHLADNI_GRID, y / CHLADNI_GRID, balance);
    }
  }
  for (const g of modeState.grains) {
    const angle = Math.random() * Math.PI * 2;
    g.vx += Math.cos(angle) * 0.006;
    g.vy += Math.sin(angle) * 0.006;
  }
}

function chladniWave(x, y, strength = 1) {
  modeState.waves.push({ x, y, age: 0, strength });
  if (modeState.waves.length > 12) modeState.waves.shift();
}

function chladniShake() {
  chladniWave(0.5, 0.5, 2);
  for (const g of modeState.grains) {
    const angle = Math.random() * Math.PI * 2;
    g.vx += Math.cos(angle) * 0.003;
    g.vy += Math.sin(angle) * 0.003;
  }
}

function chladniTouch() {
  if (modeState.time - modeState.lastTouch < 0.09) return;
  modeState.lastTouch = modeState.time;
  chladniWave(pointer.x, pointer.y);
}

function chladniStep() {
  const st = modeState;
  st.time += STEP;
  const target = Math.round(num('grains'));
  while (st.grains.length < target) st.grains.push(chladniSpawn());
  if (st.grains.length > target) st.grains.length = target;
  for (let i = 0; i < st.field.length; i++) st.field[i] = lerp(st.field[i], st.targetField[i], 0.08);
  for (const w of st.waves) w.age += STEP;
  st.waves = st.waves.filter(w => w.age < 1.5);
  const field = st.field, stride = CHLADNI_GRID + 1;
  for (const g of st.grains) {
    const gx = g.x * CHLADNI_GRID, gy = g.y * CHLADNI_GRID;
    const ix = Math.floor(gx), iy = Math.floor(gy), tx = gx - ix, ty = gy - iy;
    const i = iy * stride + ix;
    const a = field[i], b = field[i + 1], c = field[i + stride], d = field[i + stride + 1];
    const f = lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
    const dx = lerp(b - a, d - c, ty) * CHLADNI_GRID;
    const dy = lerp(c - a, d - b, tx) * CHLADNI_GRID;
    const force = -f * num('mobility') / (dx * dx + dy * dy + 0.8);
    const jitter = 0.00008 + Math.min(Math.abs(f), 1) * 0.002;
    g.vx = g.vx * 0.79 + dx * force * g.weight + (Math.random() - 0.5) * jitter;
    g.vy = g.vy * 0.79 + dy * force * g.weight + (Math.random() - 0.5) * jitter;
    for (const w of st.waves) {
      const wx = g.x - w.x, wy = g.y - w.y;
      const distance = Math.hypot(wx, wy);
      const ring = (distance - w.age * 0.6) / 0.035;
      if (Math.abs(ring) < 3) {
        const kick = Math.exp(-ring * ring) * 0.0008 * (1 - w.age / 1.5) * w.strength * num('wave');
        g.vx += wx / (distance + 0.001) * kick;
        g.vy += wy / (distance + 0.001) * kick;
      }
    }
    g.vx = clamp(g.vx, -0.012, 0.012);
    g.vy = clamp(g.vy, -0.012, 0.012);
    g.x += g.vx; g.y += g.vy;
    const end = 1 - CHLADNI_MARGIN;
    if (g.x < CHLADNI_MARGIN || g.x > end) g.vx *= -0.5;
    if (g.y < CHLADNI_MARGIN || g.y > end) g.vy *= -0.5;
    g.x = clamp(g.x, CHLADNI_MARGIN, end);
    g.y = clamp(g.y, CHLADNI_MARGIN, end);
  }
}

function chladniDraw() {
  const st = modeState;
  ctx.strokeStyle = ink(0.055);
  ctx.lineWidth = 0.5;
  ctx.strokeRect(CHLADNI_MARGIN * S, CHLADNI_MARGIN * S, S * (1 - 2 * CHLADNI_MARGIN), S * (1 - 2 * CHLADNI_MARGIN));
  for (let tone = 0; tone < 4; tone++) {
    ctx.fillStyle = ink([0.32, 0.5, 0.72, 1][tone]);
    ctx.beginPath();
    for (const g of st.grains) {
      if (g.tone !== tone) continue;
      const size = g.size * num('grainSize') * Math.max(0.85, S / 720);
      ctx.rect(g.x * S, g.y * S, size, size);
    }
    ctx.fill();
  }
  ctx.strokeStyle = ink(0.22);
  ctx.lineWidth = Math.max(0.5, S / 1100);
  ctx.beginPath();
  for (const g of st.grains) {
    if (g.tone !== 3 || Math.abs(g.vx) + Math.abs(g.vy) < 0.001) continue;
    ctx.moveTo(g.x * S, g.y * S);
    ctx.lineTo((g.x - g.vx * 1.6) * S, (g.y - g.vy * 1.6) * S);
  }
  ctx.stroke();
}

const CHLADNI_TOOLS = [
  { type: 'range', key: 'n', label: 'мода n', min: 1, max: 8, step: 1, value: 2 },
  { type: 'range', key: 'm', label: 'мода m', min: 0, max: 8, step: 1, value: 5 },
  { type: 'range', key: 'balance', label: 'баланс', min: -1, max: 1, step: 0.02, value: 1 },
  { type: 'range', key: 'mobility', label: 'сборка', min: 0.01, max: 0.09, step: 0.005, value: 0.05 },
  { type: 'range', key: 'grainSize', label: 'зерно', min: 0.8, max: 2.5, step: 0.1, value: 1.4 },
  { type: 'range', key: 'wave', label: 'волна', min: 0.2, max: 3, step: 0.1, value: 1 },
  { type: 'range', key: 'grains', label: 'порошок', min: 6000, max: 24000, step: 2000, value: 18000 },
  { type: 'button', label: 'встряхнуть', action: chladniShake },
];

const chladniMode = {
  label: 'резонанс',
  note: 'Светлый порошок собирается вдоль узловых линий. Моды n и m задают узор, баланс меняет соотношение двух колебаний. При равных модах и балансе 1 колебания гасят друг друга — порошок не собирается. Коснись пластины или проведи пальцем, чтобы поднять волну. Переходы — художественное смешение колебательных мод, а не точная физическая модель.',
  tools: CHLADNI_TOOLS,
  setup: chladniSetup,
  step: chladniStep,
  draw: chladniDraw,
  onTool(key) { if (['n', 'm', 'balance'].includes(key)) chladniRetune(); },
  onDown: chladniTouch,
  onMove() { if (pointer.down) chladniTouch(); },
  cursor: 'crosshair',
};

/* ---------- крестик: два прохода по ряду ---------- */

function stitchKey(cx, cy) { return `${cx},${cy}`; }

function stitchSetup() {
  modeState.cells = new Map();
  modeState.lastCell = null;
  modeState.strokeDir = 0;
  modeState.downX = 0;
  modeState.prevSecondDir = null;
  modeState.bad = 0;
}

function stitchReset() {
  modeState.cells.clear();
  modeState.prevSecondDir = null;
  modeState.bad = 0;
}

function stitchCellAt(px, py) {
  const n = Math.round(num('size'));
  const cx = Math.floor(clamp(px, 0, 0.999) * n);
  const cy = Math.floor(clamp(py, 0, 0.999) * n);
  return [cx, cy];
}

function stitchApply() {
  const [cx, cy] = stitchCellAt(pointer.x, pointer.y);
  const key = stitchKey(cx, cy);
  if (key === modeState.lastCell) return;
  modeState.lastCell = key;

  const second = on('проход');
  let cell = modeState.cells.get(key);

  if (!second) {
    if (!cell) modeState.cells.set(key, { a: true, b: false, bad: false });
    return;
  }

  if (!cell || !cell.a || cell.b) return;
  const dir = modeState.strokeDir;
  const bad = dir !== 0 && modeState.prevSecondDir !== null && dir === modeState.prevSecondDir;
  cell.b = true;
  cell.bad = bad;
  if (bad) modeState.bad += 1;
}

function stitchOnDown() {
  modeState.lastCell = null;
  modeState.downX = pointer.x;
  modeState.strokeDir = 0;
  stitchApply();
}

function stitchOnMove() {
  if (!pointer.down) return;
  if (modeState.strokeDir === 0) {
    const d = Math.sign(pointer.x - modeState.downX);
    if (d !== 0) modeState.strokeDir = d;
  }
  stitchApply();
}

function stitchOnUp() {
  if (on('проход') && modeState.strokeDir !== 0) modeState.prevSecondDir = modeState.strokeDir;
  modeState.lastCell = null;
}

function stitchDraw() {
  const n = Math.round(num('size'));
  const cell = 1 / n;
  for (const [key, s] of modeState.cells) {
    const [cx, cy] = key.split(',').map(Number);
    const x0 = cx * cell, y0 = cy * cell;
    const x1 = x0 + cell, y1 = y0 + cell;
    if (s.a) line(x0, y1, x1, y0, s.b ? FAINT : INK, cell * 0.14);
    if (s.b) line(x0, y0, x1, y1, s.bad ? RED : INK, cell * 0.18);
  }
  for (let i = 0; i <= n; i += 1) {
    line(i * cell, 0, i * cell, 1, GHOST, 0.002);
    line(0, i * cell, 1, i * cell, GHOST, 0.002);
  }
  drawStatus(`${modeState.bad} сбитых крестиков`, modeState.bad > 0);
}

const STITCH_TOOLS = [
  { type: 'range', key: 'size', label: 'сетка', min: 6, max: 16, step: 1, value: 10 },
  { type: 'toggle', key: 'проход', label: 'второй проход', value: false },
  { type: 'button', label: 'заново', action: stitchReset },
];

const stitchMode = {
  label: 'крестик',
  note: 'Крестик шьётся двумя проходами по ряду: сначала все нижние стежки в одну сторону, потом все верхние — обратно. Тумблер «второй проход» включает верхний слой; разверни его в ту же сторону, что и прошлый ряд, вместо обратной — шов подсветится красным, как в реальной вышивке видна сбитая нить.',
  tools: STITCH_TOOLS,
  setup: stitchSetup,
  draw: stitchDraw,
  onDown: stitchOnDown,
  onMove: stitchOnMove,
  onUp: stitchOnUp,
  cursor: 'crosshair',
};

/* ---------- мозаика: truchet-тайл ---------- */

function truchetIndex(cx, cy, n) { return cy * n + cx; }

function truchetSetup() {
  const n = Math.round(num('size'));
  modeState.size = n;
  modeState.tiles = new Array(n * n).fill(0).map(() => (Math.random() < 0.5 ? 0 : 1));
  modeState.lastCell = null;
}

function truchetOnDiagonal(cx, cy, n) { return cx === cy || cx + cy === n - 1; }
function truchetTarget(cx, cy) { return cx === cy ? 0 : 1; }

function truchetShuffle() {
  for (let i = 0; i < modeState.tiles.length; i += 1) modeState.tiles[i] = Math.random() < 0.5 ? 0 : 1;
}

/* Трогает только клетки на диагоналях — фон остаётся тем шумом, какой уже
   был, иначе крест не на чем проявляться контрастом. */
function truchetAssemble() {
  const n = modeState.size;
  for (let cy = 0; cy < n; cy += 1) {
    for (let cx = 0; cx < n; cx += 1) {
      if (truchetOnDiagonal(cx, cy, n)) modeState.tiles[truchetIndex(cx, cy, n)] = truchetTarget(cx, cy);
    }
  }
}

function truchetToggleAt() {
  if (!pointer.down) return;
  const n = modeState.size;
  const cx = Math.floor(clamp(pointer.x, 0, 0.999) * n);
  const cy = Math.floor(clamp(pointer.y, 0, 0.999) * n);
  const key = `${cx},${cy}`;
  if (key === modeState.lastCell) return;
  modeState.lastCell = key;
  const i = truchetIndex(cx, cy, n);
  modeState.tiles[i] = modeState.tiles[i] ? 0 : 1;
}

function truchetOnDown() { modeState.lastCell = null; truchetToggleAt(); }
function truchetOnMove() { truchetToggleAt(); }
function truchetOnUp() { modeState.lastCell = null; }

function truchetDraw() {
  const n = modeState.size;
  const cell = 1 / n;
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineWidth = cell * S * 0.14;
  let match = 0, diagonal = 0;
  for (let cy = 0; cy < n; cy += 1) {
    for (let cx = 0; cx < n; cx += 1) {
      const i = truchetIndex(cx, cy, n);
      const orient = modeState.tiles[i];
      if (truchetOnDiagonal(cx, cy, n)) {
        diagonal += 1;
        if (orient === truchetTarget(cx, cy)) match += 1;
      }
      const x0 = cx * cell * S, y0 = cy * cell * S;
      const r = (cell * S) / 2;
      ctx.beginPath();
      if (orient === 0) {
        ctx.arc(x0, y0, r, 0, Math.PI / 2);
        ctx.moveTo(x0 + cell * S, y0 + cell * S);
        ctx.arc(x0 + cell * S, y0 + cell * S, r, Math.PI, Math.PI * 1.5);
      } else {
        ctx.arc(x0 + cell * S, y0, r, Math.PI / 2, Math.PI);
        ctx.moveTo(x0, y0 + cell * S);
        ctx.arc(x0, y0 + cell * S, r, Math.PI * 1.5, Math.PI * 2);
      }
      ctx.stroke();
    }
  }
  const percent = diagonal ? Math.round((match / diagonal) * 100) : 0;
  drawStatus(`${percent}% похоже на Х`, percent === 100);
}

const TRUCHET_TOOLS = [
  { type: 'range', key: 'size', label: 'сетка', min: 4, max: 16, step: 1, value: 8 },
  { type: 'button', label: 'перемешать', action: truchetShuffle },
  { type: 'button', label: 'собрать Х', action: truchetAssemble },
];

const truchetMode = {
  label: 'мозаика',
  note: 'Каждая плитка — классический truchet-тайл: квадрат, разбитый по диагонали, с двумя дугами вместо прямой линии. Клик или протяжка поворачивает плитку на 90°. «Собрать Х» ставит плитки вдоль обеих диагоналей в положение, продолжающее дугу соседа — крест собирается из шума, а не рисуется поверх него.',
  tools: TRUCHET_TOOLS,
  setup: truchetSetup,
  draw: truchetDraw,
  onDown: truchetOnDown,
  onMove: truchetOnMove,
  onUp: truchetOnUp,
  onTool(key) { if (key === 'size') truchetSetup(); },
  cursor: 'pointer',
};

/* ---------- гиперболическая гравюра ---------- */

function hyperSetup() {
  modeState.phase = 0;
  modeState.x = 0.5;
  modeState.y = 0.5;
  modeState.hold = null;
  modeState.pins = [];
  modeState.drag = null;
  modeState.releases = [];
  modeState.motion = [];
  for (let y = 0.1; y < 0.95; y += 0.08) {
    for (let x = 0.1; x < 0.95; x += 0.08) {
      const [px, py] = hyperDeform(x, y);
      const flow = hyperFlow(x, y);
      modeState.motion.push({ x, y, px, py, vx: flow[0], vy: flow[1], sx: 0, sy: 0 });
    }
  }
}

function hyperUnpin(index) {
  const [pin] = modeState.pins.splice(index, 1);
  modeState.releases.push({ ...pin, age: 0 });
  if (modeState.releases.length > 8) modeState.releases.shift();
}

function hyperTouch() {
  const hit = modeState.pins.findIndex(pin => Math.hypot(pointer.x - pin.x, pointer.y - pin.y) < 0.035);
  if (hit >= 0) {
    const pin = modeState.pins[hit];
    modeState.drag = { pin, x: pointer.x, y: pointer.y, px: pin.x, py: pin.y, moved: false, existing: true };
    return;
  }
  if (on('pins')) {
    if (modeState.pins.length === 8) hyperUnpin(0);
    const pin = {
      x: clamp(pointer.x, 0.045, 0.955),
      y: clamp(pointer.y, 0.045, 0.955), charge: 0, age: 0,
    };
    modeState.pins.push(pin);
    modeState.drag = { pin, x: pointer.x, y: pointer.y, px: pin.x, py: pin.y, moved: false, existing: false };
    return;
  }
  if (modeState.hold) hyperRelease();
  modeState.hold = {
    x: clamp(pointer.x, 0.045, 0.955),
    y: clamp(pointer.y, 0.045, 0.955),
    charge: 0, age: 0,
  };
}

function hyperMove() {
  const drag = modeState.drag;
  if (!pointer.down || !drag) return;
  const dx = pointer.x - drag.x, dy = pointer.y - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) * S < 6) return;
  drag.moved = true;
  drag.pin.x = clamp(drag.px + dx, 0.045, 0.955);
  drag.pin.y = clamp(drag.py + dy, 0.045, 0.955);
}

function hyperUp() {
  const drag = modeState.drag;
  modeState.drag = null;
  if (drag && drag.existing && !drag.moved) {
    const index = modeState.pins.indexOf(drag.pin);
    if (index >= 0) hyperUnpin(index);
  }
  hyperRelease();
}

function hyperRelease() {
  if (!modeState.hold) return;
  modeState.releases.push({ ...modeState.hold, age: 0 });
  if (modeState.releases.length > 5) modeState.releases.shift();
  modeState.hold = null;
}

function hyperStep() {
  modeState.phase += STEP * num('speed');
  if (modeState.hold) {
    modeState.hold.charge = Math.min(3, modeState.hold.charge + STEP * (num('speed') + 0.3));
  }
  for (const pin of modeState.pins) pin.charge = Math.min(3, pin.charge + STEP * (num('speed') + 0.3));
  for (const release of modeState.releases) release.age += STEP;
  modeState.releases = modeState.releases.filter(release => release.age < 3);
  hyperMotion();
}

function hyperFlow(x, y) {
  const u = x - 0.5, v = y - 0.5;
  const scale = num('speed') * 0.1152 / num('density') / (u * u + v * v + 0.025);
  return [u * scale, -v * scale];
}

function hyperMotion() {
  for (const sample of modeState.motion) {
    const [px, py] = hyperDeform(sample.x, sample.y);
    const flow = hyperFlow(sample.x, sample.y);
    const vx = (px - sample.px) / STEP + flow[0];
    const vy = (py - sample.py) / STEP + flow[1];
    const speed = Math.hypot(vx, vy);
    const shift = Math.min(3, Math.max(0, speed - 0.015) * 18);
    const scale = speed > 0 ? shift / speed : 0;
    sample.sx = lerp(sample.sx, vx * scale, 0.4);
    sample.sy = lerp(sample.sy, vy * scale, 0.4);
    sample.px = px; sample.py = py;
  }
}

function hyperSplit(x, y) {
  const gx = clamp((x - 0.1) / 0.08, 0, 10), gy = clamp((y - 0.1) / 0.08, 0, 10);
  const ix = Math.min(9, Math.floor(gx)), iy = Math.min(9, Math.floor(gy));
  const tx = gx - ix, ty = gy - iy, grid = modeState.motion;
  const a = grid[iy * 11 + ix], b = grid[iy * 11 + ix + 1];
  const c = grid[(iy + 1) * 11 + ix], d = grid[(iy + 1) * 11 + ix + 1];
  return [lerp(lerp(a.sx, b.sx, tx), lerp(c.sx, d.sx, tx), ty),
    lerp(lerp(a.sy, b.sy, tx), lerp(c.sy, d.sy, tx), ty)];
}

function hyperDeform(x, y) {
  let displacement = 0;
  const radius = num('reach');
  const apply = (touch, released) => {
    const distance = Math.hypot(x - touch.x, y - touch.y);
    const core = Math.exp(-distance * distance / (radius * radius));
    if (!released) return touch.charge * core;
    const time = touch.age;
    const ring = (distance - time * 0.32) / (radius * 0.55);
    return touch.charge * (core * Math.exp(-time * 4)
      + Math.sin(time * 9 - distance * 22) * Math.exp(-ring * ring)
        * (1 - Math.exp(-time * 5)) * Math.exp(-time * 1.4));
  };
  for (const pin of modeState.pins) displacement += apply(pin, false);
  if (modeState.hold) displacement += apply(modeState.hold, false);
  for (const release of modeState.releases) displacement += apply(release, true);
  const u = x - 0.5, v = y - 0.5;
  const factor = displacement * num('force') * 0.012 / (Math.max(8, num('density')) / 20) / (u * u + v * v + 0.025);
  return [x - u * factor, y + v * factor];
}

const hyperMode = {
  label: 'гравюра',
  note: 'Уровни x² − y²: две диагонали при нулевом уровне, гиперболы вокруг. Прижми полосы пальцем: вокруг касания накапливается деформация. Отпусти — она расправится волной. Чем дольше держишь, тем сильнее отклик. В режиме «закрепления» касание оставляет точку, потяни точку, чтобы переместить деформацию; короткое повторное касание снимает её волной. До восьми точек; девятая освобождает самую старую. Выключи «закрепления», чтобы вернуться к удержанию.',
  tools: [
    { type: 'range', key: 'density', label: 'частота', min: 2, max: 25, step: 1, value: 12 },
    { type: 'range', key: 'width', label: 'толщина', min: 0.3, max: 30, step: 0.1, value: 0.8 },
    { type: 'range', key: 'speed', label: 'течение', min: 0, max: 1, step: 0.05, value: 0.15 },
    { type: 'range', key: 'reach', label: 'радиус', min: 0.06, max: 0.3, step: 0.01, value: 0.16 },
    { type: 'range', key: 'force', label: 'сила', min: 0.3, max: 3, step: 0.1, value: 1.5 },
    { type: 'toggle', key: 'pins', label: 'закрепления', value: true },
    { type: 'toggle', key: 'echo', label: 'аберрация', value: true },
    { type: 'button', label: 'инверсия', action() { setGround(ground === 'ink' ? 'paper' : 'ink'); labWriteHash(); } },
    { type: 'button', label: 'отпустить всё', action() {
      modeState.drag = null;
      while (modeState.pins.length) hyperUnpin(0);
      hyperRelease();
    } },
  ],
  setup: hyperSetup,
  step: hyperStep,
  draw() {
    const density = num('density');
    const phase = modeState.phase % 1;
    ctx.save();
    ctx.beginPath(); ctx.rect(S * 0.045, S * 0.045, S * 0.91, S * 0.91); ctx.clip();
    ctx.strokeStyle = INK;
    ctx.lineWidth = num('width');
    const engraving = new Path2D();
    const redChannel = new Path2D(), cyanChannel = new Path2D();
    for (let k = -density; k <= density; k++) {
      const level = (k + phase) / density;
      for (const sign of [-1, 1]) {
        let started = false;
        for (let j = 0; j <= 420; j++) {
          const t = -1.5 + j / 140;
          const r = Math.sqrt(t * t + Math.abs(level));
          const x = level >= 0 ? sign * r : t;
          const y = level >= 0 ? t : sign * r;
          const [deformedX, deformedY] = hyperDeform(modeState.x + x * 0.48, modeState.y + y * 0.48);
          const px = deformedX * S;
          const py = deformedY * S;
          if (on('echo')) {
            const [dx, dy] = hyperSplit(modeState.x + x * 0.48, modeState.y + y * 0.48);
            if (!started) {
              redChannel.moveTo(px + dx, py + dy); cyanChannel.moveTo(px - dx, py - dy);
            } else {
              redChannel.lineTo(px + dx, py + dy); cyanChannel.lineTo(px - dx, py - dy);
            }
          }
          if (!started) { engraving.moveTo(px, py); started = true; } else engraving.lineTo(px, py);
        }
      }
    }
    if (on('echo')) {
      ctx.globalCompositeOperation = ground === 'ink' ? 'screen' : 'multiply';
      ctx.strokeStyle = '#ff0000'; ctx.stroke(redChannel);
      ctx.strokeStyle = '#00ffff'; ctx.stroke(cyanChannel);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.strokeStyle = INK;
    ctx.stroke(engraving);
    ctx.restore();
    for (const pin of modeState.pins) {
      dot(pin.x, pin.y, PAPER, 0.009);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pin.x * S, pin.y * S, S * 0.009, 0, Math.PI * 2);
      ctx.stroke();
      dot(pin.x, pin.y, INK, 0.0025);
    }
  },
  onTool(key) { if (key === 'pins') { modeState.drag = null; hyperRelease(); } },
  onDown: hyperTouch,
  onMove: hyperMove,
  onUp: hyperUp,
  cursor: 'crosshair',
};

/* ---------- седловое течение ---------- */

function saddleSetup() {
  modeState.time = 0;
  modeState.clock = 0;
  modeState.gesture = null;
  modeState.strings = [];
  const count = num('threads'), bend = num('bend');
  for (let quadrant = 0; quadrant < 4; quadrant++) {
    const sx = quadrant < 2 ? 1 : -1, sy = quadrant % 2 ? 1 : -1;
    for (let i = 1; i <= count; i++) {
      const c = 0.00008 + Math.pow(i / count, 2.5) * 0.4;
      const points = [];
      let arc = 0;
      for (let j = 0; j <= 220; j++) {
        const t = -4 + j * 8 / 220;
        const u = sx * Math.sqrt(c) * Math.exp(t), v = sy * Math.sqrt(c) * Math.exp(-t);
        const x = (u + v) * 0.7071, y = (u - v) * 0.7071;
        const px = 0.5 + x * 0.45, py = 0.5 + (y + bend * Math.sin(x * 2) * 0.25) * 0.45;
        if (j) arc += Math.hypot(px - points[j - 1].x, py - points[j - 1].y);
        points.push({ x: px, y: py, arc });
      }
      for (let j = 0; j < points.length; j++) {
        const a = points[Math.max(0, j - 1)], b = points[Math.min(points.length - 1, j + 1)];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        points[j].nx = -(b.y - a.y) / length;
        points[j].ny = (b.x - a.x) / length;
      }
      modeState.strings.push({ points, waves: [], lastHit: -1, tone: i % 5, phase: i * 0.037 });
    }
  }
}

function saddleTouch(event) {
  const previous = modeState.gesture;
  modeState.gesture = { x: pointer.x, y: pointer.y, time: event.timeStamp };
  if (!previous) return;
  const dx = pointer.x - previous.x, dy = pointer.y - previous.y;
  const length2 = dx * dx + dy * dy;
  if (length2 < 0.000001) return;
  const speed = Math.sqrt(length2) / Math.max(0.008, (event.timeStamp - previous.time) / 1000);
  for (const string of modeState.strings) {
    if (modeState.clock - string.lastHit < 0.07) continue;
    let hit = null, best = 0.012;
    for (const p of string.points) {
      if (p.x < 0.045 || p.x > 0.955 || p.y < 0.045 || p.y > 0.955) continue;
      const t = clamp(((p.x - previous.x) * dx + (p.y - previous.y) * dy) / length2, 0, 1);
      const distance = Math.hypot(p.x - previous.x - t * dx, p.y - previous.y - t * dy);
      if (distance < best) { best = distance; hit = p; }
    }
    if (!hit) continue;
    const transverse = (dx * hit.nx + dy * hit.ny) / Math.sqrt(length2);
    if (Math.abs(transverse) < 0.15) continue;
    string.waves.push({ arc: hit.arc, age: 0,
      strength: transverse * Math.min(0.04, 0.007 + speed * 0.014) * num('pluck'),
      width: clamp(0.065 / (1 + speed), 0.015, 0.06) });
    if (string.waves.length > 6) string.waves.shift();
    string.lastHit = modeState.clock;
  }
}

function saddleOffset(point, waves) {
  let offset = 0;
  for (const wave of waves) {
    const distance = point.arc - wave.arc;
    for (const direction of [-1, 1]) {
      const travel = (distance - direction * wave.age * 0.32) / wave.width;
      offset += wave.strength * 0.5 * Math.exp(-travel * travel / 2)
        * Math.cos(travel * 2.3) * Math.exp(-wave.age * 1.8);
    }
  }
  return offset;
}

const saddleMode = {
  label: 'шёлк',
  note: 'Проведи поперёк нитей: задетые струны отклоняются и отправляют волны в обе стороны. Быстрый жест даёт резкий щипок, медленный — мягкую рябь. Повторные жесты складываются. Изгиб меняет форму ткани.',
  tools: [
    { type: 'range', key: 'threads', label: 'нити', min: 30, max: 180, step: 5, value: 100 },
    { type: 'range', key: 'bend', label: 'изгиб', min: -1, max: 1, step: 0.05, value: 0.3 },
    { type: 'range', key: 'speed', label: 'течение', min: 0, max: 1, step: 0.05, value: 0.25 },
    { type: 'range', key: 'pluck', label: 'щипок', min: 0.3, max: 2.5, step: 0.1, value: 1.2 },
  ],
  setup: saddleSetup,
  step() {
    modeState.time += STEP * num('speed');
    modeState.clock += STEP;
    for (const string of modeState.strings) {
      for (const wave of string.waves) wave.age += STEP;
      string.waves = string.waves.filter(wave => wave.age < 3);
    }
  },
  draw() {
    ctx.save();
    ctx.beginPath(); ctx.rect(S * 0.045, S * 0.045, S * 0.91, S * 0.91); ctx.clip();
    ctx.lineWidth = Math.max(0.4, S / 1200);
    for (const string of modeState.strings) {
      ctx.strokeStyle = ink(0.16 + string.tone * 0.06);
      ctx.beginPath();
      const points = string.points.map(p => {
        const offset = saddleOffset(p, string.waves);
        return [(p.x + p.nx * offset) * S, (p.y + p.ny * offset) * S];
      });
      points.forEach(([x, y], j) => { if (!j) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
      const head = Math.floor(((modeState.time + string.phase) % 1) * 200);
      ctx.strokeStyle = ink(0.7); ctx.beginPath();
      for (let j = head; j < head + 18; j++) {
        const [x, y] = points[j];
        if (j === head) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  },
  onTool(key) { if (key === 'threads' || key === 'bend') saddleSetup(); },
  onDown(event) { modeState.gesture = null; saddleTouch(event); },
  onMove(event) { if (pointer.down) saddleTouch(event); },
  onUp() { modeState.gesture = null; },
  cursor: 'crosshair',
};

/* ---------- Rule 90 ---------- */

function laceBuild() {
  const n = modeState.seed.length;
  modeState.rows = [modeState.seed.slice()];
  for (let y = 1; y < Math.ceil(n / 2); y++) {
    const prev = modeState.rows[y - 1], row = new Uint8Array(n);
    for (let x = 0; x < n; x++) row[x] = prev[(x - 1 + n) % n] ^ prev[(x + 1) % n];
    modeState.rows.push(row);
  }
}

function laceSetup() {
  modeState.seed = new Uint8Array(num('cells'));
  modeState.seed[Math.floor(modeState.seed.length / 2)] = 1;
  modeState.lastCell = -1;
  laceBuild();
}

function laceTouch() {
  const x = Math.floor((pointer.x - 0.05) / 0.9 * modeState.seed.length);
  if (x < 0 || x >= modeState.seed.length || x === modeState.lastCell) return;
  modeState.lastCell = x;
  modeState.seed[x] ^= 1;
  laceBuild();
}

const laceMode = {
  label: 'кружево',
  note: 'Rule 90: клетка — XOR двух диагональных соседей. Начальная строка отражена вверх и вниз. Касайся сцены или веди по горизонтали, чтобы менять биты центральной строки и перестраивать диагональное кружево.',
  tools: [
    { type: 'range', key: 'cells', label: 'масштаб', min: 65, max: 257, step: 32, value: 129 },
    { type: 'range', key: 'gap', label: 'просвет', min: 0, max: 0.6, step: 0.05, value: 0.15 },
    { type: 'button', label: 'одна точка', action: laceSetup },
    { type: 'button', label: 'рассеять', action() {
      for (let i = 0; i < modeState.seed.length; i++) modeState.seed[i] = Math.random() < 0.12 ? 1 : 0;
      laceBuild();
    } },
  ],
  setup: laceSetup,
  draw() {
    const n = modeState.seed.length, cell = S * 0.9 / n;
    const size = cell * (1 - num('gap'));
    ctx.fillStyle = INK;
    ctx.beginPath();
    modeState.rows.forEach((row, y) => {
      for (let x = 0; x < n; x++) {
        if (!row[x]) continue;
        const px = S * 0.05 + x * cell;
        ctx.rect(px, S * 0.5 + y * cell - size / 2, size, size);
        if (y) ctx.rect(px, S * 0.5 - y * cell - size / 2, size, size);
      }
    });
    ctx.fill();
    line(0.05, 0.5, 0.95, 0.5, FAINT, 0.001);
  },
  onTool(key) { if (key === 'cells') laceSetup(); },
  onDown() { modeState.lastCell = -1; laceTouch(); },
  onMove() { if (pointer.down) laceTouch(); },
  cursor: 'crosshair',
};

startLab({
  title: 'Х · крест на пересечении',
  modes: { resonance: chladniMode, stitch: stitchMode, truchet: truchetMode, hyper: hyperMode, saddle: saddleMode, lace: laceMode },
  start: 'resonance',
  ground: 'ink',
});
