/* Ш · кольца в воде.
   Три зубца — штырьки, перекладина — салазки: буква ездит по дну сосуда и
   ловит кольца, которые подбрасывают струи со дна. Воду нигде не рисуем,
   она вся в поведении: подъёмная сила гасит вес, вязкость съедает разгон,
   пузырьки живут только там, где сейчас бьёт сопло.

   Продевание требует совпасть и местом, и фазой оборота: кольцо садится на
   зубец, только если идёт вниз почти плашмя. Ловят не кольцо, а его оборот. */

const SH_THICK = 0.06;
const SH_SPACING = 0.22;
const SH_TOP = 0.44;
const SH_BOTTOM = 0.84;
const SH_HALF = SH_SPACING + SH_THICK / 2;

const SH_RING_R = 0.058;
const SH_RING_LINE = 0.011;

const SH_DRAG_Y = 1.9;
const SH_DRAG_X = 1.1;
const SH_SPIN_DRAG = 0.9;

/* Взгляд на сцену не строго сбоку, а чуть сверху: наклон камеры и даёт
   лежащему кольцу видимую толщину, а «ребро к зрителю» сдвигает с плашмя. */
const SH_CAM = Math.asin(0.38);
const SH_FLAT = 0.02;

const SH_JETS = [0.25, 0.5, 0.75];
const SH_KEYS = ['KeyQ', 'KeyW', 'KeyE'];
const SH_JET_SPIN = 7;
const SH_JET_CONE = 0.055;
/* Струя добивает до самого верха сцены: кольцо должно уходить заметно выше
   кончиков Ш, иначе ловля вырождается в подбрасывание на ладонь. */
const SH_JET_REACH = 0.9;
const SH_WOBBLE = 2.3;     /* частота рыскания струи */
const SH_BUBBLE_RATE = 26;

const SH_SLOT_H = 0.055;
const SH_SLIDE = 1.1;      /* скорость съезда надетого кольца к стопке */
const SH_SUCK_BAND = 0.09; /* полоса у дна, где чувствуется приток к соплу */
const SH_SUCK_REACH = 0.45;

const shRand = (min, max) => min + Math.random() * (max - min);
const shTeeth = () => [modeState.rig - SH_SPACING, modeState.rig, modeState.rig + SH_SPACING];
const shSlotY = (slot) => SH_BOTTOM - SH_THICK / 2 - SH_SLOT_H * (slot + 0.5);
const shFilled = (index) => modeState.rings.filter((r) => r.pinned?.tooth === index).length;
const shFlat = (ring) => Math.max(Math.abs(Math.cos(ring.phase + SH_CAM)), SH_FLAT);

function shSeed() {
  const count = num('rings');
  modeState.rig = 0.5;
  modeState.target = 0.5;
  modeState.bubbles = [];
  modeState.time = 0;
  modeState.jets = SH_JETS.map((x, i) => ({ x, on: false, phase: i * 2.1 }));
  modeState.rings = [];
  const prize = Math.floor(Math.random() * count);
  for (let i = 0; i < count; i += 1) {
    modeState.rings.push({
      x: shRand(SH_RING_R + 0.02, 1 - SH_RING_R - 0.02),
      y: SH_BOTTOM - SH_RING_LINE,
      vx: 0,
      vy: 0,
      phase: Math.PI / 2,
      spin: 0,
      tilt: shRand(-0.4, 0.4),
      prize: i === prize,
      pinned: null,
      slide: 0,
    });
  }
}

/* Сила струи спадает и от оси конуса, и от высоты. Кольцо ловит ещё и
   момент — тем больший, чем сильнее оно идёт мимо оси. */
