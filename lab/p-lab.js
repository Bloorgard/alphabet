/* П · скребок в песке. Физика — перенесённый без изменений движок из
   /Users/pustota/projects/sand (engine/sand.js): карта высот, скребок сдвигает
   материал по нормали, зёрна срываются с кромки. Только цвет здесь берётся из
   ink()/paper() каркаса вместо зашитых констант — чтобы работало с фоном.

   Автор рисует букву от руки, «зафиксировать сцену» сохраняет карту высот в
   файл: она станет затравкой стола для настоящего модуля буквы, а посетитель
   сайта будет дальше рисовать поверх что угодно. */

const SandEngine = (function () {
  'use strict';

  const DEFAULTS = {
    cell: 4,
    talus: 2.05,
    relax: 0.24,
    settle: 0.17,
    cohesion: 3.5,
    blade: 60,
    dust: 0.35,
    spray: 0.3,
    hold: 26,
    pour: 2600,
    freeMass: 0.05,
    maxFree: 9000,
    yield: 'mc',
  };

  function hash(x, y) {
    let h = (x | 0) * 374761393 + (y | 0) * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }

  const NEIGHBOUR = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  const DIAGONAL = [1, 1, 1, 1, 1.41, 1.41, 1.41, 1.41];

  function create(widthPx, heightPx, options) {
    const params = Object.assign({}, DEFAULTS, options);
    const cell = params.cell;

    let cols = 0, rows = 0;
    let field = null;
    let loose = null;
    let clearedAt = null;
    let wall = null;
    let wallDirty = false;
    let frameNo = 0;

    const free = {
      x: new Float32Array(params.maxFree),
      y: new Float32Array(params.maxFree),
      vx: new Float32Array(params.maxFree),
      vy: new Float32Array(params.maxFree),
      count: 0,
    };

    let liveX0 = 0, liveY0 = 0, liveX1 = -1, liveY1 = -1;

    function resize(nextWidthPx, nextHeightPx) {
      const prevField = field, prevCols = cols, prevRows = rows;
      cols = Math.ceil(nextWidthPx / cell);
      rows = Math.ceil(nextHeightPx / cell);
      field = new Float32Array(cols * rows);
      loose = new Float32Array(cols * rows);
      clearedAt = new Int32Array(cols * rows).fill(-9999);
      wall = new Uint8Array(cols * rows);
      wallDirty = false;
      free.count = 0;

      liveX0 = 0; liveY0 = 0; liveX1 = -1; liveY1 = -1;
      if (prevField) {
        const w = Math.min(prevCols, cols), h = Math.min(prevRows, rows);
        for (let y = 0; y < h; y++)
          field.set(prevField.subarray(y * prevCols, y * prevCols + w), y * cols);
        for (let i = 0; i < field.length; i++) if (field[i] > 0) loose[i] = 1;
        touchArea(1, 1, w - 1, h - 1);
      }

      engine.cols = cols;
      engine.rows = rows;
      engine.field = field;
    }

    function adopt(source, sourceCols, sourceRows) {
      const w = Math.min(sourceCols, cols), h = Math.min(sourceRows, rows);
      for (let y = 0; y < h; y++)
        field.set(source.subarray(y * sourceCols, y * sourceCols + w), y * cols);
      for (let i = 0; i < field.length; i++) if (field[i] > 0) loose[i] = 1;
      touchArea(1, 1, w - 1, h - 1);
    }

    function clear() {
      field.fill(0); loose.fill(0); clearedAt.fill(-9999);
      wall.fill(0); wallDirty = false; free.count = 0;
      liveX0 = 0; liveY0 = 0; liveX1 = -1; liveY1 = -1;
    }

    function mass() {
      let s = 0;
      for (let i = 0; i < field.length; i++) s += field[i];
      return s + free.count * params.freeMass;
    }

    function pile(xPx, yPx, radiusPx, peak) {
      const cx = xPx / cell, cy = yPx / cell, r = radiusPx / cell;
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(cols - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(rows - 1, Math.ceil(cy + r));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x - cx, y - cy) / r;
          if (d >= 1) continue;
          field[y * cols + x] += peak * (1 - d * d) * (0.85 + hash(x, y) * 0.3);
          loose[y * cols + x] = 1;
        }
      touchArea(x0, y0, x1, y1);
    }

    function pour(xPx, yPx, dt) {
      const amount = params.pour * dt;
      const cx = xPx / cell, cy = yPx / cell, spread = 9 / cell;
      const drops = 14;
      for (let i = 0; i < drops; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * spread;
        const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
        if (x < 1 || y < 1 || x >= cols - 1 || y >= rows - 1) continue;
        field[y * cols + x] += amount / drops;
        loose[y * cols + x] = 1;
        touch(x, y);
      }
    }

    function stampWall(xPx, yPx, prevXPx, prevYPx, angleDeg, lengthPx, down) {
      if (wallDirty) { wall.fill(0); wallDirty = false; }
      if (!down) return;
      const a = angleDeg * Math.PI / 180;
      const ux = Math.cos(a), uy = Math.sin(a);
      let nx = -uy, ny = ux;
      const mvx = xPx - prevXPx, mvy = yPx - prevYPx;
      if (mvx * nx + mvy * ny < 0) { nx = -nx; ny = -ny; }
      const half = lengthPx * 0.5 / cell;
      const cx = xPx / cell, cy = yPx / cell;
      for (let l = -half; l <= half; l += 0.4) {
        for (let d = -1.2; d <= -0.2; d += 0.5) {
          const x = Math.round(cx + ux * l + nx * d), y = Math.round(cy + uy * l + ny * d);
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          wall[y * cols + x] = 1;
          wallDirty = true;
        }
      }
    }

    function deposit(fx, fy, amount) {
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      if (x0 < 1 || y0 < 1 || x0 >= cols - 2 || y0 >= rows - 2) return;
      const tx = fx - x0, ty = fy - y0;
      const i = y0 * cols + x0;
      const w0 = (1 - tx) * (1 - ty), w1 = tx * (1 - ty);
      const w2 = (1 - tx) * ty, w3 = tx * ty;
      field[i] += amount * w0;            loose[i] = 1;
      field[i + 1] += amount * w1;        loose[i + 1] = 1;
      field[i + cols] += amount * w2;     loose[i + cols] = 1;
      field[i + cols + 1] += amount * w3; loose[i + cols + 1] = 1;
      touchArea(x0, y0, x0 + 1, y0 + 1);
    }

    function blade(ax, ay, bx, by, angleDeg, lengthPx) {
      const mvx = bx - ax, mvy = by - ay;
      const dist = Math.hypot(mvx, mvy);
      if (dist < 0.3) return;

      const a = angleDeg * Math.PI / 180;
      const ux = Math.cos(a), uy = Math.sin(a);
      let nx = -uy, ny = ux;
      const front = (mvx * nx + mvy * ny) >= 0 ? 1 : -1;
      nx *= front; ny *= front;

      const half = lengthPx * 0.5 / cell;
      const steps = Math.max(1, Math.ceil(dist / cell * 2));
      const speed = dist / steps;

      const bladeHeight = params.blade;
      const advance = (mvx * nx + mvy * ny) / cell / steps;
      if (advance < 0.02) return;
      const reach = advance + 1.0;

      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const cx = (ax + mvx * t) / cell, cy = (ay + mvy * t) / cell;
        for (let l = -half; l <= half; l += 0.34) {
          const bxp = cx + ux * l, byp = cy + uy * l;
          let carried = 0;

          for (let d = -reach; d <= -0.1; d += 0.34) {
            const sx = Math.round(bxp + nx * d), sy = Math.round(byp + ny * d);
            if (sx < 1 || sy < 1 || sx >= cols - 1 || sy >= rows - 1) continue;
            const si = sy * cols + sx;
            const have = field[si];
            if (have < 1e-5) continue;
            field[si] = 0;
            clearedAt[si] = frameNo;
            carried += have;
            touch(sx, sy);

            if (free.count < params.maxFree - 1 && carried > params.freeMass &&
                Math.random() < 0.16 * params.spray) {
              carried -= params.freeMass;
              const n = free.count;
              free.x[n] = sx * cell; free.y[n] = sy * cell;
              const sp = 0.5 + Math.random() * speed * 0.8;
              const sc = (Math.random() - 0.5) * 1.6;
              free.vx[n] = nx * sp + ux * sc;
              free.vy[n] = ny * sp + uy * sc;
              free.count++;
            }
          }

          if (carried <= 0) continue;

          let left = carried;
          for (let f = 1.3; f <= 12 && left > 1e-5; f += 1) {
            const tx = bxp + nx * f, ty = byp + ny * f;
            const ix = Math.round(tx), iy = Math.round(ty);
            if (ix < 1 || iy < 1 || ix >= cols - 2 || iy >= rows - 2) break;
            const room = bladeHeight - field[iy * cols + ix];
            if (room <= 0) continue;
            const push = Math.min(left, room);
            deposit(tx, ty, push);
            left -= push;
          }
          if (left > 1e-5) deposit(bxp - nx * 1.4, byp - ny * 1.4, left);
        }
      }
    }

    const share = new Float64Array(8);

    function touch(x, y) {
      if (liveX1 < liveX0) { liveX0 = liveX1 = x; liveY0 = liveY1 = y; return; }
      if (x < liveX0) liveX0 = x; else if (x > liveX1) liveX1 = x;
      if (y < liveY0) liveY0 = y; else if (y > liveY1) liveY1 = y;
    }

    function touchArea(x0, y0, x1, y1) {
      touch(Math.max(1, x0 | 0), Math.max(1, y0 | 0));
      touch(Math.min(cols - 2, Math.ceil(x1)), Math.min(rows - 2, Math.ceil(y1)));
    }

    function relax() {
      const talus = params.talus, k = params.relax, hold = params.hold;
      const coh = params.cohesion;
      const mohr = params.yield === 'mc';
      const decay = 1 - params.settle;
      if (liveX1 < liveX0) return;
      const x0 = Math.max(1, liveX0 - 1), x1 = Math.min(cols - 2, liveX1 + 1);
      const y0 = Math.max(1, liveY0 - 1), y1 = Math.min(rows - 2, liveY1 + 1);
      let nx0 = cols, ny0 = rows, nx1 = -1, ny1 = -1;

      for (let pass = 0; pass < 2; pass++) {
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const i = y * cols + x;
            if (wall[i]) continue;
            const h = field[i];
            if (h < 1e-3) continue;
            const live = loose[i];
            if (live < 0.02) continue;
            if (x < nx0) nx0 = x; if (x > nx1) nx1 = x;
            if (y < ny0) ny0 = y; if (y > ny1) ny1 = y;
            let crit, mobile;
            if (mohr) {
              crit = talus + coh / (h + 0.5);
              mobile = h;
            } else {
              crit = talus;
              mobile = h - coh;
              if (mobile <= 0) continue;
            }
            const kk = k * live;

            let total = 0;
            for (let n = 0; n < 8; n++) {
              const idx = i + NEIGHBOUR[n][0] + NEIGHBOUR[n][1] * cols;
              if (wall[idx] || frameNo - clearedAt[idx] <= hold) { share[n] = 0; continue; }
              const d = (h - field[idx]) - crit * DIAGONAL[n];
              share[n] = d > 0 ? d : 0;
              total += share[n];
            }
            if (total <= 0) continue;
            const give = Math.min(mobile, total * kk) / total;
            for (let n = 0; n < 8; n++) {
              if (share[n] <= 0) continue;
              const idx = i + NEIGHBOUR[n][0] + NEIGHBOUR[n][1] * cols;
              const m = share[n] * give;
              field[i] -= m;
              field[idx] += m;
              loose[idx] = 1;
            }
          }
        }
      }
      liveX0 = nx0; liveY0 = ny0; liveX1 = nx1; liveY1 = ny1;

      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) loose[y * cols + x] *= decay;
      collapseDust(x0, y0, x1, y1);
    }

    function collapseDust(x0, y0, x1, y1) {
      const dust = params.dust;
      if (dust <= 0) return;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * cols + x;
          const h = field[i];
          if (h <= 0 || h >= dust) continue;
          let best = -1, bestH = 0;
          const n0 = field[i - 1], n1 = field[i + 1];
          const n2 = field[i - cols], n3 = field[i + cols];
          if (n0 > bestH) { bestH = n0; best = i - 1; }
          if (n1 > bestH) { bestH = n1; best = i + 1; }
          if (n2 > bestH) { bestH = n2; best = i - cols; }
          if (n3 > bestH) { bestH = n3; best = i + cols; }
          if (best < 0 || bestH < dust) continue;
          field[best] += h;
          field[i] = 0;
        }
      }
    }

    function stepFree() {
      let alive = 0;
      for (let i = 0; i < free.count; i++) {
        const x = free.x[i] + free.vx[i], y = free.y[i] + free.vy[i];
        const vx = free.vx[i] * 0.82, vy = free.vy[i] * 0.82;
        let cx = (x / cell) | 0, cy = (y / cell) | 0;
        const out = cx < 1 || cy < 1 || cx >= cols - 1 || cy >= rows - 1;
        if (out || Math.hypot(vx, vy) < 0.22) {
          if (cx < 1) cx = 1; else if (cx > cols - 2) cx = cols - 2;
          if (cy < 1) cy = 1; else if (cy > rows - 2) cy = rows - 2;
          field[cy * cols + cx] += params.freeMass;
          loose[cy * cols + cx] = 1;
          touch(cx, cy);
          continue;
        }
        free.x[alive] = x; free.y[alive] = y;
        free.vx[alive] = vx; free.vy[alive] = vy;
        alive++;
      }
      free.count = alive;
    }

    function tick() {
      frameNo++;
      relax();
      stepFree();
    }

    const engine = {
      params, cell, free,
      cols: 0, rows: 0, field: null,
      resize, adopt, clear, mass, pile, pour,
      stampWall, blade, relax, stepFree, tick,
    };

    resize(widthPx, heightPx);
    return engine;
  }

  return { create, DEFAULTS };
})();

