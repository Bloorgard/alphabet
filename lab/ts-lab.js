const TS_TAIL = { x: 0.748, y: 0.775 };

function tsInside(x, y) {
  return (x > .23 && x < .365 && y > .19 && y < .705)
    || (x > .595 && x < .73 && y > .19 && y < .705)
    || (x > .23 && x < .78 && y > .585 && y < .715)
    || (x > .715 && x < .78 && y > .66 && y < .79);
}

function tsHint(message) {
  if (labBare) return;
  ctx.font = `${Math.max(10, S * .017)}px 'DM Mono', monospace`;
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'center';
  const lines = ctx.measureText(message).width > S * .87 ? message.split(' · ') : [message];
  lines.forEach((text, i) => ctx.fillText(text, S * .5, S * (.935 + i * .038)));
}

function tsHandle(x, y, active) {
  ctx.strokeStyle = active ? INK : MUTED;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x * S, y * S, .013 * S, 0, Math.PI * 2);
  ctx.stroke();
}

function tsGrab() {
  const m = modeState;
  m.held = Math.hypot(pointer.x - m.hx, pointer.y - m.hy) < .085;
  if (m.held) {
    m.gx = pointer.x;
    m.gy = pointer.y;
    m.startX = m.hx;
    m.startY = m.hy;
  }
}

function tsMove() {
  const m = modeState;
  if (!m.held || !pointer.down) return;
  m.hx = clamp(m.startX + pointer.x - m.gx, .13, .89);
  m.hy = clamp(m.startY + pointer.y - m.gy, .25, .89);
}

function tsRelease() { modeState.held = false; }

// Pressure-driven invasion: sealed outer edges, air in the counter, drain at the tail.
function tsEbbSetup() {
  const n = 192;
  const m = modeState;
  Object.assign(m, { n, hx: TS_TAIL.x, hy: TS_TAIL.y, held: false,
    pressure: new Float32Array(n * n), cells: new Uint8Array(n * n),
    resistance: new Float32Array(n * n), front: new Set(), removed: 0, debt: 0,
    pull: 0, flow: 0, tick: 0, layer: document.createElement('canvas'), dirty: true });
  m.layer.width = m.layer.height = n;
  m.paint = m.layer.getContext('2d');
  m.pixels = m.paint.createImageData(n, n);
  let seed = 7919;
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const i = y * n + x;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    m.resistance[i] = .3 + seed / 4294967296;
    if (tsInside(x / n, y / n)) {
      m.cells[i] = 1;
      m.pressure[i] = .45;
      if (y / n > .77) m.cells[i] = 3;
    } else if (x / n >= .365 && x / n <= .595 && y / n > .18 && y / n <= .585) {
      m.cells[i] = 2;
      m.pressure[i] = 1;
    }
  }
  for (let i = n; i < n * (n - 1); i++) {
    if (m.cells[i] === 1 && [i - 1, i + 1, i - n, i + n].some(j => m.cells[j] === 2)) m.front.add(i);
  }
}

function tsPressure(m) {
  const { n, cells: c, pressure: p } = m;
  for (let pass = 0; pass < 16; pass++) {
    for (let y = 36; y < 152; y++) for (let x = 44; x < 151; x++) {
      const i = y * n + x;
      if (c[i] !== 1) continue;
      let sum = 0, count = 0;
      for (const j of [i - 1, i + 1, i - n, i + n]) {
        if (c[j]) { sum += p[j]; count++; }
      }
      p[i] += .95 * (sum / count - p[i]);
    }
  }
}

function tsInvade(m) {
  let best = -1, score = -1;
  const { n, cells: c, pressure: p } = m;
  for (const i of m.front) {
    let air = 0;
    for (const j of [i - 1, i + 1, i - n, i + n]) if (c[j] === 2) air++;
    const force = Math.pow(Math.max(.0001, 1 - p[i]), 1.3)
      * (1 + air * num('smooth') * .1) / m.resistance[i];
    if (force > score) { best = i; score = force; }
  }
  if (best < 0) return;
  c[best] = 2;
  p[best] = 1;
  m.front.delete(best);
  for (const j of [best - 1, best + 1, best - n, best + n]) if (c[j] === 1) m.front.add(j);
  m.removed++;
  m.dirty = true;
}

function tsEbbStep() {
  const m = modeState;
  if (!m.held) {
    m.hx = lerp(m.hx, TS_TAIL.x, .075);
    m.hy = lerp(m.hy, TS_TAIL.y, .075);
  }
  m.pull = Math.max(0, m.hy - TS_TAIL.y) + Math.abs(m.hx - TS_TAIL.x) * .2;
  const drive = m.held ? clamp(m.pull * 11, 0, 1) : 0;
  m.flow = lerp(m.flow, drive, .1);
  if (m.flow < .005) return;
  tsPressure(m);
  m.debt += m.flow * num('rate') * .75;
  while (m.debt >= 1) { tsInvade(m); m.debt--; }
  m.tick += STEP;
}

function tsEbbDraw() {
  const m = modeState;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, S, S);
  if (m.dirty || m.color !== INK) {
    // Canvas resolves the shared palette; only alpha is stored in the simulation.
    const data = m.pixels.data;
    for (let i = 0; i < m.cells.length; i++) data[i * 4 + 3] = m.cells[i] === 1 || m.cells[i] === 3 ? 255 : 0;
    m.paint.putImageData(m.pixels, 0, 0);
    m.paint.globalCompositeOperation = 'source-in';
    m.paint.fillStyle = INK;
    m.paint.fillRect(0, 0, m.n, m.n);
    m.paint.globalCompositeOperation = 'source-over';
    m.dirty = false;
    m.color = INK;
  }
  ctx.drawImage(m.layer, 0, 0, S, S);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(.716 * S, .715 * S);
  ctx.bezierCurveTo(.717 * S, .76 * S, (m.hx - .025) * S, (m.hy - .025) * S, (m.hx - .022) * S, m.hy * S);
  ctx.lineTo((m.hx + .022) * S, m.hy * S);
  ctx.bezierCurveTo((m.hx + .025) * S, (m.hy - .025) * S, .779 * S, .76 * S, .779 * S, .715 * S);
  ctx.fill();
  tsHandle(m.hx, m.hy + .022, m.held);
  tsHint(m.removed > 7000 ? 'масса ушла · начните заново' : 'потяните хвост вниз · отпустите, чтобы остановить');
}

function tsTensionSetup() {
  Object.assign(modeState, { hx: TS_TAIL.x, hy: TS_TAIL.y, held: false,
    dx: 0, dy: 0, vx: 0, vy: 0, time: 0, scars: [], flash: 0, torn: false });
}

function tsTensionStep() {
  const m = modeState;
  if (!m.held) {
    m.hx = lerp(m.hx, TS_TAIL.x, .09);
    m.hy = lerp(m.hy, TS_TAIL.y, .09);
    m.torn = false;
  }
  const tx = m.hx - TS_TAIL.x, ty = m.hy - TS_TAIL.y;
  const stiffness = num('elastic') * .002;
  m.vx = (m.vx + (tx - m.dx) * stiffness) * .82;
  m.vy = (m.vy + (ty - m.dy) * stiffness) * .82;
  m.dx += m.vx;
  m.dy += m.vy;
  m.time += STEP;
  m.flash = Math.max(0, m.flash - STEP * 2);
  if (m.held && !m.torn && Math.hypot(tx, ty) > .39) {
    m.scars.push({ x: m.dx, y: m.dy });
    if (m.scars.length > 7) m.scars.shift();
    m.torn = true;
    m.flash = 1;
  }
}

function tsThreadPoint(x, y, m) {
  const ex = x - TS_TAIL.x, ey = y - .7;
  const anchor = Math.exp(-Math.pow(TS_TAIL.y - .7, 2) / .14) * Math.sin(Math.PI * TS_TAIL.x);
  const weight = Math.exp(-ex * ex / .115 - ey * ey / .14) * Math.sin(Math.PI * x) / anchor;
  const pull = Math.hypot(m.dx, m.dy);
  const fold = Math.sin((y - TS_TAIL.y) * 47 + ex * 9) * pull * .10 * weight;
  let px = x + m.dx * weight;
  let py = y + m.dy * weight + fold;
  for (const scar of m.scars) {
    px += scar.x * weight * (1 - weight) * .065;
    py += scar.y * weight * (1 - weight) * .065;
  }
  return [px * S, py * S];
}

function tsTensionDraw() {
  const m = modeState;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, S, S);
  const count = num('threads');
  for (let row = 0; row < count; row++) {
    const y = .12 + row / (count - 1) * .72;
    for (const bright of [false, true]) {
      ctx.strokeStyle = bright ? ink(.88) : ink(.15);
      ctx.lineWidth = Math.max(.55, S * (bright ? .0015 : .0007));
      ctx.beginPath();
      let drawing = false;
      for (let col = 0; col <= 160; col++) {
        const x = .07 + col / 160 * .86;
        const inside = tsInside(x, y);
        const tear = m.scars.length && y > .62 && y < .73 && Math.abs(x - .73) < .007 * m.scars.length;
        if (inside !== bright || tear) { drawing = false; continue; }
        const p = tsThreadPoint(x, y, m);
        if (!drawing) ctx.moveTo(...p); else ctx.lineTo(...p);
        drawing = true;
      }
      ctx.stroke();
    }
  }
  const tip = tsThreadPoint(TS_TAIL.x, TS_TAIL.y, m);
  if (m.flash) {
    ctx.globalAlpha = m.flash;
    line(tip[0] / S - .012, tip[1] / S, tip[0] / S + .012, tip[1] / S - .02, RED, .002);
    ctx.globalAlpha = 1;
  }
  tsHandle(m.hx, m.hy, m.held);
  tsHint(m.flash ? 'разрыв' : 'подхватите хвост · тяните в сторону');
}

function tsGameField() {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, S, S);
  line(.07, .5, .93, .5, ink(.25), .001);
}

function tsUnderSetup() {
  Object.assign(modeState, { running: false, dead: false, held: false, height: .2,
    tail: .16, targetHeight: .2, targetTail: .16, distance: 0, score: 0,
    gates: Array.from({ length: 4 }, (_, i) => tsUnderGate(i)), next: 4 });
}

function tsUnderGate(i) {
  return { x: 1.02 + i * .48, ceiling: .11 + ((i * 7 + 3) % 9) * .017,
    depth: .095 + ((i * 5 + 4) % 10) * .017, passed: false };
}

function tsUnderMove() {
  const m = modeState;
  if (!m.held || !pointer.down || m.dead) return;
  m.targetHeight = clamp(.5 - pointer.y, .07, .3);
  m.targetTail = clamp(.07 + (pointer.x - .12) / .76 * .23, .07, .3);
}

function tsUnderDown() {
  if (modeState.dead) return;
  modeState.running = true;
  modeState.held = true;
  tsUnderMove();
}

function tsUnderStep() {
  const m = modeState;
  if (!m.running || m.dead) return;
  m.height = lerp(m.height, m.targetHeight, .22);
  m.tail = lerp(m.tail, m.targetTail, .22);
  const speed = .095 + Math.min(m.score, 18) * .004;
  for (const g of m.gates) {
    g.x -= speed * STEP;
    if (g.x < .405 && g.x > .255 && m.height > g.ceiling - .009) {
      m.dead = true; g.hit = true;
    }
    if (!g.passed && g.x <= .395) {
      g.passed = true;
      if (Math.abs(m.tail - g.depth) < .035 && Math.abs(m.height - (g.ceiling - .04)) < .028 && !m.dead) m.score++;
      else { m.dead = true; g.hit = true; }
    }
  }
  if (m.gates[0].x < -.1) {
    m.gates.shift();
    const g = tsUnderGate(m.next++);
    g.x = m.gates[m.gates.length - 1].x + .48;
    m.gates.push(g);
  }
}

