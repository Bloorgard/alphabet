/* Исследование и критерии сравнения: u-research.md. */

function uText(text, x, y, size = 0.018, color = MUTED) {
  ctx.fillStyle = color;
  ctx.font = `${Math.max(10, S * size)}px 'DM Mono', monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(text, x * S, y * S);
}

function uPath(points, color = INK, width = 0.003) {
  ctx.beginPath();
  points.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x * S, p.y * S));
  ctx.strokeStyle = color;
  ctx.lineWidth = width * S;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function uRing(p, radius = 0.016, color = INK) {
  dot(p.x, p.y, color, radius);
  dot(p.x, p.y, PAPER, radius * 0.7);
}

function uCurve(a, b, c, d, count = 48) {
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count, q = 1 - t;
    return {
      x: q ** 3 * a.x + 3 * q * q * t * b.x + 3 * q * t * t * c.x + t ** 3 * d.x,
      y: q ** 3 * a.y + 3 * q * q * t * b.y + 3 * q * t * t * c.y + t ** 3 * d.y,
    };
  });
}

function uLength(points) {
  return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
}

function uAlong(points, distance) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (distance <= length) {
      const t = length ? clamp(distance / length, 0, 1) : 0;
      return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
    }
    distance -= length;
  }
  return points[points.length - 1];
}

const U_LEFT = { x: 0.2, y: 0.2 };
const U_RIGHT = { x: 0.8, y: 0.2 };
const U_OFFSETS = [0, 0.16, -0.2, 0.27, -0.12, 0.21, -0.26, 0.08, -0.18, 0.25, -0.08, 0.18];

function uJunction() {
  const x = modeState.jx;
  return { x, y: 0.2 + (0.8 - x) * 1.28 };
}

function uSyncStart() {
  Object.assign(modeState, { jx: 0.53, time: -0.8, round: 0, score: 0, results: [], arrival: [null, null], output: null, flash: 0, started: false });
}

function uSyncMove() {
  modeState.jx = clamp(pointer.x, 0.37, 0.68);
}

function uSyncStep() {
  const m = modeState;
  m.flash = Math.max(0, m.flash - STEP);
  if (!m.started || m.round >= 12) return;
  m.time += STEP;
  const j = uJunction();
  const speed = num('speed');
  const offset = U_OFFSETS[m.round];
  const starts = [Math.max(0, -offset), Math.max(0, offset)];
  [U_LEFT, U_RIGHT].forEach((p, side) => {
    const travel = (m.time - starts[side]) * speed;
    if (m.arrival[side] === null && travel >= Math.hypot(j.x - p.x, j.y - p.y)) m.arrival[side] = m.time;
  });
  if (!m.output && m.arrival.every(t => t !== null)) {
    const error = Math.abs(m.arrival[0] - m.arrival[1]);
    const hit = error <= num('window') / 1000;
    m.results.push({ hit, error });
    if (hit) { m.score++; m.flash = 0.4; }
    m.output = { from: { ...j }, distance: 0, hit };
  }
  if (m.output) {
    m.output.distance += speed * STEP;
    if (m.output.distance > 0.62) {
      m.round++;
      m.time = -0.65;
      m.arrival = [null, null];
      m.output = null;
    }
  }
}

function uSyncDraw() {
  const m = modeState, j = uJunction(), end = { x: 0.3, y: 0.84 };
  uText('У / ДВА ВХОДА — ОДИН ВЫХОД', 0.055, 0.12);
  uPath([U_RIGHT, end], INK, 0.019);
  uPath([U_LEFT, j], INK, 0.019);
  uPath([{ x: 0.37, y: j.y }, { x: 0.68, y: j.y }], FAINT, 0.002);
  uRing(j, 0.033, m.flash ? RED : INK);
  uRing(U_LEFT, 0.021);
  uRing(U_RIGHT, 0.021);
  uText('А', 0.18, 0.155);
  uText('Б', 0.78, 0.155);
  if (m.started && m.round < 12) {
    const offset = U_OFFSETS[m.round];
    [U_LEFT, U_RIGHT].forEach((p, side) => {
      const start = side ? Math.max(0, offset) : Math.max(0, -offset);
      if (m.time < start) return;
      const q = uAlong([p, j], (m.time - start) * num('speed'));
      dot(q.x, q.y, PAPER, 0.021);
      dot(q.x, q.y, INK, 0.013);
    });
  }
  if (m.output) {
    const q = uAlong([m.output.from, end], m.output.distance);
    dot(q.x, q.y, PAPER, 0.023);
    if (m.output.hit) dot(q.x, q.y, RED, 0.016);
    else uRing(q, 0.014, MUTED);
  }
  for (let i = 0; i < 12; i++) {
    const x = 0.22 + i * 0.05, result = m.results[i];
    line(x, 0.91, x, result?.hit ? 0.87 : 0.895, result ? (result.hit ? INK : MUTED) : FAINT, 0.012);
  }
  drawStatus(`${m.score} / 12`);
  const last = m.results.at(-1);
  if (last) uText(`расхождение ${Math.round(last.error * 1000)} мс`, 0.055, 0.8);
  uText(m.round >= 12 ? 'Серия завершена · нажмите «заново»' : m.started ? 'Ведите узел влево / вправо' : 'Нажмите «начать» или коснитесь сцены', 0.055, 0.965);
}

function uArtStart() {
  Object.assign(modeState, { pos: { x: 0.5, y: 0.42 }, marks: [], last: null, drawing: false, demo: false, time: 0, stroke: 0, history: [], head: 0 });
}

function uArtDown() {
  modeState.demo = false;
  modeState.drawing = true;
  modeState.stroke++;
  modeState.last = null;
  uArtMove();
}

function uArtMove() {
  if (!modeState.drawing) return;
  modeState.pos = { x: clamp(pointer.x, 0.16, 0.84), y: clamp(pointer.y, 0.22, 0.72) };
}

function uArtUp() {
  modeState.drawing = false;
  modeState.last = null;
}

function uArtClock() {
  const m = modeState;
  m.time += STEP;
  if (m.demo) {
    const t = m.time - m.demoStarted;
    m.pos = { x: 0.5 + 0.22 * Math.sin(t * 0.72), y: 0.44 + 0.17 * Math.sin(t * 1.37) };
  }
}

function uDemo() {
  const m = modeState;
  m.demo = !m.demo;
  m.demoStarted = m.time;
  m.drawing = false;
  m.stroke++;
  m.last = null;
}

function uMark(a, b, alpha, width = 0.0014) {
  if (Math.hypot(a.x - b.x, a.y - b.y) < 0.00005) return;
  const marks = modeState.marks;
  marks.push({ a: { ...a }, b: { ...b }, alpha, width });
  if (marks.length > 18000) marks.splice(0, 1000);
}

function uDrawMarks() {
  for (const mark of modeState.marks) uPath([mark.a, mark.b], ink(mark.alpha), mark.width);
}

function uField(x, y) {
  return Math.sin(x * 16 + Math.sin(y * 9) * 1.8) * 0.6 + Math.sin(y * 21 - x * 6) * 0.4;
}

function uPenShape() {
  const p = modeState.pos, angle = num('angle') * Math.PI / 180;
  const span = num('span');
  const transform = (x, y) => ({ x: p.x + x * Math.cos(angle) - y * Math.sin(angle), y: p.y + x * Math.sin(angle) + y * Math.cos(angle) });
  const a = transform(-span, -0.14), b = transform(span, -0.14);
  const delta = (uField(a.x, a.y) - uField(b.x, b.y)) * num('gain');
  const tip = transform(-0.075 + delta * 0.055, 0.2);
  return { a, b, tip, delta, j: p, transform };
}

function uPenStep() {
  uArtClock();
  const m = modeState, shape = uPenShape();
  if (!m.drawing && !m.demo) { m.last = null; return; }
  const tips = Array.from({ length: 9 }, (_, i) => shape.transform(-0.075 + shape.delta * 0.055 + (i - 4) * 0.003 * (1 + Math.abs(shape.delta)), 0.2));
  if (m.last) tips.forEach((p, i) => uMark(m.last[i], p, 0.22 + 0.05 * (4 - Math.abs(i - 4))));
  m.last = tips;
}

function uPenDraw() {
  if (on('field')) {
    for (let y = 0.18; y < 0.89; y += 0.025) {
      for (let x = 0.08; x < 0.93; x += 0.025) dot(x, y, ink(0.025 + (uField(x, y) + 1) * 0.05), 0.0025);
    }
  }
  uDrawMarks();
  const m = modeState, q = uPenShape();
  if (on('guide')) {
    uPath([q.a, q.j, q.b], ink(0.65), 0.006);
    uPath([q.j, q.tip], INK, 0.009);
    [q.a, q.b].forEach(p => {
      uRing(p, 0.014);
      dot(p.x, p.y, INK, 0.003 + (uField(p.x, p.y) + 1) * 0.003);
    });
    uRing(q.j, 0.017);
  }
  if (m.drawing || m.demo) dot(q.tip.x, q.tip.y, RED, 0.008);
  uText('у / ПИШЕТ РАЗНОСТЬ ДВУХ ПЛЕЧ', 0.055, 0.12);
  drawStatus(m.demo ? 'образец' : 'рисовалка');
  uText('Зажмите и ведите · хвост оставляет штрих', 0.055, 0.955);
}

function uLoopShape(pos = modeState.pos) {
  const x = pos.x, y = pos.y, r = num('loop');
  const a = { x: x - 0.11, y: y - 0.13 }, b = { x: x + 0.1, y: y - 0.13 };
  const cup = uCurve(a, { x: x - 0.19, y: y + 0.12 }, { x: x + 0.04, y: y + 0.13 }, b);
  const bottom = { x: x - 0.07, y: y + r };
  const down = uCurve(b, { x: x + 0.05, y: y + 0.03 }, { x: x + 0.02, y: y + r + 0.08 }, bottom);
  const end = { x: x + 0.17, y: y + 0.025 };
  const back = uCurve(bottom, { x: x - 0.24, y: y + r + 0.02 }, { x: x - 0.06, y: y + 0.1 }, end);
  return { cup, loop: [...down, ...back.slice(1)], bottom, end };
}

function uEchoStep() {
  uArtClock();
  const m = modeState;
  const delay = uLength(uLoopShape().loop) / 0.55;
  const active = m.drawing || m.demo;
  const sample = { t: m.time, p: { ...m.pos }, active, stroke: m.stroke };
  m.history.push(sample);
  const target = m.time - delay;
  while (m.head + 1 < m.history.length && m.history[m.head + 1].t <= target) m.head++;
  const past = m.history[m.head];
  const echo = past.t <= target ? past : null;
  const p = uLoopShape().end;
  if (echo) {
    p.x += (echo.p.x - m.pos.x) * num('memory');
    p.y += (echo.p.y - m.pos.y) * num('memory');
  }
  if (echo?.active) {
    if (m.last && m.last.stroke === echo.stroke) {
      for (let i = 0; i < 6; i++) {
        const spread = (i - 2.5) * 0.002;
        uMark({ x: m.last.p.x + spread, y: m.last.p.y }, { x: p.x + spread, y: p.y }, 0.32, 0.0015);
      }
    }
    m.last = { p, stroke: echo.stroke };
  } else m.last = null;
  m.echo = echo;
  m.tip = p;
  m.delay = delay;
  if (m.head > 600) { m.history.splice(0, m.head); m.head = 0; }
}

function uEchoDraw() {
  const m = modeState;
  uDrawMarks();
  const q = uLoopShape();
  if (on('guide')) {
    uPath(q.cup, INK, 0.007);
    uPath(q.loop, ink(0.6), 0.004);
    if (m.tip) uPath([q.end, m.tip], FAINT, 0.002);
    uRing(q.cup[0]);
    if (m.drawing || m.demo || m.echo?.active) {
      const bead = uAlong(q.loop, (m.time * 0.55) % uLength(q.loop));
      dot(bead.x, bead.y, RED, 0.008);
    }
    uText(`${(m.delay || uLength(q.loop) / 0.55).toFixed(1)} с`, q.bottom.x + 0.04, q.bottom.y);
  }
  if (m.echo?.active && m.tip) dot(m.tip.x, m.tip.y, RED, 0.007);
  uText('у / ХВОСТ ВОЗВРАЩАЕТ ПРОШЛОЕ', 0.055, 0.12);
  drawStatus(m.demo ? 'образец' : m.echo?.active ? 'возврат' : 'рисовалка');
  uText('Нарисуйте жест · отпустите и дождитесь эха', 0.055, 0.955);
}

const U_ART_TOOLS = [
  { type: 'toggle', key: 'guide', label: 'буква', value: true },
  { type: 'button', label: 'образец / стоп', action: uDemo },
  { type: 'button', label: 'очистить', action() { setMode(current); } },
];

const U_FABRIC_SHADER = `
precision highp float;
uniform vec2 resolution;
uniform float weave;
uniform float folds;
uniform float motif;
uniform float inverse;
uniform vec4 pulls[8];
varying vec2 uv;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
vec2 material(vec2 p) {
  for(int i=0;i<8;i++) {
    vec2 d=p-pulls[i].xy;
    float falloff=exp(-dot(d,d)/0.025);
    p-=pulls[i].zw*falloff;
  }
  vec2 q=p;
  q.x+=folds*(0.046*sin(p.y*8.0+p.x*3.0)+0.025*sin(p.y*17.0-2.0));
  q.y+=folds*(0.032*sin(p.x*9.0-0.7)+0.018*sin(p.x*19.0+p.y*5.0));
  vec2 d=q-vec2(0.49,0.48);
  float r=length(d);
  float a=folds*0.62*exp(-r*r*4.0);
  q=vec2(cos(a)*d.x-sin(a)*d.y,sin(a)*d.x+cos(a)*d.y)+vec2(0.5);
  return q;
}
void main() {
  vec2 p=vec2(uv.x,1.0-uv.y);
  vec2 q=material(p);
  vec2 cell=q*vec2(weave,weave*0.84);
  vec2 id=floor(cell);
  vec2 f=fract(cell);
  float jitter=(hash(id)-0.5)*0.1;
  vec2 stripe=q;
  stripe.x+=0.12*sin(q.y*5.0-0.7)+0.022*sin(q.y*21.0);
  float ax=stripe.x*motif;
  float ay=(stripe.y+0.05*sin(q.x*11.0))*motif*0.82;
  float blocks=mod(floor(ax)+floor(ay),2.0);
  float fine=step(0.54,fract(ax*4.0));
  float pattern=mix(blocks,fine,smoothstep(0.18,0.5,abs(sin(ay*0.61))));
  float crossing=mod(id.x+id.y,2.0);
  float warp=exp(-pow((f.x-0.5+jitter)*2.7,4.0));
  float weft=exp(-pow((f.y-0.5-jitter)*2.7,4.0));
  float warpShade=0.5+0.5*sin(f.x*3.14159);
  float weftShade=0.5+0.5*sin(f.y*3.14159);
  float fiber=0.9+0.1*sin(f.x*45.0+hash(id)*7.0);
  float yarn=mix(weft*weftShade,warp*warpShade,crossing)*fiber;
  float under=mix(warp,weft,crossing)*0.34;
  float thread=max(yarn,under);
  float light=mix(0.065,0.88,pattern);
  light=mix(light,0.55,step(0.965,hash(vec2(id.x,0.0)))*0.28);
  float foldShade=0.81+0.15*cos(q.x*26.0+sin(q.y*7.0)*3.0)+0.04*sin(q.y*58.0+q.x*12.0);
  float value=0.021+thread*light*foldShade;
  float fleck=hash(floor(p*resolution));
  value+=(fleck-0.5)*0.035;
  value=mix(value,1.0-value,inverse);
  vec3 dark=vec3(0.022,0.028,0.03);
  vec3 cream=vec3(0.94,0.923,0.878);
  gl_FragColor=vec4(mix(dark,cream,clamp(value,0.0,1.0)),1.0);
}`;

let uFabricRenderer = null;

function uFabricSetup() {
  const surface = uFabricRenderer?.surface || document.createElement('canvas');
  const gl = uFabricRenderer?.gl || surface.getContext('webgl', { antialias: false, preserveDrawingBuffer: true });
  Object.assign(modeState, { surface, gl, pulls: Array.from({ length: 8 }, () => [0, 0, 0, 0]), next: 0, grab: null, dirty: true });
  if (!gl) return;
  if (uFabricRenderer) { modeState.uniforms = uFabricRenderer.uniforms; return; }
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, 'attribute vec2 position; varying vec2 uv; void main(){uv=position*0.5+0.5;gl_Position=vec4(position,0.,1.);}'],
    [gl.FRAGMENT_SHADER, U_FABRIC_SHADER],
  ]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const attr = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(attr);
  gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);
  modeState.uniforms = Object.fromEntries(['resolution','weave','folds','motif','inverse','pulls'].map(name => [name, gl.getUniformLocation(program, name === 'pulls' ? 'pulls[0]' : name)]));
  uFabricRenderer = { surface, gl, uniforms: modeState.uniforms };
}

function uFabricDraw() {
  const m = modeState;
  if (!m.gl) { uText('Для ткани нужен WebGL', 0.15, 0.5); return; }
  const size = Math.min(1600, Math.round(S * dpr));
  if (m.surface.width !== size) { m.surface.width = m.surface.height = size; m.dirty = true; }
  if (m.dirty || m.ground !== ground) {
    const gl = m.gl, u = m.uniforms;
    gl.viewport(0, 0, size, size);
    gl.uniform2f(u.resolution, size, size);
    gl.uniform1f(u.weave, num('threads'));
    gl.uniform1f(u.folds, num('folds'));
    gl.uniform1f(u.motif, num('motif'));
    gl.uniform1f(u.inverse, ground === 'ink' ? 1 : 0);
    gl.uniform4fv(u.pulls, new Float32Array(m.pulls.flat()));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    m.dirty = false;
    m.ground = ground;
  }
  ctx.drawImage(m.surface, 0, 0, S, S);
}

function uFabricDown() {
  const m = modeState;
  m.grab = { x: pointer.x, y: pointer.y, slot: m.next++ % 8 };
  m.pulls[m.grab.slot] = [pointer.x, pointer.y, 0, 0];
  m.dirty = true;
}

function uFabricMove() {
  const m = modeState;
  if (!pointer.down || !m.grab) return;
  const g = m.grab;
  m.pulls[g.slot] = [g.x, g.y, clamp(pointer.x - g.x, -0.25, 0.25), clamp(pointer.y - g.y, -0.25, 0.25)];
  m.dirty = true;
}

const MODES = {
  fabric: {
    label: 'ткань',
    note: 'Захватите ткань и потяните: рисунок и переплетение сдвигаются вместе. Складки остаются после отпускания; хранятся восемь последних захватов. «Нити» меняют плотность плетения, «рисунок» — масштаб орнамента, «складки» — исходную деформацию. Кнопка «фон» инвертирует ткань.',
    tools: [
      { type: 'range', key: 'threads', label: 'нити', min: 100, max: 360, step: 10, value: 240 },
      { type: 'range', key: 'motif', label: 'рисунок', min: 4, max: 18, step: 1, value: 9 },
      { type: 'range', key: 'folds', label: 'складки', min: 0, max: 2, step: 0.05, value: 1.15 },
      { type: 'button', label: 'расправить', action() { modeState.pulls.forEach(p => p.fill(0)); modeState.dirty = true; } },
    ],
    cursor: 'grab', setup: uFabricSetup, draw: uFabricDraw,
    onDown: uFabricDown, onMove: uFabricMove,
    onUp() { modeState.grab = null; },
    onTool() { modeState.dirty = true; },
  },
  stitch: {
    label: 'сшиватель',
    note: 'Прописная У: две точки входят по плечам, совпавшая пара уходит по общей ноге. Зажмите сцену и двигайте узел влево-вправо: он скользит вдоль правого штриха, меняя длины обоих путей. Красный — момент сшивания. 12 одинаковых для каждой попытки пар; результат только здесь, без зачёта. Попробуйте сначала широкий допуск, затем 80 мс.',
    tools: [
      { type: 'range', key: 'speed', label: 'скорость', min: 0.15, max: 0.4, step: 0.01, value: 0.24 },
      { type: 'range', key: 'window', label: 'допуск, мс', min: 40, max: 200, step: 10, value: 100 },
      { type: 'button', label: 'начать / заново', action() { setMode(current); modeState.started = true; } },
    ],
    cursor: 'ew-resize', setup: uSyncStart, step: uSyncStep, draw: uSyncDraw,
    onDown() { if (modeState.round >= 12) uSyncStart(); modeState.started = true; uSyncMove(); },
    onMove() { if (pointer.down) uSyncMove(); },
    onTool() { uSyncStart(); },
  },
  pen: {
    label: 'двурукое перо',
    note: 'Строчная у — измерительное перо: два верхних конца читают разное значение поля, разность отклоняет нижний хвост и раздвигает его волоски. Зажмите и рисуйте. Раскрытие и поворот меняют расстояние между пробами: тем же жестом получается другая гравюра. «Поле» показывает материал, «буква» скрывает инструмент для чистого снимка. «Образец / стоп» ведёт перо по повторяемой траектории.',
    tools: [
      { type: 'range', key: 'span', label: 'раскрытие', min: 0.04, max: 0.15, step: 0.01, value: 0.1 },
      { type: 'range', key: 'angle', label: 'поворот', min: -60, max: 60, step: 5, value: -15 },
      { type: 'range', key: 'gain', label: 'отклик', min: 0, max: 2, step: 0.1, value: 1 },
      { type: 'toggle', key: 'field', label: 'поле', value: true },
      ...U_ART_TOOLS,
    ],
    cursor: 'crosshair', setup: uArtStart, step: uPenStep, draw: uPenDraw,
    onDown: uArtDown, onMove: uArtMove, onUp: uArtUp,
    onTool() { modeState.last = null; },
  },
  loop: {
    label: 'петля памяти',
    note: 'Рукописная у — перо с памятью. Ведите чашку: жест проходит по нижней петле и позже возвращается к выходу. Большая петля даёт большую задержку. «Память» смешивает прежнее положение с текущим: 0 — координаты сейчас, 1 — координаты тогда; перо касается бумаги, когда жест выходит из петли. После отпускания хвост дописывает накопленный жест. Сравните короткую и длинную петлю на одном «образце».',
    tools: [
      { type: 'range', key: 'loop', label: 'петля', min: 0.1, max: 0.22, step: 0.01, value: 0.17 },
      { type: 'range', key: 'memory', label: 'память', min: 0, max: 1, step: 0.05, value: 0.7 },
      ...U_ART_TOOLS,
    ],
    cursor: 'crosshair', setup: uArtStart, step: uEchoStep, draw: uEchoDraw,
    onDown: uArtDown, onMove: uArtMove, onUp: uArtUp,
    onTool() { modeState.last = null; },
  },
};

canvas.addEventListener('pointercancel', () => {
  pointer.down = false;
  if (current === 'pen' || current === 'loop') uArtUp();
});

startLab({ title: 'У · развилка и память', modes: MODES, start: 'fabric', ground: 'paper' });
