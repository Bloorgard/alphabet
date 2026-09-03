/* Р · десять механик, три волны штурма.

   Первые три (насос, радар, отвес) строились на схематичном контуре —
   ствол и дуга петли, нарисованные от руки по памяти формы. Автор указал
   на слабое место: схема не использует настоящую форму буквы, тест на
   замену («убери Р — ничего не изменится, кроме чистоты картинки») они не
   проходят. Рычаг, окружность развёртки, линия отвеса — геометрия общая для
   любой буквы, Р тут просто фон.

   Вторые три (противовес, наполнение петли, шарик в петле) держатся на
   настоящем контуре: R_OUTER и R_HOLE ниже — не прикидка, а вектор,
   снятый с глифа Arial через fontTools (см. R_OUTER/R_HOLE) и разложенный
   в ломаную. R_HOLE — это просвет внутри петли: в реальном шрифте он
   отдельный самостоятельный контур, нигде не соединяющийся с внешним
   краем (петля прописной Р запечатана со всех сторон, а не разомкнута,
   как казалось на схеме). Три идеи используют настоящую геометрию
   напрямую: центр масс всей буквы (противовес), площадь именно этого
   просвета по высоте (наполнение петли), столкновение с настоящим краем
   контура (шарик в петле). Подставь другую букву — другая масса, другая
   площадь, другая форма стенок: тест на замену эти три проходят.

   Третьи четыре (пружина, звонок, флаг-старт, парус) выросли не из
   контура, а из ряда набросков автора, где ствол с петлёй перерисован
   как разные предметы — спираль, колокольчик с молоточком, флаг на
   древке, парус с рифом. Тест на замену тут другой: не геометрия буквы,
   а физика конкретного предмета, который эта деталь правдоподобно
   изображает (пружина копит и отдаёт закрутку, колокол звенит от удара,
   флаг падает и подаёт сигнал старта, парус ловит ветер под углом и не
   может идти прямо против него). Черновые прототипы без очков и правил
   победы — сначала просто должно быть физически убедительно. */

const R_STEM_X = 0.36;
const R_STEM_TOP = 0.14;
const R_STEM_BOTTOM = 0.86;
const R_LOOP_TOP = 0.2;
const R_LOOP_BOTTOM = 0.48;
const R_LOOP_RIGHT = 0.6;

/* Бледный контур буквы фоном — не механика, просто напоминание, откуда
   взялась геометрия каждого режима. */
function rDrawGhost() {
  ctx.strokeStyle = GHOST;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, 0.05 * S);
  ctx.beginPath();
  ctx.moveTo(R_STEM_X * S, R_STEM_TOP * S);
  ctx.lineTo(R_STEM_X * S, R_STEM_BOTTOM * S);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, 0.045 * S);
  ctx.beginPath();
  ctx.moveTo(R_STEM_X * S, R_LOOP_TOP * S);
  ctx.bezierCurveTo(
    (R_LOOP_RIGHT + 0.04) * S, R_LOOP_TOP * S,
    (R_LOOP_RIGHT + 0.04) * S, R_LOOP_BOTTOM * S,
    R_STEM_X * S, R_LOOP_BOTTOM * S,
  );
  ctx.stroke();
}

/* ---------- насос: рычаг на смещённом шарнире качает воду ---------- */

const PUMP_HANDLE = 0.28;
const PUMP_AMP_MIN = 0.35;
const PUMP_REST_ANGLE = 0.55;

function pumpSetup() {
  modeState.angle = PUMP_REST_ANGLE;
  modeState.prevAngle = PUMP_REST_ANGLE;
  modeState.phase = 'up';
  modeState.phaseStart = PUMP_REST_ANGLE;
  modeState.level = 0;
  modeState.strokes = 0;
  modeState.target = 0.4 + Math.random() * 0.45;
  modeState.filled = false;
}

function pumpDesiredAngle() {
  const dx = pointer.x - R_STEM_X, dy = pointer.y - R_LOOP_TOP;
  return clamp(Math.atan2(dy, dx), -0.25, 1.4);
}

function pumpStep() {
  const wantsRest = !pointer.down;
  const target = wantsRest ? PUMP_REST_ANGLE : pumpDesiredAngle();
  modeState.angle = lerp(modeState.angle, target, wantsRest ? 0.05 : 0.5);

  const da = modeState.angle - modeState.prevAngle;
  if (Math.abs(da) > 1e-4) {
    const dir = da > 0 ? 'down' : 'up';
    if (modeState.phase !== dir) {
      const amplitude = Math.abs(modeState.prevAngle - modeState.phaseStart);
      if (modeState.phase === 'down' && amplitude > PUMP_AMP_MIN && !modeState.filled) {
        modeState.level = Math.min(1, modeState.level + 0.05 + amplitude * 0.06);
        modeState.strokes += 1;
      }
      modeState.phase = dir;
      modeState.phaseStart = modeState.prevAngle;
    }
  }
  modeState.prevAngle = modeState.angle;
  if (!modeState.filled && modeState.level >= modeState.target) modeState.filled = true;
}

function pumpDraw() {
  rDrawGhost();
  const pivotX = R_STEM_X * S, pivotY = R_LOOP_TOP * S;
  const tubeHalf = 0.05 * S;
  const tubeTop = R_LOOP_TOP * S, tubeBottom = R_STEM_BOTTOM * S;

  ctx.strokeStyle = ink(0.85);
  ctx.lineWidth = Math.max(1.5, 0.006 * S);
  ctx.beginPath();
  ctx.moveTo(R_STEM_X * S - tubeHalf, tubeTop);
  ctx.lineTo(R_STEM_X * S - tubeHalf, tubeBottom);
  ctx.moveTo(R_STEM_X * S + tubeHalf, tubeTop);
  ctx.lineTo(R_STEM_X * S + tubeHalf, tubeBottom);
  ctx.moveTo(R_STEM_X * S - tubeHalf, tubeBottom);
  ctx.lineTo(R_STEM_X * S + tubeHalf, tubeBottom);
  ctx.stroke();

  const levelY = lerp(tubeBottom, tubeTop, modeState.level);
  ctx.fillStyle = ink(0.35);
  ctx.fillRect(R_STEM_X * S - tubeHalf + 1, levelY, tubeHalf * 2 - 2, tubeBottom - levelY);

  const targetY = lerp(tubeBottom, tubeTop, modeState.target);
  ctx.strokeStyle = modeState.filled ? RED : MUTED;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(R_STEM_X * S - tubeHalf - 8, targetY);
  ctx.lineTo(R_STEM_X * S + tubeHalf + 8, targetY);
  ctx.stroke();
  ctx.setLineDash([]);

  const gx = pivotX + Math.cos(modeState.angle) * PUMP_HANDLE * S;
  const gy = pivotY + Math.sin(modeState.angle) * PUMP_HANDLE * S;
  ctx.strokeStyle = pointer.down ? RED : ink(0.9);
  ctx.lineWidth = Math.max(2, 0.01 * S);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(gx, gy);
  ctx.stroke();
  dot(R_STEM_X, R_LOOP_TOP, ink(0.9), 0.008);
  dot(gx / S, gy / S, pointer.down ? RED : ink(0.9), 0.012);

  const pct = Math.round(modeState.level * 100);
  if (modeState.filled) drawStatus(`наполнено · ${modeState.strokes} качков`, true);
  else drawStatus(`${pct}% · цель ${Math.round(modeState.target * 100)}% · зажмите и качайте рычаг`);
}

/* ---------- радар: развёртка вокруг мачты, игра на очки ---------- */

const RADAR_RADIUS = 0.6;
const RADAR_BEAM = 0.14;
const RADAR_LIFE = 4.5;
const RADAR_MISS_LIMIT = 6;
const RADAR_MIN_INTERVAL = 0.45;
const RADAR_START_INTERVAL = 1.7;