/* ---------- полигон ---------- */

const SAND_STORE_KEY = 'alphabet-lab-p-sand-v1';

let sandEngine = null;
let sandInitialized = false;
let sandLastS = 0;
let sandTarget = null;
let sandSaveTimer = 0;
let sandAngleField = null;
let sandLengthField = null;
let sandGrainField = null;

/* Ползунок с клавишами живут рядом, не вместо друг друга: на телефоне
   клавиш нет вовсе, а мышь иногда удобнее держать одной рукой без QE. */
function sandCaptureFields() {
  const inputs = labToolsBar.querySelectorAll('input[type=range]');
  sandAngleField = inputs[0] ? { input: inputs[0], output: inputs[0].nextElementSibling } : null;
  sandLengthField = inputs[1] ? { input: inputs[1], output: inputs[1].nextElementSibling } : null;
  sandGrainField = inputs[2] ? { input: inputs[2], output: inputs[2].nextElementSibling } : null;
}

function sandSyncField(field, value, format) {
  if (!field) return;
  field.input.value = value;
  if (field.output) field.output.value = format(value);
}

function sandSetAngle(value) {
  toolValues[slot('angle')] = value;
  sandSyncField(sandAngleField, value, (v) => String(Math.round(v)));
}

function sandSetLength(value) {
  toolValues[slot('length')] = value;
  sandSyncField(sandLengthField, value, (v) => v.toFixed(3));
}

