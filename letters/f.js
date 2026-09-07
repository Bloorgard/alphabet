import { reportEvent } from '../progress.js?v=5';

const STEP = 1 / 60;
const INK = '#161616';
const PAPER = '#f1ede5';

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
// Полуширина разделителя: тоньше — и волна начинает просачиваться сквозь него.
const BAR = .005;

// Отобранная в полигоне симметричная композиция. Излучатель ровно в центре;
// четыре разделителя задают две чаши и центральный стержень Ф.
const START = {
  sources: [{ x: 160 / 320, y: 160 / 320, period: 6.7, next: 0 }],
  blockers: [
    { x: 131 / 320, y: 175 / 320, radius: BAR, points: [{ x: 0, y: 0 }, { x: 58 / 320, y: 0 }] },
    { x: 160 / 320, y: 183 / 320, radius: BAR, points: [{ x: 0, y: 0 }, { x: 0, y: 52 / 320 }] },
    { x: 131 / 320, y: 145 / 320, radius: BAR, points: [{ x: 0, y: 0 }, { x: 58 / 320, y: 0 }] },
    { x: 160 / 320, y: 85 / 320, radius: BAR, points: [{ x: 0, y: 0 }, { x: 0, y: 52 / 320 }] },
  ],
};

const cloneStart = () => ({
  sources: START.sources.map((source) => ({ ...source })),
  blockers: START.blockers.map((blocker) => ({ ...blocker, points: blocker.points.map((point) => ({ ...point })) })),
});