function radarSetup() {
  modeState.targets = [];
  modeState.elapsed = 0;
  modeState.spawnTimer = 1;
  modeState.score = 0;
  modeState.misses = 0;
  modeState.over = false;
  modeState.sweepAngle = 0.6;
  modeState.autoAngle = 0.6;
  setGround('ink');
}

function radarSpawn() {
  for (let tries = 0; tries < 20; tries++) {
    const ang = Math.random() * Math.PI * 2;
    const r = 0.14 + Math.random() * (RADAR_RADIUS - 0.14);
    const x = R_STEM_X + Math.cos(ang) * r;
    const y = R_LOOP_TOP + Math.sin(ang) * r;
    if (x < 0.05 || x > 0.95 || y < 0.06 || y > 0.94) continue;
    modeState.targets.push({
      x, y, born: modeState.elapsed,
      detected: false, detectedAt: 0, missed: false, missedAt: 0,
    });
    return;
  }
}

function radarInterval() {
  return Math.max(RADAR_MIN_INTERVAL, RADAR_START_INTERVAL - modeState.elapsed * 0.012);
}

function radarAngleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function radarStep() {
  if (modeState.over) return;
  modeState.elapsed += STEP;
  modeState.spawnTimer -= STEP;
  if (modeState.spawnTimer <= 0) { radarSpawn(); modeState.spawnTimer = radarInterval(); }

  if (on('auto')) {
    modeState.autoAngle += STEP * 0.9;
    modeState.sweepAngle = modeState.autoAngle;
  } else if (pointer.seen) {
    modeState.sweepAngle = Math.atan2(pointer.y - R_LOOP_TOP, pointer.x - R_STEM_X);
  }

  const kept = [];
  for (const t of modeState.targets) {
    if (t.detected) {
      if (modeState.elapsed - t.detectedAt < 0.5) kept.push(t);
      continue;
    }
    if (t.missed) {
      if (modeState.elapsed - t.missedAt < 0.5) kept.push(t);
      continue;
    }
    const age = modeState.elapsed - t.born;
    if (age > RADAR_LIFE) {
      t.missed = true; t.missedAt = modeState.elapsed;
      modeState.misses += 1;
      kept.push(t);
      continue;
    }
    const angleTo = Math.atan2(t.y - R_LOOP_TOP, t.x - R_STEM_X);
    const dist = Math.hypot(t.x - R_STEM_X, t.y - R_LOOP_TOP);
    if (dist <= RADAR_RADIUS && Math.abs(radarAngleDiff(modeState.sweepAngle, angleTo)) < RADAR_BEAM) {
      t.detected = true; t.detectedAt = modeState.elapsed; modeState.score += 1;
    }
    kept.push(t);
  }
  modeState.targets = kept;

  if (modeState.misses >= RADAR_MISS_LIMIT) modeState.over = true;
}

function radarDraw() {
  rDrawGhost();
  const pivotX = R_STEM_X * S, pivotY = R_LOOP_TOP * S;

  ctx.strokeStyle = FAINT;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, RADAR_RADIUS * S, 0, Math.PI * 2);
  ctx.stroke();

  if (!modeState.over) {
    const a = modeState.sweepAngle;
    ctx.strokeStyle = ink(0.55);
    ctx.lineWidth = Math.max(2, 0.01 * S);
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(pivotX + Math.cos(a) * RADAR_RADIUS * S, pivotY + Math.sin(a) * RADAR_RADIUS * S);
    ctx.stroke();
  }

  for (const t of modeState.targets) {
    let color = null, r = 0.008;
    if (t.detected) {
      color = RED;
      r = 0.012 * (1 - clamp((modeState.elapsed - t.detectedAt) / 0.5, 0, 1) * 0.4);
    } else if (t.missed) {
      color = MUTED;
      r = 0.012;
    }
    if (color) dot(t.x, t.y, color, r);
  }

  dot(R_STEM_X, R_LOOP_TOP, ink(0.9), 0.01);

  if (modeState.over) drawStatus(`радар молчит · целей ${modeState.score} · R заново`, true);
  else drawStatus(`целей ${modeState.score} · пропущено ${modeState.misses}/${RADAR_MISS_LIMIT}`);
}

/* ---------- отвес: хвост строчной р нащупывает скрытый рельеф ---------- */

const PLUMB_ANCHOR_Y = 0.2;
const PLUMB_BUCKETS = 220;
const PLUMB_MARGIN = 0.08;

function plumbTerrainY(x) {
  const s = modeState.seed;
  const t = Math.sin(x * s.f1 + s.p1) * 0.05
    + Math.sin(x * s.f2 + s.p2) * 0.035
    + Math.sin(x * s.f3 + s.p3) * 0.02;
  return clamp(0.64 + t, 0.5, 0.84);
}

function plumbNewTerrain() {
  modeState.seed = {
    p1: Math.random() * Math.PI * 2, f1: 3 + Math.random() * 2,
    p2: Math.random() * Math.PI * 2, f2: 6 + Math.random() * 3,
    p3: Math.random() * Math.PI * 2, f3: 11 + Math.random() * 5,
  };
  modeState.revealed = new Float32Array(PLUMB_BUCKETS).fill(NaN);
  modeState.revealedCount = 0;
  modeState.bobY = plumbTerrainY(0.5);
  modeState.lastIdx = null;
}

function plumbSetup() { plumbNewTerrain(); }

function plumbBucket(x) {
  return clamp(Math.round((x - PLUMB_MARGIN) / (1 - PLUMB_MARGIN * 2) * (PLUMB_BUCKETS - 1)), 0, PLUMB_BUCKETS - 1);
}

function plumbBucketX(idx) {
  return PLUMB_MARGIN + (idx / (PLUMB_BUCKETS - 1)) * (1 - PLUMB_MARGIN * 2);
}

function plumbReveal(idx) {
  const y = plumbTerrainY(plumbBucketX(idx));
  if (Number.isNaN(modeState.revealed[idx])) modeState.revealedCount += 1;
  modeState.revealed[idx] = y;
}

function plumbStep() {
  if (!pointer.seen) { modeState.lastIdx = null; return; }
  const x = clamp(pointer.x, PLUMB_MARGIN, 1 - PLUMB_MARGIN);
  const targetY = plumbTerrainY(x);
  modeState.bobY = lerp(modeState.bobY, targetY, num('inertia'));

  const idx = plumbBucket(x);
  /* Быстрое движение мыши перескакивает через ячейки между кадрами — без
     дозаполнения промежутка след выходит пунктирным, а рельеф должен
     читаться сплошной линией, а не редкими засечками. */
  if (modeState.lastIdx !== null && Math.abs(idx - modeState.lastIdx) > 1) {
    const step = idx > modeState.lastIdx ? 1 : -1;
    for (let i = modeState.lastIdx + step; i !== idx; i += step) plumbReveal(i);
  }
  plumbReveal(idx);
  modeState.lastIdx = idx;
}

