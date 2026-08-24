/* З — две дуги и горловина.

   Семь механик на общей геометрии: печатная З задана двумя кубическими кривыми,
   рукописная з — четырьмя. Стык дуг у З — настоящий залом, а не сглаженный
   переход, и механики, которые считают кривизну, обязаны это учитывать. */

function cubic(curve, t) {
  const u = 1 - t;
  const [a, b, c, d] = curve;
  return {
    x: u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0],
    y: u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1],
  };
}

function cubicTangent(curve, t) {
  const u = 1 - t;
  const [a, b, c, d] = curve;
  const x = 3 * u * u * (b[0] - a[0]) + 6 * u * t * (c[0] - b[0]) + 3 * t * t * (d[0] - c[0]);
  const y = 3 * u * u * (b[1] - a[1]) + 6 * u * t * (c[1] - b[1]) + 3 * t * t * (d[1] - c[1]);
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

const PRINT_CURVES = [
  [[0.27, 0.23], [0.58, 0.09], [0.88, 0.22], [0.52, 0.49]],
  [[0.52, 0.49], [0.91, 0.48], [0.84, 0.86], [0.25, 0.79]],
];

const HAND_CURVES = [
  [[0.28, 0.25], [0.59, 0.11], [0.86, 0.24], [0.49, 0.47]],
  [[0.49, 0.47], [0.83, 0.45], [0.84, 0.75], [0.49, 0.75]],
  [[0.49, 0.75], [0.27, 0.76], [0.31, 0.94], [0.52, 0.90]],
  [[0.52, 0.90], [0.67, 0.87], [0.67, 0.77], [0.57, 0.73]],
];

function buildSamples(curves, perCurve = 120) {
  const samples = [];
  let length = 0;
  curves.forEach((curve, curveIndex) => {
    for (let i = curveIndex ? 1 : 0; i <= perCurve; i += 1) {
      const t = i / perCurve;
      const point = cubic(curve, t);
      if (samples.length) length += Math.hypot(point.x - samples.at(-1).x, point.y - samples.at(-1).y);
      samples.push({ ...point, length, curve: curveIndex, t });
    }
  });
  samples.forEach((sample) => { sample.u = sample.length / length; });
  return { samples, length };
}

const PRINT_PATH = buildSamples(PRINT_CURVES);
const HAND_PATH = buildSamples(HAND_CURVES, 90);

function pointAt(path, u) {
  const value = clamp(u, 0, 1);
  const samples = path.samples;
  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (samples[middle].u < value) low = middle;
    else high = middle;
  }
  const a = samples[low];
  const b = samples[high];
  const mix = (value - a.u) / Math.max(0.000001, b.u - a.u);
  const curve = PRINT_CURVES[b.curve] || PRINT_CURVES.at(-1);
  const tangent = cubicTangent(curve, lerp(a.t, b.t, mix));
  return { x: lerp(a.x, b.x, mix), y: lerp(a.y, b.y, mix), tx: tangent.x, ty: tangent.y };
}

function nearestOn(path, x, y) {
  let best = null;
  path.samples.forEach((sample, index) => {
    const d = Math.hypot(x - sample.x, y - sample.y);
    if (!best || d < best.d) best = { ...sample, d, index };
  });
  return best;
}

function drawSamples(path, color = FAINT, width = 0.008, dash = []) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width * S;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(dash.map((value) => value * S));
  ctx.beginPath();
  path.samples.forEach((point, index) => {
    if (index) ctx.lineTo(point.x * S, point.y * S);
    else ctx.moveTo(point.x * S, point.y * S);
  });
  ctx.stroke();
  ctx.restore();
}

const MODES = {};

/* ---------- 1. затор: поток сам рисует две дуги ---------- */

function zatorReset() {
  const count = Math.round(num('count'));
  modeState.particles = Array.from({ length: count }, (_, index) => ({
    u: (index / count + Math.random() * 0.003) % 1,
    lane: Math.random() * 2 - 1,
    wobble: Math.random() * Math.PI * 2,
    pressure: 0,
    speed: 1,
  }));
  modeState.count = count;
  modeState.blocker = null;
  modeState.maxPressure = 0;
}

MODES.zator = {
  label: 'затор',
  note: 'Поток сам проявляет две дуги. Нажми на него и подержи: выше пробки частицы уплотнятся, после отпускания — прорвутся. Краска означает давление, а не часть буквы.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'flow', label: 'поток', min: 0.03, max: 0.3, step: 0.01, value: 0.095 },
    { type: 'range', key: 'count', label: 'частиц', min: 50, max: 260, step: 10, value: 160 },
    { type: 'range', key: 'width', label: 'русло', min: 0.006, max: 0.06, step: 0.002, value: 0.032 },
    { type: 'range', key: 'reach', label: 'затор', min: 0.06, max: 0.35, step: 0.01, value: 0.2 },
    { type: 'toggle', key: 'paint', label: 'краска', value: true },
    { type: 'toggle', key: 'ghost', label: 'русло', value: false },
    { type: 'button', label: 'заново', action: () => zatorReset() },
  ],
  setup() { zatorReset(); },
  step() {
    if (modeState.count !== Math.round(num('count'))) zatorReset();

    const blocker = pointer.down ? nearestOn(PRINT_PATH, pointer.x, pointer.y) : null;
    modeState.blocker = blocker && blocker.d < 0.085 ? blocker : null;
    let maxPressure = 0;
    const base = num('flow');
    const reach = num('reach');

    modeState.particles.forEach((particle) => {
      let drag = 1;
      if (modeState.blocker) {
        let behind = modeState.blocker.u - particle.u;
        if (behind < 0) behind += 1;
        if (behind < reach) {
          const t = behind / reach;
          drag = clamp(t * t, 0.008, 1);
          particle.pressure = clamp(particle.pressure + (1 - drag) * STEP * 2.8, 0, 1);
        }
      }

      if (!modeState.blocker) particle.pressure = Math.max(0, particle.pressure - STEP * 0.72);
      const burst = 1 + particle.pressure * (modeState.blocker ? 0 : 3.8);
      particle.speed += (drag * burst - particle.speed) * 0.12;
      particle.u += base * particle.speed * STEP;
      if (particle.u > 1) {
        particle.u -= 1;
        particle.lane = Math.random() * 2 - 1;
      }
      maxPressure = Math.max(maxPressure, particle.pressure);
    });
    modeState.maxPressure = maxPressure;
  },
  draw() {
    if (on('ghost')) drawSamples(PRINT_PATH, GHOST, 0.07);
    const width = num('width');
    modeState.particles.forEach((particle) => {
      const point = pointAt(PRINT_PATH, particle.u);
      const throat = Math.exp(-((particle.u - 0.5) ** 2) / 0.0028);
      const lane = particle.lane * width * (1 - throat * 0.68)
        + Math.sin(particle.wobble + particle.u * 18) * width * 0.08;
      const x = point.x - point.ty * lane;
      const y = point.y + point.tx * lane;
      const hot = on('paint') && particle.pressure > 0.58;
      const length = 0.008 + 0.014 * particle.speed;
      line(
        x - point.tx * length / 2,
        y - point.ty * length / 2,
        x + point.tx * length / 2,
        y + point.ty * length / 2,
        hot ? RED : INK,
        0.004 + particle.pressure * 0.003,
      );
    });

    if (modeState.blocker) {
      ctx.strokeStyle = modeState.maxPressure > 0.58 && on('paint') ? RED : INK;
      ctx.lineWidth = S * 0.002;
      ctx.beginPath();
      ctx.arc(pointer.x * S, pointer.y * S, S * 0.032, 0, Math.PI * 2);
      ctx.stroke();
    }
    const pressure = Math.round(modeState.maxPressure * 100);
    drawStatus(`давление ${pressure}%`, pressure > 58);
  },
};

/* ---------- 2. орбита: два центра и переход между ними ---------- */

const WELLS = [
  { x: 0.59, y: 0.32 },
  { x: 0.60, y: 0.66 },
];

function orbitLaunch(x = 0.28, y = 0.23, vx = 0.317, vy = -0.13) {
  modeState.ball = { x, y, vx, vy, dominant: -1, hot: 0 };
  modeState.trail = [];
  modeState.coverage = new Uint8Array(72);
  modeState.transitions = 0;
  modeState.age = 0;
  modeState.aim = null;
}

function orbitReset() { orbitLaunch(); }

