/* О — лассо. Замкнутый штрих не изображает букву, а отделяет внутри от снаружи:
   пойманная мелочь начинает принадлежать петле и едет вместе с ней. */

const LOOP_NEAR = 0.027;
const LOOP_MIN_POINTS = 14;
const LOOP_MIN_AREA = 0.008;

function loopCenter(points) {
  return points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
}

function finishCenter(points) {
  const center = loopCenter(points);
  return { x: center.x / points.length, y: center.y / points.length };
}

function segmentDistance(point, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = dx * dx + dy * dy || 1;
  const t = clamp(((point.x - from.x) * dx + (point.y - from.y) * dy) / length, 0, 1);
  return Math.hypot(point.x - (from.x + dx * t), point.y - (from.y + dy * t));
}

function loopArea(points) {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

function inLoop(point, points) {
  let inside = false;
  for (let index = 0, last = points.length - 1; index < points.length; last = index, index += 1) {
    const a = points[index];
    const b = points[last];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function drawLoop(points, color, width, closed = true) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x * S, points[0].y * S);
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    ctx.quadraticCurveTo(point.x * S, point.y * S, (point.x + next.x) / 2 * S, (point.y + next.y) / 2 * S);
  }
  if (closed) {
    const last = points[points.length - 1];
    const first = points[0];
    ctx.quadraticCurveTo(last.x * S, last.y * S, first.x * S, first.y * S);
  } else {
    const last = points[points.length - 1];
    ctx.lineTo(last.x * S, last.y * S);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width * S;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function makeMote(index) {
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.006 + Math.random() * 0.018;
  return {
    x: 0.1 + Math.random() * 0.8,
    y: 0.12 + Math.random() * 0.7,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.38,
    kind: index % 3,
    radius: 0.003 + Math.random() * 0.003,
  };
}

function resetLasso() {
  modeState.motes = Array.from({ length: num('motes') }, (_, index) => makeMote(index));
  modeState.loops = [];
  modeState.drawing = null;
  modeState.drag = null;
  modeState.flash = 0;
  modeState.lastCatch = 0;
}

function pullLoop() {
  const points = modeState.drawing;
  if (!points || points.length < LOOP_MIN_POINTS || loopArea(points) < LOOP_MIN_AREA) return false;
  const center = finishCenter(points);
  const caught = modeState.motes.filter((mote) => !mote.loop && inLoop(mote, points));
  const loop = { points, center, motes: caught, pulse: caught.length ? 1 : 0 };
  caught.forEach((mote) => {
    mote.loop = loop;
    mote.dx = mote.x - center.x;
    mote.dy = mote.y - center.y;
    mote.baseAngle = mote.angle;
  });
  modeState.loops.push(loop);
  modeState.lastCatch = caught.length;
  modeState.flash = caught.length ? 0.5 : 0;
  modeState.drawing = null;
  return true;
}

function loopAt(point) {
  for (let index = modeState.loops.length - 1; index >= 0; index -= 1) {
    const loop = modeState.loops[index];
    for (let i = 0; i < loop.points.length; i += 1) {
      if (segmentDistance(point, loop.points[i], loop.points[(i + 1) % loop.points.length]) < LOOP_NEAR) return loop;
    }
  }
  return null;
}

function moveLoop(loop, dx, dy) {
  loop.center.x += dx;
  loop.center.y += dy;
  loop.points.forEach((point) => { point.x += dx; point.y += dy; });
}

function stepMotes() {
  for (const mote of modeState.motes) {
    if (mote.loop) continue;
    mote.x += mote.vx * STEP;
    mote.y += mote.vy * STEP;
    mote.angle += mote.spin * STEP;
    if (mote.x < 0.07 || mote.x > 0.93) mote.vx *= -1;
    if (mote.y < 0.09 || mote.y > 0.87) mote.vy *= -1;
    mote.x = clamp(mote.x, 0.07, 0.93);
    mote.y = clamp(mote.y, 0.09, 0.87);
  }
  modeState.loops.forEach((loop) => { loop.pulse = Math.max(0, loop.pulse - STEP * 1.8); });
  modeState.flash = Math.max(0, modeState.flash - STEP);
}

function drawMote(mote, loop) {
  const x = loop ? loop.center.x + mote.dx : mote.x;
  const y = loop ? loop.center.y + mote.dy : mote.y;
  const angle = loop ? mote.baseAngle : mote.angle;
  ctx.save();
  ctx.translate(x * S, y * S);
  ctx.rotate(angle);
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = 'round';
  if (mote.kind === 0) {
    ctx.beginPath();
    ctx.arc(0, 0, mote.radius * S, 0, Math.PI * 2);
    ctx.fill();
  } else if (mote.kind === 1) {
    ctx.lineWidth = 0.005 * S;
    ctx.beginPath();
    ctx.moveTo(-0.012 * S, 0);
    ctx.lineTo(0.012 * S, 0);
    ctx.stroke();
  } else {
    ctx.lineWidth = 0.004 * S;
    ctx.beginPath();
    ctx.arc(0, 0, 0.008 * S, -Math.PI * 0.72, Math.PI * 0.72);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLasso() {
  modeState.motes.forEach((mote) => drawMote(mote, mote.loop));
  modeState.loops.forEach((loop) => {
    const color = loop.pulse > 0 ? RED : INK;
    drawLoop(loop.points, color, 0.008 + loop.pulse * 0.003);
  });

  if (modeState.drawing) {
    const points = modeState.drawing;
    drawLoop(points, INK, 0.006, false);
    const first = points[0];
    const near = points.length >= LOOP_MIN_POINTS && Math.hypot(pointer.x - first.x, pointer.y - first.y) < LOOP_NEAR;
    dot(first.x, first.y, near ? RED : MUTED, near ? 0.009 : 0.005);
    if (near) drawStatus('замкни', true);
    else drawStatus('веди к началу');
  } else if (modeState.drag) {
    drawStatus('петля в руках');
  } else if (modeState.flash > 0) {
    drawStatus(modeState.lastCatch ? `поймано ${modeState.lastCatch}` : 'пусто', Boolean(modeState.lastCatch));
  } else {
    drawStatus('обведи мелочь');
  }
}

/* ---------- линза: круг меняет поведение того, что в него попало ---------- */

function makeLensMote(index) {
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.003 + Math.random() * 0.012;
  return {
    x: 0.07 + Math.random() * 0.86,
    y: 0.1 + Math.random() * 0.78,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.32,
    kind: index % 3,
    radius: 0.0025 + Math.random() * 0.003,
    inside: false,
    trail: [],
  };
}

function resetLens() {
  modeState.lens = { x: 0.5, y: 0.5, locked: false, pulse: 0, caught: 0 };
  modeState.lensMotes = Array.from({ length: num('motes') }, (_, index) => makeLensMote(index));
}

function lensRadius() { return num('size'); }

function stepLens() {
  const lens = modeState.lens;
  if (!lens.locked && pointer.seen) {
    lens.x = lerp(lens.x, clamp(pointer.x, 0.08, 0.92), 0.24);
    lens.y = lerp(lens.y, clamp(pointer.y, 0.1, 0.88), 0.24);
  }

  const radius = lensRadius();
  let caught = 0;
  for (const mote of modeState.lensMotes) {
    let dx = mote.x - lens.x;
    let dy = mote.y - lens.y;
    const distance = Math.hypot(dx, dy) || 0.0001;
    const inside = distance < radius;
    if (inside) {
      const nx = dx / distance;
      const ny = dy / distance;
      const target = radius * 0.72;
      const pull = (target - distance) * 16;
      const turn = 0.16 + Math.min(0.42, Math.hypot(pointer.x - pointer.px, pointer.y - pointer.py) * 8);
      mote.vx += (nx * pull - ny * turn - mote.vx * 2.5) * STEP;
      mote.vy += (ny * pull + nx * turn - mote.vy * 2.5) * STEP;
      if (!mote.inside) caught += 1;
      if (on('trace')) {
        mote.trail.push({ x: mote.x, y: mote.y });
        if (mote.trail.length > 14) mote.trail.shift();
      }
    } else {
      mote.vx += (Math.random() - 0.5) * 0.004 * STEP;
      mote.vy += (Math.random() - 0.5) * 0.004 * STEP;
      mote.vx *= 0.998;
      mote.vy *= 0.998;
      mote.trail.length = 0;
    }
    mote.inside = inside;
    mote.x += mote.vx * STEP;
    mote.y += mote.vy * STEP;
    mote.angle += mote.spin * STEP;
    if (mote.x < 0.05 || mote.x > 0.95) mote.vx *= -1;
    if (mote.y < 0.08 || mote.y > 0.9) mote.vy *= -1;
    mote.x = clamp(mote.x, 0.05, 0.95);
    mote.y = clamp(mote.y, 0.08, 0.9);
  }
  if (caught) {
    lens.caught = caught;
    lens.pulse = 0.55;
  }
  lens.pulse = Math.max(0, lens.pulse - STEP);
}

function drawLensMote(mote, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  drawMote(mote, null);
  ctx.restore();
}

function drawLens() {
  const lens = modeState.lens;
  const radius = lensRadius();
  modeState.lensMotes.forEach((mote) => drawLensMote(mote, mote.inside ? 0.38 : 1));

  ctx.save();
  ctx.beginPath();
  ctx.arc(lens.x * S, lens.y * S, radius * S, 0, Math.PI * 2);
  ctx.clip();
  if (on('trace')) {
    modeState.lensMotes.forEach((mote) => {
      for (let index = 1; index < mote.trail.length; index += 1) {
        const from = mote.trail[index - 1];
        const to = mote.trail[index];
        line(from.x, from.y, to.x, to.y, ink(0.18), 0.0025);
      }
    });
  }
  modeState.lensMotes.forEach((mote) => { if (mote.inside) drawLensMote(mote); });
  ctx.restore();

  ctx.beginPath();
  ctx.arc(lens.x * S, lens.y * S, radius * S, 0, Math.PI * 2);
  ctx.strokeStyle = lens.pulse > 0 ? RED : INK;
  ctx.lineWidth = (0.007 + lens.pulse * 0.004) * S;
  ctx.stroke();

  if (lens.pulse > 0) drawStatus(`вошло ${lens.caught}`, true);
  else if (lens.locked) drawStatus('окно закреплено');
  else drawStatus('води окном по полю');
}

/* ---------- клеточные автоматы ---------- */

function automatonSize() { return Math.round(num('grid')); }

function automatonCell(point = pointer) {
  const size = automatonSize();
  return {
    x: clamp(Math.floor(point.x * size), 0, size - 1),
    y: clamp(Math.floor(point.y * size), 0, size - 1),
  };
}

function automatonIndex(x, y, size = automatonSize()) { return y * size + x; }

function drawAutomatonGrid(size) {
  ctx.strokeStyle = ink(size > 85 ? 0.055 : 0.075);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let index = 1; index < size; index += 1) {
    const at = Math.round(index / size * S) + 0.5;
    ctx.moveTo(at, 0);
    ctx.lineTo(at, S);
    ctx.moveTo(0, at);
    ctx.lineTo(S, at);
  }
  ctx.stroke();
}

function fillAutomatonCell(x, y, size, color, inset = 0) {
  const cell = S / size;
  ctx.fillStyle = color;
  ctx.fillRect(x * cell + inset, y * cell + inset, cell - inset * 2 + 0.4, cell - inset * 2 + 0.4);
}

function automatonDue() {
  modeState.clock += STEP;
  const interval = 1 / num('rate');
  if (modeState.clock < interval) return false;
  modeState.clock %= interval;
  return true;
}

function orthogonalCount(cells, x, y, size, value = 1) {
  let count = 0;
  if (x > 0 && cells[automatonIndex(x - 1, y, size)] === value) count += 1;
  if (x < size - 1 && cells[automatonIndex(x + 1, y, size)] === value) count += 1;
  if (y > 0 && cells[automatonIndex(x, y - 1, size)] === value) count += 1;
  if (y < size - 1 && cells[automatonIndex(x, y + 1, size)] === value) count += 1;
  return count;
}

function mooreCount(cells, x, y, size, value = 1) {
  let count = 0;
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      if ((!ox && !oy) || x + ox < 0 || y + oy < 0 || x + ox >= size || y + oy >= size) continue;
      if (cells[automatonIndex(x + ox, y + oy, size)] === value) count += 1;
    }
  }
  return count;
}

/* Улам — Уорбертон: новая клетка рождается от одного соседа по стороне,
   однажды родившаяся больше не гаснет. */
function resetCrystal() {
  const size = automatonSize();
  modeState.cells = new Uint8Array(size * size);
  modeState.front = new Uint8Array(size * size);
  modeState.clock = 0;
  modeState.generation = 0;
  modeState.started = false;
  modeState.still = false;
}

function seedCrystal() {
  const size = automatonSize();
  const cell = automatonCell();
  const index = automatonIndex(cell.x, cell.y, size);
  modeState.cells[index] = 1;
  modeState.front.fill(0);
  modeState.front[index] = 1;
  modeState.started = true;
  modeState.still = false;
}

function stepCrystal() {
  if (!modeState.started || modeState.still || !automatonDue()) return;
  const size = automatonSize();
  const next = modeState.cells.slice();
  const front = new Uint8Array(size * size);
  let born = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = automatonIndex(x, y, size);
      if (modeState.cells[index]) continue;
      if (orthogonalCount(modeState.cells, x, y, size) !== 1) continue;
      next[index] = 1;
      front[index] = 1;
      born += 1;
    }
  }
  modeState.cells = next;
  modeState.front = front;
  modeState.generation += 1;
  modeState.still = born === 0;
}