function tsUnderDraw() {
  const m = modeState;
  tsGameField();
  for (const g of m.gates) {
    if (g.x > .96 || g.x < .04) continue;
    ctx.fillStyle = g.hit ? RED : ink(.22);
    ctx.fillRect((g.x - .018) * S, .12 * S, .036 * S, (.38 - g.ceiling) * S);
    ctx.fillRect((g.x - .018) * S, (.5 + g.depth + .046) * S, .036 * S, (.37 - g.depth) * S);
    ctx.strokeStyle = g.hit ? RED : (g.passed ? ink(.18) : INK);
    ctx.lineWidth = S * .0015;
    ctx.beginPath();
    ctx.arc(g.x * S, (.5 + g.depth) * S, .021 * S, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(g.x * S, (.54 - g.ceiling) * S, .017 * S, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = m.dead ? RED : INK;
  ctx.lineWidth = S * .017;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(.275 * S, (.5 - m.height) * S);
  ctx.lineTo(.275 * S, .493 * S);
  ctx.lineTo(.395 * S, .493 * S);
  ctx.moveTo(.38 * S, (.5 - m.height) * S);
  ctx.lineTo(.38 * S, .493 * S);
  ctx.stroke();
  line(.395, .493, .395, .5 + m.tail, m.dead ? RED : INK, .007);
  dot(.395, .5 + m.tail, m.dead ? RED : INK, .009);
  drawStatus(String(m.score).padStart(2, '0'), m.dead);
  tsHint(m.dead ? 'зацепились · нажмите «заново»' : 'палец ниже — Ц ниже · правее — хвост длиннее');
  if (!m.running && !labBare) {
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'center';
    ctx.font = `${S * .021}px 'DM Mono', monospace`;
    ctx.fillText('коснитесь поля, чтобы начать', S * .5, S * .08);
  }
}

function tsBiteSetup() {
  Object.assign(modeState, { held: false, charge: 0, closing: 0, loop: 0,
    score: 0, escaped: 0, time: 0, flash: 0, beads: [], spawn: .2,
    caught: [], running: false, seed: 371 });
}

function tsBiteDown() {
  const m = modeState;
  if (m.closing > 0) return;
  m.running = true;
  m.held = true;
}

function tsBiteLoop(amount) {
  const w = .06 + amount * .29, d = .055 + amount * .25;
  const path = new Path2D();
  path.moveTo(.6, .5);
  path.bezierCurveTo(.6 + w * .08, .5 + d * .56, .6 - w * .1, .5 + d, .6 - w * .5, .5 + d);
  path.bezierCurveTo(.6 - w * 1.18, .5 + d, .6 - w * 1.18, .5, .6 - w * .5, .5);
  path.bezierCurveTo(.6 - w * .2, .5, .59, .505, .6, .5);
  path.closePath();
  return path;
}

function tsBiteUp() {
  const m = modeState;
  if (!m.held) return;
  m.held = false;
  m.loop = m.charge;
  m.closing = 1;
  const loop = tsBiteLoop(m.loop);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const b of m.beads) {
    if (ctx.isPointInPath(loop, b.x, b.y)) {
      b.caught = true;
      m.score++;
      m.flash = 1;
      m.caught.push({ x: b.x, y: b.y, life: 1 });
    }
  }
  ctx.restore();
  m.beads = m.beads.filter(b => !b.caught);
}

function tsBiteStep() {
  const m = modeState;
  m.time += STEP;
  m.flash = Math.max(0, m.flash - STEP * 1.7);
  if (m.held) m.charge = Math.min(1, m.charge + STEP * .56);
  else if (m.closing > 0) {
    m.closing = Math.max(0, m.closing - STEP / (.22 + m.loop * .5));
    m.charge = m.loop * m.closing;
  } else m.charge = 0;
  for (const b of m.caught) b.life -= STEP * 1.3;
  m.caught = m.caught.filter(b => b.life > 0);
  if (!m.running && !labBare) return;
  m.spawn -= STEP;
  if (m.spawn <= 0) {
    m.seed = (Math.imul(m.seed, 1664525) + 1013904223) >>> 0;
    m.beads.push({ x: .035, y: .55 + m.seed / 4294967296 * .15,
      speed: .11 + (m.seed % 7) * .012 });
    m.spawn = .75 + (m.seed % 11) * .08;
  }
  for (const b of m.beads) b.x += b.speed * STEP;
  m.escaped += m.beads.filter(b => b.x > .96).length;
  m.beads = m.beads.filter(b => b.x <= .96);
}

function tsBiteDraw() {
  const m = modeState;
  tsGameField();
  ctx.strokeStyle = INK;
  ctx.lineWidth = S * .007;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(.29 * S, .36 * S);
  ctx.bezierCurveTo(.32 * S, .29 * S, .345 * S, .31 * S, .326 * S, .405 * S);
  ctx.bezierCurveTo(.295 * S, .54 * S, .42 * S, .50 * S, .465 * S, .33 * S);
  ctx.bezierCurveTo(.43 * S, .51 * S, .47 * S, .51 * S, .60 * S, .50 * S);
  ctx.stroke();
  ctx.save();
  ctx.scale(S, S);
  ctx.strokeStyle = m.flash ? RED : INK;
  ctx.lineWidth = .003;
  ctx.stroke(tsBiteLoop(m.charge));
  ctx.beginPath();
  ctx.moveTo(.6, .5);
  ctx.quadraticCurveTo(.62, .5, .65, .475);
  ctx.stroke();
  ctx.restore();
  for (const b of m.beads) {
    line(b.x - .025, b.y, b.x - .01, b.y, ink(.18), .001);
    dot(b.x, b.y, INK, .006);
  }
  for (const b of m.caught) {
    ctx.globalAlpha = b.life;
    dot(lerp(.6, b.x, b.life), lerp(.5, b.y, b.life), RED, .008 * b.life);
    ctx.globalAlpha = 1;
  }
  drawStatus(`${String(m.score).padStart(2, '0')} / ${String(m.escaped).padStart(2, '0')}`);
  tsHint(m.running ? 'удерживайте — петля растёт · отпустите — поймает' : 'удерживайте поле · ловите бусины хвостом');
}

const TS_DRAW_WIDTH = .0045;
const TS_DRAW_MASS = 1.52725 * .125 - 2 * .125 * .125;

function tsDrawSetup() {
  Object.assign(modeState, { held: false, hx: .747, hy: .79, used: 0,
    points: [{ x: .747, y: .79 }], phase: 0, coil: 0, speed: 0,
    lastX: .747, lastY: .79, done: false, flash: 0 });
}

function tsDrawDown() {
  if (modeState.done) return;
  tsGrab();
  if (modeState.held) {
    const m = modeState;
    m.lastX = m.hx;
    m.lastY = m.hy;
    m.coil = 0;
  }
}

function tsDrawStep() {
  const m = modeState;
  m.flash = Math.max(0, m.flash - STEP);
  if (!m.held || m.done) return;
  const velocity = Math.hypot(m.hx - m.lastX, m.hy - m.lastY) / STEP;
  m.speed = lerp(m.speed, velocity, .3);
  m.lastX = m.hx;
  m.lastY = m.hy;
  m.coil = lerp(m.coil, .024 * Math.exp(-m.speed * 4), .075);
  m.phase += STEP * 5.5;
  const last = m.points[m.points.length - 1];
  const x = clamp(m.hx + Math.cos(m.phase) * m.coil, .035, .965);
  const y = clamp(m.hy + Math.sin(m.phase) * m.coil, .08, .88);
  const length = Math.hypot(x - last.x, y - last.y);
  if (length < .0008) return;
  const remaining = (TS_DRAW_MASS - m.used) / TS_DRAW_WIDTH;
  const ratio = Math.min(1, remaining / length);
  m.points.push({ x: lerp(last.x, x, ratio), y: lerp(last.y, y, ratio) });
  m.used = Math.min(TS_DRAW_MASS, m.used + length * ratio * TS_DRAW_WIDTH);
  if (ratio < 1 || m.used >= TS_DRAW_MASS) {
    m.done = true;
    m.held = false;
    m.flash = 1;
  }
}

function tsDrawRelease() {
  const m = modeState;
  m.held = false;
  const last = m.points[m.points.length - 1];
  m.hx = last.x;
  m.hy = last.y;
}

function tsDrawRender() {
  const m = modeState;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, S, S);
  const area = Math.max(0, TS_DRAW_MASS - m.used);
  // Union of two stems, the foot and the narrower descender.
  const t = (1.52725 - Math.sqrt(1.52725 ** 2 - 8 * area)) / 4;
  ctx.fillStyle = INK;
  if (t > 0) {
    ctx.fillRect(.23 * S, .195 * S, t * S, .49 * S);
    ctx.fillRect((.73 - t) * S, .195 * S, t * S, .49 * S);
    ctx.fillRect(.23 * S, (.685 - t) * S, .5 * S, t * S);
    ctx.fillRect((.73 - .45 * t) * S, .685 * S, .45 * t * S, .105 * S);
    ctx.beginPath();
    ctx.moveTo((.73 - .45 * t) * S, .76 * S);
    ctx.quadraticCurveTo(.73 * S, .79 * S, .747 * S, .79 * S);
    ctx.lineTo(.747 * S, (.79 - TS_DRAW_WIDTH) * S);
    ctx.quadraticCurveTo(.73 * S, .785 * S, .73 * S, .76 * S);
    ctx.fill();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = TS_DRAW_WIDTH * S;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  m.points.forEach((p, i) => i ? ctx.lineTo(p.x * S, p.y * S) : ctx.moveTo(p.x * S, p.y * S));
  ctx.stroke();
  const end = m.points[m.points.length - 1];
  if (!m.done) tsHandle(end.x, end.y, m.held);
  if (m.flash) {
    ctx.globalAlpha = m.flash;
    dot(end.x, end.y, RED, .008);
    ctx.globalAlpha = 1;
  }
  if (!labBare) drawStatus(`${Math.round(area / TS_DRAW_MASS * 100)}%`);
  tsHint(m.done ? 'вся буква стала линией · снимок сохранит рисунок'
    : 'тяните конец нити · медленно — петли, быстро — прямая');
}

function tsRubbleSetup() {
  const n = 220, m = modeState;
  Object.assign(m, { n, held: false, hx: .748, hy: .805, opened: 0,
    cells: new Uint8Array(n * n), order: [], cursor: 0, debt: 0, tick: 0,
    layer: document.createElement('canvas'), released: 0, moving: 0 });
  m.layer.width = m.layer.height = n;
  m.paint = m.layer.getContext('2d');
  m.pixels = m.paint.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (tsInside(x / n, y / n)) m.cells[y * n + x] = 2;
  }
  const seen = new Uint8Array(n * n);
  const root = Math.floor(.775 * n) * n + Math.floor(.75 * n);
  m.order.push(root);
  seen[root] = 1;
  for (let k = 0; k < m.order.length; k++) {
    const i = m.order[k];
    for (const j of [i - 1, i - n, i + 1, i + n]) {
      if (m.cells[j] === 2 && !seen[j]) { seen[j] = 1; m.order.push(j); }
    }
  }
  m.total = m.order.length;
  m.order = m.order.map((i, rank) => ({ i, rank: rank + ((Math.imul(i, 2654435761) >>> 0) % 350) }))
    .sort((a, b) => a.rank - b.rank).map(item => item.i);
  requestAnimationFrame(() => {
    if (current === 'rubble') document.getElementById('modes').scrollLeft = 10000;
  });
}

function tsRubbleMove() {
  const m = modeState;
  if (!m.held || !pointer.down) return;
  m.hx = clamp(m.startX + pointer.x - m.gx, .56, .92);
}

function tsRubbleStep() {
  const m = modeState, n = m.n, c = m.cells;
  m.tick++;
  m.opened = clamp((Math.abs(m.hx - .748) - .012) / .12, 0, 1);
  m.debt += m.opened * 11;
  while (m.debt >= 1 && m.cursor < m.order.length) {
    const i = m.order[m.cursor++];
    c[i] = 1;
    m.released++;
    m.debt--;
  }
  if (m.cursor === m.order.length) m.debt = 0;
  m.moving = 0;
  const floor = Math.floor(n * .885);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = floor - 1; y >= 0; y--) {
      const reverse = (m.tick + y + pass) % 2;
      for (let k = 1; k < n - 1; k++) {
        const x = reverse ? n - 1 - k : k, i = y * n + x;
        if (c[i] !== 1 || ((Math.imul(i + m.tick * 997, 2654435761) >>> 0) % 11) < 2) continue;
        const down = i + n;
        const sign = (x * 13 + y * 7 + m.tick) % 2 ? 1 : -1;
        let next = -1;
        if (!c[down]) next = down;
        else if (!c[down + sign] && !c[i + sign]) next = down + sign;
        else if (!c[down - sign] && !c[i - sign]) next = down - sign;
        if (next >= 0) { c[next] = 1; c[i] = 0; m.moving++; }
      }
    }
  }
}

function tsRubbleDraw() {
  const m = modeState;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, S, S);
  const data = m.pixels.data;
  for (let i = 0; i < m.cells.length; i++) {
    data[i * 4 + 3] = m.cells[i] ? ((Math.imul(i, 2654435761) >>> 0) % 23 < 2 ? 185 : 255) : 0;
  }
  m.paint.putImageData(m.pixels, 0, 0);
  m.paint.globalCompositeOperation = 'source-in';
  m.paint.fillStyle = INK;
  m.paint.fillRect(0, 0, m.n, m.n);
  m.paint.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(m.layer, 0, 0, S, S);
  ctx.imageSmoothingEnabled = true;
  line(.08, .888, .92, .888, ink(.2), .001);
  line(m.hx - .04, m.hy, m.hx + .04, m.hy, INK, .003);
  line(m.hx, m.hy, m.hx, m.hy + .025, MUTED, .001);
  tsHandle(m.hx, m.hy + .035, m.held);
  tsHint(m.cursor === m.total ? 'осталась осыпь · «заново» соберёт букву'
    : 'сдвиньте опору под хвостом · верните, чтобы остановить');
}

const TS_ROD_LENGTH = .012;

function tsRodSetup() {
  const m = modeState;
  Object.assign(m, { hx: .48, hy: .31, ax: .48, ay: .31, held: false, feed: 0,
    nodes: Array.from({ length: 20 }, (_, i) => {
      const x = .575 + Math.sin(i * .37) * .0003, y = .385 + i * TS_ROD_LENGTH;
      return { x, y, px: x, py: y };
    }) });
  requestAnimationFrame(() => {
    if (current === 'rod') document.getElementById('modes').scrollLeft = 10000;
  });
}

function tsRodDown() {
  const m = modeState;
  m.held = Math.hypot(pointer.x - m.ax, pointer.y - m.ay) < .2;
  if (m.held) { m.gx = pointer.x; m.gy = pointer.y; m.startX = m.hx; m.startY = m.hy; }
}

function tsRodMove() {
  const m = modeState;
  if (!m.held || !pointer.down) return;
  m.hx = clamp(m.startX + pointer.x - m.gx, .18, .76);
  m.hy = clamp(m.startY + pointer.y - m.gy, .18, .57);
}

function tsRodConstraint(a, b, length, stiffness, pinA, pinB) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d < .000001) return;
  const sum = (pinA ? 0 : 1) + (pinB ? 0 : 1);
  if (!sum) return;
  const f = (d - length) / d * stiffness / sum;
  if (!pinA) { a.x += dx * f; a.y += dy * f; }
  if (!pinB) { b.x -= dx * f; b.y -= dy * f; }
}

function tsRodStep() {
  const m = modeState;
  const speed = Math.hypot(m.hx - m.ax, m.hy - m.ay);
  const follow = Math.min(1, .004 / Math.max(.000001, speed));
  m.ax = lerp(m.ax, m.hx, follow);
  m.ay = lerp(m.ay, m.hy, follow);
  if (on('feed') && m.nodes.length < 320) {
    m.feed += num('rate') * .001 * STEP;
    if (m.feed >= TS_ROD_LENGTH) {
      m.feed -= TS_ROD_LENGTH;
      const x = m.ax + .095, y = m.ay + .075;
      m.nodes.unshift({ x, y, px: x, py: y });
    }
  }
  const nodes = m.nodes;
  for (let sub = 0; sub < 2; sub++) {
    for (let i = 2; i < nodes.length; i++) {
      const p = nodes[i];
      const vx = (p.x - p.px) * .985, vy = (p.y - p.py) * .985;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + .7 * (STEP / 2) ** 2;
    }
    for (let iter = 0; iter < 10; iter++) {
      for (let i = 0; i < 2; i++) {
        const p = nodes[i];
        p.x = p.px = m.ax + .095;
        p.y = p.py = m.ay + .075 + i * (TS_ROD_LENGTH + m.feed);
      }
      for (let i = 0; i < nodes.length - 1; i++) {
        tsRodConstraint(nodes[i], nodes[i + 1], TS_ROD_LENGTH, 1, i < 2, i + 1 < 2);
      }
      for (let i = 0; i < nodes.length - 2; i++) {
        tsRodConstraint(nodes[i], nodes[i + 2], TS_ROD_LENGTH * 2, num('stiffness') * .007, i < 2, false);
      }
      for (let i = 2; i < nodes.length; i++) {
        const p = nodes[i];
        p.x = clamp(p.x, .065, .935);
        if (p.y > .835) {
          p.y = .835;
          p.px = lerp(p.px, p.x, .18);
        }
      }
    }
    for (let i = 2; i < nodes.length; i++) for (let j = i + 3; j < nodes.length; j++) {
      if (Math.abs(nodes[i].x - nodes[j].x) > .008 || Math.abs(nodes[i].y - nodes[j].y) > .008) continue;
      const distance = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (distance < .008) tsRodConstraint(nodes[i], nodes[j], .008, .8, false, false);
    }
    for (let i = 2; i < nodes.length; i++) {
      nodes[i].x = clamp(nodes[i].x, .065, .935);
      nodes[i].y = Math.min(nodes[i].y, .835);
    }
  }
}

function tsRodDraw() {
  const m = modeState;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, S, S);
  line(.065, .842, .935, .842, ink(.25), .001);
  ctx.save();
  ctx.translate((m.ax - .48) * S, (m.ay - .31) * S);
  ctx.strokeStyle = INK;
  ctx.lineWidth = S * .009;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(.32 * S, .28 * S);
  ctx.bezierCurveTo(.37 * S, .19 * S, .38 * S, .23 * S, .36 * S, .315 * S);
  ctx.bezierCurveTo(.33 * S, .43 * S, .45 * S, .38 * S, .49 * S, .235 * S);
  ctx.bezierCurveTo(.45 * S, .39 * S, .49 * S, .385 * S, .575 * S, .385 * S);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = S * .0045;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  m.nodes.forEach((p, i) => i ? ctx.lineTo(p.x * S, p.y * S) : ctx.moveTo(p.x * S, p.y * S));
  ctx.stroke();
  tsHint(m.nodes.length >= 320 ? 'вся нить вышла · двигайте букву или начните заново'
    : 'двигайте букву · хвост укладывается на поверхность');
}

/* ---------- опалубка: объёмы, у которых гасят крышки ---------- */

