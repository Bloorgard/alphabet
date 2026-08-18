const { Engine, Composite, Bodies, Body, Mouse, MouseConstraint, Events } = Matter;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const modesBar = document.getElementById('modes');
const toolsBar = document.getElementById('tools');
const note = document.getElementById('note');

const RED = '#e0210f';
let S = 0;
let dpr = 1;

const engine = Engine.create();
engine.positionIterations = 8;
const world = engine.world;

let walls = [];
let bodies = [];
let big = {};
let modeState = {};
let current = null;

// Куда должны встать крупные тела, чтобы получилась Б.
function targets() {
  return {
    bar: { x: S * 0.50, y: S * 0.29, angle: -0.045 },
    belly: { x: S * 0.50, y: S * 0.66, angle: 0 },
  };
}

const MATERIAL = { restitution: 0.06, friction: 0.45, frictionAir: 0.012, render: { visible: false } };

function makeBar() {
  return Bodies.rectangle(S * 0.5, S * 0.29, S * 0.58, S * 0.17, { ...MATERIAL, label: 'bar' });
}

function makeBelly() {
  return Bodies.circle(S * 0.5, S * 0.66, S * 0.27, { ...MATERIAL, label: 'belly' }, 40);
}

// Мелочь вокруг: круги, квадраты, пятиугольники разного калибра.
function makeCrumbs(count) {
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const size = S * (0.012 + Math.random() * 0.042);
    const x = S * (0.08 + Math.random() * 0.84);
    const y = S * (0.08 + Math.random() * 0.84);
    const kind = Math.random();
    const body = kind < 0.45
      ? Bodies.circle(x, y, size, { ...MATERIAL, label: 'crumb' })
      : kind < 0.8
        ? Bodies.rectangle(x, y, size * 1.8, size * 1.8, { ...MATERIAL, label: 'crumb' })
        : Bodies.polygon(x, y, 5, size * 1.1, { ...MATERIAL, label: 'crumb' });
    Body.setAngle(body, Math.random() * Math.PI);
    list.push(body);
  }
  return list;
}

// Крышка нужна не всем режимам: в «наполнении» тела влетают сверху.
function buildWalls(inset = 0, lid = true) {
  Composite.remove(world, walls);
  const t = S * 0.5;
  const opts = { isStatic: true, restitution: 0.05, friction: 0.5 };
  walls = [
    ...(lid ? [Bodies.rectangle(S / 2, -t / 2, S * 3, t, opts)] : []),
    Bodies.rectangle(S / 2, S + t / 2, S * 3, t, opts),
    Bodies.rectangle(inset - t / 2, S / 2, t, S * 3, opts),
    Bodies.rectangle(S - inset + t / 2, S / 2, t, S * 3, opts),
  ];
  Composite.add(world, walls);
}

function clearBodies() {
  Composite.remove(world, bodies);
  bodies = [];
  big = {};
}

function addAll(list) {
  bodies = bodies.concat(list);
  Composite.add(world, list);
}

/* ---------- режимы ---------- */

