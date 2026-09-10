import { reportScore } from '../progress.js?v=5';

/* Ш · кольца в воде.
   Три зубца — штырьки, перекладина — салазки: буква ездит по дну сосуда и
   ловит кольца, которые подбрасывают струи. Вода нигде не нарисована, она
   только в поведении: подъёмная сила, вязкость и пузырьки у работающего сопла. */

const STEP = 1 / 60;
const INK = '#161616';
const PAPER = '#f1ede5';
const RED = '#e0210f';

/* Геометрия буквы в долях сцены. Ширина выбрана так, чтобы Ш оставалось где
   ездить: занимает половину сцены, ход центра — от 0.25 до 0.75. */
const THICK = 0.06;
const SPACING = 0.22;
const TOP = 0.34;
const BOTTOM = 0.84;
const HALF = SPACING + THICK / 2;

/* Кольца. Внутренний просвет заметно шире зубца — иначе продеть его точным
   попаданием было бы делом случая, а не руки. */
const RING_COUNT = 9;
const RING_R = 0.058;
const RING_LINE = 0.011;
const FLOOR = BOTTOM;

/* Вода. Тяжесть почти уравновешена всплытием, поэтому кольцо не падает,
   а оседает; вязкость по горизонтали слабее, чтобы был снос вбок. */
const GRAVITY = 0.62;
const BUOYANCY = 0.44;
const DRAG_Y = 1.9;
const DRAG_X = 1.1;
const SPIN_DRAG = 0.9;
/* Взгляд на сцену не строго сбоку, а чуть сверху: наклон камеры и даёт
   лежащему кольцу видимую толщину, а «ребро к зрителю» сдвигает с плашмя. */
const CAM = Math.asin(0.38);
const FLAT = 0.02;

/* Струи. Сопла врезаны в дно и не ездят вместе с буквой: подгонять надо Ш
   под воду, а не воду под Ш. Конус к верху шире и слабее. */
const JETS = [0.25, 0.5, 0.75];
const JET_KEYS = ['KeyQ', 'KeyW', 'KeyE'];
const JET_FORCE = 3.4;
const JET_SPIN = 7;
const JET_CONE = 0.055;
const JET_SPREAD = 0.22;
const JET_REACH = 0.62;
const BUBBLE_RATE = 26;

/* Ловля. Продевание требует совпасть и местом, и фазой: кольцо должно идти
   вниз почти плашмя — ловят не кольцо, а его оборот. */
const CATCH_X = 0.045;
const CATCH_FLAT = 0.5;
const SLOTS = 3;
const SLOT_H = 0.055;
const RIG_SPEED = 2.6;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = (min, max) => min + Math.random() * (max - min);