MODES.orbit = {
  label: 'орбита',
  note: 'Проведи в кадре, чтобы запустить частицу. Два центра искривляют её путь; хороший бросок обходит обе орбиты и переносится через горловину. След партии становится рисунком З.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'gravity', label: 'притяжение', min: 0.004, max: 0.05, step: 0.001, value: 0.022 },
    { type: 'range', key: 'launch', label: 'бросок', min: 0.4, max: 3, step: 0.1, value: 1.7 },
    { type: 'range', key: 'trail', label: 'след', min: 120, max: 1800, step: 60, value: 420 },
    { type: 'toggle', key: 'guide', label: 'форма', value: true },
    { type: 'toggle', key: 'paint', label: 'краска', value: true },
    { type: 'button', label: 'заново', action: () => orbitReset() },
  ],
  setup() { orbitReset(); },
  onDown() {
    modeState.aim = { x: pointer.x, y: pointer.y };
  },
  onUp() {
    if (!modeState.aim) return;
    const dx = pointer.x - modeState.aim.x;
    const dy = pointer.y - modeState.aim.y;
    const length = Math.hypot(dx, dy);
    if (length > 0.012) {
      const force = num('launch');
      orbitLaunch(modeState.aim.x, modeState.aim.y, dx * force, dy * force);
    }
    modeState.aim = null;
  },
  step() {
    if (modeState.aim) return;
    const ball = modeState.ball;
    const gravity = num('gravity');
    let ax = 0;
    let ay = 0;
    const forces = [];

    WELLS.forEach((well, index) => {
      const dx = well.x - ball.x;
      const dy = well.y - ball.y;
      const r2 = dx * dx + dy * dy + 0.0022;
      const force = gravity * (index ? 1.04 : 1) / Math.pow(r2, 1.5);
      ax += dx * force;
      ay += dy * force;
      forces.push(force);
    });

    ball.vx = (ball.vx + ax * STEP) * 0.9997;
    ball.vy = (ball.vy + ay * STEP) * 0.9997;
    ball.x += ball.vx * STEP;
    ball.y += ball.vy * STEP;
    ball.hot = Math.max(0, ball.hot - STEP * 2.2);
    modeState.age += STEP;

    const dominant = forces[0] > forces[1] ? 0 : 1;
    if (ball.dominant >= 0 && dominant !== ball.dominant) {
      ball.hot = 1;
      modeState.transitions += 1;
    }
    ball.dominant = dominant;

    const nearest = nearestOn(PRINT_PATH, ball.x, ball.y);
    if (nearest.d < 0.045) modeState.coverage[Math.floor(nearest.u * (modeState.coverage.length - 1))] = 1;
    modeState.trail.push({ x: ball.x, y: ball.y, hot: ball.hot, near: nearest.d < 0.055 });
    while (modeState.trail.length > num('trail')) modeState.trail.shift();

    const escaped = ball.x < -0.18 || ball.x > 1.18 || ball.y < -0.18 || ball.y > 1.18;
    if (escaped && modeState.age > 0.5) orbitReset();
  },
  draw() {
    if (on('guide')) drawSamples(PRINT_PATH, GHOST, 0.012, [0.012, 0.018]);
    WELLS.forEach((well, index) => {
      ctx.strokeStyle = FAINT;
      ctx.lineWidth = S * 0.002;
      ctx.beginPath();
      ctx.arc(well.x * S, well.y * S, S * (0.024 + index * 0.003), 0, Math.PI * 2);
      ctx.stroke();
      dot(well.x, well.y, INK, 0.005);
    });

    for (let i = 1; i < modeState.trail.length; i += 1) {
      const a = modeState.trail[i - 1];
      const b = modeState.trail[i];
      const near = a.near && b.near;
      const hot = on('paint') && near && (a.hot > 0.15 || b.hot > 0.15);
      const age = i / modeState.trail.length;
      const alpha = near ? 0.22 + age * 0.72 : 0.02;
      line(a.x, a.y, b.x, b.y, hot ? RED : ink(alpha), near ? 0.005 : 0.0015);
    }

    const ball = modeState.ball;
    dot(ball.x, ball.y, on('paint') && ball.hot > 0.15 ? RED : INK, 0.011);
    if (modeState.aim) {
      line(modeState.aim.x, modeState.aim.y, pointer.x, pointer.y, INK, 0.003);
      dot(modeState.aim.x, modeState.aim.y, INK, 0.008);
    }

    const covered = modeState.coverage.reduce((sum, value) => sum + value, 0);
    const score = Math.round((covered / modeState.coverage.length) * 100);
    drawStatus(`след ${score}% · переходов ${modeState.transitions}`, modeState.ball.hot > 0.15);
  },
};

/* ---------- 3. маятник: рукописная з одним инерционным штрихом ---------- */

function pendulumClear() {
  modeState.pen = { x: pointer.x, y: pointer.y, vx: 0, vy: 0 };
  modeState.leader = { x: pointer.x, y: pointer.y };
  modeState.targets = [];
  modeState.trail = [];
  modeState.drawing = false;
  modeState.inputDone = false;
  modeState.currentPressure = 0.5;
  modeState.score = 0;
  modeState.coverage = 0;
  modeState.hot = false;
}

function pendulumScore() {
  if (modeState.trail.length < 8) return;
  const bins = new Uint8Array(90);
  let error = 0;
  modeState.trail.forEach((point) => {
    const nearest = nearestOn(HAND_PATH, point.x, point.y);
    bins[Math.floor(nearest.u * (bins.length - 1))] = 1;
    error += Math.min(0.12, nearest.d);
  });
  const coverage = bins.reduce((sum, value) => sum + value, 0) / bins.length;
  const accuracy = 1 - error / modeState.trail.length / 0.12;
  modeState.coverage = coverage;
  modeState.score = Math.round(clamp(coverage * 0.72 + accuracy * 0.28, 0, 1) * 100);
}

MODES.pendulum = {
  label: 'маятник',
  note: 'Нарисуй рукописную з одним движением. Перо связано с рукой пружиной: догоняет её, срезает резкие повороты и истончается на скорости. Красный показывает, где рука убежала слишком далеко.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'spring', label: 'пружина', min: 8, max: 90, step: 1, value: 74 },
    { type: 'range', key: 'damp', label: 'вязкость', min: 1, max: 24, step: 0.5, value: 9 },
    { type: 'range', key: 'size', label: 'перо', min: 0.004, max: 0.03, step: 0.001, value: 0.014 },
    { type: 'range', key: 'thin', label: 'скорость', min: 0, max: 1, step: 0.05, value: 0.65 },
    { type: 'toggle', key: 'guide', label: 'пропись', value: true },
    { type: 'toggle', key: 'paint', label: 'краска', value: true },
    { type: 'button', label: 'очистить', action: () => pendulumClear() },
  ],
  setup() { pendulumClear(); },
  onDown() {
    modeState.pen = { x: pointer.x, y: pointer.y, vx: 0, vy: 0 };
    modeState.leader = { x: pointer.x, y: pointer.y };
    modeState.targets = [];
    modeState.trail = [{ x: pointer.x, y: pointer.y, width: num('size'), hot: false }];
    modeState.drawing = true;
    modeState.inputDone = false;
    modeState.currentPressure = pointer.pressure;
    modeState.score = 0;
    modeState.coverage = 0;
  },
  onMove() {
    if (!modeState.drawing || modeState.inputDone) return;
    const last = modeState.targets.at(-1) || modeState.leader;
    if (Math.hypot(pointer.x - last.x, pointer.y - last.y) > 0.001) {
      modeState.targets.push({ x: pointer.x, y: pointer.y, pressure: pointer.pressure });
    }
  },
  onUp() {
    modeState.inputDone = true;
  },
  step() {
    if (!modeState.drawing) return;
    const pen = modeState.pen;
    let budget = 0.85 * STEP;
    while (modeState.targets.length && budget > 0) {
      const target = modeState.targets[0];
      const tx = target.x - modeState.leader.x;
      const ty = target.y - modeState.leader.y;
      const distance = Math.hypot(tx, ty);
      if (distance <= budget) {
        modeState.leader.x = target.x;
        modeState.leader.y = target.y;
        modeState.currentPressure = target.pressure;
        modeState.targets.shift();
        budget -= distance;
      } else {
        modeState.leader.x += (tx / distance) * budget;
        modeState.leader.y += (ty / distance) * budget;
        budget = 0;
      }
    }
    const dx = modeState.leader.x - pen.x;
    const dy = modeState.leader.y - pen.y;
    pen.vx += dx * num('spring') * STEP;
    pen.vy += dy * num('spring') * STEP;
    const damping = Math.exp(-num('damp') * STEP);
    pen.vx *= damping;
    pen.vy *= damping;
    pen.x += pen.vx * STEP;
    pen.y += pen.vy * STEP;

    const lag = Math.hypot(dx, dy);
    const speed = Math.hypot(pen.vx, pen.vy);
    const simulated = clamp(1 - speed * num('thin') * 0.8, 0.18, 1);
    const pressure = modeState.currentPressure > 0 && modeState.currentPressure !== 0.5
      ? clamp(modeState.currentPressure * 1.4, 0.2, 1)
      : simulated;
    const width = num('size') * (0.35 + pressure * 0.65);
    const hot = on('paint') && lag > 0.14;
    modeState.hot = hot;

    const last = modeState.trail.at(-1);
    if (!last || Math.hypot(pen.x - last.x, pen.y - last.y) > 0.0015) {
      modeState.trail.push({ x: pen.x, y: pen.y, width, hot });
    }
    if (modeState.inputDone && !modeState.targets.length && lag < 0.008 && speed < 0.04) {
      modeState.drawing = false;
      modeState.hot = false;
      pendulumScore();
    }
  },
  draw() {
    if (on('guide')) drawSamples(HAND_PATH, GHOST, 0.012, [0.012, 0.018]);
    for (let i = 1; i < modeState.trail.length; i += 1) {
      const a = modeState.trail[i - 1];
      const b = modeState.trail[i];
      line(a.x, a.y, b.x, b.y, b.hot ? RED : INK, (a.width + b.width) / 2);
    }

    if (modeState.drawing) {
      line(modeState.pen.x, modeState.pen.y, modeState.leader.x, modeState.leader.y, modeState.hot ? RED : FAINT, 0.002);
      dot(modeState.pen.x, modeState.pen.y, modeState.hot ? RED : INK, 0.006);
    }
    const label = modeState.score
      ? `совпадение ${modeState.score}%`
      : modeState.drawing ? 'одним штрихом' : 'начни сверху слева';
    drawStatus(label, modeState.score >= 82 || modeState.hot);
  },
};

