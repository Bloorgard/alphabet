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

// Рукописная г — два наплыва: верхний уходит влево, нижний возвращает вправо.
// Русло получается излучиной, а не крючком.
function cursiveAxis() {
  return [
    ...bezier([0.72, 0.26], [0.58, 0.17], [0.34, 0.20], [0.28, 0.34], 32),
    ...bezier([0.28, 0.34], [0.24, 0.46], [0.44, 0.50], [0.55, 0.56], 30).slice(1),
    ...bezier([0.55, 0.56], [0.66, 0.63], [0.52, 0.75], [0.34, 0.72], 30).slice(1),
    ...bezier([0.34, 0.72], [0.30, 0.80], [0.52, 0.84], [0.74, 0.78], 30).slice(1),
  ];
}

// Угол в углу в углу: каждая следующая Г стоит на том же полу внутри предыдущей.
function nestedAxes(count, gap) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const left = 0.2 + i * gap;
    const top = 0.12 + i * gap;
    const right = 0.86 - i * gap;
    const bottom = 0.88 - i * gap;
    if (right - left < gap || bottom - top < gap) break;
    out.push([[left, bottom], [left, top], [right, top]]);
  }
  return out;
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
  // Коэффициент возврата держим ниже единицы: выше — перелёт и разнос.
  pullToTarget(rod, target, clamp(opts.stiffness * 0.06, 0, 0.5));
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
  note: 'балка с вылетом: груз тянет перекладину вниз, металл течёт у угла. «вложенные углы» — та же физика для Г внутри Г',
  tools: [
    RESTART,
    { type: 'toggle', label: 'вложенные углы', key: 'nested', value: false, rebuild: true },
    { type: 'range', label: 'вылет', key: 'reach', min: 0.16, max: 0.5, step: 0.01, value: 0.36, rebuild: true },
    { type: 'range', label: 'сколько Г', key: 'turns', min: 2, max: 8, step: 1, value: 5, rebuild: true },
    { type: 'range', label: 'жёсткость', key: 'stiff', min: 0.2, max: 2, step: 0.05, value: 1 },
    { type: 'range', label: 'груз', key: 'load', min: 0, max: 14, step: 0.2, value: 4 },
    { type: 'range', label: 'предел', key: 'yield', min: 0, max: 0.3, step: 0.005, value: 0.1 },
    { type: 'range', label: 'вязкость', key: 'damp', min: 0.9, max: 0.999, step: 0.001, value: 0.99 },
  ],
  setup() {
    // Стойка заделана в пол, свободен только вылет: у каждой Г своя заделка.
    modeState.axes = on('nested')
      ? nestedAxes(num('turns'), 0.06)
      : [capitalAxis(num('reach')).reverse()];
    const spans = modeState.axes.map((axis) => axis.reduce((sum, p, i) => (
      i === 0 ? 0 : sum + Math.hypot(p[0] - axis[i - 1][0], p[1] - axis[i - 1][1])
    ), 0));
    const longest = Math.max(...spans);
    // Узлы кладём по длине: на короткой Г их столько же — и сегменты вырождаются.
    modeState.rods = modeState.axes.map((axis, i) => makeRod(axis, Math.max(14, Math.round(40 * (spans[i] / longest))), 4));
    modeState.rods.forEach((rod, i) => { rod.share = spans[i] / longest; });
  },
  step() {
    for (const rod of modeState.rods) {
      rod.nodes[rod.nodes.length - 1].load = num('load') * rod.share;
      stepRod(rod, {
        // Короткая Г должна гнуться не сильнее длинной, отсюда поправка на размер.
        gravity: 1, damp: num('damp'), stiffness: num('stiff') / (rod.share * rod.share),
        yield: num('yield'), flow: 0.03,
      });
    }
  },
  draw() {
    const thick = on('nested') ? S * 0.028 : S * 0.085;
    const weight = num('load');
    modeState.axes.forEach((axis, i) => {
      strokeAxis(axis, thick, FAINT);
      const rod = modeState.rods[i];
      drawRod(rod, thick);
      if (weight <= 0) return;
      const tip = rod.nodes[rod.nodes.length - 1];
      const r = (S * 0.012 * Math.sqrt(weight * rod.share) + S * 0.012) * (on('nested') ? 0.5 : 1);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x, tip.y + S * 0.04);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y + S * 0.04 + r, r, 0, Math.PI * 2);
      ctx.fill();
    });
  },
  onDown() { for (const rod of modeState.rods) grabRod(rod); },
  onMove() { dragRod(); },
  onUp() { releaseRod(); },
};

MODES.river = {
  label: 'река',
  note: 'русло буквы: по излучинам рукописной г идёт поток, у печатной Г остаётся один поворот',
  tools: [
    { type: 'button', label: 'слить', action: () => { modeState.drops = []; } },
    { type: 'toggle', label: 'печатная Г', key: 'block', value: false, rebuild: true },
    { type: 'range', label: 'напор', key: 'flow', min: 0, max: 6, step: 0.2, value: 2.4 },
    { type: 'range', label: 'тяга', key: 'push', min: 0, max: 4, step: 0.1, value: 1.4 },
    { type: 'range', label: 'труба', key: 'bore', min: 0.03, max: 0.14, step: 0.005, value: 0.07 },
    { type: 'range', label: 'вязкость', key: 'visc', min: 0.8, max: 1, step: 0.005, value: 0.985 },
    { type: 'range', label: 'тяжесть', key: 'grav', min: 0, max: 3, step: 0.1, value: 1.4 },
    { type: 'toggle', label: 'палец в струе', key: 'finger', value: true },
  ],
  setup() {
    const axis = on('block') ? capitalAxis(0.4) : cursiveAxis();
    modeState.axis = resample(axis, 160).map(([x, y]) => ({ x: x * S, y: y * S }));
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
        if (tool.rebuild) setMode(current);
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
