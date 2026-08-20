/* Полигон буквы Д: девять механик рядом, чтобы посмотреть глазами и выбрать одну.
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
const pointer = { x: 0, y: 0, px: 0, py: 0, down: false, seen: false, erase: false };

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
    { x: 0.5, y: 0.32, r: 0.13, dir: 1, rot: 0 },
    { x: 0.32, y: 0.74, r: 0.11, dir: -1, rot: 0 },
    { x: 0.68, y: 0.74, r: 0.11, dir: -1, rot: 0 },
  ];
}

function blockPoints(b) {
  const out = [];
  const cos = Math.cos(b.rot);
  const sin = Math.sin(b.rot);
  for (let i = 0; i < 3; i += 1) {
    const a = (Math.PI * 2 * i) / 3 - Math.PI / 2;
    // Клин сначала разворачивается остриём по своему dir, и только потом крутится.
    const dx = Math.cos(a) * b.r;
    const dy = Math.sin(a) * b.r * b.dir;
    out.push([(b.x + dx * cos - dy * sin) * S, (b.y + dx * sin + dy * cos) * S]);
  }
  return out;
}

// Знак обхода зависит от того, куда смотрит остриё, поэтому меряем его на месте:
// у перевёрнутого клина внешняя сторона рёбер оказывается по другую руку.
function winding(tri) {
  let sum = 0;
  for (let i = 0; i < 3; i += 1) {
    const a = tri[i];
    const b = tri[(i + 1) % 3];
    sum += (b[0] - a[0]) * (b[1] + a[1]);
  }
  return sum < 0 ? -1 : 1;
}

function pushOut(tri, p) {
  // Внутри клина частицу выносит через ближайшее ребро и разгоняет вдоль него.
  const w = winding(tri);
  let inside = true;
  let best = null;
  for (let i = 0; i < 3; i += 1) {
    const a = tri[i];
    const b = tri[(i + 1) % 3];
    const ex = (b[0] - a[0]) * w;
    const ey = (b[1] - a[1]) * w;
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

function nearestBlock() {
  let best = -1;
  let dist = S * 0.16;
  modeState.blocks.forEach((b, i) => {
    const d = Math.hypot(b.x * S - pointer.x, b.y * S - pointer.y);
    if (d < dist) { dist = d; best = i; }
  });
  return best;
}

MODES.flow = {
  label: 'поток',
  note: 'жидкость льётся сверху и огибает клинья: форму держит не буква, а её обтекание. Клин тащат мышью, крутят колесом или мышью с shift',
  tools: [
    { type: 'button', label: 'слить', action: () => { modeState.drops = []; } },
    { type: 'button', label: 'клинья на место', action: () => { modeState.blocks = makeBlocks(); } },
    { type: 'button', label: 'повернуть все', action: () => { for (const b of modeState.blocks) b.rot += Math.PI / 12; } },
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
      if (modeState.spin) {
        // С shift клин не едет за курсором, а поворачивается вслед за ним.
        const angle = Math.atan2(pointer.y - b.y * S, pointer.x - b.x * S);
        if (modeState.grabAngle === undefined) modeState.grabAngle = angle - b.rot;
        b.rot = angle - modeState.grabAngle;
      } else {
        b.x = pointer.x / S;
        b.y = pointer.y / S;
      }
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
  onDown(event) {
    modeState.held = nearestBlock();
    modeState.spin = Boolean(event && event.shiftKey);
    modeState.grabAngle = undefined;
  },
  onUp() { modeState.held = -1; modeState.grabAngle = undefined; },
  onWheel(delta) {
    const i = nearestBlock();
    if (i < 0) return;
    modeState.blocks[i].rot += delta * 0.002;
  },
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
    { type: 'range', label: 'поводок', key: 'leash', min: 0, max: 1, step: 0.05, value: 0.9 },
    { type: 'range', label: 'шаг', key: 'speed', min: 0.3, max: 2.5, step: 0.1, value: 1 },
    { type: 'range', label: 'насыщение', key: 'cap', min: 1, max: 30, step: 1, value: 6 },
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
    const leash = num('leash');
    for (const p of agents) {
      const f = sample(p.x + Math.cos(p.a) * reach, p.y + Math.sin(p.a) * reach);
      const l = sample(p.x + Math.cos(p.a - sense) * reach, p.y + Math.sin(p.a - sense) * reach);
      const r = sample(p.x + Math.cos(p.a + sense) * reach, p.y + Math.sin(p.a + sense) * reach);
      if (f >= l && f >= r) { /* прямо */ }
      else if (l > r) p.a -= turn * Math.random();
      else if (r > l) p.a += turn * Math.random();
      else p.a += (Math.random() - 0.5) * turn * 2;
      const nx = (p.x + Math.cos(p.a) * speed + N) % N;
      const ny = (p.y + Math.sin(p.a) * speed + N) % N;
      // Поводок держит агента в букве: своя сеть кормит лучше, чем форма, и без
      // упора колония стягивает лапки и перекладину в выгодное кольцо.
      const next = Math.floor(ny) * N + Math.floor(nx);
      if (food[next] === 0 && Math.random() < leash) {
        p.a += Math.PI * 0.5 + Math.random() * Math.PI;
      } else {
        p.x = nx;
        p.y = ny;
      }
      trail[Math.floor(p.y) * N + Math.floor(p.x)] += 1;
    }
    // Буква подкармливает след постоянно, иначе она стирается собственной сетью.
    if (foodK > 0) {
      for (let i = 0; i < N * N; i += 1) if (food[i] > 0) trail[i] += foodK * 0.02;
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
    const cap = num('cap');
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        let sum = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            sum += trail[(((y + oy) % N) + N) % N * N + ((((x + ox) % N) + N) % N)];
          }
        }
        // Потолок на след: без него одна жила забирает всю колонию, и тонкие
        // места буквы — лапки, перекладина — высыхают.
        next[y * N + x] = Math.min((sum / 9) * keep, cap);
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
    { type: 'range', label: 'качка', key: 'wobble', min: 0, max: 0.6, step: 0.02, value: 0.16 },
    { type: 'range', label: 'подсев', key: 'reseed', min: 0, max: 40, step: 1, value: 8 },
  ],
  setup() {
    modeState.field = letterField();
    modeState.t = 0;
    modeState.sand = [];
    for (let i = 0; i < num('sand'); i += 1) {
      modeState.sand.push({ x: Math.random(), y: Math.random() });
    }
  },
  step() {
    modeState.t += STEP;
    const t = modeState.t;
    // Живой звук не стоит на месте: частота дышит, а сама пластина то бьёт,
    // то отпускает — иначе песок оседает за пару секунд и картинка застывает.
    const f = num('freq') + Math.sin(t * 0.6) * num('wobble');
    const w = Math.exp(-(((f - TUNE) / 0.3) ** 2));
    const n = 1 + Math.floor(f);
    const m = 1 + Math.floor(f * 1.7) % 7;
    const beat = 0.45 + 0.55 * Math.abs(Math.sin(t * 1.7));
    const shake = num('shake') * 0.006 * beat;
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
    // Часть песка возвращается в кадр заново и сползает на линии на глазах:
    // движение к узору видно не хуже самого узора.
    const sand = modeState.sand;
    for (let i = 0; i < num('reseed'); i += 1) {
      const p = sand[Math.floor(Math.random() * sand.length)];
      p.x = Math.random();
      p.y = Math.random();
    }
  },
  draw() {
    const f = num('freq') + Math.sin(modeState.t * 0.6) * num('wobble');
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

/* ---------- 6. кристалл: движение плавит, покой выращивает ---------- */

const CRYSTAL = 112;

function seedCrystal(cx, cy, radius) {
  const grain = ++modeState.grain;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      if (x < 0 || y < 0 || x >= CRYSTAL || y >= CRYSTAL) continue;
      if (Math.hypot(x - cx, y - cy) > radius) continue;
      const i = y * CRYSTAL + x;
      if (modeState.crystals[i]) continue;
      modeState.crystals[i] = grain;
      modeState.age[i] = 0;
      modeState.occupied.push(i);
    }
  }
}