function plumbDraw() {
  rDrawGhost();
  const x = clamp(pointer.seen ? pointer.x : 0.5, PLUMB_MARGIN, 1 - PLUMB_MARGIN);

  ctx.strokeStyle = FAINT;
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PLUMB_MARGIN * S, PLUMB_ANCHOR_Y * S);
  ctx.lineTo((1 - PLUMB_MARGIN) * S, PLUMB_ANCHOR_Y * S);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = ink(0.8);
  ctx.lineWidth = Math.max(1.5, 0.006 * S);
  ctx.lineCap = 'round';
  ctx.beginPath();
  let started = false, prevIdx = -2;
  for (let i = 0; i < PLUMB_BUCKETS; i++) {
    const y = modeState.revealed[i];
    if (Number.isNaN(y)) { started = false; continue; }
    const bx = (PLUMB_MARGIN + (i / (PLUMB_BUCKETS - 1)) * (1 - PLUMB_MARGIN * 2)) * S;
    if (!started || i !== prevIdx + 1) ctx.moveTo(bx, y * S);
    else ctx.lineTo(bx, y * S);
    started = true;
    prevIdx = i;
  }
  ctx.stroke();

  if (pointer.seen) {
    ctx.strokeStyle = ink(0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x * S, PLUMB_ANCHOR_Y * S);
    ctx.lineTo(x * S, modeState.bobY * S);
    ctx.stroke();
    dot(x, PLUMB_ANCHOR_Y, ink(0.7), 0.006);
    dot(x, modeState.bobY, RED, 0.009);
  }

  const pct = Math.round((modeState.revealedCount / PLUMB_BUCKETS) * 100);
  drawStatus(`${pct}% дна открыто · ведите мышью вдоль строки`);
}

/* ---------- геометрия настоящей буквы Р (вектор из Arial, снят fontTools) ----------

   Кубические кривые глифа развёрнуты в ломаную (шаг t = 1/12 на сегмент) и
   вписаны в тот же нормализованный квадрат 0..1, что и остальной полигон.
   R_OUTER — внешний контур буквы, R_HOLE — просвет внутри петли: в шрифте
   это отдельный самостоятельный контур, нигде не соединённый с внешним
   краем (даже в верхней точке петля запечатана — открытого зазора у
   прописной Р в печатной форме нет, это не рукопись). */

const R_OUTER = [[0.2557,0.8],[0.2557,0.7467],[0.2557,0.6933],[0.2557,0.64],[0.2557,0.5867],[0.2557,0.5333],[0.2557,0.48],[0.2557,0.4267],[0.2557,0.3733],[0.2557,0.32],[0.2557,0.2667],[0.2557,0.2133],[0.2557,0.16],[0.2759,0.16],[0.296,0.16],[0.3161,0.16],[0.3362,0.16],[0.3563,0.16],[0.3765,0.16],[0.3966,0.16],[0.4167,0.16],[0.4368,0.16],[0.4569,0.16],[0.477,0.16],[0.4972,0.16],[0.5076,0.16],[0.5176,0.1602],[0.5271,0.1604],[0.5363,0.1607],[0.545,0.1611],[0.5534,0.1615],[0.5613,0.1621],[0.5688,0.1627],[0.5758,0.1634],[0.5825,0.1642],[0.5887,0.1651],[0.5945,0.1661],[0.6023,0.1675],[0.6098,0.1691],[0.6171,0.1709],[0.6243,0.1729],[0.6312,0.1751],[0.6378,0.1775],[0.6443,0.1801],[0.6506,0.1829],[0.6566,0.1859],[0.6625,0.1891],[0.6681,0.1924],[0.6735,0.196],[0.6788,0.1998],[0.6838,0.2039],[0.6887,0.2081],[0.6934,0.2127],[0.6979,0.2175],[0.7023,0.2225],[0.7065,0.2278],[0.7105,0.2333],[0.7143,0.239],[0.718,0.245],[0.7215,0.2513],[0.7248,0.2578],[0.7279,0.2645],[0.7308,0.2713],[0.7333,0.2781],[0.7356,0.2851],[0.7376,0.2923],[0.7394,0.2995],[0.7409,0.3068],[0.7421,0.3143],[0.743,0.3218],[0.7437,0.3295],[0.7441,0.3372],[0.7443,0.3451],[0.7439,0.3585],[0.7428,0.3716],[0.741,0.3844],[0.7385,0.3967],[0.7352,0.4088],[0.7313,0.4205],[0.7266,0.4318],[0.7212,0.4428],[0.715,0.4534],[0.7082,0.4637],[0.7006,0.4737],[0.6923,0.4833],[0.6831,0.4923],[0.6727,0.5005],[0.6611,0.508],[0.6484,0.5147],[0.6345,0.5206],[0.6194,0.5257],[0.6032,0.53],[0.5858,0.5335],[0.5672,0.5363],[0.5475,0.5382],[0.5266,0.5394],[0.5046,0.5398],[0.4909,0.5398],[0.4772,0.5398],[0.4635,0.5398],[0.4499,0.5398],[0.4362,0.5398],[0.4225,0.5398],[0.4088,0.5398],[0.3952,0.5398],[0.3815,0.5398],[0.3678,0.5398],[0.3541,0.5398],[0.3404,0.5398],[0.3404,0.5615],[0.3404,0.5832],[0.3404,0.6049],[0.3404,0.6265],[0.3404,0.6482],[0.3404,0.6699],[0.3404,0.6916],[0.3404,0.7133],[0.3404,0.735],[0.3404,0.7566],[0.3404,0.7783],[0.3404,0.8],[0.3334,0.8],[0.3263,0.8],[0.3193,0.8],[0.3122,0.8],[0.3051,0.8],[0.2981,0.8],[0.291,0.8],[0.284,0.8],[0.2769,0.8],[0.2699,0.8],[0.2628,0.8]];

const R_HOLE = [[0.3404,0.4643],[0.3542,0.4643],[0.368,0.4643],[0.3818,0.4643],[0.3956,0.4643],[0.4094,0.4643],[0.4232,0.4643],[0.437,0.4643],[0.4507,0.4643],[0.4645,0.4643],[0.4783,0.4643],[0.4921,0.4643],[0.5059,0.4643],[0.5192,0.4641],[0.5319,0.4634],[0.544,0.4624],[0.5553,0.4609],[0.566,0.459],[0.5761,0.4566],[0.5855,0.4539],[0.5942,0.4507],[0.6022,0.4471],[0.6096,0.4431],[0.6164,0.4386],[0.6225,0.4337],[0.628,0.4285],[0.633,0.4228],[0.6375,0.4169],[0.6416,0.4106],[0.6452,0.4039],[0.6483,0.3969],[0.651,0.3896],[0.6531,0.3819],[0.6548,0.3739],[0.656,0.3655],[0.6567,0.3568],[0.6569,0.3477],[0.6568,0.3411],[0.6564,0.3347],[0.6557,0.3284],[0.6547,0.3222],[0.6534,0.3163],[0.6519,0.3105],[0.65,0.3048],[0.6479,0.2993],[0.6455,0.294],[0.6428,0.2888],[0.6399,0.2838],[0.6366,0.279],[0.6332,0.2743],[0.6295,0.27],[0.6257,0.2659],[0.6217,0.2621],[0.6175,0.2585],[0.6131,0.2552],[0.6086,0.2522],[0.6039,0.2495],[0.5989,0.247],[0.5939,0.2448],[0.5886,0.2429],[0.5832,0.2412],[0.5793,0.2403],[0.575,0.2395],[0.5702,0.2387],[0.5649,0.238],[0.559,0.2375],[0.5527,0.2369],[0.5459,0.2365],[0.5385,0.2362],[0.5307,0.2359],[0.5223,0.2357],[0.5135,0.2356],[0.5041,0.2355],[0.4905,0.2355],[0.4769,0.2355],[0.4632,0.2355],[0.4496,0.2355],[0.4359,0.2355],[0.4223,0.2355],[0.4086,0.2355],[0.395,0.2355],[0.3814,0.2355],[0.3677,0.2355],[0.3541,0.2355],[0.3404,0.2355],[0.3404,0.2546],[0.3404,0.2737],[0.3404,0.2927],[0.3404,0.3118],[0.3404,0.3308],[0.3404,0.3499],[0.3404,0.369],[0.3404,0.388],[0.3404,0.4071],[0.3404,0.4262],[0.3404,0.4452]];

