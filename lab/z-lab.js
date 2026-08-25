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
/* Углы буквы — целыми клетками базовой сетки 21x21, как их видно на экране и
   как их удобно нарисовать в макете. Другая сетка получает то же начертание
   пересчётом.

   У печатной З середина — точка возврата: линия входит туда и выходит обратно
   по себе же. Змейка так не умеет, ей нужны две параллельные нитки, и середина
   буквы получается двойной. Поэтому заход держим неглубоким — на треть ширины:
   глубокая полка режет букву пополам, и вместо З читается Э. */
const BOA_GRID = 20;
const BOA_TURNS = [
  [6, 2], [16, 2], [16, 7],
  [15, 7], [15, 8], [13, 8], [13, 10],
  [16, 10], [16, 18], [4, 18],
];

function boaRoute(grid) {
  const nodes = BOA_TURNS.map(([x, y]) => ({
    x: clamp(Math.round((x / BOA_GRID) * grid), 0, grid - 1),
    y: clamp(Math.round((y / BOA_GRID) * grid), 0, grid - 1),
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

/* яблоко падает только на саму букву, на клетку, которую тело сейчас не занимает:
   пока змейка лежит в З целиком, класть яблоко некуда — оно появится, как только
   она сойдёт с буквы, и позовёт вернуться ровно туда, где её не хватает */
function boaApple() {
  const taken = new Set(boa.cells.map((cell) => snakeKey(cell.x, cell.y)));
  const free = boa.route.filter((cell) => !taken.has(snakeKey(cell.x, cell.y)));
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
    /* доехавшая шишка дальше едет вместе с телом, а не отстаёт от него:
       на отрисовке это разные движения */
    lump.stuck = lump.pos >= ahead;
  });

  /* одно яблоко — одна шишка */
  if (boa.apple && boa.apple.x === x && boa.apple.y === y) {
    if (boa.lumps.length <= limit) boa.lumps.push({ pos: 0, stuck: false });
    boaApple();
  }
  /* на букве могло не быть свободной клетки — пробуем каждый ход */
  if (!boa.apple) boaApple();

  if (boa.lumps.length > limit && boaCovered() === boa.letter) boa.done = true;
}

/* Углы клеточной ломаной срезаются по Чайкину: змейка живая, и на прямых углах
   она выглядит гнутой проволокой. Вместе с точками ведём и `s` — место в теле,
   к которому привязаны шишки, — иначе после сглаживания они бы поехали. */
function boaSmooth(points, passes = 2) {
  let list = points;
  for (let pass = 0; pass < passes; pass += 1) {
    const out = [list[0]];
    for (let i = 0; i < list.length - 1; i += 1) {
      const a = list[i];
      const b = list[i + 1];
      if (b.gap) { out.push(b); continue; }
      const cut = (mix) => ({
        x: lerp(a.x, b.x, mix), y: lerp(a.y, b.y, mix), s: lerp(a.s, b.s, mix), gap: false,
      });
      out.push(cut(0.25), cut(0.75));
    }
    out.push(list.at(-1));
    list = out;
  }
  return list;
}

function boaSpine(t) {
  const cells = boa.cells;
  const head = cells[0];
  const points = [{ x: head.x + boa.dir[0] * t, y: head.y + boa.dir[1] * t, s: 0, gap: false }];
  cells.forEach((cell, index) => {
    const prev = index ? cells[index - 1] : head;
    const gap = Math.abs(cell.x - prev.x) + Math.abs(cell.y - prev.y) > 1;
    points.push({ x: cell.x, y: cell.y, s: t + index, gap });
  });
  const last = points.at(-1);
  const before = cells[cells.length - 2];
  if (before && !last.gap) {
    last.x = lerp(last.x, before.x, t);
    last.y = lerp(last.y, before.y, t);
    last.s -= t;
  }
  return boaSmooth(points);
}

function boaAlong(spine, along) {
  if (along <= 0) return spine[0];
  for (let i = 1; i < spine.length; i += 1) {
    if (spine[i].s < along) continue;
    if (spine[i].gap) return null;
    const back = spine[i - 1];
    const span = spine[i].s - back.s;
    const mix = span > 0.000001 ? (along - back.s) / span : 0;
    return { x: lerp(back.x, spine[i].x, mix), y: lerp(back.y, spine[i].y, mix) };
  }
  return spine.at(-1);
}

/* Толщина вдоль тела. Шишка — настоящий шар, а не гауссов холм: у холма бока
   пологие, и соседние шишки сливаются в колбасу. Шары же сходятся узкой
   вогнутой перетяжкой, а с линией сопрягаются мягким максимумом — он даёт
   галтель у основания вместо стыка поперёк хода. */
const BOA_LINE = 0.26;
const BOA_BALL = 0.5;
const BOA_HEAD = 0.56;
const BOA_MELT = 0.06;
/* хвост сходит на нет: без этого змейка обрывается круглым штампом */
const BOA_TAIL = 1.6;

function boaSmax(a, b, k) {
  const mix = clamp(0.5 + (0.5 * (a - b)) / k, 0, 1);
  return lerp(b, a, mix) + k * mix * (1 - mix);
}

function boaBall(radius, offset) {
  const rest = radius * radius - offset * offset;
  return rest > 0 ? Math.sqrt(rest) : 0;
}

function boaRadius(along, t, tail) {
  let ball = boaBall(BOA_HEAD, along);
  for (const lump of boa.lumps) {
    const at = lump.stuck ? lump.pos : lump.pos + t;
    ball = Math.max(ball, boaBall(BOA_BALL, along - at));
  }
  const thick = boaSmax(ball, BOA_LINE, BOA_MELT);
  const left = clamp((tail - along) / BOA_TAIL, 0, 1);
  return thick * (0.22 + 0.78 * Math.sqrt(left));
}

/* Куда смотреть: на яблоко, а без него — по ходу. */
function boaGaze(head) {
  const target = boa.apple;
  if (!target) return { x: boa.dir[0], y: boa.dir[1] };
  const dx = target.x - head.x;
  const dy = target.y - head.y;
  const away = Math.hypot(dx, dy);
  return away < 0.001 ? { x: boa.dir[0], y: boa.dir[1] } : { x: dx / away, y: dy / away };
}

MODES.boa = {
  label: 'удав',
  note: 'Длина тела не меняется и равна контуру З: змейка это и есть буква, а тонкая — только её след. Яблоко становится шишкой, шишка уходит к хвосту, и буква наливается с конца. Яблоко встаёт на клетку буквы, свободную от тела: чтобы поесть, надо с буквы сойти и уложиться в неё заново. Стрелки или ведение по кадру.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'grid', label: 'сетка', min: 12, max: 28, step: 4, value: 20 },
    { type: 'range', key: 'speed', label: 'темп', min: 2, max: 14, step: 1, value: 6 },
    { type: 'range', key: 'ease', label: 'плавность', min: 0, max: 1, step: 0.1, value: 0.7 },
    { type: 'toggle', key: 'trace', label: 'пропись', value: true },
    { type: 'toggle', key: 'cells', label: 'клетки', value: false },
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
    const running = boa.started && !boa.dead && !boa.done;
    const raw = running ? clamp(boa.tick, 0, 1) : 0;
    const t = raw * raw * (3 - 2 * raw) * num('ease');
    const spine = boaSpine(t);
    const tail = spine.at(-1).s;

    if (on('cells')) {
      for (let y = 0; y < boa.grid; y += 1) {
        for (let x = 0; x < boa.grid; x += 1) dot(mid(x), mid(y), ink(0.06), size * 0.03);
      }
    }

    /* пропись — та же буква той же гнутой линией, только вполсилы: видно,
       куда укладываться, и это разметка, а не крошка по клеткам */
    if (on('trace')) {
      const line = boaSmooth(boa.route.map((cell, index) => (
        { x: cell.x, y: cell.y, s: index, gap: false }
      )));
      ctx.save();
      ctx.strokeStyle = ink(0.11);
      ctx.lineWidth = BOA_LINE * 1.2 * size * S;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      line.forEach((point, index) => {
        const at = [mid(point.x) * S, mid(point.y) * S];
        if (index) ctx.lineTo(at[0], at[1]);
        else ctx.moveTo(at[0], at[1]);
      });
      ctx.stroke();
      ctx.restore();
    }

    /* тело ведём кистью переменного радиуса: шаг мельче галтели, иначе на
       крутом боку шара кисть оставит ступеньки */
    ctx.fillStyle = INK;
    for (let along = 0; along <= tail; along += 0.04) {
      const point = boaAlong(spine, along);
      if (!point) continue;
      const radius = boaRadius(along, t, tail);
      ctx.beginPath();
      ctx.arc(mid(point.x) * S, mid(point.y) * S, radius * size * S, 0, Math.PI * 2);
      ctx.fill();
    }

    const head = spine[0];
    if (head) {
      const gaze = boaGaze(head);
      const [dx, dy] = boa.dir;
      const hx = mid(head.x);
      const hy = mid(head.y);

      /* язык показывается изредка и ненадолго — змея, а не вилка на палке */
      const beat = (performance.now() / 1000) % 2.1;
      if (!boa.dead && beat < 0.26) {
        const out = (beat < 0.13 ? beat : 0.26 - beat) / 0.13;
        ctx.save();
        ctx.strokeStyle = INK;
        ctx.lineWidth = size * 0.055 * S;
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
          const long = (BOA_HEAD + 0.5 * out) * size;
          const fork = 0.16 * out * size;
          ctx.beginPath();
          ctx.moveTo((hx + dx * BOA_HEAD * size * 0.8) * S, (hy + dy * BOA_HEAD * size * 0.8) * S);
          ctx.quadraticCurveTo(
            (hx + dx * long * 0.7) * S,
            (hy + dy * long * 0.7) * S,
            (hx + dx * long + dy * side * fork) * S,
            (hy + dy * long - dx * side * fork) * S,
          );
          ctx.stroke();
        }
        ctx.restore();
      }

      /* глаза поперёк хода, зрачки следят за яблоком */
      const spread = BOA_HEAD * 0.46 * size;
      const shift = BOA_HEAD * 0.2 * size;
      const white = size * 0.17;
      const pupil = size * 0.075;
      for (const side of [-1, 1]) {
        const ex = hx + dx * shift + dy * side * spread;
        const ey = hy + dy * shift - dx * side * spread;
        dot(ex, ey, PAPER, white);
        if (boa.dead) {
          /* закрытые глаза: змейка приехала */
          ctx.save();
          ctx.strokeStyle = INK;
          ctx.lineWidth = size * 0.05 * S;
          ctx.lineCap = 'round';
          for (const turn of [-1, 1]) {
            const arm = white * 0.62;
            ctx.beginPath();
            ctx.moveTo((ex - arm) * S, (ey - arm * turn) * S);
            ctx.lineTo((ex + arm) * S, (ey + arm * turn) * S);
            ctx.stroke();
          }
          ctx.restore();
        } else {
          dot(ex + gaze.x * (white - pupil), ey + gaze.y * (white - pupil), INK, pupil);
        }
      }
    }

    if (boa.apple && !boa.dead) {
      dot(mid(boa.apple.x), mid(boa.apple.y), on('paint') ? RED : INK, size * 0.3);
    }

    const full = Math.round((boa.lumps.length / Math.max(1, boa.cells.length)) * 100);
    if (boa.dead) drawStatus(boa.dead.wall ? 'край' : 'укус', on('paint'));
    else if (boa.done) drawStatus('буква налита', false);
    else drawStatus(`налито ${full}%`, false);
  },
};

