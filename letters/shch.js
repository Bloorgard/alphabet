import { reportScore } from '../progress.js?v=6';

const STEP = 1 / 60;
const INK = '#161616';
const PAPER = '#f1ede5';
const RED = '#e0210f';
const MUTED = 'rgba(22,22,22,.45)';

const ROW_GAP = .012;
const COLUMN_GAP = .05;
const CELL = .19;
const TILE = CELL - ROW_GAP;
const WIDTH = TILE * 3 + COLUMN_GAP * 2;
const GEOMETRY = {
  x: (1 - WIDTH) / 2,
  y: .18,
  w: TILE,
  columnGap: COLUMN_GAP,
  rowGap: ROW_GAP,
  h: CELL * 3,
  cell: CELL,
  right: (1 + WIDTH) / 2,
  knobX: (1 + WIDTH) / 2 + .055,
  knobY: .84,
};

const SPIN_TIME = 2;
const mod = (n, m) => ((n % m) + m) % m;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function reelStrip() {
  const strip = Array.from({ length: 24 }, (_, i) => i % 6);
  do {
    for (let i = strip.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [strip[i], strip[j]] = [strip[j], strip[i]];
    }
  } while (strip.some((symbol, i) => symbol === strip[(i + 1) % strip.length]));
  return strip;
}

function symbolAt(reel, row = 2) {
  return reel.strip[mod(row - Math.round(reel.pos), reel.strip.length)];
}

