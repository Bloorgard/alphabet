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
const TS_ISO = { cx: .5, cy: .615, cos: .866, sin: .5, k: .36 };

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

/* Боковины кроются в два слоя: одна полупрозрачная краска пропустила бы
   сквозь себя тело, которое уже лежит сзади. */
function tsVolSkin() {
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.fillStyle = ink(.86);
  ctx.fill();
}

function tsVolSeam() {
  ctx.strokeStyle = paper(.9);
  ctx.lineWidth = Math.max(1, S * .0016);
  ctx.lineJoin = 'miter';
  ctx.stroke();
}

function tsVolBox(f, caps) {
  const plan = tsVolCorners(f);
  const top = plan.map(([x, y]) => tsIsoPoint(x, y, f.h));
  const bot = plan.map(([x, y]) => tsIsoPoint(x, y, 0));
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
    tsVolSkin();
    tsVolSeam();
  }
  ctx.beginPath();
  top.forEach(([X, Y], i) => (i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y)));
  ctx.closePath();
  ctx.fillStyle = caps ? RED : paper();
  ctx.fill();
  tsVolSeam();
}

function tsVolDisc(f, caps) {
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
  tsVolSkin();
  /* Шов виден только на ближней стороне — иначе поворот круга нечем прочесть. */
  if (Math.cos(f.a) + Math.sin(f.a) > 0) {
    const sx = f.x + Math.cos(f.a) * f.r;
    const sy = f.y + Math.sin(f.a) * f.r;
    const a = tsIsoPoint(sx, sy, f.h);
    const b = tsIsoPoint(sx, sy, 0);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    tsVolSeam();
  }
  ctx.beginPath();
  top.forEach(([X, Y], i) => (i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y)));
  ctx.closePath();
  ctx.fillStyle = caps ? RED : paper();
  ctx.fill();
  tsVolSeam();
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

function tsVolDraw() {
  const m = modeState;
  const caps = on('caps');
  if (m.sel >= 0) tsVolGrid();
  const order = m.figs.map((f, i) => i).sort((a, b) => tsVolDepth(m.figs[a]) - tsVolDepth(m.figs[b]));
  for (const i of order) {
    const f = m.figs[i];
    if (f.kind === 'box') tsVolBox(f, caps); else tsVolDisc(f, caps);
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

const MODES = {
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
    note: 'Квадраты и круги стоят на общей плоскости и вытянуты в высоту. Нажмите на тело — оно возьмётся: ручка над крышкой поднимает, ручка на ободе крутит вокруг своей оси, само тело таскается по полю. «Крышки» гасят верхние грани в цвет фона: остаются одни боковины, и объём читается как штрих, а не как коробка. Ц собрана из четырёх тел — две стойки, перекладина и хвост; «заново» возвращает её. Проекция изометрическая, без перспективы и без света.',
    tools: [
      { type: 'toggle', key: 'caps', label: 'крышки', value: true },
      { type: 'button', label: 'квадрат', action: () => tsVolAdd('box') },
      { type: 'button', label: 'круг', action: () => tsVolAdd('disc') },
      { type: 'button', label: 'убрать', action: tsVolDrop },
      { type: 'button', label: 'заново', action: () => setMode(current) },
    ],
    setup: tsVolSetup, draw: tsVolDraw,
    onDown: tsVolDown, onMove: tsVolMove, onUp: tsVolUp,
  },
};

canvas.addEventListener('pointercancel', () => {
  pointer.down = false;
  if (current === 'drawing') tsDrawRelease();
  else if (current === 'formwork') tsVolUp();
  else tsRelease();
  if (current === 'bite') { modeState.charge = 0; modeState.closing = 0; }
});
startLab({ title: 'Ц · материя', modes: MODES, start: 'ebb', ground: 'ink' });
