const RAY_COUNT = 120;
const HALF_ANGLE = (30 * Math.PI) / 180;
const BAR_THICKNESS = 10;
const LIGHT_RADIUS = 7;
const HIT_LIGHT = 20;
const HIT_END = 18;
const HIT_BAR = 14;

export function mountA(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');

  let W = 0;
  let H = 0;
  let dpr = 1;
  let initialized = false;
  let resizeObserver;

  const light = { x: 0, y: 0 };
  const bar = { x1: 0, x2: 0, y: 0 };
  let drag = null;

  function resize() {
    const bounds = workspace.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    bar.x1 = W / 2 - half;
    bar.x2 = W / 2 + half;
    bar.y = H * 0.6;
    initialized = true;
  }

  // Длина луча: до преграды, если он в неё попадает, иначе до края сцены.
  function rayLength(dx, dy, maxLen) {
    if (Math.abs(dy) < 1e-9) return maxLen;
    const t = (bar.y - light.y) / dy;
    if (t <= 0 || t >= maxLen) return maxLen;
    const x = light.x + dx * t;
    const left = Math.min(bar.x1, bar.x2);
    const right = Math.max(bar.x1, bar.x2);
    return x >= left && x <= right ? t : maxLen;
  }

  function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const maxLen = Math.hypot(W, H) * 1.2;
    const fade = H * 0.62;
    const glow = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, fade);
    glow.addColorStop(0, 'rgba(255,255,255,0.95)');
    glow.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    glow.addColorStop(0.7, 'rgba(255,255,255,0.20)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.strokeStyle = glow;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < RAY_COUNT; i += 1) {
      const t = i / (RAY_COUNT - 1);
      const angle = Math.PI / 2 - HALF_ANGLE + t * 2 * HALF_ANGLE;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const len = rayLength(dx, dy, maxLen);
      ctx.moveTo(light.x, light.y);
      ctx.lineTo(light.x + dx * len, light.y + dy * len);
    }
    ctx.stroke();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = BAR_THICKNESS;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(bar.x1, bar.y);
    ctx.lineTo(bar.x2, bar.y);
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(light.x, light.y, LIGHT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  function hitTest(x, y) {
    if (Math.hypot(x - light.x, y - light.y) <= HIT_LIGHT) return 'light';
    if (Math.hypot(x - bar.x1, y - bar.y) <= HIT_END) return 'end1';
    if (Math.hypot(x - bar.x2, y - bar.y) <= HIT_END) return 'end2';
    const left = Math.min(bar.x1, bar.x2);
    const right = Math.max(bar.x1, bar.x2);
    if (x >= left && x <= right && Math.abs(y - bar.y) <= HIT_BAR) return 'bar';
    return null;
  }

  function cursorFor(target) {
    if (target === 'end1' || target === 'end2') return 'ew-resize';
    if (target) return 'grab';
    return 'default';
  }

  function scenePoint(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  }

  function onPointerDown(event) {
    const point = scenePoint(event);
    const target = hitTest(point.x, point.y);
    if (!target) return;
    try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* synthetic events may lack capture */ }
    drag = {
      target,
      ox: (target === 'light' ? light.x : target === 'end2' ? bar.x2 : bar.x1) - point.x,
      ox2: bar.x2 - point.x,
      oy: (target === 'light' ? light.y : bar.y) - point.y,
    };
    canvas.style.cursor = target === 'bar' || target === 'light' ? 'grabbing' : 'ew-resize';
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
    } else if (drag.target === 'bar') {
      bar.x1 = point.x + drag.ox;
      bar.x2 = point.x + drag.ox2;
      bar.y = point.y + drag.oy;
    } else if (drag.target === 'end1') {
      bar.x1 = point.x + drag.ox;
    } else {
      bar.x2 = point.x + drag.ox;
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

  function onResize() {
    resize();
    draw();
  }

  resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(workspace);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  resize();
  draw();

  return () => {
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', endDrag);
    canvas.removeEventListener('pointercancel', endDrag);
    drag = null;
  };
}
