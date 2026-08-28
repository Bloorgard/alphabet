import { reportScore } from '../wall.js?v=4';

const STEP = 1 / 60;
const INK = '#161616';
const PAPER = '#f1ede5';
const MUTED = '#8b877f';
const RED = '#e0210f';

const PARAMS = {
  speed: 0.19,
  turn: 5,
  mouse: false,
  bite: true,
  paint: true,
  night: true,
  endless: false,
};

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

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

const BODY = (() => {
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
    const cubic = command[0] === 'C';
    const to = cubic ? command.slice(5, 7) : command.slice(1, 3);
    const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const steps = Math.max(2, Math.ceil(distance / 8));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      if (!cubic) {
        put(lerp(from[0], to[0], t), lerp(from[1], to[1], t));
        continue;
      }
      const u = 1 - t;
      put(
        u ** 3 * from[0] + 3 * u * u * t * command[1] + 3 * u * t * t * command[3] + t ** 3 * command[5],
        u ** 3 * from[1] + 3 * u * u * t * command[2] + 3 * u * t * t * command[4] + t ** 3 * command[6],
      );
    }
    from = to;
  }
  return { samples, length };
})();

const BLOCKS = [
  { x: 600 / 1200, y: 380 / 1200, r: 100 / 1200 },
  { x: 600 / 1200, y: 840 / 1200, r: 100 / 1200 },
  { x: 710 / 1200, y: 610 / 1200, r: 30 / 1200 },
  { x: 490 / 1200, y: 610 / 1200, r: 30 / 1200 },
];

const APPLE_ZONES = [
  [[0.27, 0.06], [0.90, 0.08], [0.63, 0.265], [0.52, 0.225], [0.42, 0.275]],
  [[0.91, 0.09], [0.94, 0.58], [0.61, 0.455], [0.61, 0.295]],
  [[0.43, 0.435], [0.58, 0.435], [0.54, 0.51], [0.57, 0.585], [0.44, 0.585], [0.47, 0.51]],
  [[0.61, 0.545], [0.72, 0.50], [0.94, 0.60], [0.94, 0.93], [0.61, 0.98]],
  [[0.38, 0.81], [0.58, 0.81], [0.58, 0.98], [0.25, 0.98]],
  [[0.12, 0.005], [0.39, 0.26], [0.35, 0.45], [0.40, 0.77], [0.26, 0.89], [0.12, 0.94], [0.08, 0.48]],
];

