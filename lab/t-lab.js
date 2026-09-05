/* Т · рост из точки.

   Штурм показал, что почти все идеи вокруг Т скатывались в баланс
   (коромысло, качели, рычаг) — форма читается как весы, но это форма
   любой Т-образной опоры, не именно этой буквы. Автор попросил зайти
   с другой стороны: не через физику предмета, а через алгоритмы
   генеративной графики, которые растут из одной точки — а точка, где
   перекладина раскалывается на два плеча, и есть единственное, что у Т
   есть и чего нет у прямой линии или у знака +.

   Три режима — три способа заставить рост держаться настоящей формы буквы,
   а не рисовать органику поверх произвольного пятна (тест на замену: убери
   стержень и перекладину — DLA полезет из пустоты, крона вырастет из
   ничего, слизь расползётся по всему полю, ничем не напоминая Т):

   - «иней» (DLA) — сама буква и есть неподвижная затравка, блуждающие точки
     прилипают к ней и друг к другу, дендриты растут наружу от настоящего
     стержня и настоящей перекладины.
   - «крона» (space colonization) — ствол и плечи заданы явно (та же Т),
     дальше алгоритм тянет новые узлы к облаку точек-аттракторов, и облако
     зеркально относительно оси стержня — крона симметрична потому же,
     почему симметрична сама буква.
   - «слизь» (physarum) — агенты живут в коридоре вокруг контура буквы
     (шире Т наружу выйти не могут) и сами прокладывают сеть внутри него,
     как это делает настоящая слизевая плесень в лабиринте.
*/

const T_BAR_Y = 0.22;
const T_BAR_LEFT = 0.16;
const T_BAR_RIGHT = 0.84;
const T_STEM_X = 0.5;
const T_STEM_BOTTOM = 0.86;

/* ---------- иней: DLA на затравке-букве ---------- */

const DLA_RADIUS = 0.012;
const DLA_CELL = DLA_RADIUS * 1.4;
const DLA_SPAWN_RADIUS = 0.48;
const DLA_MOVE = 0.01;

function dlaCellKey(x, y) { return `${Math.floor(x / DLA_CELL)},${Math.floor(y / DLA_CELL)}`; }

function dlaAddPoint(x, y, seed) {
  const key = dlaCellKey(x, y);
  let cell = modeState.grid.get(key);
  if (!cell) { cell = []; modeState.grid.set(key, cell); }
  cell.push({ x, y });
  if (!seed) modeState.grown.push({ x, y });
}

function dlaSeed() {
  const barSteps = Math.round((T_BAR_RIGHT - T_BAR_LEFT) / 0.01);
  for (let i = 0; i <= barSteps; i += 1) {
    dlaAddPoint(T_BAR_LEFT + ((T_BAR_RIGHT - T_BAR_LEFT) * i) / barSteps, T_BAR_Y, true);
  }
  const stemSteps = Math.round((T_STEM_BOTTOM - T_BAR_Y) / 0.01);
  for (let i = 0; i <= stemSteps; i += 1) {
    dlaAddPoint(T_STEM_X, T_BAR_Y + ((T_STEM_BOTTOM - T_BAR_Y) * i) / stemSteps, true);
  }
}

function dlaNear(x, y) {
  const cx = Math.floor(x / DLA_CELL), cy = Math.floor(y / DLA_CELL);
  for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
    for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
      const cell = modeState.grid.get(`${gx},${gy}`);
      if (!cell) continue;
      for (const p of cell) {
        const dx = p.x - x, dy = p.y - y;
        if (dx * dx + dy * dy <= DLA_RADIUS * DLA_RADIUS) return true;
      }
    }
  }
  return false;
}

function dlaSpawnWalker() {
  const angle = Math.random() * Math.PI * 2;
  return {
    x: 0.5 + Math.cos(angle) * DLA_SPAWN_RADIUS,
    y: 0.5 + Math.sin(angle) * DLA_SPAWN_RADIUS,
    dir: angle + Math.PI + (Math.random() - 0.5),
  };
}

