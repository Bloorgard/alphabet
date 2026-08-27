/* К — узел и два луча.

   Прописная К устроена коротко: вертикальный ствол, узел на его середине и
   две ветви, симметричные относительно горизонтали через узел. Симметрия тут
   не украшение, а закон: угол, под которым верхняя ветвь приходит к стволу,
   равен углу, под которым нижняя от него уходит. Поэтому эталон ниже взят
   зеркальным — ножку настоящей К обычно выпускают чуть дальше, но именно
   равенство углов и есть то, на чём стоят три механики из четырёх.

   Четыре подхода к одному устройству:

     кронштейн — ствол стоит, верхняя ветвь вылетает, нижняя подпирает;
     рикошет   — ствол это борт, а ветви путь до удара и после него;
     ножницы   — узел это ось, ветви лезвия, и К читается только в растворе;
     раскол    — узел это развилка трещины, и К повторяется на каждой.

   Эталон один на все четыре, поэтому буква везде одна и та же. */

const TAU = Math.PI * 2;

const K = {
  stem: 0.34,      // ствол
  top: 0.2,
  bottom: 0.8,
  node: 0.5,       // узел на середине ствола
  armX: 0.7,       // конец верхней ветви
  armY: 0.2,
  legX: 0.7,       // конец нижней ветви, зеркальный верхней
  legY: 0.8,
};

const K_SLOPE = Math.atan2(K.node - K.armY, K.armX - K.stem);   // угол ветви к горизонтали
const K_REACH = Math.hypot(K.armX - K.stem, K.node - K.armY);   // длина ветви

/* Согласование числительного: 1 трещина, 4 трещины, 9 трещин. */
function plural(count, one, few, many) {
  const tens = count % 100;
  if (tens > 10 && tens < 20) return many;
  const unit = count % 10;
  if (unit === 1) return one;
  if (unit >= 2 && unit <= 4) return few;
  return many;
}

/* Полилиния по точкам {x, y} в долях кадра. */
function poly(points, color = INK, width = 0.008) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x * S, points[0].y * S);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x * S, points[i].y * S);
  ctx.strokeStyle = color;
  ctx.lineWidth = width * S;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/* Пропись: эталонная К бледной подложкой. */
function drawGhost(alpha = 0.12) {
  const tone = ink(alpha);
  line(K.stem, K.top, K.stem, K.bottom, tone, 0.016);
  line(K.stem, K.node, K.armX, K.armY, tone, 0.016);
  line(K.stem, K.node, K.legX, K.legY, tone, 0.016);
}

const MODES = {};

/* ---------- кронштейн ---------- */

/* Ствол стоит в земле, нижняя ветвь подпирает узел, верхняя вылетает и несёт
   груз. Считается это не солвером, а прямо по балке: упругая линия консоли
   с грузом на расстоянии a известна формулой, и форма стержня берётся из неё.
   Поэтому кривизна выходит наибольшей у заделки, как ей и положено, а не
   собирается заломом на конце — на чём разошлась первая, пружинная модель.

   Плечо решает больше веса: тот же груз у самого узла почти ничего не делает,
   вынесенный на конец — складывает вылет. Груз таскают курсором вдоль ветви,
   и в этом вся игра.

   Перегиб сверх предела не отыгрывается назад: доля прогиба остаётся в форме
   навсегда, буква оседает и уже не распрямляется, даже если груз снять. Место,
   где потекло, метится красным — единственная краска сцены.

   Подкос выключается. Без него узлу не на что опереться: ствол работает
   консолью на всю высоту, и К садится на порядок охотнее. */

const BEAM_SPAN = 26;        // сечений вдоль стержня
const BEAM_EASE = 0.06;      // как быстро нагрузка доходит до заданной
const BEAM_CREEP = 0.005;    // доля перегиба, уходящая в форму за шаг
const BEAM_HELD = 0.06;      // податливость узла, когда подкос на месте
const BEAM_LOOSE = 0.5;      // она же без подкоса
const BEAM_SET = 0.22;       // дальше этой доли длины вылет не течёт
const BEAM_TILT = 0.06;      // и настолько же ограничен завал ствола
const BEAM_GIVE = 0.18;      // прогиб конца при единичном грузе и полной жёсткости
const BEAM_SWAY = 0.35;      // во сколько отклонение ствола мельче прогиба вылета

/* Упругая линия консоли: прогиб в сечении s при грузе в точке a, обе доли
   длины. За грузом момента нет, и стержень идёт прямо по касательной. */
function beamShape(s, a) {
  if (s <= a) return (3 * a * s * s - s * s * s) / 2;
  return (3 * a * a * s - a * a * a) / 2;
}

/* Стержень: ось от начала к концу, прогиб откладывается по вертикали —
   гнёт тяжесть, а не нормаль к оси. */
function beamPoints(from, to, drop, hang) {
  const points = [];
  for (let i = 0; i <= BEAM_SPAN; i += 1) {
    const s = i / BEAM_SPAN;
    points.push({
      x: lerp(from.x, to.x, s),
      y: lerp(from.y, to.y, s) + drop * beamShape(s, hang),
    });
  }
  return points;
}

/* Узел сидит на стволе: стойка защемлена в земле и отклоняется вбок, а узел
   едет вместе с ней. Ствол выше узла ничего не несёт и просто следует. */
function beamStem(lean) {
  const points = [];
  const height = K.bottom - K.top;
  for (let i = 0; i <= BEAM_SPAN; i += 1) {
    const t = i / BEAM_SPAN;
    points.push({ x: K.stem + lean * beamShape(t, 1), y: K.bottom - t * height });
  }
  return points;
}

function beamNode(lean) {
  return { x: K.stem + lean * beamShape(0.5, 1), y: K.node };
}

