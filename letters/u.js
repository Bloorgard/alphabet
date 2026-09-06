const STEP = 1 / 60;
const INK = '#161616';
const PAPER = '#f1ede5';
const RED = '#e0210f';

const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (x) => x * x * (3 - 2 * x);
const hexRgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

const INK_RGB = hexRgb(INK);
const PAPER_RGB = hexRgb(PAPER);
const RED_RGB = hexRgb(RED);
const SUNSET_RGB = hexRgb('#ef8d8a');
const SKY_RGB = hexRgb('#afc4e5');

function mixTone(target, t) {
  const r = Math.round(PAPER_RGB[0] + (target[0] - PAPER_RGB[0]) * t);
  const g = Math.round(PAPER_RGB[1] + (target[1] - PAPER_RGB[1]) * t);
  const b = Math.round(PAPER_RGB[2] + (target[2] - PAPER_RGB[2]) * t);
  return `rgb(${r},${g},${b})`;
}

const DEFAULTS = {
  berries: true,
  berryDensity: 0.12,
  berrySize: 1,
  wind: true,
  sunset: false,
  sky: false,
};

// Ветка-генератор дерева У: развилка + два плеча + нога, асимметрично,
// без единого зеркала — см. lab/u-research.md, «дерево У».
function growBranch(rnd, layer, x, y, angle, length, width, depth, leafTips) {
  const points = [{ x, y, w: width }];
  for (let i = 1; i <= 5; i++) {
    angle += (rnd() - 0.5) * 0.27;
    x += Math.cos(angle) * length / 5;
    y += Math.sin(angle) * length / 5;
    points.push({ x, y, w: width * (1 - i * 0.09) });
  }
  layer.branches.push(points);
  if (depth <= 0) { leafTips.push({ p: points[points.length - 1], parallax: layer.parallax, layer }); return; }
  growBranch(rnd, layer, x, y, angle + (rnd() - 0.5) * 0.25, length * (0.69 + rnd() * 0.13), width * 0.53, depth - 1, leafTips);
  const p = points[3];
  growBranch(rnd, layer, p.x, p.y, angle + (rnd() < 0.5 ? -1 : 1) * (0.42 + rnd() * 0.65), length * (0.44 + rnd() * 0.25), width * 0.32, depth - 1, leafTips);
}

function growFrontBranch(rnd, front, start, dir, length, width, depth, leafTips) {
  const points = [{ x: start.x - Math.cos(dir) * width * 0.3, y: start.y - Math.sin(dir) * width * 0.3, w: width }];
  let x = start.x, y = start.y;
  for (let i = 1; i <= 5; i++) {
    dir += (rnd() - 0.5) * 0.32;
    x += Math.cos(dir) * length / 5;
    y += Math.sin(dir) * length / 5;
    points.push({ x, y, w: width * (1 - i * 0.11) });
  }
  front.branches.push(points);
  if (depth > 0) {
    growFrontBranch(rnd, front, points[5], dir + (rnd() - 0.5) * 0.4, length * (0.62 + rnd() * 0.18), width * 0.45, depth - 1, leafTips);
    const p = points[2 + Math.floor(rnd() * 2)];
    growFrontBranch(rnd, front, p, dir + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), length * (0.45 + rnd() * 0.25), p.w * 0.36, depth - 1, leafTips);
  } else leafTips.push({ p: points[points.length - 1], parallax: 1, layer: front });
}