/* Точка подвеса на настоящем верхнем крае ствола (не выдумка — верхний
   левый угол глифа) и настоящий центр масс всей буквы (внешний контур
   минус просвет петли), посчитанный тем же способом, что и площадь ниже. */
const R_PIVOT = { x: 0.298, y: 0.17 };
const R_PIVOT_WORLD = { x: 0.5, y: 0.22 };
const R_CENTROID = { x: 0.4469, y: 0.4056 };

function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
    a += p1[0] * p2[1] - p2[0] * p1[1];
  }
  return a / 2;
}

function pointInPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    const hit = (yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/* Ближайшая точка на границе многоугольника и единичная нормаль к тому
   сегменту, где она найдена — сторона нормали не определена (зависит от
   обхода контура), кто вызывает, тот и решает, куда её развернуть. */
function nearestPolyPoint(poly, x, y) {
  let best = Infinity, bestX = 0, bestY = 0, bestNx = 0, bestNy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const x1 = poly[j][0], y1 = poly[j][1], x2 = poly[i][0], y2 = poly[i][1];
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1e-9;
    const t = clamp(((x - x1) * dx + (y - y1) * dy) / len2, 0, 1);
    const px = x1 + dx * t, py = y1 + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best) { best = d; bestX = px; bestY = py; bestNx = -dy; bestNy = dx; }
  }
  const len = Math.hypot(bestNx, bestNy) || 1;
  return { dist: best, x: bestX, y: bestY, nx: bestNx / len, ny: bestNy / len };
}

function polyPath(poly) {
  const path = new Path2D();
  path.moveTo(poly[0][0] * S, poly[0][1] * S);
  for (let i = 1; i < poly.length; i++) path.lineTo(poly[i][0] * S, poly[i][1] * S);
  path.closePath();
  return path;
}

/* ---------- противовес: настоящий центр масс висит с гвоздя ---------- */

const WEIGHT_MASS = 0.018;
const WEIGHT_MAX = 6;
const WEIGHT_HIT = 0.022;

function weightSolidArea() { return Math.abs(polyArea(R_OUTER)) - Math.abs(polyArea(R_HOLE)); }

/* Угол, при котором подвешенная за R_PIVOT буква сама остановится: центр
   масс (настоящий плюс добавленные грузики) должен встать точно под
   гвоздём — как рамка на стене. Без грузиков сразу видно, что буква
   зависает наклонно: у настоящей Р масса смещена от точки подвеса и вниз,
   и вбок, не только вниз. */
function weightEquilibrium(weights) {
  const solid = weightSolidArea();
  let mx = R_CENTROID.x * solid, my = R_CENTROID.y * solid, mass = solid;
  for (const w of weights) { mx += w.x * WEIGHT_MASS; my += w.y * WEIGHT_MASS; mass += WEIGHT_MASS; }
  const cx = mx / mass, cy = my / mass;
  const angle0 = Math.atan2(cy - R_PIVOT.y, cx - R_PIVOT.x);
  return { angle: Math.PI / 2 - angle0, cx, cy };
}

function weightSetup() {
  modeState.weights = [];
  modeState.angle = weightEquilibrium([]).angle;
}

function weightStep() {
  const eq = weightEquilibrium(modeState.weights);
  modeState.angle = lerp(modeState.angle, eq.angle, 0.06);
}

/* Мировая точка (курсор) переводится в собственную, не повёрнутую систему
   координат буквы — обратное вращение вокруг гвоздя, — чтобы грузик лип
   к тому месту контура, по которому кликнули, а не к месту на экране. */
function weightLocalFromWorld(wx, wy) {
  const a = -modeState.angle;
  const dx = wx - R_PIVOT_WORLD.x, dy = wy - R_PIVOT_WORLD.y;
  const rx = dx * Math.cos(a) - dy * Math.sin(a);
  const ry = dx * Math.sin(a) + dy * Math.cos(a);
  return { x: R_PIVOT.x + rx, y: R_PIVOT.y + ry };
}

function weightDraw() {
  const outerPath = polyPath(R_OUTER);
  const holePath = polyPath(R_HOLE);

  ctx.save();
  ctx.translate(R_PIVOT_WORLD.x * S, R_PIVOT_WORLD.y * S);
  ctx.rotate(modeState.angle);
  ctx.translate(-R_PIVOT.x * S, -R_PIVOT.y * S);
  const combo = new Path2D();
  combo.addPath(outerPath);
  combo.addPath(holePath);
  ctx.fillStyle = ink(0.88);
  ctx.fill(combo, 'evenodd');
  for (const w of modeState.weights) {
    ctx.beginPath();
    ctx.arc(w.x * S, w.y * S, 0.017 * S, 0, Math.PI * 2);
    ctx.fillStyle = RED;
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = FAINT;
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(R_PIVOT_WORLD.x * S, R_PIVOT_WORLD.y * S);
  ctx.lineTo(R_PIVOT_WORLD.x * S, (R_PIVOT_WORLD.y + 0.62) * S);
  ctx.stroke();
  ctx.setLineDash([]);
  dot(R_PIVOT_WORLD.x, R_PIVOT_WORLD.y, ink(0.9), 0.007);

  const deg = Math.round(Math.abs(modeState.angle) * 180 / Math.PI);
  const level = Math.abs(modeState.angle) < 0.05;
  if (level) drawStatus(`ровно · ${modeState.weights.length} грузиков`, true);
  else drawStatus(`наклон ${deg}° · грузиков ${modeState.weights.length}/${WEIGHT_MAX}`);
}

/* ---------- наполнение петли: настоящая площадь просвета как сосуд ---------- */

const FILL_SAMPLES = 160;
const R_HOLE_XMIN = Math.min(...R_HOLE.map((p) => p[0]));
const R_HOLE_XMAX = Math.max(...R_HOLE.map((p) => p[0]));

/* Профиль «ширина просвета на каждой высоте» по настоящему контуру —
   считается один раз, дальше уровень по объёму ищется по накопленной
   площади (пары пересечений сканирующей линии с рёбрами R_HOLE). */
function fillBuildProfile() {
  const ys = R_HOLE.map((p) => p[1]);
  const ymin = Math.min(...ys), ymax = Math.max(...ys);
  const rows = [];
  for (let i = 0; i <= FILL_SAMPLES; i++) {
    const y = ymin + (ymax - ymin) * (i / FILL_SAMPLES);
    const xs = [];
    for (let j = 0, k = R_HOLE.length - 1; j < R_HOLE.length; k = j++) {
      const x1 = R_HOLE[k][0], y1 = R_HOLE[k][1], x2 = R_HOLE[j][0], y2 = R_HOLE[j][1];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + (x2 - x1) * (y - y1) / (y2 - y1));
    }
    xs.sort((a, b) => a - b);
    let width = 0;
    for (let m = 0; m + 1 < xs.length; m += 2) width += xs[m + 1] - xs[m];
    rows.push({ y, width });
  }
  const dy = (ymax - ymin) / FILL_SAMPLES;
  let cum = 0;
  const cumRows = rows.map((r, i) => {
    if (i > 0) cum += (rows[i - 1].width + r.width) / 2 * dy;
    return cum;
  });
  return { rows, cumRows, ymin, ymax, total: cum };
}

function fillLevelForVolume(profile, volume) {
  const v = clamp(volume, 0, profile.total);
  let i = 0;
  while (i < profile.cumRows.length - 1 && profile.cumRows[i + 1] < v) i++;
  const i1 = Math.min(i + 1, profile.rows.length - 1);
  const c0 = profile.cumRows[i], c1 = profile.cumRows[i1];
  const t = c1 > c0 ? (v - c0) / (c1 - c0) : 0;
  return lerp(profile.rows[i].y, profile.rows[i1].y, t);
}