/* ---------- 10. удав по дуге: то же тело, снятое с сетки ---------- */

/* У сеточного удава буква получается ортогональной: клетка воюет с дугой, и
   горловину пришлось делать мелкой, иначе читается Э. Здесь механика та же —
   длина не меняется, яблоко становится шишкой, шишка уходит к хвосту, — но
   тело проложено по самой прописи. Форма достаётся буквой, а не сеткой.

   Укуса себя тут нет намеренно: З в горловине подходит к себе вплотную, и
   правильно написанная буква убивала бы игрока. */

const COIL_N = 48;
const coil = { pts: [], dir: 0, seg: 0.03, lumps: [], apple: null, dead: null, done: false, started: false };

function coilLay() {
  /* Голова там, где З дописывается, хвост — где начата. */
  coil.pts = resample(PRINT_PATH, COIL_N).reverse().map((point) => ({ x: point.x, y: point.y }));
  coil.seg = PRINT_PATH.length / (COIL_N - 1);
  const head = coil.pts[0];
  const next = coil.pts[1] || head;
  coil.dir = Math.atan2(head.y - next.y, head.x - next.x);
}

function coilApple() {
  for (let tries = 0; tries < 200; tries += 1) {
    const x = 0.08 + Math.random() * 0.84;
    const y = 0.08 + Math.random() * 0.84;
    if (coil.pts.every((point) => Math.hypot(point.x - x, point.y - y) > coil.seg * 2.2)) {
      coil.apple = { x, y };
      return;
    }
  }
  coil.apple = null;
}

