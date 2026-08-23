const INK = '#161616';
const RED = '#e0210f';
const STEP = 1 / 60;
const LEVELS = 5;
const CAP = 5;

const PARAMS = {
  cells: 30,
  brush: 0.055,
  pressure: 1.5,
  couple: 0.2,
  grain: 0.35,
  fade: 0,
  pilotSpeed: 2.4,
  pilot: false,
};

const CONTROLS = [
  { key: 'pilotSpeed', label: 'скорость авто', min: 0.5, max: 5, step: 0.1 },
  { key: 'fade', label: 'забывание', min: 0, max: 1, step: 0.05 },
  { key: 'cells', label: 'ячеек', min: 14, max: 46, step: 2, rebuild: true },
  { key: 'brush', label: 'кисть', min: 0.015, max: 0.14, step: 0.005 },
  { key: 'pressure', label: 'нажим', min: 0.2, max: 5, step: 0.1 },
  { key: 'couple', label: 'сцепление соседей', min: 0, max: 1, step: 0.05 },
  { key: 'grain', label: 'неодинаковость', min: 0, max: 1, step: 0.05 },
];

// Маршрут автопилота повторяет авторский SVG одним непрерывным штрихом.
const PILOT_CURVES = [
  [[1257.13, 231.104], [1026.3, 505.771], [538.431, 1081.7], [433.631, 1188.1]],
  [[433.631, 1188.1], [302.631, 1321.1], [103.954, 1148], [229.131, 1030.1]],
  [[229.131, 1030.1], [397, 872], [626.499, 1243.6], [882.131, 1243.6]],
  [[882.131, 1243.6], [1224, 1243.6], [1400, 674.5], [1080, 354.5]],
  [[1080, 354.5], [759.999, 34.5001], [267, 263], [267, 520.5]],
  [[267, 520.5], [267, 726.5], [423.833, 716.833], [486, 714.5]],
];

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function pilotRoute(scale) {
  const route = [];
  for (let curve = 0; curve < PILOT_CURVES.length; curve += 1) {
    const [a, b, c, d] = PILOT_CURVES[curve];
    for (let i = curve ? 1 : 0; i <= 72; i += 1) {
      const t = i / 72;
      const u = 1 - t;
      const x = u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0];
      const y = u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1];
      route.push([(0.06 + (x / 1446) * 0.88) * scale, (0.06 + (y / 1450) * 0.88) * scale]);
    }
  }
  return route;
}