const MODES = {
  fill: {
    label: 'наполнение',
    note: 'тела падают сверху по очереди: сначала живот, потом перекладина, потом мелочь',
    tools: [
      { type: 'button', label: 'заново', action: () => restart() },
      { type: 'range', label: 'темп', key: 'rate', min: 100, max: 1200, step: 10, value: 380 },
    ],
    setup() {
      world.gravity.y = 1;
      buildWalls(0, false);
      modeState.queue = [];
      modeState.timer = 0;

      const t = targets();
      const bar = makeBar();
      const belly = makeBelly();
      big = { bar, belly };

      // Порядок падения и есть «письмо» буквы: сначала низ, потом верх.
      modeState.queue.push({ body: belly, x: t.belly.x, angle: 0 });
      modeState.queue.push({ body: bar, x: t.bar.x, angle: t.bar.angle });
      for (const crumb of makeCrumbs(30)) {
        modeState.queue.push({ body: crumb, x: S * (0.1 + Math.random() * 0.8), angle: Math.random() * Math.PI });
      }
    },
    step(dt) {
      // Как только живот улёгся, он замирает — перекладине нужна опора, а не мяч.
      const belly = big.belly;
      if (belly && bodies.includes(belly) && !belly.isStatic && belly.speed < 0.35 && belly.position.y > S * 0.4) {
        Body.setStatic(belly, true);
      }
      if (!modeState.queue.length) return;
      modeState.timer -= dt;
      if (modeState.timer > 0) return;
      const next = modeState.queue.shift();
      Body.setPosition(next.body, { x: next.x, y: -S * 0.15 });
      Body.setAngle(next.body, next.angle);
      Body.setVelocity(next.body, { x: 0, y: 0 });
      addAll([next.body]);
      modeState.timer = Number(getTool('rate'));
    },
  },

  shake: {
    label: 'тряска',
    note: 'тяни по пустому месту — коробка наклоняется; тела перемешиваются и оседают заново',
    tools: [
      { type: 'button', label: 'тряхнуть', action: () => shake() },
      { type: 'button', label: 'заново', action: () => restart() },
    ],
    setup() {
      world.gravity.y = 1;
      world.gravity.x = 0;
      buildWalls(0);
      const bar = makeBar();
      const belly = makeBelly();
      big = { bar, belly };
      Body.setPosition(belly, { x: S * 0.5, y: S * 0.7 });
      Body.setPosition(bar, { x: S * 0.5, y: S * 0.3 });
      addAll([belly, bar, ...makeCrumbs(30)]);
    },
    step() {
      const tilt = modeState.tilt;
      if (!tilt) return;
      world.gravity.x = tilt.x;
      world.gravity.y = tilt.y;
    },
  },

  magnet: {
    label: 'магнит формы',
    note: 'невесомость: крупные тела тянет на свои места тем сильнее, чем они ближе; мелочь расталкивается прочь',
    tools: [
      { type: 'range', label: 'сила', key: 'pull', min: 0, max: 3, step: 0.05, value: 1 },
      { type: 'button', label: 'раскидать', action: () => scatter() },
    ],
    setup() {
      world.gravity.y = 0;
      world.gravity.x = 0;
      buildWalls(0);
      const bar = makeBar();
      const belly = makeBelly();
      big = { bar, belly };
      addAll([belly, bar, ...makeCrumbs(30)]);
      scatter();
    },
    step() {
      const k = Number(getTool('pull')) * 6e-6;
      if (k <= 0) return;
      const t = targets();
      for (const [name, body] of Object.entries(big)) {
        const goal = t[name];
        const dx = goal.x - body.position.x;
        const dy = goal.y - body.position.y;
        const dist = Math.hypot(dx, dy) || 1;
        // Ближе к месту — жёстче хватка, но издалека тяга не пропадает совсем.
        const grip = 1 / (1 + (dist / (S * 0.28)) ** 2);
        const f = k * body.mass * (0.3 + 0.7 * grip) / dist;
        Body.applyForce(body, body.position, { x: dx * f * S * 0.5, y: dy * f * S * 0.5 });
        const da = ((goal.angle - body.angle + Math.PI) % (Math.PI * 2)) - Math.PI;
        Body.setAngularVelocity(body, body.angularVelocity * 0.9 + da * 0.08 * grip);
      }
      for (const body of bodies) {
        if (body.label !== 'crumb') continue;
        for (const goal of Object.values(t)) {
          const dx = body.position.x - goal.x;
          const dy = body.position.y - goal.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist > S * 0.34) continue;
          const push = k * body.mass * 0.8 * (1 - dist / (S * 0.34));
          Body.applyForce(body, body.position, { x: (dx / dist) * push * S * 0.3, y: (dy / dist) * push * S * 0.3 });
        }
      }
    },
  },

  squeeze: {
    label: 'сжатие',
    note: 'двигай стенки: тела уплотняются и ищут место — в одной ширине ящика буква складывается, в другой нет',
    tools: [
      { type: 'range', label: 'ширина ящика', key: 'inset', min: 0, max: 0.3, step: 0.005, value: 0 },
      { type: 'button', label: 'заново', action: () => restart() },
    ],
    setup() {
      world.gravity.y = 1;
      world.gravity.x = 0;
      const bar = makeBar();
      const belly = makeBelly();
      big = { bar, belly };
      Body.setPosition(belly, { x: S * 0.5, y: S * 0.7 });
      Body.setPosition(bar, { x: S * 0.5, y: S * 0.25 });
      addAll([belly, bar, ...makeCrumbs(30)]);
      buildWalls(0);
    },
    step() {
      const inset = Number(getTool('inset')) * S;
      if (Math.abs(inset - (modeState.inset || 0)) < 0.5) return;
      modeState.inset = inset;
      buildWalls(inset);
    },
  },
};