/* Отмена — по шагу, а не по кадру: снимок кладётся перед жестом (перед
   мазком, перед струёй, перед очисткой), а не на каждый кадр осыпания —
   иначе Ctrl/Cmd+Z откатывал бы на долю секунды взад, а не к прошлой форме. */
const SAND_HISTORY_LIMIT = 20;
let sandHistory = [];

function sandPushHistory() {
  sandHistory.push({ cols: sandEngine.cols, rows: sandEngine.rows, field: sandEngine.field.slice() });
  if (sandHistory.length > SAND_HISTORY_LIMIT) sandHistory.shift();
}

function sandUndo() {
  const snap = sandHistory.pop();
  if (!snap) return;
  sandEngine.clear();
  sandEngine.adopt(snap.field, snap.cols, snap.rows);
  sandScheduleSave();
}

function sandLoadSaved() {
  try {
    const raw = localStorage.getItem(SAND_STORE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !data.cols || !data.rows) return false;
    sandEngine.adopt(Float32Array.from(data.field), data.cols, data.rows);
    return true;
  } catch (error) { return false; }
}

function sandSaveNow() {
  try {
    localStorage.setItem(SAND_STORE_KEY, JSON.stringify({
      cols: sandEngine.cols, rows: sandEngine.rows,
      field: Array.from(sandEngine.field),
    }));
  } catch (error) { /* стол не влезает в хранилище — просто не сохраняем */ }
}

function sandScheduleSave() {
  clearTimeout(sandSaveTimer);
  sandSaveTimer = setTimeout(sandSaveNow, 500);
}