function dlaSetup() {
  modeState.grid = new Map();
  modeState.grown = [];
  modeState.walkers = [];
  dlaSeed();
}

function dlaStep() {
  const target = Math.round(num('walkers'));
  while (modeState.walkers.length < target) modeState.walkers.push(dlaSpawnWalker());
  if (modeState.walkers.length > target) modeState.walkers.length = target;

  const bias = num('bias') * 0.03;
  const stick = num('stick');

  for (let i = 0; i < modeState.walkers.length; i += 1) {
    const w = modeState.walkers[i];
    w.dir += (Math.random() - 0.5) * 1.0;
    w.x += Math.cos(w.dir) * DLA_MOVE;
    w.y += Math.sin(w.dir) * DLA_MOVE + bias;

    const dx = w.x - 0.5, dy = w.y - 0.5;
    if (dx * dx + dy * dy > DLA_SPAWN_RADIUS * DLA_SPAWN_RADIUS * 1.05) {
      modeState.walkers[i] = dlaSpawnWalker();
      continue;
    }

    if (dlaNear(w.x, w.y) && Math.random() < stick) {
      dlaAddPoint(w.x, w.y, false);
      modeState.walkers[i] = dlaSpawnWalker();
    }
  }
}

function dlaDraw() {
  line(T_BAR_LEFT, T_BAR_Y, T_BAR_RIGHT, T_BAR_Y, INK, 0.016);
  line(T_STEM_X, T_BAR_Y, T_STEM_X, T_STEM_BOTTOM, INK, 0.016);
  for (const p of modeState.grown) dot(p.x, p.y, INK, 0.006);
  for (const w of modeState.walkers) dot(w.x, w.y, GHOST, 0.005);
  drawStatus(`${modeState.grown.length} точек`);
}

const DLA_TOOLS = [
  { type: 'range', key: 'walkers', label: 'ходоки', min: 20, max: 400, step: 10, value: 150 },
  { type: 'range', key: 'stick', label: 'липкость', min: 0.05, max: 1, step: 0.05, value: 0.5 },
  { type: 'range', key: 'bias', label: 'снос', min: -1, max: 1, step: 0.1, value: 0 },
];

const dlaMode = {
  label: 'иней',
  note: 'Блуждающие точки прилипают к настоящему стержню и перекладине — дендриты растут наружу от них, не от произвольного контура. Липкость решает, вырастет плотная корка или редкие иглы; снос клонит рост в одну сторону.',
  tools: DLA_TOOLS,
  setup: dlaSetup,
  step: dlaStep,
  draw: dlaDraw,
};

/* ---------- крона: space colonization от ствола Т ---------- */

function growSeedTrunk() {
  const nodes = [];
  const stemSteps = Math.round((T_STEM_BOTTOM - T_BAR_Y) / 0.02);
  let prev = null;
  for (let i = 0; i <= stemSteps; i += 1) {
    const y = T_STEM_BOTTOM - ((T_STEM_BOTTOM - T_BAR_Y) * i) / stemSteps;
    nodes.push({ x: T_STEM_X, y, parent: prev, depth: i });
    prev = nodes.length - 1;
  }
  const top = prev;

  let p = top;
  const leftSteps = Math.round((T_STEM_X - T_BAR_LEFT) / 0.02);
  for (let i = 1; i <= leftSteps; i += 1) {
    const x = T_STEM_X - ((T_STEM_X - T_BAR_LEFT) * i) / leftSteps;
    nodes.push({ x, y: T_BAR_Y, parent: p, depth: nodes[p].depth + 1 });
    p = nodes.length - 1;
  }

  p = top;
  const rightSteps = Math.round((T_BAR_RIGHT - T_STEM_X) / 0.02);
  for (let i = 1; i <= rightSteps; i += 1) {
    const x = T_STEM_X + ((T_BAR_RIGHT - T_STEM_X) * i) / rightSteps;
    nodes.push({ x, y: T_BAR_Y, parent: p, depth: nodes[p].depth + 1 });
    p = nodes.length - 1;
  }

  return nodes;
}

