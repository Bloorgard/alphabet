/* К — подвес.

   Стойка висит на нити, кольцо висит на своей. Мяч тяжёлый, летит дугой и
   засчитывается только после удара о стойку: без отскока попадания нет, а
   значит нет и буквы. Стойка — ствол К, дуга до удара и дуга после — её
   ветви, и написанная буква проступает чернилами по следу мяча.

   Удар не бесплатен для стойки. Она принимает импульс с учётом своей массы
   и момента инерции, поэтому после каждого броска висит уже иначе: качается
   вбок и поворачивается. Следующий бросок начинается в изменившейся
   геометрии — это и есть сложность, растущая сама, без уровней и таблиц.
   Кольцо от касаний тоже раскачивается, а вращаясь вокруг нити, показывает
   то полный круг, то узкую щель: попасть в него можно не всегда.

   Красный тут событие и только оно: свежая К, пока она пишется. Полоса силы
   удара служебная и живёт в чернилах — постоянный индикатор краски не
   заслуживает.

   Результат партии уходит в копилку холста Я: сервер сам решит, улучшен ли
   рекорд и сдвинулось ли место в топе. Не отправилось — партия не заметит. */

import { reportScore } from '../progress.js?v=1';

const STEP = 1 / 60;
const INK = '#f1ede5';
const RED = '#e0210f';

const STEM_X = 0.34;
const STEM_TOP = 0.2;
const STEM_BOTTOM = 0.8;
const RING_HOME = { x: 0.72, y: STEM_TOP + 0.062 };
const RING_SWAY = 0.06;
const STEM_SWAY = 0.055;
const BALL_HOME = { x: 0.72, y: STEM_BOTTOM };
const BALL_LAYOUTS = [
  { x: 0.66, y: 0.76 },
  { x: 0.79, y: 0.82 },
  { x: 0.84, y: 0.74 },
  { x: 0.63, y: 0.85 },
  { x: 0.75, y: 0.88 },
  { x: 0.86, y: 0.8 },
  { x: 0.69, y: 0.72 },
  { x: 0.81, y: 0.87 },
];

/* Кольцо ужимается с каждым попаданием: сложность растёт из результата, а не
   из уровней. К двенадцатому попаданию оно почти вдвое меньше стартового и
   крутится заметно быстрее; дальше не ужимается — предел взят по нижней
   границе ручки, на которой в полигоне играть ещё можно. */
const RING_START = 0.0625;
const RING_TIGHT = 0.034;
const SPIN_START = 0.8;
const SPIN_FAST = 1.25;
const RAMP = 12;

const PULL = 0.11;          // сколько скорости даёт доля тяги
const REACH = 0.34;         // дальше тянуть некуда
const KICK = 0.95;          // что остаётся от скорости после стойки
const STEM_MASS = 12;
const STEM_INERTIA = 2.4;
const INK_RATE = 0.055;     // как быстро пишется чернильная К
const FLIGHT = 700;         // дольше этого полёт считается промахом
const REST = 35;            // пауза показа после попадания
const TRAIL = 42;           // длина шлейфа в шагах
const KEEP = 12;            // сколько написанных К держит поле
const LIVES = 3;

const PARAMS = {
  weight: 0.00045,
  stemWeight: 1,
  radius: RING_START,
  spin: SPIN_START,
  trace: true,
};

const CONTROLS = [
  ['weight', 'вес мяча', 0.0001, 0.0012, 0.00005],
  ['stemWeight', 'вес стойки', 0.5, 2.5, 0.1],
  ['radius', 'кольцо', 0.035, 0.085, 0.0025],
  ['spin', 'вращение', 0.2, 1.4, 0.05],
];

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function plural(count) {
  const tens = count % 100;
  if (tens > 10 && tens < 20) return 'попаданий';
  const unit = count % 10;
  if (unit === 1) return 'попадание';
  if (unit >= 2 && unit <= 4) return 'попадания';
  return 'попаданий';
}

/* Ближайшее расстояние от отрезка до точки: на скорости мяч проскакивает
   и кольцо, и нить между кадрами, поэтому проверять одну точку мало. */
function segmentNear(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? clamp(((cx - ax) * dx + (cy - ay) * dy) / len2, 0, 1) : 0;
  return Math.hypot(ax + dx * t - cx, ay + dy * t - cy);
}

