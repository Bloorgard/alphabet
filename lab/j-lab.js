/* Й — краткая над И.

   Скобка над И не касается буквы, рисуется последней и первой забывается.
   Она ничего не прибавляет к звуку, кроме краткости: Й — это И, которую
   не дали дотянуть. Поэтому все механики здесь про одно — скобку надо
   заслужить и удержать, сама по себе она не стоит.

   Пять подходов:

     краткость   длительность нажатия и есть буква: коротко — скобка встаёт,
                 передержал — осталась И
     балансир    скобка лежит на верхушке И обратным маятником и падает,
                 если не подводить букву под неё
     росчерк     живёт только штрих, проведённый быстрее порога
     перо        кончик пера висит на пружине за курсором: скобка — это
                 не форма, а перелёт
     шнур        краткость перекинута через перекладину скобы и держится
                 обхватом: тянешь за хвост — перебирается и в конце падает

   Красный обозначает событие: краткости не вышло. В «шнуре» он держит
   сам шнур — это спорно и решается, когда механика поедет в букву. */

const TAU = Math.PI * 2;

/* ---------- буква ---------- */

/* И: вертикаль, диагональ снизу вверх, вертикаль. Коробка одна на все режимы,
   от неё же считается место скобки. */
const BOX = { x1: 0.375, x2: 0.625, top: 0.40, bottom: 0.70 };
const STEM = 0.016;

function letterI(cx = 0.5, alpha = 1, width = STEM) {
  const half = (BOX.x2 - BOX.x1) / 2;
  const x1 = cx - half;
  const x2 = cx + half;
  const color = ink(alpha);
  line(x1, BOX.top, x1, BOX.bottom, color, width);
  line(x2, BOX.top, x2, BOX.bottom, color, width);
  line(x1, BOX.bottom, x2, BOX.top, color, width);
}

/* Скобка: чаша, опора — её низшая точка. Локальные координаты берут начало
   в опоре, поэтому наклон в балансире — это поворот вокруг неё же. */
function brevePoints(cx, cy, span, depth, angle = 0) {
  const steps = 26;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const u = -1 + (2 * i) / steps;
    const lx = (u * span) / 2;
    const ly = -depth * u * u;
    points.push([cx + lx * cos - ly * sin, cy + lx * sin + ly * cos, 1 - 0.45 * u * u]);
  }
  return points;
}

/* Лента переменной толщины: каждый отрезок своей шириной. */
function ribbon(points, alpha, width) {
  if (points.length < 2 || alpha <= 0.004) return;
  const color = ink(alpha);
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    line(a[0], a[1], b[0], b[1], color, width * ((a[2] + b[2]) / 2));
  }
}

function drawBreve(cx, cy, span, depth, angle, alpha = 1, width = STEM) {
  ribbon(brevePoints(cx, cy, span, depth, angle), alpha, width);
}

/* Место скобки над буквой: чуть выше верхушки, шириной в две трети коробки. */
function breveSeat(cx = 0.5) {
  return { x: cx, y: BOX.top - 0.035, span: (BOX.x2 - BOX.x1) * 0.7 };
}

const MODES = {};

/* ---------- краткость ---------- */

/* Нажатие пишет ленту времени слева направо. Отпустил до порога — лента
   сворачивается в скобку над буквой; передержал — осталась лежать, и хвост
   за порогом красный. Порог не показан числом нарочно: его нащупывают. */

const TAPE = { x1: 0.14, x2: 0.86, y: 0.86, span: 1.2 };
const LOG_KEEP = 7;

function tapeX(seconds) {
  return TAPE.x1 + clamp(seconds / TAPE.span, 0, 1) * (TAPE.x2 - TAPE.x1);
}

