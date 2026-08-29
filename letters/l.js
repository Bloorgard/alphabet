/* Л — река.

   Буква идёт вверх по течению, камера держит её в центре, поэтому река едет
   сверху вниз. Вода здесь не шум и не поле: это рой точек, каждая со своей
   скоростью, и каждая тянет за собой хвост из прошлых положений — так виден
   не сам рой, а линии тока.

   Контур Л вода встречает по-настоящему. Сквозь грань точки не проходят, а
   обтекание держат источники, разложенные по самому контуру и подобранные
   решением маленькой системы так, чтобы сквозь каждый отрезок не шло ни
   капли. Отсюда и главное про эту букву: у Л одна нога косая, другая прямая,
   и вода это знает. Косая расталкивает поток на всю длину и срывает вихрь
   охотно, прямая почти молчит. Возмущение имеет форму буквы, а не пятна
   вокруг неё, — заменить Л другим знаком нельзя, картина воды сменится.

   Вихри никто не расставляет по расписанию. Завихренность рождается на
   стенке, сходит с острых углов по очереди — одновременный сход давал бы
   встречную пару, которая сама себя гасит, — и дальше вихри двигают друг
   друга: дорожка складывается из их взаимного вращения.

   По реке плывут вещи, и несёт их то же поле. Клин — очко, крест — жизнь,
   кругляш не даёт ничего и стоит в наборе нарочно: без нейтральной вещи
   выбор свёлся бы к «хватай всё, что не крест». Ничего не падает по прямой:
   у носа вещи обтекают букву, в вихрях заворачивают, и крест можно объехать,
   а можно подвести к себе течением.

   Сложность растёт из результата, а не из таблицы уровней: каждые четыре
   очка река ускоряется, вещи идут чаще, крестов больше и они собираются в
   пары и тройки, река вихрастее — и сама Л прибавляет в росте. Мишень
   крупнее, увернуться труднее; этим партия и кончается.

   Красный тут событие и только оно: удар о крест держится полсекунды и
   гаснет. Очки и жизни — положение дел, они чернильные.

   Результат партии уходит в копилку холста Я. */

import { reportScore } from '../progress.js?v=3';

const STEP = 1 / 60;
const INK = '#f1ede5';
const RED = '#e0210f';

const TAIL = 22;              /* сколько положений помнит точка */
const CORE = 0.0016;          /* ядро вихря: без него скорость в центре бесконечна */
const PANELS = 8;             /* отрезков на грань контура */
const LIVES = 3;
const CATCH = 0.019;          /* с какого расстояния вещь считается пойманной */
const BASE_RISE = 0.055;
const BASE_SPREAD = 0.1;

const PARAMS = { items: true, stream: 1, curl: 1, size: 1, crowd: 1200, tail: 12, fade: true, spark: true, chips: false };

/* Снаряжение партии: течение, охота грани отдавать вихрь и рост буквы. На
   рекорде эти ручки закрыты — иначе результат ставится не рукой, а тихой
   водой и мелкой мишенью. */
const GEAR = [
  { key: 'stream', label: 'течение', min: 0.5, max: 1.8, step: 0.05 },
  { key: 'curl', label: 'завихрение', min: 0, max: 2, step: 0.05 },
  { key: 'size', label: 'рост буквы', min: 0.6, max: 2.3, step: 0.05 },
];

/* Вид воды к результату отношения не имеет и открыт всегда. */
const CONTROLS = [
  { key: 'crowd', label: 'рой', min: 300, max: 2400, step: 50 },
  { key: 'tail', label: 'хвост', min: 2, max: 22, step: 1 },
];
const SWITCHES = [
  { key: 'items', label: 'вещи' },
  { key: 'fade', label: 'угасание' },
  { key: 'spark', label: 'блик' },
  { key: 'chips', label: 'щепки' },
];

/* ---------- геометрия буквы ---------- */

/* Контур — шестиугольник: треугольник с прорезью между ног. Без прорези это
   просто клин, с ней — Л, стоящая на воде порознь. */