export function mountK(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { ...PARAMS };
  const state = { play: true };
  let W = 1;
  let H = 1;
  let S = 1;
  let ox = 0;
  let oy = 0;
  let frameId = 0;
  let last = performance.now();
  let debt = 0;
  let sent = false;
  const pointer = { x: 0.5, y: 0.5, down: false };

  function ink(alpha) {
    return `rgba(241, 237, 229, ${alpha})`;
  }

  function point(x, y) {
    return { x: ox + x * S, y: oy + y * S };
  }

  function line(x1, y1, x2, y2, color, width) {
    const a = point(x1, y1);
    const b = point(x2, y2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * S;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function dot(x, y, color, radius) {
    const at = point(x, y);
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius * S, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function poly(path, color, width) {
    if (path.length < 2) return;
    ctx.beginPath();
    const first = point(path[0].x, path[0].y);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < path.length; i += 1) {
      const next = point(path[i].x, path[i].y);
      ctx.lineTo(next.x, next.y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width * S;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  /* ---------- стойка ---------- */

  /* Стойка подвешена за верх: смещение уводит точку подвеса по дуге нити,
     угол поворачивает саму планку вокруг этой точки. */
  function stemAt(angle = state.stemAngle, offset = state.stemOffset) {
    const length = STEM_BOTTOM - STEM_TOP;
    const top = {
      x: STEM_X + offset,
      y: Math.sqrt(Math.max(0, STEM_TOP * STEM_TOP - offset * offset)),
    };
    return {
      top,
      bottom: { x: top.x + Math.sin(angle) * length, y: top.y + Math.cos(angle) * length },
    };
  }

  function stemXAt(y, angle = state.stemAngle, offset = state.stemOffset) {
    const top = stemAt(angle, offset).top;
    return top.x + Math.tan(angle) * (y - top.y);
  }

  /* Стойка за кадр успевает сдвинуться, поэтому пересечение ищется по
     движущейся планке: половинным делением между её положениями. */
  function stemCrossing(ax, ay, bx, by, angleBefore, angleAfter, offsetBefore, offsetAfter) {
    function sample(t) {
      const angle = lerp(angleBefore, angleAfter, t);
      const offset = lerp(offsetBefore, offsetAfter, t);
      const y = lerp(ay, by, t);
      const x = lerp(ax, bx, t);
      return { angle, offset, y, x, gap: x - stemXAt(y, angle, offset) };
    }

    const start = sample(0);
    const end = sample(1);
    if (start.gap * end.gap > 0) return null;

    let lowT = 0;
    let highT = 1;
    let lowGap = start.gap;
    for (let i = 0; i < 9; i += 1) {
      const t = (lowT + highT) / 2;
      const probe = sample(t);
      if (lowGap * probe.gap <= 0) highT = t;
      else {
        lowT = t;
        lowGap = probe.gap;
      }
    }
    const hit = sample(highT);
    const stem = stemAt(hit.angle, hit.offset);
    if (hit.y < stem.top.y || hit.y > stem.bottom.y) return null;
    return {
      x: stemXAt(hit.y, hit.angle, hit.offset),
      y: hit.y,
      angle: hit.angle,
      offset: hit.offset,
      side: Math.sign(start.gap) || 1,
    };
  }

  /* ---------- кольцо ---------- */

  /* Кольцо вращается вокруг своей нити, поэтому в кадре оно эллипс: то полный
     круг, то щель. Сплющенное кольцо поймать почти нельзя — это и есть его
     собственный ритм, добавленный к качанию стойки. */
  function ringAt() {
    const offset = state.ringOffset;
    const radius = ringRadius();
    const attachY = Math.sqrt(Math.max(0, STEM_TOP * STEM_TOP - offset * offset));
    const squeeze = Math.max(0.045, Math.abs(Math.cos(state.ringAngle)));
    return {
      x: RING_HOME.x + offset,
      y: attachY + radius,
      r: radius,
      rx: radius * squeeze,
      ry: radius,
    };
  }

  function threadNear(ax, ay, bx, by, ring) {
    const cx = RING_HOME.x;
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
      segmentNear(ax, ay, bx, by, cx, cy),
      segmentNear(ax, ay, bx, by, dx, dy),
      segmentNear(cx, cy, dx, dy, ax, ay),
      segmentNear(cx, cy, dx, dy, bx, by),
    );
  }

  /* Мяч прошёл сквозь кольцо, если отрезок хода пересёк эллипс снаружи
     внутрь. Радиус берётся с запасом: попадание в самый край засчитывать
     нечестно, кольцо там уже задето. */
  function passesRing(ax, ay, bx, by, ring) {
    const rx = ring.rx * 0.78;
    const ry = ring.ry * 0.78;
    const dx = (bx - ax) / rx;
    const dy = (by - ay) / ry;
    const oxr = (ax - ring.x) / rx;
    const oyr = (ay - ring.y) / ry;
    const a = dx * dx + dy * dy;
    if (!a) return false;
    const b = 2 * (oxr * dx + oyr * dy);
    const c = oxr * oxr + oyr * oyr - 1;
    const discriminant = b * b - 4 * a * c;
    if (discriminant <= 0) return false;
    const root = Math.sqrt(discriminant);
    const roots = [(-b - root) / (2 * a), (-b + root) / (2 * a)].sort((one, two) => one - two);
    for (const t of roots) {
      if (t < 0 || t > 1) continue;
      const before = Math.hypot(oxr + dx * Math.max(0, t - 0.002), oyr + dy * Math.max(0, t - 0.002));
      const after = Math.hypot(oxr + dx * Math.min(1, t + 0.002), oyr + dy * Math.min(1, t + 0.002));
      if (before > 1 && after <= 1) return true;
    }
    return false;
  }

  /* ---------- партия ---------- */

  /* В игре снаряжение задаёт счёт, в песочнице — ползунки. */
  function tension() {
    return clamp(state.hits / RAMP, 0, 1);
  }

  function ringRadius() {
    return state.play ? lerp(RING_START, RING_TIGHT, tension()) : params.radius;
  }

  function ringSpin() {
    return state.play ? lerp(SPIN_START, SPIN_FAST, tension()) : params.spin;
  }

  function placeBall() {
    const shots = state.shots;
    state.ball = shots < 10 ? { ...BALL_HOME } : { ...BALL_LAYOUTS[(shots - 10) % BALL_LAYOUTS.length] };
  }

  function reset() {
    state.shots = 0;
    state.hits = 0;
    state.lives = LIVES;
    state.over = false;
    state.fly = null;
    state.aim = false;
    state.force = 0;
    state.stemAngle = 0;
    state.stemAngularVelocity = 0;
    state.stemOffset = 0;
    state.stemVelocity = 0;
    state.ringAngle = 0;
    state.ringOffset = 0;
    state.ringVelocity = 0;
    state.rest = 0;
    state.fresh = null;
    state.inkLength = 0;
    state.done = [];
    sent = false;
    placeBall();
  }

  /* Партия кончилась — результат уходит в копилку холста. Один раз: сервер
     начисляет за улучшение рекорда, но повторами его дёргать незачем. */
  /* Партия кончилась — результат уходит в копилку холста. Только из игры:
     в песочнице ползунки открыты, и присылать оттуда счёт нечестно. */
  function finish() {
    state.over = true;
    if (sent || !state.play) return;
    sent = true;
    reportScore('К', state.hits);
  }

  function launch(dx, dy) {
    const len = Math.hypot(dx, dy) || 1;
    const pull = Math.min(len, REACH);
    state.force = pull;
    state.fly = {
      x: state.ball.x,
      y: state.ball.y,
      vx: (dx / len) * pull * PULL,
      vy: (dy / len) * pull * PULL,
      path: [{ x: state.ball.x, y: state.ball.y }],
      bounced: false,
      scored: false,
      threadHit: false,
      age: 0,
    };
    state.shots += 1;
  }

  function miss() {
    state.fly = null;
    state.lives -= 1;
    if (state.lives <= 0) finish();
    else state.rest = REST;
  }

  function preview(dx, dy) {
    const len = Math.hypot(dx, dy) || 1;
    const pull = Math.min(len, REACH);
    let x = state.ball.x;
    let y = state.ball.y;
    let vx = (dx / len) * pull * PULL;
    let vy = (dy / len) * pull * PULL;
    const path = [{ x, y }];
    let bounced = false;
    for (let i = 0; i < 22; i += 1) {
      const px = x;
      const py = y;
      vy += params.weight;
      x += vx;
      y += vy;
      const hit = bounced
        ? null
        : stemCrossing(px, py, x, y, state.stemAngle, state.stemAngle, state.stemOffset, state.stemOffset);
      if (hit) {
        x = hit.x;
        y = hit.y;
        vx = -vx * KICK;
        bounced = true;
      }
      path.push({ x, y });
    }
    return path;
  }

  function step() {
    const angleBefore = state.stemAngle;
    const offsetBefore = state.stemOffset;

    state.ringAngle += ringSpin() * 0.018;
    state.ringOffset += state.ringVelocity;
    state.ringVelocity *= 0.993;
    state.ringVelocity -= state.ringOffset * 0.012;
    state.ringOffset = clamp(state.ringOffset, -RING_SWAY, RING_SWAY);
    state.stemOffset += state.stemVelocity;
    state.stemVelocity *= 0.993;
    state.stemVelocity -= state.stemOffset * 0.012;
    state.stemOffset = clamp(state.stemOffset, -STEM_SWAY, STEM_SWAY);
    state.stemAngle += state.stemAngularVelocity;
    state.stemAngularVelocity *= 0.992;
    state.stemAngularVelocity -= Math.sin(state.stemAngle) * 0.006;
    state.stemAngle = clamp(state.stemAngle, -0.22, 0.22);

    const angleAfter = state.stemAngle;
    const offsetAfter = state.stemOffset;

    if (state.fresh) state.inkLength += INK_RATE;

    if (state.rest > 0) {
      state.rest -= 1;
      if (state.rest === 0 && !state.over) {
        state.fresh = null;
        placeBall();
      }
      return;
    }

    const fly = state.fly;
    if (!fly) return;

    fly.age += 1;
    const px = fly.x;
    const py = fly.y;
    fly.vy += params.weight;
    fly.x += fly.vx;
    fly.y += fly.vy;

    /* Удар о стойку: импульс делится между мячом и планкой по её массе и
       моменту инерции, поэтому чем ближе к низу пришёлся удар, тем сильнее
       стойка проворачивается. */
    if (!fly.bounced) {
      const hit = stemCrossing(px, py, fly.x, fly.y, angleBefore, angleAfter, offsetBefore, offsetAfter);
      if (hit) {
        const length = STEM_BOTTOM - STEM_TOP;
        const contact = stemAt(hit.angle, hit.offset);
        const distance = clamp((hit.y - contact.top.y) / Math.max(0.001, Math.cos(hit.angle)), 0, length);
        const normalX = Math.cos(hit.angle) * hit.side;
        const normalY = -Math.sin(hit.angle) * hit.side;
        const ballNormal = fly.vx * normalX + fly.vy * normalY;
        const before = stemAt(angleBefore, offsetBefore);
        const after = stemAt(angleAfter, offsetAfter);
        const anchorNormal = (after.top.x - before.top.x) * normalX + (after.top.y - before.top.y) * normalY;
        const stemNormal = anchorNormal + state.stemAngularVelocity * distance * hit.side;
        const relativeNormal = ballNormal - stemNormal;
        if (relativeNormal < 0) {
          const weight = params.stemWeight;
          const mass = STEM_MASS * weight;
          const inertia = STEM_INERTIA * weight;
          const impulse = -(1 + KICK) * relativeNormal / (1 + 1 / mass + (distance * distance) / inertia);
          fly.x = hit.x;
          fly.y = hit.y;
          fly.vx += impulse * normalX;
          fly.vy += impulse * normalY;
          fly.bounced = true;
          state.stemVelocity -= (impulse * normalX) / mass;
          state.stemAngularVelocity -= (impulse * hit.side * distance) / inertia;
        }
      }
    }

    fly.path.push({ x: fly.x, y: fly.y });

    const ring = ringAt();
    if (!fly.threadHit && threadNear(px, py, fly.x, fly.y, ring) <= 0.014) {
      state.ringVelocity += clamp(fly.vx * 0.22, -0.007, 0.007);
      fly.vx *= 0.93;
      fly.threadHit = true;
    }

    if (!fly.scored && fly.bounced && passesRing(px, py, fly.x, fly.y, ring)) {
      state.hits += 1;
      state.ringVelocity += clamp(fly.vx * 0.22, -0.007, 0.007);
      fly.scored = true;
      state.fresh = fly.path;
      state.inkLength = 0;
      state.done.push(state.fresh);
      if (state.done.length > KEEP) state.done.shift();
    }

    const gone = fly.x < -0.05 || fly.x > 1.05 || fly.y > 1.05;
    if (gone || fly.age > FLIGHT) {
      if (fly.scored) {
        state.fly = null;
        state.rest = REST;
      } else miss();
    }
  }

  /* ---------- рисование ---------- */

  /* Чернильная К пишется по следу мяча — ровно столько, сколько успело
     набежать с момента попадания. */
  function inkPrefix(path, length) {
    if (!path.length) return [];
    const prefix = [path[0]];
    let left = length;
    for (let i = 1; i < path.length && left > 0; i += 1) {
      const from = path[i - 1];
      const to = path[i];
      const segment = Math.hypot(to.x - from.x, to.y - from.y);
      if (segment <= left) {
        prefix.push(to);
        left -= segment;
      } else {
        const t = segment ? left / segment : 0;
        prefix.push({ x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) });
        break;
      }
    }
    return prefix;
  }

  function drawInk(path, color) {
    const prefix = inkPrefix(path, state.inkLength);
    if (prefix.length > 1) poly(prefix, color, 0.018);
  }

  function drawTrail(path) {
    const from = Math.max(0, path.length - TRAIL);
    for (let i = from + 1; i < path.length; i += 2) {
      const fade = (i - from) / Math.max(path.length - from, 1);
      poly(path.slice(Math.max(from, i - 2), i + 1), ink(0.2 + fade * 0.65), 0.002 + fade * 0.003);
    }
  }

  function drawRing(ring) {
    const at = point(ring.x, ring.y);
    ctx.beginPath();
    ctx.ellipse(at.x, at.y, ring.rx * S, ring.ry * S, 0, 0, Math.PI * 2);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.012 * S;
    ctx.stroke();
  }

  /* Счёт и жизни — одна строка: сколько набрал и сколько осталось, читается
     разом. Внизу кадра им тесно, там подписи и кнопка подсказки. */
  function status() {
    const hits = state.hits;
    const tail = state.over ? ' · клик — заново' : '';
    const text = `${state.play ? '' : 'песочница · '}${hits} ${plural(hits)}${tail}`.toUpperCase();

    ctx.font = "10px 'DM Mono', ui-monospace, monospace";
    const gap = 0.02 * S;
    const stride = 0.022 * S;
    const radius = 0.0065 * S;
    const textWidth = ctx.measureText(text).width;
    const startX = ox + S / 2 - (textWidth + gap + LIVES * stride) / 2;
    const baseline = oy + 25;

    ctx.textAlign = 'left';
    ctx.fillStyle = state.fresh ? RED : ink(0.45);
    ctx.fillText(text, startX, baseline);

    for (let i = 0; i < LIVES; i += 1) {
      ctx.beginPath();
      ctx.arc(startX + textWidth + gap + i * stride + radius, baseline - radius * 0.6, radius, 0, Math.PI * 2);
      ctx.fillStyle = i < state.lives ? ink(0.5) : ink(0.13);
      ctx.fill();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const ring = ringAt();
    const stem = stemAt();

    if (params.trace) {
      for (const path of state.done) {
        if (path === state.fresh) continue;
        poly(path, ink(0.16), 0.018);
      }
    }

    line(STEM_X, 0, stem.top.x, stem.top.y, ink(0.2), 0.002);
    line(stem.top.x, stem.top.y, stem.bottom.x, stem.bottom.y, INK, 0.018);
    line(RING_HOME.x, 0, ring.x, ring.y - ring.ry, ink(0.2), 0.002);
    drawRing(ring);

    /* Свежая К горит, пока пишется, и остывает вместе с паузой показа. */
    if (state.fresh && state.rest > 0) drawInk(state.fresh, RED);

    if (state.fly) {
      drawTrail(state.fly.path);
      if (state.fly.scored) drawInk(state.fly.path, RED);
      dot(state.fly.x, state.fly.y, INK, 0.016);
    } else {
      dot(state.ball.x, state.ball.y, state.over ? ink(0.25) : INK, 0.022);
    }

    if (state.aim) poly(preview(pointer.x - state.ball.x, pointer.y - state.ball.y), ink(0.34), 0.0025);

    /* Полоса силы удара: служебная шкала, поэтому в чернилах, а не в краске.
       Держится выше нижнего края — у самого низа канву перекрывают подпись
       «параметры» и кнопка подсказки. */
    const shelf = 0.88;
    line(0.69, shelf, 0.83, shelf, ink(0.2), 0.009);
    line(0.69, shelf, 0.69 + 0.14 * clamp(state.force / REACH, 0, 1), shelf, ink(0.6), 0.009);

    status();
  }

  function resize() {
    const bounds = workspace.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, bounds.width);
    H = Math.max(1, bounds.height);
    S = Math.min(W, H);
    ox = (W - S) / 2;
    oy = (H - S) / 2;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function frame(now) {
    debt = Math.min(0.1, debt + (now - last) / 1000);
    last = now;
    while (debt >= STEP) {
      step();
      debt -= STEP;
    }
    draw();
    frameId = requestAnimationFrame(frame);
  }

  function track(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - bounds.left - ox) / S;
    pointer.y = (event.clientY - bounds.top - oy) / S;
  }

  function onDown(event) {
    track(event);
    pointer.down = true;
    if (state.over) {
      reset();
      return;
    }
    if (state.fly || state.rest > 0) return;
    state.aim = true;
  }

  function onMove(event) {
    track(event);
    if (!pointer.down || !state.aim) return;
    state.force = Math.min(Math.hypot(pointer.x - state.ball.x, pointer.y - state.ball.y), REACH);
  }

  function onUp(event) {
    track(event);
    pointer.down = false;
    if (!state.aim) return;
    state.aim = false;
    const dx = pointer.x - state.ball.x;
    const dy = pointer.y - state.ball.y;
    if (Math.hypot(dx, dy) < 0.02) return;
    launch(dx, dy);
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'тяни мяч и отпускай · попадание считается только после удара о стойку, и след пишет К';

  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.hidden = true;

  /* Панель начинается с режима: сперва человек видит, во что играет, и уже
     потом — ручки. Раньше переключатель стоял в хвосте списка, оторванный от
     того, чем он управляет, и прочитать его было нечем. */
  const modes = document.createElement('div');
  modes.className = 'sketch-modes';
  panel.append(modes);

  const modeNote = document.createElement('p');
  panel.append(modeNote);

  function modeButton(labelText, play) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sketch-mode';
    button.textContent = labelText;
    button.addEventListener('click', () => {
      if (state.play === play) return;
      state.play = play;
      /* Возврат в игру восстанавливает снаряжение: накрученное в песочнице
         не должно уезжать в зачётную партию. */
      if (play) Object.assign(params, PARAMS);
      reset();
      syncPanel();
    });
    modes.append(button);
    return button;
  }

  const playButton = modeButton('на рекорд', true);
  const freeButton = modeButton('песочница', false);

  /* Ползунки — снаряжение партии, поэтому на рекорде они закрыты: иначе
     результат ставится не рукой, а кольцом пошире. */
  const knobs = [];
  for (const [key, labelText, min, max, stepValue] of CONTROLS) {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = stepValue;
    input.value = params[key];
    input.addEventListener('input', () => { params[key] = Number(input.value); });
    label.append(input);
    panel.append(label);
    knobs.push({ key, input });
  }

  const switches = [];

  function syncPanel() {
    playButton.setAttribute('aria-pressed', String(state.play));
    freeButton.setAttribute('aria-pressed', String(!state.play));
    modeNote.textContent = state.play
      ? 'результат идёт в общий счёт'
      : 'ручки открыты, результат не в зачёт';
    for (const knob of knobs) {
      knob.input.disabled = state.play;
      knob.input.value = params[knob.key];
    }
    for (const item of switches) item.button.setAttribute('aria-pressed', String(item.pressed()));
  }

  function switchButton(labelText, pressed, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sketch-switch';
    button.textContent = labelText;
    button.addEventListener('click', () => {
      onClick();
      syncPanel();
    });
    panel.append(button);
    switches.push({ button, pressed });
    return button;
  }

  switchButton('след', () => params.trace, () => { params.trace = !params.trace; });

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'sketch-action';
  resetButton.textContent = 'заново';
  resetButton.addEventListener('click', reset);
  panel.append(resetButton);

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

  function onKeyDown(event) {
    if (event.key !== 'Tab') return;
    /* Внутри открытой панели Tab по-прежнему переставляет фокус между
       ползунками. Цель проверяется на элемент: событие может прийти и от
       документа, у которого closest нет. */
    const inField = event.target instanceof Element && event.target.closest('input, textarea');
    if (inField) return;
    event.preventDefault();
    toggle.click();
  }

  reset();
  syncPanel();
  workspace.append(hint, panel, toggle);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(workspace);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  document.addEventListener('keydown', onKeyDown);
  resize();
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.removeEventListener('keydown', onKeyDown);
    hint.remove();
    panel.remove();
    toggle.remove();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
