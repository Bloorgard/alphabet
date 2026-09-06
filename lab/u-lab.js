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

function uStructureSetup() {
  const m = modeState;
  Object.assign(m, { points: [], edges: [], faces: [], angle: -0.65, tilt: 0.38, grab: null, auto: false, seed: 517, dirty: true });
  const rnd = () => { m.seed = (m.seed * 1664525 + 1013904223) >>> 0; return m.seed / 4294967296; };
  const edge = (a, b, alpha = 0.14) => m.edges.push({ a, b, alpha });
  const panel = (a, b, c, d, density = 650, alpha = 0.018) => {
    m.faces.push({ corners: [a, b, c, d], alpha });
    for (let i = 0; i < density; i++) {
      const u = rnd(), v = rnd();
      const p = a.map((x, j) => x + (b[j] - x) * u + (d[j] - x) * v);
      m.points.push({ p, alpha: 0.04 + rnd() * 0.24, radius: rnd() < 0.03 ? 1.1 : 0.45 });
    }
    edge(a, b); edge(b, c); edge(c, d); edge(d, a);
  };
  const room = (x, y, z, w, h, depth) => {
    const a = [x,y,z], b = [x+w,y,z], c = [x+w,y+h,z], d = [x,y+h,z];
    const e = [x,y,z+depth], f = [x+w,y,z+depth], g = [x+w,y+h,z+depth], k = [x,y+h,z+depth];
    panel(a,b,c,d,1700,0.033); panel(e,f,g,k,900,0.014);
    panel(a,e,k,d,1100,0.025); panel(b,f,g,c,1100,0.024);
    panel(d,c,g,k,2200,0.085); panel(a,b,f,e,1400,0.055);
    for(let level=1;level<=3;level++) {
      const yy=y+h*level/4;
      for(let slab=0;slab<3;slab++) {
        const xx=x+w*slab/3, zz=z+depth*(slab===1?0.4:0.08);
        panel([xx,yy,zz],[xx+w*0.3,yy,zz],[xx+w*0.3,yy,z+depth*0.92],[xx,yy,z+depth*0.92],450,0.105);
        edge([xx,yy-0.035,zz],[xx+w*0.3,yy-0.035,zz],0.5);
      }
      const xx=x+w*(level%2?0.2:0.72);
      panel([xx,yy,z+0.08],[xx,yy,z+depth*0.65],[xx,yy+h*0.18,z+depth*0.65],[xx,yy+h*0.18,z+0.08],450,0.085);
    }
    for(let i=1;i<8;i++) {
      const xx=x+w*i/8;
      edge([xx,y,z],[xx,y+h,z],0.08);
      edge([xx,y+h,z],[xx,y+h,z+depth],0.06);
    }
    for(let i=1;i<5;i++) {
      const yy=y+h*i/5;
      edge([x,yy,z],[x+w,yy,z],0.07);
    }
  };
  const ring = (x, y, z, radius, vertical = false, alpha = 0.24) => {
    let prev;
    for(let i=0;i<=72;i++) {
      const a=i*Math.PI/36;
      const p=vertical ? [x+radius*Math.cos(a),y+radius*Math.sin(a),z] : [x+radius*Math.cos(a),y,z+radius*Math.sin(a)];
      if(prev)edge(prev,p,alpha);
      prev=p;
    }
  };
  room(-1.45,-0.65,-0.65,1.15,1.5,1.3);
  room(-0.12,-0.85,-0.76,1.4,1.28,1.12);
  room(-0.18,-0.12,0.56,1.05,1.26,0.92);
  for(let i=0;i<18;i++) {
    const y=-0.75+i*0.078, z=-0.5+i*0.078;
    panel([-0.32,y,z],[0.16,y,z],[0.16,y,z+0.078],[-0.32,y,z+0.078],50,0.06);
  }
  for(let i=0;i<14;i++) {
    const y=-0.55+i*0.089, r=0.22+0.13*Math.sin(i*0.28);
    ring(-0.9,y,0,r,false,0.12);
    for(let j=0;j<200;j++) {
      const a=rnd()*Math.PI*2;
      m.points.push({p:[-0.9+r*Math.cos(a),y+rnd()*0.07,r*Math.sin(a)],alpha:0.16,radius:0.5});
    }
  }
  for(let i=0;i<11;i++) ring(0.62,-0.25,-0.7+i*0.084,0.36,true,0.11);
  for(let i=0;i<32;i++) {
    const x=-0.14+i*0.037;
    const arch=[];
    for(let j=0;j<=24;j++) {
      const a=j*Math.PI/24;
      arch.push([x,0.25+0.61*Math.sin(a),0.9+0.36*Math.cos(a)]);
    }
    for(let j=1;j<arch.length;j++)edge(arch[j-1],arch[j],0.12);
  }
  for(let i=0;i<110;i++) {
    const x=-1.45+rnd()*2.72,z=-0.76+rnd()*2.15;
    const bottom=-0.82-rnd()*0.16;
    edge([x,bottom,z],[x,bottom+0.12+rnd()*0.35,z],0.055);
  }
  m.cache=document.createElement('canvas');
}