function coilReset() {
  coilLay();
  coil.lumps = [];
  coil.apple = null;
  coil.dead = null;
  coil.done = false;
  coil.started = false;
  coilApple();
}

/* Считаем накрытую пропись, а не тело: свернувшийся вдвое удав по телу дал бы
   сто процентов, хотя половина буквы осталась бы пустой. */
function coilCovered() {
  const checks = 40;
  let hit = 0;
  for (let i = 0; i < checks; i += 1) {
    const mark = pointAt(PRINT_PATH, i / (checks - 1));
    if (coil.pts.some((point) => Math.hypot(point.x - mark.x, point.y - mark.y) < coil.seg)) hit += 1;
  }
  return hit / checks;
}

function coilAt(pos) {
  const last = coil.pts.length - 1;
  const i = clamp(Math.floor(pos), 0, last);
  const j = Math.min(i + 1, last);
  const t = clamp(pos - i, 0, 1);
  return { x: lerp(coil.pts[i].x, coil.pts[j].x, t), y: lerp(coil.pts[i].y, coil.pts[j].y, t) };
}

function coilAdvance() {
  if (coil.dead || coil.done) return;

  const speed = num('speed') * STEP;
  const turn = num('turn') * STEP;
  const head = coil.pts[0];

  if (pointer.seen) {
    const want = Math.atan2(pointer.y - head.y, pointer.x - head.x);
    coil.dir += clamp(wrapAngle(want - coil.dir), -turn, turn);
  }

  const x = head.x + Math.cos(coil.dir) * speed;
  const y = head.y + Math.sin(coil.dir) * speed;
  if (x < 0 || y < 0 || x > 1 || y > 1) {
    coil.dead = { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
    return;
  }
  head.x = x;
  head.y = y;

  /* Тело идёт следом: каждая точка держит свой отрезок до предыдущей. */
  for (let i = 1; i < coil.pts.length; i += 1) {
    const a = coil.pts[i - 1];
    const b = coil.pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    b.x = a.x + (dx / d) * coil.seg;
    b.y = a.y + (dy / d) * coil.seg;
  }

  /* Шишка едет к хвосту тем же ходом, что и тело, и упирается в соседа. */
  const rate = speed / coil.seg;
  const last = coil.pts.length - 1;
  coil.lumps.forEach((lump, index) => {
    const ahead = index ? coil.lumps[index - 1].pos - 1 : last;
    lump.pos = Math.min(lump.pos + rate, ahead);
  });

  if (coil.apple && Math.hypot(head.x - coil.apple.x, head.y - coil.apple.y) < coil.seg) {
    if (coil.lumps.length <= last) coil.lumps.push({ pos: 0 });
    coilApple();
  }

  if (coil.lumps.length > last && coilCovered() > 0.999) coil.done = true;
}

MODES.coil = {
  label: 'удав по дуге',
  note: 'Тот же удав, но тело проложено по прописи, а не по клеткам: форму даёт сама буква. Веди курсором — голова поворачивает за ним, тело идёт следом. Яблоко становится шишкой, шишка уходит к хвосту, и буква наливается с конца. Себя тут кусать нельзя: в горловине З подходит к себе вплотную.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'speed', label: 'ход', min: 0.1, max: 0.8, step: 0.05, value: 0.35 },
    { type: 'range', key: 'turn', label: 'поворот', min: 1, max: 8, step: 0.5, value: 3.5 },
    { type: 'toggle', key: 'trace', label: 'пропись', value: true },
    { type: 'toggle', key: 'paint', label: 'краска', value: true },
    { type: 'button', label: 'заново', action: () => coilReset() },
  ],
  setup() { coilReset(); },
  onMove() { coil.started = true; },
  onKey(event, down) {
    if (!down) return;
    if (event.code === 'ArrowLeft') coil.dir -= 0.25;
    else if (event.code === 'ArrowRight') coil.dir += 0.25;
    else return;
    event.preventDefault();
    coil.started = true;
  },
  step() {
    if (!coil.started) return;
    coilAdvance();
  },
  draw() {
    if (on('trace')) drawSamples(PRINT_PATH, ink(0.09), 0.05);

    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.025 * S;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    coil.pts.forEach((point, index) => {
      if (index) ctx.lineTo(point.x * S, point.y * S);
      else ctx.moveTo(point.x * S, point.y * S);
    });
    ctx.stroke();
    ctx.restore();

    for (const lump of coil.lumps) {
      const point = coilAt(lump.pos);
      dot(point.x, point.y, INK, 0.025);
    }

    const head = coil.pts[0];
    dot(head.x, head.y, INK, 0.025);
    for (const side of [-1, 1]) {
      dot(
        head.x + Math.cos(coil.dir) * 0.009 - Math.sin(coil.dir) * side * 0.009,
        head.y + Math.sin(coil.dir) * 0.009 + Math.cos(coil.dir) * side * 0.009,
        PAPER,
        0.005,
      );
    }

    if (coil.apple && !coil.dead) dot(coil.apple.x, coil.apple.y, on('paint') ? RED : INK, 0.017);
    if (coil.dead && on('paint')) dot(coil.dead.x, coil.dead.y, RED, 0.025);

    const full = Math.round((coil.lumps.length / coil.pts.length) * 100);
    const share = Math.round(coilCovered() * 100);
    if (coil.dead) drawStatus('край', true);
    else if (coil.done) drawStatus('буква налита', false);
    else drawStatus(`налито ${full}% · буква ${share}%`, false);
  },
};

