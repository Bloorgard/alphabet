/* А — свет и преграда.
   Полигон восстановлен по готовой букве: А появилась в проекте раньше, чем
   практика начинать с полигона, и своего стенда не имела.

   Буква здесь не нарисована. Источник светит конусом ±30°, и конус даёт две
   наклонные ноги; горизонтальная преграда, перехватывая свет, даёт поперечину.
   А — это то, что осталось от света. */

const HALF_ANGLE = (30 * Math.PI) / 180;

/* Пиксельные величины буквы заданы для кадра 720; здесь они считаются от
   стороны сцены, чтобы полигон можно было мерить на любом размере. */
const REF = 720;
const px = (value) => (value / REF) * S;

const BAR_THICKNESS = 10;
const LIGHT_RADIUS = 7;
const HIT_LIGHT = 20;
const HIT_END = 18;
const HIT_BAR = 14;

// Тень набирается из нескольких смещённых копий — так у неё появляется полутень.
const SHADOW_SAMPLES = 12;
const SAMPLE_ALPHA = 0.35;
// Свет от преграды уходит вниз, а не кругом, поэтому ореол сжат по горизонтали.
const SCATTER_SQUEEZE = 0.55;
// Неосвещённая преграда не пропадает совсем — иначе её не найти курсором.
const BAR_DIM = 0.14;

function buildRays() {
  const count = num('rays');
  modeState.rays = [];
  for (let i = 0; i < count; i += 1) {
    const angle = Math.PI / 2 - HALF_ANGLE + (i / (count - 1)) * 2 * HALF_ANGLE;
    modeState.rays.push({ x: Math.cos(angle), y: Math.sin(angle) });
  }
}

function edges(bar) {
  return [Math.min(bar.x1, bar.x2), Math.max(bar.x1, bar.x2)];
}

function drawRays() {
  const { light } = modeState;
  const lx = light.x * S;
  const ly = light.y * S;
  const maxLen = Math.hypot(S, S) * 1.2;
  const reach = S * num('reach');

  const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, reach);
  glow.addColorStop(0, ink(0.95));
  glow.addColorStop(0.35, ink(0.55));
  glow.addColorStop(0.7, ink(0.2));
  glow.addColorStop(1, ink(0));

  ctx.strokeStyle = glow;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const d of modeState.rays) {
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + d.x * maxLen, ly + d.y * maxLen);
  }
  ctx.stroke();
}

/* Тень вычитается из уже нарисованного света: слабеет вниз и размывается по
   краям. Режим destination-out смотрит на альфу, цвет здесь не участвует. */
function drawShadow(bar) {
  const { light } = modeState;
  if (light.y >= bar.y) return;

  const [left, right] = edges(bar);
  const len = S * num('fade');
  const barY = bar.y * S;

  const fade = ctx.createLinearGradient(0, barY, 0, barY + len);
  fade.addColorStop(0, `rgba(0,0,0,${SAMPLE_ALPHA})`);
  fade.addColorStop(0.35, `rgba(0,0,0,${SAMPLE_ALPHA * 0.78})`);
  fade.addColorStop(0.7, `rgba(0,0,0,${SAMPLE_ALPHA * 0.32})`);
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fade;

  const l = left * S;
  const r = right * S;
  const t = len / (barY - light.y * S);
  for (let s = 0; s < SHADOW_SAMPLES; s += 1) {
    const sx = light.x * S + px(num('soft')) * (s / (SHADOW_SAMPLES - 1) - 0.5);
    ctx.beginPath();
    ctx.moveTo(l, barY);
    ctx.lineTo(r, barY);
    ctx.lineTo(r + (r - sx) * t, barY + len);
    ctx.lineTo(l + (l - sx) * t, barY + len);
    ctx.closePath();
    ctx.fill();
  }
}

