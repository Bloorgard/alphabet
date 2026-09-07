import { reportEvent } from '../progress.js?v=5';

const STEP = 1 / 60;
const INK = '#161616';
const PAPER = '#f1ede5';
const RED = '#e0210f';

const N = 320;
const COUNT = N * N;
const DT = .012;
const SUBSTEPS = 4;
const WARM = 1200;
const A = .75;
const B = .02;
const EPS = .02;
const DIFF = 1 / (.6 * .6);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Отобранная в полигоне симметричная композиция. Источник ровно в центре;
// четыре световые маски задают две чаши и центральный стержень Ф.
const START = {
  source: { x: 160 / 320, y: 160 / 320, period: 6.7, next: 0 },
  blockers: [
    { x: 131 / 320, y: 175 / 320, radius: .008, points: [{ x: 0, y: 0 }, { x: 58 / 320, y: 0 }] },
    { x: 160 / 320, y: 183 / 320, radius: .008, points: [{ x: 0, y: 0 }, { x: 0, y: 52 / 320 }] },
    { x: 131 / 320, y: 145 / 320, radius: .008, points: [{ x: 0, y: 0 }, { x: 58 / 320, y: 0 }] },
    { x: 160 / 320, y: 85 / 320, radius: .008, points: [{ x: 0, y: 0 }, { x: 0, y: 52 / 320 }] },
  ],
};

const cloneStart = () => ({
  source: { ...START.source },
  blockers: START.blockers.map((blocker) => ({ ...blocker, points: blocker.points.map((point) => ({ ...point })) })),
});

