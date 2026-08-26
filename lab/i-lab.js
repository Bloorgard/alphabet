/* И — пила на экране.

   Прописная И — это вертикаль, диагональ, вертикаль. Ровно один период пилы,
   прочитанный между двумя спадами. А симметрия — доля периода, которую
   занимает подъём, — на любом генераторе тянет треугольную волну от края
   до края:

     0    мгновенный подъём, пологий спад   —  N
     0.5  равнобедренный шатёр              —  не буква
     1    пологий подъём, отвесный спад     —  И

   Поэтому «И — зеркальная N» здесь не наблюдение со стороны, а одна ручка
   прибора: диагональ буквы — это развёртка, вертикали — фронты.

   Скругление фронтов — не рисовальный приём, а ограничение полосы: прибор
   усредняет сигнал по окну, и углы съедаются ровно так же, как у настоящего
   осциллографа. Волна при этом уходит от печатной И к рукописной.

   Рукописную «и» держит отдельная механика: там перо ставят на верхнюю
   линию строчных и первым движением ведут вниз. Если начать снизу, к букве
   спереди прирастает лишний восходящий штрих — и «и» становится «м». */

const TAU = Math.PI * 2;
const DIV = 10;              // делений на экране в каждую сторону
const SAW_STEPS = 900;       // точек на кадр: спад должен выйти отвесным
const CHUNK = 3;             // сегментов в одном мазке гаснущего луча
const WIDE = 2;              // во сколько раз бледный ореол шире ядра луча

/* ---------- экран ---------- */

/* Сетка — и координатный ориентир, и половина стиля прибора. Центральные оси
   заметнее прочих, на них — насечки по пятой доле деления. */
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

/* ---------- луч ---------- */

/* Люминофор: широкий бледный ореол под узким ядром. */
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

/* Луч дошёл до head, за ним хвост длиной tail, дальше — остаточное свечение.
   Целый ровный след идёт одним мазком: дробить его на триста — впустую. */
function drawTrace(points, width, head = 1, tail = 1, rest = 1) {
  const last = points.length - 1;
  if (head >= 1 && rest >= 1) {
    stroke(points, 0, last, 1, width);
    return;
  }
  const cut = Math.round(clamp(head, 0, 1) * last);
  const span = Math.max(1, tail * last);
  for (let i = 0; i < cut; i += CHUNK) {
    const to = Math.min(cut, i + CHUNK);
    stroke(points, i, to, Math.max(rest, 1 - (cut - to) / span), width);
  }
  if (cut > 0 && head < 1) {
    ctx.beginPath();
    ctx.arc(points[cut][0], points[cut][1], width * 0.9, 0, TAU);
    ctx.fillStyle = ink(1);
    ctx.fill();
  }
}

/* Дрожь: три несоизмеримые синусоиды, чтобы рисунок не повторялся. */
function tremble(u, phase) {
  return Math.sin(u * 11.7 + phase) * 0.6
    + Math.sin(u * 27.3 - phase * 1.7) * 0.3
    + Math.sin(u * 5.1 + phase * 0.6) * 0.1;
}

/* Шум на экране. Частоты заданы прямо в периодах на кадр и держатся ниже
   того, что развёртка успевает сосчитать: самая быстрая берётся десятком
   точек. Разгонишь выше — недосчёт свернёт её в ровную ступеньку, и линия
   будет не рябить, а ломаться. */
function fizz(u, seed) {
  return Math.sin(u * 91 + seed * 7.1) * 0.62
    + Math.sin(u * 57 - seed * 4.3) * 0.28
    + Math.sin(u * 23 + seed * 2.7) * 0.1;
}

/* ---------- пила ---------- */

/* Уровень в доле размаха, 0…1. Симметрия — доля периода под подъёмом. */
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

/* Где сигнал на самом деле ходит и где он пересекает уровень на подъёме.
   По идеальной пиле это считать нельзя: полоса срезает размах, и зона захвата
   выходит заметно шире самой волны — ловится пустое место над и под ней.
   Профиль зависит только от симметрии и полосы, поэтому держим последний. */
const SCAN = 256;
let waveShape = null;

function scanWave(symmetry, band) {
  if (waveShape && waveShape.symmetry === symmetry && waveShape.band === band) return waveShape;
  const level = new Float64Array(SCAN + 1);
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i <= SCAN; i += 1) {
    const v = sawLevel(i / SCAN, symmetry, band);
    level[i] = v;
    if (v < low) low = v;
    if (v > high) high = v;
  }
  waveShape = { symmetry, band, level, low, high };
  return waveShape;
}