function fillSetup() {
  modeState.profile = fillBuildProfile();
  modeState.volume = 0;
  modeState.target = modeState.profile.total * (0.35 + Math.random() * 0.5);
  modeState.filled = false;
}

function fillStep() {
  if (pointer.down) {
    modeState.volume = Math.min(modeState.profile.total, modeState.volume + modeState.profile.total * 0.22 * STEP);
  }
  if (!modeState.filled && modeState.volume >= modeState.target) modeState.filled = true;
}

function fillDraw() {
  const outerPath = polyPath(R_OUTER);
  const holePath = polyPath(R_HOLE);
  ctx.strokeStyle = ink(0.5);
  ctx.lineWidth = Math.max(1, 0.004 * S);
  ctx.stroke(outerPath);
  ctx.stroke(holePath);

  const level = fillLevelForVolume(modeState.profile, modeState.volume);
  ctx.save();
  ctx.clip(holePath);
  ctx.fillStyle = ink(0.32);
  ctx.fillRect(0, level * S, S, S);
  ctx.restore();

  const targetY = fillLevelForVolume(modeState.profile, modeState.target);
  ctx.strokeStyle = modeState.filled ? RED : MUTED;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo((R_HOLE_XMIN - 0.02) * S, targetY * S);
  ctx.lineTo((R_HOLE_XMAX + 0.02) * S, targetY * S);
  ctx.stroke();
  ctx.setLineDash([]);

  const pct = Math.round((modeState.volume / modeState.profile.total) * 100);
  if (modeState.filled) drawStatus('заполнено', true);
  else drawStatus(`${pct}% · цель ${Math.round((modeState.target / modeState.profile.total) * 100)}% · зажмите — льётся`);
}

/* ---------- шарик в петле: гравитация по настоящему краю просвета ---------- */

const MARBLE_RADIUS = 0.014;
const MARBLE_ROUND_TIME = 30;

function marbleRandomTarget() {
  const xs = R_HOLE.map((p) => p[0]), ys = R_HOLE.map((p) => p[1]);
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
  for (let tries = 0; tries < 60; tries++) {
    const x = lerp(xmin, xmax, Math.random()), y = lerp(ymin, ymax, Math.random());
    if (pointInPoly(R_HOLE, x, y) && nearestPolyPoint(R_HOLE, x, y).dist > MARBLE_RADIUS * 1.8) return { x, y };
  }
  return { x: R_CENTROID.x, y: R_CENTROID.y };
}

function marbleSetup() {
  modeState.ball = { x: R_CENTROID.x, y: R_CENTROID.y, vx: 0, vy: 0 };
  modeState.target = marbleRandomTarget();
  modeState.score = 0;
  modeState.elapsed = 0;
  modeState.over = false;
}

function marbleStep() {
  if (modeState.over) return;
  modeState.elapsed += STEP;
  if (modeState.elapsed >= MARBLE_ROUND_TIME) { modeState.over = true; return; }

  const gx = pointer.seen ? clamp((pointer.x - 0.5) * 2, -1, 1) : 0;
  const gy = pointer.seen ? clamp((pointer.y - 0.5) * 2, -1, 1) : 0;
  const b = modeState.ball;
  b.vx = (b.vx + gx * 0.9 * STEP) * 0.99;
  b.vy = (b.vy + gy * 0.9 * STEP) * 0.99;
  b.x += b.vx;
  b.y += b.vy;

  const inside = pointInPoly(R_HOLE, b.x, b.y);
  const near = nearestPolyPoint(R_HOLE, b.x, b.y);
  let nx = near.nx, ny = near.ny;
  if ((R_CENTROID.x - near.x) * nx + (R_CENTROID.y - near.y) * ny < 0) { nx = -nx; ny = -ny; }
  if (!inside || near.dist < MARBLE_RADIUS) {
    b.x = near.x + nx * MARBLE_RADIUS;
    b.y = near.y + ny * MARBLE_RADIUS;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= vn * nx * 1.5; b.vy -= vn * ny * 1.5; }
    b.vx *= 0.6;
    b.vy *= 0.6;
  }

  if (Math.hypot(b.x - modeState.target.x, b.y - modeState.target.y) < MARBLE_RADIUS + 0.016) {
    modeState.score += 1;
    modeState.target = marbleRandomTarget();
  }
}

function marbleDraw() {
  ctx.strokeStyle = ink(0.35);
  ctx.lineWidth = Math.max(1, 0.004 * S);
  ctx.stroke(polyPath(R_OUTER));
  ctx.strokeStyle = ink(0.8);
  ctx.stroke(polyPath(R_HOLE));

  if (!modeState.over) {
    dot(modeState.target.x, modeState.target.y, RED, 0.013);
    ctx.beginPath();
    ctx.arc(modeState.ball.x * S, modeState.ball.y * S, MARBLE_RADIUS * S, 0, Math.PI * 2);
    ctx.fillStyle = ink(0.9);
    ctx.fill();
  }

  const left = Math.max(0, Math.round(MARBLE_ROUND_TIME - modeState.elapsed));
  if (modeState.over) drawStatus(`время вышло · очков ${modeState.score} · R заново`, true);
  else drawStatus(`очков ${modeState.score} · ${left}с · курсор задаёт наклон`);
}

/* ---------- пружина: физическая закрутка, чистый прототип без цели ---------- */

const SPRING_CENTER = { x: 0.42, y: 0.36 };
const SPRING_MAX_R = 0.16;
const SPRING_BASE_SWEEP = 4 * Math.PI;
const SPRING_MIN_SWEEP = 2 * Math.PI;
const SPRING_MAX_SWEEP = 10 * Math.PI;
const SPRING_K = 14;
const SPRING_C = 3.2;
const SPRING_TAIL_Y = 0.82;

function springSetup() {
  modeState.twist = 0;
  modeState.twistVel = 0;
  modeState.dragging = false;
  modeState.dragAngle = 0;
}

function springAngleAt(x, y) { return Math.atan2(y - SPRING_CENTER.y, x - SPRING_CENTER.x); }

function springAngleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function springStep() {
  if (modeState.dragging) {
    const a = springAngleAt(pointer.x, pointer.y);
    const delta = springAngleDiff(a, modeState.dragAngle);
    modeState.twist = clamp(modeState.twist + delta, SPRING_MIN_SWEEP - SPRING_BASE_SWEEP, SPRING_MAX_SWEEP - SPRING_BASE_SWEEP);
    modeState.twistVel = delta / STEP;
    modeState.dragAngle = a;
  } else {
    modeState.twistVel += (-SPRING_K * modeState.twist - SPRING_C * modeState.twistVel) * STEP;
    modeState.twist += modeState.twistVel * STEP;
  }
}

/* Внешний конец спирали всегда упирается в одну и ту же точку — как
   реальная пружина, закреплённая снаружи: крутишь туже, витков больше,
   но габарит не растёт. Радиус на каждом обороте подбирается так, чтобы
   при текущем числе витков спираль всё равно доходила ровно до SPRING_MAX_R. */
function springPoints() {
  const sweep = clamp(SPRING_BASE_SWEEP + modeState.twist, SPRING_MIN_SWEEP, SPRING_MAX_SWEEP);
  const growth = SPRING_MAX_R / sweep;
  const steps = Math.max(40, Math.round(sweep * 12));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * sweep;
    const r = growth * a;
    pts.push({ x: SPRING_CENTER.x + Math.cos(a) * r, y: SPRING_CENTER.y + Math.sin(a) * r });
  }
  return pts;
}