/* Изометрия без перспективы: план (x, y) лежит на общей плоскости,
   z поднимает тело вверх по экрану. Обратное преобразование нужно для
   перетаскивания — экранная точка при заданной высоте даёт точку плана. */
const TS_ISO = { cx: .5, cy: .615, cos: .866, sin: .5,
  get k() { return .36 * (current === 'decking' ? (num('zoom') || 100) / 100 : 1); }
};

function tsIsoPoint(x, y, z) {
  const i = TS_ISO;
  return [(i.cx + (x - y) * i.cos * i.k) * S, (i.cy + ((x + y) * i.sin - z) * i.k) * S];
}

function tsIsoPlan(sx, sy, z) {
  const i = TS_ISO;
  const u = (sx - i.cx) / (i.cos * i.k);
  const w = ((sy - i.cy) / i.k + z) / i.sin;
  return [(u + w) / 2, (w - u) / 2];
}

function tsVolLetter() {
  return [
    { kind: 'box', x: -.34, y: .34, w: .11, d: .11, h: .78, a: 0 },
    { kind: 'box', x: .34, y: -.34, w: .11, d: .11, h: .78, a: 0 },
    { kind: 'box', x: .03, y: .03, w: .52, d: .1, h: .14, a: -Math.PI / 4 },
    { kind: 'disc', x: .62, y: .1, r: .1, h: .34, a: 0 },
  ];
}

function tsVolCorners(f) {
  const c = Math.cos(f.a);
  const s = Math.sin(f.a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const lx = sx * f.w;
    const ly = sy * f.d;
    return [f.x + lx * c - ly * s, f.y + lx * s + ly * c];
  });
}

/* Три роли сцены — поле, боковины, крышки — красятся независимо, и краска
   для каждой берётся отсюда. Боковины идут притушенными, пока горит «свет»:
   это вся светотень сцены — разница в тоне внутри одного цвета. Погасить —
   и крышку от боковины отделяет только обводка, а без неё ничего. */
const TS_VOL_PAINTS = ['фон', 'чернила', 'красный'];

function tsVolPaint(index, soft = false) {
  if (index === 2) return RED;
  if (index === 1) return soft ? ink(.86) : INK;
  return PAPER;
}

/* Два слоя: притушенные чернила полупрозрачны и сами по себе пропустили бы
   сквозь себя тело, лежащее сзади. Подложка всегда цвета фона, а не поля —
   иначе боковины перекрашивались бы вслед за полем и «чернила» на красном
   выходили бы розовыми. */
function tsVolSkin(skin) {
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.fillStyle = skin.wall;
  ctx.fill();
}

/* Ребро между гранями — просвет до фона, а не контур тела, и цвет берёт у
   фона, а не у поля: на красном поле красная обводка пропала бы. */
function tsVolSeam(skin) {
  if (!skin.edges) return;
  ctx.strokeStyle = paper(.9);
  ctx.lineWidth = Math.max(1, S * .0016);
  ctx.lineJoin = 'miter';
  ctx.stroke();
}

function tsVolBox(f, skin) {
  const plan = tsVolCorners(f);
  const top = plan.map(([x, y]) => tsIsoPoint(x, y, f.h));
  const bot = plan.map(([x, y]) => tsIsoPoint(x, y, 0));
  if (!skin.edges) {
    const points = [...top, ...bot].sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
    const cross = (a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const half = list => {
      const out=[];
      for(const p of list) { while(out.length>1 && cross(out[out.length-2],out[out.length-1],p)<=0)out.pop(); out.push(p); }
      return out;
    };
    const hull=[...half(points).slice(0,-1),...half([...points].reverse()).slice(0,-1)];
    ctx.beginPath(); hull.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();
    tsVolSkin(skin);
    ctx.beginPath();top.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();
    ctx.fillStyle=skin.cap;ctx.fill();
    ctx.strokeStyle=skin.cap;ctx.lineWidth=.65;ctx.stroke();
    return;
  }
  const order = [0, 1, 2, 3].sort((a, b) => {
    const ea = plan[a][0] + plan[a][1] + plan[(a + 1) % 4][0] + plan[(a + 1) % 4][1];
    const eb = plan[b][0] + plan[b][1] + plan[(b + 1) % 4][0] + plan[(b + 1) % 4][1];
    return ea - eb;
  });
  for (const i of order) {
    const j = (i + 1) % 4;
    ctx.beginPath();
    ctx.moveTo(top[i][0], top[i][1]);
    ctx.lineTo(top[j][0], top[j][1]);
    ctx.lineTo(bot[j][0], bot[j][1]);
    ctx.lineTo(bot[i][0], bot[i][1]);
    ctx.closePath();
    tsVolSkin(skin);
    tsVolSeam(skin);
  }
  ctx.beginPath();
  top.forEach(([X, Y], i) => (i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y)));
  ctx.closePath();
  ctx.fillStyle = skin.cap;
  ctx.fill();
  tsVolSeam(skin);
}

function tsVolDisc(f, skin) {
  const n = 64;
  const top = [];
  const bot = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = f.x + Math.cos(t) * f.r;
    const y = f.y + Math.sin(t) * f.r;
    top.push(tsIsoPoint(x, y, f.h));
    bot.push(tsIsoPoint(x, y, 0));
  }
  /* Обечайка — один силуэт, а не набор сегментов: у полосок общая граница,
     и любая обводка или полупрозрачная заливка проявила бы швы. Тело, сдвинутое
     строго вниз, остаётся выпуклым, поэтому контур собирается из верхней дуги
     крышки и нижней дуги подошвы. */
  let lo = 0;
  let hi = 0;
  for (let i = 1; i < n; i++) {
    if (top[i][0] < top[lo][0]) lo = i;
    if (top[i][0] > top[hi][0]) hi = i;
  }
  const arc = (pts, from, to, dir) => {
    const out = [];
    for (let i = from; ; i = (i + dir + n) % n) {
      out.push(pts[i]);
      if (i === to) break;
    }
    return out;
  };
  const height = (pts) => pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
  const dir = height(arc(top, lo, hi, 1)) < height(arc(top, lo, hi, -1)) ? 1 : -1;
  const shell = [...arc(top, lo, hi, dir), ...arc(bot, hi, lo, dir)];
  ctx.beginPath();
  shell.forEach(([X, Y], i) => (i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y)));
  ctx.closePath();
  tsVolSkin(skin);
  /* Шов виден только на ближней стороне — иначе поворот круга нечем прочесть. */
  if (Math.cos(f.a) + Math.sin(f.a) > 0) {
    const sx = f.x + Math.cos(f.a) * f.r;
    const sy = f.y + Math.sin(f.a) * f.r;
    const a = tsIsoPoint(sx, sy, f.h);
    const b = tsIsoPoint(sx, sy, 0);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    tsVolSeam(skin);
  }
  ctx.beginPath();
  top.forEach(([X, Y], i) => (i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y)));
  ctx.closePath();
  ctx.fillStyle = skin.cap;
  ctx.fill();
  tsVolSeam(skin);
}

function tsVolInside(f, px, py) {
  const dx = px - f.x;
  const dy = py - f.y;
  if (f.kind === 'disc') return Math.hypot(dx, dy) <= f.r;
  const c = Math.cos(-f.a);
  const s = Math.sin(-f.a);
  return Math.abs(dx * c - dy * s) <= f.w && Math.abs(dx * s + dy * c) <= f.d;
}

/* Экранная точка попадает в тело, если хоть на одной высоте она попадает
   в подошву: вертикаль экрана при росте z скользит по плану по диагонали. */
function tsVolPick(sx, sy) {
  const order = modeState.figs
    .map((f, i) => i)
    .sort((a, b) => tsVolDepth(modeState.figs[b]) - tsVolDepth(modeState.figs[a]));
  for (const i of order) {
    const f = modeState.figs[i];
    for (let k = 0; k <= 20; k++) {
      const z = (f.h * k) / 20;
      const [px, py] = tsIsoPlan(sx, sy, z);
      if (tsVolInside(f, px, py)) return { i, z };
    }
  }
  return { i: -1, z: 0 };
}

function tsVolDepth(f) { return f.x + f.y; }

function tsVolLift(f) {
  const [X, Y] = tsIsoPoint(f.x, f.y, f.h);
  return [X, Y - S * .075];
}

function tsVolSpin(f) {
  const reach = (f.kind === 'disc' ? f.r : Math.hypot(f.w, f.d)) + .14;
  return tsIsoPoint(f.x + Math.cos(f.a) * reach, f.y + Math.sin(f.a) * reach, f.h);
}

function tsVolAdd(kind) {
  const m = modeState;
  const spot = -.2 + m.figs.length * .07;
  m.figs.push(kind === 'disc'
    ? { kind: 'disc', x: spot, y: spot, r: .13, h: .3, a: 0 }
    : { kind: 'box', x: spot, y: spot, w: .13, d: .13, h: .3, a: 0 });
  m.sel = m.figs.length - 1;
}

function tsVolDrop() {
  const m = modeState;
  if (m.sel < 0) return;
  m.figs.splice(m.sel, 1);
  m.sel = -1;
}

function tsVolSetup() {
  Object.assign(modeState, { figs: tsVolLetter(), sel: -1, drag: null, grabZ: 0, ox: 0, oy: 0, from: 0, gy: 0 });
}

function tsVolDown() {
  const m = modeState;
  const f = m.figs[m.sel];
  if (f) {
    const near = (p) => Math.hypot(pointer.x * S - p[0], pointer.y * S - p[1]) < S * .035;
    if (near(tsVolLift(f))) { m.drag = 'lift'; m.from = f.h; m.gy = pointer.y; return; }
    if (near(tsVolSpin(f))) { m.drag = 'spin'; return; }
  }
  const hit = tsVolPick(pointer.x, pointer.y);
  m.sel = hit.i;
  m.drag = null;
  if (hit.i < 0) return;
  const g = m.figs[hit.i];
  const [px, py] = tsIsoPlan(pointer.x, pointer.y, hit.z);
  m.drag = 'move';
  m.grabZ = hit.z;
  m.ox = g.x - px;
  m.oy = g.y - py;
}

function tsVolMove() {
  const m = modeState;
  const f = m.figs[m.sel];
  if (!f || !pointer.down || !m.drag) return;
  if (m.drag === 'move') {
    const [px, py] = tsIsoPlan(pointer.x, pointer.y, m.grabZ);
    f.x = clamp(px + m.ox, -1.15, 1.15);
    f.y = clamp(py + m.oy, -1.15, 1.15);
  } else if (m.drag === 'lift') {
    f.h = clamp(m.from + (m.gy - pointer.y) / TS_ISO.k, .04, 1.5);
  } else {
    const [px, py] = tsIsoPlan(pointer.x, pointer.y, f.h);
    f.a = Math.atan2(py - f.y, px - f.x);
  }
}

function tsVolUp() { modeState.drag = null; }

function tsVolGrid() {
  const span = 1.2;
  for (let t = -span; t <= span + 1e-6; t += .3) {
    const a = tsIsoPoint(t, -span, 0);
    const b = tsIsoPoint(t, span, 0);
    const c = tsIsoPoint(-span, t, 0);
    const d = tsIsoPoint(span, t, 0);
    line(a[0] / S, a[1] / S, b[0] / S, b[1] / S, GHOST, .0015);
    line(c[0] / S, c[1] / S, d[0] / S, d[1] / S, GHOST, .0015);
  }
}

/* Разбор палитры общий на опалубку и рельеф: у них один набор переключателей. */
function tsVolLayOut() {
  const field = num('field');
  const skin = {
    field: tsVolPaint(field),
    wall: tsVolPaint(num('walls'), on('light')),
    cap: tsVolPaint(num('caps')),
    edges: on('edges'),
  };
  /* Поле в цвет фона канвас и так отдаёт сквозь себя — заливаем только чужое. */
  if (field !== 0) {
    ctx.fillStyle = skin.field;
    ctx.fillRect(0, 0, S, S);
  }
  return skin;
}

function tsVolDraw() {
  const m = modeState;
  const skin = tsVolLayOut();
  if (m.sel >= 0) tsVolGrid();
  const order = m.figs.map((f, i) => i).sort((a, b) => tsVolDepth(m.figs[a]) - tsVolDepth(m.figs[b]));
  for (const i of order) {
    const f = m.figs[i];
    if (f.kind === 'box') tsVolBox(f, skin); else tsVolDisc(f, skin);
  }
  const f = m.figs[m.sel];
  if (f) {
    const lift = tsVolLift(f);
    const spin = tsVolSpin(f);
    const head = tsIsoPoint(f.x, f.y, f.h);
    line(head[0] / S, head[1] / S, lift[0] / S, lift[1] / S, MUTED, .0015);
    line(head[0] / S, head[1] / S, spin[0] / S, spin[1] / S, MUTED, .0015);
    tsHandle(lift[0] / S, lift[1] / S, m.drag === 'lift');
    tsHandle(spin[0] / S, spin[1] / S, m.drag === 'spin');
  }
  tsHint(m.sel < 0 ? 'нажмите на тело · оно возьмётся' : 'тело таскает · верхняя ручка поднимает · боковая крутит');
}

/* ---------- рельеф: сетка столбов ---------- */

/* Поле — квадратная сетка на той же плоскости, что и опалубка. Клетка никуда
   не едет, у неё есть только высота: поле столбов, а не набор тел.
   Два режима делят весь код и различаются одним флагом `full`: у рельефа
   сетка ограничена ромбом посреди кадра, у настила расстелена во всё поле. */
const TS_REL_SPAN = 1.4;
const TS_REL_MAX = 6;

/* Ц лежит на поле плашмя. Изометрия её мнёт, и с большинства углов это просто
   рельеф — буква собирается только с одного поворота. Поворот и есть то,
   чем её ищут. */
const TS_REL_GLYPH = [
  'X.....X',
  'X.....X',
  'X.....X',
  'X.....X',
  'X.....X',
  'XXXXXXX',
  '......X',
];

/* Клетки живут в словаре, а не в массиве: у настила номер клетки уходит в
   минус и за край, и заранее известной решётки у него нет. */
function tsRelKey(i, j) { return (i + 512) * 1024 + (j + 512); }

function tsRelAt(i, j) {
  const key = tsRelKey(i, j);
  return modeState.motion?.get(key)?.value ?? (modeState.h.get(key) || 0);
}

function tsRelAngle() { return ((modeState.rotation?.value ?? num('turn')) * Math.PI) / 180; }

function tsRelBuild(full) {
  const m = modeState;
  m.full = full;
  m.n = Math.round(num('grid'));
  m.cell = TS_REL_SPAN / m.n;
  m.h = new Map();
  m.top = 0;
  m.drag = null;
  if (m.n < TS_REL_GLYPH.length) return;
  const off = Math.floor((m.n - TS_REL_GLYPH.length) / 2);
  m.top = m.cell;
  TS_REL_GLYPH.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      /* Строки глифа кладутся поперёк и справа налево: при повороте на 45°
         сетка встаёт по экрану, и буква должна читаться прямо и в свою
         сторону, а не лёжа на боку и не зеркально. */
      if (row[row.length - 1 - i] === 'X') m.h.set(tsRelKey(i + off, j + off), m.cell);
    }
  });
}

/* Сколько клеток покрыть. У настила это углы кадра, снятые с плоскости и
   развёрнутые обратно в свою сетку; высоту учитываем отдельным набором углов,
   иначе столб, стоящий ниже нижнего края, пропал бы вместе со своей клеткой. */
