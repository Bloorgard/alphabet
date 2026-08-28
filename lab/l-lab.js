/* Л — две ноги и вершина.

   В Л нет ни одной замкнутой части и ни одной горизонтали: вертикаль справа,
   наклонная слева, вершина сверху. Всё, чем буква отличается от палки, —
   раствор между кончиками ног. Поэтому механики здесь крутят раствор, а не
   контур: буква не нарисована поверх сцены, а получена из её устройства.

   Пять подходов:

     корень     вершина как развилка: справа стержень идёт своим курсом,
                слева отходит боковой, и каждая нога кончается новой Л
     циркуль    Л как измеритель с неравными плечами: шагает через ногу,
                считает строку растворами и оставляет цепочку арок
     стремянка  наклонная — лестница, вертикальная — подпорка; узко поставил —
                валится, широко — разъезжается и не достаёт
     ходьба     две клавиши на две ноги: буква видна только в тот миг, когда
                обе стоят на земле в читаемом растворе
     откос      песок ложится под своим углом и упирается в опалубку;
                буква не нарисована, а насыпана

   Красный обозначает событие, у каждой механики своё: вырождение, остаток
   меньше раствора, поехавшая нога, шпагат, осыпание. */

const TAU = Math.PI * 2;

/* Строка: базовая линия и рост буквы. От них считают все механики. */
const GROUND = 0.78;
const RISE = 0.30;
const STEM = 0.018;

function plural(n, one, few, many) {
  const ten = n % 10;
  const hundred = n % 100;
  if (hundred >= 11 && hundred <= 14) return many;
  if (ten === 1) return one;
  if (ten >= 2 && ten <= 4) return few;
  return many;
}

function count(n, ...forms) { return `${n} ${plural(n, ...forms)}`; }

/* Две ноги из вершины — весь запас формы. Кто где стоит, решает механика. */
function legs(ax, ay, x1, y1, x2, y2, alpha = 1, width = STEM) {
  const color = ink(alpha);
  line(ax, ay, x1, y1, color, width);
  line(ax, ay, x2, y2, color, width);
}

function baseline(y = GROUND, alpha = 0.22) {
  line(0.04, y, 0.96, y, ink(alpha), 0.002);
}

const MODES = {};

/* ---------- корень ---------- */

/* Вершина Л — единственная в алфавите чистая развилка: один штрих входит,
   два выходят. Если каждую ногу считать новым стволом, буква размножается
   вниз и вырастает в корень. Стержень наследует курс родителя, боковой
   отходит на угол — так ветвится настоящий корень, и так же держится
   асимметрия Л: справа прямо, слева в сторону. */

const CROWN = { x: 0.76, y: 0.13 };

