import { reportEvent } from '../progress.js?v=5';

/* Ч · канаты.
   Жгут — верёвка заданной длины: начинается в гвоздике, висит под своим весом,
   конец можно приколоть во вторую клетку. Заготовка — рукописная ч: провис и
   есть её почерк, потому что дуга и крюк тут не нарисованы, а выбраны слабиной.
   Физика перенесена из WIRES, авторской рисовалки жгутов; полигон — lab/ch.html. */

const STEP = 1 / 60;
const INK = '#161616';
const PAPER = '#f1ede5';
const RED = '#e0210f';
const FAINT = 'rgba(22,22,22,.09)';
const MAX_WIRES = 400;
const MAX_LENGTH = 48;
const CELL_REF = 44;      /* клетка исходника: к ней привязана тяжесть */
const GRAVITY = 0.22;
const PASSES = 10;
const SUBSTEPS = 8;
const RELEASE = 90;       /* кадры мягкой гравитации после отпускания */
const TAP = 350;          /* окно двойного касания, мс */

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
  let press = null;
  let tap = null;
  let touchDouble = -Infinity;
  let selected = null;
  let newLength = 7;

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

  /* Узлы добавляются на самих отрезках: форма и обход креплений сохраняются. */
  function resample(w) {
    const p = w.rt.points;
    const count = Math.max(p.length, countOf(w.length));
    while (p.length < count) {
      let longest = 0;
      let at = 1;
      for (let i = 1; i < p.length; i += 1) {
        const length = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
        if (length > longest) { longest = length; at = i; }
      }
      const a = p[at - 1];
      const b = p[at];
      p.splice(at, 0, {
        x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
        ox: (a.ox + b.ox) / 2, oy: (a.oy + b.oy) / 2,
      });
    }
    w.rt.step = p.length > 1 ? (w.length * cellSize()) / (p.length - 1) : 0;
  }

  /* ---------- длина ---------- */

  /* Хвост нельзя приколоть дальше, чем позволяет длина: жгут дотягивается. */
  function tailMinimum(w, endX, endY) {
    return Math.max(0.5, Math.hypot(endX - w.x, endY - w.y));
  }

  function minimumLength(w) {
    return !w.freeStart && pinned(w) ? Math.max(1, tailMinimum(w, w.endX, w.endY)) : 1;
  }

  function setLength(w, value) {
    w.targetLength = clamp(value, minimumLength(w), MAX_LENGTH);
  }

  /* Длина подтягивается к заданной по чуть-чуть: скачок дёрнул бы канат. */
  function adjustLength(w) {
    if (w.targetLength === undefined || w.rt.dragging || w.rt.dragEnd) return;
    const target = Math.max(minimumLength(w), w.targetLength);
    if (Math.abs(target - w.length) < 1e-6) return;
    w.length += clamp(target - w.length, -0.12, 0.12);
    resample(w);
  }

  function slackOf(w) {
    if (w.freeStart || !pinned(w)) return Infinity;
    const span = Math.hypot(world(w.endX) - world(w.x), world(w.endY) - world(w.y));
    return w.length * cellSize() - span;
  }

  /* ---------- гвоздики ---------- */

  function pinIndex() {
    const cell = cellSize();
    const index = new Map();
    const add = (point, id) => {
      const key = `${Math.floor(point.x / cell)},${Math.floor(point.y / cell)}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ x: point.x, y: point.y, id });
    };
    for (const w of wires) {
      const p = w.rt.points;
      if (!w.freeStart || w.rt.dragging) add(p[0], w.id);
      if (pinned(w) || w.rt.dragEnd) add(p[p.length - 1], w.id);
    }
    return index;
  }

  function fixed(w, i) {
    return (i === 0 && (!w.freeStart || w.rt.dragging))
      || (i === w.rt.points.length - 1 && (pinned(w) || Boolean(w.rt.dragEnd)));
  }

  /* Проверяем весь отрезок, а не его концы: гвоздик не проскочит между узлами.
     Поправку делим по весам концов, не сдвигая крепления. */
  function resolvePins(w, index, clearance) {
    const cell = cellSize();
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
        /* Совпадающие крепления — общий узел, а не препятствие своей ветви. */
        if ([0, p.length - 1].some(j => fixed(w, j)
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
        const wa = fixed(w, i) ? 0 : 1;
        const wb = fixed(w, i + 1) ? 0 : 1;
        const weight = wa * (1 - t) ** 2 + wb * t ** 2;
        if (weight < 1e-6) continue;
        const overlap = clearance - distance;
        const push = Math.min(overlap / weight, cell * 0.4);
        a.x += nx * push * wa * (1 - t);
        a.y += ny * push * wa * (1 - t);
        b.x += nx * push * wb * t;
        b.y += ny * push * wb * t;
      }
    }
  }

  /* ---------- шаг ---------- */

  /* Ничто не проходит за подшаг больше пятой доли клетки — этим, а не свипом,
     держится непроницаемость: быстрый рывок дробится, а не пролетает насквозь. */
  function advance(w) {
    const r = w.rt;
    const p = r.points;
    const cell = cellSize();
    const move = (q, x, y) => {
      const distance = Math.hypot(x - q.x, y - q.y);
      const t = distance ? Math.min(1, (cell * 0.2) / distance) : 1;
      q.x = q.ox = lerp(q.x, x, t);
      q.y = q.oy = lerp(q.y, y, t);
    };
    if (!w.freeStart || r.dragging) move(p[0], r.tx, r.ty);
    const end = r.dragEnd || (pinned(w) ? { x: world(w.endX), y: world(w.endY) } : null);
    if (end) move(p[p.length - 1], end.x, end.y);
    r.ax = p[0].x; r.ay = p[0].y;

    const progress = r.release > 0 ? 1 - r.release / RELEASE : 1;
    const damping = (r.release > 0 ? 0.88 + 0.05 * progress : 0.94) ** (1 / SUBSTEPS);
    const gravity = GRAVITY * (cell / CELL_REF) * num('weight')
      * (r.release > 0 ? 0.68 + 0.32 * progress : 1) / SUBSTEPS ** 2;
    for (let i = 0; i < p.length; i += 1) {
      if (fixed(w, i)) continue;
      const q = p[i];
      const vx = (q.x - q.ox) * damping;
      const vy = (q.y - q.oy) * damping + gravity;
      const speed = Math.hypot(vx, vy);
      const scale = speed ? Math.min(1, (cell * 0.2) / speed) : 1;
      q.ox = q.x; q.oy = q.y;
      q.x += vx * scale; q.y += vy * scale;
    }
  }

  function simulate(w, index) {
    const r = w.rt;
    const p = r.points;
    for (let pass = 0; pass < PASSES; pass += 1) {
      for (let j = 0; j < p.length - 1; j += 1) {
        const i = pass % 2 ? p.length - 2 - j : j;
        const a = p[i];
        const b = p[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 1;
        const wa = fixed(w, i) ? 0 : 1;
        const wb = fixed(w, i + 1) ? 0 : 1;
        if (!wa && !wb) continue;
        const diff = (distance - r.step) / distance / (wa + wb);
        a.x += dx * diff * wa; a.y += dy * diff * wa;
        b.x -= dx * diff * wb; b.y -= dy * diff * wb;
      }
      if (index) resolvePins(w, index, cellSize() * 1.06);
    }
    r.ax = p[0].x; r.ay = p[0].y;
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

  function step() {
    if (size !== S) {
      refit(S / (size || S));
      size = S;
    }
    for (const w of wires) adjustLength(w);
    for (let sub = 0; sub < SUBSTEPS; sub += 1) {
      for (const w of wires) advance(w);
      const index = on('collide') ? pinIndex() : null;
      for (const w of wires) simulate(w, index);
    }
    for (const w of wires) if (w.rt.release > 0) w.rt.release -= 1;
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
    ctx.strokeStyle = FAINT;
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
    ctx.arc(w.rt.ax, w.rt.ay, cell * (w.freeStart ? 0.1 : 0.17), 0, Math.PI * 2);
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
    if (selected) {
      ctx.save();
      ropePath(selected.rt.points);
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
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
    return wires.some(w => (w !== exclude && ((!w.freeStart && w.x === x && w.y === y)
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
    if (num('tool') === 1) select(w);
    return true;
  }

  function eraseWire(x, y) {
    const before = wires.length;
    wires = wires.filter(w => !(w.x === x && w.y === y));
    if (!wires.includes(selected)) select(null);
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

  function hitPoint(includeBody = false) {
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
      if (includeBody) {
        for (let j = 1; j < p.length; j += 1) {
          const a = p[j - 1];
          const b = p[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const span = dx * dx + dy * dy;
          const t = span ? clamp(((px - a.x) * dx + (py - a.y) * dy) / span, 0, 1) : 0;
          if (Math.hypot(px - lerp(a.x, b.x, t), py - lerp(a.y, b.y, t)) <= cell * 0.55) {
            return { wire: w, part: 'body' };
          }
        }
      }
    }
    return null;
  }

  /* Ч рукописная, нарисованная руками в самой букве: короткий штрих, чаша
     и длинный хвост, слабина которого свернулась в крюк. Слабина задана в
     клетках сверх пролёта, поэтому заготовка переживает смену частоты сетки. */
  function letter() {
    wires = [];
    seq = 0;
    drag = null;
    paint = null;
    const unit = Math.ceil(num('grid')) / 20;
    const at = value => Math.round(value * unit);
    const put = (x, y, endX, endY, slack) => {
      seq += 1;
      const w = { id: seq, x: at(x), y: at(y), endX: at(endX), endY: at(endY) };
      w.length = tailMinimum(w, w.endX, w.endY) + slack * unit;
      wires.push(w);
      seed(w);
    };
    put(6, 4, 6, 8, 0.4);
    put(6, 4, 12, 4, 6.4);
    put(12, 4, 15, 14, 2.76);
    select(null);
  }

  /* ---------- слой буквы ---------- */

  const HINTS = {
    0: 'проведи по полю — ляжет канат',
    1: 'клик выбирает канат · тяни концы · двойной клик снимает крепление',
    2: 'проведи по гвоздикам — снимет канаты',
  };

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = HINTS[1];

  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.hidden = true;
  panel.style.maxHeight = 'calc(100% - 64px)';
  panel.style.overflowY = 'auto';

  let lengthInput = null;
  let lengthCaption = null;

  /* Ползунок длины служит двум делам сразу: с выбранным жгутом правит его,
     без выбора задаёт длину новых. Подпись говорит, чем он занят сейчас. */
  function syncLength() {
    const minimum = selected ? Math.ceil(minimumLength(selected) * 10) / 10 : 1;
    const value = selected ? Math.max(minimum, selected.targetLength ?? selected.length) : newLength;
    lengthInput.min = minimum;
    lengthInput.max = Math.max(MAX_LENGTH, Math.ceil(value));
    lengthInput.value = value.toFixed(1);
    lengthCaption.textContent = `${selected ? `длина №${selected.id}` : 'длина нового'} · ${Number(lengthInput.value)}`;
  }

  function select(w) {
    selected = w;
    if (lengthInput) syncLength();
  }

  const tools = [
    { type: 'pick', key: 'tool', label: 'инструмент', options: ['кисть', 'курсор', 'ластик'], value: 1 },
    { type: 'range', key: 'len', label: 'длина нового', min: 1, max: MAX_LENGTH, step: 0.1, value: 7 },
    { type: 'range', key: 'grid', label: 'сетка', min: 10, max: 40, step: 1, value: 20 },
    { type: 'range', key: 'weight', label: 'тяжесть', min: 0.2, max: 2, step: 0.1, value: 1 },
    { type: 'toggle', key: 'net', label: 'сетка видна', value: true },
    { type: 'toggle', key: 'collide', label: 'коллизии', value: false },
    { type: 'button', label: 'собрать Ч', action: letter },
    { type: 'button', label: 'очистить', action() { wires = []; select(null); } },
  ];

  function onTool(key) {
    if (key === 'len') {
      if (selected) setLength(selected, num('len'));
      else newLength = num('len');
      syncLength();
    }
    if (key === 'grid') rescale();
    if (key === 'tool') {
      hint.textContent = HINTS[num('tool')];
      canvas.style.cursor = num('tool') === 1 ? 'default' : 'crosshair';
      paint = null;
      drag = null;
      select(null);
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
      const update = () => { caption.textContent = `${tool.label} · ${Number(input.value)}`; };
      update();
      input.addEventListener('input', () => {
        values[tool.key] = Number(input.value);
        if (tool.key === 'len') onTool('len');
        else { update(); onTool(tool.key); }
      });
      label.append(caption, input);
      panel.append(label);
      if (tool.key === 'len') { lengthInput = input; lengthCaption = caption; }
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

  /* ---------- ввод ---------- */

  function onDown(event) {
    const tool = num('tool');
    const cell = pointerCell();
    press = {
      x: pointer.x * S, y: pointer.y * S,
      touch: event.pointerType === 'touch', moved: false, time: performance.now(),
    };

    if (tool === 0 || tool === 2) {
      paint = { last: cell, mode: tool === 0 ? 'brush' : 'erase' };
      if (tool === 0) addWire(cell.x, cell.y, newLength);
      else eraseWire(cell.x, cell.y);
      return;
    }

    const hit = hitPoint(true);
    select(hit?.wire || null);
    if (hit && hit.part !== 'body') drag = { ...hit, moved: false };
  }

  function onMove() {
    const px = pointer.x * S;
    const py = pointer.y * S;
    if (press && Math.hypot(px - press.x, py - press.y) > 6) press.moved = true;

    if (paint) {
      const cell = pointerCell();
      for (const c of cellsBetween(paint.last, cell)) {
        if (paint.mode === 'brush') addWire(c.x, c.y, newLength);
        else eraseWire(c.x, c.y);
      }
      paint.last = cell;
      return;
    }

    if (!drag || !press?.moved) return;
    const { wire, part } = drag;
    drag.moved = true;
    wire.rt.release = 0;
    delete wire.targetLength;
    if (part === 'start') {
      wire.rt.dragging = true;
      wire.rt.tx = px; wire.rt.ty = py;
    } else {
      wire.rt.dragEnd = { x: px, y: py };
    }
    const other = part === 'start' ? wire.rt.points[wire.rt.points.length - 1] : wire.rt.points[0];
    if (part === 'tail' || pinned(wire)) {
      const need = Math.hypot(px - other.x, py - other.y) / cellSize();
      if (need > wire.length) {
        wire.length = Math.min(MAX_LENGTH, need);
        resample(wire);
      }
    }
    syncLength();
  }

  function onUp() {
    paint = null;
    const done = drag;
    const held = press;
    drag = null;
    press = null;

    if (done?.moved) {
      const { wire, part } = done;
      const limit = Math.ceil(num('grid'));
      const cell = pointerCell();
      const inside = cell.x >= 0 && cell.y >= 0 && cell.x < limit && cell.y < limit;
      const otherPinned = part === 'start' ? pinned(wire) : !wire.freeStart;
      const otherX = part === 'start' ? wire.endX : wire.x;
      const otherY = part === 'start' ? wire.endY : wire.y;
      const valid = inside && !occupied(cell.x, cell.y, wire)
        && !(otherPinned && cell.x === otherX && cell.y === otherY);

      if (part === 'start') {
        wire.rt.dragging = false;
        if (valid) { wire.x = cell.x; wire.y = cell.y; wire.freeStart = false; }
        wire.rt.tx = world(wire.x); wire.rt.ty = world(wire.y);
      } else {
        wire.rt.dragEnd = null;
        if (valid) { wire.endX = cell.x; wire.endY = cell.y; }
      }
      if (!wire.freeStart && pinned(wire)) {
        wire.length = Math.max(wire.length, tailMinimum(wire, wire.endX, wire.endY));
      }
      resample(wire);
      wire.rt.release = RELEASE;
      syncLength();
    }

    /* На сенсорном экране двойного клика нет — собираем его из двух касаний. */
    if (held?.touch && !held.moved && performance.now() - held.time < TAP) {
      const now = performance.now();
      if (tap && now - tap.time < TAP && Math.hypot(held.x - tap.x, held.y - tap.y) < 18) {
        onDouble();
        touchDouble = now;
        tap = null;
      } else tap = { x: held.x, y: held.y, time: now };
    } else tap = null;
  }

  function onDouble(event) {
    if (num('tool') !== 1) return;
    if (event && performance.now() - touchDouble < 500) return;
    const hit = hitPoint(true);
    if (hit) {
      const { wire, part } = hit;
      if (part === 'body') return;
      if (part === 'start') wire.freeStart = true;
      else { delete wire.endX; delete wire.endY; }
      wire.rt.release = RELEASE;
      select(wire);
      return;
    }
    const cell = pointerCell();
    addWire(cell.x, cell.y, newLength);
  }

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
    onDown(event);
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

  function double(event) {
    track(event);
    onDouble(event);
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
  canvas.style.cursor = 'default';
  workspace.append(hint, panel, toggle);
  const observer = new ResizeObserver(resize);
  observer.observe(workspace);
  resize();
  size = S;
  newLength = num('len');
  letter();
  syncLength();

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up);
  canvas.addEventListener('dblclick', double);
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
    canvas.removeEventListener('dblclick', double);
    document.removeEventListener('keydown', key);
    hint.remove(); panel.remove(); toggle.remove();
    delete workspace.dataset.ground;
    canvas.style.cursor = '';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