function tsRelRange() {
  const m = modeState;
  if (!m.full) return { i0: 0, i1: m.n - 1, j0: 0, j1: m.n - 1 };
  const a = tsRelAngle();
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  let i0 = Infinity;
  let i1 = -Infinity;
  let j0 = Infinity;
  let j1 = -Infinity;
  for (const z of [0, m.top]) {
    for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const [px, py] = tsIsoPlan(sx, sy, z);
      const i = (px * cos + py * sin) / m.cell + m.n / 2 - .5;
      const j = (py * cos - px * sin) / m.cell + m.n / 2 - .5;
      i0 = Math.min(i0, i); i1 = Math.max(i1, i);
      j0 = Math.min(j0, j); j1 = Math.max(j1, j);
    }
  }
  return { i0: Math.floor(i0) - 1, i1: Math.ceil(i1) + 1, j0: Math.floor(j0) - 1, j1: Math.ceil(j1) + 1 };
}

/* Клетки как тела: дальше их рисует и щупает та же пара функций, что и
   опалубку — квадрат со стороной клетки, повёрнутый вместе со всем полем. */
function tsRelBody(i, j, cos, sin) {
  const m = modeState;
  const lx = (i + .5 - m.n / 2) * m.cell;
  const ly = (j + .5 - m.n / 2) * m.cell;
  return {
    kind: 'box', a: tsRelAngle(), at: tsRelKey(i, j),
    x: lx * cos - ly * sin, y: lx * sin + ly * cos,
    w: m.cell / 2, d: m.cell / 2, h: tsRelAt(i, j),
  };
}

function tsRelColumns() {
  const a = tsRelAngle();
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const box = tsRelRange();
  const out = [];
  for (let j = box.j0; j <= box.j1; j++) {
    for (let i = box.i0; i <= box.i1; i++) {
      if (tsRelAt(i, j) > 1e-4) out.push(tsRelBody(i, j, cos, sin));
    }
  }
  return out;
}

/* Пол щупать перебором незачем: точка кадра снимается на плоскость и сразу
   даёт свою клетку. Перебираем только столбы — они закрывают пол за собой. */
function tsRelPick(sx, sy) {
  const m = modeState;
  for (const body of tsRelColumns().sort((p, q) => tsVolDepth(q) - tsVolDepth(p))) {
    const steps = Math.max(1, Math.round(body.h / body.w));
    for (let k = 0; k <= steps; k++) {
      const [px, py] = tsIsoPlan(sx, sy, (body.h * k) / steps);
      if (tsVolInside(body, px, py)) return body.at;
    }
  }
  const a = tsRelAngle();
  const [px, py] = tsIsoPlan(sx, sy, 0);
  const i = Math.round((px * Math.cos(a) + py * Math.sin(a)) / m.cell + m.n / 2 - .5);
  const j = Math.round((py * Math.cos(a) - px * Math.sin(a)) / m.cell + m.n / 2 - .5);
  const box = tsRelRange();
  if (i < box.i0 || i > box.i1 || j < box.j0 || j > box.j1) return null;
  return tsRelKey(i, j);
}

function tsRelSetup() { tsRelBuild(false); }

function tsRelWideSetup() { tsRelBuild(true); }

function tsRelTool(key) { if (key === 'grid') tsRelBuild(modeState.full); }

function tsRelDown() {
  const m = modeState;
  m.drag = tsRelPick(pointer.x, pointer.y);
  if (m.drag === null) return;
  m.from = m.h.get(m.drag) || 0;
  m.gy = pointer.y;
}

function tsRelMove() {
  const m = modeState;
  if (m.drag === null || !pointer.down) return;
  const raised = clamp(m.from + (m.gy - pointer.y) / TS_ISO.k, 0, TS_REL_MAX * m.cell);
  m.h.set(m.drag, raised);
  m.top = Math.max(m.top, raised);
}

function tsRelUp() { modeState.drag = null; }

function tsRelScene() {
  const skin = tsVolLayOut();
  const a = tsRelAngle();
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const box = tsRelRange();
  /* Весь пол — один путь на заливку и один на обводку. Клетки лежат в одной
     плоскости, не спорят за порядок и намотаны одинаково, а тысяча отдельных
     fill() у настила стоила бы кадра. */
  if (modeState.full) {
    ctx.fillStyle = skin.field; ctx.fillRect(0, 0, S, S);
    if (skin.edges) {
      const {cell,n} = modeState;
      const point = (i,j) => {
        const x = (i-n/2)*cell, y = (j-n/2)*cell;
        return tsIsoPoint(x*cos-y*sin, x*sin+y*cos, 0);
      };
      ctx.beginPath();
      for (let i=box.i0; i<=box.i1+1; i++) {
        ctx.moveTo(...point(i,box.j0)); ctx.lineTo(...point(i,box.j1+1));
      }
      for (let j=box.j0; j<=box.j1+1; j++) {
        ctx.moveTo(...point(box.i0,j)); ctx.lineTo(...point(box.i1+1,j));
      }
      tsVolSeam(skin);
    }
  } else {
  ctx.beginPath();
  for (let j = box.j0; j <= box.j1; j++) {
    for (let i = box.i0; i <= box.i1; i++) {
      tsVolCorners(tsRelBody(i, j, cos, sin)).forEach(([x, y], k) => {
        const [X, Y] = tsIsoPoint(x, y, 0);
        if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      });
      ctx.closePath();
    }
  }
  ctx.fillStyle = skin.field;
  ctx.fill();
  tsVolSeam(skin);
  }
  /* Столб, стоящий впереди, закрывает то, что за ним: порядок по глубине.
     Пол при этом всегда снизу — клетка перед столбом его не заслоняет. */
  if (current === 'decking' && num('surface') === 2) tsDeckLayers(skin);
  else if (current === 'decking' && num('surface') === 1) tsDeckSurface(skin);
  else tsRelColumns()
    .sort((p, q) => tsVolDepth(p) - tsVolDepth(q))
    .forEach((body) => tsVolBox(body, skin));
}

function tsRelDraw() {
  const m = modeState;
  if (current === 'decking') {
    tsDeckAnimate(tsDeckCapture);
    const key = [S, dpr, ground, m.n, tsRelAngle(), ...TS_DECK_VIEW.map(labValue)].join(':');
    if (!m.raster || m.raster.key !== key || m.raster.mesh !== m.mesh) {
      tsRelScene();
      const layer = m.sceneCanvas || (m.sceneCanvas = document.createElement('canvas'));
      if (layer.width !== canvas.width || layer.height !== canvas.height) {
        layer.width = canvas.width; layer.height = canvas.height;
      }
      const paint = layer.getContext('2d');
      paint.clearRect(0, 0, layer.width, layer.height);
      paint.drawImage(canvas, 0, 0);
      m.raster = { key, layer, mesh: m.mesh };
    } else ctx.drawImage(m.raster.layer, 0, 0, S, S);
    if (m.hoverPending) { m.hover = tsDeckPick(pointer.x, pointer.y); m.hoverPending = false; }
    tsDeckHighlight();
  } else {
    tsRelScene();
    tsHint('потяните клетку вверх · поворот и сетка в панели');
  }
}

const TS_DECK_KEY = 'alphabet:decking:v1:' + location.pathname;
const TS_DECK_VIEW = ['caps', 'walls', 'field', 'edges', 'light', 'turn', 'surface', 'smooth', 'zoom'];
let tsDeckDraft = null;
let tsDeckCapture = false;

function tsDeckDocument() {
  return { format: 'alphabet-decking', version: 1, grid: modeState.n,
    heights: [...modeState.h].filter(([, h]) => h > .00001), ground,
    view: Object.fromEntries(TS_DECK_VIEW.map(key => [key, labValue(key)])) };
}

function tsDeckValidate(doc) {
  if (!doc || doc.format !== 'alphabet-decking' || doc.version !== 1
    || !Number.isInteger(doc.grid) || doc.grid < 5 || doc.grid > 52
    || !Array.isArray(doc.heights) || doc.heights.length > 30000
    || !doc.heights.every(p => Array.isArray(p) && p.length === 2 && Number.isInteger(p[0])
      && p[0] >= 0 && p[0] < 1048576 && Number.isFinite(p[1]) && p[1] >= 0 && p[1] <= TS_REL_MAX * TS_REL_SPAN / doc.grid)
    || !doc.view || !['paper', 'ink'].includes(doc.ground)) throw new Error('Это не файл рисунка настила.');
  for (const key of ['caps', 'walls', 'field']) {
    if (![0, 1, 2].includes(doc.view[key])) throw new Error('В файле повреждены цвета.');
  }
  if (!Number.isFinite(doc.view.turn) || doc.view.turn < -180 || doc.view.turn > 180
    || ![0, 1, 2].includes(doc.view.surface) || !Number.isFinite(doc.view.smooth)
    || doc.view.smooth < 0 || doc.view.smooth > 1
    || typeof doc.view.edges !== 'boolean' || typeof doc.view.light !== 'boolean') throw new Error('В файле повреждены параметры вида.');
  if (doc.view.zoom !== undefined && (!Number.isFinite(doc.view.zoom) || doc.view.zoom < 50 || doc.view.zoom > 200)) throw new Error('В файле повреждён масштаб.');
  return doc;
}

function tsDeckMessage(text) {
  const status = document.getElementById('deck-status');
  if (status) status.textContent = text;
}

function tsDeckRead(key, fallback) {
  try { return JSON.parse(localStorage.getItem(TS_DECK_KEY + key)) || fallback; }
  catch { return fallback; }
}

function tsDeckSave() {
  tsDeckDraft = tsDeckDocument();
  try {
    localStorage.setItem(TS_DECK_KEY + ':draft', JSON.stringify(tsDeckDraft));
    tsDeckMessage('сохранено в этом браузере');
  } catch {
    tsDeckMessage('автосохранение недоступно · сохраните файл рисунка');
  }
}

function tsDeckApply(doc) {
  tsDeckValidate(doc);
  const m = modeState;
  m.n = doc.grid;
  m.cell = TS_REL_SPAN / m.n;
  m.motion = new Map(); m.rotation = null;
  m.h = new Map(doc.heights);
  m.top = Math.max(0, ...m.h.values());
  m.drag = null;
  m.hover = null;
  toolValues[slot('grid')] = m.n;
  for (const key of TS_DECK_VIEW) toolValues[slot(key)] = key === 'zoom' ? (doc.view.zoom ?? 100) : doc.view[key];
  setGround(doc.ground);
  tsDeckInvalidate();
  tsDeckUI();
  labWriteHash();
}

function tsDeckSetup() {
  tsRelBuild(true);
  Object.assign(modeState, { undo: [], redo: [], hover: null, brush: 'pull', level: 1, mesh: null });
  const saved = tsDeckDraft || tsDeckRead(':draft', null);
  if (saved && !labBare) {
    try { tsDeckApply(saved); }
    catch { tsDeckUI(); tsDeckMessage('черновик не прочитан · исходная Ц'); }
  } else tsDeckUI();
  requestAnimationFrame(() => {
    if (current !== 'decking') return;
    const nav = document.getElementById('modes'), button = nav.querySelector('[data-mode=decking]');
    nav.scrollLeft = Math.max(0, button.offsetLeft - nav.offsetLeft - nav.clientWidth + button.offsetWidth);
  });
}

function tsDeckCheckpoint() { modeState.before = tsDeckDocument(); }

function tsDeckCommit() {
  const m = modeState;
  if (m.before && JSON.stringify(m.before) !== JSON.stringify(tsDeckDocument())) {
    m.undo.push(m.before);
    if (m.undo.length > 80) m.undo.shift();
    m.redo = [];
  }
  m.before = null;
  m.top = Math.max(0, ...m.h.values());
  tsDeckSave();
  tsDeckHistoryButtons();
}

function tsDeckHistory(redo) {
  const m = modeState, from = redo ? m.redo : m.undo, to = redo ? m.undo : m.redo;
  if (!from.length) return;
  to.push(tsDeckDocument());
  tsDeckApply(from.pop());
  tsDeckSave();
}

function tsDeckHistoryButtons() {
  const undo = document.getElementById('deck-undo'), redo = document.getElementById('deck-redo');
  if (undo) undo.disabled = !modeState.undo.length;
  if (redo) redo.disabled = !modeState.redo.length;
}

function tsDeckSet(key, value) {
  tsDeckCheckpoint();
  if (key === 'turn') {
    const from = modeState.rotation?.value ?? num('turn');
    const delta = ((value-from+180)%360+360)%360-180;
    modeState.rotation = matchMedia('(prefers-reduced-motion: reduce)').matches ? null
      : { from, to: from+delta, value: from, start: performance.now() };
  }
  toolValues[slot(key)] = value;
  if (key === 'smooth') tsDeckInvalidate();
  tsDeckCommit();
  tsDeckUI();
  labWriteHash();
}

function tsDeckRotate(delta) {
  const next = ((num('turn') + delta + 180) % 360 + 360) % 360 - 180;
  tsDeckSet('turn', next);
}

function tsDeckClear() {
  tsDeckCheckpoint();
  modeState.motion?.clear();
  modeState.h.clear();
  tsDeckInvalidate();
  modeState.drag = null;
  modeState.hover = null;
  tsDeckCommit();
  tsDeckUI();
}

function tsDeckNew() {
  tsDeckCheckpoint();
  tsRelBuild(true);
  modeState.motion?.clear();
  tsDeckInvalidate();
  tsDeckCommit();
  tsDeckUI();
}