MODES.truss = {
  label: 'кронштейн',
  note: 'Груз таскается курсором вдоль верхней ветви: плечо решает больше веса. Вылет гнётся дугой от узла, ствол уводит вбок, а перегиб сверх предела остаётся в форме — К оседает и больше не распрямляется, место наклёпа красное. Убери подкос, и станет видно, что нижняя ветвь тут несущая.',
  cursor: 'grab',
  tools: [
    { type: 'range', key: 'load', label: 'груз', min: 0, max: 1, step: 0.01, value: 0.35 },
    { type: 'range', key: 'stiff', label: 'жёсткость', min: 0.15, max: 1, step: 0.01, value: 0.6 },
    { type: 'range', key: 'limit', label: 'предел', min: 0.04, max: 0.5, step: 0.01, value: 0.2 },
    { type: 'toggle', key: 'stay', label: 'подкос', value: true },
    { type: 'button', label: 'заново', action() { MODES.truss.setup(); } },
  ],

  setup() {
    modeState.force = 0;
    modeState.hang = 1;
    modeState.setArm = 0;
    modeState.setLean = 0;
    modeState.flowing = false;
  },

  onDown() {
    MODES.truss.onMove();
  },

  onMove() {
    if (!pointer.down) return;
    /* Курсор ставит груз на ветвь: берётся проекция на её ось. */
    const node = beamNode(modeState.lean || 0);
    const ax = K.armX - K.stem;
    const ay = K.armY - K.node;
    const len2 = ax * ax + ay * ay;
    const t = ((pointer.x - node.x) * ax + (pointer.y - node.y) * ay) / len2;
    modeState.hang = clamp(t, 0.15, 1);
  },

  step() {
    const load = num('load');
    const stiff = num('stiff');
    const limit = num('limit');
    const hang = modeState.hang;

    modeState.force = lerp(modeState.force, load, BEAM_EASE);
    const force = modeState.force;

    /* Прогиб конца вылета: сила, плечо и жёсткость. Дальше по стержню форму
       разложит beamShape, здесь считается только величина. */
    const arm = (force * beamShape(1, hang) * BEAM_GIVE) / stiff;
    const lean = (force * hang * BEAM_SWAY * (on('stay') ? BEAM_HELD : BEAM_LOOSE)) / stiff;

    /* За пределом деформация перестаёт быть упругой и капает в форму. */
    modeState.flowing = arm > limit;
    if (modeState.flowing) {
      const over = arm - limit;
      modeState.setArm = Math.min(BEAM_SET, modeState.setArm + over * BEAM_CREEP);
      modeState.setLean = Math.min(BEAM_TILT, modeState.setLean + over * BEAM_CREEP * 0.4);
    }

    modeState.arm = arm;
    modeState.lean = lean;
  },

  draw() {
    const drop = (modeState.arm + modeState.setArm) * (K.armX - K.stem);
    const lean = modeState.lean + modeState.setLean;
    const hang = modeState.hang;
    const node = beamNode(lean);

    /* Земля и штриховка под ней: без опоры не видно, на чём всё держится. */
    line(0.1, K.bottom, 0.92, K.bottom, ink(0.18), 0.002);
    for (let x = 0.1; x < 0.92; x += 0.028) {
      line(x, K.bottom, x - 0.018, K.bottom + 0.024, ink(0.1), 0.0016);
    }

    poly(beamStem(lean), INK, 0.021);

    const armLine = beamPoints(node, { x: K.armX + lean * 0.5, y: K.armY }, drop, hang);
    poly(armLine, INK, 0.018);

    if (on('stay')) {
      /* Подкос сжат и потому слегка выгибается наружу; стрела растёт с силой. */
      const bow = modeState.force * 0.03 / num('stiff');
      poly(beamPoints(node, { x: K.legX, y: K.legY }, bow, 1), INK, 0.018);
    }

    /* Наклёп садится там, где момент выше предела: от заделки до сечения,
       где он падает до предельного. */
    if (modeState.setArm > 0) {
      const share = clamp(1 - num('limit') / Math.max(modeState.arm, 1e-6), 0, 1);
      const upto = Math.round(BEAM_SPAN * hang * share);
      for (let i = 0; i <= upto; i += 4) dot(armLine[i].x, armLine[i].y, RED, 0.0055);
    }

    /* Груз на своём месте вдоль ветви. */
    const at = armLine[Math.round(BEAM_SPAN * hang)];
    const load = num('load');
    const rope = 0.03 + load * 0.05;
    line(at.x, at.y, at.x, at.y + rope, ink(0.5), 0.0025);
    ctx.beginPath();
    ctx.arc(at.x * S, (at.y + rope) * S, (0.012 + load * 0.032) * S, 0, TAU);
    ctx.fillStyle = ink(0.75);
    ctx.fill();

    const tip = armLine[armLine.length - 1];
    const fell = (tip.y - K.armY) / (K.bottom - K.top);
    drawStatus(`прогиб ${Math.round(fell * 100)}% · плечо ${Math.round(hang * 100)}%`, modeState.flowing);
  },
};

/* ---------- кольцо ---------- */

/* Мяч внизу справа, кольцо вверху, слева стена. Закинуть мяч можно только
   отскоком: без стены попадание не считается, и потому каждое очко — это
   написанная К. Стена — ствол, две дуги полёта — ветви.

   Мяч тяжёлый, и это главное отличие от первой, прямой версии. Пока тяжести
   не было, путь из точки в точку через стену был единственным: прямая к
   зеркальному образу кольца, и больше никаких. С весом решений становится
   семейство — можно кинуть внатяг понизу или навесом, — поэтому бросок задаёт
   и угол, и силу, а ветви выходят дугами. Куст попаданий от этого и живёт:
   прямые ложились одна в одну, дуги ложатся почерком.

   Пятна на стене больше нет, отражает вся: оно ничего не давало игроку, кроме
   лишнего запрета. Форму держит не запрет, а раздача — мяч и кольцо ставятся
   так, чтобы попасть можно было, и чтобы путь читался буквой.

   Уровень один и бесконечный. Сложность растёт с попаданиями: кольцо
   уменьшается и начинает качаться, так что к двадцатому попаданию оно вдвое
   меньше и не стоит на месте. Три промаха заканчивают партию.

   Красный тут событие: свежая К горит до следующего броска, прежние уходят
   в бледные чернила и остаются кустом. */

const RING_HOLE = [0.05, 0.026];   // радиус кольца: первое попадание и предел
const RING_SWAY = 0.035;           // насколько кольцо качается на пределе
const RING_RATE = 0.011;           // и как быстро
const RING_RAMP = 12;              // за сколько попаданий сложность доходит до предела
const RING_PULL = 0.11;            // сколько скорости даёт доля тяги
const RING_REACH = 0.34;           // дальше тянуть некуда
const RING_KICK = 0.95;            // что остаётся от скорости после стены
const RING_LIVES = 3;
const RING_TRAIL = 130;            // длина шлейфа в шагах
const RING_KEEP = 8;               // сколько написанных К держит поле
const RING_FLIGHT = 700;           // дольше этого полёт считается промахом
const RING_REST = 35;              // пауза показа: сколько кадров стоит результат

const RING_LAYOUTS = [
  { ball: { x: 0.72, y: 0.84 }, hoop: { x: 0.69, y: 0.22 } },
  { ball: { x: 0.79, y: 0.86 }, hoop: { x: 0.74, y: 0.28 } },
  { ball: { x: 0.67, y: 0.87 }, hoop: { x: 0.76, y: 0.19 } },
  { ball: { x: 0.81, y: 0.81 }, hoop: { x: 0.64, y: 0.31 } },
  { ball: { x: 0.7, y: 0.89 }, hoop: { x: 0.73, y: 0.24 } },
];

function ringHard() {
  return clamp(modeState.hits / RING_RAMP, 0, 1) * num('move');
}

/* Кольцо качается по вертикали вокруг своего места; на старте амплитуда
   нулевая, и оно просто висит. */
function ringHoop() {
  const hoop = modeState.hoop;
  return { x: hoop.x, y: hoop.y + Math.sin(modeState.phase) * hoop.sway, r: hoop.r };
}

/* Один бросок целиком, без рисования, тем же законом, что и живой полёт.
   На нём держится всё остальное: проверка раздачи на решаемость, подсказка
   и показательный бросок при открытии. Иметь три копии баллистики, которые
   разойдутся при первой же правке, того не стоит. */
function ringShot(ball, hoop, angle, power, gravity, limit = RING_FLIGHT) {
  const path = [{ x: ball.x, y: ball.y }];
  let x = ball.x;
  let y = ball.y;
  let vx = Math.cos(angle) * power;
  let vy = Math.sin(angle) * power;
  let hit = false;
  let near = Infinity;
  for (let step = 0; step < limit; step += 1) {
    const px = x;
    const py = y;
    vy += gravity;
    x += vx;
    y += vy;
    if ((px - K.stem) * (x - K.stem) < 0) {
      const t = (K.stem - px) / (x - px || 1e-6);
      const at = py + (y - py) * t;
      if (at >= K.top && at <= K.bottom) {
        x = K.stem;
        y = at;
        vx = -vx * RING_KICK;
        hit = true;
        path.push({ x, y });
      }
    }
    path.push({ x, y });
    if (hit) {
      const gap = ringNear(px, py, x, y, hoop.x, hoop.y);
      near = Math.min(near, gap);
      if (gap <= hoop.r) break;
    }
    if (x < -0.05 || x > 1.05 || y > 1.05) break;
  }
  return { hit, near, path };
}

/* Раздача проверяется перебором: если ни один бросок из сетки не попадает,
   позиции не годятся. Так решаемость гарантируется при любой тяжести, а
   считать баллистику отскока в уме не нужно ни здесь, ни в подсказке. */
function ringSolve(ball, hoop, gravity) {
  let best = null;
  for (let a = 0; a < 34; a += 1) {
    const angle = Math.PI + (a / 33) * (Math.PI * 0.62);   // вверх и влево
    for (let p = 0; p < 14; p += 1) {
      const power = lerp(0.1, 1, p / 13) * RING_REACH * RING_PULL;
      const shot = ringShot(ball, hoop, angle, power, gravity);
      if (!shot.hit || shot.near > hoop.r) continue;
      if (!best || shot.near < best.near) best = { angle, power, near: shot.near };
    }
  }
  return best;
}

