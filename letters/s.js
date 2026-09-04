import { reportScore } from '../progress.js?v=3';

const STEP = 1 / 60;
const INK = '#161616';
const PAPER = '#f1ede5';
const RED = '#e0210f';

const CX = 0.5;
const CY = 0.52;
const RADIUS = 0.34;
const BALL_R = 0.013;
const ARC_WIDTH = 0.02;
const GAP_START = 24 * Math.PI / 180;
const GAP_MAX = 350 * Math.PI / 180;
const MIN_ALIVE = 3;
const WARN_ALIVE = MIN_ALIVE + 3;
const GAP_EASE = 0.1;
const FLASH_DECAY = 0.45;
const TIP_SPAN = 15 * Math.PI / 180;
const BALL_COUNT = 12;
const BALL_SPEED = 0.5;
const GROWTH_RATE = 1.5;
const JUMP_DEG = 16;
const ROT_SPEED = 150 * Math.PI / 180;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/* Разрыв центрирован на угол rotation. Проверяет, попадает ли мировой
   угол в открытый сектор при текущем повороте буквы. */
function angleInGap(angle, rotation, gapWidth) {
  let d = angle - rotation;
  d = ((d % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return Math.abs(d) < gapWidth / 2;
}

export function mountS(workspace) {
  workspace.dataset.ground = 'paper';
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const state = {};
  const pointer = { x: 0.5, y: 0.5, down: false };
  let W = 1;
  let H = 1;
  let S = 1;
  let ox = 0;
  let oy = 0;
  let dpr = 1;
  let last = performance.now();
  let debt = 0;
  let frameId = 0;
  let sent = false;

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
    pointer.x = (event.clientX - rect.left - ox) / S;
    pointer.y = (event.clientY - rect.top - oy) / S;
  }

  function spawnBall() {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * RADIUS * 0.55;
    state.balls.push({
      x: CX + Math.cos(angle) * r,
      y: CY + Math.sin(angle) * r,
      vx: (Math.random() - 0.5) * BALL_SPEED,
      vy: (Math.random() - 0.5) * BALL_SPEED,
      escaping: false,
    });
  }

  function alive() { return state.balls.filter((b) => !b.escaping).length; }

  function reset() {
    state.rotation = 0;
    state.time = 0;
    state.gap = GAP_START;
    state.gapTarget = GAP_START;
    state.score = 0;
    state.over = false;
    state.flash = 0;
    state.pulse = 0;
    state.turnLeft = false;
    state.turnRight = false;
    state.balls = [];
    for (let i = 0; i < BALL_COUNT; i++) spawnBall();
    sent = false;
  }

  function step() {
    if (state.turnLeft || state.turnRight) {
      const dir = (state.turnRight ? 1 : 0) - (state.turnLeft ? 1 : 0);
      state.rotation += dir * ROT_SPEED * STEP;
    }
    if (pointer.down) state.rotation = Math.atan2(pointer.y - CY, pointer.x - CX);

    state.flash = Math.max(0, state.flash - STEP / FLASH_DECAY);
    state.pulse += STEP;

    if (!state.over) {
      state.time += STEP;
      state.gapTarget = Math.min(GAP_MAX, state.gapTarget + GROWTH_RATE * Math.PI / 180 * STEP);
      state.score += alive() * STEP;
    }
    /* Видимый разрыв гонится за целью быстро, но не мгновенно — скачок при
       потере получает тело движения, а не телепорт, и читается как рывок. */
    state.gap += (state.gapTarget - state.gap) * Math.min(1, STEP / GAP_EASE);

    for (const b of state.balls) {
      b.x += b.vx * STEP;
      b.y += b.vy * STEP;
      if (b.escaping) continue;
      const dx = b.x - CX, dy = b.y - CY;
      const dist = Math.hypot(dx, dy);
      if (dist + BALL_R < RADIUS) continue;
      const angle = Math.atan2(dy, dx);
      if (angleInGap(angle, state.rotation, state.gap)) {
        b.escaping = true;
        state.flash = 1;
        state.gapTarget = Math.min(GAP_MAX, state.gapTarget + JUMP_DEG * Math.PI / 180);
        continue;
      }
      const nx = dx / dist, ny = dy / dist;
      const along = b.vx * nx + b.vy * ny;
      b.vx -= 2 * along * nx;
      b.vy -= 2 * along * ny;
      const clampDist = RADIUS - BALL_R;
      b.x = CX + nx * clampDist;
      b.y = CY + ny * clampDist;
    }

    state.balls = state.balls.filter((b) => !(b.escaping
      && (b.x < -0.1 || b.x > 1.1 || b.y < -0.1 || b.y > 1.1)));

    if (!state.over && alive() < MIN_ALIVE) {
      state.over = true;
      /* Меньше трёх — для игры они уже все потеряны, раунд не довести ни с
         одним из них. Красим всех разом в момент обрыва, а не ждём, пока
         каждый по очереди случайно наткнётся на разрыв сам. */
      for (const b of state.balls) b.escaping = true;
      if (!sent) { sent = true; reportScore('С', Math.round(state.score)); }
    }
  }

  function dot(x, y, color, r) {
    ctx.beginPath();
    ctx.arc(ox + x * S, oy + y * S, r * S, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawArc(width, color, gapWidth, cap) {
    ctx.beginPath();
    ctx.arc(ox + CX * S, oy + CY * S, RADIUS * S,
      state.rotation + gapWidth / 2, state.rotation - gapWidth / 2 + Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * S;
    ctx.lineCap = cap;
    ctx.stroke();
  }

  /* Не вся дуга — только оба её конца, там, где металл только что подался.
     Красная краска держится за место события, а не расходится по форме. */
  function drawTips(alpha) {
    if (alpha <= 0.01) return;
    const tipA = state.rotation + state.gap / 2;
    const tipB = state.rotation - state.gap / 2 + Math.PI * 2;
    ctx.strokeStyle = `rgba(224,33,15,${alpha})`;
    ctx.lineWidth = (ARC_WIDTH + 0.012 * alpha) * S;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(ox + CX * S, oy + CY * S, RADIUS * S, tipA, tipA + TIP_SPAN);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ox + CX * S, oy + CY * S, RADIUS * S, tipB - TIP_SPAN, tipB);
    ctx.stroke();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = PAPER;
    ctx.fillRect(ox, oy, S, S);

    const aliveNow = alive();
    const risk = state.over ? 0 : clamp((WARN_ALIVE - aliveNow) / (WARN_ALIVE - MIN_ALIVE), 0, 1);
    const pulseFreq = 3 + risk * 7;
    const blinkOn = risk > 0.02 && Math.sin(state.pulse * pulseFreq) > 0;

    for (const b of state.balls) {
      if (b.escaping) { dot(b.x, b.y, RED, BALL_R); continue; }
      dot(b.x, b.y, INK, BALL_R);
      /* Живой, но на грани — не перекрашиваем саму точку (значило бы
         «потерян», как у вылетевших), а обводим тонким мигающим красным
         кольцом: тот же акцент, другой рисунок. Зазор равен толщине кольца. */
      if (blinkOn) {
        const ringWidth = 0.004 + 0.003 * risk;
        ctx.beginPath();
        ctx.arc(ox + b.x * S, oy + b.y * S, (BALL_R + ringWidth * 1.5) * S, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgb(224,33,15)';
        ctx.lineWidth = ringWidth * S;
        ctx.stroke();
      }
    }
    drawArc(ARC_WIDTH, INK, state.gap, 'butt');
    drawTips(state.flash * state.flash);

    ctx.fillStyle = state.over ? RED : INK;
    ctx.font = `${Math.round(S * 0.022)}px 'DM Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(state.score)), ox + S * 0.5, oy + S * 0.06);
    if (state.over) {
      ctx.font = `${Math.round(S * 0.02)}px 'DM Mono', monospace`;
      ctx.fillText('клик — заново', ox + S * 0.5, oy + S * 0.94);
    }
    ctx.textAlign = 'left';
  }

  function onDown(event) {
    track(event);
    canvas.setPointerCapture?.(event.pointerId);
    if (state.over) { reset(); return; }
    pointer.down = true;
    state.rotation = Math.atan2(pointer.y - CY, pointer.x - CX);
  }

  function onMove(event) {
    track(event);
  }

  function onUp() {
    pointer.down = false;
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'уводи разрыв от шариков · тяни пальцем или A/D';

  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.hidden = true;
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

  function onKeyDown(event) {
    if (event.target instanceof Element && event.target.closest('input, textarea, select')) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      toggle.click();
      return;
    }
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') state.turnLeft = true;
    if (event.code === 'KeyD' || event.code === 'ArrowRight') state.turnRight = true;
  }

  function onKeyUp(event) {
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') state.turnLeft = false;
    if (event.code === 'KeyD' || event.code === 'ArrowRight') state.turnRight = false;
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
  workspace.append(hint, panel, toggle);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  resize();
  reset();
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    observer.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    hint.remove();
    panel.remove();
    toggle.remove();
    delete workspace.dataset.ground;
    canvas.style.cursor = '';
    ctx.clearRect(0, 0, W, H);
  };
}
