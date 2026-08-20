/* Полигон буквы Д: пять механик рядом, чтобы посмотреть глазами и выбрать одну.
   Формы заданы в долях кадра, счёт идёт в пикселях кадра S. */

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const modesBar = document.getElementById('modes');
const toolsBar = document.getElementById('tools');
const note = document.getElementById('note');

const INK = '#161616';
const RED = '#e0210f';
const FAINT = 'rgba(22,22,22,.16)';
const PAPER = '#f1ede5';
const STEP = 1 / 60;

let S = 0;
let dpr = 1;
let current = null;
let modeState = {};
const toolValues = {};
const pointer = { x: 0, y: 0, px: 0, py: 0, down: false };

function slot(key) { return `${current}:${key}`; }
function num(key) { return Number(toolValues[slot(key)]); }
function pick(key) { return toolValues[slot(key)]; }
function on(key) { return Boolean(toolValues[slot(key)]); }
function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

/* ---------- форма Д ---------- */

// Печатная Д: перекладина, расходящиеся бока, плита с двумя лапками.
const D_OUTER = [
  [0.34, 0.16], [0.66, 0.16], [0.73, 0.72], [0.80, 0.72], [0.80, 0.87],
  [0.67, 0.87], [0.67, 0.79], [0.33, 0.79], [0.33, 0.87], [0.20, 0.87],
  [0.20, 0.72], [0.27, 0.72],
];
const D_HOLE = [[0.40, 0.22], [0.60, 0.22], [0.66, 0.725], [0.34, 0.725]];

function inPoly(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function inLetter(x, y) {
  return inPoly(D_OUTER, x, y) && !inPoly(D_HOLE, x, y);
}

// Точки по периметру обоих контуров: из них строятся все «точечные» механики.
function letterPoints(count) {
  const rings = [D_OUTER, D_HOLE];
  const spans = rings.map((ring) => {
    let total = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return total;
  });
  const all = spans[0] + spans[1];
  const out = [];
  rings.forEach((ring, r) => {
    const n = Math.max(3, Math.round((count * spans[r]) / all));
    const step = spans[r] / n;
    let walk = 0;
    let carry = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      while (carry < len) {
        const t = carry / len;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        carry += step;
      }
      carry -= len;
      walk += len;
    }
  });
  return out;
}

function pathPoly(poly, scale) {
  ctx.moveTo(poly[0][0] * scale, poly[0][1] * scale);
  for (let i = 1; i < poly.length; i += 1) ctx.lineTo(poly[i][0] * scale, poly[i][1] * scale);
  ctx.closePath();
}

function ghostLetter(color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  pathPoly(D_OUTER, S);
  pathPoly(D_HOLE, S);
  ctx.stroke();
}

const MODES = {};

/* ---------- 1. поток: жидкость огибает преграды ---------- */

function makeBlocks() {
  // Три клина: верхний развёрнут остриём вверх, нижние — вниз. Огибающие
  // складываются в силуэт Д: узкое горло, расходящиеся бока, две лапки.
  return [
    { x: 0.5, y: 0.32, r: 0.13, dir: 1 },
    { x: 0.32, y: 0.74, r: 0.11, dir: -1 },
    { x: 0.68, y: 0.74, r: 0.11, dir: -1 },
  ];
}

function blockPoints(b) {
  const out = [];
  for (let i = 0; i < 3; i += 1) {
    const a = (Math.PI * 2 * i) / 3 - Math.PI / 2;
    out.push([(b.x + Math.cos(a) * b.r) * S, (b.y + Math.sin(a) * b.r * b.dir) * S]);
  }
  // Отражение по вертикали переворачивает обход, а тест «внутри» смотрит на его знак.
  return b.dir < 0 ? out.reverse() : out;
}

function pushOut(tri, p) {
  // Внутри клина частицу выносит через ближайшее ребро и разгоняет вдоль него.
  let inside = true;
  let best = null;
  for (let i = 0; i < 3; i += 1) {
    const a = tri[i];
    const b = tri[(i + 1) % 3];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const cross = ex * (p.y - a[1]) - ey * (p.x - a[0]);
    const len = Math.hypot(ex, ey) || 1;
    const dist = cross / len;
    if (dist > 0) { inside = false; break; }
    if (!best || dist > best.dist) best = { dist, nx: -ey / len, ny: ex / len };
  }
  if (!inside || !best) return;
  p.x += best.nx * (-best.dist + 0.5);
  p.y += best.ny * (-best.dist + 0.5);
  const vn = p.vx * best.nx + p.vy * best.ny;
  if (vn < 0) {
    p.vx -= best.nx * vn * 1.05;
    p.vy -= best.ny * vn * 1.05;
  }
}