/* ---------- 11. рост: змейка вырастает в букву ---------- */

/* Классическая змейка, откалиброванная под букву: каждое яблоко удлиняет тело
   ровно на свой кусок прописи, поэтому к последнему яблоку змея по длине равна
   З. Она не рисует букву и не наливает её — она в неё вырастает.

   Букву задаёт не точность, а обстановка. Блоки стоят в чашах З: обошёл
   верхний — получил верхнюю дугу, обошёл нижний — нижнюю. Яблоки зреют по
   очереди, иначе игрок разворачивается за отставшим и ломает след.

   Тело идёт по следу головы, поэтому буква выходит почерком игрока: кривовато
   обошёл — вышла рукописная з с характером, а не промах. */

const GROW_SEG = 0.012;

const grow = {
  trail: [], len: 0, dir: 0, apples: [], next: 0,
  blocks: [], dead: null, done: false, started: false,
};

/* У З нет замкнутых просветов — обе чаши открыты влево. Поэтому крупные блоки
   стоят не «внутри», а в центрах кривизны дуг: обходя такой блок, змея выписывает
   ровно свою дугу. Центры и радиусы подогнаны окружностью по точкам прописи.
   Мелкие держат поле и не дают срезать напрямик. */
function growBlocks() {
  return [
    { x: 0.493, y: 0.312, r: 0.070, big: true },
    { x: 0.525, y: 0.639, r: 0.078, big: true },
    { x: 0.120, y: 0.120, r: 0.055 },
    { x: 0.130, y: 0.620, r: 0.065 },
    { x: 0.930, y: 0.380, r: 0.060 },
    { x: 0.900, y: 0.900, r: 0.050 },
  ];
}

function growReset() {
  const count = Math.round(num('apples'));
  grow.apples = [];
  /* Первое яблоко не в начале прописи: там стоит сама змея. */
  for (let i = 1; i <= count; i += 1) {
    const mark = pointAt(PRINT_PATH, i / count);
    grow.apples.push({ x: mark.x, y: mark.y });
  }
  grow.blocks = growBlocks();
  grow.next = 0;
  grow.dead = null;
  grow.done = false;
  grow.started = false;

  const start = pointAt(PRINT_PATH, 0);
  grow.dir = Math.atan2(start.ty, start.tx);
  grow.len = PRINT_PATH.length / count * 0.35;
  grow.trail = [{ x: start.x, y: start.y }];
  for (let i = 1; i < 6; i += 1) {
    grow.trail.push({
      x: start.x - Math.cos(grow.dir) * GROW_SEG * i,
      y: start.y - Math.sin(grow.dir) * GROW_SEG * i,
    });
  }
}

function growBodyCount() {
  return Math.max(2, Math.round(grow.len / GROW_SEG));
}

function growHitsBlock(x, y, pad) {
  return grow.blocks.some((b) => Math.hypot(x - b.x, y - b.y) < b.r + pad);
}

/* Накрытая пропись — мягкая оценка почерка, а не пропуск дальше. */
function growCovered() {
  const checks = 40;
  const body = grow.trail.slice(0, growBodyCount());
  let hit = 0;
  for (let i = 0; i < checks; i += 1) {
    const mark = pointAt(PRINT_PATH, i / (checks - 1));
    if (body.some((p) => Math.hypot(p.x - mark.x, p.y - mark.y) < 0.05)) hit += 1;
  }
  return hit / checks;
}

function growAdvance() {
  if (grow.dead || grow.done) return;

  const speed = num('speed') * STEP;
  const turn = num('turn') * STEP;
  const head = grow.trail[0];

  if (pointer.seen) {
    const want = Math.atan2(pointer.y - head.y, pointer.x - head.x);
    grow.dir += clamp(wrapAngle(want - grow.dir), -turn, turn);
  }

  const x = head.x + Math.cos(grow.dir) * speed;
  const y = head.y + Math.sin(grow.dir) * speed;

  if (x < 0.01 || y < 0.01 || x > 0.99 || y > 0.99) {
    grow.dead = { x: clamp(x, 0, 1), y: clamp(y, 0, 1), why: 'край' };
    return;
  }
  if (growHitsBlock(x, y, 0.022)) {
    grow.dead = { x, y, why: 'блок' };
    return;
  }

  /* Голова живая и ходит свободно; узел закрепляется, когда она отошла от
     предыдущего на шаг. Мерить от самой головы нельзя — она движется вместе
     с меркой, и узлы не закрепляются никогда. */
  head.x = x;
  head.y = y;
  const anchor = grow.trail[1];
  if (!anchor || Math.hypot(x - anchor.x, y - anchor.y) >= GROW_SEG) {
    grow.trail.unshift({ x, y });
  }

  /* След держим на всю будущую длину: хвост вытягивается в прошлое, и подрезка
     по текущему телу выбросила бы историю раньше, чем змея до неё дорастёт. */
  const room = Math.round((PRINT_PATH.length * 1.4) / GROW_SEG) + 60;
  while (grow.trail.length > room) grow.trail.pop();

  if (on('bite')) {
    const live = grow.trail.slice(10, body);
    if (live.some((p) => Math.hypot(p.x - x, p.y - y) < 0.024)) {
      grow.dead = { x, y, why: 'укус' };
      return;
    }
  }

  const apple = grow.apples[grow.next];
  if (apple && Math.hypot(x - apple.x, y - apple.y) < 0.038) {
    grow.len += PRINT_PATH.length / grow.apples.length;
    grow.next += 1;
    if (grow.next >= grow.apples.length) grow.done = true;
  }
}

