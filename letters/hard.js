const STEP = 1 / 60;
const INK = '#f1ede5';
const PAPER = '#161616';
const DEPTH_LIMIT = 1.4;
const MAX_ANGLE = 45;
const BANDS = 12;
const LEVELS = 63;
const SHADES = 31;
const THREAD = 100000;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const ink = alpha => `rgba(241,237,229,${alpha})`;

const FABRICS = [
  { name: 'марля', model: 'weave', n: 26, tearX: 1.3, tearY: 1.55, stiffnessX: .74, stiffnessY: .48, shear: .035, opacity: .035, drag: .965, flow: 1.15 },
  { name: 'шёлк', model: 'membrane', n: 32, tear: 1.95, stiffness: .28, stiffen: 2.1, shear: .22, opacity: .72, drag: .989, flow: .9 },
  { name: 'мешковина', model: 'weave', n: 27, tearX: 1.2, tearY: 1.38, stiffnessX: .94, stiffnessY: .76, shear: .08, opacity: .42, drag: .95, flow: 1.05 },
  { name: 'латекс', model: 'membrane', n: 30, tear: 2.45, stiffness: .1, stiffen: 5.5, shear: .16, opacity: .9, drag: .994, flow: .72, elastic: true, rupture: .2 },
  { name: 'бумага', model: 'sheet', n: 28, tear: 1.13, stiffness: .98, shear: .92, opacity: 1, drag: .9, flow: 1.28, paper: true, rupture: .16 },
  { name: 'армированная плёнка', model: 'laminate', n: 29, tear: 1.18, stiffness: .48, stiffen: 1.2, shear: .2, opacity: .2, drag: .975, flow: 1, reinforced: true },
];

const DENSITIES = [['обычная', 1], ['плотная', 1.25], ['очень плотная', 1.4]];

const GLYPH_LOOPS = [
  [[379.318, 334.58], [493.604, 489], [203.552, 489], [376.552, 254], [257.732, 254], [220.679, 204], [475.448, 204]],
  [[302.448, 439], [394.396, 439], [348.299, 376.716]],
].map(loop => loop.map(([x, y]) => ({ x: (x - 348.578) / 550, y: (y - 346.5) / 550 })));
const GLYPH_EDGES = GLYPH_LOOPS.flatMap(loop => loop.map((a, i) => [a, loop[(i + 1) % loop.length]]));
const GLYPH_FACES = [];
const GLYPH_LEVELS = [...new Set(GLYPH_LOOPS.flat().map(p => p.y))].sort((a, b) => a - b);
for (let i = 1; i < GLYPH_LEVELS.length; i++) {
  const top = GLYPH_LEVELS[i - 1], bottom = GLYPH_LEVELS[i], middle = (top + bottom) / 2;
  const at = ([a, b], y) => a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
  const edges = GLYPH_EDGES.filter(([a, b]) => Math.min(a.y, b.y) < middle && Math.max(a.y, b.y) > middle).sort((a, b) => at(a, middle) - at(b, middle));
  for (let j = 0; j < edges.length; j += 2) GLYPH_FACES.push([
    { x: at(edges[j], top), y: top }, { x: at(edges[j + 1], top), y: top },
    { x: at(edges[j + 1], bottom), y: bottom }, { x: at(edges[j], bottom), y: bottom },
  ]);
}
const GLYPH_PIECES = [
  ...GLYPH_FACES.flatMap(face => [-.045, .045].map(z => face.map(p => ({ ...p, z })))),
  ...GLYPH_EDGES.map(([a, b]) => [{ ...a, z: -.045 }, { ...b, z: -.045 }, { ...b, z: .045 }, { ...a, z: .045 }]),
];

function collide(p) {
  if (p.detached) return;
  if (p.z < -.065 || p.z > .08 || p.pz > .08) return;
  let inside = false, distance = Infinity, nx = 0, ny = 0;
  for (const [a, b] of GLYPH_EDGES) {
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
    const x = a.x + dx * t - p.x, y = a.y + dy * t - p.y;
    const d = Math.hypot(x, y);
    if (d < distance) { distance = d; nx = x; ny = y; }
  }
  if (inside) {
    p.z = -.066;
    p.pz = Math.min(p.pz, p.z);
    p.hit = true;
    p.x += nx / (distance || 1) * .00065;
    p.y += ny / (distance || 1) * .00065;
  }
}