function letterBody(grow, slide, lift, tilt) {
  const height = BASE_RISE * 2.4 * grow;
  const spread = BASE_SPREAD * grow;
  const foot = 0.5 - height * 0.5 + lift;
  const apex = { x: 0.5 + slide, y: 0.5 + height * 0.5 + lift };
  const right = { x: 0.5 + spread * 0.5 + slide, y: foot };
  const left = { x: 0.5 - spread * 0.5 + slide, y: foot };
  const nook = spread * 0.11;
  const heel = { x: 0.5 + slide, y: foot + height * 0.24 };
  const rim = [
    apex,
    right,
    { x: heel.x + nook, y: foot },
    heel,
    { x: heel.x - nook, y: foot },
    left,
  ];
  const mid = { x: (apex.x + right.x + left.x) / 3, y: (apex.y + right.y + left.y) / 3 };

  /* Поворот вокруг точки ближе к носу: нос ведёт, корму выносит наружу.
     Вокруг центра тяжести это читалось бы вращением фигуры, а не ходом. */
  if (tilt) {
    const pivotX = mid.x + (apex.x - mid.x) * 0.55;
    const pivotY = mid.y + (apex.y - mid.y) * 0.55;
    const cos = Math.cos(tilt);
    const sin = Math.sin(tilt);
    for (const point of rim) {
      const dx = point.x - pivotX;
      const dy = point.y - pivotY;
      point.x = pivotX + dx * cos - dy * sin;
      point.y = pivotY + dx * sin + dy * cos;
    }
  }

  return { height, spread, apex, right, left, rim, mid };
}

/* Знаковое расстояние до контура: минимум по отрезкам, знак — счётом
   пересечений луча. По обходу вершин нельзя: с прорезью фигура невыпуклая. */
function letterDistance(px, py, body) {
  const points = body.rim;
  const n = points.length;
  let best = Infinity;
  let inside = false;
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const vx = px - a.x;
    const vy = py - a.y;
    const t = Math.max(0, Math.min(1, (vx * ex + vy * ey) / (ex * ex + ey * ey)));
    const qx = vx - ex * t;
    const qy = vy - ey * t;
    best = Math.min(best, qx * qx + qy * qy);
    if ((a.y > py) !== (b.y > py) && px < a.x + ((py - a.y) / (b.y - a.y)) * ex) inside = !inside;
  }
  return Math.sqrt(best) * (inside ? -1 : 1);
}

function letterNormal(px, py, body) {
  const step = 0.004;
  const nx = letterDistance(px + step, py, body) - letterDistance(px - step, py, body);
  const ny = letterDistance(px, py + step, body) - letterDistance(px, py - step, body);
  const norm = Math.hypot(nx, ny) || 1;
  return { x: nx / norm, y: ny / norm };
}

/* ---------- обтекание ---------- */

/* Влияние отрезка целиком, а не точки в его середине: точечная замена гасит
   течение сквозь борт лишь наполовину, воду прижимает к обшивке, и ближние
   точки прилипают к грани, обводя букву светлой линией. Вдоль — логарифм
   отношения расстояний до концов, поперёк — угол, под которым отрезок виден
   из точки. */
function panelFlow(panel, x, y, out) {
  const dx = x - panel.x0;
  const dy = y - panel.y0;
  const along = dx * panel.tx + dy * panel.ty;
  const away = dx * panel.nx + dy * panel.ny;
  const head = along * along + away * away;
  const tailX = along - panel.len;
  const back = tailX * tailX + away * away;
  out.x = 0.5 * Math.log(Math.max(head, 1e-12) / Math.max(back, 1e-12));
  out.y = Math.atan2(away, tailX) - Math.atan2(away, along);
  return out;
}

/* Система решается сразу с двумя правыми частями: снос вниз и снос вбок.
   Решение линейно по скорости набегания, поэтому поле буквы на ходу
   складывается из этих двух с нужными весами. */