function drawCrystal() {
  const size = automatonSize();
  drawAutomatonGrid(size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = automatonIndex(x, y, size);
      if (!modeState.cells[index]) continue;
      fillAutomatonCell(x, y, size, modeState.front[index] ? RED : INK);
    }
  }
  if (!modeState.started) drawStatus('поставь зерно');
  else drawStatus(`поколение ${modeState.generation}`, !modeState.still);
}

/* Возбуждение → рефрактерный след → тишина. Ортогональное соседство даёт
   ромбический фронт, а временная невосприимчивость сохраняет пустой просвет. */
function resetWave() {
  const size = automatonSize();
  modeState.cells = new Uint8Array(size * size);
  modeState.clock = 0;
  modeState.generation = 0;
  modeState.started = false;
}

function seedWave() {
  const size = automatonSize();
  const cell = automatonCell();
  modeState.cells[automatonIndex(cell.x, cell.y, size)] = 1;
  modeState.started = true;
}

function stepWave() {
  if (!modeState.started || !automatonDue()) return;
  const size = automatonSize();
  const decay = Math.round(num('decay'));
  const next = new Uint8Array(size * size);
  let alive = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = automatonIndex(x, y, size);
      const state = modeState.cells[index];
      if (state === 0) {
        if (orthogonalCount(modeState.cells, x, y, size) > 0) {
          next[index] = 1;
          alive += 1;
        }
      } else if (state <= decay) {
        next[index] = state + 1;
        alive += 1;
      }
    }
  }
  modeState.cells = next;
  modeState.generation += 1;
  if (!alive) modeState.started = false;
}

