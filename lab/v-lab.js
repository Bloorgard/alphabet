const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const modesBar = document.getElementById('modes');
const toolsBar = document.getElementById('tools');
const note = document.getElementById('note');

const RED = [224, 33, 15];
const PAPER = [241, 237, 229];
const DARK = [96, 8, 4];
const PAPER_CSS = `rgb(${[241, 237, 229].join(',')})`;
const CANVAS_BLUE = '#0d47d9';
const FORM_WHITE = '#ffffff';

// Лента живёт в экранных координатах, а глубина — рисованная:
// дальний конец уже и бледнее, ближний крупнее и насыщеннее.
const NEAR = 1;
const FAR = 0.42;

let S = 0;
let dpr = 1;
let current = null;
let points = [];
let pins = [];
let rest = 0;
let restCurve = [];
let drag = null;

const toolValues = {};
const toolInputs = {};
function getTool(key) { return toolValues[key]; }

function setTool(key, value) {
  toolValues[key] = value;
  if (toolInputs[key]) toolInputs[key].value = value;
}

/* ---------- лента ---------- */

function pinRow() {
  return [
    { x: S * 0.34, y: S * 0.17 },
    { x: S * 0.34, y: S * 0.51 },
    { x: S * 0.34, y: S * 0.85 },
  ];
}

// Путь ленты задаётся списком прижимов и излишком длины на каждом участке.
// Точки распределяются пропорционально нужной длине, поэтому шаг всюду один.
function buildPath(anchors, slacks) {
  const n = Math.round(Number(getTool('points')) || 140);
  const extra = Number(getTool('slack')) || 1.7;
  const spans = [];
  let total = 0;
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const dist = Math.hypot(anchors[i + 1].x - anchors[i].x, anchors[i + 1].y - anchors[i].y);
    // slack === 1 означает натянутый участок: стойку буквы излишек не касается.
    const want = dist * (slacks[i] === 1 ? 1 : extra * slacks[i]);
    spans.push({ dist, want });
    total += want;
  }

  const tail = Math.round(n * 0.07);
  const budget = n - 2 * tail;
  rest = total / budget;

  points = [];
  pins = [];
  const push = (x, y) => points.push({ x, y, px: x, py: y, pin: null });

  for (let i = 0; i < tail; i += 1) push(anchors[0].x - (tail - i) * rest, anchors[0].y);

  let index = points.length;
  pins.push({ index, x: anchors[0].x, y: anchors[0].y });
  for (let i = 0; i < spans.length; i += 1) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const count = Math.max(2, Math.round((budget * spans[i].want) / total));
    const bow = spans[i].want / spans[i].dist - 1;
    for (let k = 1; k <= count; k += 1) {
      const t = k / count;
      // Стартовая дуга в сторону раздува — иначе излишку негде зародиться.
      const swell = Math.sin(t * Math.PI) * bow * spans[i].dist * 0.45;
      push(a.x + (b.x - a.x) * t + swell, a.y + (b.y - a.y) * t);
    }
    index = points.length - 1;
    pins.push({ index, x: b.x, y: b.y });
  }

  const last = points[points.length - 1];
  for (let i = 1; i <= tail; i += 1) push(last.x + i * rest, last.y);

  for (const p of pins) points[p.index].pin = p;
  restCurve = [];
}

function build(pinCount) {
  const row = pinRow();
  if (pinCount === 2) return buildPath([row[0], row[2]], [1.9]);
  if (pinCount === 4) {
    // Стойка сверху вниз, затем две петли обратно наверх — это и есть В.
    return buildPath([row[0], row[2], row[1], row[0]], [1, 1.05, 1.05]);
  }
  return buildPath(row, [1.05, 1.05]);
}

function relax(iterations) {
  for (let k = 0; k < iterations; k += 1) {
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1e-6;
      const diff = ((dist - rest) / dist) * 0.5;
      const ax = a.pin || a === drag?.point ? 0 : 1;
      const bx = b.pin || b === drag?.point ? 0 : 1;
      const total = ax + bx || 1;
      a.x += dx * diff * (2 * ax) / total;
      a.y += dy * diff * (2 * ax) / total;
      b.x -= dx * diff * (2 * bx) / total;
      b.y -= dy * diff * (2 * bx) / total;
    }
    for (const p of pins) {
      const point = points[p.index];
      point.x = p.x;
      point.y = p.y;
    }
  }
}

// Изгибная жёсткость: точка тянется к середине между соседями,
// а в режиме памяти — к запомненному смещению от этой середины.
function bend(stiffness) {
  if (stiffness <= 0) return;
  for (let i = 1; i < points.length - 1; i += 1) {
    const p = points[i];
    if (p.pin || p === drag?.point) continue;
    const a = points[i - 1];
    const b = points[i + 1];
    let mx = (a.x + b.x) / 2;
    let my = (a.y + b.y) / 2;
    const memory = restCurve[i];
    if (memory) {
      const tx = b.x - a.x;
      const ty = b.y - a.y;
      const len = Math.hypot(tx, ty) || 1e-6;
      mx += (-ty / len) * memory;
      my += (tx / len) * memory;
    }
    p.x += (mx - p.x) * stiffness;
    p.y += (my - p.y) * stiffness;
  }
}

function rememberCurve() {
  restCurve = [];
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = points[i - 1];
    const p = points[i];
    const b = points[i + 1];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1e-6;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    restCurve[i] = ((p.x - mx) * (-ty / len) + (p.y - my) * (tx / len));
  }
}