function uStructureProject(p) {
  const m=modeState, spread=num('separate');
  const y=p[1]+Math.sign(p[1])*spread*0.24;
  const x=p[0]*Math.cos(m.angle)+p[2]*Math.sin(m.angle);
  const z=-p[0]*Math.sin(m.angle)+p[2]*Math.cos(m.angle);
  return { x:0.5+x*0.225, y:0.53-(y*Math.cos(m.tilt)-z*Math.sin(m.tilt))*0.225, depth:z*Math.cos(m.tilt)+y*Math.sin(m.tilt) };
}

function uStructureDraw() {
  const m=modeState;
  if (m.size !== S || m.ground !== ground) m.dirty=true;
  if (!m.dirty) { ctx.drawImage(m.cache,0,0,S,S); return; }
  ctx.fillStyle=INK;ctx.fillRect(0,0,S,S);
  const density=num('opacity'), cut=-1.6+num('section')*0.032;
  const visible=p=>p[0]<=cut;
  const shade=alpha=>paper(alpha*density);
  const faces=m.faces.map(f=>({...f,screen:f.corners.map(uStructureProject)})).sort((a,b)=>a.screen[0].depth-b.screen[0].depth);
  for(const face of faces) {
    const clipped=[];
    for(let i=0;i<4;i++) {
      const a=face.corners[i],b=face.corners[(i+1)%4];
      if(visible(a))clipped.push(a);
      if(visible(a)!==visible(b)) { const t=(cut-a[0])/(b[0]-a[0]);clipped.push(a.map((v,j)=>lerp(v,b[j],t))); }
    }
    if(clipped.length<3)continue;
    ctx.beginPath();clipped.map(uStructureProject).forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x*S,p.y*S));
    ctx.closePath();ctx.fillStyle=shade(face.alpha);ctx.fill();
  }
  for(const e of m.edges) {
    let a=e.a,b=e.b;
    if(!visible(a)&&!visible(b))continue;
    if(visible(a)!==visible(b)) {
      const t=(cut-a[0])/(b[0]-a[0]),p=a.map((v,j)=>lerp(v,b[j],t));
      if(!visible(a))a=p;else b=p;
    }
    const aa=uStructureProject(a),bb=uStructureProject(b);
    ctx.beginPath();ctx.moveTo(aa.x*S,aa.y*S);ctx.lineTo(bb.x*S,bb.y*S);
    ctx.lineWidth=Math.max(0.45,S*0.0008);ctx.strokeStyle=shade(e.alpha);ctx.stroke();
  }
  for(const dot of m.points) {
    if(!visible(dot.p))continue;
    const p=uStructureProject(dot.p);
    ctx.fillStyle=shade(dot.alpha);
    const r=dot.radius*Math.max(0.8,S/800);
    ctx.fillRect(p.x*S,p.y*S,r,r);
  }
  uText('ПРОСВЕЧИВАЮЩАЯ КОНСТРУКЦИЯ',0.055,0.105,0.016,paper(0.45));
  uText('Ведите, чтобы повернуть',0.055,0.93,0.016,paper(0.4));
  const size=Math.round(S*dpr);
  m.cache.width=m.cache.height=size;
  m.cache.getContext('2d').drawImage(canvas,0,0,size,size);
  m.dirty=false;m.size=S;m.ground=ground;
}

function uStructureMove() {
  const m=modeState;
  if(!pointer.down||!m.grab)return;
  m.angle=m.grab.angle+(pointer.x-m.grab.x)*3.5;
  m.tilt=clamp(m.grab.tilt+(pointer.y-m.grab.y)*1.8,-0.8,0.9);
  m.dirty=true;
}

function uVolumeSample() {
  const m=modeState;
  m.paths=[Array.from({length:170},(_,i)=>{
    const t=i/169;
    return [-0.34+0.66*t+0.19*Math.sin(t*8.4),0.31-0.64*t,0.22*Math.cos(t*7.2)];
  })];
  m.sample=true;m.angle=-0.32;m.tilt=0.4;m.dirty=true;
}

function uVolumeSetup() {
  Object.assign(modeState,{paths:[],angle:-0.32,tilt:0.4,grab:null,dirty:true,cache:document.createElement('canvas')});
  uVolumeSample();
}

function uVolumeProject(v) {
  const m=modeState;
  const x=v[0]*Math.cos(m.angle)+v[2]*Math.sin(m.angle);
  const z=-v[0]*Math.sin(m.angle)+v[2]*Math.cos(m.angle);
  const y=v[1]*Math.cos(m.tilt)-z*Math.sin(m.tilt);
  const depth=z*Math.cos(m.tilt)+v[1]*Math.sin(m.tilt);
  const perspective=1/(1.55-depth*0.5);
  return {x:0.5+x*perspective*1.28,y:0.5-y*perspective*1.28,z:depth};
}

function uVolumeMesh(path) {
  const rings=[];
  let distance=0;
  for(let i=0;i<path.length;i++) {
    const p=path[i],a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)];
    if(i)distance+=Math.hypot(...p.map((v,j)=>v-path[i-1][j]));
    const tangent=b.map((v,j)=>v-a[j]);
    const len=Math.hypot(...tangent)||1;
    const t=tangent.map(v=>v/len);
    let n=[-t[1],t[0],0];
    const nl=Math.hypot(...n)||1;n=n.map(v=>v/nl);
    const bin=[t[1]*n[2]-t[2]*n[1],t[2]*n[0]-t[0]*n[2],t[0]*n[1]-t[1]*n[0]];
    const twist=distance*num('twist')*5;
    const normal=n.map((v,j)=>v*Math.cos(twist)+bin[j]*Math.sin(twist));
    const side=n.map((v,j)=>-v*Math.sin(twist)+bin[j]*Math.cos(twist));
    const taper=0.4+0.6*Math.sin(Math.PI*(0.13+0.73*i/Math.max(1,path.length-1)));
    const width=num('width')*taper;
    const profile=[[-1,-.45],[-.82,-.64],[.82,-.64],[1,-.45],[1,.45],[.82,.64],[-.82,.64],[-1,.45]];
    rings.push(profile.map(([u,v])=>uVolumeProject(p.map((value,j)=>value+normal[j]*u*width+side[j]*v*width))));
  }
  return rings;
}