/* ---------- общее для механизмов: зеркало, посадка в кадр, кривизна ---------- */

function turnHalf(curves, about) {
  return curves.map((curve) => curve.map(([x, y]) => [2 * about.x - x, 2 * about.y - y]));
}

function fitCurves(curves, size = 0.84, cx = 0.5, cy = 0.5) {
  const points = curves.flat();
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const k = size / Math.max(maxX - minX, maxY - minY);
  return curves.map((curve) => curve.map(([x, y]) => [
    cx + (x - (minX + maxX) / 2) * k,
    cy + (y - (minY + maxY) / 2) * k,
  ]));
}

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function fract(value) {
  return value - Math.floor(value);
}

function rotateAround(point, cx, cy, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - cx;
  const dy = point.y - cy;
  point.x = cx + dx * cos - dy * sin;
  point.y = cy + dx * sin + dy * cos;
}

/* касательная и кривизна в каждой точке: нужны там, где путь работает рельсом */
function withCurvature(path, closed = false) {
  const samples = path.samples;
  samples.forEach((sample, index) => {
    const back = samples[index - 1] || (closed ? samples.at(-2) : samples[0]);
    const ahead = samples[index + 1] || (closed ? samples[1] : samples.at(-1));
    const v1x = sample.x - back.x;
    const v1y = sample.y - back.y;
    const v2x = ahead.x - sample.x;
    const v2y = ahead.y - sample.y;
    const turn = Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y);
    const span = (Math.hypot(v1x, v1y) + Math.hypot(v2x, v2y)) / 2;
    const tx = ahead.x - back.x;
    const ty = ahead.y - back.y;
    const length = Math.hypot(tx, ty) || 1;
    sample.tx = tx / length;
    sample.ty = ty / length;
    sample.k = span > 0.000001 ? turn / span : 0;
  });
  /* на стыках путь ломается, и кривизна там взлетает до сотен: сглаживаем,
     иначе срыв считался бы по излому склейки, а не по настоящему повороту */
  const raw = samples.map((sample) => sample.k);
  samples.forEach((sample, index) => {
    let sum = 0;
    for (let shift = -3; shift <= 3; shift += 1) {
      const at = closed
        ? (index + shift + raw.length) % raw.length
        : clamp(index + shift, 0, raw.length - 1);
      sum += raw[at];
    }
    sample.k = sum / 7;
  });
  return path;
}

function railAt(path, u) {
  const samples = path.samples;
  const value = fract(u);
  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (samples[middle].u < value) low = middle;
    else high = middle;
  }
  const a = samples[low];
  const b = samples[high];
  const mix = (value - a.u) / Math.max(0.000001, b.u - a.u);
  const tx = lerp(a.tx, b.tx, mix);
  const ty = lerp(a.ty, b.ty, mix);
  const length = Math.hypot(tx, ty) || 1;
  return {
    x: lerp(a.x, b.x, mix),
    y: lerp(a.y, b.y, mix),
    tx: tx / length,
    ty: ty / length,
    k: lerp(a.k, b.k, mix),
  };
}

/* точки строго через равный шаг по длине: узлы стержня должны стоять ровно,
   иначе связи и углы стартуют в противоречии друг с другом */
function resample(path, count) {
  const samples = path.samples;
  const step = path.length / (count - 1);
  const points = [{ x: samples[0].x, y: samples[0].y }];
  let index = 0;
  for (let i = 1; i < count - 1; i += 1) {
    const target = i * step;
    while (index < samples.length - 2 && samples[index + 1].length < target) index += 1;
    const a = samples[index];
    const b = samples[index + 1];
    const span = Math.max(0.000001, b.length - a.length);
    const mix = clamp((target - a.length) / span, 0, 1);
    points.push({ x: lerp(a.x, b.x, mix), y: lerp(a.y, b.y, mix) });
  }
  points.push({ x: samples.at(-1).x, y: samples.at(-1).y });
  return points;
}

/* ---------- 4. пружина: буква помнит перегиб ---------- */

const ROD_COUNT = 54;
const rod = { nodes: [], rest: [], plastic: [], links: [], held: -1 };

function rodTurn(nodes, index) {
  const a = nodes[index - 1];
  const b = nodes[index];
  const c = nodes[index + 1];
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  return Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y);
}

function rodReset() {
  rod.nodes = resample(PRINT_PATH, ROD_COUNT).map((point) => (
    { x: point.x, y: point.y, px: point.x, py: point.y, vx: 0, vy: 0 }
  ));
  /* длина покоя у каждой связи своя: на стыке дуг у З настоящий залом,
     и общий средний шаг растягивал бы этот узел с первого кадра */
  rod.links = rod.nodes.slice(1).map((node, index) => (
    Math.hypot(node.x - rod.nodes[index].x, node.y - rod.nodes[index].y)
  ));
  rod.rest = rod.nodes.map((node, index) => (
    index > 0 && index < ROD_COUNT - 1 ? rodTurn(rod.nodes, index) : 0
  ));
  rod.plastic = rod.nodes.map(() => 0);
  rod.held = -1;
}

/* связи держат длину, углы тянут узел к своей кривизне покоя */
function rodSolve(stiff) {
  const nodes = rod.nodes;
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const a = nodes[i];
    const b = nodes[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const shift = (d - rod.links[i]) / d / 2;
    a.x += dx * shift;
    a.y += dy * shift;
    b.x -= dx * shift;
    b.y -= dy * shift;
  }
  for (let i = 1; i < nodes.length - 1; i += 1) {
    const err = wrapAngle(rodTurn(nodes, i) - rod.rest[i]);
    if (Math.abs(err) < 0.0002) continue;
    const a = nodes[i - 1];
    const b = nodes[i];
    const c = nodes[i + 1];
    const ax = a.x;
    const ay = a.y;
    const cx = c.x;
    const cy = c.y;
    const turn = clamp(err * stiff, -0.3, 0.3);
    /* поворот соседей вокруг узла: длины связей от него не зависят */
    rotateAround(a, b.x, b.y, turn * 0.5);
    rotateAround(c, b.x, b.y, -turn * 0.5);
    /* центр масс тройки от поворота уезжать не должен, иначе цепочка
       разгоняет сама себя и стержень разлетается без всякой руки */
    const driftX = (a.x - ax + c.x - cx) / 3;
    const driftY = (a.y - ay + c.y - cy) / 3;
    a.x -= driftX; a.y -= driftY;
    b.x -= driftX; b.y -= driftY;
    c.x -= driftX; c.y -= driftY;
  }
}

/* за пределом упругости угол покоя уезжает вслед за перегибом */
function rodFlow(limit, flow) {
  let tired = 0;
  for (let i = 1; i < rod.nodes.length - 1; i += 1) {
    const err = wrapAngle(rodTurn(rod.nodes, i) - rod.rest[i]);
    const excess = Math.abs(err) - limit;
    if (excess > 0) {
      const move = Math.sign(err) * excess * flow * 0.3;
      rod.rest[i] += move;
      rod.plastic[i] = Math.min(1, rod.plastic[i] + Math.abs(move) * 2.6);
    }
    if (rod.plastic[i] > 0.02) tired += 1;
  }
  return tired;
}