function sandExportSeed() {
  const payload = JSON.stringify({
    cols: sandEngine.cols, rows: sandEngine.rows, cell: sandEngine.cell,
    field: Array.from(sandEngine.field),
  });
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = 'p-seed.json';
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

/* Цвет — не константа, а перепад между paper() и ink() текущей темы: плотнее
   песок, ближе к ink. Пакуется в ABGR под Uint32Array поверх ImageData. */
function sandColorFor(t) {
  const paperRgb = labGrounds[ground].field;
  const inkRgb = labGrounds[ground].mark;
  const r = Math.round(paperRgb[0] + (inkRgb[0] - paperRgb[0]) * t);
  const g = Math.round(paperRgb[1] + (inkRgb[1] - paperRgb[1]) * t);
  const b = Math.round(paperRgb[2] + (inkRgb[2] - paperRgb[2]) * t);
  return (255 << 24) | (b << 16) | (g << 8) | r;
}

/* Тон по уклону поля, не по одной высоте: одна и та же насыпь светлее со
   стороны, откуда «падает» свет (северо-запад), и темнее с другой — отсюда
   ощущение объёма, а не плоского пятна плотности. Геометрия не меняется,
   меняется только штриховка. */
function sandTone(gx, gy) {
  const v = 0.5 - (gx + gy) * 0.42;
  return v < 0.16 ? 0.16 : v > 1 ? 1 : v;
}

function sandHash(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function sandEnsureTarget(widthPx, heightPx) {
  if (sandTarget && sandTarget.width === widthPx && sandTarget.height === heightPx) return sandTarget;
  const image = ctx.createImageData(widthPx, heightPx);
  sandTarget = { image, pixels: new Uint32Array(image.data.buffer), width: widthPx, height: heightPx };
  return sandTarget;
}

function drawSandField() {
  const widthPx = Math.max(1, Math.round(S * dpr));
  const heightPx = Math.max(1, Math.round(S * dpr));
  const target = sandEnsureTarget(widthPx, heightPx);
  const px = target.pixels;
  px.fill(sandColorFor(0));

  const field = sandEngine.field, cols = sandEngine.cols, rows = sandEngine.rows;
  const grain = num('grain');
  const grainPx = Math.max(2, Math.round(grain * dpr * 0.85));
  const nx = Math.ceil(target.width / (grain * dpr));
  const ny = Math.ceil(target.height / (grain * dpr));
  const k = grain / sandEngine.cell;

  for (let y = 0; y < ny; y++) {
    const fy = y * k;
    const y0 = fy | 0, ty = fy - y0;
    if (y0 < 1 || y0 >= rows - 2) continue;
    for (let x = 0; x < nx; x++) {
      const fx = x * k;
      const x0 = fx | 0, tx = fx - x0;
      if (x0 < 1 || x0 >= cols - 2) continue;
      const i = y0 * cols + x0;
      const h = field[i] * (1 - tx) * (1 - ty) + field[i + 1] * tx * (1 - ty)
              + field[i + cols] * (1 - tx) * ty + field[i + cols + 1] * tx * ty;
      if (h < 0.015) continue;
      const gx0 = (fx * 10) | 0, gy0 = (fy * 10) | 0;
      if (h < 0.9 && sandHash(gx0, gy0) > h / 0.9) continue;

      const jx = (sandHash(gx0 + 7919, gy0) - 0.5) * grain * 1.15;
      const jy = (sandHash(gx0, gy0 + 104729) - 0.5) * grain * 1.15;
      const xi = Math.round((x * grain + jx) * dpr);
      const yi = Math.round((y * grain + jy) * dpr);
      if (xi < 0 || yi < 0 || xi + grainPx > target.width || yi + grainPx > target.height) continue;
      const gx = field[i + 1] - field[i - 1];
      const gy = field[i + cols] - field[i - cols];
      const color = sandColorFor(sandTone(gx, gy));
      for (let dy = 0; dy < grainPx; dy++) {
        const row = (yi + dy) * target.width + xi;
        for (let dx = 0; dx < grainPx; dx++) px[row + dx] = color;
      }
    }
  }

  const free = sandEngine.free;
  const grainColor = sandColorFor(1);
  for (let i = 0; i < free.count; i++) {
    const xi = Math.round(free.x[i] * dpr), yi = Math.round(free.y[i] * dpr);
    if (xi < 0 || yi < 0 || xi + grainPx > target.width || yi + grainPx > target.height) continue;
    for (let dy = 0; dy < grainPx; dy++) {
      const row = (yi + dy) * target.width + xi;
      for (let dx = 0; dx < grainPx; dx++) px[row + dx] = grainColor;
    }
  }

  target.ctx = ctx;
  ctx.putImageData(target.image, 0, 0);
}

/* Скорость осыпания под зажатой кнопкой почти нулевая — иначе только что
   расчищенная полоса успевает подёрнуться обратно ещё до конца жеста. Это
   не убирает проблему целиком (см. lab/labs.js и спеку sand-проекта, раздел
   «Открытые вопросы» — там она открыта и без нас), а сужает её до момента
   между жестами, когда досыпание уже не портит форму на глазах. */
const SAND_RELAX_DRAG = 0.015;
const SAND_RELAX_IDLE = SandEngine.DEFAULTS.relax;

function sandSetup() {
  if (!sandEngine) {
    sandEngine = SandEngine.create(Math.max(1, Math.round(S)), Math.max(1, Math.round(S)), { hold: 70 });
    sandLastS = S;
  }
  if (!sandInitialized) {
    sandInitialized = true;
    sandLoadSaved();
  } else {
    sandEngine.clear();
  }
  sandHistory = [];
  sandEngine.params.relax = SAND_RELAX_IDLE;
  sandCaptureFields();
  sandSetAngle(45);
  sandSetLength(0.11);
  modeState.turnLeft = false;
  modeState.turnRight = false;
  modeState.growLength = false;
  modeState.shrinkLength = false;
  modeState.pouring = false;
}

function sandResizeIfNeeded() {
  if (Math.round(S) === Math.round(sandLastS)) return;
  sandLastS = S;
  sandEngine.resize(Math.max(1, Math.round(S)), Math.max(1, Math.round(S)));
}

function sandLengthPx() { return num('length') * S; }

function sandClear() {
  sandPushHistory();
  sandEngine.clear();
  sandScheduleSave();
}

/* Насколько сильно скребковый край сам сползает без прикосновений. Замер:
   крутая насыпь (пик 55) без единого касания за 2 секунды теряла больше
   половины высоты (53.9 → 23.3) на исходном пороге текучести — так и
   ощущалось как «песок расползается сам». Порог утроен-учетверён держит ту
   же насыпь почти целиком (53.9 → 51.3), при этом чистота среза скребком
   не страдает — трение и сцепление растут вместе, angle-of-repose тот же,
   просто выше. Таймер слёживания (settle) и скорость потока (relax) такого
   эффекта не дают — дело не в них. */
function sandApplyStiffness() {
  const k = num('stiff');
  sandEngine.params.talus = SandEngine.DEFAULTS.talus * k;
  sandEngine.params.cohesion = SandEngine.DEFAULTS.cohesion * k;
}

function sandStep() {
  sandResizeIfNeeded();
  sandApplyStiffness();
  const turnSpeed = 130;
  if (modeState.turnLeft || modeState.turnRight) {
    const dir = (modeState.turnRight ? 1 : 0) - (modeState.turnLeft ? 1 : 0);
    let angle = (num('angle') + dir * turnSpeed * STEP) % 360;
    if (angle < 0) angle += 360;
    sandSetAngle(angle);
  }
  const lengthSpeed = 0.09;
  if (modeState.growLength || modeState.shrinkLength) {
    const dir = (modeState.growLength ? 1 : 0) - (modeState.shrinkLength ? 1 : 0);
    sandSetLength(clamp(num('length') + dir * lengthSpeed * STEP, 0.03, 0.28));
  }
  if (modeState.pouring && pointer.seen) {
    sandEngine.pour(pointer.x * S, pointer.y * S, STEP);
    sandScheduleSave();
  }
  sandEngine.tick();
}

function sandDrawBlade() {
  const a = num('angle') * Math.PI / 180;
  const half = sandLengthPx() / 2;
  const cx = pointer.x * S, cy = pointer.y * S;
  const x1 = cx - Math.cos(a) * half, y1 = cy - Math.sin(a) * half;
  const x2 = cx + Math.cos(a) * half, y2 = cy + Math.sin(a) * half;
  ctx.strokeStyle = pointer.down ? RED : ink(0.55);
  ctx.lineWidth = Math.max(2, 0.006 * S);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function sandDraw() {
  drawSandField();
  sandDrawBlade();
  const angle = Math.round(num('angle'));
  const length = num('length').toFixed(2);
  if (modeState.pouring) drawStatus(`струя · ∠${angle}° ↔${length}`, true);
  else drawStatus(`∠${angle}° ↔${length} · Q/E угол · +/− длина · A струя`);
}

/* ---------- шарики на резинке ---------- */

/* Линия — настоящая кривая Безье: штрих подгоняется минимальным числом
   кубических сегментов (алгоритм Шнайдера — рекурсивный fit с допуском по
   отклонению от кривой, не от хорды, поэтому дуга ужимается сильнее, чем
   способна ломаная через те же точки). Опорные точки — только стыки
   сегментов; у каждой на дом свои рычаги-«уши» (соседние control-point),
   которые едут вместе с ней.

   Шарики никак не привязаны к опорным точкам: после подгонки кривая
   перемеряется по длине через равный шаг (см. balloonSampleCurve) и на каждый
   отсчёт садится свой шарик с параметром (сегмент, t). Каждый кадр его якорь
   (ax, ay) пересчитывается по текущей форме кривой — двигаешь опору, и все
   шарики на участке плавно едут следом, независимо от того, сколько всего
   опорных точек на линии. Дальше — то же расталкивание и резинка, что и
   раньше: релаксация ограничений (Джейкобсен), устойчиво без мелкого шага.
   Фон у режима свой тёмный — контрастнее для светлых шариков. */

const BALLOON_MAX = 600;
const BALLOON_ITERATIONS = 4;
const BALLOON_HIT_RADIUS = 0.03;
const BALLOON_RAW_STEP = 0.006;
const BALLOON_ANCHOR_MARK = 0.008;

function bzSub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function bzAdd(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
function bzScale(a, s) { return { x: a.x * s, y: a.y * s }; }
function bzLen(a) { return Math.hypot(a.x, a.y); }
function bzNorm(a) { const l = bzLen(a); return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 }; }
function bzDot(a, b) { return a.x * b.x + a.y * b.y; }

function bzPoint(seg, t) {
  const mt = 1 - t, a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return {
    x: a * seg[0].x + b * seg[1].x + c * seg[2].x + d * seg[3].x,
    y: a * seg[0].y + b * seg[1].y + c * seg[2].y + d * seg[3].y,
  };
}

/* ---- подгонка кубических Безье под точки (алгоритм Шнайдера) ---- */

function bzChordParams(points) {
  const u = [0];
  for (let i = 1; i < points.length; i++) u.push(u[i - 1] + bzLen(bzSub(points[i], points[i - 1])));
  const total = u[u.length - 1] || 1;
  return u.map((v) => v / total);
}

function bzGenerate(points, u, t1, t2) {
  const p0 = points[0], p3 = points[points.length - 1];
  const A = u.map((ui) => [bzScale(t1, 3 * (1 - ui) * (1 - ui) * ui), bzScale(t2, 3 * (1 - ui) * ui * ui)]);
  const C = [[0, 0], [0, 0]], X = [0, 0];
  for (let i = 0; i < points.length; i++) {
    const ui = u[i], b0 = (1 - ui) ** 3, b3 = ui ** 3;
    const tmp = bzSub(points[i], bzAdd(bzScale(p0, b0), bzScale(p3, b3)));
    C[0][0] += bzDot(A[i][0], A[i][0]);
    C[0][1] += bzDot(A[i][0], A[i][1]);
    C[1][0] = C[0][1];
    C[1][1] += bzDot(A[i][1], A[i][1]);
    X[0] += bzDot(A[i][0], tmp);
    X[1] += bzDot(A[i][1], tmp);
  }
  const detC0C1 = C[0][0] * C[1][1] - C[1][0] * C[0][1];
  const detC0X = C[0][0] * X[1] - C[1][0] * X[0];
  const detXC1 = X[0] * C[1][1] - X[1] * C[0][1];
  let alpha1 = detC0C1 === 0 ? 0 : detXC1 / detC0C1;
  let alpha2 = detC0C1 === 0 ? 0 : detC0X / detC0C1;
  const segLen = bzLen(bzSub(p0, p3));
  const eps = 1e-6 * segLen;
  /* На спирали (и вообще при почти параллельных касательных на стыке) матрица
     C почти вырождена — детерминант рядом с нулём, alpha улетает в тысячи раз
     больше длины хорды. Получается «ухо» длиной в сотню экранов: кривая
     дичает петлёй в никуда, а по ней потом считается длина дуги для рассадки
     шариков — она тоже разносит в сотни тысяч пикселей, и почти все шарики
     схлопываются в комок у начала линии. Не только «слишком короткое» надо
     подстраховывать, но и «неправдоподобно длинное». */
  const maxAlpha = segLen * 4;
  const bad = !(alpha1 > eps) || !(alpha2 > eps) || !isFinite(alpha1) || !isFinite(alpha2)
    || alpha1 > maxAlpha || alpha2 > maxAlpha;
  if (bad) {
    const dist = segLen / 3;
    alpha1 = dist; alpha2 = dist;
  }
  return [p0, bzAdd(p0, bzScale(t1, alpha1)), bzAdd(p3, bzScale(t2, alpha2)), p3];
}

function bzMaxError(points, seg, u) {
  let maxDist = 0, splitPoint = Math.floor(points.length / 2);
  for (let i = 0; i < points.length; i++) {
    const d = bzLen(bzSub(bzPoint(seg, u[i]), points[i]));
    if (d > maxDist) { maxDist = d; splitPoint = i; }
  }
  return [maxDist, splitPoint];
}

function bzReparameterize(seg, points, u) {
  return u.map((ui, i) => {
    const p = points[i];
    const q = bzPoint(seg, ui);
    const mt = 1 - ui;
    const d1 = { x: 3 * mt * mt * (seg[1].x - seg[0].x) + 6 * mt * ui * (seg[2].x - seg[1].x) + 3 * ui * ui * (seg[3].x - seg[2].x),
      y: 3 * mt * mt * (seg[1].y - seg[0].y) + 6 * mt * ui * (seg[2].y - seg[1].y) + 3 * ui * ui * (seg[3].y - seg[2].y) };
    const d2 = { x: 6 * mt * (seg[2].x - 2 * seg[1].x + seg[0].x) + 6 * ui * (seg[3].x - 2 * seg[2].x + seg[1].x),
      y: 6 * mt * (seg[2].y - 2 * seg[1].y + seg[0].y) + 6 * ui * (seg[3].y - 2 * seg[2].y + seg[1].y) };
    const qp = bzSub(q, p);
    const denom = bzDot(d1, d1) + bzDot(qp, d2);
    if (denom === 0) return ui;
    return ui - bzDot(qp, d1) / denom;
  });
}

function bzFitCubic(points, t1, t2, error, depth) {
  if (points.length === 2 || depth > 22) {
    const dist = bzLen(bzSub(points[0], points[points.length - 1])) / 3;
    return [[points[0], bzAdd(points[0], bzScale(t1, dist)),
      bzAdd(points[points.length - 1], bzScale(t2, dist)), points[points.length - 1]]];
  }
  let u = bzChordParams(points);
  let seg = bzGenerate(points, u, t1, t2);
  let [maxErr, splitIdx] = bzMaxError(points, seg, u);
  if (maxErr < error) return [seg];
  if (maxErr < error * error) {
    for (let i = 0; i < 20; i++) {
      u = bzReparameterize(seg, points, u);
      seg = bzGenerate(points, u, t1, t2);
      [maxErr, splitIdx] = bzMaxError(points, seg, u);
      if (maxErr < error) return [seg];
    }
  }
  if (splitIdx <= 0 || splitIdx >= points.length - 1) return [seg];
  const centerTangent = bzNorm(bzSub(points[splitIdx - 1], points[splitIdx + 1]));
  const left = bzFitCubic(points.slice(0, splitIdx + 1), t1, centerTangent, error, depth + 1);
  const right = bzFitCubic(points.slice(splitIdx), bzScale(centerTangent, -1), t2, error, depth + 1);
  return left.concat(right);
}

function balloonFitBezier(points, error) {
  if (points.length < 2) return [];
  const t1 = bzNorm(bzSub(points[1], points[0]));
  const t2 = bzNorm(bzSub(points[points.length - 2], points[points.length - 1]));
  return bzFitCubic(points, t1, t2, Math.max(error, 0.001), 0);
}

/* Опорные точки — общие объекты на стыках сегментов (seg[i][3] === seg[i+1][0]),
   поэтому список без повторов получается склейкой первого p0 и всех p3. */
function balloonCurveAnchors(curve) {
  const anchors = [curve[0][0]];
  for (const seg of curve) anchors.push(seg[3]);
  return anchors;
}

/* Перемеряет кривую по длине (черновая таблица через фиксированные шаги t)
   и расставляет точки через равный отрезок дуги — независимо от того, где
   легли опорные точки после подгонки. */
function balloonSampleCurve(curve, spacing) {
  const table = [{ segIdx: 0, t: 0, cum: 0 }];
  let cum = 0;
  for (let s = 0; s < curve.length; s++) {
    const seg = curve[s];
    const steps = 24;
    let prev = seg[0];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const pt = bzPoint(seg, t);
      cum += bzLen(bzSub(pt, prev));
      table.push({ segIdx: s, t, cum });
      prev = pt;
    }
  }
  const total = cum;
  const samples = [];
  if (total <= 0) return [{ segIdx: 0, t: 0 }];
  let target = 0, ti = 0;
  while (target <= total + 1e-6) {
    while (ti < table.length - 2 && table[ti + 1].cum < target) ti++;
    const a = table[ti], b = table[ti + 1];
    let segIdx = a.segIdx, t = a.t;
    if (b && b.segIdx === a.segIdx && b.cum > a.cum) {
      const frac = clamp((target - a.cum) / (b.cum - a.cum), 0, 1);
      t = a.t + (b.t - a.t) * frac;
    }
    samples.push({ segIdx, t });
    target += spacing;
  }
  return samples;
}

let balloons = [];
let balloonLines = [];
let balloonRaw = null;
let balloonLast = null;
let balloonDragPoint = null;
let balloonDragHandles = null;
let balloonActiveLine = null;
let balloonMoveLine = null;

/* Отмена — снимок перед жестом (новый штрих, захват точки, начало сдвига
   контура), не на каждый кадр. Точки внутри линии общие между соседними
   сегментами (стык), поэтому клон идёт через карту «старый объект → новый»,
   иначе после восстановления сегменты разъедутся по разным копиям одной
   точки. Шарик хранит ссылку на СВОЮ (уже клонированную) линию, чтобы после
   отмены его якорь по-прежнему считался от актуальной кривой. */
const BALLOON_HISTORY_LIMIT = 20;
let balloonHistory = [];

function balloonCloneLine(line) {
  const seen = new Map();
  const clonePt = (p) => {
    if (!seen.has(p)) seen.set(p, { x: p.x, y: p.y });
    return seen.get(p);
  };
  return { curve: line.curve.map((seg) => seg.map(clonePt)), anchors: line.anchors.map(clonePt) };
}

function balloonsPushHistory() {
  const lineMap = new Map();
  const lines = balloonLines.map((line) => {
    const cloned = balloonCloneLine(line);
    lineMap.set(line, cloned);
    return cloned;
  });
  const balls = balloons.map((b) => ({
    x: b.x, y: b.y, ax: b.ax, ay: b.ay, r: b.r, birth: b.birth, scale: b.scale,
    line: b.line ? lineMap.get(b.line) : null, segIdx: b.segIdx, t: b.t,
  }));
  balloonHistory.push({ lines, balls });
  if (balloonHistory.length > BALLOON_HISTORY_LIMIT) balloonHistory.shift();
}

function balloonsUndo() {
  const snap = balloonHistory.pop();
  if (!snap) return;
  balloonLines = snap.lines;
  balloons = snap.balls;
  balloonActiveLine = null;
}

function balloonSpawn(x, y) {
  if (balloons.length >= BALLOON_MAX) return null;
  const spread = num('contrast');
  const b = {
    x, y, ax: x, ay: y, r: 0,
    birth: performance.now() / 1000,
    scale: 1 + (Math.random() * 2 - 1) * spread,
  };
  balloons.push(b);
  return b;
}

/* Общий хвост для готовой кривой — что после подгонки штриха, что для
   затравки, заранее нарисованной в векторе: заводит линию, рассаживает по
   ней шарики через равный шаг и запускает волну роста от начала к концу. */
function balloonSpawnFromCurve(curve) {
  if (!curve.length) return null;
  const line = { curve, anchors: balloonCurveAnchors(curve) };
  balloonLines.push(line);
  const spacing = Math.max(3, num('radius') * S * 0.85);
  const slots = balloonSampleCurve(curve, spacing);
  /* Волна: у соседа по кривой рождение чуть позже, чем у предыдущего — растут
     друг за другом от начала штриха к концу, как раньше, когда каждый шарик
     и правда появлялся по ходу рисования. Сейчас все точки уже готовы разом
     (после подгонки), так что след движения приходится изображать явно через
     birth в будущем, а не получать его само собой от порядка спавна. */
  const wave = num('wave');
  const now = performance.now() / 1000;
  slots.forEach((slot, i) => {
    const p = bzPoint(curve[slot.segIdx], slot.t);
    const b = balloonSpawn(p.x, p.y);
    if (!b) return;
    b.line = line; b.segIdx = slot.segIdx; b.t = slot.t;
    b.birth = now + (slots.length > 1 ? (i / (slots.length - 1)) * wave : 0);
  });
  return line;
}

function balloonFinalize(rawPoints) {
  const tol = Math.max(1, num('fit') * S);
  const curve = balloonFitBezier(rawPoints, tol);
  balloonSpawnFromCurve(curve);
}

/* Затравка — векторный набросок буквы П (три готовых кубических Безье, взяты
   как есть из SVG 718×718, M+C команды), встречает при открытии режима.
   Числа — координаты p0/c1/c2/p3 подряд; p0 второго сегмента в пути всегда
   равен p3 первого, но должен быть тем же объектом (общий стык), поэтому
   собираем через прошлый конец, а не заново парсим их как отдельные точки. */
const BALLOON_SEED_VIEWBOX = 718;
const BALLOON_SEED_PATHS = [
  [
    [149.66, 430.38, 38.16, 504.38, 126.83, 648.11, 218.72, 585.85],
    [218.72, 585.85, 356.72, 492.35, 452.95, 244.5, 514.45, 81.5],
  ],
  [
    [251.55, 283.3, 137.05, 333.31, 27.18, 165.75, 171.37, 118.15],
    [171.37, 118.15, 293, 78, 508.65, 288.49, 637, 406.3],
  ],
  [
    [572.88, 609.05, 460.04, 589.67, 475.52, 483.07, 532.4, 332.64],
  ],
];

function balloonSeedCurve(coords) {
  const scale = S / BALLOON_SEED_VIEWBOX;
  let prevEnd = null;
  return coords.map((c) => {
    const p0 = prevEnd || { x: c[0] * scale, y: c[1] * scale };
    const c1 = { x: c[2] * scale, y: c[3] * scale };
    const c2 = { x: c[4] * scale, y: c[5] * scale };
    const p3 = { x: c[6] * scale, y: c[7] * scale };
    prevEnd = p3;
    return [p0, c1, c2, p3];
  });
}

function balloonLoadSeed() {
  for (const coords of BALLOON_SEED_PATHS) balloonSpawnFromCurve(balloonSeedCurve(coords));
}

function balloonFindAnchor(x, y) {
  const threshold = BALLOON_HIT_RADIUS * S;
  let best = null, bestLine = null, bestDist = threshold;
  for (const line of balloonLines) {
    for (const a of line.anchors) {
      const d = Math.hypot(a.x - x, a.y - y);
      if (d < bestDist) { bestDist = d; best = a; bestLine = line; }
    }
  }
  return best ? { anchor: best, line: bestLine } : null;
}

/* Какую линию двигать целиком — не «контур вообще», а именно ту, за шарик
   которой схватились. Шарики покрывают линию гуще всего, поэтому проверяем
   в первую очередь их (клик внутри круга — попадание), а на пропуски между
   ними (или пока шарики ещё не выросли) — саму опорную точку. */
function balloonFindLine(x, y) {
  let best = null, bestDist = Infinity;
  for (const b of balloons) {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d <= b.r && d < bestDist) { bestDist = d; best = b.line; }
  }
  if (best) return best;
  const hit = balloonFindAnchor(x, y);
  return hit ? hit.line : null;
}

/* Поднимает линию (и её шарики) в конец списков рисования — рисуется
   последней, то есть поверх остальных. Нужно, когда правишь контур,
   погребённый под чужими перекрывающими шариками. */
function balloonBringToFront(line) {
  const idx = balloonLines.indexOf(line);
  if (idx >= 0 && idx !== balloonLines.length - 1) {
    balloonLines.splice(idx, 1);
    balloonLines.push(line);
  }
  const own = [], other = [];
  for (const b of balloons) (b.line === line ? own : other).push(b);
  balloons = other.concat(own);
}

function balloonsSetup() {
  balloons = [];
  balloonLines = [];
  balloonRaw = null;
  balloonLast = null;
  balloonDragPoint = null;
  balloonDragHandles = null;
  balloonActiveLine = null;
  balloonMoveLine = null;
  balloonHistory = [];
  setGround('ink');
  balloonLoadSeed();
}

function balloonsClear() {
  balloonsPushHistory();
  balloons = [];
  balloonLines = [];
  balloonRaw = null;
  balloonLast = null;
  balloonDragPoint = null;
  balloonDragHandles = null;
  balloonActiveLine = null;
  balloonMoveLine = null;
}

function balloonsStep() {
  const now = performance.now() / 1000;
  const delay = num('delay');
  const growth = Math.max(0.05, num('growth'));
  const maxR = num('radius') * S;
  const springK = num('spring');
  const cursorR = maxR * 0.6;
  const cursorX = pointer.x * S, cursorY = pointer.y * S;
  const poking = pointer.seen && !pointer.down && !balloonDragPoint && !on('move');

  for (const b of balloons) {
    if (b.line) {
      const p = bzPoint(b.line.curve[b.segIdx], b.t);
      b.ax = p.x; b.ay = p.y;
    }
    const t = clamp((now - b.birth - delay) / growth, 0, 1);
    const ease = t * t * (3 - 2 * t);
    b.r = maxR * b.scale * ease;
  }

  const n = balloons.length;
  for (let it = 0; it < BALLOON_ITERATIONS; it++) {
    for (let i = 0; i < n; i++) {
      const bi = balloons[i];
      for (let j = i + 1; j < n; j++) {
        const bj = balloons[j];
        let dx = bj.x - bi.x, dy = bj.y - bi.y;
        let dist = Math.hypot(dx, dy);
        const minDist = bi.r + bj.r;
        if (minDist <= 0 || dist >= minDist) continue;
        if (dist < 1e-4) { dx = 1; dy = 0; dist = 1e-4; }
        const push = (minDist - dist) * 0.5 / dist;
        bi.x -= dx * push; bi.y -= dy * push;
        bj.x += dx * push; bj.y += dy * push;
      }
    }
    if (poking) {
      for (const b of balloons) {
        let dx = b.x - cursorX, dy = b.y - cursorY;
        let dist = Math.hypot(dx, dy);
        const minDist = b.r + cursorR;
        if (dist >= minDist) continue;
        if (dist < 1e-4) { dx = 1; dy = 0; dist = 1e-4; }
        const push = (minDist - dist) / dist;
        b.x += dx * push; b.y += dy * push;
      }
    }
    for (const b of balloons) {
      b.x += (b.ax - b.x) * springK;
      b.y += (b.ay - b.y) * springK;
    }
  }
}

/* Радиальный градиент со смещённым бликом вместо ровной заливки — тень по
   краю получается просто снижением альфы: под ней тёмный фон режима
   проступает сильнее, это и читается как объём без отдельного цвета. */
function balloonFillFor(b) {
  if (!on('volume')) return ink(1);
  const hlx = b.x - b.r * 0.35, hly = b.y - b.r * 0.35;
  const grad = ctx.createRadialGradient(hlx, hly, Math.max(0.4, b.r * 0.05), b.x, b.y, b.r * 1.05);
  grad.addColorStop(0, ink(1));
  grad.addColorStop(0.55, ink(0.85));
  grad.addColorStop(1, ink(0.4));
  return grad;
}

function balloonsDraw() {
  const moveMode = on('move');
  /* Наведение проверяем ещё до нажатия — иначе узнать, попал ли курсор по
     тонкой линии (или какую линию целиком схватит «двигать контур»), можно
     только промахнувшись и испортив не то. Курсор и подсветка загораются
     заранее, до клика. */
  const hoverLine = moveMode && !pointer.down
    ? balloonFindLine(pointer.x * S, pointer.y * S) : null;
  const hoverAnchor = !moveMode && !balloonDragPoint && !balloonRaw && pointer.seen
    ? balloonFindAnchor(pointer.x * S, pointer.y * S) : null;
  const highlightLine = moveMode ? (balloonMoveLine || hoverLine) : balloonActiveLine;
  canvas.style.cursor = moveMode
    ? (balloonMoveLine ? 'grabbing' : (hoverLine ? 'grab' : 'crosshair'))
    : (hoverAnchor || balloonDragPoint ? 'grab' : 'crosshair');

  ctx.lineWidth = Math.max(1.5, 0.003 * S);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const line of balloonLines) {
    if (!line.curve.length) continue;
    ctx.strokeStyle = line === highlightLine ? RED : ink(0.5);
    ctx.beginPath();
    ctx.moveTo(line.curve[0][0].x, line.curve[0][0].y);
    for (const seg of line.curve) ctx.bezierCurveTo(seg[1].x, seg[1].y, seg[2].x, seg[2].y, seg[3].x, seg[3].y);
    ctx.stroke();
  }
  if (balloonRaw && balloonRaw.length > 1) {
    ctx.strokeStyle = RED;
    ctx.beginPath();
    ctx.moveTo(balloonRaw[0].x, balloonRaw[0].y);
    for (let i = 1; i < balloonRaw.length; i++) ctx.lineTo(balloonRaw[i].x, balloonRaw[i].y);
    ctx.stroke();
  }

  const volume = on('volume');
  ctx.strokeStyle = paper(0.5);
  ctx.lineWidth = Math.max(1, 0.0016 * S);
  for (const b of balloons) {
    if (b.r < 0.5) continue;
    ctx.fillStyle = balloonFillFor(b);
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    if (!volume) ctx.stroke();
  }

  /* Метки опорных точек рисуются последними, поверх шариков — иначе их же
     самих и не видно, они гуще всего лежат ровно на линии. Точка под
     курсором (или уже схваченная) крупнее и красная — ясно, что клик сейчас
     правит контур, а не рисует новый. В режиме «двигать контур» точки не
     нужны — там хватают не точку, а линию целиком, метки только мешали бы. */
  if (!moveMode) {
    const markR = BALLOON_ANCHOR_MARK * S;
    for (const line of balloonLines) {
      for (const a of line.anchors) {
        const isHot = a === balloonDragPoint || (hoverAnchor && hoverAnchor.anchor === a);
        ctx.beginPath();
        ctx.arc(a.x, a.y, isHot ? markR * 1.8 : markR, 0, Math.PI * 2);
        ctx.fillStyle = isHot ? RED : ink(0.7);
        ctx.fill();
        if (isHot) {
          ctx.beginPath();
          ctx.arc(a.x, a.y, markR * 1.8, 0, Math.PI * 2);
          ctx.strokeStyle = paper(0.7);
          ctx.lineWidth = Math.max(1, 0.0015 * S);
          ctx.stroke();
        }
      }
    }
  }

  drawStatus(`${balloons.length} шариков`);
}