export function mountShch(workspace) {
  workspace.dataset.ground = 'paper';
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const pointer = { x: .5, y: .5, down: false, id: null };
  let W = 1;
  let H = 1;
  let S = 1;
  let ox = 0;
  let oy = 0;
  let dpr = 1;
  let last = performance.now();
  let debt = 0;
  let frameId = 0;
  let comboStamp = Date.now() / 10_000_000;
  let reportChain = Promise.resolve();

  const state = {};

  function reset() {
    Object.assign(state, {
      reels: [0, 1, 0].map(pos => ({ strip: reelStrip(), pos, from: pos, target: pos, time: 0, duration: 0 })),
      spinning: false,
      held: [],
      autoPull: 0,
      confetti: [],
      pull: 0,
      dragging: false,
      turns: 0,
      wins: 0,
      win: false,
      winTime: 0,
    });
    debt = 0;
    last = performance.now();
  }

  function reward() {
    comboStamp = Math.max(comboStamp + .0000001, Date.now() / 10_000_000);
    const value = comboStamp;
    reportChain = reportChain.then(() => reportScore('Щ', value));
  }

  function trigger() {
    if (state.spinning || state.autoPull) return;
    state.autoPull = .001;
  }

  function spin() {
    if (state.spinning) return;
    state.spinning = true;
    state.win = false;
    state.winTime = 0;
    state.turns += 1;
    state.reels.forEach((reel, i) => {
      reel.time = 0;
      reel.from = reel.pos;
      reel.target = reel.pos + 24 + Math.floor(Math.random() * reel.strip.length);
      reel.duration = state.held.includes(i) ? 0 : SPIN_TIME + i * .42;
      if (state.held.includes(i)) reel.target = reel.pos;
    });
  }

  function step() {
    if (state.autoPull) {
      state.autoPull += STEP;
      state.pull = .065 * Math.sin(Math.min(1, state.autoPull / .3) * Math.PI / 2);
      if (state.autoPull >= .3) {
        state.autoPull = 0;
        spin();
      }
    } else if (!state.dragging) {
      state.pull *= .78;
    }

    if (state.win) state.winTime += STEP;
    for (const piece of state.confetti) {
      piece.y += piece.speed * STEP;
      piece.x += Math.sin(piece.y * 18 + piece.sway) * .025 * STEP;
      piece.angle += piece.spin * STEP;
    }
    state.confetti = state.confetti.filter(piece => piece.y < 1.08);

    if (!state.spinning) return;
    let finished = true;
    for (const reel of state.reels) {
      if (!reel.duration) continue;
      reel.time = Math.min(reel.duration, reel.time + STEP);
      const t = reel.time / reel.duration;
      reel.pos = reel.from + (reel.target - reel.from) * (1 - Math.pow(1 - t, 3));
      if (t < 1) finished = false;
      else reel.pos = reel.target;
    }
    if (!finished) return;

    state.spinning = false;
    state.reels.forEach(reel => { reel.pos = mod(Math.round(reel.pos), reel.strip.length); });
    state.win = state.reels.every(reel => symbolAt(reel) === symbolAt(state.reels[0]));
    if (state.win) {
      state.wins += 1;
      state.winTime = 0;
      state.confetti = Array.from({ length: 72 }, (_, i) => ({
        x: .035 + Math.random() * .93,
        y: -.08 - Math.random() * .75,
        speed: .28 + Math.random() * .35,
        size: .006 + Math.random() * .008,
        angle: Math.random() * Math.PI,
        spin: (Math.random() - .5) * 7,
        sway: Math.random() * Math.PI * 2,
        light: i % 2 === 0,
      }));
      state.held = [];
      reward();
      return;
    }

    state.held = [];
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      if (symbolAt(state.reels[i]) === symbolAt(state.reels[j])) state.held = [i, j];
    }
  }

  function pattern(kind, x, y, w, h, phase = 0, animated = false) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = INK;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = PAPER;
    const unit = GEOMETRY.w / 4;

    if (kind === 0) {
      for (let row = 0; row < 4; row++) for (let col = -1; col < Math.ceil(w / unit) + 1; col++) {
        const pulse = animated ? .76 + .24 * Math.sin(phase * 5 + row * .8 + col * .6) : 1;
        ctx.beginPath();
        ctx.arc(x + (col + .5) * unit, y + (row + .5) * h / 4, unit * .32 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === 1) {
      const shift = animated ? mod(phase * .035, unit) : 0;
      for (let k = -6; k < Math.ceil(w / unit) + 7; k++) {
        const a = x + k * unit + shift;
        ctx.beginPath();
        ctx.moveTo(a, y + h);
        ctx.lineTo(a + h, y);
        ctx.lineTo(a + h + unit * .5, y);
        ctx.lineTo(a + unit * .5, y + h);
        ctx.fill();
      }
    } else if (kind === 2) {
      const shift = animated ? Math.sin(phase * 2.5) * unit * .2 : 0;
      for (let row = -1; row < 5; row++) for (let col = -2; col < Math.ceil(w / unit) + 2; col++) {
        const cx = x + (col + .5) * unit + shift * (row % 2 ? -1 : 1);
        const cy = y + (row + .5) * h / 4 + shift * .45;
        ctx.beginPath();
        ctx.moveTo(cx, cy - h / 8);
        ctx.lineTo(cx + unit / 2, cy);
        ctx.lineTo(cx, cy + h / 8);
        ctx.lineTo(cx - unit / 2, cy);
        ctx.fill();
      }
    } else if (kind === 3) {
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = unit * .25;
      ctx.lineCap = 'butt';
      for (let row = -1; row < 6; row++) {
        ctx.beginPath();
        for (let t = -.01; t <= w + .01; t += .002) {
          const wave = animated ? phase * 3 : 0;
          const yy = y + row * h / 4 + Math.sin(t / unit * Math.PI * 2 - wave) * h / 16;
          if (t === -.01) ctx.moveTo(x + t, yy);
          else ctx.lineTo(x + t, yy);
        }
        ctx.stroke();
      }
    } else if (kind === 4) {
      for (let row = 0; row < 4; row++) for (let col = 0; col < Math.ceil(w / unit); col++) {
        const cx = x + (col + .5) * unit;
        const cy = y + (row + .5) * h / 4;
        const turn = animated ? Math.sin(phase * 3 + row + col) * .22 : 0;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(turn);
        ctx.fillRect(-unit * .32, -unit * .1, unit * .64, unit * .2);
        ctx.fillRect(-unit * .1, -unit * .32, unit * .2, unit * .64);
        ctx.restore();
      }
    } else {
      ctx.strokeStyle = PAPER;
      for (let row = 0; row < 4; row++) for (let col = -1; col < Math.ceil(w / unit) + 1; col++) {
        const pulse = animated ? .72 + .2 * (1 + Math.sin(phase * 4 + row + col)) : 1;
        ctx.lineWidth = unit * .13 * pulse;
        ctx.beginPath();
        ctx.arc(x + (col + .5) * unit, y + (row + .5) * h / 4, unit * (.25 + .06 * pulse), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function text(value, x, y, align = 'left', color = MUTED, size = .017) {
    ctx.save();
    ctx.scale(1 / S, 1 / S);
    ctx.fillStyle = color;
    ctx.font = `${Math.max(10, size * S)}px 'DM Mono', monospace`;
    ctx.textAlign = align;
    ctx.fillText(value, x * S, y * S);
    ctx.restore();
  }

  function draw() {
    const g = GEOMETRY;
    for (const piece of state.confetti) {
      ctx.save();
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.angle);
      ctx.fillStyle = piece.light ? PAPER : INK;
      ctx.strokeStyle = piece.light ? INK : PAPER;
      ctx.lineWidth = .0015;
      ctx.fillRect(-piece.size * .32, -piece.size, piece.size * .64, piece.size * 2);
      ctx.strokeRect(-piece.size * .32, -piece.size, piece.size * .64, piece.size * 2);
      ctx.restore();
    }

    text(`вращения · ${state.turns}`, g.x, .105);
    text(`комбо · ${state.wins}`, g.right, .105, 'right', state.win ? RED : MUTED);
    state.reels.forEach((reel, i) => {
      const x = g.x + i * (g.w + g.columnGap);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, g.y, g.w, g.h);
      ctx.clip();
      const base = Math.floor(reel.pos);
      const offset = reel.pos - base;
      for (let row = -1; row < 4; row++) {
        pattern(reel.strip[mod(row - base, reel.strip.length)], x, g.y + (row + offset) * g.cell, g.w, g.cell - g.rowGap);
      }
      ctx.restore();
      if (state.held.includes(i)) {
        ctx.strokeStyle = INK;
        ctx.lineWidth = .002;
        ctx.beginPath();
        ctx.moveTo(x + g.w * .38, g.y - .008);
        ctx.lineTo(x + g.w * .62, g.y - .008);
        ctx.stroke();
        text('держим', x + g.w / 2, g.y - .022, 'center', MUTED, .013);
      }
    });

    if (state.win) {
      pattern(symbolAt(state.reels[0]), g.x, g.y + 2 * g.cell, g.right - g.x, g.cell - g.rowGap, state.winTime, true);
    }

    ctx.strokeStyle = RED;
    ctx.lineWidth = .002;
    ctx.strokeRect(
      g.x - g.rowGap / 2,
      g.y + 2 * g.cell - g.rowGap / 2,
      g.right - g.x + g.rowGap,
      g.cell,
    );
    ctx.strokeStyle = INK;
    ctx.lineWidth = .026;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(g.knobX, g.y + g.h + .025);
    ctx.lineTo(g.knobX, g.knobY + state.pull);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(g.knobX, g.knobY + state.pull, .037, 0, Math.PI * 2);
    ctx.fillStyle = RED;
    ctx.fill();

    text('собери три одинаковых внизу', .5, .79, 'center', RED, .016);
    const caption = state.spinning ? 'смотрим на нижнюю строку'
      : state.win ? 'три одинаковых'
      : state.dragging ? 'отпусти хвост'
      : 'нажми или потяни рычаг ↓';
    text(caption, g.x, .88, 'left', state.win ? RED : MUTED, .02);
    if (S >= 520) text('совпавшая пара держится сама · касание меняет выбор', g.x, .925, 'left', MUTED, .014);
  }

  function resize() {
    W = workspace.clientWidth;
    H = workspace.clientHeight;
    S = Math.min(W, H);
    ox = (W - S) / 2;
    oy = (H - S) / 2;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  function track(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - bounds.left - ox) / S;
    pointer.y = (event.clientY - bounds.top - oy) / S;
  }

  function down(event) {
    if (pointer.down || state.spinning || state.autoPull || (event.pointerType === 'mouse' && event.button !== 0)) return;
    track(event);
    if (pointer.x < 0 || pointer.x > 1 || pointer.y < 0 || pointer.y > 1) return;
    pointer.down = true;
    pointer.id = event.pointerId;
    canvas.setPointerCapture(event.pointerId);

    const g = GEOMETRY;
    const onLever = Math.abs(pointer.x - g.knobX) < .055
      && pointer.y > g.y + g.h
      && pointer.y < g.knobY + state.pull + .06;
    if (onLever) {
      state.dragging = true;
      state.startY = pointer.y;
      return;
    }

    if (pointer.y < g.y || pointer.y > g.y + g.h) return;
    const i = Math.floor((pointer.x - g.x) / (g.w + g.columnGap));
    if (i < 0 || i >= 3 || pointer.x > g.x + i * (g.w + g.columnGap) + g.w) return;
    if (state.held.includes(i)) state.held = state.held.filter(n => n !== i);
    else {
      if (state.held.length === 2) state.held.shift();
      state.held.push(i);
    }
  }

  function move(event) {
    if (!pointer.down || event.pointerId !== pointer.id) return;
    track(event);
    if (state.dragging) state.pull = clamp(pointer.y - state.startY, 0, .075);
  }

  function up(event) {
    if (!pointer.down || event.pointerId !== pointer.id) return;
    track(event);
    const pulled = state.dragging && state.pull > .025;
    const clicked = state.dragging && !pulled;
    state.dragging = false;
    pointer.down = false;
    pointer.id = null;
    if (pulled) spin();
    else if (clicked) trigger();
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'Нажми или потяни рычаг · Enter — вращение\nКоснись барабана — удержать · R — заново';

  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.id = 'shch-panel';
  panel.hidden = true;
  const note = document.createElement('p');
  note.textContent = 'Три одинаковых паттерна в нижнем ряду дают клетку на холсте Я.';
  const restart = document.createElement('button');
  restart.type = 'button';
  restart.className = 'sketch-action';
  restart.textContent = 'заново (R)';
  restart.addEventListener('click', reset);
  panel.append(note, restart);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'sketch-toggle';
  toggle.dataset.letterLayer = '';
  toggle.textContent = 'параметры (tab)';
  toggle.setAttribute('aria-controls', panel.id);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  });

  function key(event) {
    if (event.target.closest('input, textarea, select') || event.target.isContentEditable) return;
    if (event.code === 'Tab') {
      event.preventDefault();
      toggle.click();
    } else if (event.code === 'Enter') {
      event.preventDefault();
      if (!event.repeat) trigger();
    } else if (event.code === 'KeyR') {
      event.preventDefault();
      if (!event.repeat) reset();
    }
  }

  function frame(now) {
    debt = Math.min(.1, debt + Math.max(0, (now - last) / 1000));
    last = now;
    while (debt >= STEP) {
      step();
      debt -= STEP;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    ctx.translate(ox, oy);
    ctx.scale(S, S);
    draw();
    frameId = requestAnimationFrame(frame);
  }

  const observer = new ResizeObserver(resize);
  workspace.append(hint, panel, toggle);
  observer.observe(workspace);
  resize();
  reset();
  canvas.style.cursor = 'pointer';
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up);
  document.addEventListener('keydown', key);
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    observer.disconnect();
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('lostpointercapture', up);
    document.removeEventListener('keydown', key);
    hint.remove();
    panel.remove();
    toggle.remove();
    delete workspace.dataset.ground;
    canvas.style.cursor = '';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
