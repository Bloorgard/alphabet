/* Й — краткая над И, только здесь они поменялись ролями. Скоба жёсткая и
   висит сверху деталью, а буква — верёвка, перекинутая через её перекладину:
   короткая стойка слева, глубокая чаша, длинная стойка справа. Ничего не
   привязано, держит только трение об обхват.

   Отсюда всё поведение. Тянешь за хвост — верёвка перебирается через виток,
   второй хвост укорачивается, и буква расползается на глазах. Вытянул до
   конца — витку не за что держаться, верёвка падает. Закинуть обратно —
   то же самое движение: занёс кусок за перекладину и отпустил.

   Скоба разомкнута вверх, и на её внешнем углу верёвке держаться не за что:
   выпуклость смотрит вниз, такая поверхность может только толкать. Поэтому
   обхват живёт на перекладине, а не на углах.

   Рисование в два слоя: левая ветвь обхвата и гребень идут поверх детали,
   правая уходит за неё. Прятать за перекладину обе нельзя — тогда деталь
   режет верёвку пополам и та читается проткнувшей. Это единственное место,
   где сцена помнит про третье измерение.

   Красный тут не событие, а сама буква: скоба — деталь, верёвка — Й. */

const STEP = 1 / 60;
const RED = '#e0210f';
const MARK = [22, 22, 22];

const BRACE = { x1: 0.315, x2: 0.685, bar: 0.215, r: 0.024, top: -0.06 };
const BRACE_HALF = 0.0085;   // половина толщины скобы
const CORD_N = 72;
const CORD_HALF = 0.008;     // половина толщины верёвки
const RELAX = 8;
const FLOOR = 0.93;          // пол: сдёрнутой верёвке есть куда лечь
const SLIDE = 0.0016;        // насколько виток ползёт вдоль перекладины за кадр
const SETTLE = 60;           // кадры после броска, когда перевес ещё не считают

const PARAMS = {
  length: 4.2,
  gravity: 7,
  air: 0.03,
  friction: 0.5,
};

const CONTROLS = [
  { key: 'length', label: 'длина', min: 2, max: 6, step: 0.05 },
  { key: 'gravity', label: 'тяжесть', min: 1, max: 14, step: 0.5 },
  { key: 'air', label: 'вязкость', min: 0, max: 0.2, step: 0.005 },
  { key: 'friction', label: 'трение о скобу', min: 0, max: 1, step: 0.02 },
];

/* Раскладка на старте развешена руками: доли — сколько верёвки уходит в левый
   хвост, в провис и в правый. Провис задаётся длиной, а не глубиной: глубина
   под неё подбирается делением пополам, иначе на другой длине верёвки чаша
   меняла бы долю и раскладка переставала быть той самой. */
const LAUNCH = {
  left: 0.3637,                   // где лежит левый виток
  right: 0.6339,                  // где правый
  share: [0.113, 0.606, 0.281],   // левый хвост, провис, правый хвост
};

/* Скоба ломаной: по ней деталь и рисуется, и отталкивает верёвку. Углы
   разложены на отрезки — верёвке нужна поверхность, а не команда дуги. */
