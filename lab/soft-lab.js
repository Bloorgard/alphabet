function softShape() {
  const s = modeState;
  const q = s.air;
  const top = .23 - Math.max(0, q) * .19 - Math.min(0, q) * .27;
  const right = .73 - q * .19;
  const shoulder = .49 + q * .075;
  const bottom = .79 - q * .025;
  const width = .115 + q * .018;
  const left = .32;
  const stem = left + width;
  const path = new Path2D();
  path.moveTo(left, bottom - .06);
  path.bezierCurveTo(left - .014, .59, left + .006, top + .12, left, top + .04);
  path.bezierCurveTo(left - .003, top - .025, stem - .005, top - .028, stem, top + .035);
  path.bezierCurveTo(stem + .006, top + .13, stem - .006, shoulder, stem, shoulder);
  path.bezierCurveTo(right - .06, shoulder - .025, right + .018, shoulder + .065, right, (shoulder + bottom) / 2);
  path.bezierCurveTo(right + .015, bottom + .025, stem + .04, bottom + .016, left + .045, bottom);
  path.bezierCurveTo(left + .01, bottom, left, bottom - .012, left, bottom - .06);
  path.closePath();
  const hole = new Path2D();
  const cy = (shoulder + bottom) / 2;
  hole.moveTo(stem + .015, cy - .045);
  hole.bezierCurveTo(right - .075, cy - .065, right - .07, cy + .06, stem + .015, cy + .052);
  hole.bezierCurveTo(stem + .005, cy + .025, stem + .005, cy - .015, stem + .015, cy - .045);
  hole.closePath();
  return { path, hole, top, right, shoulder, bottom };
}

function softRelease() {
  modeState.grab = null;
  canvas.style.cursor = 'grab';
}

window.addEventListener('blur', () => {
  if (current === 'fur' || current === 'fur3') { modeState.brush = null; return; }
  if (current === 'night') { nightRelease(); return; }
  if (!['crumb', 'elastic', 'volume', 'pollen', 'belly'].includes(current)) return;
  modeState.pump = 0;
  if (modeState.twist) modeState.twist.held = null;
  for (const button of labToolsBar.querySelectorAll('button[aria-pressed]')) button.setAttribute('aria-pressed', 'false');
});

function crumbPath() {
  const path = new Path2D();
  for (const ring of modeState.rings) {
    const last = modeState.nodes[ring[ring.length - 1]];
    const first = modeState.nodes[ring[0]];
    path.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
    for (let i = 0; i < ring.length; i++) {
      const a = modeState.nodes[ring[i]];
      const b = modeState.nodes[ring[(i + 1) % ring.length]];
      path.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    path.closePath();
  }
  return path;
}

function crumbSetup() {
  const s = modeState;
  Object.assign(s, { air: 0, inflation: 0, pump: 0, nodes: [], edges: [], triangles: [], rings: [], grab: null });
  const shape = softShape();
  const grid = new Map();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let row = 0; row < 42; row++) {
    for (let col = 0; col < 34; col++) {
      const x = .23 + col * .017;
      const y = .15 + row * .017;
      if (!ctx.isPointInPath(shape.path, x, y) || ctx.isPointInPath(shape.hole, x, y)) continue;
      grid.set(`${col},${row}`, s.nodes.length);
      s.nodes.push({ x, y, bx: x, by: y, px: x, py: y });
    }
  }
  ctx.restore();
  const edges = new Map();
  const addTriangle = (ids) => {
    if (ids.some(id => id === undefined)) return;
    s.triangles.push(ids);
    for (let i = 0; i < 3; i++) {
      const a = ids[i], b = ids[(i + 1) % 3];
      const key = `${Math.min(a, b)},${Math.max(a, b)}`;
      if (edges.has(key)) edges.get(key).count++;
      else {
        const p = s.nodes[a], q = s.nodes[b];
        const length = Math.hypot(p.x - q.x, p.y - q.y);
        edges.set(key, { a, b, length, rest: length, count: 1 });
      }
    }
  };
  for (let row = 0; row < 41; row++) {
    for (let col = 0; col < 33; col++) {
      const a = grid.get(`${col},${row}`), b = grid.get(`${col + 1},${row}`);
      const c = grid.get(`${col},${row + 1}`), d = grid.get(`${col + 1},${row + 1}`);
      addTriangle([a, b, d]);
      addTriangle([a, d, c]);
    }
  }
  s.edges = [...edges.values()];
  const boundary = new Map(s.edges.filter(e => e.count === 1).map(e => [e.a, e.b]));
  while (boundary.size) {
    let id = boundary.keys().next().value;
    const ring = [];
    while (boundary.has(id)) {
      ring.push(id);
      const next = boundary.get(id);
      boundary.delete(id);
      id = next;
    }
    s.rings.push(ring);
  }
  for (let pass = 0; pass < 5; pass++) {
    for (const ring of s.rings) {
      const points = ring.map(id => ({ ...s.nodes[id] }));
      ring.forEach((id, i) => {
        const a = points[(i + ring.length - 1) % ring.length];
        const b = points[i], c = points[(i + 1) % ring.length];
        s.nodes[id].x = b.x * .5 + (a.x + c.x) * .25;
        s.nodes[id].y = b.y * .5 + (a.y + c.y) * .25;
      });
    }
  }
  for (const p of s.nodes) Object.assign(p, { bx: p.x, by: p.y, px: p.x, py: p.y });
  for (const e of s.edges) {
    const a = s.nodes[e.a], b = s.nodes[e.b];
    e.rest = e.length = Math.hypot(a.x - b.x, a.y - b.y);
  }
  const neighbors = s.nodes.map(() => []);
  for (const e of s.edges) {
    neighbors[e.a].push(e.b);
    neighbors[e.b].push(e.a);
  }
  for (const p of s.nodes) Object.assign(p, { nx: 0, ny: 0, boundary: false, tx: p.bx, ty: p.by });
  for (const ring of s.rings) {
    const signedArea = ring.reduce((sum, id, i) => {
      const a = s.nodes[id], b = s.nodes[ring[(i + 1) % ring.length]];
      return sum + a.x * b.y - b.x * a.y;
    }, 0);
    ring.forEach((id, i) => {
      const a = s.nodes[ring[(i + ring.length - 1) % ring.length]];
      const b = s.nodes[ring[(i + 1) % ring.length]];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const width = signedArea > 0 ? .045 : .014;
      Object.assign(s.nodes[id], { nx: (b.y - a.y) / length * width, ny: (a.x - b.x) / length * width, boundary: true });
    });
  }
  for (let pass = 0; pass < 80; pass++) {
    s.nodes.forEach((p, i) => {
      if (p.boundary || !neighbors[i].length) return;
      p.nx = neighbors[i].reduce((sum, id) => sum + s.nodes[id].nx, 0) / neighbors[i].length;
      p.ny = neighbors[i].reduce((sum, id) => sum + s.nodes[id].ny, 0) / neighbors[i].length;
    });
  }
  for (const [label, direction] of [['надуть', 1], ['сдуть', -1]]) {
    const button = [...labToolsBar.querySelectorAll('button')].find(b => b.textContent === label);
    button.style.touchAction = 'none';
    const stop = () => { s.pump = 0; button.setAttribute('aria-pressed', 'false'); };
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      s.pump = direction;
      button.setPointerCapture(event.pointerId);
      button.setAttribute('aria-pressed', 'true');
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) button.addEventListener(event, stop);
  }
  canvas.onpointercancel = softRelease;
  canvas.onlostpointercapture = softRelease;
}