function tsDeckDownload() {
  const blob = new Blob([JSON.stringify(tsDeckDocument(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url;
  a.download = 'ц-настил-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function tsDeckImport(file) {
  if (!file) return;
  try {
    if (file.size > 3000000) throw new Error('Файл слишком большой.');
    const doc = tsDeckValidate(JSON.parse(await file.text()));
    if (current !== 'decking') return;
    tsDeckCheckpoint();
    tsDeckApply(doc);
    tsDeckCommit();
    tsDeckMessage('рисунок открыт · предыдущее состояние доступно через отмену');
  } catch (error) { tsDeckMessage(error instanceof SyntaxError ? 'Не удалось прочитать JSON рисунка.' : error.message); }
}

function tsDeckVariant() {
  const input = document.getElementById('deck-name');
  const name = input.value.trim();
  if (!name) { input.focus(); tsDeckMessage('дайте варианту имя'); return; }
  const variants = tsDeckRead(':variants', []);
  tsDeckCapture = true;
  ctx.clearRect(0, 0, S, S);
  tsRelDraw();
  const thumb = document.createElement('canvas');
  thumb.width = thumb.height = 160;
  const paint = thumb.getContext('2d');
  paint.fillStyle = PAPER; paint.fillRect(0, 0, 160, 160);
  paint.drawImage(canvas, 0, 0, 160, 160);
  tsDeckCapture = false;
  variants.push({ name, date: new Date().toISOString(), document: tsDeckDocument(), image: thumb.toDataURL('image/png') });
  try {
    localStorage.setItem(TS_DECK_KEY + ':variants', JSON.stringify(variants));
    tsDeckUI();
    tsDeckMessage('вариант «' + name + '» сохранён');
  } catch { tsDeckMessage('не хватило места для варианта · сохраните файл рисунка'); }
}

function tsDeckUI() {
  const root = document.getElementById('tools');
  const focus = root.contains(document.activeElement) ? document.activeElement.dataset.deckControl : null;
  root.replaceChildren();
  const panel = document.createElement('div');
  panel.className = 'deck-editor';
  root.append(panel);
  const row = () => { const r = document.createElement('div'); r.className = 'deck-row'; panel.append(r); return r; };
  const button = (parent, label, action, pressed) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
    b.dataset.deckControl = label; b.onclick = action; parent.append(b); return b;
  };
  const heading = (parent, text) => {
    const title = document.createElement('div'); title.className = 'deck-heading'; title.textContent = text; parent.append(title);
  };
  const history = row(); history.classList.add('deck-history');
  heading(history, 'рисунок');
  button(history, '↶ отмена', () => tsDeckHistory(false)).id = 'deck-undo';
  button(history, '↷ повтор', () => tsDeckHistory(true)).id = 'deck-redo';
  const actions = row(); actions.classList.add('deck-segments');
  for (const [key, label] of [['pull', 'тянуть'], ['level', 'кисть'], ['erase', 'ластик']]) {
    button(actions, label, () => { modeState.brush = key; tsDeckUI(); }, modeState.brush === key);
  }
  const height = document.createElement('label'); height.textContent = 'высота · ' + modeState.level.toFixed(1);
  const level = document.createElement('input'); level.type = 'range'; level.min = 0; level.max = 6; level.step = .1; level.value = modeState.level;
  level.setAttribute('aria-label', 'высота кисти');
  level.oninput = () => { modeState.level = Number(level.value); height.firstChild.textContent = 'высота · ' + modeState.level.toFixed(1); };
  height.append(level); height.hidden = modeState.brush !== 'level'; panel.append(height);
  const help = document.createElement('span'); help.className = 'deck-help';
  help.textContent = {pull:'Тяните клетку вверх или вниз.',level:'Проводите по клеткам — кисть задаёт одну высоту.',erase:'Проводите по клеткам, чтобы опустить их в пол.'}[modeState.brush]; panel.append(help);
  const reset = row(); reset.classList.add('deck-secondary');
  button(reset, 'исходная Ц', tsDeckNew);
  button(reset, 'очистить', tsDeckClear);
  const view = document.createElement('details');
  view.open = modeState.viewOpen ?? true;
  view.ontoggle = () => { if (current === 'decking' && view.isConnected) modeState.viewOpen = view.open; };
  const summary = document.createElement('summary'); summary.textContent = 'вид · ' + ['ступени', 'оболочка', 'слои'][num('surface')] + ' · ' + num('turn') + '°';
  view.append(summary); panel.append(view);
  const vr = document.createElement('div'); vr.className = 'deck-row'; view.append(vr);
  vr.classList.add('deck-view');
  const rotation = document.createElement('div'); rotation.className = 'deck-row deck-rotation'; vr.append(rotation);
  button(rotation, '−90°', () => tsDeckRotate(-90));
  button(rotation, '+90°', () => tsDeckRotate(90));
  button(rotation, '0°', () => tsDeckSet('turn', 0));
  const surfaces = document.createElement('div'); surfaces.className = 'deck-row deck-segments'; vr.prepend(surfaces);
  button(surfaces, 'ступени', () => tsDeckSet('surface', 0), !num('surface'));
  button(surfaces, 'оболочка', () => tsDeckSet('surface', 1), num('surface') === 1);
  button(surfaces, 'слои', () => tsDeckSet('surface', 2), num('surface') === 2);
  const range = (key, label, min, max, step, unit = '') => {
    const l = document.createElement('label'), input = document.createElement('input');
    l.textContent = label + ' · ' + num(key) + unit; input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = num(key); input.setAttribute('aria-label', label);
    input.oninput = () => {
      if (!modeState.before) tsDeckCheckpoint();
      if (key === 'turn') modeState.rotation = null;
      toolValues[slot(key)] = Number(input.value); if (key === 'smooth') tsDeckInvalidate();
      l.firstChild.textContent = label + ' · ' + input.value + unit;
    };
    input.onchange = () => { tsDeckCommit(); labWriteHash(); summary.textContent = 'вид · ' + ['ступени', 'оболочка', 'слои'][num('surface')] + ' · ' + num('turn') + '°'; };
    l.append(input); vr.append(l);
  };
  range('zoom', 'масштаб', 50, 200, 5, '%');
  button(vr, 'масштаб 100%', () => tsDeckSet('zoom', 100));
  range('turn', 'поворот', -180, 180, 1);
  if (num('surface')) range('smooth', 'смягчение', 0, 1, .05);
  for (const [key, title] of [['caps', 'крышки'], ['walls', 'боковины'], ['field', 'поле']]) {
    const label = document.createElement('label'); label.textContent = title;
    const select = document.createElement('select'); select.setAttribute('aria-label', title); select.dataset.deckControl = key;
    TS_VOL_PAINTS.forEach((text,i) => { const option = new Option(text,i); select.append(option); });
    select.value = num(key); select.onchange = () => tsDeckSet(key,Number(select.value));
    label.append(select); vr.append(label);
    if (key === 'walls') label.hidden = num('surface') !== 0;
  }
  const switches = document.createElement('div'); switches.className = 'deck-row'; vr.append(switches);
  for (const [key, title] of [['edges', 'сетка и рёбра'], ['light', 'свет']]) {
    const label = document.createElement('label'), input = document.createElement('input');
    input.type = 'checkbox'; input.checked = on(key); input.dataset.deckControl = key;
    input.onchange = () => tsDeckSet(key,input.checked); label.append(input, title); switches.append(label);
    if (key === 'light') label.hidden = num('surface') === 2;
  }
  const grid = document.createElement('span'); grid.textContent = 'сетка · ' + modeState.n; vr.append(grid);
  const files = row(); files.classList.add('deck-files');
  heading(files, 'варианты и экспорт');
  const name = document.createElement('input'); name.type = 'text'; name.id = 'deck-name'; name.placeholder = 'название варианта Ц'; name.maxLength = 80; name.setAttribute('aria-label', 'название варианта'); name.value = modeState.variantName || ''; name.oninput = () => { modeState.variantName = name.value; }; files.append(name);
  button(files, 'зафиксировать вариант', tsDeckVariant).className = 'deck-primary';
  button(files, 'файл рисунка ↓', tsDeckDownload);
  button(files, 'PNG ↓', () => { tsDeckCapture = true; ctx.clearRect(0, 0, S, S); tsRelDraw(); snapshot(); tsDeckCapture = false; });
  const upload = document.createElement('input'); upload.type = 'file'; upload.accept = '.json,application/json'; upload.hidden = true;
  upload.onchange = () => tsDeckImport(upload.files[0]); panel.append(upload);
  button(files, 'открыть файл', () => upload.click());

  const variants = tsDeckRead(':variants', []);
  if (variants.length) {
    const gallery = document.createElement('details'); gallery.className = 'deck-gallery';
    const title = document.createElement('summary'); title.textContent = 'сохранённые варианты · ' + variants.length; gallery.append(title);
    const cards = document.createElement('div'); cards.className = 'deck-cards'; gallery.append(cards);
    variants.forEach(v => {
      const b = button(cards, '', () => {
        try { tsDeckValidate(v.document); tsDeckCheckpoint(); tsDeckApply(v.document); tsDeckCommit(); }
        catch (error) { tsDeckMessage(error.message); }
      });
      const img = document.createElement('img'); img.src = v.image; img.alt = ''; img.width = img.height = 100;
      const caption = document.createElement('span'); caption.textContent = v.name;
      b.append(img, caption); b.title = v.date;
    });
    panel.append(gallery);
  }
  const status = document.createElement('span'); status.id = 'deck-status'; status.setAttribute('role', 'status');
  status.textContent = 'черновик сохраняется автоматически · варианты фиксируются отдельно'; panel.append(status);
  tsDeckHistoryButtons();
  if (focus) [...root.querySelectorAll('[data-deck-control]')].find(el => el.dataset.deckControl === focus)?.focus({preventScroll:true});
}

function tsDeckKey(event, down) {
  if (!down) return;
  if (!(event.metaKey || event.ctrlKey)) return;
  if (event.code === 'KeyZ') { event.preventDefault(); tsDeckHistory(event.shiftKey); }
  if (event.code === 'KeyY') { event.preventDefault(); tsDeckHistory(true); }
}

function tsDeckPaint(at) {
  const m = modeState;
  if (at === null) return;
  const h = m.brush === 'erase' ? 0 : m.level * m.cell;
  if ((m.h.get(at) || 0) === h) return;
  const from = m.motion?.get(at)?.value ?? (m.h.get(at) || 0);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    (m.motion || (m.motion = new Map())).set(at, { from, to: h, value: from, start: performance.now() });
  }
  if (h) m.h.set(at, h); else m.h.delete(at);
  m.top = Math.max(0, ...m.h.values()); tsDeckInvalidate();
}

function tsDeckPick(sx, sy) {
  const m = modeState;
  if (!num('surface') || !m.mesh) return tsRelPick(sx, sy);
  for (let k = m.mesh.length - 1; k >= 0; k--) {
    const face = m.mesh[k];
    if (!face.pick || face.pick.scale !== TS_ISO.k) {
      const p = face.points.map(([x,y,z]) => [TS_ISO.cx+(x-y)*TS_ISO.cos*TS_ISO.k, TS_ISO.cy+((x+y)*TS_ISO.sin-z)*TS_ISO.k]);
      face.pick = { p, scale: TS_ISO.k, x0:Math.min(...p.map(v=>v[0])), x1:Math.max(...p.map(v=>v[0])), y0:Math.min(...p.map(v=>v[1])), y1:Math.max(...p.map(v=>v[1])) };
    }
    const box = face.pick;
    if (sx < box.x0 || sx > box.x1 || sy < box.y0 || sy > box.y1) continue;
    const [a,b,c] = box.p;
    const d = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    if (Math.abs(d) < 1e-10) continue;
    const u = ((b[1]-c[1])*(sx-c[0])+(c[0]-b[0])*(sy-c[1]))/d;
    const v = ((c[1]-a[1])*(sx-c[0])+(a[0]-c[0])*(sy-c[1]))/d;
    if (u < 0 || v < 0 || u+v > 1) continue;
    const x=u*face.points[0][0]+v*face.points[1][0]+(1-u-v)*face.points[2][0];
    const y=u*face.points[0][1]+v*face.points[1][1]+(1-u-v)*face.points[2][1];
    const angle=tsRelAngle(), co=Math.cos(angle), si=Math.sin(angle);
    return tsRelKey(Math.round((x*co+y*si)/m.cell+m.n/2-.5),Math.round((y*co-x*si)/m.cell+m.n/2-.5));
  }
  const [x,y]=tsIsoPlan(sx,sy,0), a=tsRelAngle();
  return tsRelKey(Math.round((x*Math.cos(a)+y*Math.sin(a))/m.cell+m.n/2-.5),Math.round((y*Math.cos(a)-x*Math.sin(a))/m.cell+m.n/2-.5));
}

function tsDeckDown() {
  const m = modeState;
  m.drag = tsDeckPick(pointer.x, pointer.y);
  if (m.drag === null) return;
  tsDeckCheckpoint();
  m.from = m.motion?.get(m.drag)?.value ?? (m.h.get(m.drag) || 0); m.gy = pointer.y;
  if (m.brush === 'pull' && m.motion?.delete(m.drag)) {
    m.h.set(m.drag, m.from); tsDeckInvalidate();
  }
  if (m.brush !== 'pull') tsDeckPaint(m.drag);
}

function tsDeckMove() {
  const m = modeState;
  if (m.drag === null || !pointer.down) { m.hoverPending = true; return; }
  if (m.brush === 'pull') {
    tsRelMove();
    m.level = (m.h.get(m.drag) || 0) / m.cell;
  } else {
    const distance = Math.hypot(pointer.x - pointer.px, pointer.y - pointer.py);
    const steps = Math.max(1, Math.ceil(distance / (m.cell * TS_ISO.k * .2)));
    for (let i = 1; i <= steps; i++) tsDeckPaint(tsDeckPick(lerp(pointer.px, pointer.x, i / steps), lerp(pointer.py, pointer.y, i / steps)));
  }
  tsDeckInvalidate();
}

function tsDeckUp() {
  if (modeState.drag === null) return;
  modeState.drag = null;
  tsDeckCommit();
  tsDeckUI();
}

function tsDeckHighlight() {
  if (tsDeckCapture || labBare) return;
  const m = modeState, key = m.drag === null ? m.hover : m.drag;
  if (key === null || key === undefined) return;
  const i = Math.floor(key / 1024) - 512, j = key % 1024 - 512;
  const a = tsRelAngle(), body = tsRelBody(i, j, Math.cos(a), Math.sin(a));
  for (const z of [0, body.h]) {
    ctx.beginPath();
    tsVolCorners(body).forEach(([x, y], k) => {
      const p = tsIsoPoint(x, y, z); if (k) ctx.lineTo(...p); else ctx.moveTo(...p);
    });
    ctx.closePath(); ctx.strokeStyle = num('field') === 2 ? INK : RED; ctx.lineWidth = 1.5; ctx.stroke();
  }
  const base = tsIsoPoint(body.x, body.y, 0), top = tsIsoPoint(body.x, body.y, body.h);
  line(base[0] / S, base[1] / S, top[0] / S, top[1] / S, num('field') === 2 ? INK : RED, .001);
  drawStatus('высота · ' + (body.h / m.cell).toFixed(1));
}

// Cubic B-spline reconstruction is a view of the samples, never an edit to heights.
function tsDeckHeight(x, y) {
  const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j;
  const linear = lerp(lerp(tsRelAt(i, j), tsRelAt(i + 1, j), u), lerp(tsRelAt(i, j + 1), tsRelAt(i + 1, j + 1), u), v);
  const weights = t => [(1-t)**3/6, (3*t**3-6*t*t+4)/6, (-3*t**3+3*t*t+3*t+1)/6, t**3/6];
  const wx = weights(u), wy = weights(v);
  let smooth = 0;
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) smooth += wx[a] * wy[b] * tsRelAt(i + a - 1, j + b - 1);
  return lerp(linear, smooth, num('smooth'));
}

function tsDeckAnimate(finish = false) {
  const m = modeState, now = performance.now();
  finish ||= matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (m.motion?.size) {
    for (const [key, motion] of m.motion) {
      const t = finish ? 1 : Math.min(1, (now-motion.start)/160);
      motion.value = lerp(motion.from, motion.to, 1-(1-t)**3);
      if (t === 1) m.motion.delete(key);
    }
    m.top = Math.max(0, ...m.h.values(), ...[...m.motion.values()].map(v=>v.value));
    tsDeckInvalidate();
  }
  if (m.rotation) {
    const t = finish ? 1 : Math.min(1, (now-m.rotation.start)/240);
    m.rotation.value = lerp(m.rotation.from, m.rotation.to, t*t*(3-2*t));
    if (t === 1) m.rotation = null;
  }
}

function tsDeckInvalidate() {
  const m = modeState;
  m.geometry = null; m.mesh = null; m.slices = null; m.raster = null;
}

function tsDeckSurface(skin, buildOnly = false) {
  const m = modeState;
  if (!m.geometry) {
    const active = new Set();
    const samples = new Map(m.h);
    for (const [key, motion] of m.motion || []) samples.set(key, motion.value);
    for (const [key, h] of samples) if (h > .00001) {
      const i = Math.floor(key / 1024) - 512, j = key % 1024 - 512;
      for (let x = i - 2; x <= i + 1; x++) for (let y = j - 2; y <= j + 1; y++) active.add(tsRelKey(x, y));
    }
    const faces = [];
    const vertices = new Map();
    const vertex = (x, y) => {
      const key = `${x}:${y}`;
      if (vertices.has(key)) return vertices.get(key);
      const lx = (x + .5 - m.n / 2) * m.cell, ly = (y + .5 - m.n / 2) * m.cell;
      const point = [lx, ly, tsDeckHeight(x, y)];
      vertices.set(key, point);
      return point;
    };
    for (const key of active) {
      const i = Math.floor(key / 1024) - 512, j = key % 1024 - 512;
      for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
        const p = vertex(i + x / 4, j + y / 4), q = vertex(i + (x + 1) / 4, j + y / 4),
          r = vertex(i + (x + 1) / 4, j + (y + 1) / 4), t = vertex(i + x / 4, j + (y + 1) / 4);
        if (Math.max(p[2], q[2], r[2], t[2]) < .0001) continue;
        faces.push({ points: [p, q, r] }, { points: [p, r, t] });
      }
    }
    m.geometry = faces;
  }
  const angle = tsRelAngle();
  if (!m.mesh || m.meshAngle !== angle) {
    const co = Math.cos(angle), si = Math.sin(angle), vertices = new Map();
    m.mesh = m.geometry.map(face => {
      const points = face.points.map(p => {
        if (!vertices.has(p)) vertices.set(p, [p[0]*co-p[1]*si, p[0]*si+p[1]*co, p[2]]);
        return vertices.get(p);
      });
      const [a,b,c] = points;
      const ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2], vx=c[0]-a[0], vy=c[1]-a[1], vz=c[2]-a[2];
      const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
      return { points, depth: points.reduce((sum,p)=>sum+p[0]+p[1],0)/3,
        shade: clamp((nx*-.3+ny*-.5+nz)/(Math.hypot(nx,ny,nz)*1.16),0,1) };
    }).sort((a,b)=>a.depth-b.depth);
    m.meshAngle = angle;
  }
  if (buildOnly) return;
  const base = num('caps') === 2 ? RED.match(/[a-f0-9]{2}/gi).map(s => parseInt(s, 16))
    : num('caps') === 1 ? labGrounds[ground].mark : labGrounds[ground].field;
  const lit = on('light');
  for (const f of m.mesh) {
    ctx.beginPath();
    f.points.forEach((p,i)=>{ const v=tsIsoPoint(...p); if(i)ctx.lineTo(...v);else ctx.moveTo(...v); });
    ctx.closePath();
    const amount = lit ? (1-f.shade)*.38 : 0;
    const rgb = base.map((c,i) => Math.round(lerp(c,labGrounds[ground].field[i],amount)));
    ctx.fillStyle = `rgb(${rgb.join(',')})`; ctx.fill();
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = .6; ctx.stroke();
    if (skin.edges) { ctx.strokeStyle = paper(.25); ctx.lineWidth = .5; ctx.stroke(); }
  }
}

