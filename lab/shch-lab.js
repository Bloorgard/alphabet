const SHCH_ROW_GAP = .012;
const SHCH_COLUMN_GAP = .05;
const SHCH_TILE = .19 - SHCH_ROW_GAP;
const SHCH_WIDTH = SHCH_TILE * 3 + SHCH_COLUMN_GAP * 2;
const SHCH = {
  x: (1 - SHCH_WIDTH) / 2, y: .18, w: SHCH_TILE, columnGap: SHCH_COLUMN_GAP,
  rowGap: SHCH_ROW_GAP, h: .57, cell: .19,
  right: (1 + SHCH_WIDTH) / 2, knobX: (1 + SHCH_WIDTH) / 2 + .055, knobY: .84,
};
const shchMod = (n, m) => ((n % m) + m) % m;

function shchStrip() {
  const strip = Array.from({ length: 24 }, (_, i) => i % 6);
  do {
    for (let i = strip.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [strip[i], strip[j]] = [strip[j], strip[i]];
    }
  } while (strip.some((symbol, i) => symbol === strip[(i + 1) % strip.length]));
  return strip;
}

function shchSymbol(reel, row = 2) {
  return reel.strip[shchMod(row - Math.round(reel.pos), reel.strip.length)];
}

function shchSetup() {
  Object.assign(modeState, {
    reels: [0, 1, 0].map(pos => ({ strip: shchStrip(), pos, from: pos, target: pos, time: 0, duration: 0 })),
    spinning: false, held: [], autoPull: 0, confetti: [], pull: 0, dragging: false,
    turns: 0, wins: 0, win: false, winTime: 0,
  });
}

function shchTrigger() {
  if (modeState.spinning || modeState.autoPull) return;
  setPaused(false);
  modeState.autoPull = .001;
}

function shchSpin() {
  const s = modeState;
  if (s.spinning) return;
  setPaused(false);
  s.spinning = true;
  s.win = false;
  s.winTime = 0;
  s.turns++;
  s.reels.forEach((r, i) => {
    r.time = 0;
    r.from = r.pos;
    r.target = r.pos + 24 + Math.floor(Math.random() * r.strip.length);
    r.duration = s.held.includes(i) ? 0 : num('tempo') + i * .42;
    if (s.held.includes(i)) r.target = r.pos;
  });
}

function shchStep() {
  const s = modeState;
  if (s.autoPull) {
    s.autoPull += STEP;
    s.pull = .065 * Math.sin(Math.min(1, s.autoPull / .3) * Math.PI / 2);
    if (s.autoPull >= .3) { s.autoPull = 0; shchSpin(); }
  } else if (!s.dragging) s.pull *= .78;
  if (s.win) s.winTime += STEP;
  for (const p of s.confetti) {
    p.y += p.speed * STEP;
    p.x += Math.sin(p.y * 18 + p.sway) * .025 * STEP;
    p.angle += p.spin * STEP;
  }
  s.confetti = s.confetti.filter(p => p.y < 1.08);
  if (!s.spinning) return;
  let finished = true;
  for (const r of s.reels) {
    if (!r.duration) continue;
    r.time = Math.min(r.duration, r.time + STEP);
    const t = r.time / r.duration;
    r.pos = lerp(r.from, r.target, 1 - Math.pow(1 - t, 3));
    if (t < 1) finished = false;
    else r.pos = r.target;
  }
  if (finished) {
    s.spinning = false;
    s.reels.forEach(r => { r.pos = shchMod(Math.round(r.pos), r.strip.length); });
    s.win = s.reels.every(r => shchSymbol(r) === shchSymbol(s.reels[0]));
    if (s.win) {
      s.wins++; s.winTime = 0;
      s.confetti = Array.from({ length: 72 }, (_, i) => ({
        x: .035 + Math.random() * .93,
        y: -.08 - Math.random() * .75,
        speed: .28 + Math.random() * .35,
        size: .006 + Math.random() * .008,
        angle: Math.random() * Math.PI,
        spin: (Math.random() - .5) * 7,
        sway: Math.random() * Math.PI * 2,
        light: i % 2 === 0,
      }));
      s.held = [];
    } else if (current === 'classic') {
      s.held = [];
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
        if (shchSymbol(s.reels[i]) === shchSymbol(s.reels[j])) s.held = [i, j];
      }
    }
  }
}

