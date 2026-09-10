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
const CH_SUBSTEPS = 8;
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
  if (w.freeStart || !chPinned(w)) return Infinity;
  const span = Math.hypot(chWorld(w.endX) - chWorld(w.x), chWorld(w.endY) - chWorld(w.y));
  return w.length * chCell() - span;
}

/* ---------- гвоздики ---------- */

function chPinIndex() {
  const cell = chCell();
  const index = new Map();
  const add = (point, id) => {
    const key = `${Math.floor(point.x / cell)},${Math.floor(point.y / cell)}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ x: point.x, y: point.y, id });
  };
  for (const w of modeState.wires) {
    const p = w.rt.points;
    if (!w.freeStart || w.rt.dragging) add(p[0], w.id);
    if (chPinned(w) || w.rt.dragEnd) add(p[p.length - 1], w.id);
  }
  return index;
}

function chFixed(w, i) {
  return (i === 0 && (!w.freeStart || w.rt.dragging))
    || (i === w.rt.points.length - 1 && (chPinned(w) || Boolean(w.rt.dragEnd)));
}

/* Проверяем весь отрезок. Поправку делим по весам его концов, не сдвигая крепления. */
function chResolvePins(w, index, clearance) {
  const cell = chCell();
  const p = w.rt.points;
  for (let i = 0; i < p.length - 1; i += 1) {
    const a = p[i];
    const b = p[i + 1];
    const pins = new Set();
    const x0 = Math.floor((Math.min(a.x, b.x) - clearance) / cell);
    const x1 = Math.floor((Math.max(a.x, b.x) + clearance) / cell);
    const y0 = Math.floor((Math.min(a.y, b.y) - clearance) / cell);
    const y1 = Math.floor((Math.max(a.y, b.y) + clearance) / cell);
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        for (const pin of index.get(`${x},${y}`) || []) pins.add(pin);
      }
    }
    for (const pin of pins) {
      if (pin.id === w.id) continue;
      // Совпадающие крепления — общий узел, а не препятствие для своей ветви.
      if ([0, p.length - 1].some(j => chFixed(w, j)
        && Math.hypot(p[j].x - pin.x, p[j].y - pin.y) < cell * 0.05)) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const span = dx * dx + dy * dy;
      const t = span ? clamp(((pin.x - a.x) * dx + (pin.y - a.y) * dy) / span, 0, 1) : 0;
      let nx = lerp(a.x, b.x, t) - pin.x;
      let ny = lerp(a.y, b.y, t) - pin.y;
      let distance = Math.hypot(nx, ny);
      if (distance >= clearance) continue;
      if (distance < 1e-6) {
        nx = -dy; ny = dx;
        distance = Math.hypot(nx, ny) || 1;
      }
      nx /= distance; ny /= distance;
      const wa = chFixed(w, i) ? 0 : 1;
      const wb = chFixed(w, i + 1) ? 0 : 1;
      const weight = wa * (1 - t) ** 2 + wb * t ** 2;
      if (weight < 1e-6) continue;
      const overlap = clearance - Math.hypot(lerp(a.x, b.x, t) - pin.x, lerp(a.y, b.y, t) - pin.y);
      const push = Math.min(overlap / weight, cell * 0.4);
      a.x += nx * push * wa * (1 - t);
      a.y += ny * push * wa * (1 - t);
      b.x += nx * push * wb * t;
      b.y += ny * push * wb * t;
    }
  }
}

/* ---------- шаг ---------- */

function chAdvance(w) {
  const r = w.rt;
  const p = r.points;
  const cell = chCell();
  const move = (q, x, y) => {
    const distance = Math.hypot(x - q.x, y - q.y);
    const t = distance ? Math.min(1, cell * 0.2 / distance) : 1;
    q.x = q.ox = lerp(q.x, x, t);
    q.y = q.oy = lerp(q.y, y, t);
  };
  if (!w.freeStart || r.dragging) move(p[0], r.tx, r.ty);
  const end = r.dragEnd || (chPinned(w) ? { x: chWorld(w.endX), y: chWorld(w.endY) } : null);
  if (end) move(p[p.length - 1], end.x, end.y);
  r.ax = p[0].x; r.ay = p[0].y;

  const progress = r.release > 0 ? 1 - r.release / CH_RELEASE : 1;
  const damping = Math.pow(r.release > 0 ? 0.88 + 0.05 * progress : 0.94, 1 / CH_SUBSTEPS);
  const gravity = CH_GRAVITY * (cell / CH_CELL_REF) * num('weight')
    * (r.release > 0 ? 0.68 + 0.32 * progress : 1) / CH_SUBSTEPS ** 2;
  for (let i = 0; i < p.length; i += 1) {
    if (chFixed(w, i)) continue;
    const q = p[i];
    const vx = (q.x - q.ox) * damping;
    const vy = (q.y - q.oy) * damping + gravity;
    const speed = Math.hypot(vx, vy);
    const scale = speed ? Math.min(1, cell * 0.2 / speed) : 1;
    q.ox = q.x; q.oy = q.y;
    q.x += vx * scale; q.y += vy * scale;
  }
}

function chSimulate(w, index) {
  const r = w.rt;
  const p = r.points;
  for (let pass = 0; pass < CH_PASSES; pass += 1) {
    for (let j = 0; j < p.length - 1; j += 1) {
      const i = pass % 2 ? p.length - 2 - j : j;
      const a = p[i];
      const b = p[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 1;
      const wa = chFixed(w, i) ? 0 : 1;
      const wb = chFixed(w, i + 1) ? 0 : 1;
      if (!wa && !wb) continue;
      const diff = (distance - r.step) / distance / (wa + wb);
      a.x += dx * diff * wa; a.y += dy * diff * wa;
      b.x -= dx * diff * wb; b.y -= dy * diff * wb;
    }
    if (index) chResolvePins(w, index, chCell() * 1.06);
  }
  r.ax = p[0].x; r.ay = p[0].y;
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
  ctx.arc(w.rt.ax, w.rt.ay, cell * (w.freeStart ? 0.1 : 0.17), 0, Math.PI * 2);
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
  return modeState.wires.some((w) => (w !== exclude && ((!w.freeStart && w.x === x && w.y === y)
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
  modeState.drag = null;
  modeState.paint = null;
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
    note: 'Двойной клик по пустой клетке добавляет канат. Перетащите свободный конец, '
      + 'чтобы закрепить его; простой клик крепления не создаёт. Двойной клик по '
      + 'креплению снимает его, канат остаётся. На сенсорном экране — двойное касание. '
      + 'Кисть добавляет канаты непрерывно. Красный — канат без слабины. '
      + 'Коллизии огибают чужие крепления; пересечения самих канатов допускаются. '
      + 'Тяжесть меняет ускорение падения, а установившийся провис задают длина и крепления.',
    get cursor() { return num('tool') === 1 ? 'default' : 'crosshair'; },
    tools: [
      { type: 'pick', key: 'tool', label: 'инструмент', options: ['кисть', 'курсор', 'ластик'], value: 1 },
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
      modeState.tap = null;
      chLetter();
    },

    onTool(key) {
      if (key === 'grid') chRescale();
      if (key === 'tool') canvas.style.cursor = num('tool') === 1 ? 'default' : 'crosshair';
    },

    onDown(event) {
      const tool = num('tool');
      const cell = chPointerCell();
      modeState.press = { x: pointer.x * S, y: pointer.y * S,
        touch: event.pointerType === 'touch', moved: false, time: performance.now() };
      if (tool === 0 || tool === 2) {
        modeState.paint = { last: cell, mode: tool === 0 ? 'brush' : 'erase' };
        if (tool === 0) chAdd(cell.x, cell.y, num('len'));
        else chErase(cell.x, cell.y);
        return;
      }
      const hit = chHit();
      if (hit) modeState.drag = { ...hit, moved: false };
    },

    onMove() {
      const px = pointer.x * S;
      const py = pointer.y * S;
      const press = modeState.press;
      if (press && Math.hypot(px - press.x, py - press.y) > 6) press.moved = true;
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
      if (!drag || !press?.moved) return;
      const { wire, part } = drag;
      drag.moved = true;
      wire.rt.release = 0;
      if (part === 'start') {
        wire.rt.dragging = true;
        wire.rt.tx = px; wire.rt.ty = py;
      } else {
        wire.rt.dragEnd = { x: px, y: py };
      }
      const other = part === 'start' ? wire.rt.points[wire.rt.points.length - 1] : wire.rt.points[0];
      if (part === 'tail' || chPinned(wire)) {
        const need = Math.hypot(px - other.x, py - other.y) / chCell();
        if (need > wire.length) {
          wire.length = Math.min(CH_MAX_LENGTH, need);
          chResample(wire);
        }
      }
    },

    onUp() {
      modeState.paint = null;
      const drag = modeState.drag;
      const press = modeState.press;
      modeState.drag = null;
      modeState.press = null;
      if (drag?.moved) {
        const { wire, part } = drag;
        const limit = Math.ceil(num('grid'));
        const cell = chPointerCell();
        const inside = cell.x >= 0 && cell.y >= 0 && cell.x < limit && cell.y < limit;
        const otherPinned = part === 'start' ? chPinned(wire) : !wire.freeStart;
        const otherX = part === 'start' ? wire.endX : wire.x;
        const otherY = part === 'start' ? wire.endY : wire.y;
        const valid = inside && !chOccupied(cell.x, cell.y, wire)
          && !(otherPinned && cell.x === otherX && cell.y === otherY);
        if (part === 'start') {
          wire.rt.dragging = false;
          if (valid) { wire.x = cell.x; wire.y = cell.y; wire.freeStart = false; }
          wire.rt.tx = chWorld(wire.x); wire.rt.ty = chWorld(wire.y);
        } else {
          wire.rt.dragEnd = null;
          if (valid) { wire.endX = cell.x; wire.endY = cell.y; }
        }
        if (!wire.freeStart && chPinned(wire)) {
          wire.length = Math.max(wire.length, chTailMinimum(wire, wire.endX, wire.endY));
        }
        chResample(wire);
        wire.rt.release = CH_RELEASE;
      }
      if (press?.touch && !press.moved && performance.now() - press.time < 350) {
        const tap = modeState.tap;
        const now = performance.now();
        if (tap && now - tap.time < 350 && Math.hypot(press.x - tap.x, press.y - tap.y) < 18) {
          MODES.wires.onDouble();
          modeState.touchDouble = now;
          modeState.tap = null;
        } else modeState.tap = { x: press.x, y: press.y, time: now };
      } else modeState.tap = null;
    },

    onDouble(event) {
      if (num('tool') !== 1) return;
      if (event && performance.now() - (modeState.touchDouble || -Infinity) < 500) return;
      const hit = chHit();
      if (hit) {
        const { wire, part } = hit;
        if (part === 'start') wire.freeStart = true;
        else { delete wire.endX; delete wire.endY; }
        wire.rt.release = CH_RELEASE;
        return;
      }
      const cell = chPointerCell();
      chAdd(cell.x, cell.y, num('len'));
    },

    step() {
      if (modeState.size !== S) {
        chFit(S / (modeState.size || S));
        modeState.size = S;
      }
      for (let sub = 0; sub < CH_SUBSTEPS; sub += 1) {
        for (const w of modeState.wires) chAdvance(w);
        const index = on('collide') ? chPinIndex() : null;
        for (const w of modeState.wires) chSimulate(w, index);
      }
      for (const w of modeState.wires) if (w.rt.release > 0) w.rt.release -= 1;
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