function tsDeckLayers(skin) {
  tsDeckSurface(skin, true);
  const m = modeState, step = m.cell / 4;
  if (!m.slices) {
    m.slices = [];
    for (let z = step; z <= m.top + .0001; z += step) {
      const fill = new Path2D(), edges = new Path2D();
      for (const {points} of m.geometry) {
        if (Math.max(points[0][2], points[1][2], points[2][2]) < z) continue;
        const clipped = [], crossing = [];
        for (let i = 0; i < 3; i++) {
          const a = points[i], b = points[(i+1)%3];
          if (a[2] >= z) clipped.push(a);
          if ((a[2] >= z) !== (b[2] >= z)) {
            const t = (z-a[2])/(b[2]-a[2]);
            const p = [lerp(a[0],b[0],t), lerp(a[1],b[1],t)];
            clipped.push(p); crossing.push(p);
          }
        }
        if (clipped.length >= 3) {
          clipped.forEach((p,i) => { if (i) fill.lineTo(p[0],p[1]); else fill.moveTo(p[0],p[1]); });
          fill.closePath();
        }
        if (crossing.length === 2) {
          edges.moveTo(...crossing[0]); edges.lineTo(...crossing[1]);
        }
      }
      m.slices.push({z,fill,edges});
    }
  }
  const co = Math.cos(tsRelAngle()), si = Math.sin(tsRelAngle()), k = S*TS_ISO.k;
  const transform = (z) => new DOMMatrix([
    (co-si)*TS_ISO.cos*k, (co+si)*TS_ISO.sin*k,
    (-si-co)*TS_ISO.cos*k, (co-si)*TS_ISO.sin*k,
    S*TS_ISO.cx, S*TS_ISO.cy-z*k
  ]);
  ctx.fillStyle = skin.cap;
  ctx.strokeStyle = num('caps') === 0 ? ink(.8) : paper(.8);
  ctx.lineWidth = Math.max(.75,S*.0012); ctx.lineCap = 'round';
  for (const slice of m.slices) {
    const matrix = transform(slice.z), fill = new Path2D(), edges = new Path2D();
    fill.addPath(slice.fill,matrix); edges.addPath(slice.edges,matrix);
    ctx.fill(fill); ctx.stroke(edges);
  }
}

new MutationObserver(() => {
  if (current === 'decking' && modeState.h && !labBare) tsDeckSave();
}).observe(document.body, { attributes: true, attributeFilter: ['data-ground'] });

const tsDeckStyle = document.createElement('style');
tsDeckStyle.textContent = `body.lab:has(.deck-editor){--col:min(62vh,100%)}.deck-editor{width:100%;display:grid;gap:12px;text-transform:none}.deck-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.deck-editor details{border-top:1px solid var(--line);padding-top:10px}.deck-editor summary{cursor:pointer;margin-bottom:8px}.deck-editor input[type=text]{min-width:0;width:190px;background:transparent;color:var(--ink);border:1px solid var(--line);padding:7px;font:inherit}.deck-editor button:disabled{opacity:.3;cursor:default}.deck-editor label{white-space:nowrap}.deck-editor .deck-cards{display:flex;gap:8px;overflow-x:auto}.deck-cards button{display:grid;gap:5px;flex:0 0 112px;white-space:normal}.deck-cards img{width:100px;height:100px}.deck-cards span{overflow-wrap:anywhere}#deck-status{font-size:10px;letter-spacing:0}.deck-editor [hidden]{display:none}`;
tsDeckStyle.textContent += `
.deck-editor{gap:10px;letter-spacing:0}
.deck-heading{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted)}
.deck-history .deck-heading{margin-right:auto}
.deck-editor button{min-height:36px;text-transform:none;letter-spacing:0;color:var(--ink)}
.deck-editor button[aria-pressed=true],.deck-editor .deck-primary{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.deck-history button,.deck-secondary button{border-color:transparent;padding-inline:4px;color:var(--muted)}
.deck-secondary{justify-content:space-between}
.deck-segments{gap:0;flex-wrap:nowrap}
.deck-segments button{flex:1;padding-inline:8px}
.deck-segments button+button{margin-left:-1px}
.deck-help{min-height:28px;font-size:11px;line-height:1.5;color:var(--muted)}
.deck-editor .deck-view{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
.deck-view>label{justify-content:space-between}
.deck-view>span{font-size:10px;white-space:normal}
.deck-editor input[type=range]{min-height:28px;min-width:0;accent-color:var(--ink)}
.deck-editor select{font:inherit;background:var(--paper);color:var(--ink);border:1px solid var(--line);padding:7px;min-width:120px}
.deck-editor input[type=checkbox]{accent-color:var(--ink);width:16px;height:16px}
.deck-editor .deck-files{border-top:1px solid var(--line);padding-top:14px}
.deck-files .deck-heading,.deck-files input[type=text],.deck-files .deck-primary{width:100%}
.deck-editor button:focus-visible,.deck-editor select:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
#deck-status{line-height:1.6}
@media(min-width:980px){
 body.lab:has(.deck-editor){--col:100%;grid-template-columns:minmax(0,min(70vh,680px)) 320px;grid-template-rows:auto 1fr;justify-content:center;align-items:start;gap:24px}
 body.lab:has(.deck-editor) header{grid-column:1/-1;width:100%}
 body.lab:has(.deck-editor) .stage-wrap{grid-column:1;align-self:start}
 body.lab:has(.deck-editor) footer{grid-column:2;grid-row:2;align-self:start;width:100%;display:block}
}
@media(max-width:979px){body.lab:has(.deck-editor){--col:min(72vh,100%)}}
`;
document.head.append(tsDeckStyle);

const TS_STROKE_DEFAULT = {
  nodes: [
    {"p":[-0.04080222673328843,0.43526148756203803,0.0032859328889860697],"incoming":[0,0,0],"outgoing":[-0.08350945044832939,-0.12227242248009641,0.19341685099873135]},
    {"p":[-0.27360454670779444,0.0126974860008248,0.010453226322583815],"incoming":[0.05887873832173509,0.14570603432253554,0.16180878882002073],"outgoing":[-0.01360004748626854,-0.0336557650911967,-0.03737524400782762]},
    {"p":[-0.2901613374284877,-0.18764406931497252,-0.1558592965062146],"incoming":[-0.0644226731816615,0.037620555395894116,0.007204096857009064],"outgoing":[0.14589229158714012,-0.0851959219700667,-0.016314476679988945]},
    {"p":[0.2561694510844095,0.3214445273199424,-0.1306995419089663],"incoming":[0.11782521215717823,-0.07591804258241824,0.10035124575821155],"outgoing":[-0.0354966859863446,0.022871496421760198,-0.0302323806068421]},
    {"p":[-0.10410913242244255,-0.15740427359734502,0.17129259601559793],"incoming":[-0.060380046981422894,0.10846833895346117,-0.01637688042310099],"outgoing":[0.052091607194443716,-0.09357876298996422,0.014128806861197447]},
    {"p":[0.34579094836788005,-0.2982521397949939,-0.15675030601822096],"incoming":[0.07821380383094315,0.16689014177948208,-0.009897108012591978],"outgoing":[-0.05485572638528902,-0.11704941462309347,0.0069413968193886575]},
    {"p":[0.08246956875316065,-0.41939774794964296,0.09026792895314402],"incoming":[0.08034827426452423,-0.012799243879966584,-0.06913163133639963],"outgoing":[-0.07004570088039457,0.011158074227702501,0.06026730025365571]},
    {"p":[0.05992059863195422,-0.2943369498843785,0.1272411291548819],"incoming":[-0.11667672032206625,-0.0226020960192512,0.07751029562146042],"outgoing":[0,0,0]}
  ],
  angle: 0.13636251753759865, tilt: 0.11896029733920792,
  view: {"segment":0,"profile":0,"width":0.036,"spacing":0.012,"twist":0,"depth":0.16,"linked":true}
};
const TS_STROKE_CENTER_SHIFT = [0.040417105362635014, 0.02521978772724353, 0.0031483928941764367];
const TS_STROKE_VERTICAL_SHIFT = [-0.0007138354923076059, 0.0026740888955040943, 0.00022466609197656901];
const TS_STROKE_KEY = 'alphabet:ts:stroke:v1';
const tsStrokeAdd = (a,b) => a.map((v,i)=>v+b[i]);
const tsStrokeSub = (a,b) => a.map((v,i)=>v-b[i]);
const tsStrokeMul = (a,k) => a.map(v=>v*k);
const tsStrokeMix = (a,b,t) => a.map((v,i)=>lerp(v,b[i],t));
const tsStrokeUnit = a => tsStrokeMul(a,1/(Math.hypot(...a)||1));
const tsStrokeCross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

function tsStrokeNodes(points) {
  return points.map((p,i)=>{
    const a=points[Math.max(0,i-1)], b=points[Math.min(points.length-1,i+1)];
    const direction=tsStrokeUnit(tsStrokeSub(b,a));
    return {p:[...p], incoming:tsStrokeMul(direction,-Math.hypot(...tsStrokeSub(p,a))/3), outgoing:tsStrokeMul(direction,Math.hypot(...tsStrokeSub(b,p))/3)};
  });
}

function tsStrokeSample() {
  const doc=TS_STROKE_DEFAULT;
  modeState.nodes=structuredClone(doc.nodes);
  modeState.angle=doc.angle;modeState.tilt=doc.tilt;modeState.selected=0;modeState.dirty=true;
}

function tsStrokeDocument() {
  const m=modeState;
  return {nodes:structuredClone(m.nodes),angle:m.angle,tilt:m.tilt};
}

function tsStrokeExport() {
  const document = {format:'alphabet-ts-stroke',version:1,...tsStrokeDocument(),ground,
    view:Object.fromEntries(MODES.stroke.tools.filter(tool=>tool.type!=='button').map(tool=>[tool.key,labValue(tool.key)]))};
  const url=URL.createObjectURL(new Blob([JSON.stringify(document,null,2)],{type:'application/json'}));
  const link=window.document.createElement('a');link.href=url;link.download='ц-росчерк.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function tsStrokeSave() {
  try {localStorage.setItem(TS_STROKE_KEY,JSON.stringify(tsStrokeDocument()));}
  catch { tsStrokeStatus('Не удалось сохранить черновик в браузере.'); }
}

function tsStrokeSetup() {
  Object.assign(modeState,{nodes:[],undo:[],redo:[],selected:0,action:'edit',grab:null,dirty:true,cache:document.createElement('canvas')});
  tsStrokeSample();
  if(!labBare) try {
    const doc=JSON.parse(localStorage.getItem(TS_STROKE_KEY));
    if(doc && Array.isArray(doc.nodes) && doc.nodes.length<=2048 && doc.nodes.every(n=>['p','incoming','outgoing'].every(k=>Array.isArray(n[k])&&n[k].length===3&&n[k].every(Number.isFinite))) && Number.isFinite(doc.angle)&&Number.isFinite(doc.tilt)) {
      if(doc.nodes.length===TS_STROKE_DEFAULT.nodes.length && [TS_STROKE_CENTER_SHIFT,TS_STROKE_VERTICAL_SHIFT].some(shift=>doc.nodes.every((n,i)=>['p','incoming','outgoing'].every(key=>n[key].every((v,k)=>Math.abs(v+(key==='p'?shift[k]:0)-TS_STROKE_DEFAULT.nodes[i][key][k])<1e-12))))) doc.nodes=structuredClone(TS_STROKE_DEFAULT.nodes);
      Object.assign(modeState,doc);
    }
  } catch {}
  tsStrokeUI();
}

function tsStrokeCheckpoint() { modeState.before=tsStrokeDocument(); }
function tsStrokeCommit() {
  const m=modeState;
  if(m.before && JSON.stringify(m.before)!==JSON.stringify(tsStrokeDocument())) {
    m.undo.push(m.before);if(m.undo.length>60)m.undo.shift();m.redo=[];
  }
  m.before=null;m.dirty=true;tsStrokeSave();tsStrokeUI();
}
function tsStrokeUndo(redo=false) {
  const m=modeState,from=redo?m.redo:m.undo,to=redo?m.undo:m.redo;
  if(!from.length)return;
  to.push(tsStrokeDocument());Object.assign(m,from.pop());m.selected=Math.min(m.selected,m.nodes.length-1);m.dirty=true;
  tsStrokeSave();tsStrokeUI();
}