// Та же кривая затухания, что у лучей, — чтобы отражение совпадало с видимым светом.
function lightFalloff(dist) {
  const t = dist / num('reach');
  if (t >= 1) return 0;
  if (t < 0.35) return 0.95 + (0.55 - 0.95) * (t / 0.35);
  if (t < 0.7) return 0.55 + (0.2 - 0.55) * ((t - 0.35) / 0.35);
  return 0.2 * (1 - (t - 0.7) / 0.3);
}

// Сколько света реально доходит до точки: вне конуса и за чужой тенью — ноль.
function lightAt(x, y, self) {
  const { light } = modeState;
  const dx = x - light.x;
  const dy = y - light.y;
  if (dy <= 0) return 0;
  if (Math.abs(Math.atan2(dx, dy)) > HALF_ANGLE) return 0;
  for (const bar of modeState.bars) {
    if (bar === self || bar.y <= light.y || bar.y >= y) continue;
    const t = (bar.y - light.y) / dy;
    const ix = light.x + dx * t;
    const [l, r] = edges(bar);
    if (ix >= l && ix <= r) return 0;
  }
  return lightFalloff(Math.hypot(dx, dy));
}

// Освещённая часть преграды отражает свет вниз и подсвечивает тень.
function drawScatter(bar) {
  const { light } = modeState;
  const radius = px(num('scatter'));
  if (light.y >= bar.y || radius <= 0) return;

  const [left, right] = edges(bar);
  const barY = bar.y * S;
  const width = (right - left) * S;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const spread = radius * SCATTER_SQUEEZE;
  const steps = Math.max(1, Math.round(width / (spread / 2)));
  for (let i = 0; i <= steps; i += 1) {
    const at = left + ((right - left) * i) / steps;
    const alpha = 0.5 * lightAt(at, bar.y, bar);
    if (alpha <= 0.001) continue;
    ctx.save();
    ctx.translate(at * S, barY + radius * 0.3);
    ctx.scale(SCATTER_SQUEEZE, 1);
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    halo.addColorStop(0, ink(alpha));
    halo.addColorStop(0.5, ink(alpha * 0.3));
    halo.addColorStop(1, ink(0));
    ctx.fillStyle = halo;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.restore();
  }
  ctx.restore();
}

// Преграда светлеет там, где на неё падает свет, но остаётся различимой в темноте.
function drawBar(bar) {
  const [left, right] = edges(bar);
  const barY = bar.y * S;
  const stops = Math.min(48, Math.max(2, Math.round(((right - left) * S) / 8)));

  const shading = ctx.createLinearGradient(left * S, 0, right * S, 0);
  for (let i = 0; i <= stops; i += 1) {
    const t = i / stops;
    const lit = lightAt(left + (right - left) * t, bar.y, bar);
    shading.addColorStop(t, ink(BAR_DIM + (1 - BAR_DIM) * lit));
  }

  ctx.strokeStyle = shading;
  ctx.lineWidth = px(BAR_THICKNESS);
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(bar.x1 * S, barY);
  ctx.lineTo(bar.x2 * S, barY);
  ctx.stroke();
}

function hitTest(x, y) {
  const { light, bars } = modeState;
  const reach = (value) => value / REF;
  if (Math.hypot(x - light.x, y - light.y) <= reach(HIT_LIGHT)) return { target: 'light' };
  for (let i = bars.length - 1; i >= 0; i -= 1) {
    const bar = bars[i];
    if (Math.hypot(x - bar.x1, y - bar.y) <= reach(HIT_END)) return { target: 'end1', index: i };
    if (Math.hypot(x - bar.x2, y - bar.y) <= reach(HIT_END)) return { target: 'end2', index: i };
    const [left, right] = edges(bar);
    if (x >= left && x <= right && Math.abs(y - bar.y) <= reach(HIT_BAR)) return { target: 'bar', index: i };
  }
  return null;
}

function cursorFor(hit) {
  if (!hit) return 'default';
  if (hit.target === 'end1' || hit.target === 'end2') return 'ew-resize';
  return 'grab';
}

