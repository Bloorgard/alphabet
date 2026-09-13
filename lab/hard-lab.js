const hardTurn = Math.PI * 2;

function hardRotate(x, y, a) {
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
}

function hardShape(belly = 1) {
  const points = [{ x: -.19, y: -.26 }, { x: -.06, y: -.26 }, { x: -.06, y: .24 }];
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI / 2 - i / 40 * Math.PI;
    points.push({ x: -.06 + .25 * belly * Math.cos(a), y: .085 + .155 * Math.sin(a) });
  }
  points.push({ x: -.06, y: -.07 });
  return points;
}

function hardLetter(x, y, a, size, belly = 1, alpha = 1) {
  const points = hardShape(belly);
  ctx.save();
  ctx.translate(x * S, y * S);
  ctx.rotate(a);
  ctx.scale(size * S, size * S);
  ctx.beginPath();
  points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.strokeStyle = ink(alpha);
  ctx.lineWidth = .055;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'square';
  ctx.stroke();
  ctx.restore();
}

function hardCaption(title, detail) {
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = `${S * .026}px 'DM Mono', monospace`;
  ctx.fillText(title, S * .065, S * .89);
  ctx.fillStyle = MUTED;
  ctx.font = `${S * .018}px 'DM Mono', monospace`;
  ctx.fillText(detail, S * .065, S * .93);
}

function hardPeg(i) {
  return { x: .27 + i * .29, y: .27 + Math.sin(i * 1.7) * .055 };
}

function hardHookPoint(s) {
  const p = hardRotate(-.16 * .52, -.26 * .52, s.a);
  return { x: s.x + p.x, y: s.y + p.y };
}

function hardAttach(s) {
  const peg = hardPeg(s.peg);
  const p = hardRotate(-.16 * .52, -.26 * .52, s.a);
  s.x = peg.x - p.x;
  s.y = peg.y - p.y;
}

function hardRelease() {
  const s = modeState;
  if (s.peg < 0 || s.lost) return;
  const peg = hardPeg(s.peg);
  s.vx = -(s.y - peg.y) * s.w;
  s.vy = (s.x - peg.x) * s.w;
  s.last = s.peg;
  s.peg = -1;
  s.air = 0;
}

function hardSupport(a, belly, size) {
  let low = { x: 0, y: -Infinity };
  for (const p of hardShape(belly)) {
    const r = hardRotate(p.x * size, p.y * size, a);
    if (r.y > low.y) low = r;
  }
  low.y += .0275 * size;
  return low;
}

function hardRoll(s, da, belly, size) {
  const before = hardSupport(s.a, belly, size);
  s.a += da;
  const after = hardSupport(s.a, belly, size);
  s.x += (before.y + after.y) * .5 * da;
  s.y = .71 - after.y;
  s.contact = { x: s.x + after.x, y: .71 };
}