function shchPattern(kind, x, y, w, h, phase = 0, animated = false) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = INK; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PAPER;
  const unit = SHCH.w / 4;
  if (kind === 0) {
    for (let row = 0; row < 4; row++) for (let col = -1; col < Math.ceil(w / unit) + 1; col++) {
      const pulse = animated ? .76 + .24 * Math.sin(phase * 5 + row * .8 + col * .6) : 1;
      ctx.beginPath(); ctx.arc(x + (col + .5) * unit, y + (row + .5) * h / 4, unit * .32 * pulse, 0, Math.PI * 2); ctx.fill();
    }
  } else if (kind === 1) {
    const shift = animated ? shchMod(phase * .035, unit) : 0;
    for (let k = -6; k < Math.ceil(w / unit) + 7; k++) {
      const a = x + k * unit + shift;
      ctx.beginPath(); ctx.moveTo(a, y + h); ctx.lineTo(a + h, y);
      ctx.lineTo(a + h + unit * .5, y); ctx.lineTo(a + unit * .5, y + h); ctx.fill();
    }
  } else if (kind === 2) {
    const shift = animated ? Math.sin(phase * 2.5) * unit * .2 : 0;
    for (let row = -1; row < 5; row++) for (let col = -2; col < Math.ceil(w / unit) + 2; col++) {
      const direction = row % 2 ? -1 : 1;
      const cx = x + (col + .5) * unit + shift * direction;
      const cy = y + (row + .5) * h / 4 + shift * .45;
      ctx.beginPath(); ctx.moveTo(cx, cy - h / 8); ctx.lineTo(cx + unit / 2, cy);
      ctx.lineTo(cx, cy + h / 8); ctx.lineTo(cx - unit / 2, cy); ctx.fill();
    }
  } else if (kind === 3) {
    ctx.strokeStyle = PAPER; ctx.lineWidth = unit * .25;
    ctx.lineCap = 'butt';
    for (let row = -1; row < 6; row++) {
      ctx.beginPath();
      for (let t = -.01; t <= w + .01; t += .002) {
        const wave = animated ? phase * 3 : 0;
        const yy = y + row * h / 4 + Math.sin(t / unit * Math.PI * 2 - wave) * h / 16;
        if (t === -.01) ctx.moveTo(x + t, yy); else ctx.lineTo(x + t, yy);
      }
      ctx.stroke();
    }
  } else if (kind === 4) {
    for (let row = 0; row < 4; row++) for (let col = 0; col < Math.ceil(w / unit); col++) {
      const cx = x + (col + .5) * unit, cy = y + (row + .5) * h / 4;
      const turn = animated ? Math.sin(phase * 3 + row + col) * .22 : 0;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(turn);
      ctx.fillRect(-unit * .32, -unit * .10, unit * .64, unit * .20);
      ctx.fillRect(-unit * .10, -unit * .32, unit * .20, unit * .64);
      ctx.restore();
    }
  } else {
    ctx.strokeStyle = PAPER;
    for (let row = 0; row < 4; row++) for (let col = -1; col < Math.ceil(w / unit) + 1; col++) {
      const pulse = animated ? .72 + .2 * (1 + Math.sin(phase * 4 + row + col)) : 1;
      ctx.lineWidth = unit * .13 * pulse;
      ctx.beginPath(); ctx.arc(x + (col + .5) * unit, y + (row + .5) * h / 4, unit * (.25 + .06 * pulse), 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.restore();
}

function shchText(text, x, y, align = 'left', color = MUTED, size = .017) {
  ctx.save(); ctx.scale(1 / S, 1 / S);
  ctx.fillStyle = color; ctx.font = `${Math.max(10, size * S)}px 'DM Mono', monospace`;
  ctx.textAlign = align; ctx.fillText(text, x * S, y * S); ctx.restore();
}

function shchDraw() {
  const s = modeState, g = SHCH;
  ctx.save(); ctx.scale(S, S);
  for (const p of s.confetti) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = p.light ? '#f1ede5' : '#161616';
    ctx.strokeStyle = p.light ? '#161616' : '#f1ede5';
    ctx.lineWidth = .0015;
    ctx.fillRect(-p.size * .32, -p.size, p.size * .64, p.size * 2);
    ctx.strokeRect(-p.size * .32, -p.size, p.size * .64, p.size * 2);
    ctx.restore();
  }
  shchText(`вращения · ${s.turns}`, g.x, .105);
  shchText(`комбо · ${s.wins}`, g.right, .105, 'right', s.win ? RED : MUTED);
  s.reels.forEach((r, i) => {
    const x = g.x + i * (g.w + g.columnGap);
    ctx.save(); ctx.beginPath(); ctx.rect(x, g.y, g.w, g.h); ctx.clip();
    const base = Math.floor(r.pos), offset = r.pos - base;
    for (let row = -1; row < 4; row++) {
      shchPattern(r.strip[shchMod(row - base, r.strip.length)], x, g.y + (row + offset) * g.cell, g.w, g.cell - g.rowGap);
    }
    ctx.restore();
    if (s.held.includes(i)) {
      ctx.strokeStyle = INK; ctx.lineWidth = .002;
      ctx.beginPath();
      ctx.moveTo(x + g.w * .38, g.y - .008);
      ctx.lineTo(x + g.w * .62, g.y - .008);
      ctx.stroke();
      shchText('держим', x + g.w / 2, g.y - .022, 'center', MUTED, .013);
    }
  });
  if (s.win) {
    shchPattern(shchSymbol(s.reels[0]), g.x, g.y + 2 * g.cell, g.right - g.x, g.cell - g.rowGap, s.winTime, true);
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
  ctx.lineTo(g.knobX, g.knobY + s.pull);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(g.knobX, g.knobY + s.pull, .037, 0, Math.PI * 2);
  ctx.fillStyle = RED; ctx.fill();
  shchText('собери три одинаковых внизу', .5, .79, 'center', RED, .016);
  const caption = s.spinning ? 'смотрим на нижнюю строку' : s.win ? 'три одинаковых' : s.dragging ? 'отпусти хвост' : 'нажми или потяни рычаг ↓';
  shchText(caption, g.x, .88, 'left', s.win ? RED : MUTED, .02);
  shchText(current === 'hold' ? 'касание — удержать до двух' : 'совпавшая пара держится сама', g.x, .925, 'left', MUTED, .016);
  ctx.restore();
}

function shchDown(event) {
  const s = modeState, g = SHCH;
  if (s.spinning || s.autoPull || (event.pointerType === 'mouse' && event.button !== 0)) return;
  const onLever = Math.abs(pointer.x - g.knobX) < .055
    && pointer.y > g.y + g.h
    && pointer.y < g.knobY + s.pull + .06;
  if (onLever) {
    s.dragging = true; s.startY = pointer.y; setPaused(false); return;
  }
  if (current === 'hold' && pointer.y >= g.y && pointer.y <= g.y + g.h) {
    const i = Math.floor((pointer.x - g.x) / (g.w + g.columnGap));
    if (i >= 0 && i < 3 && pointer.x <= g.x + i * (g.w + g.columnGap) + g.w) {
      if (s.held.includes(i)) s.held = s.held.filter(n => n !== i);
      else { if (s.held.length === 2) s.held.shift(); s.held.push(i); }
    }
  }
}

function shchMove() {
  if (modeState.dragging) modeState.pull = clamp(pointer.y - modeState.startY, 0, .075);
}

function shchUp() {
  const s = modeState;
  if (!s.dragging) return;
  s.dragging = false;
  if (s.pull > .025) shchSpin();
  else shchTrigger();
}

const MODES = Object.fromEntries([
  ['classic', 'автомат'], ['hold', 'удержание'],
].map(([key, label]) => [key, {
  label,
  note: 'Нажми рычаг или тяни вниз и отпускай. Enter — вращение. Комбо — три одинаковых паттерна в нижней строке. ' + (key === 'hold' ? 'Касанием можно удержать до двух барабанов; повторное касание снимает удержание.' : 'Совпавшая пара в нижней строке сохраняется автоматически до комбо.'),
  tools: [
    { type: 'button', label: 'крутить ↵', action: shchTrigger },
    { type: 'range', key: 'tempo', label: 'вращение · сек', min: 1, max: 3, step: .25, value: 1.75 },
    { type: 'button', label: 'заново', action: () => setMode(current) },
  ],
  onKey(event, down) { if (down && !event.repeat && event.key === 'Enter' && !(event.target instanceof Element && event.target.closest('button'))) { event.preventDefault(); shchTrigger(); } },
  setup: shchSetup, step: shchStep, draw: shchDraw, onDown: shchDown, onMove: shchMove, onUp: shchUp,
}]));

canvas.addEventListener('pointercancel', () => { modeState.dragging = false; });
startLab({ title: 'Щ · однорукий бандит', modes: MODES, start: 'classic', ground: 'ink' });