function shBlow(ring) {
  const force = num('force');
  const swirl = num('swirl');
  for (const jet of modeState.jets) {
    if (!jet.on) continue;
    const up = SH_BOTTOM - ring.y;
    if (up < 0 || up > SH_JET_REACH) continue;
    /* Струя не столб, а живая вода: ось рыскает, и чем выше, тем сильнее —
       поэтому одно и то же нажатие никогда не даёт один и тот же полёт. */
    const axis = jet.x + Math.sin(modeState.time * SH_WOBBLE + jet.phase) * swirl * 0.35 * up;
    const width = SH_JET_CONE + up * num('cone');
    const off = (ring.x - axis) / width;
    if (Math.abs(off) > 1) continue;
    const fade = (1 - Math.abs(off)) * (1 - up / SH_JET_REACH);
    ring.vy -= force * fade * STEP;
    ring.vx += off * force * 0.5 * fade * STEP;
    ring.spin += off * SH_JET_SPIN * fade * STEP;
    /* Завихрение достаётся кольцу россыпью: свой толчок и свой момент. */
    ring.vx += (Math.random() - 0.5) * swirl * fade * 3 * STEP;
    ring.spin += (Math.random() - 0.5) * swirl * fade * 26 * STEP;
  }
}

/* Зубец — тело на всей своей высоте, а не ловушка у самого дна: иначе кольцо
   пролетает сквозь него и цепляется вдруг, задним числом. Накрыло сверху
   плашмя — нанизалось и поехало вниз; попало краем — отбилось. */
function shHitTooth(ring) {
  if (ring.y < SH_TOP - SH_RING_R || ring.y > SH_BOTTOM) return false;
  /* Кольцо, улёгшееся на дне, зубцов не замечает: иначе салазки каждый кадр
     подталкивали бы лежащих и сгребали их в кучки. */
  if (Math.hypot(ring.vx, ring.vy) < 0.06) return false;
  const list = shTeeth();
  for (let i = 0; i < list.length; i += 1) {
    const dx = ring.x - list[i];
    const flat = Math.abs(Math.cos(ring.phase)) <= num('phase');
    /* Соосное кольцо зубец не задевает: снизу оно проходит по нему свободно,
       сверху — насаживается. Отбивать надо только то, что идёт краем. */
    if (Math.abs(dx) <= num('catch') && (ring.vy <= 0 || !flat || shFilled(i) >= num('slots'))) {
      return false;
    }
    if (Math.abs(dx) <= num('catch') && ring.vy > 0 && flat && shFilled(i) < num('slots')) {
      ring.pinned = { tooth: i, slot: shFilled(i) };
      ring.slide = ring.y;
      ring.vx = 0;
      ring.vy = 0;
      ring.spin = 0;
      ring.phase = Math.PI / 2;
      return true;
    }
    if (Math.abs(dx) < SH_RING_R + SH_THICK / 2) {
      const push = Math.sign(dx || 1);
      ring.vx = push * Math.max(Math.abs(ring.vx), Math.abs(ring.vy) * 0.6) * 0.7;
      ring.vy *= 0.6;
      ring.spin += push * 2;
      ring.x = list[i] + push * (SH_RING_R + SH_THICK / 2);
      return false;
    }
  }
  return false;
}

/* Приток к работающему соплу: у дна вода идёт к струе, и кольцо, лёгшее в
   стороне, само подтягивается. Без этого дальние кольца поднять нечем. */
function shSuck(ring) {
  const up = SH_BOTTOM - ring.y;
  if (up > SH_SUCK_BAND) return;
  for (const jet of modeState.jets) {
    if (!jet.on) continue;
    const dx = jet.x - ring.x;
    const far = Math.abs(dx);
    if (far < SH_JET_CONE || far > SH_SUCK_REACH) continue;
    ring.vx += Math.sign(dx) * num('suck') * (1 - far / SH_SUCK_REACH) * STEP;
  }
}