function ringDeal() {
  const t = ringHard();
  const r = lerp(RING_HOLE[0], RING_HOLE[1], t);
  const layout = RING_LAYOUTS[modeState.hits % RING_LAYOUTS.length];
  const sway = t * t * RING_SWAY;
  const gravity = num('weight');
  modeState.ball = { ...layout.ball };
  modeState.hoop = { ...layout.hoop, r, sway };
  modeState.solved = ringSolve(modeState.ball, { ...modeState.hoop, y: layout.hoop.y }, gravity);
  modeState.phase = 0;
}

function ringFire(dx, dy) {
  const len = Math.hypot(dx, dy) || 1;
  const pull = Math.min(len, RING_REACH);
  const ball = modeState.ball;
  modeState.fly = {
    x: ball.x, y: ball.y,
    vx: (dx / len) * pull * RING_PULL,
    vy: (dy / len) * pull * RING_PULL,
    path: [{ x: ball.x, y: ball.y }],
    hit: false,
    age: 0,
  };
}

/* Промах и попадание сначала показываются, и только потом приходит новая
   раздача: без паузы кольцо переезжает в тот же кадр, и написанная К повисает
   рядом с чужим кольцом, а упавший мяч вообще не успевает попасться на глаза. */
function ringMiss() {
  modeState.missed = modeState.fly ? modeState.fly.path : null;
  modeState.fly = null;
  modeState.lives -= 1;
  if (modeState.lives <= 0) modeState.over = true;
  else modeState.rest = RING_REST;
}

/* Ближайшее расстояние от отрезка хода до центра кольца: на скорости мяч
   проскакивает кольцо между кадрами, и проверять одну точку мало. */
function ringNear(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? clamp(((cx - ax) * dx + (cy - ay) * dy) / len2, 0, 1) : 0;
  return Math.hypot(ax + dx * t - cx, ay + dy * t - cy);
}

/* Шлейф: голова яркая, хвост уходит в ничто за RING_TRAIL шагов. */
function ringTrail(path, color) {
  const last = path.length - 1;
  for (let i = last; i > 0; i -= 3) {
    const from = Math.max(0, i - 3);
    const fade = clamp(1 - (last - i) / RING_TRAIL, 0, 1);
    if (fade <= 0.02) break;
    poly(path.slice(from, i + 1), color(fade), 0.003 + fade * 0.003);
  }
}

MODES.ring = {
  label: 'кольцо',
  note: 'Тяни от мяча и отпускай: тяга задаёт и угол, и силу. Мяч летит дугой, а попасть в кольцо можно только после отскока от ствола — такой путь и есть К. После каждого попадания задача понемногу усложняется. Три промаха — конец, R — заново.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'weight', label: 'вес', min: 0.0001, max: 0.0012, step: 0.00005, value: 0.00045 },
    { type: 'range', key: 'move', label: 'усложнение', min: 0, max: 1, step: 0.05, value: 0.8 },
    { type: 'toggle', key: 'hint', label: 'подсказка', value: false },
    { type: 'toggle', key: 'trace', label: 'история', value: false },
    { type: 'button', label: 'заново', action() { MODES.ring.setup(); } },
  ],

  setup() {
    modeState.hits = 0;
    modeState.lives = RING_LIVES;
    modeState.over = false;
    modeState.fly = null;
    modeState.aim = false;
    modeState.fresh = null;
    modeState.phase = 0;
    modeState.rest = 0;
    modeState.missed = null;
    modeState.done = [];
    modeState.guidePath = null;
    ringDeal();
    const shot = modeState.solved;
    if (shot) {
      const shown = ringShot(modeState.ball, modeState.hoop, shot.angle, shot.power, num('weight'));
      if (shown.hit) modeState.guidePath = shown.path;
    }
  },

  onDown() {
    if (modeState.fly || modeState.over || modeState.rest > 0) return;
    modeState.aim = true;
  },

  onUp() {
    if (!modeState.aim) return;
    modeState.aim = false;
    const dx = pointer.x - modeState.ball.x;
    const dy = pointer.y - modeState.ball.y;
    if (Math.hypot(dx, dy) < 0.02) return;
    ringFire(dx, dy);
  },

  step() {
    modeState.phase += RING_RATE + ringHard() * RING_RATE;

    if (modeState.rest > 0) {
      modeState.rest -= 1;
      if (modeState.rest === 0 && !modeState.over) {
        modeState.missed = null;
        ringDeal();
        modeState.fresh = null;
      }
      return;
    }

    const fly = modeState.fly;
    if (!fly) return;

    fly.age += 1;
    const px = fly.x;
    const py = fly.y;
    fly.vy += num('weight');
    fly.x += fly.vx;
    fly.y += fly.vy;

    /* Стена проверяется по отрезку хода: на скорости мяч за кадр проходит
       больше своей толщины и иначе прошёл бы насквозь. */
    if ((px - K.stem) * (fly.x - K.stem) < 0) {
      const t = (K.stem - px) / (fly.x - px || 1e-6);
      const at = py + (fly.y - py) * t;
      if (at >= K.top && at <= K.bottom) {
        fly.x = K.stem;
        fly.y = at;
        fly.vx = -fly.vx * RING_KICK;
        fly.path.push({ x: fly.x, y: fly.y });
        fly.hit = true;
      }
    }

    fly.path.push({ x: fly.x, y: fly.y });

    /* Кольцо засчитывается только после отскока: без стены буквы нет. */
    if (fly.hit) {
      const hoop = ringHoop();
      const near = ringNear(px, py, fly.x, fly.y, hoop.x, hoop.y);
      if (near <= hoop.r) {
        modeState.hits += 1;
        modeState.fresh = fly.path;
        modeState.done.push(fly.path);
        if (modeState.done.length > RING_KEEP) modeState.done.shift();
        modeState.fly = null;
        modeState.missed = null;
        modeState.rest = RING_REST;
        return;
      }
    }

    const gone = fly.x < -0.05 || fly.x > 1.05 || fly.y > 1.05;
    if (gone || fly.age > RING_FLIGHT) ringMiss();
  },

  draw() {
    const ball = modeState.ball;
    const hoop = ringHoop();
    const hits = modeState.hits;
    const misses = RING_LIVES - modeState.lives;
    const hitText = `${hits} ${plural(hits, 'попадание', 'попадания', 'попаданий')}`;
    const missText = `${misses} ${plural(misses, 'промах', 'промаха', 'промахов')}`;

    if (on('trace')) {
      for (let i = 0; i < modeState.done.length; i += 1) {
        const path = modeState.done[i];
        if (path === modeState.fresh) continue;
        const age = (i + 1) / modeState.done.length;
        poly(path, ink(0.08 + age * 0.14), 0.0035);
      }
    }

    if (modeState.fresh && modeState.rest > 0) {
      poly(modeState.fresh, RED, 0.005);
    }

    /* Стена целиком — ствол буквы, и отражает она вся. */
    line(K.stem, K.top, K.stem, K.bottom, ink(0.6), 0.017);

    ctx.beginPath();
    ctx.arc(hoop.x * S, hoop.y * S, hoop.r * S, 0, TAU);
    ctx.strokeStyle = ink(0.75);
    ctx.lineWidth = 0.005 * S;
    ctx.stroke();
    dot(hoop.x, hoop.y, ink(0.3), 0.004);

    /* В начале путь виден как бледная форма К: человек понимает задачу до
       первого броска. Подсказка делает тот же путь заметнее. */
    if (modeState.guidePath && modeState.hits === 0 && !modeState.fly) {
      ctx.setLineDash([0.01 * S, 0.014 * S]);
      poly(modeState.guidePath, ink(on('hint') ? 0.34 : 0.14), 0.0025);
      ctx.setLineDash([]);
    }

    /* Промах держится на кадре, пока идёт пауза: видно, куда ушёл мяч. */
    if (modeState.missed) {
      poly(modeState.missed, ink(0.22), 0.003);
      const end = modeState.missed[modeState.missed.length - 1];
      dot(end.x, end.y, ink(0.3), 0.011);
    }

    if (modeState.fly) {
      ringTrail(modeState.fly.path, (fade) => ink(0.15 + fade * 0.7));
      dot(modeState.fly.x, modeState.fly.y, INK, 0.013);
    } else {
      dot(ball.x, ball.y, modeState.over ? ink(0.25) : INK, 0.015);
    }

    /* Прицел: тяга даёт вектор броска, а рядом идёт начало дуги — чтобы вес
       мяча читался ещё до того, как отпустишь. */
    if (modeState.aim) {
      const dx = pointer.x - ball.x;
      const dy = pointer.y - ball.y;
      const len = Math.hypot(dx, dy) || 1e-6;
      const pull = Math.min(len, RING_REACH);
      line(ball.x, ball.y, ball.x + (dx / len) * pull, ball.y + (dy / len) * pull, ink(0.3), 0.0025);

      const start = ringShot(ball, hoop, Math.atan2(dy, dx), pull * RING_PULL, num('weight'), 34);
      poly(start.path, ink(0.28), 0.0022);
    }

    for (let i = 0; i < RING_LIVES; i += 1) {
      dot(0.94 - i * 0.028, 0.95, i < modeState.lives ? ink(0.55) : ink(0.14), 0.0085);
    }

    if (modeState.over) {
      drawStatus(`${hitText} · партия окончена, R — заново`, true);
    } else {
      drawStatus(`${hitText} · ${missText}`);
    }
  },
};

