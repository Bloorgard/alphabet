/* И — волна и её зубцы.

   Буква здесь не нарисована. Строчная «и» — это два одинаковых зубца, и больше
   её ничто не задаёт: три зубца — уже «ш». Перевернуть волну — получится «п»,
   три перевёрнутых — «т». Весь этот куст живёт на одной поверхности, и буква
   на ней не картинка, а координата: сколько периодов и куда смотрит горб.

   Профиль зуба — смесь двух волн. Синус кругл и сверху и снизу, это ещё не
   письмо; |sin| оставляет низ круглым, а верх сводит настоящим углом — вот это
   уже скоропись. Острота смешивает одно с другим, а перевалив за единицу,
   начинает уводить перо назад, и на вершине набухает петля: так и срывается
   быстрый почерк.

   Отсчёт начинается с t₀ = 0, то есть с верхней линии строчных: в прописи
   перо ставят туда и первым движением ведут вниз. Зубцы считаются по чашам,
   а не по вершинам, и волна кончается там же, где началась, — наверху,
   откуда «и» уходит на связку со следующей буквой.

   Одинаковые штрихи, из которых собраны и, ш, п, т, в палеографии зовут
   минимами. В готике из-за них строка переставала читаться — отсюда фраза
   «mimi numinum niuium minimi munium nimium uini muniminum imminui uiui
   minimum uolunt», написанная почти одними m, n, u, i, и отсюда же точка
   над i: её завели, чтобы минимы можно было пересчитать. Красный в сцене
   отмечает ровно это событие — момент, когда прочтение перестало быть
   единственным. */

const TAU = Math.PI * 2;
const SAMPLES = 48;          // точек на один зуб
const CHUNK = 3;             // сегментов в одном мазке луча
const WIDE = 2;              // во сколько раз бледный ореол шире ядра луча

/* Буква — это число зубцов подряд. Двойка и тройка, вниз и вверх. */
const PARTS = {
  down: [[2, 'и'], [3, 'ш']],
  up: [[2, 'п'], [3, 'т']],
};

const READ_CAP = 8;

/* Все способы разложить n зубцов на буквы. Пусто — значит такой строки в
   алфавите нет: один зубец сам по себе не буква. */
function readings(n, side) {
  const parts = PARTS[side];
  const out = [];
  const walk = (left, acc, sizes) => {
    if (out.length >= READ_CAP) return;
    if (left === 0) { out.push({ word: acc, sizes }); return; }
    for (const [size, letter] of parts) {
      if (size <= left) walk(left - size, acc + letter, [...sizes, size]);
    }
  };
  walk(n, '', []);
  return out;
}

function sideOf(up) { return up ? 'up' : 'down'; }

/* Дрожь луча: три несоизмеримые синусоиды, чтобы рисунок не повторялся. */
function tremble(u, phase) {
  return Math.sin(u * 11.7 + phase) * 0.6
    + Math.sin(u * 27.3 - phase * 1.7) * 0.3
    + Math.sin(u * 5.1 + phase * 0.6) * 0.1;
}

/* Высота зуба долей роста: 0 на строке, 1 на верхней линии строчных.
   На t = 0 перо стоит наверху, на t = π опускается в чашу. */
function toothHeight(t, sharp) {
  const soft = 0.5 * (1 + Math.cos(t));
  const crisp = 1 - Math.abs(Math.sin(t / 2));
  return lerp(soft, crisp, clamp(sharp, 0, 1));
}

/* Точки волны в пикселях. teeth дробное — волна обрывается, не дойдя до
   строки: прибор не настроен, и прочтения у неё нет.

   Отсчёт идёт с t₀ = 0, то есть с верхней линии строчных: в прописи перо
   ставят туда и первым движением ведут вниз. Если начать снизу, к букве
   спереди прирастает лишний восходящий штрих — и «и» становится «м». */
