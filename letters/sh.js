import { reportScore } from '../progress.js?v=5';

/* Ш · кольца в воде.
   Три зубца — штырьки, перекладина — салазки: буква ездит по дну сосуда и
   ловит кольца, которые подбрасывают струи со дна. Воду нигде не рисуем, она
   вся в поведении: подъёмная сила гасит вес, вязкость съедает разгон,
   пузырьки живут только там, где сейчас бьёт сопло, а оседающее кольцо
   разворачивается плашмя, как пластина поперёк потока.

   Надеть можно только через кончик и только почти плашмя: ловят не кольцо,
   а фазу его оборота. Подсечка боковым ходом не считается — иначе всю
   россыпь собирали бы, мотая буквой из стороны в сторону.
   Значения подобраны в полигоне lab/sh.html. */

const STEP = 1 / 60;
const INK = '#161616';
const PAPER = '#f1ede5';
const RED = '#e0210f';

const THICK = 0.06;
const SPACING = 0.22;
const TOP = 0.44;
const BOTTOM = 0.84;
const HALF = SPACING + THICK / 2;

const GAME_PARAMS = Object.freeze({ rings: 9, force: 6.5, catchFlat: 0.7 });
const RING_R = 0.058;
const RING_LINE = 0.011;

const GRAVITY = 0.26;      /* скорость оседания: вес за вычетом всплытия */
const DRAG_Y = 1.9;
const DRAG_X = 1.1;
const SPIN_DRAG = 0.9;
const ALIGN = 2.4;
const ALIGN_MAX = 1.2;

/* Взгляд на сцену не строго сбоку, а чуть сверху: наклон камеры и даёт
   лежащему кольцу видимую толщину, а «ребро к зрителю» сдвигает с плашмя. */
const CAM = Math.asin(0.38);
const FLAT = 0.02;

const JETS = [0.25, 0.5, 0.75];
const JET_KEYS = ['KeyQ', 'KeyW', 'KeyE'];
const JET_SWIRL = 0.7;
const JET_SPIN = 7;
const JET_CONE = 0.055;
const JET_SPREAD = 0.22;
const JET_REACH = 0.9;
const JET_WOBBLE = 2.3;
const BUBBLE_RATE = 26;
const SUCK = 1.2;
const SUCK_BAND = 0.09;
const SUCK_REACH = 0.45;

const CATCH_X = 0.045;
const SWIPE = 0.5;         /* с какой боковой прытью зубец уже не нанизывает */
const SLOT_H = 0.04;
const STACK_DRAG = 3.2;
const LUFT = (RING_R - RING_LINE) - THICK / 2;
const LEAN = 1.1;
const RIG_SPEED = 2.6;

const FINISH_HOLD = 0.5;
const BEST_KEY = 'alphabet-sh-best-v2';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = (min, max) => min + Math.random() * (max - min);

