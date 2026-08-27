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

const RING_HOLE = [0.04, 0.014];   // радиус кольца: первое попадание и предел
const RING_SWAY = 0.07;            // насколько кольцо качается на пределе
const RING_RATE = 0.011;           // и как быстро
const RING_RAMP = 22;              // за сколько попаданий сложность доходит до предела
const RING_PULL = 0.11;            // сколько скорости даёт доля тяги
const RING_REACH = 0.34;           // дальше тянуть некуда
const RING_KICK = 0.95;            // что остаётся от скорости после стены
const RING_LIVES = 3;
const RING_MULT = 8;               // выше этого множитель серии не растёт
const RING_TRAIL = 130;            // длина шлейфа в шагах
const RING_KEEP = 16;              // сколько написанных К держит поле
const RING_FLIGHT = 700;           // дольше этого полёт считается промахом
const RING_REST = 45;              // пауза показа: сколько кадров стоит результат

function ringRand(from, to) {
  return from + Math.random() * (to - from);
}

function ringHard() {
  return clamp(modeState.hits / RING_RAMP, 0, 1) * num('narrow');
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
  /* Качание входит квадратом: первые попадания кольцо почти стоит, и сложность
     сперва идёт от размера, то есть от точности броска, а не от тайминга. */
  const sway = t * t * RING_SWAY;
  const gravity = num('weight');

  for (let tries = 0; tries < 60; tries += 1) {
    const ball = { x: ringRand(0.58, 0.88), y: ringRand(0.74, 0.9) };
    const hoop = { x: ringRand(0.5, 0.85), y: ringRand(0.16, 0.4), r, sway };
    /* Кольцо должно стоять выше мяча и правее стены с запасом, иначе буквы
       не выйдет даже при точном броске. */
    if (hoop.y > ball.y - 0.3) continue;
    if (hoop.x < K.stem + 0.14) continue;
    const solved = ringSolve(ball, { ...hoop, y: hoop.y }, gravity);
    if (!solved) continue;
    modeState.ball = ball;
    modeState.hoop = hoop;
    modeState.solved = solved;
    modeState.phase = 0;
    return;
  }
  modeState.ball = { x: 0.72, y: 0.82 };
  modeState.hoop = { x: 0.66, y: 0.24, r, sway };
  modeState.solved = ringSolve(modeState.ball, modeState.hoop, gravity);
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
  modeState.streak = 0;
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
  note: 'Тяни от мяча и отпускай: тяга задаёт и угол, и силу. Мяч тяжёлый, летит дугой, и попасть в кольцо можно только отскоком от стены — такой путь и есть К. Уровень один и бесконечный: с каждым попаданием кольцо меньше и качается сильнее. Три промаха — конец, R — заново.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'weight', label: 'вес', min: 0.0001, max: 0.0012, step: 0.00005, value: 0.00045 },
    { type: 'range', key: 'narrow', label: 'сложность', min: 0, max: 1, step: 0.05, value: 1 },
    { type: 'toggle', key: 'hint', label: 'подсказка', value: false },
    { type: 'toggle', key: 'bush', label: 'куст', value: true },
    { type: 'button', label: 'заново', action() { MODES.ring.setup(); } },
  ],

  setup() {
    modeState.hits = 0;
    modeState.score = 0;
    modeState.streak = 0;
    modeState.lives = RING_LIVES;
    modeState.over = false;
    modeState.fly = null;
    modeState.aim = false;
    modeState.fresh = null;
    modeState.phase = 0;
    modeState.rest = 0;
    modeState.missed = null;
    modeState.done = [];
    ringDeal();
    /* Кадр не должен открываться пустым: одна К уже написана — путь найденного
       решения кладётся в куст напрямую, мимо счёта и жизней. */
    const shot = modeState.solved;
    if (shot) {
      const shown = ringShot(modeState.ball, modeState.hoop, shot.angle, shot.power, num('weight'));
      if (shown.hit) modeState.done.push(shown.path);
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
        const closeness = 1 - near / hoop.r;
        modeState.streak += 1;
        modeState.hits += 1;
        const mult = Math.min(modeState.streak, RING_MULT);
        modeState.score += Math.round(100 * mult * (0.6 + 0.4 * closeness));
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

    if (on('bush')) {
      for (const path of modeState.done) {
        const fresh = path === modeState.fresh;
        poly(path, fresh ? RED : ink(0.2), fresh ? 0.005 : 0.004);
      }
    }

    /* Стена целиком — ствол буквы, и отражает она вся. */
    line(K.stem, K.top, K.stem, K.bottom, ink(0.6), 0.017);

    ctx.beginPath();
    ctx.arc(hoop.x * S, hoop.y * S, hoop.r * S, 0, TAU);
    ctx.strokeStyle = ink(0.75);
    ctx.lineWidth = 0.005 * S;
    ctx.stroke();
    dot(hoop.x, hoop.y, ink(0.3), 0.004);

    /* Подсказка: найденное решение целиком, пунктиром. */
    if (on('hint') && modeState.solved && !modeState.fly) {
      const shot = modeState.solved;
      const shown = ringShot(ball, hoop, shot.angle, shot.power, num('weight'));
      ctx.setLineDash([0.01 * S, 0.014 * S]);
      poly(shown.path, ink(0.2), 0.0025);
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
      dot(0.94 - i * 0.028, 0.95, i < modeState.lives ? ink(0.55) : ink(0.14), 0.0075);
    }

    if (modeState.over) {
      drawStatus(`${modeState.score} · партия окончена, R — заново`, true);
    } else {
      drawStatus(`${modeState.score} · серия ${modeState.streak}`);
    }
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
