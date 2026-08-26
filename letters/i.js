/* И — вертикаль, диагональ, вертикаль. Ровно один период пилы, прочитанный
   между двумя спадами. Симметрия — доля периода под подъёмом — тянет волну
   от N через равнобедренный шатёр к И, так что «И зеркальна N» здесь не
   наблюдение со стороны, а положение ручки прибора.

   Сцена держится на второй ручке — уровне запуска. Развёртка ждёт, пока
   сигнал пересечёт его на подъёме, и только тогда срывается с места: потому
   картинка и стоит. Уровень вне размаха ловить нечего, кадры приходят со
   своей фазой и ложатся друг на друга. Прибор при этом греется и уводит
   ноль, так что букву надо не поймать однажды, а держать.

   Красный тут один и обозначает событие: захват потерян. */

const STEP = 1 / 60;
const RED = '#e0210f';
const MARK = [241, 237, 229];

const DIV = 10;              // делений на экране в каждую сторону
const CHUNK = 3;             // сегментов в одном мазке гаснущего хвоста
const WIDE = 2;              // во сколько раз бледный ореол шире ядра луча
const GHOSTS = 5;            // сколько разъехавшихся кадров показывает срыв
const RUN_RATE = 0.42;       // кадров развёртки в секунду у бегунка
const RUN_TAIL = 0.13;       // какую долю следа занимает его хвост

const PARAMS = {
  symmetry: 1,
  periods: 2,
  amp: 0.61,
  band: 0.45,
  noise: 0,
  rate: 1.25,
  drift: false,
  runner: true,
};

const CONTROLS = [
  { key: 'symmetry', label: 'симметрия', min: 0, max: 1, step: 0.01 },
  { key: 'periods', label: 'развёртка', min: 1, max: 6, step: 0.1 },
  { key: 'amp', label: 'амплитуда', min: 0.06, max: 0.92, step: 0.01 },
  { key: 'band', label: 'полоса', min: 0, max: 0.45, step: 0.005 },
  { key: 'noise', label: 'шум', min: 0, max: 1, step: 0.02 },
  { key: 'rate', label: 'частота сигнала', min: 0, max: 3, step: 0.05 },
];

const SWITCHES = [
  { key: 'drift', label: 'дрейф' },
  { key: 'runner', label: 'бегунок' },
];

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/* Уровень в доле размаха, 0…1. Симметрия — доля периода под подъёмом:
   ноль даёт мгновенный подъём и пологий спад, единица — наоборот. */
function sawRaw(phase, symmetry) {
  const u = phase - Math.floor(phase);
  const s = clamp(symmetry, 0, 1);
  if (s <= 0.0005) return 1 - u;
  if (s >= 0.9995) return u;
  return u < s ? u / s : 1 - (u - s) / (1 - s);
}

/* Скругление фронтов — это ограничение полосы, то есть свёртка с треугольным
   окном. Считать её по отсчётам нельзя: на изгибе выходит столько граней,
   сколько отсчётов, а на отвесном спаде — столько ступеней, потому что
   усреднение разрыва по конечному числу точек и есть лесенка. Пила
   кусочно-линейна, поэтому свёртка берётся точно.

   Треугольное окно — это два прямоугольных подряд, значит нужна вторая
   первообразная: тогда свёртка — её вторая разность с шагом в полуширину
   окна. Ниже x²/4 — вклад среднего уровня, n·mean — накопленное за целые
   периоды, остальное — кусок внутри текущего периода. */
function sawArea2(x, symmetry) {
  const s = clamp(symmetry, 0, 1);
  const n = Math.floor(x);
  const u = x - n;
  let area;
  if (u < s) {
    area = (u * u * u) / (6 * Math.max(s, 1e-9)) - (u * u) / 4;
  } else {
    const w = u - s;
    area = -(s * s) / 12 + (w * w) / 4 - (w * w * w) / (6 * Math.max(1 - s, 1e-9));
  }
  return (x * x) / 4 + n * ((1 - 2 * s) / 12) + area;
}

function sawLevel(phase, symmetry, band) {
  const half = band / 2;
  if (half <= 0.0005) return sawRaw(phase, symmetry);
  return (sawArea2(phase + half, symmetry)
    - 2 * sawArea2(phase, symmetry)
    + sawArea2(phase - half, symmetry)) / (half * half);
}