function pinCorners(sheet) {
  const z = -1.7 + sheet.travel * .35;
  for (const p of sheet.nodes) {
    if (!p.anchor) continue;
    p.x = p.px = p.ax;
    p.y = p.py = p.ay;
    p.z = p.pz = z;
  }
}

function markDetached(sheet) {
  const neighbors = sheet.nodes.map(() => []);
  for (const e of sheet.links) if (e.active) {
    neighbors[e.a].push(e.b);
    neighbors[e.b].push(e.a);
  }
  const reached = new Set();
  const queue = [];
  sheet.nodes.forEach((p, i) => {
    if (!p.anchor) return;
    reached.add(i);
    queue.push(i);
  });
  for (let i = 0; i < queue.length; i++) {
    for (const next of neighbors[queue[i]]) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  sheet.nodes.forEach((p, i) => { p.detached = !reached.has(i); });
}

function stiffness(link, material, strain) {
  if (link.bend) return .32;
  if (link.fiber) return .98;
  if (material.model === 'weave') {
    if (link.axis === 'x') return material.stiffnessX;
    if (link.axis === 'y') return material.stiffnessY;
    return material.shear;
  }
  if (link.axis === 'd') return material.shear;
  return clamp(material.stiffness + (material.stiffen || 0) * Math.max(0, strain - 1) ** 2, material.stiffness, .98);
}

function tearLimit(link, material) {
  if (link.fiber) return 2.5;
  const base = material.model === 'weave'
    ? (link.axis === 'x' ? material.tearX : link.axis === 'y' ? material.tearY : Math.min(material.tearX, material.tearY) * .94)
    : material.tear;
  return Math.max(1.04, base - link.damage);
}

function rupture(sheet, link) {
  const amount = sheet.material.rupture || 0;
  if (!amount) return;
  for (const neighbor of [...sheet.incident[link.a], ...sheet.incident[link.b]]) {
    if (!neighbor.active || neighbor.bend || neighbor.fiber) continue;
    neighbor.damage = Math.min(.5, neighbor.damage + amount);
  }
}

function createSheet(material, n, id) {
  const sheet = { material, nodes: [], links: [], faces: [], age: 0, travel: 0, broken: 0, frames: 0, id };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - .5) * 1.12;
    const y = (j / (n - 1) - .5) * 1.12;
    const z = -1.7 + (material.paper ? .002 : .025) * Math.sin(i * .7 + j * .5 + id);
    sheet.nodes.push({ x, y, z, px: x, py: y, pz: z - .004, hit: false, anchor: (i === 0 || i === n - 1) && (j === 0 || j === n - 1), ax: x, ay: y, hem: i < 2 || j < 2 || i >= n - 2 || j >= n - 2 });
  }
  const edge = (a, b, visible = true, axis = 'd') => {
    const link = { a, b, axis, damage: 0, length: Math.hypot(sheet.nodes[a].x - sheet.nodes[b].x, sheet.nodes[a].y - sheet.nodes[b].y, sheet.nodes[a].z - sheet.nodes[b].z), active: true, visible, faces: [] };
    sheet.links.push(link);
    return link;
  };
  const horizontal = [], vertical = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    if (i < n - 1) horizontal[k] = edge(k, k + 1, true, 'x');
    if (j < n - 1) vertical[k] = edge(k, k + n, true, 'y');
  }
  const face = (ids, edges) => {
    const item = { ids, edges, shade: 0 };
    for (const e of edges) e.faces.push(item);
    sheet.faces.push(item);
  };
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const k = j * n + i, diagonal = edge(k, k + n + 1, false);
    face([k, k + 1, k + n + 1], [horizontal[k], vertical[k + 1], diagonal]);
    face([k, k + n + 1, k + n], [diagonal, horizontal[k + n], vertical[k]]);
  }
  if (material.reinforced) {
    for (const e of [...sheet.links]) {
      if (!e.visible) continue;
      const row = Math.floor(e.a / n), col = e.a % n;
      if ((e.b - e.a === 1 && row % 4 === 0) || (e.b - e.a === n && col % 4 === 0)) {
        const fiber = edge(e.a, e.b, true, e.axis);
        fiber.fiber = true;
        fiber.faces = e.faces;
      }
    }
  }
  if (material.paper) {
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      for (const [end, supports] of [
        ...(i < n - 2 ? [[k + 2, [horizontal[k], horizontal[k + 1]]]] : []),
        ...(j < n - 2 ? [[k + n * 2, [vertical[k], vertical[k + n]]]] : []),
      ]) {
        const bend = edge(k, end, false, 'bend');
        bend.bend = true;
        bend.supports = supports;
      }
    }
  }
  sheet.incident = sheet.nodes.map(() => []);
  for (const link of sheet.links) {
    sheet.incident[link.a].push(link);
    sheet.incident[link.b].push(link);
  }
  return sheet;
}

