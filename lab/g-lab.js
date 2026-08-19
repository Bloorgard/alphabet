/* Полигон буквы Г: семь механик рядом, чтобы выбрать одну.
   Формы заданы в долях кадра, физика считается в пикселях кадра S. */

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const modesBar = document.getElementById('modes');
const toolsBar = document.getElementById('tools');
const note = document.getElementById('note');

const INK = '#161616';
const RED = '#e0210f';
const FAINT = 'rgba(22,22,22,.16)';
const STEP = 1 / 60;   // физика идёт фиксированным шагом

let S = 0;
let dpr = 1;
let current = null;
let modeState = {};
const toolValues = {};
const pointer = { x: 0, y: 0, px: 0, py: 0, down: false };

// Ползунки живут раздельно по режимам: «вылет» у консоли и «плечо» у крюка — разные вещи.
function slot(key) { return `${current}:${key}`; }
function num(key) { return Number(toolValues[slot(key)]); }
function on(key) { return Boolean(toolValues[slot(key)]); }
function clamp(value, min, max) { return value < min ? min : value > max ? max : value; }

/* ---------- формы ---------- */

// Печатная Г: конец перекладины → угол → низ стойки.
function capitalAxis(reach = 0.36) {
  return [[0.34 + reach, 0.18], [0.34, 0.18], [0.34, 0.84]];
}

// Строчная печатная: тот же угол, короче плечо и ниже посадка.
function smallAxis(reach = 0.2) {
  return [[0.4 + reach, 0.44], [0.4, 0.44], [0.4, 0.82]];
}