MODES.flow = {
  label: 'поток',
  note: 'жидкость льётся сверху и огибает клинья: форму держит не буква, а её обтекание. Клин можно тащить',
  tools: [
    { type: 'button', label: 'слить', action: () => { modeState.drops = []; } },
    { type: 'button', label: 'клинья на место', action: () => { modeState.blocks = makeBlocks(); } },
    { type: 'range', label: 'напор', key: 'flow', min: 1, max: 30, step: 0.5, value: 14 },
    { type: 'range', label: 'струя', key: 'jet', min: 0.005, max: 0.12, step: 0.005, value: 0.02 },
    { type: 'range', label: 'капля', key: 'drop', min: 0.004, max: 0.02, step: 0.001, value: 0.008 },
    { type: 'range', label: 'сколько воды', key: 'cap', min: 200, max: 3000, step: 50, value: 1400 },
    { type: 'range', label: 'липкость', key: 'stick', min: 0, max: 1, step: 0.05, value: 0.35 },
    { type: 'range', label: 'тяжесть', key: 'grav', min: 0.2, max: 3, step: 0.1, value: 1.2 },
    { type: 'toggle', label: 'шлейф', key: 'trail', value: false },
    { type: 'toggle', label: 'клинья видны', key: 'show', value: true },
  ],
  setup() {
    modeState.blocks = makeBlocks();
    modeState.drops = [];
    modeState.held = -1;
  },
  step() {
    const drops = modeState.drops;
    const r = num('drop') * S;
    const jet = num('jet') * S;
    for (let i = 0; i < num('flow') && drops.length < num('cap'); i += 1) {
      drops.push({
        x: S * 0.5 + (Math.random() - 0.5) * jet,
        y: -r * 2,
        vx: (Math.random() - 0.5) * 0.2,
        vy: S * 0.004,
      });
    }
    const g = num('grav') * S * 0.0004;
    const tris = modeState.blocks.map(blockPoints);
    for (const p of drops) {
      p.vy += g;
      p.x += p.vx;
      p.y += p.vy;
      for (const tri of tris) pushOut(tri, p);
    }
    // Расталкивание по ячейкам: без него струя падает ниткой и обтекания не видно.
    const cell = r * 2;
    const grid = new Map();
    for (const p of drops) {
      const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(p);
    }
    const push = 0.5 * (1 - num('stick') * 0.6);
    for (const p of drops) {
      const cx = Math.floor(p.x / cell);
      const cy = Math.floor(p.y / cell);
      for (let ox = -1; ox <= 1; ox += 1) {
        for (let oy = -1; oy <= 1; oy += 1) {
          const bucket = grid.get(`${cx + ox}:${cy + oy}`);
          if (!bucket) continue;
          for (const q of bucket) {
            if (q === p) continue;
            const dx = q.x - p.x;
            const dy = q.y - p.y;
            const d = Math.hypot(dx, dy);
            if (d > cell || d < 1e-6) continue;
            const shift = ((cell - d) / d) * push * 0.5;
            p.x -= dx * shift;
            p.y -= dy * shift;
            q.x += dx * shift;
            q.y += dy * shift;
          }
        }
      }
    }
    modeState.drops = drops.filter((p) => p.y < S * 1.1 && p.x > -S * 0.2 && p.x < S * 1.2);
    if (pointer.down && modeState.held >= 0) {
      const b = modeState.blocks[modeState.held];
      b.x = pointer.x / S;
      b.y = pointer.y / S;
    }
  },
  persist() { return on('trail'); },
  draw() {
    if (on('trail')) {
      ctx.fillStyle = 'rgba(241,237,229,.12)';
      ctx.fillRect(0, 0, S, S);
    }
    if (on('show')) {
      ctx.fillStyle = INK;
      for (const b of modeState.blocks) {
        const tri = blockPoints(b);
        ctx.beginPath();
        ctx.moveTo(tri[0][0], tri[0][1]);
        ctx.lineTo(tri[1][0], tri[1][1]);
        ctx.lineTo(tri[2][0], tri[2][1]);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.fillStyle = on('trail') ? 'rgba(22,22,22,.6)' : INK;
    const r = num('drop') * S;
    for (const p of modeState.drops) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  onDown() {
    let best = -1;
    let dist = S * 0.16;
    modeState.blocks.forEach((b, i) => {
      const d = Math.hypot(b.x * S - pointer.x, b.y * S - pointer.y);
      if (d < dist) { dist = d; best = i; }
    });
    modeState.held = best;
  },
  onUp() { modeState.held = -1; },
};

/* ---------- 2. анаморфоза: буква живёт в одном ракурсе ---------- */

const CAM = 2.4;   // камера стоит в 2.4 кадра от центра сцены

// X, Y — пиксели кадра, z — глубина в долях расстояния до камеры.
function project(X, Y, z, yaw) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const depth = CAM * S;
  const zp = z * S;
  const xr = X * cos + zp * sin;
  const zr = -X * sin + zp * cos;
  const k = depth / (depth - zr);
  return [S * 0.5 + xr * k, S * 0.5 + Y * k];
}

MODES.anamorph = {
  label: 'анаморфоза',
  note: 'палки висят в пустоте и сходятся в Д ровно в одном ракурсе. Тяни мышью',
  tools: [
    { type: 'range', label: 'палок', key: 'count', min: 40, max: 400, step: 10, value: 160, rebuild: true },
    { type: 'range', label: 'разлёт', key: 'spread', min: 0, max: 1.6, step: 0.05, value: 0.9, rebuild: true },
    { type: 'range', label: 'длина палки', key: 'len', min: 0.05, max: 1.2, step: 0.05, value: 0.45, rebuild: true },
    { type: 'toggle', label: 'сама крутится', key: 'spin', value: true },
    { type: 'toggle', label: 'подсказка', key: 'ghost', value: false },
  ],
  setup() {
    modeState.yaw = 0.55;
    modeState.sticks = letterPoints(num('count')).map(([px, py]) => {
      const x = (px - 0.5) * S;
      const y = (py - 0.5) * S;
      const z1 = (Math.random() - 0.5) * num('spread');
      const z2 = z1 + (Math.random() - 0.5) * num('len');
      // Оба конца палки лежат на одном луче зрения: в нулевом ракурсе они совпадают.
      const at = (z) => [x * (CAM - z) / CAM, y * (CAM - z) / CAM, z];
      return [at(z1), at(z2)];
    });
  },
  step() {
    if (pointer.down) modeState.yaw += (pointer.x - pointer.px) / S * 1.6;
    else if (on('spin')) modeState.yaw += 0.004;
  },
  draw() {
    const yaw = modeState.yaw;
    if (on('ghost')) ghostLetter(FAINT);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [a, b] of modeState.sticks) {
      const p = project(a[0], a[1], a[2], yaw);
      const q = project(b[0], b[1], b[2], yaw);
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(q[0], q[1]);
    }
    ctx.stroke();
    // Красным отмечен единственный ракурс, в котором палки вырождаются в точки.
    const off = Math.abs(((yaw + Math.PI) % (Math.PI * 2)) - Math.PI);
    if (off < 0.25) {
      ctx.fillStyle = RED;
      ctx.fillRect(0, S - 3, S * (1 - off / 0.25), 3);
    }
  },
};

/* ---------- 3. слизь: сеть прорастает по букве ---------- */

const N = 200;   // сторона поля феромонов

MODES.slime = {
  label: 'слизь',
  note: 'агенты идут по чужому следу и усиливают его: буква не рисуется, а прорастает. Мышь подсыпает еду',
  tools: [
    { type: 'button', label: 'заново', action: () => setMode(current) },
    { type: 'range', label: 'агентов', key: 'agents', min: 500, max: 12000, step: 500, value: 5000, rebuild: true },
    { type: 'range', label: 'испарение', key: 'evap', min: 0.005, max: 0.12, step: 0.005, value: 0.03 },
    { type: 'range', label: 'угол сенсора', key: 'sense', min: 0.1, max: 1.4, step: 0.05, value: 0.5 },
    { type: 'range', label: 'вынос сенсора', key: 'reach', min: 2, max: 18, step: 1, value: 7 },
    { type: 'range', label: 'поворот', key: 'turn', min: 0.05, max: 1.2, step: 0.05, value: 0.4 },
    { type: 'range', label: 'еда буквы', key: 'food', min: 0, max: 12, step: 0.25, value: 4 },
    { type: 'range', label: 'шаг', key: 'speed', min: 0.3, max: 2.5, step: 0.1, value: 1 },
  ],
  setup() {
    modeState.trail = new Float32Array(N * N);
    modeState.next = new Float32Array(N * N);
    modeState.food = new Float32Array(N * N);
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        modeState.food[y * N + x] = inLetter((x + 0.5) / N, (y + 0.5) / N) ? 1 : 0;
      }
    }
    // Колония высаживается в самой букве: снаружи ей нечего есть.
    modeState.agents = [];
    while (modeState.agents.length < num('agents')) {
      const x = Math.random() * N;
      const y = Math.random() * N;
      if (!inLetter(x / N, y / N)) continue;
      modeState.agents.push({ x, y, a: Math.random() * Math.PI * 2 });
    }
    const buffer = document.createElement('canvas');
    buffer.width = N;
    buffer.height = N;
    modeState.buffer = buffer;
    modeState.bctx = buffer.getContext('2d');
    modeState.image = modeState.bctx.createImageData(N, N);
  },
  step() {
    const { trail, next, food, agents } = modeState;
    const foodK = num('food');
    const sample = (x, y) => {
      const ix = ((Math.floor(x) % N) + N) % N;
      const iy = ((Math.floor(y) % N) + N) % N;
      const i = iy * N + ix;
      return trail[i] + food[i] * foodK;
    };
    const sense = num('sense');
    const reach = num('reach');
    const turn = num('turn');
    const speed = num('speed');
    for (const p of agents) {
      const f = sample(p.x + Math.cos(p.a) * reach, p.y + Math.sin(p.a) * reach);
      const l = sample(p.x + Math.cos(p.a - sense) * reach, p.y + Math.sin(p.a - sense) * reach);
      const r = sample(p.x + Math.cos(p.a + sense) * reach, p.y + Math.sin(p.a + sense) * reach);
      if (f >= l && f >= r) { /* прямо */ }
      else if (l > r) p.a -= turn * Math.random();
      else if (r > l) p.a += turn * Math.random();
      else p.a += (Math.random() - 0.5) * turn * 2;
      p.x = (p.x + Math.cos(p.a) * speed + N) % N;
      p.y = (p.y + Math.sin(p.a) * speed + N) % N;
      trail[Math.floor(p.y) * N + Math.floor(p.x)] += 1;
    }
    if (pointer.down) {
      const cx = Math.floor((pointer.x / S) * N);
      const cy = Math.floor((pointer.y / S) * N);
      for (let y = cy - 4; y <= cy + 4; y += 1) {
        for (let x = cx - 4; x <= cx + 4; x += 1) {
          if (x < 0 || y < 0 || x >= N || y >= N) continue;
          trail[y * N + x] += 4;
        }
      }
    }
    // Размытие и испарение: без них след не расходится в жилы.
    const keep = 1 - num('evap');
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        let sum = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            sum += trail[(((y + oy) % N) + N) % N * N + ((((x + ox) % N) + N) % N)];
          }
        }
        next[y * N + x] = (sum / 9) * keep;
      }
    }
    trail.set(next);
  },
  draw() {
    const { trail, image, bctx, buffer } = modeState;
    const data = image.data;
    // Яркость нормируем по самому сильному следу: иначе поле уходит в заливку.
    let peak = 0.001;
    for (let i = 0; i < N * N; i += 1) if (trail[i] > peak) peak = trail[i];
    modeState.peak = modeState.peak ? modeState.peak * 0.95 + peak * 0.05 : peak;
    const scale = 255 / (modeState.peak * 0.7);
    for (let i = 0; i < N * N; i += 1) {
      const v = clamp(trail[i] * scale, 0, 255);
      data[i * 4] = 241 - v * 0.88;
      data[i * 4 + 1] = 237 - v * 0.87;
      data[i * 4 + 2] = 229 - v * 0.85;
      data[i * 4 + 3] = 255;
    }
    bctx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buffer, 0, 0, S, S);
  },
};

