/* Й — краткая над И.

   Скобка над И не касается буквы, рисуется последней и первой забывается.
   Она ничего не прибавляет к звуку, кроме краткости: Й — это И, которую
   не дали дотянуть. Поэтому все механики здесь про одно — скобку надо
   заслужить и удержать, сама по себе она не стоит.

   Четыре подхода:

     краткость   длительность нажатия и есть буква: коротко — скобка встаёт,
                 передержал — осталась И
     балансир    скобка лежит на верхушке И обратным маятником и падает,
                 если не подводить букву под неё
     росчерк     живёт только штрих, проведённый быстрее порога
     перо        кончик пера висит на пружине за курсором: скобка — это
                 не форма, а перелёт

   Красный тут один и обозначает событие: краткости не вышло. */

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

startLab({
  title: 'Й · скобка над И',
  modes: MODES,
  start: 'brief',
});