export function mountSh(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const pointer = { x: 0.5, y: 0.5, down: false };
  let W = 1;
  let H = 1;
  let S = 1;
  let ox = 0;
  let oy = 0;
  let dpr = 1;
  let last = performance.now();
  let debt = 0;
  let frameId = 0;

  const rig = { x: 0.5, target: 0.5 };
  const jets = JETS.map(x => ({ x, on: false }));
  let rings = [];
  let bubbles = [];

  const teeth = () => [rig.x - SPACING, rig.x, rig.x + SPACING];
  const slotY = slot => BOTTOM - THICK / 2 - SLOT_H * (slot + 0.5);
  const filled = index => rings.filter(r => r.pinned?.tooth === index).length;

  function seed() {
    rings = [];
    const prize = Math.floor(Math.random() * RING_COUNT);
    for (let i = 0; i < RING_COUNT; i++) {
      rings.push({
        x: rand(RING_R + 0.02, 1 - RING_R - 0.02),
        y: FLOOR - RING_LINE,
        vx: 0,
        vy: 0,
        phase: Math.PI / 2,   /* плашмя: лежит на дне */
        spin: 0,
        tilt: rand(-0.4, 0.4),
        prize: i === prize,
        pinned: null,
      });
    }
  }

  /* Сплюснутость эллипса — это наклон плоскости кольца с поправкой на камеру:
     фаза π/2 даёт кольцо плашмя, фаза 0 — стоймя, почти круг. */
  const flatness = ring => Math.max(Math.abs(Math.cos(ring.phase + CAM)), FLAT);

  /* Сила струи в точке: спадает и от оси конуса, и от высоты. Кольцо ловит
     ещё и момент — от того, насколько мимо оси оно идёт. */
  function blow(ring) {
    for (const jet of jets) {
      if (!jet.on) continue;
      const up = FLOOR - ring.y;
      if (up < 0 || up > JET_REACH) continue;
      const width = JET_CONE + up * JET_SPREAD;
      const off = (ring.x - jet.x) / width;
      if (Math.abs(off) > 1) continue;
      const fade = (1 - Math.abs(off)) * (1 - up / JET_REACH);
      ring.vy -= JET_FORCE * fade * STEP;
      ring.vx += off * JET_FORCE * 0.5 * fade * STEP;
      ring.spin += off * JET_SPIN * fade * STEP;
    }
  }

  /* Кольцо садится, если идёт вниз, совпало с зубцом по горизонтали и его
     плоскость достаточно близка к плашмя. Мимо фазы — отскок в сторону. */
  function tryCatch(ring) {
    if (ring.vy <= 0) return false;
    const list = teeth();
    for (let i = 0; i < list.length; i++) {
      const dx = ring.x - list[i];
      if (Math.abs(dx) > CATCH_X) continue;
      const free = filled(i);
      const rest = slotY(free);
      if (ring.y < TOP || ring.y < rest - SLOT_H) return false;
      if (free >= SLOTS || Math.abs(Math.cos(ring.phase)) > CATCH_FLAT) {
        ring.vx += Math.sign(dx || 1) * 0.35;
        ring.vy *= 0.5;
        ring.spin += 3;
        return false;
      }
      ring.pinned = { tooth: i, slot: free };
      ring.vx = 0;
      ring.vy = 0;
      ring.spin = 0;
      ring.phase = Math.PI / 2;
      return true;
    }
    return false;
  }

  function swim(ring) {
    if (ring.pinned) {
      ring.x = teeth()[ring.pinned.tooth];
      ring.y = slotY(ring.pinned.slot);
      return;
    }
    if (tryCatch(ring)) return;
    blow(ring);
    ring.vy += (GRAVITY - BUOYANCY) * STEP;
    ring.vy -= ring.vy * DRAG_Y * STEP;
    ring.vx -= ring.vx * DRAG_X * STEP;
    ring.x += ring.vx * STEP;
    ring.y += ring.vy * STEP;
    ring.phase += ring.spin * STEP;
    ring.spin -= ring.spin * SPIN_DRAG * STEP;

    const wall = RING_R;
    if (ring.x < wall) { ring.x = wall; ring.vx = Math.abs(ring.vx) * 0.4; }
    if (ring.x > 1 - wall) { ring.x = 1 - wall; ring.vx = -Math.abs(ring.vx) * 0.4; }
    if (ring.y > FLOOR - RING_LINE) {
      ring.y = FLOOR - RING_LINE;
      ring.vy = 0;
      /* На дне кольцо укладывается плашмя — доводим фазу до ближайшего π/2. */
      const flat = Math.round((ring.phase - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
      ring.phase += (flat - ring.phase) * 0.12;
      ring.spin *= 0.8;
    }
    if (ring.y < RING_R) { ring.y = RING_R; ring.vy = Math.abs(ring.vy) * 0.3; }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    S = Math.min(W, H);
    ox = (W - S) / 2;
    oy = (H - S) / 2;
  }

  function track(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left - ox) / S;
    pointer.y = (event.clientY - rect.top - oy) / S;
  }

  function puff() {
    for (const jet of jets) {
      if (!jet.on) continue;
      for (let i = 0; i < BUBBLE_RATE * STEP; i++) {
        bubbles.push({
          x: jet.x + rand(-JET_CONE, JET_CONE),
          y: FLOOR - 0.005,
          vx: rand(-0.05, 0.05),
          vy: rand(-0.7, -0.45),
          r: rand(0.003, 0.009),
          life: 1,
        });
      }
    }
    for (const b of bubbles) {
      b.x += (b.vx + Math.sin(b.y * 40) * 0.04) * STEP;
      b.y += b.vy * STEP;
      b.life -= STEP * 1.1;
    }
    bubbles = bubbles.filter(b => b.life > 0 && b.y > 0);
  }

  function step() {
    const gap = rig.target - rig.x;
    rig.x += clamp(gap * 0.22, -RIG_SPEED * STEP, RIG_SPEED * STEP);
    puff();
    for (const ring of rings) swim(ring);
  }

  /* Кольцо — эллипс, а не сплюснутый круг: масштабировать канву значило бы
     заодно исказить толщину линии. Тёмный подбой кладётся первым и шире —
     он и есть та обводка, которой кольцо читается поверх белого зубца. */
  function ringPath(ring, half) {
    const from = half ? 0 : 0;
    const to = half ? Math.PI : Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(ring.x * S, ring.y * S, RING_R * S, RING_R * flatness(ring) * S, ring.tilt, from, to);
  }

  function drawRing(ring, half) {
    ringPath(ring, half);
    ctx.strokeStyle = INK;
    ctx.lineWidth = (RING_LINE + 0.008) * S;
    ctx.stroke();
    ringPath(ring, half);
    ctx.strokeStyle = ring.prize ? RED : PAPER;
    ctx.lineWidth = RING_LINE * S;
    ctx.stroke();
  }

  /* Буква собрана штрихами со скруглёнными торцами: круглые концы зубцов и
     скруглённые углы перекладины — часть почерка, обводить контур незачем. */
  function drawRig() {
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = THICK * S;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const x of teeth()) {
      ctx.moveTo(x * S, TOP * S);
      ctx.lineTo(x * S, BOTTOM * S);
    }
    ctx.moveTo((rig.x - HALF + THICK / 2) * S, BOTTOM * S);
    ctx.lineTo((rig.x + HALF - THICK / 2) * S, BOTTOM * S);
    ctx.stroke();
  }

  function drawBubbles() {
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 0.0025 * S;
    for (const b of bubbles) {
      ctx.globalAlpha = Math.min(1, b.life) * 0.5;
      ctx.beginPath();
      ctx.arc(b.x * S, b.y * S, b.r * S, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    ctx.translate(ox, oy);
    drawBubbles();
    /* Надетое кольцо продевается по-настоящему: дальняя половина уходит под
       зубец, ближняя ложится поверх. */
    for (const ring of rings) if (ring.pinned) drawRing(ring, false);
    drawRig();
    for (const ring of rings) if (ring.pinned) drawRing(ring, true);
    for (const ring of rings) if (!ring.pinned) drawRing(ring, false);
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

  function keyDown(event) {
    const index = JET_KEYS.indexOf(event.code);
    if (index < 0) return;
    event.preventDefault();
    jets[index].on = true;
  }

  function keyUp(event) {
    const index = JET_KEYS.indexOf(event.code);
    if (index < 0) return;
    jets[index].on = false;
  }

  function move(event) {
    track(event);
    rig.target = clamp(pointer.x, HALF, 1 - HALF);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(workspace);
  resize();
  seed();

  canvas.addEventListener('pointermove', move);
  document.addEventListener('keydown', keyDown);
  document.addEventListener('keyup', keyUp);
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    observer.disconnect();
    canvas.removeEventListener('pointermove', move);
    document.removeEventListener('keydown', keyDown);
    document.removeEventListener('keyup', keyUp);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