/* ---------- 4. резонанс: буква прячется в спектре ---------- */

const FIELD = 128;
const TUNE = 6.35;   // частота, на которой узловые линии складываются в Д

function letterField() {
  const pts = letterPoints(260);
  const out = new Float32Array(FIELD * FIELD);
  for (let y = 0; y < FIELD; y += 1) {
    for (let x = 0; x < FIELD; x += 1) {
      const px = (x + 0.5) / FIELD;
      const py = (y + 0.5) / FIELD;
      let best = 9;
      for (const [qx, qy] of pts) {
        const d = (qx - px) * (qx - px) + (qy - py) * (qy - py);
        if (d < best) best = d;
      }
      out[y * FIELD + x] = Math.sqrt(best);
    }
  }
  return out;
}

MODES.chladni = {
  label: 'резонанс',
  note: 'песок сползает с пучностей на узловые линии. Где-то на шкале частота, на которой линии складываются в Д',
  tools: [
    { type: 'button', label: 'рассыпать', action: () => setMode(current) },
    { type: 'range', label: 'частота', key: 'freq', min: 1, max: 12, step: 0.05, value: 3 },
    { type: 'range', label: 'песчинок', key: 'sand', min: 1000, max: 12000, step: 500, value: 6000, rebuild: true },
    { type: 'range', label: 'тряска', key: 'shake', min: 0.2, max: 4, step: 0.1, value: 1.4 },
  ],
  setup() {
    modeState.field = letterField();
    modeState.sand = [];
    for (let i = 0; i < num('sand'); i += 1) {
      modeState.sand.push({ x: Math.random(), y: Math.random() });
    }
  },
  step() {
    const f = num('freq');
    const w = Math.exp(-(((f - TUNE) / 0.3) ** 2));
    const n = 1 + Math.floor(f);
    const m = 1 + Math.floor(f * 1.7) % 7;
    const shake = num('shake') * 0.006;
    const field = modeState.field;
    const letterAt = (x, y) => {
      const ix = clamp(Math.floor(x * FIELD), 0, FIELD - 1);
      const iy = clamp(Math.floor(y * FIELD), 0, FIELD - 1);
      return clamp(field[iy * FIELD + ix] * 8, 0, 1);
    };
    const plateAt = (x, y) => (
      Math.cos(n * Math.PI * x) * Math.cos(m * Math.PI * y)
      - Math.cos(m * Math.PI * x) * Math.cos(n * Math.PI * y)
    ) * 0.5;
    const amplitude = (x, y) => Math.abs((1 - w) * plateAt(x, y) + w * letterAt(x, y));
    const e = 0.004;
    for (const p of modeState.sand) {
      const amp = amplitude(p.x, p.y);
      // Песчинку и трясёт тем сильнее, чем выше пучность, и сносит вниз по склону.
      const gx = amplitude(p.x + e, p.y) - amplitude(p.x - e, p.y);
      const gy = amplitude(p.x, p.y + e) - amplitude(p.x, p.y - e);
      const step = shake * (0.01 + amp);
      p.x = clamp(p.x - gx * shake * 3 + (Math.random() - 0.5) * step * 2, 0, 1);
      p.y = clamp(p.y - gy * shake * 3 + (Math.random() - 0.5) * step * 2, 0, 1);
    }
  },
  draw() {
    const f = num('freq');
    const w = Math.exp(-(((f - TUNE) / 0.3) ** 2));
    ctx.fillStyle = w > 0.5 ? RED : INK;
    for (const p of modeState.sand) ctx.fillRect(p.x * S, p.y * S, 1.6, 1.6);
  },
};