/* Фаза, на которой подъём приходит к уровню. Развёртка стартует отсюда,
   поэтому картинка и стоит на месте. */
function riseAt(shape, target) {
  for (let i = 0; i < SCAN; i += 1) {
    const a = shape.level[i];
    const b = shape.level[i + 1];
    if (a <= target && b > target) return (i + (target - a) / (b - a)) / SCAN;
  }
  return 0;
}

function waveY(level, amp, offset) {
  return 0.5 - (level - 0.5) * amp + offset;
}

/* Кадр развёртки от края до края: волна занимает весь экран. */
function sawPoints(o) {
  const points = [];
  for (let i = 0; i <= SAW_STEPS; i += 1) {
    const u = i / SAW_STEPS;
    let level = sawLevel(o.phase + u * o.periods, o.symmetry, o.band);
    if (o.noise) level += o.noise * 0.03 * fizz(u, o.seed);
    points.push([u * S, waveY(level, o.amp, o.offset) * S]);
  }
  return points;
}

/* Луч бежит по уже написанному следу: сам след горит ровно, а под лучом
   вспыхивает и гаснет за ним короткий хвост. */
const RUN_RATE = 0.42;       // кадров развёртки в секунду
const RUN_TAIL = 0.13;       // какую долю следа занимает хвост

function drawRunner(points, width, head) {
  const last = points.length - 1;
  const span = Math.max(1, RUN_TAIL * last);
  const to = Math.round(clamp(head, 0, 1) * last);
  for (let i = Math.max(0, Math.floor(to - span)); i < to; i += CHUNK) {
    const end = Math.min(to, i + CHUNK);
    stroke(points, i, end, 1 - (to - end) / span, width);
  }
  ctx.beginPath();
  ctx.arc(points[to][0], points[to][1], width * 1.1, 0, TAU);
  ctx.fillStyle = ink(1);
  ctx.fill();
}

/* След целиком, а поверх — бегунок, если он включён. */
function drawSweep(points, width, running, head) {
  if (!running) {
    drawTrace(points, width);
    return;
  }
  stroke(points, 0, points.length - 1, 0.62, width);
  drawRunner(points, width, head);
}

/* Уровень на экране обратно в доли размаха: где по сигналу стоит эта высота. */
function levelToSignal(y, amp, offset) {
  return 0.5 + (0.5 + offset - y) / Math.max(amp, 0.001);
}

const MODES = {};

/* ---------- генератор ---------- */

MODES.saw = {
  label: 'генератор',
  note: 'Указатель — две ручки разом: вправо пила растягивается от центра, вверх растёт. Симметрия ведёт волну от N через шатёр к И: это одна и та же диагональ, только повёрнутая. Полоса съедает углы, и печатная И оплывает в рукописную.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'symmetry', label: 'симметрия', min: 0, max: 1, step: 0.01, value: 1 },
    { type: 'range', key: 'band', label: 'полоса', min: 0, max: 0.45, step: 0.005, value: 0 },
    { type: 'range', key: 'noise', label: 'шум', min: 0, max: 1, step: 0.02, value: 0.06 },
    { type: 'range', key: 'offset', label: 'смещение', min: -0.3, max: 0.3, step: 0.01, value: 0 },
    { type: 'toggle', key: 'runner', label: 'бегунок', value: true },
  ],

  setup() {
    modeState.time = 0;
    modeState.run = 0;
    modeState.periods = 2.4;
    modeState.amp = 0.62;
  },

  step() {
    modeState.time += STEP;
    modeState.run = (modeState.run + STEP * RUN_RATE) % 1;
  },

  draw() {
    drawScreen();

    /* Указатель держит последнее, что показал: увёл курсор — настройка стоит. */
    if (pointer.seen) {
      modeState.periods = lerp(6.5, 1, clamp(pointer.x, 0, 1));
      modeState.amp = lerp(0.92, 0.06, clamp(pointer.y, 0, 1));
    }
    const { periods, amp } = modeState;

    drawSweep(sawPoints({
      periods,
      amp,
      symmetry: num('symmetry'),
      band: num('band'),
      noise: num('noise'),
      offset: num('offset'),
      /* Фаза привязана не к левому краю, а к середине экрана: фронты стоят на
         целой фазе, значит буква целиком лежит между 0 и 1, и половина фазы
         в центре ставит её ровно посередине. Волна тогда раздвигается от
         центра в обе стороны, а не отрастает вправо. */
      phase: 0.5 - periods / 2,
      seed: modeState.time * 3,
    }), S * 0.005, on('runner'), modeState.run);

    drawStatus(`пила ${(1 / periods).toFixed(2)} × ${amp.toFixed(2)}`);
  },
};

