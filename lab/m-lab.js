/* М — три способа заставить две диагонали жить как одно движение.
   Во всех режимах вертикали и центральная впадина не декорация: они задают
   механику, а не появляются после неё. */

function mPoint(x, y) {
  return { x, y };
}

function mLine(a, b, color = INK, width = 0.006) {
  line(a.x, a.y, b.x, b.y, color, width);
}

function mCircle(point, radius, color = INK) {
  dot(point.x, point.y, color, radius);
}

function drawFrame() {
  mLine(mPoint(0.22, 0.78), mPoint(0.22, 0.2), FAINT, 0.003);
  mLine(mPoint(0.78, 0.2), mPoint(0.78, 0.78), FAINT, 0.003);
}

function resetMetronome() {
  modeState.left = { angle: 0.48, speed: 0 };
  modeState.right = { angle: 0.48, speed: 0 };
  modeState.drag = null;
  modeState.pulse = 0;
  modeState.wasTogether = false;
  modeState.history = [[], []];
}

function metronomeBob(side) {
  const state = side === 'left' ? modeState.left : modeState.right;
  const anchor = side === 'left' ? mPoint(0.22, 0.2) : mPoint(0.78, 0.2);
  const direction = side === 'left' ? 1 : -1;
  const length = num('length');
  return mPoint(anchor.x + direction * Math.sin(state.angle) * length, anchor.y + Math.cos(state.angle) * length);
}