function drawWave() {
  const size = automatonSize();
  const decay = Math.round(num('decay'));
  drawAutomatonGrid(size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const state = modeState.cells[automatonIndex(x, y, size)];
      if (!state) continue;
      const color = state === 1 ? RED : ink(0.1 + 0.68 * (1 - (state - 2) / Math.max(1, decay - 1)));
      fillAutomatonCell(x, y, size, color);
    }
  }
  drawStatus(modeState.started ? `волна ${modeState.generation}` : 'поставь точку', modeState.started);
}

/* Rule 90 остаётся одномерным, но время идёт от точки наружу. Каждое новое
   поколение раскладывается по следующему радиусу и округляется к клеткам сетки. */
function resetRings() {
  const size = automatonSize();
  modeState.paint = new Int16Array(size * size);
  modeState.paint.fill(-1);
  modeState.row = null;
  modeState.clock = 0;
  modeState.generation = 0;
  modeState.center = null;
  modeState.sectors = 1024;
  modeState.still = false;
}

function paintRing(row, generation) {
  const size = automatonSize();
  const radius = generation;
  for (let sector = 0; sector < row.length; sector += 1) {
    if (!row[sector]) continue;
    const angle = sector / row.length * Math.PI * 2;
    const x = Math.round(modeState.center.x + Math.cos(angle) * radius);
    const y = Math.round(modeState.center.y + Math.sin(angle) * radius);
    if (x < 0 || y < 0 || x >= size || y >= size) continue;
    modeState.paint[automatonIndex(x, y, size)] = generation;
  }
}