const MODES = {
  crumb: {
    label: 'мякиш',
    note: 'Хватайте за край или за середину, вдавливайте, вытягивайте и складывайте. Мякиш помнит прикосновение. Удерживайте «надуть» или «сдуть»: воздух остаётся внутри после отпускания, а наполненная буква становится пухлее и упруже. С клавиатуры кнопки добавляют или выпускают порцию воздуха по Enter.',
    cursor: 'grab',
    tools: [
      { type: 'range', key: 'palm', label: 'захват', min: 3, max: 12, step: 1, value: 9 },
      { type: 'range', key: 'memory', label: 'память', min: 1, max: 10, step: 1, value: 7 },
      { type: 'button', label: 'надуть', action(event) { if (event.detail === 0) modeState.inflation = Math.min(1, modeState.inflation + .12); } },
      { type: 'button', label: 'сдуть', action(event) { if (event.detail === 0) modeState.inflation = Math.max(0, modeState.inflation - .12); } },
      { type: 'button', label: 'расправить', action() { setMode(current); } },
    ],
    setup: crumbSetup,
    onDown() {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const hit = ctx.isPointInPath(crumbPath(), pointer.x, pointer.y, 'evenodd');
      ctx.restore();
      if (!hit) return;
      const radius = num('palm') / 100;
      const weights = modeState.nodes.map(p => {
        const d = Math.hypot(p.x - pointer.x, p.y - pointer.y) / radius;
        return Math.exp(-d * d * 2);
      });
      modeState.grab = {
        x: pointer.x, y: pointer.y, weights,
        points: modeState.nodes.map(p => ({ x: p.x, y: p.y })),
      };
      canvas.style.cursor = 'grabbing';
    },
    onUp: softRelease,
    step() {
      const s = modeState;
      s.inflation = clamp(s.inflation + s.pump * STEP * .28, 0, 1);
      const pressure = s.inflation;
      const memory = (2 + num('memory') * 1.8) / (1 + pressure * 5);
      for (const p of s.nodes) {
        const x = p.x, y = p.y;
        p.tx = p.bx + pressure * ((p.bx - .5) * .22 + p.nx);
        p.ty = p.by + pressure * ((p.by - .52) * .12 + p.ny);
        p.x += (p.x - p.px) * .62 + (p.tx - p.x) * STEP / memory;
        p.y += (p.y - p.py) * .62 + (p.ty - p.y) * STEP / memory;
        p.px = x;
        p.py = y;
      }
      for (const e of s.edges) {
        const a = s.nodes[e.a], b = s.nodes[e.b];
        e.target = Math.hypot(a.tx - b.tx, a.ty - b.ty);
        e.rest += (e.target - e.rest) * Math.min(1, STEP * (1 / memory + pressure * 5 + Math.abs(s.pump) * 8));
      }
      for (let iteration = 0; iteration < 7; iteration++) {
        for (const e of s.edges) {
          const a = s.nodes[e.a], b = s.nodes[e.b];
          const dx = b.x - a.x, dy = b.y - a.y;
          const distance = Math.hypot(dx, dy) || .0001;
          const strength = distance > e.target * 1.8 ? .45 : .17 + pressure * .12;
          const correction = (distance - e.rest) / distance * strength;
          a.x += dx * correction; a.y += dy * correction;
          b.x -= dx * correction; b.y -= dy * correction;
        }
        // Не даём треугольникам вывернуться при сильном сжатии.
        for (const ids of s.triangles) {
          const [a, b, c] = ids.map(id => s.nodes[id]);
          const area = ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
          const minArea = .017 * .017 * .12;
          if (area >= minArea) continue;
          const gradients = [[b.y - c.y, c.x - b.x], [c.y - a.y, a.x - c.x], [a.y - b.y, b.x - a.x]];
          const norm = gradients.reduce((sum, g) => sum + g[0] * g[0] + g[1] * g[1], 0);
          const correction = (minArea - area) * 1.6 / Math.max(norm, 1e-8);
          [a, b, c].forEach((p, i) => {
            p.x += gradients[i][0] * correction;
            p.y += gradients[i][1] * correction;
          });
        }
        if (s.grab) {
          const g = s.grab;
          const dx = clamp(pointer.x - g.x, -.3, .3);
          const dy = clamp(pointer.y - g.y, -.3, .3);
          s.nodes.forEach((p, i) => {
            const base = g.points[i];
            const w = g.weights[i];
            const tx = base.x + dx - (base.x - g.x) * .32;
            const ty = base.y + dy - (base.y - g.y) * .32;
            p.x += (tx - p.x) * w * .36;
            p.y += (ty - p.y) * w * .36;
          });
        }
        for (const p of s.nodes) {
          p.x = clamp(p.x, .055, .945);
          p.y = clamp(p.y, .055, .84);
        }
      }
      if (s.grab) {
        for (const e of s.edges) {
          const a = s.nodes[e.a], b = s.nodes[e.b];
          const distance = clamp(Math.hypot(a.x - b.x, a.y - b.y), e.target * .5, e.target * 1.6);
          e.rest += (distance - e.rest) * .12 * (1 - pressure * .85);
        }
      }
    },
    draw() {
      const s = modeState;
      ctx.save();
      ctx.scale(S, S);
      const path = crumbPath();
      ctx.fillStyle = INK;
      ctx.fill(path, 'evenodd');
      ctx.save();
      ctx.clip(path, 'evenodd');
      for (let i = 0; i < s.triangles.length; i += 2) {
        const [a, b, c] = s.triangles[i].map(id => s.nodes[id]);
        const u = .12 + ((i * 127) % 97) / 160;
        const v = (.12 + ((i * 73) % 89) / 150) * (1 - u);
        const x = a.x * u + b.x * v + c.x * (1 - u - v);
        const y = a.y * u + b.y * v + c.y * (1 - u - v);
        const stretch = Math.hypot(a.x - b.x, a.y - b.y) / .017;
        ctx.fillStyle = paper(.13 + (i % 5) * .022);
        ctx.beginPath();
        ctx.ellipse(x, y, (.0008 + (i % 7) * .00022) * clamp(stretch, .6, 2), .0012, Math.atan2(b.y - a.y, b.x - a.x), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      if (s.grab) {
        ctx.strokeStyle = paper(.55);
        ctx.lineWidth = .0015;
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, .012, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      ctx.fillStyle = MUTED;
      ctx.textAlign = 'center';
      ctx.font = `${Math.max(10, S * .017)}px "DM Mono", monospace`;
      ctx.fillText(`воздух · ${Math.round(s.inflation * 100)}%`, S * .5, S * .89);
      ctx.fillStyle = s.pump ? RED : MUTED;
      ctx.fillRect(S * .4, S * .915, S * .2 * s.inflation, Math.max(1, S * .002));
      ctx.fillStyle = MUTED;
      ctx.fillText('мни · тяни · надувай', S * .5, S * .96);
      ctx.restore();
    },
  },
  air: {
    label: 'недонадутая',
    note: 'Нажмите на пузо или верхушку и ведите палец внутрь буквы. Воздух перетекает в соседнюю камеру. Отпустите — форма медленно вернётся. Это эскиз ощущения: объём задаётся связью размеров двух камер.',
    cursor: 'grab',
    tools: [
      { type: 'range', key: 'softness', label: 'мягкость', min: 1, max: 10, step: 1, value: 7 },
      { type: 'range', key: 'flow', label: 'перетекание', min: 1, max: 10, step: 1, value: 5 },
      { type: 'button', label: 'заново', action() { setMode(current); } },
    ],
    setup() {
      Object.assign(modeState, { air: 0, velocity: 0, grab: null, time: 0 });
      canvas.onpointercancel = softRelease;
      canvas.onlostpointercapture = softRelease;
    },
    onDown() {
      const shape = softShape();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const hit = ctx.isPointInPath(shape.path, pointer.x, pointer.y)
        && !ctx.isPointInPath(shape.hole, pointer.x, pointer.y);
      ctx.restore();
      if (!hit) return;
      const belly = pointer.y > shape.shoulder && pointer.x > .43;
      modeState.grab = { belly, x: pointer.x, y: pointer.y, initial: modeState.air };
      canvas.style.cursor = 'grabbing';
    },
    onUp: softRelease,
    step() {
      const dt = STEP;
      const s = modeState;
      s.time += dt;
      let target = 0;
      if (s.grab) {
        const g = s.grab;
        const push = g.belly
          ? (g.x - pointer.x) * 3.8 + (g.y - pointer.y) * 1.2
          : (pointer.y - g.y) * 4;
        const sign = g.belly ? 1 : -1;
        target = clamp(g.initial + sign * (.13 + push) * (.6 + num('softness') * .07), -.85, .85);
      }
      const stiffness = s.grab ? 20 + num('flow') * 8 : 13 - num('softness');
      s.velocity += ((target - s.air) * stiffness - s.velocity * (s.grab ? 9 : 3.6)) * dt;
      s.air = clamp(s.air + s.velocity * dt, -.9, .9);
    },
    draw() {
      const s = modeState;
      const shape = softShape();
      ctx.save();
      ctx.scale(S, S);
      ctx.fillStyle = INK;
      ctx.fill(shape.path);
      ctx.fillStyle = PAPER;
      ctx.fill(shape.hole);
      if (s.grab) {
        ctx.strokeStyle = paper(.45);
        ctx.lineWidth = .0015;
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, .018, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      ctx.fillStyle = MUTED;
      ctx.font = `${Math.max(10, S * .017)}px "DM Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('сожми пузо · прижми верхушку', S * .5, S * .9);
      ctx.restore();
    },
  },
};

MODES.elastic = {
  ...MODES.crumb,
  label: 'упругий',
  note: 'Мните и тяните: мягкая оболочка пружинит и возвращает форму. Удерживайте «надуть» или «сдуть». «Пых!» резко добавляет воздух — буква раздувается с отскоком. Мягкость задаёт податливость оболочки, отскок — как долго она колеблется. Исходный «мякиш» сохранён в соседней вкладке.',
  tools: [
    { type: 'range', key: 'palm', label: 'захват', min: 3, max: 12, step: 1, value: 9 },
    { type: 'range', key: 'softness', label: 'мягкость', min: 1, max: 10, step: 1, value: 7 },
    { type: 'range', key: 'bounce', label: 'отскок', min: 1, max: 10, step: 1, value: 7 },
    { type: 'button', label: 'надуть', action(event) { if (event.detail === 0) modeState.airTarget = Math.min(1.15, modeState.airTarget + .12); } },
    { type: 'button', label: 'сдуть', action(event) { if (event.detail === 0) modeState.airTarget = Math.max(0, modeState.airTarget - .12); } },
    { type: 'button', label: 'пых!', action() {
      modeState.airTarget = Math.min(1.15, modeState.airTarget + .65);
      modeState.airSpeed = Math.min(6, modeState.airSpeed + 4);
      modeState.flash = .45;
    } },
    { type: 'button', label: 'расправить', action() { setMode(current); } },
  ],
  setup() {
    crumbSetup();
    Object.assign(modeState, { airTarget: 0, airSpeed: 0, flash: 0 });
  },
  step() {
    const s = modeState;
    s.airTarget = clamp(s.airTarget + s.pump * STEP * .4, 0, 1.15);
    s.airSpeed += ((s.airTarget - s.inflation) * 95 - s.airSpeed * 7) * STEP;
    s.inflation += s.airSpeed * STEP;
    if (s.inflation < 0 || s.inflation > 1.4) {
      s.inflation = clamp(s.inflation, 0, 1.4);
      s.airSpeed = 0;
    }
    s.flash = Math.max(0, s.flash - STEP);
    const pressure = s.inflation;
    const recovery = .004 + pressure * .005;
    const damping = .78 + num('bounce') * .016;
    for (const p of s.nodes) {
      const x = p.x, y = p.y;
      p.tx = p.bx + pressure * ((p.bx - .5) * .22 + p.nx);
      p.ty = p.by + pressure * ((p.by - .52) * .12 + p.ny);
      p.x += (p.x - p.px) * damping + (p.tx - p.x) * recovery;
      p.y += (p.y - p.py) * damping + (p.ty - p.y) * recovery;
      p.px = x;
      p.py = y;
    }
    for (const e of s.edges) {
      const a = s.nodes[e.a], b = s.nodes[e.b];
      e.target = Math.hypot(a.tx - b.tx, a.ty - b.ty);
      e.rest = e.target;
    }
    for (let iteration = 0; iteration < 7; iteration++) {
      for (const e of s.edges) {
        const a = s.nodes[e.a], b = s.nodes[e.b];
        const dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || .0001;
        const strength = distance > e.target * 1.8 ? .45 : .21 - num('softness') * .014 + pressure * .025;
        const correction = (distance - e.rest) / distance * strength;
        a.x += dx * correction; a.y += dy * correction;
        b.x -= dx * correction; b.y -= dy * correction;
      }
      // Не даём треугольникам вывернуться при сильном сжатии.
      for (const ids of s.triangles) {
        const [a, b, c] = ids.map(id => s.nodes[id]);
        const area = ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
        const minArea = .017 * .017 * .12;
        if (area >= minArea) continue;
        const gradients = [[b.y - c.y, c.x - b.x], [c.y - a.y, a.x - c.x], [a.y - b.y, b.x - a.x]];
        const norm = gradients.reduce((sum, g) => sum + g[0] * g[0] + g[1] * g[1], 0);
        const correction = (minArea - area) * 1.6 / Math.max(norm, 1e-8);
        [a, b, c].forEach((p, i) => {
          p.x += gradients[i][0] * correction;
          p.y += gradients[i][1] * correction;
        });
      }
      if (s.grab) {
        const g = s.grab;
        const dx = clamp(pointer.x - g.x, -.3, .3);
        const dy = clamp(pointer.y - g.y, -.3, .3);
        s.nodes.forEach((p, i) => {
          const base = g.points[i];
          const w = g.weights[i];
          const tx = base.x + dx - (base.x - g.x) * .32;
          const ty = base.y + dy - (base.y - g.y) * .32;
          p.x += (tx - p.x) * w * .36;
          p.y += (ty - p.y) * w * .36;
        });
      }
      for (const p of s.nodes) {
        p.x = clamp(p.x, .055, .945);
        p.y = clamp(p.y, .055, .84);
      }
    }
  },
  draw() {
    MODES.crumb.draw();
    if (modeState.flash > 0) {
      ctx.save();
      ctx.fillStyle = RED;
      ctx.font = `${Math.max(11, S * .025)}px "DM Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, modeState.flash * 4);
      ctx.fillText('пых!', S * .5, S * .09);
      ctx.restore();
    }
  },
};

function drawVolume() {
  const s = modeState;
  const path = crumbPath();
  const depth = num('depth') / 10;
  const pulse = clamp(Math.abs(s.airSpeed) / 5, 0, 1);
  const resolution = Math.min(220, Math.max(170, Math.round(S * .48)));
  if (!s.volumeCanvas || s.volumeCanvas.width !== resolution) {
    s.volumeCanvas = document.createElement('canvas');
    s.volumeCanvas.width = s.volumeCanvas.height = resolution;
    s.volumeContext = s.volumeCanvas.getContext('2d', { willReadFrequently: true });
    s.volumeDistance = new Float32Array(resolution * resolution);
    s.volumeSmooth = new Float32Array(resolution * resolution);
    s.volumeScratch = new Float32Array(resolution * resolution);
    s.volumePixels = s.volumeContext.createImageData(resolution, resolution);
  }
  const vctx = s.volumeContext;
  vctx.setTransform(resolution, 0, 0, resolution, 0, 0);
  vctx.clearRect(0, 0, 1, 1);
  vctx.fillStyle = INK;
  vctx.fill(path, 'evenodd');
  vctx.setTransform(1, 0, 0, 1, 0, 0);

  const mask = vctx.getImageData(0, 0, resolution, resolution).data;
  const distance = s.volumeDistance;
  const far = resolution * 2;
  for (let i = 0; i < distance.length; i++) distance[i] = mask[i * 4 + 3] > 127 ? far : 0;
  const diagonal = Math.SQRT2;
  for (let y = 1; y < resolution; y++) {
    for (let x = 1; x < resolution - 1; x++) {
      const i = y * resolution + x;
      if (!distance[i]) continue;
      distance[i] = Math.min(distance[i], distance[i - 1] + 1, distance[i - resolution] + 1,
        distance[i - resolution - 1] + diagonal, distance[i - resolution + 1] + diagonal);
    }
  }
  for (let y = resolution - 2; y >= 0; y--) {
    for (let x = resolution - 2; x > 0; x--) {
      const i = y * resolution + x;
      if (!distance[i]) continue;
      distance[i] = Math.min(distance[i], distance[i + 1] + 1, distance[i + resolution] + 1,
        distance[i + resolution - 1] + diagonal, distance[i + resolution + 1] + diagonal);
    }
  }

  let smooth = s.volumeSmooth;
  let scratch = s.volumeScratch;
  smooth.set(distance);
  for (let pass = 0; pass < 10; pass++) {
    for (let y = 1; y < resolution - 1; y++) {
      for (let x = 1; x < resolution - 1; x++) {
        const i = y * resolution + x;
        scratch[i] = (smooth[i - 1] + smooth[i] * 2 + smooth[i + 1]) * .25;
      }
    }
    for (let y = 1; y < resolution - 1; y++) {
      for (let x = 1; x < resolution - 1; x++) {
        const i = y * resolution + x;
        smooth[i] = (scratch[i - resolution] + scratch[i] * 2 + scratch[i + resolution]) * .25;
      }
    }
  }

  const pixels = s.volumePixels.data;
  const mark = labGrounds[ground].mark;
  const field = labGrounds[ground].field;
  const lightLength = Math.hypot(-.55, -.7, .72);
  const lx = -.55 / lightLength, ly = -.7 / lightLength, lz = .72 / lightLength;
  const halfLength = Math.hypot(lx, ly, lz + 1);
  const hx = lx / halfLength, hy = ly / halfLength, hz = (lz + 1) / halfLength;
  const slope = .38 + depth * .72;
  for (let y = 2; y < resolution - 2; y++) {
    for (let x = 2; x < resolution - 2; x++) {
      const i = y * resolution + x;
      const d = distance[i];
      const offset = i * 4;
      if (!d) { pixels[offset + 3] = 0; continue; }
      let nx = -(smooth[i + 2] - smooth[i - 2]) * slope * .25;
      let ny = -(smooth[i + resolution * 2] - smooth[i - resolution * 2]) * slope * .25;
      let nz = 1;
      if (s.grab) {
        const dx = x / resolution - pointer.x;
        const dy = y / resolution - pointer.y;
        const radius = Math.hypot(dx, dy);
        if (radius < .085) {
          const dent = (1 - radius / .085) * 2.8;
          nx += dx / Math.max(radius, .005) * dent;
          ny += dy / Math.max(radius, .005) * dent;
          nz -= (1 - radius / .085) * .72;
        }
      }
      const length = Math.hypot(nx, ny, nz);
      nx /= length; ny /= length; nz /= length;
      const diffuse = Math.max(0, nx * lx + ny * ly + nz * lz);
      const specular = Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), 34 - depth * 12);
      const edge = clamp(d / (4 + depth * 2), 0, 1);
      const glow = pulse * Math.max(0, 1 - Math.hypot(x / resolution - .35, y / resolution - .27) * 4);
      const tone = clamp(.025 + diffuse * (.2 + depth * .19) + specular * (.18 + depth * .28) + glow * .16, 0, .72) * edge;
      pixels[offset] = Math.round(lerp(mark[0], field[0], tone));
      pixels[offset + 1] = Math.round(lerp(mark[1], field[1], tone));
      pixels[offset + 2] = Math.round(lerp(mark[2], field[2], tone));
      pixels[offset + 3] = mask[offset + 3];
    }
  }
  vctx.putImageData(s.volumePixels, 0, 0);

  ctx.save();
  ctx.scale(S, S);
  ctx.shadowColor = ink(.32);
  ctx.shadowBlur = S * (.016 + s.inflation * .014);
  ctx.shadowOffsetX = S * (.014 + s.inflation * .005);
  ctx.shadowOffsetY = S * (.019 + s.inflation * .007);
  ctx.fillStyle = ink(.3);
  ctx.fill(path, 'evenodd');
  ctx.restore();
  ctx.drawImage(s.volumeCanvas, 0, 0, S, S);

  if (s.grab) {
    ctx.save();
    ctx.scale(S, S);
    ctx.strokeStyle = paper(.7);
    ctx.lineWidth = .0015;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, .012, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'center';
  ctx.font = `${Math.max(10, S * .017)}px "DM Mono", monospace`;
  ctx.fillText(`воздух · ${Math.round(s.inflation * 100)}%`, S * .5, S * .89);
  ctx.fillStyle = s.pump || s.flash > 0 ? RED : MUTED;
  ctx.fillRect(S * .4, S * .915, S * .2 * clamp(s.inflation, 0, 1), Math.max(1, S * .002));
  ctx.fillStyle = MUTED;
  ctx.fillText('мни · тяни · надувай', S * .5, S * .96);
  if (s.flash > 0) {
    ctx.fillStyle = RED;
    ctx.font = `${Math.max(11, S * .025)}px "DM Mono", monospace`;
    ctx.globalAlpha = Math.min(1, s.flash * 4);
    ctx.fillText('пых!', S * .5, S * .09);
  }
  ctx.restore();
}

MODES.volume = {
  ...MODES.elastic,
  label: 'объёмный',
  note: 'Упругая надувная оболочка со светом, толщиной края и падающей тенью. Блик усиливается при надувании, просвет выглядит углублённым, а под пальцем появляется локальная впадина. «Объём» меняет силу светотени, не физику.',
  tools: [
    { type: 'range', key: 'palm', label: 'захват', min: 3, max: 12, step: 1, value: 9 },
    { type: 'range', key: 'softness', label: 'мягкость', min: 1, max: 10, step: 1, value: 7 },
    { type: 'range', key: 'bounce', label: 'отскок', min: 1, max: 10, step: 1, value: 8 },
    { type: 'range', key: 'depth', label: 'объём', min: 1, max: 10, step: 1, value: 7 },
    ...MODES.elastic.tools.slice(3),
  ],
  draw: drawVolume,
};

function pollenSetup() {
  MODES.elastic.setup();
  setGround('ink');
  const s = modeState;
  Object.assign(s, { grains: [], dust: [], shed: [], shedCursor: 0, grainBatches: Array.from({ length: 12 }, () => []), time: 0, seed: 731 });
  const random = () => {
    s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
    return s.seed / 4294967296;
  };
  const boundary = s.nodes.filter(p => p.boundary);
  for (const p of s.nodes) {
    p.edgeDistance = Math.min(...boundary.map(b => Math.hypot(p.bx - b.bx, p.by - b.by)));
  }
  s.pollenTriangles = s.triangles.map(ids => {
    const nodes = ids.map(id => s.nodes[id]);
    const [a, b, c] = nodes;
    const area = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    return { nodes, area, compression: 1 };
  });
  for (const triangle of s.pollenTriangles) {
    const [a, b, c] = triangle.nodes;
    const count = Math.max(6, Math.round(triangle.area * 100000));
    for (let i = 0; i < count; i++) {
      const root = Math.sqrt(random());
      const u = 1 - root, v = root * random(), w = 1 - u - v;
      const x = a.bx * u + b.bx * v + c.bx * w;
      const y = a.by * u + b.by * v + c.by * w;
      const d = a.edgeDistance * u + b.edgeDistance * v + c.edgeDistance * w;
      const angle = random() * Math.PI * 2;
      const cloud = random() < .3;
      const spread = Math.sqrt(-2 * Math.log(Math.max(.0001, random()))) * (cloud ? .012 : .0018);
      const band = Math.exp(-Math.pow((d - .013) / .021, 2));
      const mottling = .58 + .22 * Math.sin(x * 37 + Math.sin(y * 22) * 2)
        + .2 * Math.sin(y * 54 - Math.cos(x * 31));
      const shoulder = Math.exp(-((x - .44) ** 2 + (y - .51) ** 2) / .009);
      const light = clamp((.15 + band * .57 + shoulder * .42) * mottling, .06, 1);
      s.grains.push({ triangle, u, v, w, light, cloud, screenX: x, screenY: y,
        ox: Math.cos(angle) * spread, oy: Math.sin(angle) * spread,
        dx: 0, dy: 0, vx: 0, vy: 0,
        size: .00055 + random() * .001,
        scatterX: (x - .47) * 1.5 + (random() - .5) * .32,
        scatterY: (y - .56) * 1.1 - random() * .19,
        phase: random() * Math.PI * 2,
      });
    }
  }
  for (let i = 0; i < 1800; i++) s.dust.push({ x: random(), y: random() * .87, alpha: .02 + random() * .055 });
  s.grainCanvas = document.createElement('canvas');
  s.grainCanvas.width = s.grainCanvas.height = 1;
  s.grainContext = s.grainCanvas.getContext('2d');
}

function pollenBurst() {
  MODES.elastic.tools.find(t => t.label === 'пых!').action();
  for (const p of modeState.grains) {
    const force = p.cloud ? 1.2 : .65;
    p.vx = clamp(p.vx + p.scatterX * force, -.65, .65);
    p.vy = clamp(p.vy + p.scatterY * force, -.65, .65);
  }
  pollenShed(850, 1);
}

function pollenShed(count, force) {
  const s = modeState;
  for (let i = 0; i < count; i++) {
    const p = s.grains[s.shedCursor % s.grains.length];
    s.shedCursor += 67;
    if (s.twist && p.turnWeight < .35) continue;
    const [a, b, c] = p.triangle.nodes;
    let x = a.x * p.u + b.x * p.v + c.x * p.w + p.ox;
    let y = a.y * p.u + b.y * p.v + c.y * p.w + p.oy;
    if (s.twist) ({ x, y } = bellyProject(p, x, y));
    const angle = p.phase + s.time * 1.7;
    const outwardX = (x - .46) * 1.5;
    const outwardY = (y - .59) * 1.5;
    const sideways = s.twist ? -Math.sign(s.twist.velocity) * .13 : 0;
    s.shed.push({ source: p, x, y, age: 0,
      vx: (outwardX + Math.cos(angle) * .19 + sideways) * force,
      vy: (outwardY + Math.sin(angle) * .19 - .12) * force,
      size: .0016 + p.size,
    });
  }
  if (s.shed.length > 2600) s.shed.splice(0, s.shed.length - 2600);
}

function pollenDraw() {
  const s = modeState;
  const gctx = s.grainContext;
  const resolution = Math.min(1100, Math.round(S * dpr));
  if (s.grainCanvas.width !== resolution) s.grainCanvas.width = s.grainCanvas.height = resolution;
  gctx.setTransform(resolution, 0, 0, resolution, 0, 0);
  gctx.clearRect(0, 0, 1, 1);
  gctx.fillStyle = INK;
  const haze = num('haze') / 7;
  const grainSize = Math.max(1 / resolution, .0011);
  for (const batch of s.grainBatches) batch.length = 0;
  for (const p of s.grains) {
    const [a, b, c] = p.triangle.nodes;
    const breathing = Math.sin(s.time * .65 + p.phase) * .0007;
    let x = a.x * p.u + b.x * p.v + c.x * p.w + p.ox * haze + p.dx + breathing;
    let y = a.y * p.u + b.y * p.v + c.y * p.w + p.oy * haze + p.dy;
    const distance = Math.hypot(p.dx, p.dy);
    let alpha = clamp(p.light * (p.cloud ? .4 : 1) * p.triangle.compression / (1 + distance * 4), .025, .9);
    let size = grainSize + p.size;
    let layer = 0;
    if (s.twist) {
      const projected = bellyProject(p, x, y);
      x = projected.x; y = projected.y;
      size *= projected.scale * (1 + Math.max(0, projected.z) * 1.3);
      alpha *= clamp(.85 + projected.z * 1.5, .35, 1.2);
      layer = clamp(Math.floor((projected.z + .4) / .8 * 6), 0, 5);
    }
    p.screenX = x; p.screenY = y;
    s.grainBatches[layer * 12 + Math.min(11, Math.floor(alpha * 12))].push(x, y, size);
  }
  for (const p of s.shed) {
    const alpha = .85 * Math.min(1, (3.2 - p.age) / .65);
    const layer = s.twist ? 5 : 0;
    s.grainBatches[layer * 12 + clamp(Math.floor(alpha * 12), 0, 11)].push(p.x, p.y, p.size);
  }
  for (let i = 0; i < s.grainBatches.length; i++) {
    const batch = s.grainBatches[i];
    gctx.globalAlpha = (i % 12 + .5) / 12;
    gctx.beginPath();
    for (let j = 0; j < batch.length; j += 3) gctx.rect(batch[j], batch[j + 1], batch[j + 2], batch[j + 2] * .85);
    gctx.fill();
  }
  gctx.globalAlpha = 1;
  ctx.save();
  ctx.fillStyle = INK;
  for (const p of s.dust) {
    ctx.globalAlpha = p.alpha;
    ctx.fillRect(p.x * S, p.y * S, .7, .7);
  }
  ctx.globalAlpha = .4;
  ctx.filter = `blur(${S * .012}px)`;
  ctx.drawImage(s.grainCanvas, 0, 0, S, S);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.drawImage(s.grainCanvas, 0, 0, S, S);
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'center';
  ctx.font = `${Math.max(10, S * .017)}px "DM Mono", monospace`;
  ctx.fillText(s.twist ? 'подцепи пузико · тяни в сторону' : 'потяни за край · стряхни пыльцу', S * .5, S * .93);
  ctx.restore();
}

MODES.pollen = {
  ...MODES.elastic,
  label: 'пыльца',
  note: 'Хватайте светлую массу и тяните: в складках пыльца сгущается, на растянутых участках редеет. Удерживайте «надуть» или «сдуть». «Пых!» стряхивает облачко, которое постепенно возвращается в букву. «Дымка» меняет мягкость края.',
  tools: [
    ...MODES.elastic.tools.slice(0, 3),
    { type: 'range', key: 'haze', label: 'дымка', min: 1, max: 10, step: 1, value: 7 },
    ...MODES.elastic.tools.slice(3).map(tool => tool.label === 'пых!' ? { ...tool, action: pollenBurst } : tool),
  ],
  setup: pollenSetup,
  step() {
    MODES.elastic.step();
    const s = modeState;
    s.time += STEP;
    for (const t of s.pollenTriangles) {
      const [a, b, c] = t.nodes;
      const area = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
      t.compression = clamp(Math.sqrt(t.area / Math.max(area, .00001)), .65, 1.6);
    }
    for (const p of s.grains) {
      p.vx += (-p.dx * 5 - p.vx * 3.5) * STEP;
      p.vy += (-p.dy * 5 - p.vy * 3.5) * STEP;
      p.dx += p.vx * STEP;
      p.dy += p.vy * STEP;
    }
    let alive = 0;
    for (const p of s.shed) {
      p.age += STEP;
      if (p.age >= 3.2) continue;
      if (p.age > 1.3) {
        p.vx += ((p.source.screenX - p.x) * 14 - p.vx * 5) * STEP;
        p.vy += ((p.source.screenY - p.y) * 14 - p.vy * 5) * STEP;
      } else {
        p.vx *= Math.exp(-STEP * .75);
        p.vy = p.vy * Math.exp(-STEP * .75) + STEP * .045;
      }
      p.x += p.vx * STEP;
      p.y += p.vy * STEP;
      s.shed[alive++] = p;
    }
    s.shed.length = alive;
  },
  draw: pollenDraw,
};

function bellyProject(p, x, y) {
  const s = modeState;
  const angle = s.twist.angle * p.turnWeight
    + Math.sin(s.time * 11 - p.loopPhase * 2) * s.twist.wave * p.turnWeight;
  const radius = x - .395;
  const depth = p.depth * (1 + s.inflation * .45);
  const z = Math.sin(angle) * radius + Math.cos(angle) * depth;
  const rotatedX = .395 + Math.cos(angle) * radius - Math.sin(angle) * depth;
  const scale = 1.6 / (1.6 - z);
  return { x: .46 + (rotatedX - .46) * scale * .92, y: .6 + (y - .6) * scale * .92, z, scale };
}

function bellyRelease() {
  if (modeState.twist.held && Math.abs(modeState.twist.velocity) > .7) pollenShed(420, .8);
  softRelease();
  modeState.twist.held = null;
}

MODES.belly = {
  ...MODES.pollen,
  label: 'пузико',
  note: 'Подцепите пузико за светлый край и тяните влево или вправо. При быстром повороте с него слетает пыльца и остаётся в воздухе. Отпустите — петля раскрутится обратно, а шлейф постепенно соберётся в букву. «Вывернуть» показывает поворот, «пых!» стряхивает облачко и пускает волну по петле.',
  tools: [
    ...MODES.pollen.tools.filter(tool => tool.label !== 'пых!' && tool.label !== 'расправить'),
    { type: 'button', label: 'вывернуть', action() { modeState.twist.velocity += 13; } },
    { type: 'button', label: 'пых!', action() { pollenBurst(); modeState.twist.wave = .48; } },
    { type: 'button', label: 'расправить', action() { setMode(current); } },
  ],
  setup() {
    pollenSetup();
    const s = modeState;
    s.twist = { angle: 0, velocity: 0, held: null, wave: 0, shedDebt: 0 };
    s.grainBatches = Array.from({ length: 72 }, () => []);
    for (const p of s.grains) {
      const [a, b, c] = p.triangle.nodes;
      const x = a.bx * p.u + b.bx * p.v + c.bx * p.w;
      const y = a.by * p.u + b.by * p.v + c.by * p.w;
      const t = clamp((x - .375) / .11, 0, 1);
      const lower = clamp((y - .42) / .1, 0, 1);
      p.turnWeight = t * t * (3 - 2 * t) * lower;
      p.loopPhase = Math.atan2(y - .64, x - .54);
      p.depth = Math.sin(p.phase * 13) * (.008 + (p.cloud ? .016 : .006));
      p.screenX = x; p.screenY = y;
    }
    canvas.onpointercancel = bellyRelease;
    canvas.onlostpointercapture = bellyRelease;
  },
  onDown() {
    const s = modeState;
    let nearest = .04;
    let hit = false;
    for (let i = 0; i < s.grains.length; i += 6) {
      const p = s.grains[i];
      if (p.turnWeight < .4) continue;
      const distance = Math.hypot(p.screenX - pointer.x, p.screenY - pointer.y);
      if (distance < nearest) { nearest = distance; hit = true; }
    }
    if (hit) {
      s.twist.held = { x: pointer.x, y: pointer.y, angle: s.twist.angle };
      s.grab = null;
      canvas.style.cursor = 'grabbing';
    } else {
      MODES.pollen.onDown();
    }
  },
  onUp: bellyRelease,
  step() {
    MODES.pollen.step();
    const t = modeState.twist;
    const target = t.held ? t.held.angle + (t.held.x - pointer.x) * 12 + (pointer.y - t.held.y) * 3 : 0;
    const stiffness = t.held ? 95 : 14;
    const damping = t.held ? 12 : 5.5 - num('bounce') * .34;
    t.velocity += ((clamp(target, -Math.PI * 1.7, Math.PI * 1.7) - t.angle) * stiffness - t.velocity * damping) * STEP;
    t.velocity = clamp(t.velocity, -22, 22);
    t.angle += t.velocity * STEP;
    t.shedDebt += Math.max(0, Math.abs(t.velocity) - 1.2) * STEP * 320;
    if (t.shedDebt >= 60) {
      const amount = Math.min(360, Math.floor(t.shedDebt));
      pollenShed(amount, .65 + Math.min(1, Math.abs(t.velocity) / 12));
      t.shedDebt = 0;
    }
    t.wave *= Math.exp(-STEP * 2.8);
  },
};

let nightRenderer;

function nightGraphics() {
  if (nightRenderer) return nightRenderer;
  const surface = document.createElement('canvas');
  const gl = surface.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const vertex = `attribute vec2 position;
    void main() { gl_Position = vec4(position, 0.0, 1.0); }`;
  const fragment = `precision highp float;
    uniform vec2 resolution;
    uniform float time;
    uniform vec4 hand;
    uniform vec2 drag;
    uniform vec3 ripple;
    uniform float bloom;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);
    }
    float smoothMin(float a, float b, float k) {
      float h = clamp(.5+.5*(b-a)/k,0.0,1.0);
      return mix(b,a,h)-k*h*(1.0-h);
    }
    float capsule(vec3 p, vec3 a, vec3 b, float ra, float rb) {
      vec3 ba=b-a, pa=p-a;
      float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);
      return length(pa-ba*h)-mix(ra,rb,h);
    }
    float body(vec3 p) {
      float influence=exp(-dot(p.xy-hand.xy,p.xy-hand.xy)*9.0);
      p.xy -= drag * influence * .8;
      p.z += hand.z * influence * .24;
      float ringDistance=length(p.xy-ripple.xy);
      float wave=sin(ringDistance*17.0-ripple.z*7.0)*exp(-ripple.z*1.1)*exp(-ringDistance*1.8);
      p.z += wave*.035;
      float breath=sin(time*.85)*.018 + bloom*.10;
      p.x += sin(p.y*3.0+time*.5)*.016;
      vec3 stem=p;
      stem.z *= 1.05;
      float a=capsule(stem,vec3(-.29,-.55,0),vec3(-.34,.26,.015),.13+breath,.115+breath);
      float b=capsule(stem,vec3(-.34,.26,.015),vec3(-.25,.61,.03),.115+breath,.105+breath);
      float stalk=smoothMin(a,b,.12);
      vec3 bowl=p-vec3(-.035,-.285,0);
      float angle=atan(bowl.y/.26,bowl.x/.32);
      bowl.z += sin(angle*2.0+time*.6)*.023 + sin(angle)*bloom*.05;
      vec2 ellipse=vec2(bowl.x,bowl.y*1.22);
      float radius=.305+sin(angle*3.0+.4)*.013;
      float thickness=.105+breath*.8+.025*sin(angle+.7);
      float petal=length(vec2(length(ellipse)-radius,bowl.z*1.35))-thickness;
      return smoothMin(stalk,petal,.145);
    }
    vec3 normalAt(vec3 p) {
      vec2 e=vec2(.0025,0);
      return normalize(vec3(body(p+e.xyy)-body(p-e.xyy),body(p+e.yxy)-body(p-e.yxy),body(p+e.yyx)-body(p-e.yyx)));
    }
    void main() {
      vec2 uv=gl_FragCoord.xy/resolution;
      vec2 xy=(uv-.5)*1.95;
      xy.y += .005;
      vec3 ro=vec3(xy,2.5), rd=normalize(vec3(xy*.045,-1));
      float t=1.85, closest=1.0;
      vec3 p=ro;
      bool hit=false;
      for(int i=0;i<56;i++) {
        p=ro+rd*t;
        float d=body(p);
        closest=min(closest,abs(d));
        if(d<.0015) { hit=true; break; }
        t+=max(.002,d*.8);
        if(t>3.2) break;
      }
      vec3 dark=vec3(.017,.027,.041);
      float background=noise(uv*4.0)*.009;
      vec3 color=dark+background;
      float halo=exp(-closest*48.0)*.13;
      float field=0.0;
      if(hit) {
        vec3 n=normalAt(p);
        vec3 light=normalize(vec3(-.65,.8,1.0));
        float diffuse=max(0.0,dot(n,light));
        float rim=pow(1.0-max(0.0,dot(n,-rd)),1.5);
        float vein=noise(p.xy*16.0+noise(p.xy*7.0)*3.0);
        float tissue=.68+.32*vein;
        float centerLight=exp(-dot(p.xy-vec2(-.24,-.05),p.xy-vec2(-.24,-.05))*14.0);
        float petalLight=.5+.5*sin(atan((p.y+.285)*1.22,p.x+.035)*2.0+.5);
        float pressGlow=hand.z*exp(-dot(p.xy-hand.xy,p.xy-hand.xy)*24.0);
        float passing=exp(-pow((length(p.xy-ripple.xy)-ripple.z*.45)*9.0,2.0))*exp(-ripple.z*.8);
        field=(.015+pow(diffuse,1.6)*.68+rim*.25+centerLight*.72+petalLight*.07)*tissue;
        field+=pressGlow*.4+passing*.38+bloom*.22;
        float fleck=hash(gl_FragCoord.xy);
        float fine=hash(floor(gl_FragCoord.xy*.67)+19.0);
        float dust=clamp(field*1.1+(.5-fleck)*.53,0.0,1.0);
        vec3 cold=vec3(.45,.60,.74);
        vec3 warm=vec3(.93,.94,.87);
        color=mix(dark,mix(cold,warm,smoothstep(.2,.75,field)),dust);
        color += max(0.0,field-.64)*vec3(.13,.16,.17);
        color *= .88+.12*fine;
      }
      float grain=hash(gl_FragCoord.xy+37.0);
      color += halo*vec3(.4,.58,.7)*(grain*.8+.2);
      color += (grain-.5)*.019;
      float vignette=1.0-smoothstep(.4,.76,length(uv-.5))*.35;
      gl_FragColor=vec4(max(vec3(0),color*vignette),1);
    }`;
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const program = gl.createProgram();
  const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.deleteShader(vs); gl.deleteShader(fs);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniforms = Object.fromEntries(['resolution','time','hand','drag','ripple','bloom'].map(name => [name, gl.getUniformLocation(program, name)]));
  nightRenderer = { surface, gl, uniforms };
  return nightRenderer;
}

function nightTouch() {
  const s = modeState;
  s.held = { x: pointer.x, y: pointer.y };
  s.handX = (pointer.x - .5) * 1.95;
  s.handY = (.5 - pointer.y) * 1.95;
  s.rippleX = s.handX; s.rippleY = s.handY; s.rippleAge = 0;
}

function nightRelease() {
  const s = modeState;
  if (s.held) { s.rippleX = s.handX; s.rippleY = s.handY; s.rippleAge = 0; }
  s.held = null;
}

MODES.night = {
  label: 'ночной цветок',
  note: 'Проведите пальцем по букве. Придержите, потяните и отпустите. Она прогибается, дышит и отвечает светом.',
  cursor: 'grab',
  tools: [
    { type: 'button', label: 'вдох', action() { modeState.bloomSpeed += 2.8; modeState.rippleAge = 0; modeState.rippleX = -.28; modeState.rippleY = -.1; } },
    { type: 'button', label: 'сначала', action() { setMode(current); } },
  ],
  setup() {
    setGround('ink');
    Object.assign(modeState, { renderer: nightGraphics(), time: 0, held: null, handX: 0, handY: 0,
      press: 0, pressSpeed: 0, dx: 0, dy: 0, vx: 0, vy: 0, rippleX: -.28, rippleY: -.1,
      rippleAge: 10, bloom: 0, bloomSpeed: 0 });
    canvas.onpointercancel = nightRelease;
    canvas.onlostpointercapture = nightRelease;
  },
  onDown: nightTouch,
  onUp: nightRelease,
  step() {
    const s = modeState;
    s.time += STEP; s.rippleAge += STEP;
    const targetX = s.held ? clamp((pointer.x - s.held.x) * 1.95, -.5, .5) : 0;
    const targetY = s.held ? clamp((s.held.y - pointer.y) * 1.95, -.5, .5) : 0;
    s.vx += ((targetX - s.dx) * 55 - s.vx * 7) * STEP;
    s.vy += ((targetY - s.dy) * 55 - s.vy * 7) * STEP;
    s.dx += s.vx * STEP; s.dy += s.vy * STEP;
    s.pressSpeed += (((s.held ? 1 : 0) - s.press) * 45 - s.pressSpeed * 7) * STEP;
    s.press = clamp(s.press + s.pressSpeed * STEP, -.3, 1.15);
    s.bloomSpeed += (-s.bloom * 18 - s.bloomSpeed * 2.7) * STEP;
    s.bloom = clamp(s.bloom + s.bloomSpeed * STEP, -.4, 1.4);
  },
  draw() {
    const s = modeState;
    if (s.renderer) {
      const { gl, surface, uniforms: u } = s.renderer;
      const resolution = Math.min(850, Math.round(S * Math.min(dpr, 1.5)));
      if (surface.width !== resolution || surface.height !== resolution) surface.width = surface.height = resolution;
      gl.viewport(0, 0, resolution, resolution);
      gl.uniform2f(u.resolution, resolution, resolution);
      gl.uniform1f(u.time, s.time);
      gl.uniform4f(u.hand, s.handX, s.handY, s.press, 0);
      gl.uniform2f(u.drag, s.dx, s.dy);
      gl.uniform3f(u.ripple, s.rippleX, s.rippleY, s.rippleAge);
      gl.uniform1f(u.bloom, s.bloom);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      ctx.drawImage(surface, 0, 0, S, S);
      ctx.save();
      ctx.filter = `blur(${S * .009}px)`;
      ctx.globalAlpha = .42;
      ctx.drawImage(surface, 0, 0, S, S);
      ctx.restore();
    }
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = ink(.45);
    ctx.font = `${Math.max(10, S * .015)}px "DM Mono", monospace`;
    ctx.fillText(s.renderer ? 'тише. прикоснись.' : 'для этого эскиза нужен WebGL', S * .5, S * .93);
    ctx.restore();
  },
};

function furSetup() {
  setGround('paper');
  const s = modeState;
  Object.assign(s, { hairs: [], brush: null, time: 0, seed: 429, batches: Array.from({ length: 32 }, () => []) });
  const random = () => {
    s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
    return s.seed / 4294967296;
  };
  const outline = [
    [.28,.73], [.275,.52], [.28,.28], [.30,.205], [.32,.17], [.39,.17], [.415,.21],
    [.43,.28], [.425,.38], [.423,.455], [.49,.43], [.60,.44], [.68,.485],
    [.76,.53], [.79,.61], [.76,.69], [.73,.785], [.62,.825], [.51,.81],
    [.43,.81], [.34,.805], [.30,.785],
  ];
  const hole = [];
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2;
    hole.push([.543 + Math.cos(a) * .105, .628 + Math.sin(a) * .083]);
  }
  const path = new Path2D();
  for (const ring of [outline, hole]) {
    const last = ring[ring.length - 1], first = ring[0];
    path.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], n = ring[(i + 1) % ring.length];
      path.quadraticCurveTo(p[0], p[1], (p[0] + n[0]) / 2, (p[1] + n[1]) / 2);
    }
    path.closePath();
  }
  s.path = path;
  const edge = [];
  for (const ring of [outline, hole]) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[(i + ring.length - 1) % ring.length], b = ring[i], c = ring[(i + 1) % ring.length];
      for (let j = 0; j < 5; j++) {
        const t = j / 5, u = 1 - t;
        edge.push([u*u*(a[0]+b[0])/2+2*u*t*b[0]+t*t*(b[0]+c[0])/2,
          u*u*(a[1]+b[1])/2+2*u*t*b[1]+t*t*(b[1]+c[1])/2]);
      }
    }
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 14000; i++) {
    let x, y;
    do { x = .265 + random() * .525; y = .16 + random() * .67; } while (!ctx.isPointInPath(path, x, y, 'evenodd'));
    let nearest = edge[0], distance = 1;
    for (const p of edge) {
      const d = (p[0]-x)**2+(p[1]-y)**2;
      if (d < distance) { distance = d; nearest = p; }
    }
    distance = Math.sqrt(distance);
    const edgeAngle = Math.atan2(nearest[1]-y, nearest[0]-x);
    const swirl = y < .46 ? -.9 + Math.sin(y*15)*.9 : Math.atan2(y-.63,x-.535)+1.2;
    const weight = Math.exp(-distance * 85);
    const angle = Math.atan2(Math.sin(edgeAngle)*weight+Math.sin(swirl)*(1-weight),
      Math.cos(edgeAngle)*weight+Math.cos(swirl)*(1-weight)) + (random()-.5)*.8;
    const length = .024 + random()**2 * .05;
    const lift = .25 + random()*.6;
    s.hairs.push({ x, y, angle, base: angle, tx: Math.cos(angle), ty: Math.sin(angle),
      dx: Math.cos(angle), dy: Math.sin(angle), vx: 0, vy: 0, length, lift, targetLift: lift,
      bend: (random()-.5)*.65, tone: random(), phase: random()*Math.PI*2,
      surface: .5 + .5*(-Math.cos(edgeAngle)*.6-Math.sin(edgeAngle)*.8), groomed: false });
  }
  ctx.restore();
  s.hairs.sort((a,b) => a.y-b.y);
  canvas.onpointercancel = () => { s.brush = null; };
  canvas.onlostpointercapture = () => { s.brush = null; };
}

