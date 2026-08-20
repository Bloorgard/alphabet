// Г — это прямой угол, и больше в ней ничего нет. Сцена доводит угол до предела:
// квадрат в квадрате в квадрате, кропнутый по точке схода. Узор самоподобен,
// поэтому зум идёт вечно и шва не видно.
const PAPER = [241, 237, 229];
const INK = [22, 22, 22];
const ACCENT = [224, 33, 15];
const MIST = [131, 129, 122];   // средний тон бумаги и чернил, в него сходится глубина

const PARAMS = {
  drift: 0.25,    // скорость собственного зума
  ratio: 1.5,     // во сколько раз следующий угол теснее
  shift: 0.25,    // насколько курсор растаскивает плоскости
  paint: 0.9,     // сила краски, 0 — без краски
  spark: 0.3,     // на какой доле кадра угол вспыхивает
};

const CONTROLS = [
  { key: 'drift', label: 'ход', min: -1, max: 1, step: 0.01 },
  { key: 'ratio', label: 'шаг углов', min: 1.2, max: 2.2, step: 0.01 },
  { key: 'shift', label: 'сдвиг плоскостей', min: 0, max: 0.6, step: 0.01 },
  { key: 'paint', label: 'краска', min: 0, max: 1, step: 0.01 },
  { key: 'spark', label: 'где вспыхивает', min: 0.06, max: 0.9, step: 0.01 },
];

const SEED = 0.6;        // мельчайший угол меньше пикселя: слой рождается из точки
const GLOW = 0.6;        // ширина вспышки, в шагах вложения
const FAR = 0.42;        // отъезд до упора: крупнейший угол занимает столько кадра
const NEAR = 0.6;        // наезд до упора: столько кадра занимает мельчайший
const SPIN = 0.0016;     // сколько зума даёт пиксель перетаскивания
const FRICTION = 0.94;   // выбег после броска

function tone(c) {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function mixed(a, b, t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
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
  let sway = 1;              // куда камера идёт сама: к наезду или к отъезду
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
    origin.x = W;
    origin.y = H;
    if (!pointer.seen) {
      pointer.x = W;
      pointer.y = H;
    }
  }

  function step() {
    const { min, max } = bounds(params.ratio);
    phase += (params.drift * sway + spin) / 60;
    // Собственный ход камеры дышит между упорами, а не упирается в них.
    if (phase >= max) { phase = max; sway = -1; spin = 0; }
    if (phase <= min) { phase = min; sway = 1; spin = 0; }
    spin *= FRICTION;
    if (Math.abs(spin) < 1e-4) spin = 0;

    // Точка схода живёт в углу кадра: уводить её за курсором — терять кроп,
    // узор отклеивается от края и превращается в предмет посреди поля.
    // Курсор растаскивает плоскости, и догоняет их мягко: рывок ломает бесконечность.
    drift.x += (pointer.x / W - 0.5 - drift.x) * 0.05;
    drift.y += (pointer.y / H - 0.5 - drift.y) * 0.05;
  }

  // Зум конечен: у камеры два крайних положения — узор, сжатый в угол,
  // и наезд вплотную. Бесконечное самоподобие красиво, но отъехать в нём
  // невозможно: картинка повторяется на каждом шаге.
  function bounds(ratio) {
    const side = Math.min(W, H);
    const reach = Math.hypot(W, H) * 2;
    const count = Math.ceil(Math.log(reach / SEED) / Math.log(ratio)) + 1;
    const step = Math.log(ratio);
    return {
      count,
      min: Math.log((side * FAR) / SEED) / step - (count - 1),
      max: Math.log((side * NEAR) / SEED) / step,
    };
  }

  function draw() {
    const ratio = params.ratio;
    const { count, min, max } = bounds(ratio);
    phase = Math.min(max, Math.max(min, phase));
    // Краска привязана к размеру, а не к номеру слоя: номера пересчитываются
    // на каждом обороте фазы, и цвета от этого перещёлкивали.
    const spark = Math.min(W, H) * params.spark;
    // Сдвиг соразмерен слою и не превышает зазора между соседями,
    // иначе вложенность рвётся и дальние углы вылезают поверх ближних.
    const room = (1 - 1 / ratio) * 0.45;
    const shift = Math.min(params.shift, room);
    ctx.clearRect(0, 0, W, H);

    // Поле вокруг узора — цвет следующего угла: он просто ещё не вырос.
    ctx.fillStyle = tone(count % 2 === 0 ? PAPER : INK);
    ctx.fillRect(0, 0, W, H);

    for (let i = count - 1; i >= 0; i -= 1) {
      const size = SEED * Math.pow(ratio, i + phase);
      if (size > Math.hypot(W, H) * 2.5) continue;
      // Сдвиг растёт вместе с углом, но у слоёв крупнее кадра замирает:
      // соразмерный сдвиг оголил бы края.
      const span = Math.min(size, Math.min(W, H));
      const dx = drift.x * shift * span;
      const dy = drift.y * shift * span;
      const base = i % 2 === 0 ? PAPER : INK;
      // Каждый угол проходит один и тот же путь: разгорается, дойдя до своей
      // доли кадра, и гаснет, уходя дальше.
      const away = Math.log(size / spark) / Math.log(ratio);
      const heat = params.paint * Math.exp(-(away * away) / (2 * GLOW * GLOW));
      // Раскаляются только чернила: бумага остаётся бумагой, и красное
      // всегда одной природы, а не розовеет через слой.
      const hot = base === INK && heat > 0.01 ? mixed(INK, ACCENT, heat) : base;
      // У точки схода слои мельче пикселя, и их смена читается как дрожь:
      // ближе к ней контраст гаснет, узор сходится в ровный тон.
      const solid = Math.min(1, Math.max(0, (size - 4) / 22));
      ctx.fillStyle = solid >= 1 ? tone(hot) : mix(MIST, hot, solid);
      ctx.fillRect(
        origin.x - size + dx,
        origin.y - size + dy,
        size + Math.abs(dx) + 1,
        size + Math.abs(dy) + 1,
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
  hint.textContent = 'тяни вверх — углы наплывают, вниз — отступают';
  hint.style.mixBlendMode = 'difference';
  hint.style.color = '#fff';
  // Правый нижний угол занят точкой схода, там подпись не прочесть.
  hint.style.right = 'auto';
  hint.style.left = '50%';
  hint.style.transform = 'translateX(-50%)';
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