function faceColor(opacity, light) {
  const alpha = opacity + light - opacity * light;
  const mix = (paper, ink) => Math.round((paper * opacity * (1 - light) + ink * light) / alpha);
  return `rgba(${mix(22, 241)},${mix(22, 237)},${mix(22, 229)},${alpha})`;
}

export function mountHard(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { fabric: 0, detail: 2, projector: .4, glow: 1, wind: 2 };
  const view = { angle: 0, cos: 1, sin: 0 };
  const drag = { id: null, x: 0 };
  let sheets = [];
  let serial = 0;
  let W = 1;
  let H = 1;
  let S = 1;
  let ox = 0;
  let oy = 0;
  let dpr = 1;
  let debt = 0;
  let last = performance.now();
  let frameId = 0;

  function spawn() {
    const material = FABRICS[params.fabric ? params.fabric - 1 : (serial + 1) % FABRICS.length];
    sheets.push(createSheet(material, Math.round(material.n * DENSITIES[params.detail][1]), ++serial));
    if (sheets.length > 3) sheets.shift();
  }

  function reset() {
    sheets = [];
    serial = 0;
    debt = 0;
    last = performance.now();
    spawn();
  }

  function turn(angle) {
    view.angle = clamp(angle, -MAX_ANGLE, MAX_ANGLE);
    view.cos = Math.cos(view.angle * Math.PI / 180);
    view.sin = Math.sin(view.angle * Math.PI / 180);
  }

  function project(p) {
    const x = p.x * view.cos + p.z * view.sin;
    const depth = p.z * view.cos - p.x * view.sin;
    const scale = 1.6 / Math.max(.55, 2 - depth);
    return { x: (.5 + x * scale) * S, y: (.5 + p.y * scale) * S, depth };
  }

  function stepSheet(sheet) {
    const m = sheet.material;
    sheet.frames++;
    sheet.age += STEP;
    sheet.travel += STEP * params.wind;
    for (const p of sheet.nodes) {
      const vx = (p.x - p.px) * m.drag;
      const vy = (p.y - p.py) * m.drag;
      const vz = (p.z - p.pz) * .98;
      p.px = p.x; p.py = p.y; p.pz = p.z; p.hit = false;
      p.x += vx + .000018 * Math.sin(sheet.age * 2 + p.y * 9 + sheet.id);
      p.y += vy + .000008 * Math.cos(p.x * 10 + sheet.age);
      p.z += vz + .00012 * params.wind * m.flow;
    }
    for (let pass = 0; pass < 4; pass++) {
      for (const e of sheet.links) {
        if (!e.active) continue;
        if (e.bend && e.supports.some(link => !link.active)) { e.active = false; continue; }
        const a = sheet.nodes[e.a], b = sheet.nodes[e.b];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const length = Math.hypot(dx, dy, dz);
        const strain = length / (e.length || 1);
        if (strain > tearLimit(e, m) && !e.bend && sheet.age > 1 && !(a.hem && b.hem)) {
          e.active = false;
          sheet.broken++;
          rupture(sheet, e);
          if (m.elastic) {
            const recoil = .003 / (length || 1);
            a.px += dx * recoil; a.py += dy * recoil; a.pz += dz * recoil;
            b.px -= dx * recoil; b.py -= dy * recoil; b.pz -= dz * recoil;
          }
          continue;
        }
        if (e.bend && Math.abs(strain - 1) > .07) e.length = lerp(e.length, length, .028);
        const correction = (length - e.length) / (length || 1) * .5 * stiffness(e, m, strain);
        a.x += dx * correction; a.y += dy * correction; a.z += dz * correction;
        b.x -= dx * correction; b.y -= dy * correction; b.z -= dz * correction;
      }
      for (const p of sheet.nodes) collide(p);
      pinCorners(sheet);
    }
    if (sheet.broken && sheet.frames % 6 === 0) markDetached(sheet);
  }

  function light(nodes, material) {
    const [a, b, c] = nodes;
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    const sign = nz < 0 ? -1 : 1;
    nx *= sign / length; ny *= sign / length; nz *= sign / length;
    const x = (a.x + b.x + c.x) / 3, y = (a.y + b.y + c.y) / 3, z = (a.z + b.z + c.z) / 3;
    const silk = material.name === 'шёлк' || material.elastic || material.reinforced;
    const reflection = (lx, ly, lz, power) => {
      const ll = Math.hypot(lx, ly, lz) || 1;
      lx /= ll; ly /= ll; lz /= ll;
      const diffuse = Math.abs(nx * lx + ny * ly + nz * lz);
      const hl = Math.hypot(lx, ly, lz + 1) || 1;
      const half = Math.max(0, (nx * lx + ny * ly + nz * (lz + 1)) / hl);
      const specular = Math.pow(half, silk ? 24 : 5) * (silk ? 1.15 : .16);
      return power * (diffuse * (silk ? .34 : .62) + specular);
    };

    const projector = reflection(-.7 - x, -.8 - y, .65 - z, params.projector);
    let distance = Infinity, gx = 0, gy = 0;
    for (const [p, q] of GLYPH_EDGES) {
      const dx = q.x - p.x, dy = q.y - p.y;
      const t = clamp(((x - p.x) * dx + (y - p.y) * dy) / (dx * dx + dy * dy), 0, 1);
      const px = p.x + dx * t, py = p.y + dy * t;
      const d = Math.hypot(x - px, y - py, z);
      if (d < distance) { distance = d; gx = px; gy = py; }
    }
    const glowPower = params.glow * 2.6 / (1 + distance * distance * 38);
    const glow = reflection(gx - x, gy - y, .05 - z, glowPower);
    const contrastedGlow = Math.max(0, (glow - .16) * 1.65);
    return clamp(.018 + projector + contrastedGlow, .018, 1);
  }

  function trace(points, closed) {
    const [a, b, c] = points;
    const flip = closed && (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0;
    const count = points.length;
    for (let i = 0; i < count; i++) {
      const p = points[flip ? count - 1 - i : i];
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    }
    if (closed) ctx.closePath();
  }

  // Полотна красятся пачками: слои по глубине, в слое — по цвету.
  // Знак один, поэтому всё, что за ним по z, идёт до него, остальное — после.
  function paintBand(groups) {
    for (const [key, list] of groups) {
      if (key >= THREAD) continue;
      const opacity = key % 64 / LEVELS;
      ctx.fillStyle = faceColor(opacity, Math.floor(key / 64) / SHADES * opacity);
      ctx.beginPath();
      for (const points of list) trace(points, true);
      ctx.fill();
    }
    for (const [key, list] of groups) {
      if (key < THREAD) continue;
      const code = key - THREAD;
      ctx.strokeStyle = ink((code >> 1) / LEVELS);
      ctx.lineWidth = S * (code & 1 ? .0018 : .0008);
      ctx.beginPath();
      for (const points of list) trace(points, false);
      ctx.stroke();
    }
  }

  function paintGlyph() {
    ctx.beginPath();
    for (const piece of GLYPH_PIECES) trace(piece.map(project), true);
    ctx.fillStyle = INK;
    ctx.save();
    // Раньше тень давал каждый из ~30 кусков знака, и ореол набирался наложением.
    // Одна заливка светит слабее, поэтому свечение кладётся в два прохода.
    if (params.glow > 0) {
      ctx.shadowColor = ink(Math.min(params.glow * .8, 1));
      ctx.shadowBlur = S * .025;
      ctx.fill();
    }
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = .7;
    ctx.stroke();
  }

  function draw() {
    const items = [];
    let near = -Infinity, far = Infinity;
    const add = (points, nodes, key) => {
      const depth = points.reduce((sum, p) => sum + p.depth, 0) / points.length;
      const z = nodes.reduce((sum, p) => sum + p.z, 0) / nodes.length;
      items.push({ points, depth, z, key });
      near = Math.max(near, depth);
      far = Math.min(far, depth);
    };
    for (const sheet of sheets) {
      const m = sheet.material;
      const enter = clamp(sheet.age / 1.5, 0, 1);
      const visibility = enter * enter * (3 - 2 * enter);
      const opacity = Math.round(m.opacity * visibility * LEVELS);
      const projected = sheet.nodes.map(project);
      for (const face of sheet.faces) {
        const points = face.ids.map(i => projected[i]);
        if (points.some(p => p.depth > DEPTH_LIMIT)) continue;
        const nodes = face.ids.map(i => sheet.nodes[i]);
        face.shade = light(nodes, m);
        if (!opacity || face.edges.some(e => !e.active)) continue;
        add(points, nodes, Math.round(face.shade * SHADES) * 64 + opacity);
      }
      if (m.elastic || m.paper) continue;
      const weight = m.name === 'марля' ? .7 : .16;
      for (const e of sheet.links) {
        if (!e.active || !e.visible) continue;
        const points = [projected[e.a], projected[e.b]];
        if (points.some(p => p.depth > DEPTH_LIMIT)) continue;
        const shade = e.faces.reduce((sum, f) => sum + f.shade, 0) / e.faces.length;
        const alpha = Math.round(clamp(visibility * (e.fiber ? .9 : weight) * shade, 0, 1) * LEVELS);
        if (alpha) add(points, [sheet.nodes[e.a], sheet.nodes[e.b]], THREAD + alpha * 2 + (e.fiber ? 1 : 0));
      }
    }
    const span = near - far || 1;
    const behind = Array.from({ length: BANDS }, () => new Map());
    const ahead = Array.from({ length: BANDS }, () => new Map());
    for (const item of items) {
      const band = Math.min(BANDS - 1, Math.floor((item.depth - far) / span * BANDS));
      const groups = (item.z < 0 ? behind : ahead)[band];
      let list = groups.get(item.key);
      if (!list) groups.set(item.key, list = []);
      list.push(item.points);
    }
    ctx.lineJoin = 'round';
    behind.forEach(paintBand);
    paintGlyph();
    ahead.forEach(paintBand);
  }

  const status = document.createElement('div');
  status.className = 'hard-status';
  status.dataset.letterLayer = '';

  function paintStatus() {
    const active = sheets.find(sheet => sheet.nodes.some(p => p.hit)) || sheets[sheets.length - 1];
    const text = `${active.material.name} · слой ${active.id}`;
    if (status.textContent !== text) status.textContent = text;
  }

  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.hidden = true;

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

  function action(label, run) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sketch-action';
    button.textContent = label;
    button.addEventListener('click', run);
    panel.append(button);
    return button;
  }

  function pick(key, label, options) {
    const paint = () => { button.textContent = `${label} · ${options[params[key]]}`; };
    const button = action('', () => {
      params[key] = (params[key] + 1) % options.length;
      paint();
      reset();
    });
    paint();
  }

  function range(key, label, min, max, step) {
    const wrap = document.createElement('label');
    const title = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = params[key];
    const paint = () => { title.textContent = `${label} · ${params[key]}`; };
    input.addEventListener('input', () => { params[key] = Number(input.value); paint(); });
    paint();
    wrap.append(title, input);
    panel.append(wrap);
  }

  pick('fabric', 'материал', ['по очереди', ...FABRICS.map(item => item.name)]);
  pick('detail', 'сетка', DENSITIES.map(([name]) => name));
  range('projector', 'прожектор', 0, 2.5, .1);
  range('glow', 'свечение знака', 0, 2.5, .1);
  range('wind', 'поток', .5, 2, .1);
  action('следующий слой', spawn);

  function step() {
    for (const sheet of sheets) stepSheet(sheet);
    sheets = sheets.filter(sheet => !sheet.nodes.every(p => p.z * view.cos - p.x * view.sin > DEPTH_LIMIT));
    if (!sheets.length) spawn();
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

  function onDown(event) {
    if (drag.id !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    drag.id = event.pointerId;
    drag.x = event.clientX;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
  }

  function onMove(event) {
    if (event.pointerId !== drag.id) return;
    turn(view.angle + (event.clientX - drag.x) / S * MAX_ANGLE * 2);
    drag.x = event.clientX;
  }

  function onUp(event) {
    if (event.pointerId !== drag.id) return;
    drag.id = null;
    canvas.style.cursor = 'grab';
  }

  function key(event) {
    if (event.key !== 'Tab' || event.target.closest('input, textarea, select')) return;
    event.preventDefault();
    toggle.click();
  }

  function frame(now) {
    debt = Math.min(.1, debt + (now - last) / 1000);
    last = now;
    while (debt >= STEP) {
      step();
      debt -= STEP;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    ctx.translate(ox, oy);
    draw();
    paintStatus();
    frameId = requestAnimationFrame(frame);
  }

  delete workspace.dataset.ground;
  canvas.style.cursor = 'grab';
  workspace.append(status, panel, toggle);
  const observer = new ResizeObserver(resize);
  observer.observe(workspace);
  resize();
  reset();
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  document.addEventListener('keydown', key);
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    observer.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    document.removeEventListener('keydown', key);
    status.remove();
    panel.remove();
    toggle.remove();
    canvas.style.cursor = '';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