MODES.root = {
  label: 'корень',
  note: 'Тяни за левую ногу — меняются отвод и длина первого поколения; сколько их и как быстро укорачиваются, на ползунках. Красная точка — конец, ставший короче собственной толщины: дальше буква вырождается в штрих.',
  cursor: 'grab',
  tools: [
    { type: 'range', key: 'gen', label: 'поколения', min: 1, max: 11, step: 1, value: 8 },
    { type: 'range', key: 'keep', label: 'укорочение', min: 0.5, max: 0.88, step: 0.01, value: 0.7 },
    { type: 'range', key: 'thin', label: 'утончение', min: 0.55, max: 1, step: 0.01, value: 0.78 },
    { type: 'toggle', key: 'first', label: 'первая Л', value: true },
  ],

  setup() {
    modeState.lean = 0.6;
    modeState.len = 0.19;
  },

  onDown() { this.onMove(); },

  onMove() {
    if (!pointer.down) return;
    const dx = pointer.x - CROWN.x;
    const dy = pointer.y - CROWN.y;
    if (dy <= 0.02) return;
    modeState.len = clamp(Math.hypot(dx, dy), 0.06, 0.34);
    modeState.lean = clamp(Math.atan2(-dx, dy), 0.05, 1.4);
  },

  draw() {
    const gen = num('gen');
    const keep = num('keep');
    const thin = num('thin');
    const lean = modeState.lean;
    let dead = 0;

    const grow = (x, y, dir, len, width, depth) => {
      /* Ветвь короче собственной толщины — уже не буква, а клякса.
         Рекурсия кончается здесь, а не на счётчике поколений. */
      if (len < width * 2.2) { dot(x, y, RED, 0.004); dead += 1; return; }

      const rx = x + Math.sin(dir) * len;
      const ry = y + Math.cos(dir) * len;
      const side = dir - lean;
      const lx = x + Math.sin(side) * len;
      const ly = y + Math.cos(side) * len;
      legs(x, y, lx, ly, rx, ry, 1, width);

      if (depth >= gen) return;
      grow(rx, ry, dir, len * keep, width * thin, depth + 1);
      grow(lx, ly, side, len * keep, width * thin, depth + 1);
    };

    grow(CROWN.x, CROWN.y, 0, modeState.len, STEM, 1);

    /* Первое поколение поверх гущи: иначе буква тонет в собственном потомстве. */
    if (on('first')) {
      const len = modeState.len;
      legs(
        CROWN.x, CROWN.y,
        CROWN.x - Math.sin(lean) * len, CROWN.y + Math.cos(lean) * len,
        CROWN.x, CROWN.y + len,
        1, STEM * 1.4,
      );
    }

    drawStatus(dead ? count(dead, 'вырождение', 'вырождения', 'вырождений') : '', dead > 0);
  },
};

/* ---------- циркуль ---------- */

/* Измерительный циркуль шагает через ногу: опорная стоит, вторая проносится
   вперёд и встаёт на раствор дальше. У Л плечи неравные — правое вертикальное,
   левое длиннее, — и это не помеха, а редукционный циркуль: вершина всегда
   над передней ногой, поэтому по ходу буква зеркалится вместе с направлением.
   Строку он не рисует, а меряет, и остаток короче раствора взять не может. */

function paceGround(x) {
  return GROUND + num('relief') * 0.045 * Math.sin(x * 7.5 + 1.2);
}

MODES.divider = {
  label: 'циркуль',
  note: 'Веди курсор — циркуль шагает к нему через ногу и считает путь растворами. Арки за ним — след кончика, та самая строчная цепочка из «л». Красным — хвост короче раствора: его циркулем не взять, и в этом весь смысл мерки.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'span', label: 'раствор', min: 0.05, max: 0.2, step: 0.005, value: 0.11 },
    { type: 'range', key: 'pace', label: 'темп', min: 0.6, max: 4, step: 0.1, value: 2 },
    { type: 'range', key: 'relief', label: 'рельеф', min: 0, max: 1, step: 0.05, value: 0 },
    { type: 'toggle', key: 'trail', label: 'след', value: true },
    { type: 'button', label: 'заново', action: () => MODES.divider.setup() },
  ],

  setup() {
    modeState.feet = [0.25 - num('span'), 0.25];
    modeState.front = 1;
    modeState.t = null;
    modeState.from = 0;
    modeState.to = 0;
    modeState.arcs = [];
    modeState.paces = 0;
  },

  step() {
    const span = num('span');
    const front = modeState.feet[modeState.front];
    const target = pointer.seen ? clamp(pointer.x, 0.06, 0.94) : 0.9;

    if (modeState.t === null) {
      const gap = target - front;
      if (Math.abs(gap) < span) return;
      const dir = Math.sign(gap);
      const back = 1 - modeState.front;
      modeState.from = modeState.feet[back];
      modeState.to = clamp(front + dir * span, 0.04, 0.96);
      modeState.t = 0;
      return;
    }

    modeState.t += STEP * num('pace');
    if (modeState.t < 1) return;

    const back = 1 - modeState.front;
    modeState.feet[back] = modeState.to;
    modeState.front = back;
    modeState.t = null;
    modeState.paces += 1;
    modeState.arcs.push({ from: modeState.from, to: modeState.to });
    if (modeState.arcs.length > 160) modeState.arcs.shift();
  },

  draw() {
    const span = num('span');
    const lift = span * 0.85;

    ctx.beginPath();
    ctx.moveTo(0.04 * S, paceGround(0.04) * S);
    for (let x = 0.06; x <= 0.96; x += 0.02) ctx.lineTo(x * S, paceGround(x) * S);
    ctx.strokeStyle = ink(0.2);
    ctx.lineWidth = 0.002 * S;
    ctx.stroke();

    if (on('trail')) {
      for (const arc of modeState.arcs) arch(arc.from, arc.to, lift, 0.26);
    }

    const t = modeState.t;
    const eased = t === null ? 0 : t * t * (3 - 2 * t);
    const stance = modeState.feet[modeState.front];
    const swing = t === null
      ? modeState.feet[1 - modeState.front]
      : lerp(modeState.from, modeState.to, eased);
    const swingY = paceGround(swing) - (t === null ? 0 : Math.sin(Math.PI * eased) * lift);

    /* Вершина едет к новой передней ноге весь шаг — иначе она прыгала бы
       в тот кадр, когда ноги меняются ролями. */
    const apexX = t === null ? stance : lerp(stance, modeState.to, eased);
    const apexY = paceGround(apexX) - RISE;
    legs(apexX, apexY, swing, swingY, stance, paceGround(stance));

    if (t === null && on('trail')) arch(modeState.from, modeState.to, lift, 0.26);

    /* Остаток, не кратный раствору, циркуль не берёт. */
    const target = pointer.seen ? clamp(pointer.x, 0.06, 0.94) : 0.9;
    const rest = target - stance;
    if (t === null && Math.abs(rest) > 0.004) {
      line(stance, paceGround(stance), target, paceGround(target), RED, 0.006);
    }

    drawStatus(count(modeState.paces, 'раствор', 'раствора', 'растворов'));
  },
};