/* ---------- 5. развёртка: одна ось экрана — это время ---------- */

MODES.slit = {
  label: 'развёртка',
  note: 'по горизонтали идёт не место, а время: буква пишется темпом жеста, а не траекторией',
  tools: [
    { type: 'button', label: 'стереть', action: () => { modeState.wipe = true; } },
    { type: 'range', label: 'скорость', key: 'speed', min: 0.2, max: 6, step: 0.1, value: 1.6 },
    { type: 'range', label: 'толщина от скорости', key: 'gain', min: 0, max: 3, step: 0.1, value: 1.2 },
    { type: 'toggle', label: 'выцветание', key: 'fade', value: true },
  ],
  setup() {
    modeState.col = 0;
    modeState.wipe = true;
  },
  persist() { return true; },
  draw() {
    if (modeState.wipe) {
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, S, S);
      modeState.wipe = false;
    }
    if (on('fade')) {
      ctx.fillStyle = 'rgba(241,237,229,.02)';
      ctx.fillRect(0, 0, S, S);
    }
    const speed = num('speed');
    const col = modeState.col;
    ctx.fillStyle = PAPER;
    ctx.fillRect(col, 0, speed + 2, S);
    if (pointer.down) {
      const v = Math.hypot(pointer.x - pointer.px, pointer.y - pointer.py);
      const h = 2 + v * num('gain');
      ctx.fillStyle = v > S * 0.02 ? RED : INK;
      ctx.fillRect(col, pointer.y - h / 2, Math.max(1, speed), h);
    }
    modeState.col = (col + speed) % S;
  },
};