function seedRings() {
  resetRings();
  const size = automatonSize();
  modeState.center = automatonCell();
  modeState.paint[automatonIndex(modeState.center.x, modeState.center.y, size)] = 0;
  modeState.row = new Uint8Array(modeState.sectors);
  const symmetry = Math.round(num('symmetry'));
  for (let index = 0; index < symmetry; index += 1) {
    modeState.row[Math.floor(index / symmetry * modeState.sectors)] = 1;
  }
}

function stepRings() {
  if (!modeState.row || modeState.still || !automatonDue()) return;
  const next = new Uint8Array(modeState.sectors);
  let alive = 0;
  for (let index = 0; index < modeState.sectors; index += 1) {
    const left = modeState.row[(index - 1 + modeState.sectors) % modeState.sectors];
    const right = modeState.row[(index + 1) % modeState.sectors];
    next[index] = left ^ right;
    alive += next[index];
  }
  modeState.row = next;
  modeState.generation += 1;
  paintRing(next, modeState.generation);
  const size = automatonSize();
  const edge = Math.max(
    modeState.center.x,
    size - 1 - modeState.center.x,
    modeState.center.y,
    size - 1 - modeState.center.y,
  );
  modeState.still = alive === 0 || modeState.generation > edge * 1.42;
}

function drawRings() {
  const size = automatonSize();
  drawAutomatonGrid(size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const generation = modeState.paint[automatonIndex(x, y, size)];
      if (generation < 0) continue;
      fillAutomatonCell(x, y, size, generation === modeState.generation ? RED : INK);
    }
  }
  if (!modeState.center) drawStatus('поставь центр');
  else drawStatus(`кольцо ${modeState.generation}`, !modeState.still);
}

/* ---------- смесь: независимые автоматы пишут в один постоянный холст ---------- */

const MIX_ALGORITHMS = {
  rings: '90 · xor',
  crystal: 'кристалл · xor',
  wave: 'волна −',
  burst: 'взрыв · xor',
  ant: 'муравей · xor',
  erosion: 'эрозия −',
};

function markMixAlgorithm() {
  const labels = Object.values(MIX_ALGORITHMS);
  document.querySelectorAll('#tools button').forEach((button) => {
    if (!labels.includes(button.textContent)) return;
    button.setAttribute('aria-pressed', String(button.textContent === MIX_ALGORITHMS[modeState.algorithm]));
  });
}

function selectMixAlgorithm(name) {
  modeState.algorithm = name;
  markMixAlgorithm();
}

function compositeMix() {
  const size = automatonSize();
  const composite = new Uint8Array(size * size);
  for (const run of modeState.runs) {
    for (let index = 0; index < run.layer.length; index += 1) {
      if (!run.layer[index]) continue;
      if (run.operation === 'xor') composite[index] ^= 1;
      else if (run.operation === 'add') composite[index] = 1;
      else composite[index] = 0;
    }
  }
  modeState.composite = composite;
}

function mixCell(index) {
  let value = 0;
  for (const run of modeState.runs) {
    if (!run.layer[index]) continue;
    if (run.operation === 'xor') value ^= 1;
    else if (run.operation === 'add') value = 1;
    else value = 0;
  }
  return value;
}

function resetMix() {
  const algorithm = modeState.algorithm || 'rings';
  const size = automatonSize();
  modeState.algorithm = algorithm;
  modeState.runs = [];
  modeState.composite = new Uint8Array(size * size);
  modeState.clock = 0;
  markMixAlgorithm();
}

function undoMix() {
  modeState.runs.pop();
  compositeMix();
}