MODES.brief = {
  label: 'краткость',
  note: 'Нажми и отпусти. Пока держишь — тянется лента времени, это долгое «и». Отпустил быстрее порога — лента сворачивается в скобку и встаёт над буквой; передержал — краткости не вышло, хвост за порогом идёт красным.',
  cursor: 'pointer',
  tools: [
    { type: 'range', key: 'limit', label: 'порог', min: 0.06, max: 0.6, step: 0.01, value: 0.2 },
    { type: 'toggle', key: 'mark', label: 'метка порога', value: false },
    { type: 'button', label: 'заново', action: () => { modeState.log = []; modeState.last = null; } },
  ],

  setup() {
    modeState.log = [];
    modeState.last = null;
    modeState.held = 0;
    modeState.snap = 0;
  },

  step() {
    if (pointer.down) modeState.held += STEP;
    if (modeState.snap > 0) modeState.snap = Math.max(0, modeState.snap - STEP * 4);
  },

  onDown() {
    modeState.held = 0;
  },

  onUp() {
    const limit = num('limit');
    const dur = modeState.held;
    const ok = dur <= limit;
    modeState.last = { dur, ok, quality: ok ? 1 - dur / limit : 0 };
    modeState.log.push(modeState.last);
    while (modeState.log.length > LOG_KEEP) modeState.log.shift();
    modeState.held = 0;
    if (ok) modeState.snap = 1;
  },

  draw() {
    const limit = num('limit');
    const last = modeState.last;

    letterI(0.5, last && last.ok ? 1 : 0.78);

    // Скобка стоит, пока стоит последняя удачная попытка. Чем короче было
    // нажатие, тем она собраннее: награда за краткость видна в форме.
    if (last && last.ok) {
      const seat = breveSeat();
      const grow = 1 + modeState.snap * 0.35;
      drawBreve(
        seat.x,
        seat.y - modeState.snap * 0.03,
        seat.span * grow,
        lerp(0.02, 0.05, last.quality) * grow,
        0,
        1,
      );
    }

    // Лента времени: прошлые попытки бледнеют вверх, текущая пишется по низу.
    for (let i = 0; i < modeState.log.length; i += 1) {
      const item = modeState.log[i];
      const age = modeState.log.length - i;
      const y = TAPE.y - age * 0.022;
      const alpha = 0.34 * (1 - (age - 1) / LOG_KEEP);
      const end = tapeX(item.dur);
      ctx.save();
      ctx.globalAlpha = alpha / 0.34;
      line(TAPE.x1, y, Math.min(end, tapeX(limit)), y, ink(0.34), 0.004);
      if (!item.ok) line(tapeX(limit), y, end, y, RED, 0.004);
      ctx.restore();
    }

    const held = pointer.down ? modeState.held : (last ? last.dur : 0);
    const end = tapeX(held);
    const over = held > limit;
    if (held > 0) {
      line(TAPE.x1, TAPE.y, Math.min(end, tapeX(limit)), TAPE.y, ink(0.75), 0.006);
      if (over) line(tapeX(limit), TAPE.y, end, TAPE.y, RED, 0.006);
      dot(TAPE.x1, TAPE.y, ink(0.75), 0.006);
    }

    if (on('mark')) {
      const at = tapeX(limit);
      line(at, TAPE.y - 0.026, at, TAPE.y + 0.026, ink(0.3), 0.0016);
    }

    if (pointer.down) drawStatus(over ? 'долго' : 'держишь', over);
    else if (last) drawStatus(last.ok ? `${Math.round(last.dur * 1000)} мс` : 'долгая И', !last.ok);
    else drawStatus('нажми и отпусти');
  },
};

/* ---------- балансир ---------- */

/* Обратный маятник: опора — верхушка буквы, груз — скобка над ней. Букву
   водишь курсором, и разгон опоры — единственное, чем скобку держат.
   Уравнение обычное: θ'' = (g·sinθ − a·cosθ)/L, где a — ускорение опоры. */

const FALL_ANGLE = 0.95;
const GROUND_Y = 0.9;