function generateComposition(seed) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const layers = [];
  const leafTips = [];

  // Задний план: четыре случайных слоя, свободные деревья без привязки к
  // силуэту буквы — приём «между ветвями» из полигона.
  const back = [];
  for (const [x, y, scale, alpha, parallax] of [[.7, 1.15, .5, .09, .09], [.38, 1.2, .6, .14, .15], [.93, 1.1, .72, .25, .25], [.48, 1.26, .77, .6, .43]]) {
    const layer = { branches: [], alpha, parallax };
    growBranch(rnd, layer, x + (rnd() - 0.5) * 0.12, y + (rnd() - 0.5) * 0.1, -1.75 + (rnd() - 0.5) * 0.35, 0.34 * scale * (0.85 + rnd() * 0.3), 0.045 * scale, 6, leafTips);
    back.push(layer);
    layers.push(layer);
  }
  // Порядок проявления — от тёмного (близкого) к светлому (дальнему).
  [...back].sort((a, b) => b.alpha - a.alpha).forEach((layer, order) => { layer.order = order; });

  // Передний план: процедурное дерево-У, а не зашитый вручную силуэт.
  const front = { branches: [], alpha: 1, parallax: 1, front: true };
  const junction = { x: .3 + rnd() * .42, y: .32 + rnd() * .34 };
  const angle = -1.32 + (rnd() - .5) * .8;
  const thickness = .09 + rnd() * .10;
  const trunk = [{ x: junction.x + Math.cos(angle) * thickness * .45, y: junction.y + Math.sin(angle) * thickness * .45, w: thickness }, { ...junction, w: thickness }];
  let tx = junction.x, ty = junction.y, tdir = angle + Math.PI;
  for (let i = 1; i <= 6; i++) {
    tdir += (rnd() - .5) * .25;
    tx += Math.cos(tdir) * .17;
    ty += Math.sin(tdir) * .17;
    trunk.push({ x: tx, y: ty, w: thickness * (1 + i * .14) });
  }
  front.branches.push(trunk);
  growFrontBranch(rnd, front, junction, angle, .32 + rnd() * .3, thickness * .9, 5, leafTips);
  growFrontBranch(rnd, front, junction, angle - (.65 + rnd() * .6), .28 + rnd() * .24, thickness * (.48 + rnd() * .2), 5, leafTips);
  if (rnd() > .35) growFrontBranch(rnd, front, trunk[2], angle + 1.15, .3 + rnd() * .2, trunk[2].w * .35, 4, leafTips);
  const zoom = .85 + rnd() * .4;
  for (const points of front.branches) for (const p of points) { p.x = junction.x + (p.x - junction.x) * zoom; p.y = junction.y + (p.y - junction.y) * zoom; p.w *= zoom; }
  layers.push(front);

  // Рябина — гроздь 2-4 ягоды на настоящих концах тонких веток (там, где
  // рекурсия остановилась), не на любом стыке. Плотность/размер решаются
  // при отрисовке, тут только фиксируем, кто вообще может нести гроздь.
  const berries = [];
  for (const leaf of leafTips) {
    if (leaf.p.w > 0.016) continue;
    const count = 2 + Math.floor(rnd() * 3);
    const seeds = [];
    for (let k = 0; k < count; k++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 0.014;
      seeds.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, base: (0.0016 + leaf.p.w * 0.32) * (0.6 + rnd() * 0.7) });
    }
    berries.push({ tip: leaf.p, parallax: leaf.parallax, layer: leaf.layer, roll: rnd(), seeds });
  }

  return { layers, berries };
}