function newMixRun() {
  const size = automatonSize();
  const center = automatonCell();
  const length = size * size;
  const run = {
    type: modeState.algorithm,
    operation: ['wave', 'erosion'].includes(modeState.algorithm) ? 'erase' : 'xor',
    center,
    generation: 0,
    layer: new Uint8Array(length),
    front: new Uint8Array(length),
    still: false,
  };
  const centerIndex = automatonIndex(center.x, center.y, size);

  if (run.type === 'rings') {
    run.sectors = 1024;
    run.row = new Uint8Array(run.sectors);
    run.symmetry = Math.round(num('symmetry'));
    for (let index = 0; index < run.symmetry; index += 1) {
      run.row[Math.floor(index / run.symmetry * run.sectors)] = 1;
    }
    run.layer[centerIndex] = 1;
    run.front[centerIndex] = 1;
  } else if (run.type === 'ant') {
    run.x = center.x;
    run.y = center.y;
    run.direction = Math.floor(Math.random() * 4);
    run.front[centerIndex] = 1;
  } else if (run.type === 'erosion') {
    run.radius = 0;
    run.threshold = Math.round(num('density'));
    run.front[centerIndex] = 1;
  } else {
    run.cells = new Uint8Array(length);
    run.cells[centerIndex] = 1;
    run.front[centerIndex] = 1;
    run.decay = Math.round(num('decay'));
    if (['crystal', 'burst'].includes(run.type)) run.layer[centerIndex] = 1;
  }

  modeState.runs.push(run);
  compositeMix();
}

function stepMixCrystal(run) {
  const size = automatonSize();
  const next = run.cells.slice();
  const front = new Uint8Array(size * size);
  let born = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = automatonIndex(x, y, size);
      if (run.cells[index] || orthogonalCount(run.cells, x, y, size) !== 1) continue;
      next[index] = 1;
      front[index] = 1;
      run.layer[index] = 1;
      born += 1;
    }
  }
  run.cells = next;
  run.front = front;
  run.generation += 1;
  run.still = born === 0;
}

function stepMixRings(run) {
  const size = automatonSize();
  const next = new Uint8Array(run.sectors);
  const front = new Uint8Array(size * size);
  let alive = 0;
  for (let index = 0; index < run.sectors; index += 1) {
    const left = run.row[(index - 1 + run.sectors) % run.sectors];
    const right = run.row[(index + 1) % run.sectors];
    next[index] = left ^ right;
    alive += next[index];
  }
  run.row = next;
  run.generation += 1;
  for (let sector = 0; sector < run.sectors; sector += 1) {
    if (!next[sector]) continue;
    const angle = sector / run.sectors * Math.PI * 2;
    const x = Math.round(run.center.x + Math.cos(angle) * run.generation);
    const y = Math.round(run.center.y + Math.sin(angle) * run.generation);
    if (x < 0 || y < 0 || x >= size || y >= size) continue;
    const index = automatonIndex(x, y, size);
    run.layer[index] = 1;
    front[index] = 1;
  }
  run.front = front;
  const edge = Math.max(
    run.center.x,
    size - 1 - run.center.x,
    run.center.y,
    size - 1 - run.center.y,
  );
  run.still = alive === 0 || run.generation > edge * 1.42;
}

function stepMixWave(run) {
  const size = automatonSize();
  const next = new Uint8Array(size * size);
  const front = new Uint8Array(size * size);
  const band = run.decay + 5;
  let alive = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = automatonIndex(x, y, size);
      const state = run.cells[index];
      if (state === 0) {
        if (orthogonalCount(run.cells, x, y, size) > 0) {
          next[index] = 1;
          front[index] = 1;
          if (run.generation % band < 2) run.layer[index] = 1;
          alive += 1;
        }
      } else if (state <= run.decay) {
        next[index] = state + 1;
        alive += 1;
      }
    }
  }
  run.cells = next;
  run.front = front;
  run.generation += 1;
  run.still = alive === 0;
}

function stepMixBurst(run) {
  const size = automatonSize();
  const next = new Uint8Array(size * size);
  const front = new Uint8Array(size * size);
  let born = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = automatonIndex(x, y, size);
      if (run.cells[index]) continue;
      if (mooreCount(run.cells, x, y, size) !== 1) continue;
      next[index] = 1;
      front[index] = 1;
      run.layer[index] ^= 1;
      born += 1;
    }
  }
  run.cells = next;
  run.front = front;
  run.generation += 1;
  run.still = born === 0 || run.generation > size * 1.45;
}

function stepMixAnt(run) {
  const size = automatonSize();
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  run.front.fill(0);
  for (let move = 0; move < 4; move += 1) {
    const index = automatonIndex(run.x, run.y, size);
    const black = mixCell(index);
    run.direction = (run.direction + (black ? 3 : 1)) % 4;
    run.layer[index] ^= 1;
    run.x = (run.x + directions[run.direction][0] + size) % size;
    run.y = (run.y + directions[run.direction][1] + size) % size;
    run.front[automatonIndex(run.x, run.y, size)] = 1;
    run.generation += 1;
  }
}