export function mountF(workspace) {
  delete workspace.dataset.ground;
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const state = {
    source: null, blockers: [], paused: false, selected: null, dragging: null,
    showMasks: false, fade: 1.2, grain: true, touched: false,
  };
  const pointer = { x: 0, y: 0, down: false };
  let u = new Float32Array(COUNT);
  const v = new Float32Array(COUNT);
  let next = new Float32Array(COUNT);
  const cut = new Uint8Array(COUNT);
  const mask = new Uint8Array(COUNT);
  const neighbors = new Int32Array(COUNT * 8);
  let active = new Int32Array(0);
  const RENDER = 480;
  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = renderCanvas.height = RENDER;
  const renderContext = renderCanvas.getContext('2d');
  const image = renderContext.createImageData(RENDER, RENDER);
  const trail = new Float32Array(RENDER * RENDER);
  const grain = new Float32Array(RENDER * RENDER);
  const gx = new Int32Array(RENDER);
  const gf = new Float32Array(RENDER);
  let W = 1, H = 1, S = 1, ox = 0, oy = 0, dpr = 1;
  let last = performance.now(), debt = 0, time = 0, trailTime = 0, frameId = 0;
  let sent = false;

  for (let i = 0; i < grain.length; i++) {
    let hash = Math.imul(i + 731, 374761393);
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    grain[i] = (hash >>> 0) / 4294967296;
  }
  for (let x = 0; x < RENDER; x++) {
    const value = clamp((.12 + (x + .5) / RENDER * .76) * N - .5, 0, N - 1.001);
    gx[x] = Math.floor(value);
    gf[x] = value - gx[x];
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    S = Math.min(W, H);
    ox = (W - S) / 2;
    oy = (H - S) / 2;
  }

  function track(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = .12 + clamp((event.clientX - rect.left - ox) / S, 0, 1) * .76;
    pointer.y = .12 + clamp((event.clientY - rect.top - oy) / S, 0, 1) * .76;
  }

  function buildVessel() {
    const inside = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      mask[i] = x > 0 && x < N - 1 && y > 0 && y < N - 1 ? 1 : 0;
      if (mask[i]) inside.push(i);
    }
    active = Int32Array.from(inside);
    const offsets = [-1, 1, -N, N, -N - 1, -N + 1, N - 1, N + 1];
    for (const i of active) for (let k = 0; k < 8; k++) neighbors[i * 8 + k] = mask[i + offsets[k]] ? i + offsets[k] : i;
  }

  function disk(x, y, radius, excitation) {
    const cx = x * N, cy = y * N, r = radius * N;
    for (let yy = Math.max(1, Math.floor(cy - r)); yy < Math.min(N - 1, Math.ceil(cy + r)); yy++) {
      for (let xx = Math.max(1, Math.floor(cx - r)); xx < Math.min(N - 1, Math.ceil(cx + r)); xx++) {
        const i = yy * N + xx;
        if (!mask[i] || (xx - cx) ** 2 + (yy - cy) ** 2 > r * r) continue;
        if (excitation) { if (!cut[i] && v[i] < .18) u[i] = 1; }
        else { cut[i] = 1; u[i] = 0; v[i] = .85; }
      }
    }
  }

  function rebuildBlockers() {
    cut.fill(0);
    for (const blocker of state.blockers) {
      for (let part = 0; part < blocker.points.length; part++) {
        const start = blocker.points[Math.max(0, part - 1)];
        const end = blocker.points[part];
        const minX = Math.max(0, Math.floor((blocker.x + Math.min(start.x, end.x) - blocker.radius) * N));
        const maxX = Math.min(N - 1, Math.ceil((blocker.x + Math.max(start.x, end.x) + blocker.radius) * N));
        const minY = Math.max(0, Math.floor((blocker.y + Math.min(start.y, end.y) - blocker.radius) * N));
        const maxY = Math.min(N - 1, Math.ceil((blocker.y + Math.max(start.y, end.y) + blocker.radius) * N));
        const dx = end.x - start.x, dy = end.y - start.y, length = dx * dx + dy * dy;
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
          const px = x / N - blocker.x - start.x, py = y / N - blocker.y - start.y;
          const t = clamp((px * dx + py * dy) / (length || 1), 0, 1);
          if ((px - t * dx) ** 2 + (py - t * dy) ** 2 <= blocker.radius ** 2) cut[y * N + x] = 1;
        }
      }
    }
  }

  function reset() {
    const start = cloneStart();
    state.source = start.source;
    state.blockers = start.blockers;
    state.selected = null;
    state.dragging = null;
    u.fill(0); v.fill(0); next.fill(0); trail.fill(0);
    time = 0; trailTime = 0; debt = 0;
    buildVessel();
    rebuildBlockers();
    for (let i = 0; i < WARM; i++) step();
  }

  function step() {
    if (time >= state.source.next) { disk(state.source.x, state.source.y, .014, true); state.source.next += state.source.period; }
    for (let j = 0; j < active.length; j++) {
      const i = active[j];
      if (cut[i]) { next[i] = 0; v[i] = .85; continue; }
      const q = i * 8, value = u[i], recovery = v[i];
      const lap = (4 * (u[neighbors[q]] + u[neighbors[q + 1]] + u[neighbors[q + 2]] + u[neighbors[q + 3]]) + u[neighbors[q + 4]] + u[neighbors[q + 5]] + u[neighbors[q + 6]] + u[neighbors[q + 7]] - 20 * value) / 6;
      next[i] = value + DT * (DIFF * lap + value * (1 - value) * (value - (recovery + B) / A) / EPS);
      v[i] = recovery + DT * (value - recovery);
    }
    const swap = u; u = next; next = swap;
    time += DT;
  }

  function screen(value) { return (value - .12) / .76 * S; }
  function blockerDistance(blocker, point) {
    let nearest = Infinity;
    for (let i = 0; i < blocker.points.length; i++) {
      const a = blocker.points[Math.max(0, i - 1)], b = blocker.points[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = clamp(((point.x - blocker.x - a.x) * dx + (point.y - blocker.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      nearest = Math.min(nearest, Math.hypot(point.x - blocker.x - a.x - dx * t, point.y - blocker.y - a.y - dy * t));
    }
    return nearest;
  }

  function draw() {
    const data = image.data;
    const decay = Math.exp(-(time - trailTime) / (2.8 * state.fade));
    trailTime = time;
    for (let y = 0; y < RENDER; y++) {
      const row = gx[y] * N, fy = gf[y];
      for (let x = 0; x < RENDER; x++) {
        const i = row + gx[x], fx = gf[x];
        const upper = u[i] + fx * (u[i + 1] - u[i]);
        const lower = u[i + N] + fx * (u[i + N + 1] - u[i + N]);
        const value = upper + fy * (lower - upper);
        const top = v[i] + fx * (v[i + 1] - v[i]);
        const bottom = v[i + N] + fx * (v[i + N + 1] - v[i + N]);
        const recovery = top + fy * (bottom - top);
        let coverage = clamp(Math.min((value - .35) / .06, (.13 - recovery) / .012) + .5, 0, 1);
        const index = y * RENDER + x;
        trail[index] = Math.max(coverage, trail[index] * decay);
        coverage = Math.max(coverage, trail[index] * .5);
        if (state.grain) coverage = clamp(coverage + (grain[index] - .5) * (.025 + Math.sqrt(coverage) * .22), 0, 1);
        const p = 22 + coverage * 219;
        const k = index * 4;
        data[k] = p; data[k + 1] = p - coverage * 4; data[k + 2] = p - coverage * 11; data[k + 3] = 255;
        if (state.showMasks && cut[i]) { data[k] = 160; data[k + 1] = 37; data[k + 2] = 23; }
      }
    }
    renderContext.putImageData(image, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, ox, oy);
    ctx.drawImage(renderCanvas, 0, 0, S, S);
    ctx.lineCap = 'round';
    for (const blocker of state.blockers) {
      const selected = blocker === state.selected;
      ctx.strokeStyle = selected ? PAPER : 'rgba(241,237,229,.52)';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      blocker.points.forEach((point, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, screen(blocker.x + point.x), screen(blocker.y + point.y)));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const source = state.source;
    ctx.fillStyle = INK; ctx.strokeStyle = PAPER; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(screen(source.x), screen(source.y), state.selected === source ? 9 : 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(screen(source.x) - 12, screen(source.y)); ctx.lineTo(screen(source.x) - 8, screen(source.y)); ctx.moveTo(screen(source.x) + 8, screen(source.y)); ctx.lineTo(screen(source.x) + 12, screen(source.y)); ctx.stroke();
    if (state.selected) {
      ctx.font = '10px DM Mono, monospace'; ctx.fillStyle = PAPER;
      const label = state.selected === source ? 'источник' : 'световая маска';
      ctx.fillText(label, 14, S - 18);
    }
  }

  function report() { if (!sent) { sent = true; reportEvent('Ф'); } }
  function onDown(event) {
    track(event); pointer.down = true; canvas.setPointerCapture(event.pointerId);
    const radius = 18 / S * .76;
    if (Math.hypot(pointer.x - state.source.x, pointer.y - state.source.y) < radius) state.selected = state.source;
    else state.selected = state.blockers.find((blocker) => blockerDistance(blocker, pointer) < blocker.radius + radius) || null;
    state.dragging = state.selected ? { x: pointer.x, y: pointer.y, item: state.selected } : null;
    if (!state.selected) disk(pointer.x, pointer.y, .014, true);
    report();
  }
  function onMove(event) {
    track(event);
    const drag = state.dragging;
    if (!pointer.down || !drag) return;
    const dx = pointer.x - drag.x, dy = pointer.y - drag.y;
    if (drag.item === state.source) { state.source.x = clamp(state.source.x + dx, .15, .85); state.source.y = clamp(state.source.y + dy, .15, .85); }
    else { drag.item.x = clamp(drag.item.x + dx, .12, .88); drag.item.y = clamp(drag.item.y + dy, .12, .88); rebuildBlockers(); }
    drag.x = pointer.x; drag.y = pointer.y;
    report();
  }
  function onUp() { pointer.down = false; state.dragging = null; }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint'; hint.dataset.letterLayer = '';
  hint.textContent = 'тяните центральный источник или пунктирные световые маски · касание вне них запускает один импульс';
  const panel = document.createElement('div');
  panel.className = 'sketch-panel'; panel.dataset.letterLayer = ''; panel.hidden = true;
  const pause = document.createElement('button');
  pause.type = 'button'; pause.className = 'sketch-action';
  const setPause = () => { pause.textContent = state.paused ? 'запустить' : 'пауза'; };
  pause.addEventListener('click', () => { state.paused = !state.paused; setPause(); });
  const clear = document.createElement('button');
  clear.type = 'button'; clear.className = 'sketch-action'; clear.textContent = 'очистить волны';
  clear.addEventListener('click', () => { u.fill(0); v.fill(0); next.fill(0); trail.fill(0); rebuildBlockers(); });
  const masks = document.createElement('button');
  masks.type = 'button'; masks.className = 'sketch-switch'; masks.textContent = 'показывать свет'; masks.setAttribute('aria-pressed', 'false');
  masks.addEventListener('click', () => { state.showMasks = !state.showMasks; masks.setAttribute('aria-pressed', String(state.showMasks)); });
  const noise = document.createElement('button');
  noise.type = 'button'; noise.className = 'sketch-switch'; noise.textContent = 'зерно'; noise.setAttribute('aria-pressed', 'true');
  noise.addEventListener('click', () => { state.grain = !state.grain; noise.setAttribute('aria-pressed', String(state.grain)); });
  const fadeLabel = document.createElement('label'); fadeLabel.textContent = 'память волн';
  const fade = document.createElement('input'); fade.type = 'range'; fade.min = '.3'; fade.max = '3'; fade.step = '.1'; fade.value = String(state.fade);
  fade.addEventListener('input', () => { state.fade = Number(fade.value); }); fadeLabel.append(fade);
  panel.append(pause, clear, masks, noise, fadeLabel);
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'sketch-toggle'; toggle.dataset.letterLayer = ''; toggle.textContent = 'параметры (tab)'; toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); });
  function onKey(event) { if (event.target.closest('input, textarea, select')) return; if (event.key === 'Tab') { event.preventDefault(); toggle.click(); } if (event.code === 'Space') { event.preventDefault(); pause.click(); } }
  function frame(now) {
    debt = Math.min(.1, debt + (now - last) / 1000); last = now;
    while (!state.paused && debt >= STEP) { for (let k = 0; k < SUBSTEPS; k++) step(); debt -= STEP; }
    draw(); frameId = requestAnimationFrame(frame);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(workspace); workspace.append(hint, panel, toggle); resize(); reset(); setPause();
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp); document.addEventListener('keydown', onKey);
  frameId = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(frameId); observer.disconnect(); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); document.removeEventListener('keydown', onKey); hint.remove(); panel.remove(); toggle.remove(); ctx.clearRect(0, 0, W, H);
  };
}