function wavePath(p) {
  const R = p.tooth / TAU;
  const t0 = 0;
  const steps = Math.max(2, Math.round(p.teeth * SAMPLES));
  const shake = p.shake || 0;
  /* Перо не идёт по строке ровно: наверху оно медлит и стык сходится узким
     углом, внизу разгоняется и чаша выходит широкой. Сверх единицы оно
     успевает уйти назад — и на стыке набухает петля. */
  const pinch = Math.min(1, p.sharp) * 0.62 + Math.max(0, p.sharp - 1) * 3;
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const t = t0 + u * p.teeth * TAU;
    // Полярность вертит зуб вокруг середины роста: на нуле он ложится в строку.
    let h = p.height * (0.5 + p.polarity * (toothHeight(t, p.sharp) - 0.5));
    let x = R * ((t - t0) - pinch * Math.sin(t));
    if (shake) {
      h += shake * p.height * 0.05 * tremble(u * p.teeth, p.phase);
      x += shake * p.tooth * 0.035 * tremble(u * p.teeth + 4.2, p.phase * 0.8);
    }
    points.push([(p.x + x + p.slant * h) * S, (p.baseline - h) * S]);
  }
  return points;
}

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

/* Луч дошёл до head, за ним хвост длиной tail, дальше — остаточное свечение. */
function drawTrace(points, width, head = 1, tail = 1, rest = 1) {
  const last = points.length - 1;
  const cut = Math.round(clamp(head, 0, 1) * last);
  const span = Math.max(1, tail * last);
  for (let i = 0; i < cut; i += CHUNK) {
    const to = Math.min(cut, i + CHUNK);
    const age = (cut - to) / span;
    stroke(points, i, to, Math.max(rest, 1 - age), width);
  }
  if (cut > 0 && head < 1) {
    const [hx, hy] = points[cut];
    ctx.beginPath();
    ctx.arc(hx, hy, width * 0.9, 0, TAU);
    ctx.fillStyle = ink(1);
    ctx.fill();
  }
}

function baselineMark(x1, x2, y) {
  line(x1, y, x2, y, ink(0.12), 0.002);
}

