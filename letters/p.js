// П — линия из шариков. Тянешь штрих, он подгоняется настоящей кривой Безье
// минимальным числом опорных точек (алгоритм Шнайдера: допуск считается от
// кривой, а не от хорды — прямая ужимается в две точки, дуга берёт ровно
// столько сегментов, сколько нужно её изгибу). Шарики с этими точками не
// связаны: они рассажены по всей длине кривой равномерно и растут волной от
// начала штриха к концу, будто рисуются на глазах. Расталкивают друг друга,
// но каждый держится невидимой резинкой у своего места на кривой — двигаешь
// опорную точку, и шарики на участке плавно едут следом. Сцена открывается
// уже нарисованной: три штриха буквы — готовый набор кубических Безье,
// перенесённый как есть из векторного наброска.

const INK = '#f1ede5';
const BG = '#161616';
const RED = '#e0210f';

function inkA(a) { return `rgba(241, 237, 229, ${a})`; }
function bgA(a) { return `rgba(22, 22, 22, ${a})`; }

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const DEFAULTS = {
  radius: 0.026,
  contrast: 0.25,
  spring: 0.25,
  volume: true,
  move: false,
};

// Настроены в полигоне (lab/p-lab.js) и здесь не крутятся — панель сайта
// оставляет только то, что заметно меняет характер рисунка на глаз.
const FIT_TOLERANCE = 0.035;
const DELAY = 0.12;
const GROWTH = 0.35;
const WAVE = 0.6;

const BALLOON_MAX = 600;
const BALLOON_ITERATIONS = 4;
const HIT_RADIUS = 0.03;
const RAW_STEP = 0.006;
const ANCHOR_MARK = 0.008;
const HISTORY_LIMIT = 20;

const CONTROLS = [
  { key: 'radius', label: 'радиус', min: 0.012, max: 0.05, step: 0.002 },
  { key: 'contrast', label: 'контраст', min: 0, max: 0.6, step: 0.02 },
  { key: 'spring', label: 'резинка', min: 0.05, max: 0.6, step: 0.01 },
];

const SWITCHES = [
  { key: 'volume', label: 'объём' },
  { key: 'move', label: 'двигать контур' },
];

/* ---- вектор и кривые Безье (без ушей руками — только через подгонку) ---- */

function bzSub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function bzAdd(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
function bzScale(a, s) { return { x: a.x * s, y: a.y * s }; }
function bzLen(a) { return Math.hypot(a.x, a.y); }
function bzNorm(a) { const l = bzLen(a); return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 }; }
function bzDot(a, b) { return a.x * b.x + a.y * b.y; }

function bzPoint(seg, t) {
  const mt = 1 - t, a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return {
    x: a * seg[0].x + b * seg[1].x + c * seg[2].x + d * seg[3].x,
    y: a * seg[0].y + b * seg[1].y + c * seg[2].y + d * seg[3].y,
  };
}

function bzChordParams(points) {
  const u = [0];
  for (let i = 1; i < points.length; i++) u.push(u[i - 1] + bzLen(bzSub(points[i], points[i - 1])));
  const total = u[u.length - 1] || 1;
  return u.map((v) => v / total);
}

function bzGenerate(points, u, t1, t2) {
  const p0 = points[0], p3 = points[points.length - 1];
  const A = u.map((ui) => [bzScale(t1, 3 * (1 - ui) * (1 - ui) * ui), bzScale(t2, 3 * (1 - ui) * ui * ui)]);
  const C = [[0, 0], [0, 0]], X = [0, 0];
  for (let i = 0; i < points.length; i++) {
    const ui = u[i], b0 = (1 - ui) ** 3, b3 = ui ** 3;
    const tmp = bzSub(points[i], bzAdd(bzScale(p0, b0), bzScale(p3, b3)));
    C[0][0] += bzDot(A[i][0], A[i][0]);
    C[0][1] += bzDot(A[i][0], A[i][1]);
    C[1][0] = C[0][1];
    C[1][1] += bzDot(A[i][1], A[i][1]);
    X[0] += bzDot(A[i][0], tmp);
    X[1] += bzDot(A[i][1], tmp);
  }
  const detC0C1 = C[0][0] * C[1][1] - C[1][0] * C[0][1];
  const detC0X = C[0][0] * X[1] - C[1][0] * X[0];
  const detXC1 = X[0] * C[1][1] - X[1] * C[0][1];
  let alpha1 = detC0C1 === 0 ? 0 : detXC1 / detC0C1;
  let alpha2 = detC0C1 === 0 ? 0 : detC0X / detC0C1;
  const segLen = bzLen(bzSub(p0, p3));
  const eps = 1e-6 * segLen;
  /* На спирали (и вообще при почти параллельных касательных на стыке) матрица
     C почти вырождена — alpha улетает в тысячи раз больше длины хорды, кривая
     дичает петлёй в никуда. Подстраховка нужна и от слишком короткого, и от
     неправдоподобно длинного решения. */
  const maxAlpha = segLen * 4;
  const bad = !(alpha1 > eps) || !(alpha2 > eps) || !isFinite(alpha1) || !isFinite(alpha2)
    || alpha1 > maxAlpha || alpha2 > maxAlpha;
  if (bad) {
    const dist = segLen / 3;
    alpha1 = dist; alpha2 = dist;
  }
  return [p0, bzAdd(p0, bzScale(t1, alpha1)), bzAdd(p3, bzScale(t2, alpha2)), p3];
}