export function mountD(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { ...PARAMS };
  const pointer = { x: 0, y: 0, px: 0, py: 0, down: false, erase: false };

  workspace.dataset.ground = 'paper';
  canvas.style.cursor = 'crosshair';

  let S = 0;
  let frameId = 0;
  let last = performance.now();
  let debt = 0;
  let state = null;
  let fadeInput = null;
  let pilotButton = null;

  function buildField() {
    const size = params.cells * params.cells;
    state = {
      n: params.cells,
      fieldX: new Float32Array(size),
      fieldY: new Float32Array(size),
      nextX: new Float32Array(size),
      nextY: new Float32Array(size),
      angle: new Float32Array(size),
      display: new Float32Array(size),
      level: new Uint8Array(size),
      flash: new Float32Array(size),
      bias: new Float32Array(size),
      twist: new Float32Array(size),
      route: pilotRoute(S),
      pilotIndex: 0,
      pilotCarry: 0,
      pilotPause: 0,
      pilotRunning: true,
      pilotOnce: true,
    };
    for (let i = 0; i < size; i += 1) {
      state.angle[i] = Math.random() * Math.PI;
      state.bias[i] = Math.random() - 0.5;
      state.twist[i] = Math.random() * 2 - 1;
    }
  }

  function clear() {
    state.fieldX.fill(0);
    state.fieldY.fill(0);
    state.nextX.fill(0);
    state.nextY.fill(0);
    state.level.fill(0);
    state.display.fill(0);
    state.flash.fill(0);
  }

  function rotate() {
    for (let i = 0; i < state.fieldX.length; i += 1) {
      const x = state.fieldX[i];
      state.fieldX[i] = -state.fieldY[i];
      state.fieldY[i] = x;
      state.flash[i] = 1;
    }
  }

  function paint(fromX, fromY, toX, toY, erase) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const speed = Math.hypot(dx, dy);
    if (speed < 0.5) return;
    const cell = S / state.n;
    const cx = toX / cell;
    const cy = toY / cell;
    const radius = (params.brush * S) / cell;
    const ux = dx / speed;
    const uy = dy / speed;
    const force = params.pressure * (0.9 + Math.min(2.2, speed / cell));

    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
        if (x < 0 || y < 0 || x >= state.n || y >= state.n) continue;
        const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (distance > radius) continue;
        const weight = (1 - distance / radius) ** 1.5;
        const i = y * state.n + x;
        if (erase) {
          const keep = Math.max(0, 1 - force * weight * 0.34);
          state.fieldX[i] *= keep;
          state.fieldY[i] *= keep;
          continue;
        }
        state.fieldX[i] += ux * force * weight;
        state.fieldY[i] += uy * force * weight;
        const magnitude = Math.hypot(state.fieldX[i], state.fieldY[i]);
        if (magnitude > CAP) {
          state.fieldX[i] *= CAP / magnitude;
          state.fieldY[i] *= CAP / magnitude;
        }
      }
    }
  }

  function setFade(value) {
    params.fade = value;
    if (fadeInput) fadeInput.value = value;
  }

  function restartPilot() {
    state.pilotIndex = 0;
    state.pilotCarry = 0;
    state.pilotRunning = true;
  }

  function runPilot() {
    if (!params.pilot && !state.pilotOnce) state.pilotRunning = false;
    if (state.pilotPause > 0) {
      state.pilotPause -= STEP;
      if (state.pilotPause <= 0 && params.pilot) restartPilot();
    } else if (params.pilot && !state.pilotRunning && !state.pilotOnce) {
      restartPilot();
    }
    if (!state.pilotRunning) return;

    state.pilotCarry += params.pilotSpeed;
    while (state.pilotCarry >= 1 && state.pilotIndex < state.route.length - 1) {
      const from = state.route[state.pilotIndex];
      const to = state.route[state.pilotIndex + 1];
      paint(from[0], from[1], to[0], to[1], false);
      state.pilotIndex += 1;
      state.pilotCarry -= 1;
    }
    if (state.pilotIndex < state.route.length - 1) return;

    state.pilotRunning = false;
    if (state.pilotOnce) {
      state.pilotOnce = false;
      setFade(0.5);
    }
    if (params.pilot) state.pilotPause = 0.8;
  }

  function step() {
    runPilot();
    const coupling = params.couple * 0.12;
    const keep = params.fade === 0 ? 1 : 1 - params.fade * 0.004;
    const n = state.n;

    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const i = y * n + x;
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        if (x > 0) { sumX += state.fieldX[i - 1]; sumY += state.fieldY[i - 1]; count += 1; }
        if (x < n - 1) { sumX += state.fieldX[i + 1]; sumY += state.fieldY[i + 1]; count += 1; }
        if (y > 0) { sumX += state.fieldX[i - n]; sumY += state.fieldY[i - n]; count += 1; }
        if (y < n - 1) { sumX += state.fieldX[i + n]; sumY += state.fieldY[i + n]; count += 1; }
        const ownX = state.fieldX[i];
        const ownY = state.fieldY[i];
        const magnitude = Math.hypot(ownX, ownY) * keep;
        const mixedX = ownX + (sumX / count - ownX) * coupling;
        const mixedY = ownY + (sumY / count - ownY) * coupling;
        const mixedMagnitude = Math.hypot(mixedX, mixedY);
        if (mixedMagnitude > 1e-6) {
          state.nextX[i] = (mixedX / mixedMagnitude) * magnitude;
          state.nextY[i] = (mixedY / mixedMagnitude) * magnitude;
        } else {
          state.nextX[i] = ownX * keep;
          state.nextY[i] = ownY * keep;
        }
      }
    }
    [state.fieldX, state.nextX] = [state.nextX, state.fieldX];
    [state.fieldY, state.nextY] = [state.nextY, state.fieldY];

    for (let i = 0; i < state.fieldX.length; i += 1) {
      const magnitude = Math.hypot(state.fieldX[i], state.fieldY[i]);
      const raw = (magnitude / CAP) * LEVELS + 0.25 + state.bias[i] * params.grain;
      const level = clamp(Math.floor(raw), 0, LEVELS - 1);
      if (level !== state.level[i]) {
        state.level[i] = level;
        state.flash[i] = 1;
      }
      state.flash[i] *= 0.84;
      state.display[i] += (level - state.display[i]) * 0.18;
      if (magnitude > 0.03) {
        const target = Math.atan2(state.fieldY[i], state.fieldX[i]) + state.twist[i] * params.grain * 0.42;
        const turn = Math.atan2(Math.sin(target - state.angle[i]), Math.cos(target - state.angle[i]));
        state.angle[i] += turn * 0.2;
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, S, S);
    const cell = S / state.n;
    for (let y = 0; y < state.n; y += 1) {
      for (let x = 0; x < state.n; x += 1) {
        const i = y * state.n + x;
        const cx = (x + 0.5) * cell;
        const cy = (y + 0.5) * cell;
        const density = state.display[i];
        if (density < 0.08) {
          ctx.fillStyle = 'rgba(22,22,22,.12)';
          ctx.fillRect(cx - 0.5, cy - 0.5, 1, 1);
          continue;
        }
        const level = Math.max(1, Math.round(density));
        const length = cell * (0.54 + density * 0.045);
        const band = cell * 0.42;
        const hot = state.flash[i] > 0.08;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(state.angle[i]);
        if (level >= LEVELS - 1) {
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
  }

  function resize() {
    const bounds = workspace.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const next = Math.max(1, bounds.width);
    const changed = Math.abs(next - S) > 1;
    S = next;
    canvas.width = Math.round(S * dpr);
    canvas.height = Math.round(bounds.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (changed) buildField();
  }

  function track(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    pointer.x = event.clientX - bounds.left;
    pointer.y = event.clientY - bounds.top;
    pointer.erase = event.shiftKey;
  }

  function onPointerDown(event) {
    track(event);
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    pointer.down = true;
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    track(event);
    if (pointer.down) paint(pointer.px, pointer.py, pointer.x, pointer.y, pointer.erase);
  }

  function onPointerUp() {
    pointer.down = false;
    pointer.erase = false;
  }

  function frame(now) {
    debt = Math.min(0.1, debt + (now - last) / 1000);
    last = now;
    while (debt >= STEP) {
      step();
      debt -= STEP;
    }
    draw();
    frameId = requestAnimationFrame(frame);
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'веди — рисуй · обратно — стирай · shift — ластик';
  workspace.append(hint);

  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.hidden = true;
  panel.style.padding = '0';
  panel.style.background = 'none';
  panel.style.backdropFilter = 'none';
  panel.style.webkitBackdropFilter = 'none';

  pilotButton = document.createElement('button');
  pilotButton.type = 'button';
  pilotButton.className = 'sketch-switch';
  pilotButton.textContent = 'автопилот';
  pilotButton.setAttribute('aria-pressed', 'false');
  pilotButton.addEventListener('click', () => {
    params.pilot = !params.pilot;
    pilotButton.setAttribute('aria-pressed', String(params.pilot));
  });
  panel.append(pilotButton);

  for (const control of CONTROLS) {
    const label = document.createElement('label');
    label.textContent = control.label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = control.min;
    input.max = control.max;
    input.step = control.step;
    input.value = params[control.key];
    input.addEventListener('input', () => {
      params[control.key] = Number(input.value);
    });
    if (control.rebuild) input.addEventListener('change', buildField);
    if (control.key === 'fade') fadeInput = input;
    label.append(input);
    panel.append(label);
  }

  const rotateButton = document.createElement('button');
  rotateButton.type = 'button';
  rotateButton.className = 'sketch-action';
  rotateButton.textContent = 'повернуть всё';
  rotateButton.addEventListener('click', rotate);

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'sketch-action';
  clearButton.textContent = 'очистить';
  clearButton.addEventListener('click', clear);

  const note = document.createElement('p');
  note.textContent = 'сцепление сводит направления соседей · встречный штрих вычитает плотность';
  panel.append(rotateButton, clearButton, note);

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
  workspace.append(panel, toggle);

  function onKeyDown(event) {
    if (event.key !== 'Tab') return;
    if (event.target.closest('input, textarea')) return;
    event.preventDefault();
    toggle.click();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(workspace);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('keydown', onKeyDown);

  resize();
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    document.removeEventListener('keydown', onKeyDown);
    hint.remove();
    panel.remove();
    toggle.remove();
    canvas.style.cursor = '';
    ctx.clearRect(0, 0, S, S);
    delete workspace.dataset.ground;
  };
}