/* ---------- инструменты ---------- */

const toolValues = {};

function getTool(key) {
  return toolValues[key];
}

function renderTools(mode) {
  toolsBar.innerHTML = '';
  for (const tool of mode.tools) {
    if (tool.type === 'button') {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tool.label;
      button.addEventListener('click', tool.action);
      toolsBar.append(button);
    } else {
      const label = document.createElement('label');
      label.textContent = tool.label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = tool.min;
      input.max = tool.max;
      input.step = tool.step;
      input.value = tool.value;
      toolValues[tool.key] = tool.value;
      input.addEventListener('input', () => { toolValues[tool.key] = Number(input.value); });
      label.append(input);
      toolsBar.append(label);
    }
  }
}

function shake() {
  for (const body of bodies) {
    Body.applyForce(body, body.position, {
      x: (Math.random() - 0.5) * body.mass * 0.06,
      y: -Math.random() * body.mass * 0.05,
    });
    Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.4);
  }
}

function scatter() {
  for (const body of bodies) {
    Body.setPosition(body, { x: S * (0.12 + Math.random() * 0.76), y: S * (0.12 + Math.random() * 0.76) });
    Body.setVelocity(body, { x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6 });
    Body.setAngle(body, Math.random() * Math.PI);
  }
}

function restart() {
  setMode(current);
}

function setMode(name) {
  current = name;
  const mode = MODES[name];
  clearBodies();
  modeState = {};
  world.gravity.x = 0;
  renderTools(mode);
  mode.setup();
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
  S = Math.max(1, bounds.width);
  canvas.width = Math.round(S * dpr);
  canvas.height = Math.round(S * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (mouse) mouse.pixelRatio = dpr;
  if (current) setMode(current);
}

function drawBody(body) {
  if (body.circleRadius) {
    ctx.beginPath();
    ctx.arc(body.position.x, body.position.y, body.circleRadius, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const [first, ...rest] = body.vertices;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (const v of rest) ctx.lineTo(v.x, v.y);
  ctx.closePath();
  ctx.fill();
}

function draw() {
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = RED;
  for (const body of bodies) drawBody(body);
}

const mouse = Mouse.create(canvas);
mouse.pixelRatio = dpr;
const mouseConstraint = MouseConstraint.create(engine, {
  mouse,
  constraint: { stiffness: 0.18, render: { visible: false } },
});
Composite.add(world, mouseConstraint);

// В режиме тряски пустое место работает наклоном коробки.
canvas.addEventListener('pointerdown', () => { modeState.dragging = true; });
window.addEventListener('pointerup', () => {
  modeState.dragging = false;
  if (current === 'shake') { modeState.tilt = null; world.gravity.x = 0; world.gravity.y = 1; }
});
canvas.addEventListener('pointermove', (event) => {
  if (current !== 'shake' || !modeState.dragging || mouseConstraint.body) return;
  const bounds = canvas.getBoundingClientRect();
  const dx = (event.clientX - bounds.left) / S - 0.5;
  const dy = (event.clientY - bounds.top) / S - 0.5;
  modeState.tilt = { x: dx * 2.4, y: 0.4 + dy * 2 };
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(48, now - last);
  last = now;
  MODES[current].step(dt);
  Engine.update(engine, dt);
  draw();
  requestAnimationFrame(frame);
}

new ResizeObserver(resize).observe(canvas);
resize();
setMode('fill');
requestAnimationFrame(frame);