const MODES = {};

MODES.light = {
  label: 'свет',
  note: 'Таскай источник и преграду, тяни за концы. 2× клик — поставить или убрать преграду. Буква не нарисована: конус даёт ноги, преграда — поперечину.',
  tools: [
    { type: 'range', key: 'rays', label: 'лучи', min: 20, max: 400, step: 1, value: 120 },
    { type: 'range', key: 'reach', label: 'дальность света', min: 0.15, max: 1.6, step: 0.01, value: 0.62 },
    { type: 'range', key: 'fade', label: 'длина тени', min: 0.03, max: 2, step: 0.01, value: 0.45 },
    { type: 'range', key: 'soft', label: 'мягкость краёв', min: 0, max: 300, step: 1, value: 40 },
    { type: 'range', key: 'scatter', label: 'рассеяние преграды', min: 0, max: 400, step: 1, value: 150 },
    { type: 'button', label: 'заново', action: () => MODES.light.setup() },
  ],

  setup() {
    modeState.light = { x: 0.5, y: 0.21 };
    modeState.bars = [{ x1: 0.5 - 0.055, x2: 0.5 + 0.055, y: 0.6 }];
    modeState.drag = null;
    buildRays();
  },

  onTool(key) {
    if (key === 'rays') buildRays();
  },

  onDown() {
    const hit = hitTest(pointer.x, pointer.y);
    if (!hit) return;
    const bar = modeState.bars[hit.index];
    modeState.drag = {
      ...hit,
      ox: (hit.target === 'light' ? modeState.light.x : hit.target === 'end2' ? bar.x2 : bar.x1) - pointer.x,
      ox2: bar ? bar.x2 - pointer.x : 0,
      oy: (hit.target === 'light' ? modeState.light.y : bar.y) - pointer.y,
    };
    canvas.style.cursor = hit.target === 'end1' || hit.target === 'end2' ? 'ew-resize' : 'grabbing';
  },

  onMove() {
    const { drag } = modeState;
    if (!drag) {
      canvas.style.cursor = cursorFor(hitTest(pointer.x, pointer.y));
      return;
    }
    if (drag.target === 'light') {
      modeState.light.x = pointer.x + drag.ox;
      modeState.light.y = pointer.y + drag.oy;
      return;
    }
    const bar = modeState.bars[drag.index];
    if (drag.target === 'bar') {
      bar.x1 = pointer.x + drag.ox;
      bar.x2 = pointer.x + drag.ox2;
      bar.y = pointer.y + drag.oy;
    } else if (drag.target === 'end1') {
      bar.x1 = pointer.x + drag.ox;
    } else {
      bar.x2 = pointer.x + drag.ox;
    }
  },

  onUp() {
    modeState.drag = null;
    canvas.style.cursor = cursorFor(hitTest(pointer.x, pointer.y));
  },

  onDouble() {
    const hit = hitTest(pointer.x, pointer.y);
    if (hit && hit.target !== 'light') {
      modeState.bars.splice(hit.index, 1);
      return;
    }
    if (!hit) {
      modeState.bars.push({ x1: pointer.x - 0.055, x2: pointer.x + 0.055, y: pointer.y });
    }
  },

  draw() {
    ctx.globalCompositeOperation = 'source-over';
    drawRays();

    ctx.globalCompositeOperation = 'destination-out';
    for (const bar of modeState.bars) drawShadow(bar);
    ctx.globalCompositeOperation = 'source-over';

    for (const bar of modeState.bars) drawScatter(bar);
    for (const bar of modeState.bars) drawBar(bar);

    dot(modeState.light.x, modeState.light.y, INK, LIGHT_RADIUS / REF);
    drawStatus(`преград ${modeState.bars.length}`, modeState.bars.length !== 1);
  },
};

startLab({
  title: 'А · свет и преграда',
  modes: MODES,
  start: 'light',
  ground: 'ink',
});