/* ---------- синхронизация ---------- */

/* Развёртка ждёт, пока сигнал пересечёт уровень на подъёме, и только тогда
   срывается с места — потому картинка и стоит.

   Награда за захват — сам люминофор. Экран держит последние развёртки, и
   каждая бледнее предыдущей. Держишь захват — они ложатся одна в одну, яркости
   складываются, и буква проступает. Сорвался — развёртка идёт вхолостую, каждая
   приходит на новое место, складывать нечего, и остаётся тусклый смаз. Уровень
   запуска при этом остаётся ручкой чтения: он ничего не делает с сигналом,
   только с тем, как экран его показывает.

   Гасить накопленный слой через destination-out нельзя: множительное затухание
   упирается в округление восьмибитной альфы и встаёт на осадке — при шаге 0.05
   она замирает на 9/255 и не уходит уже никогда. Поэтому развёртки хранятся
   поштучно: тогда затухание точное и догорает до нуля. */

const SWEEP_KEEP = 30;   // сколько развёрток помнит люминофор
const SWEEP_SUM = 2.2;   // суммарная яркость стопки: больше единицы, чтобы захват насыщал

MODES.trig = {
  label: 'синхронизация',
  note: 'Уровень запуска идёт за указателем, а отвязав его — тянется мышью. Держишь захват — развёртки ложатся одна в одну, и буква проступает на люминофоре. Вышел за размах — каждая приходит на новое место, складывать нечего, и остаётся тусклый смаз. Ближе к краю размаха шум сильнее сбивает захват, и буква не доходит до резкости.',
  cursor: 'ns-resize',
  tools: [
    { type: 'range', key: 'symmetry', label: 'симметрия', min: 0, max: 1, step: 0.01, value: 1 },
    { type: 'range', key: 'periods', label: 'развёртка', min: 1, max: 6, step: 0.1, value: 2.4 },
    { type: 'range', key: 'amp', label: 'амплитуда', min: 0.06, max: 0.92, step: 0.01, value: 0.55 },
    { type: 'range', key: 'band', label: 'полоса', min: 0, max: 0.45, step: 0.005, value: 0 },
    { type: 'range', key: 'noise', label: 'шум', min: 0, max: 1, step: 0.02, value: 0.16 },
    { type: 'range', key: 'rate', label: 'частота сигнала', min: 0, max: 3, step: 0.05, value: 0.8 },
    { type: 'range', key: 'glow', label: 'послесвечение', min: 0, max: 1, step: 0.02, value: 0.6 },
    { type: 'toggle', key: 'follow', label: 'уровень за курсором', value: true },
    { type: 'toggle', key: 'drift', label: 'дрейф', value: false },
    { type: 'toggle', key: 'runner', label: 'бегунок', value: true },
  ],

  setup() {
    modeState.time = 0;
    modeState.run = 0;
    modeState.free = 0;
    modeState.offset = 0;
    modeState.level = 0.5;
    modeState.sweeps = [];
    modeState.side = S;
  },

  step() {
    modeState.time += STEP;
    modeState.free += STEP * num('rate');
    modeState.run = (modeState.run + STEP * RUN_RATE) % 1;
    // Прибор греется и уводит ноль: уровень приходится подправлять.
    modeState.offset = on('drift') ? Math.sin(modeState.time * 0.21) * 0.16 : 0;

    const amp = num('amp');
    if (pointer.seen && (on('follow') || pointer.down)) modeState.level = clamp(pointer.y, 0, 1);
    const shape = scanWave(num('symmetry'), num('band'));
    const signal = levelToSignal(modeState.level, amp, modeState.offset);
    // Полоски у самого края размаха не считаем: там подъём слишком полог.
    const edge = (shape.high - shape.low) * 0.03;
    const inside = signal > shape.low + edge && signal < shape.high - edge;
    modeState.inside = inside;

    // Развёртки лежат в пикселях кадра: сменился размер — тянуть их нечем.
    if (modeState.side !== S) {
      modeState.side = S;
      modeState.sweeps = [];
    }

    // У края сигнал проводит меньше времени, и шум легче сбивает захват.
    const swing = Math.max(shape.high - shape.low, 0.001);
    const margin = Math.min(signal - shape.low, shape.high - signal) / swing;
    const shake = num('noise') * (inside ? clamp(0.09 / Math.max(margin, 0.02), 0, 1) : 1);

    /* Захват держит фазу: подъём приходит к уровню всегда в один и тот же миг.
       Без захвата фаза свободная, и развёртка встаёт на новое место. */
    const phase = inside
      ? riseAt(shape, signal) + shake * 0.09 * tremble(modeState.time * 9, 1.3)
      : modeState.free;

    modeState.sweeps.push(sawPoints({
      periods: num('periods'),
      amp,
      symmetry: num('symmetry'),
      band: num('band'),
      noise: num('noise'),
      offset: modeState.offset,
      phase,
      seed: modeState.time * 3,
    }));
    while (modeState.sweeps.length > SWEEP_KEEP) modeState.sweeps.shift();
  },

  draw() {
    drawScreen();

    const sweeps = modeState.sweeps;
    const life = lerp(6, SWEEP_KEEP, num('glow'));
    const weight = SWEEP_SUM / life;
    const width = S * 0.005;

    // Свежая развёртка ярче всех, дальние догорают ровно до нуля.
    for (let i = 0; i < sweeps.length; i += 1) {
      const age = sweeps.length - 1 - i;
      if (age >= life) continue;
      stroke(sweeps[i], 0, SAW_STEPS, weight * (1 - age / life), width);
    }

    // Бегунок идёт поверх и не копится: он не след, а место луча прямо сейчас.
    if (on('runner') && sweeps.length) drawRunner(sweeps.at(-1), width, modeState.run);

    const inside = modeState.inside;
    const level = modeState.level;

    // Метка уровня: пунктир поперёк экрана и флажок у левого края.
    ctx.save();
    ctx.setLineDash([S * 0.012, S * 0.012]);
    line(0, level, 1, level, inside ? ink(0.4) : RED, 0.0014);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(0, (level - 0.014) * S);
    ctx.lineTo(0.022 * S, level * S);
    ctx.lineTo(0, (level + 0.014) * S);
    ctx.fillStyle = inside ? ink(0.55) : RED;
    ctx.fill();

    drawStatus(inside ? 'захват' : 'срыв', !inside);
  },
};