function solvePanels(panels) {
  const n = panels.length;
  const probe = { x: 0, y: 0 };
  const a = [];
  for (let i = 0; i < n; i += 1) {
    const row = new Float64Array(n + 2);
    for (let j = 0; j < n; j += 1) {
      if (i === j) {
        row[j] = Math.PI;   /* со своей середины отрезок виден под развёрнутым углом */
        continue;
      }
      panelFlow(panels[j], panels[i].x, panels[i].y, probe);
      const wx = probe.x * panels[j].tx + probe.y * panels[j].nx;
      const wy = probe.x * panels[j].ty + probe.y * panels[j].ny;
      row[j] = wx * panels[i].nx + wy * panels[i].ny;
    }
    row[n] = panels[i].ny;
    row[n + 1] = panels[i].nx;
    a.push(row);
  }

  for (let col = 0; col < n; col += 1) {
    let pick = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pick][col])) pick = row;
    }
    const swap = a[col];
    a[col] = a[pick];
    a[pick] = swap;
    const lead = a[col][col] || 1e-9;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col] / lead;
      if (!factor) continue;
      for (let k = col; k <= n + 1; k += 1) a[row][k] -= factor * a[col][k];
    }
  }

  /* Замкнутое тело не рождает и не глотает воду: расход по контуру обязан
     быть нулём, иначе буква работает насосом и выдувает вокруг себя пустоту.
     Считаем силу, помноженную на длину, и сносим постоянной плотностью. */
  let net = 0;
  let sideways = 0;
  let span = 0;
  for (let i = 0; i < n; i += 1) {
    const lead = a[i][i] || 1e-9;
    panels[i].down = a[i][n] / lead;
    panels[i].side = a[i][n + 1] / lead;
    net += panels[i].down * panels[i].len;
    sideways += panels[i].side * panels[i].len;
    span += panels[i].len;
  }
  const drift = net / span;
  const cross = sideways / span;
  for (let i = 0; i < n; i += 1) {
    panels[i].down -= drift;
    panels[i].side -= cross;
  }
}

function buildPanels(body) {
  const rim = body.rim;
  const panels = [];
  for (let e = 0; e < rim.length; e += 1) {
    const from = rim[e];
    const to = rim[(e + 1) % rim.length];
    const ex = to.x - from.x;
    const ey = to.y - from.y;
    const len = Math.hypot(ex, ey) / PANELS;
    for (let i = 0; i < PANELS; i += 1) {
      const t = i / PANELS;
      const x0 = from.x + ex * t;
      const y0 = from.y + ey * t;
      const x = x0 + (ex / PANELS) * 0.5;
      const y = y0 + (ey / PANELS) * 0.5;
      const tx = ex / (len * PANELS);
      const ty = ey / (len * PANELS);
      let nx = -ty;
      let ny = tx;
      if (letterDistance(x + nx * 0.004, y + ny * 0.004, body) < 0) {
        nx = -nx;
        ny = -ny;
      }
      panels.push({ x, y, x0, y0, tx, ty, nx, ny, len, down: 0, side: 0 });
    }
  }
  solvePanels(panels);
  return panels;
}

/* ---------- поле скоростей ---------- */

function flowAt(x, y, blobs, stream, sway, panels, out) {
  let vx = -sway;
  let vy = -stream;

  if (panels) {
    const local = { x: 0, y: 0 };
    for (const panel of panels) {
      panelFlow(panel, x, y, local);
      const share = panel.down * stream + panel.side * sway;
      vx += (local.x * panel.tx + local.y * panel.nx) * share;
      vy += (local.x * panel.ty + local.y * panel.ny) * share;
    }
  }

  for (const blob of blobs) {
    const dx = x - blob.x;
    const dy = y - blob.y;
    const r2 = dx * dx + dy * dy + CORE;
    const k = blob.turn / r2;
    vx -= dy * k;
    vy += dx * k;
  }

  out.x = vx;
  out.y = vy;
  return out;
}

/* Угловая скорость плавающего тела — половина завихренности; её берём
   разностью скоростей вокруг точки. Так вещи и щепки поворачиваются вместе с
   водой, и вихрь виден без единой стрелки. */
function spinAt(x, y, blobs, stream, sway, panels) {
  const probe = { x: 0, y: 0 };
  const step = 0.012;
  flowAt(x, y - step, blobs, stream, sway, panels, probe);
  const downX = probe.x;
  flowAt(x, y + step, blobs, stream, sway, panels, probe);
  const upX = probe.x;
  flowAt(x - step, y, blobs, stream, sway, panels, probe);
  const leftY = probe.y;
  flowAt(x + step, y, blobs, stream, sway, panels, probe);
  const rightY = probe.y;
  return (((rightY - leftY) - (upX - downX)) / (4 * step)) * 0.5;
}

/* Вытесняет воду наклон грани: чем сильнее она уходит поперёк хода, тем
   охотнее срывает вихрь. У Л прямая нога почти молчит — счёт идёт от
   геометрии, а не назначается руками. */
function heelOf(body, side) {
  const foot = side < 0 ? body.left : body.right;
  return 0.4 + Math.min(Math.abs(body.apex.x - foot.x) / Math.max(body.height, 0.0001), 1.4) * 0.9;
}

function plural(value) {
  const tail = value % 100;
  if (tail > 10 && tail < 20) return 'очков';
  const last = value % 10;
  if (last === 1) return 'очко';
  if (last > 1 && last < 5) return 'очка';
  return 'очков';
}