export function mountSh(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const pointer = { x: 0.5, y: 0.5 };
  const params = { ...GAME_PARAMS };
  let competitive = true;
  let W = 1;
  let H = 1;
  let S = 1;
  let ox = 0;
  let oy = 0;
  let dpr = 1;
  let last = performance.now();
  let debt = 0;
  let frameId = 0;
  let sent = false;

  const rig = { x: 0.5, target: 0.5, v: 0 };
  const jets = JETS.map((x, i) => ({ x, on: false, phase: i * 2.1, bubbles: 0 }));
  const heldKeys = new Set();
  const contacts = new Map();
  const round = { time: 0, started: false, paused: false, stable: 0, over: false, result: 0 };
  let rings = [];
  let bubbles = [];
  let clock = 0;
  let best = Number(localStorage.getItem(BEST_KEY)) || 0;

  const teeth = () => [rig.x - SPACING, rig.x, rig.x + SPACING];
  const flatness = ring => Math.max(Math.abs(Math.cos(ring.phase + CAM)), FLAT);
  const done = () => rings.filter(r => r.pinned).length;

  function seed() {
    if (competitive) Object.assign(params, GAME_PARAMS);
    rings = [];
    bubbles = [];
    clock = 0;
    rig.x = 0.5;
    rig.target = 0.5;
    rig.v = 0;
    round.time = 0;
    round.started = false;
    round.paused = false;
    round.stable = 0;
    last = performance.now();
    debt = 0;
    round.over = false;
    round.result = 0;
    sent = false;
    releaseControls();
    for (const jet of jets) jet.bubbles = 0;
    for (let i = 0; i < params.rings; i++) {
      rings.push({
        x: rand(RING_R + 0.02, 1 - RING_R - 0.02),
        y: BOTTOM - RING_LINE,
        vx: 0,
        vy: 0,
        phase: Math.PI / 2,
        spin: 0,
        tilt: rand(-0.4, 0.4),
        pinned: null,
        stall: 0,
      });
    }
  }

  /* Сила струи спадает и от оси конуса, и от высоты. Ось при этом рыскает и
     тем шире, чем выше, поэтому одно и то же нажатие не даёт один полёт. */
  function blow(ring) {
    for (const jet of jets) {
      if (!jet.on) continue;
      const up = BOTTOM - ring.y;
      if (up < 0 || up > JET_REACH) continue;
      const axis = jet.x + Math.sin(clock * JET_WOBBLE + jet.phase) * JET_SWIRL * 0.35 * up;
      const width = JET_CONE + up * JET_SPREAD;
      const off = (ring.x - axis) / width;
      if (Math.abs(off) > 1) continue;
      const fade = (1 - Math.abs(off)) * (1 - up / JET_REACH);
      ring.vy -= params.force * fade * STEP;
      ring.vx += off * params.force * 0.5 * fade * STEP;
      ring.spin += off * JET_SPIN * fade * STEP;
      /* Завихрение достаётся кольцу россыпью: свой толчок и свой момент. */
      ring.vx += (Math.random() - 0.5) * JET_SWIRL * fade * 3 * STEP;
      ring.spin += (Math.random() - 0.5) * JET_SWIRL * fade * 26 * STEP;
    }
  }

  /* Приток к работающему соплу: у дна вода идёт к струе, и кольцо, лёгшее в
     стороне, само подтягивается. Без этого дальние кольца поднять нечем. */
  function suck(ring) {
    if (BOTTOM - ring.y > SUCK_BAND) return;
    for (const jet of jets) {
      if (!jet.on) continue;
      const dx = jet.x - ring.x;
      const far = Math.abs(dx);
      if (far < JET_CONE || far > SUCK_REACH) continue;
      ring.vx += Math.sign(dx) * SUCK * (1 - far / SUCK_REACH) * STEP;
    }
  }

  /* Перекладина — не линия на дне, а полозья: лежащее кольцо она не
     переезжает, а сдвигает в сторону, как ковш. */
  function plough(ring) {
    if (ring.y < BOTTOM - THICK) return;
    const dx = ring.x - rig.x;
    const edge = HALF + RING_R * 0.55;
    if (Math.abs(dx) >= edge) return;
    const push = Math.sign(dx || 1);
    ring.x += (rig.x + push * edge - ring.x) * 0.6;
    ring.vx += push * 0.25 * STEP * 60 * STEP;
  }

  /* Зубец — тело на всей своей высоте. Надеться можно только через кончик:
     кольцо должно накрыть его сверху, идя вниз, почти плашмя и не расходясь
     с ним вбок. Всё остальное бьётся о стержень или обходит его. */
  function hitTooth(ring) {
    if (ring.y < TOP - RING_R || ring.y > BOTTOM) return false;
    const list = teeth();
    for (let i = 0; i < list.length; i++) {
      const dx = ring.x - list[i];
      if (Math.abs(dx) >= RING_R + THICK / 2) continue;
      const axial = Math.abs(dx) <= CATCH_X;
      const flat = Math.abs(Math.cos(ring.phase)) <= params.catchFlat;
      const crossed = ring.previousY < TOP && ring.y >= TOP && ring.vy > 0;
      const fraction = crossed ? (TOP - ring.previousY) / (ring.y - ring.previousY) : 0;
      const crossingX = ring.previousX + (ring.x - ring.previousX) * fraction;
      const toothX = list[i] - rig.v * STEP * (1 - fraction);
      const through = crossed && Math.abs(crossingX - toothX) <= CATCH_X;
      const slip = Math.abs(ring.vx - rig.v);

      if (through && flat && slip < SWIPE) {
        /* Ход кольца сохраняется: оно продолжает опускаться с той же
           скоростью, стержень лишь забирает у него свободу вбок. */
        ring.pinned = { tooth: i };
        ring.vx *= 0.3;
        ring.spin *= 0.3;
        return true;
      }

      if (crossed && axial) {
        /* Промах — по фазе или по прыти — уводит кольцо с оси немедленно:
           мягкий снос оно отыгрывало вязкостью и снова висело над кончиком. */
        const away = Math.sign(ring.vx || dx || (Math.random() - 0.5));
        ring.x = list[i] + away * (RING_R + THICK / 2);
        ring.vx = away * (Math.abs(ring.vx) + 0.35);
        ring.vy = Math.abs(ring.vy) * 0.4;
        ring.spin += away * 3;
        return false;
      }

      /* Соосному кольцу зубец не мешает ни снизу вверх, ни на подлёте
         сверху: над кончиком там просто нет материала. */
      if (ring.y < TOP || (axial && ring.vy <= 0)) return false;

      const push = Math.sign(dx || 1);
      ring.x += (list[i] + push * (RING_R + THICK / 2) - ring.x) * 0.35;
      if (Math.hypot(ring.vx, ring.vy) > 0.06) {
        ring.vx = push * Math.max(Math.abs(ring.vx), Math.abs(ring.vy) * 0.6) * 0.7;
        ring.vy *= 0.6;
        ring.spin += push * 2;
      }
      return false;
    }
    return false;
  }

  /* Кольцо надето, а не приклеено: просвет шире стержня, поэтому на рывок
     буквы оно отвечает с опозданием и стукается о стержень изнутри. */
  function stack(ring) {
    const tooth = teeth()[ring.pinned.tooth];
    ring.x += ring.vx * STEP;
    ring.vx -= ring.vx * DRAG_X * 1.6 * STEP;
    const slack = ring.x - tooth;
    if (Math.abs(slack) > LUFT) {
      ring.x = tooth + Math.sign(slack) * LUFT;
      ring.vx = (rig.v - ring.vx) * 0.25;
    }

    /* Крен идёт от собственного хода: кольцо заваливается туда, куда его
       тащит стержень, и выравнивается, когда буква останавливается. */
    const lean = clamp((rig.v - ring.vx) * LEAN * 0.08, -0.22, 0.22);
    ring.tilt += (lean - ring.tilt) * 0.14;
    ring.phase += (Math.PI / 2 - ring.phase) * 0.12;

    ring.vy += GRAVITY * DRAG_Y * STEP;
    blow(ring);
    ring.vy -= ring.vy * STACK_DRAG * STEP;
    ring.y += ring.vy * STEP;
  }

  /* Стопка разбирается снизу вверх: кольца с одинаковой высотой друг друга
     не видят и слипаются, если сравнивать их по одному. */
  function pile() {
    for (let tooth = 0; tooth < 3; tooth++) {
      const column = rings.filter(r => r.pinned?.tooth === tooth).sort((a, b) => b.y - a.y);
      let floor = BOTTOM - THICK / 2 - SLOT_H / 2;
      for (const ring of column) {
        if (ring.y > floor) { ring.y = floor; ring.vy = Math.min(ring.vy, 0); }
        floor = ring.y - SLOT_H;
        /* Кончик — единственный выход: соскочило через него, и кольцо снова
           в воде, со всей набранной скоростью. */
        if (ring.y < TOP - RING_R * 0.4) {
          ring.pinned = null;
          ring.spin = (Math.random() - 0.5) * 6;
        }
      }
    }
  }

  function swim(ring) {
    if (ring.pinned) {
      ring.stall = 0;
      stack(ring);
      return;
    }

    /* Страховка от шляпы: кольцо, засидевшееся у кончика, сваливается само.
       Повод залипания неважен — лежать ему там нечего. */
    const nearTip = Math.abs(ring.y - TOP) < RING_R * 1.6
      && teeth().some(t => Math.abs(ring.x - t) < RING_R);
    ring.stall = nearTip ? ring.stall + STEP : 0;
    if (ring.stall > 1.2) {
      ring.vx += (ring.x < 0.5 ? -1 : 1) * 0.35;
      ring.vy = 0.15;
      ring.spin += 2;
      ring.stall = 0;
    }

    ring.previousX = ring.x;
    ring.previousY = ring.y;
    plough(ring);
    suck(ring);
    blow(ring);

    ring.vy += GRAVITY * DRAG_Y * STEP;
    ring.vy -= ring.vy * DRAG_Y * STEP;
    ring.vx -= ring.vx * DRAG_X * STEP;
    ring.x += ring.vx * STEP;
    ring.y += ring.vy * STEP;

    /* Кольцо в воде разворачивается плашмя: плоскость встаёт поперёк потока.
       Падение доворачивает быстрее, но и висящее вода в конце концов кладёт. */
    const level = Math.round((ring.phase - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
    const grip = Math.min((Math.abs(ring.vy) + 0.12) / ALIGN_MAX, 1);
    ring.spin += (level - ring.phase) * ALIGN * grip * STEP * 60 * STEP;
    ring.phase += ring.spin * STEP;
    ring.spin -= ring.spin * SPIN_DRAG * STEP;

    if (ring.x < RING_R) { ring.x = RING_R; ring.vx = Math.abs(ring.vx) * 0.4; }
    if (ring.x > 1 - RING_R) { ring.x = 1 - RING_R; ring.vx = -Math.abs(ring.vx) * 0.4; }
    if (ring.y > BOTTOM - RING_LINE) {
      ring.y = BOTTOM - RING_LINE;
      ring.vy = 0;
      ring.phase += (level - ring.phase) * 0.12;
      ring.spin *= 0.8;
    }
    if (ring.y < RING_R) { ring.y = RING_R; ring.vy = Math.abs(ring.vy) * 0.3; }
    hitTooth(ring);
  }

  /* Кольца не проходят друг сквозь друга: без этого струя сгоняет их в одну
     точку, и дальше они живут как одно кольцо. */
  function crowd() {
    for (let i = 0; i < rings.length; i++) {
      const a = rings[i];
      if (a.pinned) continue;
      for (let j = i + 1; j < rings.length; j++) {
        const b = rings[j];
        if (b.pinned) continue;
        const dx = b.x - a.x;
        const dy = (b.y - a.y) * 2.2;   /* по вертикали кольца плоские */
        const dist = Math.hypot(dx, dy);
        const min = RING_R * 1.7;
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

  function puff() {
    for (const jet of jets) {
      if (!jet.on) continue;
      jet.bubbles += BUBBLE_RATE * STEP;
      while (jet.bubbles >= 1) {
        jet.bubbles--;
        bubbles.push({
          x: jet.x + rand(-JET_CONE, JET_CONE),
          y: BOTTOM - 0.005,
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

  function finish() {
    round.over = true;
    round.result = Math.max(0.1, Math.round(round.time * 10) / 10);
    releaseControls();
    if (competitive && (!best || round.result < best)) {
      best = round.result;
      localStorage.setItem(BEST_KEY, String(best));
    }
    /* Наверх уходят очки, а не секунды: чем быстрее раунд, тем их больше. */
    if (competitive && !sent) { sent = true; reportScore('Ш', Math.round(10000 / round.result)); }
  }

  function step() {
    if (!round.started || round.paused || round.over) return;
    clock += STEP;
    const direction = Number(heldKeys.has('ArrowRight')) - Number(heldKeys.has('ArrowLeft'));
    rig.target = clamp(rig.target + direction * 0.7 * STEP, HALF, 1 - HALF);
    const move = clamp((rig.target - rig.x) * 0.22, -RIG_SPEED * STEP, RIG_SPEED * STEP);
    rig.x += move;
    rig.v = move / STEP;

    puff();
    for (const ring of rings) swim(ring);
    pile();
    crowd();

    const secure = done() === params.rings
      && rings.every(r => r.y > TOP + RING_R * 0.4 && Math.abs(r.vy) < 0.04);
    round.stable = secure ? round.stable + STEP : 0;
    if (round.stable >= FINISH_HOLD) finish();
  }

  /* half: 'back' — дальняя дуга, 'front' — ближняя, иначе кольцо целиком.
     Двумя дугами, а не полным эллипсом с накладкой: наложение давало шов. */
  function ringPath(ring, half) {
    const from = half === 'front' ? 0 : Math.PI;
    const to = half === 'front' ? Math.PI : Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(ring.x * S, ring.y * S, RING_R * S, RING_R * flatness(ring) * S,
      ring.tilt, half ? from : 0, half ? to : Math.PI * 2);
  }

  /* Тёмный подбой кладётся первым и шире — он и есть та обводка, которой
     кольцо читается поверх белого зубца. */
  function drawRing(ring, half) {
    ctx.lineCap = 'butt';
    ringPath(ring, half);
    ctx.strokeStyle = INK;
    ctx.lineWidth = (RING_LINE + 0.008) * S;
    ctx.stroke();
    ringPath(ring, half);
    ctx.strokeStyle = ring.pinned && ring.vy < -0.03 && ring.y < TOP + RING_R * 2 ? RED : PAPER;
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

  const seconds = value => `${value.toFixed(1)} с`;
  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function drawStatus() {
    setText(count, `${done()} / ${params.rings}${competitive ? '' : ' · песочница'}`);
    setText(timer, seconds(round.over ? round.result : round.time));
    setText(message, round.over ? 'все кольца на месте'
      : round.paused ? 'пауза · коснись сцены'
      : !round.started ? 'удерживай струи · собери кольца'
      : done() === params.rings ? 'дай кольцам осесть' : '');
    setText(result, round.over
      ? competitive ? `рекорд ${seconds(best)} · очки: ${Math.round(10000 / round.result)}` : 'песочница · без зачёта' : '');
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    ctx.translate(ox, oy);
    drawBubbles();
    /* Дно лежит за полозьями: улёгшееся кольцо уходит под букву, а не
       ложится ей на спину — вытеснить прижатое к стенке некуда. */
    const lying = r => !r.pinned && r.y > BOTTOM - THICK;
    for (const ring of rings) if (lying(ring)) drawRing(ring, null);
    for (const ring of rings) if (ring.pinned) drawRing(ring, 'back');
    drawRig();
    for (const ring of rings) if (ring.pinned) drawRing(ring, 'front');
    for (const ring of rings) if (!ring.pinned && !lying(ring)) drawRing(ring, null);
    drawStatus();
  }

  function frame(now) {
    const elapsed = Math.max(0, (now - last) / 1000);
    last = now;
    if (round.started && !round.paused && !round.over) round.time += elapsed;
    debt = Math.min(0.1, debt + elapsed);
    while (debt >= STEP) { step(); debt -= STEP; }
    draw();
    frameId = requestAnimationFrame(frame);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    S = Math.min(W, Math.max(1, H - 36));
    ox = (W - S) / 2;
    oy = (H - 36 - S) / 2;
    jetButtons.forEach((button, i) => {
      button.style.left = `${ox + JETS[i] * S}px`;
      button.style.top = `${oy + 0.91 * S}px`;
    });
  }

  function track(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left - ox) / S;
    pointer.y = (event.clientY - rect.top - oy) / S;
  }

  function activate() {
    if (round.over) return false;
    if (!round.started || round.paused) {
      round.started = true;
      round.paused = false;
      last = performance.now();
      debt = 0;
    }
    return true;
  }

  function syncJets() {
    jets.forEach((jet, i) => {
      jet.on = heldKeys.has(JET_KEYS[i]) || heldKeys.has(`button-${i}`) || [...contacts.values()].includes(i);
      jetButtons[i].setAttribute('aria-pressed', String(jet.on));
    });
  }

  function releaseControls() {
    heldKeys.clear();
    contacts.clear();
    syncJets();
  }

  function pause() {
    if (round.started && !round.over && !round.paused) {
      round.time += Math.max(0, (performance.now() - last) / 1000);
      round.paused = true;
    }
    releaseControls();
    debt = 0;
  }

  function visibility() {
    if (document.hidden) pause();
  }

  function down(event) {
    if (event.button !== 0 || !activate()) return;
    event.preventDefault();
    track(event);
    contacts.set(event.pointerId, 'rig');
    canvas.setPointerCapture(event.pointerId);
    rig.target = clamp(pointer.x, HALF, 1 - HALF);
  }

  function move(event) {
    if (!round.started || round.paused || round.over) return;
    if (event.pointerType !== 'mouse' && contacts.get(event.pointerId) !== 'rig') return;
    track(event);
    rig.target = clamp(pointer.x, HALF, 1 - HALF);
  }

  function up(event) {
    contacts.delete(event.pointerId);
    syncJets();
  }

  function key(event) {
    if (event.target.closest('input, textarea, select') || event.target.isContentEditable) return;
    if (event.code === 'Tab') {
      event.preventDefault();
      toggle.click();
      return;
    }
    if (panel.contains(event.target)) return;
    if (event.code === 'KeyR' || (event.code === 'Enter' && round.over)) {
      event.preventDefault();
      if (!event.repeat) seed();
      return;
    }
    if (!JET_KEYS.includes(event.code) && !['ArrowLeft', 'ArrowRight'].includes(event.code)) return;
    event.preventDefault();
    if (event.repeat && (!round.started || round.paused)) return;
    if (!activate()) return;
    heldKeys.add(event.code);
    syncJets();
  }

  function keyUp(event) {
    heldKeys.delete(event.code);
    syncJets();
  }

  const layer = document.createElement('div');
  layer.className = 'sh-controls';
  layer.dataset.letterLayer = '';
  layer.innerHTML = `
    <div class="sh-status"><span class="sh-count"></span><button type="button" class="sh-restart">заново</button><span class="sh-timer"></span></div>
    <div class="sh-message" role="status"></div><div class="sh-result"></div>
    <button type="button" class="sh-jet" aria-label="Левая струя · удерживать">Q<span>↑</span></button>
    <button type="button" class="sh-jet" aria-label="Средняя струя · удерживать">W<span>↑</span></button>
    <button type="button" class="sh-jet" aria-label="Правая струя · удерживать">E<span>↑</span></button>`;
  const count = layer.querySelector('.sh-count');
  const timer = layer.querySelector('.sh-timer');
  const message = layer.querySelector('.sh-message');
  const result = layer.querySelector('.sh-result');
  const restart = layer.querySelector('.sh-restart');
  const jetButtons = [...layer.querySelectorAll('.sh-jet')];
  restart.addEventListener('click', seed);
  jetButtons.forEach((button, i) => {
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !activate()) return;
      event.preventDefault();
      contacts.set(event.pointerId, i);
      button.setPointerCapture(event.pointerId);
      syncJets();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, up);
    button.addEventListener('keydown', event => {
      if (!['Space', 'Enter'].includes(event.code)) return;
      event.preventDefault();
      event.stopPropagation();
      if (activate()) { heldKeys.add(`button-${i}`); syncJets(); }
    });
    button.addEventListener('keyup', event => {
      if (!['Space', 'Enter'].includes(event.code)) return;
      event.preventDefault();
      heldKeys.delete(`button-${i}`);
      syncJets();
    });
    button.addEventListener('blur', () => { heldKeys.delete(`button-${i}`); syncJets(); });
  });

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'Удерживай кнопки струй или Q W E. Веди Ш пальцем, мышью или ← →. '
    + 'Лови падающие кольца через кончики. Красное — кольцо срывается. Заново — R.';

  const panel = document.createElement('div');
  panel.className = 'sketch-panel sh-panel';
  panel.dataset.letterLayer = '';
  panel.id = 'sh-panel';
  panel.hidden = true;
  const modes = document.createElement('div');
  modes.className = 'sketch-modes';
  const panelNote = document.createElement('p');
  panel.append(modes, panelNote);
  const modeButtons = [true, false].map(play => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sketch-mode';
    button.textContent = play ? 'на рекорд' : 'песочница';
    button.addEventListener('click', () => {
      if (competitive === play) return;
      competitive = play;
      seed();
      syncPanel();
    });
    modes.append(button);
    return button;
  });
  const fields = [
    { key: 'rings', label: 'кольца', min: 3, max: 15, step: 1 },
    { key: 'force', label: 'сила струй', min: 2, max: 10, step: 0.5 },
    { key: 'catchFlat', label: 'допуск наклона', min: 0.2, max: 1, step: 0.1 },
  ].map(field => {
    const label = document.createElement('label');
    const caption = document.createElement('span');
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min: field.min, max: field.max, step: field.step });
    input.addEventListener('input', () => {
      if (competitive) return;
      params[field.key] = Number(input.value);
      seed();
      syncPanel();
    });
    label.append(caption, input);
    panel.append(label);
    return { ...field, input, caption };
  });
  function syncPanel() {
    modeButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(competitive === (i === 0))));
    panelNote.textContent = competitive ? 'Фиксированные условия. Результат идёт в зачёт.'
      : 'Без зачёта. Изменение параметра начинает раунд заново.';
    for (const field of fields) {
      field.input.disabled = competitive;
      field.input.value = params[field.key];
      field.caption.textContent = `${field.label} · ${params[field.key]}`;
    }
  }
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'sketch-toggle';
  toggle.dataset.letterLayer = '';
  toggle.textContent = 'параметры (tab)';
  toggle.setAttribute('aria-controls', panel.id);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) pause();
  });
  syncPanel();

  const observer = new ResizeObserver(resize);
  observer.observe(workspace);
  resize();
  seed();
  workspace.append(layer, hint, panel, toggle);

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up);
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('keydown', key);
  document.addEventListener('keyup', keyUp);
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    observer.disconnect();
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('lostpointercapture', up);
    window.removeEventListener('blur', pause);
    document.removeEventListener('visibilitychange', visibility);
    layer.remove();
    panel.remove();
    toggle.remove();
    document.removeEventListener('keydown', key);
    document.removeEventListener('keyup', keyUp);
    hint.remove();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