/* Одним путём, а не цепочкой отрезков: у полупрозрачного следа стыки
   с круглыми концами наложились бы и дали зерно вместо линии. */
function arch(from, to, lift, alpha) {
  const steps = 20;
  ctx.beginPath();
  ctx.moveTo(from * S, paceGround(from) * S);
  for (let i = 1; i <= steps; i += 1) {
    const u = i / steps;
    const x = lerp(from, to, u);
    ctx.lineTo(x * S, (paceGround(x) - Math.sin(Math.PI * u) * lift) * S);
  }
  ctx.strokeStyle = ink(alpha);
  ctx.lineWidth = 0.004 * S;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/* ---------- стремянка ---------- */

/* Настоящая стремянка — это Л: лестничная сторона наклонная, подпорка прямая.
   Ноги одной длины не бывают: вертикальная равна высоте, наклонная — гипотенузе,
   поэтому раствор и рост связаны намертво. Отсюда игра: широкий раствор роняет
   вершину и разводит ноги распором, узкий поднимает вершину, но отнимает опору,
   и наверху качает тем сильнее, чем выше залез. */

const REACH = 0.07;
const LEG = 0.46;

MODES.ladder = {
  label: 'стремянка',
  note: 'Води курсор — стремянка идёт за ним, раствор на ползунке. Нажми и держи — лезешь; на верхней ступени рука достаёт до цели. Широко расставил — поедет по полу, узко — не устоишь: наверху качает. Красным — нога, которая пошла.',
  cursor: 'pointer',
  tools: [
    { type: 'range', key: 'span', label: 'раствор', min: 0.04, max: 0.3, step: 0.005, value: 0.16 },
    { type: 'range', key: 'grip', label: 'трение', min: 0.15, max: 0.7, step: 0.01, value: 0.4 },
    { type: 'button', label: 'заново', action: () => MODES.ladder.setup() },
  ],

  setup() {
    modeState.base = 0.5;
    modeState.span = num('span');
    modeState.climb = 0;
    modeState.sway = 0;
    modeState.swayV = 0;
    modeState.slip = 0;
    modeState.fall = 0;
    modeState.kind = '';
    modeState.gust = 0;
    modeState.taken = 0;
    modeState.goal = { x: 0.5, y: GROUND - 0.32 };
  },

  step() {
    if (modeState.fall > 0) {
      modeState.fall -= STEP;
      modeState.span += STEP * 0.5;
      if (modeState.fall <= 0) {
        modeState.climb = 0;
        modeState.sway = 0;
        modeState.swayV = 0;
        modeState.slip = 0;
        modeState.span = num('span');
      }
      return;
    }

    const climbing = pointer.down;
    if (!climbing && modeState.climb <= 0.001) {
      modeState.base = clamp(pointer.seen ? pointer.x : 0.5, 0.12, 0.94);
      modeState.span = num('span');
    }

    modeState.climb = clamp(modeState.climb + (climbing ? STEP * 0.7 : -STEP * 1.6), 0, 1);

    const span = modeState.span;
    const height = ladderHeight(span);

    /* Распор: чем шире ноги и чем выше груз, тем сильнее их разводит. */
    const thrust = (span / Math.max(height, 0.02)) * (0.35 + 0.65 * modeState.climb);
    const excess = thrust - num('grip');
    if (excess > 0) {
      modeState.slip = excess;
      modeState.span = clamp(span + excess * STEP * 1.6, 0.04, 0.5);
    } else {
      modeState.slip = Math.max(0, modeState.slip - STEP * 2);
    }

    /* Качание: белый шум на каждом кадре усреднился бы в ноль, поэтому ведёт
       медленный порыв, а обратно тянет пружина. Опора — ширина раствора:
       вышел за половину, и стремянка заваливается. */
    const shake = modeState.climb * (height / LEG);
    modeState.gust = modeState.gust * 0.96 + (Math.random() - 0.5) * 0.5;
    modeState.swayV += modeState.gust * shake * STEP * 2.6;
    modeState.swayV -= modeState.sway * STEP * 22;
    modeState.swayV *= 0.985;
    modeState.sway += modeState.swayV * STEP;

    if (Math.abs(modeState.sway) > span / 2 || modeState.span > 0.42) {
      modeState.fall = 1;
      modeState.kind = modeState.span > 0.42 ? 'поехала' : 'завалилась';
      return;
    }

    /* Тянутся рукой с той ступени, до которой долезли, а не только с верхней:
       низкую цель берут снизу, за высокой лезут туда, где качает. */
    if (modeState.climb > 0.05) {
      const hand = Math.hypot(
        handX(modeState.base, span, modeState.sway, modeState.climb) - modeState.goal.x,
        handY(height, modeState.climb) - modeState.goal.y,
      );
      if (hand < REACH) {
        modeState.taken += 1;
        modeState.climb = 0;
        modeState.goal = {
          x: clamp(0.2 + Math.random() * 0.6, 0.15, 0.85),
          y: GROUND - clamp(0.3 + modeState.taken * 0.025, 0, 0.62),
        };
      }
    }
  },

  onUp() { /* подъём кончается сам, отпускание читается в step */ },

  draw() {
    baseline();

    const span = modeState.span;
    const height = ladderHeight(span);
    const base = modeState.base;
    const tilt = modeState.fall > 0 ? 0 : modeState.sway;
    const apexX = base + tilt;
    const apexY = GROUND - height;
    const hot = modeState.slip > 0 || modeState.fall > 0;

    dot(modeState.goal.x, modeState.goal.y, ink(0.9), 0.008);
    ctx.beginPath();
    ctx.arc(modeState.goal.x * S, modeState.goal.y * S, REACH * S, 0, TAU);
    ctx.strokeStyle = ink(0.14);
    ctx.lineWidth = 0.002 * S;
    ctx.stroke();

    /* Ступени только на наклонной стороне: вторая нога — подпорка, а не лестница. */
    const steps = 6;
    for (let i = 1; i < steps; i += 1) {
      const u = i / steps;
      const x = lerp(base - span, apexX, u);
      const y = lerp(GROUND, apexY, u);
      line(x - 0.022, y, x + 0.022, y, ink(0.34), 0.004);
    }

    legs(apexX, apexY, base - span, GROUND, base, GROUND, 1, STEM);
    if (hot) {
      line(base - span, GROUND, base - span + 0.03, GROUND, RED, 0.008);
      line(base, GROUND, base - 0.03, GROUND, RED, 0.008);
    }

    if (modeState.climb > 0.02) {
      dot(handX(base, span, tilt, modeState.climb), handY(height, modeState.climb), ink(0.9), 0.011);
    }

    drawStatus(
      modeState.fall > 0 ? modeState.kind : count(modeState.taken, 'цель', 'цели', 'целей'),
      modeState.fall > 0,
    );
  },
};

/* Вертикальная нога равна росту, наклонная — постоянной длины: раздвинул шире,
   вершина села ниже. Это и есть весь торг стремянки. */
function ladderHeight(span) {
  return Math.sqrt(Math.max(0.0004, LEG * LEG - span * span));
}

/* Рука там, где стоят ноги: доля подъёма по наклонной, чуть выше ступени. */
function handX(base, span, tilt, climb) {
  return lerp(base - span, base + tilt, climb);
}

function handY(height, climb) {
  return lerp(GROUND, GROUND - height, climb) - 0.03;
}

/* ---------- ходьба ---------- */

/* Буква стоит на двух ногах — значит она есть только в двойной опоре. Стоит
   перенести ногу, и на экране палка. Отсюда счёт: каждый шаг, попавший в
   читаемый раствор, впечатывает Л в строку, а шаркающий и разъехавшийся не
   печатают ничего. Ходьбой пишут — потому стоять на месте и незачем. */

const WALK = { keep: 0.09, wide: 0.24 };

MODES.walk = {
  label: 'ходьба',
  note: 'Стрелки ← и → — левая и правая нога (мышью: клик по своей половине кадра). Держишь — нога уносится вперёд, отпустил — встаёт. Шаг, попавший между засечками, впечатывает Л в строку; короткий шаркает впустую, длинный уходит в шпагат — он красный. Ноги надо чередовать.',
  cursor: 'pointer',
  tools: [
    { type: 'range', key: 'speed', label: 'вынос', min: 0.1, max: 0.6, step: 0.01, value: 0.3 },
    { type: 'range', key: 'split', label: 'шпагат', min: 0.2, max: 0.5, step: 0.01, value: 0.32 },
    { type: 'toggle', key: 'ruler', label: 'линейка', value: true },
    { type: 'button', label: 'заново', action: () => MODES.walk.setup() },
  ],

  setup() {
    modeState.feet = [0.36, 0.5];
    modeState.swing = null;
    modeState.to = 0;
    modeState.held = false;
    modeState.drop = 0;
    modeState.fall = 0;
    modeState.prints = [];
    modeState.start = 0.5;
  },

  step() {
    if (modeState.fall > 0) {
      modeState.fall -= STEP;
      modeState.feet[0] -= STEP * 0.25;
      modeState.feet[1] += STEP * 0.25;
      if (modeState.fall <= 0) {
        const front = Math.max(...modeState.feet);
        modeState.feet = [front - 0.14, front];
        modeState.swing = null;
      }
      return;
    }

    if (modeState.swing === null) return;

    if (modeState.held) {
      /* Пока нога идёт к опорной, она проносится под корпусом и в шаг не
         считается: вперёд её уводит только то, что держат сверх этого. */
      const stance = modeState.feet[1 - modeState.swing];
      const carry = modeState.to < stance ? 3 : 1;
      modeState.to += STEP * num('speed') * carry;
      return;
    }

    modeState.drop += STEP * 7;
    if (modeState.drop < 1) return;

    const side = modeState.swing;
    const stance = modeState.feet[1 - side];
    const spread = Math.abs(modeState.to - stance);
    modeState.feet[side] = modeState.to;
    modeState.swing = null;
    modeState.drop = 0;

    if (spread > num('split')) {
      modeState.fall = 1.1;
      return;
    }
    if (spread >= WALK.keep && spread <= WALK.wide) {
      modeState.prints.push({ x: Math.max(modeState.to, stance), spread });
      if (modeState.prints.length > 80) modeState.prints.shift();
    }
  },

  press(side) {
    if (modeState.fall > 0 || modeState.swing !== null) return;
    modeState.swing = side;
    modeState.to = modeState.feet[side];
    modeState.held = true;
    modeState.drop = 0;
  },

  onKey(event, down) {
    const side = event.code === 'ArrowLeft' ? 0 : event.code === 'ArrowRight' ? 1 : null;
    if (side === null) return;
    event.preventDefault();
    if (down) this.press(side);
    else if (modeState.swing === side) modeState.held = false;
  },

  onDown() { this.press(pointer.x < 0.5 ? 0 : 1); },

  onUp() { modeState.held = false; },

  draw() {
    const front = Math.max(...modeState.feet);
    const camera = front - 0.5;
    const at = (x) => x - camera;

    baseline();
    if (on('ruler')) {
      const first = Math.ceil((camera + 0.04) / 0.1) * 0.1;
      for (let x = first; x < camera + 0.96; x += 0.1) {
        line(at(x), GROUND, at(x), GROUND + 0.018, ink(0.24), 0.002);
      }
    }

    for (const print of modeState.prints) {
      legs(
        at(print.x), GROUND - RISE,
        at(print.x - print.spread), GROUND,
        at(print.x), GROUND,
        0.24, STEM * 0.7,
      );
    }

    const side = modeState.swing;
    const feet = [...modeState.feet];
    let lift = 0;
    if (side !== null) {
      feet[side] = modeState.to;
      lift = modeState.held ? 0.05 : 0.05 * (1 - modeState.drop);
    }

    /* Окно читаемого раствора показано на земле: без него игра была бы
       угадыванием, а не расчётом. */
    if (side !== null) {
      const stance = modeState.feet[1 - side];
      const dir = modeState.to >= stance ? 1 : -1;
      line(at(stance + dir * WALK.keep), GROUND, at(stance + dir * WALK.wide), GROUND, ink(0.3), 0.006);
    }

    const spread = Math.abs(feet[0] - feet[1]);
    const reads = side === null && spread >= WALK.keep && spread <= WALK.wide;
    const apexX = Math.max(feet[0], feet[1]);
    const apexY = GROUND - RISE + (modeState.fall > 0 ? 0.06 * (1.1 - modeState.fall) : 0);
    const wide = modeState.fall > 0;

    legs(
      at(apexX), apexY,
      at(feet[0]), GROUND - (side === 0 ? lift : 0),
      at(feet[1]), GROUND - (side === 1 ? lift : 0),
      reads ? 1 : 0.42,
      reads ? STEM : STEM * 0.8,
    );

    if (wide) {
      line(at(feet[0]), GROUND, at(feet[1]), GROUND, RED, 0.005);
    }

    const gone = (front - modeState.start) / RISE;
    drawStatus(
      wide ? 'шпагат' : `${count(modeState.prints.length, 'буква', 'буквы', 'букв')} · ${gone.toFixed(1)} роста`,
      wide,
    );
  },
};

/* ---------- откос ---------- */

/* Сыпучее ложится под собственным углом: перепад между соседями больше
   критического — верх съезжает вниз. Слева получается прямой откос, справа
   его держит опалубка, и вместе это Л. Убери опалубку — песок расплывётся
   в симметричную кучу, и станет видно, что вертикаль справа букве необходима. */

const CELLS = 150;
const WALL = Math.round(CELLS * 0.62);

MODES.slope = {
  label: 'откос',
  note: 'Сыпь курсором. Песок ложится под углом с ползунка — это и есть наклонная нога. Опалубка справа держит вертикаль; сними её, и Л расплывётся в кучу. Красным — клетки, осыпающиеся прямо сейчас.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'angle', label: 'откос', min: 20, max: 60, step: 1, value: 40 },
    { type: 'range', key: 'rate', label: 'струя', min: 0.1, max: 1.2, step: 0.05, value: 0.5 },
    { type: 'toggle', key: 'form', label: 'опалубка', value: true },
    { type: 'toggle', key: 'pour', label: 'сама сыплет', value: false },
    { type: 'button', label: 'смести', action: () => MODES.slope.setup() },
  ],

  setup() {
    modeState.h = new Float32Array(CELLS);
    modeState.hot = new Float32Array(CELLS);
    modeState.moved = 0;
  },

  step() {
    const h = modeState.h;
    const hot = modeState.hot;
    const dx = 1 / CELLS;
    const drop = Math.tan((num('angle') * Math.PI) / 180) * dx;
    const wall = on('form');

    if (pointer.down || on('pour')) {
      const x = on('pour') && !pointer.down ? (WALL - 6) / CELLS : pointer.x;
      const i = clamp(Math.round(x * CELLS), 1, CELLS - 2);
      const add = num('rate') * STEP;
      h[i] += add * 0.6;
      h[i - 1] += add * 0.2;
      h[i + 1] += add * 0.2;
    }

    modeState.moved = 0;
    for (let pass = 0; pass < 4; pass += 1) {
      for (let i = 0; i < CELLS - 1; i += 1) {
        /* Опалубка держит песок ровно до своего верха: выше — перелив через
           край, и куча останавливается готовой Л, а не растёт без края. */
        if (wall && i + 1 === WALL && h[i] <= RISE) continue;
        const diff = h[i] - h[i + 1];
        if (Math.abs(diff) <= drop) continue;
        const move = (Math.abs(diff) - drop) * 0.5;
        const from = diff > 0 ? i : i + 1;
        const to = diff > 0 ? i + 1 : i;
        h[from] -= move;
        h[to] += move;
        /* Склон под критическим углом весь дрожит по чуть-чуть; красное —
           только там, где сорвался заметный кусок. */
        if (move > drop * 0.3) hot[from] = 1;
        modeState.moved += move;
      }
    }

    /* За опалубкой не насыпь, а сток: иначе перелив копится с той стороны,
       куча становится симметричной горой и вертикаль тонет в ней. */
    if (wall) for (let i = WALL; i < CELLS; i += 1) h[i] = 0;

    for (let i = 0; i < CELLS; i += 1) hot[i] = Math.max(0, hot[i] - STEP * 3);
  },

  draw() {
    baseline();
    const h = modeState.h;
    const hot = modeState.hot;

    ctx.beginPath();
    ctx.moveTo(0, GROUND * S);
    for (let i = 0; i < CELLS; i += 1) {
      ctx.lineTo(((i + 0.5) / CELLS) * S, (GROUND - h[i]) * S);
    }
    ctx.lineTo(S, GROUND * S);
    ctx.closePath();
    ctx.fillStyle = ink(0.12);
    ctx.fill();

    /* Масса лежит бледно, а поверхность идёт штрихом: буква живёт по кромке,
       а не в заливке, иначе Л тонет в чернильном треугольнике. */
    for (let i = 1; i < CELLS; i += 1) {
      if (h[i - 1] < 0.002 && h[i] < 0.002) continue;
      line((i - 0.5) / CELLS, GROUND - h[i - 1], (i + 0.5) / CELLS, GROUND - h[i], INK, STEM * 0.9);
    }

    for (let i = 0; i < CELLS; i += 1) {
      if (hot[i] > 0.4 && h[i] > 0.004) dot((i + 0.5) / CELLS, GROUND - h[i], RED, 0.005);
    }

    if (on('form')) {
      const x = WALL / CELLS;
      line(x, GROUND, x, GROUND - Math.max(RISE, h[WALL - 1] + 0.03), INK, STEM);
    }

    const alive = modeState.moved > 0.0006;
    drawStatus(alive ? 'осыпается' : `откос ${num('angle')}°`, alive);
  },
};

startLab({
  title: 'Л · две ноги',
  modes: MODES,
  start: 'root',
});