/* Шум на экране. Частоты заданы прямо в периодах на кадр и держатся вдесятеро
   ниже того, что развёртка успевает сосчитать. Разгонишь выше — недосчёт
   свернёт их в ровную ступеньку, и линия будет не рябить, а ломаться. */
function fizz(u, seed) {
  return Math.sin(u * 91 + seed * 7.1) * 0.62
    + Math.sin(u * 57 - seed * 4.3) * 0.28
    + Math.sin(u * 23 + seed * 2.7) * 0.1;
}

/* Дрожь захвата: три несоизмеримые синусоиды, чтобы рисунок не повторялся. */
function tremble(t) {
  return Math.sin(t * 11.7) * 0.6 + Math.sin(t * 27.3) * 0.3 + Math.sin(t * 5.1) * 0.1;
}

export function mountI(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { ...PARAMS };
  const state = { time: 0, run: 0, free: 0, offset: 0, level: 0.5 };

  canvas.style.cursor = 'ns-resize';

  let S = 1;
  let steps = 600;
  let frameId = 0;
  let debt = 0;
  let last = performance.now();

  const ink = (alpha) => `rgba(${MARK[0]},${MARK[1]},${MARK[2]},${alpha})`;

  function resize() {
    const bounds = workspace.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    S = Math.max(1, Math.min(bounds.width, bounds.height));
    canvas.width = Math.round(bounds.width * dpr);
    canvas.height = Math.round(bounds.height * dpr);
    canvas.style.width = `${bounds.width}px`;
    canvas.style.height = `${bounds.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Спад должен выйти отвесным, но на узком экране считать втрое незачем.
    steps = Math.max(360, Math.round(S * 1.3));
  }

  function line(x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width * S;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1 * S, y1 * S);
    ctx.lineTo(x2 * S, y2 * S);
    ctx.stroke();
  }

  /* Сетка — и координатный ориентир, и половина стиля прибора. Центральные
     оси заметнее прочих, на них — насечки по пятой доле деления. */
  function drawScreen() {
    const step = 1 / DIV;
    for (let i = 0; i <= DIV; i += 1) {
      const at = i * step;
      const axis = i === DIV / 2;
      const tone = axis ? ink(0.24) : ink(0.075);
      const weight = axis ? 0.0016 : 0.001;
      line(at, 0, at, 1, tone, weight);
      line(0, at, 1, at, tone, weight);
    }
    const tick = step / 5;
    for (let i = 1; i < DIV * 5; i += 1) {
      if (i % 5 === 0) continue;
      const at = i * tick;
      line(at, 0.492, at, 0.508, ink(0.18), 0.001);
      line(0.492, at, 0.508, at, ink(0.18), 0.001);
    }
  }

  // Люминофор: широкий бледный ореол под узким ядром.
  function stroke(points, from, to, alpha, width) {
    if (to - from < 1 || alpha <= 0.004) return;
    ctx.beginPath();
    ctx.moveTo(points[from][0], points[from][1]);
    for (let i = from + 1; i <= to; i += 1) ctx.lineTo(points[i][0], points[i][1]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ink(alpha * 0.1);
    ctx.lineWidth = width * WIDE;
    ctx.stroke();
    ctx.strokeStyle = ink(alpha);
    ctx.lineWidth = width;
    ctx.stroke();
  }

  /* Кадр развёртки от края до края: волна занимает весь экран. Фаза привязана
     к середине — фронты стоят на целой фазе, значит буква лежит между 0 и 1. */
  function sawPoints(phase, seed) {
    const points = [];
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      let level = sawLevel(phase + u * params.periods, params.symmetry, params.band);
      if (params.noise) level += params.noise * 0.03 * fizz(u, seed);
      const y = 0.5 - (level - 0.5) * params.amp + state.offset;
      points.push([u * S, y * S]);
    }
    return points;
  }

  /* Бегунок: след горит ровно, а под лучом вспыхивает и гаснет короткий хвост. */
  function drawRunner(points, width) {
    const tip = points.length - 1;
    const span = Math.max(1, RUN_TAIL * tip);
    const to = Math.round(clamp(state.run, 0, 1) * tip);
    for (let i = Math.max(0, Math.floor(to - span)); i < to; i += CHUNK) {
      const end = Math.min(to, i + CHUNK);
      stroke(points, i, end, 1 - (to - end) / span, width);
    }
    ctx.beginPath();
    ctx.arc(points[to][0], points[to][1], width * 1.1, 0, Math.PI * 2);
    ctx.fillStyle = ink(1);
    ctx.fill();
  }

  function drawSweep(points, width) {
    if (!params.runner) {
      stroke(points, 0, points.length - 1, 1, width);
      return;
    }
    stroke(points, 0, points.length - 1, 0.62, width);
    drawRunner(points, width);
  }

  /* Крестик закрытия занимает у верхнего края 40 px и на узком кадре не
     умещается в долю: зазор поэтому задан в пикселях, а не в доле стороны. */
  function status(text, hot) {
    ctx.fillStyle = hot ? RED : ink(0.45);
    ctx.font = `${Math.max(10, Math.round(S * 0.022))}px 'DM Mono', ui-monospace, monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(text, S * 0.955, Math.max(62, S * 0.115));
    ctx.textAlign = 'left';
  }

  function advance() {
    state.time += STEP;
    state.free += STEP * params.rate;
    state.run = (state.run + STEP * RUN_RATE) % 1;
    // Прибор греется и уводит ноль: уровень приходится подправлять.
    state.offset = params.drift ? Math.sin(state.time * 0.21) * 0.16 : 0;
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawScreen();

    // Уровень задан в кадре, а сигнал живёт в долях размаха: переводим обратно.
    const signal = 0.5 + (0.5 + state.offset - state.level) / Math.max(params.amp, 0.001);
    const inside = signal > 0.02 && signal < 0.98;
    const width = S * 0.005;

    if (inside) {
      /* Захват держит фазу: подъём занимает долю периода, равную симметрии,
         и приходит к уровню всегда в один и тот же миг. У края размаха сигнал
         проводит меньше времени, и шум легче сбивает точку пересечения. */
      const margin = Math.min(signal, 1 - signal);
      const shake = params.noise * clamp(0.09 / Math.max(margin, 0.02), 0, 1);
      const lock = signal * clamp(params.symmetry, 0.001, 1);
      const jitter = shake * 0.09 * tremble(state.time * 9);
      drawSweep(sawPoints(lock + jitter, state.time * 3), width);
    } else {
      for (let g = 0; g < GHOSTS; g += 1) {
        stroke(sawPoints(state.free + g * 0.37, state.time * 3 + g), 0, steps, 0.34, S * 0.004);
      }
    }

    ctx.save();
    ctx.setLineDash([S * 0.012, S * 0.012]);
    line(0, state.level, 1, state.level, inside ? ink(0.4) : RED, 0.0014);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(0, (state.level - 0.014) * S);
    ctx.lineTo(0.022 * S, state.level * S);
    ctx.lineTo(0, (state.level + 0.014) * S);
    ctx.fillStyle = inside ? ink(0.55) : RED;
    ctx.fill();

    status(inside ? 'захват' : 'срыв', !inside);
  }

  function frame(now) {
    debt = Math.min(0.1, debt + (now - last) / 1000);
    last = now;
    while (debt >= STEP) {
      advance();
      debt -= STEP;
    }
    draw();
    frameId = requestAnimationFrame(frame);
  }

  function track(event) {
    const bounds = canvas.getBoundingClientRect();
    state.level = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
  }

  // Палец, уехавший за край кадра, должен продолжать вести уровень.
  function onDown(event) {
    track(event);
    try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* Safari может отказать */ }
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'веди указателем — это уровень запуска · попал в размах, буква стоит';

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
    input.addEventListener('input', () => { params[control.key] = Number(input.value); });
    label.append(input);
    panel.append(label);
  }

  for (const item of SWITCHES) {
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

  // Внутри открытой панели Tab по-прежнему переставляет фокус между ползунками.
  function onKeyDown(event) {
    if (event.key !== 'Tab' || event.target.closest('input, textarea')) return;
    event.preventDefault();
    toggle.click();
  }

  workspace.append(hint, panel, toggle);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(workspace);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', track);
  document.addEventListener('keydown', onKeyDown);

  resize();
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', track);
    document.removeEventListener('keydown', onKeyDown);
    hint.remove();
    panel.remove();
    toggle.remove();
    canvas.style.cursor = '';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
