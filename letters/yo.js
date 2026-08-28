import { reportScore } from '../wall.js?v=4';

const INK = '#161616';
const PAPER = '#f1ede5';
const RED = '#e0210f';
const STEP = 1 / 60;
const SUBSTEPS = 3;

/* Пропорции с эскиза: корпус 489x112 при кадре 1200, точки r=31.
   База шире эскизной: со свесами в четверть длины буква цепляет землю носом. */
const SCALE = 0.62;
const BODY_W = 0.407 * SCALE;
const BODY_H = 0.093 * SCALE;
const WHEEL_X = 0.4;
const WHEEL_DROP = 0.048;
const STROKE = 0.0092 * SCALE;
const WHEEL_BASE = 0.016;
const SCREEN_X = 0.3;
const INERTIA = 0.02;
const CAM_Y = 0.55;

const PARAMS = {
  power: 3.4,
  gravity: 2,
  stiff: 260,
  lean: 5,
  relief: 1,
  wheel: WHEEL_BASE,
  day: false,
  digits: true,
};

const DAMP = 14;
const GRIP = 2;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function hash1(i) {
  const x = Math.sin(i * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const t = f * f * (3 - 2 * f);
  return (hash1(i) + (hash1(i + 1) - hash1(i)) * t) - 0.5;
}

export function mountYo(workspace) {
  /* Рекорд уезжает на холст Я — см. букву З. */
  const record = (value) => {
    if (value <= state.best) return;
    reportScore('Ё', value, workspace);
  };
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { ...PARAMS };
  const keys = new Set();
  const touches = new Map();
  const bike = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, omega: 0, wheelsOn: [false, false] };
  const state = {
    phase: 'intro',
    timer: 0,
    runStart: 0,
    best: 0,
    camY: 0,
    wheelDrop: [0, 0],
    revive: null,
    touched: false,
  };

  canvas.style.cursor = 'pointer';

  let S = 0;
  let W = 0;
  let H = 0;
  let dt = STEP;
  let frameId = 0;
  let last = performance.now();
  let debt = 0;

  function widthUnits() {
    return W / S;
  }

  function wheelR() {
    return params.wheel;
  }

  /* большая точка отодвигает крепление, иначе она накрывает саму букву */
  function wheelOffset() {
    return BODY_H / 2 + Math.max(WHEEL_DROP, wheelR() * 1.15);
  }

  /* момент инерции растёт вместе с разносом масс: раскрутить букву
     на больших колёсах тяжелее ровно настолько, насколько длиннее плечо */
  function inertia() {
    const reach = wheelOffset() + wheelR();
    const base = BODY_H / 2 + WHEEL_DROP + WHEEL_BASE;
    return INERTIA * (reach / base) ** 2;
  }

  /* трамплины: редкие гладкие горбы, с которых на скорости отрывает */
  function bumps(x) {
    let sum = 0;
    const cell = Math.floor(x / 3.4);
    for (let k = cell - 1; k <= cell + 1; k += 1) {
      const center = k * 3.4 + hash1(k * 3.7) * 2.2;
      const width = 0.3 + hash1(k * 9.1) * 0.28;
      const height = 0.06 + hash1(k * 5.3) * 0.09;
      const d = (x - center) / width;
      if (Math.abs(d) < 1.8) sum -= height * Math.exp(-d * d * 2.2);
    }
    return sum;
  }

  /* сложность привязана к месту на трассе, а не ко времени: земля позади
     остаётся прежней, а впереди растёт */
  function ground(x) {
    const relief = params.relief * (1 + clamp(x / 45, 0, 1) * 1.1);
    return 0.62
      + (noise1(x * 0.42) * 0.2
        + noise1(x * 1.15 + 11.3) * 0.075
        + Math.sin(x * 2.4 + 0.4) * 0.014
        + bumps(x)) * relief;
  }

  function slopeAt(x) {
    const step = 0.004;
    return (ground(x + step) - ground(x - step)) / (2 * step);
  }

  function normalAt(x) {
    const slope = slopeAt(x);
    const norm = Math.hypot(slope, 1);
    return { x: slope / norm, y: -1 / norm, tx: 1 / norm, ty: slope / norm };
  }

  function bikePoint(lx, ly) {
    const cos = Math.cos(bike.angle);
    const sin = Math.sin(bike.angle);
    return { x: bike.x + lx * cos - ly * sin, y: bike.y + lx * sin + ly * cos };
  }

  function wheelPoint(index) {
    return bikePoint((index === 0 ? -1 : 1) * WHEEL_X * BODY_W, wheelOffset());
  }

  function corners() {
    return [
      [-BODY_W / 2, -BODY_H / 2], [BODY_W / 2, -BODY_H / 2],
      [BODY_W / 2, BODY_H / 2], [-BODY_W / 2, BODY_H / 2],
    ].map(([lx, ly]) => bikePoint(lx, ly));
  }

  function standHeight(x) {
    return ground(x) - (BODY_H / 2 + Math.max(WHEEL_DROP, wheelR() * 1.15) + wheelR());
  }

  /* первый кадр — не игра, а обычная Ё, лежащая точками вверх:
     она встаёт на них только после первого касания */
  function restart() {
    bike.x = 0;
    bike.y = ground(0) - BODY_H / 2 - STROKE * 2;
    bike.vx = 0;
    bike.vy = 0;
    bike.angle = Math.PI;
    bike.omega = 0;
    state.phase = 'intro';
    state.timer = 0;
    state.runStart = 0;
    state.camY = bike.y;
    state.wheelDrop = [0, 0];
  }

  function distance() {
    return Math.max(0, bike.x - state.runStart);
  }

  function control() {
    const zones = [...touches.values()];
    return {
      throttle: keys.has('up') || zones.includes('throttle') ? 1 : 0,
      brake: keys.has('down') || zones.includes('brake') ? 1 : 0,
      lean: (keys.has('right') || zones.includes('front') ? 1 : 0)
        - (keys.has('left') || zones.includes('back') ? 1 : 0),
    };
  }

  /* тяга только на задней точке — отсюда вилли; тормоз на обеих и сильнее
     на передней, иначе на переднюю точку не встать: к ней нечего приложить */
  function wheelContact(index, throttle = 0, brake = 0) {
    const point = wheelPoint(index);
    const radius = wheelR();
    const drop = point.y + radius - ground(point.x);
    state.wheelDrop[index] = 0;
    bike.wheelsOn[index] = drop > 0;
    if (drop <= 0) return false;
    state.wheelDrop[index] = drop;

    const n = normalAt(point.x);
    /* на склоне вертикальный зазор длиннее настоящего — меряем по нормали */
    const depth = drop * -n.y;
    const rx = point.x - bike.x;
    const ry = point.y - bike.y;
    const vpx = bike.vx - bike.omega * ry;
    const vpy = bike.vy + bike.omega * rx;
    const vn = vpx * n.x + vpy * n.y;
    const vt = vpx * n.tx + vpy * n.ty;

    const normal = Math.max(0, clamp(depth, 0, 0.06) * params.stiff - vn * DAMP);
    let along = -vt * GRIP;
    if (index === 0) along += throttle * params.power;
    along -= vt * brake * (index === 1 ? 3.5 : 1.5);

    const fx = n.x * normal + n.tx * along;
    const fy = n.y * normal + n.ty * along;
    bike.vx += fx * dt;
    bike.vy += fy * dt;
    bike.omega += (rx * fy - ry * fx) / inertia() * dt;
    return true;
  }

  /* на кувырке удар приходит быстрее, чем срабатывает пружина,
     поэтому точка ещё и выталкивается из земли позиционно */
  function pushOut() {
    [0, 1].forEach((index) => {
      const point = wheelPoint(index);
      const drop = point.y + wheelR() - ground(point.x);
      if (drop <= 0) return;
      const n = normalAt(point.x);
      const depth = drop * -n.y;
      bike.x += n.x * depth;
      bike.y += n.y * depth;
      const vn = bike.vx * n.x + bike.vy * n.y;
      if (vn < 0) { bike.vx -= n.x * vn; bike.vy -= n.y * vn; }
    });
  }

  function stepRide() {
    const { throttle, brake, lean } = control();
    bike.vy += params.gravity * dt;

    let contacts = 0;
    [0, 1].forEach((index) => {
      if (wheelContact(index, throttle, brake)) contacts += 1;
    });

    bike.omega += lean * params.lean * (contacts ? 0.35 : 1) * dt;
    bike.omega *= contacts ? 1 - 0.03 * (dt / STEP) : 1 - 0.005 * (dt / STEP);
    bike.omega = clamp(bike.omega, -5, 5);
    bike.vx = clamp(bike.vx, -1.2, 2.4);

    bike.x += bike.vx * dt;
    bike.y += bike.vy * dt;
    bike.angle += bike.omega * dt;

    /* допуск в толщину линии: касание мельче неё не видно глазу,
       и краш по нему читается как несправедливый */
    for (const corner of corners()) {
      if (corner.y > ground(corner.x) + STROKE) {
        state.phase = 'fall';
        state.timer = 0;
        record(distance());
        state.best = Math.max(state.best, distance());
        return;
      }
    }
  }

  /* падение: корпус разговаривает с землёй сам, и его доворачивает
     в нормальное положение буквы — точками вверх */
  function stepFall() {
    bike.vy += params.gravity * dt;
    state.timer += dt;
    [0, 1].forEach((index) => wheelContact(index));

    corners().forEach((corner) => {
      const depth = corner.y - ground(corner.x);
      if (depth <= 0) return;
      const n = normalAt(corner.x);
      const rx = corner.x - bike.x;
      const ry = corner.y - bike.y;
      const vpx = bike.vx - bike.omega * ry;
      const vpy = bike.vy + bike.omega * rx;
      const vn = vpx * n.x + vpy * n.y;
      const normal = Math.max(0, clamp(depth * -n.y, 0, 0.05) * 240 - vn * 16);
      const friction = -(vpx * n.tx + vpy * n.ty) * 4;
      const fx = n.x * normal + n.tx * friction;
      const fy = n.y * normal + n.ty * friction;
      bike.vx += fx * dt;
      bike.vy += fy * dt;
      bike.omega += (rx * fy - ry * fx) / inertia() * dt;
    });

    const target = bike.angle > 0 ? Math.PI : -Math.PI;
    bike.omega += (target - bike.angle) * 2.4 * dt;
    bike.omega = clamp(bike.omega * (1 - 0.015 * (dt / STEP)), -6, 6);
    bike.vx *= 1 - 0.01 * (dt / STEP);

    bike.x += bike.vx * dt;
    bike.y += bike.vy * dt;
    bike.angle += bike.omega * dt;
    pushOut();

    const settled = Math.abs(bike.omega) < 0.35 && Math.abs(bike.vy) < 0.12;
    if (state.timer > 0.7 && settled) {
      state.phase = 'rest';
      state.timer = 0;
      updateHint();
    }
  }

  /* покой: буква укладывается ровно по рельефу и ждёт касания */
  function stepRest() {
    state.timer += STEP;
    const turn = bike.angle > 0 ? Math.PI : -Math.PI;
    const target = turn + Math.atan(slopeAt(bike.x));
    bike.angle += (target - bike.angle) * 0.12;
    bike.omega = 0;
    bike.vx *= 0.9;
    bike.vy = 0;
    const lie = ground(bike.x) - BODY_H / 2 - STROKE * 2;
    bike.y += (lie - bike.y) * 0.12;
  }

  /* оживление: буква докручивает оборот и снова встаёт на точки */
  function stepRevive() {
    state.timer += STEP;
    const t = clamp(state.timer / 0.55, 0, 1);
    const ease = t * t * (3 - 2 * t);
    const from = state.revive;
    const lift = Math.sin(Math.PI * t) * 0.09;
    bike.angle = from.angle + (from.turn - from.angle) * ease;
    bike.y = from.y + (from.stand - from.y) * ease - lift;
    if (t < 1) return;
    bike.angle = 0;
    bike.omega = 0;
    bike.vx = 0;
    bike.vy = 0;
    state.phase = 'ride';
    state.runStart = bike.x;
    updateHint();
  }

  function revive() {
    if (state.phase !== 'rest' && state.phase !== 'intro') return false;
    state.phase = 'revive';
    state.timer = 0;
    state.revive = {
      angle: bike.angle,
      turn: bike.angle > 0 ? Math.PI * 2 : -Math.PI * 2,
      y: bike.y,
      stand: standHeight(bike.x),
    };
    return true;
  }

  function step() {
    if (state.phase === 'ride' || state.phase === 'fall') {
      /* подшаги: за целый кадр точка проходит больше своего радиуса
         и на скорости протыкает бугор насквозь */
      dt = STEP / SUBSTEPS;
      for (let i = 0; i < SUBSTEPS; i += 1) {
        if (state.phase === 'ride') stepRide();
        else if (state.phase === 'fall') stepFall();
        else break;
      }
      dt = STEP;
    } else if (state.phase === 'rest' || state.phase === 'intro') stepRest();
    else stepRevive();
    state.camY += (bike.y - state.camY) * 0.06;
  }

  function draw() {
    const camX = bike.x - SCREEN_X * widthUnits();
    const camY = state.camY - CAM_Y;
    const resting = state.phase === 'rest';
    const sky = params.day ? PAPER : INK;
    const soil = params.day ? INK : PAPER;
    /* буква одного цвета с землёй, а коснувшись рельефа — краснеет целиком */
    const ink = state.phase === 'fall' || resting ? RED : soil;

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.beginPath();
    const span = widthUnits();
    for (let sx = 0; sx <= span + 0.004; sx += 0.004) {
      const y = (ground(camX + sx) - camY) * S;
      if (sx === 0) ctx.moveTo(0, y);
      else ctx.lineTo(sx * S, y);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = soil;
    ctx.fill();

    ctx.save();
    ctx.translate((bike.x - camX) * S, (bike.y - camY) * S);
    ctx.rotate(bike.angle);
    const half = BODY_W / 2 * S;
    const top = -BODY_H / 2 * S;
    const bottom = BODY_H / 2 * S;
    ctx.strokeStyle = ink;
    ctx.lineWidth = S * STROKE;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(-half, top);
    ctx.lineTo(half, top);
    ctx.lineTo(half, bottom);
    ctx.lineTo(-half, bottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
    ctx.restore();

    [0, 1].forEach((index) => {
      const point = wheelPoint(index);
      ctx.beginPath();
      ctx.arc((point.x - camX) * S, (point.y - camY - state.wheelDrop[index]) * S, wheelR() * S, 0, Math.PI * 2);
      ctx.fillStyle = ink;
      ctx.fill();
    });

    if (!params.digits || state.phase === 'intro') return;
    const anchorX = (bike.x - camX) * S;
    const anchorY = (bike.y - camY) * S;
    const above = Math.max(0.12, wheelR() + 0.09);
    ctx.textAlign = 'center';
    ctx.fillStyle = soil;
    ctx.globalAlpha = 0.5;
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = `${S * 0.004}px`;
    ctx.font = `${Math.round(S * 0.021)}px 'DM Mono', ui-monospace, monospace`;
    ctx.fillText(distance().toFixed(1), anchorX, anchorY - above * S);
    if (resting) ctx.fillText(`лучший ${state.best.toFixed(1)}`, anchorX, anchorY - (above + 0.035) * S);
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function resize() {
    const bounds = workspace.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, bounds.width);
    H = Math.max(1, bounds.height);
    const next = Math.min(W, H);
    const fresh = !S;
    S = next;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (fresh) restart();
  }

  /* кадр делится на четыре зоны: снизу газ и тормоз, сверху наклон */
  function zoneAt(x, y) {
    const right = x > W / 2;
    if (y > H / 2) return right ? 'throttle' : 'brake';
    return right ? 'front' : 'back';
  }

  function onPointerDown(event) {
    if (event.pointerType === 'touch' && !state.touched) {
      state.touched = true;
      updateHint();
    }
    try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* Safari may reject capture */ }
    if (revive()) return;
    const bounds = canvas.getBoundingClientRect();
    touches.set(event.pointerId, zoneAt(event.clientX - bounds.left, event.clientY - bounds.top));
  }

  function onPointerMove(event) {
    if (!touches.has(event.pointerId)) return;
    const bounds = canvas.getBoundingClientRect();
    touches.set(event.pointerId, zoneAt(event.clientX - bounds.left, event.clientY - bounds.top));
  }

  function onPointerUp(event) {
    touches.delete(event.pointerId);
  }

  const KEYS = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };

  function onKeyDown(event) {
    if (event.target instanceof Element && event.target.closest('input, textarea')) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      toggle.click();
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      revive();
      return;
    }
    const key = KEYS[event.code];
    if (!key) return;
    event.preventDefault();
    keys.add(key);
    /* газ поднимает лежащую букву сам: держать клавишу и ждать клика незачем */
    if (key === 'up') revive();
  }

  function onKeyUp(event) {
    const key = KEYS[event.code];
    if (key) keys.delete(key);
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

  function updateHint() {
    const byTouch = state.touched || narrow.matches;
    if (state.phase === 'intro') {
      hint.textContent = byTouch ? 'коснись — буква поедет' : '↑ или клик — буква поедет';
      return;
    }
    if (state.phase === 'rest') {
      hint.textContent = byTouch ? 'коснись — буква встанет' : '↑ или клик — буква встанет';
      return;
    }
    hint.textContent = byTouch
      ? 'низ справа — газ, слева — тормоз · верх — наклон'
      : '↑ газ · ↓ тормоз · ← → наклон';
  }

  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.hidden = true;
  panel.style.width = '178px';

  function makeSwitch(label, key, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sketch-switch';
    button.textContent = label;
    button.setAttribute('aria-pressed', String(params[key]));
    button.addEventListener('click', () => {
      params[key] = !params[key];
      button.setAttribute('aria-pressed', String(params[key]));
      action?.(params[key]);
    });
    panel.append(button);
    return button;
  }

  /* подписи внизу кадра лежат на земле, а она инвертирована относительно
     неба: крестику наверху хватает ground, а этим нужен свой цвет.
     На узком экране подсказка уезжает в панель со своим фоном — там
     цвет уже решает styles.css, и инлайн только помешал бы. */
  const narrow = window.matchMedia('(max-width: 510px)');

  function applyTheme() {
    if (params.day) workspace.dataset.ground = 'paper';
    else delete workspace.dataset.ground;
    const onSoil = params.day ? 'rgba(241, 237, 229, .45)' : 'rgba(22, 22, 22, .45)';
    hint.style.color = narrow.matches ? '' : onSoil;
    toggle.style.color = onSoil;
  }

  makeSwitch('день', 'day', applyTheme);
  makeSwitch('цифры', 'digits');

  const ranges = [
    { key: 'power', label: 'тяга', min: 1, max: 7, step: 0.1 },
    { key: 'gravity', label: 'тяжесть', min: 0.8, max: 4, step: 0.1 },
    { key: 'stiff', label: 'подвеска', min: 80, max: 600, step: 10 },
    { key: 'lean', label: 'наклон', min: 1, max: 12, step: 0.5 },
    { key: 'relief', label: 'рельеф', min: 0.4, max: 2, step: 0.1 },
    { key: 'wheel', label: 'колесо', min: 0.008, max: 0.13, step: 0.002 },
  ];
  for (const control of ranges) {
    const label = document.createElement('label');
    const caption = document.createElement('span');
    const input = document.createElement('input');
    caption.textContent = control.label;
    input.type = 'range';
    input.min = control.min;
    input.max = control.max;
    input.step = control.step;
    input.value = params[control.key];
    input.addEventListener('input', () => { params[control.key] = Number(input.value); });
    label.append(caption, input);
    panel.append(label);
  }

  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'sketch-action';
  again.textContent = 'заново';
  again.addEventListener('click', () => {
    state.best = 0;
    restart();
    updateHint();
  });
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

  workspace.append(hint, panel, toggle);
  applyTheme();
  updateHint();

  narrow.addEventListener('change', applyTheme);

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(workspace);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  resize();
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    narrow.removeEventListener('change', applyTheme);
    hint.remove();
    panel.remove();
    toggle.remove();
    canvas.style.cursor = '';
    ctx.clearRect(0, 0, W, H);
    delete workspace.dataset.ground;
  };
}