function step() {
  const gravity = Number(getTool('gravity')) * 0.06;
  const blow = Number(getTool('blow')) * 0.06;
  const damp = 0.982;
  for (const p of points) {
    if (p.pin || p === drag?.point) { p.px = p.x; p.py = p.y; continue; }
    const vx = (p.x - p.px) * damp;
    const vy = (p.y - p.py) * damp;
    p.px = p.x;
    p.py = p.y;
    p.x += vx;
    p.y += vy + gravity;
    p.x += blow;
  }
  bend(Number(getTool('bend')));
  relax(12);
}

/* ---------- рисование ---------- */

function depthAt(i) {
  return NEAR + (FAR - NEAR) * (i / (points.length - 1));
}

function mix(a, b, t) {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

function edges() {
  const width = Number(getTool('width')) * S;
  const left = [];
  const right = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1e-6;
    const nx = -ty / len;
    const ny = tx / len;
    const half = (width * depthAt(i)) / 2;
    left.push({ x: points[i].x + nx * half, y: points[i].y + ny * half, nx, ny });
    right.push({ x: points[i].x - nx * half, y: points[i].y - ny * half });
  }
  return { left, right };
}

function drawRibbon() {
  const { left, right } = edges();
  const shadow = S * 0.02;

  ctx.fillStyle = 'rgba(22,22,22,.14)';
  ctx.beginPath();
  ctx.moveTo(left[0].x + shadow, left[0].y + shadow);
  for (const p of left) ctx.lineTo(p.x + shadow, p.y + shadow);
  for (let i = right.length - 1; i >= 0; i -= 1) ctx.lineTo(right[i].x + shadow, right[i].y + shadow);
  ctx.closePath();
  ctx.fill();

  // Каждый сегмент красится отдельно: наклон нормали даёт блик вдоль сгиба.
  const gloss = 0.7;
  for (let i = 0; i < points.length - 1; i += 1) {
    const lit = Math.max(0, left[i].nx * 0.75 + left[i].ny * -0.66);
    const depth = 1 - depthAt(i);
    const shade = mix(mix(DARK, RED, 0.55 + 0.45 * (1 - depth)).match(/\d+/g).map(Number), PAPER, gloss * lit * 0.85);
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.moveTo(left[i].x, left[i].y);
    ctx.lineTo(left[i + 1].x, left[i + 1].y);
    ctx.lineTo(right[i + 1].x, right[i + 1].y);
    ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    ctx.fill();
  }

  if (getTool('frame')) {
    ctx.strokeStyle = 'rgba(22,22,22,.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const p of points) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    for (const p of pins) {
      ctx.fillStyle = '#161616';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, S, S);
  drawRibbon();
}


/* ---------- параметрические складки ---------- */

// Складка — касательная оболочка вокруг спрятанной окружности: из базовой
// точки две касательные к кругу, между ними дуга. Контур аналитический,
// поэтому самопересечься и пойти зазубринами он не может.
const folds = [];
let budget = 0;
let foldDrag = null;

function makeFold(ang, len, rad, big) {
  return { ang, len, rad, restAng: ang, restLen: len, restRad: rad, vAng: 0, vLen: 0, big };
}

function foldBase(fold) {
  const stemX = S * 0.31;
  return { x: stemX, y: S * (0.5 + fold.baseOffset) };
}

function buildFolds() {
  folds.length = 0;
  const loop = Number(getTool('loop'));
  const small = Math.round(Number(getTool('small')));

  // Две крупные складки — петли В, они цепляются за стойку сверху и снизу.
  const upper = makeFold(-0.32, S * loop, S * loop * 0.42, true);
  upper.baseOffset = -0.2;
  const lower = makeFold(0.36, S * loop * 1.04, S * loop * 0.46, true);
  lower.baseOffset = 0.18;
  folds.push(upper, lower);

  // Мелочь веером — как на эскизе, из той же базы.
  for (let i = 0; i < small; i += 1) {
    const t = (i + 1) / (small + 1);
    const ang = -0.95 + t * 1.9;
    const fold = makeFold(ang, S * (0.12 + Math.random() * 0.16), S * (0.02 + Math.random() * 0.04), false);
    fold.baseOffset = -0.06 + t * 0.12;
    folds.push(fold);
  }

  budget = folds.reduce((sum, f) => sum + f.len, 0);
}

function stepFolds() {
  const spring = Number(getTool('spring'));
  const damp = 0.86;

  for (const fold of folds) {
    if (fold === foldDrag) continue;
    fold.vLen += (fold.restLen - fold.len) * spring;
    fold.vLen *= damp;
    fold.len += fold.vLen;
    fold.vAng += (fold.restAng - fold.ang) * spring;
    fold.vAng *= damp;
    fold.ang += fold.vAng;
  }

  // Общая длина ленты — бюджет: вытянул одну складку, соседние на столько же похудели.
  const total = folds.reduce((sum, f) => sum + f.len, 0);
  const excess = total - budget;
  if (Math.abs(excess) > 0.01) {
    const donors = folds.filter((f) => f !== foldDrag);
    const pool = donors.reduce((sum, f) => sum + f.len, 0) || 1;
    for (const fold of donors) fold.len = Math.max(fold.rad * 1.25, fold.len - excess * (fold.len / pool));
  }

  // Растянутая складка утончается — материал никуда не девается.
  for (const fold of folds) {
    fold.rad = Math.min(fold.len * 0.8, fold.restRad * Math.sqrt(fold.restLen / Math.max(1, fold.len)));
  }
}