export function mountL(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { ...PARAMS };
  let W = 1;
  let H = 1;
  let S = 1;
  let ox = 0;
  let oy = 0;
  let frameId = 0;
  let last = performance.now();
  let debt = 0;
  let sent = false;

  const state = {};
  const pointer = { x: 0.5, y: 0.5, down: false };
  const keys = { left: false, right: false, up: false, down: false };
  const probe = { x: 0, y: 0 };

  function ink(alpha) {
    return `rgba(241, 237, 229, ${alpha})`;
  }

  function at(x, y) {
    return { x: ox + x * S, y: oy + (1 - y) * S };
  }

  function seed(part, y) {
    part.x = Math.random();
    part.y = y;
    part.head = 0;
    part.swing = 0;
    for (let i = 0; i < TAIL; i += 1) {
      part.px[i] = part.x;
      part.py[i] = part.y;
    }
  }

  function fill() {
    const crowd = Math.round(params.crowd);
    const parts = state.parts;
    while (parts.length > crowd) parts.pop();
    while (parts.length < crowd) {
      const part = {
        x: 0, y: 0, head: 0, swing: 0, phase: Math.random() * 6.283,
        px: new Float64Array(TAIL), py: new Float64Array(TAIL),
      };
      seed(part, Math.random());
      parts.push(part);
    }
  }

  function reset() {
    state.parts = state.parts || [];
    state.parts.length = 0;
    state.blobs = [];
    state.chips = [];
    state.items = [];
    state.score = 0;
    state.lives = LIVES;
    state.flash = 0;
    state.over = false;
    state.age = 0;
    state.drop = 0;
    state.shed = 0;
    state.side = 1;
    state.slide = 0;
    state.sway = 0;
    state.lift = 0;
    state.climb = 0;
    state.tilt = 0;
    state.play = state.play !== false;
    /* Масштаб переживает сброс: смена режима зовёт reset, а расти буква
       должна плавно. */
    if (state.zoom === undefined) state.zoom = params.size;
    state.panels = null;
    state.mark = '';
    sent = false;
    fill();
  }

  function level() {
    return Math.floor(state.score / 4);
  }

  function panelsFor(body) {
    const mark = `${body.apex.x}|${body.apex.y}|${body.right.x}|${body.right.y}`;
    if (state.mark !== mark) {
      state.panels = buildPanels(body);
      state.mark = mark;
    }
    return state.panels;
  }

  function bodyNow() {
    return letterBody(Math.min(1 + level() * 0.06, 2.6) * state.zoom, state.slide, state.lift, state.tilt);
  }

  /* Управление одинаково с клавиш и с курсора: и то и другое задаёт скорость
     хода, а не положение. Скорость нужна физике — идущее вбок тело
     расталкивает воду боком и кренится в сторону поворота. */
  function steer() {
    let wantSway = 0;
    let wantClimb = 0;
    if (pointer.down) {
      const goalX = Math.max(-0.3, Math.min(0.3, pointer.x - 0.5));
      const goalY = Math.max(-0.2, Math.min(0.2, pointer.y - 0.5));
      wantSway = Math.max(-1, Math.min(1, (goalX - state.slide) * 5));
      wantClimb = Math.max(-1, Math.min(1, (goalY - state.lift) * 5));
    } else {
      wantSway = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      wantClimb = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
    }

    state.sway += (wantSway * 0.3 - state.sway) * Math.min(1, 6 * STEP);
    state.climb += (wantClimb * 0.26 - state.climb) * Math.min(1, 9 * STEP);
    state.slide = Math.max(-0.3, Math.min(0.3, state.slide + state.sway * STEP));
    state.lift = Math.max(-0.2, Math.min(0.2, state.lift + state.climb * STEP));
    if (Math.abs(state.slide) === 0.3) state.sway = 0;
    if (Math.abs(state.lift) === 0.2) state.climb = 0;
    /* Крен догоняет ход с запозданием — иначе поворот выходит дёрганым. */
    state.tilt += (-state.sway * 1.9 - state.tilt) * Math.min(1, 4 * STEP);
  }

  function shed(body, panels, stream, churn, beat) {
    /* Углы срывают по очереди. Одновременный сход даёт встречную пару, поля
       которой гасят друг друга: вода за кормой не закручивается, а тормозит.
       Дорожка Кармана и начинается с того, что срыв с одной стороны подавляет
       срыв с другой. Сила не даётся сразу: сгусток разгорается за полтакта,
       иначе у борта вспыхивает светлый завиток. */
    state.side = -state.side;
    const side = state.side;
    const corner = side < 0 ? body.left : body.right;
    const x = corner.x + side * 0.022;
    const y = corner.y - 0.02;
    flowAt(x, y, state.blobs, stream, state.sway, panels, probe);
    const edge = Math.hypot(probe.x, probe.y) * heelOf(body, side);
    state.blobs.push({ x, y, seed: -side * 0.5 * edge * edge * beat * 2.65 * params.curl * churn * 0.08, turn: 0, age: 0 });
    while (state.blobs.length > 40) state.blobs.shift();
  }

  function step() {
    steer();
    /* Размер догоняет заданный, а не прыгает к нему: смена режима меняет
       букву втрое, и скачок читался бы подменой, а не тем же телом. */
    state.zoom += (params.size - state.zoom) * Math.min(1, 3 * STEP);
    state.age += STEP;
    if (state.flash > 0) state.flash -= STEP;

    const rank = level();
    const pace = 1 + rank * 0.13;
    const churn = 1 + rank * 0.2;
    const stream = Math.max(0.17 * pace * params.stream + state.climb * 0.6, 0.02);
    const body = bodyNow();
    const panels = panelsFor(body);
    const sway = state.sway;
    const blobs = state.blobs;

    state.shed += STEP;
    const beat = (0.8 * body.spread) / Math.max(stream, 0.02);
    if (state.shed >= beat) {
      state.shed = 0;
      shed(body, panels, stream, churn, beat);
    }

    for (const blob of blobs) {
      /* Себя вихрь не крутит: на нулевом расстоянии наводка нулевая сама. */
      flowAt(blob.x, blob.y, blobs, stream, sway, panels, probe);
      blob.x += probe.x * STEP;
      blob.y += probe.y * STEP;
      blob.age += STEP;
      blob.turn = blob.seed * Math.min(1, blob.age / 0.5) * Math.exp(-0.12 * blob.age);
    }
    for (let i = blobs.length - 1; i >= 0; i -= 1) {
      if (blobs[i].y < -0.25 || blobs[i].age > 7) blobs.splice(i, 1);
    }

    fill();
    for (const part of state.parts) {
      flowAt(part.x, part.y, blobs, stream, sway, panels, probe);
      let vx = probe.x;
      let vy = probe.y;
      const rim = letterDistance(part.x, part.y, body);
      if (rim < 0.02) {
        const normal = letterNormal(part.x, part.y, body);
        if (rim < 0.004) {
          part.x += normal.x * (0.004 - rim);
          part.y += normal.y * (0.004 - rim);
        }
        const into = vx * normal.x + vy * normal.y;
        if (into < 0) {
          const grip = 1 - Math.max(rim, 0) / 0.02;
          vx -= into * normal.x * grip;
          vy -= into * normal.y * grip;
        }
      }
      /* Отклонение меряем от настоящего сноса: на ходу вбок он равен
         (-ход, -течение), а не просто «вниз». Иначе вся река разом
         вспыхивает, стоит нажать на стрелку. */
      part.swing = Math.hypot(vx + sway, vy + stream) / Math.max(stream, 0.02);
      part.x += vx * STEP;
      part.y += vy * STEP;
      if (part.x < 0) part.x += 1;
      if (part.x > 1) part.x -= 1;
      if (part.y < -0.04) seed(part, 1.04);
      part.head = (part.head + 1) % TAIL;
      part.px[part.head] = part.x;
      part.py[part.head] = part.y;
    }

    if (params.chips) {
      while (state.chips.length < 36) {
        state.chips.push({ x: Math.random(), y: Math.random(), turn: Math.random() * 6.283 });
      }
      for (const chip of state.chips) {
        chip.turn += spinAt(chip.x, chip.y, blobs, stream, sway, panels) * STEP;
        flowAt(chip.x, chip.y, blobs, stream, sway, panels, probe);
        chip.x += probe.x * STEP;
        chip.y += probe.y * STEP;
        if (chip.x < 0) chip.x += 1;
        if (chip.x > 1) chip.x -= 1;
        if (chip.y < -0.04) {
          chip.x = Math.random();
          chip.y = 1.04;
        }
      }
    }

    if (!params.items) state.items.length = 0;

    if (params.items && !state.over) {
      state.drop += STEP;
      /* Частота падает долей, а не вычитанием: вычитание упирается в пол и
         дальше не давит. */
      const rate = Math.max(0.85 * Math.pow(0.93, rank), 0.17);
      if (state.drop >= rate) {
        state.drop = 0;
        /* Крестов со временем больше, но не выше половины с небольшим: иначе
           ловить нечего и игра превращается в бег от всего. Дальше давит
           кучность — пары, потом тройки, между которыми надо продеться. */
        const harm = Math.min(0.18 + rank * 0.04, 0.58);
        const roll = Math.random();
        const kind = roll < harm ? 'крест' : roll < harm + (1 - harm) * 0.62 ? 'клин' : 'круг';
        const bunch = kind === 'крест' && rank >= 5 && Math.random() < 0.5 ? (rank >= 11 ? 3 : 2) : 1;
        const spot = 0.08 + Math.random() * 0.84;
        for (let i = 0; i < bunch; i += 1) {
          state.items.push({
            x: spot + (i - (bunch - 1) * 0.5) * 0.055,
            y: 1.06 + i * 0.02,
            kind,
            turn: Math.random() * 6.283,
          });
        }
      }
    }

    for (let i = state.items.length - 1; i >= 0; i -= 1) {
      const item = state.items[i];
      flowAt(item.x, item.y, blobs, stream, sway, panels, probe);
      item.turn += spinAt(item.x, item.y, blobs, stream, sway, panels) * STEP;
      item.x += probe.x * STEP;
      item.y += probe.y * STEP;
      if (item.x < 0) item.x += 1;
      if (item.x > 1) item.x -= 1;
      if (item.y < -0.08) {
        state.items.splice(i, 1);
        continue;
      }
      if (state.over) continue;
      if (letterDistance(item.x, item.y, body) > CATCH) continue;
      state.items.splice(i, 1);
      if (item.kind === 'клин') state.score += 1;
      else if (item.kind === 'крест') {
        state.lives -= 1;
        state.flash = 0.6;
        if (state.lives <= 0) {
          state.lives = 0;
          state.over = true;
          if (state.play && !sent) {
            sent = true;
            reportScore('Л', state.score);
          }
        }
      }
    }
  }

  function drawShape(item) {
    const reach = CATCH * S;
    const spot = at(item.x, item.y);
    ctx.beginPath();
    if (item.kind === 'круг') {
      ctx.arc(spot.x, spot.y, reach * 0.62, 0, Math.PI * 2);
    } else if (item.kind === 'клин') {
      for (let i = 0; i < 3; i += 1) {
        const angle = item.turn + (i * Math.PI * 2) / 3 - Math.PI / 2;
        const px = spot.x + Math.cos(angle) * reach;
        const py = spot.y + Math.sin(angle) * reach;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
    } else {
      /* Крест — четырёхлучевая звезда с вогнутыми боками: у прямого креста на
         вращении теряется угол, а у звезды видно, как её ведёт. */
      for (let i = 0; i < 8; i += 1) {
        const angle = item.turn + (i * Math.PI) / 4;
        const span = i % 2 ? reach * 0.34 : reach;
        const px = spot.x + Math.cos(angle) * span;
        const py = spot.y + Math.sin(angle) * span;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
    }
    ctx.fill();
  }

  function outline(body) {
    ctx.beginPath();
    body.rim.forEach((point, i) => {
      const spot = at(point.x, point.y);
      if (i) ctx.lineTo(spot.x, spot.y);
      else ctx.moveTo(spot.x, spot.y);
    });
    ctx.closePath();
  }

  /* Подпись встаёт в верхнюю строку между заголовком слева и крестиком
     справа, поэтому берёт их кегль в пикселях, а не долю стороны. Жизни —
     точками следом за счётом: сколько набрал и сколько осталось читается
     разом. Так же устроено у К. */
  function status() {
    if (!params.items) {
      ctx.font = "10px 'DM Mono', ui-monospace, monospace";
      ctx.letterSpacing = '.08em';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = ink(0.5);
      ctx.fillText('ПЕСОЧНИЦА', ox + S / 2, oy + 25);
      ctx.textAlign = 'left';
      ctx.letterSpacing = '0px';
      return;
    }

    const tail = state.over ? ' · клик — заново' : '';
    const text = `${state.play ? '' : 'песочница · '}${state.score} ${plural(state.score)}${tail}`.toUpperCase();

    ctx.font = "10px 'DM Mono', ui-monospace, monospace";
    ctx.letterSpacing = '.08em';
    const gap = 0.02 * S;
    const stride = 0.022 * S;
    const radius = 0.0065 * S;
    const width = ctx.measureText(text).width;
    const startX = ox + S / 2 - (width + gap + LIVES * stride) / 2;
    const baseline = oy + 25;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = state.flash > 0 || state.over ? RED : ink(0.5);
    ctx.fillText(text, startX, baseline);

    for (let i = 0; i < LIVES; i += 1) {
      ctx.beginPath();
      ctx.arc(startX + width + gap + i * stride + radius, baseline - radius * 0.6, radius, 0, Math.PI * 2);
      ctx.fillStyle = i < state.lives ? ink(0.5) : ink(0.13);
      ctx.fill();
    }
    ctx.letterSpacing = '0px';
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    const tail = Math.max(2, Math.min(TAIL, Math.round(params.tail)));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, S * 0.0016);

    /* Рой разбираем на четыре ленты по отклонению от сноса: ровная вода
       уходит в фон, закрученная выступает вперёд. Четыре пути вместо тысячи —
       иначе кадр уходит на смену прозрачности. «Угасание» режет хвост ещё и
       по возрасту, и линия читается направленной. */
    const bands = [[], [], [], []];
    for (const part of state.parts) {
      const band = Math.floor(part.swing * 2.6);
      bands[band >= 0 && band < 3 ? band : 3].push(part);
    }
    const chunks = params.fade ? 5 : 1;
    for (let band = 0; band < 4; band += 1) {
      if (!bands[band].length) continue;
      const weight = 0.16 + band * 0.26;
      for (let chunk = 0; chunk < chunks; chunk += 1) {
        const from = Math.round((tail * chunk) / chunks);
        const to = Math.round((tail * (chunk + 1)) / chunks);
        if (to - from < 2) continue;
        ctx.strokeStyle = ink(weight * (params.fade ? 1 - chunk / chunks : 1));
        ctx.beginPath();
        for (const part of bands[band]) {
          let first = true;
          for (let i = to - 1; i >= from; i -= 1) {
            const slot = (part.head - i + TAIL * 2) % TAIL;
            const back = (slot + TAIL - 1) % TAIL;
            const spot = at(part.px[slot], part.py[slot]);
            /* Точка, ушедшая за край, возвращается с другой стороны — хвост
               через весь кадр рисовать нельзя. */
            if (first || Math.abs(part.px[slot] - part.px[back]) > 0.5) ctx.moveTo(spot.x, spot.y);
            else ctx.lineTo(spot.x, spot.y);
            first = false;
          }
        }
        ctx.stroke();
      }
    }

    /* Блик — редкая искра на гребне. У каждой точки своя фаза, поэтому вода
       не мигает целиком, а вспыхивает то тут, то там. */
    if (params.spark) {
      ctx.fillStyle = ink(0.95);
      const time = state.age * 1.7;
      for (const part of state.parts) {
        if (Math.sin(time + part.phase) < 0.986) continue;
        const spot = at(part.px[part.head], part.py[part.head]);
        ctx.fillRect(spot.x - 1, spot.y - 1, 2, 2);
      }
    }

    if (params.chips) {
      ctx.strokeStyle = ink(0.9);
      ctx.lineWidth = Math.max(1.4, S * 0.0026);
      ctx.beginPath();
      for (const chip of state.chips) {
        const reach = S * 0.014;
        const spot = at(chip.x, chip.y);
        const dx = Math.cos(chip.turn) * reach;
        const dy = Math.sin(chip.turn) * reach;
        ctx.moveTo(spot.x - dx, spot.y - dy);
        ctx.lineTo(spot.x + dx, spot.y + dy);
      }
      ctx.stroke();
    }
    ctx.restore();

    const body = bodyNow();
    ctx.fillStyle = state.flash > 0 ? RED : ink(0.97);
    outline(body);
    ctx.fill();

    ctx.fillStyle = ink(1);
    for (const item of state.items) drawShape(item);

    /* Счёт и жизни — положение дел, они чернильные. Красным помечено только
       происшествие: конец партии. */
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
    pointer.y = 1 - (event.clientY - bounds.top - oy) / S;
  }

  function onDown(event) {
    track(event);
    pointer.down = true;
    canvas.setPointerCapture?.(event.pointerId);
    if (state.over) reset();
  }

  function onMove(event) {
    if (pointer.down) track(event);
  }

  function onUp() {
    pointer.down = false;
  }

  function onKey(event, down) {
    if (event.key === 'ArrowLeft') keys.left = down;
    else if (event.key === 'ArrowRight') keys.right = down;
    else if (event.key === 'ArrowUp') keys.up = down;
    else if (event.key === 'ArrowDown') keys.down = down;
    else return;
    event.preventDefault();
    if (down && state.over) reset();
  }

  function onKeyDown(event) {
    if (event.key === 'Tab') {
      const inField = event.target instanceof Element && event.target.closest('input, textarea');
      if (inField) return;
      event.preventDefault();
      toggle.click();
      return;
    }
    onKey(event, true);
  }

  function onKeyUp(event) {
    onKey(event, false);
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';

  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.hidden = true;

  /* Панель начинается с режима: сперва человек видит, во что играет, и уже
     потом — ручки. Так же устроена панель у К. */
  const modes = document.createElement('div');
  modes.className = 'sketch-modes';
  panel.append(modes);

  const note = document.createElement('p');
  panel.append(note);

  function modeButton(labelText, play) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sketch-mode';
    button.textContent = labelText;
    button.addEventListener('click', () => {
      if (state.play === play) return;
      state.play = play;
      /* Возврат на рекорд восстанавливает снаряжение: накрученное в песочнице
         не должно уезжать в зачётную партию. В песочницу же идут смотреть на
         воду, а не ловить, поэтому вещи там по умолчанию убраны — вернуть их
         можно переключателем. */
      if (play) Object.assign(params, PARAMS);
      else {
        params.items = false;
        /* Песочница — не партия, а место посмотреть на букву и покрутить её
           устройство. Поэтому Л встаёт во весь рост: разглядывать, как вода
           обходит косую ногу и срывается с прямой, на игровой мишени нечем. */
        params.size = GEAR.find((item) => item.key === 'size').max;
      }
      reset();
      syncPanel();
    });
    modes.append(button);
    return button;
  }

  const playButton = modeButton('на рекорд', true);
  const freeButton = modeButton('песочница', false);

  const gear = [];
  for (const control of GEAR) {
    const label = document.createElement('label');
    label.textContent = control.label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = control.min;
    input.max = control.max;
    input.step = control.step;
    input.value = params[control.key];
    input.addEventListener('input', () => { params[control.key] = Number(input.value); });
    label.append(input);
    panel.append(label);
    gear.push({ key: control.key, input });
  }

  for (const control of CONTROLS) {
    const label = document.createElement('label');
    label.textContent = control.label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = control.min;
    input.max = control.max;
    input.step = control.step;
    input.value = params[control.key];
    input.addEventListener('input', () => { params[control.key] = Number(input.value); });
    label.append(input);
    panel.append(label);
  }

  const switches = [];
  for (const item of SWITCHES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sketch-switch';
    button.textContent = item.label;
    button.setAttribute('aria-pressed', String(params[item.key]));
    button.addEventListener('click', () => {
      params[item.key] = !params[item.key];
      button.setAttribute('aria-pressed', String(params[item.key]));
      /* Вещи — не отделка: убрали и вернули, значит партия новая, иначе счёт
         продолжится с прежнего, а жизни успели уйти в тишине. */
      if (item.key === 'items') reset();
    });
    panel.append(button);
    switches.push({ key: item.key, button });
  }

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'sketch-action';
  resetButton.textContent = 'заново';
  resetButton.addEventListener('click', reset);
  panel.append(resetButton);

  function syncPanel() {
    playButton.setAttribute('aria-pressed', String(state.play));
    freeButton.setAttribute('aria-pressed', String(!state.play));
    note.textContent = state.play
      ? 'результат идёт в общий счёт'
      : 'ручки открыты, результат не в зачёт';
    /* Подсказка внизу кадра держится того же режима: в песочнице ловить
       нечего, и правила ловли там только сбивают. */
    hint.textContent = state.play
      ? 'веди Л стрелками или курсором · клин — очко, крест — жизнь, кругляш ничей'
      : 'песочница: ручки открыты, счёта нет · веди Л стрелками или курсором';
    for (const knob of gear) {
      knob.input.disabled = state.play;
      knob.input.value = params[knob.key];
    }
    /* Смена режима убирает вещи сама, и переключатель обязан это показать. */
    for (const item of switches) item.button.setAttribute('aria-pressed', String(params[item.key]));
  }

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

  reset();
  syncPanel();
  workspace.append(hint, panel, toggle);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(workspace);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  resize();
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    hint.remove();
    panel.remove();
    toggle.remove();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
