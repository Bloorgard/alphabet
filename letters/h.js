import { reportEvent } from '../progress.js?v=5';

const STEP = 1 / 60;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

export function mountH(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  let ground = 'ink', INK = '#f1ede5', PAPER = '#161616';
  let S = 600, W = 600, H = 600, ox = 0, oy = 0, dpr = 1;
  let frameId = 0, last = performance.now(), debt = 0, paused = false, sent = false;
  const modeState = {};
  const pointer = { x: 0.5, y: 0.5, down: false, id: null };
  const values = {};
  const num = key => Number(values[key]);
  const on = key => Boolean(values[key]);
  const ink = alpha => ground === 'ink' ? `rgba(241,237,229,${alpha})` : `rgba(22,22,22,${alpha})`;
  function setGround(value) {
    ground = value;
    INK = ground === 'ink' ? '#f1ede5' : '#161616';
    PAPER = ground === 'ink' ? '#161616' : '#f1ede5';
    if (ground === 'paper') workspace.dataset.ground = 'paper';
    else delete workspace.dataset.ground;
  }
  function dot(x, y, color, radius) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x * S, y * S, radius * S, 0, Math.PI * 2); ctx.fill();
  }
  function hyperSetup() {
    modeState.phase = 0;
    modeState.x = 0.5;
    modeState.y = 0.5;
    modeState.hold = null;
    modeState.pins = [];
    modeState.drag = null;
    modeState.releases = [];
    modeState.motion = [];
    for (let y = 0.1; y < 0.95; y += 0.08) {
      for (let x = 0.1; x < 0.95; x += 0.08) {
        const [px, py] = hyperDeform(x, y);
        const flow = hyperFlow(x, y);
        modeState.motion.push({ x, y, px, py, vx: flow[0], vy: flow[1], sx: 0, sy: 0 });
      }
    }
  }

  function hyperUnpin(index) {
    const [pin] = modeState.pins.splice(index, 1);
    modeState.releases.push({ ...pin, age: 0 });
    if (modeState.releases.length > 8) modeState.releases.shift();
  }

  function hyperTouch() {
    const hit = modeState.pins.findIndex(pin => Math.hypot(pointer.x - pin.x, pointer.y - pin.y) < 0.035);
    if (hit >= 0) {
      const pin = modeState.pins[hit];
      modeState.drag = { pin, x: pointer.x, y: pointer.y, px: pin.x, py: pin.y, moved: false, existing: true };
      return;
    }
    if (on('pins')) {
      if (modeState.pins.length === 8) hyperUnpin(0);
      const pin = {
        x: clamp(pointer.x, 0.045, 0.955),
        y: clamp(pointer.y, 0.045, 0.955), charge: 0, age: 0,
      };
      modeState.pins.push(pin);
      modeState.drag = { pin, x: pointer.x, y: pointer.y, px: pin.x, py: pin.y, moved: false, existing: false };
      return;
    }
    if (modeState.hold) hyperRelease();
    modeState.hold = {
      x: clamp(pointer.x, 0.045, 0.955),
      y: clamp(pointer.y, 0.045, 0.955),
      charge: 0, age: 0,
    };
  }

  function hyperMove() {
    const drag = modeState.drag;
    if (!pointer.down || !drag) return;
    const dx = pointer.x - drag.x, dy = pointer.y - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) * S < 6) return;
    drag.moved = true;
    drag.pin.x = clamp(drag.px + dx, 0.045, 0.955);
    drag.pin.y = clamp(drag.py + dy, 0.045, 0.955);
  }

  function hyperUp() {
    const drag = modeState.drag;
    modeState.drag = null;
    if (drag && drag.existing && !drag.moved) {
      const index = modeState.pins.indexOf(drag.pin);
      if (index >= 0) hyperUnpin(index);
    }
    hyperRelease();
  }

  function hyperRelease() {
    if (!modeState.hold) return;
    modeState.releases.push({ ...modeState.hold, age: 0 });
    if (modeState.releases.length > 5) modeState.releases.shift();
    modeState.hold = null;
  }

  function hyperStep() {
    modeState.phase += STEP * num('speed');
    if (modeState.hold) {
      modeState.hold.charge = Math.min(3, modeState.hold.charge + STEP * (num('speed') + 0.3));
    }
    for (const pin of modeState.pins) pin.charge = Math.min(3, pin.charge + STEP * (num('speed') + 0.3));
    for (const release of modeState.releases) release.age += STEP;
    modeState.releases = modeState.releases.filter(release => release.age < 3);
    hyperMotion();
  }

  function hyperFlow(x, y) {
    const u = x - 0.5, v = y - 0.5;
    const scale = num('speed') * 0.1152 / num('density') / (u * u + v * v + 0.025);
    return [u * scale, -v * scale];
  }

  function hyperMotion() {
    for (const sample of modeState.motion) {
      const [px, py] = hyperDeform(sample.x, sample.y);
      const flow = hyperFlow(sample.x, sample.y);
      const vx = (px - sample.px) / STEP + flow[0];
      const vy = (py - sample.py) / STEP + flow[1];
      const speed = Math.hypot(vx, vy);
      const shift = Math.min(3, Math.max(0, speed - 0.015) * 18);
      const scale = speed > 0 ? shift / speed : 0;
      sample.sx = lerp(sample.sx, vx * scale, 0.4);
      sample.sy = lerp(sample.sy, vy * scale, 0.4);
      sample.px = px; sample.py = py;
    }
  }

  function hyperSplit(x, y) {
    const gx = clamp((x - 0.1) / 0.08, 0, 10), gy = clamp((y - 0.1) / 0.08, 0, 10);
    const ix = Math.min(9, Math.floor(gx)), iy = Math.min(9, Math.floor(gy));
    const tx = gx - ix, ty = gy - iy, grid = modeState.motion;
    const a = grid[iy * 11 + ix], b = grid[iy * 11 + ix + 1];
    const c = grid[(iy + 1) * 11 + ix], d = grid[(iy + 1) * 11 + ix + 1];
    return [lerp(lerp(a.sx, b.sx, tx), lerp(c.sx, d.sx, tx), ty),
      lerp(lerp(a.sy, b.sy, tx), lerp(c.sy, d.sy, tx), ty)];
  }

  function hyperDeform(x, y) {
    let displacement = 0;
    const radius = num('reach');
    const apply = (touch, released) => {
      const distance = Math.hypot(x - touch.x, y - touch.y);
      const core = Math.exp(-distance * distance / (radius * radius));
      if (!released) return touch.charge * core;
      const time = touch.age;
      const ring = (distance - time * 0.32) / (radius * 0.55);
      return touch.charge * (core * Math.exp(-time * 4)
        + Math.sin(time * 9 - distance * 22) * Math.exp(-ring * ring)
          * (1 - Math.exp(-time * 5)) * Math.exp(-time * 1.4));
    };
    for (const pin of modeState.pins) displacement += apply(pin, false);
    if (modeState.hold) displacement += apply(modeState.hold, false);
    for (const release of modeState.releases) displacement += apply(release, true);
    const u = x - 0.5, v = y - 0.5;
    const factor = displacement * num('force') * 0.012 / (Math.max(8, num('density')) / 20) / (u * u + v * v + 0.025);
    return [x - u * factor, y + v * factor];
  }

  const hyperMode = {
    label: 'гравюра',
    note: 'Уровни x² − y²: две диагонали при нулевом уровне, гиперболы вокруг. Прижми полосы пальцем: вокруг касания накапливается деформация. Отпусти — она расправится волной. Чем дольше держишь, тем сильнее отклик. В режиме «закрепления» касание оставляет точку, потяни точку, чтобы переместить деформацию; короткое повторное касание снимает её волной. До восьми точек; девятая освобождает самую старую. Выключи «закрепления», чтобы вернуться к удержанию.',
    tools: [
      { type: 'range', key: 'density', label: 'частота', min: 2, max: 25, step: 1, value: 9 },
      { type: 'range', key: 'width', label: 'толщина', min: 0.3, max: 30, step: 0.1, value: 30 },
      { type: 'range', key: 'speed', label: 'течение', min: 0, max: 1, step: 0.05, value: 1 },
      { type: 'range', key: 'reach', label: 'радиус', min: 0.06, max: 0.3, step: 0.01, value: 0.19 },
      { type: 'range', key: 'force', label: 'сила', min: 0.3, max: 3, step: 0.1, value: 1.8 },
      { type: 'toggle', key: 'pins', label: 'закрепления', value: true },
      { type: 'toggle', key: 'echo', label: 'аберрация', value: false },
      { type: 'button', label: 'инверсия', action() { setGround(ground === 'ink' ? 'paper' : 'ink');  } },
      { type: 'button', label: 'отпустить всё', action() {
        modeState.drag = null;
        while (modeState.pins.length) hyperUnpin(0);
        hyperRelease();
      } },
    ],
    setup: hyperSetup,
    step: hyperStep,
    draw() {
      const density = num('density');
      const phase = modeState.phase % 1;
      ctx.save();
      ctx.beginPath(); ctx.rect(S * 0.045, S * 0.045, S * 0.91, S * 0.91); ctx.clip();
      ctx.strokeStyle = INK;
      ctx.lineWidth = num('width') * S / 600;
      const engraving = new Path2D();
      const redChannel = new Path2D(), cyanChannel = new Path2D();
      for (let k = -density; k <= density; k++) {
        const level = (k + phase) / density;
        for (const sign of [-1, 1]) {
          let started = false;
          for (let j = 0; j <= 420; j++) {
            const t = -1.5 + j / 140;
            const r = Math.sqrt(t * t + Math.abs(level));
            const x = level >= 0 ? sign * r : t;
            const y = level >= 0 ? t : sign * r;
            const [deformedX, deformedY] = hyperDeform(modeState.x + x * 0.48, modeState.y + y * 0.48);
            const px = deformedX * S;
            const py = deformedY * S;
            if (on('echo')) {
              const [dx, dy] = hyperSplit(modeState.x + x * 0.48, modeState.y + y * 0.48);
              if (!started) {
                redChannel.moveTo(px + dx, py + dy); cyanChannel.moveTo(px - dx, py - dy);
              } else {
                redChannel.lineTo(px + dx, py + dy); cyanChannel.lineTo(px - dx, py - dy);
              }
            }
            if (!started) { engraving.moveTo(px, py); started = true; } else engraving.lineTo(px, py);
          }
        }
      }
      if (on('echo')) {
        ctx.globalCompositeOperation = ground === 'ink' ? 'screen' : 'multiply';
        ctx.strokeStyle = '#ff0000'; ctx.stroke(redChannel);
        ctx.strokeStyle = '#00ffff'; ctx.stroke(cyanChannel);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.strokeStyle = INK;
      ctx.stroke(engraving);
      ctx.restore();
      for (const pin of modeState.pins) {
        dot(pin.x, pin.y, PAPER, 0.009);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pin.x * S, pin.y * S, S * 0.009, 0, Math.PI * 2);
        ctx.stroke();
        dot(pin.x, pin.y, INK, 0.0025);
      }
    },
    onTool(key) { if (key === 'pins') { modeState.drag = null; hyperRelease(); } },
    onDown: hyperTouch,
    onMove: hyperMove,
    onUp: hyperUp,
    cursor: 'crosshair',
  };


  const hint = document.createElement('div');
  hint.className = 'workspace-hint'; hint.dataset.letterLayer = '';
  hint.textContent = 'касание — закрепить · потяни точку · короткое касание по точке — отпустить';
  const panel = document.createElement('div');
  panel.className = 'sketch-panel'; panel.dataset.letterLayer = ''; panel.hidden = true;
  panel.style.maxHeight = 'calc(100% - 64px)'; panel.style.overflowY = 'auto';
  for (const tool of hyperMode.tools) {
    if (tool.key) values[tool.key] = tool.value;
    if (tool.type === 'range') {
      const label = document.createElement('label');
      const caption = document.createElement('span');
      const input = document.createElement('input');
      input.type = 'range'; input.min = tool.min; input.max = tool.max; input.step = tool.step; input.value = tool.value;
      const update = () => { caption.textContent = `${tool.label} · ${input.value}`; };
      update();
      input.addEventListener('input', () => { values[tool.key] = Number(input.value); update(); hyperMode.onTool?.(tool.key); });
      label.append(caption, input); panel.append(label);
    } else {
      const button = document.createElement('button'); button.type = 'button';
      button.className = tool.type === 'toggle' ? 'sketch-switch' : 'sketch-action'; button.textContent = tool.label;
      if (tool.type === 'toggle') button.setAttribute('aria-pressed', String(tool.value));
      button.addEventListener('click', () => {
        if (tool.type === 'button') tool.action();
        else {
          values[tool.key] = !values[tool.key]; button.setAttribute('aria-pressed', String(values[tool.key]));
          hyperMode.onTool?.(tool.key);
          hint.textContent = values.pins ? 'касание — закрепить · потяни точку · короткое касание по точке — отпустить' : 'прижми рисунок · удерживай · отпусти волной';
        }
      });
      panel.append(button);
    }
  }
  const pause = document.createElement('button'); pause.type = 'button'; pause.className = 'sketch-action'; pause.textContent = 'пауза';
  pause.addEventListener('click', () => { paused = !paused; pause.textContent = paused ? 'продолжить' : 'пауза'; debt = 0; });
  panel.append(pause);
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'sketch-toggle'; toggle.dataset.letterLayer = '';
  toggle.textContent = 'параметры (tab)'; toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); });
  function track(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - bounds.left - ox) / S; pointer.y = (event.clientY - bounds.top - oy) / S;
  }
  function down(event) {
    if (pointer.down || (event.pointerType === 'mouse' && event.button !== 0)) return;
    track(event);
    if (pointer.x < 0.045 || pointer.x > 0.955 || pointer.y < 0.045 || pointer.y > 0.955) return;
    pointer.down = true; pointer.id = event.pointerId; canvas.setPointerCapture(event.pointerId);
    hyperTouch();
    if (!sent) { sent = true; reportEvent('Х'); }
  }
  function move(event) {
    if (event.pointerId !== pointer.id) return;
    track(event); hyperMove();
  }
  function up(event) {
    if (event.pointerId !== pointer.id) return;
    if (event.type === 'pointercancel' || event.type === 'lostpointercapture') { modeState.drag = null; hyperRelease(); }
    else hyperUp();
    pointer.down = false; pointer.id = null;
  }
  function key(event) {
    if (event.target.closest('input, textarea, select') || event.target.isContentEditable) return;
    if (event.key === 'Tab') { event.preventDefault(); toggle.click(); }
    if (event.code === 'Space') { event.preventDefault(); pause.click(); }
  }
  function resize() {
    W = workspace.clientWidth; H = workspace.clientHeight; S = Math.min(W, H);
    ox = (W - S) / 2; oy = (H - S) / 2; dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  function frame(now) {
    debt = paused ? 0 : Math.min(0.1, debt + (now - last) / 1000); last = now;
    while (debt >= STEP) { hyperStep(); debt -= STEP; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    ctx.translate(ox, oy); hyperMode.draw(); frameId = requestAnimationFrame(frame);
  }
  setGround('ink'); hyperSetup();
  workspace.append(hint, panel, toggle);
  const observer = new ResizeObserver(resize); observer.observe(workspace); resize();
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
  document.addEventListener('keydown', key); frameId = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(frameId); observer.disconnect();
    canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up);
    document.removeEventListener('keydown', key); hint.remove(); panel.remove(); toggle.remove();
    delete workspace.dataset.ground; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
