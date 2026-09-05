// Т — слизь ищет форму буквы. Агенты бродят по всему полю без забора:
// стержень и перекладина (два прямоугольника, толщина каждого — свой
// ползунок) не запирают их, а зовут через лёгкий снос курса к ближайшей
// точке буквы. Посетитель ведёт пальцем или мышью — под кистью ложится
// сильный след, и сеть каналов тянется за нарисованным. Комбинация
// параметров по умолчанию подобрана на полигоне (lab/t-lab.js, режим
// «слизь»): пришли к ней через собственно снос (работает сильнее и
// надёжнее, чем альтернативный «зов» — заметный, но всегда более слабый
// способ звать агентов, потому что он способен лишь подсказать сенсорам
// направление, а не написать в курс напрямую, как это делает снос).
// Сетка следа подстраивается под размер сцены (260–600), чтобы на узком
// экране телефона считать меньше клеток, чем на широком мониторе.

import { reportEvent } from '../progress.js?v=5';

const STEP = 1 / 60;
const SPEED = 0.006;
const STREAK_STEPS = 3;
const DIFFUSE = 0.25;

const T_BAR_Y = 0.22;
const T_BAR_LEFT = 0.16;
const T_BAR_RIGHT = 0.84;
const T_STEM_X = 0.5;
const T_STEM_BOTTOM = 0.86;

