/* Полигон Ж: шесть лучей из одного узла. Все три механики про одно и то же —
   буква держится, пока цела вертикальная ось, а лучи ей позволено гнуть. */

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

/* Габарит буквы в долях кадра: стойка вверх-вниз и четыре диагонали от узла. */
const STEM = 0.235;
const ARM_X = 0.205;
const ARM_Y = 0.245;
const ARM = Math.hypot(ARM_X, ARM_Y);
const UP = -Math.PI / 2;
const DOWN = Math.PI / 2;
const UR = Math.atan2(-ARM_Y, ARM_X);
const UL = Math.atan2(-ARM_Y, -ARM_X);
const DR = Math.atan2(ARM_Y, ARM_X);
const DL = Math.atan2(ARM_Y, -ARM_X);

const SKELETON = [
  { a: UP, len: STEM, axial: true },
  { a: DOWN, len: STEM, axial: true },
  { a: UR, len: ARM, axial: false },
  { a: UL, len: ARM, axial: false },
  { a: DR, len: ARM, axial: false },
  { a: DL, len: ARM, axial: false },
];

let S = 600;
let dpr = 1;
let current = '';
let modeState = {};
const toolValues = {};
const pointer = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, down: false };

function clamp(value, min, max) { return value < min ? min : value > max ? max : value; }
function slot(key) { return `${current}:${key}`; }
function num(key) { return Number(toolValues[slot(key)]); }
function on(key) { return Boolean(toolValues[slot(key)]); }
function wrap(angle) { return Math.atan2(Math.sin(angle), Math.cos(angle)); }

/* ---------- общая графика ---------- */

function line(x1, y1, x2, y2, color = INK, width = 0.012) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width * S;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x1 * S, y1 * S);
  ctx.lineTo(x2 * S, y2 * S);
  ctx.stroke();
}