const MODES = {
  balloons: {
    label: 'шарики',
    note: 'Тяните линию по холсту — отпустите, и штрих подгонится настоящей кривой Безье по минимуму опорных точек (прямая — двумя, дуга — по факту изгиба). Опорные точки помечены точками на линии — под курсором и во время захвата точка красная и крупнее, сразу видно, что клик сейчас правит контур, а не рисует новый. Шарики с опорными точками не связаны: они рассажены по всей длине кривой равномерно, растут волной от начала штриха к концу (как будто рисуются на глазах), расталкивают друг друга, но каждый держится резинкой у своего места на кривой. Курсор при наведении без нажатия тоже расталкивает всё рядом. Опорную точку можно взять и перетащить — едет она и её собственные рычаги, кривая гнётся и выходит поверх остальных линий, а шарики на этом участке плавно подстраиваются следом; во время правки контур подсвечен красным целиком. «Двигать контур» — меняет смысл клика: хватает не точку, а целиком ту линию, по шарику которой кликнули (под курсором она заранее подсвечивается), и просто сдвигает её — другие линии на месте. «Объём» — лёгкая радиальная тень на шариках вместо ровной заливки; в этом режиме плоская обводка каждого шарика убирается, чтобы не шуметь поверх градиента. «Контраст» — разброс размера между шариками одной линии: 0 — все одинаковые, больше — крупные и мелкие резче отличаются. «Подгонка» — насколько вольно кривая может срезать угол мимо штриха. «Радиус» — предельный размер шарика (он же частота посадки по кривой), «задержка» — пауза перед стартом роста первого шарика, «рост» — скорость надувания одного шарика, «волна» — за сколько секунд запуск роста добегает от первого шарика до последнего (0 — все разом), «резинка» — насколько туго держит у своего места. Ctrl/Cmd+Z или «отменить» — назад на шаг (до 20). C или «очистить» — стереть всё.',
    cursor: 'crosshair',
    tools: [
      { type: 'range', key: 'fit', label: 'подгонка', min: 0.01, max: 0.1, step: 0.005, value: 0.035 },
      { type: 'range', key: 'radius', label: 'радиус', min: 0.012, max: 0.05, step: 0.002, value: 0.026 },
      { type: 'range', key: 'contrast', label: 'контраст', min: 0, max: 0.6, step: 0.02, value: 0.25 },
      { type: 'range', key: 'delay', label: 'задержка', min: 0, max: 1.2, step: 0.02, value: 0.12 },
      { type: 'range', key: 'growth', label: 'рост', min: 0.1, max: 1.2, step: 0.02, value: 0.35 },
      { type: 'range', key: 'wave', label: 'волна', min: 0, max: 2, step: 0.05, value: 0.6 },
      { type: 'range', key: 'spring', label: 'резинка', min: 0.05, max: 0.6, step: 0.01, value: 0.25 },
      { type: 'toggle', key: 'move', label: 'двигать контур', value: false },
      { type: 'toggle', key: 'volume', label: 'объём', value: true },
      { type: 'button', label: 'отменить', action: balloonsUndo },
      { type: 'button', label: 'очистить', action: balloonsClear },
    ],
    setup() { balloonsSetup(); },
    step() { balloonsStep(); },
    draw() { balloonsDraw(); },
    onDown() {
      const x = pointer.x * S, y = pointer.y * S;
      if (on('move')) {
        const line = balloonFindLine(x, y);
        if (!line) return;
        balloonsPushHistory();
        balloonBringToFront(line);
        balloonMoveLine = line;
        return;
      }
      const hit = balloonFindAnchor(x, y);
      if (hit) {
        balloonsPushHistory();
        balloonBringToFront(hit.line);
        balloonActiveLine = hit.line;
        balloonDragPoint = hit.anchor;
        balloonDragHandles = [];
        for (const seg of hit.line.curve) {
          if (seg[0] === hit.anchor) balloonDragHandles.push(seg[1]);
          if (seg[3] === hit.anchor) balloonDragHandles.push(seg[2]);
        }
        return;
      }
      balloonsPushHistory();
      balloonRaw = [{ x, y }];
      balloonLast = { x, y };
    },
    onMove() {
      if (on('move')) {
        if (!pointer.down || !balloonMoveLine) return;
        const dx = (pointer.x - pointer.px) * S, dy = (pointer.y - pointer.py) * S;
        const seen = new Set();
        for (const seg of balloonMoveLine.curve) {
          for (const p of seg) {
            if (seen.has(p)) continue;
            seen.add(p);
            p.x += dx; p.y += dy;
          }
        }
        for (const b of balloons) {
          if (b.line !== balloonMoveLine) continue;
          b.x += dx; b.y += dy; b.ax += dx; b.ay += dy;
        }
        return;
      }
      const x = pointer.x * S, y = pointer.y * S;
      if (balloonDragPoint) {
        const dx = (pointer.x - pointer.px) * S, dy = (pointer.y - pointer.py) * S;
        balloonDragPoint.x += dx; balloonDragPoint.y += dy;
        for (const h of balloonDragHandles) { h.x += dx; h.y += dy; }
        return;
      }
      if (!pointer.down || !balloonRaw) return;
      const spacing = Math.max(2, BALLOON_RAW_STEP * S);
      if (Math.hypot(x - balloonLast.x, y - balloonLast.y) < spacing) return;
      balloonRaw.push({ x, y });
      balloonLast = { x, y };
    },
    onUp() {
      if (balloonRaw) {
        if (balloonRaw.length >= 2) balloonFinalize(balloonRaw);
        else balloonHistory.pop();
        balloonRaw = null;
      }
      balloonDragPoint = null;
      balloonDragHandles = null;
      balloonActiveLine = null;
      balloonMoveLine = null;
    },
    onKey(event, down) {
      if (down && (event.ctrlKey || event.metaKey) && event.code === 'KeyZ') {
        event.preventDefault();
        balloonsUndo();
        return;
      }
      if (event.code === 'KeyC' && down) balloonsClear();
    },
  },
  sand: {
    label: 'песок',
    note: 'Скребок держит угол и длину — крутить их можно и ползунками (в панели по Tab), и на ходу клавишами: Q/E угол, +/− длина. A — струя под курсором. C или «очистить» — стол дочиста, R — то же самое и сброс угла с длиной. «Крупность» меняет масштаб песчинок, «жёсткость» — насколько форма держится сама без прикосновений (1 — сыпучий песок как есть, выше — меньше сама расползается). Ctrl/Cmd+Z или «отменить» — назад на шаг (до 20). Пока кнопка зажата, осыпание почти замирает и досыпает уже после отпускания — так вычищенная полоса не подёргивается назад на глазах. «Зафиксировать сцену» сохраняет карту высот файлом — она станет затравкой для настоящей буквы.',
    cursor: 'none',
    tools: [
      { type: 'range', key: 'angle', label: 'угол', min: 0, max: 359, step: 1, value: 45 },
      { type: 'range', key: 'length', label: 'длина', min: 0.03, max: 0.28, step: 0.005, value: 0.11 },
      { type: 'range', key: 'grain', label: 'крупность', min: 1.2, max: 3.4, step: 0.1, value: 1.8 },
      { type: 'range', key: 'stiff', label: 'жёсткость', min: 1, max: 8, step: 0.25, value: 4 },
      { type: 'button', label: 'отменить', action: sandUndo },
      { type: 'button', label: 'зафиксировать сцену', action: sandExportSeed },
      { type: 'button', label: 'очистить', action: sandClear },
    ],
    setup() { sandSetup(); },
    step() { sandStep(); },
    draw() { sandDraw(); },
    onDown() {
      pointer.px = pointer.x;
      pointer.py = pointer.y;
      sandPushHistory();
      sandEngine.params.relax = SAND_RELAX_DRAG;
    },
    onMove() {
      if (!pointer.down) return;
      const ax = pointer.px * S, ay = pointer.py * S;
      const bx = pointer.x * S, by = pointer.y * S;
      const angle = num('angle');
      const length = sandLengthPx();
      sandEngine.stampWall(bx, by, ax, ay, angle, length, true);
      sandEngine.blade(ax, ay, bx, by, angle, length);
      sandScheduleSave();
    },
    onUp() {
      sandEngine.params.relax = SAND_RELAX_IDLE;
    },
    onKey(event, down) {
      if (down && (event.ctrlKey || event.metaKey) && event.code === 'KeyZ') {
        event.preventDefault();
        sandUndo();
        return;
      }
      if (event.code === 'KeyQ') modeState.turnLeft = down;
      if (event.code === 'KeyE') modeState.turnRight = down;
      if (event.code === 'Equal') modeState.growLength = down;
      if (event.code === 'Minus') modeState.shrinkLength = down;
      if (event.code === 'KeyA') {
        if (down && !modeState.pouring) sandPushHistory();
        modeState.pouring = down;
      }
      if (event.code === 'KeyC' && down) sandClear();
    },
  },
};

startLab({
  title: 'П · песок и шарики',
  modes: MODES,
  start: 'sand',
});