function pathFold(fold, ox, oy) {
  const base = foldBase(fold);
  const px = base.x + ox;
  const py = base.y + oy;
  const cx = px + Math.cos(fold.ang) * fold.len;
  const cy = py + Math.sin(fold.ang) * fold.len;
  const r = Math.min(fold.rad, fold.len * 0.85);
  const beta = Math.asin(r / fold.len);
  const tangent = Math.sqrt(Math.max(0, fold.len * fold.len - r * r));

  const t1 = { x: px + Math.cos(fold.ang - beta) * tangent, y: py + Math.sin(fold.ang - beta) * tangent };
  const t2 = { x: px + Math.cos(fold.ang + beta) * tangent, y: py + Math.sin(fold.ang + beta) * tangent };

  ctx.moveTo(px, py);
  ctx.lineTo(t1.x, t1.y);
  ctx.arc(cx, cy, r, Math.atan2(t1.y - cy, t1.x - cx), Math.atan2(t2.y - cy, t2.x - cx), false);
  ctx.lineTo(px, py);
  ctx.closePath();
}

function pathStem(ox, oy) {
  const x = S * 0.31 + ox;
  const top = S * 0.16 + oy;
  const bottom = S * 0.86 + oy;
  const half = S * Number(getTool('stem')) / 2;
  ctx.moveTo(x - half, top);
  ctx.lineTo(x + half, top);
  ctx.lineTo(x + half, bottom);
  ctx.lineTo(x - half, bottom);
  ctx.closePath();
}

function silhouette(ox, oy) {
  ctx.beginPath();
  pathStem(ox, oy);
  for (const fold of folds) pathFold(fold, ox, oy);
}