function furStroke() {
  const s = modeState;
  if (!s.brush) return;
  const ax = s.brush.x, ay = s.brush.y;
  const dx = pointer.x-ax, dy = pointer.y-ay, length = Math.hypot(dx,dy);
  if (length < .0005) return;
  const radius = num('brush') / 100;
  const combX = dx/length, combY = dy/length;
  for (const h of s.hairs) {
    const t = clamp(((h.x-ax)*dx+(h.y-ay)*dy)/(length*length),0,1);
    const d = Math.hypot(h.x-ax-dx*t,h.y-ay-dy*t);
    if (d > radius) continue;
    const weight = (1-d/radius)**2;
    const strength = Math.min(.95, length*85) * weight;
    if (num('tool') === 0) {
      h.tx = lerp(h.tx,combX,strength);
      h.ty = lerp(h.ty,combY,strength);
      h.targetLift = lerp(h.targetLift,.06,strength);
    } else {
      const a = h.phase + Math.sin(h.x*57+h.y*41+s.time*6)*2.8;
      h.tx = lerp(h.tx,Math.cos(a),strength);
      h.ty = lerp(h.ty,Math.sin(a),strength);
      h.targetLift = lerp(h.targetLift,1,strength);
    }
    const norm = Math.hypot(h.tx,h.ty) || 1;
    h.tx /= norm; h.ty /= norm;
    h.groomed = true;
  }
  s.brush.x = pointer.x; s.brush.y = pointer.y;
}