MODES.spring = {
  label: 'пружина',
  note: 'Тяни букву за любое место. Связи держат длину, углы тянут её обратно к себе: пока перегиб в пределах упругости, буква возвращается целиком. За пределом угол покоя уезжает вслед за рукой — узел краснеет, и буква остаётся такой навсегда.',
  cursor: 'grab',
  tools: [
    { type: 'range', key: 'stiff', label: 'жёсткость', min: 0.05, max: 1, step: 0.05, value: 0.5 },
    { type: 'range', key: 'damp', label: 'вязкость', min: 0.2, max: 8, step: 0.2, value: 1.2 },
    { type: 'range', key: 'grav', label: 'тяжесть', min: 0, max: 1.2, step: 0.05, value: 0 },
    { type: 'range', key: 'limit', label: 'предел', min: 0.02, max: 0.5, step: 0.01, value: 0.12 },
    { type: 'range', key: 'flow', label: 'течение', min: 0, max: 1, step: 0.05, value: 0.4 },
    { type: 'toggle', key: 'ghost', label: 'канон', value: true },
    { type: 'toggle', key: 'paint', label: 'краска', value: true },
    { type: 'button', label: 'заново', action: () => rodReset() },
  ],
  setup() { rodReset(); },
  onDown() {
    let best = -1;
    let bestD = 0.07;
    rod.nodes.forEach((node, index) => {
      const d = Math.hypot(node.x - pointer.x, node.y - pointer.y);
      if (d < bestD) { bestD = d; best = index; }
    });
    rod.held = best;
  },
  onUp() { rod.held = -1; },
  step() {
    const damp = Math.min(0.9, num('damp') * STEP);
    const grav = num('grav');
    rod.nodes.forEach((node) => {
      node.px = node.x;
      node.py = node.y;
      node.vy += grav * STEP;
      node.vx -= node.vx * damp;
      node.vy -= node.vy * damp;
    });
    if (rod.held >= 0) {
      /* рука тянет узел пружиной, а не прибивает его к курсору: от рывка
         за кадр стержень получил бы скорость, которой ему нечем ответить */
      const node = rod.nodes[rod.held];
      node.vx += (pointer.x - node.x) * 90 * STEP;
      node.vy += (pointer.y - node.y) * 90 * STEP;
      node.vx *= 0.6;
      node.vy *= 0.6;
    }
    rod.nodes.forEach((node) => {
      node.x += node.vx * STEP;
      node.y += node.vy * STEP;
    });
    const stiff = num('stiff');
    for (let pass = 0; pass < 6; pass += 1) rodSolve(stiff);
    rod.nodes.forEach((node) => {
      if (node.y > 0.965) node.y = 0.965;
      node.vx = clamp((node.x - node.px) / STEP, -6, 6);
      node.vy = clamp((node.y - node.py) / STEP, -6, 6);
    });
    modeState.tired = rodFlow(num('limit'), num('flow'));
  },
  draw() {
    if (on('ghost')) drawSamples(PRINT_PATH, GHOST, 0.012);
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = S * 0.018;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    rod.nodes.forEach((node, index) => {
      if (index) ctx.lineTo(node.x * S, node.y * S);
      else ctx.moveTo(node.x * S, node.y * S);
    });
    ctx.stroke();
    ctx.restore();
    if (on('paint')) {
      rod.plastic.forEach((value, index) => {
        if (value <= 0.02) return;
        dot(rod.nodes[index].x, rod.nodes[index].y, RED, 0.004 + value * 0.008);
      });
    }
    if (rod.held >= 0) {
      const node = rod.nodes[rod.held];
      ctx.strokeStyle = MUTED;
      ctx.lineWidth = S * 0.002;
      ctx.beginPath();
      ctx.arc(node.x * S, node.y * S, S * 0.03, 0, Math.PI * 2);
      ctx.stroke();
    }
    const tired = modeState.tired || 0;
    drawStatus(tired ? `потекло ${tired}` : 'цела', tired > 0);
  },
};

/* ---------- 5. восьмёрка: буква и её зеркало смыкаются в кольцо ---------- */

/* копия, повёрнутая на пол-оборота вокруг середины между свободными концами:
   верх одной садится ровно на низ другой, и путь замыкается без склеек */
const RING_TWIST = { x: (0.27 + 0.25) / 2, y: (0.23 + 0.79) / 2 };
const RING_CURVES = fitCurves([
  ...PRINT_CURVES,
  ...turnHalf(PRINT_CURVES, RING_TWIST),
], 0.82);
const RING = withCurvature(buildSamples(RING_CURVES, 70), true);
const bead = { u: 0, v: 0, tilt: 0, free: false, x: 0, y: 0, vx: 0, vy: 0, laps: 0 };

function beadReset() {
  const start = railAt(RING, 0.02);
  bead.u = 0.02;
  bead.v = 0;
  bead.free = false;
  bead.x = start.x;
  bead.y = start.y;
  bead.vx = 0;
  bead.vy = 0;
  bead.laps = 0;
}

function drawRingPart(letter, color, width) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width * S;
  ctx.lineCap = 'round';
  ctx.beginPath();
  let started = false;
  RING.samples.forEach((sample) => {
    if ((sample.curve < 2) !== letter) { started = false; return; }
    if (started) ctx.lineTo(sample.x * S, sample.y * S);
    else { ctx.moveTo(sample.x * S, sample.y * S); started = true; }
  });
  ctx.stroke();
  ctx.restore();
}

MODES.ring = {
  label: 'восьмёрка',
  note: 'З и её копия, повёрнутая на пол-оборота, смыкаются концами — путь замыкается. Качай кадр указателем: бусина разгоняется тяжестью и идёт круг за кругом. На изгибе рельс держит её, пока хватает опоры, — разогнал сильнее, и бусину срывает.',
  cursor: 'ew-resize',
  tools: [
    { type: 'range', key: 'grav', label: 'тяжесть', min: 0.4, max: 4, step: 0.1, value: 2.2 },
    { type: 'range', key: 'tilt', label: 'наклон', min: 0.1, max: 1.2, step: 0.05, value: 0.7 },
    { type: 'range', key: 'friction', label: 'трение', min: 0, max: 1.2, step: 0.05, value: 0.12 },
    { type: 'range', key: 'hold', label: 'держит', min: 5, max: 80, step: 1, value: 40 },
    { type: 'toggle', key: 'twin', label: 'двойник', value: true },
    { type: 'toggle', key: 'paint', label: 'краска', value: true },
    { type: 'button', label: 'заново', action: () => beadReset() },
  ],
  setup() { beadReset(); },
  step() {
    const grav = num('grav');
    const target = (pointer.seen ? clamp((pointer.x - 0.5) * 2, -1, 1) : 0) * num('tilt');
    bead.tilt += (target - bead.tilt) * 0.09;
    /* кадр качается, тяжесть остаётся вертикальной: в системе пути она наклонная */
    const gx = Math.sin(bead.tilt) * grav;
    const gy = Math.cos(bead.tilt) * grav;

    if (bead.free) {
      bead.vx += gx * STEP;
      bead.vy += gy * STEP;
      bead.x += bead.vx * STEP;
      bead.y += bead.vy * STEP;
      const near = nearestOn(RING, bead.x, bead.y);
      if (near.d < 0.02) {
        const rail = railAt(RING, near.u);
        bead.free = false;
        bead.u = near.u;
        bead.v = bead.vx * rail.tx + bead.vy * rail.ty;
      } else if (bead.x < -0.25 || bead.x > 1.25 || bead.y > 1.25 || bead.y < -0.25) {
        beadReset();
      }
      return;
    }

    const rail = railAt(RING, bead.u);
    bead.v += (gx * rail.tx + gy * rail.ty) * STEP;
    bead.v -= bead.v * num('friction') * STEP;
    bead.u += bead.v * STEP / RING.length;
    if (bead.u >= 1) { bead.u -= 1; bead.laps += 1; }
    if (bead.u < 0) { bead.u += 1; bead.laps -= 1; }
    /* рельс удерживает, пока нужное на повороте не превысило его опору */
    if (bead.v * bead.v * Math.abs(rail.k) > num('hold')) {
      const point = railAt(RING, bead.u);
      bead.free = true;
      bead.x = point.x;
      bead.y = point.y;
      bead.vx = point.tx * bead.v;
      bead.vy = point.ty * bead.v;
    }
  },
  draw() {
    ctx.save();
    ctx.translate(S * 0.5, S * 0.5);
    ctx.rotate(bead.tilt);
    ctx.translate(-S * 0.5, -S * 0.5);
    if (on('twin')) drawRingPart(false, GHOST, 0.012);
    drawRingPart(true, INK, 0.016);
    const point = bead.free ? bead : railAt(RING, bead.u);
    dot(point.x, point.y, bead.free && on('paint') ? RED : INK, 0.016);
    ctx.restore();
    drawStatus(`кругов ${bead.laps}`, bead.free);
  },
};

