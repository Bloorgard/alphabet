const STEP = 1 / 60;
const INK = '#f1ede5';
const RED = '#e0210f';
const HALF = 0.18;
const HEIGHT = 0.42;
const FLOOR = 0.8;
const GRAVITY = 3.4;
const MAX_SPEED = 4;
const MAX_SPIN = 10;
const BASE_STROKE = 0.016;

const DEFAULTS = {
  spring: 5.5,
  weight: 1,
  size: 0.65,
  width: 1,
  contrast: 0.15,
  thickness: 1,
};

const CONTROLS = [
  ['spring', 'упругость', 3, 14, 0.1],
  ['weight', 'масса', 0.15, 1.8, 0.05],
  ['size', 'размер', 0.45, 1, 0.05],
  ['width', 'ширина', 0.55, 1.8, 0.05],
  ['thickness', 'толщина', 0.5, 7.2, 0.05],
  ['contrast', 'контраст', 0, 1, 0.05],
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function mountN(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { ...DEFAULTS };
  const pointer = { x: 0.5, y: 0.5, px: 0.5, py: 0.5 };
  const state = {};
  let W = 1;
  let H = 1;
  let S = 1;
  let ox = 0;
  let oy = 0;
  let last = performance.now();
  let debt = 0;
  let frameId = 0;

  const half = () => HALF * params.size * params.width;
  const height = () => HEIGHT * params.size;
  const verticalStroke = () => BASE_STROKE * params.thickness;
  const horizontalStroke = () => verticalStroke() * (1 - params.contrast * 0.62);
  const radius = () => verticalStroke() / 2;
  const mass = () => Math.max(0.03, params.weight * params.size ** 2 * params.width * params.thickness);
  const inertia = () => mass() * ((half() * 2) ** 2 + height() ** 2) / 12;

  function reset() {
    state.body = { x: 0.5, y: FLOOR - radius() - height() / 2, vx: 0, vy: 0, angle: 0, spin: 0 };
    state.bar = { y: 0, v: 0, held: false, releaseX: 0 };
    state.carry = null;
    state.dust = [];
  }

  function rotate(x, y) {
    const { angle } = state.body;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: x * cos - y * sin, y: x * sin + y * cos };
  }

  function localPoint(x, y) {
    const body = state.body;
    const dx = x - body.x;
    const dy = y - body.y;
    const cos = Math.cos(body.angle);
    const sin = Math.sin(body.angle);
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
  }

  function worldPoint(x, y) {
    const body = state.body;
    const point = rotate(x, y);
    return { x: body.x + point.x, y: body.y + point.y };
  }

  function endpoints() {
    const x = half();
    const y = height() / 2;
    return [
      { x: -x, y: -y }, { x: -x, y },
      { x, y: -y }, { x, y },
    ].map((point) => ({ ...point, world: worldPoint(point.x, point.y) }));
  }

  function contacts() {
    const floor = FLOOR - radius();
    const points = endpoints();
    const lowest = Math.max(...points.map((point) => point.world.y));
    return { floor, lowest, points: points.filter((point) => point.world.y >= floor - 0.001) };
  }

  function standing() {
    const body = state.body;
    const floor = contacts();
    return floor.points.length === 2
      && Math.abs(Math.sin(body.angle)) < 0.07
      && Math.abs(body.vy) < 0.025
      && Math.abs(body.spin) < 0.025;
  }

  function velocityAt(offset) {
    const body = state.body;
    return { x: body.vx - body.spin * offset.y, y: body.vy + body.spin * offset.x };
  }

  function impulse(offset, x, y) {
    const body = state.body;
    body.vx += x / mass();
    body.vy += y / mass();
    body.spin += (offset.x * y - offset.y * x) / inertia();
  }

  function solveFloor() {
    const body = state.body;
    const floor = FLOOR - radius();
    for (let pass = 0; pass < 3; pass += 1) {
      const first = contacts();
      if (first.lowest > floor) body.y -= first.lowest - floor;
      for (const contact of contacts().points) {
        const offset = rotate(contact.x, contact.y);
        const velocity = velocityAt(offset);
        if (velocity.y <= 0) continue;
        const invMass = 1 / mass();
        const invInertia = 1 / inertia();
        const normal = -(1.08 * velocity.y) / (invMass + offset.x ** 2 * invInertia);
        impulse(offset, 0, normal);
        const after = velocityAt(offset);
        const friction = clamp(
          -after.x / (invMass + offset.y ** 2 * invInertia),
          -Math.abs(normal) * 0.52,
          Math.abs(normal) * 0.52,
        );
        impulse(offset, friction, 0);
      }
    }
    const rest = contacts();
    if (rest.points.length >= 2 && Math.abs(body.vy) < 0.018 && Math.abs(body.spin) < 0.03) {
      body.vy = 0;
      body.spin = 0;
    }
  }

  function solveWalls() {
    const body = state.body;
    const points = endpoints();
    const left = Math.min(...points.map((point) => point.world.x));
    const right = Math.max(...points.map((point) => point.world.x));
    if (left < radius()) {
      body.x += radius() - left;
      if (body.vx < 0) body.vx *= -0.25;
    }
    if (right > 1 - radius()) {
      body.x -= right - (1 - radius());
      if (body.vx > 0) body.vx *= -0.25;
    }
  }

  function hitStroke(point) {
    const x = half();
    const y = height() / 2;
    const distance = (x1, y1, x2, y2) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const t = clamp(((point.x - x1) * dx + (point.y - y1) * dy) / (dx * dx + dy * dy), 0, 1);
      return Math.hypot(point.x - (x1 + dx * t), point.y - (y1 + dy * t));
    };
    return Math.min(
      distance(-x, -y, -x, y),
      distance(x, -y, x, y),
      distance(-x, state.bar.y, x, state.bar.y),
    ) < 0.045;
  }

  function spawnDust(lift) {
    const strength = clamp(lift / MAX_SPEED, 0, 1);
    const supports = contacts().points;
    const count = 3 + Math.round(strength * 3);
    for (const support of supports) {
      const side = support.world.x < state.body.x ? -1 : 1;
      for (let i = 0; i < count; i += 1) {
        const life = 0.18 + Math.random() * 0.26;
        state.dust.push({
          x: support.world.x + side * (Math.random() - 0.2) * 0.008,
          y: support.world.y - radius(),
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
    for (const particle of state.dust) {
      particle.vy += 2.4 * STEP;
      particle.x += particle.vx * STEP;
      particle.y += particle.vy * STEP;
      particle.vx *= 0.97;
      if (particle.y > FLOOR - radius()) {
        particle.y = FLOOR - radius();
        particle.vy *= -0.18;
        particle.vx *= 0.72;
      }
      particle.life -= STEP;
    }
    state.dust = state.dust.filter((particle) => particle.life > 0);
  }

  function mouseJoint() {
    if (!state.carry) return;
    const grip = state.carry;
    const point = worldPoint(grip.x, grip.y);
    const offset = rotate(grip.x, grip.y);
    const velocity = velocityAt(offset);
    let dx = pointer.x - point.x;
    let dy = pointer.y - point.y;
    const gap = Math.hypot(dx, dy);
    if (gap > 0.18) { dx *= 0.18 / gap; dy *= 0.18 / gap; }
    let x = dx * 70 - velocity.x * 11;
    let y = dy * 70 - velocity.y * 11;
    const force = Math.hypot(x, y);
    const limit = mass() * 22;
    if (force > limit) { x *= limit / force; y *= limit / force; }
    impulse(offset, x * STEP, y * STEP);
  }

  function step() {
    const body = state.body;
    const bar = state.bar;
    if (bar.held) {
      const point = localPoint(pointer.x, pointer.y);
      bar.y = clamp(point.y, -0.18, 0.18);
      bar.releaseX = point.x;
      bar.v = 0;
    } else {
      bar.v += -bar.y * params.spring * 20 * STEP;
      bar.v *= 0.8;
      bar.y += bar.v * STEP;
      if (Math.abs(bar.y) < 0.0005 && Math.abs(bar.v) < 0.01) { bar.y = 0; bar.v = 0; }
    }
    mouseJoint();
    body.vy += GRAVITY * STEP;
    body.x += body.vx * STEP;
    body.y += body.vy * STEP;
    body.angle += body.spin * STEP;
    body.vx = clamp(body.vx, -MAX_SPEED, MAX_SPEED) * 0.999;
    body.vy = clamp(body.vy, -MAX_SPEED, MAX_SPEED);
    body.spin = clamp(body.spin, -MAX_SPIN, MAX_SPIN) * 0.999;
    solveFloor();
    solveWalls();
    stepDust();
  }

  function at(x, y) { return { x: ox + x * S, y: oy + y * S }; }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const particle of state.dust) {
      const point = at(particle.x, particle.y);
      ctx.globalAlpha = particle.life / particle.maxLife;
      ctx.fillStyle = RED;
      ctx.beginPath();
      ctx.arc(point.x, point.y, particle.radius * S, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const body = state.body;
    const center = at(body.x, body.y);
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(body.angle);
    ctx.strokeStyle = INK;
    ctx.lineCap = 'butt';
    ctx.lineWidth = verticalStroke() * S;
    ctx.beginPath();
    ctx.moveTo(-half() * S, -height() * S / 2);
    ctx.lineTo(-half() * S, height() * S / 2);
    ctx.moveTo(half() * S, -height() * S / 2);
    ctx.lineTo(half() * S, height() * S / 2);
    ctx.stroke();
    ctx.lineWidth = horizontalStroke() * S;
    ctx.beginPath();
    ctx.moveTo(-half() * S, state.bar.y * S);
    ctx.lineTo(half() * S, state.bar.y * S);
    ctx.stroke();
    ctx.restore();
  }

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

  function track(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    pointer.x = (event.clientX - bounds.left - ox) / S;
    pointer.y = (event.clientY - bounds.top - oy) / S;
  }

  function onDown(event) {
    track(event);
    const point = localPoint(pointer.x, pointer.y);
    if (!hitStroke(point)) return;
    if (standing() && Math.abs(point.y - state.bar.y) < 0.065) {
      state.bar.held = true;
      state.bar.releaseX = point.x;
      canvas.style.cursor = 'ns-resize';
    } else {
      state.carry = { x: point.x, y: point.y };
      canvas.style.cursor = 'grabbing';
    }
    try { canvas.setPointerCapture(event.pointerId); } catch {}
  }

  function onMove(event) { track(event); }

  function onUp() {
    if (state.carry) {
      state.carry = null;
      canvas.style.cursor = '';
      return;
    }
    const bar = state.bar;
    if (!bar.held) return;
    bar.held = false;
    canvas.style.cursor = '';
    const pull = Math.abs(bar.y);
    if (pull < 0.01) return;
    const energy = 0.5 * params.spring * pull ** 2;
    const kick = Math.sqrt(2 * mass() * energy) * 1.35;
    spawnDust(kick / mass());
    impulse(rotate(bar.releaseX, bar.y), 0, -kick);
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'тяни перекладину вверх или вниз · за штрихи можно хвататься';

  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.hidden = true;
  panel.style.maxHeight = 'calc(100% - 64px)';
  panel.style.overflowY = 'auto';
  for (const [key, labelText, min, max, step] of CONTROLS) {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = params[key];
    input.addEventListener('input', () => {
      params[key] = Number(input.value);
      if (['weight', 'size', 'width', 'thickness'].includes(key)) reset();
    });
    label.append(input);
    panel.append(label);
  }
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'sketch-action';
  again.textContent = 'заново';
  again.addEventListener('click', reset);
  panel.append(again);

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

  function onKeyDown(event) {
    if (event.key !== 'Tab' || event.target.closest('input, textarea')) return;
    event.preventDefault();
    toggle.click();
  }

  function frame(now) {
    debt = Math.min(0.1, debt + (now - last) / 1000);
    last = now;
    while (debt >= STEP) {
      step();
      debt -= STEP;
    }
    draw();
    frameId = requestAnimationFrame(frame);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(workspace);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  document.addEventListener('keydown', onKeyDown);
  workspace.append(hint, panel, toggle);
  resize();
  reset();
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    observer.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.removeEventListener('keydown', onKeyDown);
    hint.remove();
    panel.remove();
    toggle.remove();
    canvas.style.cursor = '';
    ctx.clearRect(0, 0, W, H);
  };
}