MODES.balance = {
  label: 'балансир',
  note: 'Скобка лежит на верхушке И обратным маятником. Букву водишь курсором: удержать скобку можно только разгоном опоры — подводить букву под наклон, а не догонять его. Упала — на экране осталась И.',
  cursor: 'ew-resize',
  tools: [
    { type: 'range', key: 'length', label: 'длина', min: 0.08, max: 0.5, step: 0.005, value: 0.24 },
    { type: 'range', key: 'gravity', label: 'тяжесть', min: 0.2, max: 2.4, step: 0.05, value: 0.9 },
    { type: 'range', key: 'drag', label: 'вязкость', min: 0, max: 1.4, step: 0.02, value: 0.3 },
    { type: 'range', key: 'grip', label: 'хватка буквы', min: 2, max: 24, step: 0.5, value: 9 },
    { type: 'toggle', key: 'trace', label: 'след скобки', value: false },
  ],

  setup() {
    modeState.cart = 0.5;
    modeState.vel = 0;
    modeState.angle = 0.02;
    modeState.spin = 0;
    modeState.time = 0;
    modeState.best = 0;
    modeState.fallen = null;
    modeState.trail = [];
  },

  onDown() {
    if (modeState.fallen) MODES.balance.setup();
  },

  step() {
    const target = pointer.seen ? clamp(pointer.x, 0.2, 0.8) : 0.5;
    const before = modeState.vel;
    modeState.vel += (target - modeState.cart) * num('grip') * STEP;
    modeState.vel *= 0.86;
    modeState.cart += modeState.vel * STEP;
    const accel = (modeState.vel - before) / STEP;

    if (modeState.fallen) {
      const f = modeState.fallen;
      f.vy += 2.6 * STEP;
      f.x += f.vx * STEP;
      f.y += f.vy * STEP;
      f.angle += f.spin * STEP;
      if (f.y > GROUND_Y) {
        f.y = GROUND_Y;
        f.vy *= -0.32;
        f.vx *= 0.6;
        f.spin *= 0.4;
        if (Math.abs(f.vy) < 0.08) { f.vy = 0; f.spin = 0; f.angle = lerp(f.angle, 0, 0.2); }
      }
      return;
    }

    const L = num('length');
    const a = modeState.angle;
    modeState.spin += ((num('gravity') * Math.sin(a) - accel * Math.cos(a)) / L) * STEP;
    modeState.spin -= modeState.spin * num('drag') * STEP;
    modeState.angle += modeState.spin * STEP;
    modeState.time += STEP;
    modeState.best = Math.max(modeState.best, modeState.time);

    if (on('trace')) {
      const seat = breveSeat(modeState.cart);
      modeState.trail.push([seat.x - Math.sin(modeState.angle) * L, seat.y - Math.cos(modeState.angle) * L]);
      if (modeState.trail.length > 260) modeState.trail.shift();
    }

    if (Math.abs(modeState.angle) > FALL_ANGLE) {
      const seat = breveSeat(modeState.cart);
      modeState.fallen = {
        x: seat.x, y: seat.y,
        vx: modeState.vel * 0.5 - Math.sin(modeState.angle) * 0.2,
        vy: 0,
        angle: modeState.angle,
        spin: modeState.spin * 0.5,
      };
    }
  },

  draw() {
    const cx = modeState.cart;
    letterI(cx, modeState.fallen ? 0.8 : 1);

    const seat = breveSeat(cx);

    if (on('trace') && modeState.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(modeState.trail[0][0] * S, modeState.trail[0][1] * S);
      for (const [x, y] of modeState.trail) ctx.lineTo(x * S, y * S);
      ctx.strokeStyle = ink(0.14);
      ctx.lineWidth = S * 0.0014;
      ctx.stroke();
    }

    if (modeState.fallen) {
      const f = modeState.fallen;
      drawBreve(f.x, f.y, seat.span, 0.032, f.angle, 0.5);
      line(0.08, GROUND_Y, 0.92, GROUND_Y, ink(0.14), 0.0016);
      drawStatus(`упала · ${modeState.best.toFixed(1)} с · щёлкни`, true);
      return;
    }

    drawBreve(seat.x, seat.y, seat.span, 0.032, modeState.angle, 1);
    dot(seat.x, seat.y, ink(0.35), 0.004);
    drawStatus(`${modeState.time.toFixed(1)} с`);
  },
};

/* ---------- росчерк ---------- */

/* Штрих живёт, только если проведён быстрее порога. Медленный не стирается
   рукой, а расплывается и уходит сам — правило видно, а не объявлено. */

const FADE = 0.7;

function speedWidth(speed, base, taper) {
  return base * lerp(1, 1 / (1 + speed * 0.55), taper);
}