function furRuffle() {
  for (const h of modeState.hairs) {
    const angle = h.base + Math.sin(h.phase*7 + modeState.time)*2.6;
    h.tx = Math.cos(angle); h.ty = Math.sin(angle);
    h.targetLift = .65 + .35*Math.sin(h.phase)**2;
    h.groomed = true;
  }
}

function furDraw() {
  const s = modeState;
  ctx.save();
  const sky = ctx.createLinearGradient(0,0,0,S);
  sky.addColorStop(0,'#326bc4'); sky.addColorStop(1,'#80c4e9');
  ctx.fillStyle = sky; ctx.fillRect(0,0,S,S);
  ctx.save(); ctx.scale(S,S);
  ctx.shadowColor = 'rgba(32,47,102,.3)'; ctx.shadowBlur = S*.035;
  ctx.shadowOffsetX = S*.02; ctx.shadowOffsetY = S*.028;
  ctx.fillStyle = '#a83360'; ctx.fill(s.path,'evenodd');
  ctx.restore();
  for (const batch of s.batches) batch.length = 0;
  for (const h of s.hairs) {
    const norm = Math.hypot(h.dx,h.dy) || 1;
    const dx = h.dx/norm, dy = h.dy/norm;
    const flutter = Math.sin(s.time*1.1+h.phase)*.0012*h.lift;
    const reach = h.length*(1.13-h.lift*.35);
    const tipX = h.x+dx*reach, tipY = h.y+dy*reach-h.lift*h.length*.52;
    const curl = h.bend*h.length*(.35+h.lift);
    const cx = h.x+dx*reach*.35-dy*curl+flutter;
    const cy = h.y+dy*reach*.35+dx*curl-h.lift*h.length*.4;
    const illumination = .16 + h.surface*.38 + (-dx*.4-dy*.35)*.25 + h.tone*.24 + h.lift*.12;
    const index = clamp(Math.floor(illumination*31),0,31);
    s.batches[index].push(h.x,h.y,cx,cy,tipX,tipY);
  }
  ctx.scale(S,S);
  ctx.lineCap = 'round';
  for (let i=0;i<s.batches.length;i++) {
    const batch = s.batches[i];
    const t = i/31;
    ctx.strokeStyle = `rgb(${Math.round(lerp(166,255,t))},${Math.round(lerp(38,218,t))},${Math.round(lerp(87,232,t))})`;
    ctx.lineWidth = Math.max(.00065,.6/S);
    ctx.beginPath();
    for (let j=0;j<batch.length;j+=6) {
      ctx.moveTo(batch[j],batch[j+1]);
      ctx.quadraticCurveTo(batch[j+2],batch[j+3],batch[j+4],batch[j+5]);
    }
    ctx.stroke();
  }
  if (pointer.seen) {
    ctx.strokeStyle = s.brush ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.3)';
    ctx.lineWidth = 1/S;
    ctx.beginPath(); ctx.arc(pointer.x,pointer.y,num('brush')/100,0,Math.PI*2); ctx.stroke();
    if (num('tool')===0) {
      ctx.beginPath();
      for(let i=-2;i<=2;i++) { ctx.moveTo(pointer.x+i*.009,pointer.y-.014); ctx.lineTo(pointer.x+i*.009,pointer.y+.014); }
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.save(); ctx.textAlign='center'; ctx.fillStyle='#244774';
  ctx.font=`${Math.max(10,S*.017)}px "DM Mono", monospace`;
  ctx.fillText('проведи по шёрстке',S*.5,S*.94);
  ctx.restore();
}

MODES.fur = {
  label: 'шёрстка',
  note: 'Зажмите и ведите по ворсу. Расчёска укладывает волоски по движению руки — причёска сохраняется. Выберите «лохматить», чтобы поднимать ворс локально, или взъерошьте всю букву кнопкой.',
  cursor: 'crosshair',
  tools: [
    { type: 'pick', key: 'tool', label: 'рука', options: ['причёсывать','лохматить'], value: 0 },
    { type: 'range', key: 'brush', label: 'расчёска', min: 3, max: 15, step: 1, value: 9 },
    { type: 'button', label: 'взъерошить всё', action: furRuffle },
    { type: 'button', label: 'сначала', action() { setMode(current); } },
  ],
  setup: furSetup,
  onDown() { modeState.brush = { x: pointer.x, y: pointer.y }; },
  onMove: furStroke,
  onUp() { modeState.brush = null; },
  step() {
    const s=modeState; s.time+=STEP;
    for(const h of s.hairs) {
      h.vx+=((h.tx-h.dx)*110-h.vx*13)*STEP;
      h.vy+=((h.ty-h.dy)*110-h.vy*13)*STEP;
      h.dx+=h.vx*STEP; h.dy+=h.vy*STEP;
      h.lift+=(h.targetLift-h.lift)*.16;
    }
  },
  draw: furDraw,
};

function fur3Rotate(p, inverse = false) {
  const s = modeState, a = s.yaw, b = s.pitch;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  if (inverse) {
    const y = p[1]*cb+p[2]*sb, z = -p[1]*sb+p[2]*cb;
    return [p[0]*ca-z*sa,y,p[0]*sa+z*ca];
  }
  const x = p[0]*ca+p[2]*sa, z = -p[0]*sa+p[2]*ca;
  return [x,p[1]*cb-z*sb,p[1]*sb+z*cb];
}

function fur3Project(p) {
  const q = fur3Rotate(fur3Deform(p)), k = 1.65/(1.65-q[2]);
  return [.5+q[0]*k,.455+q[1]*k,q[2],k];
}

function fur3Deform(p) {
  const s=modeState, w=Math.exp(-p.reduce((d,x,k)=>d+(x-s.pressRoot[k])**2,0)/.022);
  return p.map((x,k)=>x+s.pressOffset[k]*w);
}

function fur3Normal(p,n) {
  const s=modeState,w=Math.exp(-p.reduce((d,x,k)=>d+(x-s.pressRoot[k])**2,0)/.022);
  const g=p.map((x,k)=>-2*(x-s.pressRoot[k])*w/.022);
  const vn=s.pressOffset.reduce((d,x,k)=>d+x*n[k],0),vg=s.pressOffset.reduce((d,x,k)=>d+x*g[k],0);
  const result=n.map((x,k)=>x-g[k]*vn/(1+vg)),length=Math.hypot(...result)||1;
  return fur3Rotate(result.map(x=>x/length));
}

function fur3Down() {
  const s=modeState;s.brush={x:pointer.x,y:pointer.y};s.pressActive=false;
  s.rotating=false;
  let nearest=null,distance=.025;
  for(const h of s.hairs)if(h.visible){const d=Math.hypot(h.screen[0]-pointer.x,h.screen[1]-pointer.y);if(d<distance){nearest=h;distance=d;}}
  if(!nearest){s.rotating=true;return;}
  s.pressRoot=nearest.root.slice();s.pressStart={x:pointer.x,y:pointer.y};s.pressActive=true;
  s.pressTarget=fur3Rotate([0,0,-.045],true);
}

function fur3Setup() {
  setGround('ink');
  const s = modeState;
  Object.assign(s,{hairs:[],patches:[],brush:null,time:0,yaw:-.38,pitch:-.12,depthBuffer:new Float32Array(192*192)});
  Object.assign(s,{pressRoot:[0,0,0],pressOffset:[0,0,0],pressVelocity:[0,0,0],pressTarget:[0,0,0],pressActive:false});
  let seed = 721;
  const random = () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  function surface(part,u,v) {
    const a = v*Math.PI*2;
    if (part === 0) {
      const y = -.29+u*.56;
      const cap = Math.min(1,Math.sqrt(Math.max(0,1-((Math.max(0,Math.abs(y+.01)-.21))/.07)**2)));
      return [-.16+Math.cos(a)*.082*cap,y,Math.sin(a)*.088*cap];
    }
    const t=u*Math.PI*2;
    return [.015+Math.cos(t)*(.18+Math.cos(a)*.078),.155+Math.sin(t)*(.145+Math.cos(a)*.078),Math.sin(a)*.09];
  }
  const normalize = v => {const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
  for(let part=0;part<2;part++) {
    const rows=part===0?56:90, cols=36;
    for(let i=0;i<rows;i++)for(let j=0;j<cols;j++) {
      const corners=[surface(part,i/rows,j/cols),surface(part,(i+1)/rows,j/cols),surface(part,(i+1)/rows,(j+1)/cols),surface(part,i/rows,(j+1)/cols)];
      const p=surface(part,(i+.5)/rows,(j+.5)/cols);
      const tangent=normalize(surface(part,(i+.501)/rows,(j+.5)/cols).map((x,k)=>x-p[k]));
      const around=normalize(surface(part,(i+.5)/rows,(j+.501)/cols).map((x,k)=>x-p[k]));
      let n=normalize([tangent[1]*around[2]-tangent[2]*around[1],tangent[2]*around[0]-tangent[0]*around[2],tangent[0]*around[1]-tangent[1]*around[0]]);
      const patch={corners,p,n,hairs:[]};s.patches.push(patch);
      for(let h=0;h<8;h++) {
        const root=surface(part,(i+random())/rows,(j+random())/cols);
        const angle=(random()-.5)*.8+Math.sin(i*.12)*.6;
        const dir=tangent.map((x,k)=>x*Math.cos(angle)+around[k]*Math.sin(angle));
        const hair={root,n,dir:dir.slice(),target:dir.slice(),length:.023+random()**2*.036,lift:.35+random()*.35,targetLift:.5,tone:random(),phase:random()*6.28};
        hair.velocity=[0,0,0];hair.liftVelocity=0;
        hair.density=(h+.5)/8;patch.hairs.push(hair);s.hairs.push(hair);
      }
    }
  }
  canvas.onpointercancel=canvas.onlostpointercapture=()=>{s.brush=null;};
}

function fur3Stroke() {
  const s=modeState;if(!s.brush)return;
  const dx=pointer.x-s.brush.x,dy=pointer.y-s.brush.y,len=Math.hypot(dx,dy);
  if(s.pressActive&&!s.rotating) {
    const x=pointer.x-s.pressStart.x,y=pointer.y-s.pressStart.y,scale=Math.min(1,.075/(Math.hypot(x,y)||1));
    s.pressTarget=fur3Rotate([x*scale,y*scale,-.052],true);
  }
  if(s.rotating){s.yaw+=dx*4;s.pitch=clamp(s.pitch-dy*3,-1.2,1.2);}
  else if(len>.0002) {
    const direction=fur3Rotate([dx/len,dy/len,0],true),radius=num('brush3')/100;
    for(const h of s.hairs) {
      if(!h.visible)continue;
      const p=h.screen,t=clamp(((p[0]-s.brush.x)*dx+(p[1]-s.brush.y)*dy)/(len*len),0,1);
      const d=Math.hypot(p[0]-s.brush.x-dx*t,p[1]-s.brush.y-dy*t);
      if(d>radius)continue;
      const w=(1-d/radius)**2*Math.min(1,len*100)*lerp(.2,1,num('softHair3')/10);
      const v=num('groom3')===0?direction:[Math.sin(h.phase+s.time*3),Math.cos(h.phase*3),Math.sin(h.phase*2)];
      const dot=v.reduce((sum,x,k)=>sum+x*h.n[k],0);
      const tangent=v.map((x,k)=>x-dot*h.n[k]),norm=Math.hypot(...tangent)||1;
      h.target=h.target.map((x,k)=>lerp(x,tangent[k]/norm,w));
      h.targetLift=lerp(h.targetLift,num('groom3')===0?.12:1,w);
    }
  }
  s.brush={x:pointer.x,y:pointer.y};
}

function fur3Draw() {
  const s=modeState;
  ctx.save();ctx.fillStyle='#080808';ctx.fillRect(0,0,S,S);
  const hairScale=num('length3')/5,fluff=num('fluff3')/5,density=num('density3')/10;
  const gloss=num('gloss3')/10,rimEnabled=on('rim3');
  ctx.scale(S,S);ctx.lineCap='round';
  s.depthBuffer.fill(-10);
  for(const patch of s.patches) {patch.depth=fur3Rotate(fur3Deform(patch.p))[2];}
  s.patches.sort((a,b)=>a.depth-b.depth);
  for(const patch of s.patches) {
    const normal=fur3Normal(patch.p,patch.n);
    const light=clamp(.25+Math.max(0,-normal[0]*.45-normal[1]*.55+normal[2]*.65)*.65,0,1);
    const points=patch.corners.map(fur3Project);
    const shade=Math.round(45+light*145);ctx.fillStyle=`rgb(${shade},${shade},${shade})`;
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fill();
    for(const indices of [[0,1,2],[0,2,3]]) {
      const [a,b,c]=indices.map(i=>points[i]);
      const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
      if(Math.abs(den)<1e-10)continue;
      const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0])*192)),x1=Math.min(191,Math.ceil(Math.max(a[0],b[0],c[0])*192));
      const y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1])*192)),y1=Math.min(191,Math.ceil(Math.max(a[1],b[1],c[1])*192));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) {
        const px=(x+.5)/192,py=(y+.5)/192;
        const u=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/den;
        const v=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/den;
        if(u>=0&&v>=0&&u+v<=1){const z=u*a[2]+v*b[2]+(1-u-v)*c[2],index=y*192+x;s.depthBuffer[index]=Math.max(s.depthBuffer[index],z);}
      }
    }
  }
  for(const patch of s.patches) {
    const normal=fur3Normal(patch.p,patch.n),front=normal[2]>-.12;
    const light=clamp(.25+Math.max(0,-normal[0]*.45-normal[1]*.55+normal[2]*.65)*.65,0,1);
    for(const h of patch.hairs) {
      if(h.density>density){h.visible=false;continue;}
      const root=fur3Project(h.root);h.screen=root;
      const index=clamp(Math.floor(root[1]*192),0,191)*192+clamp(Math.floor(root[0]*192),0,191);
      h.visible=front&&root[2]>=s.depthBuffer[index]-.008;
      if(!h.visible)continue;
      const norm=Math.hypot(...h.dir)||1,dir=h.dir.map(x=>x/norm);
      const lift=Math.min(1.5,h.lift*fluff),length=h.length*hairScale;
      const tip=h.root.map((x,k)=>x+length*(dir[k]*(1-lift*.45)+h.n[k]*(.2+lift*.85)));
      const control=h.root.map((x,k)=>x+length*(dir[k]*.2+h.n[k]*(.3+lift*.55)));
      const a=fur3Project(control),b=fur3Project(tip);
      const l=clamp(light*.85+h.tone*.18,0,1);
      const tangent=fur3Rotate(dir);
      const alignment=tangent[0]*-.3+tangent[1]*-.4+tangent[2]*.866;
      const sheen=Math.pow(Math.max(0,1-alignment*alignment),12)*Math.max(0,normal[2])*(.5+h.tone*.5);
      const rim=rimEnabled?Math.pow(1-Math.max(0,normal[2]),3)*Math.max(0,-normal[0]*.65-normal[1]*.35+.35):0;
      const base=95+160*l;
      const shade=Math.round(Math.min(255,base+(255-base)*(sheen*gloss*.85+rim*.9)));ctx.strokeStyle=`rgb(${shade},${shade},${shade})`;
      ctx.lineWidth=Math.max(.00055,.48/S)*root[3];ctx.beginPath();ctx.moveTo(root[0],root[1]);ctx.quadraticCurveTo(a[0],a[1],b[0],b[1]);ctx.stroke();
    }
  }
  if(pointer.seen&&!(s.brush&&s.rotating)){ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=1/S;ctx.beginPath();ctx.arc(pointer.x,pointer.y,num('brush3')/100,0,Math.PI*2);ctx.stroke();}
  ctx.restore();ctx.save();ctx.fillStyle='#888';ctx.textAlign='center';ctx.font=`${Math.max(10,S*.017)}px "DM Mono", monospace`;
  ctx.fillText('по букве — гладить · вокруг — крутить',S*.5,S*.085);ctx.restore();
}

