/* С — полигон механик разрыва.
   У С один значимый элемент формы — разрыв кольца, а не изгиб дуги: закрытый
   контур (как у О) или дуга из двух кусков с горловиной (как у З) этого не
   дают. Все четыре механики построены на разрыве буквально: он либо выпускает
   что-то наружу (портал, локатор), либо служит слепым пятном при развороте
   (серп), либо целью для отражённого шарика (эхо). Общая геометрия и
   вращение дуги — здесь, механики — ниже. */

const CX = 0.5;
const CY = 0.52;
const C_GAP = 76 * Math.PI / 180;

/* Разрыв центрирован на угол rotation. angleInGap проверяет, попадает ли
   мировой угол в открытый сектор при текущем повороте буквы. */
function angleInGap(angle, rotation) {
  let d = angle - rotation;
  d = ((d % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return Math.abs(d) < C_GAP / 2;
}

function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/* Дуга — окружность без сектора C_GAP, отцентрованного на rotation. */
function drawCShape(cx, cy, r, rotation, width, color) {
  ctx.beginPath();
  ctx.arc(cx * S, cy * S, r * S, rotation + C_GAP / 2, rotation - C_GAP / 2 + Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width * S;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/* ---------- 1. прореха-портал ---------- */

const PORTAL_RADIUS = 0.34;
const PORTAL_BALL_R = 0.014;

function portalSpawnBall() {
  const speed = num('speed');
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * PORTAL_RADIUS * 0.55;
  modeState.balls.push({
    x: CX + Math.cos(angle) * r,
    y: CY + Math.sin(angle) * r,
    vx: (Math.random() - 0.5) * speed,
    vy: (Math.random() - 0.5) * speed,
    escaping: false,
  });
}

function portalReset() {
  modeState.rotation = 0;
  modeState.score = 0;
  modeState.balls = [];
  modeState.turnLeft = false;
  modeState.turnRight = false;
  const n = Math.round(num('count'));
  for (let i = 0; i < n; i++) portalSpawnBall();
}

function portalStep() {
  const rotSpeed = 130 * Math.PI / 180;
  if (modeState.turnLeft || modeState.turnRight) {
    const dir = (modeState.turnRight ? 1 : 0) - (modeState.turnLeft ? 1 : 0);
    modeState.rotation += dir * rotSpeed * STEP;
  }

  for (const b of modeState.balls) {
    b.x += b.vx * STEP;
    b.y += b.vy * STEP;
    if (b.escaping) continue;
    const dx = b.x - CX, dy = b.y - CY;
    const dist = Math.hypot(dx, dy);
    if (dist + PORTAL_BALL_R < PORTAL_RADIUS) continue;
    const angle = Math.atan2(dy, dx);
    if (angleInGap(angle, modeState.rotation)) {
      b.escaping = true;
      continue;
    }
    const nx = dx / dist, ny = dy / dist;
    const along = b.vx * nx + b.vy * ny;
    b.vx -= 2 * along * nx;
    b.vy -= 2 * along * ny;
    const clampDist = PORTAL_RADIUS - PORTAL_BALL_R;
    b.x = CX + nx * clampDist;
    b.y = CY + ny * clampDist;
  }

  const kept = [];
  for (const b of modeState.balls) {
    if (b.escaping && (b.x < -0.08 || b.x > 1.08 || b.y < -0.08 || b.y > 1.08)) {
      modeState.score++;
      continue;
    }
    kept.push(b);
  }
  modeState.balls = kept;
  while (modeState.balls.length < Math.round(num('count'))) portalSpawnBall();
}

function portalDraw() {
  for (const b of modeState.balls) dot(b.x, b.y, b.escaping ? RED : ink(0.8), PORTAL_BALL_R);
  drawCShape(CX, CY, PORTAL_RADIUS, modeState.rotation, 0.02, INK);
  drawStatus(`вышло: ${modeState.score} · Q/E крутить разрыв`, modeState.balls.some((b) => b.escaping));
}

const portal = {
  label: 'портал',
  note: 'Шарики бьются о кольцо изнутри и отражаются, кроме одного места — разрыва буквы. Крути его клавишами Q/E: шарик, что в этот миг летит наружу как раз через разрыв, вылетает и засчитывается; остальные продолжают биться внутри. «Шариков» держит их число в игре разом, «скорость» — их резвость.',
  cursor: 'default',
  tools: [
    { type: 'range', key: 'count', label: 'шариков', min: 3, max: 12, step: 1, value: 6 },
    { type: 'range', key: 'speed', label: 'скорость', min: 0.15, max: 0.6, step: 0.02, value: 0.32 },
    { type: 'button', label: 'заново', action: portalReset },
  ],
  setup() { portalReset(); },
  step() { portalStep(); },
  draw() { portalDraw(); },
  onKey(event, down) {
    if (event.code === 'KeyQ') modeState.turnLeft = down;
    if (event.code === 'KeyE') modeState.turnRight = down;
  },
  onTool(key) { if (key === 'count') portalReset(); },
};

/* ---------- 2. локатор с лучом ---------- */

const RADAR_RADIUS = 0.34;
const RADAR_PULSE_SPEED = 0.85;
const RADAR_HIT_TOLERANCE = 0.16;

function radarNewTarget() {
  modeState.target = { angle: Math.random() * Math.PI * 2, life: 2.4 + Math.random() * 1.8 };
}

function radarReset() {
  modeState.rotation = 0;
  modeState.pulses = [];
  modeState.score = 0;
  modeState.misses = 0;
  radarNewTarget();
}

function radarStep() {
  modeState.rotation += num('speed') * Math.PI / 180 * STEP;

  modeState.target.life -= STEP;
  if (modeState.target.life <= 0) { modeState.misses++; radarNewTarget(); }

  for (const p of modeState.pulses) p.r += RADAR_PULSE_SPEED * STEP;
  modeState.pulses = modeState.pulses.filter((p) => {
    if (p.r < RADAR_RADIUS) return true;
    if (Math.abs(angleDiff(p.angle, modeState.target.angle)) < RADAR_HIT_TOLERANCE) {
      modeState.score++;
      radarNewTarget();
    } else {
      modeState.misses++;
    }
    return false;
  });
}

function radarFire() {
  modeState.pulses.push({ angle: modeState.rotation, r: 0 });
}

function radarDraw() {
  drawCShape(CX, CY, RADAR_RADIUS, modeState.rotation, 0.02, INK);

  const t = modeState.target;
  const tx = CX + Math.cos(t.angle) * RADAR_RADIUS, ty = CY + Math.sin(t.angle) * RADAR_RADIUS;
  const pulseAlpha = 0.35 + 0.55 * Math.abs(Math.sin(performance.now() / 220));
  dot(tx, ty, ink(pulseAlpha), 0.017);

  for (const p of modeState.pulses) {
    const x = CX + Math.cos(p.angle) * p.r, y = CY + Math.sin(p.angle) * p.r;
    dot(x, y, RED, 0.01);
  }

  drawStatus(`попаданий: ${modeState.score} · мимо: ${modeState.misses} · клик — импульс`, modeState.pulses.length > 0);
}

const radar = {
  label: 'локатор',
  note: 'Тарелка крутится, разрыв — раструб: клик по сцене пускает импульс вдоль того направления, куда разрыв смотрит в этот миг. Цель вспыхивает где-то на ободе и держится недолго — таймингом клика относительно вращения нужно поймать её, пока она жива. «Скорость» вращения можно увести и в минус — тарелка развернётся в другую сторону.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'speed', label: 'скорость', min: -180, max: 180, step: 5, value: 65 },
    { type: 'button', label: 'заново', action: radarReset },
  ],
  setup() { radarReset(); },
  step() { radarStep(); },
  draw() { radarDraw(); },
  onDown() { radarFire(); },
};

/* ---------- 3. серп-жатва ---------- */

const SICKLE_RADIUS = 0.34;
const SICKLE_BAND = 0.045;
const SICKLE_COUNT = 46;

function sickleRotationAt(phase, amp, period) {
  return amp * Math.sin(phase * Math.PI * 2 / period);
}

function sickleReset() {
  const amp = num('amplitude') * Math.PI / 180;
  const period = num('period');
  modeState.phase = 0;
  modeState.rotation = sickleRotationAt(0, amp, period);
  modeState.cut = 0;
  modeState.safe = 0;
  modeState.roundDone = false;
  modeState.grains = [];
  const spread = amp + C_GAP / 2 + 0.28;
  for (let i = 0; i < SICKLE_COUNT; i++) {
    const angle = (Math.random() * 2 - 1) * spread;
    const r = SICKLE_RADIUS + (Math.random() * 2 - 1) * SICKLE_BAND;
    modeState.grains.push({ angle, r, state: 'pending', inGapPrev: angleInGap(angle, modeState.rotation) });
  }
}

function sickleStep() {
  const amp = num('amplitude') * Math.PI / 180;
  const period = num('period');
  modeState.phase += STEP;
  modeState.rotation = sickleRotationAt(modeState.phase, amp, period);

  for (const g of modeState.grains) {
    if (g.state !== 'pending') continue;
    const inGap = angleInGap(g.angle, modeState.rotation);
    if (g.inGapPrev && !inGap) { g.state = 'cut'; modeState.cut++; }
    g.inGapPrev = inGap;
  }

  if (!modeState.roundDone && modeState.phase > period * 1.5) {
    for (const g of modeState.grains) {
      if (g.state === 'pending') { g.state = 'safe'; modeState.safe++; }
    }
    modeState.roundDone = true;
  }
}

function sickleDraw() {
  for (const g of modeState.grains) {
    if (g.state === 'cut') continue;
    const x = CX + Math.cos(g.angle) * g.r, y = CY + Math.sin(g.angle) * g.r;
    dot(x, y, g.state === 'safe' ? MUTED : ink(0.75), 0.006);
  }
  drawCShape(CX, CY, SICKLE_RADIUS, modeState.rotation, 0.018, INK);
  const status = modeState.roundDone
    ? `срезано: ${modeState.cut} · уцелело: ${modeState.safe}`
    : `срезано: ${modeState.cut} · взмах идёт`;
  drawStatus(status, !modeState.roundDone);
}

const sickle = {
  label: 'серп',
  note: 'Буква качается как коса на угол «размах» с периодом «взмах» — колосья вокруг стоят на её пути. Всё, что накрыла сплошная дуга, срезано; кто в этот миг оказался ровно в разрыве, уцелевает. Раунд заканчивается через полтора взмаха: то, что дуга так и не задела, остаётся на поле серым.',
  cursor: 'default',
  tools: [
    { type: 'range', key: 'amplitude', label: 'размах', min: 30, max: 160, step: 5, value: 95 },
    { type: 'range', key: 'period', label: 'взмах', min: 1.2, max: 6, step: 0.1, value: 3 },
    { type: 'button', label: 'заново', action: sickleReset },
  ],
  setup() { sickleReset(); },
  step() { sickleStep(); },
  draw() { sickleDraw(); },
  onTool(key) { if (key === 'amplitude' || key === 'period') sickleReset(); },
};

/* ---------- 4. эхо-чаша ---------- */

const ECHO_RADIUS = 0.34;
const ECHO_BALL_R = 0.016;
const ECHO_MIN_LAUNCH = 0.05;
const ECHO_SETTLE_SPEED = 0.03;

function echoReset() {
  modeState.rotation = 0;
  modeState.ball = { x: CX, y: CY, vx: 0, vy: 0, moving: false, exited: false };
  modeState.aiming = false;
  modeState.exits = 0;
  modeState.bounces = 0;
  modeState.turnLeft = false;
  modeState.turnRight = false;
}

function echoStep() {
  const rotSpeed = 110 * Math.PI / 180;
  if (modeState.turnLeft || modeState.turnRight) {
    const dir = (modeState.turnRight ? 1 : 0) - (modeState.turnLeft ? 1 : 0);
    modeState.rotation += dir * rotSpeed * STEP;
  }

  const b = modeState.ball;
  if (!b.moving) return;
  b.x += b.vx * STEP;
  b.y += b.vy * STEP;

  const dx = b.x - CX, dy = b.y - CY;
  const dist = Math.hypot(dx, dy);
  if (dist + ECHO_BALL_R >= ECHO_RADIUS) {
    const angle = Math.atan2(dy, dx);
    if (angleInGap(angle, modeState.rotation)) {
      modeState.exits++;
      b.moving = false;
      b.exited = true;
    } else {
      const nx = dx / dist, ny = dy / dist;
      const along = b.vx * nx + b.vy * ny;
      b.vx = (b.vx - 2 * along * nx) * num('bounce');
      b.vy = (b.vy - 2 * along * ny) * num('bounce');
      const clampDist = ECHO_RADIUS - ECHO_BALL_R;
      b.x = CX + nx * clampDist;
      b.y = CY + ny * clampDist;
      modeState.bounces++;
    }
  }

  if (b.moving && Math.hypot(b.vx, b.vy) < ECHO_SETTLE_SPEED) b.moving = false;
}

function echoDraw() {
  drawCShape(CX, CY, ECHO_RADIUS, modeState.rotation, 0.02, INK);
  const b = modeState.ball;
  if (modeState.aiming) line(b.x, b.y, pointer.x, pointer.y, RED, 0.004);
  if (!b.exited) dot(b.x, b.y, b.moving ? ink(0.85) : RED, ECHO_BALL_R);
  drawStatus(`вышло: ${modeState.exits} · отскоков: ${modeState.bounces} · Q/E крутить · тяни шарик`);
}

const echo = {
  label: 'эхо',
  note: 'Внутренняя сторона дуги отражает шарик, разрыв — единственный выход. Тяни шарик от себя и отпусти, как рогатку: он полетит в противоположную сторону и будет отражаться от сплошной дуги, пока не найдёт разрыв или не остановится. «Отскок» — сколько скорости остаётся после удара, «сила» — насколько бросок чувствителен к длине оттяжки. Q/E доворачивают саму букву, если разрыв стоит неудобно.',
  cursor: 'grab',
  tools: [
    { type: 'range', key: 'bounce', label: 'отскок', min: 0.75, max: 1, step: 0.01, value: 0.92 },
    { type: 'range', key: 'power', label: 'сила', min: 2, max: 8, step: 0.2, value: 4 },
    { type: 'button', label: 'заново', action: echoReset },
  ],
  setup() { echoReset(); },
  step() { echoStep(); },
  draw() { echoDraw(); },
  onDown() {
    const b = modeState.ball;
    if (b.moving) return;
    if (b.exited) { b.x = CX; b.y = CY; b.vx = 0; b.vy = 0; b.exited = false; }
    modeState.aiming = true;
  },
  onUp() {
    if (!modeState.aiming) return;
    modeState.aiming = false;
    const b = modeState.ball;
    const vx = (b.x - pointer.x) * num('power');
    const vy = (b.y - pointer.y) * num('power');
    if (Math.hypot(vx, vy) < ECHO_MIN_LAUNCH) return;
    b.vx = vx; b.vy = vy;
    b.moving = true;
    modeState.bounces = 0;
  },
  onKey(event, down) {
    if (event.code === 'KeyQ') modeState.turnLeft = down;
    if (event.code === 'KeyE') modeState.turnRight = down;
  },
};

const MODES = { portal, radar, sickle, echo };

startLab({
  title: 'С · механики разрыва',
  modes: MODES,
  start: 'portal',
});