function uVolumeDraw() {
  const m=modeState;
  if(m.size!==S||m.ground!==ground)m.dirty=true;
  if(!m.dirty){ctx.drawImage(m.cache,0,0,S,S);return;}
  ctx.fillStyle=PAPER;ctx.fillRect(0,0,S,S);
  const faces=[];
  for(const path of m.paths) {
    if(path.length<2)continue;
    const rings=uVolumeMesh(path);
    for(let i=1;i<rings.length;i++) {
      for(let j=0;j<8;j++) {
        const k=(j+1)%8;
        const vertices=[rings[i-1][j],rings[i-1][k],rings[i][k],rings[i][j]];
        const z=vertices.reduce((sum,p)=>sum+p.z,0)/4;
        faces.push({vertices,z,j});
      }
    }
    for(const ring of [rings[0],rings.at(-1)])faces.push({vertices:ring,z:ring.reduce((s,p)=>s+p.z,0)/8,j:8});
  }
  faces.sort((a,b)=>a.z-b.z);
  for(const face of faces) {
    const v=face.vertices;
    ctx.beginPath();v.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x*S,p.y*S));ctx.closePath();
    ctx.fillStyle=PAPER;ctx.fill();
    ctx.fillStyle=ink(face.j===8?0.94:0.65+0.28*Math.sin(face.j*1.9)**2);ctx.fill();
    ctx.strokeStyle=ink(0.85);ctx.lineWidth=0.6;ctx.stroke();
    ctx.beginPath();ctx.moveTo(v[0].x*S,v[0].y*S);ctx.lineTo(v[1].x*S,v[1].y*S);
    ctx.strokeStyle=PAPER;ctx.lineWidth=Math.max(0.65,S*0.0014);ctx.stroke();
  }
  uText('ОБЪЁМНЫЙ РОСЧЕРК',0.055,0.105,0.016,MUTED);
  uText(on('turn')?'Ведите, чтобы повернуть':'Нарисуйте свой росчерк',0.055,0.93,0.016,MUTED);
  m.cache.width=m.cache.height=Math.round(S*dpr);
  m.cache.getContext('2d').drawImage(canvas,0,0,m.cache.width,m.cache.height);
  m.dirty=false;m.size=S;m.ground=ground;
}

function uVolumeDown() {
  const m=modeState;
  m.grab={x:pointer.x,y:pointer.y,angle:m.angle,tilt:m.tilt};
  if(on('turn'))return;
  if(m.sample){m.paths=[];m.sample=false;}
  m.angle=0;m.tilt=0;
  m.paths.push([]);
  if(m.paths.length>5)m.paths.shift();
  uVolumeAdd();
}

function uVolumeAdd() {
  const m=modeState,path=m.paths.at(-1);
  const x=(clamp(pointer.x,0.08,0.92)-0.5)*1.21;
  const y=(0.5-clamp(pointer.y,0.15,0.85))*1.21;
  const prev=path.at(-1);
  if(prev&&Math.hypot(x-prev[0],y-prev[1])<0.004)return;
  const steps=prev?Math.min(80,Math.ceil(Math.hypot(x-prev[0],y-prev[1])/0.006)):1;
  for(let i=1;i<=steps;i++) {
    const xx=prev?lerp(prev[0],x,i/steps):x,yy=prev?lerp(prev[1],y,i/steps):y;
    path.push([xx,yy,0.10*Math.sin(path.length*0.035)]);
  }
  if(path.length>400)path.splice(0,path.length-400);
  m.dirty=true;
}

function uVolumeMove() {
  const m=modeState;
  if(!pointer.down||!m.grab)return;
  if(on('turn')) {
    m.angle=m.grab.angle+(pointer.x-m.grab.x)*4;
    m.tilt=clamp(m.grab.tilt+(pointer.y-m.grab.y)*2,-1.1,1.1);m.dirty=true;
  } else uVolumeAdd();
}