MODES.grow = {
  label: 'рост',
  note: 'Змейка вырастает в букву: каждое яблоко удлиняет тело ровно на свой кусок прописи, и к последнему яблоку змея по длине равна З. Блоки стоят в просветах буквы — обошёл верхний и нижний, получил две дуги. Яблоки зреют по очереди. Веди курсором; буква выйдет твоим почерком.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'speed', label: 'ход', min: 0.1, max: 0.9, step: 0.05, value: 0.3 },
    /* Горловина З ломается почти назад: радиус разворота (ход/поворот) должен
       быть заметно меньше прохода, иначе змею сносит в блок. */
    { type: 'range', key: 'turn', label: 'поворот', min: 2, max: 14, step: 0.5, value: 9 },
    { type: 'range', key: 'apples', label: 'яблок', min: 4, max: 12, step: 1, value: 7 },
    { type: 'toggle', key: 'bite', label: 'укус', value: false },
    { type: 'toggle', key: 'trace', label: 'пропись', value: false },
    { type: 'toggle', key: 'paint', label: 'краска', value: true },
    { type: 'button', label: 'заново', action: () => growReset() },
  ],
  setup() { growReset(); },
  onTool(key) { if (key === 'apples') growReset(); },
  onMove() { grow.started = true; },
  step() {
    if (!grow.started) return;
    growAdvance();
  },
  draw() {
    if (on('trace')) drawSamples(PRINT_PATH, ink(0.08), 0.05);

    /* Блоки — поле, а не метка: светлый тон чернил, не вторая краска. */
    for (const b of grow.blocks) {
      ctx.fillStyle = ink(b.big ? 0.075 : 0.05);
      ctx.beginPath();
      ctx.arc(b.x * S, b.y * S, b.r * S, 0, Math.PI * 2);
      ctx.fill();
    }

    grow.apples.forEach((apple, index) => {
      if (index < grow.next) return;
      const ripe = index === grow.next;
      dot(apple.x, apple.y, ripe ? (on('paint') ? RED : INK) : 'transparent', 0.021);
      if (!ripe) {
        ctx.strokeStyle = ink(0.3);
        ctx.lineWidth = 0.005 * S;
        ctx.beginPath();
        ctx.arc(apple.x * S, apple.y * S, 0.021 * S, 0, Math.PI * 2);
        ctx.stroke();
      }
      /* Листик чернильный: краска в кадре одна, и она у спелого яблока. */
      ctx.fillStyle = ink(ripe ? 0.55 : 0.3);
      ctx.beginPath();
      ctx.moveTo(apple.x * S, (apple.y - 0.021) * S);
      ctx.quadraticCurveTo((apple.x + 0.016) * S, (apple.y - 0.036) * S, (apple.x + 0.019) * S, (apple.y - 0.019) * S);
      ctx.quadraticCurveTo((apple.x + 0.008) * S, (apple.y - 0.018) * S, apple.x * S, (apple.y - 0.021) * S);
      ctx.fill();
    });

    const body = grow.trail.slice(0, growBodyCount());
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.048 * S;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    body.forEach((point, index) => {
      if (index) ctx.lineTo(point.x * S, point.y * S);
      else ctx.moveTo(point.x * S, point.y * S);
    });
    ctx.stroke();
    ctx.restore();

    const head = body[0];
    dot(head.x, head.y, INK, 0.029);
    for (const side of [-1, 1]) {
      dot(
        head.x + Math.cos(grow.dir) * 0.010 - Math.sin(grow.dir) * side * 0.010,
        head.y + Math.sin(grow.dir) * 0.010 + Math.cos(grow.dir) * side * 0.010,
        PAPER,
        0.005,
      );
    }

    if (grow.dead && on('paint')) dot(grow.dead.x, grow.dead.y, RED, 0.026);

    const share = Math.round(growCovered() * 100);
    if (grow.dead) drawStatus(grow.dead.why, true);
    else if (grow.done) drawStatus(`буква написана · почерк ${share}%`, false);
    else drawStatus(`яблок ${grow.next} / ${grow.apples.length}`, false);
  },
};

/* ---------- 12. эскиз 1: классическая змейка по макету ---------- */

const SKETCH1_BODY = (() => {
  const commands = [
    ['L', 840, 220],
    ['C', 856.569, 220, 870, 233.431, 870, 250],
    ['L', 870, 420],
    ['C', 870, 436.569, 856.569, 450, 840, 450],
    ['L', 784.178, 450],
    ['C', 767.934, 450, 754.641, 462.929, 754.19, 479.167],
    ['L', 753.31, 510.833],
    ['C', 752.859, 527.071, 739.566, 540, 723.322, 540],
    ['L', 620, 540],
    ['C', 603.431, 540, 590, 553.431, 590, 570],
    ['L', 590, 640],
    ['C', 590, 656.569, 603.431, 670, 620, 670],
    ['L', 840, 670],
    ['C', 856.568, 670, 870, 683.431, 870, 700],
    ['L', 870, 972],
    ['C', 870, 988.569, 856.569, 1002, 840, 1002],
    ['L', 439, 1002],
  ];
  const samples = [];
  let from = [470, 220];
  let length = 0;
  const put = (x, y) => {
    const point = { x: x / 1200, y: y / 1200 };
    if (samples.length) length += Math.hypot(point.x - samples.at(-1).x, point.y - samples.at(-1).y);
    samples.push({ ...point, length });
  };
  put(...from);
  for (const command of commands) {
    const cubicCommand = command[0] === 'C';
    const to = cubicCommand ? command.slice(5, 7) : command.slice(1, 3);
    const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const steps = Math.max(2, Math.ceil(distance / 8));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      if (!cubicCommand) {
        put(lerp(from[0], to[0], t), lerp(from[1], to[1], t));
        continue;
      }
      const u = 1 - t;
      const x = u ** 3 * from[0] + 3 * u * u * t * command[1]
        + 3 * u * t * t * command[3] + t ** 3 * command[5];
      const y = u ** 3 * from[1] + 3 * u * u * t * command[2]
        + 3 * u * t * t * command[4] + t ** 3 * command[6];
      put(x, y);
    }
    from = to;
  }
  samples.forEach((point) => { point.u = point.length / length; });
  return { samples, length };
})();