function bezier(p0, p1, p2, p3, steps) {
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

// Рукописная г: подъём, загиб вправо, спуск с хвостом — одно движение.
function cursiveAxis() {
  return [
    ...bezier([0.30, 0.80], [0.34, 0.64], [0.40, 0.46], [0.45, 0.30], 36),
    ...bezier([0.45, 0.30], [0.50, 0.20], [0.62, 0.24], [0.61, 0.38], 28).slice(1),
    ...bezier([0.61, 0.38], [0.60, 0.54], [0.56, 0.66], [0.68, 0.70], 28).slice(1),
  ];
}

function resample(points, count) {
  const walk = [0];
  for (let i = 1; i < points.length; i += 1) {
    walk.push(walk[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = walk[walk.length - 1];
  const out = [];
  let j = 0;
  for (let i = 0; i < count; i += 1) {
    const target = (i / (count - 1)) * total;
    while (j < walk.length - 2 && walk[j + 1] < target) j += 1;
    const span = walk[j + 1] - walk[j] || 1;
    const t = (target - walk[j]) / span;
    out.push([
      points[j][0] + (points[j + 1][0] - points[j][0]) * t,
      points[j][1] + (points[j + 1][1] - points[j][1]) * t,
    ]);
  }
  return out;
}

function strokeNodes(nodes, width, color) {
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(nodes[0].x, nodes[0].y);
  for (let i = 1; i < nodes.length; i += 1) ctx.lineTo(nodes[i].x, nodes[i].y);
  ctx.stroke();
}

function strokeAxis(axis, width, color) {
  strokeNodes(axis.map(([x, y]) => ({ x: x * S, y: y * S })), width, color);
}

/* ---------- упругий стержень ---------- */

function wrap(angle) {
  return ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function turn(a, b, c) {
  return wrap(Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x));
}

// Стержень помнит не только длины сегментов, но и углы: форма живёт в них.
function makeRod(axis, count, pinned) {
  const nodes = resample(axis, count).map(([x, y]) => ({ x: x * S, y: y * S, px: x * S, py: y * S, load: 0, held: false }));
  const lens = [];
  for (let i = 0; i < nodes.length - 1; i += 1) {
    lens.push(Math.hypot(nodes[i + 1].x - nodes[i].x, nodes[i + 1].y - nodes[i].y));
  }
  const rest = [];
  for (let i = 1; i < nodes.length - 1; i += 1) rest.push(turn(nodes[i - 1], nodes[i], nodes[i + 1]));
  const corner = rest.reduce((best, angle, i) => (Math.abs(angle) > Math.abs(rest[best]) ? i : best), 0) + 1;
  const home = nodes.map((n) => ({ x: n.x, y: n.y }));
  return { nodes, lens, rest, pinned, corner, home, damage: nodes.map(() => 0) };
}

function fixed(rod, i) {
  return i < rod.pinned || rod.nodes[i].held;
}

function rotateAround(node, pivot, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = node.x - pivot.x;
  const dy = node.y - pivot.y;
  node.x = pivot.x + dx * cos - dy * sin;
  node.y = pivot.y + dx * sin + dy * cos;
}

function solveLengths(rod) {
  for (let i = 0; i < rod.lens.length; i += 1) {
    const a = rod.nodes[i];
    const b = rod.nodes[i + 1];
    const aFixed = fixed(rod, i);
    const bFixed = fixed(rod, i + 1);
    if (aFixed && bFixed) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    const shift = ((d - rod.lens[i]) / d) * 0.5;
    const ka = aFixed ? 0 : bFixed ? 2 : 1;
    const kb = bFixed ? 0 : aFixed ? 2 : 1;
    a.x += dx * shift * ka;
    a.y += dy * shift * ka;
    b.x -= dx * shift * kb;
    b.y -= dy * shift * kb;
  }
}

// Форма буквы живёт в углах: цель пересобирается от заделки по ним же,
// поэтому потёкший угол уводит за собой всё, что дальше по стержню.
function buildTarget(rod) {
  const { home, lens, rest, pinned } = rod;
  const pts = home.slice(0, pinned).map((n) => ({ x: n.x, y: n.y }));
  let angle = Math.atan2(home[pinned - 1].y - home[pinned - 2].y, home[pinned - 1].x - home[pinned - 2].x);
  for (let i = pinned - 1; i < home.length - 1; i += 1) {
    angle += rest[i - 1];
    pts[i + 1] = { x: pts[i].x + Math.cos(angle) * lens[i], y: pts[i].y + Math.sin(angle) * lens[i] };
  }
  return pts;
}

// Металл течёт там, где узел перегнуло сильнее предела.
function plasticFlow(rod, opts) {
  if (opts.yield <= 0) return;
  for (let i = 1; i < rod.nodes.length - 1; i += 1) {
    const cur = turn(rod.nodes[i - 1], rod.nodes[i], rod.nodes[i + 1]);
    const diff = wrap(cur - rod.rest[i - 1]);
    if (Math.abs(diff) <= opts.yield) continue;
    const excess = Math.abs(diff) - opts.yield;
    rod.rest[i - 1] += Math.sign(diff) * excess * opts.flow;
    rod.damage[i] = Math.min(1, rod.damage[i] + excess * 0.04);
  }
}

// Сглаживаем не саму цепочку, а её отклонение от цели: угол буквы остаётся углом.
function smooth(rod, target, amount) {
  const { nodes } = rod;
  const off = nodes.map((n, i) => ({ x: n.x - target[i].x, y: n.y - target[i].y }));
  for (let i = 1; i < nodes.length - 1; i += 1) {
    if (fixed(rod, i)) continue;
    nodes[i].x += ((off[i - 1].x + off[i + 1].x) * 0.5 - off[i].x) * amount;
    nodes[i].y += ((off[i - 1].y + off[i + 1].y) * 0.5 - off[i].y) * amount;
  }
}

function pullToTarget(rod, target, k) {
  for (let i = rod.pinned; i < rod.nodes.length; i += 1) {
    const n = rod.nodes[i];
    if (n.held) continue;
    n.x += (target[i].x - n.x) * k;
    n.y += (target[i].y - n.y) * k;
  }
}

function stepRod(rod, opts) {
  const g = opts.gravity * S * STEP * STEP;
  for (let i = 0; i < rod.nodes.length; i += 1) {
    const n = rod.nodes[i];
    if (fixed(rod, i)) { n.px = n.x; n.py = n.y; continue; }
    const vx = (n.x - n.px) * opts.damp;
    const vy = (n.y - n.py) * opts.damp;
    n.px = n.x;
    n.py = n.y;
    n.x += vx;
    n.y += vy + g * (1 + n.load);
  }
  plasticFlow(rod, opts);
  const target = buildTarget(rod);
  // Возврат к форме мягкий: прогиб под грузом должен быть виден глазом.
  pullToTarget(rod, target, opts.stiffness * 0.06);
  // Без сглаживания цепочка идёт мелкой пилой, и пила сама запускает течь.
  smooth(rod, target, 0.3);
  for (let k = 0; k < 3; k += 1) solveLengths(rod);
}

function drawRod(rod, width) {
  strokeNodes(rod.nodes, width, INK);
  for (let i = 0; i < rod.nodes.length; i += 1) {
    if (rod.damage[i] < 0.04) continue;
    const n = rod.nodes[i];
    // Усталость видна там, где стержень уже не выпрямится.
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(n.x, n.y, width * 0.2 * Math.min(1, rod.damage[i] * 3), 0, Math.PI * 2);
    ctx.fill();
  }
}

// Общий захват: тащим ближайший свободный узел.
function grabRod(rod) {
  let best = -1;
  let bestDist = S * 0.06;
  for (let i = rod.pinned; i < rod.nodes.length; i += 1) {
    const d = Math.hypot(rod.nodes[i].x - pointer.x, rod.nodes[i].y - pointer.y);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  if (best >= 0) {
    rod.nodes[best].held = true;
    modeState.heldNode = rod.nodes[best];
  }
}

function dragRod() {
  const n = modeState.heldNode;
  if (!n) return;
  n.px = n.x;
  n.py = n.y;
  n.x = pointer.x;
  n.y = pointer.y;
}

function releaseRod() {
  if (!modeState.heldNode) return;
  modeState.heldNode.held = false;
  modeState.heldNode = null;
}

/* ---------- режимы ---------- */

const MODES = {};

const RESTART = { type: 'button', label: 'заново', action: () => setMode(current) };

MODES.beam = {
  label: 'консоль',
  note: 'заглавная Г — балка с вылетом: груз тянет перекладину вниз, металл течёт у самого угла',
  tools: [
    RESTART,
    { type: 'range', label: 'вылет', key: 'reach', min: 0.16, max: 0.5, step: 0.01, value: 0.36, rebuild: true },
    { type: 'range', label: 'жёсткость', key: 'stiff', min: 0.2, max: 2, step: 0.05, value: 1 },
    { type: 'range', label: 'груз', key: 'load', min: 0, max: 14, step: 0.2, value: 4 },
    { type: 'range', label: 'предел', key: 'yield', min: 0, max: 0.3, step: 0.005, value: 0.1 },
    { type: 'range', label: 'вязкость', key: 'damp', min: 0.9, max: 0.999, step: 0.001, value: 0.99 },
  ],
  setup() {
    // Стойка заделана в пол, свободен только вылет.
    modeState.rod = makeRod(capitalAxis(num('reach')).reverse(), 40, 4);
  },
  step() {
    const rod = modeState.rod;
    rod.nodes[rod.nodes.length - 1].load = num('load');
    stepRod(rod, {
      gravity: 1, damp: num('damp'), stiffness: num('stiff'),
      yield: num('yield'), flow: 0.03,
    });
  },
  draw() {
    const rod = modeState.rod;
    strokeAxis(capitalAxis(num('reach')), S * 0.085, FAINT);
    drawRod(rod, S * 0.085);
    const tip = rod.nodes[rod.nodes.length - 1];
    const weight = num('load');
    if (weight <= 0) return;
    const r = S * 0.012 * Math.sqrt(weight) + S * 0.012;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x, tip.y + S * 0.06);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y + S * 0.06 + r, r, 0, Math.PI * 2);
    ctx.fill();
  },
  onDown() { grabRod(modeState.rod); },
  onMove() { dragRod(); },
  onUp() { releaseRod(); },
};

MODES.hook = {
  label: 'крюк',
  note: 'строчная г держит груз коротким плечом: клик добавляет вес, на разгибе крюк роняет всё',
  tools: [
    RESTART,
    { type: 'range', label: 'плечо', key: 'reach', min: 0.1, max: 0.32, step: 0.01, value: 0.2, rebuild: true },
    { type: 'range', label: 'жёсткость', key: 'stiff', min: 0.2, max: 2, step: 0.05, value: 1.2 },
    { type: 'range', label: 'вес гири', key: 'unit', min: 0.5, max: 6, step: 0.5, value: 2 },
    { type: 'range', label: 'предел', key: 'yield', min: 0, max: 0.3, step: 0.005, value: 0.08 },
    { type: 'range', label: 'угол срыва', key: 'slip', min: 5, max: 80, step: 1, value: 28 },
    { type: 'button', label: 'снять груз', action: () => { modeState.hung = 0; } },
  ],
  setup() {
    modeState.rod = makeRod(smallAxis(num('reach')).reverse(), 32, 4);
    modeState.hung = 0;
    modeState.falling = [];
  },
  step() {
    const rod = modeState.rod;
    const tip = rod.nodes[rod.nodes.length - 1];
    tip.load = modeState.hung * num('unit');
    stepRod(rod, {
      gravity: 1, damp: 0.99, stiffness: num('stiff'),
      yield: num('yield'), flow: 0.04,
    });
    // Плечо разогнулось вниз — держать больше нечем.
    const corner = rod.nodes[rod.corner];
    const droop = Math.atan2(tip.y - corner.y, Math.abs(tip.x - corner.x) || 1e-6);
    if (modeState.hung > 0 && droop > (num('slip') * Math.PI) / 180) {
      for (let i = 0; i < modeState.hung; i += 1) {
        modeState.falling.push({ x: tip.x + (Math.random() - 0.5) * S * 0.02, y: tip.y, vx: (Math.random() - 0.5) * S * 0.004, vy: 0 });
      }
      modeState.hung = 0;
    }
    for (const g of modeState.falling) {
      g.vy += 1.6 * S * STEP * STEP;
      g.x += g.vx;
      g.y += g.vy;
    }
    modeState.falling = modeState.falling.filter((g) => g.y < S * 1.2);
  },
  draw() {
    const rod = modeState.rod;
    strokeAxis(smallAxis(num('reach')), S * 0.07, FAINT);
    drawRod(rod, S * 0.07);
    const tip = rod.nodes[rod.nodes.length - 1];
    const r = S * 0.016;
    ctx.fillStyle = INK;
    for (let i = 0; i < modeState.hung; i += 1) {
      const row = Math.floor(i / 3);
      const col = (i % 3) - 1;
      ctx.beginPath();
      ctx.arc(tip.x + col * r * 2.2, tip.y + S * 0.05 + row * r * 2.2, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(22,22,22,.45)';
    for (const g of modeState.falling) {
      ctx.beginPath();
      ctx.arc(g.x, g.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  onDown() {
    const rod = modeState.rod;
    const tip = rod.nodes[rod.nodes.length - 1];
    // Рядом с крюком — вешаем гирю, дальше — тащим букву за узел.
    if (Math.hypot(pointer.x - tip.x, pointer.y - tip.y) < S * 0.12) modeState.hung += 1;
    else grabRod(rod);
  },
  onMove() { dragRod(); },
  onUp() { releaseRod(); },
};

MODES.stroke = {
  label: 'росчерк',
  note: 'перо с инерцией: рукописная г идёт одним движением, скорость съедает толщину',
  tools: [
    { type: 'button', label: 'стереть', action: () => { modeState.strokes = []; modeState.active = null; } },
    { type: 'range', label: 'инерция', key: 'pull', min: 0.04, max: 0.6, step: 0.02, value: 0.18 },
    { type: 'range', label: 'вязкость', key: 'drag', min: 0.5, max: 0.95, step: 0.01, value: 0.78 },
    { type: 'range', label: 'нажим', key: 'nib', min: 0.01, max: 0.06, step: 0.002, value: 0.026 },
    { type: 'range', label: 'сухость', key: 'dry', min: 0, max: 1, step: 0.05, value: 0.7 },
    { type: 'toggle', label: 'трафарет', key: 'ghost', value: true },
  ],
  setup() {
    modeState.pen = { x: S * 0.3, y: S * 0.8, vx: 0, vy: 0 };
    modeState.strokes = [];
    modeState.active = null;
  },
  step() {
    const pen = modeState.pen;
    if (pointer.down) {
      pen.vx = (pen.vx + (pointer.x - pen.x) * num('pull')) * num('drag');
      pen.vy = (pen.vy + (pointer.y - pen.y) * num('pull')) * num('drag');
    } else {
      pen.vx *= num('drag');
      pen.vy *= num('drag');
    }
    pen.x += pen.vx;
    pen.y += pen.vy;
    if (!modeState.active) return;
    const speed = Math.hypot(pen.vx, pen.vy);
    const base = num('nib') * S;
    const w = base * (1 - num('dry') * clamp(speed / (S * 0.03), 0, 1));
    modeState.active.push({ x: pen.x, y: pen.y, w: Math.max(base * 0.12, w) });
  },
  draw() {
    if (on('ghost')) strokeAxis(cursiveAxis(), S * 0.02, FAINT);
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    for (const stroke of modeState.strokes) {
      for (let i = 1; i < stroke.length; i += 1) {
        ctx.lineWidth = (stroke[i - 1].w + stroke[i].w) * 0.5;
        ctx.beginPath();
        ctx.moveTo(stroke[i - 1].x, stroke[i - 1].y);
        ctx.lineTo(stroke[i].x, stroke[i].y);
        ctx.stroke();
      }
    }
    const pen = modeState.pen;
    ctx.strokeStyle = pointer.down ? INK : FAINT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pen.x, pen.y, S * 0.012, 0, Math.PI * 2);
    ctx.stroke();
  },
  onDown() {
    modeState.active = [];
    modeState.strokes.push(modeState.active);
  },
  onUp() { modeState.active = null; },
};

MODES.morph = {
  label: 'морфинг',
  note: 'одна кривая с двумя состояниями: печатная Г перетекает в рукописную г',
  tools: [
    { type: 'range', label: 'переход', key: 't', min: 0, max: 1, step: 0.01, value: 0 },
    { type: 'toggle', label: 'качели', key: 'auto', value: false },
    { type: 'range', label: 'перо', key: 'nib', min: 0.02, max: 0.12, step: 0.005, value: 0.075 },
    { type: 'toggle', label: 'обе формы', key: 'both', value: true },
  ],
  setup() {
    modeState.from = resample(capitalAxis(0.36).reverse(), 180);
    modeState.to = resample(cursiveAxis(), 180);
    modeState.phase = 0;
  },
  step() {
    modeState.phase += STEP;
  },
  draw() {
    const t = on('auto') ? 0.5 - 0.5 * Math.cos(modeState.phase * 0.9) : num('t');
    if (on('both')) {
      strokeAxis(modeState.from, S * 0.012, FAINT);
      strokeAxis(modeState.to, S * 0.012, FAINT);
    }
    const nodes = modeState.from.map(([x, y], i) => ({
      x: (x + (modeState.to[i][0] - x) * t) * S,
      y: (y + (modeState.to[i][1] - y) * t) * S,
    }));
    strokeNodes(nodes, num('nib') * S, INK);
  },
};

MODES.etch = {
  label: 'гравюра',
  note: 'бумага пуста, буква проступает под резцом: внутри контура штрих ложится чёрным, снаружи еле царапает',
  tools: [
    { type: 'button', label: 'стереть', action: () => { modeState.marks = []; } },
    { type: 'range', label: 'наклон', key: 'tilt', min: -80, max: 80, step: 1, value: -35 },
    { type: 'range', label: 'штрих', key: 'len', min: 0.01, max: 0.12, step: 0.005, value: 0.05 },
    { type: 'range', label: 'плотность', key: 'dense', min: 0.004, max: 0.05, step: 0.002, value: 0.014 },
    { type: 'range', label: 'резец', key: 'width', min: 0.01, max: 0.14, step: 0.005, value: 0.05 },
    { type: 'toggle', label: 'след снаружи', key: 'outside', value: true },
  ],
  setup() {
    modeState.marks = [];
    modeState.mask = buildMask(capitalAxis(0.36), 0.11);
  },
  step() {
    if (!pointer.down) return;
    const step = num('dense') * S;
    const dist = Math.hypot(pointer.x - pointer.px, pointer.y - pointer.py);
    const count = Math.max(1, Math.round(dist / step));
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 1 : i / (count - 1);
      const cx = pointer.px + (pointer.x - pointer.px) * t;
      const cy = pointer.py + (pointer.y - pointer.py) * t;
      const spread = num('width') * S;
      const x = cx + (Math.random() - 0.5) * spread;
      const y = cy + (Math.random() - 0.5) * spread;
      const inside = readMask(modeState.mask, x, y);
      if (!inside && !on('outside')) continue;
      modeState.marks.push({ x, y, inside, len: num('len') * S * (0.6 + Math.random() * 0.8) });
    }
    if (modeState.marks.length > 6000) modeState.marks.splice(0, modeState.marks.length - 6000);
  },
  draw() {
    const angle = (num('tilt') * Math.PI) / 180;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    ctx.lineWidth = Math.max(1, S * 0.0022);
    ctx.lineCap = 'round';
    for (const mark of modeState.marks) {
      // Снаружи резец идёт по пустой бумаге — след почти сухой.
      ctx.strokeStyle = mark.inside ? 'rgba(22,22,22,.82)' : 'rgba(22,22,22,.07)';
      ctx.beginPath();
      ctx.moveTo(mark.x - dx * mark.len * 0.5, mark.y - dy * mark.len * 0.5);
      ctx.lineTo(mark.x + dx * mark.len * 0.5, mark.y + dy * mark.len * 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, num('width') * S * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  },
};

// Маска буквы держится отдельным холстом: резцу нужно знать, где чернила.
function buildMask(axis, width) {
  const size = Math.max(1, Math.round(S));
  const mask = document.createElement('canvas');
  mask.width = size;
  mask.height = size;
  const mc = mask.getContext('2d');
  mc.lineWidth = width * size;
  mc.lineJoin = 'round';
  mc.lineCap = 'round';
  mc.strokeStyle = '#000';
  mc.beginPath();
  mc.moveTo(axis[0][0] * size, axis[0][1] * size);
  for (let i = 1; i < axis.length; i += 1) mc.lineTo(axis[i][0] * size, axis[i][1] * size);
  mc.stroke();
  return { size, data: mc.getImageData(0, 0, size, size).data };
}

function readMask(mask, x, y) {
  const ix = Math.round((x / S) * mask.size);
  const iy = Math.round((y / S) * mask.size);
  if (ix < 0 || iy < 0 || ix >= mask.size || iy >= mask.size) return false;
  return mask.data[(iy * mask.size + ix) * 4 + 3] > 40;
}

MODES.tree = {
  label: 'рекурсия',
  note: 'на концах Г вырастают Г поменьше: буква, собранная из самой себя',
  tools: [
    { type: 'range', label: 'глубина', key: 'depth', min: 1, max: 7, step: 1, value: 4 },
    { type: 'range', label: 'масштаб', key: 'scale', min: 0.25, max: 0.8, step: 0.01, value: 0.58 },
    { type: 'range', label: 'разворот', key: 'spread', min: -180, max: 180, step: 1, value: 42 },
    { type: 'range', label: 'плечо', key: 'arm', min: 0.3, max: 1, step: 0.02, value: 0.56 },
    { type: 'toggle', label: 'ветвить угол', key: 'corner', value: false },
  ],
  setup() {},
  draw() {
    const depth = num('depth');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    growG(S * 0.34, S * 0.22, S * 0.5, 0, depth);
  },
};

// Г рисуется от угла: плечо вправо по углу, стойка вниз поперёк.
function growG(x, y, size, angle, depth) {
  const total = num('depth');
  const arm = size * num('arm');
  const ax = x + Math.cos(angle) * arm;
  const ay = y + Math.sin(angle) * arm;
  const dx = x + Math.cos(angle + Math.PI / 2) * size;
  const dy = y + Math.sin(angle + Math.PI / 2) * size;
  const shade = 0.25 + 0.75 * (depth / total);
  ctx.strokeStyle = `rgba(22,22,22,${shade.toFixed(3)})`;
  ctx.lineWidth = Math.max(1, size * 0.16);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(x, y);
  ctx.lineTo(dx, dy);
  ctx.stroke();
  if (depth <= 1) return;
  const spread = (num('spread') * Math.PI) / 180;
  const next = size * num('scale');
  growG(ax, ay, next, angle + spread, depth - 1);
  growG(dx, dy, next, angle - spread, depth - 1);
  if (on('corner')) growG(x, y, next * 0.6, angle + Math.PI, depth - 1);
}

MODES.pipe = {
  label: 'колено',
  note: 'поток входит в перекладину, доходит до угла и падает по стойке: Г как единственный поворот',
  tools: [
    { type: 'button', label: 'слить', action: () => { modeState.drops = []; } },
    { type: 'range', label: 'напор', key: 'flow', min: 0, max: 6, step: 0.2, value: 2.4 },
    { type: 'range', label: 'тяга', key: 'push', min: 0, max: 4, step: 0.1, value: 1.4 },
    { type: 'range', label: 'труба', key: 'bore', min: 0.03, max: 0.14, step: 0.005, value: 0.07 },
    { type: 'range', label: 'вязкость', key: 'visc', min: 0.8, max: 1, step: 0.005, value: 0.985 },
    { type: 'range', label: 'тяжесть', key: 'grav', min: 0, max: 3, step: 0.1, value: 1.4 },
    { type: 'toggle', label: 'палец в струе', key: 'finger', value: true },
  ],
  setup() {
    modeState.axis = resample(capitalAxis(0.4), 140).map(([x, y]) => ({ x: x * S, y: y * S }));
    modeState.drops = [];
    modeState.spawn = 0;
  },
  step() {
    const axis = modeState.axis;
    const r = num('bore') * S * 0.5;
    modeState.spawn += num('flow');
    while (modeState.spawn >= 1) {
      modeState.spawn -= 1;
      modeState.drops.push({
        x: axis[0].x + (Math.random() - 0.5) * r,
        y: axis[0].y + (Math.random() - 0.5) * r,
        vx: -S * 0.004,
        vy: 0,
      });
    }
    const g = num('grav') * S * STEP * STEP;
    const visc = num('visc');
    for (const d of modeState.drops) {
      d.vy += g;
      if (on('finger') && pointer.down) {
        const fx = d.x - pointer.x;
        const fy = d.y - pointer.y;
        const dist = Math.hypot(fx, fy) || 1;
        if (dist < S * 0.1) {
          d.vx += (fx / dist) * S * 0.0012;
          d.vy += (fy / dist) * S * 0.0012;
        }
      }
      d.vx *= visc;
      d.vy *= visc;
      d.x += d.vx;
      d.y += d.vy;
      // Стенки трубы: капля живёт не дальше радиуса от осевой.
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < axis.length; i += 1) {
        const dist = (axis[i].x - d.x) ** 2 + (axis[i].y - d.y) ** 2;
        if (dist < bestDist) { bestDist = dist; best = i; }
      }
      // Труба ведёт поток сама: тяга толкает каплю вдоль осевой.
      const lead = Math.min(best, axis.length - 2);
      const tx = axis[lead + 1].x - axis[lead].x;
      const ty = axis[lead + 1].y - axis[lead].y;
      const tl = Math.hypot(tx, ty) || 1;
      d.vx += (tx / tl) * num('push') * S * 0.0004;
      d.vy += (ty / tl) * num('push') * S * 0.0004;
      const near = axis[best];
      const dist = Math.sqrt(bestDist) || 1e-6;
      if (dist > r && best < axis.length - 1) {
        const nx = (d.x - near.x) / dist;
        const ny = (d.y - near.y) / dist;
        d.x = near.x + nx * r;
        d.y = near.y + ny * r;
        const push = d.vx * nx + d.vy * ny;
        d.vx -= nx * push * 1.4;
        d.vy -= ny * push * 1.4;
      }
    }
    modeState.drops = modeState.drops.filter((d) => d.y < S * 1.1);
    if (modeState.drops.length > 1200) modeState.drops.splice(0, modeState.drops.length - 1200);
  },
  draw() {
    strokeNodes(modeState.axis, num('bore') * S, 'rgba(22,22,22,.08)');
    ctx.fillStyle = INK;
    const r = Math.max(1, S * 0.006);
    for (const d of modeState.drops) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
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
    // Подобранное значение переживает пересборку сцены.
    const key = slot(tool.key);
    const value = key in toolValues ? toolValues[key] : tool.value;
    toolValues[key] = value;
    if (tool.type === 'toggle') {
      const button = document.createElement('button');
      button.type = 'button';
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
    const out = document.createElement('span');
    input.type = 'range';
    input.min = tool.min;
    input.max = tool.max;
    input.step = tool.step;
    input.value = value;
    out.textContent = value;
    input.addEventListener('input', () => {
      toolValues[key] = Number(input.value);
      out.textContent = input.value;
      if (tool.rebuild) setMode(current);
    });
    label.append(tool.label, input, out);
    toolsBar.append(label);
  }
}

function setMode(name) {
  current = name;
  const mode = MODES[name];
  // Панель читает значения уже нового режима, поэтому current меняется первым.
  modeState = {};
  renderTools(mode);
  if (mode.setup) mode.setup();
  note.textContent = mode.note;
  for (const button of modesBar.children) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === name));
  }
}

for (const [name, mode] of Object.entries(MODES)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.mode = name;
  button.textContent = mode.label;
  button.addEventListener('click', () => setMode(name));
  modesBar.append(button);
}

/* ---------- сцена ---------- */

function resize() {
  const bounds = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const next = Math.max(1, bounds.width);
  const changed = Math.abs(next - S) > 1;
  S = next;
  canvas.width = Math.round(S * dpr);
  canvas.height = Math.round(S * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (changed && current) setMode(current);
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
  canvas.setPointerCapture(event.pointerId);
  MODES[current].onDown?.();
});

canvas.addEventListener('pointermove', (event) => {
  track(event);
  MODES[current].onMove?.();
});

window.addEventListener('pointerup', () => {
  pointer.down = false;
  MODES[current].onUp?.();
});

let last = performance.now();
let debt = 0;
function frame(now) {
  debt = Math.min(0.1, debt + (now - last) / 1000);
  last = now;
  const mode = MODES[current];
  while (debt >= STEP) {
    if (mode.step) mode.step();
    // Штрихи и капли читают путь курсора за шаг, поэтому хвост подтягиваем следом.
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    debt -= STEP;
  }
  ctx.clearRect(0, 0, S, S);
  mode.draw();
  requestAnimationFrame(frame);
}

new ResizeObserver(resize).observe(canvas);
resize();
setMode('beam');
requestAnimationFrame(frame);