const U_ENGRAVE_SHADER = `
precision highp float;
varying vec2 uv;
uniform sampler2D relief;
uniform vec2 resolution;
uniform float rings;
uniform float contrast;
uniform float inverse;
float height(vec2 p) {
  vec2 q=p*5.5;
  q+=vec2(sin(q.y*1.4+cos(q.x)),cos(q.x*1.3-sin(q.y)))*0.52;
  float h=sin(q.x*1.7+q.y*.4)*.4+cos(q.y*1.9-q.x*.65)*.35;
  h+=sin(q.x*3.2-q.y*2.3)*.105+cos(q.y*4.0+q.x*1.9)*.055;
  vec4 t=texture2D(relief,p);
  h+=(t.r*65280.0+t.g*255.0)/65535.0*3.0-1.5;
  return h;
}
void main() {
  vec2 p=vec2(uv.x,1.0-uv.y);
  float h=height(p);
  vec2 e=vec2(1.0/resolution.x,0.0);
  float dx=height(p+e)-h,dy=height(p+e.yx)-h;
  float phase=h*rings;
  float distance=abs(fract(phase)-.5);
  float aa=max(.012,length(vec2(dx,dy))*rings*.7);
  float width=.085+.07*(.5+.5*sin(h*3.0+1.0))*contrast;
  float line=1.0-smoothstep(width-aa,width+aa,distance);
  float shadow=clamp((dx-dy)*resolution.x*.006,-.075,.11);
  float grain=fract(sin(dot(floor(p*resolution),vec2(12.9898,78.233)))*43758.5453);
  float light=clamp(1.0-line*.98-shadow-(grain*.024),0.0,1.0);
  light=mix(light,1.0-light,inverse);
  gl_FragColor=vec4(mix(vec3(.04,.043,.038),vec3(.947,.926,.874),light),1.0);
}`;
let uEngraveRenderer;

function uEngraveSetup() {
  const m=modeState;
  Object.assign(m,{grid:new Float32Array(192*192),pixels:new Uint8Array(192*192*4),dirty:true,upload:true,grab:null});
  if(uEngraveRenderer){Object.assign(m,uEngraveRenderer);return;}
  const surface=document.createElement('canvas');
  const gl=surface.getContext('webgl',{antialias:false,preserveDrawingBuffer:true});
  m.surface=surface;m.gl=gl;
  if(!gl)return;
  const program=gl.createProgram();
  for(const [type,source] of [[gl.VERTEX_SHADER,'attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}'],[gl.FRAGMENT_SHADER,U_ENGRAVE_SHADER]]) {
    const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program,shader);gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const a=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
  gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const uniforms=Object.fromEntries(['relief','resolution','rings','contrast','inverse'].map(k=>[k,gl.getUniformLocation(program,k)]));
  gl.uniform1i(uniforms.relief,0);
  m.uniforms=uniforms;uEngraveRenderer={surface,gl,uniforms};
}

function uEngraveStep() {
  const m=modeState;
  if(on('settle')) {
    let moving=false;
    for(let i=0;i<m.grid.length;i++)if(Math.abs(m.grid[i])>.00001){m.grid[i]*=.9992;moving=true;}
    if(moving)m.upload=m.dirty=true;
  }
  if(!pointer.down||!m.grab)return;
  const x=clamp(pointer.x,0,1),y=clamp(pointer.y,0,1),r=num('brush');
  const samples=Math.max(1,Math.ceil(Math.hypot(x-m.grab.x,y-m.grab.y)/(r*.3)));
  for(let s=1;s<=samples;s++) {
    const cx=lerp(m.grab.x,x,s/samples)*192,cy=lerp(m.grab.y,y,s/samples)*192,rad=r*192;
    for(let yy=Math.max(0,Math.floor(cy-rad*2));yy<Math.min(192,cy+rad*2);yy++) {
      for(let xx=Math.max(0,Math.floor(cx-rad*2));xx<Math.min(192,cx+rad*2);xx++) {
        const d=((xx-cx)**2+(yy-cy)**2)/(rad*rad);
        const i=yy*192+xx;
        m.grid[i]=clamp(m.grid[i]+(on('carve')?-1:1)*.013*Math.exp(-d*2)/samples,-1.4,1.4);
      }
    }
  }
  m.grab={x,y};m.upload=m.dirty=true;
}

function uEngraveDraw() {
  const m=modeState;
  if(!m.gl){uText('Для гравюры нужен WebGL',.1,.5);return;}
  const gl=m.gl,u=m.uniforms,size=Math.min(1600,Math.round(S*dpr));
  if(m.surface.width!==size){m.surface.width=m.surface.height=size;m.dirty=true;}
  if(m.upload) {
    for(let i=0;i<m.grid.length;i++) {
      const v=Math.round((m.grid[i]+1.5)/3*65535);
      m.pixels[i*4]=v>>8;m.pixels[i*4+1]=v&255;m.pixels[i*4+3]=255;
    }
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,192,192,0,gl.RGBA,gl.UNSIGNED_BYTE,m.pixels);m.upload=false;
  }
  if(m.dirty||m.ground!==ground) {
    gl.viewport(0,0,size,size);gl.uniform2f(u.resolution,size,size);
    gl.uniform1f(u.rings,num('rings'));gl.uniform1f(u.contrast,num('contrast'));gl.uniform1f(u.inverse,ground==='ink'?1:0);
    gl.drawArrays(gl.TRIANGLES,0,6);m.dirty=false;m.ground=ground;
  }
  ctx.drawImage(m.surface,0,0,S,S);
}