MODES.stroke = {
  label: 'росчерк',
  note: 'Рисовалка с одним правилом: живёт только штрих, проведённый быстрее порога. Медленный расплывается и гаснет сам. Скобка получается из движения, а не из формы: её надо не нарисовать, а бросить.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'limit', label: 'порог скорости', min: 0.2, max: 3, step: 0.05, value: 1.1 },
    { type: 'range', key: 'weight', label: 'толщина', min: 0.004, max: 0.03, step: 0.001, value: 0.013 },
    { type: 'range', key: 'taper', label: 'сужение', min: 0, max: 1, step: 0.02, value: 0.6 },
    { type: 'toggle', key: 'guide', label: 'буква под рукой', value: true },
    { type: 'button', label: 'стереть', action: () => { modeState.marks = []; } },
  ],

  setup() {
    modeState.marks = [];
    modeState.live = null;
    modeState.prev = null;
    modeState.last = 0;
  },

  onDown() {
    modeState.live = { points: [[pointer.x, pointer.y, 1]], sum: 0, count: 0, fade: 1 };
    modeState.prev = [pointer.x, pointer.y];
  },

  onUp() {
    const live = modeState.live;
    modeState.live = null;
    if (!live || live.points.length < 3) return;
    const mean = live.count ? live.sum / live.count : 0;
    modeState.last = mean;
    live.slow = mean < num('limit');
    modeState.marks.push(live);
  },

  step() {
    // Скорость берём равномерно по кадрам, а не по событиям указателя:
    // события приходят пачками и мерили бы не руку, а частоту опроса.
    if (modeState.live && modeState.prev) {
      const dx = pointer.x - modeState.prev[0];
      const dy = pointer.y - modeState.prev[1];
      const speed = Math.hypot(dx, dy) / STEP;
      modeState.live.sum += speed;
      modeState.live.count += 1;
      modeState.live.points.push([pointer.x, pointer.y, speedWidth(speed, 1, num('taper'))]);
      modeState.prev = [pointer.x, pointer.y];
    }

    for (const mark of modeState.marks) {
      if (mark.slow) mark.fade -= STEP / FADE;
    }
    modeState.marks = modeState.marks.filter((mark) => mark.fade > 0);
  },

  draw() {
    if (on('guide')) letterI(0.5, 0.1);

    const weight = num('weight');
    for (const mark of modeState.marks) ribbon(mark.points, mark.fade, weight);
    if (modeState.live) ribbon(modeState.live.points, 0.9, weight);

    const limit = num('limit');
    if (modeState.live) {
      const mean = modeState.live.count ? modeState.live.sum / modeState.live.count : 0;
      drawStatus(mean < limit ? 'медленно' : 'идёт', mean < limit);
    } else if (modeState.last) {
      drawStatus(modeState.last < limit ? 'расплылось' : `${modeState.last.toFixed(1)} против ${limit.toFixed(1)}`, modeState.last < limit);
    } else {
      drawStatus('черкни');
    }
  },
};

/* ---------- перо ---------- */

/* Кончик пера висит на пружине за курсором и всегда перелетает поворот.
   Скобка тут не рисуется, а получается: развернул руку — перо ушло дугой.
   Приём общий, но именно на Й он попадает в саму букву. */

MODES.pen = {
  label: 'перо',
  note: 'Перо не под курсором, а висит за ним на пружине и перелетает каждый поворот. Резко разверни руку — перо уйдёт дугой и само напишет скобку. Жёсткость и вязкость решают, что выйдет: подпись, петля или пила.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'spring', label: 'жёсткость', min: 20, max: 400, step: 5, value: 120 },
    { type: 'range', key: 'drag', label: 'вязкость', min: 1, max: 26, step: 0.5, value: 8 },
    { type: 'range', key: 'weight', label: 'толщина', min: 0.003, max: 0.026, step: 0.001, value: 0.011 },
    { type: 'range', key: 'taper', label: 'нажим от скорости', min: 0, max: 1, step: 0.02, value: 0.5 },
    { type: 'toggle', key: 'leash', label: 'поводок', value: true },
    { type: 'button', label: 'стереть', action: () => { modeState.marks = []; } },
  ],

  setup() {
    modeState.tip = [0.5, 0.5];
    modeState.vel = [0, 0];
    modeState.marks = [];
    modeState.live = null;
  },

  onDown() {
    modeState.live = { points: [[...modeState.tip, 1]] };
    modeState.marks.push(modeState.live);
  },

  onUp() {
    modeState.live = null;
  },

  step() {
    const hand = pointer.seen ? [pointer.x, pointer.y] : [0.5, 0.5];
    const k = num('spring');
    const c = num('drag');
    for (let i = 0; i < 2; i += 1) {
      modeState.vel[i] += (hand[i] - modeState.tip[i]) * k * STEP;
      modeState.vel[i] -= modeState.vel[i] * c * STEP;
      modeState.tip[i] += modeState.vel[i] * STEP;
    }
    if (modeState.live) {
      const speed = Math.hypot(modeState.vel[0], modeState.vel[1]);
      modeState.live.points.push([...modeState.tip, speedWidth(speed, 1, num('taper'))]);
    }
  },

  draw() {
    const weight = num('weight');
    for (const mark of modeState.marks) ribbon(mark.points, 1, weight);

    if (on('leash') && pointer.seen) {
      line(pointer.x, pointer.y, modeState.tip[0], modeState.tip[1], ink(0.16), 0.0014);
      dot(pointer.x, pointer.y, ink(0.2), 0.004);
    }
    dot(modeState.tip[0], modeState.tip[1], ink(0.8), 0.006);

    drawStatus(modeState.live ? 'пишет' : 'веди и нажми');
  },
};

