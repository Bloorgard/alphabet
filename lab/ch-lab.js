/* Ч · канаты.
   Перенос рисовалки WIRES (projects/wirefield) на каркас полигона.
   Жгут — верёвка заданной длины: начинается в гвоздике, висит под своим весом,
   свободный хвост можно приколоть во вторую клетку. От редактора взято только
   вещество: физика провисания, кисть по клеткам и коллизии с гвоздиками.
   Слои, цвета, файлы и история остались в исходнике — здесь монохром полигона. */

const CH_MAX_WIRES = 400;
const CH_MAX_LENGTH = 48;
const CH_CELL_REF = 44;      /* клетка исходника: к ней привязаны тяжесть и шаг */
const CH_GRAVITY = 0.22;
const CH_PASSES = 10;
const CH_RELEASE = 90;       /* кадры мягкой гравитации после отпускания */

const chCell = () => S / num('grid');
const chWorld = (cellValue) => (cellValue + 0.5) * chCell();
const chPinned = (w) => Number.isFinite(w.endX) && Number.isFinite(w.endY);
const chCount = (length) => (length <= 0 ? 1 : clamp(Math.ceil(length * 1.35), 4, 64));

/* Прямая между двумя гвоздиками — неустойчивое равновесие: боковой силы нет,
   и слабина никогда не выберется вниз. Поэтому провис закладывается сразу. */
function chSeed(w) {
  const cell = chCell();
  const x = chWorld(w.x);
  const y = chWorld(w.y);
  const pinned = chPinned(w);
  const ex = pinned ? chWorld(w.endX) : x;
  const ey = pinned ? chWorld(w.endY) : y + w.length * cell;
  const rope = w.length * cell;
  const span = pinned ? Math.hypot(ex - x, ey - y) : 0;
  const slack = Math.max(0, rope - span);
  const sag = pinned && slack > 0
    ? Math.min(Math.max(Math.sqrt((3 * span * slack) / 8), slack / 2), rope / 2)
    : 0;

  const count = chCount(w.length);
  const step = count > 1 ? rope / (count - 1) : 0;
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    const px = pinned ? x + (ex - x) * t : x;
    const py = (pinned ? y + (ey - y) * t : y + i * step) + 4 * t * (1 - t) * sag;
    points.push({ x: px, y: py, ox: px, oy: py });
  }
  w.rt = { points, step, ax: x, ay: y, tx: x, ty: y, dragging: false, dragEnd: null, release: 0 };
}

function chResample(w) {
  const cell = chCell();
  const count = chCount(w.length);
  const p = w.rt.points;
  w.rt.step = count > 1 ? (w.length * cell) / (count - 1) : 0;
  if (p.length === count) return;

  const lengths = [0];
  let total = 0;
  for (let i = 1; i < p.length; i += 1) {
    total += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    lengths.push(total);
  }
  const next = [];
  for (let i = 0; i < count; i += 1) {
    const target = count > 1 ? (total * i) / (count - 1) : 0;
    let seg = 1;
    while (seg < lengths.length - 1 && lengths[seg] < target) seg += 1;
    const span = lengths[seg] - lengths[seg - 1] || 1;
    const t = clamp((target - lengths[seg - 1]) / span, 0, 1);
    const a = p[seg - 1];
    const b = p[seg];
    const x = lerp(a.x, b.x, t);
    const y = lerp(a.y, b.y, t);
    next.push({ x, y, ox: x, oy: y });
  }
  w.rt.points = next;
}

/* Сетка сменила частоту — клетка стала другой, и длина в клетках значит другое:
   сцена честнее раскладывается заново, чем растягивается. */
function chRescale() {
  for (const w of modeState.wires) chSeed(w);
}

/* Кадр сменил размер — рисунок сохраняется: точки живут в пикселях и едут
   вместе со сценой. Иначе гвоздики уезжают на новые места, а жгуты остаются
   на старых. */
function chFit(factor) {
  for (const w of modeState.wires) {
    const r = w.rt;
    r.step *= factor;
    r.ax *= factor; r.ay *= factor;
    r.tx *= factor; r.ty *= factor;
    if (r.dragEnd) { r.dragEnd.x *= factor; r.dragEnd.y *= factor; }
    for (const q of r.points) {
      q.x *= factor; q.y *= factor;
      q.ox *= factor; q.oy *= factor;
    }
  }
}

