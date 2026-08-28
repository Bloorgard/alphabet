const STEP = 1 / 60;
const RED = '#e0210f';
const INK = '#f1ede5';
const MUTED = 'rgba(241, 237, 229, .45)';
const FAINT = 'rgba(241, 237, 229, .18)';

const PARAMS = {
  span: 0.14,
  spread: 40,
  decay: 0.52,
  waver: 0.15,
};

const K = {
  stem: 0.34,
  top: 0.2,
  node: 0.5,
  right: 0.7,
  upper: 0.2,
  lower: 0.8,
};

const MAX_TIPS = 180;
const MAX_PATHS = 260;
const SPEED = 0.0045;
const WEAR = 0.8;
const MIN_ENERGY = 0.15;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function plural(count) {
  const tens = count % 100;
  if (tens > 10 && tens < 20) return 'трещин';
  const unit = count % 10;
  if (unit === 1) return 'трещина';
  if (unit >= 2 && unit <= 4) return 'трещины';
  return 'трещин';
}

function makeTip(x, y, dir, energy, side, seed) {
  return {
    x, y, dir, energy, side, seed,
    run: 0,
    total: 0,
    path: [{ x, y }],
    hot: 1,
  };
}

export function mountK(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { ...PARAMS };
  const state = { done: [], tips: [], seed: 0.3, impacts: 0, hot: 0 };
  let W = 1;
  let H = 1;
  let S = 1;
  let ox = 0;
  let oy = 0;
  let frameId = 0;
  let last = performance.now();
  let debt = 0;
  const pointer = { x: 0.5, y: 0.5 };

  function reset() {
    state.done = [
      { path: [{ x: K.stem, y: K.top }, { x: K.stem, y: K.node }], hot: 0 },
      { path: [{ x: K.stem, y: K.node }, { x: K.right, y: K.upper }], hot: 0 },
      { path: [{ x: K.stem, y: K.node }, { x: K.right, y: K.lower }], hot: 0 },
    ];
    state.tips = [];
    state.seed = 0.3;
    state.impacts = 0;
    state.hot = 0;
  }

  function resize() {
    const bounds = workspace.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, bounds.width);
    H = Math.max(1, bounds.height);
    S = Math.min(W, H);
    ox = (W - S) / 2;
    oy = (H - S) / 2;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function point(x, y) {
    return { x: ox + x * S, y: oy + y * S };
  }

  function addImpact(x, y) {
    if (state.tips.length + state.done.length >= MAX_PATHS) return;
    const tip = makeTip(clamp(x, 0.04, 0.96), clamp(y, 0.04, 0.96), Math.PI / 2, 1, 1, state.seed);
    state.seed += 1.7;
    state.tips.push(tip);
    state.impacts += 1;
    state.hot = 1;
  }

  function settle(tip) {
    state.done.push({ path: tip.path, hot: tip.hot });
  }

  function step() {
    state.hot = Math.max(0, state.hot - STEP * 0.7);
    const born = [];
    const half = (params.spread * Math.PI) / 180;

    for (let i = state.tips.length - 1; i >= 0; i -= 1) {
      const tip = state.tips[i];
      tip.hot = Math.max(0, tip.hot - STEP * 0.45);
      tip.dir += (Math.sin(tip.seed + tip.total * 41) + Math.sin(tip.seed * 2.3 + tip.total * 17) * 0.5)
        * params.waver * 0.03;
      tip.x += Math.cos(tip.dir) * SPEED;
      tip.y += Math.sin(tip.dir) * SPEED;
      tip.run += SPEED;
      tip.total += SPEED;
      tip.path.push({ x: tip.x, y: tip.y });

      const gone = tip.x < 0 || tip.x > 1 || tip.y < 0 || tip.y > 1;
      if (gone || tip.energy < MIN_ENERGY) {
        settle(tip);
        state.tips.splice(i, 1);
        continue;
      }

      if (tip.run < params.span * tip.energy) continue;
      tip.run = 0;
      const perp = tip.dir - (Math.PI / 2) * tip.side;
      const canBranch = state.tips.length + born.length < MAX_TIPS
        && state.done.length + born.length < MAX_PATHS;
      if (canBranch) {
        const side = -tip.side;
        born.push(makeTip(tip.x, tip.y, perp - half, tip.energy * params.decay, side, tip.seed + 3.1));
        born.push(makeTip(tip.x, tip.y, perp + half, tip.energy * params.decay, side, tip.seed + 5.7));
        state.hot = 1;
      }
      tip.energy *= WEAR;
      tip.side = -tip.side;
    }

    state.tips.push(...born);
  }

  function drawPath(track, width, color) {
    if (track.path.length < 2) return;
    ctx.beginPath();
    const first = point(track.path[0].x, track.path[0].y);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < track.path.length; i += 1) {
      const next = point(track.path[i].x, track.path[i].y);
      ctx.lineTo(next.x, next.y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width * S;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function line(x1, y1, x2, y2, color, width) {
    const a = point(x1, y1);
    const b = point(x2, y2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * S;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function status() {
    const text = state.impacts ? `${state.impacts} ${plural(state.impacts)}` : 'клик — удар';
    ctx.fillStyle = state.hot > 0.08 ? RED : MUTED;
    ctx.font = "10px 'DM Mono', ui-monospace, monospace";
    /* По центру сверху, как у И и Й: в правом углу строка уходит под крестик
       закрытия и режется им пополам. */
    ctx.textAlign = 'center';
    ctx.fillText(text.toUpperCase(), ox + S / 2, oy + 25);
    ctx.textAlign = 'left';
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const track of state.done) {
      const color = track.hot > 0.08 ? RED : INK;
      drawPath(track, 0.009, color);
    }
    for (const tip of state.tips) {
      const width = 0.004 + tip.energy * 0.008;
      drawPath(tip, width, tip.hot > 0.08 ? RED : INK);
    }

    line(0.18, 0.91, 0.82, 0.91, FAINT, 0.0015);
    status();
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
    pointer.x = (event.clientX - bounds.left - ox) / S;
    pointer.y = (event.clientY - bounds.top - oy) / S;
  }

  function onDown(event) {
    track(event);
    addImpact(pointer.x, pointer.y);
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'клик — удар · узел отдаёт две ветви и помнит каждый раскол';

  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.hidden = true;

  const controls = [
    ['span', 'до развилки', 0.06, 0.3, 0.01],
    ['spread', 'раствор', 10, 70, 1],
    ['decay', 'затухание', 0.3, 0.95, 0.01],
    ['waver', 'виляние', 0, 1, 0.02],
  ];
  for (const [key, labelText, min, max, step] of controls) {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = params[key];
    input.addEventListener('input', () => { params[key] = Number(input.value); });
    label.append(input);
    panel.append(label);
  }

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'sketch-action';
  resetButton.textContent = 'чистый лист';
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

  function onKeyDown(event) {
    if (event.key !== 'Tab' || event.target.closest('input, textarea')) return;
    event.preventDefault();
    toggle.click();
  }

  reset();
  workspace.append(hint, panel, toggle);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(workspace);
  canvas.addEventListener('pointerdown', onDown);
  document.addEventListener('keydown', onKeyDown);
  resize();
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    document.removeEventListener('keydown', onKeyDown);
    hint.remove();
    panel.remove();
    toggle.remove();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