/* ---------- вход ---------- */

MODES.input = {
  label: 'вход',
  note: 'Сигнал подаёшь ты: высота указателя — это напряжение на входе, время идёт само. Чтобы на экране встала И, надо ровно тянуть вверх и резко ронять — пилу приходится писать рукой, а не буквой.',
  cursor: 'ns-resize',
  tools: [
    { type: 'range', key: 'sweep', label: 'развёртка', min: 0.2, max: 4, step: 0.05, value: 1.1 },
    { type: 'range', key: 'smooth', label: 'полоса', min: 0, max: 1, step: 0.02, value: 0.25 },
    { type: 'range', key: 'glow', label: 'послесвечение', min: 0, max: 1, step: 0.02, value: 0.75 },
    { type: 'button', label: 'стереть', action: () => { modeState.feed = []; } },
  ],

  setup() {
    modeState.feed = [];
    modeState.value = 0.5;
  },

  step() {
    // Полоса у входа та же, что у прибора: сигнал не поспевает за рукой.
    const target = pointer.seen ? clamp(pointer.y, 0.02, 0.98) : 0.5;
    modeState.value = lerp(modeState.value, target, 1 - num('smooth') * 0.92);
    modeState.feed.push(modeState.value);
    const room = Math.round(SAW_STEPS / Math.max(num('sweep'), 0.2) / 6);
    while (modeState.feed.length > room) modeState.feed.shift();
  },

  draw() {
    drawScreen();

    const feed = modeState.feed;
    if (feed.length < 2) {
      drawStatus('веди указателем');
      return;
    }

    const points = feed.map((v, i) => [(i / (feed.length - 1)) * S, v * S]);
    const glow = num('glow');
    drawTrace(points, S * 0.005, 1, 0.35 + glow * 0.65, glow * 0.9);

    // Кончик луча — там, где сигнал прямо сейчас.
    ctx.beginPath();
    ctx.arc(points[points.length - 1][0], points[points.length - 1][1], S * 0.006, 0, TAU);
    ctx.fillStyle = ink(1);
    ctx.fill();

    drawStatus(`вход ${(1 - modeState.value).toFixed(2)}`);
  },
};

