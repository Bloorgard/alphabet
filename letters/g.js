// Г — это прямой угол, и больше в ней ничего нет. Сцена доводит угол до предела:
// квадрат в квадрате в квадрате, кропнутый по точке схода. Узор самоподобен,
// поэтому зум идёт вечно и шва не видно.
const PAPER = [241, 237, 229];
const INK = [22, 22, 22];
const ACCENT = [224, 33, 15];

const PARAMS = {
  drift: 0.25,    // скорость собственного зума
  ratio: 1.5,     // во сколько раз следующий угол теснее
  shift: 0.25,    // насколько курсор растаскивает плоскости
  pull: 0.5,      // насколько точка схода идёт за курсором
  paint: 3,       // каждый такой слой рождается краской, 0 — без краски
};

const CONTROLS = [
  { key: 'drift', label: 'ход', min: -1, max: 1, step: 0.01 },
  { key: 'ratio', label: 'шаг углов', min: 1.2, max: 2.2, step: 0.01 },
  { key: 'shift', label: 'сдвиг плоскостей', min: 0, max: 0.6, step: 0.01 },
  { key: 'pull', label: 'схождение за курсором', min: 0, max: 1, step: 0.01 },
  { key: 'paint', label: 'краска', min: 0, max: 12, step: 1 },
];

const SEED = 0.6;        // мельчайший угол меньше пикселя: слой рождается из точки
const SPIN = 0.0016;     // сколько зума даёт пиксель перетаскивания
const FRICTION = 0.94;   // выбег после броска

function tone(c) {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function mix(a, b, t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
}

export function mountG(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { ...PARAMS };

  let W = 0;
  let H = 0;
  let phase = 0;
  let spin = 0;              // инерция зума после броска
  let frame = 0;
  let drag = null;
  const pointer = { x: 0, y: 0, seen: false };
  const drift = { x: 0, y: 0 };
  const origin = { x: 0, y: 0 };

  function resize() {
    const rect = workspace.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!pointer.seen) {
      pointer.x = W;
      pointer.y = H;
      origin.x = W;
      origin.y = H;
    }
  }

  function step() {
    phase += (params.drift + spin) / 60;
    spin *= FRICTION;
    if (Math.abs(spin) < 1e-4) spin = 0;

    // Точка схода и параллакс догоняют курсор мягко — рывок ломает бесконечность.
    const goalX = W + (pointer.x - W) * params.pull;
    const goalY = H + (pointer.y - H) * params.pull;
    origin.x += (goalX - origin.x) * 0.06;
    origin.y += (goalY - origin.y) * 0.06;
    drift.x += (pointer.x / W - 0.5 - drift.x) * 0.05;
    drift.y += (pointer.y / H - 0.5 - drift.y) * 0.05;
  }

  function draw() {
    const ratio = params.ratio;
    const whole = Math.floor(phase);
    const frac = phase - whole;
    const reach = Math.hypot(W, H) * 2;
    const count = Math.ceil(Math.log(reach / SEED) / Math.log(ratio));
    const paint = Math.round(params.paint);
    ctx.clearRect(0, 0, W, H);

    for (let i = count - 1; i >= 0; i -= 1) {
      const size = SEED * Math.pow(ratio, i + frac);
      const depth = i / count;
      const dx = drift.x * params.shift * W * depth;
      const dy = drift.y * params.shift * H * depth;
      const base = ((i + whole) % 2 + 2) % 2 === 0 ? PAPER : INK;
      // Краска рождается в глубине и остывает, пока слой растёт до кадра.
      const painted = paint > 0 && ((i + whole) % paint + paint) % paint === 0;
      // Краска держится только в глубине: на весь кадр она бы стала фоном.
      ctx.fillStyle = painted ? mix(ACCENT, base, size / (Math.min(W, H) * 0.3)) : tone(base);
      ctx.fillRect(
        origin.x - size + dx,
        origin.y - size + dy,
        size + Math.max(0, W - origin.x) + Math.abs(dx) + 1,
        size + Math.max(0, H - origin.y) + Math.abs(dy) + 1,
      );
    }
  }

  function loop() {
    step();
    draw();
    frame = requestAnimationFrame(loop);
  }

  function track(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.seen = true;
  }

  function onPointerDown(event) {
    track(event);
    drag = { y: pointer.y };
    spin = 0;
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    track(event);
    if (!drag) return;
    // Тянешь вверх — угол наплывает, вниз — отступает.
    const delta = drag.y - pointer.y;
    drag.y = pointer.y;
    spin = delta * SPIN * 60;
    phase += delta * SPIN;
  }

  function endDrag() {
    drag = null;
  }

  function onWheel(event) {
    event.preventDefault();
    spin -= event.deltaY * SPIN * 12;
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
      input.addEventListener('input', () => {
        params[control.key] = Number(input.value);
      });
      label.append(input);
      panel.append(label);
    }

    const note = document.createElement('p');
    note.textContent = 'колесо тоже крутит углы';
    panel.append(note);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'sketch-toggle';
    toggle.dataset.letterLayer = '';
    toggle.textContent = 'параметры';
    toggle.setAttribute('aria-expanded', 'false');
    // Узор под подписью то бумажный, то чернильный: инверсия держит её читаемой.
    toggle.style.mixBlendMode = 'difference';
    toggle.style.color = '#fff';
    toggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
    });

    workspace.append(panel, toggle);
    return { panel, toggle };
  }

  function onKeyDown(event) {
    if (event.key !== 'p' && event.key !== 'з') return;
    if (event.target.closest('input, textarea')) return;
    toggle.click();
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'тяни вверх и вниз — углы наплывают';
  hint.style.mixBlendMode = 'difference';
  hint.style.color = '#fff';
  hint.style.top = '14px';
  hint.style.bottom = 'auto';
  workspace.append(hint);

  const { panel, toggle } = buildPanel();

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(workspace);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('keydown', onKeyDown);

  resize();
  loop();

  return () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', endDrag);
    canvas.removeEventListener('pointercancel', endDrag);
    canvas.removeEventListener('wheel', onWheel);
    document.removeEventListener('keydown', onKeyDown);
    panel.remove();
    toggle.remove();
    hint.remove();
  };
}