/* ---------- панель ---------- */

function renderTools(mode) {
  toolsBar.innerHTML = '';
  for (const tool of mode.tools) {
    if (tool.type === 'button') {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tool.label;
      button.addEventListener('click', tool.action);
      toolsBar.append(button);
      continue;
    }
    // Подобранное значение переживает пересборку сцены.
    const key = slot(tool.key);
    const value = key in toolValues ? toolValues[key] : tool.value;
    toolValues[key] = value;
    if (tool.type === 'toggle') {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tool.label;
      button.setAttribute('aria-pressed', String(value));
      button.addEventListener('click', () => {
        toolValues[key] = !toolValues[key];
        button.setAttribute('aria-pressed', String(toolValues[key]));
        if (tool.rebuild) setMode(current);
      });
      toolsBar.append(button);
      continue;
    }
    if (tool.type === 'choice') {
      const group = document.createElement('span');
      group.className = 'modes';
      for (const option of tool.options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = option;
        button.setAttribute('aria-pressed', String(option === value));
        button.addEventListener('click', () => {
          toolValues[key] = option;
          for (const other of group.children) {
            other.setAttribute('aria-pressed', String(other.textContent === option));
          }
        });
        group.append(button);
      }
      toolsBar.append(group);
      continue;
    }
    const label = document.createElement('label');
    const input = document.createElement('input');
    const out = document.createElement('span');
    input.type = 'range';
    input.min = tool.min;
    input.max = tool.max;
    input.step = tool.step;
    input.value = value;
    out.textContent = value;
    input.addEventListener('input', () => {
      toolValues[key] = Number(input.value);
      out.textContent = input.value;
      if (tool.rebuild) setMode(current);
    });
    label.append(tool.label, input, out);
    toolsBar.append(label);
  }
}