function dot(x, y, color, radius = 0.008) {
  ctx.beginPath();
  ctx.arc(x * S, y * S, radius * S, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawGhost(cx = 0.5, cy = 0.5, rot = 0) {
  for (const ray of SKELETON) {
    const a = ray.a + rot;
    line(cx, cy, cx + Math.cos(a) * ray.len, cy + Math.sin(a) * ray.len, FAINT, 0.01);
  }
}

function drawStatus(text, hot) {
  if (!text) return;
  ctx.fillStyle = hot ? RED : MUTED;
  ctx.font = `${Math.round(S * 0.022)}px 'DM Mono', ui-monospace, monospace`;
  ctx.textAlign = 'right';
  ctx.fillText(text, S * 0.96, S * 0.06);
  ctx.textAlign = 'left';
}

const MODES = {};

/* ---------- 1. жук: буква идёт на своих лучах ---------- */

/* Рысь: две диагонали переставляются вместе, две держат вес.
   У шести лап тот же принцип превращается в насекомий треножник. */
const LEGS_4 = [
  { a: UR, len: ARM, group: 0 },
  { a: UL, len: ARM, group: 1 },
  { a: DR, len: ARM, group: 1 },
  { a: DL, len: ARM, group: 0 },
];
const LEGS_6 = [
  { a: UR, len: ARM, group: 0 },
  { a: UL, len: ARM, group: 1 },
  { a: 0, len: ARM * 0.76, group: 1 },
  { a: Math.PI, len: ARM * 0.76, group: 0 },
  { a: DR, len: ARM, group: 0 },
  { a: DL, len: ARM, group: 1 },
];

function toWorld(vx, vy) {
  const b = modeState.body;
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  return { x: b.x + vx * c - vy * s, y: b.y + vx * s + vy * c };
}

function toBody(px, py) {
  const b = modeState.body;
  const c = Math.cos(-b.rot);
  const s = Math.sin(-b.rot);
  const dx = px - b.x;
  const dy = py - b.y;
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

function restPoint(leg) {
  return toWorld(Math.cos(leg.a) * leg.len, Math.sin(leg.a) * leg.len);
}

function stretch(leg) {
  const rest = restPoint(leg);
  return Math.hypot(leg.foot.x - rest.x, leg.foot.y - rest.y);
}

function beetleReset() {
  modeState.body = { x: 0.5, y: 0.5, rot: 0, vx: 0, vy: 0 };
  modeState.six = on('six');
  modeState.legs = (modeState.six ? LEGS_6 : LEGS_4).map((leg) => ({
    ...leg, foot: { x: 0, y: 0 }, swing: -1, from: null, to: null,
  }));
  modeState.legs.forEach((leg) => { leg.foot = restPoint(leg); });
  modeState.marks = [];
}

function liftGroup(group) {
  const lead = num('lead');
  const b = modeState.body;
  modeState.legs.forEach((leg) => {
    if (leg.group !== group) return;
    const rest = restPoint(leg);
    leg.swing = 0;
    leg.from = { ...leg.foot };
    leg.to = { x: rest.x + b.vx * lead, y: rest.y + b.vy * lead };
  });
}

function stepLegs() {
  const stride = num('stride');
  const swingTime = num('swing');
  const legs = modeState.legs;

  if (!legs.some((leg) => leg.swing >= 0)) {
    for (const group of [0, 1]) {
      if (legs.some((leg) => leg.group === group && stretch(leg) > stride)) {
        liftGroup(group);
        break;
      }
    }
  }

  legs.forEach((leg) => {
    if (leg.swing < 0) return;
    leg.swing += STEP / swingTime;
    const t = Math.min(1, leg.swing);
    const ease = t * t * (3 - 2 * t);
    leg.foot = {
      x: leg.from.x + (leg.to.x - leg.from.x) * ease,
      y: leg.from.y + (leg.to.y - leg.from.y) * ease,
    };
    if (t < 1) return;
    leg.swing = -1;
    modeState.marks.push({ x: leg.foot.x, y: leg.foot.y });
    if (modeState.marks.length > 80) modeState.marks.shift();
  });
}

MODES.beetle = {
  label: 'жук',
  note: 'Буква идёт за курсором: стойка — тело, диагонали — лапы. Лапа держится за своё место на бумаге, пока хватает вылета, потом переставляется вперёд. Краска — на лапах, которые сейчас в переносе.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'speed', label: 'скорость', min: 0.05, max: 0.8, step: 0.01, value: 0.3 },
    { type: 'range', key: 'stride', label: 'шаг', min: 0.02, max: 0.2, step: 0.005, value: 0.085 },
    { type: 'range', key: 'swing', label: 'перенос', min: 0.05, max: 0.5, step: 0.01, value: 0.16 },
    { type: 'range', key: 'lead', label: 'упреждение', min: 0, max: 0.5, step: 0.01, value: 0.14 },
    { type: 'range', key: 'knee', label: 'излом', min: 0, max: 0.1, step: 0.005, value: 0 },
    { type: 'toggle', key: 'six', label: 'шесть лап', value: false },
    { type: 'toggle', key: 'turn', label: 'поворот', value: true },
    { type: 'toggle', key: 'flee', label: 'от курсора', value: false },
    { type: 'toggle', key: 'marks', label: 'след', value: false },
    { type: 'toggle', key: 'paint', label: 'краска', value: true },
    { type: 'toggle', key: 'ghost', label: 'форма', value: false },
    { type: 'button', label: 'вернуть', action: () => beetleReset() },
  ],
  setup() { beetleReset(); },
  step() {
    if (modeState.six !== on('six')) beetleReset();
    const b = modeState.body;
    const speed = num('speed');
    let dx = pointer.x - b.x;
    let dy = pointer.y - b.y;
    if (on('flee')) { dx = -dx; dy = -dy; }
    const dist = Math.hypot(dx, dy) || 1;
    /* подходя к цели, жук замедляется — иначе топчется на месте рывками */
    const want = on('flee') ? speed : Math.min(speed, dist * 2.4);
    b.vx += ((dx / dist) * want - b.vx) * 0.12;
    b.vy += ((dy / dist) * want - b.vy) * 0.12;
    b.x = clamp(b.x + b.vx * STEP, 0.14, 0.86);
    b.y = clamp(b.y + b.vy * STEP, 0.14, 0.86);

    const moving = Math.hypot(b.vx, b.vy) > 0.03;
    const goal = on('turn') && moving ? wrap(Math.atan2(b.vy, b.vx) - UP) : 0;
    const turn = wrap(goal - b.rot);
    b.rot = wrap(b.rot + clamp(turn, -2.4 * STEP, 2.4 * STEP));

    stepLegs();
  },
  draw() {
    const b = modeState.body;
    if (on('ghost')) drawGhost(b.x, b.y, b.rot);
    if (on('marks')) modeState.marks.forEach((mark) => dot(mark.x, mark.y, FAINT, 0.005));

    const top = toWorld(Math.cos(UP) * STEM, Math.sin(UP) * STEM);
    const bottom = toWorld(Math.cos(DOWN) * STEM, Math.sin(DOWN) * STEM);
    line(top.x, top.y, bottom.x, bottom.y, INK, 0.016);

    const knee = num('knee');
    modeState.legs.forEach((leg) => {
      const swinging = leg.swing >= 0;
      const color = swinging && on('paint') ? RED : INK;
      if (knee > 0.001) {
        const foot = toBody(leg.foot.x, leg.foot.y);
        const length = Math.hypot(foot.x, foot.y) || 1;
        let px = -foot.y / length;
        let py = foot.x / length;
        /* колено уходит наружу от оси тела, как у насекомого */
        if (px * Math.sign(Math.cos(leg.a) || 1) < 0) { px = -px; py = -py; }
        const bend = toWorld(foot.x / 2 + px * knee, foot.y / 2 + py * knee);
        line(b.x, b.y, bend.x, bend.y, color, 0.013);
        line(bend.x, bend.y, leg.foot.x, leg.foot.y, color, 0.013);
      } else {
        line(b.x, b.y, leg.foot.x, leg.foot.y, color, 0.013);
      }
      if (!swinging) dot(leg.foot.x, leg.foot.y, color, 0.007);
    });

    const carried = modeState.legs.filter((leg) => leg.swing < 0).length;
    drawStatus(`опор ${carried} / ${modeState.legs.length}`, carried < 2);
  },
};

/* ---------- 2. изморозь: кристалл растёт по лучам ---------- */

const MAX_TIPS = 220;
const MAX_GEN = 3;

function seedTip(a, axial) {
  modeState.tips.push({
    x: 0.5, y: 0.5, a, gen: 0, axial, grown: 0, dead: false,
    path: [{ x: 0.5, y: 0.5 }],
  });
}

function frostReset() {
  modeState.six = on('six');
  modeState.tips = [];
  modeState.wet = [];
  if (modeState.six) seedTip(UP, true);
  else SKELETON.forEach((ray) => { if (ray.axial || Math.cos(ray.a) > 0) seedTip(ray.a, ray.axial); });
}

/* Влага должна быть симметричной, иначе кристалл перестаёт быть кристаллом:
   курсор размножается теми же отражениями, что и сам узор. */
function wetPoints() {
  const points = [];
  const dx = pointer.x - 0.5;
  const dy = pointer.y - 0.5;
  const copies = modeState.six ? 6 : 1;
  for (let k = 0; k < copies; k += 1) {
    const rot = (k * Math.PI) / 3;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    points.push({ x: 0.5 + dx * c - dy * s, y: 0.5 + dx * s + dy * c });
    points.push({ x: 0.5 - (dx * c - dy * s), y: 0.5 + dx * s + dy * c });
  }
  return points;
}

function humidity(x, y) {
  const power = num('wet');
  if (power <= 0) return 1;
  const reach = num('reach');
  let best = 0;
  for (const point of modeState.wet) {
    const d = Math.hypot(x - point.x, y - point.y) / reach;
    const value = Math.exp(-d * d);
    if (value > best) best = value;
  }
  return 1 + best * power;
}

function drawCrystalPath(path, rot, mirror, color, width) {
  if (path.length < 2) return;
  ctx.save();
  ctx.translate(0.5 * S, 0.5 * S);
  ctx.rotate(rot);
  if (mirror) ctx.scale(-1, 1);
  ctx.beginPath();
  path.forEach((point, index) => {
    const x = (point.x - 0.5) * S;
    const y = (point.y - 0.5) * S;
    if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = width * S;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

function eachCopy(tip, fn) {
  if (modeState.six) {
    for (let k = 0; k < 6; k += 1) {
      fn((k * Math.PI) / 3, false);
      fn((k * Math.PI) / 3, true);
    }
    return;
  }
  fn(0, false);
  if (!tip.axial) fn(0, true);
}

MODES.frost = {
  label: 'изморозь',
  note: 'Кристалл идёт из узла по шести лучам, всё отражается — что ни сделай, узор останется симметричным. Курсор — влага: где держишь, там ветка растёт быстрее. Краска — на концах, переросших габарит буквы.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'grow', label: 'рост', min: 0.02, max: 0.6, step: 0.01, value: 0.16 },
    { type: 'range', key: 'branch', label: 'ветвление', min: 0, max: 1.5, step: 0.05, value: 0.5 },
    { type: 'range', key: 'split', label: 'угол ветки', min: 0.3, max: 1.4, step: 0.05, value: 1.05 },
    { type: 'range', key: 'wobble', label: 'разброс', min: 0, max: 1.5, step: 0.05, value: 0.25 },
    { type: 'range', key: 'wet', label: 'влага', min: 0, max: 4, step: 0.1, value: 1.6 },
    { type: 'range', key: 'reach', label: 'радиус влаги', min: 0.05, max: 0.6, step: 0.01, value: 0.2 },
    { type: 'toggle', key: 'six', label: 'снежинка', value: false },
    { type: 'toggle', key: 'paint', label: 'краска', value: true },
    { type: 'toggle', key: 'ghost', label: 'форма', value: true },
    { type: 'button', label: 'заново', action: () => frostReset() },
  ],
  setup() { frostReset(); },
  step() {
    if (modeState.six !== on('six')) frostReset();
    modeState.wet = wetPoints();
    const grow = num('grow');
    const branch = num('branch');
    const wobble = num('wobble');
    const split = num('split');
    const born = [];

    modeState.tips.forEach((tip) => {
      if (tip.dead) return;
      const vigor = Math.pow(0.62, tip.gen);
      const advance = grow * vigor * humidity(tip.x, tip.y) * STEP;
      /* осевой конец не виляет: он и есть ось отражения */
      if (!tip.axial) tip.a += (Math.random() - 0.5) * wobble * STEP;
      tip.x += Math.cos(tip.a) * advance;
      tip.y += Math.sin(tip.a) * advance;
      tip.grown += advance;

      const last = tip.path[tip.path.length - 1];
      if (Math.hypot(tip.x - last.x, tip.y - last.y) > 0.006) tip.path.push({ x: tip.x, y: tip.y });

      if (tip.x < 0.03 || tip.x > 0.97 || tip.y < 0.03 || tip.y > 0.97) {
        tip.path.push({ x: tip.x, y: tip.y });
        tip.dead = true;
        return;
      }

      if (tip.gen >= MAX_GEN) return;
      if (modeState.tips.length + born.length >= MAX_TIPS) return;
      if (Math.random() > branch * advance * 14) return;

      const child = (angle) => born.push({
        x: tip.x, y: tip.y, a: angle, gen: tip.gen + 1, axial: false, grown: 0, dead: false,
        path: [{ x: tip.x, y: tip.y }],
      });
      if (tip.axial) {
        /* с оси ветка уходит только вправо: левую нарисует отражение */
        const right = Math.cos(tip.a + split) > 0 ? tip.a + split : tip.a - split;
        child(right);
      } else {
        child(tip.a + split);
        child(tip.a - split);
      }
    });

    modeState.tips.push(...born);
  },
  draw() {
    if (on('ghost')) drawGhost();
    const paint = on('paint');
    modeState.tips.forEach((tip) => {
      const width = 0.012 * Math.pow(0.66, tip.gen);
      eachCopy(tip, (rot, mirror) => drawCrystalPath(tip.path, rot, mirror, INK, width));
    });
    if (paint) {
      modeState.tips.forEach((tip) => {
        if (Math.hypot(tip.x - 0.5, tip.y - 0.5) < ARM) return;
        eachCopy(tip, (rot, mirror) => {
          ctx.save();
          ctx.translate(0.5 * S, 0.5 * S);
          ctx.rotate(rot);
          if (mirror) ctx.scale(-1, 1);
          ctx.beginPath();
          ctx.arc((tip.x - 0.5) * S, (tip.y - 0.5) * S, 0.006 * S, 0, Math.PI * 2);
          ctx.fillStyle = RED;
          ctx.fill();
          ctx.restore();
        });
      });
    }

    const main = modeState.tips.filter((tip) => tip.gen === 0);
    const ratio = main.length
      ? main.reduce((sum, tip) => sum + tip.grown / (tip.axial ? STEM : ARM), 0) / main.length
      : 0;
    const label = modeState.six ? `снежинка ${ratio.toFixed(2)}` : ratio < 0.9 ? `растёт ${ratio.toFixed(2)}` : ratio > 1.35 ? `переросла ${ratio.toFixed(2)}` : 'Ж';
    drawStatus(label, !modeState.six && ratio >= 0.9 && ratio <= 1.35);
  },
};

/* ---------- 3. шарнир: лучи на пружинах, ось держит букву ---------- */

function hingeReset() {
  modeState.body = { x: 0.5, y: 0.5, vx: 0, vy: 0, ax: 0, ay: 0 };
  modeState.rays = [UR, UL, DR, DL].map((a) => ({ a, a0: a, w: 0, hit: 0 }));
}

function foldTarget(a0, fold) {
  const vertical = Math.sin(a0) < 0 ? UP : DOWN;
  return a0 + (vertical - a0) * fold;
}

MODES.hinge = {
  label: 'шарнир',
  note: 'Лучи сидят на шарнире в узле и возвращаются к своей форме пружиной. Тяни букву — лучи отстают и качаются; «сжатие» складывает их к стойке, «симметрия» связывает левые с правыми. Краска — на луче, дошедшем до предела перегиба.',
  cursor: 'grab',
  tools: [
    { type: 'range', key: 'stiff', label: 'жёсткость', min: 0.1, max: 4, step: 0.05, value: 1.2 },
    { type: 'range', key: 'damp', label: 'вязкость', min: 0.02, max: 1, step: 0.02, value: 0.24 },
    { type: 'range', key: 'lag', label: 'инерция', min: 0, max: 6, step: 0.1, value: 1.6 },
    { type: 'range', key: 'fold', label: 'сжатие', min: 0, max: 1, step: 0.01, value: 0 },
    { type: 'range', key: 'pull', label: 'тяга', min: 0.2, max: 4, step: 0.05, value: 1.2 },
    { type: 'range', key: 'limit', label: 'предел', min: 0.1, max: 1.5, step: 0.05, value: 0.9 },
    { type: 'toggle', key: 'sym', label: 'симметрия', value: true },
    { type: 'toggle', key: 'ghost', label: 'форма', value: true },
    { type: 'button', label: 'вернуть', action: () => hingeReset() },
  ],
  setup() { hingeReset(); },
  step() {
    const b = modeState.body;
    const pull = num('pull') * 60;
    const tx = pointer.down ? pointer.x : 0.5;
    const ty = pointer.down ? pointer.y : 0.5;
    const vx = b.vx;
    const vy = b.vy;
    b.vx += ((tx - b.x) * pull - b.vx * 7) * STEP;
    b.vy += ((ty - b.y) * pull - b.vy * 7) * STEP;
    b.ax = (b.vx - vx) / STEP;
    b.ay = (b.vy - vy) / STEP;
    b.x = clamp(b.x + b.vx * STEP, 0.2, 0.8);
    b.y = clamp(b.y + b.vy * STEP, 0.2, 0.8);

    const stiff = num('stiff') * 60;
    const damp = num('damp') * 12;
    const lag = num('lag');
    const fold = num('fold');
    const limit = num('limit');

    modeState.rays.forEach((ray) => {
      const target = foldTarget(ray.a0, fold);
      /* ускорение узла толкает луч в бок — он отстаёт, как рука на повороте */
      const torque = -(b.ax * -Math.sin(ray.a) + b.ay * Math.cos(ray.a)) * lag;
      const off = wrap(ray.a - target);
      ray.w += (-off * stiff - ray.w * damp + torque) * STEP;
      ray.a = wrap(ray.a + ray.w * STEP);
      const after = wrap(ray.a - target);
      if (Math.abs(after) > limit) {
        ray.a = wrap(target + Math.sign(after) * limit);
        ray.w *= -0.3;
        ray.hit = 1;
      }
      ray.hit *= 0.92;
    });

    if (on('sym')) {
      /* правые лучи ведут, левые повторяют отражением через стойку */
      modeState.rays[1].a = wrap(Math.PI - modeState.rays[0].a);
      modeState.rays[3].a = wrap(Math.PI - modeState.rays[2].a);
      modeState.rays[1].hit = modeState.rays[0].hit;
      modeState.rays[3].hit = modeState.rays[2].hit;
    }
  },
  draw() {
    if (on('ghost')) drawGhost();
    const b = modeState.body;
    line(b.x, b.y + Math.sin(UP) * STEM, b.x, b.y + Math.sin(DOWN) * STEM, INK, 0.016);
    modeState.rays.forEach((ray) => {
      const color = ray.hit > 0.05 ? RED : INK;
      line(b.x, b.y, b.x + Math.cos(ray.a) * ARM, b.y + Math.sin(ray.a) * ARM, color, 0.013);
    });
    const bent = modeState.rays.reduce((sum, ray) => sum + Math.abs(wrap(ray.a - ray.a0)), 0) / 4;
    drawStatus(`перегиб ${bent.toFixed(2)}`, bent > 0.5);
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
  pointer.x = (event.clientX - bounds.left) / S;
  pointer.y = (event.clientY - bounds.top) / S;
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

let last = performance.now();
let debt = 0;
function frame(now) {
  debt = Math.min(0.1, debt + (now - last) / 1000);
  last = now;
  while (debt >= STEP) {
    MODES[current].step?.();
    debt -= STEP;
  }
  ctx.clearRect(0, 0, S, S);
  MODES[current].draw();
  requestAnimationFrame(frame);
}

resize();
setMode('beetle');
new ResizeObserver(resize).observe(canvas);
requestAnimationFrame(frame);