function bzMaxError(points, seg, u) {
  let maxDist = 0, splitPoint = Math.floor(points.length / 2);
  for (let i = 0; i < points.length; i++) {
    const d = bzLen(bzSub(bzPoint(seg, u[i]), points[i]));
    if (d > maxDist) { maxDist = d; splitPoint = i; }
  }
  return [maxDist, splitPoint];
}

function bzReparameterize(seg, points, u) {
  return u.map((ui, i) => {
    const p = points[i];
    const q = bzPoint(seg, ui);
    const mt = 1 - ui;
    const d1 = {
      x: 3 * mt * mt * (seg[1].x - seg[0].x) + 6 * mt * ui * (seg[2].x - seg[1].x) + 3 * ui * ui * (seg[3].x - seg[2].x),
      y: 3 * mt * mt * (seg[1].y - seg[0].y) + 6 * mt * ui * (seg[2].y - seg[1].y) + 3 * ui * ui * (seg[3].y - seg[2].y),
    };
    const d2 = {
      x: 6 * mt * (seg[2].x - 2 * seg[1].x + seg[0].x) + 6 * ui * (seg[3].x - 2 * seg[2].x + seg[1].x),
      y: 6 * mt * (seg[2].y - 2 * seg[1].y + seg[0].y) + 6 * ui * (seg[3].y - 2 * seg[2].y + seg[1].y),
    };
    const qp = bzSub(q, p);
    const denom = bzDot(d1, d1) + bzDot(qp, d2);
    if (denom === 0) return ui;
    return ui - bzDot(qp, d1) / denom;
  });
}

function bzFitCubic(points, t1, t2, error, depth) {
  if (points.length === 2 || depth > 22) {
    const dist = bzLen(bzSub(points[0], points[points.length - 1])) / 3;
    return [[points[0], bzAdd(points[0], bzScale(t1, dist)),
      bzAdd(points[points.length - 1], bzScale(t2, dist)), points[points.length - 1]]];
  }
  let u = bzChordParams(points);
  let seg = bzGenerate(points, u, t1, t2);
  let [maxErr, splitIdx] = bzMaxError(points, seg, u);
  if (maxErr < error) return [seg];
  if (maxErr < error * error) {
    for (let i = 0; i < 20; i++) {
      u = bzReparameterize(seg, points, u);
      seg = bzGenerate(points, u, t1, t2);
      [maxErr, splitIdx] = bzMaxError(points, seg, u);
      if (maxErr < error) return [seg];
    }
  }
  if (splitIdx <= 0 || splitIdx >= points.length - 1) return [seg];
  const centerTangent = bzNorm(bzSub(points[splitIdx - 1], points[splitIdx + 1]));
  const left = bzFitCubic(points.slice(0, splitIdx + 1), t1, centerTangent, error, depth + 1);
  const right = bzFitCubic(points.slice(splitIdx), bzScale(centerTangent, -1), t2, error, depth + 1);
  return left.concat(right);
}

function fitBezier(points, error) {
  if (points.length < 2) return [];
  const t1 = bzNorm(bzSub(points[1], points[0]));
  const t2 = bzNorm(bzSub(points[points.length - 2], points[points.length - 1]));
  return bzFitCubic(points, t1, t2, Math.max(error, 0.0015), 0);
}

/* Опорные точки — общие объекты на стыках сегментов (seg[i][3] === seg[i+1][0]),
   список без повторов получается склейкой первого p0 и всех p3. */