function stepMixErosion(run) {
  const size = automatonSize();
  const before = modeState.composite;
  const front = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (Math.abs(x - run.center.x) + Math.abs(y - run.center.y) !== run.radius) continue;
      const index = automatonIndex(x, y, size);
      front[index] = 1;
      let density = before[index];
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          if ((!ox && !oy) || x + ox < 0 || y + oy < 0 || x + ox >= size || y + oy >= size) continue;
          density += before[automatonIndex(x + ox, y + oy, size)];
        }
      }
      if (density >= run.threshold) run.layer[index] = 1;
    }
  }
  run.front = front;
  run.radius += 1;
  run.generation += 1;
  const edge = Math.max(
    run.center.x + run.center.y,
    run.center.x + size - 1 - run.center.y,
    size - 1 - run.center.x + run.center.y,
    (size - 1 - run.center.x) + (size - 1 - run.center.y),
  );
  run.still = run.radius > edge;
}

function stepMix() {
  if (!modeState.runs.length || !automatonDue()) return;
  for (const run of modeState.runs) {
    if (run.still) {
      run.front.fill(0);
      continue;
    }
    if (run.type === 'crystal') stepMixCrystal(run);
    else if (run.type === 'rings') stepMixRings(run);
    else if (run.type === 'wave') stepMixWave(run);
    else if (run.type === 'burst') stepMixBurst(run);
    else if (run.type === 'ant') stepMixAnt(run);
    else stepMixErosion(run);
  }
  compositeMix();
}

function drawMix() {
  const size = automatonSize();
  drawAutomatonGrid(size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = automatonIndex(x, y, size);
      if (modeState.composite[index]) fillAutomatonCell(x, y, size, INK);
    }
  }
  modeState.runs.forEach((run) => {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (run.front[automatonIndex(x, y, size)]) fillAutomatonCell(x, y, size, RED);
      }
    }
  });
  const active = modeState.runs.filter((run) => !run.still).length;
  drawStatus(`${MIX_ALGORITHMS[modeState.algorithm]} · слоёв ${modeState.runs.length} · фронтов ${active}`, active > 0);
}

/* ---------- жизнь: кольцо-стена держит форму, точки внутри рождают узор ----------
   Кольцо — обычные клетки, но не подчиняются правилу: они считаются соседом для
   остальных (значит влияют на рождение рядом с собой), а их собственное значение
   после каждого шага принудительно возвращается в «живо». Точки внутри разыгрывают
   любое B/S-правило как обычно. */

const LIFE_RULES = {
  life: { label: 'жизнь B3/S23', birth: [3], survival: [2, 3] },
  highlife: { label: 'хайлайф B36/S23', birth: [3, 6], survival: [2, 3] },
  twoByTwo: { label: '2×2 B36/S125', birth: [3, 6], survival: [1, 2, 5] },
  coral: { label: 'коралл B3/S45678', birth: [3], survival: [4, 5, 6, 7, 8] },
};

function ringCells(cx, cy, radius) {
  if (radius <= 0) return [[cx, cy]];
  const steps = Math.max(16, Math.ceil(radius * 8));
  const points = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    points.push([cx + Math.round(radius * Math.cos(angle)), cy + Math.round(radius * Math.sin(angle))]);
  }
  return points;
}

function markLifeRule() {
  const labels = Object.values(LIFE_RULES).map((rule) => rule.label);
  document.querySelectorAll('#tools button').forEach((button) => {
    if (!labels.includes(button.textContent)) return;
    button.setAttribute('aria-pressed', String(button.textContent === modeState.rule.label));
  });
}

function selectLifeRule(name) {
  modeState.rule = LIFE_RULES[name];
  markLifeRule();
}

function clearLifePoints() {
  const size = automatonSize();
  const cells = new Uint8Array(size * size);
  modeState.wall.forEach((key) => {
    const [x, y] = key.split(',').map(Number);
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    cells[automatonIndex(x, y, size)] = 1;
  });
  modeState.cells = cells;
  modeState.front = new Uint8Array(size * size);
  modeState.generation = 0;
  modeState.started = modeState.wall.size > 0;
}

function buildWallRing() {
  const size = automatonSize();
  const radius = Math.round(num('radius'));
  const center = Math.floor(size / 2);
  const wall = new Set();
  ringCells(center, center, radius).forEach(([x, y]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    wall.add(`${x},${y}`);
  });
  modeState.wall = wall;
  clearLifePoints();
}

function resetLife() {
  modeState.wall = modeState.wall || new Set();
  modeState.rule = modeState.rule || LIFE_RULES.life;
  modeState.clock = 0;
  clearLifePoints();
  markLifeRule();
}

function toggleLifeCell() {
  const size = automatonSize();
  const cell = automatonCell();
  const key = `${cell.x},${cell.y}`;
  if (modeState.wall.has(key)) return;
  const index = automatonIndex(cell.x, cell.y, size);
  modeState.cells[index] = modeState.cells[index] ? 0 : 1;
  modeState.started = true;
}