function growSeedAttractors(count) {
  const points = [];
  const half = Math.max(1, Math.round(count / 2));
  for (let i = 0; i < half; i += 1) {
    const x = T_STEM_X + 0.02 + Math.random() * (0.95 - T_STEM_X);
    const y = 0.03 + Math.random() * (T_BAR_Y - 0.05);
    points.push({ x, y });
    points.push({ x: 1 - x, y });
  }
  return points;
}

function growSetup() {
  modeState.nodes = growSeedTrunk();
  modeState.attractors = growSeedAttractors(Math.round(num('density')));
  modeState.tick = 0;
}

function growStep() {
  modeState.tick += 1;
  if (modeState.tick % 2 !== 0) return;

  const attractors = modeState.attractors;
  if (!attractors.length) return;
  const nodes = modeState.nodes;
  const influence = num('influence');
  const kill = num('kill');
  const segLen = num('seg');

  for (const n of nodes) { n.gx = 0; n.gy = 0; n.count = 0; }

  for (const a of attractors) {
    let bestIdx = -1, bestDist = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      const dx = a.x - n.x, dy = a.y - n.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const dist = Math.sqrt(bestDist);
    a.nearestDist = dist;
    if (dist > influence) continue;
    const n = nodes[bestIdx];
    n.gx += (a.x - n.x) / dist;
    n.gy += (a.y - n.y) / dist;
    n.count += 1;
  }

  const newNodes = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    if (n.count > 0) {
      const len = Math.hypot(n.gx, n.gy) || 1;
      newNodes.push({
        x: n.x + (n.gx / len) * segLen,
        y: n.y + (n.gy / len) * segLen,
        parent: i,
        depth: n.depth + 1,
      });
    }
  }
  for (const nn of newNodes) nodes.push(nn);

  modeState.attractors = attractors.filter((a) => a.nearestDist > kill);
}

function growDraw() {
  const nodes = modeState.nodes;
  for (const n of nodes) {
    if (n.parent == null) continue;
    const p = nodes[n.parent];
    const width = Math.max(0.0025, 0.015 * Math.pow(0.94, n.depth));
    line(p.x, p.y, n.x, n.y, INK, width);
  }
  if (on('points')) {
    for (const a of modeState.attractors) dot(a.x, a.y, FAINT, 0.004);
  }
  drawStatus(`${nodes.length} узлов · ${modeState.attractors.length} точек роста`);
}

const GROW_TOOLS = [
  { type: 'range', key: 'density', label: 'облако', min: 40, max: 400, step: 20, value: 140 },
  { type: 'range', key: 'influence', label: 'радиус', min: 0.06, max: 0.25, step: 0.01, value: 0.14 },
  { type: 'range', key: 'kill', label: 'съедено', min: 0.01, max: 0.05, step: 0.005, value: 0.02 },
  { type: 'range', key: 'seg', label: 'шаг', min: 0.008, max: 0.03, step: 0.002, value: 0.014 },
  { type: 'toggle', key: 'points', label: 'точки роста', value: true },
];

const growMode = {
  label: 'крона',
  note: 'Ствол и оба плеча — настоящая Т, заданы явно. Дальше узлы тянутся к облаку точек-аттракторов над перекладиной; облако зеркально относительно стержня, поэтому крона симметрична по той же оси, что и сама буква.',
  tools: GROW_TOOLS,
  setup: growSetup,
  step: growStep,
  draw: growDraw,
  onTool(key) { if (key === 'density') growSetup(); },
};

/* ---------- слизь: physarum на чистом поле, буква зовёт, а не запирает ---------- */