function uMonolithSetup() {
  const m=modeState;
  Object.assign(m,{blocks:[],angle:-0.62,tilt:0.36,grab:null,dirty:true,cache:document.createElement('canvas')});
  let seed=731;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const split=(p,size,level)=>{
    const eroded=p[0]+p[1]*.22>.01;
    if(level<2||(level<4&&random()<(eroded?.92:.15))) {
      for(let i=0;i<8;i++)split(p.map((v,j)=>v+((i>>j)&1?.25:-.25)*size[j]),size.map(v=>v/2),level+1);
      return;
    }
    const cavity=Math.hypot((p[0]+.035)*1.3,p[1]-.05,p[2]+.14);
    if(cavity<.14)return;
    if(eroded&&level===4&&random()<.28)return;
    const scatter=Math.max(0,p[0]+.1)*1.9;
    m.blocks.push({p,size:size.map(v=>v*(.84+random()*.08)),offset:[0,0,0],drift:[scatter*(.4+random()),-scatter*(.15+random()*.8),scatter*(random()-.5)],tone:random()*.075});
  };
  split([-.09,.035,0],[.59,.75,.45],0);
  for(let i=0;i<450;i++) {
    const x=.05+random()*.44,y=-.36+random()*.38,z=(random()-.5)*.45;
    const size=.0015+random()*.006;
    m.blocks.push({p:[x,y,z],size:[size,size,size],offset:[0,0,0],drift:[random()*.13,-random()*.12,0],tone:random()*.3,dust:true});
  }
}

function uMonolithProject(p) {
  const m=modeState;
  const x=p[0]*Math.cos(m.angle)+p[2]*Math.sin(m.angle);
  const z=-p[0]*Math.sin(m.angle)+p[2]*Math.cos(m.angle);
  const y=p[1]*Math.cos(m.tilt)-z*Math.sin(m.tilt);
  const depth=z*Math.cos(m.tilt)+p[1]*Math.sin(m.tilt);
  const scale=.67/(1-depth*.28);
  return {x:.46+x*scale,y:.46-y*scale,z:depth};
}

function uMonolithPosition(b) {
  return b.p.map((v,j)=>v+b.offset[j]+b.drift[j]*num('erosion'));
}

function uMonolithDraw() {
  const m=modeState;
  if(m.size!==S||m.ground!==ground)m.dirty=true;
  if(!m.dirty){ctx.drawImage(m.cache,0,0,S,S);return;}
  ctx.fillStyle=PAPER;ctx.fillRect(0,0,S,S);
  const faces=[];
  const sides=[[0,2,6,4],[1,5,7,3],[0,4,5,1],[2,3,7,6],[0,1,3,2],[4,6,7,5]];
  for(const b of m.blocks) {
    const p=uMonolithPosition(b),center=uMonolithProject(p);
    b.screen=center;
    const vertices=Array.from({length:8},(_,i)=>uMonolithProject(p.map((v,j)=>v+((i>>j)&1?.5:-.5)*b.size[j])));
    sides.forEach((indices,side)=>{
      const vv=indices.map(i=>vertices[i]);
      const cross=(vv[1].x-vv[0].x)*(vv[2].y-vv[0].y)-(vv[1].y-vv[0].y)*(vv[2].x-vv[0].x);
      if(cross<=0)return;
      faces.push({v:vv,z:vv.reduce((s,v)=>s+v.z,0)/4,side,tone:b.tone,dust:b.dust});
    });
  }
  faces.sort((a,b)=>a.z-b.z);
  for(const f of faces) {
    ctx.beginPath();f.v.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x*S,p.y*S));ctx.closePath();
    ctx.fillStyle=PAPER;ctx.fill();
    const darkness=[.16,.78,.94,.07,.37,.84][f.side]+f.tone;
    ctx.fillStyle=ink(Math.min(1,darkness));ctx.fill();
    if(!f.dust){ctx.strokeStyle=ink(.8);ctx.lineWidth=Math.max(.3,S*.0005);ctx.stroke();}
  }
  uText('ОСЫПАВШИЙСЯ МОНОЛИТ',.055,.105,.016,MUTED);
  uText(on('turn')?'Ведите, чтобы повернуть':'Захватите край и раздвиньте обломки',.055,.93,.016,MUTED);
  m.cache.width=m.cache.height=Math.round(S*dpr);m.cache.getContext('2d').drawImage(canvas,0,0,m.cache.width,m.cache.height);
  m.size=S;m.ground=ground;m.dirty=false;
}

function uMonolithDown() {
  const m=modeState;
  m.grab={x:pointer.x,y:pointer.y,angle:m.angle,tilt:m.tilt};
  if(on('turn'))return;
  m.grab.weights=m.blocks.map(b=>{
    const p=uMonolithProject(uMonolithPosition(b));
    return Math.exp(-((p.x-pointer.x)**2+(p.y-pointer.y)**2)/(num('grip')**2));
  });
}

function uMonolithMove() {
  const m=modeState,g=m.grab;
  if(!pointer.down||!g)return;
  if(on('turn')) {
    m.angle=g.angle+(pointer.x-g.x)*3.5;
    m.tilt=clamp(g.tilt+(pointer.y-g.y)*2,-1,1);
  } else {
    const dx=pointer.x-g.x,dy=pointer.y-g.y;
    m.blocks.forEach((b,i)=>{
      const w=g.weights[i];
      b.offset[0]+=dx*Math.cos(m.angle)*w;
      b.offset[2]+=dx*Math.sin(m.angle)*w;
      b.offset[1]-=dy*w;
    });
    g.x=pointer.x;g.y=pointer.y;
  }
  m.dirty=true;
}

function uExposureSource(t) {
  return {x:.5+.23*Math.sin(t*.63),y:.48+.22*Math.sin(t*.91+.5)};
}

function uExposureSection(p,t) {
  const radius=num('aperture')*(.8+.3*Math.sin(t*1.7));
  const twist=t*num('spin');
  return Array.from({length:53},(_,i)=>{
    const a=-.35+i/52*Math.PI*1.83;
    const x=Math.cos(a)*radius,y=Math.sin(a)*radius;
    const z=y*Math.sin(twist);
    const yy=y*Math.cos(twist);
    const rot=t*.37;
    return {x:p.x+x*Math.cos(rot)-yy*Math.sin(rot),y:p.y+x*Math.sin(rot)+yy*Math.cos(rot)+z*.28};
  });
}