function chSlack(w) {
  if (!chPinned(w)) return Infinity;
  const span = Math.hypot(chWorld(w.endX) - chWorld(w.x), chWorld(w.endY) - chWorld(w.y));
  return w.length * chCell() - span;
}

/* ---------- гвоздики ---------- */

/* Гвоздик за кадр проходит несколько клеток, поэтому в индекс он ложится не
   точкой, а всем своим путём от прошлого кадра: иначе быстрый пронос ни разу
   не попадает под проверку и канат остаётся стоять на месте. */
function chPinIndex() {
  const cell = chCell();
  const index = new Map();
  const memory = modeState.pinPrev || new Map();
  const next = new Map();

  const put = (x, y, pin) => {
    const key = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    if (!index.has(key)) index.set(key, []);
    const bucket = index.get(key);
    if (!bucket.includes(pin)) bucket.push(pin);
  };

  const add = (key, x, y, id) => {
    const was = memory.get(key) || { x, y };
    const pin = { x, y, px: was.x, py: was.y, id };
    next.set(key, { x, y });
    const steps = Math.ceil(Math.hypot(x - was.x, y - was.y) / cell);
    for (let i = 0; i <= steps; i += 1) {
      const t = steps === 0 ? 0 : i / steps;
      put(lerp(was.x, x, t), lerp(was.y, y, t), pin);
    }
  };

  for (const w of modeState.wires) {
    add(`${w.id}:start`, w.rt.ax, w.rt.ay, w.id);
    /* Конец в руке ещё не приколот, но толкать чужие канаты должен: иначе
       единственное движение, которое видно на экране, коллизий не замечает. */
    if (w.rt.dragEnd) add(`${w.id}:tail`, w.rt.dragEnd.x, w.rt.dragEnd.y, w.id);
    else if (chPinned(w)) add(`${w.id}:tail`, chWorld(w.endX), chWorld(w.endY), w.id);
  }
  modeState.pinPrev = next;
  return index;
}

/* Расстояние до пути гвоздика, а не до его нынешнего места. */
function chNearOnPath(point, pin) {
  const dx = pin.x - pin.px;
  const dy = pin.y - pin.py;
  const span = dx * dx + dy * dy;
  const t = span === 0 ? 0 : clamp(((point.x - pin.px) * dx + (point.y - pin.py) * dy) / span, 0, 1);
  return Math.hypot(point.x - (pin.px + dx * t), point.y - (pin.py + dy * t));
}

function chResolvePins(w, index, clearance, correction, maxPush) {
  const cell = chCell();
  const slop = cell * 0.04;
  const p = w.rt.points;
  for (let i = 1; i < p.length - 1; i += 1) {
    const point = p[i];
    const cx = Math.floor(point.x / cell);
    const cy = Math.floor(point.y / cell);
    for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
      for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
        const bucket = index.get(`${gx},${gy}`);
        if (!bucket) continue;
        for (const pin of bucket) {
          if (pin.id === w.id) continue;
          if (chNearOnPath(point, pin) >= clearance - slop) continue;

          /* Нормаль берётся от прошлого места гвоздика: у перпендикуляра к пути
             произвольный знак, и пролетевший насквозь гвоздик толкал бы канат
             назад, вместо того чтобы нести его перед собой. */
          let nx = point.x - pin.px;
          let ny = point.y - pin.py;
          let length = Math.hypot(nx, ny);
          if (length < 1e-6) {
            nx = point.x - pin.x;
            ny = point.y - pin.y;
            length = Math.hypot(nx, ny);
          }
          if (length < 1e-6) continue;
          nx /= length;
          ny /= length;

          const gap = (point.x - pin.x) * nx + (point.y - pin.y) * ny;
          const overlap = clearance - gap;
          if (overlap <= slop) continue;
          const push = Math.min(overlap * correction, maxPush);
          point.x += nx * push;
          point.y += ny * push;
        }
      }
    }
  }
}

/* ---------- шаг ---------- */