/* ---------- ворота: копия кольца ---------- */

/* Здесь кольцо становится не мишенью, а воротами в верхней ветви К. Вход у
   ворот вращается: бросок всё ещё один, но теперь нужно поймать момент, когда
   открытый сектор смотрит навстречу мячу. Широкое окно оставляет механику
   доступной, а несколько призрачных положений делают движение видимым. */

const GATE_RATE = 0.012;

function gateMouth() {
  return lerp(0.62, 1.18, num('mouth'));
}

function gateAngleDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function gateCrossing(ax, ay, bx, by, hoop) {
  const dx = bx - ax;
  const dy = by - ay;
  const ox = ax - hoop.x;
  const oy = ay - hoop.y;
  const a = dx * dx + dy * dy;
  if (!a) return null;
  const b = 2 * (ox * dx + oy * dy);
  const c = ox * ox + oy * oy - hoop.r * hoop.r;
  const discriminant = b * b - 4 * a * c;
  if (discriminant <= 0) return null;

  const root = Math.sqrt(discriminant);
  const roots = [(-b - root) / (2 * a), (-b + root) / (2 * a)].sort((one, two) => one - two);
  for (const t of roots) {
    if (t < 0 || t > 1) continue;
    const before = Math.max(0, t - 0.002);
    const after = Math.min(1, t + 0.002);
    const beforeX = ax + dx * before;
    const beforeY = ay + dy * before;
    const afterX = ax + dx * after;
    const afterY = ay + dy * after;
    const beforeDist = Math.hypot(beforeX - hoop.x, beforeY - hoop.y);
    const afterDist = Math.hypot(afterX - hoop.x, afterY - hoop.y);
    if (beforeDist > hoop.r && afterDist <= hoop.r) {
      const x = ax + dx * t;
      const y = ay + dy * t;
      return { angle: Math.atan2(y - hoop.y, x - hoop.x) };
    }
  }
  return null;
}

function gateEntry(path, hoop) {
  for (let i = 1; i < path.length; i += 1) {
    const crossing = gateCrossing(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y, hoop);
    if (crossing) return crossing.angle;
  }
  return Math.PI / 2;
}

function gatePass(ax, ay, bx, by, hoop) {
  const crossing = gateCrossing(ax, ay, bx, by, hoop);
  if (!crossing) return false;
  return Math.abs(gateAngleDiff(crossing.angle, modeState.gateAngle)) <= gateMouth() * 0.62;
}

function gateDeal() {
  ringDeal();
  modeState.gatePath = null;
  if (!modeState.solved) return;

  const shown = ringShot(modeState.ball, modeState.hoop, modeState.solved.angle, modeState.solved.power, num('weight'));
  if (!shown.hit) return;
  modeState.gatePath = shown.path;
  modeState.gateAngle = gateEntry(shown.path, modeState.hoop);
}

function gateArc(x, y, radius, start, end, color, width) {
  ctx.beginPath();
  ctx.arc(x * S, y * S, radius * S, start, end);
  ctx.strokeStyle = color;
  ctx.lineWidth = width * S;
  ctx.lineCap = 'butt';
  ctx.stroke();
}

function drawGateK(hoop) {
  line(K.stem, K.top, K.stem, K.bottom, INK, 0.026);
  line(K.stem, K.node, hoop.x - hoop.r * 0.78, hoop.y + hoop.r * 0.4, INK, 0.026);
}

function drawGateRing(hoop, alpha = 1) {
  const mouth = gateMouth();
  const gap = mouth * 0.72;
  const start = modeState.gateAngle + gap;
  const end = modeState.gateAngle + TAU - gap;
  gateArc(hoop.x, hoop.y, hoop.r, start, end, ink(0.9 * alpha), 0.018);
}