function shSwim(ring) {
  if (ring.pinned) {
    ring.x = shTeeth()[ring.pinned.tooth];
    const rest = shSlotY(ring.pinned.slot);
    ring.slide = Math.min(rest, ring.slide + SH_SLIDE * STEP);
    ring.y = ring.slide;
    return;
  }
  if (shHitTooth(ring)) return;
  shSuck(ring);
  shBlow(ring);
  /* Вес за вычетом всплытия: делённый на вязкость, он и есть скорость
     оседания — ею и правим, а не двумя числами по отдельности. */
  ring.vy += num('fall') * SH_DRAG_Y * STEP;
  ring.vy -= ring.vy * SH_DRAG_Y * STEP;
  ring.vx -= ring.vx * SH_DRAG_X * STEP;
  ring.x += ring.vx * STEP;
  ring.y += ring.vy * STEP;
  ring.phase += ring.spin * STEP;
  ring.spin -= ring.spin * SH_SPIN_DRAG * STEP;

  if (ring.x < SH_RING_R) { ring.x = SH_RING_R; ring.vx = Math.abs(ring.vx) * 0.4; }
  if (ring.x > 1 - SH_RING_R) { ring.x = 1 - SH_RING_R; ring.vx = -Math.abs(ring.vx) * 0.4; }
  if (ring.y > SH_BOTTOM - SH_RING_LINE) {
    ring.y = SH_BOTTOM - SH_RING_LINE;
    ring.vy = 0;
    /* На дне кольцо укладывается плашмя — доводим фазу до ближайшего π/2. */
    const flat = Math.round((ring.phase - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
    ring.phase += (flat - ring.phase) * 0.12;
    ring.spin *= 0.8;
  }
  if (ring.y < SH_RING_R) { ring.y = SH_RING_R; ring.vy = Math.abs(ring.vy) * 0.3; }
}

/* Кольца не проходят друг сквозь друга: без этого струя сгоняет их в одну
   точку и дальше они живут как одно кольцо. */
function shCrowd() {
  const list = modeState.rings;
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    if (a.pinned) continue;
    for (let j = i + 1; j < list.length; j += 1) {
      const b = list[j];
      if (b.pinned) continue;
      const dx = b.x - a.x;
      const dy = (b.y - a.y) * 2.2;   /* по вертикали кольца плоские */
      const dist = Math.hypot(dx, dy);
      const min = SH_RING_R * 1.7;
      if (dist > min || dist === 0) continue;
      const push = ((min - dist) / min) * 0.6 * STEP;
      const nx = dx / dist;
      a.x -= nx * push;
      b.x += nx * push;
      a.vx -= nx * push * 8;
      b.vx += nx * push * 8;
    }
  }
}

function shPuff() {
  for (const jet of modeState.jets) {
    if (!jet.on) continue;
    for (let i = 0; i < SH_BUBBLE_RATE * STEP; i += 1) {
      modeState.bubbles.push({
        x: jet.x + shRand(-SH_JET_CONE, SH_JET_CONE),
        y: SH_BOTTOM - 0.005,
        vy: shRand(-0.7, -0.45),
        vx: shRand(-0.05, 0.05),
        r: shRand(0.003, 0.009),
        life: 1,
      });
    }
  }
  for (const b of modeState.bubbles) {
    b.x += (b.vx + Math.sin(b.y * 40) * 0.04) * STEP;
    b.y += b.vy * STEP;
    b.life -= STEP * 1.1;
  }
  modeState.bubbles = modeState.bubbles.filter((b) => b.life > 0 && b.y > 0);
}

/* Кольцо — эллипс, а не сплюснутый круг: масштабировать канву значило бы
   заодно исказить толщину линии. Тёмный подбой кладётся первым и шире — он и
   есть та обводка, которой кольцо читается поверх белого зубца. */
/* half: 'back' — дальняя дуга, 'front' — ближняя, иначе кольцо целиком.
   Двумя дугами, а не полным эллипсом с накладкой: наложение и давало шов. */
function shRingPath(ring, half) {
  const from = half === 'front' ? 0 : Math.PI;
  const to = half === 'front' ? Math.PI : Math.PI * 2;
  ctx.beginPath();
  ctx.ellipse(ring.x * S, ring.y * S, SH_RING_R * S, SH_RING_R * shFlat(ring) * S,
    ring.tilt, half ? from : 0, half ? to : Math.PI * 2);
}

function shDrawRing(ring, half) {
  ctx.lineCap = 'butt';
  shRingPath(ring, half);
  ctx.strokeStyle = paper(1);
  ctx.lineWidth = (SH_RING_LINE + 0.008) * S;
  ctx.stroke();
  shRingPath(ring, half);
  ctx.strokeStyle = ring.prize ? RED : ink(1);
  ctx.lineWidth = SH_RING_LINE * S;
  ctx.stroke();
}

/* Буква собрана штрихами со скруглёнными торцами: круглые концы зубцов и
   скруглённые углы перекладины — часть почерка, обводить контур незачем. */
function shDrawRig() {
  ctx.strokeStyle = ink(1);
  ctx.lineWidth = SH_THICK * S;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const x of shTeeth()) {
    ctx.moveTo(x * S, SH_TOP * S);
    ctx.lineTo(x * S, SH_BOTTOM * S);
  }
  ctx.moveTo((modeState.rig - SH_HALF + SH_THICK / 2) * S, SH_BOTTOM * S);
  ctx.lineTo((modeState.rig + SH_HALF - SH_THICK / 2) * S, SH_BOTTOM * S);
  ctx.stroke();
}