MODES.crystal = {
  label: 'кристалл',
  note: 'движение курсора плавит решётку, неподвижность выращивает новый кристалл. Попробуй замереть',
  tools: [
    { type: 'button', label: 'расплавить всё', action: () => setMode(current) },
    { type: 'range', label: 'рост', key: 'growth', min: 1, max: 40, step: 1, value: 12 },
    { type: 'range', label: 'покой', key: 'rest', min: 0.05, max: 1.5, step: 0.05, value: 0.35 },
    { type: 'range', label: 'жар курсора', key: 'heat', min: 2, max: 18, step: 1, value: 8 },
    { type: 'toggle', label: 'затравки', key: 'seeds', value: true, rebuild: true },
  ],
  setup() {
    modeState.crystals = new Uint16Array(CRYSTAL * CRYSTAL);
    modeState.age = new Uint8Array(CRYSTAL * CRYSTAL);
    modeState.occupied = [];
    modeState.grain = 0;
    modeState.motion = 0;
    modeState.still = 0;
    modeState.tick = 0;
    const buffer = document.createElement('canvas');
    buffer.width = CRYSTAL;
    buffer.height = CRYSTAL;
    modeState.buffer = buffer;
    modeState.bctx = buffer.getContext('2d');
    modeState.image = modeState.bctx.createImageData(CRYSTAL, CRYSTAL);
    if (on('seeds')) {
      for (let i = 0; i < 7; i += 1) {
        seedCrystal(12 + Math.random() * (CRYSTAL - 24), 12 + Math.random() * (CRYSTAL - 24), 1.2);
      }
    }
  },
  onMove() {
    modeState.motion = Math.max(modeState.motion, Math.hypot(pointer.x - pointer.px, pointer.y - pointer.py));
    modeState.still = 0;
  },
  step() {
    modeState.tick += 1;
    modeState.motion *= 0.78;
    if (pointer.seen) {
      if (modeState.motion > 0.8) {
        const cx = (pointer.x / S) * CRYSTAL;
        const cy = (pointer.y / S) * CRYSTAL;
        const radius = num('heat') * (0.65 + Math.min(2, modeState.motion / 12));
        for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
          for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
            if (x < 0 || y < 0 || x >= CRYSTAL || y >= CRYSTAL) continue;
            if (Math.hypot(x - cx, y - cy) > radius) continue;
            const i = y * CRYSTAL + x;
            modeState.crystals[i] = 0;
            modeState.age[i] = 0;
          }
        }
        modeState.still = 0;
      } else {
        modeState.still += STEP;
        if (modeState.still > num('rest') && modeState.tick % 12 === 0) {
          seedCrystal((pointer.x / S) * CRYSTAL, (pointer.y / S) * CRYSTAL, 1.3);
        }
      }
    }

    const occupied = modeState.occupied;
    for (let n = 0; n < num('growth') && occupied.length; n += 1) {
      const from = occupied[Math.floor(Math.random() * occupied.length)];
      const grain = modeState.crystals[from];
      if (!grain) continue;
      const x = from % CRYSTAL;
      const y = Math.floor(from / CRYSTAL);
      const dir = Math.floor(Math.random() * 8);
      const ox = [-1, 0, 1, -1, 1, -1, 0, 1][dir];
      const oy = [-1, -1, -1, 0, 0, 1, 1, 1][dir];
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= CRYSTAL || ny >= CRYSTAL) continue;
      const to = ny * CRYSTAL + nx;
      if (modeState.crystals[to]) continue;
      modeState.crystals[to] = grain;
      modeState.age[to] = 0;
      occupied.push(to);
    }
    for (let i = 0; i < modeState.age.length; i += 1) {
      if (modeState.crystals[i] && modeState.age[i] < 255) modeState.age[i] += 1;
    }
    if (modeState.tick % 180 === 0) {
      modeState.occupied = occupied.filter((i) => modeState.crystals[i]);
    }
  },
  draw() {
    const { crystals, age, image, bctx, buffer } = modeState;
    const data = image.data;
    for (let i = 0; i < crystals.length; i += 1) {
      const p = i * 4;
      const grain = crystals[i];
      if (!grain) {
        data[p] = 241; data[p + 1] = 237; data[p + 2] = 229; data[p + 3] = 255;
        continue;
      }
      if (age[i] < 14) {
        const hot = 1 - age[i] / 14;
        data[p] = 22 + (224 - 22) * hot;
        data[p + 1] = 22 + (33 - 22) * hot;
        data[p + 2] = 22 + (15 - 22) * hot;
      } else {
        const shade = 18 + ((grain * 37) % 38);
        data[p] = shade; data[p + 1] = shade; data[p + 2] = shade;
      }
      data[p + 3] = 255;
    }
    bctx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buffer, 0, 0, S, S);
  },
};