export function mountZ(workspace) {
  /* Рекорд уезжает на холст Я: клетка достаётся за то, что человек играл
     лучше себя прежнего. Считает и решает сервер, буква только сообщает. */
  const record = (value) => {
    if (value <= state.best) return;
    reportScore('З', value, workspace);
  };
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { ...PARAMS };
  const pointer = { x: 0.5, y: 0.5, seen: false };
  const state = {
    points: [], segment: 0, dir: Math.PI, apple: null,
    dots: [], eaten: 0, best: 0, zone: 0, dead: null,
    full: false, finishing: false, started: false, mouseTarget: false,
  };

  workspace.dataset.ground = 'paper';
  canvas.style.cursor = 'crosshair';

  let S = 1;
  let frameId = 0;
  let debt = 0;
  let last = performance.now();

  const mark = () => (params.night ? PAPER : INK);
  const field = () => (params.night ? INK : PAPER);

  function applyNight() {
    workspace.dataset.ground = params.night ? 'ink' : 'paper';
  }

  function dot(x, y, color, radius) {
    ctx.beginPath();
    ctx.arc(x * S, y * S, radius * S, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function inZone(point, zone) {
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

  function placeApple() {
    const index = state.zone % APPLE_ZONES.length;
    const zone = APPLE_ZONES[index];
    const xs = zone.map((point) => point[0]);
    const ys = zone.map((point) => point[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    let best = null;

    for (let tries = 0; tries < 360; tries += 1) {
      const apple = { x: lerp(minX, maxX, Math.random()), y: lerp(minY, maxY, Math.random()) };
      if (!inZone(apple, zone)) continue;
      const bodyGap = Math.min(...state.points.map((point) => Math.hypot(point.x - apple.x, point.y - apple.y)));
      const blockGap = Math.min(...BLOCKS.map((block) => Math.hypot(block.x - apple.x, block.y - apple.y) - block.r));
      const score = Math.min(bodyGap, blockGap);
      if (!best || score > best.score) best = { apple, score };
      if (bodyGap > 0.058 && blockGap > 0.038) {
        state.apple = apple;
        state.zone = (index + 1) % APPLE_ZONES.length;
        return;
      }
    }
    state.apple = best?.apple || null;
    state.zone = (index + 1) % APPLE_ZONES.length;
  }

  function reset() {
    const count = Math.round(BODY.length / 0.009) + 1;
    state.points = resample(BODY, count).reverse();
    state.segment = BODY.length / (count - 1);
    state.dir = Math.PI;
    state.dots = [];
    state.eaten = 0;
    state.zone = 0;
    state.dead = null;
    state.full = false;
    state.finishing = false;
    state.started = false;
    state.mouseTarget = false;
    placeApple();
  }

  function dotLayout() {
    const inset = (38 / 1200) / state.segment;
    const gap = (70 / 1200) / state.segment;
    const headClear = (70 / 1200) / state.segment;
    const tail = state.points.length - 1 - inset;
    const capacity = Math.max(1, Math.floor((tail - headClear) / gap) + 1);
    return { gap, headClear, tail, capacity };
  }

  function finish() {
    state.full = true;
    state.finishing = false;
    state.apple = null;
    record(state.eaten);
    state.best = Math.max(state.best, state.eaten);
  }

  function advance() {
    if (state.dead || state.full) return;
    const head = state.points[0];
    const speed = params.speed * STEP;
    const turn = params.turn * STEP;
    const radius = 30 / 1200;
    if (pointer.seen && state.mouseTarget) {
      const dx = pointer.x - head.x;
      const dy = pointer.y - head.y;
      if (Math.hypot(dx, dy) <= radius * 2.2) {
        state.mouseTarget = false;
      } else {
        const wanted = Math.atan2(dy, dx);
        state.dir += clamp(wrapAngle(wanted - state.dir), -turn, turn);
      }
    }

    const x = head.x + Math.cos(state.dir) * speed;
    const y = head.y + Math.sin(state.dir) * speed;
    const out = x < radius || y < radius || x > 1 - radius || y > 1 - radius;
    const block = BLOCKS.some((item) => Math.hypot(x - item.x, y - item.y) < radius + item.r);
    const bite = params.bite && state.points.slice(9).some((point) => Math.hypot(x - point.x, y - point.y) < radius * 1.6);
    if (out || block || bite) {
      state.dead = { why: out ? 'край' : block ? 'круг' : 'укус' };
      record(state.eaten);
      state.best = Math.max(state.best, state.eaten);
      return;
    }

    head.x = x;
    head.y = y;
    for (let pass = 0; pass < 4; pass += 1) {
      for (let i = 1; i < state.points.length; i += 1) {
        const front = state.points[i - 1];
        const point = state.points[i];
        const dx = point.x - front.x;
        const dy = point.y - front.y;
        const distance = Math.hypot(dx, dy) || 1;
        point.x = front.x + (dx / distance) * state.segment;
        point.y = front.y + (dy / distance) * state.segment;

        for (const item of BLOCKS) {
          const bx = point.x - item.x;
          const by = point.y - item.y;
          const away = Math.hypot(bx, by);
          const limit = item.r + radius;
          if (away >= limit) continue;
          const nx = away > 0.000001 ? bx / away : -dy / distance;
          const ny = away > 0.000001 ? by / away : dx / distance;
          point.x = item.x + nx * limit;
          point.y = item.y + ny * limit;
        }
      }
    }

    const layout = dotLayout();
    const rate = speed / state.segment;
    state.dots.forEach((item, index) => {
      const limit = index ? Math.max(0, state.dots[index - 1].pos - layout.gap) : layout.tail;
      item.pos = Math.max(item.pos, Math.min(item.pos + rate, limit));
    });

    if (state.finishing) {
      const finalDot = state.dots.at(-1);
      if (finalDot && finalDot.pos >= layout.headClear - 0.001) finish();
      return;
    }

    if (state.apple && Math.hypot(x - state.apple.x, y - state.apple.y) < radius * 2.05) {
      state.eaten += 1;
      if (state.dots.length < layout.capacity) state.dots.push({ pos: 0 });
      if (!params.endless && state.dots.length >= layout.capacity) {
        state.finishing = true;
        state.apple = null;
      } else {
        placeApple();
      }
    }
  }

  function pointAt(pos) {
    const lastIndex = state.points.length - 1;
    const i = clamp(Math.floor(pos), 0, lastIndex);
    const j = Math.min(i + 1, lastIndex);
    const mix = clamp(pos - i, 0, 1);
    return {
      x: lerp(state.points[i].x, state.points[j].x, mix),
      y: lerp(state.points[i].y, state.points[j].y, mix),
    };
  }

  function drawApple() {
    if (!state.apple || state.dead) return;
    const apple = state.apple;
    const radius = 30 / 1200;
    const leafScale = radius / 40.125;
    dot(apple.x, apple.y, params.paint ? RED : mark(), radius);
    ctx.fillStyle = mark();
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

  function drawFace() {
    const head = state.points[0];
    const dx = Math.cos(state.dir);
    const dy = Math.sin(state.dir);
    const nx = dy;
    const ny = -dx;
    const local = (x, y) => ({
      x: head.x + dx * (70 - x) / 1200 + nx * (y - 30) / 1200,
      y: head.y + dy * (70 - x) / 1200 + ny * (y - 30) / 1200,
    });
    const tongue = [
      [[30.0012, 27.1715], [24.8291, 21.9994], [35.1726, 22.0001]],
      [[10.0012, 27.1715], [4.82906, 21.9994], [15.1726, 22.0001]],
      [[35.1712, 38.0005], [24.8284, 37.9991], [29.9991, 32.8284]],
      [[15.1712, 38.0005], [4.82837, 37.9991], [9.99908, 32.8284]],
    ];

    let tongueVisible = false;
    if (state.apple && !state.dead) {
      const ax = state.apple.x - head.x;
      const ay = state.apple.y - head.y;
      const distance = Math.hypot(ax, ay) || 1;
      tongueVisible = (ax * dx + ay * dy) / distance > 0.15 && distance < 0.14;
    }

    if (tongueVisible) {
      ctx.save();
      ctx.fillStyle = mark();
      ctx.strokeStyle = mark();
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
      ctx.fillStyle = state.dead ? field() : mark();
      ctx.fill();
      ctx.strokeStyle = field();
      ctx.lineWidth = 4 / 1200 * S;
      ctx.stroke();

      if (!state.dead) continue;
      ctx.strokeStyle = mark();
      ctx.lineWidth = 4 / 1200 * S;
      for (const [x1, y1, x2, y2] of [
        [64.6562, y + 5.6562, 75.97, y - 5.6575],
        [64.6562, y - 5.6562, 75.97, y + 5.6575],
      ]) {
        const start = local(x1, y1);
        const end = local(x2, y2);
        ctx.beginPath();
        ctx.moveTo(start.x * S, start.y * S);
        ctx.lineTo(end.x * S, end.y * S);
        ctx.stroke();
      }
    }
  }

  function drawText(lines) {
    ctx.save();
    ctx.fillStyle = MUTED;
    ctx.font = `${Math.round(S * 0.022)}px 'DM Mono', ui-monospace, monospace`;
    ctx.textAlign = 'right';
    lines.forEach((text, index) => ctx.fillText(text, S * 0.91, S * (0.09 + index * 0.032)));
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, S, S);
    if (params.night) {
      ctx.fillStyle = field();
      ctx.fillRect(0, 0, S, S);
    }

    ctx.save();
    ctx.strokeStyle = mark();
    ctx.lineWidth = Math.max(0.75, S / 1200);
    for (const block of BLOCKS) {
      ctx.beginPath();
      ctx.arc(block.x * S, block.y * S, block.r * S, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = mark();
    ctx.lineWidth = 60 / 1200 * S;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    state.points.forEach((point, index) => {
      if (index) ctx.lineTo(point.x * S, point.y * S);
      else ctx.moveTo(point.x * S, point.y * S);
    });
    ctx.stroke();
    ctx.restore();

    for (const item of state.dots) {
      const point = pointAt(item.pos);
      dot(point.x, point.y, field(), 20 / 1200);
    }

    drawApple();
    drawFace();
    if (state.dead || state.full) {
      const lines = [];
      if (state.full) lines.push('спасибо, что покормили змею.');
      lines.push(`собрано яблок: ${state.eaten}`);
      lines.push(`лучший результат: ${state.best}`);
      drawText(lines);
    } else if (state.started) {
      drawText([`яблок ${state.eaten}`]);
    }
  }

  function resize() {
    const bounds = workspace.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    S = Math.max(1, Math.min(bounds.width, bounds.height));
    canvas.width = Math.round(bounds.width * dpr);
    canvas.height = Math.round(bounds.height * dpr);
    canvas.style.width = `${bounds.width}px`;
    canvas.style.height = `${bounds.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function track(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    pointer.y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
    pointer.seen = true;
  }

  function pointerEnabled(event) {
    return params.mouse || event.pointerType !== 'mouse';
  }

  function onPointerDown(event) {
    track(event);
    if (state.dead || state.full) {
      reset();
      state.started = true;
      state.mouseTarget = pointerEnabled(event);
      if (!state.mouseTarget) pointer.seen = false;
      return;
    }
    if (!pointerEnabled(event)) return;
    state.started = true;
    state.mouseTarget = true;
  }

  function onPointerMove(event) {
    if (!pointerEnabled(event)) {
      state.mouseTarget = false;
      pointer.seen = false;
      return;
    }
    track(event);
    if (state.started) state.mouseTarget = true;
  }

  function frame(now) {
    debt = Math.min(0.1, debt + (now - last) / 1000);
    last = now;
    while (debt >= STEP) {
      if (state.started) advance();
      debt -= STEP;
    }
    draw();
    frameId = requestAnimationFrame(frame);
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'веди мышью или стрелками · собери 29 яблок · клик после финала — заново';

  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.hidden = true;
  panel.style.maxHeight = 'calc(100% - 64px)';
  panel.style.overflowY = 'auto';

  function addRange(key, label, min, max, step) {
    const control = document.createElement('label');
    control.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = params[key];
    input.addEventListener('input', () => { params[key] = Number(input.value); });
    control.append(input);
    panel.append(control);
  }

  function addSwitch(key, label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sketch-switch';
    button.textContent = label;
    button.setAttribute('aria-pressed', String(params[key]));
    button.addEventListener('click', () => {
      params[key] = !params[key];
      button.setAttribute('aria-pressed', String(params[key]));
      action?.();
    });
    panel.append(button);
  }

  addRange('speed', 'скорость', 0.08, 0.55, 0.01);
  addRange('turn', 'поворот', 1, 10, 0.5);
  addSwitch('mouse', 'управление мышью', () => {
    if (params.mouse) return;
    state.mouseTarget = false;
    pointer.seen = false;
  });
  addSwitch('bite', 'укус');
  addSwitch('paint', 'краска');
  addSwitch('night', 'ночь', applyNight);
  addSwitch('endless', 'бесконечная игра', () => {
    if (state.dead) return;
    if (params.endless && (state.full || state.finishing)) {
      state.full = false;
      state.finishing = false;
      placeApple();
    } else if (!params.endless && state.dots.length >= dotLayout().capacity) {
      state.full = false;
      state.finishing = true;
      state.apple = null;
    }
  });

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
    if (event.key === 'Tab' && !event.target.closest('input, textarea')) {
      event.preventDefault();
      toggle.click();
      return;
    }
    const directions = {
      ArrowLeft: Math.PI,
      ArrowRight: 0,
      ArrowUp: -Math.PI / 2,
      ArrowDown: Math.PI / 2,
    };
    if (!(event.code in directions)) return;
    const next = directions[event.code];
    if (Math.abs(wrapAngle(next - state.dir)) < Math.PI * 0.75) state.dir = next;
    state.started = true;
    state.mouseTarget = false;
    pointer.seen = false;
    event.preventDefault();
  }

  workspace.append(hint, panel, toggle);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(workspace);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  document.addEventListener('keydown', onKeyDown);

  resize();
  reset();
  applyNight();
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('keydown', onKeyDown);
    hint.remove();
    panel.remove();
    toggle.remove();
    canvas.style.cursor = '';
    ctx.clearRect(0, 0, S, S);
    delete workspace.dataset.ground;
  };
}