function curveAnchors(curve) {
  const anchors = [curve[0][0]];
  for (const seg of curve) anchors.push(seg[3]);
  return anchors;
}

/* Перемеряет кривую по длине и расставляет точки через равный отрезок дуги —
   независимо от того, где легли опорные точки после подгонки. */
function sampleCurve(curve, spacing) {
  const table = [{ segIdx: 0, t: 0, cum: 0 }];
  let cum = 0;
  for (let s = 0; s < curve.length; s++) {
    const seg = curve[s];
    const steps = 24;
    let prev = seg[0];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const pt = bzPoint(seg, t);
      cum += bzLen(bzSub(pt, prev));
      table.push({ segIdx: s, t, cum });
      prev = pt;
    }
  }
  const total = cum;
  if (total <= 0) return [{ segIdx: 0, t: 0 }];
  const samples = [];
  let target = 0, ti = 0;
  while (target <= total + 1e-6) {
    while (ti < table.length - 2 && table[ti + 1].cum < target) ti++;
    const a = table[ti], b = table[ti + 1];
    let segIdx = a.segIdx, t = a.t;
    if (b && b.segIdx === a.segIdx && b.cum > a.cum) {
      const frac = clamp((target - a.cum) / (b.cum - a.cum), 0, 1);
      t = a.t + (b.t - a.t) * frac;
    }
    samples.push({ segIdx, t });
    target += spacing;
  }
  return samples;
}

/* Затравка — три готовых кубических Безье буквы П, взятые как есть из
   векторного наброска (viewBox 718×718). Координаты сразу нормализованы в
   долю холста (0..1), поэтому масштабируются вместе со сценой без пересчёта. */
const SEED_VIEWBOX = 718;
const SEED_PATHS = [
  [
    [149.66, 430.38, 38.16, 504.38, 126.83, 648.11, 218.72, 585.85],
    [218.72, 585.85, 356.72, 492.35, 452.95, 244.5, 514.45, 81.5],
  ],
  [
    [251.55, 283.3, 137.05, 333.31, 27.18, 165.75, 171.37, 118.15],
    [171.37, 118.15, 293, 78, 508.65, 288.49, 637, 406.3],
  ],
  [
    [572.88, 609.05, 460.04, 589.67, 475.52, 483.07, 532.4, 332.64],
  ],
];

function seedCurve(coords) {
  const scale = 1 / SEED_VIEWBOX;
  let prevEnd = null;
  return coords.map((c) => {
    const p0 = prevEnd || { x: c[0] * scale, y: c[1] * scale };
    const c1 = { x: c[2] * scale, y: c[3] * scale };
    const c2 = { x: c[4] * scale, y: c[5] * scale };
    const p3 = { x: c[6] * scale, y: c[7] * scale };
    prevEnd = p3;
    return [p0, c1, c2, p3];
  });
}

