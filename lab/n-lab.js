/* Н — кузнечик.
   Буква — одно жёсткое тело. Перекладина хранит энергию пружины, а пол знает
   четыре реальных конца стоек: Н не телепортируется сквозь него и не
   доворачивается к заданной позе. */

const N_HALF = 0.18;
const N_HEIGHT = 0.42;
const N_FLOOR = 0.8;
const N_BASE_STROKE = 0.016;
const N_GRAVITY = 3.4;
const N_MAX_SPEED = 4;
const N_MAX_SPIN = 10;

function hopperHalf() { return N_HALF * num('size') * num('width'); }
function hopperHeight() { return N_HEIGHT * num('size'); }
function verticalStroke() { return N_BASE_STROKE * num('thickness'); }
function horizontalStroke() { return verticalStroke() * (1 - num('contrast') * 0.62); }
function strokeRadius() { return verticalStroke() / 2; }
function bodyMass() { return Math.max(0.03, num('weight') * num('size') ** 2 * num('width') * num('thickness')); }
function bodyInertia() { return bodyMass() * ((hopperHalf() * 2) ** 2 + hopperHeight() ** 2) / 12; }

function resetHopper() {
  modeState.body = { x: 0.5, y: N_FLOOR - strokeRadius() - hopperHeight() / 2, vx: 0, vy: 0, angle: 0, spin: 0 };
  modeState.bar = { y: 0, v: 0, held: false, grabX: 0, releaseX: 0 };
  modeState.carry = null;
  modeState.dust = [];
}