function springDraw() {
  const pts = springPoints();
  ctx.strokeStyle = ink(0.9);
  ctx.lineWidth = Math.max(1.5, 0.007 * S);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x * S, pts[0].y * S);
  for (const p of pts) ctx.lineTo(p.x * S, p.y * S);
  const tail = pts[pts.length - 1];
  ctx.lineTo(tail.x * S, SPRING_TAIL_Y * S);
  ctx.stroke();
  dot(SPRING_CENTER.x, SPRING_CENTER.y, ink(0.9), 0.006);

  const turns = (clamp(SPRING_BASE_SWEEP + modeState.twist, SPRING_MIN_SWEEP, SPRING_MAX_SWEEP) / (Math.PI * 2)).toFixed(1);
  drawStatus(`${turns} витков · крутите вокруг центра и отпустите`);
}

/* ---------- звонок: ствол-хлыст отскакивает и бьёт по шарику ---------- */

let bellAudioCtx = null;

function bellBeep(strength) {
  try {
    if (!bellAudioCtx) bellAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ac = bellAudioCtx;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = 650 + strength * 400;
    gain.gain.setValueAtTime(Math.min(0.3, 0.06 + strength * 0.22), ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + 0.42);
  } catch (error) { /* звук недоступен (нет разрешения, старый браузер) — удар всё равно виден */ }
}

const BELL_BASE_X = 0.42;
const BELL_BASE_Y = 0.86;
const BELL_TOP_Y = 0.2;
const BELL_MAX_BEND = 0.22;
const BELL_K = 60;
const BELL_C = 2.2;
const BELL_BALL_OFFSET = 0.09;
const BELL_BALL_RADIUS = 0.03;
const BELL_HIT_COOLDOWN = 0.18;

function bellSetup() {
  modeState.bendX = 0;
  modeState.bendVel = 0;
  modeState.dragging = false;
  modeState.wobble = 0;
  modeState.rings = [];
  modeState.cooldown = 0;
  modeState.elapsed = 0;
  modeState.prevTipX = BELL_BASE_X;
}

function bellStep() {
  if (modeState.dragging) {
    modeState.bendX = clamp(pointer.x - BELL_BASE_X, -BELL_MAX_BEND, BELL_MAX_BEND);
    modeState.bendVel = 0;
  } else {
    const force = -BELL_K * modeState.bendX - BELL_C * modeState.bendVel;
    modeState.bendVel += force * STEP;
    modeState.bendX += modeState.bendVel * STEP;
  }
  modeState.cooldown = Math.max(0, modeState.cooldown - STEP);

  const tipX = BELL_BASE_X + modeState.bendX;
  const hitX = BELL_BASE_X + BELL_BALL_OFFSET - BELL_BALL_RADIUS;
  if (!modeState.dragging && modeState.cooldown <= 0
      && modeState.prevTipX < hitX && tipX >= hitX && modeState.bendVel > 0.3) {
    const strength = clamp(modeState.bendVel * 0.6, 0.2, 1);
    modeState.wobble = Math.min(1.4, modeState.wobble + strength);
    modeState.rings.push({ born: modeState.elapsed, strength });
    bellBeep(strength);
    modeState.cooldown = BELL_HIT_COOLDOWN;
    modeState.bendVel *= -0.35;
  }
  modeState.prevTipX = tipX;
  modeState.wobble *= 0.9;
  modeState.elapsed += STEP;
  modeState.rings = modeState.rings.filter((r) => modeState.elapsed - r.born < 0.6);
}