function label(text, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.font = `${Math.round(S * size)}px 'DM Mono', ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(text, x * S, y * S);
  ctx.textAlign = 'left';
}

/* Общие для всех механик ручки формы волны. */
const SHAPE_TOOLS = [
  { type: 'range', key: 'sharp', label: 'острота', min: 0, max: 1.6, step: 0.02, value: 1 },
  { type: 'range', key: 'tooth', label: 'ширина зуба', min: 0.06, max: 0.3, step: 0.005, value: 0.195 },
  { type: 'range', key: 'height', label: 'рост', min: 0.06, max: 0.42, step: 0.005, value: 0.21 },
  { type: 'range', key: 'slant', label: 'наклон', min: -0.5, max: 0.5, step: 0.01, value: 0.16 },
  { type: 'range', key: 'shake', label: 'дрожь', min: 0, max: 1, step: 0.02, value: 0.22 },
  { type: 'toggle', key: 'up', label: 'круглый верх', value: false },
];

const MODES = {};

/* ---------- прибор ---------- */

MODES.probe = {
  label: 'прибор',
  note: 'Луч пишет волну, ручки задают её форму. Два зубца — «и», три — «ш»; «круглый верх» переворачивает волну, и те же зубцы читаются как «п» и «т». Красным — когда прочтение перестало быть единственным.',
  tools: [
    { type: 'range', key: 'teeth', label: 'зубцы', min: 1, max: 8, step: 1, value: 2 },
    ...SHAPE_TOOLS,
    { type: 'range', key: 'speed', label: 'скорость луча', min: 0.1, max: 3, step: 0.05, value: 0.7 },
    { type: 'range', key: 'glow', label: 'послесвечение', min: 0, max: 1, step: 0.02, value: 0.55 },
  ],

  setup() {
    modeState.time = 0;
    modeState.head = 0;
  },

  step() {
    modeState.time += STEP;
    // Плитка на перечне замирает на 120-м шаге: луч должен стоять на строке целиком.
    if (labBare) { modeState.head = 1; return; }
    modeState.head += STEP * num('speed');
    if (modeState.head > 1.35) modeState.head = 0;
  },

  draw() {
    const teeth = num('teeth');
    const up = on('up');
    const tooth = Math.min(num('tooth'), 0.84 / teeth);
    const height = num('height');
    const baseline = 0.5 + height / 2;

    const p = {
      teeth,
      tooth,
      height,
      sharp: num('sharp'),
      slant: num('slant'),
      shake: num('shake'),
      polarity: up ? -1 : 1,
      phase: modeState.time * 2.4,
      x: 0.5 - (tooth * teeth) / 2,
      baseline,
    };

    baselineMark(p.x - 0.04, p.x + tooth * teeth + 0.04, baseline);
    baselineMark(p.x - 0.04, p.x + tooth * teeth + 0.04, baseline - height);

    const points = wavePath(p);
    const glow = num('glow');
    drawTrace(points, S * 0.0055, Math.min(1, modeState.head), 0.3 + glow * 0.7, glow * 0.85);

    const list = readings(teeth, sideOf(up));
    const hot = list.length > 1;
    const word = list.length ? list[0].word : '—';
    label(word, 0.5, baseline + 0.13, 0.075, list.length ? ink(1) : ink(0.3));
    if (hot) {
      label(list.slice(1).map((r) => r.word).join('  '), 0.5, baseline + 0.2, 0.032, RED);
    }
    drawStatus(hot ? `прочтений ${list.length}` : `зубцов ${teeth}`, hot);
  },
};

/* ---------- карта ---------- */

const MAP_COLS = 6;
const MAP_ROWS = 5;
const MAP_SHARP = [0.25, 0.6, 1, 1.3, 1.6];

MODES.map = {
  label: 'карта',
  note: 'То же пространство разложено сеткой: вправо прибавляется зубец, вниз растёт острота — от вялой волны через скоропись к петле. Видно, что и, ш, п, т — участок одной поверхности, а И на ней просто вторая колонка.',
  tools: [
    { type: 'range', key: 'slant', label: 'наклон', min: -0.5, max: 0.5, step: 0.01, value: 0.16 },
    { type: 'range', key: 'shake', label: 'дрожь', min: 0, max: 1, step: 0.02, value: 0.12 },
    { type: 'toggle', key: 'up', label: 'круглый верх', value: false },
  ],

  setup() {
    modeState.time = 0;
  },

  step() {
    modeState.time += STEP;
  },

  draw() {
    const up = on('up');
    const side = sideOf(up);
    const left = 0.135;
    const top = 0.155;
    const cellW = (1 - left - 0.04) / MAP_COLS;
    const cellH = (0.93 - top) / MAP_ROWS;

    label('зубцы', left - 0.07, top - 0.042, 0.024, ink(0.3));
    for (let col = 0; col < MAP_COLS; col += 1) {
      label(String(col + 1), left + cellW * (col + 0.5), top - 0.042, 0.026, ink(0.4));
    }

    for (let row = 0; row < MAP_ROWS; row += 1) {
      for (let col = 0; col < MAP_COLS; col += 1) {
        const teeth = col + 1;
        const sharp = MAP_SHARP[row];
        const list = readings(teeth, side);
        const hot = list.length > 1;

        const height = cellH * 0.4;
        const tooth = (cellW * 0.74) / teeth;
        const baseline = top + cellH * row + cellH * 0.62;

        // Значение остроты стоит слева от своей строки, а не подписью у края.
        if (col === 0) label(sharp.toFixed(2), left - 0.07, baseline, 0.024, ink(0.32));

        const points = wavePath({
          teeth,
          tooth,
          height,
          sharp,
          slant: num('slant'),
          shake: num('shake'),
          polarity: up ? -1 : 1,
          phase: modeState.time * 2.4 + col * 1.7 + row * 0.9,
          x: left + cellW * col + cellW * 0.5 - (tooth * teeth) / 2,
          baseline,
        });

        drawTrace(points, S * 0.003, 1, 1, 1);

        const word = list.length ? list[0].word : '·';
        label(
          hot ? `${word}…` : word,
          left + cellW * (col + 0.5),
          baseline + cellH * 0.3,
          0.026,
          hot ? RED : ink(list.length ? 0.75 : 0.25),
        );

        // Каноническая И: два зубца циклоидой, то есть с настоящим острым углом.
        if (teeth === 2 && sharp === 1 && !up) {
          ctx.strokeStyle = ink(0.35);
          ctx.lineWidth = 1;
          ctx.strokeRect(
            (left + cellW * col + cellW * 0.06) * S,
            (top + cellH * row + cellH * 0.06) * S,
            cellW * 0.88 * S,
            cellH * 0.88 * S,
          );
        }
      }
    }

    label('острота', left - 0.07, top + 0.005, 0.024, ink(0.3));
    drawStatus(up ? 'круглый верх · п, т' : 'круглый низ · и, ш');
  },
};

/* ---------- письмо ---------- */

MODES.word = {
  label: 'письмо',
  note: 'Набираешь не буквы, а зубцы: строка пишется одной непрерывной волной. «Прочесть иначе» переставляет разбиение — волна не сдвигается ни на пиксель, а слово выходит другое. Это и есть минимы.',
  tools: [
    { type: 'button', label: '+ два зуба', action: () => MODES.word.add(2) },
    { type: 'button', label: '+ три зуба', action: () => MODES.word.add(3) },
    { type: 'button', label: 'стереть', action: () => MODES.word.drop() },
    { type: 'button', label: 'прочесть иначе', action: () => MODES.word.next() },
    ...SHAPE_TOOLS,
    { type: 'range', key: 'glow', label: 'послесвечение', min: 0, max: 1, step: 0.02, value: 1 },
  ],

  setup() {
    modeState.time = 0;
    modeState.teeth = 5;
    modeState.pick = 0;
  },

  add(size) {
    modeState.teeth = Math.min(18, (modeState.teeth || 0) + size);
    modeState.pick = 0;
  },

  drop() {
    modeState.teeth = Math.max(0, (modeState.teeth || 0) - 2);
    modeState.pick = 0;
  },

  next() {
    modeState.pick = (modeState.pick || 0) + 1;
  },

  step() {
    modeState.time += STEP;
  },

  draw() {
    const teeth = modeState.teeth;
    const up = on('up');
    const list = readings(teeth, sideOf(up));
    const pick = list.length ? modeState.pick % list.length : 0;

    if (!teeth) {
      label('пусто', 0.5, 0.5, 0.04, ink(0.3));
      drawStatus('зубцов 0');
      return;
    }

    const height = num('height');
    const tooth = Math.min(num('tooth'), 0.86 / teeth);
    const baseline = 0.5 + height / 2;
    const x = 0.5 - (tooth * teeth) / 2;

    baselineMark(x - 0.03, x + tooth * teeth + 0.03, baseline);
    baselineMark(x - 0.03, x + tooth * teeth + 0.03, baseline - height);

    const points = wavePath({
      teeth,
      tooth,
      height,
      sharp: num('sharp'),
      slant: num('slant'),
      shake: num('shake'),
      polarity: up ? -1 : 1,
      phase: modeState.time * 2.4,
      x,
      baseline,
    });
    const glow = num('glow');
    drawTrace(points, S * 0.0055, 1, 0.3 + glow * 0.7, glow * 0.85);

    // Разбиение под строкой: скобки двигаются, волна стоит.
    const reading = list[pick];
    if (reading) {
      const brace = baseline + 0.055;
      let at = 0;
      for (let i = 0; i < reading.sizes.length; i += 1) {
        const size = reading.sizes[i];
        const from = x + at * tooth;
        const to = x + (at + size) * tooth;
        line(from, brace, to, brace, ink(0.45), 0.0025);
        line(from, brace - 0.012, from, brace, ink(0.45), 0.0025);
        line(to, brace - 0.012, to, brace, ink(0.45), 0.0025);
        label(reading.word[i], (from + to) / 2, brace + 0.05, 0.036, ink(0.85));
        at += size;
      }
      label(reading.word, 0.5, brace + 0.14, 0.06, ink(1));
    } else {
      label('не читается', 0.5, baseline + 0.1, 0.04, RED);
    }

    const hot = list.length > 1;
    drawStatus(
      hot ? `чтение ${pick + 1} из ${list.length}` : `зубцов ${teeth}`,
      hot,
    );
  },
};

/* ---------- ручка ---------- */

MODES.hand = {
  label: 'ручка',
  note: 'Указатель сам и есть две ручки: вправо прибавляются зубцы, вверх и вниз переворачивается волна, а посередине она ложится в прямую. Пишешь не рукой по бумаге, а рукой по полю параметров — и строка читается только там, где зубцов вышло ровное число.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'sharp', label: 'острота', min: 0, max: 1.6, step: 0.02, value: 1 },
    { type: 'range', key: 'tooth', label: 'ширина зуба', min: 0.06, max: 0.3, step: 0.005, value: 0.17 },
    { type: 'range', key: 'height', label: 'рост', min: 0.06, max: 0.42, step: 0.005, value: 0.21 },
    { type: 'range', key: 'slant', label: 'наклон', min: -0.5, max: 0.5, step: 0.01, value: 0.16 },
    { type: 'range', key: 'shake', label: 'дрожь', min: 0, max: 1, step: 0.02, value: 0.22 },
    { type: 'range', key: 'snap', label: 'притяжка к целому', min: 0, max: 1, step: 0.02, value: 0 },
    { type: 'toggle', key: 'trail', label: 'след', value: true },
    { type: 'button', label: 'стереть след', action: () => { modeState.trail = []; } },
  ],

  setup() {
    modeState.time = 0;
    modeState.trail = [];
  },

  step() {
    modeState.time += STEP;
    if (!on('trail') || !pointer.seen) return;
    modeState.trail.push([pointer.x, pointer.y]);
    if (modeState.trail.length > 400) modeState.trail.shift();
  },

  draw() {
    const px = pointer.seen ? clamp(pointer.x, 0, 1) : 0.28;
    const py = pointer.seen ? clamp(pointer.y, 0, 1) : 0.14;

    // Поле параметров: по горизонтали зубцы, по вертикали полярность.
    let teeth = 1 + px * 6;
    const snap = num('snap');
    if (snap) teeth = lerp(teeth, Math.round(teeth), snap);
    const polarity = 1 - py * 2;

    if (on('trail') && modeState.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(modeState.trail[0][0] * S, modeState.trail[0][1] * S);
      for (const [tx, ty] of modeState.trail) ctx.lineTo(tx * S, ty * S);
      ctx.strokeStyle = ink(0.16);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    line(0, 0.5, 1, 0.5, ink(0.08), 0.0015);

    const height = num('height');
    const tooth = Math.min(num('tooth'), 0.86 / teeth);
    const baseline = 0.5 + height / 2;
    const x = 0.5 - (tooth * teeth) / 2;

    const points = wavePath({
      teeth,
      tooth,
      height,
      sharp: num('sharp'),
      slant: num('slant'),
      shake: num('shake'),
      polarity,
      phase: modeState.time * 2.4,
      x,
      baseline,
    });
    drawTrace(points, S * 0.0055, 1, 1, 1);

    dot(px, py, ink(0.5), 0.005);

    // Строка читается только на целом числе зубцов и внятной полярности.
    const whole = Math.round(teeth);
    const tuned = Math.abs(teeth - whole) < 0.08 && Math.abs(polarity) > 0.35;
    const list = tuned ? readings(whole, sideOf(polarity < 0)) : [];
    const hot = list.length > 1;

    if (list.length) {
      label(list[0].word, 0.5, baseline + 0.13, 0.075, ink(1));
      if (hot) label(list.slice(1).map((r) => r.word).join('  '), 0.5, baseline + 0.2, 0.03, RED);
    } else {
      label('—', 0.5, baseline + 0.13, 0.075, ink(0.22));
    }

    drawStatus(
      hot ? `прочтений ${list.length}` : `зубцов ${teeth.toFixed(2)}`,
      hot,
    );
  },
};

startLab({
  title: 'И · волна и её зубцы',
  modes: MODES,
  start: 'probe',
  ground: 'ink',
});