function uExposureSample() {
  const m=modeState;
  Object.assign(m,{time:0,frames:[],demo:true,held:false,tick:0,last:null});
  for(let i=0;i<210;i++) {
    const t=(i-209)/30;
    m.frames.push({born:t,points:uExposureSection(uExposureSource(t),t),stroke:0});
  }
  m.stroke=0;
}

function uExposureSetup() {
  Object.assign(modeState,{stroke:0});uExposureSample();
}

function uExposureStep() {
  const m=modeState;
  if(on('freeze'))return;
  m.time+=STEP;
  const duration=num('exposure');
  while(m.frames.length&&m.frames[0].born<m.time-duration)m.frames.shift();
  if(!m.demo&&!m.held)return;
  m.tick++;
  if(m.tick%2)return;
  const p=m.demo?uExposureSource(m.time):{x:clamp(pointer.x,.08,.92),y:clamp(pointer.y,.13,.87)};
  m.frames.push({born:m.time,points:uExposureSection(p,m.time),stroke:m.stroke});
}

function uExposureDraw() {
  const m=modeState;
  ctx.fillStyle=INK;ctx.fillRect(0,0,S,S);
  const duration=num('exposure');
  for(let i=0;i<m.frames.length;i++) {
    const frame=m.frames[i];
    const strength=Math.max(0,1-(m.time-frame.born)/duration);
    if(strength<=0)continue;
    const alpha=strength*strength;
    uPath(frame.points,paper(.035*alpha),.007);
    uPath(frame.points,paper(.18*alpha),.0011);
    const prev=m.frames[i-1];
    if(prev&&prev.stroke===frame.stroke&&Math.hypot(frame.points[0].x-prev.points[0].x,frame.points[0].y-prev.points[0].y)<.16) {
      for(let j=0;j<53;j+=8)uPath([prev.points[j],frame.points[j]],paper(.15*alpha),.00075);
    }
  }
  const newest=m.frames.at(-1);
  if(newest) {
    const power=Math.max(0,1-(m.time-newest.born)/duration);
    uPath(newest.points,paper(.07*power),.014);
    uPath(newest.points,paper(.22*power),.005);
    uPath(newest.points,paper(.92*power),.0016);
  }
  uText('СВЕТОВАЯ ВЫДЕРЖКА',.055,.105,.016,paper(.45));
  uText(on('freeze')?'Рисунок заморожен':m.demo?'Зажмите и проведите свой свет':'Медленно ведите свет · отпустите',.055,.93,.016,paper(.45));
}

function uExposureDown() {
  if(on('freeze'))return;
  const m=modeState;
  if(m.demo){m.frames=[];m.demo=false;}
  m.held=true;m.stroke++;
}

function uTreeSetup() {
  const m=modeState;
  let seed=Math.floor(Math.random()*4294967296);
  const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const nodes=[];
  const add=(x,y,parent)=>{const p=nodes[parent];nodes.push({x,y,parent,children:[],mass:1,length:p?p.length+Math.hypot(x-p.x,y-p.y):0});if(p)p.children.push(nodes.length-1);return nodes.length-1;};
  let root=add(.55,1.02,-1);
  const trunk=[[.54,.94],[.51,.85],[.515,.77],[.48,.67],[.47,.61]];
  for(const [x,y] of trunk)root=add(x+(rnd()-.5)*.015,y,root);
  let a=root,b=root;
  for(const [x,y] of [[.42,.55],[.36,.49],[.31,.41]])a=add(x,y,a);
  for(const [x,y] of [[.53,.53],[.58,.45],[.62,.36]])b=add(x,y,b);
  let targets=[];
  for(let i=0;i<900;i++) {
    const angle=rnd()*Math.PI*2,r=Math.sqrt(rnd());
    targets.push({x:.49+Math.cos(angle)*r*.4,y:.29+Math.sin(angle)*r*.245});
  }
  for(let round=0;round<95&&targets.length;round++) {
    const sums=new Map(),remaining=[];
    for(const t of targets) {
      let nearest=-1,best=.15*.15;
      for(let i=6;i<nodes.length;i++) {
        const n=nodes[i],d=(n.x-t.x)**2+(n.y-t.y)**2;
        if(d<best){best=d;nearest=i;}
      }
      if(best<.021*.021)continue;
      remaining.push(t);
      if(nearest<0)continue;
      const n=nodes[nearest],d=Math.sqrt(best);
      const sum=sums.get(nearest)||{x:0,y:0};
      sum.x+=(t.x-n.x)/d;sum.y+=(t.y-n.y)/d;sums.set(nearest,sum);
    }
    targets=remaining;
    let added=0;
    for(const [parent,v] of sums) {
      const n=nodes[parent],d=Math.hypot(v.x,v.y);
      if(d<.001)continue;
      const x=n.x+v.x/d*.014,y=n.y+v.y/d*.014;
      if(n.children.some(i=>Math.hypot(nodes[i].x-x,nodes[i].y-y)<.01))continue;
      add(x,y,parent);added++;
    }
    if(!added)break;
  }
  for(let i=nodes.length-1;i>0;i--)nodes[nodes[i].parent].mass+=nodes[i].mass;
  const max=Math.max(...nodes.map(n=>n.length));
  for(const n of nodes)n.width=.0012+Math.pow(n.mass/nodes[0].mass,.62)*.038;
  const tips=nodes.filter(n=>!n.children.length&&n.y<.48);
  const berries=tips.filter(()=>rnd()<.14).map(n=>({node:n,seeds:Array.from({length:5+Math.floor(rnd()*5)},()=>({x:(rnd()-.5)*.019,y:rnd()*.018,r:.0025+rnd()*.0018}))}));
  Object.assign(m,{nodes,max,berries,growth:.22,grab:null});
}

