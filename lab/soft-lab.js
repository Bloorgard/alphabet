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
  if (current !== 'crumb' && current !== 'elastic') return;
  modeState.pump = 0;
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

startLab({ title: 'Ь · мягкий знак', modes: MODES, start: 'elastic', ground: 'paper' });