function stepLife() {
  if (!modeState.started || !automatonDue()) return;
  const size = automatonSize();
  const counter = on('vonneumann') ? orthogonalCount : mooreCount;
  const next = new Uint8Array(size * size);
  const front = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = automatonIndex(x, y, size);
      const alive = modeState.cells[index] === 1;
      const count = counter(modeState.cells, x, y, size);
      const allowed = alive ? modeState.rule.survival : modeState.rule.birth;
      const value = allowed.includes(count) ? 1 : 0;
      next[index] = value;
      if (value !== modeState.cells[index]) front[index] = 1;
    }
  }
  modeState.wall.forEach((key) => {
    const [x, y] = key.split(',').map(Number);
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    next[automatonIndex(x, y, size)] = 1;
  });
  modeState.cells = next;
  modeState.front = front;
  modeState.generation += 1;
}

function drawLife() {
  const size = automatonSize();
  drawAutomatonGrid(size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = automatonIndex(x, y, size);
      if (!modeState.cells[index] || modeState.wall.has(`${x},${y}`)) continue;
      fillAutomatonCell(x, y, size, modeState.front[index] ? RED : INK);
    }
  }
  if (!on('hideWall')) {
    modeState.wall.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      fillAutomatonCell(x, y, size, ink(0.3));
    });
  }
  const label = modeState.rule.label;
  drawStatus(modeState.started ? `${label} · поколение ${modeState.generation}` : `${label} · поставь точки`, modeState.started);
}

