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

const MODES = { metronome, membrane, bridge };

startLab({
  title: 'М · три способа держать впадину',
  modes: MODES,
  start: 'metronome',
  ground: 'ink',
});