function uTreeStep() {
  if(on('growing')&&!modeState.grab)modeState.growth=Math.min(1,modeState.growth+STEP*.035);
}

function uTreeDraw() {
  const m=modeState,reach=m.growth*m.max;
  ctx.fillStyle=PAPER;ctx.fillRect(0,0,S,S);
  for(let i=1;i<m.nodes.length;i++) {
    const n=m.nodes[i],p=m.nodes[n.parent];
    if(reach<p.length)continue;
    const t=clamp((reach-p.length)/(n.length-p.length),0,1);
    const x=lerp(p.x,n.x,t),y=lerp(p.y,n.y,t);
    const maturity=.35+.65*clamp((reach-p.length)/.3,0,1);
    const w=p.width*maturity,ww=lerp(p.width,n.width,t)*maturity;
    const len=Math.hypot(x-p.x,y-p.y)||1,dx=-(y-p.y)/len,dy=(x-p.x)/len;
    ctx.beginPath();ctx.moveTo((p.x+dx*w/2)*S,(p.y+dy*w/2)*S);
    ctx.lineTo((x+dx*ww/2)*S,(y+dy*ww/2)*S);ctx.lineTo((x-dx*ww/2)*S,(y-dy*ww/2)*S);
    ctx.lineTo((p.x-dx*w/2)*S,(p.y-dy*w/2)*S);ctx.closePath();ctx.fillStyle=INK;ctx.fill();
    dot(p.x,p.y,INK,w*.48);
    if(w>.009)line(p.x+dx*w*.17,p.y+dy*w*.17,x+dx*ww*.17,y+dy*ww*.17,paper(.18),.00065);
  }
  if(on('berries'))for(const bunch of m.berries) {
    const n=bunch.node,ripe=clamp((reach-n.length-.015)/.055,0,1);
    if(ripe<=0)continue;
    for(const seed of bunch.seeds) {
      line(n.x,n.y,n.x+seed.x,n.y+seed.y,ink(.5),.0006);
      dot(n.x+seed.x,n.y+seed.y,RED,seed.r*ripe);
    }
  }
  uText('У / РЯБИНА',.055,.08,.017,MUTED);
  uText(m.growth>=1?'Дерево выросло · можно вырастить другое':'Ведите влево / вправо — время роста',.055,.96,.016,MUTED);
}