/* ---------- шнур ---------- */

/* Скоба жёсткая: две стойки уходят за кадр, перекладина внизу, углы скруглены.
   Краткость к ней не привязана, а перекинута через перекладину: верёвка идёт
   за ней, оба конца висят спереди. Держит обхват — трение верёвки о деталь,
   как на турнике или на кнехте.

   Отсюда рисование в два слоя: левая ветвь обхвата и гребень идут поверх
   детали, правая уходит за неё. Прятать за перекладину обе ветви нельзя —
   тогда деталь режет верёвку пополам и та читается проткнувшей. Это
   единственное место, где сцена помнит про третье измерение.

   Виток знает своё место на перекладине и своё место на верёвке. Оба ползут:
   вдоль перекладины — когда верёвка тянет виток вбок, вдоль верёвки — когда
   натяжение с одной стороны перевешивает другую. Порог обоих переступов и
   есть трение. Вытянул хвост целиком — витку не за что держаться, он сходит.

   Витки не хранятся вечно: отпустил верёвку — они пересобираются по тому,
   что сейчас лежит выше перекладины. Поэтому «закинуть конец за перекладину»
   не отдельная команда, а то же самое действие: занёс и отпустил.

   Перевес меряется усреднённо: по верёвке ходят волны, и мгновенная разность
   соседних звеньев скачет знаком вдесятеро больше самого перевеса — виток
   перебирал бы верёвку от собственной дрожи. */

const BRACE = { x1: 0.315, x2: 0.685, bar: 0.215, r: 0.024, top: -0.06 };
const BRACE_HALF = 0.0085;   // половина толщины скобы
const CORD_N = 72;
const CORD_HALF = 0.008;     // половина толщины верёвки
const RELAX = 8;
const FLOOR = 0.93;          // пол: сдёрнутой верёвке есть куда лечь
const SLIDE = 0.0016;        // насколько виток ползёт вдоль перекладины за кадр

/* Скоба ломаной: по ней деталь рисуется. Углы разложены на отрезки. */
const BRACE_LINE = (() => {
  const points = [[BRACE.x1, BRACE.top], [BRACE.x1, BRACE.bar - BRACE.r]];
  const arc = (cx, cy, from, to) => {
    for (let i = 1; i <= 6; i += 1) {
      const a = lerp(from, to, i / 6);
      points.push([cx + Math.cos(a) * BRACE.r, cy + Math.sin(a) * BRACE.r]);
    }
  };
  arc(BRACE.x1 + BRACE.r, BRACE.bar - BRACE.r, Math.PI, Math.PI / 2);
  points.push([BRACE.x2 - BRACE.r, BRACE.bar]);
  arc(BRACE.x2 - BRACE.r, BRACE.bar - BRACE.r, Math.PI / 2, 0);
  points.push([BRACE.x2, BRACE.top]);
  return points;
})();

/* Стойки — единственное, сквозь что верёвке нельзя: перекладину она обходит
   сзади, а стойки стоят в её плоскости. */
const STEMS = [
  [BRACE.x1, BRACE.top, BRACE.x1, BRACE.bar - BRACE.r],
  [BRACE.x2, BRACE.top, BRACE.x2, BRACE.bar - BRACE.r],
];

/* Куда виток может встать: по перекладине, не заходя на скругления. */
const BAR_FROM = BRACE.x1 + BRACE.r;
const BAR_TO = BRACE.x2 - BRACE.r;
/* Обхват не точка, а дуга в три звена, лежащая на кромке перекладины: из одной
   точки обе ветви выходили бы в одном месте, и виток читался бы штырём,
   проткнувшим деталь. */