function bellDraw() {
  const tipX = BELL_BASE_X + modeState.bendX;
  ctx.strokeStyle = ink(0.9);
  ctx.lineWidth = Math.max(2, 0.014 * S);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(BELL_BASE_X * S, BELL_BASE_Y * S);
  const midX = BELL_BASE_X + modeState.bendX * 0.35;
  const midY = (BELL_BASE_Y + BELL_TOP_Y) / 2;
  ctx.quadraticCurveTo(midX * S, midY * S, tipX * S, BELL_TOP_Y * S);
  ctx.stroke();

  const ballX = BELL_BASE_X + BELL_BALL_OFFSET;
  const ballR = BELL_BALL_RADIUS * (1 + modeState.wobble * 0.25);
  ctx.beginPath();
  ctx.arc(ballX * S, BELL_TOP_Y * S, ballR * S, 0, Math.PI * 2);
  ctx.fillStyle = ink(0.92);
  ctx.fill();

  for (const r of modeState.rings) {
    const t = (modeState.elapsed - r.born) / 0.6;
    ctx.strokeStyle = ink((1 - t) * 0.5);
    ctx.lineWidth = Math.max(1, 0.004 * S);
    ctx.beginPath();
    ctx.arc(ballX * S, BELL_TOP_Y * S, (BELL_BALL_RADIUS + t * 0.09) * S, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawStatus('оттяните верхушку в сторону и отпустите — она бьёт по шарику');
}

/* ---------- флаг-старт: падение флага запускает реакцию, ранний клик — фальстарт ---------- */

const FLAG_BASE = { x: 0.32, y: 0.82 };
const FLAG_TOP = { x: 0.6, y: 0.18 };
const FLAG_ATTACH_T = 0.72;
const FLAG_LEN = 0.22;
const FLAG_HEIGHT = 0.1;
const FLAG_MIN_DELAY = 1.2;
const FLAG_MAX_DELAY = 4;

function flagNewRound() {
  modeState.state = 'waiting';
  modeState.dropDelay = FLAG_MIN_DELAY + Math.random() * (FLAG_MAX_DELAY - FLAG_MIN_DELAY);
  modeState.dropAt = 0;
  modeState.raise = modeState.raise ?? 1;
}

function flagSetup() {
  modeState.elapsed = 0;
  modeState.best = null;
  modeState.resultText = '';
  modeState.resultAt = 0;
  flagNewRound();
}

function flagStep() {
  modeState.elapsed += STEP;
  if (modeState.state === 'waiting' && modeState.elapsed >= modeState.dropDelay) {
    modeState.state = 'dropped';
    modeState.dropAt = modeState.elapsed;
  }
  const targetRaise = modeState.state === 'waiting' ? 1 : 0;
  modeState.raise = lerp(modeState.raise, targetRaise, 0.25);
  if (modeState.state === 'result' && modeState.elapsed - modeState.resultAt > 1.1) flagNewRound();
}

function flagDraw() {
  ctx.strokeStyle = ink(0.9);
  ctx.lineWidth = Math.max(2, 0.012 * S);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(FLAG_BASE.x * S, FLAG_BASE.y * S);
  ctx.lineTo(FLAG_TOP.x * S, FLAG_TOP.y * S);
  ctx.stroke();

  const attach = { x: lerp(FLAG_BASE.x, FLAG_TOP.x, FLAG_ATTACH_T), y: lerp(FLAG_BASE.y, FLAG_TOP.y, FLAG_ATTACH_T) };
  const alongX = FLAG_TOP.x - FLAG_BASE.x, alongY = FLAG_TOP.y - FLAG_BASE.y;
  const len = Math.hypot(alongX, alongY);
  const ux = alongX / len, uy = alongY / len;
  const poleAngle = Math.atan2(alongY, alongX);
  const dir = lerp(Math.PI / 2, poleAngle + Math.PI / 2, modeState.raise);
  const tip = { x: attach.x + Math.cos(dir) * FLAG_LEN, y: attach.y + Math.sin(dir) * FLAG_LEN };
  const back = { x: attach.x - ux * FLAG_HEIGHT, y: attach.y - uy * FLAG_HEIGHT };

  ctx.beginPath();
  ctx.moveTo(attach.x * S, attach.y * S);
  ctx.lineTo(tip.x * S, tip.y * S);
  ctx.lineTo(back.x * S, back.y * S);
  ctx.closePath();
  ctx.fillStyle = modeState.state === 'dropped' ? RED : ink(0.85);
  ctx.fill();

  const bestTxt = modeState.best !== null ? ` · рекорд ${Math.round(modeState.best * 1000)} мс` : '';
  let msg;
  if (modeState.state === 'waiting') msg = 'ждите падения флага…';
  else if (modeState.state === 'dropped') msg = 'сейчас! жмите';
  else msg = modeState.resultText;
  drawStatus(`${msg}${bestTxt}`, modeState.state === 'dropped' || modeState.resultText === 'рано!');
}

/* ---------- парус: угол к ветру решает скорость, порыв без рифа — оверкиль ---------- */

const SAIL_MAST_Y = 0.5;
const SAIL_START_X = 0.12;
const SAIL_FINISH_X = 0.88;
const SAIL_TIME_LIMIT = 40;
const SAIL_SPEED_SCALE = 0.09;
const SAIL_GUST_THRESHOLD = 1.25;
const SAIL_CATCH_DANGER = 0.75;
const SAIL_CAPSIZE_HOLD = 0.5;

function sailSetup() {
  modeState.boatX = SAIL_START_X;
  modeState.sailAngle = 0;
  modeState.windAngle = 0;
  modeState.windStrength = 0.6;
  modeState.gustTimer = 2 + Math.random() * 2;
  modeState.gustPhase = 0;
  modeState.dangerTime = 0;
  modeState.capsizes = 0;
  modeState.elapsed = 0;
  modeState.finished = false;
  modeState.reachedGoal = false;
  modeState.finishAt = 0;
}

function sailStep() {
  modeState.elapsed += STEP;
  if (modeState.finished) return;

  modeState.windAngle = Math.sin(modeState.elapsed * 0.15) * 0.9;
  modeState.gustTimer -= STEP;
  if (modeState.gustTimer <= 0 && modeState.gustPhase <= 0) {
    modeState.gustPhase = 1;
    modeState.gustTimer = 3 + Math.random() * 3;
  }
  if (modeState.gustPhase > 0) modeState.gustPhase = Math.max(0, modeState.gustPhase - STEP / 1.4);
  modeState.windStrength = 0.55 + modeState.gustPhase * 0.85;

  if (pointer.down) modeState.sailAngle = Math.atan2(pointer.y - SAIL_MAST_Y, pointer.x - modeState.boatX);

  const reefed = on('reef');
  const catchAmt = clamp(Math.cos(modeState.sailAngle - modeState.windAngle), 0, 1);
  const effCatch = reefed ? catchAmt * 0.55 : catchAmt;
  const thrust = effCatch * modeState.windStrength;
  modeState.boatX = clamp(modeState.boatX + thrust * SAIL_SPEED_SCALE * STEP, SAIL_START_X - 0.02, SAIL_FINISH_X + 0.05);

  const danger = !reefed && modeState.windStrength > SAIL_GUST_THRESHOLD && catchAmt > SAIL_CATCH_DANGER;
  modeState.dangerTime = danger ? modeState.dangerTime + STEP : 0;
  if (modeState.dangerTime > SAIL_CAPSIZE_HOLD) {
    modeState.capsizes += 1;
    modeState.boatX = SAIL_START_X;
    modeState.dangerTime = 0;
  }

  if (modeState.boatX >= SAIL_FINISH_X) {
    modeState.finished = true;
    modeState.reachedGoal = true;
    modeState.finishAt = modeState.elapsed;
  } else if (modeState.elapsed >= SAIL_TIME_LIMIT) {
    modeState.finished = true;
  }
}

function sailDraw() {
  ctx.strokeStyle = FAINT;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, SAIL_MAST_Y * S);
  ctx.lineTo(S, SAIL_MAST_Y * S);
  ctx.stroke();
  dot(SAIL_FINISH_X, SAIL_MAST_Y, ink(0.6), 0.012);

  const wx = 0.5, wy = 0.08, wlen = 0.05 + modeState.windStrength * 0.05;
  ctx.strokeStyle = modeState.windStrength > SAIL_GUST_THRESHOLD ? RED : ink(0.6);
  ctx.lineWidth = Math.max(1.5, 0.006 * S);
  ctx.beginPath();
  ctx.moveTo((wx - Math.cos(modeState.windAngle) * wlen) * S, (wy - Math.sin(modeState.windAngle) * wlen) * S);
  ctx.lineTo((wx + Math.cos(modeState.windAngle) * wlen) * S, (wy + Math.sin(modeState.windAngle) * wlen) * S);
  ctx.stroke();

  const mastTopY = SAIL_MAST_Y - 0.22;
  ctx.strokeStyle = ink(0.9);
  ctx.lineWidth = Math.max(2, 0.01 * S);
  ctx.beginPath();
  ctx.moveTo(modeState.boatX * S, SAIL_MAST_Y * S);
  ctx.lineTo(modeState.boatX * S, mastTopY * S);
  ctx.stroke();

  const reefed = on('reef');
  const sailLen = reefed ? 0.11 : 0.18;
  const sx = modeState.boatX + Math.cos(modeState.sailAngle) * sailLen;
  const sy = mastTopY + 0.06 + Math.sin(modeState.sailAngle) * sailLen;
  ctx.beginPath();
  ctx.moveTo(modeState.boatX * S, mastTopY * S);
  ctx.quadraticCurveTo(
    lerp(modeState.boatX, sx, 0.5) * S, lerp(mastTopY + 0.06, sy, 0.5) * S - 0.02 * S,
    sx * S, sy * S,
  );
  ctx.lineTo(modeState.boatX * S, (SAIL_MAST_Y - 0.02) * S);
  ctx.closePath();
  ctx.fillStyle = modeState.dangerTime > 0 ? RED : ink(0.75);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo((modeState.boatX - 0.05) * S, (SAIL_MAST_Y + 0.02) * S);
  ctx.lineTo((modeState.boatX + 0.05) * S, (SAIL_MAST_Y + 0.02) * S);
  ctx.lineTo(modeState.boatX * S, (SAIL_MAST_Y + 0.055) * S);
  ctx.closePath();
  ctx.fillStyle = ink(0.9);
  ctx.fill();

  const pct = Math.round(clamp((modeState.boatX - SAIL_START_X) / (SAIL_FINISH_X - SAIL_START_X), 0, 1) * 100);
  if (modeState.finished) {
    const msg = modeState.reachedGoal ? `буй взят за ${modeState.finishAt.toFixed(1)}с` : 'время вышло';
    drawStatus(`${msg} · оверкилей ${modeState.capsizes} · R заново`, true);
  } else {
    drawStatus(`${pct}% · оверкилей ${modeState.capsizes} · тяните мышь — угол паруса к ветру`);
  }
}

/* ---------- сборка ---------- */

const MODES = {
  pump: {
    label: 'насос',
    note: 'Петля прописной Р сидит на стволе не по центру — как ручка водяного насоса на трубе. Зажмите кнопку мыши в любом месте холста и двигайте вверх-вниз: рычаг поворачивается вокруг верхнего шарнира, а полный ход вниз-вверх (не меньше заметного размаха) считается качком и добавляет воду в трубу. Отпустите — рычаг сам возвращается в состояние покоя. Долейте до пунктирной цели; при заполнении статус загорается красным. «Заново» ставит новую случайную цель и обнуляет трубу.',
    cursor: 'grab',
    tools: [
      { type: 'button', label: 'заново', action: pumpSetup },
    ],
    setup() { pumpSetup(); },
    step() { pumpStep(); },
    draw() { pumpDraw(); },
  },
  radar: {
    label: 'радар',
    note: 'Та же смещённая петля становится стрелкой развёртки на мачте-стволе: наведите мышь, чтобы направить луч. Цели рождаются случайно вокруг мачты и невидимы, пока луч их не заденет — тогда точка вспыхивает красным и засчитывается. Не замеченная за отведённое время цель гаснет сама и уходит в пропуски. Шесть пропусков — радар замолкает, R или переключение режима начинают заново. Со временем цели появляются чаще. «Авто-вращение» отвязывает луч от мыши и крутит его само.',
    cursor: 'crosshair',
    tools: [
      { type: 'toggle', key: 'auto', label: 'авто-вращение', value: false },
    ],
    setup() { radarSetup(); },
    step() { radarStep(); },
    draw() { radarDraw(); },
  },
  plumb: {
    label: 'отвес',
    note: 'У строчной р, в отличие от соседних гласных, есть хвост под строкой — здесь он лот на верёвке, который нащупывает рельеф, скрытый под курсором. Ведите мышью вдоль строки: груз опускается до дна с небольшой инерцией, а место касания остаётся отметкой на линии — так рельеф постепенно прорисовывается сам, без образца. «Инерция» — насколько груз отстаёт от курсора. «Новый рельеф» прячет новую форму и стирает открытое.',
    cursor: 'crosshair',
    tools: [
      { type: 'range', key: 'inertia', label: 'инерция', min: 0.08, max: 0.6, step: 0.02, value: 0.28 },
      { type: 'button', label: 'новый рельеф', action: plumbNewTerrain },
    ],
    setup() { plumbSetup(); },
    step() { plumbStep(); },
    draw() { plumbDraw(); },
  },
  weight: {
    label: 'противовес',
    note: 'Настоящая буква (не схема — контур снят с глифа Arial) висит на гвозде, вбитом у верхнего края ствола. Без единого грузика она сама зависает наискось: у Р центр масс смещён от точки подвеса не только вниз, но и вбок — это видно, а не декларируется. Кликайте по букве, чтобы прилепить грузик в это место (он держится на ней и поворачивается вместе с ней); клик по уже прилепленному — снимает его. Расставьте до восьми грузиков так, чтобы буква выровнялась и висела ровно — статус загорится красным. «Сбросить» снимает всё.',
    cursor: 'crosshair',
    tools: [
      { type: 'button', label: 'сбросить', action() { modeState.weights = []; } },
    ],
    setup() { weightSetup(); },
    step() { weightStep(); },
    draw() { weightDraw(); },
    onDown() {
      const local = weightLocalFromWorld(pointer.x, pointer.y);
      const hit = modeState.weights.findIndex((w) => Math.hypot(w.x - local.x, w.y - local.y) < WEIGHT_HIT);
      if (hit >= 0) { modeState.weights.splice(hit, 1); return; }
      if (modeState.weights.length >= WEIGHT_MAX) return;
      if (pointInPoly(R_OUTER, local.x, local.y) && !pointInPoly(R_HOLE, local.x, local.y)) {
        modeState.weights.push(local);
      }
    },
  },
  fill: {
    label: 'ёмкость петли',
    note: 'Просвет внутри петли — настоящая замкнутая область, снятая с контура буквы, не нарисованная труба. Зажмите кнопку мыши — жидкость льётся и стоит по форме именно этого просвета: где буква шире, там уровень наполняется медленнее, где уже — быстрее. Долейте до пунктирной цели; при заполнении статус загорается красным. «Слить» обнуляет ёмкость.',
    cursor: 'pointer',
    tools: [
      { type: 'button', label: 'слить', action() { modeState.volume = 0; modeState.filled = false; } },
    ],
    setup() { fillSetup(); },
    step() { fillStep(); },
    draw() { fillDraw(); },
  },
  marble: {
    label: 'шарик в петле',
    note: 'Шарик заперт внутри настоящего просвета петли и отталкивается от её подлинного края, а не от нарисованной стенки. Курсор задаёт направление наклона — как если бы всю сцену наклоняли в сторону, куда он смещён от центра. Докатите шарик до красной цели, она перескочит в новую точку внутри петли — тридцать секунд на очки. R или переключение режима начинают заново.',
    cursor: 'crosshair',
    tools: [],
    setup() { marbleSetup(); },
    step() { marbleStep(); },
    draw() { marbleDraw(); },
  },
  spring: {
    label: 'пружина',
    note: 'Хвост спирали закреплён в одной и той же точке — как настоящая пружина, у которой снаружи закреплён конец. Схватите спираль мышью рядом с центром и покрутите: витков становится больше или меньше, но габарит не меняется. Отпустите — пружина сама раскручивается обратно, пружиня и подрагивая. Без цели, просто физика.',
    cursor: 'grab',
    tools: [],
    setup() { springSetup(); },
    step() { springStep(); },
    draw() { springDraw(); },
    onDown() {
      const d = Math.hypot(pointer.x - SPRING_CENTER.x, pointer.y - SPRING_CENTER.y);
      if (d < SPRING_MAX_R * 1.6 && d > 0.01) {
        modeState.dragging = true;
        modeState.dragAngle = springAngleAt(pointer.x, pointer.y);
      }
    },
    onUp() { modeState.dragging = false; },
  },
  bell: {
    label: 'звонок',
    note: 'Ствол — не жёсткий, а гнущийся хлыст. Оттяните верхушку в сторону мышью и отпустите: она пружинит назад, проскакивает через состояние покоя и на всём ходу бьёт по шарику — тот вздрагивает, пускает кольца и звенит (нужен звук в браузере). Чем сильнее оттянуть, тем звонче удар.',
    cursor: 'grab',
    tools: [],
    setup() { bellSetup(); },
    step() { bellStep(); },
    draw() { bellDraw(); },
    onDown() {
      const tipX = BELL_BASE_X + modeState.bendX;
      if (Math.hypot(pointer.x - tipX, pointer.y - BELL_TOP_Y) < 0.09) modeState.dragging = true;
    },
    onUp() { modeState.dragging = false; },
  },
  flag: {
    label: 'флаг-старт',
    note: 'Флаг стоит поднятым случайное время, потом падает без предупреждения. Ваше дело — среагировать кликом ровно после падения, не раньше. Клик до падения — фальстарт («рано!»), раунд сгорает и начинается заново. Успешная реакция меряется в миллисекундах, лучшее время держится, пока открыт этот режим.',
    cursor: 'crosshair',
    tools: [],
    setup() { flagSetup(); },
    step() { flagStep(); },
    draw() { flagDraw(); },
    onDown() {
      if (modeState.state === 'waiting') {
        modeState.resultText = 'рано!';
        modeState.state = 'result';
        modeState.resultAt = modeState.elapsed;
        return;
      }
      if (modeState.state === 'dropped') {
        const reaction = modeState.elapsed - modeState.dropAt;
        if (modeState.best === null || reaction < modeState.best) modeState.best = reaction;
        modeState.resultText = `${Math.round(reaction * 1000)} мс`;
        modeState.state = 'result';
        modeState.resultAt = modeState.elapsed;
      }
    },
  },
  sail: {
    label: 'парус',
    note: 'Лодка идёт вправо к бую только пока парус ловит ветер — направление ветра дрейфует само, зажмите мышь и наведите парус под выгодным углом, прямо против ветра скорости не будет вовсе. Порыв (стрелка ветра краснеет) при полностью раскрытом парусе — риск оверкиля: держите «риф», чтобы пережить порыв ценой скорости. Тридцать секунд, сорок — на весь заезд.',
    cursor: 'crosshair',
    tools: [
      { type: 'toggle', key: 'reef', label: 'риф', value: false },
    ],
    setup() { sailSetup(); },
    step() { sailStep(); },
    draw() { sailDraw(); },
  },
};

startLab({
  title: 'Р · десять механик',
  modes: MODES,
  start: 'spring',
});