export function mountP(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { ...DEFAULTS };

  let W = 1, H = 1, S = 1, ox = 0, oy = 0;
  let frameId = 0;
  let last = performance.now();
  let debt = 0;
  const STEP = 1 / 60;

  let balloons = [];
  let lines = [];
  let raw = null;
  let lastRaw = null;
  let dragPoint = null;
  let dragHandles = null;
  let activeLine = null;
  let moveLine = null;
  let history = [];

  const pointer = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, down: false, seen: false };

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

  function toScene(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left - ox) / S, y: (event.clientY - rect.top - oy) / S };
  }

  function spawn(x, y) {
    if (balloons.length >= BALLOON_MAX) return null;
    const b = {
      x, y, ax: x, ay: y, r: 0,
      birth: performance.now() / 1000,
      scale: 1 + (Math.random() * 2 - 1) * params.contrast,
    };
    balloons.push(b);
    return b;
  }

  /* Общий хвост для готовой кривой — что после подгонки штриха, что для
     затравки: заводит линию, рассаживает по ней шарики через равный шаг и
     запускает волну роста от начала к концу. */
  function spawnFromCurve(curve) {
    if (!curve.length) return null;
    const line = { curve, anchors: curveAnchors(curve) };
    lines.push(line);
    const spacing = Math.max(0.004, params.radius * 0.85);
    const slots = sampleCurve(curve, spacing);
    const now = performance.now() / 1000;
    slots.forEach((slot, i) => {
      const p = bzPoint(curve[slot.segIdx], slot.t);
      const b = spawn(p.x, p.y);
      if (!b) return;
      b.line = line; b.segIdx = slot.segIdx; b.t = slot.t;
      b.birth = now + (slots.length > 1 ? (i / (slots.length - 1)) * WAVE : 0);
    });
    return line;
  }

  function finalize(points) {
    const curve = fitBezier(points, FIT_TOLERANCE);
    spawnFromCurve(curve);
  }

  function loadSeed() {
    for (const coords of SEED_PATHS) spawnFromCurve(seedCurve(coords));
  }

  function findAnchor(x, y) {
    let best = null, bestLine = null, bestDist = HIT_RADIUS;
    for (const line of lines) {
      for (const a of line.anchors) {
        const d = Math.hypot(a.x - x, a.y - y);
        if (d < bestDist) { bestDist = d; best = a; bestLine = line; }
      }
    }
    return best ? { anchor: best, line: bestLine } : null;
  }

  /* Какую линию двигать целиком — именно ту, за шарик которой схватились
     (запасной вариант — по опорной точке, пока шарики ещё не выросли). */
  function findLine(x, y) {
    let best = null, bestDist = Infinity;
    for (const b of balloons) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d <= b.r && d < bestDist) { bestDist = d; best = b.line; }
    }
    if (best) return best;
    const hit = findAnchor(x, y);
    return hit ? hit.line : null;
  }

  function bringToFront(line) {
    const idx = lines.indexOf(line);
    if (idx >= 0 && idx !== lines.length - 1) {
      lines.splice(idx, 1);
      lines.push(line);
    }
    const own = [], other = [];
    for (const b of balloons) (b.line === line ? own : other).push(b);
    balloons = other.concat(own);
  }

  function cloneLine(line) {
    const seen = new Map();
    const clonePt = (p) => {
      if (!seen.has(p)) seen.set(p, { x: p.x, y: p.y });
      return seen.get(p);
    };
    return { curve: line.curve.map((seg) => seg.map(clonePt)), anchors: line.anchors.map(clonePt) };
  }

  function pushHistory() {
    const lineMap = new Map();
    const clonedLines = lines.map((line) => {
      const cloned = cloneLine(line);
      lineMap.set(line, cloned);
      return cloned;
    });
    const clonedBalls = balloons.map((b) => ({
      x: b.x, y: b.y, ax: b.ax, ay: b.ay, r: b.r, birth: b.birth, scale: b.scale,
      line: b.line ? lineMap.get(b.line) : null, segIdx: b.segIdx, t: b.t,
    }));
    history.push({ lines: clonedLines, balls: clonedBalls });
    if (history.length > HISTORY_LIMIT) history.shift();
  }

  function undo() {
    const snap = history.pop();
    if (!snap) return;
    lines = snap.lines;
    balloons = snap.balls;
    activeLine = null;
  }

  function reset() {
    pushHistory();
    balloons = [];
    lines = [];
    raw = null;
    lastRaw = null;
    dragPoint = null;
    dragHandles = null;
    activeLine = null;
    moveLine = null;
  }

  function step() {
    const now = performance.now() / 1000;
    const maxR = params.radius;
    const cursorR = maxR * 0.6;
    const poking = pointer.seen && !pointer.down && !dragPoint && !params.move;

    for (const b of balloons) {
      if (b.line) {
        const p = bzPoint(b.line.curve[b.segIdx], b.t);
        b.ax = p.x; b.ay = p.y;
      }
      const t = clamp((now - b.birth - DELAY) / GROWTH, 0, 1);
      const ease = t * t * (3 - 2 * t);
      b.r = maxR * b.scale * ease;
    }

    const n = balloons.length;
    for (let it = 0; it < BALLOON_ITERATIONS; it++) {
      for (let i = 0; i < n; i++) {
        const bi = balloons[i];
        for (let j = i + 1; j < n; j++) {
          const bj = balloons[j];
          let dx = bj.x - bi.x, dy = bj.y - bi.y;
          let dist = Math.hypot(dx, dy);
          const minDist = bi.r + bj.r;
          if (minDist <= 0 || dist >= minDist) continue;
          if (dist < 1e-4) { dx = 1; dy = 0; dist = 1e-4; }
          const push = (minDist - dist) * 0.5 / dist;
          bi.x -= dx * push; bi.y -= dy * push;
          bj.x += dx * push; bj.y += dy * push;
        }
      }
      if (poking) {
        for (const b of balloons) {
          let dx = b.x - pointer.x, dy = b.y - pointer.y;
          let dist = Math.hypot(dx, dy);
          const minDist = b.r + cursorR;
          if (dist >= minDist) continue;
          if (dist < 1e-4) { dx = 1; dy = 0; dist = 1e-4; }
          const push = (minDist - dist) / dist;
          b.x += dx * push; b.y += dy * push;
        }
      }
      for (const b of balloons) {
        b.x += (b.ax - b.x) * params.spring;
        b.y += (b.ay - b.y) * params.spring;
      }
    }
  }

  /* Радиальный градиент со смещённым бликом вместо ровной заливки — тень по
     краю получается просто снижением альфы: под ней тёмный фон проступает
     сильнее, это и читается как объём без отдельного цвета. */
  function fillFor(b) {
    const cx = ox + b.x * S, cy = oy + b.y * S, r = b.r * S;
    if (!params.volume) return INK;
    const hlx = cx - r * 0.35, hly = cy - r * 0.35;
    const grad = ctx.createRadialGradient(hlx, hly, Math.max(0.4, r * 0.05), cx, cy, r * 1.05);
    grad.addColorStop(0, inkA(1));
    grad.addColorStop(0.55, inkA(0.85));
    grad.addColorStop(1, inkA(0.4));
    return grad;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    const moveMode = params.move;
    const hoverLine = moveMode && !pointer.down ? findLine(pointer.x, pointer.y) : null;
    const hoverAnchor = !moveMode && !dragPoint && !raw && pointer.seen
      ? findAnchor(pointer.x, pointer.y) : null;
    const highlightLine = moveMode ? (moveLine || hoverLine) : activeLine;
    canvas.style.cursor = moveMode
      ? (moveLine ? 'grabbing' : (hoverLine ? 'grab' : 'crosshair'))
      : (hoverAnchor || dragPoint ? 'grab' : 'crosshair');

    ctx.lineWidth = Math.max(1.5, 0.003 * S);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const line of lines) {
      if (!line.curve.length) continue;
      ctx.strokeStyle = line === highlightLine ? RED : inkA(0.5);
      ctx.beginPath();
      ctx.moveTo(ox + line.curve[0][0].x * S, oy + line.curve[0][0].y * S);
      for (const seg of line.curve) {
        ctx.bezierCurveTo(
          ox + seg[1].x * S, oy + seg[1].y * S,
          ox + seg[2].x * S, oy + seg[2].y * S,
          ox + seg[3].x * S, oy + seg[3].y * S,
        );
      }
      ctx.stroke();
    }
    if (raw && raw.length > 1) {
      ctx.strokeStyle = RED;
      ctx.beginPath();
      ctx.moveTo(ox + raw[0].x * S, oy + raw[0].y * S);
      for (let i = 1; i < raw.length; i++) ctx.lineTo(ox + raw[i].x * S, oy + raw[i].y * S);
      ctx.stroke();
    }

    ctx.strokeStyle = bgA(0.5);
    ctx.lineWidth = Math.max(1, 0.0016 * S);
    for (const b of balloons) {
      if (b.r < 0.003) continue;
      ctx.fillStyle = fillFor(b);
      ctx.beginPath();
      ctx.arc(ox + b.x * S, oy + b.y * S, b.r * S, 0, Math.PI * 2);
      ctx.fill();
      if (!params.volume) ctx.stroke();
    }

    /* Метки опорных точек — поверх шариков, иначе их не видно: они гуще
       всего лежат ровно на линии. Точка под курсором (или уже схваченная)
       крупнее и красная — ясно, что клик сейчас правит контур, а не рисует
       новый. В режиме «двигать контур» хватают линию целиком, метки не нужны. */
    if (!moveMode) {
      const markR = ANCHOR_MARK * S;
      for (const line of lines) {
        for (const a of line.anchors) {
          const isHot = a === dragPoint || (hoverAnchor && hoverAnchor.anchor === a);
          const cx = ox + a.x * S, cy = oy + a.y * S;
          ctx.beginPath();
          ctx.arc(cx, cy, isHot ? markR * 1.8 : markR, 0, Math.PI * 2);
          ctx.fillStyle = isHot ? RED : inkA(0.7);
          ctx.fill();
          if (isHot) {
            ctx.beginPath();
            ctx.arc(cx, cy, markR * 1.8, 0, Math.PI * 2);
            ctx.strokeStyle = bgA(0.7);
            ctx.lineWidth = Math.max(1, 0.0015 * S);
            ctx.stroke();
          }
        }
      }
    }
  }

  function loop(now) {
    const elapsed = Math.min((now - last) / 1000, 0.25);
    last = now;
    debt = Math.min(0.1, debt + elapsed);
    while (debt >= STEP) { step(); debt -= STEP; }
    draw();
    frameId = requestAnimationFrame(loop);
  }

  function onDown(event) {
    pointer.seen = true;
    pointer.down = true;
    const p = toScene(event);
    pointer.x = p.x; pointer.y = p.y; pointer.px = p.x; pointer.py = p.y;
    try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* Safari может отказать */ }

    if (params.move) {
      const line = findLine(pointer.x, pointer.y);
      if (!line) { pointer.down = false; return; }
      pushHistory();
      bringToFront(line);
      moveLine = line;
      return;
    }
    const hit = findAnchor(pointer.x, pointer.y);
    if (hit) {
      pushHistory();
      bringToFront(hit.line);
      activeLine = hit.line;
      dragPoint = hit.anchor;
      dragHandles = [];
      for (const seg of hit.line.curve) {
        if (seg[0] === hit.anchor) dragHandles.push(seg[1]);
        if (seg[3] === hit.anchor) dragHandles.push(seg[2]);
      }
      return;
    }
    pushHistory();
    raw = [{ x: pointer.x, y: pointer.y }];
    lastRaw = { x: pointer.x, y: pointer.y };
  }

  function onMove(event) {
    const p = toScene(event);
    pointer.px = pointer.x; pointer.py = pointer.y;
    pointer.x = p.x; pointer.y = p.y;
    pointer.seen = true;

    if (params.move) {
      if (!pointer.down || !moveLine) return;
      const dx = pointer.x - pointer.px, dy = pointer.y - pointer.py;
      const seen = new Set();
      for (const seg of moveLine.curve) {
        for (const pt of seg) {
          if (seen.has(pt)) continue;
          seen.add(pt);
          pt.x += dx; pt.y += dy;
        }
      }
      for (const b of balloons) {
        if (b.line !== moveLine) continue;
        b.x += dx; b.y += dy; b.ax += dx; b.ay += dy;
      }
      return;
    }
    if (dragPoint) {
      const dx = pointer.x - pointer.px, dy = pointer.y - pointer.py;
      dragPoint.x += dx; dragPoint.y += dy;
      for (const h of dragHandles) { h.x += dx; h.y += dy; }
      return;
    }
    if (!pointer.down || !raw) return;
    const spacing = Math.max(0.003, RAW_STEP);
    if (Math.hypot(pointer.x - lastRaw.x, pointer.y - lastRaw.y) < spacing) return;
    raw.push({ x: pointer.x, y: pointer.y });
    lastRaw = { x: pointer.x, y: pointer.y };
  }

  function onUp() {
    pointer.down = false;
    if (raw) {
      if (raw.length >= 2) finalize(raw);
      else history.pop();
      raw = null;
    }
    dragPoint = null;
    dragHandles = null;
    activeLine = null;
    moveLine = null;
  }

  function onKeyDown(event) {
    if (event.target.closest('input, textarea')) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      toggle.click();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') {
      event.preventDefault();
      undo();
      return;
    }
    if (event.code === 'KeyC') reset();
  }

  function buildPanel() {
    const panel = document.createElement('div');
    panel.className = 'sketch-panel';
    panel.dataset.letterLayer = '';
    panel.hidden = true;

    for (const control of CONTROLS) {
      const label = document.createElement('label');
      label.textContent = control.label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = control.min;
      input.max = control.max;
      input.step = control.step;
      input.value = params[control.key];
      input.addEventListener('input', () => { params[control.key] = Number(input.value); });
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

    const undoButton = document.createElement('button');
    undoButton.type = 'button';
    undoButton.className = 'sketch-action';
    undoButton.textContent = 'отменить';
    undoButton.addEventListener('click', undo);
    panel.append(undoButton);

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'sketch-action';
    resetButton.textContent = 'очистить';
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

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'тяни — рисуешь · точку тянешь — правишь · c очистить';
  workspace.append(hint);

  const { panel, toggle } = buildPanel();

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(workspace);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  document.addEventListener('keydown', onKeyDown);

  resize();
  loadSeed();
  frameId = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    document.removeEventListener('keydown', onKeyDown);
    panel.remove();
    toggle.remove();
    hint.remove();
    ctx.clearRect(0, 0, W, H);
  };
}