/* Буква здесь — не тонкая линия, а два залитых прямоугольника (параметрические
   толщина бара и ствола, крутятся ползунками). Стык становится широкой общей
   площадью, а не точкой пересечения линий — агенту внутри неё незачем
   выполнять точный поворот на 90°, он просто продолжает бродить в пятне.
   Прямоугольники всегда состыкованы без шва: верх ствола = верх бара минус
   его половина толщины, так что стержень перекрывает всю полосу бара. */
function slimeBarRect() {
  const t = num('barThick');
  return { x0: T_BAR_LEFT, y0: T_BAR_Y - t / 2, x1: T_BAR_RIGHT, y1: T_BAR_Y + t / 2 };
}

function slimeStemRect() {
  const t = num('stemThick');
  const bar = slimeBarRect();
  return { x0: T_STEM_X - t / 2, y0: bar.y0, x1: T_STEM_X + t / 2, y1: T_STEM_BOTTOM };
}

function nearestOnRect(px, py, r) {
  return { x: clamp(px, r.x0, r.x1), y: clamp(py, r.y0, r.y1) };
}

/* barRect/stemRect приходят готовыми — так же, как dist/foodAmount в
   slimeSense: слишком горячий путь (агент × кадр, а при постройке зова —
   клетка × клетка сетки), чтобы дёргать num() внутри. */
function slimeNearestLetter(x, y, barRect, stemRect) {
  const cBar = nearestOnRect(x, y, barRect);
  const cStem = nearestOnRect(x, y, stemRect);
  const dBar = Math.hypot(x - cBar.x, y - cBar.y);
  const dStem = Math.hypot(x - cStem.x, y - cStem.y);
  return dBar < dStem ? { x: cBar.x, y: cBar.y, dist: dBar } : { x: cStem.x, y: cStem.y, dist: dStem };
}

/* Незатухающий фон вдоль буквы — считается один раз, отдельно от trail,
   и диффузия/угасание из slimeStep его не трогает. Это и есть «зов»:
   слабый, вечный, никого никуда не запирает. */
function slimeBuildFood() {
  const G = modeState.G;
  const radius = num('foodRadius');
  const barRect = slimeBarRect();
  const stemRect = slimeStemRect();
  modeState.food = new Float32Array(G * G);
  for (let y = 0; y < G; y += 1) {
    for (let x = 0; x < G; x += 1) {
      const { dist } = slimeNearestLetter((x + 0.5) / G, (y + 0.5) / G, barRect, stemRect);
      modeState.food[y * G + x] = Math.pow(clamp(1 - dist / radius, 0, 1), 1.6);
    }
  }
}

function slimeSetup() {
  const G = 600;
  modeState.G = G;
  modeState.trail = new Float32Array(G * G);
  modeState.next = new Float32Array(G * G);
  slimeBuildFood();

  const count = Math.round(num('agents'));
  modeState.agents = [];
  for (let i = 0; i < count; i += 1) {
    modeState.agents.push({ x: Math.random(), y: Math.random(), heading: Math.random() * Math.PI * 2 });
  }

  if (!modeState.offscreen) modeState.offscreen = document.createElement('canvas');
  modeState.offscreen.width = G;
  modeState.offscreen.height = G;
  modeState.offCtx = modeState.offscreen.getContext('2d');
  modeState.imageData = modeState.offCtx.createImageData(G, G);
}

function slimeWrap(v) { return ((v % 1) + 1) % 1; }

/* dist и foodAmount приходят готовыми параметрами, а не через num() —
   num() внутри строит строку-ключ через slot() на каждый вызов, а тут их
   3 на агента на каждый шаг (десятки тысяч на кадр при плотном поле).
   На синтетическом тесте диффузии этой цены не было видно — она
   вылезла только в реальном прогоне с полным числом агентов. */
function slimeSense(x, y, heading, offset, dist, foodAmount) {
  const G = modeState.G;
  const sx = slimeWrap(x + Math.cos(heading + offset) * dist);
  const sy = slimeWrap(y + Math.sin(heading + offset) * dist);
  const gx = clamp(Math.floor(sx * G), 0, G - 1);
  const gy = clamp(Math.floor(sy * G), 0, G - 1);
  const idx = gy * G + gx;
  return modeState.trail[idx] + modeState.food[idx] * foodAmount;
}