const MODES = {
  hook: {
    label: 'зацеп', cursor: 'grab',
    note: 'Зажмите сцену и двигайте палец влево-вправо, раскачивая чашу. Отпустите на движении вправо: выступ должен попасть на следующий уступ. Красный вспыхивает при удачном зацепе. Если упали — «заново».',
    tools: [
      { type: 'range', key: 'force', label: 'раскачка', min: 1, max: 5, step: .5, value: 3 },
      { type: 'button', label: 'отпустить', action: hardRelease },
      { type: 'button', label: 'заново', action: () => setMode(current) },
    ],
    setup() {
      Object.assign(modeState, { x: 0, y: 0, a: -.45, w: 0, vx: 0, vy: 0, peg: 0, last: 0, best: 0, camera: 0, flash: 0, air: 0, lost: false, hand: .5 });
      hardAttach(modeState);
    },
    onDown() { modeState.hand = pointer.x; },
    onMove() {
      const s = modeState;
      if (pointer.down && s.peg >= 0) s.w -= (pointer.x - s.hand) * num('force') * 12;
      s.hand = pointer.x;
    },
    onUp: hardRelease,
    step() {
      const s = modeState;
      if (s.lost) return;
      s.flash = Math.max(0, s.flash - STEP);
      if (s.peg >= 0) {
        s.w += -14 * Math.sin(s.a + .55) * STEP;
        s.w *= .997;
        s.w = clamp(s.w, -8, 8);
        s.a += s.w * STEP;
        hardAttach(s);
      } else {
        const before = hardHookPoint(s);
        s.air += STEP;
        s.vy += 1.1 * STEP;
        s.x += s.vx * STEP;
        s.y += s.vy * STEP;
        s.a += s.w * STEP * .25;
        const tip = hardHookPoint(s);
        for (let i = Math.max(0, s.last); i <= s.last + 2; i++) {
          if (i === s.last && s.air < .3) continue;
          const p = hardPeg(i);
          const dx = tip.x - before.x, dy = tip.y - before.y;
          const t = clamp(((p.x - before.x) * dx + (p.y - before.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
          if (Math.hypot(before.x + dx * t - p.x, before.y + dy * t - p.y) < .045) {
            s.peg = i; s.best = Math.max(s.best, i); s.flash = .45;
            s.w *= .65; hardAttach(s); break;
          }
        }
        if (s.y > 1.15 || s.x < -.3) s.lost = true;
      }
      s.camera = lerp(s.camera, Math.max(0, s.x - .42), .045);
    },
    draw() {
      const s = modeState;
      for (let i = Math.max(0, Math.floor(s.camera / .29) - 1); i < s.best + 7; i++) {
        const p = hardPeg(i), x = p.x - s.camera;
        if (x > 1.1) break;
        line(x, .12, x, p.y, FAINT, .002);
        line(x - .018, p.y, x + .045, p.y, s.peg === i && s.flash ? RED : INK, .009);
        dot(x, p.y, s.peg === i && s.flash ? RED : INK, .007);
      }
      hardLetter(s.x - s.camera, s.y, s.a, .52);
      drawStatus(`уступ · ${s.best}`);
      hardCaption(s.lost ? 'сорвался' : s.peg < 0 ? 'поймать выступом' : 'раскачать → отпустить', s.lost ? 'нажмите «заново»' : 'ведите по сцене влево и вправо');
    },
  },
  walk: {
    label: 'походка', cursor: 'pointer',
    note: 'Зажмите сцену: чаша расправляется и толкает букву вперёд. Отпустите: буква докатывается по своему контуру. Чередуйте нажатия, чтобы пройти дальше. Следы отмечают смену опоры; это стенд походки без счёта и проигрыша.',
    tools: [
      { type: 'range', key: 'pace', label: 'толчок', min: .5, max: 3, step: .1, value: 1.4 },
      { type: 'button', label: 'заново', action: () => setMode(current) },
    ],
    setup() { Object.assign(modeState, { x: .3, y: .5, a: 0, w: 0, belly: 1, camera: 0, tracks: [], tick: 0 }); hardRoll(modeState, 0, 1, .65); },
    step() {
      const s = modeState;
      s.belly = lerp(s.belly, pointer.down ? 1.4 : .85, .12);
      const support = hardSupport(s.a, s.belly, .65);
      s.w += (-support.x * 9 + (pointer.down ? num('pace') * 2.4 : 0)) * STEP;
      s.w *= .987;
      s.w = clamp(s.w, -3, 5);
      hardRoll(s, s.w * STEP, s.belly, .65);
      s.camera = lerp(s.camera, s.x - .42, .05);
      if (++s.tick % 7 === 0 && Math.abs(s.w) > .1) {
        s.tracks.push(s.contact.x);
        if (s.tracks.length > 400) s.tracks.shift();
      }
    },
    draw() {
      const s = modeState;
      line(.04, .71, .96, .71, FAINT, .002);
      for (let i = Math.floor(s.camera * 10); i < (s.camera + 1) * 10; i++) line(i / 10 - s.camera, .75, i / 10 - s.camera, .758, FAINT, .002);
      for (const x of s.tracks) if (x - s.camera > .04 && x - s.camera < .96) dot(x - s.camera, .715, ink(.3), .003);
      hardLetter(s.x - s.camera, s.y, s.a, .65, s.belly);
      dot(s.contact.x - s.camera, .71, pointer.down ? RED : INK, .007);
      drawStatus(`обороты · ${Math.floor(Math.abs(s.a) / hardTurn)}`);
      hardCaption('нажать — расправить чашу', 'отпустить — докатиться');
    },
  },
  eccentric: {
    label: 'эксцентрик', cursor: 'ew-resize',
    note: 'Ведите по сцене влево-вправо: Ъ катится по линии и рисует точкой на чаше. Меняйте ширину чаши и положение пера, накладывайте проходы. «Авто» крутит букву без руки. «Снимок» сохраняет рисунок.',
    tools: [
      { type: 'range', key: 'belly', label: 'чаша', min: .5, max: 1.8, step: .05, value: 1.2 },
      { type: 'range', key: 'pen', label: 'перо', min: 0, max: 1, step: .05, value: .75 },
      { type: 'toggle', key: 'auto', label: 'авто', value: true },
      { type: 'toggle', key: 'body', label: 'буква', value: true },
      { type: 'button', label: 'очистить', action: () => { modeState.paths = []; modeState.path = null; } },
      { type: 'button', label: 'заново', action: () => setMode(current) },
    ],
    setup() { Object.assign(modeState, { x: .15, y: .5, a: 0, direction: 1, paths: [], path: null, hand: .5 }); hardRoll(modeState, 0, num('belly'), .6); },
    onDown() { modeState.hand = pointer.x; modeState.path = null; },
    onMove() {
      if (!pointer.down) return;
      const s = modeState;
      hardEtch(clamp((pointer.x - s.hand) * 12, -1, 1));
      s.hand = pointer.x;
    },
    onTool() { modeState.path = null; hardRoll(modeState, 0, num('belly'), .6); },
    step() {
      const s = modeState;
      if (on('auto') && !pointer.down) {
        if (s.x > .82) { s.x = .15; s.path = null; }
        hardEtch(.026);
      }
    },
    draw() {
      const s = modeState;
      line(.04, .71, .96, .71, FAINT, .001);
      ctx.strokeStyle = ink(.65); ctx.lineWidth = S * .0015;
      for (const path of s.paths) {
        ctx.beginPath();
        path.forEach((p, i) => i ? ctx.lineTo(p.x * S, p.y * S) : ctx.moveTo(p.x * S, p.y * S));
        ctx.stroke();
      }
      if (on('body')) hardLetter(s.x, s.y, s.a, .6, num('belly'), .25);
      const p = hardPen(s);
      dot(p.x, p.y, INK, .006);
      hardCaption('кривая неровного колеса', 'ведите влево-вправо · меняйте чашу и перо');
    },
  },
};

function hardPen(s) {
  const a = -Math.PI / 2 + num('pen') * Math.PI;
  const p = hardRotate((-.06 + .25 * num('belly') * Math.cos(a)) * .6, (.085 + .155 * Math.sin(a)) * .6, s.a);
  return { x: s.x + p.x, y: s.y + p.y };
}

function hardEtch(da) {
  const s = modeState;
  const count = Math.max(1, Math.ceil(Math.abs(da) / .015));
  for (let i = 0; i < count; i++) {
    hardRoll(s, da / count, num('belly'), .6);
    if (s.x < .08 || s.x > .92) { s.x = clamp(s.x, .08, .92); s.path = null; }
    if (!s.path) { s.path = []; s.paths.push(s.path); }
    s.path.push(hardPen(s));
    if (s.path.length > 1800) { s.path = [s.path[s.path.length - 1]]; s.paths.push(s.path); }
    if (s.paths.length > 32) s.paths.shift();
  }
}

const hardFabrics = [
  { name: 'марля', model: 'weave', n: 26, tearX: 1.3, tearY: 1.55, stiffnessX: .74, stiffnessY: .48, shear: .035, opacity: .035, drag: .965, flow: 1.15 },
  { name: 'шёлк', model: 'membrane', n: 32, tear: 1.95, stiffness: .28, stiffen: 2.1, shear: .22, opacity: .72, drag: .989, flow: .9 },
  { name: 'мешковина', model: 'weave', n: 27, tearX: 1.2, tearY: 1.38, stiffnessX: .94, stiffnessY: .76, shear: .08, opacity: .42, drag: .95, flow: 1.05 },
  { name: 'латекс', model: 'membrane', n: 30, tear: 2.45, stiffness: .1, stiffen: 5.5, shear: .16, opacity: .9, drag: .994, flow: .72, elastic: true, rupture: .2 },
  { name: 'бумага', model: 'sheet', n: 28, tear: 1.13, stiffness: .98, shear: .92, opacity: 1, drag: .9, flow: 1.28, paper: true, rupture: .16 },
  { name: 'армированная плёнка', model: 'laminate', n: 29, tear: 1.18, stiffness: .48, stiffen: 1.2, shear: .2, opacity: .2, drag: .975, flow: 1, reinforced: true },
];

function hardClothSpawn() {
  const s = modeState;
  const choice = num('fabric');
  const kind = choice === 0 ? s.serial % hardFabrics.length : choice - 1;
  const detail = [1, 1.25, 1.4][num('detail')] || 1;
  const material = hardFabrics[kind], n = Math.round(material.n * detail);
  if (current === 'tension') for (const old of s.sheets) old.retiring = old.retiring ?? 0;
  const sheet = { material, nodes: [], links: [], faces: [], age: 0, travelTime: 0, broken: 0, pinned: current === 'tension', id: ++s.serial };
  const spacing = 1.12 / (n - 1);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - .5) * 1.12;
    const y = (j / (n - 1) - .5) * 1.12;
    const z = -1.7 + (material.paper ? .002 : .025) * Math.sin(i * .7 + j * .5 + s.serial);
    sheet.nodes.push({ x, y, z, px: x, py: y, pz: z - .004, hit: false, anchor: (i === 0 || i === n - 1) && (j === 0 || j === n - 1), ax: x, ay: y, hem: i < 2 || j < 2 || i >= n - 2 || j >= n - 2 });
  }
  const edge = (a, b, visible = true, axis = 'd') => {
    const link = { a, b, axis, damage: 0, length: Math.hypot(sheet.nodes[a].x - sheet.nodes[b].x, sheet.nodes[a].y - sheet.nodes[b].y, sheet.nodes[a].z - sheet.nodes[b].z), active: true, visible };
    sheet.links.push(link); return link;
  };
  const horizontal = [], vertical = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    if (i < n - 1) horizontal[k] = edge(k, k + 1, true, 'x');
    if (j < n - 1) vertical[k] = edge(k, k + n, true, 'y');
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const k = j * n + i, diagonal = edge(k, k + n + 1, false);
    sheet.faces.push({ ids: [k, k + 1, k + n + 1], edges: [horizontal[k], vertical[k + 1], diagonal] });
    sheet.faces.push({ ids: [k, k + n + 1, k + n], edges: [diagonal, horizontal[k + n], vertical[k]] });
  }
  if (material.reinforced) {
    for (const e of [...sheet.links]) {
      if (!e.visible) continue;
      const row = Math.floor(e.a / n), col = e.a % n;
      if ((e.b - e.a === 1 && row % 4 === 0) || (e.b - e.a === n && col % 4 === 0)) {
        const fiber = edge(e.a, e.b, true, e.axis);
        fiber.fiber = true;
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
        bend.bend = true; bend.supports = supports;
      }
    }
  }
  sheet.incident = sheet.nodes.map(() => []);
  for (const link of sheet.links) {
    sheet.incident[link.a].push(link);
    sheet.incident[link.b].push(link);
  }
  sheet.spacing = spacing;
  s.sheets.push(sheet);
  if (s.sheets.length > 3) s.sheets.shift();
  s.timer = 0;
}