function nearestOn(ax, ay, bx, by, x, y) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? clamp(((x - ax) * dx + (y - ay) * dy) / len, 0, 1) : 0;
  return [ax + dx * t, ay + dy * t];
}

function stemHit(p) {
  const reach = BRACE_HALF + CORD_HALF;
  if (p.y > BRACE.bar) return;
  for (const [ax, ay, bx, by] of STEMS) {
    const [cx, cy] = nearestOn(ax, ay, bx, by, p.x, p.y);
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d >= reach) continue;
    const nx = d > 1e-6 ? (p.x - cx) / d : 1;
    const ny = d > 1e-6 ? (p.y - cy) / d : 0;
    p.x = cx + nx * reach;
    p.y = cy + ny * reach;
  }
}

function plural(n, forms) {
  const ten = n % 10;
  const hundred = n % 100;
  if (ten === 1 && hundred !== 11) return forms[0];
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return forms[1];
  return forms[2];
}

/* Витки пересобираются по верёвке: каждый сплошной кусок, лежащий выше
   перекладины, — это один обхват, и держится он серединой этого куска. */
function rebuildWraps(cord) {
  const wraps = [];
  let from = -1;
  const close = (to) => {
    if (from < 0) return;
    const at = clamp(Math.round((from + to) / 2), 2, CORD_N - 3);
    wraps.push({ at, x: clamp(cord.points[at].x, BAR_FROM, BAR_TO), pull: 0, side: 0 });
    from = -1;
  };
  for (let i = 0; i < CORD_N; i += 1) {
    const p = cord.points[i];
    const over = p.y < BRACE.bar && p.x > BRACE.x1 && p.x < BRACE.x2;
    if (over && from < 0) from = i;
    if (!over) close(i - 1);
  }
  close(CORD_N - 1);

  // Два витка на одном месте — это один виток.
  cord.wraps = wraps.filter((w, i) => i === 0 || w.at - wraps[i - 1].at > 3);
}

/* Раскладка на старте снята с руки: автор развесил верёвку в полигоне, и её
   пропорции переписаны сюда. Доли — сколько верёвки уходит в левый хвост,
   в провис и в правый: короткая стойка, глубокая чаша, длинная стойка. Это
   и есть И, а скоба над ней — краткая.

   Провис задаётся не глубиной, а длиной: глубина под неё подбирается делением
   пополам. Иначе при другой длине верёвки чаша меняла бы долю, и раскладка
   переставала быть той самой. */
const LAUNCH = {
  left: 0.366,                    // где лежит левый виток
  right: 0.6355,                  // где правый
  share: [0.099, 0.62, 0.281],    // левый хвост, провис, правый хвост
};

function sagCurve(depth) {
  const points = [];
  for (let i = 0; i <= 16; i += 1) {
    const u = i / 16;
    points.push([
      lerp(LAUNCH.left + CORD_HALF, LAUNCH.right - CORD_HALF, u),
      BRACE.bar + Math.sin(Math.PI * u) * depth,
    ]);
  }
  return points;
}

function pathLength(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i += 1) {
    sum += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return sum;
}

