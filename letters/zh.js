const STEP = 1 / 60;
const INK = '#161616';
const RED = [224, 33, 15];

const STEM = 0.12;
const HIP = 0.0428;
const ARM_X = 0.1523;
const ARM_Y = 0.1094;
const ARM = Math.hypot(ARM_X, ARM_Y);
const WIDTH = 0.05;
const BOUND = ARM + WIDTH / 2;
const MARK_LIFE = 12;
const MARK_FADE = 4;
const SETTLE_DELAY = 3;
const SETTLE_EPSILON = 0.003;

const UR = Math.atan2(-ARM_Y, ARM_X);
const UL = Math.atan2(-ARM_Y, -ARM_X);
const DR = Math.atan2(ARM_Y, ARM_X);
const DL = Math.atan2(ARM_Y, -ARM_X);

const LEGS_4 = [
  { a: UR, len: ARM, group: 0 },
  { a: UL, len: ARM, group: 1 },
  { a: DR, len: ARM, group: 1 },
  { a: DL, len: ARM, group: 0 },
];

const PARAMS = {
  speed: 1.2,
  stride: 0.12,
  swing: 0.16,
  lead: 0.14,
  fade: 1,
  turn: true,
  flee: false,
  marks: true,
};

const CONTROLS = [
  { key: 'speed', label: 'скорость', min: 0.05, max: 2.4, step: 0.01 },
  { key: 'stride', label: 'шаг', min: 0.012, max: 0.24, step: 0.004 },
  { key: 'swing', label: 'перенос', min: 0.05, max: 0.5, step: 0.01 },
  { key: 'lead', label: 'упреждение', min: 0, max: 0.5, step: 0.01 },
];

const FADE_CONTROL = {
  key: 'fade', label: 'угасание следов', min: 0.25, max: 3, step: 0.05,
};