const PARAMS_DEFAULTS = {
  agents: 9600,
  brush: 0.03,
  sensorAngle: 0.7,
  sensorDist: 0.025,
  turnSpeed: 0.05,
  decay: 0.3,
  drift: 0.035,
  barThick: 0.02,
  stemThick: 0.04,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap = (v) => ((v % 1) + 1) % 1;

function closestOnRect(px, py, r) {
  return { x: clamp(px, r.x0, r.x1), y: clamp(py, r.y0, r.y1) };
}

export function mountT(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  canvas.style.cursor = 'crosshair';

  const params = { ...PARAMS_DEFAULTS };
  const state = { bloom: true, streak: true };
  const pointer = { x: 0.5, y: 0.5, down: false, moved: false };

  let W = 1, H = 1, S = 1, ox = 0, oy = 0, dpr = 1;
  let last = performance.now();
  let debt = 0;
  let frameId = 0;
  let sent = false;

  let GRID = 0;
  let offscreen, offCtx, imageData;
  let trail, next, agents;

  function barRect() {
    const t = params.barThick;
    return { x0: T_BAR_LEFT, y0: T_BAR_Y - t / 2, x1: T_BAR_RIGHT, y1: T_BAR_Y + t / 2 };
  }

  function stemRect() {
    const t = params.stemThick;
    const bar = barRect();
    return { x0: T_STEM_X - t / 2, y0: bar.y0, x1: T_STEM_X + t / 2, y1: T_STEM_BOTTOM };
  }

  function nearestLetter(x, y, bar, stem) {
    const cBar = closestOnRect(x, y, bar);
    const cStem = closestOnRect(x, y, stem);
    const dBar = Math.hypot(x - cBar.x, y - cBar.y);
    const dStem = Math.hypot(x - cStem.x, y - cStem.y);
    return dBar < dStem ? { x: cBar.x, y: cBar.y, dist: dBar } : { x: cStem.x, y: cStem.y, dist: dStem };
  }

  function reset() {
    trail = new Float32Array(GRID * GRID);
    next = new Float32Array(GRID * GRID);
    const count = Math.round(params.agents);
    agents = [];
    for (let i = 0; i < count; i += 1) {
      agents.push({ x: Math.random(), y: Math.random(), heading: Math.random() * Math.PI * 2 });
    }
  }

  // Сетка следа не фиксирована: на маленьком экране считать 600×600 клеток
  // незачем и накладно, а на широком мониторе меньшая сетка размоет картинку.
  function setGrid(size) {
    GRID = size;
    offscreen = document.createElement('canvas');
    offscreen.width = GRID;
    offscreen.height = GRID;
    offCtx = offscreen.getContext('2d');
    imageData = offCtx.createImageData(GRID, GRID);
    reset();
  }

  function sense(x, y, heading, offset) {
    const sx = wrap(x + Math.cos(heading + offset) * params.sensorDist);
    const sy = wrap(y + Math.sin(heading + offset) * params.sensorDist);
    const gx = clamp(Math.floor(sx * GRID), 0, GRID - 1);
    const gy = clamp(Math.floor(sy * GRID), 0, GRID - 1);
    return trail[gy * GRID + gx];
  }

  function paint(cx, cy, radius) {
    const rGrid = Math.max(1, Math.round(radius * GRID));
    const gx0 = Math.floor(cx * GRID), gy0 = Math.floor(cy * GRID);
    for (let dy = -rGrid; dy <= rGrid; dy += 1) {
      const gy = gy0 + dy;
      if (gy < 0 || gy >= GRID) continue;
      for (let dx = -rGrid; dx <= rGrid; dx += 1) {
        const gx = gx0 + dx;
        if (gx < 0 || gx >= GRID) continue;
        const d = Math.hypot(dx, dy) / rGrid;
        if (d > 1) continue;
        const idx = gy * GRID + gx;
        trail[idx] = Math.max(trail[idx], (1 - d) * 1.4);
      }
    }
  }

  function step() {
    const decay = params.decay;
    for (let y = 0; y < GRID; y += 1) {
      for (let x = 0; x < GRID; x += 1) {
        const here = trail[y * GRID + x];
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= GRID) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            if (xx < 0 || xx >= GRID) continue;
            sum += trail[yy * GRID + xx];
            n += 1;
          }
        }
        const blurred = sum / n;
        next[y * GRID + x] = (here * (1 - DIFFUSE) + blurred * DIFFUSE) * (1 - decay);
      }
    }
    [trail, next] = [next, trail];

    if (pointer.down) paint(pointer.x, pointer.y, params.brush);

    const sensorAngle = params.sensorAngle;
    const turnSpeed = params.turnSpeed;
    const drift = params.drift;
    const bar = drift > 0 ? barRect() : null;
    const stem = drift > 0 ? stemRect() : null;
    const streak = state.streak;

    for (const a of agents) {
      const left = sense(a.x, a.y, a.heading, sensorAngle);
      const center = sense(a.x, a.y, a.heading, 0);
      const right = sense(a.x, a.y, a.heading, -sensorAngle);

      if (left > center && left > right) a.heading += turnSpeed;
      else if (right > center && right > left) a.heading -= turnSpeed;
      else if (center < left || center < right) a.heading += (Math.random() - 0.5) * turnSpeed;

      if (drift > 0) {
        const target = nearestLetter(a.x, a.y, bar, stem);
        if (target.dist > 1e-6) {
          const desired = Math.atan2(target.y - a.y, target.x - a.x);
          const diff = Math.atan2(Math.sin(desired - a.heading), Math.cos(desired - a.heading));
          a.heading += diff * drift;
        }
      }

      const px = a.x, py = a.y;
      a.x = wrap(a.x + Math.cos(a.heading) * SPEED);
      a.y = wrap(a.y + Math.sin(a.heading) * SPEED);

      if (streak) {
        for (let s = 1; s <= STREAK_STEPS; s += 1) {
          const t = s / STREAK_STEPS;
          const ix = wrap(px + (a.x - px) * t);
          const iy = wrap(py + (a.y - py) * t);
          const gx = clamp(Math.floor(ix * GRID), 0, GRID - 1);
          const gy = clamp(Math.floor(iy * GRID), 0, GRID - 1);
          const idx = gy * GRID + gx;
          trail[idx] = Math.min(1, trail[idx] + 0.4 / STREAK_STEPS);
        }
      } else {
        const gx = clamp(Math.floor(a.x * GRID), 0, GRID - 1);
        const gy = clamp(Math.floor(a.y * GRID), 0, GRID - 1);
        const idx = gy * GRID + gx;
        trail[idx] = Math.min(1, trail[idx] + 0.4);
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    const data = imageData.data;
    for (let i = 0; i < GRID * GRID; i += 1) {
      data[i * 4] = 241; data[i * 4 + 1] = 237; data[i * 4 + 2] = 229;
      data[i * 4 + 3] = Math.min(255, Math.pow(clamp(trail[i], 0, 1), 0.6) * 255);
    }
    offCtx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, 0, 0, GRID, GRID, ox, oy, S, S);

    if (state.bloom) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      ctx.filter = `blur(${Math.max(1, S * 0.01)}px)`;
      ctx.drawImage(offscreen, 0, 0, GRID, GRID, ox, oy, S, S);
      ctx.restore();
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.min(W, H);
    ox = (W - S) / 2;
    oy = (H - S) / 2;

    const wanted = Math.round(clamp(S, 260, 600));
    if (wanted !== GRID) setGrid(wanted);
  }

  function track(event) {
    pointer.x = clamp((event.clientX - canvas.getBoundingClientRect().left - ox) / S, 0, 1);
    pointer.y = clamp((event.clientY - canvas.getBoundingClientRect().top - oy) / S, 0, 1);
  }

  function onDown(event) {
    track(event);
    pointer.down = true;
    pointer.moved = false;
    try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* Safari может отказать */ }
  }

  function onMove(event) {
    track(event);
    if (pointer.down) pointer.moved = true;
  }

  function onUp() {
    if (pointer.down && pointer.moved && !sent) {
      sent = true;
      reportEvent('Т');
    }
    pointer.down = false;
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'веди пальцем или мышью — слизь тянется за твоим следом';

  function buildControls() {
    const panel = document.createElement('div');
    panel.className = 'sketch-panel sketch-panel-t';
    panel.dataset.letterLayer = '';
    panel.hidden = true;

    const note = document.createElement('p');
    note.textContent = 'настройки самой слизи и того, как сильно её зовёт форма Т';
    panel.append(note);

    for (const [key, label, min, max, step] of [
      ['agents', 'агенты', 1000, 16000, 500],
      ['brush', 'кисть', 0.01, 0.08, 0.005],
      ['sensorAngle', 'угол', 0.15, 1.4, 0.05],
      ['sensorDist', 'нюх', 0.01, 0.05, 0.005],
      ['turnSpeed', 'поворот', 0.05, 0.5, 0.02],
      ['decay', 'угасание', 0.02, 0.3, 0.02],
      ['drift', 'снос', 0, 0.2, 0.005],
      ['barThick', 'толщина бара', 0.02, 0.22, 0.01],
      ['stemThick', 'толщина ствола', 0.04, 0.32, 0.01],
    ]) {
      const field = document.createElement('label');
      field.textContent = label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = min;
      input.max = max;
      input.step = step;
      input.value = params[key];
      input.addEventListener('input', () => {
        params[key] = Number(input.value);
        if (key === 'agents') reset();
      });
      field.append(input);
      panel.append(field);
    }

    function toggleButton(key, label) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sketch-switch';
      button.textContent = label;
      button.setAttribute('aria-pressed', String(state[key]));
      button.addEventListener('click', () => {
        state[key] = !state[key];
        button.setAttribute('aria-pressed', String(state[key]));
      });
      panel.append(button);
    }
    toggleButton('bloom', 'свечение');
    toggleButton('streak', 'смаз');

    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'sketch-action';
    again.textContent = 'заново';
    again.addEventListener('click', reset);
    panel.append(again);

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

    return { panel, toggle };
  }

  const controls = buildControls();

  function onKeyDown(event) {
    if (event.target instanceof Element && event.target.closest('input, textarea, select')) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      controls.toggle.click();
    }
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

  const observer = new ResizeObserver(resize);
  observer.observe(workspace);
  workspace.append(hint, controls.panel, controls.toggle);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  document.addEventListener('keydown', onKeyDown);

  resize();
  last = performance.now();
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    observer.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.removeEventListener('keydown', onKeyDown);
    hint.remove();
    controls.panel.remove();
    controls.toggle.remove();
    canvas.style.cursor = '';
    ctx.clearRect(0, 0, W, H);
  };
}