export function mountU(workspace) {
  workspace.dataset.ground = 'paper';
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { ...DEFAULTS };
  const pointer = { x: 0, y: 0, seen: false, down: false };
  const state = {};
  let W = 1, H = 1, S = 1, ox = 0, oy = 0, dpr = 1;
  let last = performance.now();
  let debt = 0;
  let frameId = 0;

  function reset() {
    const composition = generateComposition(Math.floor(Math.random() * 4294967296));
    Object.assign(state, composition, {
      view: { x: 0, y: 0 }, target: { x: 0, y: 0 }, grab: null,
      windPrev: null, reveal: 0, berryVisible: params.berries ? 1 : 0,
    });
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
    pointer.seen = true;
  }

  function step() {
    const m = state;
    m.view.x += (m.target.x - m.view.x) * .13;
    m.view.y += (m.target.y - m.view.y) * .13;
    // Таймлайн проявления растянут за 1: деревья укладываются в [0,1],
    // рябина проявляется отдельным окном следом, в [1,1.4].
    m.reveal = Math.min(1.5, (m.reveal || 0) + STEP / 1.6);
    // Видимость рябины от тумблера — плавная величина, не резкий щелчок.
    const berryTarget = params.berries ? 1 : 0;
    m.berryVisible = (m.berryVisible ?? berryTarget) + (berryTarget - (m.berryVisible ?? berryTarget)) * .08;

    // Ветер: толчок вдоль вектора движения курсора (порыв), не радиально от
    // его точки — иначе неподвижная мышь выглядит как застывшая линза.
    // Пружина на каждой точке (bx/by — смещение, vx/vy — скорость) даёт
    // инерцию и лёгкий перелёт вместо мгновенного прилипания.
    if (!m.windPrev) m.windPrev = { x: pointer.x, y: pointer.y };
    const seen = pointer.seen && params.wind;
    const windX = seen ? pointer.x - m.windPrev.x : 0;
    const windY = seen ? pointer.y - m.windPrev.y : 0;
    m.windPrev = { x: pointer.x, y: pointer.y };
    const K = 70, C = 9, GUST = 170, MAXB = 0.08;
    for (const layer of m.layers) {
      const shiftX = m.view.x * layer.parallax, shiftY = m.view.y * layer.parallax;
      const px = pointer.x - shiftX, py = pointer.y - shiftY;
      for (const points of layer.branches) for (const p of points) {
        let fx = -K * (p.bx || 0) - C * (p.vx || 0), fy = -K * (p.by || 0) - C * (p.vy || 0);
        if (seen) {
          const dist = Math.hypot(p.x - px, p.y - py) || 1;
          const reach = Math.max(0, 1 - dist / .18);
          if (reach > 0) {
            const soft = clamp(1 - p.w / .02, 0, 1);
            fx += windX * GUST * reach * soft;
            fy += windY * GUST * reach * soft;
          }
        }
        const vx = (p.vx || 0) + fx * STEP, vy = (p.vy || 0) + fy * STEP;
        let bx = (p.bx || 0) + vx * STEP, by = (p.by || 0) + vy * STEP;
        const mag = Math.hypot(bx, by);
        if (mag > MAXB) { bx = bx / mag * MAXB; by = by / mag * MAXB; }
        p.vx = vx; p.vy = vy; p.bx = bx; p.by = by;
      }
    }
  }

  function drawSky(rgb) {
    const g = ctx.createLinearGradient(0, 0, 0, S * 0.5);
    g.addColorStop(0, `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`);
    g.addColorStop(1, PAPER);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S * 0.5);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(ox, oy);

    const m = state;
    const t = m.reveal ?? 1;
    if (params.sunset) drawSky(SUNSET_RGB);
    if (params.sky) drawSky(SKY_RGB);

    const berryReveal = ease(clamp((t - 1) / 0.4, 0, 1));
    const berryFactor = berryReveal * (m.berryVisible ?? 0);
    const density = params.berryDensity, size = params.berrySize;

    for (const layer of m.layers) {
      const factor = layer.front ? ease(clamp(t / 0.3, 0, 1)) : ease(clamp((t - (0.2 + layer.order * 0.1667)) / 0.3, 0, 1));
      const shiftX = m.view.x * layer.parallax, shiftY = m.view.y * layer.parallax;
      ctx.save();
      ctx.translate(shiftX * S, shiftY * S);
      ctx.fillStyle = mixTone(INK_RGB, layer.alpha * factor);
      for (const points of layer.branches) {
        const left = [], right = [];
        for (let j = 0; j < points.length; j++) {
          const p = points[j], a = points[Math.max(0, j - 1)], b = points[Math.min(points.length - 1, j + 1)];
          const ax = a.x + (a.bx || 0), ay = a.y + (a.by || 0), bx = b.x + (b.bx || 0), by = b.y + (b.by || 0);
          const px = p.x + (p.bx || 0), py = p.y + (p.by || 0);
          const len = Math.hypot(bx - ax, by - ay) || 1;
          const nx = -(by - ay) / len, ny = (bx - ax) / len;
          left.push({ x: px + nx * p.w / 2, y: py + ny * p.w / 2 });
          right.push({ x: px - nx * p.w / 2, y: py - ny * p.w / 2 });
        }
        ctx.beginPath();
        [...left, ...right.reverse()].forEach((p, k) => ctx[k ? 'lineTo' : 'moveTo'](p.x * S, p.y * S));
        ctx.closePath();
        ctx.fill();
      }
      if (berryFactor > 0.002) {
        const berryColor = mixTone(RED_RGB, berryFactor);
        for (const b of m.berries) {
          if (b.layer !== layer || b.roll > density) continue;
          const tx = b.tip.x + (b.tip.bx || 0), ty = b.tip.y + (b.tip.by || 0);
          for (const seed of b.seeds) {
            ctx.beginPath();
            ctx.arc((tx + seed.dx) * S, (ty + seed.dy) * S, seed.base * size * S, 0, Math.PI * 2);
            ctx.fillStyle = berryColor;
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function onDown(event) {
    track(event);
    pointer.down = true;
    state.grab = { x: pointer.x, y: pointer.y, vx: state.target.x, vy: state.target.y };
    canvas.setPointerCapture(event.pointerId);
  }

  function onMove(event) {
    track(event);
    const g = state.grab;
    if (pointer.down && g) {
      state.target.x = clamp(g.vx + (pointer.x - g.x) * .5, -.22, .22);
      state.target.y = clamp(g.vy + (pointer.y - g.y) * .5, -.16, .16);
    }
  }

  function onUp() {
    pointer.down = false;
    state.grab = null;
  }

  function onLeave() {
    pointer.seen = false;
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'наведите на тонкие ветки · зажмите и двигайте, чтобы сместить план · C — другая композиция';

  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.hidden = true;

  for (const [key, labelText, min, max, step] of [
    ['berryDensity', 'рябина, гуще', 0, 1, 0.05],
    ['berrySize', 'рябина, крупнее', 0.5, 2, 0.1],
  ]) {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = params[key];
    input.addEventListener('input', () => { params[key] = Number(input.value); });
    label.append(input);
    panel.append(label);
  }

  function addSwitch(key, labelText) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sketch-switch';
    button.textContent = labelText;
    button.setAttribute('aria-pressed', String(params[key]));
    button.addEventListener('click', () => {
      params[key] = !params[key];
      button.setAttribute('aria-pressed', String(params[key]));
    });
    panel.append(button);
  }
  addSwitch('berries', 'ягоды');
  addSwitch('wind', 'ветер');
  addSwitch('sunset', 'закат');
  addSwitch('sky', 'небо');

  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'sketch-action';
  again.textContent = 'другая композиция';
  again.addEventListener('click', reset);
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

  function onKeyDown(event) {
    if (event.target?.closest?.('input, textarea')) return;
    if (event.key === 'Tab') { event.preventDefault(); toggle.click(); return; }
    // C — тот же физический ключ, что и «заново» в других буквах (см. o.js, s.js).
    if (event.code === 'KeyC') reset();
  }

  function frame(now) {
    debt = Math.min(0.1, debt + (now - last) / 1000);
    last = now;
    while (debt >= STEP) { step(); debt -= STEP; }
    draw();
    frameId = requestAnimationFrame(frame);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(workspace);
  workspace.append(hint, panel, toggle);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  window.addEventListener('pointerup', onUp);
  document.addEventListener('keydown', onKeyDown);
  resize();
  reset();
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    observer.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('pointerup', onUp);
    document.removeEventListener('keydown', onKeyDown);
    hint.remove();
    panel.remove();
    toggle.remove();
    delete workspace.dataset.ground;
    ctx.clearRect(0, 0, W, H);
  };
}