function rotate(x, y) {
  const body = modeState.body;
  const cos = Math.cos(body.angle);
  const sin = Math.sin(body.angle);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

function localPoint(x, y) {
  const body = modeState.body;
  const dx = x - body.x;
  const dy = y - body.y;
  const cos = Math.cos(body.angle);
  const sin = Math.sin(body.angle);
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}

function worldPoint(x, y) {
  const body = modeState.body;
  const point = rotate(x, y);
  return { x: body.x + point.x, y: body.y + point.y };
}

function endpoints() {
  const half = hopperHalf();
  const tall = hopperHeight() / 2;
  return [
    { x: -half, y: -tall }, { x: -half, y: tall },
    { x: half, y: -tall }, { x: half, y: tall },
  ].map((point) => ({ ...point, world: worldPoint(point.x, point.y) }));
}

function floorContacts() {
  const floor = N_FLOOR - strokeRadius();
  const points = endpoints();
  const lowest = Math.max(...points.map((point) => point.world.y));
  return { floor, lowest, points: points.filter((point) => point.world.y >= floor - 0.001) };
}

function onFloor() {
  return floorContacts().lowest >= N_FLOOR - strokeRadius() - 0.001;
}

function standing() {
  const body = modeState.body;
  const contacts = floorContacts();
  return contacts.points.length === 2
    && Math.abs(Math.sin(body.angle)) < 0.07
    && Math.abs(body.vy) < 0.025
    && Math.abs(body.spin) < 0.025;
}

function velocityAt(offset) {
  const body = modeState.body;
  return { x: body.vx - body.spin * offset.y, y: body.vy + body.spin * offset.x };
}

function applyImpulse(offset, x, y) {
  const body = modeState.body;
  const mass = bodyMass();
  const inertia = bodyInertia();
  body.vx += x / mass;
  body.vy += y / mass;
  body.spin += (offset.x * y - offset.y * x) / inertia;
}

function solveFloor() {
  const body = modeState.body;
  const floor = N_FLOOR - strokeRadius();

  for (let pass = 0; pass < 3; pass += 1) {
    const state = floorContacts();
    if (state.lowest > floor) body.y -= state.lowest - floor;

    const contacts = floorContacts().points;
    for (const contact of contacts) {
      const offset = rotate(contact.x, contact.y);
      const velocity = velocityAt(offset);
      if (velocity.y <= 0) continue;

      const invMass = 1 / bodyMass();
      const invInertia = 1 / bodyInertia();
      const normal = -(1.08 * velocity.y) / (invMass + offset.x ** 2 * invInertia);
      applyImpulse(offset, 0, normal);

      const after = velocityAt(offset);
      const tangent = clamp(
        -after.x / (invMass + offset.y ** 2 * invInertia),
        -Math.abs(normal) * 0.52,
        Math.abs(normal) * 0.52,
      );
      applyImpulse(offset, tangent, 0);
    }
  }

  const rest = floorContacts();
  if (rest.points.length >= 2 && Math.abs(body.vy) < 0.018 && Math.abs(body.spin) < 0.03) {
    body.vy = 0;
    body.spin = 0;
  }
}

function solveWalls() {
  const body = modeState.body;
  const points = endpoints();
  const left = Math.min(...points.map((point) => point.world.x));
  const right = Math.max(...points.map((point) => point.world.x));
  if (left < strokeRadius()) {
    body.x += strokeRadius() - left;
    if (body.vx < 0) body.vx *= -0.25;
  }
  if (right > 1 - strokeRadius()) {
    body.x -= right - (1 - strokeRadius());
    if (body.vx > 0) body.vx *= -0.25;
  }
}

function onStroke(point) {
  const half = hopperHalf();
  const tall = hopperHeight() / 2;
  const dist = (x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = clamp(((point.x - x1) * dx + (point.y - y1) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(point.x - (x1 + dx * t), point.y - (y1 + dy * t));
  };
  return Math.min(
    dist(-half, -tall, -half, tall),
    dist(half, -tall, half, tall),
    dist(-half, modeState.bar.y, half, modeState.bar.y),
  ) < 0.045;
}

function spawnDust(lift) {
  const strength = clamp(lift / N_MAX_SPEED, 0, 1);
  const supports = floorContacts().points;
  const count = 3 + Math.round(strength * 3);
  for (const support of supports) {
    const side = support.world.x < modeState.body.x ? -1 : 1;
    for (let i = 0; i < count; i += 1) {
      const life = 0.18 + Math.random() * 0.26;
      modeState.dust.push({
        x: support.world.x + side * (Math.random() - 0.2) * 0.008,
        y: support.world.y - strokeRadius(),
        vx: side * (0.05 + Math.random() * 0.16) * (0.45 + strength),
        vy: -(0.04 + Math.random() * 0.14) * (0.45 + strength),
        life,
        maxLife: life,
        radius: 0.002 + Math.random() * 0.0025,
      });
    }
  }
}

function stepDust() {
  for (const particle of modeState.dust) {
    particle.vy += 2.4 * STEP;
    particle.x += particle.vx * STEP;
    particle.y += particle.vy * STEP;
    particle.vx *= 0.97;
    if (particle.y > N_FLOOR - strokeRadius()) {
      particle.y = N_FLOOR - strokeRadius();
      particle.vy *= -0.18;
      particle.vx *= 0.72;
    }
    particle.life -= STEP;
  }
  modeState.dust = modeState.dust.filter((particle) => particle.life > 0);
}

function drawDust() {
  for (const particle of modeState.dust) {
    ctx.globalAlpha = particle.life / particle.maxLife;
    dot(particle.x, particle.y, RED, particle.radius);
  }
  ctx.globalAlpha = 1;
}

function drawHopper() {
  drawDust();
  const body = modeState.body;
  ctx.save();
  ctx.translate(body.x * S, body.y * S);
  ctx.rotate(body.angle);
  ctx.strokeStyle = INK;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(-hopperHalf() * S, -hopperHeight() / 2 * S);
  ctx.lineTo(-hopperHalf() * S, hopperHeight() / 2 * S);
  ctx.moveTo(hopperHalf() * S, -hopperHeight() / 2 * S);
  ctx.lineTo(hopperHalf() * S, hopperHeight() / 2 * S);
  ctx.lineWidth = verticalStroke() * S;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-hopperHalf() * S, modeState.bar.y * S);
  ctx.lineTo(hopperHalf() * S, modeState.bar.y * S);
  ctx.lineWidth = horizontalStroke() * S;
  ctx.stroke();
  ctx.restore();

  const bar = modeState.bar;
  if (bar.held) drawStatus(`${bar.y < 0 ? 'вверх' : 'вниз'} ${Math.round(Math.abs(bar.y) / 0.18 * 100)}%`);
  else if (modeState.carry) drawStatus('в руках');
  else if (Math.abs(body.vy) > 0.05 || Math.abs(body.spin) > 0.05) drawStatus('полёт');
  else drawStatus(standing() ? 'нажми перекладину' : 'возьми за ногу');
}

function applyMouseJoint() {
  if (!modeState.carry) return;
  const grip = modeState.carry;
  const point = worldPoint(grip.x, grip.y);
  const offset = rotate(grip.x, grip.y);
  const velocity = velocityAt(offset);
  let dx = pointer.x - point.x;
  let dy = pointer.y - point.y;
  const gap = Math.hypot(dx, dy);
  if (gap > 0.18) {
    dx *= 0.18 / gap;
    dy *= 0.18 / gap;
  }
  let forceX = dx * 70 - velocity.x * 11;
  let forceY = dy * 70 - velocity.y * 11;
  const force = Math.hypot(forceX, forceY);
  const limit = bodyMass() * 22;
  if (force > limit) {
    forceX *= limit / force;
    forceY *= limit / force;
  }
  applyImpulse(offset, forceX * STEP, forceY * STEP);
}

const hopper = {
  label: 'кузнечик',
  note: 'Стоящую Н взводи перекладиной вверх или вниз. За любой штрих можно ухватиться: курсор тянет выбранную точку, а не телепортирует букву.',
  draw: drawHopper,
  cursor: 'ns-resize',
  tools: [
    { type: 'range', key: 'spring', label: 'упругость', min: 3, max: 14, step: 0.1, value: 5.5 },
    { type: 'range', key: 'weight', label: 'масса', min: 0.15, max: 1.8, step: 0.05, value: 1 },
    { type: 'range', key: 'size', label: 'размер', min: 0.45, max: 1, step: 0.05, value: 0.65 },
    { type: 'range', key: 'width', label: 'ширина', min: 0.55, max: 1.8, step: 0.05, value: 1 },
    { type: 'range', key: 'contrast', label: 'контраст', min: 0, max: 1, step: 0.05, value: 0.15 },
    { type: 'range', key: 'thickness', label: 'толщина', min: 0.5, max: 7.2, step: 0.05, value: 1 },
    { type: 'button', label: 'заново', action: resetHopper },
  ],
  setup() {
    resetHopper();
  },
  step() {
    const body = modeState.body;
    const bar = modeState.bar;
    if (bar.held) {
      const point = localPoint(pointer.x, pointer.y);
      bar.y = clamp(point.y, -0.18, 0.18);
      bar.releaseX = point.x;
      bar.v = 0;
    } else {
      bar.v += -bar.y * num('spring') * 20 * STEP;
      bar.v *= 0.8;
      bar.y += bar.v * STEP;
      if (Math.abs(bar.y) < 0.0005 && Math.abs(bar.v) < 0.01) {
        bar.y = 0;
        bar.v = 0;
      }
    }

    applyMouseJoint();
    body.vy += N_GRAVITY * STEP;
    body.x += body.vx * STEP;
    body.y += body.vy * STEP;
    body.angle += body.spin * STEP;
    body.vx = clamp(body.vx, -N_MAX_SPEED, N_MAX_SPEED);
    body.vy = clamp(body.vy, -N_MAX_SPEED, N_MAX_SPEED);
    body.spin = clamp(body.spin, -N_MAX_SPIN, N_MAX_SPIN);
    body.vx *= 0.999;
    body.spin *= 0.999;
    solveFloor();
    solveWalls();
    stepDust();
  },
  onDown() {
    const point = localPoint(pointer.x, pointer.y);
    if (!onStroke(point)) return;
    const bar = modeState.bar;
    if (standing() && Math.abs(point.y - bar.y) < 0.065) {
      bar.held = true;
      bar.grabX = point.x;
      bar.releaseX = point.x;
    } else {
      modeState.carry = { x: point.x, y: point.y };
    }
  },
  onMove() {},
  onUp() {
    if (modeState.carry) {
      modeState.carry = null;
      return;
    }
    const bar = modeState.bar;
    if (!bar.held) return;
    bar.held = false;
    const pull = Math.abs(bar.y);
    if (pull < 0.01) return;

    const energy = 0.5 * num('spring') * pull ** 2;
    const impulse = Math.sqrt(2 * bodyMass() * energy) * 1.35;
    spawnDust(impulse / bodyMass());
    applyImpulse(rotate(bar.releaseX, bar.y), 0, -impulse);
  },
  onTool(key) {
    if (key === 'size' || key === 'weight' || key === 'width' || key === 'thickness') resetHopper();
  },
};

const MODES = { hopper };

startLab({
  title: 'Н · кузнечик',
  modes: MODES,
  start: 'hopper',
});