MODES.gate = {
  label: 'ворота',
  note: 'К стала воротами: тяни мяч и отпускай после рикошета. Попасть мало — открытый сектор кольца должен встретить мяч. Кольцо вращается медленно, поэтому момент можно поймать без второго органа управления. Три промаха — конец, R — заново.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'weight', label: 'вес', min: 0.0001, max: 0.0012, step: 0.00005, value: 0.00045 },
    { type: 'range', key: 'move', label: 'усложнение', min: 0, max: 1, step: 0.05, value: 0.55 },
    { type: 'range', key: 'mouth', label: 'окно', min: 0, max: 1, step: 0.05, value: 0.7 },
    { type: 'toggle', key: 'trace', label: 'история', value: false },
    { type: 'button', label: 'заново', action() { MODES.gate.setup(); } },
  ],

  setup() {
    modeState.hits = 0;
    modeState.lives = RING_LIVES;
    modeState.over = false;
    modeState.fly = null;
    modeState.aim = false;
    modeState.fresh = null;
    modeState.phase = 0;
    modeState.gateAngle = 0;
    modeState.gateFlash = 0;
    modeState.rest = 0;
    modeState.missed = null;
    modeState.done = [];
    gateDeal();
  },

  onDown() {
    if (modeState.fly || modeState.over || modeState.rest > 0) return;
    modeState.aim = true;
  },

  onUp() {
    if (!modeState.aim) return;
    modeState.aim = false;
    const dx = pointer.x - modeState.ball.x;
    const dy = pointer.y - modeState.ball.y;
    if (Math.hypot(dx, dy) < 0.02) return;
    ringFire(dx, dy);
  },

  step() {
    const hard = ringHard();
    modeState.phase += RING_RATE + hard * RING_RATE;
    modeState.gateAngle += GATE_RATE + hard * GATE_RATE * 0.5;
    modeState.gateFlash = Math.max(0, modeState.gateFlash - 1);

    if (modeState.rest > 0) {
      modeState.rest -= 1;
      if (modeState.rest === 0 && !modeState.over) {
        modeState.missed = null;
        modeState.fresh = null;
        gateDeal();
      }
      return;
    }

    const fly = modeState.fly;
    if (!fly) return;

    fly.age += 1;
    const px = fly.x;
    const py = fly.y;
    fly.vy += num('weight');
    fly.x += fly.vx;
    fly.y += fly.vy;

    if ((px - K.stem) * (fly.x - K.stem) < 0) {
      const t = (K.stem - px) / (fly.x - px || 1e-6);
      const at = py + (fly.y - py) * t;
      if (at >= K.top && at <= K.bottom) {
        fly.x = K.stem;
        fly.y = at;
        fly.vx = -fly.vx * RING_KICK;
        fly.path.push({ x: fly.x, y: fly.y });
        fly.hit = true;
      }
    }

    fly.path.push({ x: fly.x, y: fly.y });

    if (fly.hit) {
      const hoop = ringHoop();
      if (gatePass(px, py, fly.x, fly.y, hoop)) {
        modeState.hits += 1;
        modeState.fresh = fly.path;
        modeState.done.push(fly.path);
        if (modeState.done.length > RING_KEEP) modeState.done.shift();
        modeState.fly = null;
        modeState.missed = null;
        modeState.gateFlash = 24;
        modeState.rest = RING_REST;
        return;
      }
    }

    const gone = fly.x < -0.05 || fly.x > 1.05 || fly.y > 1.05;
    if (gone || fly.age > RING_FLIGHT) ringMiss();
  },

  draw() {
    const ball = modeState.ball;
    const hoop = ringHoop();
    const hits = modeState.hits;
    const misses = RING_LIVES - modeState.lives;
    const hitText = `${hits} ${plural(hits, 'попадание', 'попадания', 'попаданий')}`;
    const missText = `${misses} ${plural(misses, 'промах', 'промаха', 'промахов')}`;

    if (on('trace')) {
      for (let i = 0; i < modeState.done.length; i += 1) {
        const path = modeState.done[i];
        if (path === modeState.fresh) continue;
        poly(path, ink(0.08 + ((i + 1) / modeState.done.length) * 0.14), 0.0035);
      }
    }

    drawGateK(hoop);
    drawGateRing(hoop, 1);

    if (modeState.gateFlash > 0) {
      gateArc(hoop.x, hoop.y, hoop.r * 1.42, modeState.gateAngle - 0.7, modeState.gateAngle + 0.7, RED, 0.008);
    }

    if (modeState.fresh && modeState.rest > 0) poly(modeState.fresh, RED, 0.0055);

    dot(ball.x, ball.y, modeState.over ? ink(0.25) : INK, 0.024);

    if (modeState.missed) {
      poly(modeState.missed, ink(0.22), 0.003);
      const end = modeState.missed[modeState.missed.length - 1];
      dot(end.x, end.y, ink(0.3), 0.011);
    }

    if (modeState.fly) {
      ringTrail(modeState.fly.path, (fade) => ink(0.15 + fade * 0.7));
      dot(modeState.fly.x, modeState.fly.y, INK, 0.018);
    }

    if (modeState.aim) {
      const dx = pointer.x - ball.x;
      const dy = pointer.y - ball.y;
      const len = Math.hypot(dx, dy) || 1e-6;
      const pull = Math.min(len, RING_REACH);
      const start = ringShot(ball, hoop, Math.atan2(dy, dx), pull * RING_PULL, num('weight'), 34);
      poly(start.path, ink(0.42), 0.0035);
    }

    for (let i = 0; i < RING_LIVES; i += 1) {
      dot(0.94 - i * 0.028, 0.95, i < modeState.lives ? ink(0.55) : ink(0.14), 0.0085);
    }

    if (modeState.over) drawStatus(`${hitText} · партия окончена, R — заново`, true);
    else drawStatus(`${hitText} · ${missText}`);
  },
};

/* ---------- подвес: новая копия ---------- */

/* В этой версии К не рисуется ветками заранее. Стойка — единственная чёрная
   форма, а нижняя дуга рождается из самого броска. Кольцо висит отдельно на
   тонкой нити и вращается вокруг неё: игрок выбирает не готовую линию, а силу
   удара и момент. Удар двигает стойку, поэтому следующий бросок начинается
   уже в другой геометрии. */

const SUSP_STEM_X = 0.34;
const SUSP_STEM_TOP = 0.2;
const SUSP_STEM_BOTTOM = 0.8;
const SUSP_RING = { x: 0.72, y: SUSP_STEM_TOP + 0.062, r: 0.062 };
const SUSP_RING_SWAY = 0.06;
const SUSP_BALL = { x: 0.72, y: 0.84 };
const SUSP_PULL = 0.11;
const SUSP_REACH = 0.34;
const SUSP_KICK = 0.95;
const SUSP_STEM_INERTIA = 2.4;
const SUSP_FLIGHT = 700;
const SUSP_REST = 35;
const SUSP_TRAIL = 42;

function suspendStem(angle = modeState.stemAngle) {
  const length = SUSP_STEM_BOTTOM - SUSP_STEM_TOP;
  return {
    top: { x: SUSP_STEM_X, y: SUSP_STEM_TOP },
    bottom: {
      x: SUSP_STEM_X + Math.sin(angle) * length,
      y: SUSP_STEM_TOP + Math.cos(angle) * length,
    },
  };
}

function suspendStemX(y, angle = modeState.stemAngle) {
  return SUSP_STEM_X + Math.tan(angle) * (y - SUSP_STEM_TOP);
}

function suspendStemCrossing(ax, ay, bx, by, angleBefore, angleAfter) {
  function sample(t) {
    const angle = lerp(angleBefore, angleAfter, t);
    const y = lerp(ay, by, t);
    const x = lerp(ax, bx, t);
    return { angle, y, x, gap: x - suspendStemX(y, angle) };
  }

  const start = sample(0);
  const end = sample(1);
  if (start.gap * end.gap > 0) return null;

  let lowT = 0;
  let highT = 1;
  let lowGap = start.gap;
  for (let i = 0; i < 9; i += 1) {
    const t = (lowT + highT) / 2;
    const point = sample(t);
    if (lowGap * point.gap <= 0) highT = t;
    else {
      lowT = t;
      lowGap = point.gap;
    }
  }

  const hit = sample(highT);
  const stem = suspendStem(hit.angle);
  if (hit.y < stem.top.y || hit.y > stem.bottom.y) return null;
  return {
    t: highT,
    x: suspendStemX(hit.y, hit.angle),
    y: hit.y,
    angle: hit.angle,
    side: Math.sign(start.gap) || 1,
  };
}

function suspendRing() {
  const offset = modeState.ringOffset;
  const string = SUSP_STEM_TOP;
  const attachY = Math.sqrt(Math.max(0, string * string - offset * offset));
  const squeeze = Math.max(0.045, Math.abs(Math.cos(modeState.ringAngle)));
  return {
    ...SUSP_RING,
    x: SUSP_RING.x + offset,
    y: attachY + SUSP_RING.r,
    rx: SUSP_RING.r * squeeze,
    ry: SUSP_RING.r,
  };
}