const SWITCHES = [
  { key: 'turn', label: 'поворот' },
  { key: 'flee', label: 'от курсора' },
];

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function wrap(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function mountZh(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { ...PARAMS };
  workspace.dataset.ground = 'paper';

  let S = 1;
  let frameId = 0;
  let debt = 0;
  let last = performance.now();
  let legs = [];
  let marks = [];
  let marksOpacity = 1;
  let idle = 0;

  const pointer = { x: 0.5, y: 0.5 };
  const body = { x: 0.5, y: 0.5, rot: 0, vx: 0, vy: 0 };

  function toWorld(vx, vy) {
    const c = Math.cos(body.rot);
    const s = Math.sin(body.rot);
    return {
      x: body.x + vx * c - vy * s,
      y: body.y + vx * s + vy * c,
    };
  }

  function restPoint(leg) {
    return toWorld(Math.cos(leg.a) * leg.len, Math.sin(leg.a) * leg.len);
  }

  function hipPoint(leg) {
    return toWorld(Math.sign(Math.cos(leg.a) || 1) * HIP, 0);
  }

  function stretch(leg) {
    const rest = restPoint(leg);
    return Math.hypot(leg.foot.x - rest.x, leg.foot.y - rest.y);
  }

  function reset() {
    Object.assign(body, { x: 0.5, y: 0.5, rot: 0, vx: 0, vy: 0 });
    legs = LEGS_4.map((leg) => ({
      ...leg,
      foot: { x: 0, y: 0 },
      swing: -1,
      from: null,
      to: null,
    }));
    for (const leg of legs) leg.foot = restPoint(leg);
    marks = [];
    marksOpacity = params.marks ? 1 : 0;
    idle = 0;
  }

  function liftGroup(group, settling = false) {
    const speed = Math.hypot(body.vx, body.vy);
    const ahead = settling ? 0 : params.lead * params.stride * 4;
    const dx = speed ? (body.vx / speed) * ahead : 0;
    const dy = speed ? (body.vy / speed) * ahead : 0;
    for (const leg of legs) {
      if (leg.group !== group) continue;
      const rest = restPoint(leg);
      leg.swing = 0;
      leg.from = { ...leg.foot };
      leg.to = { x: rest.x + dx, y: rest.y + dy };
    }
  }

  function stepLegs() {
    const bodySpeed = Math.hypot(body.vx, body.vy);
    const swingTime = clamp((params.swing * 0.3) / Math.max(0.08, bodySpeed), 0.04, 0.5);

    if (!legs.some((leg) => leg.swing >= 0)) {
      const threshold = idle >= SETTLE_DELAY ? SETTLE_EPSILON : params.stride;
      for (const group of [0, 1]) {
        if (!legs.some((leg) => leg.group === group && stretch(leg) > threshold)) continue;
        liftGroup(group, idle >= SETTLE_DELAY);
        break;
      }
    }

    for (const leg of legs) {
      if (leg.swing < 0) continue;
      leg.swing += STEP / swingTime;
      const t = Math.min(1, leg.swing);
      const ease = t * t * (3 - 2 * t);
      leg.foot = {
        x: leg.from.x + (leg.to.x - leg.from.x) * ease,
        y: leg.from.y + (leg.to.y - leg.from.y) * ease,
      };
      if (t < 1) continue;
      leg.swing = -1;
      if (params.marks) marks.push({ x: leg.foot.x, y: leg.foot.y, age: 0 });
    }
  }

  function step() {
    let dx = pointer.x - body.x;
    let dy = pointer.y - body.y;
    if (params.flee) {
      dx = -dx;
      dy = -dy;
    }
    const dist = Math.hypot(dx, dy) || 1;
    const wanted = params.flee ? params.speed : Math.min(params.speed, dist * 2.4);
    body.vx += ((dx / dist) * wanted - body.vx) * 0.22;
    body.vy += ((dy / dist) * wanted - body.vy) * 0.22;
    body.x = clamp(body.x + body.vx * STEP, BOUND, 1 - BOUND);
    body.y = clamp(body.y + body.vy * STEP, BOUND, 1 - BOUND);

    const moving = Math.hypot(body.vx, body.vy) > 0.03;
    const goal = params.turn && moving ? wrap(Math.atan2(body.vy, body.vx) + Math.PI / 2) : 0;
    const turn = wrap(goal - body.rot);
    body.rot = wrap(body.rot + clamp(turn, -4.8 * STEP, 4.8 * STEP));

    idle += STEP;
    stepLegs();

    if (params.marks) marksOpacity = 1;
    else marksOpacity *= Math.exp((-STEP * params.fade) / 1.4);
    for (const mark of marks) mark.age += STEP * params.fade;
    marks = marks.filter((mark) => mark.age < MARK_LIFE);
    if (!params.marks && marksOpacity < 0.002) marks = [];
  }

  function line(x1, y1, x2, y2) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = WIDTH * S;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1 * S, y1 * S);
    ctx.lineTo(x2 * S, y2 * S);
    ctx.stroke();
  }

  function dot(x, y, alpha) {
    ctx.fillStyle = `rgba(${RED[0]},${RED[1]},${RED[2]},${alpha})`;
    ctx.beginPath();
    ctx.arc(x * S, y * S, (WIDTH * S) / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, S, S);

    if (marksOpacity > 0.001) {
      for (const mark of marks) {
        const ageOpacity = clamp((MARK_LIFE - mark.age) / MARK_FADE, 0, 1);
        dot(mark.x, mark.y, marksOpacity * ageOpacity);
      }
    }

    const top = toWorld(0, -STEM);
    const bottom = toWorld(0, STEM);
    line(top.x, top.y, bottom.x, bottom.y);

    for (const leg of legs) {
      const hip = hipPoint(leg);
      line(hip.x, hip.y, leg.foot.x, leg.foot.y);
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
    idle = 0;
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

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'веди курсором — Ж перебирает лапами · 3 секунды — покой';

  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.hidden = true;
  panel.style.maxHeight = 'calc(100% - 64px)';
  panel.style.overflowY = 'auto';

  function addRange(control) {
    const label = document.createElement('label');
    label.textContent = control.label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = control.min;
    input.max = control.max;
    input.step = control.step;
    input.value = params[control.key];
    input.addEventListener('input', () => {
      params[control.key] = Number(input.value);
    });
    label.append(input);
    panel.append(label);
  }

  function addSwitch(item) {
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

  for (const control of CONTROLS) addRange(control);
  addSwitch({ key: 'marks', label: 'след' });
  addRange(FADE_CONTROL);
  for (const item of SWITCHES) addSwitch(item);

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
    if (event.key !== 'Tab') return;
    if (event.target.closest('input, textarea')) return;
    event.preventDefault();
    toggle.click();
  }

  workspace.append(hint, panel, toggle);

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(workspace);
  canvas.addEventListener('pointerdown', track);
  canvas.addEventListener('pointermove', track);
  document.addEventListener('keydown', onKeyDown);

  resize();
  reset();
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', track);
    canvas.removeEventListener('pointermove', track);
    document.removeEventListener('keydown', onKeyDown);
    hint.remove();
    panel.remove();
    toggle.remove();
    canvas.style.cursor = '';
    ctx.clearRect(0, 0, S, S);
    delete workspace.dataset.ground;
  };
}