const SKETCH1_BLOCKS = [
  { x: 600 / 1200, y: 380 / 1200, r: 100 / 1200 },
  { x: 600 / 1200, y: 840 / 1200, r: 100 / 1200 },
  { x: 710 / 1200, y: 610 / 1200, r: 30 / 1200 },
  { x: 490 / 1200, y: 610 / 1200, r: 30 / 1200 },
];

/* Шесть невидимых зон со схемы. Их порядок ведёт голову вокруг всей формы:
   верх → правый верх → горловина → правый низ → низ → левая сторона. */
const SKETCH1_APPLE_ZONES = [
  [[0.27, 0.06], [0.90, 0.08], [0.63, 0.265], [0.52, 0.225], [0.42, 0.275]],
  [[0.91, 0.09], [0.94, 0.58], [0.61, 0.455], [0.61, 0.295]],
  [[0.43, 0.435], [0.58, 0.435], [0.54, 0.51], [0.57, 0.585], [0.44, 0.585], [0.47, 0.51]],
  [[0.61, 0.545], [0.72, 0.50], [0.94, 0.60], [0.94, 0.93], [0.61, 0.98]],
  [[0.38, 0.81], [0.58, 0.81], [0.58, 0.98], [0.25, 0.98]],
  [[0.12, 0.005], [0.39, 0.26], [0.35, 0.45], [0.40, 0.77], [0.26, 0.89], [0.12, 0.94], [0.08, 0.48]],
];

const sketch1 = {
  points: [], segment: 0, dir: Math.PI, apple: null,
  dots: [], eaten: 0, best: 0, zone: 0, dead: null,
  full: false, finishing: false, started: false, mouseTarget: false,
};

function sketch1Ink() { return on('night') ? PAPER : INK; }
function sketch1Paper() { return on('night') ? INK : PAPER; }

function sketch1Reset() {
  const count = Math.round(SKETCH1_BODY.length / 0.009) + 1;
  sketch1.points = resample(SKETCH1_BODY, count).reverse();
  sketch1.segment = SKETCH1_BODY.length / (count - 1);
  sketch1.dir = Math.PI;
  sketch1.dots = [];
  sketch1.eaten = 0;
  sketch1.zone = 0;
  sketch1.dead = null;
  sketch1.full = false;
  sketch1.finishing = false;
  sketch1.started = false;
  sketch1.mouseTarget = false;
  sketch1Apple();
}

function sketch1DotLayout() {
  const inset = (38 / 1200) / sketch1.segment;
  const gap = (70 / 1200) / sketch1.segment;
  const headClear = (70 / 1200) / sketch1.segment;
  const tail = sketch1.points.length - 1 - inset;
  const capacity = Math.max(1, Math.floor((tail - headClear) / gap) + 1);
  return { gap, headClear, tail, capacity };
}

function sketch1Finish() {
  sketch1.full = true;
  sketch1.finishing = false;
  sketch1.apple = null;
  sketch1.best = Math.max(sketch1.best, sketch1.eaten);
}