const MODES = {
  rings: {
    label: 'кольца',
    note: 'Q W E — струи со дна, мышь ведёт Ш. Кольцо садится на зубец, только '
      + 'если идёт вниз почти плашмя: ловят не кольцо, а фазу его оборота.',
    tools: [
      { type: 'range', key: 'rings', label: 'колец', min: 3, max: 15, step: 1, value: 9 },
      { type: 'range', key: 'force', label: 'струя', min: 1, max: 20, step: 0.5, value: 9 },
      { type: 'range', key: 'swirl', label: 'завихрение', min: 0, max: 2, step: 0.05, value: 0.7 },
      { type: 'range', key: 'cone', label: 'конус', min: 0.05, max: 0.6, step: 0.01, value: 0.22 },
      { type: 'range', key: 'catch', label: 'захват', min: 0.01, max: 0.12, step: 0.005, value: 0.045 },
      { type: 'range', key: 'phase', label: 'допуск фазы', min: 0.1, max: 1, step: 0.05, value: 0.5 },
      { type: 'range', key: 'slots', label: 'на зубец', min: 1, max: 6, step: 1, value: 3 },
      { type: 'range', key: 'fall', label: 'оседание', min: 0.05, max: 0.6, step: 0.01, value: 0.26 },
      { type: 'range', key: 'suck', label: 'приток', min: 0, max: 3, step: 0.1, value: 1.2 },
      { type: 'range', key: 'speed', label: 'ход Ш', min: 0.5, max: 6, step: 0.1, value: 2.6 },
      { type: 'button', label: 'заново', action() { shSeed(); } },
    ],
    cursor: 'crosshair',
    setup() { shSeed(); },
    onMove() { modeState.target = clamp(pointer.x, SH_HALF, 1 - SH_HALF); },
    onKey(event, down) {
      const index = SH_KEYS.indexOf(event.code);
      if (index < 0) return;
      modeState.jets[index].on = down;
    },
    step() {
      if (modeState.rings.length !== num('rings')) shSeed();
      modeState.time += STEP;
      const gap = modeState.target - modeState.rig;
      const limit = num('speed') * STEP;
      modeState.rig += clamp(gap * 0.22, -limit, limit);
      shPuff();
      for (const ring of modeState.rings) shSwim(ring);
      shCrowd();
    },
    draw() {
      ctx.strokeStyle = ink(0.5);
      ctx.lineWidth = 0.0025 * S;
      for (const b of modeState.bubbles) {
        ctx.globalAlpha = Math.min(1, b.life);
        ctx.beginPath();
        ctx.arc(b.x * S, b.y * S, b.r * S, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      /* Надетое кольцо продевается по-настоящему: дальняя половина уходит под
         зубец, ближняя ложится поверх. */
      for (const ring of modeState.rings) if (ring.pinned) shDrawRing(ring, 'back');
      shDrawRig();
      for (const ring of modeState.rings) if (ring.pinned) shDrawRing(ring, 'front');
      for (const ring of modeState.rings) if (!ring.pinned) shDrawRing(ring, null);

      const done = modeState.rings.filter((r) => r.pinned).length;
      drawStatus(`надето · ${done} / ${modeState.rings.length}`);
    },
  },
};

startLab({
  title: 'Ш · кольца в воде',
  modes: MODES,
  start: 'rings',
  ground: 'ink',
});
