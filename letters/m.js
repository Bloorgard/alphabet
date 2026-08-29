/* М — метроном.

   Две диагонали не нарисованы поверх буквы: каждая — маятник со своей
   массой, а общая впадина связывает их пружиной. В покое они расходятся,
   после толчка догоняют друг друга; красным вспыхивает только момент, когда
   две половины снова сходятся. Вертикали оставлены неподвижными, чтобы было
   видно, как движение живёт именно внутри М. */

const STEP = 1 / 60;
const RED = '#e0210f';

const DEFAULTS = {
  gravity: 0.85,
  coupling: 2.6,
  damping: 0.025,
  length: 0.58,
  trace: true,
};

const CONTROLS = [
  { key: 'gravity', label: 'тяготение', min: 0.2, max: 1.8, step: 0.05 },
  { key: 'coupling', label: 'связь', min: 0, max: 7, step: 0.1 },
  { key: 'damping', label: 'затухание', min: 0, max: 0.15, step: 0.005 },
  { key: 'length', label: 'длина', min: 0.42, max: 0.64, step: 0.01 },
];

function rgba(alpha) {
  return `rgba(241, 237, 229, ${alpha})`;
}

export function mountM(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { ...DEFAULTS };
  const leftAnchor = { x: 0.22, y: 0.2 };
  const rightAnchor = { x: 0.78, y: 0.2 };
  const state = {
    left: { angle: 0.503, speed: 0 },
    right: { angle: 0.503, speed: 0 },
    drag: null,
    pulse: 0,
    wasTogether: true,
    history: [[], []],
  };
  const pointer = { x: 0.5, y: 0.5, down: false };
  let width = 1;
  let height = 1;
  let frameId = 0;
  let last = performance.now();
  let debt = 0;

  function reset() {
    state.left.angle = 0.503;
    state.left.speed = 0;
    state.right.angle = 0.503;
    state.right.speed = 0;
    state.drag = null;
    state.pulse = 0;
    state.wasTogether = true;
    state.history[0].length = 0;
    state.history[1].length = 0;
  }

  function resize() {
    const bounds = workspace.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function point(x, y) {
    return { x: x * width, y: y * height };
  }

  function line(a, b, color, thickness) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness * Math.min(width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function dot(at, radius, color) {
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius * Math.min(width, height), 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function bob(side) {
    const item = state[side];
    const anchor = side === 'left' ? leftAnchor : rightAnchor;
    const direction = side === 'left' ? 1 : -1;
    return {
      x: anchor.x + direction * Math.sin(item.angle) * params.length,
      y: anchor.y + Math.cos(item.angle) * params.length,
    };
  }

  function drawStatus(text, hot = false) {
    ctx.fillStyle = hot ? RED : rgba(0.38);
    ctx.font = `${Math.round(Math.min(width, height) * 0.022)}px 'DM Mono', monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(text, width * 0.96, height * 0.06);
    ctx.textAlign = 'left';
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const left = bob('left');
    const right = bob('right');
    const size = Math.min(width, height);
    const gap = Math.hypot(left.x - right.x, left.y - right.y);

    line(point(0.22, 0.2), point(0.22, 0.78), rgba(0.16), 0.003);
    line(point(0.78, 0.2), point(0.78, 0.78), rgba(0.16), 0.003);

    if (params.trace) {
      for (const trail of state.history) {
        for (let i = 1; i < trail.length; i += 1) {
          line(trail[i - 1], trail[i], rgba(0.04 + (i / trail.length) * 0.15), 0.002);
        }
      }
    }

    line(point(leftAnchor.x, leftAnchor.y), point(left.x, left.y), rgba(0.95), 0.008);
    line(point(rightAnchor.x, rightAnchor.y), point(right.x, right.y), rgba(0.95), 0.008);
    line(point(left.x, left.y), point(right.x, right.y), rgba(0.16), 0.003);
    dot(point(0.5, 0.78), 0.009, rgba(0.16));
    dot(point(leftAnchor.x, leftAnchor.y), 0.012, rgba(0.95));
    dot(point(rightAnchor.x, rightAnchor.y), 0.012, rgba(0.95));
    dot(point(left.x, left.y), 0.018, state.drag === state.left ? RED : rgba(0.95));
    dot(point(right.x, right.y), 0.018, state.drag === state.right ? RED : rgba(0.95));

    if (state.pulse > 0) {
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.78, (0.03 + (1 - state.pulse) * 0.1) * size, 0, Math.PI * 2);
      ctx.strokeStyle = RED;
      ctx.lineWidth = 0.002 * size;
      ctx.globalAlpha = state.pulse;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    drawStatus(gap < 0.045 ? 'вместе' : 'разлад');
  }

  function step() {
    const acceleration = (item, other) => (
      -params.gravity * Math.sin(item.angle)
      - params.damping * item.speed
      + params.coupling * (other.angle - item.angle)
    );
    state.left.speed += acceleration(state.left, state.right) * STEP;
    state.right.speed += acceleration(state.right, state.left) * STEP;
    state.left.angle = Math.max(0.14, Math.min(0.92, state.left.angle + state.left.speed * STEP));
    state.right.angle = Math.max(0.14, Math.min(0.92, state.right.angle + state.right.speed * STEP));

    if (state.drag) {
      const side = state.drag === state.left ? 'left' : 'right';
      const anchor = side === 'left' ? leftAnchor : rightAnchor;
      const direction = side === 'left' ? 1 : -1;
      const dx = (pointer.x - anchor.x) * direction;
      const dy = pointer.y - anchor.y;
      state.drag.angle = Math.max(0.14, Math.min(0.92, Math.atan2(dx, Math.max(0.1, dy))));
      state.drag.speed = 0;
    }

    const bobs = [bob('left'), bob('right')];
    if (params.trace) {
      for (let i = 0; i < bobs.length; i += 1) {
        state.history[i].push(point(bobs[i].x, bobs[i].y));
        if (state.history[i].length > 50) state.history[i].shift();
      }
    }
    const together = Math.hypot(bobs[0].x - bobs[1].x, bobs[0].y - bobs[1].y) < 0.045;
    if (together && !state.wasTogether) state.pulse = 1;
    state.wasTogether = together;
    state.pulse = Math.max(0, state.pulse - STEP * 1.8);
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

  function track(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - bounds.left) / width;
    pointer.y = (event.clientY - bounds.top) / height;
  }

  function onDown(event) {
    track(event);
    pointer.down = true;
    canvas.setPointerCapture?.(event.pointerId);
    const left = bob('left');
    const right = bob('right');
    if (Math.hypot(pointer.x - left.x, pointer.y - left.y) < 0.06) state.drag = state.left;
    else if (Math.hypot(pointer.x - right.x, pointer.y - right.y) < 0.06) state.drag = state.right;
    else {
      const item = pointer.x < 0.5 ? state.left : state.right;
      item.speed += (pointer.x < 0.5 ? 1 : -1) * 1.7;
    }
    event.preventDefault();
  }

  function onMove(event) {
    track(event);
  }

  function onUp() {
    pointer.down = false;
    state.drag = null;
  }

  function buildControls() {
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
      input.addEventListener('input', () => { params[control.key] = Number(input.value); });
      label.append(input);
      panel.append(label);
    }

    const trace = document.createElement('button');
    trace.type = 'button';
    trace.className = 'sketch-switch';
    trace.textContent = 'след';
    trace.setAttribute('aria-pressed', String(params.trace));
    trace.addEventListener('click', () => {
      params.trace = !params.trace;
      trace.setAttribute('aria-pressed', String(params.trace));
    });
    panel.append(trace);

    const note = document.createElement('p');
    note.textContent = 'тяни шарики или толкни любую половину';
    panel.append(note);

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'sketch-action';
    resetButton.textContent = 'заново';
    resetButton.addEventListener('click', reset);
    panel.append(resetButton);

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
    if (event.target instanceof Element && event.target.closest('input, textarea, select')) return;
    event.preventDefault();
    controls.toggle.click();
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'толкни М · поймай общий ритм';
  workspace.append(hint);

  const controls = buildControls();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(workspace);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  document.addEventListener('keydown', onKeyDown);
  resize();
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.removeEventListener('keydown', onKeyDown);
    controls.panel.remove();
    controls.toggle.remove();
    hint.remove();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