function drawMetronome() {
  drawFrame();
  const left = metronomeBob('left');
  const right = metronomeBob('right');
  const arms = [
    [mPoint(0.22, 0.2), left],
    [mPoint(0.78, 0.2), right],
  ];

  if (on('trace')) {
    for (const trail of modeState.history) {
      for (let i = 1; i < trail.length; i += 1) {
        const alpha = 0.04 + (i / trail.length) * 0.15;
        mLine(trail[i - 1], trail[i], ink(alpha), 0.002);
      }
    }
  }

  for (const [index, [anchor, bob]] of arms.entries()) {
    mLine(anchor, bob, INK, 0.008);
    mCircle(anchor, 0.012, INK);
    mCircle(bob, 0.018, modeState.drag === (index === 0 ? modeState.left : modeState.right) ? RED : INK);
  }

  const gap = Math.hypot(left.x - right.x, left.y - right.y);
  mLine(left, right, gap < 0.045 ? RED : FAINT, 0.003);
  mCircle(mPoint(0.5, 0.78), 0.009, gap < 0.045 ? RED : FAINT);
  if (modeState.pulse > 0) {
    ctx.beginPath();
    ctx.arc(0.5 * S, 0.78 * S, (0.03 + (1 - modeState.pulse) * 0.1) * S, 0, Math.PI * 2);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 0.002 * S;
    ctx.globalAlpha = modeState.pulse;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  drawStatus(gap < 0.045 ? 'вместе' : 'разлад');
}

const metronome = {
  label: 'метроном',
  note: 'Тяни шарики или толкни любую половину. Две диагонали М — маятники, связанные в общей впадине.',
  draw: drawMetronome,
  tools: [
    { type: 'range', key: 'gravity', label: 'тяготение', min: 0.2, max: 1.8, step: 0.05, value: 0.85 },
    { type: 'range', key: 'coupling', label: 'связь', min: 0, max: 7, step: 0.1, value: 2.6 },
    { type: 'range', key: 'damping', label: 'затухание', min: 0, max: 0.15, step: 0.005, value: 0.025 },
    { type: 'range', key: 'length', label: 'длина', min: 0.42, max: 0.64, step: 0.01, value: 0.58 },
    { type: 'toggle', key: 'trace', label: 'след', value: true },
    { type: 'button', label: 'заново', action: resetMetronome },
  ],
  setup() {
    resetMetronome();
  },
  step() {
    const { left, right } = modeState;
    const coupling = num('coupling');
    const acceleration = (item, other) => -num('gravity') * Math.sin(item.angle) - num('damping') * item.speed + coupling * (other.angle - item.angle);
    left.speed += acceleration(left, right) * STEP;
    right.speed += acceleration(right, left) * STEP;
    left.angle = clamp(left.angle + left.speed * STEP, 0.14, 0.92);
    right.angle = clamp(right.angle + right.speed * STEP, 0.14, 0.92);
    if (modeState.drag) {
      const side = modeState.drag;
      const anchor = side === 'left' ? mPoint(0.22, 0.2) : mPoint(0.78, 0.2);
      const direction = side === 'left' ? 1 : -1;
      const dx = (pointer.x - anchor.x) * direction;
      const dy = pointer.y - anchor.y;
      side.angle = clamp(Math.atan2(dx, Math.max(0.1, dy)), 0.14, 0.92);
      side.speed = 0;
    }
    const leftBob = metronomeBob('left');
    const rightBob = metronomeBob('right');
    if (on('trace')) {
      for (const [index, bob] of [leftBob, rightBob].entries()) {
        modeState.history[index].push(bob);
        if (modeState.history[index].length > 50) modeState.history[index].shift();
      }
    }
    const together = Math.hypot(leftBob.x - rightBob.x, leftBob.y - rightBob.y) < 0.045;
    if (together && !modeState.wasTogether) modeState.pulse = 1;
    modeState.wasTogether = together;
    modeState.pulse = Math.max(0, modeState.pulse - STEP * 1.8);
  },
  onDown() {
    const left = metronomeBob('left');
    const right = metronomeBob('right');
    if (Math.hypot(pointer.x - left.x, pointer.y - left.y) < 0.06) modeState.drag = modeState.left;
    else if (Math.hypot(pointer.x - right.x, pointer.y - right.y) < 0.06) modeState.drag = modeState.right;
    else {
      const item = pointer.x < 0.5 ? modeState.left : modeState.right;
      item.speed += (pointer.x < 0.5 ? 1 : -1) * 1.7;
    }
  },
  onMove() {},
  onUp() {
    modeState.drag = null;
  },
};

function resetMembrane() {
  modeState.valley = { x: 0.5, y: 0.72, vx: 0, vy: 0 };
  modeState.target = { x: 0.5, y: 0.72 };
  modeState.drag = false;
  modeState.ring = 0;
}

function drawElasticPath() {
  const valley = modeState.valley;
  const left = mPoint(0.22, 0.2);
  const right = mPoint(0.78, 0.2);
  const points = [left];
  for (let i = 1; i < 5; i += 1) {
    const t = i / 5;
    points.push(mPoint(lerp(left.x, valley.x, t), lerp(left.y, valley.y, t) + Math.sin(t * Math.PI) * 0.025 * (1 - num('tension'))));
  }
  points.push(valley);
  for (let i = 1; i < 5; i += 1) {
    const t = i / 5;
    points.push(mPoint(lerp(valley.x, right.x, t), lerp(valley.y, right.y, t) + Math.sin(t * Math.PI) * 0.025 * (1 - num('tension'))));
  }
  points.push(right);
  for (let i = 1; i < points.length; i += 1) mLine(points[i - 1], points[i], INK, 0.008);
  drawFrame();
  mCircle(left, 0.012, INK);
  mCircle(right, 0.012, INK);
  mCircle(valley, 0.019, modeState.drag ? RED : INK);
  if (modeState.ring > 0) {
    ctx.beginPath();
    ctx.arc(valley.x * S, valley.y * S, (0.025 + (1 - modeState.ring) * 0.08) * S, 0, Math.PI * 2);
    ctx.strokeStyle = RED;
    ctx.globalAlpha = modeState.ring;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  drawStatus('натяжение');
}

const membrane = {
  label: 'плёнка',
  note: 'Тяни центральный узел. Лента между четырьмя верхними опорами сама ищет М; красный — свежий рывок.',
  draw: drawElasticPath,
  tools: [
    { type: 'range', key: 'tension', label: 'натяжение', min: 0.1, max: 1, step: 0.05, value: 0.72 },
    { type: 'range', key: 'return', label: 'возврат', min: 0.3, max: 4, step: 0.1, value: 1.4 },
    { type: 'button', label: 'заново', action: resetMembrane },
  ],
  setup() {
    resetMembrane();
  },
  step() {
    const { valley, target } = modeState;
    valley.vx += (target.x - valley.x) * num('return') * STEP;
    valley.vy += (target.y - valley.y) * num('return') * STEP;
    valley.vx *= 0.94;
    valley.vy *= 0.94;
    valley.x = clamp(valley.x + valley.vx * STEP, 0.3, 0.7);
    valley.y = clamp(valley.y + valley.vy * STEP, 0.35, 0.82);
    modeState.ring = Math.max(0, modeState.ring - STEP * 2);
  },
  onDown() {
    if (Math.hypot(pointer.x - modeState.valley.x, pointer.y - modeState.valley.y) < 0.07) modeState.drag = true;
  },
  onMove() {
    if (modeState.drag) {
      modeState.target.x = pointer.x;
      modeState.target.y = pointer.y;
      modeState.ring = 1;
    }
  },
  onUp() {
    modeState.drag = false;
  },
};

function resetBridge() {
  modeState.load = { x: 0.5, y: 0.58 };
  modeState.targetX = 0.5;
  modeState.velocity = 0;
  modeState.drag = false;
  modeState.snap = 0;
}

function bridgeShape() {
  const x = modeState.load.x;
  const sag = num('weight') * (0.04 + Math.abs(x - 0.5) * 0.34);
  const y = 0.56 + sag;
  return {
    left: mPoint(0.22, 0.2),
    valley: mPoint(x, y),
    right: mPoint(0.78, 0.2),
  };
}

function drawBridge() {
  const shape = bridgeShape();
  drawFrame();
  mLine(shape.left, shape.valley, INK, 0.008);
  mLine(shape.valley, shape.right, INK, 0.008);
  mCircle(shape.left, 0.012, INK);
  mCircle(shape.right, 0.012, INK);
  mCircle(shape.valley, 0.02, modeState.drag ? RED : INK);
  mLine(mPoint(modeState.load.x, 0.2), shape.valley, FAINT, 0.002);
  mCircle(mPoint(modeState.load.x, 0.2), 0.01, FAINT);
  if (modeState.snap > 0) {
    mLine(mPoint(0.5, 0.2), mPoint(0.5, 0.8), RED, 0.002);
    ctx.globalAlpha = modeState.snap;
    ctx.strokeStyle = RED;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  drawStatus(`груз ${Math.round(modeState.load.x * 100)}%`);
}

const bridge = {
  label: 'мост',
  note: 'Веди груз по двум пролётам. Чем ближе к краю, тем сильнее М прогибается; отпусти — мост отыграет.',
  draw: drawBridge,
  tools: [
    { type: 'range', key: 'weight', label: 'масса', min: 0.4, max: 2, step: 0.05, value: 1 },
    { type: 'range', key: 'return', label: 'упругость', min: 0.2, max: 2, step: 0.05, value: 0.8 },
    { type: 'button', label: 'заново', action: resetBridge },
  ],
  setup() {
    resetBridge();
  },
  step() {
    const distance = modeState.targetX - modeState.load.x;
    modeState.velocity += distance * num('return') * STEP;
    modeState.velocity *= 0.93;
    modeState.load.x = clamp(modeState.load.x + modeState.velocity * STEP, 0.25, 0.75);
    modeState.load.y = bridgeShape().valley.y;
    modeState.snap = Math.max(0, modeState.snap - STEP * 2);
  },
  onDown() {
    if (Math.hypot(pointer.x - modeState.load.x, pointer.y - 0.2) < 0.08) modeState.drag = true;
    else if (Math.hypot(pointer.x - modeState.load.x, pointer.y - modeState.load.y) < 0.08) modeState.drag = true;
  },
  onMove() {
    if (modeState.drag) modeState.targetX = pointer.x;
  },
  onUp() {
    modeState.drag = false;
    if (modeState.load.x > 0.47 && modeState.load.x < 0.53) modeState.snap = 1;
  },
};

function resetRhythm() {
  modeState.left = { angle: 0.503, speed: 0 };
  modeState.right = { angle: 0.503, speed: 0 };
  modeState.score = 0;
  modeState.misses = 0;
  modeState.over = false;
  modeState.flashKind = null;
  modeState.flashT = 0;
}

function rhythmBob(side) {
  const state = side === 'left' ? modeState.left : modeState.right;
  const anchor = side === 'left' ? mPoint(0.22, 0.2) : mPoint(0.78, 0.2);
  const direction = side === 'left' ? 1 : -1;
  return mPoint(anchor.x + direction * Math.sin(state.angle) * 0.58, anchor.y + Math.cos(state.angle) * 0.58);
}

function drawRhythm() {
  drawFrame();
  const left = rhythmBob('left');
  const right = rhythmBob('right');
  const gap = Math.hypot(left.x - right.x, left.y - right.y);
  const hitWindow = num('window');

  mLine(mPoint(0.22, 0.2), left, INK, 0.008);
  mLine(mPoint(0.78, 0.2), right, INK, 0.008);
  mCircle(mPoint(0.22, 0.2), 0.012, INK);
  mCircle(mPoint(0.78, 0.2), 0.012, INK);
  mCircle(left, 0.016, INK);
  mCircle(right, 0.016, INK);

  const mid = mPoint((left.x + right.x) / 2, (left.y + right.y) / 2);
  if (gap < hitWindow && !modeState.over) {
    ctx.beginPath();
    ctx.arc(mid.x * S, mid.y * S, hitWindow * 0.5 * S, 0, Math.PI * 2);
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 0.002 * S;
    ctx.stroke();
  }

  if (modeState.flashT > 0) {
    ctx.beginPath();
    ctx.arc(mid.x * S, mid.y * S, (0.03 + (1 - modeState.flashT) * 0.12) * S, 0, Math.PI * 2);
    ctx.strokeStyle = modeState.flashKind === 'hit' ? RED : MUTED;
    ctx.lineWidth = 0.002 * S;
    ctx.globalAlpha = modeState.flashT;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const lives = '●'.repeat(3 - modeState.misses) + '○'.repeat(modeState.misses);
  drawStatus(`${modeState.score} · ${lives}`, modeState.flashKind === 'hit' && modeState.flashT > 0);

  if (modeState.over) {
    ctx.fillStyle = INK;
    ctx.font = `${Math.round(S * 0.026)}px 'DM Mono', ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('клик — заново', S * 0.5, S * 0.9);
    ctx.textAlign = 'left';
  }
}

const rhythm = {
  label: 'ритм-ловушка',
  note: 'Маятники расходятся и снова сходятся сами. Клик в момент, когда они рядом, — очко; клик мимо — минус жизнь. Три промаха — конец.',
  draw: drawRhythm,
  tools: [
    { type: 'range', key: 'gravity', label: 'тяготение', min: 0.4, max: 1.6, step: 0.05, value: 0.9 },
    { type: 'range', key: 'coupling', label: 'связь', min: 0.5, max: 6, step: 0.1, value: 3 },
    { type: 'range', key: 'window', label: 'окно', min: 0.03, max: 0.12, step: 0.005, value: 0.07 },
    { type: 'button', label: 'заново', action: resetRhythm },
  ],
  setup() {
    resetRhythm();
  },
  step() {
    if (modeState.over) return;
    const { left, right } = modeState;
    const coupling = num('coupling');
    const gravity = num('gravity') * (1 + modeState.score * 0.03);
    const acceleration = (item, other) => -gravity * Math.sin(item.angle) + coupling * (other.angle - item.angle);
    left.speed += acceleration(left, right) * STEP;
    right.speed += acceleration(right, left) * STEP;
    left.angle = clamp(left.angle + left.speed * STEP, 0.14, 0.92);
    right.angle = clamp(right.angle + right.speed * STEP, 0.14, 0.92);
    modeState.flashT = Math.max(0, modeState.flashT - STEP * 1.8);
  },
  onDown() {
    if (modeState.over) { resetRhythm(); return; }
    const left = rhythmBob('left');
    const right = rhythmBob('right');
    const gap = Math.hypot(left.x - right.x, left.y - right.y);
    if (gap < num('window')) {
      modeState.score += 1;
      modeState.flashKind = 'hit';
    } else {
      modeState.misses += 1;
      modeState.flashKind = 'miss';
      if (modeState.misses >= 3) modeState.over = true;
    }
    modeState.flashT = 1;
  },
  onMove() {},
  onUp() {},
};

function resetRally() {
  modeState.phase = 0;
  modeState.dir = 1;
  modeState.score = 0;
  modeState.misses = 0;
  modeState.over = false;
  modeState.wasInZone = false;
  modeState.resolved = true;
  modeState.flashKind = null;
  modeState.flashT = 0;
}

function rallyPoint(phase) {
  const left = mPoint(0.22, 0.2);
  const valley = mPoint(0.5, 0.78);
  const right = mPoint(0.78, 0.2);
  return phase <= 0.5 ? mPoint(lerp(left.x, valley.x, phase / 0.5), lerp(left.y, valley.y, phase / 0.5))
    : mPoint(lerp(valley.x, right.x, (phase - 0.5) / 0.5), lerp(valley.y, right.y, (phase - 0.5) / 0.5));
}

function drawRally() {
  drawFrame();
  const left = mPoint(0.22, 0.2);
  const valley = mPoint(0.5, 0.78);
  const right = mPoint(0.78, 0.2);
  mLine(left, valley, INK, 0.008);
  mLine(valley, right, INK, 0.008);
  mCircle(left, 0.012, INK);
  mCircle(right, 0.012, INK);

  const zoneHalf = num('window') / 2;
  const zoneStart = rallyPoint(0.5 - zoneHalf);
  const zoneEnd = rallyPoint(0.5 + zoneHalf);
  mLine(zoneStart, zoneEnd, FAINT, 0.014);

  const ball = rallyPoint(modeState.phase);
  mCircle(ball, 0.016, modeState.over ? MUTED : INK);

  if (modeState.flashT > 0) {
    ctx.beginPath();
    ctx.arc(valley.x * S, valley.y * S, (0.03 + (1 - modeState.flashT) * 0.12) * S, 0, Math.PI * 2);
    ctx.strokeStyle = modeState.flashKind === 'hit' ? RED : MUTED;
    ctx.lineWidth = 0.002 * S;
    ctx.globalAlpha = modeState.flashT;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const lives = '●'.repeat(3 - modeState.misses) + '○'.repeat(modeState.misses);
  drawStatus(`${modeState.score} · ${lives}`, modeState.flashKind === 'hit' && modeState.flashT > 0);

  if (modeState.over) {
    ctx.fillStyle = INK;
    ctx.font = `${Math.round(S * 0.026)}px 'DM Mono', ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('клик — заново', S * 0.5, S * 0.9);
    ctx.textAlign = 'left';
  }
}

const rally = {
  label: 'рэлли',
  note: 'Мяч идёт от вершины к вершине через впадину. Клик точно во впадине держит рэлли; мимо окна — минус жизнь.',
  draw: drawRally,
  tools: [
    { type: 'range', key: 'speed', label: 'скорость', min: 0.3, max: 1.4, step: 0.05, value: 0.6 },
    { type: 'range', key: 'window', label: 'окно', min: 0.06, max: 0.28, step: 0.01, value: 0.16 },
    { type: 'button', label: 'заново', action: resetRally },
  ],
  setup() {
    resetRally();
  },
  step() {
    if (modeState.over) return;
    const speed = num('speed') * (1 + modeState.score * 0.05);
    modeState.phase += modeState.dir * speed * STEP;
    if (modeState.phase >= 1) { modeState.phase = 1; modeState.dir = -1; }
    if (modeState.phase <= 0) { modeState.phase = 0; modeState.dir = 1; }

    const zoneHalf = num('window') / 2;
    const inZone = Math.abs(modeState.phase - 0.5) < zoneHalf;
    if (inZone && !modeState.wasInZone) modeState.resolved = false;
    if (!inZone && modeState.wasInZone && !modeState.resolved) {
      modeState.misses += 1;
      modeState.flashKind = 'miss';
      modeState.flashT = 1;
      if (modeState.misses >= 3) modeState.over = true;
    }
    modeState.wasInZone = inZone;
    modeState.flashT = Math.max(0, modeState.flashT - STEP * 1.8);
  },
  onDown() {
    if (modeState.over) { resetRally(); return; }
    const zoneHalf = num('window') / 2;
    const inZone = Math.abs(modeState.phase - 0.5) < zoneHalf;
    if (inZone && !modeState.resolved) {
      modeState.resolved = true;
      modeState.score += 1;
      modeState.flashKind = 'hit';
    } else {
      modeState.misses += 1;
      modeState.flashKind = 'miss';
      if (modeState.misses >= 3) modeState.over = true;
    }
    modeState.flashT = 1;
  },
  onMove() {},
  onUp() {},
};

function spawnTarget() {
  return {
    x: 0.15 + Math.random() * 0.7,
    y: 0.08 + Math.random() * 0.32,
    r: 0.045,
  };
}

const ROPE_N = 18;
const ROPE_ANCHOR_L = mPoint(0.22, 0.2);
const ROPE_ANCHOR_R = mPoint(0.78, 0.2);
const ROPE_DAMPING = 0.995;
const ROPE_GRAVITY = 2.2;
const ROPE_ITER = 10;

function initRope(anchorL, anchorR) {
  const nodes = [];
  for (let i = 0; i < ROPE_N; i += 1) {
    const t = i / (ROPE_N - 1);
    const x = lerp(anchorL.x, anchorR.x, t);
    const y = lerp(anchorL.y, anchorR.y, t);
    nodes.push({ x, y, px: x, py: y, pinned: i === 0 || i === ROPE_N - 1 });
  }
  modeState.rope = nodes;
  modeState.ropeStraight = Math.hypot(anchorR.x - anchorL.x, anchorR.y - anchorL.y);
}

function stepRope() {
  const g = ROPE_GRAVITY * STEP * STEP;
  for (const node of modeState.rope) {
    if (node.pinned) continue;
    const vx = (node.x - node.px) * ROPE_DAMPING;
    const vy = (node.y - node.py) * ROPE_DAMPING;
    node.px = node.x;
    node.py = node.y;
    node.x += vx;
    node.y += vy + g;
  }
  const rest = (modeState.ropeStraight * num('slack')) / (ROPE_N - 1);
  for (let iter = 0; iter < ROPE_ITER; iter += 1) {
    for (let i = 0; i < modeState.rope.length - 1; i += 1) {
      const a = modeState.rope[i];
      const b = modeState.rope[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const diff = (dist - rest) / dist;
      const ax = dx * 0.5 * diff;
      const ay = dy * 0.5 * diff;
      if (!a.pinned) { a.x += ax; a.y += ay; }
      if (!b.pinned) { b.x -= ax; b.y -= ay; }
    }
  }
}

function ropeHeightAt(x) {
  const nodes = modeState.rope;
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const a = nodes[i];
    const b = nodes[i + 1];
    if ((x >= a.x && x <= b.x) || (x <= a.x && x >= b.x)) {
      const t = (x - a.x) / ((b.x - a.x) || 0.0001);
      return a.y + (b.y - a.y) * t;
    }
  }
  return x < nodes[0].x ? nodes[0].y : nodes[nodes.length - 1].y;
}

function nearestRopeNode(x) {
  let best = 1;
  let bestDist = Infinity;
  modeState.rope.forEach((node, i) => {
    if (node.pinned) return;
    const dist = Math.abs(node.x - x);
    if (dist < bestDist) { bestDist = dist; best = i; }
  });
  return best;
}

function resetSlingshot(anchorL = ROPE_ANCHOR_L, anchorR = ROPE_ANCHOR_R, targets = null) {
  initRope(anchorL, anchorR);
  for (let i = 0; i < 500; i += 1) stepRope();
  modeState.props = [];
  modeState.dragProp = null;
  modeState.heldNodeIndex = null;
  modeState.targets = targets ? targets.map((t) => ({ ...t })) : [spawnTarget(), spawnTarget(), spawnTarget()];
  modeState.score = 0;
  modeState.ring = 0;
  modeState.hitAt = mPoint(0.5, 0.5);
}

const AMMO_SHAPES = ['circle', 'square', 'triangle'];
const AMMO_LETTERS = ['А', 'Б', 'В', 'Г', 'Д'];
const SLOT_XS = [0.3, 0.4, 0.5, 0.6, 0.7];

function ammoSlots() {
  const useLetters = on('letters');
  return SLOT_XS.map((x, i) => ({
    x,
    y: 0.92,
    kind: useLetters ? 'letter' : 'shape',
    glyph: useLetters ? AMMO_LETTERS[i % AMMO_LETTERS.length] : AMMO_SHAPES[i % AMMO_SHAPES.length],
  }));
}

function drawAmmoIcon(x, y, size, kind, glyph, color) {
  if (kind === 'letter') {
    ctx.fillStyle = color;
    ctx.font = `${Math.round(size * 2.4 * S)}px 'DM Mono', ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, x * S, y * S);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.006 * S;
  if (glyph === 'circle') {
    ctx.beginPath();
    ctx.arc(x * S, y * S, size * S, 0, Math.PI * 2);
    ctx.stroke();
  } else if (glyph === 'square') {
    ctx.strokeRect((x - size) * S, (y - size) * S, size * 2 * S, size * 2 * S);
  } else {
    ctx.beginPath();
    ctx.moveTo(x * S, (y - size) * S);
    ctx.lineTo((x - size) * S, (y + size) * S);
    ctx.lineTo((x + size) * S, (y + size) * S);
    ctx.closePath();
    ctx.stroke();
  }
}

function drawSlingshot() {
  drawFrame();
  for (let i = 1; i < modeState.rope.length; i += 1) mLine(modeState.rope[i - 1], modeState.rope[i], INK, 0.008);
  mCircle(ROPE_ANCHOR_L, 0.012, INK);
  mCircle(ROPE_ANCHOR_R, 0.012, INK);

  for (const slot of ammoSlots()) drawAmmoIcon(slot.x, slot.y, 0.025, slot.kind, slot.glyph, INK);

  for (const target of modeState.targets) {
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 0.004 * S;
    ctx.beginPath();
    ctx.arc(target.x * S, target.y * S, target.r * S, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const prop of modeState.props) {
    drawAmmoIcon(prop.x, prop.y, 0.026, prop.kind, prop.glyph, prop.state === 'dragging' ? RED : INK);
  }

  if (modeState.ring > 0) {
    ctx.beginPath();
    ctx.arc(modeState.hitAt.x * S, modeState.hitAt.y * S, (0.03 + (1 - modeState.ring) * 0.12) * S, 0, Math.PI * 2);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 0.002 * S;
    ctx.globalAlpha = modeState.ring;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawStatus(`${modeState.score}`, modeState.ring > 0.5);
}

const SLING_GRAVITY = 1.4;
const SLING_POWER = 6.5;
const SLING_MIN_PULL = 0.06;
const SLING_MAX_PULL = 0.6;
const ROLL_ACCEL = 6;
const ROLL_FRICTION = 0.985;

const slingshot = {
  label: 'рогатка',
  note: 'Кинь фигуру на канат — она скатится в середину. Схвати её там и оттяни, чтобы выстрелить в мишени.',
  draw: drawSlingshot,
  tools: [
    { type: 'toggle', key: 'letters', label: 'буквами', value: false },
    { type: 'range', key: 'slack', label: 'провис', min: 1.2, max: 3, step: 0.1, value: 1.5 },
    { type: 'button', label: 'заново', action: resetSlingshot },
  ],
  setup() {
    resetSlingshot();
  },
  step() {
    if (modeState.heldNodeIndex !== null && modeState.dragProp) {
      const node = modeState.rope[modeState.heldNodeIndex];
      node.pinned = true;
      node.x = modeState.dragProp.x;
      node.y = modeState.dragProp.y;
    }
    stepRope();

    const minX = modeState.rope[0].x + 0.02;
    const maxX = modeState.rope[modeState.rope.length - 1].x - 0.02;

    for (const prop of modeState.props) {
      if (prop.state === 'dragging') continue;

      if (prop.state === 'free') {
        prop.vy += SLING_GRAVITY * STEP;
        prop.x += prop.vx * STEP;
        prop.y += prop.vy * STEP;
        const ropeY = ropeHeightAt(prop.x);
        if (prop.y >= ropeY && prop.x > minX && prop.x < maxX) {
          prop.y = ropeY;
          prop.rollV = prop.vx * 0.5;
          prop.vx = 0;
          prop.vy = 0;
          prop.state = 'resting';
          prop.restX = prop.x;
          prop.restY = prop.y;
        } else if (prop.y > 1.05 || prop.x < -0.1 || prop.x > 1.1) {
          prop.dead = true;
        }
        continue;
      }

      if (prop.state === 'resting') {
        const eps = 0.02;
        const slope = (ropeHeightAt(prop.x + eps) - ropeHeightAt(prop.x - eps)) / (2 * eps);
        prop.rollV = (prop.rollV || 0) + slope * ROLL_ACCEL * STEP;
        prop.rollV *= ROLL_FRICTION;
        prop.x += prop.rollV * STEP;
        if (prop.x < minX) { prop.x = minX; prop.rollV = 0; }
        if (prop.x > maxX) { prop.x = maxX; prop.rollV = 0; }
        prop.y = ropeHeightAt(prop.x);
        prop.restX = prop.x;
        prop.restY = prop.y;
        continue;
      }

      if (prop.state === 'flying') {
        prop.vy += SLING_GRAVITY * STEP;
        prop.x += prop.vx * STEP;
        prop.y += prop.vy * STEP;
        for (const target of modeState.targets) {
          if (Math.hypot(prop.x - target.x, prop.y - target.y) < target.r + 0.02) {
            prop.dead = true;
            modeState.score += 1;
            modeState.hitAt = mPoint(target.x, target.y);
            modeState.ring = 1;
            target.x = 0.15 + Math.random() * 0.7;
            target.y = 0.08 + Math.random() * 0.32;
            target.r = Math.max(0.025, 0.05 - modeState.score * 0.0015);
            break;
          }
        }
        if (!prop.dead && (prop.y > 1.05 || prop.x < -0.1 || prop.x > 1.1)) prop.dead = true;
      }
    }

    modeState.props = modeState.props.filter((prop) => !prop.dead);
    modeState.ring = Math.max(0, modeState.ring - STEP * 1.5);
  },
  onDown() {
    for (const prop of modeState.props) {
      if (prop.state === 'flying') continue;
      if (Math.hypot(pointer.x - prop.x, pointer.y - prop.y) < 0.05) {
        modeState.dragProp = prop;
        modeState.heldNodeIndex = prop.state === 'resting' ? nearestRopeNode(prop.x) : null;
        prop.state = 'dragging';
        return;
      }
    }
    for (const slot of ammoSlots()) {
      if (Math.hypot(pointer.x - slot.x, pointer.y - slot.y) < 0.05) {
        const prop = { x: slot.x, y: slot.y, vx: 0, vy: 0, kind: slot.kind, glyph: slot.glyph, state: 'dragging' };
        modeState.props.push(prop);
        modeState.dragProp = prop;
        modeState.heldNodeIndex = null;
        return;
      }
    }
  },
  onMove() {
    if (!modeState.dragProp) return;
    modeState.dragProp.x = pointer.x;
    modeState.dragProp.y = pointer.y;
  },
  onUp() {
    const prop = modeState.dragProp;
    if (!prop) return;

    if (modeState.heldNodeIndex !== null) {
      const node = modeState.rope[modeState.heldNodeIndex];
      node.pinned = false;
      node.px = node.x;
      node.py = node.y;
      const rawDx = prop.restX - prop.x;
      const rawDy = prop.restY - prop.y;
      const rawPull = Math.hypot(rawDx, rawDy);
      if (rawPull > SLING_MIN_PULL) {
        const pull = Math.min(SLING_MAX_PULL, rawPull);
        prop.vx = (rawDx / rawPull) * pull * SLING_POWER;
        prop.vy = (rawDy / rawPull) * pull * SLING_POWER;
        prop.state = 'flying';
      } else {
        prop.x = prop.restX;
        prop.y = prop.restY;
        prop.rollV = 0;
        prop.state = 'resting';
      }
    } else {
      prop.vx = 0;
      prop.vy = 0;
      prop.state = 'free';
    }

    modeState.dragProp = null;
    modeState.heldNodeIndex = null;
  },
};

/* Тот же жгут, другой костюм — размеры и раскладка сняты напрямую с
   авторского SVG-референса (холст 718×718, координаты здесь — те же точки,
   делённые на 718). Свои цвета не завязаны на setGround/INK: этот режим
   ничего не переключает глобально, чтобы не задевать остальные вкладки. */
const PAPER_BG = '#F2EDE5';
const PAPER_INK = '#000000';
const PAPER_RED = '#FF0000';

/* Ноги сведены на 5% к центру относительно референса — автор попросил
   сблизить их. Канат уходит в внутренний скос чуть ниже верхней грани:
   так он продолжается в массу ноги, а не торчит из острого угла. */
const PAPER_LEG_NARROW = 0.95;
function paperNarrowX(x) { return 0.5 + (x - 0.5) * PAPER_LEG_NARROW; }

const PAPER_LEG_L = [[143.971, 426], [240, 426], [179.029, 595], [83, 595]]
  .map(([x, y]) => mPoint(paperNarrowX(x / 718), y / 718));
const PAPER_LEG_R = [[596.029, 426], [500, 426], [560.971, 595], [657, 595]]
  .map(([x, y]) => mPoint(paperNarrowX(x / 718), y / 718));

const PAPER_ROPE_WIDTH = 0.014;
const PAPER_ROPE_RADIUS = PAPER_ROPE_WIDTH / 2;
const PAPER_ANCHOR_T = PAPER_ROPE_RADIUS / (PAPER_LEG_L[2].y - PAPER_LEG_L[1].y);
const PAPER_ANCHOR_L = mPoint(
  lerp(PAPER_LEG_L[1].x, PAPER_LEG_L[2].x, PAPER_ANCHOR_T),
  lerp(PAPER_LEG_L[1].y, PAPER_LEG_L[2].y, PAPER_ANCHOR_T),
);
const PAPER_ANCHOR_R = mPoint(
  lerp(PAPER_LEG_R[1].x, PAPER_LEG_R[2].x, PAPER_ANCHOR_T),
  lerp(PAPER_LEG_R[1].y, PAPER_LEG_R[2].y, PAPER_ANCHOR_T),
);

const PAPER_TARGET_COUNT = 5;
const PAPER_TARGET_R = 0.035;
const PAPER_ONBOARDING_KEY = 'alphabet:m-paper-sling-onboarding';
const PAPER_CLICK_SLOP = 0.012;
const PAPER_CATCH_DEPTH = 0.2;

/* Мишени не садятся друг на друга: перебрасываем точку, пока не найдём
   свободное место (с запасом), а не просто ставим как попало. */
/* Мишень всегда входит из-за верхнего края кадра, никогда не проявляется
   уже внутри — иначе появление читается как нечестное. */
function spawnPaperTarget(others, r = PAPER_TARGET_R) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const x = 0.1 + Math.random() * 0.8;
    const y = -r - Math.random() * 0.2;
    const clear = others.every((t) => Math.hypot(t.x - x, t.y - y) > t.r + r + 0.02);
    if (clear) return { x, y, r };
  }
  return { x: 0.1 + Math.random() * 0.8, y: -r - Math.random() * 0.2, r };
}

function makePaperTargets() {
  const targets = [];
  for (let i = 0; i < PAPER_TARGET_COUNT; i += 1) targets.push(spawnPaperTarget(targets));
  return targets;
}

const PAPER_PILE = [
  [369.5, 426.5, 26.5], [226.5, 688.5, 26.5], [32.5, 653.5, 26.5], [133.5, 659.5, 26.5],
  [85.5, 688.5, 26.5], [297.5, 679.5, 26.5], [329.5, 463.5, 26.5], [541.5, 659.5, 26.5],
  [591.5, 691.5, 26.5], [488.5, 688.5, 26.5],
  [396.5, 463.5, 17.5], [641.5, 700.5, 17.5], [585.5, 642.5, 17.5], [635.5, 670.5, 17.5],
  [465.5, 650.5, 17.5], [257.5, 653.5, 17.5], [187.5, 653.5, 17.5], [700.5, 700.5, 17.5],
  [37.5, 700.5, 17.5], [500.5, 642.5, 17.5], [663.5, 638.5, 17.5],
  [366.5, 486.5, 14.5], [337.5, 703.5, 14.5], [265.5, 703.5, 14.5], [184.5, 705.5, 14.5],
  [91.5, 645.5, 14.5], [442.5, 674.5, 14.5], [427.5, 703.5, 14.5], [667.5, 682.5, 14.5],
  [696.5, 664.5, 14.5], [130.5, 703.5, 14.5], [535.5, 703.5, 14.5], [167.5, 679.5, 14.5],
].map(([x, y, r]) => ({ x: x / 718, y: y / 718, r: r / 718 }));

const PAPER_FLOOR_Y = 0.99;
const PAPER_FLOOR_X0 = 0.02;
const PAPER_FLOOR_X1 = 0.98;
const PAPER_ROLL_FRICTION = 0.7;
const PAPER_ROLL_ACCEL = 6;
const PAPER_DANGER_Y = 0.52;
const PAPER_FALL_BASE = 0.012;

/* Общий решатель «шарики не влезают друг в друга»: раздвигает пересекающиеся
   круги по линии их центров. Несколько проходов подряд дают устойчивую горку. */
function resolveCircleCollisions(balls, iterations) {
  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < balls.length; i += 1) {
      for (let j = i + 1; j < balls.length; j += 1) {
        const a = balls[i];
        const b = balls[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const minDist = a.r + b.r;
        if (dist < minDist) {
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
        }
      }
    }
  }
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq, 0, 1) : 0;
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function paperRopeCatchPoint(start, end, r) {
  const minX = modeState.rope[0].x;
  const maxX = modeState.rope[modeState.rope.length - 1].x;
  const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 0.008));
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const point = mPoint(lerp(start.x, end.x, t), lerp(start.y, end.y, t));
    const contactY = ropeHeightAt(point.x) - r - PAPER_ROPE_RADIUS;
    const gap = point.y - contactY;
    if (point.x >= minX && point.x <= maxX && gap <= PAPER_CATCH_DEPTH) return mPoint(point.x, contactY);
  }
  return null;
}

const PILE_DAMPING = 0.9;

/* Verlet, а не явная скорость: та же схема, что у каната. Коррекция
   столкновений двигает только x/y, а «скорость» здесь — просто разница
   с прошлым кадром, поэтому сдвиг от соседа сам гасится, и куча реально
   успокаивается, а не дрожит бесконечно. */
function stepPileBalls() {
  const balls = modeState.pileBalls;
  const g = SLING_GRAVITY * STEP * STEP;
  for (const ball of balls) {
    const vx = (ball.x - ball.px) * PILE_DAMPING;
    const vy = (ball.y - ball.py) * PILE_DAMPING;
    ball.px = ball.x;
    ball.py = ball.y;
    ball.x += vx;
    ball.y += vy + g;
  }
  resolveCircleCollisions(balls, 6);
  for (const ball of balls) {
    if (ball.y + ball.r > PAPER_FLOOR_Y) { ball.y = PAPER_FLOOR_Y - ball.r; ball.py = ball.y; }
    if (ball.x - ball.r < PAPER_FLOOR_X0) { ball.x = PAPER_FLOOR_X0 + ball.r; ball.px = ball.x; }
    if (ball.x + ball.r > PAPER_FLOOR_X1) { ball.x = PAPER_FLOOR_X1 - ball.r; ball.px = ball.x; }
  }
}

function drawPaperLeg(points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x * S, points[0].y * S);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x * S, points[i].y * S);
  ctx.closePath();
  ctx.fillStyle = PAPER_INK;
  ctx.fill();
}


function drawPaperProp(prop) {
  const r = prop.r || 0.026;
  if (prop.kind === 'letter') {
    ctx.fillStyle = PAPER_INK;
    ctx.font = `${Math.round(r * 2.4 * S)}px 'DM Mono', ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(prop.glyph, prop.x * S, prop.y * S);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return;
  }
  ctx.beginPath();
  ctx.arc(prop.x * S, prop.y * S, r * S, 0, Math.PI * 2);
  ctx.fillStyle = PAPER_BG;
  ctx.fill();
  ctx.strokeStyle = PAPER_INK;
  ctx.lineWidth = 0.0025 * S;
  ctx.stroke();
}

function drawPaperTarget(target) {
  ctx.beginPath();
  ctx.arc(target.x * S, target.y * S, target.r * S, 0, Math.PI * 2);
  ctx.fillStyle = PAPER_RED;
  ctx.fill();
}

function finishPaperOnboarding() {
  if (!modeState.onboarding) return;
  modeState.onboarding = false;
  localStorage.setItem(PAPER_ONBOARDING_KEY, '1');
}

function drawPaperOnboarding() {
  if (!modeState.onboarding) return;
  const t = modeState.onboardingT;
  const source = mPoint(0.16, 0.9);
  const loaded = mPoint(0.5, ropeHeightAt(0.5) - 0.035);
  const pulled = mPoint(0.5, 0.82);
  const move = clamp((t - 0.8) / 1.2, 0, 1);
  const pull = clamp((t - 2.4) / 1.2, 0, 1);
  const position = t < 2 ? mPoint(lerp(source.x, loaded.x, move), lerp(source.y, loaded.y, move))
    : mPoint(lerp(loaded.x, pulled.x, pull), lerp(loaded.y, pulled.y, pull));

  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.font = `${Math.round(S * 0.019)}px 'DM Mono', ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('возьми шар · положи на жгут · тяни вниз', S * 0.5, S * 0.18);
  ctx.textAlign = 'left';
  ctx.beginPath();
  ctx.arc(position.x * S, position.y * S, 0.022 * S, 0, Math.PI * 2);
  ctx.fillStyle = PAPER_BG;
  ctx.fill();
  ctx.strokeStyle = PAPER_INK;
  ctx.lineWidth = 0.0025 * S;
  ctx.stroke();
}

function drawSlingshotPaper() {
  ctx.fillStyle = PAPER_BG;
  ctx.fillRect(0, 0, S, S);

  for (let i = 1; i < modeState.rope.length; i += 1) mLine(modeState.rope[i - 1], modeState.rope[i], PAPER_INK, PAPER_ROPE_WIDTH);
  drawPaperLeg(PAPER_LEG_L);
  drawPaperLeg(PAPER_LEG_R);

  for (const ball of modeState.pileBalls) {
    ctx.beginPath();
    ctx.arc(ball.x * S, ball.y * S, ball.r * S, 0, Math.PI * 2);
    ctx.fillStyle = PAPER_BG;
    ctx.fill();
    ctx.strokeStyle = PAPER_INK;
    ctx.lineWidth = 0.0025 * S;
    ctx.stroke();
  }
  ctx.setLineDash([0.006 * S, 0.006 * S]);
  const nearest = Math.max(...modeState.targets.map((target) => target.y));
  const danger = clamp((nearest - (PAPER_DANGER_Y - 0.18)) / 0.18, 0, 1);
  ctx.strokeStyle = `rgba(255,0,0,${modeState.over ? 1 : 0.06 + danger * 0.74})`;
  ctx.lineWidth = 0.0015 * S;
  ctx.beginPath();
  ctx.moveTo(0, PAPER_DANGER_Y * S);
  ctx.lineTo(S, PAPER_DANGER_Y * S);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const target of modeState.targets) drawPaperTarget(target);
  for (const prop of modeState.props) drawPaperProp(prop);
  drawPaperOnboarding();

  if (modeState.ring > 0) {
    ctx.beginPath();
    ctx.arc(modeState.hitAt.x * S, modeState.hitAt.y * S, (0.03 + (1 - modeState.ring) * 0.12) * S, 0, Math.PI * 2);
    ctx.strokeStyle = PAPER_RED;
    ctx.lineWidth = 0.002 * S;
    ctx.globalAlpha = modeState.ring;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = modeState.ring > 0.5 ? PAPER_RED : PAPER_INK;
  ctx.font = `${Math.round(S * 0.022)}px 'DM Mono', ui-monospace, monospace`;
  ctx.textAlign = 'right';
  ctx.fillText(`${modeState.score}`, S * 0.96, S * 0.06);
  ctx.textAlign = 'left';

  if (modeState.over) {
    ctx.fillStyle = PAPER_RED;
    ctx.font = `${Math.round(S * 0.026)}px 'DM Mono', ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('мишень дошла до черты — клик — заново', S * 0.5, PAPER_DANGER_Y * S - S * 0.02);
    ctx.textAlign = 'left';
  }
}

function resetSlingshotPaper() {
  resetSlingshot(PAPER_ANCHOR_L, PAPER_ANCHOR_R, makePaperTargets());
  modeState.pileBalls = PAPER_PILE.map((p) => ({ x: p.x, y: p.y, px: p.x, py: p.y, r: p.r }));
  for (let i = 0; i < 200; i += 1) stepPileBalls();
  modeState.over = false;
  modeState.onboarding = !localStorage.getItem(PAPER_ONBOARDING_KEY);
  modeState.onboardingT = 0;
  modeState.dragFromPile = false;
  modeState.dragMoved = false;
  modeState.dragStart = null;
}

const slingshotPaper = {
  label: 'рогатка бумажная',
  note: 'Кликни по шару, чтобы зарядить центр, или перетащи его в любое место на канате. Мишени медленно опускаются; несколько шаров летят одним залпом.',
  draw: drawSlingshotPaper,
  tools: [
    { type: 'toggle', key: 'letters', label: 'буквами', value: false },
    { type: 'range', key: 'slack', label: 'провис', min: 0.5, max: 2, step: 0.05, value: 1 },
    { type: 'range', key: 'power', label: 'упругость', min: 4, max: 12, step: 0.5, value: 8 },
    { type: 'button', label: 'заново', action: resetSlingshotPaper },
  ],
  setup() {
    resetSlingshotPaper();
  },
  step() {
    if (modeState.onboarding) {
      modeState.onboardingT += STEP;
      if (modeState.onboardingT > 4.2) finishPaperOnboarding();
    }
    if (modeState.heldNodeIndex !== null && modeState.dragProp) {
      const node = modeState.rope[modeState.heldNodeIndex];
      node.pinned = true;
      node.x = modeState.dragProp.x;
      node.y = modeState.dragProp.y + (modeState.dragProp.r || 0.026) + PAPER_ROPE_RADIUS;
    }
    stepRope();
    stepPileBalls();

    if (!modeState.over) {
      const fall = PAPER_FALL_BASE * (1 + modeState.score * 0.08);
      for (const target of modeState.targets) {
        target.y += fall * STEP;
        if (target.y > PAPER_DANGER_Y) modeState.over = true;
      }
    }

    const minX = modeState.rope[0].x;
    const maxX = modeState.rope[modeState.rope.length - 1].x;

    for (const prop of modeState.props) {
      if (prop.state === 'dragging') continue;
      const r = prop.r || 0.026;

      if (prop.state === 'free') {
        prop.vy += SLING_GRAVITY * STEP;
        prop.x += prop.vx * STEP;
        prop.y += prop.vy * STEP;
        const ropeY = ropeHeightAt(prop.x) - r - PAPER_ROPE_RADIUS;
        if (prop.y >= ropeY && prop.x >= minX && prop.x <= maxX) {
          prop.y = ropeY;
          prop.rollV = prop.vx * 0.5;
          prop.vx = 0;
          prop.vy = 0;
          prop.state = 'resting';
        } else if (prop.y + r > PAPER_FLOOR_Y) {
          const x = clamp(prop.x, PAPER_FLOOR_X0 + r, PAPER_FLOOR_X1 - r);
          modeState.pileBalls.push({ x, y: PAPER_FLOOR_Y - r, px: x, py: PAPER_FLOOR_Y - r, r });
          prop.dead = true;
        } else if (prop.x - r < 0) {
          prop.x = r;
          prop.vx = Math.abs(prop.vx);
        } else if (prop.x + r > 1) {
          prop.x = 1 - r;
          prop.vx = -Math.abs(prop.vx);
        }
        continue;
      }

      if (prop.state === 'resting') {
        if (prop.px === undefined) prop.px = prop.x;
        const eps = 0.02;
        const slope = (ropeHeightAt(prop.x + eps) - ropeHeightAt(prop.x - eps)) / (2 * eps);
        const vx = (prop.x - prop.px) * PAPER_ROLL_FRICTION;
        prop.px = prop.x;
        prop.x += vx + slope * PAPER_ROLL_ACCEL * STEP * STEP;
        if (prop.x < minX) { prop.x = minX; prop.px = prop.x; }
        if (prop.x > maxX) { prop.x = maxX; prop.px = prop.x; }
        continue;
      }

      if (prop.state === 'flying') {
        const previous = mPoint(prop.x, prop.y);
        prop.vy += SLING_GRAVITY * STEP;
        prop.x += prop.vx * STEP;
        prop.y += prop.vy * STEP;
        if (!modeState.over) {
          for (const target of modeState.targets) {
            if (distanceToSegment(target, previous, prop) < target.r + r) {
              modeState.score += 1;
              modeState.hitAt = mPoint(target.x, target.y);
              modeState.ring = 1;
              const fresh = spawnPaperTarget(modeState.targets.filter((t) => t !== target), target.r);
              target.x = fresh.x;
              target.y = fresh.y;
            }
          }
        }
        if (!prop.dead && prop.y + r > PAPER_FLOOR_Y) {
          const x = clamp(prop.x, PAPER_FLOOR_X0 + r, PAPER_FLOOR_X1 - r);
          modeState.pileBalls.push({ x, y: PAPER_FLOOR_Y - r, px: x, py: PAPER_FLOOR_Y - r, r });
          prop.dead = true;
        } else if (prop.x - r < 0) {
          prop.x = r;
          prop.vx = Math.abs(prop.vx);
        } else if (prop.x + r > 1) {
          prop.x = 1 - r;
          prop.vx = -Math.abs(prop.vx);
        }
      }
    }

    /* Несколько фигур на канате не проходят друг сквозь друга: раздвигаем
       пересекающиеся, потом плавно подтягиваем к жгуту — без своей скорости
       по высоте это не может раскачаться, только сойтись. */
    resolveCircleCollisions(modeState.props.filter((prop) => prop.state === 'resting'), 6);
    for (const prop of modeState.props) {
      if (prop.state !== 'resting') continue;
      const floor = ropeHeightAt(prop.x) - (prop.r || 0.026) - PAPER_ROPE_RADIUS;
      prop.y += (floor - prop.y) * 0.35;
      if (prop.y > floor) prop.y = floor;
      prop.restX = prop.x;
      prop.restY = prop.y;
    }

    modeState.props = modeState.props.filter((prop) => !prop.dead);
    modeState.ring = Math.max(0, modeState.ring - STEP * 1.5);
  },
  onDown() {
    if (modeState.over) { resetSlingshotPaper(); return; }
    finishPaperOnboarding();
    for (const prop of modeState.props) {
      if (prop.state === 'flying') continue;
      if (Math.hypot(pointer.x - prop.x, pointer.y - prop.y) < 0.045) {
        modeState.dragProp = prop;
        modeState.heldNodeIndex = prop.state === 'resting' ? nearestRopeNode(prop.x) : null;
        modeState.dragFromPile = false;
        modeState.dragMoved = false;
        modeState.dragStart = mPoint(pointer.x, pointer.y);
        prop.state = 'dragging';
        return;
      }
    }
    let closest = -1;
    let closestDist = Infinity;
    modeState.pileBalls.forEach((ball, i) => {
      const dist = Math.hypot(pointer.x - ball.x, pointer.y - ball.y);
      if (dist < ball.r + 0.012 && dist < closestDist) { closestDist = dist; closest = i; }
    });
    if (closest !== -1) {
      const ball = modeState.pileBalls.splice(closest, 1)[0];
      const useLetters = on('letters');
      const prop = {
        x: ball.x, y: ball.y, vx: 0, vy: 0, r: ball.r,
        kind: useLetters ? 'letter' : 'shape',
        glyph: useLetters ? AMMO_LETTERS[closest % AMMO_LETTERS.length] : 'circle',
        state: 'dragging',
      };
      modeState.props.push(prop);
      modeState.dragProp = prop;
      modeState.heldNodeIndex = null;
      modeState.dragFromPile = true;
      modeState.dragMoved = false;
      modeState.dragStart = mPoint(pointer.x, pointer.y);
    }
  },
  onMove() {
    if (modeState.dragProp && modeState.dragStart && !modeState.dragMoved) {
      modeState.dragMoved = Math.hypot(pointer.x - modeState.dragStart.x, pointer.y - modeState.dragStart.y) > PAPER_CLICK_SLOP;
    }
    slingshot.onMove();
    if (!modeState.dragFromPile || modeState.heldNodeIndex !== null || !modeState.dragProp) return;
    const prop = modeState.dragProp;
    const catchPoint = paperRopeCatchPoint(mPoint(pointer.px, pointer.py), mPoint(pointer.x, pointer.y), prop.r || 0.026);
    if (!catchPoint) return;
    modeState.heldNodeIndex = nearestRopeNode(catchPoint.x);
    prop.restX = catchPoint.x;
    prop.restY = catchPoint.y;
  },
  onUp() {
    const prop = modeState.dragProp;
    if (!prop) return;

    if (modeState.dragFromPile && !modeState.dragMoved) {
      const x = 0.5;
      const r = prop.r || 0.026;
      prop.x = x;
      prop.y = ropeHeightAt(x) - r - PAPER_ROPE_RADIUS;
      prop.px = x;
      prop.restX = prop.x;
      prop.restY = prop.y;
      prop.rollV = 0;
      prop.state = 'resting';
      modeState.dragProp = null;
      modeState.heldNodeIndex = null;
      modeState.dragFromPile = false;
      modeState.dragMoved = false;
      modeState.dragStart = null;
      return;
    }

    if (modeState.heldNodeIndex !== null) {
      const node = modeState.rope[modeState.heldNodeIndex];
      node.pinned = false;
      node.px = node.x;
      node.py = node.y;
      const rawDx = prop.restX - prop.x;
      const rawDy = prop.restY - prop.y;
      const rawPull = Math.hypot(rawDx, rawDy);
      if (rawPull > SLING_MIN_PULL && rawDy < 0) {
        const pull = Math.min(SLING_MAX_PULL, rawPull);
        const power = num('power');
        const vx = (rawDx / rawPull) * pull * power;
        const vy = (rawDy / rawPull) * pull * power;
        /* Всё, что лежало на канате, летит одним залпом — жгут швыряет */
        /* сразу всех, кто на нём был, а не только схваченный шарик. */
        for (const other of modeState.props) {
          if (other.state !== 'resting') continue;
          other.vx = vx;
          other.vy = vy;
          other.state = 'flying';
        }
        prop.vx = vx;
        prop.vy = vy;
        prop.state = 'flying';
      } else {
        prop.x = prop.restX;
        prop.y = prop.restY;
        prop.rollV = 0;
        prop.state = 'resting';
      }
    } else {
      prop.vx = 0;
      prop.vy = 0;
      prop.state = 'free';
    }

    modeState.dragProp = null;
    modeState.heldNodeIndex = null;
    modeState.dragFromPile = false;
    modeState.dragMoved = false;
    modeState.dragStart = null;
  },
};

const QUOTE_COLS = 7;
const QUOTE_ROWS = 4;
const QUOTE_GRID = [];
for (let row = 0; row < QUOTE_ROWS; row += 1) {
  for (let col = 0; col < QUOTE_COLS; col += 1) {
    QUOTE_GRID.push(mPoint(0.15 + (col / (QUOTE_COLS - 1)) * 0.7, 0.3 + (row / (QUOTE_ROWS - 1)) * 0.5));
  }
}

function resetQuote() {
  modeState.active = new Set();
  modeState.flashAt = null;
  modeState.flashT = 0;
}

function quoteChain() {
  const left = mPoint(0.22, 0.2);
  const right = mPoint(0.78, 0.2);
  const picked = [...modeState.active].map((i) => QUOTE_GRID[i]).sort((a, b) => a.x - b.x);
  return [left, ...picked, right];
}

function drawQuote() {
  const chain = quoteChain();
  const slack = num('slack');

  for (let i = 1; i < chain.length; i += 1) {
    const a = chain[i - 1];
    const b = chain[i];
    const steps = 6;
    let prev = a;
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      const point = s === steps ? b : mPoint(lerp(a.x, b.x, t), lerp(a.y, b.y, t) + Math.sin(t * Math.PI) * 0.03 * slack);
      mLine(prev, point, INK, 0.008);
      prev = point;
    }
  }

  for (let i = 0; i < QUOTE_GRID.length; i += 1) {
    const point = QUOTE_GRID[i];
    mCircle(point, modeState.active.has(i) ? 0.014 : 0.008, modeState.active.has(i) ? INK : FAINT);
  }
  mCircle(mPoint(0.22, 0.2), 0.012, INK);
  mCircle(mPoint(0.78, 0.2), 0.012, INK);

  if (modeState.flashT > 0 && modeState.flashAt) {
    ctx.beginPath();
    ctx.arc(modeState.flashAt.x * S, modeState.flashAt.y * S, (0.02 + (1 - modeState.flashT) * 0.1) * S, 0, Math.PI * 2);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 0.002 * S;
    ctx.globalAlpha = modeState.flashT;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawStatus(`${modeState.active.size} точек`);
}

const quote = {
  label: 'цитата',
  note: 'Кликай по точкам сетки — канат цепляется за них по порядку слева направо. Своя форма М из wires, без цели.',
  draw: drawQuote,
  tools: [
    { type: 'range', key: 'slack', label: 'провис', min: 0, max: 1, step: 0.05, value: 0.6 },
    { type: 'button', label: 'заново', action: resetQuote },
  ],
  setup() {
    resetQuote();
  },
  step() {
    modeState.flashT = Math.max(0, modeState.flashT - STEP * 2);
  },
  onDown() {
    let closest = -1;
    let closestDist = 0.035;
    for (let i = 0; i < QUOTE_GRID.length; i += 1) {
      const d = Math.hypot(pointer.x - QUOTE_GRID[i].x, pointer.y - QUOTE_GRID[i].y);
      if (d < closestDist) { closestDist = d; closest = i; }
    }
    if (closest === -1) return;
    if (modeState.active.has(closest)) modeState.active.delete(closest);
    else modeState.active.add(closest);
    modeState.flashAt = QUOTE_GRID[closest];
    modeState.flashT = 1;
  },
  onMove() {},
  onUp() {},
};

const MODES = { metronome, membrane, bridge, rhythm, rally, slingshot, slingshotPaper, quote };

startLab({
  title: 'М · восемь механик впадины',
  modes: MODES,
  start: 'metronome',
  ground: 'ink',
});