const BRACE_LINE = (() => {
  const points = [[BRACE.x1, BRACE.top], [BRACE.x1, BRACE.bar - BRACE.r]];
  const arc = (cx, cy, from, to) => {
    for (let i = 1; i <= 6; i += 1) {
      const a = from + (to - from) * (i / 6);
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

// Куда виток может встать: по перекладине, не заходя на скругления.
const BAR_FROM = BRACE.x1 + BRACE.r;
const BAR_TO = BRACE.x2 - BRACE.r;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function plural(n, forms) {
  const ten = n % 10;
  const hundred = n % 100;
  if (ten === 1 && hundred !== 11) return forms[0];
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return forms[1];
  return forms[2];
}

// Ближайшая точка отрезка — вся геометрия касания держится на ней.
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

/* Верёвка рождается уже перекинутой: хвост, обхват, провис, обхват, хвост.
   Длина звена берётся из самой раскладки, поэтому первый кадр обходится
   без рывка. */
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

  /* Витки ставятся прямо по долям, а не пересобираются по форме: пересборка
     берёт середину куска над перекладиной, и виток уезжает от заданного места
     на ползвена. На старте место должно быть тем самым. */
  return {
    points,
    rest: laid / (CORD_N - 1),
    hold: -1,
    settle: SETTLE,
    wraps: [
      { at: Math.round(LAUNCH.share[0] * (CORD_N - 1)), x: LAUNCH.left, pull: 0, side: 0 },
      { at: Math.round((LAUNCH.share[0] + LAUNCH.share[1]) * (CORD_N - 1)), x: LAUNCH.right, pull: 0, side: 0 },
    ],
  };
}

/* Витки пересобираются по верёвке: каждый сплошной кусок, лежащий выше
   перекладины, — это один обхват, и держится он серединой этого куска.
   Поэтому «закинуть за перекладину» — не отдельная команда, а то же самое
   движение: занёс и отпустил. */
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

/* Переступ витка вдоль верёвки: перевесила одна сторона — обхват сползает
   к другой, и её хвост удлиняется. Дошло до конца верёвки — витку не за что
   держаться. Заодно виток ползёт вбок, если верёвка тянет его вдоль
   перекладины, и сходит со скругления.

   Мгновенный перевес мерить нельзя: по верёвке ходят волны, и разность звеньев
   скачет знаком вдесятеро больше самого перевеса — виток перебирал бы верёвку
   от собственной дрожи. Поэтому перевес усредняется, а после переступа среднее
   сбрасывается вполовину: один переступ уже снял часть тяги. */
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

export function mountJ(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { ...PARAMS };
  let cord = makeCord(params.length);

  workspace.dataset.ground = 'paper';
  canvas.style.cursor = 'grab';

  let S = 1;
  let frameId = 0;
  let debt = 0;
  let last = performance.now();
  const pointer = { x: 0.5, y: 0.5 };

  const ink = (alpha) => `rgba(${MARK[0]},${MARK[1]},${MARK[2]},${alpha})`;

  function resize() {
    const bounds = workspace.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    S = Math.max(1, Math.min(bounds.width, bounds.height));
    canvas.width = Math.round(bounds.width * dpr);
    canvas.height = Math.round(bounds.height * dpr);
    canvas.style.width = `${bounds.width}px`;
    canvas.style.height = `${bounds.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function advance() {
    const damp = 1 - params.air;
    const gravity = params.gravity * STEP * STEP;

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

      /* Обхват — три точки: левая на самой детали, средняя над её кромкой,
         правая опять на детали. Левая ветвь пойдёт поверх перекладины,
         правая за ней — так верёвка и читается перекинутой. */
      for (const wrap of cord.wraps) {
        for (let j = -1; j <= 1; j += 1) {
          const p = cord.points[wrap.at + j];
          p.x = wrap.x + j * CORD_HALF;
          p.y = BRACE.bar - (j === 0 ? BRACE_HALF + CORD_HALF * 0.45 : 0);
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
    const slip = cord.rest * (0.02 + params.friction * 1.5);
    cord.wraps = cord.wraps.filter((wrap) => feedWrap(cord, wrap, slip));
  }

  /* Подпись встаёт в верхнюю строку между заголовком слева и крестиком
     справа, поэтому берёт их же кегль в пикселях. */
  function status(text, hot) {
    ctx.fillStyle = hot ? RED : ink(0.5);
    ctx.font = "10px 'DM Mono', ui-monospace, monospace";
    ctx.letterSpacing = '.08em';
    ctx.textAlign = 'center';
    ctx.fillText(text.toUpperCase(), S / 2, 24);
    ctx.textAlign = 'left';
    ctx.letterSpacing = '0px';
  }

  /* Верёвка идёт кривой по серединам звеньев, а не ломаной: на обхвате угол
     между звеньями большой, и ломаная встала бы там углом. */
  function run(points) {
    if (points.length < 2) return;
    ctx.moveTo(points[0].x * S, points[0].y * S);
    for (let i = 1; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      ctx.quadraticCurveTo(a.x * S, a.y * S, ((a.x + b.x) / 2) * S, ((a.y + b.y) / 2) * S);
    }
    const end = points[points.length - 1];
    ctx.lineTo(end.x * S, end.y * S);
  }

  /* Спереди детали — всё, что ниже её нижней кромки, и левая ветвь обхвата
     вместе с гребнем. Правая ветвь уходит за перекладину. */
  function inFront(p) {
    if (p.y > BRACE.bar + BRACE_HALF) return true;
    let near = 0.06;
    let own = null;
    for (const wrap of cord.wraps) {
      const d = Math.abs(p.x - wrap.x);
      if (d < near) { near = d; own = wrap; }
    }
    return own ? p.x < own.x + CORD_HALF * 0.5 : false;
  }

  function rope(front) {
    ctx.strokeStyle = RED;
    ctx.lineWidth = S * CORD_HALF * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let piece = [];
    for (const p of cord.points) {
      if (front && !inFront(p)) { run(piece); piece = []; continue; }
      piece.push(p);
    }
    run(piece);
    ctx.stroke();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    rope(false);

    ctx.beginPath();
    ctx.moveTo(BRACE_LINE[0][0] * S, BRACE_LINE[0][1] * S);
    for (const [x, y] of BRACE_LINE) ctx.lineTo(x * S, y * S);
    ctx.strokeStyle = ink(1);
    ctx.lineWidth = S * BRACE_HALF * 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    ctx.stroke();

    rope(true);

    const count = cord.wraps.length;
    if (count) status(`${count} ${plural(count, ['виток', 'витка', 'витков'])}`);
    else status('сдёрнут', true);
  }

  function frame(now) {
    debt = Math.min(0.1, debt + (now - last) / 1000);
    last = now;
    while (debt >= STEP) {
      advance();
      debt -= STEP;
    }
    draw();
    frameId = requestAnimationFrame(frame);
  }

  function track(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - bounds.left) / S;
    pointer.y = (event.clientY - bounds.top) / S;
  }

  function onDown(event) {
    track(event);
    let best = -1;
    let near = 0.06;
    for (let i = 0; i < cord.points.length; i += 1) {
      const d = Math.hypot(cord.points[i].x - pointer.x, cord.points[i].y - pointer.y);
      if (d < near) { near = d; best = i; }
    }
    cord.hold = best;
    if (best >= 0) canvas.style.cursor = 'grabbing';
    try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* Safari может отказать */ }
  }

  // Отпустили — верёвка ложится: всё, что занесено за перекладину, стало обхватом.
  function onUp() {
    if (cord.hold < 0) return;
    cord.hold = -1;
    canvas.style.cursor = 'grab';
    rebuildWraps(cord);
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'верёвка ничем не привязана · тяни за хвост, а сдёрнутую закидывай обратно';

  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.hidden = true;

  for (const control of CONTROLS) {
    const label = document.createElement('label');
    label.textContent = control.label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = control.min;
    input.max = control.max;
    input.step = control.step;
    input.value = params[control.key];
    input.addEventListener('input', () => {
      params[control.key] = Number(input.value);
      // Длина — это сама раскладка: её меняют, развесив верёвку заново.
      if (control.key === 'length') cord = makeCord(params.length);
    });
    label.append(input);
    panel.append(label);
  }

  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'sketch-action';
  again.textContent = 'перекинуть заново';
  again.addEventListener('click', () => { cord = makeCord(params.length); });
  panel.append(again);

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

  // Внутри открытой панели Tab по-прежнему переставляет фокус между ползунками.
  function onKeyDown(event) {
    if (event.key !== 'Tab' || event.target.closest('input, textarea')) return;
    event.preventDefault();
    toggle.click();
  }

  workspace.append(hint, panel, toggle);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(workspace);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', track);
  window.addEventListener('pointerup', onUp);
  document.addEventListener('keydown', onKeyDown);

  resize();
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', track);
    window.removeEventListener('pointerup', onUp);
    document.removeEventListener('keydown', onKeyDown);
    hint.remove();
    panel.remove();
    toggle.remove();
    delete workspace.dataset.ground;
    canvas.style.cursor = '';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