/* Кисть кладёт запах натоптышей от руки — агенты идут не туда, куда решил
   код, а туда, где ты сама провела мышью или пальцем. */
function slimePaint(cx, cy, radius) {
  const G = modeState.G;
  const rGrid = Math.max(1, Math.round(radius * G));
  const gx0 = Math.floor(cx * G), gy0 = Math.floor(cy * G);
  for (let oy = -rGrid; oy <= rGrid; oy += 1) {
    const gy = gy0 + oy;
    if (gy < 0 || gy >= G) continue;
    for (let ox = -rGrid; ox <= rGrid; ox += 1) {
      const gx = gx0 + ox;
      if (gx < 0 || gx >= G) continue;
      const d = Math.hypot(ox, oy) / rGrid;
      if (d > 1) continue;
      const idx = gy * G + gx;
      /* Не добавка, а перезапись сильным значением: рука должна перебить
         то, что уже натоптали агенты сами по себе, а не тонуть в этом. */
      modeState.trail[idx] = Math.max(modeState.trail[idx], (1 - d) * 1.4);
    }
  }
}

function slimeStep() {
  const G = modeState.G;
  const trail = modeState.trail;
  const next = modeState.next;
  const decay = num('decay');
  const diffuse = 0.25; /* доля размытия, подмешанная к своему же значению — не полная замена */

  for (let y = 0; y < G; y += 1) {
    for (let x = 0; x < G; x += 1) {
      const here = trail[y * G + x];
      let sum = 0, n = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        const yy = y + oy;
        if (yy < 0 || yy >= G) continue;
        for (let ox = -1; ox <= 1; ox += 1) {
          const xx = x + ox;
          if (xx < 0 || xx >= G) continue;
          sum += trail[yy * G + xx];
          n += 1;
        }
      }
      const blurred = sum / n;
      next[y * G + x] = (here * (1 - diffuse) + blurred * diffuse) * (1 - decay);
    }
  }
  modeState.trail = next;
  modeState.next = trail;

  if (pointer.down && pointer.seen) slimePaint(pointer.x, pointer.y, num('brush'));

  const sensorAngle = num('sensorAngle');
  const turnSpeed = num('turnSpeed');
  const drift = num('drift');
  const sensorDist = num('sensorDist');
  const foodAmount = num('food');
  const barRect = drift > 0 ? slimeBarRect() : null;
  const stemRect = drift > 0 ? slimeStemRect() : null;
  const speed = 0.006;

  for (const a of modeState.agents) {
    const left = slimeSense(a.x, a.y, a.heading, sensorAngle, sensorDist, foodAmount);
    const center = slimeSense(a.x, a.y, a.heading, 0, sensorDist, foodAmount);
    const right = slimeSense(a.x, a.y, a.heading, -sensorAngle, sensorDist, foodAmount);

    if (left > center && left > right) a.heading += turnSpeed;
    else if (right > center && right > left) a.heading -= turnSpeed;
    else if (center < left || center < right) a.heading += (Math.random() - 0.5) * turnSpeed;

    /* Снос: независимо от того, что унюхали сенсоры, курс чуть доворачивает
       к ближайшей точке буквы — как слабый ветер, а не команда. Агент уже
       внутри залитой формы (dist=0) сносить некуда — оставляем его в покое,
       иначе «ближайшая точка» совпадёт с самим агентом и направление на
       неё не определено. */
    if (drift > 0) {
      const target = slimeNearestLetter(a.x, a.y, barRect, stemRect);
      if (target.dist > 1e-6) {
        const desired = Math.atan2(target.y - a.y, target.x - a.x);
        const diff = Math.atan2(Math.sin(desired - a.heading), Math.cos(desired - a.heading));
        a.heading += diff * drift;
      }
    }

    a.x = slimeWrap(a.x + Math.cos(a.heading) * speed);
    a.y = slimeWrap(a.y + Math.sin(a.heading) * speed);

    const gx = clamp(Math.floor(a.x * G), 0, G - 1);
    const gy = clamp(Math.floor(a.y * G), 0, G - 1);
    const idx = gy * G + gx;
    modeState.trail[idx] = Math.min(1, modeState.trail[idx] + 0.4);
  }
}