const MODES = {
  lasso: {
    label: 'лассо',
    note: 'Обведи мелочь одним непрерывным штрихом и вернись к первой точке: замкнутая петля становится О. Потяни её за обод — пойманное поедет вместе с ней.',
    cursor: 'crosshair',
    tools: [
      { type: 'range', key: 'motes', label: 'мелочь', min: 12, max: 60, step: 1, value: 32 },
      { type: 'button', label: 'заново', action: resetLasso },
    ],
    setup() { resetLasso(); },
    step() { stepMotes(); },
    draw() { drawLasso(); },
    onDown() {
      const loop = loopAt(pointer);
      if (loop) {
        modeState.drag = { loop, x: pointer.x, y: pointer.y };
        return;
      }
      modeState.drawing = [{ x: pointer.x, y: pointer.y }];
    },
    onMove() {
      if (modeState.drag) {
        const drag = modeState.drag;
        moveLoop(drag.loop, pointer.x - drag.x, pointer.y - drag.y);
        drag.x = pointer.x;
        drag.y = pointer.y;
        return;
      }
      if (!pointer.down || !modeState.drawing) return;
      const points = modeState.drawing;
      const last = points[points.length - 1];
      if (Math.hypot(pointer.x - last.x, pointer.y - last.y) > 0.006) points.push({ x: pointer.x, y: pointer.y });
    },
    onUp() {
      if (modeState.drag) {
        modeState.drag = null;
        return;
      }
      if (!modeState.drawing) return;
      const first = modeState.drawing[0];
      const closed = modeState.drawing.length >= LOOP_MIN_POINTS
        && Math.hypot(pointer.x - first.x, pointer.y - first.y) < LOOP_NEAR;
      if (closed) pullLoop();
      else modeState.drawing = null;
    },
    onTool(key) { if (key === 'motes') resetLasso(); },
  },
  lens: {
    label: 'линза',
    note: 'Круг следует за курсором. За его границей мелочь начинает стягиваться к ободу и ходить по кругу; щелчок закрепляет окно на месте, следующий — отпускает.',
    cursor: 'none',
    tools: [
      { type: 'range', key: 'size', label: 'размер', min: 0.11, max: 0.29, step: 0.005, value: 0.19 },
      { type: 'range', key: 'motes', label: 'мелочь', min: 18, max: 100, step: 1, value: 56 },
      { type: 'toggle', key: 'trace', label: 'след', value: true },
      { type: 'button', label: 'заново', action: resetLens },
    ],
    setup() { resetLens(); },
    step() { stepLens(); },
    draw() { drawLens(); },
    onDown() {
      modeState.lens.locked = !modeState.lens.locked;
      if (modeState.lens.locked) {
        modeState.lens.x = pointer.x;
        modeState.lens.y = pointer.y;
      }
    },
    onTool(key) { if (key === 'motes') resetLens(); },
  },
  mix: {
    label: 'смесь',
    note: 'Один холст, независимые запуски: Rule 90, кристалл, взрыв и муравей переключают клетки через XOR; волна вырезает полосы, эрозия снимает плотные участки. Выбери действие и ставь новые центры — старые фронты продолжат расти.',
    cursor: 'crosshair',
    tools: [
      { type: 'button', label: MIX_ALGORITHMS.rings, action: () => selectMixAlgorithm('rings') },
      { type: 'button', label: MIX_ALGORITHMS.crystal, action: () => selectMixAlgorithm('crystal') },
      { type: 'button', label: MIX_ALGORITHMS.wave, action: () => selectMixAlgorithm('wave') },
      { type: 'button', label: MIX_ALGORITHMS.burst, action: () => selectMixAlgorithm('burst') },
      { type: 'button', label: MIX_ALGORITHMS.ant, action: () => selectMixAlgorithm('ant') },
      { type: 'button', label: MIX_ALGORITHMS.erosion, action: () => selectMixAlgorithm('erosion') },
      { type: 'range', key: 'grid', label: 'сетка', min: 41, max: 111, step: 2, value: 91 },
      { type: 'range', key: 'rate', label: 'скорость', min: 1, max: 30, step: 1, value: 12 },
      { type: 'range', key: 'symmetry', label: 'симметрия 90', min: 1, max: 12, step: 1, value: 8 },
      { type: 'range', key: 'decay', label: 'шаг волны', min: 2, max: 14, step: 1, value: 7 },
      { type: 'range', key: 'density', label: 'порог эрозии', min: 2, max: 9, step: 1, value: 5 },
      { type: 'button', label: 'отменить', action: undoMix },
      { type: 'button', label: 'очистить', action: resetMix },
    ],
    setup() { resetMix(); },
    step() { stepMix(); },
    draw() { drawMix(); },
    onDown() { newMixRun(); },
    onTool(key) { if (key === 'grid') resetMix(); },
  },
  crystal: {
    label: 'кристалл',
    note: 'Улам — Уорбертон: пустая клетка рождается, если ровно одна соседняя по стороне уже занята. Щелчки добавляют новые зёрна; красным показан текущий фронт роста.',
    cursor: 'crosshair',
    tools: [
      { type: 'range', key: 'grid', label: 'сетка', min: 41, max: 111, step: 2, value: 81 },
      { type: 'range', key: 'rate', label: 'скорость', min: 1, max: 30, step: 1, value: 10 },
      { type: 'button', label: 'очистить', action: resetCrystal },
    ],
    setup() { resetCrystal(); },
    step() { stepCrystal(); },
    draw() { drawCrystal(); },
    onDown() { seedCrystal(); },
    onTool(key) { if (key === 'grid') resetCrystal(); },
  },
  wave: {
    label: 'волна',
    note: 'Точка возбуждает соседние клетки, затем каждая проходит рефрактерный след и снова становится пустой. Новые точки можно ставить во время движения — фронты встретятся и разрежут друг друга.',
    cursor: 'crosshair',
    tools: [
      { type: 'range', key: 'grid', label: 'сетка', min: 41, max: 111, step: 2, value: 81 },
      { type: 'range', key: 'rate', label: 'скорость', min: 1, max: 30, step: 1, value: 14 },
      { type: 'range', key: 'decay', label: 'след', min: 2, max: 14, step: 1, value: 7 },
      { type: 'button', label: 'очистить', action: resetWave },
    ],
    setup() { resetWave(); },
    step() { stepWave(); },
    draw() { drawWave(); },
    onDown() { seedWave(); },
    onTool(key) { if (key === 'grid') resetWave(); },
  },
  rings: {
    label: 'кольца 90',
    note: 'Rule 90: новая клетка равна XOR левого и правого соседа, но поколения расходятся от точки радиусами. Симметрия размножает начальный импульс и собирает из треугольного автомата пиксельную О.',
    cursor: 'crosshair',
    tools: [
      { type: 'range', key: 'grid', label: 'сетка', min: 41, max: 111, step: 2, value: 91 },
      { type: 'range', key: 'rate', label: 'скорость', min: 1, max: 30, step: 1, value: 12 },
      { type: 'range', key: 'symmetry', label: 'симметрия', min: 1, max: 12, step: 1, value: 8 },
      { type: 'button', label: 'очистить', action: resetRings },
    ],
    setup() { resetRings(); },
    step() { stepRings(); },
    draw() { drawRings(); },
    onDown() { seedRings(); },
    onTool(key) { if (key === 'grid' || key === 'symmetry') resetRings(); },
  },
  life: {
    label: 'жизнь',
    note: 'Кольцо-стена не подчиняется правилу и никогда не гаснет, но считается соседом для остальных клеток — рядом с ним рождение идёт иначе, чем в пустоте. Точки внутри играют по выбранному B/S; подбери правило и радиус, чтобы узор держался в форме, а не расползался.',
    cursor: 'crosshair',
    tools: [
      { type: 'button', label: LIFE_RULES.life.label, action: () => selectLifeRule('life') },
      { type: 'button', label: LIFE_RULES.highlife.label, action: () => selectLifeRule('highlife') },
      { type: 'button', label: LIFE_RULES.twoByTwo.label, action: () => selectLifeRule('twoByTwo') },
      { type: 'button', label: LIFE_RULES.coral.label, action: () => selectLifeRule('coral') },
      { type: 'range', key: 'grid', label: 'сетка', min: 41, max: 111, step: 2, value: 91 },
      { type: 'range', key: 'rate', label: 'скорость', min: 1, max: 30, step: 1, value: 10 },
      { type: 'range', key: 'radius', label: 'радиус кольца', min: 4, max: 50, step: 1, value: 28 },
      { type: 'button', label: 'кольцо по центру', action: buildWallRing },
      { type: 'toggle', key: 'hideWall', label: 'скрыть кольцо', value: false },
      { type: 'toggle', key: 'vonneumann', label: 'фон Нейман', value: false },
      { type: 'button', label: 'очистить точки', action: clearLifePoints },
    ],
    setup() { resetLife(); },
    step() { stepLife(); },
    draw() { drawLife(); },
    onDown() { toggleLifeCell(); },
    onTool(key) { if (key === 'grid') resetLife(); },
  },
};

startLab({
  title: 'О · контур, окно, рост',
  modes: MODES,
  start: 'lasso',
});