/* ---------- прибор ---------- */

/* Рукописная «и»: две чаши, стык углом, выход вверх вправо. Отсчёт идёт
   с t₀ = 0, то есть с верхней линии строчных, — перо ставят туда. */
const HAND_SAMPLES = 48;

function handHeight(t, sharp) {
  const soft = 0.5 * (1 + Math.cos(t));
  const crisp = 1 - Math.abs(Math.sin(t / 2));
  return lerp(soft, crisp, clamp(sharp, 0, 1));
}

function handPath(p) {
  const R = p.tooth / TAU;
  const steps = Math.max(2, Math.round(p.bowls * HAND_SAMPLES));
  /* Перо не идёт по строке ровно: наверху медлит и стык сходится узким углом,
     внизу разгоняется и чаша выходит широкой. Сверх единицы оно успевает
     уйти назад — и на стыке набухает петля. */
  const pinch = Math.min(1, p.sharp) * 0.62 + Math.max(0, p.sharp - 1) * 3;
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const t = u * p.bowls * TAU;
    let h = p.height * handHeight(t, p.sharp);
    let x = R * (t - pinch * Math.sin(t));
    if (p.shake) {
      h += p.shake * p.height * 0.05 * tremble(u * p.bowls, p.phase);
      x += p.shake * p.tooth * 0.035 * tremble(u * p.bowls + 4.2, p.phase * 0.8);
    }
    points.push([(p.x + x + p.slant * h) * S, (p.baseline - h) * S]);
  }
  return points;
}

MODES.probe = {
  label: 'прибор',
  note: 'Та же развёртка, но пишет она рукописную «и»: перо стартует на верхней линии строчных и первым движением идёт вниз. Острота ведёт от вялой волны через скоропись с настоящим углом к петле на стыке.',
  tools: [
    { type: 'range', key: 'bowls', label: 'чаши', min: 1, max: 6, step: 1, value: 2 },
    { type: 'range', key: 'sharp', label: 'острота', min: 0, max: 1.6, step: 0.02, value: 1 },
    { type: 'range', key: 'tooth', label: 'ширина чаши', min: 0.06, max: 0.3, step: 0.005, value: 0.195 },
    { type: 'range', key: 'height', label: 'рост', min: 0.06, max: 0.42, step: 0.005, value: 0.21 },
    { type: 'range', key: 'slant', label: 'наклон', min: -0.5, max: 0.5, step: 0.01, value: 0.2 },
    { type: 'range', key: 'shake', label: 'дрожь', min: 0, max: 1, step: 0.02, value: 0.22 },
    { type: 'range', key: 'speed', label: 'скорость луча', min: 0.1, max: 3, step: 0.05, value: 0.7 },
    { type: 'range', key: 'glow', label: 'послесвечение', min: 0, max: 1, step: 0.02, value: 0.55 },
  ],

  setup() {
    modeState.time = 0;
    modeState.head = 0;
  },

  step() {
    modeState.time += STEP;
    // Плитка на перечне замирает на 120-м шаге: луч должен стоять целиком.
    if (labBare) { modeState.head = 1; return; }
    modeState.head += STEP * num('speed');
    if (modeState.head > 1.35) modeState.head = 0;
  },

  draw() {
    drawScreen();

    const bowls = num('bowls');
    const tooth = Math.min(num('tooth'), 0.84 / bowls);
    const height = num('height');
    const baseline = 0.5 + height / 2;
    const x = 0.5 - (tooth * bowls) / 2;

    line(x - 0.04, baseline, x + tooth * bowls + 0.04, baseline, ink(0.2), 0.002);
    line(x - 0.04, baseline - height, x + tooth * bowls + 0.04, baseline - height, ink(0.2), 0.002);

    const points = handPath({
      bowls,
      tooth,
      height,
      sharp: num('sharp'),
      slant: num('slant'),
      shake: num('shake'),
      phase: modeState.time * 2.4,
      x,
      baseline,
    });
    const glow = num('glow');
    drawTrace(points, S * 0.0055, Math.min(1, modeState.head), 0.3 + glow * 0.7, glow * 0.85);

    drawStatus(`чаш ${bowls}`);
  },
};

startLab({
  title: 'И · пила на экране',
  modes: MODES,
  start: 'saw',
  ground: 'ink',
});