function sketch1InZone(point, zone) {
  let inside = false;
  for (let i = 0, j = zone.length - 1; i < zone.length; j = i, i += 1) {
    const a = zone[i];
    const b = zone[j];
    const crosses = (a[1] > point.y) !== (b[1] > point.y)
      && point.x < ((b[0] - a[0]) * (point.y - a[1])) / (b[1] - a[1]) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function sketch1Apple() {
  const index = sketch1.zone % SKETCH1_APPLE_ZONES.length;
  const zone = SKETCH1_APPLE_ZONES[index];
  const xs = zone.map((point) => point[0]);
  const ys = zone.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  let best = null;

  for (let tries = 0; tries < 360; tries += 1) {
    const apple = { x: lerp(minX, maxX, Math.random()), y: lerp(minY, maxY, Math.random()), zone: index + 1 };
    if (!sketch1InZone(apple, zone)) continue;
    const bodyGap = Math.min(...sketch1.points.map((point) => Math.hypot(point.x - apple.x, point.y - apple.y)));
    const blockGap = Math.min(...SKETCH1_BLOCKS.map((block) => Math.hypot(block.x - apple.x, block.y - apple.y) - block.r));
    const score = Math.min(bodyGap, blockGap);
    if (!best || score > best.score) best = { apple, score };
    const clearBody = bodyGap > 0.058;
    const clearBlocks = blockGap > 0.038;
    if (clearBody && clearBlocks) {
      sketch1.apple = apple;
      sketch1.zone = (index + 1) % SKETCH1_APPLE_ZONES.length;
      return;
    }
  }
  sketch1.apple = best?.apple || null;
  sketch1.zone = (index + 1) % SKETCH1_APPLE_ZONES.length;
}

function sketch1Advance() {
  if (sketch1.dead || sketch1.full) return;
  const head = sketch1.points[0];
  const speed = num('speed') * STEP;
  const turn = num('turn') * STEP;
  const radius = 30 / 1200;
  if (on('mouse') && pointer.seen && sketch1.mouseTarget) {
    const dx = pointer.x - head.x;
    const dy = pointer.y - head.y;
    if (Math.hypot(dx, dy) <= radius * 2.2) {
      sketch1.mouseTarget = false;
    } else {
      const want = Math.atan2(dy, dx);
      sketch1.dir += clamp(wrapAngle(want - sketch1.dir), -turn, turn);
    }
  }

  const x = head.x + Math.cos(sketch1.dir) * speed;
  const y = head.y + Math.sin(sketch1.dir) * speed;
  const out = x < radius || y < radius || x > 1 - radius || y > 1 - radius;
  const block = SKETCH1_BLOCKS.some((item) => Math.hypot(x - item.x, y - item.y) < radius + item.r);
  const bite = on('bite') && sketch1.points.slice(9).some((point) => Math.hypot(x - point.x, y - point.y) < radius * 1.6);
  if (out || block || bite) {
    sketch1.dead = { x: clamp(x, radius, 1 - radius), y: clamp(y, radius, 1 - radius), why: out ? 'край' : block ? 'круг' : 'укус' };
    sketch1.best = Math.max(sketch1.best, sketch1.eaten);
    return;
  }

  head.x = x;
  head.y = y;
  /* Голова разбивается о круг, но тело только обтекает его. Несколько проходов
     по цепочке возвращают длину звеньев после выталкивания и не дают хвосту
     прорезать препятствие насквозь. */
  for (let pass = 0; pass < 4; pass += 1) {
    for (let i = 1; i < sketch1.points.length; i += 1) {
      const front = sketch1.points[i - 1];
      const point = sketch1.points[i];
      const dx = point.x - front.x;
      const dy = point.y - front.y;
      const distance = Math.hypot(dx, dy) || 1;
      point.x = front.x + (dx / distance) * sketch1.segment;
      point.y = front.y + (dy / distance) * sketch1.segment;

      for (const item of SKETCH1_BLOCKS) {
        const bx = point.x - item.x;
        const by = point.y - item.y;
        const away = Math.hypot(bx, by);
        const limit = item.r + radius;
        if (away >= limit) continue;
        const normalX = away > 0.000001 ? bx / away : -dy / distance;
        const normalY = away > 0.000001 ? by / away : dx / distance;
        point.x = item.x + normalX * limit;
        point.y = item.y + normalY * limit;
      }
    }
  }

  /* Метка идёт к хвосту ровно на столько звеньев, на сколько тело прошло через
     голову. В мировых координатах она сначала почти стоит на месте. Дошедшие
     до хвоста образуют ровную цепочку и едут дальше вместе с ним. */
  const layout = sketch1DotLayout();
  const dotRate = speed / sketch1.segment;
  sketch1.dots.forEach((mark, index) => {
    const limit = index ? Math.max(0, sketch1.dots[index - 1].pos - layout.gap) : layout.tail;
    mark.pos = Math.max(mark.pos, Math.min(mark.pos + dotRate, limit));
  });

  if (sketch1.finishing) {
    const last = sketch1.dots[sketch1.dots.length - 1];
    if (last && last.pos >= layout.headClear - 0.001) sketch1Finish();
    return;
  }

  if (sketch1.apple && Math.hypot(x - sketch1.apple.x, y - sketch1.apple.y) < radius * 2.05) {
    sketch1.eaten += 1;
    if (sketch1.dots.length < layout.capacity) sketch1.dots.push({ pos: 0 });
    if (!on('endless') && sketch1.dots.length >= layout.capacity) {
      sketch1.finishing = true;
      sketch1.apple = null;
    } else {
      sketch1Apple();
    }
  }
}

function sketch1At(pos) {
  const last = sketch1.points.length - 1;
  const i = clamp(Math.floor(pos), 0, last);
  const j = Math.min(i + 1, last);
  const mix = clamp(pos - i, 0, 1);
  return {
    x: lerp(sketch1.points[i].x, sketch1.points[j].x, mix),
    y: lerp(sketch1.points[i].y, sketch1.points[j].y, mix),
  };
}

function sketch1DrawApple() {
  if (!sketch1.apple || sketch1.dead) return;
  const apple = sketch1.apple;
  const radius = 30 / 1200;
  const leafScale = radius / 40.125;
  dot(apple.x, apple.y, on('paint') ? RED : sketch1Ink(), radius);
  ctx.fillStyle = sketch1Ink();
  ctx.beginPath();
  ctx.moveTo((apple.x + 26.75 * leafScale) * S, (apple.y - 66.875 * leafScale) * S);
  ctx.bezierCurveTo(
    (apple.x + 11.9764 * leafScale) * S,
    (apple.y - 66.875 * leafScale) * S,
    apple.x * S,
    (apple.y - 54.8986 * leafScale) * S,
    apple.x * S,
    (apple.y - 40.125 * leafScale) * S,
  );
  ctx.bezierCurveTo(
    (apple.x + 14.7736 * leafScale) * S,
    (apple.y - 40.125 * leafScale) * S,
    (apple.x + 26.75 * leafScale) * S,
    (apple.y - 52.1014 * leafScale) * S,
    (apple.x + 26.75 * leafScale) * S,
    (apple.y - 66.875 * leafScale) * S,
  );
  ctx.closePath();
  ctx.fill();
}

function sketch1DrawFace() {
  const head = sketch1.points[0];
  const dx = Math.cos(sketch1.dir);
  const dy = Math.sin(sketch1.dir);
  const normalX = dy;
  const normalY = -dx;
  const local = (x, y) => ({
    x: head.x + dx * (70 - x) / 1200 + normalX * (y - 30) / 1200,
    y: head.y + dy * (70 - x) / 1200 + normalY * (y - 30) / 1200,
  });
  const tongue = [
    [[30.0012, 27.1715], [24.8291, 21.9994], [35.1726, 22.0001]],
    [[10.0012, 27.1715], [4.82906, 21.9994], [15.1726, 22.0001]],
    [[35.1712, 38.0005], [24.8284, 37.9991], [29.9991, 32.8284]],
    [[15.1712, 38.0005], [4.82837, 37.9991], [9.99908, 32.8284]],
  ];

  let tongueVisible = false;
  if (sketch1.apple && !sketch1.dead) {
    const ax = sketch1.apple.x - head.x;
    const ay = sketch1.apple.y - head.y;
    const distance = Math.hypot(ax, ay) || 1;
    const facing = (ax * dx + ay * dy) / distance;
    tongueVisible = facing > 0.15 && distance < 0.14;
  }

  if (tongueVisible) {
    ctx.save();
    ctx.fillStyle = sketch1Ink();
    ctx.strokeStyle = sketch1Ink();
    ctx.lineWidth = 4 / 1200 * S;
    ctx.lineJoin = 'miter';
    for (const triangle of tongue) {
      ctx.beginPath();
      triangle.forEach(([x, y], index) => {
        const point = local(x, y);
        if (index) ctx.lineTo(point.x * S, point.y * S);
        else ctx.moveTo(point.x * S, point.y * S);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  for (const y of [20, 40]) {
    const eye = local(70, y);
    ctx.beginPath();
    ctx.arc(eye.x * S, eye.y * S, 5.071 / 1200 * S, 0, Math.PI * 2);
    ctx.fillStyle = sketch1.dead ? sketch1Paper() : sketch1Ink();
    ctx.fill();
    ctx.strokeStyle = sketch1Paper();
    ctx.lineWidth = 4 / 1200 * S;
    ctx.stroke();

    if (sketch1.dead) {
      const cross = [
        [64.6562, y + 5.6562, 75.97, y - 5.6575],
        [64.6562, y - 5.6562, 75.97, y + 5.6575],
      ];
      ctx.strokeStyle = sketch1Ink();
      ctx.lineWidth = 4 / 1200 * S;
      ctx.lineJoin = 'round';
      for (const [x1, y1, x2, y2] of cross) {
        const start = local(x1, y1);
        const end = local(x2, y2);
        ctx.beginPath();
        ctx.moveTo(start.x * S, start.y * S);
        ctx.lineTo(end.x * S, end.y * S);
        ctx.stroke();
      }
    }
  }
}

function sketch1DrawResult() {
  if (!sketch1.dead && !sketch1.full) return;
  const lines = [];
  if (sketch1.full) lines.push('спасибо, что покормили змею.');
  lines.push(`собрано яблок: ${sketch1.eaten}`);
  lines.push(`лучший результат: ${sketch1.best}`);

  ctx.save();
  ctx.fillStyle = MUTED;
  ctx.font = `${Math.round(S * 0.022)}px 'DM Mono', ui-monospace, monospace`;
  ctx.textAlign = 'right';
  lines.forEach((text, index) => ctx.fillText(text, S * 0.96, S * (0.06 + index * 0.032)));
  ctx.restore();
}

MODES.sketch1 = {
  label: 'эскиз 1',
  note: 'Классическая змейка в точной позе из макета: голова разбивается о круги, а тело и хвост огибают их. Яблоки по очереди обходят шесть зон вокруг формы. Съеденное яблоко становится светлой точкой и уходит к хвосту. Наполни тело или играй без конца. После финала кликни в любом месте кадра, чтобы начать новую партию.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'speed', label: 'скорость', min: 0.08, max: 0.55, step: 0.01, value: 0.19 },
    { type: 'range', key: 'turn', label: 'поворот', min: 1, max: 10, step: 0.5, value: 5 },
    { type: 'toggle', key: 'mouse', label: 'управление мышью', value: true },
    { type: 'toggle', key: 'bite', label: 'укус', value: true },
    { type: 'toggle', key: 'paint', label: 'краска', value: true },
    { type: 'toggle', key: 'night', label: 'ночь', value: true },
    { type: 'toggle', key: 'endless', label: 'бесконечная игра', value: false },
    { type: 'button', label: 'заново', action: () => sketch1Reset() },
  ],
  setup() {
    sketch1.best = 0;
    sketch1Reset();
  },
  onTool(key) {
    if (key === 'mouse' && !on('mouse')) {
      sketch1.mouseTarget = false;
      pointer.seen = false;
    }
    if (key === 'endless' && !sketch1.dead) {
      if (on('endless') && (sketch1.full || sketch1.finishing)) {
        sketch1.full = false;
        sketch1.finishing = false;
        sketch1Apple();
      } else if (!on('endless') && sketch1.dots.length >= sketch1DotLayout().capacity) {
        sketch1.full = false;
        sketch1.finishing = true;
        sketch1.apple = null;
      }
    }
  },
  onDown() {
    if (sketch1.dead || sketch1.full) {
      const mouse = on('mouse');
      sketch1Reset();
      sketch1.started = true;
      sketch1.mouseTarget = mouse;
      if (!mouse) pointer.seen = false;
      return;
    }
    if (!on('mouse')) return;
    sketch1.started = true;
    sketch1.mouseTarget = true;
  },
  onMove() {
    if (on('mouse') && sketch1.started) sketch1.mouseTarget = true;
  },
  onKey(event, down) {
    if (!down) return;
    const directions = {
      ArrowLeft: Math.PI,
      ArrowRight: 0,
      ArrowUp: -Math.PI / 2,
      ArrowDown: Math.PI / 2,
    };
    if (!(event.code in directions)) return;
    const next = directions[event.code];
    if (Math.abs(wrapAngle(next - sketch1.dir)) < Math.PI * 0.75) sketch1.dir = next;
    sketch1.started = true;
    sketch1.mouseTarget = false;
    pointer.seen = false;
    event.preventDefault();
  },
  step() {
    if (sketch1.started) sketch1Advance();
  },
  draw() {
    if (on('night')) {
      ctx.fillStyle = sketch1Paper();
      ctx.fillRect(0, 0, S, S);
      ctx.save();
      ctx.strokeStyle = MUTED;
      ctx.globalAlpha = 0.1;
      ctx.lineWidth = Math.max(0.5, S / 1200);
      ctx.beginPath();
      ctx.moveTo(S * 0.5, 0);
      ctx.lineTo(S * 0.5, S);
      ctx.moveTo(0, S * 0.5);
      ctx.lineTo(S, S * 0.5);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = sketch1Ink();
    ctx.lineWidth = Math.max(0.75, S / 1200);
    for (const block of SKETCH1_BLOCKS) {
      ctx.beginPath();
      ctx.arc(block.x * S, block.y * S, block.r * S, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = sketch1Ink();
    ctx.lineWidth = 60 / 1200 * S;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    sketch1.points.forEach((point, index) => {
      if (index) ctx.lineTo(point.x * S, point.y * S);
      else ctx.moveTo(point.x * S, point.y * S);
    });
    ctx.stroke();
    ctx.restore();

    for (const mark of sketch1.dots) {
      const point = sketch1At(mark.pos);
      dot(point.x, point.y, sketch1Paper(), 20 / 1200);
    }

    sketch1DrawApple();
    sketch1DrawFace();
    if (sketch1.dead || sketch1.full) sketch1DrawResult();
    else if (sketch1.started) drawStatus(`яблок ${sketch1.eaten}`);
  },
};

startLab({
  title: 'З · две дуги и горловина',
  modes: MODES,
  start: 'zator',
});