const hardSolidLoops = [
  [[379.318, 334.58], [493.604, 489], [203.552, 489], [376.552, 254], [257.732, 254], [220.679, 204], [475.448, 204]],
  [[302.448, 439], [394.396, 439], [348.299, 376.716]],
].map(loop => loop.map(([x, y]) => ({ x: (x - 348.578) / 550, y: (y - 346.5) / 550 })));
const hardSolidEdges = hardSolidLoops.flatMap(loop => loop.map((a, i) => [a, loop[(i + 1) % loop.length]]));
const hardSolidFaces = [];
const hardSolidLevels = [...new Set(hardSolidLoops.flat().map(p => p.y))].sort((a, b) => a - b);
for (let i = 1; i < hardSolidLevels.length; i++) {
  const top = hardSolidLevels[i - 1], bottom = hardSolidLevels[i], middle = (top + bottom) / 2;
  const at = ([a, b], y) => a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
  const edges = hardSolidEdges.filter(([a, b]) => Math.min(a.y, b.y) < middle && Math.max(a.y, b.y) > middle).sort((a, b) => at(a, middle) - at(b, middle));
  for (let j = 0; j < edges.length; j += 2) hardSolidFaces.push([
    { x: at(edges[j], top), y: top }, { x: at(edges[j + 1], top), y: top },
    { x: at(edges[j + 1], bottom), y: bottom }, { x: at(edges[j], bottom), y: bottom },
  ]);
}