export function mountF(workspace) {
  delete workspace.dataset.ground;
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const state = {
    sources: [], blockers: [], paused: false, selected: null, dragging: null,
    marks: true, fade: 1.2, grain: true, touched: false,
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
  let removeButton = null;

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
        if (!mask[i] || (xx + .5 - cx) ** 2 + (yy + .5 - cy) ** 2 > r * r) continue;
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
          const px = (x + .5) / N - blocker.x - start.x, py = (y + .5) / N - blocker.y - start.y;
          const t = clamp((px * dx + py * dy) / (length || 1), 0, 1);
          if ((px - t * dx) ** 2 + (py - t * dy) ** 2 <= blocker.radius ** 2) cut[y * N + x] = 1;
        }
      }
    }
  }

  function clearWaves() {
    u.fill(0); v.fill(0); next.fill(0); trail.fill(0);
    rebuildBlockers();
    for (const source of state.sources) source.next = time;
  }

  // Возвращает не только расстановку, но и чистую среду: иначе на месте буквы
  // остаются спирали от прежних обрывов и «вернуть» ничего не возвращает.
  function restore() {
    const start = cloneStart();
    state.sources = start.sources;
    state.blockers = start.blockers;
    state.selected = null;
    state.dragging = null;
    clearWaves();
    updatePanel();
  }

  function reset() {
    time = 0; trailTime = 0; debt = 0;
    buildVessel();
    restore();
    for (let i = 0; i < WARM; i++) step();
  }

  function step() {
    for (const source of state.sources) if (time >= source.next) { disk(source.x, source.y, .014, true); source.next += source.period; }
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
      }
    }
    renderContext.putImageData(image, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, ox, oy);
    ctx.drawImage(renderCanvas, 0, 0, S, S);
    ctx.lineCap = 'round';
    if (!state.marks) return;
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
    // Концы выбранного разделителя берутся рукой: за них он поворачивается
    // и растягивается, иначе новый остался бы навсегда горизонтальным.
    if (state.selected?.points) {
      const blocker = state.selected;
      ctx.fillStyle = INK; ctx.strokeStyle = PAPER; ctx.lineWidth = 1;
      for (const point of blocker.points) {
        ctx.beginPath(); ctx.arc(screen(blocker.x + point.x), screen(blocker.y + point.y), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    ctx.fillStyle = INK; ctx.strokeStyle = PAPER; ctx.lineWidth = 1.5;
    for (const source of state.sources) {
      const x = screen(source.x), y = screen(source.y);
      ctx.beginPath(); ctx.arc(x, y, state.selected === source ? 9 : 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x - 8, y); ctx.moveTo(x + 8, y); ctx.lineTo(x + 12, y); ctx.stroke();
    }
    // Подпись держится у выбранного, а не в углу кадра: угол занят «параметрами».
    if (state.selected) {
      const item = state.selected;
      const anchor = item.points ? item.points[0] : { x: 0, y: 0 };
      const x = screen(item.x + anchor.x), y = screen(item.y + anchor.y);
      ctx.font = '10px DM Mono, monospace'; ctx.fillStyle = PAPER;
      ctx.textAlign = x > S - 90 ? 'right' : 'left';
      ctx.fillText(item.points ? 'разделитель' : 'излучатель', x + (ctx.textAlign === 'right' ? -13 : 13), y - 11);
      ctx.textAlign = 'left';
    }
  }

  function sourceAt(point) {
    const radius = 18 / S * .76;
    return state.sources.find((source) => Math.hypot(point.x - source.x, point.y - source.y) < radius) || null;
  }
  function blockerAt(point) {
    const radius = 18 / S * .76;
    return state.blockers.find((blocker) => blockerDistance(blocker, point) < blocker.radius + radius) || null;
  }
  function handleAt(point) {
    const blocker = state.selected;
    if (!blocker?.points) return null;
    const radius = 14 / S * .76;
    for (let i = 0; i < blocker.points.length; i++) {
      const end = blocker.points[i];
      if (Math.hypot(point.x - blocker.x - end.x, point.y - blocker.y - end.y) < radius) return i;
    }
    return null;
  }
  // Первая точка держит начало ломаной: сдвигая её, остальные оставляем на месте.
  function moveHandle(blocker, index, dx, dy) {
    if (index) {
      const end = blocker.points[index];
      end.x = clamp(blocker.x + end.x + dx, .12, .88) - blocker.x;
      end.y = clamp(blocker.y + end.y + dy, .12, .88) - blocker.y;
    } else {
      const x = clamp(blocker.x + dx, .12, .88), y = clamp(blocker.y + dy, .12, .88);
      for (let i = 1; i < blocker.points.length; i++) { blocker.points[i].x -= x - blocker.x; blocker.points[i].y -= y - blocker.y; }
      blocker.x = x; blocker.y = y;
    }
    rebuildBlockers();
  }
  // Новое рождается в центре кадра; если там уже занято — на соседнем витке,
  // чтобы не встать точно поверх соседа.
  function freeSpot() {
    for (let k = 0; k < 12; k++) {
      const angle = k * 2.4, distance = k ? .1 + k * .014 : 0;
      const spot = { x: .5 + Math.cos(angle) * distance, y: .5 + Math.sin(angle) * distance };
      const taken = state.sources.some((source) => Math.hypot(source.x - spot.x, source.y - spot.y) < .09)
        || state.blockers.some((blocker) => blockerDistance(blocker, spot) < .09);
      if (!taken) return spot;
    }
    return { x: .5, y: .5 };
  }
  function addSource(spot) {
    const source = { x: clamp(spot.x, .15, .85), y: clamp(spot.y, .15, .85), period: 6.7, next: time };
    state.sources.push(source);
    state.selected = source;
    updatePanel();
  }
  function addBlocker() {
    const spot = freeSpot();
    const blocker = { x: spot.x - .06, y: spot.y, radius: BAR, points: [{ x: 0, y: 0 }, { x: .12, y: 0 }] };
    state.blockers.push(blocker);
    state.selected = blocker;
    rebuildBlockers();
    updatePanel();
  }
  function removeSelected() {
    const item = state.selected;
    if (!item) return;
    if (item.points) { state.blockers.splice(state.blockers.indexOf(item), 1); rebuildBlockers(); }
    else state.sources.splice(state.sources.indexOf(item), 1);
    state.selected = null;
    state.dragging = null;
    updatePanel();
  }

  function updatePanel() { if (removeButton) removeButton.disabled = !state.selected; }
  function report() { if (!sent) { sent = true; reportEvent('Ф'); } }
  function onDown(event) {
    track(event); pointer.down = true; canvas.setPointerCapture(event.pointerId);
    const handle = handleAt(pointer);
    if (handle === null) state.selected = sourceAt(pointer) || blockerAt(pointer);
    state.dragging = state.selected ? { x: pointer.x, y: pointer.y, item: state.selected, handle } : null;
    if (!state.selected) disk(pointer.x, pointer.y, .014, true);
    updatePanel();
    report();
  }
  function onDoubleClick(event) {
    track(event);
    const item = sourceAt(pointer) || blockerAt(pointer);
    if (item) { state.selected = item; removeSelected(); return; }
    addSource(pointer);
  }
  function onMove(event) {
    track(event);
    // Потерянный pointerup оставлял протяжку висеть, и выбранное продолжало
    // ехать за любым движением мыши. Кнопка отпущена — значит, тянуть нечего.
    if (pointer.down && event.pointerType === 'mouse' && !event.buttons) onUp();
    const drag = state.dragging;
    if (!pointer.down || !drag) return;
    const dx = pointer.x - drag.x, dy = pointer.y - drag.y;
    if (drag.handle !== null) moveHandle(drag.item, drag.handle, dx, dy);
    else if (drag.item.points) { drag.item.x = clamp(drag.item.x + dx, .12, .88); drag.item.y = clamp(drag.item.y + dy, .12, .88); rebuildBlockers(); }
    else { drag.item.x = clamp(drag.item.x + dx, .15, .85); drag.item.y = clamp(drag.item.y + dy, .15, .85); }
    drag.x = pointer.x; drag.y = pointer.y;
    report();
  }
  function onUp() { pointer.down = false; state.dragging = null; }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint'; hint.dataset.letterLayer = '';
  hint.textContent = 'тяните излучатели и разделители · касание пустого места — импульс, двойное — новый излучатель · двойной клик по объекту удаляет · С очищает волны';
  const panel = document.createElement('div');
  panel.className = 'sketch-panel'; panel.dataset.letterLayer = ''; panel.hidden = true;
  const pause = document.createElement('button');
  pause.type = 'button'; pause.className = 'sketch-action';
  const setPause = () => { pause.textContent = state.paused ? 'запустить' : 'пауза'; };
  pause.addEventListener('click', () => { state.paused = !state.paused; setPause(); });
  const clear = document.createElement('button');
  clear.type = 'button'; clear.className = 'sketch-action'; clear.textContent = 'очистить волны';
  clear.addEventListener('click', clearWaves);
  const addEmitter = document.createElement('button');
  addEmitter.type = 'button'; addEmitter.className = 'sketch-action'; addEmitter.textContent = '+ излучатель';
  addEmitter.addEventListener('click', () => addSource(freeSpot()));
  const addDivider = document.createElement('button');
  addDivider.type = 'button'; addDivider.className = 'sketch-action'; addDivider.textContent = '+ разделитель';
  addDivider.addEventListener('click', addBlocker);
  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'sketch-action'; remove.textContent = 'удалить выбранное'; remove.disabled = true;
  remove.addEventListener('click', removeSelected);
  removeButton = remove;
  const back = document.createElement('button');
  back.type = 'button'; back.className = 'sketch-action'; back.textContent = 'вернуть букву';
  back.addEventListener('click', restore);
  const marks = document.createElement('button');
  marks.type = 'button'; marks.className = 'sketch-switch'; marks.textContent = 'разметка'; marks.setAttribute('aria-pressed', 'true');
  marks.addEventListener('click', () => { state.marks = !state.marks; marks.setAttribute('aria-pressed', String(state.marks)); });
  const noise = document.createElement('button');
  noise.type = 'button'; noise.className = 'sketch-switch'; noise.textContent = 'зерно'; noise.setAttribute('aria-pressed', 'true');
  noise.addEventListener('click', () => { state.grain = !state.grain; noise.setAttribute('aria-pressed', String(state.grain)); });
  const fadeLabel = document.createElement('label'); fadeLabel.textContent = 'память волн';
  const fade = document.createElement('input'); fade.type = 'range'; fade.min = '.3'; fade.max = '3'; fade.step = '.1'; fade.value = String(state.fade);
  fade.addEventListener('input', () => { state.fade = Number(fade.value); }); fadeLabel.append(fade);
  panel.append(pause, clear, addEmitter, addDivider, remove, back, marks, noise, fadeLabel);
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'sketch-toggle'; toggle.dataset.letterLayer = ''; toggle.textContent = 'параметры (tab)'; toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); });
  function onKey(event) { if (event.target.closest('input, textarea, select')) return; if (event.key === 'Tab') { event.preventDefault(); toggle.click(); } if (event.code === 'Space') { event.preventDefault(); pause.click(); } if (event.code === 'KeyC') { event.preventDefault(); clear.click(); } }
  function frame(now) {
    debt = Math.min(.1, debt + (now - last) / 1000); last = now;
    while (!state.paused && debt >= STEP) { for (let k = 0; k < SUBSTEPS; k++) step(); debt -= STEP; }
    draw(); frameId = requestAnimationFrame(frame);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(workspace); workspace.append(hint, panel, toggle); resize(); reset(); setPause();
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp); canvas.addEventListener('dblclick', onDoubleClick); document.addEventListener('keydown', onKey);
  frameId = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(frameId); observer.disconnect(); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('dblclick', onDoubleClick); document.removeEventListener('keydown', onKey); hint.remove(); panel.remove(); toggle.remove(); ctx.clearRect(0, 0, W, H);
  };
}