function chSimulate(w, index) {
  const cell = chCell();
  const r = w.rt;
  const p = r.points;
  const last = p.length - 1;
  const collide = on('collide');

  const follow = r.dragging ? 0.72 : 0.18;
  r.ax += (r.tx - r.ax) * follow;
  r.ay += (r.ty - r.ay) * follow;
  if (!r.dragging && Math.hypot(r.tx - r.ax, r.ty - r.ay) < 0.1) {
    r.ax = r.tx;
    r.ay = r.ty;
  }

  const end = r.dragEnd || (chPinned(w) ? { x: chWorld(w.endX), y: chWorld(w.endY) } : null);
  p[0].x = p[0].ox = r.ax;
  p[0].y = p[0].oy = r.ay;
  if (end && last > 0) {
    p[last].x = p[last].ox = end.x;
    p[last].y = p[last].oy = end.y;
  }

  /* Отпущенный конец иначе хлещет: гравитация возвращается не сразу. */
  const progress = r.release > 0 ? 1 - r.release / CH_RELEASE : 1;
  const damping = r.release > 0 ? 0.88 + 0.05 * progress : (collide ? 0.78 : 0.94);
  const gravity = CH_GRAVITY * (cell / CH_CELL_REF) * num('weight')
    * (r.release > 0 ? 0.68 + 0.32 * progress : 1);

  for (let i = 1; i < p.length; i += 1) {
    if (end && i === last) continue;
    const q = p[i];
    const vx = (q.x - q.ox) * damping;
    const vy = (q.y - q.oy) * damping;
    q.ox = q.x;
    q.oy = q.y;
    q.x += vx;
    q.y += vy + gravity;
  }

  const clearance = cell * 1.06;
  for (let pass = 0; pass < CH_PASSES; pass += 1) {
    p[0].x = r.ax;
    p[0].y = r.ay;
    if (end && last > 0) {
      p[last].x = end.x;
      p[last].y = end.y;
    }
    for (let i = 0; i < last; i += 1) {
      const a = p[i];
      const b = p[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 1;
      const diff = (distance - r.step) / distance;
      const fixedA = i === 0;
      const fixedB = Boolean(end) && i + 1 === last;
      if (fixedA && fixedB) continue;
      if (fixedA) {
        b.x -= dx * diff;
        b.y -= dy * diff;
      } else if (fixedB) {
        a.x += dx * diff;
        a.y += dy * diff;
      } else {
        a.x += dx * diff * 0.5;
        a.y += dy * diff * 0.5;
        b.x -= dx * diff * 0.5;
        b.y -= dy * diff * 0.5;
      }
    }
    if (collide) chResolvePins(w, index, clearance, 0.35, cell * 0.5);
  }
  if (collide) chResolvePins(w, index, clearance, 0.65, cell * 0.35);
  if (r.release > 0) r.release -= 1;
}

/* ---------- рисование ---------- */

function chPath(points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i += 1) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  const tip = points[points.length - 1];
  ctx.lineTo(tip.x, tip.y);
}

function chDrawGrid() {
  const cell = chCell();
  ctx.strokeStyle = GHOST;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= S + 0.5; x += cell) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, S);
  }
  for (let y = 0; y <= S + 0.5; y += cell) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(S, Math.round(y) + 0.5);
  }
  ctx.stroke();
}