function setMode(name) {
  current = name;
  const mode = MODES[name];
  // Панель читает значения уже нового режима, поэтому current меняется первым.
  modeState = {};
  renderTools(mode);
  if (mode.setup) mode.setup();
  note.textContent = mode.note;
  for (const button of modesBar.children) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === name));
  }
}

for (const [name, mode] of Object.entries(MODES)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.mode = name;
  button.textContent = mode.label;
  button.addEventListener('click', () => setMode(name));
  modesBar.append(button);
}

/* ---------- сцена ---------- */

function resize() {
  const bounds = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const next = Math.max(1, bounds.width);
  const changed = Math.abs(next - S) > 1;
  S = next;
  canvas.width = Math.round(S * dpr);
  canvas.height = Math.round(S * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (changed && current) setMode(current);
}

function track(event) {
  const bounds = canvas.getBoundingClientRect();
  pointer.px = pointer.x;
  pointer.py = pointer.y;
  pointer.x = event.clientX - bounds.left;
  pointer.y = event.clientY - bounds.top;
}

canvas.addEventListener('pointerdown', (event) => {
  track(event);
  pointer.px = pointer.x;
  pointer.py = pointer.y;
  pointer.down = true;
  canvas.setPointerCapture(event.pointerId);
  MODES[current].onDown?.();
});

canvas.addEventListener('pointermove', (event) => {
  track(event);
  MODES[current].onMove?.();
});

window.addEventListener('pointerup', () => {
  pointer.down = false;
  MODES[current].onUp?.();
});

let last = performance.now();
let debt = 0;
function frame(now) {
  debt = Math.min(0.1, debt + (now - last) / 1000);
  last = now;
  const mode = MODES[current];
  while (debt >= STEP) {
    if (mode.step) mode.step();
    // Штрихи и капли читают путь курсора за шаг, поэтому хвост подтягиваем следом.
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    debt -= STEP;
  }
  if (!mode.persist || !mode.persist()) ctx.clearRect(0, 0, S, S);
  mode.draw();
  requestAnimationFrame(frame);
}

new ResizeObserver(resize).observe(canvas);
resize();
setMode('flow');
requestAnimationFrame(frame);