function suspendThreadNear(ax, ay, bx, by, ring) {
  const cx = SUSP_RING.x;
  const cy = 0;
  const dx = ring.x;
  const dy = ring.y - ring.ry;
  const side = (x1, y1, x2, y2, x3, y3) => (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
  const one = side(ax, ay, bx, by, cx, cy);
  const two = side(ax, ay, bx, by, dx, dy);
  const three = side(cx, cy, dx, dy, ax, ay);
  const four = side(cx, cy, dx, dy, bx, by);
  if (one * two <= 0 && three * four <= 0) return 0;
  return Math.min(
    ringNear(ax, ay, bx, by, cx, cy),
    ringNear(ax, ay, bx, by, dx, dy),
    ringNear(cx, cy, dx, dy, ax, ay),
    ringNear(cx, cy, dx, dy, bx, by),
  );
}

function suspendEllipseCrossing(ax, ay, bx, by, ellipse) {
  const dx = (bx - ax) / ellipse.rx;
  const dy = (by - ay) / ellipse.ry;
  const ox = (ax - ellipse.x) / ellipse.rx;
  const oy = (ay - ellipse.y) / ellipse.ry;
  const a = dx * dx + dy * dy;
  if (!a) return null;
  const b = 2 * (ox * dx + oy * dy);
  const c = ox * ox + oy * oy - 1;
  const discriminant = b * b - 4 * a * c;
  if (discriminant <= 0) return null;

  const root = Math.sqrt(discriminant);
  const roots = [(-b - root) / (2 * a), (-b + root) / (2 * a)].sort((one, two) => one - two);
  for (const t of roots) {
    if (t < 0 || t > 1) continue;
    const before = Math.max(0, t - 0.002);
    const after = Math.min(1, t + 0.002);
    const beforeDist = Math.hypot(ox + dx * before, oy + dy * before);
    const afterDist = Math.hypot(ox + dx * after, oy + dy * after);
    if (beforeDist > 1 && afterDist <= 1) return t;
  }
  return null;
}

function suspendPass(ax, ay, bx, by, ring) {
  const inner = suspendEllipseCrossing(ax, ay, bx, by, {
    x: ring.x,
    y: ring.y,
    rx: ring.rx * 0.78,
    ry: ring.ry * 0.78,
  });
  return inner !== null;
}

function suspendLaunch(dx, dy) {
  const len = Math.hypot(dx, dy) || 1;
  const pull = Math.min(len, SUSP_REACH);
  const ball = modeState.ball;
  modeState.force = pull;
  modeState.fly = {
    x: ball.x,
    y: ball.y,
    vx: (dx / len) * pull * SUSP_PULL,
    vy: (dy / len) * pull * SUSP_PULL,
    path: [{ x: ball.x, y: ball.y }],
    bounced: false,
    scored: false,
    threadHit: false,
    age: 0,
  };
}

function suspendMiss() {
  modeState.fly = null;
  modeState.lives -= 1;
  if (modeState.lives <= 0) modeState.over = true;
  else modeState.rest = SUSP_REST;
}

function suspendPreview(ball, dx, dy) {
  const len = Math.hypot(dx, dy) || 1;
  const pull = Math.min(len, SUSP_REACH);
  let x = ball.x;
  let y = ball.y;
  let vx = (dx / len) * pull * SUSP_PULL;
  let vy = (dy / len) * pull * SUSP_PULL;
  const path = [{ x, y }];
  let bounced = false;
  for (let i = 0; i < 22; i += 1) {
    const px = x;
    const py = y;
    vy += num('weight');
    x += vx;
    y += vy;
    const hit = bounced ? null : suspendStemCrossing(px, py, x, y, modeState.stemAngle, modeState.stemAngle);
    if (hit) {
      x = hit.x;
      y = hit.y;
      vx = -vx * SUSP_KICK;
      bounced = true;
    }
    path.push({ x, y });
  }
  return path;
}

function suspendTrail(path, color) {
  const from = Math.max(0, path.length - SUSP_TRAIL);
  for (let i = from + 1; i < path.length; i += 2) {
    const fade = (i - from) / Math.max(path.length - from, 1);
    poly(path.slice(Math.max(from, i - 2), i + 1), color(fade), 0.002 + fade * 0.003);
  }
}

function drawSuspendRing(ring, color = INK, width = 0.012) {
  ctx.beginPath();
  ctx.ellipse(ring.x * S, ring.y * S, ring.rx * S, ring.ry * S, 0, 0, TAU);
  ctx.strokeStyle = color;
  ctx.lineWidth = width * S;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawSuspendForce() {
  const x = 0.69;
  const y = 0.95;
  const width = 0.14;
  line(x, y, x + width, y, ink(0.35), 0.009);
  line(x, y, x + width * clamp(modeState.force / SUSP_REACH, 0, 1), y, RED, 0.009);
}

MODES.suspension = {
  label: 'подвес',
  note: 'Тяни мяч и отпускай: сила удара отмечается красной полосой. Мяч бьёт в стойку, стойка раскачивается и меняет следующую попытку. Кольцо вращается вокруг нити и колышется от касаний. Видна только короткая часть полёта — остальное приходится почувствовать. Три промаха — конец, R — заново.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'weight', label: 'вес', min: 0.0001, max: 0.0012, step: 0.00005, value: 0.00045 },
    { type: 'range', key: 'spin', label: 'вращение', min: 0.2, max: 1.4, step: 0.05, value: 0.8 },
    { type: 'toggle', key: 'trace', label: 'история', value: false },
    { type: 'button', label: 'заново', action() { MODES.suspension.setup(); } },
  ],

  setup() {
    modeState.ball = { ...SUSP_BALL };
    modeState.force = 0;
    modeState.lives = RING_LIVES;
    modeState.hits = 0;
    modeState.over = false;
    modeState.fly = null;
    modeState.aim = false;
    modeState.stemAngle = 0;
    modeState.stemAngularVelocity = 0;
    modeState.ringAngle = 0;
    modeState.ringOffset = 0;
    modeState.ringVelocity = 0;
    modeState.rest = 0;
    modeState.fresh = null;
    modeState.done = [];
  },

  onDown() {
    if (modeState.fly || modeState.over || modeState.rest > 0) return;
    modeState.aim = true;
  },

  onMove() {
    if (!pointer.down) return;
    modeState.force = Math.min(Math.hypot(pointer.x - modeState.ball.x, pointer.y - modeState.ball.y), SUSP_REACH);
  },

  onUp() {
    if (!modeState.aim) return;
    modeState.aim = false;
    const dx = pointer.x - modeState.ball.x;
    const dy = pointer.y - modeState.ball.y;
    if (Math.hypot(dx, dy) < 0.02) return;
    suspendLaunch(dx, dy);
  },

  step() {
    const angleBefore = modeState.stemAngle;
    modeState.ringAngle += num('spin') * 0.018;
    modeState.ringOffset += modeState.ringVelocity;
    modeState.ringVelocity *= 0.993;
    modeState.ringVelocity -= modeState.ringOffset * 0.012;
    modeState.ringOffset = clamp(modeState.ringOffset, -SUSP_RING_SWAY, SUSP_RING_SWAY);
    modeState.stemAngle += modeState.stemAngularVelocity;
    modeState.stemAngularVelocity *= 0.992;
    modeState.stemAngularVelocity -= Math.sin(modeState.stemAngle) * 0.006;
    modeState.stemAngle = clamp(modeState.stemAngle, -0.22, 0.22);
    const angleAfter = modeState.stemAngle;

    if (modeState.rest > 0) {
      modeState.rest -= 1;
      if (modeState.rest === 0 && !modeState.over) modeState.fresh = null;
      return;
    }

    const fly = modeState.fly;
    if (!fly) return;

    fly.age += 1;
    const px = fly.x;
    const py = fly.y;
    fly.vy += num('weight');
    fly.x += fly.vx;
    fly.y += fly.vy;

    if (!fly.bounced) {
      const hit = suspendStemCrossing(px, py, fly.x, fly.y, angleBefore, angleAfter);
      if (hit) {
        const length = SUSP_STEM_BOTTOM - SUSP_STEM_TOP;
        const lever = clamp((hit.y - SUSP_STEM_TOP) / length, 0, 1);
        const distance = length * lever;
        const normalX = Math.cos(hit.angle) * hit.side;
        const normalY = -Math.sin(hit.angle) * hit.side;
        const ballNormal = fly.vx * normalX + fly.vy * normalY;
        const stemNormal = modeState.stemAngularVelocity * distance * hit.side;
        const relativeNormal = ballNormal - stemNormal;
        if (relativeNormal < 0) {
          const impulse = -(1 + SUSP_KICK) * relativeNormal
            / (1 + distance * distance / SUSP_STEM_INERTIA);
          fly.x = hit.x;
          fly.y = hit.y;
          fly.vx += impulse * normalX;
          fly.vy += impulse * normalY;
          fly.bounced = true;
          modeState.stemAngularVelocity -= impulse * hit.side * distance / SUSP_STEM_INERTIA;
        }
      }
    }

    fly.path.push({ x: fly.x, y: fly.y });

    const ring = suspendRing();
    if (!fly.threadHit && suspendThreadNear(px, py, fly.x, fly.y, ring) <= 0.014) {
      modeState.ringVelocity += clamp(fly.vx * 0.22, -0.007, 0.007);
      fly.vx *= 0.93;
      fly.threadHit = true;
    }

    if (!fly.scored && fly.bounced && suspendPass(px, py, fly.x, fly.y, ring)) {
      modeState.hits += 1;
      modeState.ringVelocity += clamp(fly.vx * 0.22, -0.007, 0.007);
      fly.scored = true;
      modeState.fresh = fly.path;
      modeState.done.push(modeState.fresh);
      if (modeState.done.length > RING_KEEP) modeState.done.shift();
    }

    const gone = fly.x < -0.05 || fly.x > 1.05 || fly.y > 1.05;
    if (gone || fly.age > SUSP_FLIGHT) {
      if (fly.scored) {
        modeState.fly = null;
        modeState.rest = SUSP_REST;
      } else suspendMiss();
    }
  },

  draw() {
    const ring = suspendRing();
    const stem = suspendStem();
    const hits = modeState.hits;
    const misses = RING_LIVES - modeState.lives;
    const hitText = `${hits} ${plural(hits, 'попадание', 'попадания', 'попаданий')}`;
    const missText = `${misses} ${plural(misses, 'промах', 'промаха', 'промахов')}`;

    if (on('trace')) {
      for (const path of modeState.done) {
        if (path === modeState.fresh) continue;
        poly(path, ink(0.18), 0.018);
      }
    }

    line(SUSP_STEM_X, 0, stem.top.x, stem.top.y, ink(0.2), 0.002);
    line(stem.top.x, stem.top.y, stem.bottom.x, stem.bottom.y, INK, 0.018);
    line(SUSP_RING.x, 0, ring.x, ring.y - ring.ry, ink(0.2), 0.002);
    drawSuspendRing(ring, INK, 0.012);

    if (modeState.fresh && modeState.rest > 0) poly(modeState.fresh, INK, 0.018);

    if (modeState.fly) {
      if (modeState.fly.scored) poly(modeState.fly.path, INK, 0.018);
      else suspendTrail(modeState.fly.path, (fade) => ink(0.2 + fade * 0.65));
      dot(modeState.fly.x, modeState.fly.y, INK, 0.016);
    } else {
      dot(modeState.ball.x, modeState.ball.y, modeState.over ? ink(0.25) : INK, 0.022);
    }

    if (modeState.aim) {
      const dx = pointer.x - modeState.ball.x;
      const dy = pointer.y - modeState.ball.y;
      poly(suspendPreview(modeState.ball, dx, dy), ink(0.34), 0.0025);
    }

    drawSuspendForce();
    for (let i = 0; i < RING_LIVES; i += 1) {
      dot(0.94 - i * 0.028, 0.95, i < modeState.lives ? ink(0.55) : ink(0.14), 0.0085);
    }

    if (modeState.over) drawStatus(`${hitText} · партия окончена, R — заново`, true);
    else drawStatus(`${hitText} · ${missText}`);
  },
};

/* ---------- ножницы ---------- */

/* Узел — ось, ветви — лезвия, ствол — станина, на которой ось держится.
   Отсюда единственное свойство сцены: К видна только в рабочем растворе.
   Свёл лезвия — и буквы нет, осталась палка с усом; развёл — вернулась.

   Резать нечего, пока лента не подошла: полоса идёт сверху вниз и режется
   по линии оси. Метки на ней — это разметка кроя, и вся игра в том, чтобы
   свести лезвия ровно тогда, когда метка проходит ось. Что отрезал, то и
   стоит внизу: ряд обрезков — прямой отчёт о попаданиях, ровные одной
   высоты, промахи вразнобой. Красным метится точный рез. */

const SHEAR_X = 0.5;        // левый край ленты
const SHEAR_W = 0.1;        // ширина ленты
const SHEAR_TOP = -0.03;    // откуда лента выходит
const SHEAR_CLOSE = 0.05;   // раствор, на котором лезвия перекусывают ленту
const SHEAR_FLOOR = 0.93;   // пол, на котором копятся обрезки
const SHEAR_SLOT = 0.034;   // шаг обрезков в ряду
const SHEAR_FALL = 0.0006;  // тяжесть обрезка

function shearEdge() {
  return SHEAR_TOP + (modeState.paid - modeState.cutAt);
}

MODES.shears = {
  label: 'ножницы',
  note: 'Курсор держит верхнее лезвие, нижнее зеркалит его: раствор — это и есть угол ветвей К. Лента идёт сверху, ось режет её по метке. Своди лезвия вовремя — ровные обрезки встанут внизу одной высоты, точный рез отмечается красным.',
  cursor: 'ns-resize',
  tools: [
    { type: 'range', key: 'feed', label: 'подача', min: 0.05, max: 0.6, step: 0.01, value: 0.22 },
    { type: 'range', key: 'pitch', label: 'шаг кроя', min: 0.06, max: 0.3, step: 0.01, value: 0.16 },
    { type: 'toggle', key: 'marks', label: 'метки', value: true },
    { type: 'button', label: 'сбросить', action() { MODES.shears.setup(); } },
  ],

  setup() {
    modeState.open = K_SLOPE;
    modeState.paid = 0.55;
    modeState.cutAt = 0;
    modeState.closed = false;
    modeState.pieces = [];
    modeState.place = 0;
    modeState.cuts = 0;
    modeState.exact = 0;
  },

  step() {
    modeState.paid += num('feed') * STEP;

    /* Раствор идёт за курсором с инерцией: щелчок должен быть движением, а не
       мгновенной подменой угла. Без курсора ножницы стоят раскрытыми. */
    const aim = pointer.seen
      ? clamp(Math.atan2(K.node - pointer.y, pointer.x - K.stem), 0, K_SLOPE)
      : K_SLOPE;
    modeState.open = lerp(modeState.open, aim, 0.35);

    const shut = modeState.open < SHEAR_CLOSE;
    if (shut && !modeState.closed) {
      modeState.closed = true;
      const edge = shearEdge();
      if (edge > K.node + 0.01) {
        const pitch = num('pitch');
        const at = modeState.paid - (K.node - SHEAR_TOP);
        const off = Math.abs(at - Math.round(at / pitch) * pitch);
        const exact = off < pitch * 0.08;
        modeState.pieces.push({
          x: SHEAR_X + SHEAR_W / 2,
          y: K.node,
          vy: 0,
          len: edge - K.node,
          place: modeState.place,
          exact,
          rest: false,
        });
        modeState.place += 1;
        modeState.cuts += 1;
        if (exact) modeState.exact += 1;
        modeState.cutAt = at;
      }
    }
    if (!shut) modeState.closed = false;

    /* Обрезок падает и встаёт в ряд: длина видна высотой, ряд — отчётом. */
    for (const piece of modeState.pieces) {
      if (piece.rest) continue;
      piece.vy += SHEAR_FALL;
      piece.y += piece.vy;
      piece.x = lerp(piece.x, 0.1 + piece.place * SHEAR_SLOT, 0.08);
      if (piece.y + piece.len >= SHEAR_FLOOR) {
        piece.y = SHEAR_FLOOR - piece.len;
        piece.x = 0.1 + piece.place * SHEAR_SLOT;
        piece.rest = true;
      }
    }
    /* Ряд дошёл до края — самые старые обрезки уходят с кадра. */
    while (0.1 + modeState.place * SHEAR_SLOT > 0.94) {
      modeState.pieces.shift();
      for (const piece of modeState.pieces) {
        piece.place -= 1;
        if (piece.rest) piece.x = 0.1 + piece.place * SHEAR_SLOT;
      }
      modeState.place -= 1;
    }
  },

  draw() {
    const open = modeState.open;
    const edge = shearEdge();
    /* Не резать никто не мешает, и тогда лента свисает за кадр. Рисуется и
       размечается только видимая часть — иначе работа растёт со временем. */
    const seen = Math.min(edge, 1.04);

    /* Лента: сама полоса, поперечные метки кроя и линия оси, по которой режут. */
    ctx.fillStyle = ink(0.07);
    ctx.fillRect(SHEAR_X * S, SHEAR_TOP * S, SHEAR_W * S, (seen - SHEAR_TOP) * S);
    line(SHEAR_X, SHEAR_TOP, SHEAR_X, seen, ink(0.35), 0.002);
    line(SHEAR_X + SHEAR_W, SHEAR_TOP, SHEAR_X + SHEAR_W, seen, ink(0.35), 0.002);
    if (edge <= seen) line(SHEAR_X, edge, SHEAR_X + SHEAR_W, edge, ink(0.35), 0.002);

    if (on('marks')) {
      const pitch = num('pitch');
      /* Метки принадлежат материалу и едут вместе с ним. Чем больше координата
         метки, тем позже она вышла, то есть тем она выше: идём снизу вверх и
         выходим, когда метка ушла за верхний край. */
      const first = Math.ceil((modeState.paid - (seen - SHEAR_TOP)) / pitch) * pitch;
      for (let m = first; ; m += pitch) {
        const y = SHEAR_TOP + (modeState.paid - m);
        if (y < SHEAR_TOP) break;
        if (y > seen) continue;
        line(SHEAR_X, y, SHEAR_X + SHEAR_W, y, ink(0.3), 0.0018);
      }
    }

    /* Станина и лезвия: ствол стоит, ветви ходят вокруг узла. */
    line(K.stem, K.top, K.stem, K.bottom, ink(0.62), 0.015);
    const reach = K_REACH;
    line(K.stem, K.node, K.stem + Math.cos(open) * reach, K.node - Math.sin(open) * reach, INK, 0.018);
    line(K.stem, K.node, K.stem + Math.cos(open) * reach, K.node + Math.sin(open) * reach, INK, 0.018);
    dot(K.stem, K.node, ink(0.85), 0.011);

    for (const piece of modeState.pieces) {
      const tone = piece.exact ? RED : ink(0.5);
      ctx.fillStyle = ink(0.08);
      ctx.fillRect((piece.x - 0.014) * S, piece.y * S, 0.028 * S, piece.len * S);
      ctx.strokeStyle = tone;
      ctx.lineWidth = 0.002 * S;
      ctx.strokeRect((piece.x - 0.014) * S, piece.y * S, 0.028 * S, piece.len * S);
    }

    line(0.06, SHEAR_FLOOR, 0.96, SHEAR_FLOOR, ink(0.2), 0.002);
    drawStatus(`в метку ${modeState.exact} из ${modeState.cuts}`, modeState.cuts > 0 && modeState.exact === modeState.cuts);
  },
};

/* ---------- раскол ---------- */

/* Трещина идёт и в какой-то момент отдаёт вбок две ветви разом — одну вперёд,
   одну назад, симметрично относительно перпендикуляра. Это и есть К: пришедший
   штрих плюс два луча в одну сторону под равными углами. Дальше правило
   повторяется на каждой ветви, и в расколе оказывается столько К, сколько
   развилок он успел набрать, пока не выдохся.

   Первый удар сцена ставит на верх ствола, а расстояние до развилки по
   умолчанию равно расстоянию от верха до узла — поэтому нетронутый кадр
   показывает ровно одну К, а всё остальное вырастает из неё. */

const CRACK_SPEED = 0.0045;  // сколько трещина проходит за шаг
const CRACK_TIPS = 220;      // предел живых кончиков
const CRACK_PATHS = 260;     // предел сохранённых путей
const CRACK_DIM = 0.15;      // ниже этой энергии трещина встаёт
const CRACK_WEAR = 0.8;      // что остаётся у главной трещины после развилки

function crackTip(x, y, dir, energy, side, seed) {
  return { x, y, dir, energy, side, seed, run: 0, total: 0, path: [{ x, y }] };
}

function crackHit(x, y) {
  if (modeState.tips.length > CRACK_TIPS) return;
  modeState.tips.push(crackTip(x, y, Math.PI / 2, 1, 1, modeState.seed));
  modeState.seed += 1.7;
}

function crackRest(tip) {
  modeState.done.push({ path: tip.path, width: 0.0018 + tip.energy * 0.012 });
}

MODES.crack = {
  label: 'раскол',
  note: 'Клик — удар: от него вниз идёт трещина и на развилке отдаёт две ветви в одну сторону, то есть пишет К. Дальше правило повторяется, пока хватает энергии, и раскол оказывается набран из одних К. Раствор и расстояние до развилки заданы буквой, затухание решает, насколько глубоко это уходит.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'span', label: 'до развилки', min: 0.06, max: 0.35, step: 0.01, value: 0.3 },
    { type: 'range', key: 'half', label: 'раствор', min: 10, max: 70, step: 1, value: 40 },
    { type: 'range', key: 'decay', label: 'затухание', min: 0.3, max: 0.95, step: 0.01, value: 0.52 },
    { type: 'range', key: 'waver', label: 'виляние', min: 0, max: 1, step: 0.02, value: 0.15 },
    { type: 'toggle', key: 'flip', label: 'сторона по очереди', value: true },
    { type: 'button', label: 'чистый лист', action() { MODES.crack.setup(); } },
  ],

  setup() {
    modeState.tips = [];
    modeState.done = [];
    modeState.seed = 0.3;
    crackHit(K.stem, K.top);
  },

  onDown() {
    crackHit(pointer.x, pointer.y);
  },

  step() {
    const span = num('span');
    const half = (num('half') * Math.PI) / 180;
    const decay = num('decay');
    const waver = num('waver');
    const flip = on('flip');
    const born = [];

    for (let i = modeState.tips.length - 1; i >= 0; i -= 1) {
      const tip = modeState.tips[i];

      /* Виляние берётся синусами от пройденного пути: рисунок не повторяется,
         но и не меняется от кадра к кадру — снимок воспроизводим. */
      tip.dir += (Math.sin(tip.seed + tip.total * 41) + Math.sin(tip.seed * 2.3 + tip.total * 17) * 0.5)
        * waver * 0.03;
      tip.x += Math.cos(tip.dir) * CRACK_SPEED;
      tip.y += Math.sin(tip.dir) * CRACK_SPEED;
      tip.run += CRACK_SPEED;
      tip.total += CRACK_SPEED;
      tip.path.push({ x: tip.x, y: tip.y });

      const gone = tip.x < 0 || tip.x > 1 || tip.y < 0 || tip.y > 1;
      if (gone || tip.energy < CRACK_DIM) {
        crackRest(tip);
        modeState.tips.splice(i, 1);
        continue;
      }

      if (tip.run < span * tip.energy) continue;

      /* Развилка: главная идёт дальше, две боковые уходят от перпендикуляра
         на равные углы — вперёд и назад. Сторона по очереди, иначе раскол
         уползает в одну сторону и рисунок теряет букву. */
      tip.run = 0;
      const perp = tip.dir - (Math.PI / 2) * tip.side;
      /* Упёрлись в предел — раскол просто перестаёт ветвиться. Стирать
         старые пути нельзя: рисунок начал бы таять на глазах. */
      const spawn = modeState.tips.length + born.length < CRACK_TIPS
        && modeState.done.length < CRACK_PATHS;
      if (spawn) {
        const side = flip ? -tip.side : tip.side;
        born.push(crackTip(tip.x, tip.y, perp - half, tip.energy * decay, side, tip.seed + 3.1));
        born.push(crackTip(tip.x, tip.y, perp + half, tip.energy * decay, side, tip.seed + 5.7));
      }
      tip.energy *= CRACK_WEAR;
      if (flip) tip.side = -tip.side;
    }

    modeState.tips.push(...born);
  },

  draw() {
    for (const track of modeState.done) poly(track.path, INK, track.width);
    for (const tip of modeState.tips) poly(tip.path, INK, 0.0018 + tip.energy * 0.012);
    const count = modeState.done.length + modeState.tips.length;
    drawStatus(`${count} ${plural(count, 'трещина', 'трещины', 'трещин')}`);
  },
};

startLab({
  title: 'К · узел и два луча',
  modes: MODES,
  start: 'truss',
});