function makeCord(length) {
  const span = BRACE.x2 - BRACE.x1;
  const total = span * length;
  const crest = BRACE.bar - BRACE_HALF - CORD_HALF * 0.45;

  const want = total * LAUNCH.share[1];
  let low = 0;
  let high = 1.4;
  for (let i = 0; i < 26; i += 1) {
    const mid = (low + high) / 2;
    if (pathLength(sagCurve(mid)) < want) low = mid;
    else high = mid;
  }

  const path = [
    [LAUNCH.left - CORD_HALF, BRACE.bar + total * LAUNCH.share[0]],
    [LAUNCH.left - CORD_HALF, BRACE.bar],
    [LAUNCH.left, crest],
    ...sagCurve((low + high) / 2),
    [LAUNCH.right, crest],
    [LAUNCH.right + CORD_HALF, BRACE.bar],
    [LAUNCH.right + CORD_HALF, BRACE.bar + total * LAUNCH.share[2]],
  ];

  const steps = [0];
  for (let i = 1; i < path.length; i += 1) {
    steps.push(steps[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  }
  const laid = steps[steps.length - 1];
  const points = [];
  let leg = 1;
  for (let i = 0; i < CORD_N; i += 1) {
    const at = (i / (CORD_N - 1)) * laid;
    while (leg < steps.length - 1 && steps[leg] < at) leg += 1;
    const u = (at - steps[leg - 1]) / Math.max(1e-6, steps[leg] - steps[leg - 1]);
    const x = lerp(path[leg - 1][0], path[leg][0], u);
    const y = lerp(path[leg - 1][1], path[leg][1], u);
    points.push({ x, y, px: x, py: y });
  }

  const cord = { points, rest: laid / (CORD_N - 1), hold: -1, wraps: [], settle: 60 };
  rebuildWraps(cord);
  return cord;
}

/* Переступ витка вдоль верёвки: перевесила одна сторона — обхват сползает
   к другой, и её хвост удлиняется. Дошло до конца верёвки — витку не за что
   держаться. Заодно виток ползёт вбок, если верёвка тянет его вдоль
   перекладины, и сходит со скругления. */
function feedWrap(cord, wrap, slip) {
  const at = wrap.at;
  // Звенья самого гребня прижаты и растяжения не показывают: мерить надо
  // первые свободные звенья по обе стороны от обхвата.
  const back = cord.points[at - 2];
  const backIn = cord.points[at - 1];
  const ahead = cord.points[at + 2];
  const aheadIn = cord.points[at + 1];
  if (!back || !ahead) return false;

  const now = Math.hypot(back.x - backIn.x, back.y - backIn.y)
    - Math.hypot(ahead.x - aheadIn.x, ahead.y - aheadIn.y);
  wrap.pull = lerp(wrap.pull, now, 0.06);
  if (Math.abs(wrap.pull) >= slip) {
    // Перевесила сторона back — верёвка идёт туда, а на перекладину выходит
    // место, которое было со стороны ahead.
    const next = at + (wrap.pull > 0 ? 1 : -1);
    wrap.pull *= 0.5;
    if (next < 2 || next > CORD_N - 3) return false;
    wrap.at = next;
  }

  const drift = (back.x - wrap.x) + (ahead.x - wrap.x);
  wrap.side = lerp(wrap.side, drift, 0.06);
  if (Math.abs(wrap.side) >= slip) {
    wrap.side *= 0.5;
    wrap.x += Math.sign(drift) * SLIDE;
    if (wrap.x < BAR_FROM || wrap.x > BAR_TO) return false;
  }
  return true;
}

MODES.cord = {
  label: 'шнур',
  note: 'Верёвка не привязана, а перекинута через перекладину и держится обхватом. Тяни за хвост: верёвка перебирается через виток, другой хвост укорачивается. Вытянул до конца — упала. Закинуть обратно — занести кусок за перекладину и отпустить.',
  cursor: 'grab',
  tools: [
    { type: 'range', key: 'length', label: 'длина', min: 2, max: 6, step: 0.05, value: 4.2 },
    { type: 'range', key: 'gravity', label: 'тяжесть', min: 1, max: 14, step: 0.5, value: 7 },
    { type: 'range', key: 'air', label: 'вязкость', min: 0, max: 0.2, step: 0.005, value: 0.03 },
    { type: 'range', key: 'friction', label: 'трение о скобу', min: 0, max: 1, step: 0.02, value: 0.5 },
    { type: 'toggle', key: 'letter', label: 'буква', value: false },
    { type: 'button', label: 'перекинуть заново', action: () => { modeState.cord = makeCord(num('length')); } },
  ],

  setup() {
    modeState.cord = makeCord(num('length'));
  },

  onTool(key) {
    if (key === 'length') modeState.cord = makeCord(num('length'));
  },

  onDown() {
    const cord = modeState.cord;
    let best = -1;
    let near = 0.06;
    for (let i = 0; i < cord.points.length; i += 1) {
      const d = Math.hypot(cord.points[i].x - pointer.x, cord.points[i].y - pointer.y);
      if (d < near) { near = d; best = i; }
    }
    cord.hold = best;
  },

  /* Отпустили — верёвка ложится: всё, что занесено за перекладину, становится
     обхватом. Тем же движением её и вешают обратно. */
  onUp() {
    modeState.cord.hold = -1;
    rebuildWraps(modeState.cord);
  },

  step() {
    const cord = modeState.cord;
    const damp = 1 - num('air');
    const gravity = num('gravity') * STEP * STEP;

    for (const p of cord.points) {
      const vx = (p.x - p.px) * damp;
      const vy = (p.y - p.py) * damp;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + gravity;
      if (p.y > FLOOR) {
        p.y = FLOOR;
        p.px = p.x - (p.x - p.px) * 0.4;
      }
    }

    for (let k = 0; k < RELAX; k += 1) {
      for (let i = 1; i < cord.points.length; i += 1) {
        const a = cord.points[i - 1];
        const b = cord.points[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        const shift = ((d - cord.rest) / d) * 0.5;
        const ox = dx * shift;
        const oy = dy * shift;
        a.x += ox; a.y += oy;
        b.x -= ox; b.y -= oy;
      }

      // Обхват — три точки: левая на самой детали, средняя над её кромкой,
      // правая опять на детали. Левая ветвь пойдёт поверх перекладины, правая
      // за ней — так верёвка и читается перекинутой, а не проткнувшей.
      for (const wrap of cord.wraps) {
        for (let k = -1; k <= 1; k += 1) {
          const p = cord.points[wrap.at + k];
          p.x = wrap.x + k * CORD_HALF;
          p.y = BRACE.bar - (k === 0 ? BRACE_HALF + CORD_HALF * 0.45 : 0);
        }
      }

      // Рука сильнее скобы: её точка ставится последней.
      if (cord.hold >= 0) {
        cord.points[cord.hold].x = pointer.x;
        cord.points[cord.hold].y = pointer.y;
      }

      for (const p of cord.points) stemHit(p);
    }

    // Верёвку только что закинули: волны от броска — не перевес.
    if (cord.settle > 0) { cord.settle -= 1; return; }
    const slip = cord.rest * (0.02 + num('friction') * 1.5);
    cord.wraps = cord.wraps.filter((wrap) => feedWrap(cord, wrap, slip));
  },

  draw() {
    if (on('letter')) letterI(0.5, 0.09);

    const cord = modeState.cord;

    // Верёвка целиком уходит под скобу, а потом всё, что ниже перекладины,
    // кладётся поверх: так виден обхват, а не пересечение.
    /* Верёвка идёт кривой по серединам звеньев, а не ломаной: на обхвате угол
       между звеньями большой, и ломаная встала бы там углом. */
    const run = (points) => {
      if (points.length < 2) return;
      ctx.moveTo(points[0].x * S, points[0].y * S);
      for (let i = 1; i < points.length - 1; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        ctx.quadraticCurveTo(a.x * S, a.y * S, ((a.x + b.x) / 2) * S, ((a.y + b.y) / 2) * S);
      }
      const last = points[points.length - 1];
      ctx.lineTo(last.x * S, last.y * S);
    };

    /* Спереди детали — всё, что ниже её нижней кромки, и левая ветвь обхвата
       вместе с гребнем. Правая ветвь уходит за перекладину: у перекинутой
       верёвки одна сторона видна поверх детали, другая — из-под неё. Прятать
       обе, как раньше, — это и есть та самая «верёвка сквозь скобу». */
    const under = BRACE.bar + BRACE_HALF;
    const front = (p) => {
      if (p.y > under) return true;
      let near = 0.06;
      let own = null;
      for (const wrap of cord.wraps) {
        const d = Math.abs(p.x - wrap.x);
        if (d < near) { near = d; own = wrap; }
      }
      return own ? p.x < own.x + CORD_HALF * 0.5 : false;
    };

    const rope = (only) => {
      ctx.strokeStyle = RED;
      ctx.lineWidth = S * CORD_HALF * 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let piece = [];
      for (const p of cord.points) {
        if (only && !front(p)) { run(piece); piece = []; continue; }
        piece.push(p);
      }
      run(piece);
      ctx.stroke();
    };

    rope(false);

    ctx.beginPath();
    ctx.moveTo(BRACE_LINE[0][0] * S, BRACE_LINE[0][1] * S);
    for (const [x, y] of BRACE_LINE) ctx.lineTo(x * S, y * S);
    ctx.strokeStyle = INK;
    ctx.lineWidth = S * BRACE_HALF * 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    ctx.stroke();

    rope(true);

    const count = cord.wraps.length;
    if (!count) drawStatus('сдёрнут', true);
    else drawStatus(`${count} ${plural(count, ['виток', 'витка', 'витков'])}`);
  },
};

startLab({
  title: 'Й · скобка над И',
  modes: MODES,
  start: 'brief',
});
