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
const BEETLE_STEM = 0.12;
const BEETLE_HIP = 0.0428;
const BEETLE_ARM_X = 0.1523;
const BEETLE_ARM_Y = 0.1094;
const BEETLE_ARM = Math.hypot(BEETLE_ARM_X, BEETLE_ARM_Y);
const BEETLE_WIDTH = 0.05;
const BEETLE_MARK_LIFE = 12;
const BEETLE_MARK_FADE = 4;
const BEETLE_SETTLE_DELAY = 3;
const BEETLE_SETTLE_EPSILON = 0.003;
const BEETLE_UR = Math.atan2(-BEETLE_ARM_Y, BEETLE_ARM_X);
const BEETLE_UL = Math.atan2(-BEETLE_ARM_Y, -BEETLE_ARM_X);
const BEETLE_DR = Math.atan2(BEETLE_ARM_Y, BEETLE_ARM_X);
const BEETLE_DL = Math.atan2(BEETLE_ARM_Y, -BEETLE_ARM_X);
const LEGS_4 = [
  { a: BEETLE_UR, len: BEETLE_ARM, group: 0 },
  { a: BEETLE_UL, len: BEETLE_ARM, group: 1 },
  { a: BEETLE_DR, len: BEETLE_ARM, group: 1 },
  { a: BEETLE_DL, len: BEETLE_ARM, group: 0 },
];
const LEGS_6 = [
  { a: BEETLE_UR, len: BEETLE_ARM, group: 0 },
  { a: BEETLE_UL, len: BEETLE_ARM, group: 1 },
  { a: 0, len: BEETLE_ARM_X, group: 1 },
  { a: Math.PI, len: BEETLE_ARM_X, group: 0 },
  { a: BEETLE_DR, len: BEETLE_ARM, group: 0 },
  { a: BEETLE_DL, len: BEETLE_ARM, group: 1 },
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

function hipPoint(leg) {
  return toWorld(Math.sign(Math.cos(leg.a) || 1) * BEETLE_HIP, 0);
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
  modeState.marksOpacity = on('marks') ? 1 : 0;
  modeState.idle = 0;
}

function liftGroup(group, settling = false) {
  const lead = num('lead');
  const stride = num('stride');
  const b = modeState.body;
  const speed = Math.hypot(b.vx, b.vy);
  const ahead = settling ? 0 : lead * stride * 4;
  const dx = speed ? b.vx / speed * ahead : 0;
  const dy = speed ? b.vy / speed * ahead : 0;
  modeState.legs.forEach((leg) => {
    if (leg.group !== group) return;
    const rest = restPoint(leg);
    leg.swing = 0;
    leg.from = { ...leg.foot };
    leg.to = { x: rest.x + dx, y: rest.y + dy };
  });
}

function stepLegs() {
  const stride = num('stride');
  const bodySpeed = Math.hypot(modeState.body.vx, modeState.body.vy);
  const swingTime = clamp(num('swing') * 0.3 / Math.max(0.08, bodySpeed), 0.04, 0.5);
  const legs = modeState.legs;

  if (!legs.some((leg) => leg.swing >= 0)) {
    if (modeState.idle >= BEETLE_SETTLE_DELAY) {
      for (const group of [0, 1]) {
        if (legs.some((leg) => leg.group === group && stretch(leg) > BEETLE_SETTLE_EPSILON)) {
          liftGroup(group, true);
          break;
        }
      }
    } else {
      for (const group of [0, 1]) {
        if (legs.some((leg) => leg.group === group && stretch(leg) > stride)) {
          liftGroup(group);
          break;
        }
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
    if (on('marks')) modeState.marks.push({ x: leg.foot.x, y: leg.foot.y, age: 0 });
  });
}

MODES.beetle = {
  label: 'жук',
  note: 'Буква идёт за курсором: стойка — тело, боковые ломаные — лапы. «Скорость» ускоряет и тело, и перебор лап; их вылет задаёт только «шаг», «угасание» — скорость исчезновения следа. Через три секунды тишины лапы возвращаются в спокойное положение.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'speed', label: 'скорость', min: 0.05, max: 2.4, step: 0.01, value: 1.2 },
    { type: 'range', key: 'stride', label: 'шаг', min: 0.012, max: 0.24, step: 0.004, value: 0.12 },
    { type: 'range', key: 'swing', label: 'перенос', min: 0.05, max: 0.5, step: 0.01, value: 0.16 },
    { type: 'range', key: 'lead', label: 'упреждение', min: 0, max: 0.5, step: 0.01, value: 0.14 },
    { type: 'range', key: 'knee', label: 'излом', min: 0, max: 0.1, step: 0.005, value: 0 },
    { type: 'range', key: 'fade', label: 'угасание', min: 0.25, max: 3, step: 0.05, value: 1 },
    { type: 'toggle', key: 'six', label: 'шесть лап', value: false },
    { type: 'toggle', key: 'turn', label: 'поворот', value: true },
    { type: 'toggle', key: 'flee', label: 'от курсора', value: false },
    { type: 'toggle', key: 'marks', label: 'след', value: false },
    { type: 'toggle', key: 'ghost', label: 'форма', value: false },
    { type: 'button', label: 'вернуть', action: () => beetleReset() },
  ],
  setup() { beetleReset(); },
  onMove() { modeState.idle = 0; },
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
    b.vx += ((dx / dist) * want - b.vx) * 0.22;
    b.vy += ((dy / dist) * want - b.vy) * 0.22;
    b.x = clamp(b.x + b.vx * STEP, 0.14, 0.86);
    b.y = clamp(b.y + b.vy * STEP, 0.14, 0.86);

    const moving = Math.hypot(b.vx, b.vy) > 0.03;
    const goal = on('turn') && moving ? wrap(Math.atan2(b.vy, b.vx) - UP) : 0;
    const turn = wrap(goal - b.rot);
    b.rot = wrap(b.rot + clamp(turn, -4.8 * STEP, 4.8 * STEP));

    modeState.idle += STEP;
    stepLegs();

    const marksVisible = on('marks');
    const fadeSpeed = num('fade');
    if (marksVisible) modeState.marksOpacity = 1;
    else modeState.marksOpacity *= Math.exp((-STEP * fadeSpeed) / 1.4);
    modeState.marks.forEach((mark) => { mark.age += STEP * fadeSpeed; });
    modeState.marks = modeState.marks.filter((mark) => mark.age < BEETLE_MARK_LIFE);
    if (!marksVisible && modeState.marksOpacity < 0.002) modeState.marks = [];
  },
  draw() {
    const b = modeState.body;
    if (modeState.marksOpacity > 0.001) {
      modeState.marks.forEach((mark) => {
        const ageOpacity = clamp((BEETLE_MARK_LIFE - mark.age) / BEETLE_MARK_FADE, 0, 1);
        const alpha = modeState.marksOpacity * ageOpacity;
        dot(mark.x, mark.y, `rgba(224,33,15,${alpha})`, BEETLE_WIDTH / 2);
      });
    }

    const top = toWorld(0, -BEETLE_STEM);
    const bottom = toWorld(0, BEETLE_STEM);
    if (on('ghost')) {
      line(top.x, top.y, bottom.x, bottom.y, FAINT, BEETLE_WIDTH);
      modeState.legs.forEach((leg) => {
        const hip = hipPoint(leg);
        const rest = restPoint(leg);
        line(hip.x, hip.y, rest.x, rest.y, FAINT, BEETLE_WIDTH);
      });
    }
    line(top.x, top.y, bottom.x, bottom.y, INK, BEETLE_WIDTH);

    const knee = num('knee');
    modeState.legs.forEach((leg) => {
      const side = Math.sign(Math.cos(leg.a) || 1);
      const hip = hipPoint(leg);
      if (knee > 0.001) {
        const foot = toBody(leg.foot.x, leg.foot.y);
        const hipX = side * BEETLE_HIP;
        const dx = foot.x - hipX;
        const length = Math.hypot(dx, foot.y) || 1;
        let px = -foot.y / length;
        let py = dx / length;
        /* колено уходит наружу от оси тела, как у насекомого */
        if (px * side < 0) { px = -px; py = -py; }
        const bend = toWorld((hipX + foot.x) / 2 + px * knee, foot.y / 2 + py * knee);
        line(hip.x, hip.y, bend.x, bend.y, INK, BEETLE_WIDTH);
        line(bend.x, bend.y, leg.foot.x, leg.foot.y, INK, BEETLE_WIDTH);
      } else {
        line(hip.x, hip.y, leg.foot.x, leg.foot.y, INK, BEETLE_WIDTH);
      }
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
  modeState.drag = -1;
}

function foldTarget(a0, fold) {
  const vertical = Math.sin(a0) < 0 ? UP : DOWN;
  return a0 + (vertical - a0) * fold;
}

function hingeTip(index) {
  const b = modeState.body;
  const ray = modeState.rays[index];
  return { x: b.x + Math.cos(ray.a) * ARM, y: b.y + Math.sin(ray.a) * ARM };
}

function pickHingeRay() {
  let picked = -1;
  let nearest = 0.075;
  modeState.rays.forEach((ray, index) => {
    const tip = hingeTip(index);
    const distance = Math.hypot(pointer.x - tip.x, pointer.y - tip.y);
    if (distance >= nearest) return;
    nearest = distance;
    picked = index;
  });
  return picked;
}

function drawHingeTies() {
  const b = modeState.body;
  const tips = modeState.rays.map((ray, index) => hingeTip(index));
  const points = [
    { x: b.x, y: b.y - STEM }, tips[0], tips[2],
    { x: b.x, y: b.y + STEM }, tips[3], tips[1],
  ];
  const rest = [
    { x: 0, y: -STEM }, { x: Math.cos(UR) * ARM, y: Math.sin(UR) * ARM },
    { x: Math.cos(DR) * ARM, y: Math.sin(DR) * ARM }, { x: 0, y: STEM },
    { x: Math.cos(DL) * ARM, y: Math.sin(DL) * ARM }, { x: Math.cos(UL) * ARM, y: Math.sin(UL) * ARM },
  ];

  points.forEach((point, index) => {
    const next = (index + 1) % points.length;
    const length = Math.hypot(points[next].x - point.x, points[next].y - point.y);
    const restLength = Math.hypot(rest[next].x - rest[index].x, rest[next].y - rest[index].y);
    const strain = Math.min(1, Math.abs(length / restLength - 1) * 4);
    line(point.x, point.y, points[next].x, points[next].y, `rgba(22,22,22,${0.1 + strain * 0.32})`, 0.0025);
  });
}

MODES.hinge = {
  label: 'шарнир',
  note: 'Тяни кончик луча — симметричный ответит ему, а тонкие стяжки покажут напряжение. Тяни за пустое место — в движение придёт вся буква. Краска появляется только на луче, дошедшем до предела.',
  cursor: 'grab',
  tools: [
    { type: 'range', key: 'stiff', label: 'жёсткость', min: 0.1, max: 4, step: 0.05, value: 1.2 },
    { type: 'range', key: 'damp', label: 'вязкость', min: 0.02, max: 1, step: 0.02, value: 0.24 },
    { type: 'range', key: 'lag', label: 'инерция', min: 0, max: 6, step: 0.1, value: 1.6 },
    { type: 'range', key: 'fold', label: 'сжатие', min: 0, max: 1, step: 0.01, value: 0 },
    { type: 'range', key: 'pull', label: 'тяга', min: 0.2, max: 4, step: 0.05, value: 1.2 },
    { type: 'range', key: 'limit', label: 'предел', min: 0.1, max: 1.5, step: 0.05, value: 0.9 },
    { type: 'toggle', key: 'sym', label: 'симметрия', value: true },
    { type: 'toggle', key: 'ties', label: 'стяжки', value: true },
    { type: 'toggle', key: 'ghost', label: 'форма', value: true },
    { type: 'button', label: 'вернуть', action: () => hingeReset() },
  ],
  setup() { hingeReset(); },
  onDown() {
    modeState.drag = pickHingeRay();
    canvas.style.cursor = modeState.drag >= 0 ? 'grabbing' : 'move';
  },
  onUp() {
    modeState.drag = -1;
    canvas.style.cursor = 'grab';
  },
  step() {
    const b = modeState.body;
    const pull = num('pull') * 60;
    const draggingRay = pointer.down && modeState.drag >= 0;
    const tx = pointer.down && !draggingRay ? pointer.x : 0.5;
    const ty = pointer.down && !draggingRay ? pointer.y : 0.5;
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

    modeState.rays.forEach((ray, index) => {
      const target = foldTarget(ray.a0, fold);
      if (index === modeState.drag && pointer.down) {
        const wanted = Math.atan2(pointer.y - b.y, pointer.x - b.x);
        const offset = wrap(wanted - target);
        const bounded = wrap(target + clamp(offset, -limit, limit));
        ray.w = clamp(wrap(bounded - ray.a) / STEP, -10, 10);
        ray.a = bounded;
        if (Math.abs(offset) >= limit) ray.hit = 1;
        return;
      }
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
      [[0, 1], [2, 3]].forEach(([right, left]) => {
        const leader = modeState.drag === left ? left : right;
        const follower = leader === right ? left : right;
        modeState.rays[follower].a = wrap(Math.PI - modeState.rays[leader].a);
        modeState.rays[follower].w = -modeState.rays[leader].w;
        modeState.rays[follower].hit = modeState.rays[leader].hit;
      });
    }
  },
  draw() {
    if (on('ghost')) drawGhost();
    const b = modeState.body;
    if (on('ties')) drawHingeTies();
    line(b.x, b.y + Math.sin(UP) * STEM, b.x, b.y + Math.sin(DOWN) * STEM, INK, 0.016);
    modeState.rays.forEach((ray, index) => {
      const color = ray.hit > 0.05 ? RED : INK;
      line(b.x, b.y, b.x + Math.cos(ray.a) * ARM, b.y + Math.sin(ray.a) * ARM, color, 0.013);
      if (modeState.drag === index && pointer.down) {
        const tip = hingeTip(index);
        ctx.beginPath();
        ctx.arc(tip.x * S, tip.y * S, 0.018 * S, 0, Math.PI * 2);
        ctx.strokeStyle = MUTED;
        ctx.lineWidth = 0.002 * S;
        ctx.stroke();
      }
    });
    const bent = modeState.rays.reduce((sum, ray) => sum + Math.abs(wrap(ray.a - ray.a0)), 0) / 4;
    drawStatus(`перегиб ${bent.toFixed(2)}`, bent > 0.5);
  },
};

/* ---------- 4. резонанс: шесть импульсов сходятся в узле ---------- */

const OPPOSITE_RAY = [1, 0, 5, 4, 3, 2];

function resonanceReset() {
  modeState.pulses = [];
  modeState.arrivals = [];
  modeState.stroke = new Set();
  modeState.clock = 0;
  modeState.lastSync = -10;
  modeState.match = 0;
  modeState.flare = 0;
  modeState.shock = -1;
}

function emitPulse(ray, outward = false) {
  modeState.pulses.push({ ray, t: 0, outward });
}

function emitAll() {
  SKELETON.forEach((ray, index) => emitPulse(index));
}

function resonanceTip(index) {
  const ray = SKELETON[index];
  return { x: 0.5 + Math.cos(ray.a) * ray.len, y: 0.5 + Math.sin(ray.a) * ray.len };
}

function pluckResonanceRay() {
  let picked = -1;
  let nearest = 0.09;
  SKELETON.forEach((ray, index) => {
    const tip = resonanceTip(index);
    const distance = Math.hypot(pointer.x - tip.x, pointer.y - tip.y);
    if (distance >= nearest) return;
    nearest = distance;
    picked = index;
  });
  if (picked < 0 || modeState.stroke.has(picked)) return;
  modeState.stroke.add(picked);
  emitPulse(picked);
}

function drawPulse(pulse) {
  const ray = SKELETON[pulse.ray];
  const head = ray.len * (pulse.outward ? pulse.t : 1 - pulse.t);
  const length = num('length');
  const tail = pulse.outward ? Math.max(0, head - length) : Math.min(ray.len, head + length);
  const c = Math.cos(ray.a);
  const s = Math.sin(ray.a);
  const color = pulse.outward ? MUTED : INK;
  line(0.5 + c * tail, 0.5 + s * tail, 0.5 + c * head, 0.5 + s * head, color, 0.018);
  dot(0.5 + c * head, 0.5 + s * head, color, 0.009);
}

MODES.resonance = {
  label: 'резонанс',
  note: 'Нажми кончик луча или проведи по нескольким — импульсы пойдут к узлу и выйдут с противоположной стороны. Центр окрасится, только если все шесть придут вместе. Нажатие на узел — точный камертон.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'speed', label: 'скорость', min: 0.3, max: 1.8, step: 0.05, value: 0.75 },
    { type: 'range', key: 'window', label: 'допуск', min: 0.04, max: 0.5, step: 0.01, value: 0.18 },
    { type: 'range', key: 'length', label: 'длина', min: 0.015, max: 0.12, step: 0.005, value: 0.055 },
    { type: 'toggle', key: 'echo', label: 'отклик', value: true },
    { type: 'button', label: 'все вместе', action: () => emitAll() },
    { type: 'button', label: 'очистить', action: () => resonanceReset() },
  ],
  setup() {
    resonanceReset();
    emitAll();
  },
  onDown() {
    modeState.stroke = new Set();
    if (Math.hypot(pointer.x - 0.5, pointer.y - 0.5) < 0.075) {
      emitAll();
      SKELETON.forEach((ray, index) => modeState.stroke.add(index));
      return;
    }
    pluckResonanceRay();
  },
  onMove() {
    if (pointer.down) pluckResonanceRay();
  },
  onUp() { modeState.stroke.clear(); },
  step() {
    modeState.clock += STEP;
    const speed = num('speed');
    const born = [];

    modeState.pulses.forEach((pulse) => {
      pulse.t += speed * STEP;
      if (pulse.t < 1 || pulse.outward) return;
      modeState.arrivals.push({ ray: pulse.ray, time: modeState.clock });
      if (on('echo')) born.push({ ray: OPPOSITE_RAY[pulse.ray], t: 0, outward: true });
    });
    modeState.pulses = modeState.pulses.filter((pulse) => pulse.t < 1);
    modeState.pulses.push(...born);

    const window = num('window');
    modeState.arrivals = modeState.arrivals.filter((arrival) => modeState.clock - arrival.time <= window);
    modeState.match = new Set(modeState.arrivals.map((arrival) => arrival.ray)).size;
    if (modeState.match === SKELETON.length && modeState.clock - modeState.lastSync > window) {
      modeState.lastSync = modeState.clock;
      modeState.flare = 1;
      modeState.shock = 0;
      modeState.arrivals = [];
    }
    modeState.flare = Math.max(0, modeState.flare - STEP * 1.25);
    if (modeState.shock >= 0) {
      modeState.shock += STEP * 1.8;
      if (modeState.shock > 1) modeState.shock = -1;
    }
  },
  draw() {
    SKELETON.forEach((ray, index) => {
      const tip = resonanceTip(index);
      line(0.5, 0.5, tip.x, tip.y, INK, 0.006);
      ctx.beginPath();
      ctx.arc(tip.x * S, tip.y * S, 0.013 * S, 0, Math.PI * 2);
      ctx.strokeStyle = MUTED;
      ctx.lineWidth = 0.002 * S;
      ctx.stroke();
    });
    modeState.pulses.forEach(drawPulse);

    const count = modeState.flare > 0 ? SKELETON.length : modeState.match;
    dot(0.5, 0.5, modeState.flare > 0 ? RED : INK, 0.008 + modeState.flare * 0.014);
    if (modeState.shock >= 0) {
      ctx.beginPath();
      ctx.arc(0.5 * S, 0.5 * S, (0.025 + modeState.shock * 0.12) * S, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(224,33,15,${0.55 * (1 - modeState.shock)})`;
      ctx.lineWidth = 0.003 * S;
      ctx.stroke();
    }
    drawStatus(`совпадение ${count} / ${SKELETON.length}`, count === SKELETON.length);
  },
};

/* ---------- 5. поле: подвижные электроды и следы потока ---------- */

const MIRROR_RAY = [0, 1, 3, 2, 5, 4];
const FIELD_MOVABLE = new Set([2, 3, 4, 5]);

function fieldRest(index) {
  const ray = SKELETON[index];
  return { x: 0.5 + Math.cos(ray.a) * ray.len, y: 0.5 + Math.sin(ray.a) * ray.len };
}

function fieldReset() {
  modeState.electrodes = SKELETON.map((ray, index) => ({ ...fieldRest(index), vx: 0, vy: 0 }));
  modeState.particles = [];
  SKELETON.forEach((ray, index) => {
    for (let i = 0; i < 9; i += 1) {
      modeState.particles.push({ ray: index, t: (i + Math.random() * 0.4) / 9, lane: Math.random() * 2 - 1 });
    }
  });
  modeState.trails = [];
  modeState.drag = -1;
  modeState.clock = 0;
  modeState.tick = 0;
  modeState.stress = 0;
  modeState.overload = false;
  modeState.flare = 0;
  modeState.shock = -1;
}

function pickFieldElectrode() {
  let picked = -1;
  let nearest = 0.075;
  modeState.electrodes.forEach((electrode, index) => {
    if (!FIELD_MOVABLE.has(index)) return;
    const distance = Math.hypot(pointer.x - electrode.x, pointer.y - electrode.y);
    if (distance >= nearest) return;
    nearest = distance;
    picked = index;
  });
  return picked;
}

function fieldGeometry(index, lane = 0) {
  const electrode = modeState.electrodes[index];
  const rest = fieldRest(index);
  const dx = electrode.x - 0.5;
  const dy = electrode.y - 0.5;
  const length = Math.hypot(dx, dy) || 1;
  const px = -dy / length;
  const py = dx / length;
  const drift = (electrode.x - rest.x) * px + (electrode.y - rest.y) * py;
  const bend = lane * num('spread') + drift * 0.42;
  return {
    ex: electrode.x,
    ey: electrode.y,
    cx: 0.5 + dx * 0.5 + px * bend,
    cy: 0.5 + dy * 0.5 + py * bend,
  };
}

function fieldPoint(geometry, t) {
  const u = 1 - t;
  return {
    x: u * u * 0.5 + 2 * u * t * geometry.cx + t * t * geometry.ex,
    y: u * u * 0.5 + 2 * u * t * geometry.cy + t * t * geometry.ey,
  };
}

function fieldTangent(geometry, t) {
  return {
    x: 2 * (1 - t) * (geometry.cx - 0.5) + 2 * t * (geometry.ex - geometry.cx),
    y: 2 * (1 - t) * (geometry.cy - 0.5) + 2 * t * (geometry.ey - geometry.cy),
  };
}

function drawFieldCurve(index, lane) {
  const geometry = fieldGeometry(index, lane);
  ctx.beginPath();
  ctx.moveTo(0.5 * S, 0.5 * S);
  ctx.quadraticCurveTo(geometry.cx * S, geometry.cy * S, geometry.ex * S, geometry.ey * S);
  ctx.strokeStyle = 'rgba(22,22,22,.12)';
  ctx.lineWidth = 0.002 * S;
  ctx.lineCap = 'round';
  ctx.stroke();
}

MODES.field = {
  label: 'поле',
  note: 'Тяни один из четырёх диагональных электродов. Парный ответит с запаздыванием, потоки изогнутся и оставят след. Красный разряд возникает только при перегрузке поля.',
  cursor: 'grab',
  tools: [
    { type: 'range', key: 'speed', label: 'ток', min: 0.08, max: 1.2, step: 0.02, value: 0.36 },
    { type: 'range', key: 'spread', label: 'поле', min: 0, max: 0.055, step: 0.0025, value: 0.0225 },
    { type: 'range', key: 'lag', label: 'запаздывание', min: 0, max: 1.2, step: 0.05, value: 0.45 },
    { type: 'range', key: 'trip', label: 'пробой', min: 0.06, max: 0.3, step: 0.01, value: 0.16 },
    { type: 'range', key: 'life', label: 'след', min: 0.2, max: 4, step: 0.1, value: 1.5 },
    { type: 'toggle', key: 'sym', label: 'симметрия', value: true },
    { type: 'toggle', key: 'trace', label: 'остаточный заряд', value: true },
    { type: 'toggle', key: 'ghost', label: 'форма', value: false },
    { type: 'button', label: 'разрядить', action: () => fieldReset() },
  ],
  setup() { fieldReset(); },
  onDown() {
    modeState.drag = pickFieldElectrode();
    canvas.style.cursor = modeState.drag >= 0 ? 'grabbing' : 'grab';
  },
  onMove() {
    if (!pointer.down || modeState.drag < 0) return;
    const electrode = modeState.electrodes[modeState.drag];
    electrode.x = clamp(pointer.x, 0.1, 0.9);
    electrode.y = clamp(pointer.y, 0.1, 0.9);
    electrode.vx = 0;
    electrode.vy = 0;
  },
  onUp() {
    modeState.drag = -1;
    canvas.style.cursor = 'grab';
  },
  step() {
    modeState.clock += STEP;
    modeState.tick += 1;
    const lag = num('lag');
    const dragged = modeState.drag;

    modeState.electrodes.forEach((electrode, index) => {
      if (index === dragged && pointer.down) {
        electrode.x = clamp(pointer.x, 0.1, 0.9);
        electrode.y = clamp(pointer.y, 0.1, 0.9);
        electrode.vx = 0;
        electrode.vy = 0;
        return;
      }

      let target = fieldRest(index);
      const follows = dragged >= 0 && MIRROR_RAY[dragged] === index && on('sym');
      if (follows) {
        const leader = modeState.electrodes[dragged];
        target = { x: 1 - leader.x, y: leader.y };
      }
      const stiffness = follows ? 34 / (1 + lag * 5) : 18;
      const damping = follows ? 5.5 : 6.5;
      electrode.vx += ((target.x - electrode.x) * stiffness - electrode.vx * damping) * STEP;
      electrode.vy += ((target.y - electrode.y) * stiffness - electrode.vy * damping) * STEP;
      electrode.x += electrode.vx * STEP;
      electrode.y += electrode.vy * STEP;
    });

    modeState.stress = modeState.electrodes.reduce((best, electrode, index) => {
      if (!FIELD_MOVABLE.has(index)) return best;
      const rest = fieldRest(index);
      return Math.max(best, Math.hypot(electrode.x - rest.x, electrode.y - rest.y));
    }, 0);
    const trip = num('trip');
    if (modeState.stress >= trip && !modeState.overload) {
      modeState.overload = true;
      modeState.flare = 1;
      modeState.shock = 0;
    }
    if (modeState.stress < trip * 0.62) modeState.overload = false;

    modeState.particles.forEach((particle) => {
      particle.t += num('speed') * STEP;
      if (particle.t >= 1) {
        particle.ray = OPPOSITE_RAY[particle.ray];
        particle.t -= 1;
        particle.lane *= -1;
      }
      if (!on('trace') || modeState.tick % 3) return;
      const geometry = fieldGeometry(particle.ray, particle.lane);
      const point = fieldPoint(geometry, 1 - particle.t);
      modeState.trails.push({ ...point, born: modeState.clock });
    });
    const life = num('life');
    modeState.trails = modeState.trails.filter((trail) => modeState.clock - trail.born < life);
    if (modeState.trails.length > 720) modeState.trails.splice(0, modeState.trails.length - 720);

    modeState.flare = Math.max(0, modeState.flare - STEP * 1.2);
    if (modeState.shock >= 0) {
      modeState.shock += STEP * 1.5;
      if (modeState.shock > 1) modeState.shock = -1;
    }
  },
  draw() {
    if (on('ghost')) drawGhost();
    const life = num('life');
    modeState.trails.forEach((trail) => {
      const alpha = 0.2 * (1 - (modeState.clock - trail.born) / life);
      dot(trail.x, trail.y, `rgba(22,22,22,${alpha})`, 0.0026);
    });

    SKELETON.forEach((ray, index) => {
      [-1, -0.5, 0, 0.5, 1].forEach((lane) => drawFieldCurve(index, lane));
    });
    modeState.particles.forEach((particle) => {
      const geometry = fieldGeometry(particle.ray, particle.lane);
      const t = 1 - particle.t;
      const point = fieldPoint(geometry, t);
      const tangent = fieldTangent(geometry, t);
      const length = Math.hypot(tangent.x, tangent.y) || 1;
      const dx = tangent.x / length * 0.011;
      const dy = tangent.y / length * 0.011;
      line(point.x - dx, point.y - dy, point.x + dx, point.y + dy, INK, 0.0045);
    });

    modeState.electrodes.forEach((electrode, index) => {
      ctx.beginPath();
      ctx.arc(electrode.x * S, electrode.y * S, (FIELD_MOVABLE.has(index) ? 0.014 : 0.009) * S, 0, Math.PI * 2);
      ctx.strokeStyle = index === modeState.drag ? INK : MUTED;
      ctx.lineWidth = (index === modeState.drag ? 0.003 : 0.002) * S;
      ctx.stroke();
    });

    dot(0.5, 0.5, modeState.flare > 0 ? RED : INK, 0.008 + modeState.flare * 0.012);
    if (modeState.shock >= 0) {
      ctx.beginPath();
      ctx.arc(0.5 * S, 0.5 * S, (0.025 + modeState.shock * 0.15) * S, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(224,33,15,${0.5 * (1 - modeState.shock)})`;
      ctx.lineWidth = 0.0025 * S;
      ctx.stroke();
    }
    drawStatus(`напряжение ${modeState.stress.toFixed(2)}`, modeState.overload);
  },
};

/* ---------- 6. калейдоскоп: вертикаль — главная ось зеркала ---------- */

const KALEIDO_STEP = Math.PI / 3;
const KALEIDO_START = -Math.PI / 2;
const KALEIDO_STRETCH = (ARM_Y / ARM_X) / Math.tan(Math.PI / 6);
const KALEIDO_COPIES = [
  { turn: 0, mirror: false },
  { turn: 0, mirror: true },
  { turn: 1, mirror: false },
  { turn: 2, mirror: true },
  { turn: 2, mirror: false },
  { turn: 1, mirror: true },
];

function kaleidoSectorAt(x, y) {
  const angle = Math.atan2((y - 0.5) / KALEIDO_STRETCH, x - 0.5);
  const normalized = (angle - KALEIDO_START + Math.PI * 2) % (Math.PI * 2);
  return Math.min(5, Math.floor(normalized / KALEIDO_STEP));
}

function kaleidoReset() {
  modeState.strokes = [];
  modeState.active = null;
  modeState.clock = 0;
  modeState.flare = 0;
  modeState.shock = -1;
}

function addKaleidoPoint() {
  const stroke = modeState.active;
  if (!stroke) return;
  const previous = stroke.points[stroke.points.length - 1];
  if (previous && Math.hypot(pointer.x - previous.x, pointer.y - previous.y) < 0.004) return;

  const dx = pointer.x - 0.5;
  const dy = pointer.y - 0.5;
  const distance = Math.hypot(dx, dy);
  stroke.points.push({
    x: pointer.x,
    y: pointer.y,
    time: modeState.clock,
  });
  if (stroke.points.length > 280) stroke.points.shift();

  if (distance < 0.035 && (!previous || Math.hypot(previous.x - 0.5, previous.y - 0.5) > 0.055)) {
    modeState.flare = 1;
    modeState.shock = 0;
  }
}

function mapKaleidoPoint(point, copy) {
  const transform = KALEIDO_COPIES[copy];
  let dx = point.x - 0.5;
  const dy = (point.y - 0.5) / KALEIDO_STRETCH;
  if (transform.mirror) dx = -dx;
  const angle = transform.turn * Math.PI * 2 / 3;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: 0.5 + dx * c - dy * s,
    y: 0.5 + (dx * s + dy * c) * KALEIDO_STRETCH,
  };
}

function drawKaleidoGuides() {
  for (let index = 0; index < 6; index += 1) {
    const boundary = KALEIDO_START + index * KALEIDO_STEP;
    const dx = Math.cos(boundary);
    const dy = Math.sin(boundary) * KALEIDO_STRETCH;
    const length = Math.hypot(dx, dy);
    line(0.5, 0.5, 0.5 + dx / length * 0.72, 0.5 + dy / length * 0.72, 'rgba(22,22,22,.075)', 0.0015);
  }
}

function fillKaleidoSector(index) {
  const start = KALEIDO_START + index * KALEIDO_STEP;
  ctx.beginPath();
  ctx.moveTo(0.5 * S, 0.5 * S);
  for (let step = 0; step <= 12; step += 1) {
    const angle = start + KALEIDO_STEP * step / 12;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle) * KALEIDO_STRETCH;
    const length = Math.hypot(dx, dy);
    ctx.lineTo((0.5 + dx / length * 0.72) * S, (0.5 + dy / length * 0.72) * S);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(22,22,22,.025)';
  ctx.fill();
}

function drawKaleidoStroke(stroke, copy) {
  const delay = Math.floor(copy / 2) * num('lag');
  const life = num('life');
  const visible = stroke.points.filter((point) => point.time + delay <= modeState.clock);
  if (!visible.length) return;

  if (visible.length === 1) {
    const age = modeState.clock - visible[0].time - delay;
    const alpha = 0.72 * clamp(1 - age / life, 0, 1);
    const point = mapKaleidoPoint(visible[0], copy);
    dot(point.x, point.y, `rgba(22,22,22,${alpha})`, num('brush') * 0.5);
    return;
  }

  for (let i = 1; i < visible.length; i += 1) {
    const age = modeState.clock - visible[i].time - delay;
    const alpha = 0.72 * clamp(1 - age / life, 0, 1);
    if (alpha <= 0) continue;
    const from = mapKaleidoPoint(visible[i - 1], copy);
    const to = mapKaleidoPoint(visible[i], copy);
    line(from.x, from.y, to.x, to.y, `rgba(22,22,22,${alpha})`, num('brush'));
  }
}

MODES.kaleido = {
  label: 'калейдоскоп',
  note: 'Начни рисовать в любом секторе. Вертикаль и две диагонали «Ж» сами служат осями зеркала: каждый штрих получает пару по ту сторону линии. Пары приходят эхом, но симметрия не ломается. Пересечение центра даёт красную вспышку.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'brush', label: 'штрих', min: 0.002, max: 0.024, step: 0.001, value: 0.007 },
    { type: 'range', key: 'life', label: 'память', min: 1, max: 20, step: 0.5, value: 8 },
    { type: 'range', key: 'lag', label: 'эхо', min: 0, max: 0.2, step: 0.01, value: 0.04 },
    { type: 'toggle', key: 'sectors', label: 'секторы', value: true },
    { type: 'toggle', key: 'ghost', label: 'форма', value: true },
    { type: 'button', label: 'смыть', action: () => kaleidoReset() },
  ],
  setup() { kaleidoReset(); },
  onDown() {
    const stroke = { source: kaleidoSectorAt(pointer.x, pointer.y), points: [] };
    modeState.active = stroke;
    modeState.strokes.push(stroke);
    if (modeState.strokes.length > 24) modeState.strokes.shift();
    addKaleidoPoint();
  },
  onMove() { if (pointer.down) addKaleidoPoint(); },
  onUp() { modeState.active = null; },
  step() {
    modeState.clock += STEP;
    const life = num('life') + num('lag') * 3;
    modeState.strokes = modeState.strokes.filter((stroke) => {
      const last = stroke.points[stroke.points.length - 1];
      return last && modeState.clock - last.time < life;
    });
    modeState.flare = Math.max(0, modeState.flare - STEP * 1.4);
    if (modeState.shock >= 0) {
      modeState.shock += STEP * 2;
      if (modeState.shock > 1) modeState.shock = -1;
    }
  },
  draw() {
    if (modeState.active) fillKaleidoSector(modeState.active.source);
    if (on('sectors')) drawKaleidoGuides();
    if (on('ghost')) drawGhost();
    modeState.strokes.forEach((stroke) => {
      KALEIDO_COPIES.forEach((copy, index) => drawKaleidoStroke(stroke, index));
    });

    dot(0.5, 0.5, modeState.flare > 0 ? RED : INK, 0.006 + modeState.flare * 0.01);
    if (modeState.shock >= 0) {
      ctx.beginPath();
      ctx.arc(0.5 * S, 0.5 * S, (0.018 + modeState.shock * 0.1) * S, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(224,33,15,${0.45 * (1 - modeState.shock)})`;
      ctx.lineWidth = 0.002 * S;
      ctx.stroke();
    }
    const sector = modeState.active ? modeState.active.source + 1 : 0;
    drawStatus(sector ? `сектор ${sector} / 6` : `штрихов ${modeState.strokes.length}`, modeState.flare > 0);
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