/* ---------- 6. горловина: точка перегиба как перешеек ---------- */

const WALL_HALF = 0.009;
const MIRROR_AXIS = 0.52;
const sand = { grains: [], count: 0, done: 0, stall: 0, gap: 0 };

function buildGrid(path, cell) {
  const map = new Map();
  path.samples.forEach((sample) => {
    const key = `${Math.floor(sample.x / cell)}:${Math.floor(sample.y / cell)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(sample);
  });
  return { map, cell };
}

const WALL_GRID = buildGrid(PRINT_PATH, 0.05);

function nearWall(x, y) {
  const cx = Math.floor(x / WALL_GRID.cell);
  const cy = Math.floor(y / WALL_GRID.cell);
  let best = null;
  for (let ix = cx - 1; ix <= cx + 1; ix += 1) {
    for (let iy = cy - 1; iy <= cy + 1; iy += 1) {
      const list = WALL_GRID.map.get(`${ix}:${iy}`);
      if (!list) continue;
      for (const sample of list) {
        const d = Math.hypot(x - sample.x, y - sample.y);
        if (!best || d < best.d) best = { d, x: sample.x, y: sample.y };
      }
    }
  }
  return best;
}

function sandReset() {
  const count = Math.round(num('count'));
  const r = num('grain');
  /* засыпаем внутрь верхней чаши, а не сверху на букву: снаружи у З покатые
     склоны, и зерно уехало бы мимо часов, ничего про горловину не сказав */
  const columns = Math.max(4, Math.floor(0.30 / (r * 2.1)));
  sand.grains = Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return {
      x: 0.5 + (column - (columns - 1) / 2) * r * 2.1 + (Math.random() - 0.5) * r * 0.4,
      y: 0.45 - row * r * 2.1,
      px: 0,
      py: 0,
      vx: 0,
      vy: 0,
      touch: false,
      passed: false,
    };
  });
  sand.grains.forEach((grain) => { grain.px = grain.x; grain.py = grain.y; });
  sand.count = count;
  sand.done = 0;
  sand.stall = 0;
}

/* стенка — одна и та же З в двух видах: правая сдвинута, левая отражена */
function pushOffWalls(grain, gap, reach) {
  const copies = [
    { x: grain.x - gap / 2, mirror: false },
    { x: 1.04 - gap / 2 - grain.x, mirror: true },
  ];
  for (const copy of copies) {
    const hit = nearWall(copy.x, grain.y);
    if (!hit || hit.d > reach) continue;
    const wx = copy.mirror ? 1.04 - gap / 2 - hit.x : hit.x + gap / 2;
    const dx = grain.x - wx;
    const dy = grain.y - hit.y;
    const d = Math.hypot(dx, dy) || 0.0001;
    if (d >= reach) continue;
    const push = (reach - d) / d;
    grain.x += dx * push;
    grain.y += dy * push;
    grain.touch = true;
  }
}

MODES.neck = {
  label: 'горловина',
  note: 'З и её зеркало сходятся в точке перегиба — получаются песочные часы, где перешеек и есть эта точка. Зерно проходит только сквозь неё. Уже трёх диаметров — свод встаёт сам и поток замирает; нажми и поводи, чтобы расшевелить.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'neck', label: 'горловина', min: 1.5, max: 9, step: 0.25, value: 3.5 },
    { type: 'range', key: 'grain', label: 'зерно', min: 0.006, max: 0.018, step: 0.001, value: 0.010 },
    { type: 'range', key: 'count', label: 'зёрен', min: 60, max: 320, step: 10, value: 170 },
    { type: 'range', key: 'grav', label: 'тяжесть', min: 0.3, max: 3, step: 0.1, value: 1.4 },
    { type: 'range', key: 'friction', label: 'трение', min: 0, max: 1, step: 0.05, value: 0.35 },
    { type: 'toggle', key: 'paint', label: 'краска', value: true },
    { type: 'button', label: 'насыпать заново', action: () => sandReset() },
  ],
  setup() { sandReset(); },
  step() {
    const r = num('grain');
    if (sand.count !== Math.round(num('count'))) sandReset();
    const gap = num('neck') * 2 * r;
    sand.gap = gap;
    const grav = num('grav');
    const friction = num('friction');
    const reach = r + WALL_HALF;
    const grains = sand.grains;

    grains.forEach((grain) => {
      grain.px = grain.x;
      grain.py = grain.y;
      grain.touch = false;
      grain.vy += grav * STEP;
      grain.x += grain.vx * STEP;
      grain.y += grain.vy * STEP;
    });

    if (pointer.down) {
      grains.forEach((grain) => {
        const d = Math.hypot(grain.x - pointer.x, grain.y - pointer.y);
        if (d > 0.07) return;
        grain.x += (Math.random() - 0.5) * r * 0.9;
        grain.y += (Math.random() - 0.5) * r * 0.9;
      });
    }

    const cell = r * 2;
    for (let pass = 0; pass < 3; pass += 1) {
      const map = new Map();
      grains.forEach((grain, index) => {
        const key = `${Math.floor(grain.x / cell)}:${Math.floor(grain.y / cell)}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(index);
      });
      grains.forEach((grain, index) => {
        const cx = Math.floor(grain.x / cell);
        const cy = Math.floor(grain.y / cell);
        for (let ix = cx - 1; ix <= cx + 1; ix += 1) {
          for (let iy = cy - 1; iy <= cy + 1; iy += 1) {
            const list = map.get(`${ix}:${iy}`);
            if (!list) continue;
            for (const other of list) {
              if (other <= index) continue;
              const mate = grains[other];
              const dx = mate.x - grain.x;
              const dy = mate.y - grain.y;
              const d = Math.hypot(dx, dy) || 0.0001;
              if (d >= r * 2) continue;
              const push = (r * 2 - d) / d / 2;
              grain.x -= dx * push;
              grain.y -= dy * push;
              mate.x += dx * push;
              mate.y += dy * push;
              grain.touch = true;
              mate.touch = true;
            }
          }
        }
        pushOffWalls(grain, gap, reach);
        if (grain.y > 0.965 - r) grain.y = 0.965 - r;
        if (grain.x < r) grain.x = r;
        if (grain.x > 1 - r) grain.x = 1 - r;
      });
    }

    let below = 0;
    grains.forEach((grain) => {
      grain.vx = (grain.x - grain.px) / STEP;
      grain.vy = (grain.y - grain.py) / STEP;
      /* трение живёт в откате прошлой позиции: контакт съедает часть хода */
      if (grain.touch) {
        grain.vx *= 1 - friction * 0.5;
        grain.vy *= 1 - friction * 0.5;
      }
      /* прошедшим считаем только то, что протиснулось сквозь саму горловину */
      if (!grain.passed && grain.y > 0.5 && Math.abs(grain.x - 0.5) < gap / 2 + r * 2) {
        grain.passed = true;
      }
      if (grain.passed) below += 1;
    });

    const waiting = grains.filter((grain) => (
      !grain.passed && grain.y < 0.5 && Math.abs(grain.x - 0.5) < 0.3
    )).length;
    const moved = below - sand.done;
    sand.done = below;
    sand.waiting = waiting;
    /* пара зёрен, зависших по углам, — это не затор: свод держит массу */
    sand.stall = moved > 0 || waiting < 4 ? 0 : sand.stall + STEP;
  },
  draw() {
    const gap = sand.gap;
    const r = num('grain');
    const jam = sand.stall > 1.1;

    ctx.save();
    ctx.translate(gap / 2 * S, 0);
    drawSamples(PRINT_PATH, INK, 0.018);
    ctx.restore();

    ctx.save();
    ctx.translate(-gap / 2 * S, 0);
    ctx.translate(MIRROR_AXIS * 2 * S, 0);
    ctx.scale(-1, 1);
    drawSamples(PRINT_PATH, INK, 0.018);
    ctx.restore();

    line(0.02, 0.965, 0.98, 0.965, FAINT, 0.003);

    sand.grains.forEach((grain) => {
      const hot = jam && on('paint')
        && Math.abs(grain.y - 0.485) < 0.045
        && Math.abs(grain.x - 0.5) < gap / 2 + r * 3;
      dot(grain.x, grain.y, hot ? RED : INK, r);
    });

    drawStatus(jam ? 'затор' : `прошло ${sand.done} / ${sand.count}`, jam);
  },
};

/* ---------- 7. храповик: буква держит колесо ---------- */

