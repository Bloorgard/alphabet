const HALF_ANGLE = (30 * Math.PI) / 180;
const BAR_THICKNESS = 10;
const LIGHT_RADIUS = 7;
const HIT_LIGHT = 20;
const HIT_END = 18;
const HIT_BAR = 14;

// Тень набирается из нескольких смещённых копий — так у неё появляется полутень.
const SHADOW_SAMPLES = 12;
const SAMPLE_ALPHA = 0.35;
// Свет от преграды уходит вниз, а не кругом, поэтому ореол сжат по горизонтали.
const SCATTER_SQUEEZE = 0.55;
// Неосвещённая преграда не пропадает совсем — иначе её не найти курсором.
const BAR_DIM = 0.14;

const CONTROLS = [
  { key: 'rays', label: 'лучи', min: 20, max: 400, step: 1 },
  { key: 'reach', label: 'дальность света', min: 0.15, max: 1.6, step: 0.01 },
  { key: 'fade', label: 'длина тени', min: 0.03, max: 2, step: 0.01 },
  { key: 'soft', label: 'мягкость краёв', min: 0, max: 300, step: 1 },
  { key: 'scatter', label: 'рассеяние преграды', min: 0, max: 400, step: 1 },
];

export function mountA(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');

  let W = 0;
  let H = 0;
  let initialized = false;

  const params = { rays: 120, reach: 0.62, fade: 0.45, soft: 40, scatter: 150 };
  const light = { x: 0, y: 0 };
  const bars = [];
  let rays = [];
  let drag = null;

  function buildRays() {
    rays = [];
    for (let i = 0; i < params.rays; i += 1) {
      const angle = Math.PI / 2 - HALF_ANGLE + (i / (params.rays - 1)) * 2 * HALF_ANGLE;
      rays.push({ x: Math.cos(angle), y: Math.sin(angle) });
    }
  }

  function resize() {
    const bounds = workspace.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, bounds.width);
    H = Math.max(1, bounds.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!initialized) placeDefaults();
  }

  function placeDefaults() {
    light.x = W / 2;
    light.y = H * 0.21;
    const half = W * 0.055;
    bars.length = 0;
    bars.push({ x1: W / 2 - half, x2: W / 2 + half, y: H * 0.6 });
    initialized = true;
  }

  function edges(bar) {
    return [Math.min(bar.x1, bar.x2), Math.max(bar.x1, bar.x2)];
  }

  function drawRays() {
    const maxLen = Math.hypot(W, H) * 1.2;
    const reach = H * params.reach;
    const glow = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, reach);
    glow.addColorStop(0, 'rgba(255,255,255,0.95)');
    glow.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    glow.addColorStop(0.7, 'rgba(255,255,255,0.20)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.strokeStyle = glow;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of rays) {
      ctx.moveTo(light.x, light.y);
      ctx.lineTo(light.x + d.x * maxLen, light.y + d.y * maxLen);
    }
    ctx.stroke();
  }

  // Тень вычитается из уже нарисованного света: слабеет вниз и размывается по краям.
  function drawShadow(bar) {
    if (light.y >= bar.y) return;
    const [left, right] = edges(bar);
    const len = H * params.fade;
    const fade = ctx.createLinearGradient(0, bar.y, 0, bar.y + len);
    fade.addColorStop(0, `rgba(0,0,0,${SAMPLE_ALPHA})`);
    fade.addColorStop(0.35, `rgba(0,0,0,${SAMPLE_ALPHA * 0.78})`);
    fade.addColorStop(0.7, `rgba(0,0,0,${SAMPLE_ALPHA * 0.32})`);
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fade;

    const t = len / (bar.y - light.y);
    for (let s = 0; s < SHADOW_SAMPLES; s += 1) {
      const sx = light.x + params.soft * (s / (SHADOW_SAMPLES - 1) - 0.5);
      ctx.beginPath();
      ctx.moveTo(left, bar.y);
      ctx.lineTo(right, bar.y);
      ctx.lineTo(right + (right - sx) * t, bar.y + len);
      ctx.lineTo(left + (left - sx) * t, bar.y + len);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Та же кривая затухания, что у лучей, — чтобы отражение совпадало с видимым светом.
  function lightFalloff(dist) {
    const t = dist / (H * params.reach);
    if (t >= 1) return 0;
    if (t < 0.35) return 0.95 + (0.55 - 0.95) * (t / 0.35);
    if (t < 0.7) return 0.55 + (0.2 - 0.55) * ((t - 0.35) / 0.35);
    return 0.2 * (1 - (t - 0.7) / 0.3);
  }

  // Сколько света реально доходит до точки: вне конуса и за чужой тенью — ноль.
  function lightAt(x, y, self) {
    const dx = x - light.x;
    const dy = y - light.y;
    if (dy <= 0) return 0;
    if (Math.abs(Math.atan2(dx, dy)) > HALF_ANGLE) return 0;
    for (const b of bars) {
      if (b === self || b.y <= light.y || b.y >= y) continue;
      const t = (b.y - light.y) / dy;
      const ix = light.x + dx * t;
      const [l, r] = edges(b);
      if (ix >= l && ix <= r) return 0;
    }
    return lightFalloff(Math.hypot(dx, dy));
  }

  // Освещённая часть преграды отражает свет вниз и подсвечивает тень.
  function drawScatter(bar) {
    const r = params.scatter;
    if (light.y >= bar.y || r <= 0) return;
    const [left, right] = edges(bar);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const spread = r * SCATTER_SQUEEZE;
    const steps = Math.max(1, Math.round((right - left) / (spread / 2)));
    for (let i = 0; i <= steps; i += 1) {
      const x = left + ((right - left) * i) / steps;
      const alpha = 0.5 * lightAt(x, bar.y, bar);
      if (alpha <= 0.001) continue;
      ctx.save();
      ctx.translate(x, bar.y + r * 0.3);
      ctx.scale(SCATTER_SQUEEZE, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `rgba(255,255,255,${alpha})`);
      g.addColorStop(0.5, `rgba(255,255,255,${alpha * 0.3})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    }
    ctx.restore();
  }

  // Преграда светлеет там, где на неё падает свет, но остаётся различимой в темноте.
  function drawBar(bar) {
    const [left, right] = edges(bar);
    const stops = Math.min(48, Math.max(2, Math.round((right - left) / 8)));
    const shading = ctx.createLinearGradient(left, 0, right, 0);
    for (let i = 0; i <= stops; i += 1) {
      const t = i / stops;
      const lit = lightAt(left + (right - left) * t, bar.y, bar);
      shading.addColorStop(t, `rgba(255,255,255,${BAR_DIM + (1 - BAR_DIM) * lit})`);
    }
    ctx.strokeStyle = shading;
    ctx.lineWidth = BAR_THICKNESS;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(bar.x1, bar.y);
    ctx.lineTo(bar.x2, bar.y);
    ctx.stroke();
  }

  function draw() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    drawRays();

    ctx.globalCompositeOperation = 'destination-out';
    for (const bar of bars) drawShadow(bar);
    ctx.globalCompositeOperation = 'source-over';

    for (const bar of bars) drawScatter(bar);
    for (const bar of bars) drawBar(bar);

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(light.x, light.y, LIGHT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  function hitTest(x, y) {
    if (Math.hypot(x - light.x, y - light.y) <= HIT_LIGHT) return { target: 'light' };
    for (let i = bars.length - 1; i >= 0; i -= 1) {
      const bar = bars[i];
      if (Math.hypot(x - bar.x1, y - bar.y) <= HIT_END) return { target: 'end1', index: i };
      if (Math.hypot(x - bar.x2, y - bar.y) <= HIT_END) return { target: 'end2', index: i };
      const [left, right] = edges(bar);
      if (x >= left && x <= right && Math.abs(y - bar.y) <= HIT_BAR) return { target: 'bar', index: i };
    }
    return null;
  }

  function cursorFor(hit) {
    if (!hit) return 'default';
    if (hit.target === 'end1' || hit.target === 'end2') return 'ew-resize';
    return 'grab';
  }

  function scenePoint(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function onPointerDown(event) {
    const point = scenePoint(event);
    const hit = hitTest(point.x, point.y);
    if (!hit) return;
    try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* synthetic events may lack capture */ }
    const bar = bars[hit.index];
    drag = {
      ...hit,
      ox: (hit.target === 'light' ? light.x : hit.target === 'end2' ? bar.x2 : bar.x1) - point.x,
      ox2: bar ? bar.x2 - point.x : 0,
      oy: (hit.target === 'light' ? light.y : bar.y) - point.y,
    };
    canvas.style.cursor = hit.target === 'end1' || hit.target === 'end2' ? 'ew-resize' : 'grabbing';
    event.preventDefault();
  }

  function onPointerMove(event) {
    const point = scenePoint(event);
    if (!drag) {
      canvas.style.cursor = cursorFor(hitTest(point.x, point.y));
      return;
    }
    if (drag.target === 'light') {
      light.x = point.x + drag.ox;
      light.y = point.y + drag.oy;
    } else {
      const bar = bars[drag.index];
      if (drag.target === 'bar') {
        bar.x1 = point.x + drag.ox;
        bar.x2 = point.x + drag.ox2;
        bar.y = point.y + drag.oy;
      } else if (drag.target === 'end1') {
        bar.x1 = point.x + drag.ox;
      } else {
        bar.x2 = point.x + drag.ox;
      }
    }
    draw();
  }

  function endDrag(event) {
    if (!drag) return;
    try { canvas.releasePointerCapture(event.pointerId); } catch (error) { /* pointer may already be released */ }
    drag = null;
    const point = scenePoint(event);
    canvas.style.cursor = cursorFor(hitTest(point.x, point.y));
  }

  function onDoubleClick(event) {
    const point = scenePoint(event);
    const hit = hitTest(point.x, point.y);
    if (hit && hit.target !== 'light') {
      bars.splice(hit.index, 1);
    } else if (!hit) {
      const half = W * 0.055;
      bars.push({ x1: point.x - half, x2: point.x + half, y: point.y });
    }
    draw();
  }

  function buildPanel() {
    const panel = document.createElement('div');
    panel.className = 'sketch-panel';
    panel.dataset.letterLayer = '';
    panel.hidden = true;

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
        if (control.key === 'rays') buildRays();
        draw();
      });
      label.append(input);
      panel.append(label);
    }

    const note = document.createElement('p');
    note.textContent = '2× клик — поставить или убрать преграду';
    panel.append(note);

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
    return { panel, toggle };
  }

  function onKeyDown(event) {
    if (event.key !== 'Tab') return;
    if (event.target.closest('input, textarea')) return;
    event.preventDefault();
    toggle.click();
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'перетаскивай источник и преграду';
  workspace.append(hint);

  const { panel, toggle } = buildPanel();

  const resizeObserver = new ResizeObserver(() => {
    resize();
    draw();
  });
  resizeObserver.observe(workspace);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('dblclick', onDoubleClick);
  document.addEventListener('keydown', onKeyDown);

  resize();
  buildRays();
  draw();

  return () => {
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', endDrag);
    canvas.removeEventListener('pointercancel', endDrag);
    canvas.removeEventListener('dblclick', onDoubleClick);
    document.removeEventListener('keydown', onKeyDown);
    panel.remove();
    toggle.remove();
    hint.remove();
    drag = null;
  };
}