function chDrawWire(w) {
  const cell = chCell();
  const p = w.rt.points;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (p.length > 1) {
    chPath(p);
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = cell + 4;
    ctx.stroke();
    chPath(p);
    ctx.strokeStyle = chSlack(w) <= cell * 0.15 ? RED : INK;
    ctx.lineWidth = cell;
    ctx.stroke();
  }

  /* Гвоздик светлый: он дырка в жгуте, а не отдельное тело. */
  const tip = p[p.length - 1];
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(w.rt.ax, w.rt.ay, cell * 0.17, 0, Math.PI * 2);
  ctx.fill();
  if (p.length > 1) {
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, cell * (chPinned(w) ? 0.17 : 0.1), 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ---------- клетки и жгуты ---------- */

function chPointerCell() {
  const cell = chCell();
  return {
    x: Math.floor((pointer.x * S) / cell),
    y: Math.floor((pointer.y * S) / cell),
  };
}

function chOccupied(x, y, exclude = null) {
  return modeState.wires.some((w) => (w !== exclude && ((w.x === x && w.y === y)
    || (chPinned(w) && w.endX === x && w.endY === y))));
}

function chAdd(x, y, length) {
  const limit = Math.ceil(num('grid'));
  if (x < 0 || y < 0 || x >= limit || y >= limit) return false;
  if (modeState.wires.length >= CH_MAX_WIRES || chOccupied(x, y)) return false;
  modeState.seq += 1;
  const w = { id: modeState.seq, x, y, length };
  modeState.wires.push(w);
  chSeed(w);
  return true;
}

function chErase(x, y) {
  const before = modeState.wires.length;
  modeState.wires = modeState.wires.filter((w) => !(w.x === x && w.y === y));
  return modeState.wires.length !== before;
}

function chCellsBetween(a, b) {
  const cells = [];
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let { x, y } = a;
  let err = dx + dy;
  for (let guard = 0; guard < 4096; guard += 1) {
    cells.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e = 2 * err;
    if (e >= dy) { err += dy; x += sx; }
    if (e <= dx) { err += dx; y += sy; }
  }
  return cells;
}

/* Хвост нельзя приколоть ближе, чем позволяет длина: жгут дотягивается. */
function chTailMinimum(w, endX, endY) {
  const distance = Math.hypot(endX - w.x, endY - w.y);
  return Math.max(0.5, distance);
}

function chHit() {
  const cell = chCell();
  const px = pointer.x * S;
  const py = pointer.y * S;
  const limit = cell * 0.8;
  for (let i = modeState.wires.length - 1; i >= 0; i -= 1) {
    const w = modeState.wires[i];
    const p = w.rt.points;
    const tip = p[p.length - 1];
    if (p.length > 1 && Math.hypot(px - tip.x, py - tip.y) <= limit) return { wire: w, part: 'tail' };
    if (Math.hypot(px - w.rt.ax, py - w.rt.ay) <= limit) return { wire: w, part: 'start' };
  }
  return null;
}

/* ---------- заготовка ---------- */

/* Ч из трёх канатов. Перекладина — единственная горизонталь буквы, и она же
   единственное, чего верёвка держать не умеет: провисает всегда. */
function chLetter() {
  modeState.wires = [];
  modeState.seq = 0;
  const n = Math.ceil(num('grid'));
  const unit = n / 20;
  const at = (v) => Math.round(v * unit);
  const put = (x, y, endX, endY, slack) => {
    modeState.seq += 1;
    const w = {
      id: modeState.seq,
      x: at(x),
      y: at(y),
      endX: at(endX),
      endY: at(endY),
    };
    w.length = chTailMinimum(w, w.endX, w.endY) + slack * unit;
    modeState.wires.push(w);
    chSeed(w);
  };
  put(6, 3, 6, 9, 0.4);
  put(6, 9, 13, 9, 1.6);
  put(13, 3, 13, 16, 0.4);
}

/* ---------- режим ---------- */

const MODES = {
  wires: {
    label: 'канаты',
    note: 'Кисть кладёт жгуты по клеткам: проведите по полю. Жгут висит на гвоздике '
      + 'и провисает по своей длине. Курсором тяните гвоздик или конец жгута: конец, '
      + 'отпущенный в свободной клетке, прикалывается и держит провис между двумя '
      + 'точками. Красный — жгут, вытянутый в струну: слабины не осталось. '
      + '«Коллизии» заставляют тела огибать чужие гвоздики. Заготовка «Ч» — три '
      + 'каната: перекладина провисает, потому что горизонталь верёвке не даётся.',
    cursor: 'crosshair',
    tools: [
      { type: 'pick', key: 'tool', label: 'инструмент', options: ['кисть', 'курсор', 'ластик'], value: 0 },
      { type: 'range', key: 'len', label: 'длина', min: 1, max: 24, step: 0.5, value: 7 },
      { type: 'range', key: 'grid', label: 'сетка', min: 10, max: 40, step: 1, value: 20 },
      { type: 'range', key: 'weight', label: 'тяжесть', min: 0.2, max: 2, step: 0.1, value: 1 },
      { type: 'toggle', key: 'net', label: 'сетка видна', value: true },
      { type: 'toggle', key: 'collide', label: 'коллизии', value: false },
      { type: 'button', label: 'Ч', action() { chLetter(); } },
      { type: 'button', label: 'очистить', action() { modeState.wires = []; } },
    ],

    setup() {
      modeState.wires = [];
      modeState.seq = 0;
      modeState.drag = null;
      modeState.paint = null;
      modeState.size = S;
      modeState.pinPrev = new Map();
      chLetter();
    },

    onTool(key) {
      if (key === 'grid') chRescale();
      if (key === 'collide') modeState.pinPrev = new Map();
      if (key === 'tool') canvas.style.cursor = num('tool') === 1 ? 'default' : 'crosshair';
    },

    onDown() {
      const tool = num('tool');
      const cell = chPointerCell();

      if (tool === 0) {
        modeState.paint = { last: cell, mode: 'brush' };
        chAdd(cell.x, cell.y, num('len'));
        return;
      }
      if (tool === 2) {
        modeState.paint = { last: cell, mode: 'erase' };
        chErase(cell.x, cell.y);
        return;
      }

      const hit = chHit();
      if (!hit) return;
      const { wire, part } = hit;
      wire.rt.release = 0;
      if (part === 'start') {
        wire.rt.dragging = true;
        modeState.drag = { wire, part };
      } else {
        const tip = wire.rt.points[wire.rt.points.length - 1];
        wire.rt.dragEnd = { x: tip.x, y: tip.y };
        /* Прошлое положение конца нужно индексу с первого же кадра: рывок
           бывает быстрее, чем шаг физики, и без памяти путь выйдет нулевым. */
        modeState.pinPrev.set(`${wire.id}:tail`, { x: tip.x, y: tip.y });
        modeState.drag = { wire, part };
      }
    },

    onMove() {
      const px = pointer.x * S;
      const py = pointer.y * S;

      if (modeState.paint) {
        const cell = chPointerCell();
        for (const c of chCellsBetween(modeState.paint.last, cell)) {
          if (modeState.paint.mode === 'brush') chAdd(c.x, c.y, num('len'));
          else chErase(c.x, c.y);
        }
        modeState.paint.last = cell;
        return;
      }

      const drag = modeState.drag;
      if (!drag) return;
      if (drag.part === 'start') {
        drag.wire.rt.tx = px;
        drag.wire.rt.ty = py;
      } else {
        drag.wire.rt.dragEnd = { x: px, y: py };
        /* Длина дотягивается до разведённых концов, а не рвётся. */
        const cell = chCell();
        const need = Math.hypot(px - drag.wire.rt.ax, py - drag.wire.rt.ay) / cell;
        if (need > drag.wire.length) {
          drag.wire.length = Math.min(CH_MAX_LENGTH, need);
          chResample(drag.wire);
        }
      }
    },

    onUp() {
      modeState.paint = null;
      const drag = modeState.drag;
      if (!drag) return;
      modeState.drag = null;

      const { wire, part } = drag;
      const limit = Math.ceil(num('grid'));
      const cell = chPointerCell();
      const inside = cell.x >= 0 && cell.y >= 0 && cell.x < limit && cell.y < limit;

      if (part === 'start') {
        wire.rt.dragging = false;
        if (inside && !chOccupied(cell.x, cell.y, wire)) {
          wire.x = cell.x;
          wire.y = cell.y;
        }
        wire.rt.tx = chWorld(wire.x);
        wire.rt.ty = chWorld(wire.y);
        if (chPinned(wire)) wire.length = Math.max(wire.length, chTailMinimum(wire, wire.endX, wire.endY));
      } else {
        wire.rt.dragEnd = null;
        if (inside && !chOccupied(cell.x, cell.y, wire) && !(cell.x === wire.x && cell.y === wire.y)) {
          wire.endX = cell.x;
          wire.endY = cell.y;
          wire.length = Math.max(wire.length, chTailMinimum(wire, cell.x, cell.y));
        }
      }
      chResample(wire);
      wire.rt.release = CH_RELEASE;
    },

    onDouble() {
      if (num('tool') !== 1) return;
      const cell = chPointerCell();
      chAdd(cell.x, cell.y, num('len'));
    },

    step() {
      if (modeState.size !== S) {
        chFit(S / (modeState.size || S));
        modeState.size = S;
      }
      const index = on('collide') ? chPinIndex() : null;
      for (const w of modeState.wires) chSimulate(w, index);
    },

    draw() {
      if (on('net')) chDrawGrid();
      for (const w of modeState.wires) chDrawWire(w);
      drawStatus(`жгутов · ${modeState.wires.length}`);
    },
  },
};

startLab({
  title: 'Ч · канаты',
  modes: MODES,
  start: 'wires',
  ground: 'paper',
});