function tsStrokeProject(p) {
  const m=modeState,co=Math.cos(m.angle),si=Math.sin(m.angle),ct=Math.cos(m.tilt),st=Math.sin(m.tilt);
  const x=p[0]*co+p[2]*si,z=-p[0]*si+p[2]*co;
  return {x:.5+x*.95,y:.5-(p[1]*ct-z*st)*.95,z:z*ct+p[1]*st};
}
function tsStrokeUnproject(x,y,z) {
  const m=modeState,co=Math.cos(m.angle),si=Math.sin(m.angle),ct=Math.cos(m.tilt),st=Math.sin(m.tilt);
  const xx=(x-.5)/.95,yy=(.5-y)/.95,zz=z*ct-yy*st;
  return [xx*co-zz*si,yy*ct+z*st,xx*si+zz*co];
}
function tsStrokeBezier(a,b,t) {
  const c=tsStrokeAdd(a.p,a.outgoing),d=tsStrokeAdd(b.p,b.incoming),u=1-t;
  return a.p.map((v,i)=>u*u*u*v+3*u*u*t*c[i]+3*u*t*t*d[i]+t*t*t*b.p[i]);
}
function tsStrokePath() {
  const m=modeState;if(m.raw)return m.raw;
  const path=[];
  for(let i=1;i<m.nodes.length;i++) {
    const a=m.nodes[i-1],b=m.nodes[i];
    const count=Math.max(8,Math.min(80,Math.ceil((Math.hypot(...a.outgoing)+Math.hypot(...b.incoming)+Math.hypot(...tsStrokeSub(b.p,a.p)))/.008)));
    for(let j=0;j<count;j++)path.push(tsStrokeBezier(a,b,j/count));
  }
  if(m.nodes.length)path.push(m.nodes.at(-1).p);
  return path;
}
function tsStrokeResample(path) {
  if(path.length<2)return path;
  const lengths=[0];
  for(let i=1;i<path.length;i++)lengths.push(lengths.at(-1)+Math.hypot(...tsStrokeSub(path[i],path[i-1])));
  const total=lengths.at(-1),count=Math.max(2,Math.min(1800,Math.ceil(total/num('spacing'))));
  const out=[];let j=1;
  for(let i=0;i<=count;i++) {
    const d=total*i/count;while(j<path.length-1&&lengths[j]<d)j++;
    out.push(tsStrokeMix(path[j-1],path[j],(d-lengths[j-1])/(lengths[j]-lengths[j-1]||1)));
  }
  return out;
}

function tsStrokeDraw() {
  const m=modeState;
  if(m.size!==S||m.ground!==ground)m.dirty=true;
  if(m.dirty) {
    ctx.fillStyle=PAPER;ctx.fillRect(0,0,S,S);
    const path=tsStrokeResample(tsStrokePath()),rings=[],faces=[];
    const profile=num('profile'),shape=profile===0?[[-1,-.45],[-.82,-.64],[.82,-.64],[1,-.45],[1,.45],[.82,.64],[-.82,.64],[-1,.45]]
      :profile===1?Array.from({length:12},(_,i)=>[Math.cos(i*Math.PI/6),Math.sin(i*Math.PI/6)]) :[[-1,0],[0,-1],[1,0],[0,1]];
    let normal=null,distance=0;
    for(let i=0;i<path.length;i++) {
      if(i)distance+=Math.hypot(...tsStrokeSub(path[i],path[i-1]));
      const t=tsStrokeUnit(tsStrokeSub(path[Math.min(i+1,path.length-1)],path[Math.max(0,i-1)]));
      if(normal)normal=tsStrokeSub(normal,tsStrokeMul(t,normal.reduce((v,x,j)=>v+x*t[j],0)));
      if(!normal||Math.hypot(...normal)<.001)normal=tsStrokeCross(t,Math.abs(t[2])<.9?[0,0,1]:[0,1,0]);
      normal=tsStrokeUnit(normal);
      const bin=tsStrokeCross(t,normal),angle=distance*num('twist')*5,width=num('width');
      const n=tsStrokeAdd(tsStrokeMul(normal,Math.cos(angle)),tsStrokeMul(bin,Math.sin(angle)));
      const b=tsStrokeAdd(tsStrokeMul(normal,-Math.sin(angle)),tsStrokeMul(bin,Math.cos(angle)));
      rings.push(shape.map(([u,v])=>tsStrokeProject(tsStrokeAdd(path[i],tsStrokeAdd(tsStrokeMul(n,u*width),tsStrokeMul(b,v*width))))));
    }
    const add=(v,shade,wire=false)=>faces.push({v,z:v.reduce((s,p)=>s+p.z,0)/v.length,shade,wire});
    if(num('segment')===0) {
      for(let i=1;i<rings.length;i++)for(let j=0;j<shape.length;j++)add([rings[i-1][j],rings[i-1][(j+1)%shape.length],rings[i][(j+1)%shape.length],rings[i][j]],.64+.28*Math.sin(j*1.9)**2);
      if(rings.length){add(rings[0],.94);add(rings.at(-1),.94);}
    } else for(const ring of rings)add(ring,.86,num('segment')===2);
    faces.sort((a,b)=>a.z-b.z);
    for(const face of faces) {
      ctx.beginPath();face.v.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x*S,p.y*S));ctx.closePath();
      if(!face.wire){ctx.fillStyle=PAPER;ctx.fill();ctx.fillStyle=ink(face.shade);ctx.fill();}
      ctx.strokeStyle=ink(.9);ctx.lineWidth=Math.max(.65,S*.001);ctx.stroke();
      if(!face.wire&&num('segment')===0){ctx.beginPath();ctx.moveTo(face.v[0].x*S,face.v[0].y*S);ctx.lineTo(face.v[1].x*S,face.v[1].y*S);ctx.strokeStyle=PAPER;ctx.lineWidth=.65;ctx.stroke();}
    }
    m.cache.width=canvas.width;m.cache.height=canvas.height;m.cache.getContext('2d').drawImage(canvas,0,0);
    m.size=S;m.ground=ground;m.dirty=false;
  }else ctx.drawImage(m.cache,0,0,S,S);
  if(m.action==='edit'&&!labBare) {
    m.nodes.forEach((node,i)=>{const p=tsStrokeProject(node.p);tsHandle(p.x,p.y,i===m.selected);});
    const node=m.nodes[m.selected];
    if(node)for(const key of ['incoming','outgoing']){
      const p=tsStrokeProject(node.p),q=tsStrokeProject(tsStrokeAdd(node.p,node[key]));
      line(p.x,p.y,q.x,q.y,RED,.001);dot(q.x,q.y,RED,.006);
    }
  }
}

function tsStrokeFit(points,tolerance=.012) {
  const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),segments=[];
  const fit=(first,last,left,right) => {
    const p=points[first],q=points[last],lengths=[0];
    for(let i=first+1;i<=last;i++)lengths.push(lengths.at(-1)+Math.hypot(...tsStrokeSub(points[i],points[i-1])));
    const total=lengths.at(-1)||1,parameters=lengths.map(v=>v/total);
    let result;
    for(let iteration=0;iteration<5;iteration++) {
    let c00=0,c01=0,c11=0,x0=0,x1=0;
    parameters.forEach((t,i)=>{
      const u=1-t,b0=u*u*u,b1=3*u*u*t,b2=3*u*t*t,b3=t*t*t;
      const a=tsStrokeMul(left,b1),b=tsStrokeMul(right,b2);
      const residual=tsStrokeSub(points[first+i],tsStrokeAdd(tsStrokeMul(p,b0+b1),tsStrokeMul(q,b2+b3)));
      c00+=dot(a,a);c01+=dot(a,b);c11+=dot(b,b);x0+=dot(a,residual);x1+=dot(b,residual);
    });
    const determinant=c00*c11-c01*c01,chord=Math.hypot(...tsStrokeSub(q,p));
    let alpha=determinant>1e-12?(x0*c11-x1*c01)/determinant:chord/3;
    let beta=determinant>1e-12?(x1*c00-x0*c01)/determinant:chord/3;
    if(alpha<chord*1e-4||beta<chord*1e-4||alpha>total*2||beta>total*2)alpha=beta=chord/3;
    const a={p,outgoing:tsStrokeMul(left,alpha)},b={p:q,incoming:tsStrokeMul(right,beta)};
    let error=0,split=Math.floor((first+last)/2);
    parameters.forEach((t,i)=>{if(i===0||i===parameters.length-1)return;const d=Math.hypot(...tsStrokeSub(tsStrokeBezier(a,b,t),points[first+i]));if(d>error){error=d;split=first+i;}});
    result={a,b,error,split};
    if(error<=tolerance)break;
    const c=tsStrokeAdd(p,a.outgoing),d=tsStrokeAdd(q,b.incoming);
    const next=parameters.map((t,i)=>{
      if(i===0||i===parameters.length-1)return t;
      const u=1-t,residual=tsStrokeSub(tsStrokeBezier(a,b,t),points[first+i]);
      const firstDerivative=p.map((v,j)=>3*u*u*(c[j]-v)+6*u*t*(d[j]-c[j])+3*t*t*(q[j]-d[j]));
      const secondDerivative=p.map((v,j)=>6*u*(d[j]-2*c[j]+v)+6*t*(q[j]-2*d[j]+c[j]));
      const denominator=dot(firstDerivative,firstDerivative)+dot(residual,secondDerivative);
      const candidate=Math.abs(denominator)>1e-12?t-dot(residual,firstDerivative)/denominator:t;
      return clamp(candidate,parameters[i-1]+1e-8,parameters[i+1]-1e-8);
    });
    if(next.some((v,i)=>i&&v<=next[i-1]))break;
    parameters.splice(0,parameters.length,...next);
    }
    return result;
  };
  const tasks=[{first:0,last:points.length-1,left:tsStrokeUnit(tsStrokeSub(points[1],points[0])),right:tsStrokeUnit(tsStrokeSub(points.at(-2),points.at(-1)))}];
  while(tasks.length) {
    const task=tasks.pop(),{first,last,left,right}=task,result=fit(first,last,left,right);
    if(result.error<=tolerance||last-first<=1){segments.push(result);continue;}
    const split=result.split,tangent=tsStrokeUnit(tsStrokeSub(points[split+1],points[split-1]));
    tasks.push({first:split,last,left:tangent,right},{first,last:split,left,right:tsStrokeMul(tangent,-1)});
  }
  const nodes=segments.map(({a},i)=>({p:[...a.p],incoming:i?segments[i-1].b.incoming:[0,0,0],outgoing:a.outgoing}));
  const end=segments.at(-1).b;nodes.push({p:[...end.p],incoming:end.incoming,outgoing:[0,0,0]});
  return nodes;
}

function tsStrokeSimplify() {
  const m=modeState,path=tsStrokePath(),before=m.nodes.length;
  if(path.length<2)return;
  let nodes,tolerance=.008;
  do {nodes=tsStrokeFit(path,tolerance);tolerance*=1.4;} while(nodes.length>Math.max(2,Math.floor(before*.75))&&tolerance<=.032);
  if(nodes.length>=before){tsStrokeStatus('Узлов уже немного — дальнейшее упрощение заметно изменит рисунок.');return;}
  tsStrokeCheckpoint();m.nodes=nodes;m.selected=0;tsStrokeCommit();
  tsStrokeStatus('Упрощено: '+before+' → '+nodes.length+' · отмена вернёт прежнюю кривую');
}

function tsStrokeRecord() {
  const m=modeState,p=tsStrokeUnproject(pointer.x,pointer.y,0),prev=m.raw.at(-1);
  const d=prev?Math.hypot(p[0]-prev[0],p[1]-prev[1]):0;
  if(prev&&d<.003)return;
  m.distance+=d;p[2]=num('depth')*Math.sin(m.distance*7);m.raw.push(p);m.dirty=true;
}
function tsStrokeDown() {
  const m=modeState;
  if(m.action==='draw') {tsStrokeCheckpoint();m.angle=0;m.tilt=0;m.raw=[];m.distance=0;m.grab={kind:'draw'};tsStrokeRecord();return;}
  if(m.action==='orbit'){tsStrokeCheckpoint();m.grab={kind:'orbit',x:pointer.x,y:pointer.y,angle:m.angle,tilt:m.tilt};return;}
  const hits=[];
  m.nodes.forEach((n,i)=>hits.push({index:i,key:'p',point:n.p}));
  const node=m.nodes[m.selected];
  if(node)for(const key of ['incoming','outgoing'])hits.push({index:m.selected,key,point:tsStrokeAdd(node.p,node[key])});
  let hit=null,best=Math.max(.018,12/S);
  for(const h of hits){const p=tsStrokeProject(h.point),d=Math.hypot(pointer.x-p.x,pointer.y-p.y);if(d<best){best=d;hit={...h,z:p.z};}}
  if(!hit)return;
  tsStrokeCheckpoint();m.selected=hit.index;
  m.grab={kind:'edit',...hit,from:structuredClone(m.nodes[hit.index]),x:pointer.x,y:pointer.y};tsStrokeUI();
}
function tsStrokeMove() {
  const m=modeState,g=m.grab;if(!pointer.down||!g)return;
  if(g.kind==='draw'){tsStrokeRecord();return;}
  if(g.kind==='orbit'){m.angle=g.angle+(pointer.x-g.x)*4;m.tilt=clamp(g.tilt+(pointer.y-g.y)*3,-1.35,1.35);}
  if(g.kind==='edit'){
    const shift=tsStrokeSub(tsStrokeUnproject(pointer.x,pointer.y,g.z),tsStrokeUnproject(g.x,g.y,g.z)),node=m.nodes[g.index];
    if(g.key==='p')node.p=tsStrokeAdd(g.from.p,shift);
    else {node[g.key]=tsStrokeAdd(g.from[g.key],shift);if(on('linked')){const opposite=g.key==='incoming'?'outgoing':'incoming';node[opposite]=tsStrokeMul(tsStrokeUnit(node[g.key]),-Math.hypot(...g.from[opposite]));}}
  }
  m.dirty=true;
}
function tsStrokeUp() {
  const m=modeState;if(!m.grab)return;
  if(m.grab.kind==='draw'){
    tsStrokeRecord();
    if(m.raw.length>1){m.nodes=tsStrokeFit(m.raw);m.selected=0;m.action='edit';}
    else Object.assign(m,m.before);
    m.raw=null;
  }
  m.grab=null;tsStrokeCommit();
}