const WHEEL = { x: 0.37, y: 0.56, r: 0.225 };
const PAWL = { x: 0.67, y: 0.36, scale: 0.42 };
/* место касания на колесе: рука собачки здесь почти перпендикулярна радиусу,
   и поворот буквы поднимает кончик, а не возит его вдоль зуба */
const CONTACT = 25 * Math.PI / 180;
const JUNCTION = { x: 0.52, y: 0.49 };
const TIP = { x: 0.25, y: 0.79 };
const ratchet = {
  angle: 0, omega: 0, lift: 0, liftV: 0, base: 0, sign: 1,
  turns: 0, clicks: 0, held: false, grab: null, phase: 0,
};

function pawlTip(angle) {
  const ax = (TIP.x - JUNCTION.x) * PAWL.scale;
  const ay = (TIP.y - JUNCTION.y) * PAWL.scale;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: PAWL.x + ax * cos - ay * sin, y: PAWL.y + ax * sin + ay * cos };
}

function tipRadius(angle) {
  const tip = pawlTip(angle);
  return Math.hypot(tip.x - WHEEL.x, tip.y - WHEEL.y);
}

/* букву не крутим ради зацепления: она стоит прямо, а ось считается от места
   касания — так собачка это буква, а не повёрнутый на случайный угол контур */
function ratchetSetup() {
  const target = WHEEL.r - num('depth') * 0.5;
  PAWL.x = WHEEL.x + Math.cos(CONTACT) * target - (TIP.x - JUNCTION.x) * PAWL.scale;
  PAWL.y = WHEEL.y + Math.sin(CONTACT) * target - (TIP.y - JUNCTION.y) * PAWL.scale;
  ratchet.base = 0;
  ratchet.sign = Math.sign(tipRadius(0.02) - tipRadius(0)) || 1;
  ratchet.angle = 0;
  ratchet.omega = 0;
  ratchet.lift = 0;
  ratchet.liftV = 0;
  ratchet.turns = 0;
  ratchet.clicks = 0;
  ratchet.grab = null;
}

function pawlAngle() {
  return ratchet.base + ratchet.lift * ratchet.sign;
}

MODES.ratchet = {
  label: 'храповик',
  note: 'Буква посажена на ось в своей точке перегиба и работает собачкой. Крути колесо мышью: по часовой зубья проходят под нижним крюком со щелчком, против — упираются в него, и колесо встаёт. Красный держится ровно столько, сколько буква держит колесо.',
  cursor: 'grab',
  tools: [
    { type: 'range', key: 'teeth', label: 'зубцов', min: 8, max: 24, step: 1, value: 14 },
    { type: 'range', key: 'depth', label: 'глубина', min: 0.015, max: 0.06, step: 0.005, value: 0.03 },
    { type: 'range', key: 'spring', label: 'пружина', min: 2, max: 40, step: 1, value: 16 },
    { type: 'range', key: 'damp', label: 'вязкость', min: 0.5, max: 12, step: 0.5, value: 4 },
    { type: 'range', key: 'coast', label: 'выбег', min: 0, max: 3, step: 0.1, value: 0.7 },
    { type: 'toggle', key: 'paint', label: 'краска', value: true },
    { type: 'button', label: 'заново', action: () => ratchetSetup() },
  ],
  setup() { ratchetSetup(); },
  onUp() { ratchet.grab = null; },
  step() {
    const teeth = Math.round(num('teeth'));
    const depth = num('depth');
    const pitch = Math.PI * 2 / teeth;

    if (pointer.down) {
      const now = Math.atan2(pointer.y - WHEEL.y, pointer.x - WHEEL.x);
      if (ratchet.grab !== null) {
        const delta = wrapAngle(now - ratchet.grab);
        ratchet.omega = ratchet.omega * 0.4 + (delta / STEP) * 0.6;
      }
      ratchet.grab = now;
    } else {
      ratchet.grab = null;
      ratchet.omega -= ratchet.omega * Math.min(0.9, num('coast') * STEP);
    }

    const tip = pawlTip(pawlAngle());
    const radius = Math.hypot(tip.x - WHEEL.x, tip.y - WHEEL.y);
    const bearing = Math.atan2(tip.y - WHEEL.y, tip.x - WHEEL.x);
    const phase = fract((bearing - ratchet.angle) / pitch);
    let advance = ratchet.omega * STEP;

    ratchet.held = false;
    if (radius < WHEEL.r - 0.002 && advance < 0) {
      /* ступенька зуба упирается в кончик; оставляем перед ней зазор, иначе
         фаза дойдёт ровно до зуба, обнулится и пропустит колесо дальше */
      const allowed = Math.max(0, (1 - phase) * pitch - 0.01);
      if (-advance > allowed) {
        advance = -allowed;
        ratchet.omega = 0;
        ratchet.held = true;
      }
    }
    ratchet.angle += advance;
    ratchet.turns += advance / (Math.PI * 2);

    /* пружина тянет собачку обратно к зубу */
    ratchet.liftV -= num('spring') * ratchet.lift * STEP;
    ratchet.liftV -= ratchet.liftV * Math.min(0.9, num('damp') * STEP);
    ratchet.lift += ratchet.liftV * STEP;

    /* зуб выталкивает кончик наружу: ищем наименьший поворот собачки,
       при котором кончик выходит на поверхность зуба */
    const gap = (value) => {
      const point = pawlTip(ratchet.base + value * ratchet.sign);
      const out = Math.hypot(point.x - WHEEL.x, point.y - WHEEL.y);
      const where = Math.atan2(point.y - WHEEL.y, point.x - WHEEL.x);
      return out - (WHEEL.r - depth * fract((where - ratchet.angle) / pitch));
    };
    if (gap(ratchet.lift) < 0) {
      let low = ratchet.lift;
      let high = ratchet.lift + 0.45;
      for (let pass = 0; pass < 16; pass += 1) {
        const middle = (low + high) / 2;
        if (gap(middle) < 0) low = middle;
        else high = middle;
      }
      ratchet.liftV = Math.max(ratchet.liftV, (high - ratchet.lift) / STEP * 0.35);
      ratchet.lift = high;
    }
    ratchet.lift = clamp(ratchet.lift, -0.02, 0.45);

    const moved = pawlTip(pawlAngle());
    const after = fract((Math.atan2(moved.y - WHEEL.y, moved.x - WHEEL.x) - ratchet.angle) / pitch);

    /* по свободному ходу фаза убывает и оборачивается вверх: это и есть щелчок */
    if (after > ratchet.phase + 0.5) ratchet.clicks += 1;
    ratchet.phase = after;
  },
  draw() {
    const teeth = Math.round(num('teeth'));
    const depth = num('depth');
    const pitch = Math.PI * 2 / teeth;

    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = S * 0.006;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= teeth; i += 1) {
      for (let s = 0; s <= 3; s += 1) {
        const phase = s / 3;
        const angle = ratchet.angle + (i + phase) * pitch;
        const radius = WHEEL.r - depth * phase;
        const x = (WHEEL.x + Math.cos(angle) * radius) * S;
        const y = (WHEEL.y + Math.sin(angle) * radius) * S;
        if (!i && !s) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    dot(WHEEL.x, WHEEL.y, MUTED, 0.012);
    line(
      WHEEL.x,
      WHEEL.y,
      WHEEL.x + Math.cos(ratchet.angle) * WHEEL.r * 0.82,
      WHEEL.y + Math.sin(ratchet.angle) * WHEEL.r * 0.82,
      FAINT,
      0.004,
    );

    const hot = ratchet.held && on('paint');
    ctx.save();
    ctx.translate(PAWL.x * S, PAWL.y * S);
    ctx.rotate(pawlAngle());
    ctx.scale(PAWL.scale, PAWL.scale);
    ctx.translate(-JUNCTION.x * S, -JUNCTION.y * S);
    drawSamples(PRINT_PATH, hot ? RED : INK, 0.018 / PAWL.scale);
    ctx.restore();
    dot(PAWL.x, PAWL.y, MUTED, 0.009);

    drawStatus(
      ratchet.held ? 'держит' : `оборотов ${Math.abs(ratchet.turns).toFixed(1)} · щелчков ${ratchet.clicks}`,
      ratchet.held,
    );
  },
};

/* ---------- 8. змейка: разворот, которого змейка не умеет ---------- */

/* Печатная З ломается в горловине на 132° — почти назад. Змейке ход назад
   запрещён самой игрой, поэтому пройти букву по прописи нельзя: горловину
   приходится обходить петлёй. Петля в середине — это и есть рукописная з,
   и достаётся она не рисованием, а ограничением механики. */

const SNAKE_KEYS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
};

const snake = {
  grid: 21, route: [], routeSet: new Set(), letter: 0, cells: [], len: 4,
  dir: [1, 0], queue: [], dead: null, done: false, tick: 0, started: false,
};