/* ---------- 7. эхо: настоящее тянет за собой прошлые состояния ---------- */

function echoPath(node, scale) {
  ctx.save();
  ctx.translate(node.x, node.y);
  ctx.scale(scale, scale);
  ctx.translate(-S * 0.5, -S * 0.5);
  ctx.beginPath();
  pathPoly(D_OUTER, S);
  pathPoly(D_HOLE, S);
  ctx.restore();
}

MODES.echo = {
  label: 'эхо времени',
  note: 'тащи настоящее: прошлые состояния догоняют его по очереди, а после отпускания возвращают жест назад',
  tools: [
    { type: 'button', label: 'собрать', action: () => setMode(current) },
    { type: 'range', label: 'слоёв', key: 'layers', min: 8, max: 48, step: 2, value: 28, rebuild: true },
    { type: 'range', label: 'запаздывание', key: 'lag', min: 0.02, max: 0.28, step: 0.01, value: 0.09 },
    { type: 'range', label: 'инерция', key: 'drag', min: 0.55, max: 0.96, step: 0.01, value: 0.88 },
    { type: 'range', label: 'глубина', key: 'depth', min: 0, max: 0.5, step: 0.02, value: 0.22 },
    { type: 'toggle', label: 'связи', key: 'mesh', value: true },
  ],
  setup() {
    modeState.nodes = [];
    modeState.anchor = { x: S * 0.5, y: S * 0.5 };
    modeState.release = 9;
    for (let i = 0; i < num('layers'); i += 1) {
      modeState.nodes.push({ x: S * 0.5, y: S * 0.5, vx: 0, vy: 0 });
    }
  },
  onUp() { modeState.release = 0; },
  step() {
    const nodes = modeState.nodes;
    if (pointer.down) {
      modeState.anchor.x = pointer.x;
      modeState.anchor.y = pointer.y;
      modeState.release = 0;
    } else {
      modeState.release += STEP;
      if (modeState.release > 0.8) {
        modeState.anchor.x += (S * 0.5 - modeState.anchor.x) * 0.035;
        modeState.anchor.y += (S * 0.5 - modeState.anchor.y) * 0.035;
      }
    }
    const targetX = modeState.anchor.x;
    const targetY = modeState.anchor.y;
    const damping = num('drag');
    const lag = num('lag');
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      const goal = i === 0 ? { x: targetX, y: targetY } : nodes[i - 1];
      const pull = i === 0 ? 0.14 : lag;
      n.vx = (n.vx + (goal.x - n.x) * pull) * damping;
      n.vy = (n.vy + (goal.y - n.y) * pull) * damping;
      const cap = S * 0.08;
      const speed = Math.hypot(n.vx, n.vy);
      if (speed > cap) { n.vx *= cap / speed; n.vy *= cap / speed; }
      n.x += n.vx;
      n.y += n.vy;
    }
  },
  draw() {
    const nodes = modeState.nodes;
    const depth = num('depth');
    let hottest = 0;
    let stretch = 0;
    for (let i = 1; i < nodes.length; i += 1) {
      const d = Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].y - nodes[i - 1].y);
      if (d > stretch) { stretch = d; hottest = i; }
    }
    if (on('mesh')) {
      ctx.strokeStyle = 'rgba(22,22,22,.09)';
      ctx.lineWidth = 1;
      for (const corner of [0, 2, 4, 7, 9, 11]) {
        ctx.beginPath();
        nodes.forEach((node, i) => {
          const scale = 0.72 * (1 - depth * i / Math.max(1, nodes.length - 1));
          const p = D_OUTER[corner];
          const x = node.x + (p[0] - 0.5) * S * scale;
          const y = node.y + (p[1] - 0.5) * S * scale;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    }
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const scale = 0.72 * (1 - depth * i / Math.max(1, nodes.length - 1));
      echoPath(nodes[i], scale);
      ctx.strokeStyle = i === hottest && stretch > S * 0.012 ? RED : `rgba(22,22,22,${0.08 + (1 - i / nodes.length) * 0.12})`;
      ctx.lineWidth = i === 0 ? 2 : 1;
      ctx.stroke();
    }
  },
};

