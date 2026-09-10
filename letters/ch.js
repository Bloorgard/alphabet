import { reportEvent } from '../progress.js?v=5';

/* Ч · канаты.
   Жгут — верёвка заданной длины: начинается в гвоздике, висит под своим весом,
   конец можно приколоть во вторую клетку. Ч собрана из трёх канатов, и её
   перекладина — единственная горизонталь буквы, то есть ровно то, чего верёвка
   держать не умеет: она провисает всегда.
   Физика перенесена из WIRES, авторской рисовалки жгутов. */

const STEP = 1 / 60;
const INK = '#161616';
const PAPER = '#f1ede5';
const RED = '#e0210f';
const MAX_WIRES = 400;
const MAX_LENGTH = 48;
const CELL_REF = 44;      /* клетка исходника: к ней привязана тяжесть */
const GRAVITY = 0.22;
const PASSES = 10;
const RELEASE = 90;       /* кадры мягкой гравитации после отпускания */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

export function mountCh(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  let S = 600, W = 600, H = 600, ox = 0, oy = 0, dpr = 1, size = 0;
  let frameId = 0, last = performance.now(), debt = 0, paused = false, sent = false;
  const pointer = { x: 0.5, y: 0.5, down: false, id: null };
  const values = {};
  const num = key => Number(values[key]);
  const on = key => Boolean(values[key]);

  let wires = [];
  let seq = 0;
  let drag = null;
  let paint = null;
  let pinPrev = new Map();

  const cellSize = () => S / num('grid');
  const world = value => (value + 0.5) * cellSize();
  const pinned = w => Number.isFinite(w.endX) && Number.isFinite(w.endY);
  const countOf = length => (length <= 0 ? 1 : clamp(Math.ceil(length * 1.35), 4, 64));

  /* Прямая между двумя гвоздиками — неустойчивое равновесие: боковой силы нет,
     и слабина сама вниз не выберется. Поэтому провис закладывается сразу. */
  function seed(w) {
    const cell = cellSize();
    const x = world(w.x);
    const y = world(w.y);
    const held = pinned(w);
    const ex = held ? world(w.endX) : x;
    const ey = held ? world(w.endY) : y + w.length * cell;
    const rope = w.length * cell;
    const span = held ? Math.hypot(ex - x, ey - y) : 0;
    const slack = Math.max(0, rope - span);
    const sag = held && slack > 0
      ? Math.min(Math.max(Math.sqrt((3 * span * slack) / 8), slack / 2), rope / 2)
      : 0;

    const count = countOf(w.length);
    const step = count > 1 ? rope / (count - 1) : 0;
    const points = [];
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0 : i / (count - 1);
      const px = held ? x + (ex - x) * t : x;
      const py = (held ? y + (ey - y) * t : y + i * step) + 4 * t * (1 - t) * sag;
      points.push({ x: px, y: py, ox: px, oy: py });
    }
    w.rt = { points, step, ax: x, ay: y, tx: x, ty: y, dragging: false, dragEnd: null, release: 0 };
  }

  function resample(w) {
    const cell = cellSize();
    const count = countOf(w.length);
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

  /* Сетка сменила частоту — клетка стала другой, и длина в клетках значит
     другое: сцена честнее раскладывается заново, чем растягивается. */
  function rescale() {
    for (const w of wires) seed(w);
  }

  /* Кадр сменил размер — рисунок сохраняется: точки живут в пикселях и едут
     вместе со сценой, иначе гвоздики уезжают, а канаты остаются. */
  function refit(factor) {
    for (const w of wires) {
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

  function slackOf(w) {
    if (!pinned(w)) return Infinity;
    const span = Math.hypot(world(w.endX) - world(w.x), world(w.endY) - world(w.y));
    return w.length * cellSize() - span;
  }

  /* Гвоздик за кадр проходит несколько клеток, поэтому в индекс он ложится не
     точкой, а всем своим путём от прошлого кадра: иначе быстрый пронос ни разу
     не попадает под проверку и канат остаётся стоять на месте. */
  function pinIndex() {
    const cell = cellSize();
    const index = new Map();
    const memory = pinPrev;
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

    for (const w of wires) {
      add(`${w.id}:start`, w.rt.ax, w.rt.ay, w.id);
      /* Конец в руке ещё не приколот, но толкать чужие канаты должен. */
      if (w.rt.dragEnd) add(`${w.id}:tail`, w.rt.dragEnd.x, w.rt.dragEnd.y, w.id);
      else if (pinned(w)) add(`${w.id}:tail`, world(w.endX), world(w.endY), w.id);
    }
    pinPrev = next;
    return index;
  }

  /* Расстояние до пути гвоздика, а не до его нынешнего места. */
  function nearOnPath(point, pin) {
    const dx = pin.x - pin.px;
    const dy = pin.y - pin.py;
    const span = dx * dx + dy * dy;
    const t = span === 0 ? 0 : clamp(((point.x - pin.px) * dx + (point.y - pin.py) * dy) / span, 0, 1);
    return Math.hypot(point.x - (pin.px + dx * t), point.y - (pin.py + dy * t));
  }

  function resolvePins(w, index, clearance, correction, maxPush) {
    const cell = cellSize();
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
            if (nearOnPath(point, pin) >= clearance - slop) continue;

            /* Нормаль берётся от прошлого места гвоздика: у перпендикуляра к
               пути произвольный знак, и пролетевший насквозь гвоздик толкал бы
               канат назад, вместо того чтобы нести его перед собой. */
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

  function simulate(w, index) {
    const cell = cellSize();
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

    const end = r.dragEnd || (pinned(w) ? { x: world(w.endX), y: world(w.endY) } : null);
    p[0].x = p[0].ox = r.ax;
    p[0].y = p[0].oy = r.ay;
    if (end && last > 0) {
      p[last].x = p[last].ox = end.x;
      p[last].y = p[last].oy = end.y;
    }

    /* Отпущенный конец иначе хлещет: гравитация возвращается не сразу. */
    const progress = r.release > 0 ? 1 - r.release / RELEASE : 1;
    const damping = r.release > 0 ? 0.88 + 0.05 * progress : (collide ? 0.78 : 0.94);
    const gravity = GRAVITY * (cell / CELL_REF) * num('weight')
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
    for (let pass = 0; pass < PASSES; pass += 1) {
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
      if (collide) resolvePins(w, index, clearance, 0.35, cell * 0.5);
    }
    if (collide) resolvePins(w, index, clearance, 0.65, cell * 0.35);
    if (r.release > 0) r.release -= 1;
  }

  function step() {
    if (size !== S) {
      refit(S / (size || S));
      size = S;
    }
    const index = on('collide') ? pinIndex() : null;
    for (const w of wires) simulate(w, index);
  }

  /* ---------- рисование ---------- */

  function ropePath(points) {
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

  function drawGrid() {
    const cell = cellSize();
    ctx.strokeStyle = 'rgba(22,22,22,.09)';
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

  function drawWire(w) {
    const cell = cellSize();
    const p = w.rt.points;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (p.length > 1) {
      ropePath(p);
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = cell + 4;
      ctx.stroke();
      ropePath(p);
      /* Единственная краска сцены: канат, вытянутый в струну. */
      ctx.strokeStyle = slackOf(w) <= cell * 0.15 ? RED : INK;
      ctx.lineWidth = cell;
      ctx.stroke();
    }

    /* Гвоздик светлый: он дырка в жгуте, а не отдельное тело. */
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(w.rt.ax, w.rt.ay, cell * 0.17, 0, Math.PI * 2);
    ctx.fill();
    if (p.length > 1) {
      const tip = p[p.length - 1];
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, cell * (pinned(w) ? 0.17 : 0.1), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw() {
    if (on('net')) drawGrid();
    for (const w of wires) drawWire(w);
  }

  /* ---------- клетки и жгуты ---------- */

  function pointerCell() {
    const cell = cellSize();
    return {
      x: Math.floor((pointer.x * S) / cell),
      y: Math.floor((pointer.y * S) / cell),
    };
  }

  function occupied(x, y, exclude = null) {
    return wires.some(w => (w !== exclude && ((w.x === x && w.y === y)
      || (pinned(w) && w.endX === x && w.endY === y))));
  }

  function addWire(x, y, length) {
    const limit = Math.ceil(num('grid'));
    if (x < 0 || y < 0 || x >= limit || y >= limit) return false;
    if (wires.length >= MAX_WIRES || occupied(x, y)) return false;
    seq += 1;
    const w = { id: seq, x, y, length };
    wires.push(w);
    seed(w);
    return true;
  }

  function eraseWire(x, y) {
    const before = wires.length;
    wires = wires.filter(w => !(w.x === x && w.y === y));
    return wires.length !== before;
  }

  function cellsBetween(a, b) {
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

  /* Хвост нельзя приколоть дальше, чем позволяет длина: жгут дотягивается. */
  function tailMinimum(w, endX, endY) {
    return Math.max(0.5, Math.hypot(endX - w.x, endY - w.y));
  }

  function hitPoint() {
    const cell = cellSize();
    const px = pointer.x * S;
    const py = pointer.y * S;
    const limit = cell * 0.8;
    for (let i = wires.length - 1; i >= 0; i -= 1) {
      const w = wires[i];
      const p = w.rt.points;
      const tip = p[p.length - 1];
      if (p.length > 1 && Math.hypot(px - tip.x, py - tip.y) <= limit) return { wire: w, part: 'tail' };
      if (Math.hypot(px - w.rt.ax, py - w.rt.ay) <= limit) return { wire: w, part: 'start' };
    }
    return null;
  }

  /* Ч из трёх канатов: перекладина — единственная горизонталь буквы и
     единственное, чего верёвка держать не умеет. */
  function letter() {
    wires = [];
    seq = 0;
    pinPrev = new Map();
    const unit = Math.ceil(num('grid')) / 20;
    const at = value => Math.round(value * unit);
    const put = (x, y, endX, endY, slack) => {
      seq += 1;
      const w = { id: seq, x: at(x), y: at(y), endX: at(endX), endY: at(endY) };
      w.length = tailMinimum(w, w.endX, w.endY) + slack * unit;
      wires.push(w);
      seed(w);
    };
    put(6, 3, 6, 9, 0.4);
    put(6, 9, 13, 9, 1.6);
    put(13, 3, 13, 16, 0.4);
  }

  /* ---------- ввод ---------- */

  const TOOLS = ['кисть', 'курсор', 'ластик'];

  function onDown() {
    const tool = num('tool');
    const cell = pointerCell();

    if (tool === 0) {
      paint = { last: cell, mode: 'brush' };
      addWire(cell.x, cell.y, num('len'));
      return;
    }
    if (tool === 2) {
      paint = { last: cell, mode: 'erase' };
      eraseWire(cell.x, cell.y);
      return;
    }

    const hit = hitPoint();
    if (!hit) return;
    const { wire, part } = hit;
    wire.rt.release = 0;
    if (part === 'start') {
      wire.rt.dragging = true;
      drag = { wire, part };
    } else {
      const tip = wire.rt.points[wire.rt.points.length - 1];
      wire.rt.dragEnd = { x: tip.x, y: tip.y };
      /* Прошлое положение конца нужно индексу с первого же кадра: рывок бывает
         быстрее, чем шаг физики, и без памяти путь выйдет нулевым. */
      pinPrev.set(`${wire.id}:tail`, { x: tip.x, y: tip.y });
      drag = { wire, part };
    }
  }

  function onMove() {
    const px = pointer.x * S;
    const py = pointer.y * S;

    if (paint) {
      const cell = pointerCell();
      for (const c of cellsBetween(paint.last, cell)) {
        if (paint.mode === 'brush') addWire(c.x, c.y, num('len'));
        else eraseWire(c.x, c.y);
      }
      paint.last = cell;
      return;
    }

    if (!drag) return;
    if (drag.part === 'start') {
      drag.wire.rt.tx = px;
      drag.wire.rt.ty = py;
    } else {
      drag.wire.rt.dragEnd = { x: px, y: py };
      const need = Math.hypot(px - drag.wire.rt.ax, py - drag.wire.rt.ay) / cellSize();
      if (need > drag.wire.length) {
        drag.wire.length = Math.min(MAX_LENGTH, need);
        resample(drag.wire);
      }
    }
  }

  function onUp() {
    paint = null;
    if (!drag) return;
    const { wire, part } = drag;
    drag = null;

    const limit = Math.ceil(num('grid'));
    const cell = pointerCell();
    const inside = cell.x >= 0 && cell.y >= 0 && cell.x < limit && cell.y < limit;

    if (part === 'start') {
      wire.rt.dragging = false;
      if (inside && !occupied(cell.x, cell.y, wire)) {
        wire.x = cell.x;
        wire.y = cell.y;
      }
      wire.rt.tx = world(wire.x);
      wire.rt.ty = world(wire.y);
      if (pinned(wire)) wire.length = Math.max(wire.length, tailMinimum(wire, wire.endX, wire.endY));
    } else {
      wire.rt.dragEnd = null;
      if (inside && !occupied(cell.x, cell.y, wire) && !(cell.x === wire.x && cell.y === wire.y)) {
        wire.endX = cell.x;
        wire.endY = cell.y;
        wire.length = Math.max(wire.length, tailMinimum(wire, cell.x, cell.y));
      }
    }
    resample(wire);
    wire.rt.release = RELEASE;
  }

  /* ---------- слой буквы ---------- */

  const HINTS = {
    0: 'проведи по полю — ляжет канат',
    1: 'тяни гвоздик или конец каната',
    2: 'проведи по гвоздикам — снимет канаты',
  };

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = HINTS[0];

  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.hidden = true;
  panel.style.maxHeight = 'calc(100% - 64px)';
  panel.style.overflowY = 'auto';

  const tools = [
    { type: 'pick', key: 'tool', label: 'инструмент', options: TOOLS, value: 0 },
    { type: 'range', key: 'len', label: 'длина', min: 1, max: 24, step: 0.5, value: 7 },
    { type: 'range', key: 'grid', label: 'сетка', min: 10, max: 40, step: 1, value: 20 },
    { type: 'range', key: 'weight', label: 'тяжесть', min: 0.2, max: 2, step: 0.1, value: 1 },
    { type: 'toggle', key: 'net', label: 'сетка видна', value: true },
    { type: 'toggle', key: 'collide', label: 'коллизии', value: false },
    { type: 'button', label: 'собрать Ч', action: letter },
    { type: 'button', label: 'очистить', action() { wires = []; pinPrev = new Map(); } },
  ];

  function onTool(key) {
    if (key === 'grid') rescale();
    if (key === 'collide') pinPrev = new Map();
    if (key === 'tool') {
      hint.textContent = HINTS[num('tool')];
      canvas.style.cursor = num('tool') === 1 ? 'grab' : 'crosshair';
      paint = null;
      drag = null;
    }
  }

  for (const tool of tools) {
    if (tool.key) values[tool.key] = tool.value;

    if (tool.type === 'range') {
      const label = document.createElement('label');
      const caption = document.createElement('span');
      const input = document.createElement('input');
      input.type = 'range';
      input.min = tool.min; input.max = tool.max; input.step = tool.step; input.value = tool.value;
      const update = () => { caption.textContent = `${tool.label} · ${input.value}`; };
      update();
      input.addEventListener('input', () => {
        values[tool.key] = Number(input.value);
        update();
        onTool(tool.key);
      });
      label.append(caption, input);
      panel.append(label);
      continue;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = tool.type === 'button' ? 'sketch-action' : 'sketch-switch';

    if (tool.type === 'pick') {
      const update = () => { button.textContent = `${tool.label} · ${tool.options[values[tool.key]]}`; };
      update();
      button.addEventListener('click', () => {
        values[tool.key] = (values[tool.key] + 1) % tool.options.length;
        update();
        onTool(tool.key);
      });
      panel.append(button);
      continue;
    }

    button.textContent = tool.label;
    if (tool.type === 'toggle') {
      button.setAttribute('aria-pressed', String(tool.value));
      button.addEventListener('click', () => {
        values[tool.key] = !values[tool.key];
        button.setAttribute('aria-pressed', String(values[tool.key]));
        onTool(tool.key);
      });
    } else {
      button.addEventListener('click', tool.action);
    }
    panel.append(button);
  }

  const pause = document.createElement('button');
  pause.type = 'button';
  pause.className = 'sketch-action';
  pause.textContent = 'пауза';
  pause.addEventListener('click', () => {
    paused = !paused;
    pause.textContent = paused ? 'продолжить' : 'пауза';
    debt = 0;
  });
  panel.append(pause);

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

  function track(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - bounds.left - ox) / S;
    pointer.y = (event.clientY - bounds.top - oy) / S;
  }

  function down(event) {
    if (pointer.down || (event.pointerType === 'mouse' && event.button !== 0)) return;
    track(event);
    if (pointer.x < 0 || pointer.x > 1 || pointer.y < 0 || pointer.y > 1) return;
    pointer.down = true;
    pointer.id = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    onDown();
    if (!sent) { sent = true; reportEvent('Ч'); }
  }

  function move(event) {
    if (event.pointerId !== pointer.id) return;
    track(event);
    onMove();
  }

  function up(event) {
    if (event.pointerId !== pointer.id) return;
    onUp();
    pointer.down = false;
    pointer.id = null;
  }

  function key(event) {
    if (event.target.closest('input, textarea, select') || event.target.isContentEditable) return;
    if (event.key === 'Tab') { event.preventDefault(); toggle.click(); }
    if (event.code === 'Space') { event.preventDefault(); pause.click(); }
  }

  function resize() {
    W = workspace.clientWidth;
    H = workspace.clientHeight;
    S = Math.min(W, H);
    ox = (W - S) / 2;
    oy = (H - S) / 2;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  function frame(now) {
    debt = paused ? 0 : Math.min(0.1, debt + (now - last) / 1000);
    last = now;
    while (debt >= STEP) { step(); debt -= STEP; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    ctx.translate(ox, oy);
    draw();
    frameId = requestAnimationFrame(frame);
  }

  workspace.dataset.ground = 'paper';
  canvas.style.cursor = 'crosshair';
  workspace.append(hint, panel, toggle);
  const observer = new ResizeObserver(resize);
  observer.observe(workspace);
  resize();
  size = S;
  letter();

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up);
  document.addEventListener('keydown', key);
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    observer.disconnect();
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('lostpointercapture', up);
    document.removeEventListener('keydown', key);
    hint.remove(); panel.remove(); toggle.remove();
    delete workspace.dataset.ground;
    canvas.style.cursor = '';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