MODES.fur3={
  label:'шёрстка · 3D',cursor:'grab',
  note:'Ведите по букве: расчёска укладывает шерсть и одновременно проминает мягкое тело. После отпускания тело расправляется, а причёска остаётся. Для поворота начните движение в пустом пространстве вокруг буквы или в её просвете. Длина, густота и пушистость меняются без сброса причёски.',
  tools:[
    {type:'pick',key:'groom3',label:'рука',options:['причёсывать','лохматить'],value:0},
    {type:'range',key:'brush3',label:'расчёска',min:3,max:15,step:1,value:9},
    {type:'range',key:'length3',label:'длина',min:2,max:10,step:1,value:5},
    {type:'range',key:'density3',label:'густота',min:2,max:10,step:1,value:5},
    {type:'range',key:'fluff3',label:'пушистость',min:1,max:10,step:1,value:5},
    {type:'range',key:'softHair3',label:'мягкость волос',min:0,max:10,step:1,value:7},
    {type:'range',key:'press3',label:'сминание',min:0,max:10,step:1,value:3},
    {type:'range',key:'gloss3',label:'блеск',min:0,max:10,step:1,value:3},
    {type:'toggle',key:'rim3',label:'контровой свет',value:true},
    {type:'button',label:'анфас',action(){modeState.yaw=0;modeState.pitch=0;}},
    {type:'button',label:'взъерошить всё',action(){for(const h of modeState.hairs){h.targetLift=1;h.target=h.target.map((v,k)=>v+Math.sin(h.phase*(k+1)));}}},
    {type:'button',label:'сначала',action(){setMode(current);}}
  ],setup:fur3Setup,
  onDown:fur3Down,onMove:fur3Stroke,onUp(){modeState.brush=null;},
  step(){const s=modeState;s.time+=STEP;
    for(let k=0;k<3;k++){const target=s.brush&&s.pressActive&&!s.rotating?s.pressTarget[k]*num('press3')/10:0;s.pressVelocity[k]+=((target-s.pressOffset[k])*95-s.pressVelocity[k]*11)*STEP;s.pressOffset[k]+=s.pressVelocity[k]*STEP;}
    const softness=num('softHair3')/10,stiffness=lerp(240,65,softness),damping=lerp(28,10,softness);
    for(const h of s.hairs){
      for(let k=0;k<3;k++){h.velocity[k]+=((h.target[k]-h.dir[k])*stiffness-h.velocity[k]*damping)*STEP;h.dir[k]+=h.velocity[k]*STEP;}
      h.liftVelocity+=((h.targetLift-h.lift)*stiffness-h.liftVelocity*damping)*STEP;h.lift+=h.liftVelocity*STEP;
    }},
  draw:fur3Draw
};

labModesBar.style.flexWrap = 'wrap';
startLab({ title: 'Ь · мягкий знак', modes: MODES, start: 'fur3', ground: 'paper' });
