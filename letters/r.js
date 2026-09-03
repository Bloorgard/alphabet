const STEP = 1 / 60;
const INK = '#161616';
const BG = '#f1ede5';
const RED = '#e0210f';

const BASE = { x: 215 / 718, y: 610 / 718 };
const BALL = { x: 359.24 / 718, y: 261 / 718, r: 134 / 718 };
const ROD_LEN = (610 - 120) / 718;
const ROD_RADIUS = 0.007;
const REST_ANGLE = -Math.PI / 2;

const DEFAULTS = {
  spring: 40,
  damping: 2.2,
  sound: true,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function mountR(workspace) {
  workspace.dataset.ground = 'paper';
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { ...DEFAULTS };
  const pointer = { x: 0, y: 0 };
  const state = {};
  let W = 1;
  let H = 1;
  let S = 1;
  let ox = 0;
  let oy = 0;
  let dpr = 1;
  let last = performance.now();
  let debt = 0;
  let frameId = 0;
  let audio = null;

  function reset() {
    state.angle = REST_ANGLE;
    state.angleVel = 0;
    state.rodDragging = false;
    state.ballDragging = false;
    state.prevX = 0;
    state.prevY = 0;
    state.yaw = 0;
    state.pitch = 0;
    state.yawVel = 0.004;
    state.pitchVel = 0;
    state.wobble = 0;
    state.rings = [];
    state.elapsed = 0;
    state.cooldown = 0;
    state.prevRodDist = 999;
    state.texture = 0;
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
    pointer.x = (event.clientX - rect.left - ox) / S;
    pointer.y = (event.clientY - rect.top - oy) / S;
  }

  function tip() {
    return {
      x: BASE.x + Math.cos(state.angle) * ROD_LEN,
      y: BASE.y + Math.sin(state.angle) * ROD_LEN,
    };
  }

  function distToRod(px, py) {
    const end = tip();
    const dx = end.x - BASE.x;
    const dy = end.y - BASE.y;
    const t = clamp(((px - BASE.x) * dx + (py - BASE.y) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(px - BASE.x - dx * t, py - BASE.y - dy * t);
  }

  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function beep(strength) {
    if (!params.sound) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 650 + strength * 400;
      gain.gain.setValueAtTime(Math.min(0.3, 0.06 + strength * 0.22), audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.4);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.42);
    } catch {}
  }

  function step() {
    if (state.rodDragging) {
      state.angle = Math.atan2(pointer.y - BASE.y, pointer.x - BASE.x);
      state.angleVel = 0;
    } else {
      const force = -params.spring * angleDiff(state.angle, REST_ANGLE) - params.damping * state.angleVel;
      state.angleVel += force * STEP;
      state.angle += state.angleVel * STEP;
    }

    if (state.ballDragging) {
      const dx = pointer.x - state.prevX;
      const dy = pointer.y - state.prevY;
      state.prevX = pointer.x;
      state.prevY = pointer.y;
      state.yaw += dx * 5;
      state.pitch += dy * 5;
      state.yawVel = dx * 3;
      state.pitchVel = dy * 3;
    } else {
      state.yaw += state.yawVel;
      state.pitch += state.pitchVel;
      state.yawVel *= 0.96;
      state.pitchVel *= 0.96;
      if (Math.abs(state.yawVel) < 0.004) state.yawVel += (0.004 - state.yawVel) * 0.02;
    }

    state.cooldown = Math.max(0, state.cooldown - STEP);
    const rodDist = distToRod(BALL.x, BALL.y);
    const contact = BALL.r + ROD_RADIUS;
    if (!state.rodDragging && state.prevRodDist >= contact && rodDist < contact) {
      const speed = Math.abs(state.angleVel) * ROD_LEN;
      state.angleVel *= -0.35;
      if (state.cooldown <= 0 && speed > 0.3) {
        const strength = clamp(speed * 0.6, 0.2, 1);
        state.wobble = Math.min(1.4, state.wobble + strength);
        state.rings.push({ born: state.elapsed, strength });
        state.texture = (state.texture + 1) % 4;
        state.cooldown = 0.18;
        beep(strength);
      }
    }
    state.prevRodDist = rodDist;
    state.wobble *= 0.9;
    state.elapsed += STEP;
    state.rings = state.rings.filter((ring) => state.elapsed - ring.born < 0.6);
  }

  function drawSphere(radius) {
    const x = BALL.x * S;
    const y = BALL.y * S;
    const r = radius * S;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = INK;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.translate(x, y);

    if (state.texture === 0) {
      const band = r * 0.22;
      const shift = ((state.pitch * r * 0.7) % (band * 2) + band * 2) % (band * 2);
      ctx.fillStyle = BG;
      for (let py = -r * 1.5 + shift; py < r * 1.5; py += band * 2) ctx.fillRect(-r, py, r * 2, band);
    } else if (state.texture === 1) {
      ctx.rotate(state.pitch * 0.18);
      ctx.fillStyle = BG;
      const phase = state.yaw;
      for (let i = -3; i <= 3; i += 2) {
        const center = Math.sin(phase + i * 0.7) * r * 0.22 + i * r * 0.31;
        ctx.beginPath();
        ctx.ellipse(center, 0, r * 0.18, r * 1.12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (state.texture === 2) {
      ctx.rotate(state.yaw * 0.12);
      ctx.strokeStyle = BG;
      ctx.lineWidth = Math.max(2, r * 0.09);
      for (let rr = r * 0.08; rr < r * 1.5; rr += r * 0.18) {
        ctx.beginPath();
        ctx.arc(0, 0, rr, state.pitch, state.pitch + Math.PI * 1.35);
        ctx.stroke();
      }
    } else {
      const cell = r * 0.22;
      const sx = ((state.yaw * r * 0.4) % (cell * 2) + cell * 2) % (cell * 2);
      const sy = ((state.pitch * r * 0.4) % (cell * 2) + cell * 2) % (cell * 2);
      ctx.fillStyle = BG;
      for (let gy = -6; gy <= 6; gy++) for (let gx = -6; gx <= 6; gx++) {
        if ((gx + gy) % 2 === 0) ctx.fillRect(gx * cell + sx, gy * cell + sy, cell, cell);
      }
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, S * 0.003);
    ctx.stroke();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(ox, oy);
    const end = tip();
    const radius = BALL.r * (1 + state.wobble * 0.06);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, S, S);
    ctx.arc(BALL.x * S, BALL.y * S, radius * S, 0, Math.PI * 2);
    ctx.clip('evenodd');
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, ROD_RADIUS * 2 * S);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(BASE.x * S, BASE.y * S);
    ctx.lineTo(end.x * S, end.y * S);
    ctx.stroke();
    ctx.restore();

    drawSphere(radius);
    for (const ring of state.rings) {
      const t = (state.elapsed - ring.born) / 0.6;
      ctx.beginPath();
      ctx.arc(BALL.x * S, BALL.y * S, (BALL.r + t * 0.09) * S, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(224, 33, 15, ${1 - t})`;
      ctx.lineWidth = Math.max(1, S * 0.004);
      ctx.stroke();
    }
    ctx.restore();
  }

  function onDown(event) {
    track(event);
    const ballDist = Math.hypot(pointer.x - BALL.x, pointer.y - BALL.y);
    if (ballDist < BALL.r) {
      state.ballDragging = true;
      state.prevX = pointer.x;
      state.prevY = pointer.y;
    } else if (distToRod(pointer.x, pointer.y) < 0.05) {
      state.rodDragging = true;
    } else return;
    canvas.setPointerCapture(event.pointerId);
  }

  function onMove(event) {
    track(event);
    canvas.style.cursor = Math.hypot(pointer.x - BALL.x, pointer.y - BALL.y) < BALL.r
      || distToRod(pointer.x, pointer.y) < 0.05 ? 'grab' : '';
  }

  function onUp() {
    state.rodDragging = false;
    state.ballDragging = false;
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'качни палку · шарик можно крутить';

  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.hidden = true;
  for (const [key, labelText, min, max, value] of [
    ['spring', 'упругость', 20, 70, 1],
    ['damping', 'затухание', 0.8, 5, 0.1],
  ]) {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = value;
    input.value = params[key];
    input.addEventListener('input', () => { params[key] = Number(input.value); });
    label.append(input);
    panel.append(label);
  }
  const sound = document.createElement('button');
  sound.type = 'button';
  sound.className = 'sketch-switch';
  sound.textContent = 'звук';
  sound.setAttribute('aria-pressed', 'true');
  sound.addEventListener('click', () => {
    params.sound = !params.sound;
    sound.setAttribute('aria-pressed', String(params.sound));
  });
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'sketch-action';
  again.textContent = 'заново';
  again.addEventListener('click', reset);
  panel.append(sound, again);

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
    hint.remove();
    panel.remove();
    toggle.remove();
    delete workspace.dataset.ground;
    canvas.style.cursor = '';
    ctx.clearRect(0, 0, W, H);
  };
}
