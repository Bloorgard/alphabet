const Y_COLORS = ['#ff548a', '#ffb52e', '#38b5e5', '#9b78ef', '#a7cd39', '#ff7048'];
const yColor = (i) => num('palette') === 1 ? INK : Y_COLORS[((i % Y_COLORS.length) + Y_COLORS.length) % Y_COLORS.length];
const ySize = () => num('size') / 1000;
const yDistance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const yPoint = (x, y) => ({ x, y, px: x, py: y });

function yGlyph(x, y, h, angle, color, inflated = false, stretch = 1, squash = 1) {
  ctx.save();
  ctx.translate(x * S, y * S);
  ctx.rotate(angle);
  ctx.scale(h * S * stretch, h * S * squash);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(-0.36, -0.4);
    ctx.lineTo(-0.36, 0.4);
    ctx.lineTo(-0.15, 0.4);
    ctx.bezierCurveTo(0.26, 0.4, 0.26, -0.04, -0.14, -0.04);
    ctx.lineTo(-0.36, -0.04);
    ctx.moveTo(0.4, -0.4);
    ctx.lineTo(0.4, 0.4);
  };
  if (inflated) {
    trace();
    ctx.strokeStyle = ink(0.16);
    ctx.lineWidth = 0.255;
    ctx.stroke();
  }
  trace();
  ctx.strokeStyle = color;
  ctx.lineWidth = inflated ? 0.23 : 0.155;
  ctx.stroke();
  if (inflated) {
    ctx.translate(-0.025, -0.025);
    trace();
    ctx.strokeStyle = 'rgba(255,255,255,.38)';
    ctx.lineWidth = 0.035;
    ctx.stroke();
  }
  ctx.restore();
}