// De Casteljau: inserting an anchor preserves both halves of the curve exactly.
function tsStrokeInsert() {
  const m=modeState,i=Math.min(m.selected,m.nodes.length-2);if(i<0)return;
  tsStrokeCheckpoint();const a=m.nodes[i],b=m.nodes[i+1],q=tsStrokeAdd(a.p,a.outgoing),r=tsStrokeAdd(b.p,b.incoming);
  const ab=tsStrokeMix(a.p,q,.5),bc=tsStrokeMix(q,r,.5),cd=tsStrokeMix(r,b.p,.5),abc=tsStrokeMix(ab,bc,.5),bcd=tsStrokeMix(bc,cd,.5),p=tsStrokeMix(abc,bcd,.5);
  a.outgoing=tsStrokeSub(ab,a.p);b.incoming=tsStrokeSub(cd,b.p);
  m.nodes.splice(i+1,0,{p,incoming:tsStrokeSub(abc,p),outgoing:tsStrokeSub(bcd,p)});m.selected=i+1;tsStrokeCommit();
}
function tsStrokeStatus(text) {const el=document.getElementById('stroke-status');if(el)el.textContent=text;}
function tsStrokeUI() {
  if(labBare)return;
  renderTools(MODES.stroke);
  const root=document.getElementById('tools'),bar=document.createElement('div');bar.className='stroke-bar';root.prepend(bar);
  const button=(parent,label,action,active)=>{const b=document.createElement('button');b.textContent=label;b.type='button';if(active!==undefined)b.setAttribute('aria-pressed',active);b.onclick=action;parent.append(b);return b;};
  for(const [key,label]of [['draw','рисовать'],['edit','узлы'],['orbit','вращать']])button(bar,label,()=>{modeState.action=key;canvas.style.cursor=key==='orbit'?'grab':'crosshair';tsStrokeUI();},modeState.action===key);
  const history=document.createElement('div');history.className='stroke-bar';bar.after(history);
  button(history,'↶ отмена',()=>tsStrokeUndo()).disabled=!modeState.undo.length;
  button(history,'↷ повтор',()=>tsStrokeUndo(true)).disabled=!modeState.redo.length;
  if(modeState.action==='edit') {
    button(history,'упростить',tsStrokeSimplify).disabled=modeState.nodes.length<3;
    button(history,'+ узел',tsStrokeInsert).disabled=modeState.nodes.length<2;
    button(history,'− узел',()=>{tsStrokeCheckpoint();modeState.nodes.splice(modeState.selected,1);modeState.selected=Math.min(modeState.selected,modeState.nodes.length-1);tsStrokeCommit();}).disabled=modeState.nodes.length<=2;
    const node=modeState.nodes[modeState.selected];
    if(node){const label=document.createElement('label'),input=document.createElement('input');input.type='range';input.min=-.6;input.max=.6;input.step=.005;input.value=node.p[2];input.setAttribute('aria-label','глубина узла');label.textContent='глубина узла · '+node.p[2].toFixed(2);input.oninput=()=>{if(!modeState.before)tsStrokeCheckpoint();node.p[2]=+input.value;label.firstChild.textContent='глубина узла · '+node.p[2].toFixed(2);modeState.dirty=true;};input.onchange=tsStrokeCommit;label.append(input);history.append(label);}
  }
  const help=document.createElement('span');help.id='stroke-status';help.className='stroke-help';
  help.textContent={draw:'Один длинный жест. После отпускания появятся узлы. Новый жест заменяет кривую; отмена вернёт предыдущую.',edit:'Тяните узлы и красные ручки. Глубина узла двигает его в пространство. Черновик сохраняется после жеста.',orbit:'Ведите по холсту, чтобы рассмотреть кривую со всех сторон.'}[modeState.action];root.append(help);
}
const tsStrokeStyle=document.createElement('style');
tsStrokeStyle.textContent='body.lab:has(.stroke-bar){--col:min(64vh,100%)}.stroke-bar{display:flex;flex-wrap:wrap;gap:6px;width:100%;align-items:center}.stroke-help{width:100%;text-transform:none;letter-spacing:0;line-height:1.6}.stroke-bar button{min-height:36px}.stroke-bar label{flex-wrap:wrap}';document.head.append(tsStrokeStyle);

const MODES = {
  stroke: {
    label: 'росчерк', cursor: 'crosshair',
    note: 'Длинный жест становится пространственной кривой Безье. В режиме «узлы» редактируйте точки и ручки; глубина узла задаёт третье измерение. «Вращать» меняет ракурс. Сегмент и сечение меняют объём независимо от линии. Длина жеста не обрезается; плотность отображения ограничена 1800 сечениями.',
    tools: [
      { type:'pick', key:'segment', label:'сегмент', options:['лента','пластины','рамки'], value:TS_STROKE_DEFAULT.view.segment },
      { type:'pick', key:'profile', label:'сечение', options:['плоское','круг','ромб'], value:TS_STROKE_DEFAULT.view.profile },
      { type:'range', key:'width', label:'толщина', min:.008,max:.09,step:.002,value:TS_STROKE_DEFAULT.view.width },
      { type:'range', key:'spacing', label:'шаг', min:.004,max:.06,step:.002,value:TS_STROKE_DEFAULT.view.spacing },
      { type:'range', key:'twist', label:'скрутка', min:0,max:3,step:.1,value:TS_STROKE_DEFAULT.view.twist },
      { type:'range', key:'depth', label:'глубина жеста', min:0,max:.25,step:.01,value:TS_STROKE_DEFAULT.view.depth },
      { type:'toggle', key:'linked', label:'связанные ручки', value:TS_STROKE_DEFAULT.view.linked },
      { type:'button', label:'файл кривой ↓', action:tsStrokeExport },
      { type:'button', label:'образец Ц', action(){tsStrokeCheckpoint();tsStrokeSample();tsStrokeCommit();} },
      { type:'button', label:'вид спереди', action(){tsStrokeCheckpoint();modeState.angle=modeState.tilt=0;tsStrokeCommit();} },
    ],
    setup:tsStrokeSetup,draw:tsStrokeDraw,onDown:tsStrokeDown,onMove:tsStrokeMove,onUp:tsStrokeUp,
    onTool(){modeState.dirty=true;},
    onKey(event,down){if(down&&(event.metaKey||event.ctrlKey)&&event.code==='KeyZ'){event.preventDefault();tsStrokeUndo(event.shiftKey);}},
  },
  ebb: {
    label: 'отлив', cursor: 'grab',
    note: 'Потяните хвост вниз: чёрный просвет проникает в белую массу. Чем сильнее вытяжка, тем быстрее отлив. Отпустите — течение затихнет. Это модель проникновения по полю давления, а не полная симуляция двух жидкостей.',
    tools: [
      { type: 'range', key: 'rate', label: 'отток', min: 1, max: 12, step: 1, value: 6 },
      { type: 'range', key: 'smooth', label: 'связность', min: 0, max: 10, step: 1, value: 5 },
      { type: 'button', label: 'заново', action: () => setMode(current) },
    ],
    setup: tsEbbSetup, step: tsEbbStep, draw: tsEbbDraw,
    onDown: tsGrab, onMove: tsMove, onUp: tsRelease,
  },
  tension: {
    label: 'затяжка', cursor: 'grab',
    note: 'Подхватите хвост и тяните в любую сторону. Нити собираются в складки, просвет меняется вместе с натяжением. Отпустите — ткань расправится. Сильная вытяжка оставляет разрыв. «Заново» восстанавливает целый лист.',
    tools: [
      { type: 'range', key: 'threads', label: 'нити', min: 90, max: 210, step: 10, value: 160 },
      { type: 'range', key: 'elastic', label: 'упругость', min: 4, max: 24, step: 1, value: 12 },
      { type: 'button', label: 'заново', action: () => setMode(current) },
    ],
    setup: tsTensionSetup, step: tsTensionStep, draw: tsTensionDraw,
    onDown: tsGrab, onMove: tsMove, onUp: tsRelease,
  },
  underground: {
    label: 'подполье', cursor: 'crosshair',
    note: 'Ведите пальцем или мышью с зажатой кнопкой. Движение вниз укорачивает стойки, вправо удлиняет хвост. Пройдите под преградой: верх правой стойки должен попасть в верхнее кольцо, конец хвоста — в нижнее. Столкновение или пропущенное кольцо останавливает проход. Это полигон: результат в общий зачёт не идёт.',
    tools: [{ type: 'button', label: 'заново', action: () => setMode(current) }],
    setup: tsUnderSetup, step: tsUnderStep, draw: tsUnderDraw,
    onDown: tsUnderDown, onMove: tsUnderMove, onUp: tsRelease,
  },
  bite: {
    label: 'укус строки', cursor: 'pointer',
    note: 'Нажмите и держите в любом месте поля: хвост рукописной ц раскрывает петлю под строкой. Отпустите, когда внутри бусины. Большой петле нужно больше времени на возврат. Счёт справа: пойманные / упущенные. Это свободный опыт без конца партии и без отправки результата.',
    tools: [{ type: 'button', label: 'заново', action: () => setMode(current) }],
    setup: tsBiteSetup, step: tsBiteStep, draw: tsBiteDraw,
    onDown: tsBiteDown, onUp: tsBiteUp,
  },
  drawing: {
    label: 'вытяжка', cursor: 'grab',
    note: 'Подхватите конец хвоста и ведите по полю. Быстрое движение вытягивает линию, медленное укладывает её петлями. Пока держите, нить продолжает выходить. Отпустите, чтобы остановиться; продолжайте с конца нити. Длина рисунка расходует площадь штрихов Ц. «Снимок» сохраняет композицию, «заново» возвращает материал.',
    tools: [{ type: 'button', label: 'заново', action: () => setMode(current) }],
    setup: tsDrawSetup, step: tsDrawStep, draw: tsDrawRender,
    onDown: tsDrawDown, onMove: tsMove, onUp: tsDrawRelease,
  },
  rubble: {
    label: 'осыпь', cursor: 'grab',
    note: 'Сдвигайте опору под хвостом в сторону. Освобождение зёрен идёт от хвоста по связям буквы: сначала проседает правый край, затем перекладина и стойки. Чем дальше опора, тем быстрее осыпь. Верните её под хвост — новая масса перестанет освобождаться, уже упавшее осядет. Это зерновая модель с управляемым разрушением связей.',
    tools: [{ type: 'button', label: 'заново', action: () => setMode(current) }],
    setup: tsRubbleSetup, step: tsRubbleStep, draw: tsRubbleDraw,
    onDown: tsGrab, onMove: tsRubbleMove, onUp: tsRelease,
  },
  rod: {
    label: 'упругий стержень', cursor: 'grab',
    note: 'Перетаскивайте рукописную ц: из хвоста выходит упругая нить и упирается в пол. Подачу можно остановить кнопкой; жёсткость меняет сопротивление изгибу. Это плоская модель цепочки с ограничениями длины, изгиба и отталкиванием узлов, а не полный расчёт упругого стержня. Запас ограничен 320 узлами.',
    tools: [
      { type: 'toggle', key: 'feed', label: 'подача', value: true },
      { type: 'range', key: 'rate', label: 'скорость', min: 20, max: 180, step: 10, value: 90 },
      { type: 'range', key: 'stiffness', label: 'жёсткость', min: 1, max: 30, step: 1, value: 12 },
      { type: 'button', label: 'заново', action: () => setMode(current) },
    ],
    setup: tsRodSetup, step: tsRodStep, draw: tsRodDraw,
    onDown: tsRodDown, onMove: tsRodMove, onUp: tsRelease,
  },
  formwork: {
    label: 'опалубка', cursor: 'grab',
    note: 'Квадраты и круги стоят на общей плоскости и вытянуты в высоту. Нажмите на тело — оно возьмётся: ручка над крышкой поднимает, ручка на ободе крутит вокруг своей оси, само тело таскается по полю. Поле, боковины и крышки красятся порознь: крышка в цвет поля гасит верх, и объём читается как штрих, а не как коробка. «Свет» гасит разницу в тоне между крышкой и боковиной, «обводка» убирает просветы между гранями — тела сливаются в один силуэт. Ц собрана из четырёх тел: две стойки, перекладина и хвост. Проекция изометрическая, без перспективы и без света.',
    tools: [
      { type: 'pick', key: 'caps', label: 'крышки', options: TS_VOL_PAINTS, value: 2 },
      { type: 'pick', key: 'walls', label: 'боковины', options: TS_VOL_PAINTS, value: 1 },
      { type: 'pick', key: 'field', label: 'поле', options: TS_VOL_PAINTS, value: 0 },
      { type: 'toggle', key: 'edges', label: 'обводка', value: true },
      { type: 'toggle', key: 'light', label: 'свет', value: true },
      { type: 'button', label: 'квадрат', action: () => tsVolAdd('box') },
      { type: 'button', label: 'круг', action: () => tsVolAdd('disc') },
      { type: 'button', label: 'убрать', action: tsVolDrop },
      { type: 'button', label: 'заново', action: () => setMode(current) },
    ],
    setup: tsVolSetup, draw: tsVolDraw,
    onDown: tsVolDown, onMove: tsVolMove, onUp: tsVolUp,
  },
  relief: {
    label: 'рельеф', cursor: 'ns-resize',
    note: 'Поле разбито на квадратные клетки. Клетку нельзя сдвинуть — у неё есть только высота: потяните вверх, и она вырастет столбом, потяните вниз, и она вернётся в пол. Ползунок «поворот» крутит всё поле вокруг вертикали, «сетка» меняет частоту клеток и начинает рельеф заново. Цвет разложен так же, как в опалубке: поле, боковины и крышки порознь, «свет» гасит разницу в тоне между крышкой и боковиной, «обводка» убирает просветы. Стартовый рельеф — Ц, положенная на поле плашмя: изометрия её мнёт, и буква собирается только с одного угла поворота.',
    tools: [
      { type: 'pick', key: 'caps', label: 'крышки', options: TS_VOL_PAINTS, value: 1 },
      { type: 'pick', key: 'walls', label: 'боковины', options: TS_VOL_PAINTS, value: 1 },
      { type: 'pick', key: 'field', label: 'поле', options: TS_VOL_PAINTS, value: 2 },
      { type: 'toggle', key: 'edges', label: 'обводка', value: true },
      { type: 'toggle', key: 'light', label: 'свет', value: true },
      { type: 'range', key: 'turn', label: 'поворот', min: 0, max: 90, step: 1, value: 0 },
      { type: 'range', key: 'grid', label: 'сетка', min: 5, max: 13, step: 1, value: 9 },
      { type: 'button', label: 'заново', action: () => setMode(current) },
    ],
    setup: tsRelSetup, draw: tsRelDraw, onTool: tsRelTool,
    onDown: tsRelDown, onMove: tsRelMove, onUp: tsRelUp,
  },
  decking: {
    label: 'настил', cursor: 'ns-resize',
    note: 'Вытягивайте клетку, задавайте высоту проходом кисти или опускайте в пол. Черновик сохраняется после жеста. Именованные варианты фиксируют форму Ц вместе с ракурсом и оформлением; JSON позволяет перенести рисунок. Оболочка — обратимое представление тех же высот. Масштаб приближает и отдаляет рисунок, сохраняя клетки и высоты.',
    tools: [
      { type: 'range', key: 'zoom', label: 'масштаб', min: 50, max: 200, step: 5, value: 100 },
      { type: 'pick', key: 'caps', label: 'крышки', options: TS_VOL_PAINTS, value: 1 },
      { type: 'pick', key: 'walls', label: 'боковины', options: TS_VOL_PAINTS, value: 1 },
      { type: 'pick', key: 'field', label: 'поле', options: TS_VOL_PAINTS, value: 2 },
      { type: 'toggle', key: 'edges', label: 'обводка', value: false },
      { type: 'toggle', key: 'light', label: 'свет', value: true },
      { type: 'range', key: 'turn', label: 'поворот', min: -180, max: 180, step: 1, value: 0 },
      { type: 'range', key: 'grid', label: 'сетка', min: 5, max: 52, step: 1, value: 13 },
      { type: 'pick', key: 'surface', label: 'форма', options: ['ступени', 'оболочка', 'слои'], value: 0 },
      { type: 'range', key: 'smooth', label: 'смягчение', min: 0, max: 1, step: .05, value: .8 },
    ],
    setup: tsDeckSetup, draw: tsRelDraw, onKey: tsDeckKey,
    onDown: tsDeckDown, onMove: tsDeckMove, onUp: tsDeckUp,
  },
};

canvas.addEventListener('pointercancel', () => {
  pointer.down = false;
  if (current === 'stroke') tsStrokeUp();
  else if (current === 'drawing') tsDrawRelease();
  else if (current === 'formwork') tsVolUp();
  else if (current === 'decking') tsDeckUp();
  else if (current === 'relief') tsRelUp();
  else tsRelease();
  if (current === 'bite') { modeState.charge = 0; modeState.closing = 0; }
});
startLab({ title: 'Ц · материя', modes: MODES, start: 'stroke', ground: 'ink' });