function snakeKey(x, y) { return y * 64 + x; }

/* Буква, разложенная по клеткам и сшитая по четырём сторонам: диагональный
   переход змейке не пройти, поэтому между клетками наискось ставится ещё одна.
   Повторы в пути не выбрасываем: в горловине З возвращается в уже пройденную
   клетку, и без этого возврата путь рвался бы ровно на самом интересном месте. */
function snakeRoute(grid) {
  const cells = [];
  const put = (x, y) => {
    const last = cells.at(-1);
    if (last && last.x === x && last.y === y) return;
    cells.push({ x, y });
  };
  let prev = null;
  for (const sample of PRINT_PATH.samples) {
    const x = clamp(Math.floor(sample.x * grid), 0, grid - 1);
    const y = clamp(Math.floor(sample.y * grid), 0, grid - 1);
    if (prev && prev.x !== x && prev.y !== y) put(x, prev.y);
    put(x, y);
    prev = { x, y };
  }
  return cells;
}

function snakeReset() {
  const grid = Math.round(num('grid'));
  snake.grid = grid;
  snake.route = snakeRoute(grid);
  snake.routeSet = new Set(snake.route.map((cell) => snakeKey(cell.x, cell.y)));
  snake.letter = snake.routeSet.size;
  const head = snake.route[0];
  const next = snake.route[1] || head;
  snake.cells = [{ x: head.x, y: head.y }];
  snake.dir = [Math.sign(next.x - head.x) || 1, Math.sign(next.y - head.y)];
  snake.len = 4;
  snake.queue = [];
  snake.dead = null;
  snake.done = false;
  snake.tick = 0;
  snake.started = false;
}

function snakeBody() {
  return new Set(snake.cells.map((cell) => snakeKey(cell.x, cell.y)));
}

function snakeCovered() {
  const body = snakeBody();
  let covered = 0;
  for (const key of snake.routeSet) if (body.has(key)) covered += 1;
  return covered;
}

/* Еда стоит на первой клетке буквы, которую тело ещё не накрыло: так она сама
   ведёт по порядку письма. Нет такой клетки — буква написана целиком. */
function snakeFood() {
  const body = snakeBody();
  return snake.route.find((cell) => !body.has(snakeKey(cell.x, cell.y))) || null;
}

function snakeAdvance() {
  const turn = snake.queue.shift();
  if (turn && !(turn[0] === -snake.dir[0] && turn[1] === -snake.dir[1])) snake.dir = turn;

  const head = snake.cells[0];
  let x = head.x + snake.dir[0];
  let y = head.y + snake.dir[1];
  const grid = snake.grid;

  if (on('wrap')) {
    x = (x + grid) % grid;
    y = (y + grid) % grid;
  } else if (x < 0 || y < 0 || x >= grid || y >= grid) {
    snake.dead = { x: clamp(x, 0, grid - 1), y: clamp(y, 0, grid - 1), wall: true };
    return;
  }

  /* хвост за этот же ход уходит, и клетка под ним свободна */
  const tail = snake.cells.length >= snake.len ? snake.cells.at(-1) : null;
  const bitten = snake.cells.some((cell, index) => (
    cell.x === x && cell.y === y && !(tail && index === snake.cells.length - 1)
  ));
  if (bitten) {
    snake.dead = { x, y, wall: false };
    return;
  }

  const food = snakeFood();
  snake.cells.unshift({ x, y });
  if (food && food.x === x && food.y === y) snake.len += Math.round(num('grow'));
  while (snake.cells.length > snake.len) snake.cells.pop();

  /* буква держится ровно один ход: следующий шаг уводит хвост и разрушает её,
     поэтому на полном покрытии змейка встаёт и написанное остаётся */
  if (snakeCovered() === snake.letter) snake.done = true;
}

function snakeCell(x, y, color, scale = 0.92) {
  const size = S / snake.grid;
  const inset = size * (1 - scale) / 2;
  ctx.fillStyle = color;
  ctx.fillRect(x * size + inset, y * size + inset, size * scale, size * scale);
}

MODES.snake = {
  label: 'змейка',
  note: 'Змейка пишет З: еда сама встаёт на следующую клетку буквы. Ход назад игра не даёт, а печатная З в горловине разворачивается почти назад — пройти её напрямую нельзя, только обойти петлёй. Петля в середине и есть рукописная з. Стрелки или ведение по кадру.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'grid', label: 'сетка', min: 15, max: 29, step: 2, value: 21 },
    { type: 'range', key: 'speed', label: 'темп', min: 2, max: 14, step: 1, value: 6 },
    { type: 'range', key: 'grow', label: 'рост', min: 1, max: 6, step: 1, value: 1 },
    { type: 'toggle', key: 'trace', label: 'пропись', value: true },
    { type: 'toggle', key: 'wrap', label: 'края', value: false },
    { type: 'toggle', key: 'paint', label: 'краска', value: true },
    { type: 'button', label: 'заново', action: () => snakeReset() },
  ],
  setup() { snakeReset(); },
  onTool(key) { if (key === 'grid') snakeReset(); },
  onKey(event, down) {
    if (!down) return;
    const turn = SNAKE_KEYS[event.key];
    if (!turn) return;
    event.preventDefault();
    if (snake.queue.length < 2) snake.queue.push(turn);
    snake.started = true;
  },
  onUp() {
    /* ведение пальцем: направление берём у самого жеста */
    const dx = pointer.x - pointer.px;
    const dy = pointer.y - pointer.py;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    const turn = Math.abs(dx) > Math.abs(dy)
      ? [Math.sign(dx), 0]
      : [0, Math.sign(dy)];
    if (snake.queue.length < 2) snake.queue.push(turn);
    snake.started = true;
  },
  step() {
    if (!snake.started || snake.dead || snake.done) return;
    snake.tick += STEP * num('speed');
    while (snake.tick >= 1) {
      snake.tick -= 1;
      snakeAdvance();
      if (snake.dead) return;
    }
  },
  draw() {
    const body = snakeBody();
    if (on('trace')) {
      for (const cell of snake.route) {
        if (!body.has(snakeKey(cell.x, cell.y))) snakeCell(cell.x, cell.y, ink(0.1));
      }
    }

    /* клетка буквы под телом — полная, лишнее вне буквы — мельче: буква
       проявляется плотностью, а не второй краской */
    for (const cell of snake.cells) {
      const inLetter = snake.routeSet.has(snakeKey(cell.x, cell.y));
      snakeCell(cell.x, cell.y, INK, inLetter ? 0.92 : 0.52);
    }

    const head = snake.cells[0];
    if (head) {
      const size = 1 / snake.grid;
      dot((head.x + 0.5) * size, (head.y + 0.5) * size, PAPER, size * 0.18);
    }

    const food = snakeFood();
    if (food && !snake.dead && !snake.done) {
      const size = 1 / snake.grid;
      dot((food.x + 0.5) * size, (food.y + 0.5) * size, INK, size * 0.3);
    }

    if (snake.dead && on('paint')) snakeCell(snake.dead.x, snake.dead.y, RED);

    /* считаем по клеткам буквы, а не по длине пути: горловину путь проходит
       дважды, и по нему доля вышла бы заниженной */
    let covered = 0;
    for (const key of snake.routeSet) if (body.has(key)) covered += 1;
    const share = Math.round((covered / snake.letter) * 100);
    if (snake.dead) drawStatus(snake.dead.wall ? 'край' : 'укус', true);
    else drawStatus(snake.done ? 'буква написана' : `буква ${share}%`, false);
  },
};

/* ---------- 9. удав: змейка ростом ровно в букву ---------- */

/* Длина тела здесь не растёт и равна контуру З: змейка это и есть буква,
   ни клеткой больше. Тонкая — ещё не буква, а её след; съеденное яблоко
   становится шишкой, шишка уходит по телу к хвосту и остаётся там, и буква
   наливается с конца. Яблоки падают в стороне, поэтому за каждым приходится
   сойти с буквы и уложиться в неё заново. */

/* Углы буквы с эскиза: З, собранная прямыми ходами по сетке. Растр кривой дал бы
   лесенку, а змейка пишет своими средствами — отрезком и поворотом. */
/* У печатной З середина — точка возврата: линия входит туда и выходит обратно
   по себе же. Змейка так не умеет, ей нужны две параллельные нитки, и середина
   буквы получается двойной. Поэтому заход держим неглубоким — на треть ширины:
   глубокая полка режет букву пополам, и вместо З читается Э. */
const BOA_TURNS = [
  [0.364, 0.140], [0.773, 0.140], [0.773, 0.320],
  [0.700, 0.320], [0.700, 0.390], [0.620, 0.390], [0.620, 0.470],
  [0.773, 0.470], [0.773, 0.844], [0.300, 0.844],
];