function yHint(text) {
  ctx.fillStyle = MUTED;
  ctx.font = `${Math.max(10, S * 0.018)}px 'DM Mono', monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(text, S * 0.5, S * 0.955);
  ctx.textAlign = 'left';
}

function yReset() {
  modeState = { strands: [], active: null, grab: null, time: 0, bodies: [], clock: 0, serial: 0 };
}

function yStroke(points, kind) {
  const strand = { points: [], size: ySize(), color: modeState.serial++, kind, age: 0 };
  modeState.strands.push(strand);
  for (const p of points) yAppend(strand, p.x, p.y);
  return strand;
}

function yAppend(strand, x, y) {
  const last = strand.points.at(-1);
  const spacing = strand.kind === 'noodles' ? strand.size * 0.11 : strand.size * 0.94;
  if (!last) {
    strand.points.push({ ...yPoint(x, y), fixed: strand.kind === 'garland', swing: 0, speed: 0 });
    return;
  }
  const length = Math.hypot(x - last.x, y - last.y);
  const count = Math.floor(length / spacing);
  for (let i = 1; i <= count && strand.points.length < 900; i++) {
    const t = i * spacing / length;
    strand.points.push({ ...yPoint(lerp(last.x, x, t), lerp(last.y, y, t)), fixed: false, swing: 0, speed: 0 });
  }
}

function yBegin(kind) {
  if (kind === 'garland') {
    let nearest = null;
    let distance = 0.045;
    for (const strand of modeState.strands) for (const p of strand.points) {
      const d = yDistance(p, pointer);
      if (d < distance) { nearest = p; distance = d; }
    }
    if (nearest) {
      modeState.grab = { point: nearest, fixed: nearest.fixed };
      nearest.fixed = true;
      return;
    }
  }
  if (modeState.strands.length >= 24) modeState.strands.shift();
  modeState.active = yStroke([pointer], kind);
}

function yMove() {
  if (!pointer.down) return;
  if (modeState.grab) {
    const p = modeState.grab.point;
    p.x = clamp(pointer.x, 0.015, 0.985);
    p.y = clamp(pointer.y, 0.03, 0.89);
  } else if (modeState.active) {
    yAppend(modeState.active, clamp(pointer.x, 0.015, 0.985), clamp(pointer.y, 0.03, 0.89));
  }
}

function yEnd() {
  if (modeState.grab) {
    modeState.grab.point.fixed = modeState.grab.fixed;
    modeState.grab = null;
  }
  if (modeState.active?.kind === 'garland') modeState.active.points.at(-1).fixed = true;
  modeState.active = null;
}

function yExample(kind) {
  yReset();
  for (let row = 0; row < 3; row++) {
    const points = [];
    for (let i = 0; i <= 180; i++) {
      const t = i / 180;
      points.push({
        x: 0.1 + t * 0.8,
        y: 0.19 + row * 0.24 + Math.sin(t * Math.PI * (kind === 'garland' ? 1 : 2) + (kind === 'garland' ? 0 : row)) * 0.075,
      });
    }
    const strand = yStroke(points, kind);
    if (kind === 'garland') strand.points.at(-1).fixed = true;
  }
}

function yGarlandStep() {
  modeState.time += STEP;
  for (const strand of modeState.strands) {
    if (strand === modeState.active) continue;
    const points = strand.points;
    for (const p of points) {
      if (p.fixed) continue;
      const vx = (p.x - p.px) * 0.985;
      const vy = (p.y - p.py) * 0.985;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + 0.000085 * num('weight');
    }
    for (let pass = 0; pass < 10; pass++) {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        const d = yDistance(a, b) || 0.0001;
        const correction = (d - strand.size * 0.97) / d;
        const movable = Number(!a.fixed) + Number(!b.fixed);
        if (!movable) continue;
        const dx = (b.x - a.x) * correction / movable;
        const dy = (b.y - a.y) * correction / movable;
        if (!a.fixed) { a.x += dx; a.y += dy; }
        if (!b.fixed) { b.x -= dx; b.y -= dy; }
      }
      for (const p of points) if (!p.fixed) {
        p.x = clamp(p.x, 0.025, 0.975);
        p.y = clamp(p.y, 0.04, 0.86);
      }
    }
    for (const p of points) {
      p.speed += -p.swing * 0.025 - (p.x - p.px) * 2.8;
      p.speed *= 0.94;
      p.swing = clamp(p.swing + p.speed, -1.2, 1.2);
      if (p.fixed) { p.px = p.x; p.py = p.y; }
    }
  }
}

function yGarlandDraw() {
  for (const strand of modeState.strands) {
    const points = strand.points;
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x * S, p.y * S) : ctx.moveTo(p.x * S, p.y * S));
    ctx.strokeStyle = ink(0.5);
    ctx.lineWidth = S * 0.0018;
    ctx.stroke();
    points.forEach((p, i) => {
      const h = strand.size;
      const angle = p.swing + Math.sin(i * 7.1) * 0.08;
      const x = p.x - Math.sin(angle) * h * 0.35;
      const y = p.y + Math.cos(angle) * h * 0.35;
      line(p.x, p.y, x, y, ink(0.3), 0.0012);
      yGlyph(x, y, h, angle, yColor(i + strand.color * 2));
      if (p.fixed) {
        dot(p.x, p.y, INK, 0.0045);
        dot(p.x, p.y, PAPER, 0.002);
      }
    });
  }
  yHint('тяни гирлянду · на пустом месте рисуй новую');
}

function yBalloonDraw() {
  for (const strand of modeState.strands) {
    const points = strand.points;
    points.forEach((p, i) => {
      const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
      let angle = Math.atan2(next.y - prev.y, next.x - prev.x);
      if (points.length === 1) angle = 0;
      const a = Math.atan2(p.y - prev.y, p.x - prev.x);
      const b = Math.atan2(next.y - p.y, next.x - p.x);
      const bend = Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
      const pulse = Math.sin(modeState.time * 3.5 + i * 0.9) * 0.035;
      const squash = 1 + Math.min(bend, 1) * 0.32 + pulse;
      const stretch = 1 / Math.sqrt(squash);
      if (i) line(prev.x, prev.y, p.x, p.y, yColor(strand.color), strand.size * 0.035);
      yGlyph(p.x, p.y, strand.size * num('air') / 100, angle, yColor(strand.color + i), true, stretch, squash);
    });
  }
  yHint('веди пальцем · повороты мнут надувные Ы');
}

const Y_HAND = [
  [0, 0.35],
  [0.1, 0.27, 0.25, -0.55, 0.29, -0.4],
  [0.33, -0.24, 0.08, 0.42, 0.31, 0.4],
  [0.7, 0.37, 0.7, -0.06, 0.32, 0.04],
  [0.12, 0.13, 0.5, 0.62, 0.69, 0.25],
  [0.78, 0.06, 0.84, -0.46, 0.87, -0.4],
  [0.9, -0.3, 0.63, 0.43, 0.87, 0.4],
  [0.98, 0.42, 1.05, 0.38, 1.12, 0.35],
];
const Y_HAND_POINTS = (() => {
  const points = [Y_HAND[0]];
  let prev = Y_HAND[0];
  for (const c of Y_HAND.slice(1)) {
    for (let j = 1; j <= 12; j++) {
      const t = j / 12, u = 1 - t;
      points.push([u ** 3 * prev[0] + 3 * u * u * t * c[0] + 3 * u * t * t * c[2] + t ** 3 * c[4],
        u ** 3 * prev[1] + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t ** 3 * c[5]]);
    }
    prev = c.slice(4);
  }
  return points;
})();

function yNoodleDraw() {
  for (const strand of modeState.strands) {
    const points = strand.points;
    if (points.length < 2) {
      if (points.length) dot(points[0].x, points[0].y, yColor(strand.color), strand.size * 0.07);
      continue;
    }
    const distances = [0];
    for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + yDistance(points[i - 1], points[i]));
    const total = distances.at(-1);
    const h = strand.size;
    const width = h * 1.12;
    let segment = 1;
    const locate = (distance, offset) => {
      while (segment < points.length - 1 && distances[segment] < distance) segment++;
      while (segment > 1 && distances[segment - 1] > distance) segment--;
      const a = points[segment - 1], b = points[segment];
      const span = distances[segment] - distances[segment - 1];
      const t = clamp((distance - distances[segment - 1]) / span, 0, 1);
      const before = points[Math.max(0, segment - 2)], after = points[Math.min(points.length - 1, segment + 1)];
      const angle = Math.atan2(after.y - before.y, after.x - before.x);
      return [lerp(a.x, b.x, t) - Math.sin(angle) * offset, lerp(a.y, b.y, t) + Math.cos(angle) * offset];
    };
    ctx.beginPath();
    let started = false;
    for (let base = 0; base < total; base += width) {
      for (const [x, y] of Y_HAND_POINTS) {
        const distance = base + x * h;
        if (distance > total) break;
        const wobble = Math.sin(distance * 42 - modeState.time * 3) * 0.018 * num('wiggle');
        const p = locate(distance, (y + wobble) * h);
        if (started) ctx.lineTo(p[0] * S, p[1] * S);
        else { ctx.moveTo(p[0] * S, p[1] * S); started = true; }
      }
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ink(0.15);
    ctx.lineWidth = h * S * 0.155;
    ctx.stroke();
    ctx.strokeStyle = yColor(strand.color);
    ctx.lineWidth = h * S * 0.12;
    ctx.stroke();
  }
  yHint('тяни ыыыыы · каждый росчерк — новая макаронина');
}

const Y_CONTACTS = [
  [-0.36, -0.4], [-0.36, -0.2], [-0.36, 0], [-0.36, 0.2], [-0.36, 0.4],
  [-0.14, 0.4], [0.08, 0.3], [0.12, 0.13], [-0.1, -0.04],
  [0.4, -0.4], [0.4, -0.2], [0.4, 0], [0.4, 0.2], [0.4, 0.4],
];

function yDrop(x, y, vx = 0, vy = 0) {
  if (modeState.bodies.length >= 100) modeState.bodies.shift();
  modeState.bodies.push({ x, y, vx, vy, angle: Math.random() * 2 - 1, spin: (Math.random() - 0.5) * 3,
    h: ySize() * (0.8 + Math.random() * 0.4), color: modeState.serial++ });
}

function yWorld(body) {
  const c = Math.cos(body.angle), s = Math.sin(body.angle);
  return Y_CONTACTS.map(([x, y]) => ({ x: body.x + (x * c - y * s) * body.h, y: body.y + (x * s + y * c) * body.h }));
}

function yImpulse(a, b, p, q, nx, ny, overlap) {
  const ax = p.x - a.x, ay = p.y - a.y;
  const bx = b ? q.x - b.x : 0, by = b ? q.y - b.y : 0;
  const ia = 5 / (a.h * a.h), ib = b ? 5 / (b.h * b.h) : 0;
  const ca = ax * ny - ay * nx, cb = bx * ny - by * nx;
  const mass = 1 + Number(Boolean(b)) + ca * ca * ia + cb * cb * ib;
  const correction = Math.max(0, overlap - 0.0002) * 0.65 / mass;
  a.x -= nx * correction; a.y -= ny * correction; a.angle -= ca * correction * ia;
  if (b) { b.x += nx * correction; b.y += ny * correction; b.angle += cb * correction * ib; }
  const rvx = (b ? b.vx - b.spin * by : 0) - (a.vx - a.spin * ay);
  const rvy = (b ? b.vy + b.spin * bx : 0) - (a.vy + a.spin * ax);
  const closing = rvx * nx + rvy * ny;
  if (closing >= 0) return;
  const impulse = -(1.15 * closing) / mass;
  a.vx -= nx * impulse; a.vy -= ny * impulse; a.spin -= ca * impulse * ia;
  if (b) { b.vx += nx * impulse; b.vy += ny * impulse; b.spin += cb * impulse * ib; }
  a.vx *= 0.99; a.spin *= 0.985;
}

function yTumbleStep() {
  modeState.time += STEP;
  if (pointer.down && modeState.pouring) {
    modeState.clock += STEP;
    if (modeState.clock >= 1 / num('flow')) {
      yDrop(clamp(pointer.x, 0.05, 0.95), clamp(pointer.y, 0.05, 0.85));
      modeState.clock = 0;
    }
  }
  const bodies = modeState.bodies;
  for (let sub = 0; sub < 3; sub++) {
    for (const b of bodies) {
      b.vy += 0.6 * STEP / 3;
      b.vx *= 0.998; b.vy *= 0.998; b.spin *= 0.997;
      b.x += b.vx * STEP / 3; b.y += b.vy * STEP / 3; b.angle += b.spin * STEP / 3;
    }
    const shapes = bodies.map(yWorld);
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i], radius = a.h * 0.085;
      for (const p of shapes[i]) {
        if (p.y + radius > 0.89) yImpulse(a, null, p, null, 0, 1, p.y + radius - 0.89);
        if (p.x - radius < 0.015) yImpulse(a, null, p, null, -1, 0, 0.015 - p.x + radius);
        if (p.x + radius > 0.985) yImpulse(a, null, p, null, 1, 0, p.x + radius - 0.985);
      }
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (Math.abs(a.x - b.x) > (a.h + b.h) * 0.65 || Math.abs(a.y - b.y) > (a.h + b.h) * 0.65) continue;
        const r = radius + b.h * 0.085;
        for (const p of shapes[i]) for (const q of shapes[j]) {
          const dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
          if (d2 >= r * r || d2 < 1e-12) continue;
          const d = Math.sqrt(d2);
          yImpulse(a, b, p, q, dx / d, dy / d, r - d);
        }
      }
    }
  }
}

function yTumbleMove() {
  if (!pointer.down || modeState.pouring) return;
  const dx = clamp(pointer.x - pointer.px, -0.025, 0.025);
  const dy = clamp(pointer.y - pointer.py, -0.025, 0.025);
  for (const b of modeState.bodies) if (yDistance(b, pointer) < b.h + 0.06) {
    b.vx = dx * 35; b.vy = dy * 35 - 0.15;
    b.spin += dx * 60;
  }
}

function yTumbleExample() {
  yReset();
  for (let i = 0; i < 32; i++) yDrop(0.16 + Math.random() * 0.68, 0.12 + Math.random() * 0.55);
}

const yTools = () => [
  { type: 'range', key: 'size', label: 'размер', min: 35, max: 130, step: 5, value: 75 },
];
const MODES = {
  garland: {
    label: 'гирлянда', cursor: 'crosshair',
    note: 'Рисуй нить на пустом месте: концы закрепятся там, где начал и отпустил. Хватай нить, чтобы потрясти; крайние булавки можно переставлять. Размер действует на новые гирлянды.',
    tools: [...yTools(), { type: 'range', key: 'weight', label: 'тяжесть', min: 1, max: 5, step: 1, value: 2 }],
    setup() { yExample('garland'); }, step: yGarlandStep, draw: yGarlandDraw,
    onDown() { yBegin('garland'); }, onMove: yMove, onUp: yEnd,
  },
  balloons: {
    label: 'надувные', cursor: 'crosshair',
    note: 'Веди пальцем, чтобы выдавить цепочку надувных Ы. На поворотах буквы сминаются и раздуваются поперёк движения. Воздух меняет толщину всей цепочки, размер — следующих букв.',
    tools: [...yTools(), { type: 'range', key: 'air', label: 'воздух', min: 70, max: 140, step: 5, value: 110 }],
    setup() { yExample('balloons'); }, step() { modeState.time += STEP; }, draw: yBalloonDraw,
    onDown() { yBegin('balloons'); }, onMove: yMove, onUp: yEnd,
  },
  noodles: {
    label: 'макароны', cursor: 'crosshair',
    note: 'Один непрерывный рукописный штрих: пузо, соединение, палка — и следующая ы. Петли следуют изгибам руки. Каждый росчерк получает новый цвет; шевеление можно убрать в ноль.',
    tools: [...yTools(), { type: 'range', key: 'wiggle', label: 'шевеление', min: 0, max: 5, step: 1, value: 2 }],
    setup() { yExample('noodles'); }, step() { modeState.time += STEP; }, draw: yNoodleDraw,
    onDown() { yBegin('noodles'); }, onMove: yMove, onUp: yEnd,
  },
  tumble: {
    label: 'перекати-Ы', cursor: 'crosshair',
    note: 'Держи палец — сыплются буквы. Переключи «руку» на «сгребать», чтобы ворошить кучу. Сталкиваются штрихи букв: палки цепляются за пузики. До 100 букв; затем самые старые уходят.',
    tools: [...yTools(), { type: 'pick', key: 'hand', label: 'рука', options: ['сыпать', 'сгребать'], value: 0 },
      { type: 'range', key: 'flow', label: 'в секунду', min: 2, max: 15, step: 1, value: 8 },
      { type: 'button', label: 'подбросить', action() { for (const b of modeState.bodies) { b.vy = -0.5 - Math.random() * 0.5; b.vx += (Math.random() - 0.5) * 0.4; b.spin += (Math.random() - 0.5) * 8; } } }],
    setup: yTumbleExample, step: yTumbleStep,
    draw() {
      line(0.02, 0.899, 0.98, 0.899, FAINT, 0.001);
      for (const b of modeState.bodies) yGlyph(b.x, b.y, b.h, b.angle, yColor(b.color));
      yHint(num('hand') ? 'сгребай пальцем · можно подбросить всю кучу' : 'держи палец — сыплются Ы');
    },
    onDown() {
      modeState.pouring = num('hand') === 0;
      modeState.clock = 0;
      if (modeState.pouring) yDrop(clamp(pointer.x, 0.05, 0.95), clamp(pointer.y, 0.05, 0.85));
    },
    onMove: yTumbleMove, onUp() { modeState.pouring = false; },
  },
};

canvas.addEventListener('pointercancel', () => { pointer.down = false; yEnd(); modeState.pouring = false; });
startLab({
  title: 'Ы · ерунда', modes: MODES, start: 'garland', ground: 'paper',
  globalTools: [
    { type: 'pick', key: 'palette', label: 'краска', options: ['праздник', 'чернила'], value: 0 },
    { type: 'button', label: 'очистить', action: yReset },
    { type: 'button', label: 'пример', action() { MODES[current].setup(); } },
  ],
});