function drawFolds() {
  ctx.clearRect(0, 0, S, S);

  const depth = Number(getTool('depth')) * S;
  const steps = Math.max(1, Math.round(Number(getTool('steps'))));
  const dx = Math.cos(-2.3);
  const dy = Math.sin(-2.3);

  // Выдавливание: один и тот же силуэт много раз со сдвигом к точке схода.
  ctx.fillStyle = '#1c0503';
  for (let k = steps; k >= 1; k -= 1) {
    const t = (k / steps) * depth;
    silhouette(dx * t, dy * t);
    ctx.fill('nonzero');
  }

  ctx.fillStyle = `rgb(${RED.join(',')})`;
  silhouette(0, 0);
  ctx.fill('nonzero');

  if (getTool('frame')) {
    ctx.strokeStyle = 'rgba(0,120,220,.9)';
    ctx.lineWidth = 1;
    for (const fold of folds) {
      const base = foldBase(fold);
      ctx.beginPath();
      ctx.arc(base.x + Math.cos(fold.ang) * fold.len, base.y + Math.sin(fold.ang) * fold.len, fold.rad, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function foldAt(x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const fold of folds) {
    const base = foldBase(fold);
    const cx = base.x + Math.cos(fold.ang) * fold.len;
    const cy = base.y + Math.sin(fold.ang) * fold.len;
    const d = Math.hypot(x - cx, y - cy);
    if (d < Math.max(fold.rad, S * 0.04) && d < bestDist) { bestDist = d; best = fold; }
  }
  return best;
}

const FOLD_POINTER = {
  down(p) {
    foldDrag = foldAt(p.x, p.y);
    return Boolean(foldDrag);
  },
  move(p) {
    if (!foldDrag) return;
    const base = foldBase(foldDrag);
    foldDrag.ang = Math.atan2(p.y - base.y, p.x - base.x);
    foldDrag.len = Math.max(foldDrag.rad * 1.3, Math.hypot(p.x - base.x, p.y - base.y));
    foldDrag.vAng = 0;
    foldDrag.vLen = 0;
  },
  up() { foldDrag = null; },
};


/* ---------- ремень по шкивам ---------- */

// Одна непрерывная лента, натянутая по цепочке окружностей: крупная на носу
// капли, маленькая у основания. Направление обхода чередуется, поэтому между
// соседними кругами идут перекрёстные касательные.
const lobes = [];
let beltDrag = null;

function beltOrigin() {
  return { x: S * 0.2, y: S * 0.74 };
}

function buildBelt() {
  lobes.length = 0;
  const count = Math.round(Number(getTool('lobes')));
  const nose = Number(getTool('nose'));
  const root = Number(getTool('root'));

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    const ang = -1.42 + t * 1.62;
    const len = S * (0.5 - 0.13 * t) * (0.85 + 0.3 * Math.random());
    const tipR = S * nose * (1 - 0.55 * t) * (0.8 + 0.4 * Math.random());
    lobes.push({
      ang,
      len,
      tipR,
      rootR: S * root * (0.6 + 0.8 * (1 - t)),
      rootAng: -1.5 + t * 1.7,
      restAng: ang,
      restLen: len,
      vAng: 0,
      vLen: 0,
    });
  }
}

// Цепочка кругов: основание, нос, основание, нос... Знак — сторона обхвата.
function beltCircles() {
  const o = beltOrigin();
  const spread = S * Number(getTool('spread'));
  const list = [];
  for (const lobe of lobes) {
    list.push({
      x: o.x + Math.cos(lobe.rootAng) * spread,
      y: o.y + Math.sin(lobe.rootAng) * spread,
      r: lobe.rootR,
      s: -1,
      lobe,
      root: true,
    });
    list.push({
      x: o.x + Math.cos(lobe.ang) * lobe.len,
      y: o.y + Math.sin(lobe.ang) * lobe.len,
      r: lobe.tipR,
      s: 1,
      lobe,
    });
  }
  return list;
}

// Общая касательная двух шкивов с учётом стороны обхвата.
function tangent(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const D = Math.hypot(dx, dy);
  const k = a.s * a.r - b.s * b.r;
  const disc = D * D - k * k;
  if (D < 1e-6 || disc < 0) return null;
  const root = Math.sqrt(disc);
  const nx = (k * dx - root * dy) / (D * D);
  const ny = (k * dy + root * dx) / (D * D);
  return {
    from: { x: a.x + a.s * a.r * nx, y: a.y + a.s * a.r * ny },
    to: { x: b.x + b.s * b.r * nx, y: b.y + b.s * b.r * ny },
  };
}

function beltPath(ox, oy) {
  const circles = beltCircles();
  const legs = [];
  for (let i = 0; i < circles.length - 1; i += 1) {
    const leg = tangent(circles[i], circles[i + 1]);
    if (!leg) return null;
    legs.push(leg);
  }

  // Дуги считаются вручную: сторона обхвата задаётся знаком круга,
  // а не флагом canvas — иначе ремень перехлёстывается.
  const pts = [];
  for (let i = 0; i < legs.length; i += 1) {
    pts.push(legs[i].from);
    pts.push(legs[i].to);
    const next = legs[i + 1];
    if (!next) break;
    const c = circles[i + 1];
    const dir = c.s > 0 ? -1 : 1;
    const a1 = Math.atan2(legs[i].to.y - c.y, legs[i].to.x - c.x);
    const a2 = Math.atan2(next.from.y - c.y, next.from.x - c.x);
    let sweep = (a2 - a1) * dir;
    while (sweep < 0) sweep += Math.PI * 2;
    const steps = Math.max(3, Math.ceil((sweep / (Math.PI * 2)) * 48));
    for (let k = 1; k < steps; k += 1) {
      const a = a1 + dir * sweep * (k / steps);
      pts.push({ x: c.x + Math.cos(a) * c.r, y: c.y + Math.sin(a) * c.r });
    }
  }

  const tail = S * 0.14;
  const first = pts[0];
  const last = pts[pts.length - 1];

  ctx.beginPath();
  ctx.moveTo(first.x - tail + ox, first.y + tail * 0.35 + oy);
  for (const p of pts) ctx.lineTo(p.x + ox, p.y + oy);
  ctx.lineTo(last.x + tail * 0.2 + ox, last.y + tail * 0.5 + oy);
  return true;
}

function stepBelt() {
  const spring = Number(getTool('spring'));
  for (const lobe of lobes) {
    if (lobe === beltDrag) continue;
    lobe.vLen += (lobe.restLen - lobe.len) * spring;
    lobe.vLen *= 0.86;
    lobe.len += lobe.vLen;
    lobe.vAng += (lobe.restAng - lobe.ang) * spring;
    lobe.vAng *= 0.86;
    lobe.ang += lobe.vAng;
  }
}

function drawBelt() {
  ctx.clearRect(0, 0, S, S);

  const depth = Number(getTool('depth')) * S;
  const steps = Math.max(1, Math.round(Number(getTool('steps'))));
  const dx = Math.cos(-2.3);
  const dy = Math.sin(-2.3);

  if (!getTool('outline')) {
    ctx.fillStyle = '#1c0503';
    for (let k = steps; k >= 1; k -= 1) {
      const t = (k / steps) * depth;
      if (beltPath(dx * t, dy * t)) ctx.fill('nonzero');
    }
  }

  if (beltPath(0, 0)) {
    if (getTool('outline')) {
      ctx.strokeStyle = '#161616';
      ctx.lineWidth = S * 0.008;
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgb(${RED.join(',')})`;
      ctx.fill('nonzero');
    }
  }

  if (getTool('frame')) {
    ctx.strokeStyle = 'rgba(0,150,230,.9)';
    ctx.lineWidth = 1;
    for (const c of beltCircles()) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

const BELT_POINTER = {
  down(p) {
    const o = beltOrigin();
    beltDrag = null;
    let bestDist = Infinity;
    for (const lobe of lobes) {
      const cx = o.x + Math.cos(lobe.ang) * lobe.len;
      const cy = o.y + Math.sin(lobe.ang) * lobe.len;
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < Math.max(lobe.tipR, S * 0.05) && d < bestDist) { bestDist = d; beltDrag = lobe; }
    }
    return Boolean(beltDrag);
  },
  move(p) {
    if (!beltDrag) return;
    const o = beltOrigin();
    beltDrag.ang = Math.atan2(p.y - o.y, p.x - o.x);
    beltDrag.len = Math.max(beltDrag.tipR * 1.4, Math.hypot(p.x - o.x, p.y - o.y));
    beltDrag.vAng = 0;
    beltDrag.vLen = 0;
  },
  up() { beltDrag = null; },
};


/* ---------- резинка на окружностях ---------- */

// Замкнутая нитка стягивается сама, а окружности ей мешают: она их обтекает
// и садится по касательным и дугам сама, без всякой геометрии.
const ring = [];
const pegs = [];
let ringDrag = null;
let selectedPeg = null;

const SCENE_KEY = 'alphabet-v-scene';

// Сохранять приходится и нитку тоже: по одним кругам не восстановить, что
// оказалось внутри петли, а что снаружи — это след порядка их появления.
function sceneToJSON() {
  const n = (v) => Number((v / S).toFixed(4));
  const stride = Math.max(1, Math.round(ring.length / 140));
  const path = [];
  for (let i = 0; i < ring.length; i += stride) path.push([n(ring[i].x), n(ring[i].y)]);
  return JSON.stringify({
    pegs: pegs.map((p) => [n(p.x), n(p.y), n(p.target ?? p.r)]),
    ring: path,
  });
}

// Собрать форму в центр кадра вместе с окружностями.
function centerScene() {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const dx = S / 2 - (minX + maxX) / 2;
  const dy = S / 2 - (minY + maxY) / 2;
  for (const p of ring) { p.x += dx; p.y += dy; p.px += dx; p.py += dy; }
  for (const peg of pegs) {
    peg.x = snap(peg.x + dx);
    peg.y = snap(peg.y + dy);
    peg.tx = peg.x;
    peg.ty = peg.y;
  }
}

// Поставить окружности левого края на одну вертикаль.
function alignLeft() {
  const sorted = [...pegs].sort((a, b) => a.x - b.x);
  const group = sorted.filter((p) => p.x - sorted[0].x < S * 0.08);
  if (group.length < 2) return;
  const x = group.reduce((sum, p) => sum + p.x, 0) / group.length;
  for (const peg of group) { peg.x = snap(x); peg.tx = peg.x; peg.ty = peg.y; }
}

function saveScene(quiet) {
  const json = sceneToJSON();
  localStorage.setItem(SCENE_KEY, json);
  if (quiet) return;
  navigator.clipboard?.writeText(json).catch(() => {});
  console.log(json);
  note.textContent = 'сцена сохранена: она подхватится при следующем запуске, а JSON лежит в буфере и в консоли';
}

function forgetScene() {
  localStorage.removeItem(SCENE_KEY);
  pegs.length = 0;
  setMode(current);
}

function loadScene() {
  const raw = localStorage.getItem(SCENE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function buildThread() {
  if (toolInputs.radius) toolInputs.radius.disabled = !selectedPeg;
  ring.length = 0;
  const saved = loadScene();

  if (saved) {
    pegs.length = 0;
    for (const [x, y, r] of saved.pegs) pegs.push({ x: x * S, y: y * S, tx: x * S, ty: y * S, r: r * S, target: r * S });
    // Нитка восстанавливается по сохранённому контуру и лишь дотягивается —
    // порядок появления кругов воспроизводить не нужно.
    const dense = Math.round(Number(getTool('nodes')));
    for (let i = 0; i < dense; i += 1) {
      const t = (i / dense) * saved.ring.length;
      const a = saved.ring[Math.floor(t) % saved.ring.length];
      const b = saved.ring[(Math.floor(t) + 1) % saved.ring.length];
      const k = t - Math.floor(t);
      const x = (a[0] + (b[0] - a[0]) * k) * S;
      const y = (a[1] + (b[1] - a[1]) * k) * S;
      ring.push({ x, y, px: x, py: y });
    }
    return;
  }

  const n = Math.round(Number(getTool('nodes')));
  const r = S * 0.36;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const x = S * 0.5 + Math.cos(a) * r;
    const y = S * 0.5 + Math.sin(a) * r * 1.15;
    ring.push({ x, y, px: x, py: y });
  }
  if (!pegs.length) {
    pegs.push({ x: S * 0.44, y: S * 0.34, r: S * 0.13, target: S * 0.13 });
    pegs.push({ x: S * 0.56, y: S * 0.66, r: S * 0.13, target: S * 0.13 });
  }
}

function stepThread() {
  // Радиус подтягивается к заданному плавно: рывком окружность выворачивает петлю наружу.
  for (const peg of pegs) {
    if (peg.target === undefined) peg.target = peg.r;
    peg.r += (peg.target - peg.r) * 0.12;

    // За кадр окружность проходит не больше своего радиуса, иначе она
    // перескакивает нитку целиком и столкновению нечего ловить.
    if (peg.tx === undefined) continue;
    const dx = peg.tx - peg.x;
    const dy = peg.ty - peg.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.01) { peg.x = peg.tx; peg.y = peg.ty; continue; }
    const limit = Math.max(1.5, peg.r * 0.5);
    const move = Math.min(dist, limit);
    peg.x += (dx / dist) * move;
    peg.y += (dy / dist) * move;
  }

  const tension = Number(getTool('tension'));
  const gravity = Number(getTool('weight')) * 0.04;
  const damp = 0.94;

  for (const p of ring) {
    if (p === ringDrag) { p.px = p.x; p.py = p.y; continue; }
    const vx = (p.x - p.px) * damp;
    const vy = (p.y - p.py) * damp;
    p.px = p.x;
    p.py = p.y;
    p.x += vx;
    p.y += vy + gravity;
  }

  // Нитка стремится укоротиться: длина звена всегда чуть меньше текущей.
  // Сокращение нормировано по плотности узлов — иначе при частых узлах
  // звено короткое, и в пикселях натяжение слабеет обратно пропорционально.
  const pull = tension * 0.06 * (ring.length / 260);
  for (let iter = 0; iter < 14; iter += 1) {
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1e-6;
      const rest = dist * (1 - pull);
      const diff = ((dist - rest) / dist) * 0.5;
      const aFree = a === ringDrag ? 0 : 1;
      const bFree = b === ringDrag ? 0 : 1;
      const total = aFree + bFree || 1;
      a.x += dx * diff * (2 * aFree) / total;
      a.y += dy * diff * (2 * aFree) / total;
      b.x -= dx * diff * (2 * bFree) / total;
      b.y -= dy * diff * (2 * bFree) / total;
    }

    // Окружности не пускают нитку внутрь — отсюда берутся дуги обхвата.
    // Проверяется весь отрезок, иначе мелкий круг проскакивает между узлами.
    for (const peg of pegs) {
      for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const lenSq = ex * ex + ey * ey || 1e-6;
        let t = ((peg.x - a.x) * ex + (peg.y - a.y) * ey) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const cx = a.x + ex * t;
        const cy = a.y + ey * t;
        let dx = cx - peg.x;
        let dy = cy - peg.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= peg.r) continue;
        if (dist < 1e-6) { dx = 0; dy = -1; dist = 1e-6; }
        const push = peg.r - dist;
        const nx = (dx / dist) * push;
        const ny = (dy / dist) * push;
        a.x += nx * (1 - t);
        a.y += ny * (1 - t);
        b.x += nx * t;
        b.y += ny * t;
      }
    }
  }
}

// Круг внутри петли принимает цвет формы, снаружи — цвет холста.
function insideLoop(x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if ((a.y > y) === (b.y > y)) continue;
    if (x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function drawThread() {
  ctx.fillStyle = CANVAS_BLUE;
  ctx.fillRect(0, 0, S, S);

  // Кривые через середины звеньев: по ломаной были видны грани на поворотах.
  const loop = () => {
    const n = ring.length;
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    ctx.beginPath();
    const start = mid(ring[n - 1], ring[0]);
    ctx.moveTo(start.x, start.y);
    for (let i = 0; i < n; i += 1) {
      const p = ring[i];
      const m = mid(p, ring[(i + 1) % n]);
      ctx.quadraticCurveTo(p.x, p.y, m.x, m.y);
    }
    ctx.closePath();
  };

  if (getTool('fill')) {
    loop();
    ctx.fillStyle = FORM_WHITE;
    ctx.fill();
  }

  const filled = getTool('fill');
  for (const peg of pegs) {
    ctx.fillStyle = filled && insideLoop(peg.x, peg.y) ? FORM_WHITE : CANVAS_BLUE;
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, peg.r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (getTool('stroke')) {
    loop();
    ctx.strokeStyle = FORM_WHITE;
    ctx.lineWidth = S * 0.014;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  if (getTool('frame')) {
    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 1;
    for (const peg of pegs) {
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, peg.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Обводку получает только выделенная — остальные растворяются в фоне.
  if (selectedPeg) {
    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(selectedPeg.x, selectedPeg.y, selectedPeg.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// Ползунок радиуса всегда показывает выделенную окружность.
function selectPeg(peg) {
  selectedPeg = peg;
  if (peg) setTool('radius', Number(((peg.target ?? peg.r) / S).toFixed(3)));
  // Без выделения крутить радиус нечему.
  if (toolInputs.radius) toolInputs.radius.disabled = !peg;
}

function removePeg(peg) {
  const i = pegs.indexOf(peg);
  if (i < 0) return;
  pegs.splice(i, 1);
  if (selectedPeg === peg) selectPeg(null);
  saveScene(true);
}

function applyRadius() {
  if (!selectedPeg) return;
  selectedPeg.target = S * Number(getTool('radius'));
  saveScene(true);
}

// Невидимая сетка: шаг задаётся ползунком и по умолчанию равен радиусу малого круга.
function snap(value) {
  const step = S * Number(getTool('grid'));
  if (!(step > 0)) return value;
  return Math.round(value / step) * step;
}

function pegAt(p) {
  for (let i = pegs.length - 1; i >= 0; i -= 1) {
    if (Math.hypot(p.x - pegs[i].x, p.y - pegs[i].y) <= pegs[i].r) return pegs[i];
  }
  return null;
}

const THREAD_POINTER = {
  down(p) {
    const peg = pegAt(p);
    if (peg) {
      ringDrag = null;
      THREAD_POINTER.peg = peg;
      selectPeg(peg);
      return true;
    }
    let best = null;
    let bestDist = S * 0.05;
    for (const point of ring) {
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d < bestDist) { bestDist = d; best = point; }
    }
    ringDrag = best;
    if (!best) selectPeg(null);
    return Boolean(best);
  },
  move(p) {
    if (THREAD_POINTER.peg) {
      THREAD_POINTER.peg.tx = p.x;
      THREAD_POINTER.peg.ty = p.y;
      return;
    }
    if (!ringDrag) return;
    ringDrag.x = p.x;
    ringDrag.y = p.y;
  },
  up() {
    const peg = THREAD_POINTER.peg;
    if (peg && peg.tx !== undefined) {
      peg.tx = snap(peg.tx);
      peg.ty = snap(peg.ty);
    }
    if (peg || ringDrag) saveScene(true);
    ringDrag = null;
    THREAD_POINTER.peg = null;
  },
  // Двойной клик ставит новую окружность или убирает ту, по которой попали.
  double(p) {
    const peg = pegAt(p);
    if (peg) { removePeg(peg); return; }
    const size = S * Number(getTool('radius'));
    const fresh = { x: snap(p.x), y: snap(p.y), tx: snap(p.x), ty: snap(p.y), r: size * 0.2, target: size };
    pegs.push(fresh);
    selectPeg(fresh);
    saveScene(true);
  },
};

/* ---------- режимы ---------- */

const MODES = {
  thread: {
    label: 'резинка',
    note: 'замкнутая нитка стягивается и обтекает окружности; 2× клик — поставить или убрать окружность, круги и нитку можно таскать',
    build: buildThread,
    step: stepThread,
    draw: drawThread,
    pointer: THREAD_POINTER,
    tools: [
      { key: 'tension', label: 'натяжение', min: 0.05, max: 1.5, step: 0.05, value: 0.5 },
      { key: 'grid', label: 'шаг сетки', min: 0, max: 0.08, step: 0.002, value: 0.02 },
      { key: 'radius', label: 'радиус выделенной', min: 0.02, max: 0.3, step: 0.005, value: 0.13, live: applyRadius },
      { type: 'button', label: 'удалить выделенную', action: () => removePeg(selectedPeg) },
      { key: 'weight', label: 'тяжесть', min: 0, max: 2, step: 0.05, value: 0 },
      { key: 'nodes', label: 'узлов', min: 120, max: 900, step: 20, value: 300, rebuild: true },
      { type: 'toggle', key: 'fill', label: 'залить форму', value: true },
      { type: 'toggle', key: 'stroke', label: 'контур', value: false },
      { type: 'button', label: 'выровнять слева', action: () => alignLeft() },
      { type: 'button', label: 'центрировать', action: () => centerScene() },
      { type: 'button', label: 'сохранить сцену', action: () => saveScene() },
      { type: 'button', label: 'забыть сцену', action: () => forgetScene() },
    ],
  },

  belt: {
    label: 'ремень',
    note: 'одна непрерывная лента по цепочке окружностей: крупная на носу капли, маленькая внутри основания',
    build: buildBelt,
    step: stepBelt,
    draw: drawBelt,
    pointer: BELT_POINTER,
    tools: [
      { key: 'lobes', label: 'капель', min: 2, max: 9, step: 1, value: 5, rebuild: true },
      { key: 'nose', label: 'нос', min: 0.03, max: 0.2, step: 0.005, value: 0.11, rebuild: true },
      { key: 'root', label: 'основание', min: 0.004, max: 0.06, step: 0.002, value: 0.022, rebuild: true },
      { key: 'spread', label: 'разброс оснований', min: 0, max: 0.12, step: 0.002, value: 0.03 },
      { key: 'spring', label: 'упругость', min: 0.02, max: 0.4, step: 0.01, value: 0.12 },
      { key: 'depth', label: 'глубина', min: 0, max: 0.6, step: 0.01, value: 0.18 },
      { key: 'steps', label: 'слоёв', min: 4, max: 160, step: 1, value: 80 },
      { type: 'toggle', key: 'outline', label: 'только контур', value: false },
    ],
  },

  folds: {
    label: 'складки',
    note: 'складка — касательная оболочка вокруг спрятанной окружности; тяни за нос складки, длина перетекает между соседями',
    build: buildFolds,
    step: stepFolds,
    draw: drawFolds,
    pointer: FOLD_POINTER,
    tools: [
      { key: 'loop', label: 'петли', min: 0.15, max: 0.5, step: 0.01, value: 0.34, rebuild: true },
      { key: 'small', label: 'мелких складок', min: 0, max: 12, step: 1, value: 5, rebuild: true },
      { key: 'stem', label: 'стойка', min: 0.02, max: 0.2, step: 0.005, value: 0.08 },
      { key: 'spring', label: 'упругость', min: 0.02, max: 0.4, step: 0.01, value: 0.12 },
      { key: 'depth', label: 'глубина', min: 0, max: 0.6, step: 0.01, value: 0.16 },
      { key: 'steps', label: 'слоёв', min: 4, max: 160, step: 1, value: 80 },
    ],
  },

  letter: {
    label: 'буква В',
    note: 'лента идёт вниз натянутой стойкой, а обратно наверх — двумя петлями с излишком длины',
    pinCount: 4,
    tools: [
      { key: 'slack', label: 'излишек длины', min: 1, max: 2.6, step: 0.02, value: 1.7, rebuild: true },
      { key: 'width', label: 'ширина ленты', min: 0.02, max: 0.22, step: 0.005, value: 0.09 },
      { key: 'bend', label: 'жёсткость', min: 0, max: 0.5, step: 0.01, value: 0.16 },
      { key: 'gravity', label: 'тяжесть', min: 0, max: 3, step: 0.05, value: 0.2 },
      { key: 'blow', label: 'раздув вбок', min: 0, max: 3, step: 0.05, value: 0.9 },
    ],
  },

  pins: {
    label: 'прижимы',
    note: 'три прижима держат ленту; излишек длины между ними вспучивается двумя петлями — это и есть В',
    pinCount: 3,
    tools: [
      { key: 'slack', label: 'излишек длины', min: 1, max: 3, step: 0.02, value: 1.7, rebuild: true },
      { key: 'width', label: 'ширина ленты', min: 0.02, max: 0.22, step: 0.005, value: 0.1 },
      { key: 'bend', label: 'жёсткость', min: 0, max: 0.5, step: 0.01, value: 0.14 },
      { key: 'gravity', label: 'тяжесть', min: 0, max: 3, step: 0.05, value: 0.35 },
      { key: 'blow', label: 'раздув вбок', min: 0, max: 3, step: 0.05, value: 1 },
    ],
  },
  ends: {
    label: 'только концы',
    note: 'закреплены лишь два конца: складки садятся где придётся, букву приходится ловить',
    pinCount: 2,
    tools: [
      { key: 'slack', label: 'излишек длины', min: 1, max: 3, step: 0.02, value: 2.1, rebuild: true },
      { key: 'width', label: 'ширина ленты', min: 0.02, max: 0.22, step: 0.005, value: 0.1 },
      { key: 'bend', label: 'жёсткость', min: 0, max: 0.5, step: 0.01, value: 0.18 },
      { key: 'gravity', label: 'тяжесть', min: 0, max: 3, step: 0.05, value: 1 },
      { key: 'blow', label: 'раздув вбок', min: 0, max: 3, step: 0.05, value: 0.5 },
    ],
  },
  memory: {
    label: 'память складок',
    note: 'лента помнит свои сгибы: расправляешь — она сопротивляется и складывается обратно',
    pinCount: 3,
    tools: [
      { key: 'slack', label: 'излишек длины', min: 1, max: 3, step: 0.02, value: 1.7, rebuild: true },
      { key: 'width', label: 'ширина ленты', min: 0.02, max: 0.22, step: 0.005, value: 0.1 },
      { key: 'bend', label: 'память', min: 0, max: 0.5, step: 0.01, value: 0.3 },
      { key: 'gravity', label: 'тяжесть', min: 0, max: 3, step: 0.05, value: 0.4 },
      { key: 'blow', label: 'раздув вбок', min: 0, max: 3, step: 0.05, value: 0.8 },
      { type: 'button', label: 'запомнить позу', action: () => rememberCurve() },
    ],
  },
};

const COMMON = [
  { key: 'points', label: 'сегментов', min: 60, max: 260, step: 2, value: 140, rebuild: true },
  { type: 'toggle', key: 'frame', label: 'каркас', value: true },
  { type: 'button', label: 'заново', action: () => restartMode() },
];

function renderTools(mode) {
  toolsBar.innerHTML = '';
  for (const tool of [...mode.tools, ...COMMON]) {
    const value = tool.key && tool.key in toolValues ? toolValues[tool.key] : tool.value;
    if (tool.type === 'button') {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tool.label;
      button.addEventListener('click', tool.action);
      toolsBar.append(button);
      continue;
    }
    if (tool.type === 'toggle') {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tool.label;
      toolValues[tool.key] = value;
      button.setAttribute('aria-pressed', String(value));
      button.addEventListener('click', () => {
        toolValues[tool.key] = !toolValues[tool.key];
        button.setAttribute('aria-pressed', String(toolValues[tool.key]));
      });
      toolsBar.append(button);
      continue;
    }
    const label = document.createElement('label');
    label.textContent = tool.label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = tool.min;
    input.max = tool.max;
    input.step = tool.step;
    input.value = value;
    toolValues[tool.key] = value;
    toolInputs[tool.key] = input;
    input.addEventListener('input', () => {
      toolValues[tool.key] = Number(input.value);
      if (tool.live) tool.live();
    });
    if (tool.rebuild) {
      input.addEventListener('change', () => {
        const m = MODES[current];
        if (m.build) m.build();
        else build(m.pinCount);
      });
    }
    label.append(input);
    toolsBar.append(label);
  }
}

// Перезапуск не должен стирать расстановку: она сохраняется и подхватывается заново.
function restartMode() {
  if (current === 'thread') saveScene(true);
  setMode(current);
}

function setMode(name) {
  current = name;
  const mode = MODES[name];
  renderTools(mode);
  if (mode.build) mode.build();
  else build(mode.pinCount);
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

function scenePoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

canvas.addEventListener('pointerdown', (event) => {
  const p = scenePoint(event);
  const pointer = MODES[current].pointer;
  if (pointer) {
    if (pointer.down(p)) canvas.setPointerCapture(event.pointerId);
    return;
  }
  // Прижим перетаскивается целиком, лента — за ближайшую точку.
  for (const pin of pins) {
    if (Math.hypot(p.x - pin.x, p.y - pin.y) < S * 0.035) {
      drag = { pin };
      canvas.setPointerCapture(event.pointerId);
      return;
    }
  }
  let best = null;
  let bestDist = S * 0.06;
  for (const point of points) {
    const d = Math.hypot(p.x - point.x, p.y - point.y);
    if (d < bestDist) { bestDist = d; best = point; }
  }
  if (!best) return;
  drag = { point: best };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  const p = scenePoint(event);
  const pointer = MODES[current].pointer;
  if (pointer) { pointer.move(p); return; }
  canvas.style.cursor = drag ? 'grabbing' : 'grab';
  if (!drag) return;
  if (drag.pin) {
    drag.pin.x = p.x;
    drag.pin.y = p.y;
    return;
  }
  drag.point.x = p.x;
  drag.point.y = p.y;
  drag.point.px = p.x;
  drag.point.py = p.y;
});

canvas.addEventListener('dblclick', (event) => {
  const pointer = MODES[current].pointer;
  if (pointer && pointer.double) pointer.double(scenePoint(event));
});

function endDrag() {
  const pointer = MODES[current] && MODES[current].pointer;
  if (pointer) pointer.up();
  drag = null;
  canvas.style.cursor = 'grab';
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

window.addEventListener('keydown', (event) => {
  if (event.target.closest('input')) return;
  if (event.key === 'Delete' || event.key === 'Backspace') removePeg(selectedPeg);
  if (!selectedPeg) return;
  const stepSize = S * 0.008;
  const target = selectedPeg.target ?? selectedPeg.r;
  if (event.key === '[' || event.key === 'х') selectPeg(Object.assign(selectedPeg, { target: Math.max(S * 0.02, target - stepSize) }));
  if (event.key === ']' || event.key === 'ъ') selectPeg(Object.assign(selectedPeg, { target: Math.min(S * 0.3, target + stepSize) }));
});

function frame() {
  const mode = MODES[current];
  if (mode.step) mode.step();
  else step();
  if (mode.draw) mode.draw();
  else draw();
  requestAnimationFrame(frame);
}

new ResizeObserver(resize).observe(canvas);
resize();
setMode('thread');
requestAnimationFrame(frame);