/* ---------- 8. предсказатель: поле реагирует на вероятное будущее ---------- */

MODES.predict = {
  label: 'предсказатель',
  note: 'поле уворачивается от места, где курсор окажется позже. Резко смени направление, чтобы сломать прогноз',
  tools: [
    { type: 'button', label: 'успокоить', action: () => setMode(current) },
    { type: 'range', label: 'точек', key: 'density', min: 12, max: 36, step: 2, value: 24, rebuild: true },
    { type: 'range', label: 'вперёд, сек', key: 'ahead', min: 0.05, max: 0.8, step: 0.05, value: 0.35 },
    { type: 'range', label: 'влияние', key: 'radius', min: 0.05, max: 0.35, step: 0.01, value: 0.17 },
    { type: 'range', label: 'сила будущего', key: 'force', min: 0.1, max: 2.5, step: 0.1, value: 1.8 },
    { type: 'range', label: 'возврат', key: 'return', min: 0.01, max: 0.2, step: 0.01, value: 0.03 },
    { type: 'toggle', label: 'показывать прогноз', key: 'ghost', value: true },
  ],
  setup() {
    const density = num('density');
    modeState.particles = [];
    for (let y = 0; y < density; y += 1) {
      for (let x = 0; x < density; x += 1) {
        const px = (x + 0.5) / density;
        const py = (y + 0.5) / density;
        if (!inLetter(px, py)) continue;
        modeState.particles.push({ hx: px * S, hy: py * S, x: px * S, y: py * S, vx: 0, vy: 0 });
      }
    }
    const x = pointer.seen ? pointer.x : S * 0.5;
    const y = pointer.seen ? pointer.y : S * 0.5;
    modeState.pred = { x, y };
    modeState.vx = 0;
    modeState.vy = 0;
    modeState.inputX = 0;
    modeState.inputY = 0;
    modeState.queue = [];
    modeState.pulses = [];
  },
  onMove() {
    modeState.inputX += pointer.x - pointer.px;
    modeState.inputY += pointer.y - pointer.py;
    const miss = Math.hypot(modeState.pred.x - pointer.x, modeState.pred.y - pointer.y);
    if (miss > S * 0.14 && modeState.pulses.length < 8) {
      modeState.pulses.push({ x: pointer.x, y: pointer.y, r: 2, alpha: Math.min(1, miss / (S * 0.3)) });
    }
  },
  step() {
    const moving = Math.abs(modeState.inputX) + Math.abs(modeState.inputY) > 0.01;
    modeState.vx = modeState.vx * (moving ? 0.62 : 0.82) + modeState.inputX * 0.38;
    modeState.vy = modeState.vy * (moving ? 0.62 : 0.82) + modeState.inputY * 0.38;
    modeState.inputX = 0;
    modeState.inputY = 0;
    const frames = Math.max(1, Math.round(num('ahead') / STEP));
    const cursorX = pointer.seen ? pointer.x : S * 0.5;
    const cursorY = pointer.seen ? pointer.y : S * 0.5;
    const tx = clamp(cursorX + modeState.vx * frames, 0, S);
    const ty = clamp(cursorY + modeState.vy * frames, 0, S);
    modeState.pred.x += (tx - modeState.pred.x) * 0.35;
    modeState.pred.y += (ty - modeState.pred.y) * 0.35;
    modeState.queue.push({ x: modeState.pred.x, y: modeState.pred.y });
    if (modeState.queue.length > frames) {
      const expected = modeState.queue.shift();
      const error = Math.hypot(expected.x - pointer.x, expected.y - pointer.y);
      if (pointer.seen && error > S * 0.09 && modeState.pulses.length < 8) {
        modeState.pulses.push({ x: pointer.x, y: pointer.y, r: 2, alpha: Math.min(1, error / (S * 0.3)) });
      }
    }

    const radius = num('radius') * S;
    const force = num('force') * 0.9;
    const home = num('return');
    for (const p of modeState.particles) {
      const dx = p.x - modeState.pred.x;
      const dy = p.y - modeState.pred.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < radius) {
        const push = (1 - dist / radius) * force;
        p.vx += (dx / dist) * push;
        p.vy += (dy / dist) * push;
      }
      p.vx = (p.vx + (p.hx - p.x) * home) * 0.87;
      p.vy = (p.vy + (p.hy - p.y) * home) * 0.87;
      p.x += p.vx;
      p.y += p.vy;
    }
    for (const pulse of modeState.pulses) {
      pulse.r += S * 0.006;
      pulse.alpha *= 0.91;
    }
    modeState.pulses = modeState.pulses.filter((pulse) => pulse.alpha > 0.03);
  },
  draw() {
    ctx.fillStyle = INK;
    const r = Math.max(1.2, S / num('density') * 0.09);
    for (const p of modeState.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (on('ghost') && pointer.seen) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pointer.x, pointer.y);
      ctx.lineTo(modeState.pred.x, modeState.pred.y);
      ctx.moveTo(modeState.pred.x + S * 0.013, modeState.pred.y);
      ctx.arc(modeState.pred.x, modeState.pred.y, S * 0.013, 0, Math.PI * 2);
      ctx.moveTo(modeState.pred.x - S * 0.025, modeState.pred.y);
      ctx.lineTo(modeState.pred.x + S * 0.025, modeState.pred.y);
      ctx.moveTo(modeState.pred.x, modeState.pred.y - S * 0.025);
      ctx.lineTo(modeState.pred.x, modeState.pred.y + S * 0.025);
      ctx.stroke();
    }
    for (const pulse of modeState.pulses) {
      ctx.strokeStyle = `rgba(224,33,15,${pulse.alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, pulse.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
};

/* ---------- 9. решётка: направление жеста становится состоянием модуля ---------- */

const GRID_LEVELS = 5;
const GRID_CAP = 5;
const PILOT_CURVES = [
  [[1257.13, 231.104], [1026.3, 505.771], [538.431, 1081.7], [433.631, 1188.1]],
  [[433.631, 1188.1], [302.631, 1321.1], [103.954, 1148], [229.131, 1030.1]],
  [[229.131, 1030.1], [397, 872], [626.499, 1243.6], [882.131, 1243.6]],
  [[882.131, 1243.6], [1224, 1243.6], [1400, 674.5], [1080, 354.5]],
  [[1080, 354.5], [759.999, 34.5001], [267, 263], [267, 520.5]],
  [[267, 520.5], [267, 726.5], [423.833, 716.833], [486, 714.5]],
];

function buildPilotRoute() {
  const route = [];
  for (let curve = 0; curve < PILOT_CURVES.length; curve += 1) {
    const [a, b, c, d] = PILOT_CURVES[curve];
    for (let i = curve ? 1 : 0; i <= 72; i += 1) {
      const t = i / 72;
      const u = 1 - t;
      const x = u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0];
      const y = u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1];
      route.push([0.06 + (x / 1446) * 0.88, 0.06 + (y / 1450) * 0.88]);
    }
  }
  return route;
}

function clearGrid() {
  modeState.fieldX.fill(0);
  modeState.fieldY.fill(0);
  modeState.nextX.fill(0);
  modeState.nextY.fill(0);
  modeState.level.fill(0);
  modeState.display.fill(0);
  modeState.flash.fill(0);
}

function rotateGrid() {
  for (let i = 0; i < modeState.fieldX.length; i += 1) {
    const x = modeState.fieldX[i];
    modeState.fieldX[i] = -modeState.fieldY[i];
    modeState.fieldY[i] = x;
    modeState.flash[i] = 1;
  }
}

function paintGridStroke(fromX, fromY, toX, toY, erase) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const speed = Math.hypot(dx, dy);
  if (speed < 0.5) return;
  const n = modeState.n;
  const cell = S / n;
  const radius = num('brush') * S;
  const cx = toX / cell;
  const cy = toY / cell;
  const rr = radius / cell;
  const ux = dx / speed;
  const uy = dy / speed;
  const force = num('pressure') * (0.9 + Math.min(2.2, speed / cell));
  for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y += 1) {
    for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x += 1) {
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (dist > rr) continue;
      const weight = (1 - dist / rr) ** 1.5;
      const i = y * n + x;
      if (erase) {
        const keep = Math.max(0, 1 - force * weight * 0.34);
        modeState.fieldX[i] *= keep;
        modeState.fieldY[i] *= keep;
        continue;
      }
      modeState.fieldX[i] += ux * force * weight;
      modeState.fieldY[i] += uy * force * weight;
      const magnitude = Math.hypot(modeState.fieldX[i], modeState.fieldY[i]);
      if (magnitude > GRID_CAP) {
        modeState.fieldX[i] *= GRID_CAP / magnitude;
        modeState.fieldY[i] *= GRID_CAP / magnitude;
      }
    }
  }
}

MODES.snap = {
  label: 'решётка',
  cursor: 'crosshair',
  note: 'веди — рисуй, повтори в ту же сторону — уплотняй, обратно — стирай, поперёк — поворачивай. Shift — чистый ластик',
  tools: [
    { type: 'button', label: 'очистить', action: clearGrid },
    { type: 'button', label: 'повернуть всё', action: rotateGrid },
    { type: 'toggle', label: 'автопилот', key: 'pilot', value: false },
    { type: 'range', label: 'скорость авто', key: 'pilotSpeed', min: 0.5, max: 5, step: 0.1, value: 2.4 },
    { type: 'range', label: 'забывание', key: 'fade', min: 0, max: 1, step: 0.05, value: 0 },
    { type: 'range', label: 'ячеек', key: 'cells', min: 14, max: 46, step: 2, value: 30, rebuild: true },
    { type: 'range', label: 'кисть', key: 'brush', min: 0.015, max: 0.14, step: 0.005, value: 0.055 },
    { type: 'range', label: 'нажим', key: 'pressure', min: 0.2, max: 5, step: 0.1, value: 1.5 },
    { type: 'range', label: 'сцепление соседей', key: 'couple', min: 0, max: 1, step: 0.05, value: 0.2 },
    { type: 'range', label: 'неодинаковость', key: 'grain', min: 0, max: 1, step: 0.05, value: 0.35 },
  ],
  setup() {
    const n = num('cells');
    const size = n * n;
    modeState.n = n;
    modeState.fieldX = new Float32Array(size);
    modeState.fieldY = new Float32Array(size);
    modeState.nextX = new Float32Array(size);
    modeState.nextY = new Float32Array(size);
    modeState.angle = new Float32Array(size);
    modeState.display = new Float32Array(size);
    modeState.level = new Uint8Array(size);
    modeState.flash = new Float32Array(size);
    modeState.bias = new Float32Array(size);
    modeState.twist = new Float32Array(size);
    modeState.pilotRoute = buildPilotRoute().map(([x, y]) => [x * S, y * S]);
    modeState.pilotIndex = 0;
    modeState.pilotCarry = 0;
    modeState.pilotPause = 0;
    modeState.pilotRunning = true;
    modeState.pilotOnce = true;
    for (let i = 0; i < size; i += 1) {
      modeState.angle[i] = Math.random() * Math.PI;
      modeState.bias[i] = Math.random() - 0.5;
      modeState.twist[i] = Math.random() * 2 - 1;
    }
  },
  onMove() {
    if (!pointer.down) return;
    paintGridStroke(pointer.px, pointer.py, pointer.x, pointer.y, pointer.erase);
  },
  step() {
    const n = modeState.n;
    const repeat = on('pilot');
    if (!repeat && !modeState.pilotOnce) modeState.pilotRunning = false;
    if (modeState.pilotPause > 0) {
      modeState.pilotPause -= STEP;
      if (modeState.pilotPause <= 0 && repeat) {
        modeState.pilotIndex = 0;
        modeState.pilotCarry = 0;
        modeState.pilotRunning = true;
      }
    } else if (repeat && !modeState.pilotRunning && !modeState.pilotOnce) {
      modeState.pilotIndex = 0;
      modeState.pilotCarry = 0;
      modeState.pilotRunning = true;
    }
    if (modeState.pilotRunning) {
      modeState.pilotCarry += num('pilotSpeed');
      while (modeState.pilotCarry >= 1 && modeState.pilotIndex < modeState.pilotRoute.length - 1) {
        const from = modeState.pilotRoute[modeState.pilotIndex];
        const to = modeState.pilotRoute[modeState.pilotIndex + 1];
        paintGridStroke(from[0], from[1], to[0], to[1], false);
        modeState.pilotIndex += 1;
        modeState.pilotCarry -= 1;
      }
      if (modeState.pilotIndex >= modeState.pilotRoute.length - 1) {
        modeState.pilotRunning = false;
        if (modeState.pilotOnce) {
          modeState.pilotOnce = false;
          setToolValue('fade', 0.5);
        }
        if (repeat) modeState.pilotPause = 0.8;
      }
    }
    const coupling = num('couple') * 0.12;
    const fade = num('fade');
    const keep = fade === 0 ? 1 : 1 - fade * 0.004;
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const i = y * n + x;
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        if (x > 0) { sumX += modeState.fieldX[i - 1]; sumY += modeState.fieldY[i - 1]; count += 1; }
        if (x < n - 1) { sumX += modeState.fieldX[i + 1]; sumY += modeState.fieldY[i + 1]; count += 1; }
        if (y > 0) { sumX += modeState.fieldX[i - n]; sumY += modeState.fieldY[i - n]; count += 1; }
        if (y < n - 1) { sumX += modeState.fieldX[i + n]; sumY += modeState.fieldY[i + n]; count += 1; }
        const ownX = modeState.fieldX[i];
        const ownY = modeState.fieldY[i];
        const magnitude = Math.hypot(ownX, ownY) * keep;
        const mixedX = ownX + (sumX / count - ownX) * coupling;
        const mixedY = ownY + (sumY / count - ownY) * coupling;
        const mixedMagnitude = Math.hypot(mixedX, mixedY);
        if (mixedMagnitude > 1e-6) {
          modeState.nextX[i] = (mixedX / mixedMagnitude) * magnitude;
          modeState.nextY[i] = (mixedY / mixedMagnitude) * magnitude;
        } else {
          modeState.nextX[i] = ownX * keep;
          modeState.nextY[i] = ownY * keep;
        }
      }
    }
    [modeState.fieldX, modeState.nextX] = [modeState.nextX, modeState.fieldX];
    [modeState.fieldY, modeState.nextY] = [modeState.nextY, modeState.fieldY];

    const grain = num('grain');
    for (let i = 0; i < modeState.fieldX.length; i += 1) {
      const magnitude = Math.hypot(modeState.fieldX[i], modeState.fieldY[i]);
      const raw = (magnitude / GRID_CAP) * GRID_LEVELS + 0.25 + modeState.bias[i] * grain;
      const level = clamp(Math.floor(raw), 0, GRID_LEVELS - 1);
      if (level !== modeState.level[i]) {
        modeState.level[i] = level;
        modeState.flash[i] = 1;
      }
      modeState.flash[i] *= 0.84;
      modeState.display[i] += (level - modeState.display[i]) * 0.18;
      if (magnitude > 0.03) {
        const target = Math.atan2(modeState.fieldY[i], modeState.fieldX[i]) + modeState.twist[i] * grain * 0.42;
        const turn = Math.atan2(Math.sin(target - modeState.angle[i]), Math.cos(target - modeState.angle[i]));
        modeState.angle[i] += turn * 0.2;
      }
    }
  },
  draw() {
    const n = modeState.n;
    const cell = S / n;
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const i = y * n + x;
        const cx = (x + 0.5) * cell;
        const cy = (y + 0.5) * cell;
        const density = modeState.display[i];
        if (density < 0.08) {
          ctx.fillStyle = 'rgba(22,22,22,.12)';
          ctx.fillRect(cx - 0.5, cy - 0.5, 1, 1);
          continue;
        }
        const level = Math.max(1, Math.round(density));
        const length = cell * (0.54 + density * 0.045);
        const band = cell * 0.42;
        const hot = modeState.flash[i] > 0.08;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(modeState.angle[i]);
        if (level >= GRID_LEVELS - 1) {
          ctx.fillStyle = hot ? RED : INK;
          ctx.fillRect(-length / 2, -cell * 0.18, length, cell * 0.36);
        } else {
          const lines = level * 2 - 1;
          ctx.strokeStyle = hot ? RED : INK;
          ctx.lineWidth = Math.max(0.7, cell * (0.035 + density * 0.008));
          ctx.beginPath();
          for (let line = 0; line < lines; line += 1) {
            const offset = lines === 1 ? 0 : -band / 2 + (band * line) / (lines - 1);
            ctx.moveTo(-length / 2, offset);
            ctx.lineTo(length / 2, offset);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    }
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
      button.dataset.tool = tool.key;
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
    input.dataset.tool = tool.key;
    input.min = tool.min;
    input.max = tool.max;
    input.step = tool.step;
    input.value = value;
    out.textContent = value;
    input.addEventListener('input', () => {
      toolValues[key] = Number(input.value);
      out.textContent = input.value;
    });
    if (tool.rebuild) input.addEventListener('change', () => setMode(current));
    label.append(tool.label, input, out);
    toolsBar.append(label);
  }
}

function setToolValue(key, value) {
  toolValues[slot(key)] = value;
  const control = toolsBar.querySelector(`[data-tool="${key}"]`);
  if (!control) return;
  if (control.matches('input')) {
    control.value = value;
    if (control.nextElementSibling) control.nextElementSibling.textContent = String(value);
  } else {
    control.setAttribute('aria-pressed', String(Boolean(value)));
  }
}

function setMode(name) {
  current = name;
  const mode = MODES[name];
  canvas.style.cursor = mode.cursor || 'default';
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
  pointer.seen = true;
  pointer.erase = event.shiftKey;
}

canvas.addEventListener('pointerdown', (event) => {
  track(event);
  pointer.px = pointer.x;
  pointer.py = pointer.y;
  pointer.down = true;
  canvas.setPointerCapture(event.pointerId);
  MODES[current].onDown?.(event);
});

canvas.addEventListener('wheel', (event) => {
  if (!MODES[current].onWheel) return;
  event.preventDefault();
  track(event);
  MODES[current].onWheel(event.deltaY);
}, { passive: false });

canvas.addEventListener('pointermove', (event) => {
  track(event);
  MODES[current].onMove?.();
});

window.addEventListener('pointerup', () => {
  pointer.down = false;
  pointer.erase = false;
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
setMode('snap');
requestAnimationFrame(frame);