function slimeDraw() {
  const G = modeState.G;
  /* Видимость зова растёт вместе с его силой на агентов: на нуле не должно
     оставаться и намёка на подсветку, иначе «выключено» на глаз и
     «выключено» по факту — разные вещи. */
  const foodVisible = clamp(num('food'), 0, 1) * 0.8;

  const [r, g, b] = labGrounds[ground].mark;
  const data = modeState.imageData.data;
  for (let i = 0; i < G * G; i += 1) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b;
    /* Гамма приподнимает слабый след и не даёт всему уйти в ровный туман:
       тонкие свежие линии остаются видимыми на фоне выцветших старых. */
    const trailAlpha = Math.pow(clamp(modeState.trail[i], 0, 1), 0.6);
    const foodAlpha = modeState.food[i] * foodVisible;
    data[i * 4 + 3] = Math.min(255, Math.max(trailAlpha, foodAlpha) * 255);
  }
  modeState.offCtx.putImageData(modeState.imageData, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(modeState.offscreen, 0, 0, G, G, 0, 0, S, S);
  drawStatus(`${modeState.agents.length} агентов`);
}

const SLIME_TOOLS = [
  { type: 'range', key: 'agents', label: 'агенты', min: 200, max: 15000, step: 200, value: 6000 },
  { type: 'range', key: 'brush', label: 'кисть', min: 0.01, max: 0.08, step: 0.005, value: 0.03 },
  { type: 'range', key: 'sensorAngle', label: 'угол', min: 0.15, max: 1.4, step: 0.05, value: 0.5 },
  { type: 'range', key: 'sensorDist', label: 'нюх', min: 0.01, max: 0.05, step: 0.005, value: 0.025 },
  { type: 'range', key: 'turnSpeed', label: 'поворот', min: 0.05, max: 0.5, step: 0.02, value: 0.15 },
  { type: 'range', key: 'decay', label: 'угасание', min: 0.02, max: 0.3, step: 0.02, value: 0.08 },
  { type: 'range', key: 'food', label: 'зов', min: 0, max: 1, step: 0.02, value: 0.12 },
  { type: 'range', key: 'foodRadius', label: 'ширина зова', min: 0.02, max: 0.14, step: 0.01, value: 0.07 },
  { type: 'range', key: 'drift', label: 'снос', min: 0, max: 0.2, step: 0.005, value: 0.015 },
  { type: 'range', key: 'barThick', label: 'толщина бара', min: 0.02, max: 0.22, step: 0.01, value: 0.12 },
  { type: 'range', key: 'stemThick', label: 'толщина ствола', min: 0.04, max: 0.32, step: 0.01, value: 0.2 },
];

const slimeMode = {
  label: 'слизь',
  note: 'Буква тут не линия, а залитая параметрическая форма — два прямоугольника (толщина бара и ствола крутятся отдельно). Стык между ними широкий, а не точечный: агенту внутри не нужно ловить точный угол поворота, как было бы на тонком контуре. Зов и снос тянут к этой форме мягко, кисть (зажми мышь или палец) кладёт поверх свой, более сильный след.',
  tools: SLIME_TOOLS,
  cursor: 'crosshair',
  setup: slimeSetup,
  step: slimeStep,
  draw: slimeDraw,
  onTool(key) {
    if (key === 'agents') slimeSetup();
    else if (key === 'foodRadius' || key === 'barThick' || key === 'stemThick') slimeBuildFood();
  },
};

startLab({
  title: 'Т · рост из точки',
  modes: { slime: slimeMode, grow: growMode, dla: dlaMode },
  start: 'slime',
});