function boaRoute(grid) {
  const nodes = BOA_TURNS.map(([x, y]) => ({
    x: clamp(Math.round(x * grid), 0, grid - 1),
    y: clamp(Math.round(y * grid), 0, grid - 1),
  }));
  const cells = [];
  const put = (x, y) => {
    const last = cells.at(-1);
    if (last && last.x === x && last.y === y) return;
    cells.push({ x, y });
  };
  put(nodes[0].x, nodes[0].y);
  for (const node of nodes.slice(1)) {
    const from = cells.at(-1);
    let { x, y } = from;
    const dx = Math.sign(node.x - x);
    const dy = Math.sign(node.y - y);
    while (x !== node.x) { x += dx; put(x, y); }
    while (y !== node.y) { y += dy; put(x, y); }
  }
  return cells;
}

const boa = {
  grid: 21, route: [], routeSet: new Set(), letter: 0,
  cells: [], dir: [1, 0], queue: [], lumps: [], apple: null,
  dead: null, done: false, tick: 0, started: false,
};

function boaLay() {
  /* тело кладётся по букве от её конца: голова там, где З дописывается */
  boa.cells = boa.route.slice().reverse().map((cell) => ({ x: cell.x, y: cell.y }));
  const head = boa.cells[0];
  const next = boa.cells[1] || head;
  boa.dir = [Math.sign(head.x - next.x), Math.sign(head.y - next.y)];
  if (!boa.dir[0] && !boa.dir[1]) boa.dir = [-1, 0];
}

function boaApple() {
  const taken = new Set(boa.cells.map((cell) => snakeKey(cell.x, cell.y)));
  const free = [];
  for (let y = 0; y < boa.grid; y += 1) {
    for (let x = 0; x < boa.grid; x += 1) {
      if (!taken.has(snakeKey(x, y))) free.push({ x, y });
    }
  }
  boa.apple = free.length ? free[Math.floor(Math.random() * free.length)] : null;
}

function boaReset() {
  const grid = Math.round(num('grid'));
  boa.grid = grid;
  boa.route = boaRoute(grid);
  boa.routeSet = new Set(boa.route.map((cell) => snakeKey(cell.x, cell.y)));
  boa.letter = boa.routeSet.size;
  boa.lumps = [];
  boa.queue = [];
  boa.dead = null;
  boa.done = false;
  boa.tick = 0;
  boa.started = false;
  boaLay();
  boaApple();
}

function boaCovered() {
  const body = new Set(boa.cells.map((cell) => snakeKey(cell.x, cell.y)));
  let covered = 0;
  for (const key of boa.routeSet) if (body.has(key)) covered += 1;
  return covered;
}

function boaAdvance() {
  if (boa.dead || boa.done) return;
  const turn = boa.queue.shift();
  if (turn && !(turn[0] === -boa.dir[0] && turn[1] === -boa.dir[1])) boa.dir = turn;

  const head = boa.cells[0];
  let x = head.x + boa.dir[0];
  let y = head.y + boa.dir[1];
  const grid = boa.grid;

  if (on('wrap')) {
    x = (x + grid) % grid;
    y = (y + grid) % grid;
  } else if (x < 0 || y < 0 || x >= grid || y >= grid) {
    boa.dead = { x: clamp(x, 0, grid - 1), y: clamp(y, 0, grid - 1), wall: true };
    return;
  }

  /* хвост уходит этим же ходом, и клетка под ним свободна */
  const bitten = boa.cells.some((cell, index) => (
    cell.x === x && cell.y === y && index < boa.cells.length - 1
  ));
  if (bitten) {
    boa.dead = { x, y, wall: false };
    return;
  }

  boa.cells.unshift({ x, y });
  boa.cells.pop();

  /* Шишка идёт к хвосту, пока не упрётся в ту, что доехала раньше. Предел —
     именно зазор до соседа впереди, а не итоговое место у хвоста: иначе шишки
     прибавляют по клетке одновременно и едут стопкой в одной клетке. */
  const limit = boa.cells.length - 1;
  boa.lumps.forEach((lump, index) => {
    const ahead = index ? boa.lumps[index - 1].pos - 1 : limit;
    lump.pos = Math.min(lump.pos + 1, ahead);
  });

  /* одно яблоко — одна шишка */
  if (boa.apple && boa.apple.x === x && boa.apple.y === y) {
    if (boa.lumps.length <= limit) boa.lumps.push({ pos: 0 });
    boaApple();
  }

  if (boa.lumps.length > limit && boaCovered() === boa.letter) boa.done = true;
}

MODES.boa = {
  label: 'удав',
  note: 'Длина тела не меняется и равна контуру З: змейка это и есть буква. Тонкая — ещё не буква, а её след. Яблоко становится шишкой, шишка уходит к хвосту, и буква наливается с конца. Яблоки падают в стороне, так что за каждым надо сойти с буквы и уложиться в неё заново.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'grid', label: 'сетка', min: 15, max: 29, step: 2, value: 21 },
    { type: 'range', key: 'speed', label: 'темп', min: 2, max: 14, step: 1, value: 6 },
    { type: 'toggle', key: 'trace', label: 'пропись', value: true },
    { type: 'toggle', key: 'wrap', label: 'края', value: false },
    { type: 'toggle', key: 'paint', label: 'краска', value: true },
    { type: 'button', label: 'заново', action: () => boaReset() },
  ],
  setup() { boaReset(); },
  onTool(key) { if (key === 'grid') boaReset(); },
  onKey(event, down) {
    if (!down) return;
    const turn = SNAKE_KEYS[event.key];
    if (!turn) return;
    event.preventDefault();
    if (boa.queue.length < 2) boa.queue.push(turn);
    boa.started = true;
  },
  onUp() {
    const dx = pointer.x - pointer.px;
    const dy = pointer.y - pointer.py;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    const turn = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
    if (boa.queue.length < 2) boa.queue.push(turn);
    boa.started = true;
  },
  step() {
    if (!boa.started || boa.dead || boa.done) return;
    boa.tick += STEP * num('speed');
    while (boa.tick >= 1) {
      boa.tick -= 1;
      boaAdvance();
      if (boa.dead || boa.done) return;
    }
  },
  draw() {
    const size = 1 / boa.grid;
    const mid = (value) => (value + 0.5) * size;

    if (on('trace')) {
      const body = new Set(boa.cells.map((cell) => snakeKey(cell.x, cell.y)));
      for (const cell of boa.route) {
        if (!body.has(snakeKey(cell.x, cell.y))) dot(mid(cell.x), mid(cell.y), ink(0.12), size * 0.16);
      }
    }

    /* тело одной линией со скруглёнными углами; на завороте через край
       рвём линию, иначе она прочертит весь кадр насквозь */
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = size * 0.58 * S;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    boa.cells.forEach((cell, index) => {
      const prev = boa.cells[index - 1];
      const jump = prev && Math.abs(prev.x - cell.x) + Math.abs(prev.y - cell.y) > 1;
      if (!index || jump) ctx.moveTo(mid(cell.x) * S, mid(cell.y) * S);
      else ctx.lineTo(mid(cell.x) * S, mid(cell.y) * S);
    });
    ctx.stroke();
    ctx.restore();

    for (const lump of boa.lumps) {
      const cell = boa.cells[lump.pos];
      if (cell) dot(mid(cell.x), mid(cell.y), INK, size * 0.5);
    }

    const head = boa.cells[0];
    if (head) {
      dot(mid(head.x), mid(head.y), INK, size * 0.5);
      /* глаза смотрят по ходу и разведены поперёк него */
      const [dx, dy] = boa.dir;
      const eye = size * 0.17;
      for (const side of [-1, 1]) {
        dot(
          mid(head.x) + dx * eye + dy * side * eye,
          mid(head.y) + dy * eye - dx * side * eye,
          PAPER,
          size * 0.09,
        );
      }
    }

    if (boa.apple && !boa.dead) {
      dot(mid(boa.apple.x), mid(boa.apple.y), on('paint') ? RED : INK, size * 0.34);
    }

    if (boa.dead && on('paint')) dot(mid(boa.dead.x), mid(boa.dead.y), RED, size * 0.5);

    const full = Math.round((boa.lumps.length / Math.max(1, boa.cells.length)) * 100);
    const share = Math.round((boaCovered() / boa.letter) * 100);
    if (boa.dead) drawStatus(boa.dead.wall ? 'край' : 'укус', true);
    else if (boa.done) drawStatus('буква налита', false);
    else drawStatus(`налито ${full}% · буква ${share}%`, false);
  },
};

startLab({
  title: 'З · две дуги и горловина',
  modes: MODES,
  start: 'zator',
});