function hardClothCollision(p) {
  if (p.detached) return;
  if (p.z < -.065 || p.z > .08 || p.pz > .08) return;
  let inside = false, distance = Infinity, nx = 0, ny = 0;
  for (const [a, b] of hardSolidEdges) {
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

function hardPinCorners(sheet) {
  const travel = sheet.travelTime * .35;
  for (const p of sheet.nodes) {
    if (!p.anchor) continue;
    p.x = p.px = p.ax;
    p.y = p.py = p.ay;
    p.z = p.pz = -1.7 + travel;
  }
}

function hardClothConnectivity(sheet) {
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

function hardClothStiffness(link, material, strain) {
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

function hardClothTear(link, material) {
  if (link.fiber) return 2.5;
  const base = material.model === 'weave'
    ? (link.axis === 'x' ? material.tearX : link.axis === 'y' ? material.tearY : Math.min(material.tearX, material.tearY) * .94)
    : material.tear;
  return Math.max(1.04, base - link.damage);
}

function hardClothRupture(sheet, link) {
  const amount = sheet.material.rupture || 0;
  if (!amount) return;
  for (const neighbor of [...sheet.incident[link.a], ...sheet.incident[link.b]]) {
    if (!neighbor.active || neighbor.bend || neighbor.fiber) continue;
    neighbor.damage = Math.min(.5, neighbor.damage + amount);
  }
}

function hardClothStep(sheet) {
  const s = modeState, m = sheet.material;
  sheet.frames = (sheet.frames || 0) + 1;
  sheet.age += STEP;
  sheet.travelTime += STEP * num('wind');
  for (const p of sheet.nodes) {
    const vx = (p.x - p.px) * m.drag;
    const vy = (p.y - p.py) * m.drag;
    const vz = (p.z - p.pz) * .98;
    p.px = p.x; p.py = p.y; p.pz = p.z; p.hit = false;
    p.x += vx + .000018 * Math.sin(sheet.age * 2 + p.y * 9 + sheet.id);
    p.y += vy + .000008 * Math.cos(p.x * 10 + sheet.age);
    p.z += vz + .00012 * num('wind') * m.flow;
  }
  for (let pass = 0; pass < 4; pass++) {
    for (const e of sheet.links) {
      if (!e.active) continue;
      if (e.bend && e.supports.some(link => !link.active)) { e.active = false; continue; }
      const a = sheet.nodes[e.a], b = sheet.nodes[e.b];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const length = Math.hypot(dx, dy, dz);
      const strain = length / (e.length || 1);
      if (strain > hardClothTear(e, m) && !e.bend && sheet.age > 1 && !(sheet.pinned && a.hem && b.hem)) {
        e.active = false; sheet.broken++; s.rips++;
        hardClothRupture(sheet, e);
        if (m.elastic) {
          const recoil = .003 / (length || 1);
          a.px += dx * recoil; a.py += dy * recoil; a.pz += dz * recoil;
          b.px -= dx * recoil; b.py -= dy * recoil; b.pz -= dz * recoil;
        }
        continue;
      }
      if (e.bend && Math.abs(strain - 1) > .07) e.length = lerp(e.length, length, .028);
      const correction = (length - e.length) / (length || 1) * .5 * hardClothStiffness(e, m, strain);
      a.x += dx * correction; a.y += dy * correction; a.z += dz * correction;
      b.x -= dx * correction; b.y -= dy * correction; b.z -= dz * correction;
    }
    for (const p of sheet.nodes) hardClothCollision(p);
    if (sheet.pinned) hardPinCorners(sheet);
  }
  if (sheet.pinned && sheet.broken && sheet.frames % 6 === 0) {
    hardClothConnectivity(sheet);
  }
}

function hardProject(p) {
  const angle = num('angle') * Math.PI / 180;
  const x = p.x * Math.cos(angle) + p.z * Math.sin(angle);
  const depth = p.z * Math.cos(angle) - p.x * Math.sin(angle);
  const scale = 1.6 / Math.max(.55, 2 - depth);
  return { x: .5 + x * scale, y: .5 + p.y * scale, depth };
}

function hardLight(nodes, material) {
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

  const projector = reflection(-.7 - x, -.8 - y, .65 - z, num('projector'));
  let distance = Infinity, gx = 0, gy = 0;
  for (const [p, q] of hardSolidEdges) {
    const dx = q.x - p.x, dy = q.y - p.y;
    const t = clamp(((x - p.x) * dx + (y - p.y) * dy) / (dx * dx + dy * dy), 0, 1);
    const px = p.x + dx * t, py = p.y + dy * t;
    const d = Math.hypot(x - px, y - py, z);
    if (d < distance) { distance = d; gx = px; gy = py; }
  }
  const glowPower = num('glow') * 2.6 / (1 + distance * distance * 38);
  const glow = reflection(gx - x, gy - y, .05 - z, glowPower);
  const contrastedGlow = Math.max(0, (glow - .16) * 1.65);
  return clamp(.018 + projector + contrastedGlow, .018, 1);
}

function hardClothDraw() {
  const s = modeState, pieces = [];
  for (const face of hardSolidFaces) {
    for (const z of [-.045, .045]) {
      const points = face.map(p => hardProject({ ...p, z }));
      pieces.push({ points, depth: points.reduce((v, p) => v + p.depth, 0) / points.length, solid: true });
    }
  }
  for (const [a, b] of hardSolidEdges) {
    const points = [hardProject({ ...a, z: -.045 }), hardProject({ ...b, z: -.045 }), hardProject({ ...b, z: .045 }), hardProject({ ...a, z: .045 })];
    pieces.push({ points, depth: points.reduce((v, p) => v + p.depth, 0) / 4, solid: true });
  }
  for (const sheet of s.sheets) {
    const enter = clamp(sheet.age / 1.5, 0, 1);
    const visibility = enter * enter * (3 - 2 * enter);
    const projected = sheet.nodes.map(hardProject);
    for (const face of sheet.faces) {
      if (face.edges.some(e => !e.active)) continue;
      const points = face.ids.map(i => projected[i]);
      if (points.some(p => p.depth > 1.4)) continue;
      const nodes = face.ids.map(i => sheet.nodes[i]);
      const shade = hardLight(nodes, sheet.material);
      pieces.push({ points, depth: points.reduce((v, p) => v + p.depth, 0) / 3, opacity: sheet.material.opacity * visibility, shade });
    }
    for (const e of sheet.links) {
      if (!e.active || !e.visible || sheet.material.elastic || sheet.material.paper) continue;
      const points = [projected[e.a], projected[e.b]];
      if (points.some(p => p.depth > 1.4)) continue;
      pieces.push({ points, depth: (points[0].depth + points[1].depth) / 2 + .0001, thread: true, fiber: e.fiber, opacity: visibility * (e.fiber ? .9 : sheet.material.elastic || sheet.material.paper ? 0 : sheet.material.name === 'марля' ? .7 : .16) * hardLight([sheet.nodes[e.a], sheet.nodes[e.b], { x: sheet.nodes[e.a].x + .001, y: sheet.nodes[e.a].y + .001, z: sheet.nodes[e.a].z }], sheet.material) });
    }
  }
  pieces.sort((a, b) => a.depth - b.depth);
  ctx.lineJoin = 'round';
  for (const piece of pieces) {
    ctx.beginPath();
    piece.points.forEach((p, i) => i ? ctx.lineTo(p.x * S, p.y * S) : ctx.moveTo(p.x * S, p.y * S));
    if (piece.thread) {
      ctx.strokeStyle = ink(piece.opacity); ctx.lineWidth = S * (piece.fiber ? .0018 : .0008); ctx.stroke();
    } else {
      ctx.closePath();
      if (piece.solid) {
        ctx.save();
        if (num('glow') > 0) { ctx.shadowColor = ink(clamp(num('glow') * .5, 0, .9)); ctx.shadowBlur = S * .025; }
        ctx.fillStyle = INK; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = .7; ctx.stroke();
        ctx.restore();
      }
      else {
        ctx.fillStyle = paper(piece.opacity); ctx.fill();
        ctx.fillStyle = ink(piece.shade * piece.opacity); ctx.fill();
      }
    }
  }
  const active = s.sheets.find(sheet => sheet.nodes.some(p => p.hit)) || s.sheets[s.sheets.length - 1];
  drawStatus(`${active.material.name} · слой ${active.id}`);
}

MODES.cloth = {
  label: 'ткань', cursor: 'default',
  note: 'Полотна летят из глубины на неподвижный Ъ. Прожектор освещает всю сцену, свечение знака действует локально; их мощности складываются. Марля и мешковина состоят из направленных нитей; шёлк и латекс нелинейно твердеют при растяжении; бумага запоминает сгиб и ведёт трещину дальше; у армированной плёнки после мембраны остаётся сетка. Угол 0° — строго спереди.',
  tools: [
    { type: 'range', key: 'projector', label: 'прожектор', min: 0, max: 2.5, step: .1, value: .55 },
    { type: 'range', key: 'glow', label: 'свечение знака', min: 0, max: 2.5, step: .1, value: 1.2 },
    { type: 'pick', key: 'fabric', label: 'материал', options: ['по очереди', ...hardFabrics.map(material => material.name)], value: 0 },
    { type: 'pick', key: 'detail', label: 'сетка', options: ['обычная', 'плотная', 'очень плотная'], value: 1 },
    { type: 'range', key: 'angle', label: 'угол', min: -45, max: 45, step: 1, value: 12 },
    { type: 'range', key: 'wind', label: 'поток', min: .5, max: 2, step: .1, value: 1 },
    { type: 'button', label: 'следующий слой', action: hardClothSpawn },
    { type: 'button', label: 'заново', action: () => setMode(current) },
  ],
  setup() {
    Object.assign(modeState, { sheets: [], serial: 0, timer: 0, rips: 0, lightTime: 0 });
    setGround('ink');
    hardClothSpawn();
  },
  step() {
    const s = modeState;
    s.timer += STEP;
    s.lightTime += STEP;
    if (current !== 'tension' && s.timer > 5.5 / num('wind')) hardClothSpawn();
    for (const sheet of s.sheets) hardClothStep(sheet);
    s.sheets = s.sheets.filter(sheet => !sheet.nodes.every(p => hardProject(p).depth > 1.4));
    if (current === 'tension' && !s.sheets.length) hardClothSpawn();
  },
  draw: hardClothDraw,
};

MODES.tension = {
  ...MODES.cloth,
  label: 'натяжение',
  note: 'Полотно закреплено четырьмя углами на раме. Рама непрерывно движется из глубины к зрителю; поток вытягивает середину через неподвижный контур. В конце полотно целиком проходит за камеру без затухания.',
  tools: MODES.cloth.tools.map(tool => tool.key === 'angle' ? { ...tool, value: 0 } : tool),
};

canvas.addEventListener('pointercancel', () => { pointer.down = false; });
startLab({ title: 'Ъ · твёрдость', modes: MODES, start: 'cloth', ground: 'paper' });
