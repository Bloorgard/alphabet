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

/* ---------- пила ---------- */

/* Уровень в доле размаха, 0…1. Симметрия — доля периода под подъёмом. */
function sawRaw(phase, symmetry) {
  const u = phase - Math.floor(phase);
  const s = clamp(symmetry, 0, 1);
  if (s <= 0.0005) return 1 - u;
  if (s >= 0.9995) return u;
  return u < s ? u / s : 1 - (u - s) / (1 - s);
}

// Треугольное окно: угол съедается плавно, а не срезается фаской.
const BAND_WINDOW = [1, 2, 3, 4, 5, 4, 3, 2, 1];
const BAND_SUM = BAND_WINDOW.reduce((a, b) => a + b, 0);

function sawLevel(phase, symmetry, band) {
  if (band <= 0.001) return sawRaw(phase, symmetry);
  let sum = 0;
  for (let k = 0; k < BAND_WINDOW.length; k += 1) {
    const at = phase + band * (k / (BAND_WINDOW.length - 1) - 0.5);
    sum += BAND_WINDOW[k] * sawRaw(at, symmetry);
  }
  return sum / BAND_SUM;
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
    // Частота шума заведомо выше развёртки: он должен читаться зерном, а не волной.
    if (o.noise) level += o.noise * 0.035 * tremble(u * 190, o.seed);
    points.push([u * S, waveY(level, o.amp, o.offset) * S]);
  }
  return points;
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
  ],

  setup() {
    modeState.time = 0;
    modeState.periods = 2.4;
    modeState.amp = 0.62;
  },

  step() {
    modeState.time += STEP;
  },

  draw() {
    drawScreen();

    /* Указатель держит последнее, что показал: увёл курсор — настройка стоит. */
    if (pointer.seen) {
      modeState.periods = lerp(6.5, 1, clamp(pointer.x, 0, 1));
      modeState.amp = lerp(0.92, 0.06, clamp(pointer.y, 0, 1));
    }
    const { periods, amp } = modeState;

    drawTrace(sawPoints({
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
    }), S * 0.005);

    drawStatus(`пила ${(1 / periods).toFixed(2)} × ${amp.toFixed(2)}`);
  },
};

/* ---------- синхронизация ---------- */

/* Развёртка ждёт, пока сигнал пересечёт уровень на подъёме, и только тогда
   срывается с места — потому картинка и стоит. Уровень вне размаха ловить
   нечего: развёртка идёт вхолостую, и кадры разъезжаются друг по другу. */
const GHOSTS = 5;

MODES.trig = {
  label: 'синхронизация',
  note: 'Указателем ведёшь уровень запуска. Попал в размах — картинка встала, буква читается. Вышел за край — ловить нечего, развёртка идёт вхолостую и кадры разъезжаются. Чем ближе уровень к краю, тем легче шум сбивает захват.',
  cursor: 'ns-resize',
  tools: [
    { type: 'range', key: 'symmetry', label: 'симметрия', min: 0, max: 1, step: 0.01, value: 1 },
    { type: 'range', key: 'periods', label: 'развёртка', min: 1, max: 6, step: 0.1, value: 2.4 },
    { type: 'range', key: 'amp', label: 'амплитуда', min: 0.06, max: 0.92, step: 0.01, value: 0.55 },
    { type: 'range', key: 'band', label: 'полоса', min: 0, max: 0.45, step: 0.005, value: 0 },
    { type: 'range', key: 'noise', label: 'шум', min: 0, max: 1, step: 0.02, value: 0.35 },
    { type: 'range', key: 'rate', label: 'частота сигнала', min: 0, max: 3, step: 0.05, value: 0.8 },
    { type: 'toggle', key: 'drift', label: 'дрейф', value: true },
  ],

  setup() {
    modeState.time = 0;
    modeState.free = 0;
    modeState.offset = 0;
    modeState.level = 0.5;
  },

  step() {
    modeState.time += STEP;
    modeState.free += STEP * num('rate');
    // Прибор греется и уводит ноль: уровень приходится подправлять.
    if (on('drift')) modeState.offset = Math.sin(modeState.time * 0.21) * 0.16;
    else modeState.offset = 0;
  },

  draw() {
    drawScreen();

    const amp = num('amp');
    const offset = modeState.offset;
    if (pointer.seen) modeState.level = clamp(pointer.y, 0, 1);
    const level = modeState.level;

    const signal = levelToSignal(level, amp, offset);
    const inside = signal > 0.02 && signal < 0.98;

    // У края сигнал проводит меньше времени, и шум легче сбивает захват.
    const margin = Math.min(signal, 1 - signal);
    const shake = num('noise') * (inside ? clamp(0.09 / Math.max(margin, 0.02), 0, 1) : 1);

    const base = {
      periods: num('periods'),
      amp,
      symmetry: num('symmetry'),
      band: num('band'),
      noise: num('noise'),
      offset,
    };

    if (inside) {
      /* Захват держит фазу: подъём занимает долю периода, равную симметрии,
         и приходит к уровню всегда в один и тот же миг. */
      const lock = signal * clamp(num('symmetry'), 0.001, 1);
      const jitter = shake * 0.09 * tremble(modeState.time * 9, 1.3);
      drawTrace(sawPoints({ ...base, phase: lock + jitter, seed: modeState.time * 3 }), S * 0.005);
    } else {
      // Срыв: каждый кадр приходит со своей фазой, и они ложатся друг на друга.
      for (let g = 0; g < GHOSTS; g += 1) {
        const phase = modeState.free + g * 0.37;
        stroke(sawPoints({ ...base, phase, seed: modeState.time * 3 + g }), 0, SAW_STEPS, 0.34, S * 0.004);
      }
    }

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