const MODES = {
  tree: {
    label: 'рябина',
    note: 'Один плотный ствол и асимметричная развилка образуют У. Дальше ветви заполняют свободное пространство кроны алгоритмом space colonization; толщина зависит от числа потомков. Ягоды появляются после завершения ветвей. Ведите по сцене влево или вправо, чтобы промотать рост. «Расти» включает или останавливает время.',
    tools: [
      { type: 'toggle', key: 'growing', label: 'расти', value: true },
      { type: 'toggle', key: 'berries', label: 'ягоды', value: true },
      { type: 'button', label: 'сначала', action() { modeState.growth=0; } },
      { type: 'button', label: 'взрослое', action() { modeState.growth=1; } },
      { type: 'button', label: 'другое дерево', action: uTreeSetup },
    ],
    cursor: 'ew-resize', setup: uTreeSetup, step: uTreeStep, draw: uTreeDraw,
    onDown() { modeState.grab={x:pointer.x,growth:modeState.growth}; },
    onMove() { const g=modeState.grab;if(pointer.down&&g)modeState.growth=clamp(g.growth+(pointer.x-g.x)*1.5,0,1); },
    onUp() { modeState.grab=null; },
  },
  exposure: {
    label: 'выдержка',
    note: 'Зажмите и ведите светящийся разрез. Его прежние положения остаются в кадре и постепенно гаснут. Медленное движение собирает плотную оболочку, быстрое растягивает её. Первый жест заменяет образец, следующие добавляют свет. «Заморозить» останавливает и затухание, и рисование; для сохранения используйте «снимок».',
    tools: [
      { type: 'range', key: 'exposure', label: 'выдержка, с', min: 2, max: 20, step: 1, value: 12 },
      { type: 'range', key: 'aperture', label: 'разрез', min: 0.03, max: 0.16, step: 0.01, value: 0.1 },
      { type: 'range', key: 'spin', label: 'вращение', min: 0.2, max: 2, step: 0.1, value: 0.8 },
      { type: 'toggle', key: 'freeze', label: 'заморозить', value: false },
      { type: 'button', label: 'образец', action: uExposureSample },
      { type: 'button', label: 'очистить', action() { modeState.frames=[];modeState.demo=false;modeState.held=false; } },
    ],
    cursor: 'crosshair', setup: uExposureSetup, step: uExposureStep, draw: uExposureDraw,
    onDown: uExposureDown,
    onUp() { modeState.held=false; },
    onTool() { if(on('freeze'))modeState.held=false; },
  },
  monolith: {
    label: 'монолит',
    note: 'Захватите край монолита и потяните: ближайшие обломки сдвинутся вместе с рукой. Каждый жест сохраняется. «Осыпь» раздвигает мелкие фрагменты по направлению распада, «захват» меняет область воздействия. Для осмотра включите «поворот рукой». «Заново» возвращает исходное положение фрагментов.',
    tools: [
      { type: 'range', key: 'erosion', label: 'осыпь', min: 0, max: 1.5, step: 0.05, value: 0.55 },
      { type: 'range', key: 'grip', label: 'захват', min: 0.04, max: 0.25, step: 0.01, value: 0.12 },
      { type: 'toggle', key: 'turn', label: 'поворот рукой', value: false },
      { type: 'button', label: 'заново', action: uMonolithSetup },
    ],
    cursor: 'grab', setup: uMonolithSetup, draw: uMonolithDraw,
    onDown: uMonolithDown, onMove: uMonolithMove,
    onUp() { modeState.grab=null; },
    onTool() { modeState.grab=null;modeState.dirty=true; },
  },
  engraving: {
    label: 'гравюра',
    note: 'Зажмите и ведите: поверхность постепенно поднимается под рукой, контурные линии обтекают новый рельеф. Удержание на месте наращивает холм. «Углублять» меняет направление, «оседание» медленно возвращает поверхность к исходной. Новые жесты сохраняют прежние следы. На паузе рельеф не меняется.',
    tools: [
      { type: 'range', key: 'rings', label: 'линии', min: 8, max: 35, step: 1, value: 19 },
      { type: 'range', key: 'brush', label: 'захват', min: 0.04, max: 0.2, step: 0.01, value: 0.12 },
      { type: 'range', key: 'contrast', label: 'насыщенность', min: 0.5, max: 2, step: 0.1, value: 1.2 },
      { type: 'toggle', key: 'carve', label: 'углублять', value: false },
      { type: 'toggle', key: 'settle', label: 'оседание', value: false },
      { type: 'button', label: 'заново', action() { modeState.grid.fill(0);modeState.upload=modeState.dirty=true; } },
    ],
    cursor: 'crosshair', setup: uEngraveSetup, step: uEngraveStep, draw: uEngraveDraw,
    onDown() { modeState.grab={x:pointer.x,y:pointer.y}; },
    onUp() { modeState.grab=null; },
    onTool() { modeState.dirty=true; },
  },
  volume: {
    label: 'росчерк',
    note: 'Проведите линию: она становится объёмной лентой из сечений. Первый жест заменит образец, следующие добавят новые ленты. Включите «поворот рукой», чтобы рассмотреть их с другой стороны. «Скрутка» вращает сечение вдоль пути. Хранятся пять последних лент, каждая до 400 сечений. «Образец» возвращает исходную композицию.',
    tools: [
      { type: 'range', key: 'width', label: 'толщина', min: 0.025, max: 0.14, step: 0.005, value: 0.095 },
      { type: 'range', key: 'twist', label: 'скрутка', min: 0, max: 3, step: 0.1, value: 1.1 },
      { type: 'toggle', key: 'turn', label: 'поворот рукой', value: false },
      { type: 'button', label: 'образец', action: uVolumeSample },
      { type: 'button', label: 'очистить', action() { modeState.paths=[];modeState.sample=false;modeState.dirty=true; } },
    ],
    cursor: 'crosshair', setup: uVolumeSetup, draw: uVolumeDraw,
    onDown: uVolumeDown, onMove: uVolumeMove,
    onUp() { modeState.grab=null; },
    onTool() { modeState.dirty=true;canvas.style.cursor=on('turn')?'grab':'crosshair'; },
  },
  structure: {
    label: 'конструкция',
    note: 'Поверните конструкцию мышью или пальцем. Полупрозрачные оболочки открывают лестницы, кольца и арочные перекрытия внутри. «Сечение» снимает конструкцию справа налево, «раздвинуть» разделяет верхние и нижние слои. «Свет» регулирует плотность просвечивания. «Фон» переключает негатив.',
    tools: [
      { type: 'range', key: 'opacity', label: 'свет', min: 0.5, max: 3, step: 0.1, value: 2.3 },
      { type: 'range', key: 'section', label: 'сечение', min: 0, max: 100, step: 1, value: 100 },
      { type: 'range', key: 'separate', label: 'раздвинуть', min: 0, max: 2, step: 0.1, value: 0 },
      { type: 'toggle', key: 'rotate', label: 'вращение', value: false },
      { type: 'button', label: 'исходный вид', action() { modeState.angle=-0.65;modeState.tilt=0.38;modeState.dirty=true; } },
    ],
    cursor: 'grab', setup: uStructureSetup, draw: uStructureDraw,
    step() { if(on('rotate')&&!pointer.down){modeState.angle+=STEP*0.13;modeState.dirty=true;} },
    onDown() { modeState.grab={x:pointer.x,y:pointer.y,angle:modeState.angle,tilt:modeState.tilt}; },
    onMove: uStructureMove,
    onUp() { modeState.grab=null; },
    onTool() { modeState.dirty=true; },
  },
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
  if (current === 'exposure') modeState.held = false;
});

startLab({ title: 'У · развилка и память', modes: MODES, start: 'fabric', ground: 'paper' });
