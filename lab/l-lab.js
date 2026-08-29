/* Л — две ноги и вершина.

   В Л нет ни одной замкнутой части и ни одной горизонтали: вертикаль справа,
   наклонная слева, вершина сверху. Всё, чем буква отличается от палки, —
   раствор между кончиками ног. Поэтому механики здесь крутят раствор, а не
   контур: буква не нарисована поверх сцены, а получена из её устройства.

   Четырнадцать подходов:

     корень     вершина как развилка: справа стержень идёт своим курсом,
                слева отходит боковой, и каждая нога кончается новой Л
     циркуль    Л как измеритель с неравными плечами: шагает через ногу,
                считает строку растворами и оставляет цепочку арок
     кильватер  Л как обводы лодки сверху: след складывается из волн, которые
                держатся за ней, и даёт клин Кельвина; правый борт идёт вдоль
                хода и молчит, поэтому половины следа не зеркальны
     стремянка  наклонная — лестница, вертикальная — подпорка; узко поставил —
                валится, широко — разъезжается и не достаёт
     ходьба     две клавиши на две ноги: буква видна только в тот миг, когда
                обе стоят на земле в читаемом растворе
     откос      песок ложится под своим углом и упирается в опалубку;
                буква не нарисована, а насыпана
     эхо        импульс входит в одну ногу, отражается в вершине и ловится на
                другой в нужный момент
     развилка   вершина переключает поток между двумя ногами, а цель меняется
                после каждого выпуска
     река       Л — неподвижный нос лодки; течение и отражённый свет живут в
                процедурном поле воды
     толща      чёрная вода с полем высот; курсор продавливает поверхность
     нити       серебряные волокна течения расходятся и закручиваются за мышью
     рябь       несколько волновых фронтов интерферируют в следе курсора
     ascii      поле воды набрано знаками, которые переписывает движение
     пиксели    низкое разрешение и ступенчатый свет превращают воду в спрайт

   Красный в механиках с ошибкой обозначает событие: вырождение, остаток меньше
   раствора, поехавшая нога, шпагат, осыпание. */

const TAU = Math.PI * 2;

/* Строка: базовая линия и рост буквы. От них считают все механики. */
const GROUND = 0.78;
const RISE = 0.30;
const STEM = 0.018;

function plural(n, one, few, many) {
  const ten = n % 10;
  const hundred = n % 100;
  if (hundred >= 11 && hundred <= 14) return many;
  if (ten === 1) return one;
  if (ten >= 2 && ten <= 4) return few;
  return many;
}

function count(n, ...forms) { return `${n} ${plural(n, ...forms)}`; }

/* Две ноги из вершины — весь запас формы. Кто где стоит, решает механика. */
function legs(ax, ay, x1, y1, x2, y2, alpha = 1, width = STEM) {
  const color = ink(alpha);
  line(ax, ay, x1, y1, color, width);
  line(ax, ay, x2, y2, color, width);
}

function baseline(y = GROUND, alpha = 0.22) {
  line(0.04, y, 0.96, y, ink(alpha), 0.002);
}

const MODES = {};

/* ---------- корень ---------- */

/* Вершина Л — единственная в алфавите чистая развилка: один штрих входит,
   два выходят. Если каждую ногу считать новым стволом, буква размножается
   вниз и вырастает в корень. Стержень наследует курс родителя, боковой
   отходит на угол — так ветвится настоящий корень, и так же держится
   асимметрия Л: справа прямо, слева в сторону. */

const CROWN = { x: 0.76, y: 0.13 };

MODES.root = {
  label: 'корень',
  note: 'Тяни за левую ногу — меняются отвод и длина первого поколения; сколько их и как быстро укорачиваются, на ползунках. Красная точка — конец, ставший короче собственной толщины: дальше буква вырождается в штрих.',
  cursor: 'grab',
  tools: [
    { type: 'range', key: 'gen', label: 'поколения', min: 1, max: 11, step: 1, value: 8 },
    { type: 'range', key: 'keep', label: 'укорочение', min: 0.5, max: 0.88, step: 0.01, value: 0.7 },
    { type: 'range', key: 'thin', label: 'утончение', min: 0.55, max: 1, step: 0.01, value: 0.78 },
    { type: 'toggle', key: 'first', label: 'первая Л', value: true },
  ],

  setup() {
    modeState.lean = 0.6;
    modeState.len = 0.19;
  },

  onDown() { this.onMove(); },

  onMove() {
    if (!pointer.down) return;
    const dx = pointer.x - CROWN.x;
    const dy = pointer.y - CROWN.y;
    if (dy <= 0.02) return;
    modeState.len = clamp(Math.hypot(dx, dy), 0.06, 0.34);
    modeState.lean = clamp(Math.atan2(-dx, dy), 0.05, 1.4);
  },

  draw() {
    const gen = num('gen');
    const keep = num('keep');
    const thin = num('thin');
    const lean = modeState.lean;
    let dead = 0;

    const grow = (x, y, dir, len, width, depth) => {
      /* Ветвь короче собственной толщины — уже не буква, а клякса.
         Рекурсия кончается здесь, а не на счётчике поколений. */
      if (len < width * 2.2) { dot(x, y, RED, 0.004); dead += 1; return; }

      const rx = x + Math.sin(dir) * len;
      const ry = y + Math.cos(dir) * len;
      const side = dir - lean;
      const lx = x + Math.sin(side) * len;
      const ly = y + Math.cos(side) * len;
      legs(x, y, lx, ly, rx, ry, 1, width);

      if (depth >= gen) return;
      grow(rx, ry, dir, len * keep, width * thin, depth + 1);
      grow(lx, ly, side, len * keep, width * thin, depth + 1);
    };

    grow(CROWN.x, CROWN.y, 0, modeState.len, STEM, 1);

    /* Первое поколение поверх гущи: иначе буква тонет в собственном потомстве. */
    if (on('first')) {
      const len = modeState.len;
      legs(
        CROWN.x, CROWN.y,
        CROWN.x - Math.sin(lean) * len, CROWN.y + Math.cos(lean) * len,
        CROWN.x, CROWN.y + len,
        1, STEM * 1.4,
      );
    }

    drawStatus(dead ? count(dead, 'вырождение', 'вырождения', 'вырождений') : '', dead > 0);
  },
};

/* ---------- циркуль ---------- */

/* Измерительный циркуль шагает через ногу: опорная стоит, вторая проносится
   вперёд и встаёт на раствор дальше. У Л плечи неравные — правое вертикальное,
   левое длиннее, — и это не помеха, а редукционный циркуль: вершина всегда
   над передней ногой, поэтому по ходу буква зеркалится вместе с направлением.
   Строку он не рисует, а меряет, и остаток короче раствора взять не может. */

function paceGround(x) {
  return GROUND + num('relief') * 0.045 * Math.sin(x * 7.5 + 1.2);
}

MODES.divider = {
  label: 'циркуль',
  note: 'Веди курсор — циркуль шагает к нему через ногу и считает путь растворами. Арки за ним — след кончика, та самая строчная цепочка из «л». Красным — хвост короче раствора: его циркулем не взять, и в этом весь смысл мерки.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'span', label: 'раствор', min: 0.05, max: 0.2, step: 0.005, value: 0.11 },
    { type: 'range', key: 'pace', label: 'темп', min: 0.6, max: 4, step: 0.1, value: 2 },
    { type: 'range', key: 'relief', label: 'рельеф', min: 0, max: 1, step: 0.05, value: 0 },
    { type: 'toggle', key: 'trail', label: 'след', value: true },
    { type: 'button', label: 'заново', action: () => MODES.divider.setup() },
  ],

  setup() {
    modeState.feet = [0.25 - num('span'), 0.25];
    modeState.front = 1;
    modeState.t = null;
    modeState.from = 0;
    modeState.to = 0;
    modeState.arcs = [];
    modeState.paces = 0;
  },

  step() {
    const span = num('span');
    const front = modeState.feet[modeState.front];
    const target = pointer.seen ? clamp(pointer.x, 0.06, 0.94) : 0.9;

    if (modeState.t === null) {
      const gap = target - front;
      if (Math.abs(gap) < span) return;
      const dir = Math.sign(gap);
      const back = 1 - modeState.front;
      modeState.from = modeState.feet[back];
      modeState.to = clamp(front + dir * span, 0.04, 0.96);
      modeState.t = 0;
      return;
    }

    modeState.t += STEP * num('pace');
    if (modeState.t < 1) return;

    const back = 1 - modeState.front;
    modeState.feet[back] = modeState.to;
    modeState.front = back;
    modeState.t = null;
    modeState.paces += 1;
    modeState.arcs.push({ from: modeState.from, to: modeState.to });
    if (modeState.arcs.length > 160) modeState.arcs.shift();
  },

  draw() {
    const span = num('span');
    const lift = span * 0.85;

    ctx.beginPath();
    ctx.moveTo(0.04 * S, paceGround(0.04) * S);
    for (let x = 0.06; x <= 0.96; x += 0.02) ctx.lineTo(x * S, paceGround(x) * S);
    ctx.strokeStyle = ink(0.2);
    ctx.lineWidth = 0.002 * S;
    ctx.stroke();

    if (on('trail')) {
      for (const arc of modeState.arcs) arch(arc.from, arc.to, lift, 0.26);
    }

    const t = modeState.t;
    const eased = t === null ? 0 : t * t * (3 - 2 * t);
    const stance = modeState.feet[modeState.front];
    const swing = t === null
      ? modeState.feet[1 - modeState.front]
      : lerp(modeState.from, modeState.to, eased);
    const swingY = paceGround(swing) - (t === null ? 0 : Math.sin(Math.PI * eased) * lift);

    /* Вершина едет к новой передней ноге весь шаг — иначе она прыгала бы
       в тот кадр, когда ноги меняются ролями. */
    const apexX = t === null ? stance : lerp(stance, modeState.to, eased);
    const apexY = paceGround(apexX) - RISE;
    legs(apexX, apexY, swing, swingY, stance, paceGround(stance));

    if (t === null && on('trail')) arch(modeState.from, modeState.to, lift, 0.26);

    /* Остаток, не кратный раствору, циркуль не берёт. */
    const target = pointer.seen ? clamp(pointer.x, 0.06, 0.94) : 0.9;
    const rest = target - stance;
    if (t === null && Math.abs(rest) > 0.004) {
      line(stance, paceGround(stance), target, paceGround(target), RED, 0.006);
    }

    drawStatus(count(modeState.paces, 'раствор', 'раствора', 'растворов'));
  },
};

/* Одним путём, а не цепочкой отрезков: у полупрозрачного следа стыки
   с круглыми концами наложились бы и дали зерно вместо линии. */
function arch(from, to, lift, alpha) {
  const steps = 20;
  ctx.beginPath();
  ctx.moveTo(from * S, paceGround(from) * S);
  for (let i = 1; i <= steps; i += 1) {
    const u = i / steps;
    const x = lerp(from, to, u);
    ctx.lineTo(x * S, (paceGround(x) - Math.sin(Math.PI * u) * lift) * S);
  }
  ctx.strokeStyle = ink(alpha);
  ctx.lineWidth = 0.004 * S;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/* ---------- река ---------- */

/* Угол неподвижен. Вода отрисовывается настоящим полем высот в WebGL:
   несколько масштабов волн дают нормаль, а нормаль — узкий отражённый свет. */

const RIVER_VERTEX = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const RIVER_FRAGMENT = `
precision highp float;

varying vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_flow;
uniform float u_glint;
uniform float u_exposure;
uniform float u_wake;
uniform float u_dark;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float heightField(vec2 p) {
  float t = u_time * u_flow;
  vec2 drift = vec2(t * 0.018, t * 0.085);
  vec2 q = p + drift;
  vec2 nose = vec2(v_uv.x - 0.5, v_uv.y - 0.64);
  float ahead = smoothstep(-0.015, 0.065, nose.y);
  float bowRadius = length(vec2(nose.x * 1.35, nose.y * 0.72));
  float bowInfluence = exp(-bowRadius * 5.8) * ahead;
  float bowSplit = smoothstep(-0.11, 0.11, nose.x) * 2.0 - 1.0;
  q.x += bowSplit * bowInfluence * 0.086;
  q.y -= bowInfluence * 0.030;
  float warp = noise(vec2(q.x * 1.7 + t * 0.025, q.y * 0.85 - t * 0.035)) - 0.5;

  float h = 0.0;
  h += sin(dot(q, vec2(2.6, 17.0)) + warp * 3.2 + t * 0.58) * 0.52;
  h += sin(dot(q, vec2(-5.0, 33.0)) - warp * 2.1 - t * 0.76) * 0.22;
  h += sin(dot(q, vec2(11.0, 57.0)) + t * 1.10 + noise(q * 3.2) * 1.3) * 0.08;

  float bowMask = ahead * (1.0 - smoothstep(0.018, 0.38, bowRadius));
  h += sin(bowRadius * 96.0 - t * 2.8) * bowMask * 0.22 * u_wake;

  float hullDepth = clamp((0.64 - v_uv.y) / 0.70, 0.0, 1.0);
  float hullHalf = hullDepth * 0.31;
  float hullSide = abs(v_uv.x - 0.5) - hullHalf;
  float edgeDistance = abs(hullSide);
  float outside = smoothstep(-0.008, 0.026, hullSide);
  float edgeMask = exp(-edgeDistance * 30.0) * smoothstep(0.02, 0.16, hullDepth) * outside;
  h += sin(edgeDistance * 92.0 + hullDepth * 11.0 - t * 2.3
    + noise(vec2(hullDepth * 8.0, edgeDistance * 21.0)) * 1.4
  ) * edgeMask * 0.16 * u_wake;
  return h;
}

void main() {
  vec2 uv = v_uv;
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
  float e = 1.35 / u_resolution.y;
  float elevation = heightField(p);
  float hx = heightField(p + vec2(e, 0.0)) - heightField(p - vec2(e, 0.0));
  float hy = heightField(p + vec2(0.0, e)) - heightField(p - vec2(0.0, e));
  vec3 normal = normalize(vec3(-hx * 2.5, -hy * 2.5, 0.22));

  vec3 light = normalize(vec3(-0.45, 0.38, 0.81));
  vec3 view = vec3(0.0, 0.0, 1.0);
  float diffuse = max(dot(normal, light), 0.0);
  vec3 halfway = normalize(light + view);
  float specular = pow(max(dot(normal, halfway), 0.0), 118.0);
  float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 4.0);
  float crest = pow(clamp(elevation * 0.34 + 0.5, 0.0, 1.0), 16.0) * 0.078;
  float silver = specular * 0.62 * u_glint + fresnel * 0.046 + crest;
  float grain = (hash(gl_FragCoord.xy + floor(u_time * 17.0)) - 0.5) * 0.005;
  float vignette = 1.0 - dot(uv - 0.5, uv - 0.5) * 0.34;

  vec2 boat = vec2(uv.x - 0.5, uv.y - 0.64);
  float pressureAhead = smoothstep(-0.01, 0.055, boat.y);
  float pressure = exp(-length(vec2(boat.x * 1.5, boat.y * 0.8)) * 10.0) * pressureAhead;
  float depth = clamp((0.64 - uv.y) / 0.70, 0.0, 1.0);
  float side = abs(uv.x - 0.5) - depth * 0.31;
  float slip = exp(-abs(side) * 46.0) * smoothstep(0.02, 0.18, depth) * smoothstep(-0.006, 0.022, side);
  float wakeTime = u_time * u_flow;
  float nosePressure = exp(-length(vec2(boat.x * 1.75, boat.y * 0.82)) * 15.0)
    * smoothstep(-0.018, 0.055, boat.y);
  float sideGate = smoothstep(0.015, 0.14, depth);
  float sideRidgeDistance = 0.010 + depth * 0.020;
  float sideRidge = exp(-abs(side - sideRidgeDistance) * 108.0)
    * sideGate * smoothstep(-0.004, 0.012, side);
  float shearEnvelope = exp(-max(side, 0.0) * 13.0) * sideGate
    * smoothstep(-0.004, 0.020, side);
  float shearPhase = side * 70.0 - depth * 14.0 - wakeTime * 3.1
    + noise(vec2(depth * 6.0, abs(boat.x) * 9.0)) * 1.7;
  float shearCrest = pow(max(sin(shearPhase), 0.0), 6.0) * shearEnvelope;
  float wakeLight = nosePressure * 0.055 + sideRidge * 0.080 + shearCrest * 0.060;

  float darkWater = (0.016 + diffuse * 0.032 + silver + grain
    + pressure * 0.046 * u_glint + slip * 0.032 * u_glint
    + wakeLight * u_wake) * vignette;
  darkWater = min(1.0 - exp(-darkWater * u_exposure), 0.78);
  vec3 darkScene = vec3(darkWater);
  vec3 paperScene = vec3(0.945 - darkWater * 1.65);
  gl_FragColor = vec4(mix(paperScene, darkScene, u_dark), 1.0);
}
`;

function riverShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

function riverWater() {
  const surface = document.createElement('canvas');
  const gl = surface.getContext('webgl', {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  const program = gl.createProgram();
  gl.attachShader(program, riverShader(gl, gl.VERTEX_SHADER, RIVER_VERTEX));
  gl.attachShader(program, riverShader(gl, gl.FRAGMENT_SHADER, RIVER_FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  return {
    surface,
    gl,
    program,
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    time: gl.getUniformLocation(program, 'u_time'),
    flow: gl.getUniformLocation(program, 'u_flow'),
    glint: gl.getUniformLocation(program, 'u_glint'),
    exposure: gl.getUniformLocation(program, 'u_exposure'),
    wake: gl.getUniformLocation(program, 'u_wake'),
    dark: gl.getUniformLocation(program, 'u_dark'),
  };
}

function drawRiverWater(state) {
  const water = state.water;
  const size = Math.max(1, Math.round(S * dpr));
  if (water.surface.width !== size || water.surface.height !== size) {
    water.surface.width = size;
    water.surface.height = size;
  }

  water.gl.viewport(0, 0, size, size);
  water.gl.useProgram(water.program);
  water.gl.uniform2f(water.resolution, size, size);
  water.gl.uniform1f(water.time, state.time);
  water.gl.uniform1f(water.flow, num('flow'));
  water.gl.uniform1f(water.glint, num('glint'));
  water.gl.uniform1f(water.exposure, num('exposure'));
  water.gl.uniform1f(water.wake, num('wake'));
  water.gl.uniform1f(water.dark, ground === 'ink' ? 1 : 0);
  water.gl.drawArrays(water.gl.TRIANGLES, 0, 6);
  ctx.drawImage(water.surface, 0, 0, S, S);
}

function drawRiverBoat() {
  ctx.fillStyle = ink(0.97);
  ctx.beginPath();
  ctx.moveTo(0.19 * S, 1.06 * S);
  ctx.lineTo(0.5 * S, 0.36 * S);
  ctx.lineTo(0.81 * S, 1.06 * S);
  ctx.closePath();
  ctx.fill();
}

MODES.river = {
  label: 'река',
  note: 'Белый нос неподвижен. Течение идёт ему навстречу, сжимается перед вершиной и расходится вдоль двух граней. Вид сверху.',
  cursor: 'default',
  tools: [
    { type: 'range', key: 'flow', label: 'течение', min: 0.2, max: 1.5, step: 0.05, value: 0.65 },
    { type: 'range', key: 'glint', label: 'свет', min: 0.25, max: 1.5, step: 0.05, value: 0.8 },
    { type: 'range', key: 'exposure', label: 'яркость', min: 0.5, max: 4, step: 0.1, value: 2.2 },
    { type: 'range', key: 'wake', label: 'след', min: 0, max: 2, step: 0.05, value: 1.1 },
  ],

  setup() {
    modeState.time = 0;
    modeState.water = riverWater();
  },

  step() {
    modeState.time += STEP;
  },

  draw() {
    drawRiverWater(modeState);
    drawRiverBoat();
  },
};

/* ---------- кильватер ---------- */

/* След корабля — не рябь и не свечение вдоль борта, а волновой клин Кельвина:
   волна держится за лодкой, только если её фазовая скорость равна U·cos ψ,
   откуда k(ψ) = k0/cos²ψ. Всё поле — одна сумма плоских волн по углу; клин
   в arcsin(1/3) ≈ 19,47°, поперечные дуги и расходящиеся перья складываются
   из интерференции сами, без единой ручной маски.

   Букву это берёт всерьёз. Правый борт Л идёт вдоль курса и волны почти не
   гонит, левый расходится и гонит вовсю, поэтому след выходит односторонним:
   такой картины равнобедренный нос не даст. Раствор ног двигает второй
   источник, и весь узор перестраивается вместе с начертанием. */

const WAKE_VERTEX = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const WAKE_FRAGMENT = `
precision highp float;

varying vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_k0;
uniform float u_psimax;
uniform float u_glint;
uniform float u_exposure;
uniform vec3 u_ink;
uniform vec3 u_paper;
uniform float u_heel;
uniform vec2 u_bow;
uniform vec2 u_ribs[3];

const int SAMPLES = 88;

/* Сумма даёт высоту и оба наклона разом: фаза известна аналитически, поэтому
   градиент берётся тут же и трёх проходов ради нормали не нужно. */
void wakeFrom(vec2 p, vec2 src, float amp, inout float h, inout vec2 grad) {
  vec2 rel = p - src;
  float s = -rel.y;
  float n = rel.x;
  if (s <= 0.0) return;

  float gate = amp * smoothstep(0.0, 0.02, s) * exp(-s * 0.55);
  float span = 2.0 * u_psimax / float(SAMPLES);
  for (int i = 0; i < SAMPLES; i += 1) {
    float psi = -u_psimax + (float(i) + 0.5) * span;
    float c = cos(psi);
    float si = sin(psi);
    float k = u_k0 / (c * c);
    float phase = k * (s * c + n * si);
    /* Вес гасит края веера: там k растёт как 1/cos², и волна ушла бы в муар. */
    float w = gate * c * c * c;
    h += cos(phase) * w;
    float wave = -sin(phase) * w;
    grad += wave * vec2(k * si, -k * c);
  }
}

void main() {
  vec2 p = v_uv;
  float h = 0.0;
  vec2 grad = vec2(0.0);
  /* Нос даёт симметричный клин, а вытеснение у Л целиком на наклонном борту:
     источники идут вдоль него, и левая половина следа получает вторую систему
     волн, которой на правой стороне взяться неоткуда. */
  wakeFrom(p, u_bow, 1.0, h, grad);
  wakeFrom(p, u_ribs[0], u_heel * 0.5, h, grad);
  wakeFrom(p, u_ribs[1], u_heel * 0.36, h, grad);
  wakeFrom(p, u_ribs[2], u_heel * 0.24, h, grad);

  float scale = 0.9 / float(SAMPLES);
  h *= scale;
  grad *= scale;

  vec3 normal = normalize(vec3(-grad * 0.045, 1.0));
  vec3 light = normalize(vec3(-0.42, 0.44, 0.79));
  vec3 view = vec3(0.0, 0.0, 1.0);
  vec3 halfway = normalize(light + view);
  float diffuse = max(dot(normal, light), 0.0);
  float specular = pow(max(dot(normal, halfway), 0.0), 96.0);
  float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 4.0);
  float crest = pow(clamp(h * 6.0 + 0.5, 0.0, 1.0), 12.0) * 0.09;

  float vignette = 1.0 - dot(v_uv - 0.5, v_uv - 0.5) * 0.3;
  float lit = (0.018 + diffuse * 0.03 + specular * 0.7 * u_glint
    + fresnel * 0.05 + crest) * vignette;
  /* Цвет берётся из констант каркаса: гладь — цвет поля, гребень — цвет метки.
     Поэтому переключение фона переворачивает сцену само, без второй ветки. */
  float crestShade = min(1.0 - exp(-lit * u_exposure), 0.92);
  gl_FragColor = vec4(mix(u_paper, u_ink, crestShade), 1.0);
}
`;

/* Каркас держит цвета строками rgba, шейдеру нужны доли единицы. */
function wakeTone(color) {
  const [r, g, b] = color.match(/[\d.]+/g).map(Number);
  return new Float32Array([r / 255, g / 255, b / 255]);
}

function wakeWater() {
  const surface = document.createElement('canvas');
  const gl = surface.getContext('webgl', { alpha: false, antialias: false });
  const program = gl.createProgram();
  gl.attachShader(program, riverShader(gl, gl.VERTEX_SHADER, WAKE_VERTEX));
  gl.attachShader(program, riverShader(gl, gl.FRAGMENT_SHADER, WAKE_FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  return {
    surface,
    gl,
    program,
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    k0: gl.getUniformLocation(program, 'u_k0'),
    psimax: gl.getUniformLocation(program, 'u_psimax'),
    glint: gl.getUniformLocation(program, 'u_glint'),
    exposure: gl.getUniformLocation(program, 'u_exposure'),
    inkColor: gl.getUniformLocation(program, 'u_ink'),
    paperColor: gl.getUniformLocation(program, 'u_paper'),
    heel: gl.getUniformLocation(program, 'u_heel'),
    bow: gl.getUniformLocation(program, 'u_bow'),
    ribs: gl.getUniformLocation(program, 'u_ribs'),
  };
}

/* Силуэт Л сверху: вершина — нос, правый борт вдоль курса, левый расходится.
   Координаты холста; в шейдере ось Y смотрит вверх, поэтому источники
   пересчитываются зеркально. */
const WAKE_HULL = { apex: { x: 0.56, y: 0.13 }, stern: 0.34 };

function wakeHull(spread) {
  const apex = WAKE_HULL.apex;
  const stern = WAKE_HULL.stern;
  return {
    apex,
    right: { x: apex.x, y: stern },
    left: { x: apex.x - spread, y: stern },
  };
}

/* Наклонный борт разбит на три точки вытеснения: чем дальше от носа, тем
   шире корпус и тем слабее вклад — волну гонит вход в воду, а не борт целиком.
   Шейдеру они уходят в его системе координат, где ось Y смотрит вверх. */
function wakeRibs(hull) {
  const out = [];
  for (const u of [0.34, 0.62, 0.9]) {
    out.push(lerp(hull.apex.x, hull.left.x, u), 1 - lerp(hull.apex.y, hull.left.y, u));
  }
  return new Float32Array(out);
}

function drawWakeHull(hull) {
  ctx.beginPath();
  ctx.moveTo(hull.apex.x * S, hull.apex.y * S);
  ctx.lineTo(hull.right.x * S, hull.right.y * S);
  ctx.lineTo(hull.left.x * S, hull.left.y * S);
  ctx.closePath();
  ctx.fillStyle = ink(0.97);
  ctx.fill();
}

MODES.wake = {
  label: 'кильватер',
  note: 'Нос стоит, вода набегает. След — не рябь, а клин Кельвина: он складывается из волн, которые держатся за лодкой, и потому даёт поперечные дуги и расходящиеся перья сам. Правый борт Л идёт вдоль хода и волны не гонит, левый расходится и гонит: клин остаётся, но половины перестают быть зеркальными. Раствор ног двигает борт, и узор пересобирается.',
  cursor: 'default',
  tools: [
    { type: 'range', key: 'ход', label: 'ход', min: 0.45, max: 1.8, step: 0.05, value: 0.95 },
    { type: 'range', key: 'spread', label: 'раствор', min: 0.06, max: 0.26, step: 0.01, value: 0.15 },
    { type: 'range', key: 'feather', label: 'перья', min: 0.6, max: 1.3, step: 0.05, value: 0.95 },
    { type: 'range', key: 'heel', label: 'борт', min: 0, max: 1.6, step: 0.05, value: 0.9 },
    { type: 'range', key: 'glint', label: 'свет', min: 0.2, max: 1.6, step: 0.05, value: 0.85 },
    { type: 'range', key: 'exposure', label: 'яркость', min: 0.5, max: 4, step: 0.1, value: 2.2 },
  ],

  setup() {
    modeState.water = wakeWater();
  },

  draw() {
    const water = modeState.water;
    const size = Math.max(1, Math.round(S));
    if (water.surface.width !== size) {
      water.surface.width = size;
      water.surface.height = size;
    }

    const hull = wakeHull(num('spread'));
    const speed = num('ход');

    water.gl.viewport(0, 0, size, size);
    water.gl.useProgram(water.program);
    water.gl.uniform2f(water.resolution, size, size);
    /* k0 = g/U²: чем быстрее ход, тем длиннее волна, а угол клина не меняется. */
    water.gl.uniform1f(water.k0, 90 / (speed * speed));
    water.gl.uniform1f(water.psimax, num('feather'));
    water.gl.uniform1f(water.glint, num('glint'));
    water.gl.uniform1f(water.exposure, num('exposure'));
    water.gl.uniform1f(water.heel, num('heel'));
    water.gl.uniform3fv(water.inkColor, wakeTone(INK));
    water.gl.uniform3fv(water.paperColor, wakeTone(PAPER));
    water.gl.uniform2f(water.bow, hull.apex.x, 1 - hull.apex.y);
    water.gl.uniform2fv(water.ribs, wakeRibs(hull));
    water.gl.drawArrays(water.gl.TRIANGLES, 0, 6);

    ctx.drawImage(water.surface, 0, 0, S, S);
    drawWakeHull(hull);
  },
};

/* ---------- плавание ---------- */

/* Кильватер выше стоит на месте не по недосмотру: при равномерном ходе след
   стационарен в системе лодки, и время из фазы выпадает. Чтобы вода ожила,
   след надо считать не от лодки, а от её следа во времени.

   Каждая точка, где лодка побывала τ назад, излучает волновой пакет. На
   глубокой воде его фаза сводится к φ = g·τ²/(4r) — решение Коши–Пуассона:
   длинные волны убегают вперёд, короткие остаются у места входа. Клин
   Кельвина складывается из этих пакетов сам, но теперь лодка вольна
   поворачивать и останавливаться: волны остаются на воде и доживают своё.

   Один косинус на точку пути вместо суммы по углу — динамика вышла дешевле
   статики. */

const VOYAGE_FRAGMENT = `
precision highp float;

varying vec2 v_uv;
uniform vec4 u_path[160];
uniform int u_count;
uniform float u_gravity;
uniform float u_sharp;
uniform float u_glint;
uniform float u_exposure;
uniform vec3 u_ink;
uniform vec3 u_paper;

void main() {
  vec2 p = v_uv;
  float h = 0.0;
  vec2 grad = vec2(0.0);

  for (int i = 0; i < 160; i += 1) {
    if (i >= u_count) break;
    vec4 mark = u_path[i];
    vec2 rel = p - mark.xy;
    float r = max(length(rel), 0.004);
    float age = mark.z;
    float amp = mark.w;

    /* Волновое число пакета растёт к месту входа как τ²/r²: у самой лодки
       волна мельче пикселя, и её гасит окно, иначе бы там жил муар. */
    /* Спектр вытеснения: длинные волны корпус почти не гонит (множитель k),
       короче осадки — не гонит вовсе (экспонента). Без нижнего конца длинные
       волны убегали бы вперёд лодки и клин не собирался. */
    float phase = u_gravity * age * age / r;
    float k = phase / r;
    float wave = amp * k * exp(-k / u_sharp) * exp(-age * 0.35) / (0.18 + r);

    h += cos(phase) * wave;
    grad += sin(phase) * wave * k * rel / r;
  }

  vec3 normal = normalize(vec3(-grad * 0.02, 1.0));
  vec3 light = normalize(vec3(-0.42, 0.44, 0.79));
  vec3 view = vec3(0.0, 0.0, 1.0);
  vec3 halfway = normalize(light + view);
  float diffuse = max(dot(normal, light), 0.0);
  float specular = pow(max(dot(normal, halfway), 0.0), 96.0);
  float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 4.0);
  float crest = pow(clamp(h * 5.0 + 0.5, 0.0, 1.0), 12.0) * 0.09;

  float vignette = 1.0 - dot(v_uv - 0.5, v_uv - 0.5) * 0.3;
  float lit = (0.018 + diffuse * 0.03 + specular * 0.7 * u_glint
    + fresnel * 0.05 + crest) * vignette;
  gl_FragColor = vec4(mix(u_paper, u_ink, min(1.0 - exp(-lit * u_exposure), 0.92)), 1.0);
}
`;

function voyageWater() {
  const surface = document.createElement('canvas');
  const gl = surface.getContext('webgl', { alpha: false, antialias: false });
  const program = gl.createProgram();
  gl.attachShader(program, riverShader(gl, gl.VERTEX_SHADER, WAKE_VERTEX));
  gl.attachShader(program, riverShader(gl, gl.FRAGMENT_SHADER, VOYAGE_FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  return {
    surface,
    gl,
    program,
    path: gl.getUniformLocation(program, 'u_path'),
    countSlot: gl.getUniformLocation(program, 'u_count'),
    gravity: gl.getUniformLocation(program, 'u_gravity'),
    sharp: gl.getUniformLocation(program, 'u_sharp'),
    glint: gl.getUniformLocation(program, 'u_glint'),
    exposure: gl.getUniformLocation(program, 'u_exposure'),
    inkColor: gl.getUniformLocation(program, 'u_ink'),
    paperColor: gl.getUniformLocation(program, 'u_paper'),
  };
}

/* Метки кладутся густо не для красоты: на редком пути кольца от каждой точки
   видны по отдельности, а гасить их впереди лодки должна интерференция. */
const VOYAGE_SEAT = 0.62;
const VOYAGE_SCALE = 0.15;
const VOYAGE_MARKS = 160;
const VOYAGE_STEP = 0.0035;
const VOYAGE_LIFE = 2.8;

/* Лодка — та же Л: вершина по курсу, прямой борт вдоль хода, наклонный
   расходится влево. Крен небольшой, чтобы буква оставалась буквой. */
function drawVoyageBoat(x, y, heel, spread, scale) {
  const cos = Math.cos(heel);
  const sin = Math.sin(heel);
  const at = (ax, ay) => [
    (x + (ax * cos - ay * sin) * scale) * S,
    (y + (ax * sin + ay * cos) * scale) * S,
  ];
  ctx.beginPath();
  ctx.moveTo(...at(0, 0));
  ctx.lineTo(...at(0, 1));
  ctx.lineTo(...at(-spread, 1));
  ctx.closePath();
  ctx.fillStyle = ink(0.97);
  ctx.fill();
}

MODES.voyage = {
  label: 'плавание',
  note: 'Река едет вниз, лодка держит курс вверх, курсор её сносит. След остаётся на воде и доживает своё: волны от каждой пройденной точки складываются в клин сами, а на повороте клин изгибается вслед за рулём. Воду вытесняет наклонный борт Л, прямой идёт вдоль хода и молчит.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'ход', label: 'ход', min: 0.1, max: 0.42, step: 0.01, value: 0.24 },
    { type: 'range', key: 'gravity', label: 'волна', min: 0.3, max: 4, step: 0.1, value: 1.1 },
    { type: 'range', key: 'spread', label: 'раствор', min: 0.25, max: 1, step: 0.05, value: 0.55 },
    { type: 'range', key: 'sharp', label: 'осадка', min: 60, max: 600, step: 10, value: 260 },
    { type: 'range', key: 'glint', label: 'свет', min: 0.2, max: 1.6, step: 0.05, value: 0.85 },
    { type: 'range', key: 'exposure', label: 'яркость', min: 0.5, max: 4, step: 0.1, value: 2.2 },
  ],

  setup() {
    modeState.water = voyageWater();
    modeState.boat = { x: 0.5, drift: 0 };
    modeState.marks = [];
    modeState.buffer = new Float32Array(VOYAGE_MARKS * 4);
    modeState.since = 0;
  },

  step() {
    const boat = modeState.boat;
    const speed = num('ход');
    const want = pointer.seen ? clamp(pointer.x, 0.08, 0.92) : 0.5;

    /* Руль запаздывает: лодка доворачивает к курсору, а не прыгает за ним,
       и от этого запаздывания след и получает свою кривизну. */
    const pull = clamp((want - boat.x) * 3.4, -1, 1);
    boat.drift += (pull * speed - boat.drift) * 3.2 * STEP;
    boat.x = clamp(boat.x + boat.drift * STEP, 0.06, 0.94);

    /* Лодка держится на месте кадра, а река едет вниз: курс всегда вверх,
       поэтому Л читается буквой, а не поворачивается стрелкой. */
    const go = speed * STEP;
    for (const mark of modeState.marks) {
      mark.age += STEP;
      mark.y += go;
    }
    while (modeState.marks.length
      && (modeState.marks[0].age > VOYAGE_LIFE || modeState.marks[0].y > 1.15)) {
      modeState.marks.shift();
    }

    modeState.since += go;
    if (modeState.since >= VOYAGE_STEP || !modeState.marks.length) {
      modeState.since = 0;
      /* Воду вытесняет наклонный борт, а не осевая линия: метка сносится
         влево, и половины следа перестают быть зеркальными. */
      modeState.marks.push({
        x: boat.x - num('spread') * VOYAGE_SCALE * 0.34,
        y: VOYAGE_SEAT,
        age: 0,
      });
      if (modeState.marks.length > VOYAGE_MARKS) modeState.marks.shift();
    }
  },

  draw() {
    const water = modeState.water;
    const size = Math.max(1, Math.round(S));
    if (water.surface.width !== size) {
      water.surface.width = size;
      water.surface.height = size;
    }

    const buffer = modeState.buffer;
    const marks = modeState.marks;
    for (let i = 0; i < marks.length; i += 1) {
      const mark = marks[i];
      buffer[i * 4] = mark.x;
      buffer[i * 4 + 1] = 1 - mark.y;
      buffer[i * 4 + 2] = mark.age;
      buffer[i * 4 + 3] = Math.max(0, 1 - mark.age / VOYAGE_LIFE);
    }

    water.gl.viewport(0, 0, size, size);
    water.gl.useProgram(water.program);
    water.gl.uniform4fv(water.path, buffer);
    water.gl.uniform1i(water.countSlot, marks.length);
    water.gl.uniform1f(water.gravity, num('gravity'));
    water.gl.uniform1f(water.sharp, num('sharp'));
    water.gl.uniform1f(water.glint, num('glint'));
    water.gl.uniform1f(water.exposure, num('exposure'));
    water.gl.uniform3fv(water.inkColor, wakeTone(INK));
    water.gl.uniform3fv(water.paperColor, wakeTone(PAPER));
    water.gl.drawArrays(water.gl.TRIANGLES, 0, 6);

    ctx.drawImage(water.surface, 0, 0, S, S);
    const boat = modeState.boat;
    /* Крен по сносу: на повороте букву ведёт, и видно, чем она гребёт. */
    const heel = clamp(boat.drift * 1.6, -0.5, 0.5);
    drawVoyageBoat(boat.x, VOYAGE_SEAT, heel, num('spread'), VOYAGE_SCALE);
  },
};

/* ---------- три воды ---------- */

const WATER_STUDY_COMMON = `
precision highp float;

varying vec2 v_uv;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform vec2 u_velocity;
uniform float u_time;
uniform float u_dark;
uniform float u_speed;
uniform float u_amount;
uniform float u_detail;
uniform vec4 u_trails[8];

float studyHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float studyNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(studyHash(i), studyHash(i + vec2(1.0, 0.0)), u.x),
    mix(studyHash(i + vec2(0.0, 1.0)), studyHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float studyFbm(vec2 p) {
  float f = 0.0;
  f += studyNoise(p) * 0.56;
  p = mat2(1.62, 1.18, -1.18, 1.62) * p;
  f += studyNoise(p) * 0.28;
  p = mat2(1.71, -1.04, 1.04, 1.71) * p;
  f += studyNoise(p) * 0.14;
  return f;
}

vec2 studyPoint(vec2 uv) {
  return (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
}

vec2 studyTrailPoint(vec2 uv) {
  return (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
}

vec3 studyScene(float light) {
  float vignette = 1.0 - dot(v_uv - 0.5, v_uv - 0.5) * 0.34;
  float darkLight = clamp(light * vignette, 0.0, 0.92);
  vec3 darkScene = vec3(darkLight);
  vec3 paperScene = vec3(0.95 - darkLight * 1.18);
  return mix(paperScene, darkScene, u_dark);
}
`;

const WATER_DEPTH_FRAGMENT = `${WATER_STUDY_COMMON}
float depthSurface(vec2 p) {
  float t = u_time * u_speed;
  vec2 q = p + vec2(t * 0.025, t * 0.072);
  float warp = studyFbm(q * 1.75 + vec2(t * 0.035, -t * 0.02)) - 0.5;
  float h = sin(dot(q, vec2(3.1, 17.0)) + warp * 3.7 + t * 0.52) * 0.48;
  h += sin(dot(q, vec2(-6.4, 31.0)) - warp * 2.3 - t * 0.73) * 0.22;
  h += sin(dot(q, vec2(12.0, 54.0)) + t * 1.06) * 0.07 * u_detail;

  for (int i = 0; i < 8; i++) {
    vec4 trail = u_trails[i];
    vec2 d = p - studyTrailPoint(trail.xy);
    float life = exp(-trail.z * 0.72) * trail.w;
    float radius = trail.z * (0.10 + trail.w * 0.055);
    float front = exp(-abs(length(d) - radius) * 27.0);
    h += sin((length(d) - radius) * 72.0) * front * life * 0.23 * u_amount;
  }

  vec2 mouseDelta = p - studyPoint(u_mouse);
  float force = min(length(u_velocity) * 28.0, 1.0) * u_amount;
  h -= exp(-dot(mouseDelta, mouseDelta) * 58.0) * force * 0.52;
  return h;
}

void main() {
  vec2 p = studyPoint(v_uv);
  float e = 1.4 / u_resolution.y;
  float h = depthSurface(p);
  float hx = depthSurface(p + vec2(e, 0.0)) - depthSurface(p - vec2(e, 0.0));
  float hy = depthSurface(p + vec2(0.0, e)) - depthSurface(p - vec2(0.0, e));
  vec3 normal = normalize(vec3(-hx * 2.8, -hy * 2.8, 0.18));
  vec3 lightDir = normalize(vec3(-0.48, 0.36, 0.80));
  vec3 halfDir = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float diffuse = max(dot(normal, lightDir), 0.0);
  float specular = pow(max(dot(normal, halfDir), 0.0), 132.0);
  float fresnel = pow(1.0 - max(normal.z, 0.0), 4.0);
  float crest = pow(clamp(h * 0.34 + 0.48, 0.0, 1.0), 14.0);
  float grain = (studyHash(gl_FragCoord.xy + floor(u_time * 13.0)) - 0.5) * 0.006;
  float shade = 0.018 + diffuse * 0.030 + specular * 0.72
    + fresnel * 0.052 + crest * 0.065 + grain;
  gl_FragColor = vec4(studyScene(1.0 - exp(-shade * u_detail)), 1.0);
}
`;

const WATER_THREADS_FRAGMENT = `${WATER_STUDY_COMMON}
void main() {
  vec2 p = studyPoint(v_uv);
  float t = u_time * u_speed;
  vec2 q = p;
  float trailLight = 0.0;
  float trailCore = 0.0;

  for (int i = 0; i < 8; i++) {
    vec4 trail = u_trails[i];
    vec2 d = q - studyTrailPoint(trail.xy);
    float d2 = dot(d, d) + 0.003;
    float life = exp(-trail.z * 0.58) * trail.w * u_amount;
    vec2 tangent = vec2(-d.y, d.x) / sqrt(d2);
    q += tangent * exp(-d2 * 20.0) * life * 0.064;
    q += normalize(d + vec2(0.0001)) * exp(-d2 * 42.0) * life * 0.028;
    float ring = trail.z * (0.075 + trail.w * 0.035);
    trailLight += exp(-abs(sqrt(d2) - ring) * 34.0) * life;
    trailCore += exp(-d2 * 54.0) * life;
  }

  vec2 mouseDelta = q - studyPoint(u_mouse);
  float mouseForce = min(length(u_velocity) * 24.0, 1.0) * u_amount;
  q += vec2(-u_velocity.y, u_velocity.x) * exp(-dot(mouseDelta, mouseDelta) * 48.0) * 1.6;

  float broad = studyFbm(vec2(q.x * 1.35 + t * 0.06, q.y * 2.1 - t * 0.08));
  q.x += (broad - 0.5) * 0.18;
  float flowA = q.y * (19.0 + u_detail * 9.0) + q.x * 4.0
    + studyFbm(q * 3.2 + vec2(t * 0.08, -t * 0.15)) * 7.2;
  float flowB = q.y * (37.0 + u_detail * 12.0) - q.x * 8.0
    + studyNoise(q * 8.0 - vec2(t * 0.11, t * 0.24)) * 4.8;
  float threadA = pow(1.0 - abs(sin(flowA)), 13.0);
  float threadB = pow(1.0 - abs(sin(flowB)), 21.0);
  float veil = smoothstep(0.34, 0.78, broad) * 0.055;
  float wake = trailLight * 0.048 + mouseForce * exp(-dot(mouseDelta, mouseDelta) * 55.0) * 0.08;
  float grain = (studyHash(gl_FragCoord.xy + floor(t * 19.0)) - 0.5) * 0.008;
  float shade = 0.014 + veil + threadA * 0.27 + threadB * 0.13 + wake + grain;
  shade *= 1.0 - min(trailCore * 0.52, 0.68);
  shade += wake;
  gl_FragColor = vec4(studyScene(1.0 - exp(-shade * 1.55)), 1.0);
}
`;

const WATER_RIPPLE_FRAGMENT = `${WATER_STUDY_COMMON}
void main() {
  vec2 p = studyPoint(v_uv);
  float t = u_time * u_speed;
  vec2 q = p;
  float distanceA = length(q - vec2(-0.72, 0.24));
  float distanceB = length(q - vec2(0.66, -0.34));
  float distanceC = length(q - vec2(0.38, 0.78));
  float field = sin(distanceA * (21.0 + u_detail * 9.0) - t * 0.78) * 0.30;
  field += sin(distanceB * (18.0 + u_detail * 11.0) + t * 0.56) * 0.25;
  field += sin(distanceC * (26.0 + u_detail * 7.0) - t * 0.41) * 0.14;
  field += (studyFbm(q * 3.0 + vec2(t * 0.04, -t * 0.06)) - 0.5) * 0.55;
  float memory = 0.0;

  for (int i = 0; i < 8; i++) {
    vec4 trail = u_trails[i];
    vec2 d = q - studyTrailPoint(trail.xy);
    float distanceToTrail = length(d);
    float life = exp(-trail.z * 0.46) * trail.w * u_amount;
    float radius = trail.z * (0.12 + trail.w * 0.07);
    float envelope = exp(-abs(distanceToTrail - radius) * 8.5);
    float wave = sin((distanceToTrail - radius) * (48.0 + u_detail * 25.0));
    field += wave * envelope * life * 0.68;
    memory += pow(max(wave, 0.0), 8.0) * envelope * life;
  }

  vec2 mouseDelta = q - studyPoint(u_mouse);
  float force = min(length(u_velocity) * 25.0, 1.0) * u_amount;
  float lens = exp(-dot(mouseDelta, mouseDelta) * 35.0) * force;
  field += sin(length(mouseDelta) * 64.0 - t * 3.2) * lens * 0.75;

  float soft = smoothstep(0.02, 1.35, abs(field));
  float crest = pow(smoothstep(0.34, 1.28, abs(field)), 3.0);
  float crossings = pow(max(0.0, 1.0 - abs(field) * 2.6), 10.0);
  float grain = (studyHash(gl_FragCoord.xy + floor(t * 15.0)) - 0.5) * 0.006;
  float shade = 0.012 + soft * 0.065 + crest * 0.25 + crossings * 0.045
    + min(memory, 1.0) * 0.052 + grain;
  gl_FragColor = vec4(studyScene(1.0 - exp(-shade * 1.45)), 1.0);
}
`;

const WATER_PIXEL_FRAGMENT = `${WATER_STUDY_COMMON}
void main() {
  float detailMix = clamp((u_detail - 0.55) / 1.65, 0.0, 1.0);
  float grid = floor(mix(38.0, 132.0, detailMix));
  vec2 cell = floor(v_uv * grid);
  vec2 uv = (cell + 0.5) / grid;
  vec2 p = studyPoint(uv);
  float t = u_time * u_speed;
  float warp = studyFbm(p * 2.4 + vec2(t * 0.05, -t * 0.08)) - 0.5;
  float field = sin(dot(p, vec2(3.0, 18.0)) + warp * 4.2 + t * 0.72) * 0.42;
  field += sin(dot(p, vec2(-9.0, 31.0)) - warp * 2.1 - t * 0.54) * 0.22;
  float impulse = 0.0;

  for (int i = 0; i < 8; i++) {
    vec4 trail = u_trails[i];
    vec2 d = p - studyTrailPoint(trail.xy);
    float life = exp(-trail.z * 0.62) * trail.w * u_amount;
    float radius = trail.z * (0.11 + trail.w * 0.06);
    float front = exp(-abs(length(d) - radius) * 18.0);
    float wave = sin((length(d) - radius) * 58.0);
    field += wave * front * life * 0.72;
    impulse += pow(max(wave, 0.0), 5.0) * front * life;
  }

  vec2 mouseDelta = p - studyPoint(u_mouse);
  float force = min(length(u_velocity) * 27.0, 1.0) * u_amount;
  field += sin(length(mouseDelta) * 48.0 - t * 3.0)
    * exp(-dot(mouseDelta, mouseDelta) * 28.0) * force;

  float ridge = 1.0 - smoothstep(0.035, 0.19, abs(field - 0.16));
  float trough = 1.0 - smoothstep(0.025, 0.14, abs(field + 0.24));
  float foam = pow(smoothstep(0.30, 0.96, abs(field)), 2.0);
  float dither = (mod(cell.x, 2.0) * 2.0 + mod(cell.y, 2.0)) * 0.025 - 0.038;
  float value = clamp(0.055 + ridge * 0.52 + trough * 0.20 + foam * 0.34
    + min(impulse, 1.0) * 0.20 + dither, 0.0, 0.999);
  float levels = 0.035 + floor(value * 4.0) / 4.0 * 0.72;
  gl_FragColor = vec4(studyScene(levels), 1.0);
}
`;

function waterStudySurface(fragment) {
  const surface = document.createElement('canvas');
  const gl = surface.getContext('webgl', {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  const program = gl.createProgram();
  gl.attachShader(program, riverShader(gl, gl.VERTEX_SHADER, RIVER_VERTEX));
  gl.attachShader(program, riverShader(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  return {
    surface,
    gl,
    program,
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    mouse: gl.getUniformLocation(program, 'u_mouse'),
    velocity: gl.getUniformLocation(program, 'u_velocity'),
    time: gl.getUniformLocation(program, 'u_time'),
    dark: gl.getUniformLocation(program, 'u_dark'),
    speed: gl.getUniformLocation(program, 'u_speed'),
    amount: gl.getUniformLocation(program, 'u_amount'),
    detail: gl.getUniformLocation(program, 'u_detail'),
    trails: gl.getUniformLocation(program, 'u_trails[0]'),
  };
}

function setupWaterMotion() {
  modeState.time = 0;
  modeState.mouse = {
    x: pointer.seen ? pointer.x : 0.5,
    y: pointer.seen ? 1 - pointer.y : 0.5,
  };
  modeState.velocity = { x: 0, y: 0 };
  modeState.trailCursor = 0;
  modeState.trails = Array.from({ length: 8 }, () => ({ x: 0.5, y: 0.5, age: 20, strength: 0 }));
  modeState.lastTrail = { ...modeState.mouse };
}

function setupWaterStudy(fragment) {
  setupWaterMotion();
  modeState.surface = waterStudySurface(fragment);
}

function moveWaterStudy() {
  const x = clamp(pointer.x, 0, 1);
  const y = clamp(1 - pointer.y, 0, 1);
  const dx = x - modeState.mouse.x;
  const dy = y - modeState.mouse.y;
  const distance = Math.hypot(dx, dy);
  modeState.velocity.x = lerp(modeState.velocity.x, dx, 0.72);
  modeState.velocity.y = lerp(modeState.velocity.y, dy, 0.72);
  modeState.mouse.x = x;
  modeState.mouse.y = y;

  const trailDistance = Math.hypot(x - modeState.lastTrail.x, y - modeState.lastTrail.y);
  if (trailDistance < 0.016 || distance < 0.0015) return;
  modeState.trails[modeState.trailCursor] = {
    x,
    y,
    age: 0,
    strength: clamp(distance * 32, 0.22, 1),
  };
  modeState.trailCursor = (modeState.trailCursor + 1) % modeState.trails.length;
  modeState.lastTrail.x = x;
  modeState.lastTrail.y = y;
}

function stepWaterStudy() {
  modeState.time += STEP;
  const drag = Math.exp(-STEP * 7.5);
  modeState.velocity.x *= drag;
  modeState.velocity.y *= drag;
  for (const trail of modeState.trails) trail.age += STEP;
}

function drawWaterStudy() {
  const water = modeState.surface;
  const size = Math.max(1, Math.round(S * dpr));
  if (water.surface.width !== size || water.surface.height !== size) {
    water.surface.width = size;
    water.surface.height = size;
  }

  const packedTrails = new Float32Array(modeState.trails.flatMap((trail) => [
    trail.x, trail.y, trail.age, trail.strength,
  ]));
  water.gl.viewport(0, 0, size, size);
  water.gl.useProgram(water.program);
  water.gl.uniform2f(water.resolution, size, size);
  water.gl.uniform2f(water.mouse, modeState.mouse.x, modeState.mouse.y);
  water.gl.uniform2f(water.velocity, modeState.velocity.x, modeState.velocity.y);
  water.gl.uniform1f(water.time, modeState.time);
  water.gl.uniform1f(water.dark, ground === 'ink' ? 1 : 0);
  water.gl.uniform1f(water.speed, num('speed'));
  water.gl.uniform1f(water.amount, num('amount'));
  water.gl.uniform1f(water.detail, num('detail'));
  water.gl.uniform4fv(water.trails, packedTrails);
  water.gl.drawArrays(water.gl.TRIANGLES, 0, 6);
  ctx.drawImage(water.surface, 0, 0, S, S);
}

function waterStudyMode(fragment, note, labels, values) {
  return {
    label: labels.mode,
    note,
    cursor: 'crosshair',
    tools: [
      { type: 'range', key: 'speed', label: labels.speed, min: 0.15, max: 1.8, step: 0.05, value: values.speed },
      { type: 'range', key: 'amount', label: labels.amount, min: 0, max: 2, step: 0.05, value: values.amount },
      { type: 'range', key: 'detail', label: labels.detail, min: 0.55, max: 2.2, step: 0.05, value: values.detail },
    ],
    setup() { setupWaterStudy(fragment); },
    onMove: moveWaterStudy,
    onDown: moveWaterStudy,
    step: stepWaterStudy,
    draw: drawWaterStudy,
  };
}

MODES.depth = waterStudyMode(
  WATER_DEPTH_FRAGMENT,
  'Вода как тёмная толща. Двигай мышью: поверхность продавливается, затем от движения расходятся затухающие фронты.',
  { mode: 'толща', speed: 'дрейф', amount: 'отклик', detail: 'свет' },
  { speed: 0.62, amount: 1.15, detail: 1.3 },
);

MODES.threads = waterStudyMode(
  WATER_THREADS_FRAGMENT,
  'Серебряные нити показывают направление течения. Курсор раздвигает их, закручивает и оставляет короткую память движения.',
  { mode: 'нити', speed: 'течение', amount: 'воронка', detail: 'плотность' },
  { speed: 0.72, amount: 1.05, detail: 1.2 },
);

MODES.ripple = waterStudyMode(
  WATER_RIPPLE_FRAGMENT,
  'Рябь складывается из встречных волн. Каждое движение мыши запускает новый фронт, который сталкивается с предыдущими.',
  { mode: 'рябь', speed: 'ход', amount: 'память', detail: 'частота' },
  { speed: 0.68, amount: 1.1, detail: 1.05 },
);

/* Круг идёт вверх, камера держит его в центре — значит вода едет вниз. Снос
   копится в scroll: рисунок ряби привязан к воде, а не к экрану, поэтому река
   действительно течёт, а не мерцает фазами на месте.

   След — не подрисованная дорожка, а вихри. Они срываются с боков круга по
   очереди (так и сходит дорожка Кармана), уносятся вниз вместе с водой,
   разбухают и затухают: круг оставляет след на воде, а не под собой. */

function asciiFlowSpeed() {
  return num('speed') * 0.26;
}

function setupAscii() {
  setupWaterMotion();
  modeState.scroll = 0;
  modeState.eddies = [];
  modeState.shed = 0;
  modeState.side = 1;
  modeState.fronts = [];
  modeState.bow = 0;
}

/* Тело сцены — не круг, а силуэт Л: вершина по курсу, прямой борт вдоль хода,
   наклонный расходится. Всё, что вода делает с телом, считается от расстояния
   до его контура, поэтому форма буквы попадает и в отражение, и в тень, и в
   точки срыва вихрей — картина воды рассказывает, что именно в ней стоит. */

/* Шкала плотности. Букв в ней нет нарочно: с ними вода читается текстом, а не
   рельефом. Но плотных символов в моноширинном шрифте всего горстка, поэтому
   градаций в светлом конце знаками не набрать — там их доберёт прозрачность. */
const ASCII_RAMP = ' .,:;~-+=*#%&@';
/* Знаки набраны из пунктуации, и плотный конец у них короткий: после * # % & @
   добирать нечем. У геометрических блоков шкала — доля закрашенной клетки,
   поэтому ступени ровные с обоих концов. Штрихи там тоже честнее: не |-/\,
   а восемь направлений треугольниками. */
const BLOCK_RAMP = ' \u00b7\u2591\u2592\u2593\u2588';
const BLOCK_STROKES = { up: '\u25b2', down: '\u25bc', left: '\u25c0', right: '\u25b6', ne: '\u25e5', nw: '\u25e4', se: '\u25e2', sw: '\u25e3' };

function letterBody() {
  const height = num('rise') * 2.4;
  const spread = num('spread');
  /* У Л вершина стоит над прямым бортом, у симметричного тела — посередине.
     Больше между ними ничего не меняется: раствор и рост общие, поэтому
     сравнение честное. */
  const apexX = on('even') ? 0.5 : 0.5 + spread * 0.5;
  const foot = 0.5 - height * 0.5;
  const apex = { x: apexX, y: 0.5 + height * 0.5 };
  const right = { x: 0.5 + spread * 0.5, y: foot };
  const left = { x: 0.5 - spread * 0.5, y: foot };
  const girth = Math.max(spread * 0.5, height * 0.42);
  return {
    height,
    spread,
    apex,
    right,
    left,
    mid: { x: (apex.x + right.x + left.x) / 3, y: (apex.y + right.y + left.y) / 3 },
    girth: girth * girth,
  };
}

/* Вытесняет воду наклон борта: чем сильнее грань уходит поперёк хода, тем
   круче она разгоняет поток и тем сильнее срывает вихрь. У Л прямой борт
   почти молчит, у симметричного тела оба борта равны — считаем от геометрии,
   а не назначаем руками. */
function letterHeel(body, side) {
  const foot = side < 0 ? body.left : body.right;
  return 0.4 + Math.min(Math.abs(body.apex.x - foot.x) / Math.max(body.height, 0.0001), 1.4) * 0.9;
}

/* Знаковое расстояние до треугольника: минимум по трём рёбрам, знак — по
   обходу. Внутри отрицательно. */
function letterDistance(px, py, body) {
  const points = [body.apex, body.right, body.left];
  let best = Infinity;
  let inside = 1;
  for (let i = 0; i < 3; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % 3];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const vx = px - a.x;
    const vy = py - a.y;
    const t = clamp((vx * ex + vy * ey) / (ex * ex + ey * ey), 0, 1);
    const qx = vx - ex * t;
    const qy = vy - ey * t;
    best = Math.min(best, qx * qx + qy * qy);
    if (vx * ey - vy * ex > 0) inside = 0;
  }
  return Math.sqrt(best) * (inside ? -1 : 1);
}

function letterNormal(px, py, body) {
  const step = 0.004;
  const dx = letterDistance(px + step, py, body) - letterDistance(px - step, py, body);
  const dy = letterDistance(px, py + step, body) - letterDistance(px, py - step, body);
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

function asciiFlowSpeed() {
  return num('speed') * 0.26;
}

function setupAscii() {
  setupWaterMotion();
  modeState.scroll = 0;
  modeState.eddies = [];
  modeState.shed = 0;
  modeState.side = 1;
  modeState.fronts = [];
  modeState.bow = 0;
}

function stepAscii() {
  stepWaterStudy();
  const flow = asciiFlowSpeed();
  const body = letterBody();
  modeState.scroll += flow * STEP;

  for (const eddy of modeState.eddies) {
    eddy.age += STEP;
    eddy.y -= flow * STEP;
    eddy.x += eddy.spin * 0.018 * STEP;
  }
  while (modeState.eddies.length && (modeState.eddies[0].y < -0.2 || modeState.eddies[0].age > 7)) {
    modeState.eddies.shift();
  }

  /* Фронты живут в воде сами и стареют всегда, даже когда буква убрана:
     раньше выход стоял выше, и снятая буква не убирала след, а замораживала
     его — клин повисал в кадре навсегда. Теперь он доживает своё и уходит
     вниз по течению. */
  for (const front of modeState.fronts) {
    front.age += STEP;
    front.y -= flow * STEP;
  }
  while (modeState.fronts.length && modeState.fronts[0].age > 3.2) modeState.fronts.shift();

  if (!on('body')) return;

  /* Тело неподвижно в кадре, но относительно воды идёт непрерывно — значит
     и волну гонит непрерывно. Носовые фронты рождаются раз в такт и дальше
     расходятся медленнее, чем идёт тело, поэтому их огибающая складывается
     в клин. */
  modeState.bow += STEP;
  if (modeState.bow >= 0.11) {
    modeState.bow = 0;
    modeState.fronts.push({ x: body.apex.x, y: body.apex.y, age: 0 });
    if (modeState.fronts.length > 26) modeState.fronts.shift();
  }

  /* Частота схода растёт со скоростью и падает с размером тела — число
     Струхаля почти постоянно, поэтому шаг дорожки держится сам. */
  modeState.shed += STEP;
  const period = (0.75 * body.spread) / Math.max(flow, 0.02);
  if (modeState.shed >= period) {
    modeState.shed = 0;
    modeState.side = -modeState.side;
    const corner = modeState.side < 0 ? body.left : body.right;
    modeState.eddies.push({
      x: corner.x + modeState.side * 0.012,
      y: corner.y,
      spin: modeState.side,
      force: letterHeel(body, modeState.side),
      age: 0,
    });
    if (modeState.eddies.length > 14) modeState.eddies.shift();
  }
}

function drawAsciiWater() {
  const detailMix = clamp((num('detail') - 0.55) / 1.65, 0, 1);
  const cell = Math.round(lerp(22, 8, detailMix));
  const cols = Math.ceil(S / cell);
  const rows = Math.ceil(S / cell);
  const time = modeState.time * num('speed');
  const drift = modeState.scroll;
  const body = letterBody();
  const standing = on('body');
  const gain = num('gain');
  const floor = num('floor');
  const bow = num('bow');
  const trail = num('trail');
  const blocks = on('blocks');
  const ramp = blocks ? BLOCK_RAMP : ASCII_RAMP;

  ctx.save();
  ctx.fillStyle = ink(1);
  ctx.font = `${Math.round(cell * 1.04)}px "DM Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  /* Блочные знаки уже кегля клетки: у моноширинного шрифта ширина знака
     около 0.6 высоты, и сплошной █ вышел бы вертикальной полоской, а поле —
     штрихкодом. Растягиваем ряд по горизонтали, чтобы клетка закрывалась
     целиком: у блоков доля закраски и есть шкала. */
  const stretch = blocks ? (cell + 0.6) / Math.max(ctx.measureText('\u2588').width, 0.001) : 1;
  if (stretch !== 1) ctx.scale(stretch, 1);
  /* Тон растянут на клетку, а треугольник направления — нет: широкий он
     читается флажком, а не течением. Поэтому штрихи копим и рисуем вторым
     проходом: save/restore на каждой клетке стоил половины кадров. */
  const marks = [];

  /* Радиус и запас фронта не зависят от клетки, а клеток десять тысяч:
     раньше на каждую из них приходился ещё и опрос ползунка. Считаем
     кольцо один раз за кадр и отбраковываем по квадрату расстояния. */
  const flowNow = asciiFlowSpeed();
  const echo = num('amount');
  const rings = modeState.fronts.map((front) => {
    const radius = front.age * flowNow * 0.55;
    const inner = Math.max(radius - 0.13, 0);
    return {
      x: front.x,
      y: front.y,
      radius,
      inner2: inner * inner,
      outer2: (radius + 0.13) * (radius + 0.13),
      life: Math.exp(-front.age * 0.5) * 0.24,
    };
  });

  for (let row = 0; row < rows; row += 1) {
    const y = (row + 0.5) * cell;
    const v = 1 - y / S;
    for (let col = 0; col < cols; col += 1) {
      const x = (col + 0.5) * cell;
      const u = x / S;

      const rim = standing ? letterDistance(u, v, body) : 1;
      if (rim < 0) continue;

      let flowVelocityX = 0;
      let flowVelocityY = -1;
      let near = 0;
      let bernoulli = 0;
      let shade = 0;
      let across = 0;
      let scatter = 0;
      let flowU = u;
      let flowV = v;

      if (standing) {
        near = Math.exp(-rim * 9);
      }

      /* Всё, что считается через нормаль, входит с множителем near, а он
         на полклетки от борта уже меньше сотой. Дальше нормаль не считаем:
         численный градиент — четыре расстояния до контура на клетку, и это
         самая дорогая часть кадра. */
      if (standing && rim < 0.55) {
        const normal = letterNormal(u, v, body);

        /* У борта вода не может идти сквозь тело: нормальную составляющую
           гасим, и поток сам поворачивает вдоль контура. */
        const along = flowVelocityX * normal.x + flowVelocityY * normal.y;
        flowVelocityX -= along * normal.x * near;
        flowVelocityY -= along * normal.y * near;

        /* Одного гашения мало: перед носом нормаль смотрит вверх, гасится
           почти вся скорость, и вода там не обтекает, а замирает. Стрелка
           же ставится по отклонению от сноса, которое как раз в этой точке
           наибольшее, — выходило неподвижное веерное пятно над вершиной,
           показывающее направление у вектора почти нулевой длины. Поэтому
           снятое с нормали возвращаем в касательную: вода не останавливается,
           а расходится вдоль борта. */
        const tangentX = -normal.y;
        const tangentY = normal.x;
        const side = flowVelocityX * tangentX + flowVelocityY * tangentY;
        const turn = Math.abs(along) * near * (side < 0 ? -1 : 1);
        flowVelocityX += tangentX * turn;
        flowVelocityY += tangentY * turn;

        /* Там, где борт стоит поперёк хода, поток разгоняется — и по Бернулли
           проседает. Спереди наоборот: застой поднимает воду бугром.
           Раньше и спереди, и с боков шёл плюс, отчего вокруг тела вставало
           сплошное свечение, ничего не сообщавшее. */
        /* Нормаль наружу, течение вниз: борт стоит навстречу воде там, где
           нормаль смотрит вверх. Знак был перевёрнут, и вал вставал у кормы
           вместо носа — под мягким свечением этого не было видно. */
        const facing = normal.y;
        const speed = 1 + near * 0.9 * (1 - Math.abs(facing));
        bernoulli = (1 - speed * speed) * 0.5 * near;

        /* Бурун. Раньше встречный борт просто добавлял света с плавным
           спадом — выходило облако вокруг тела, ничего не говорящее.
           На натуре у носа стоит узкий вал прямо по обшивке, а сразу за
           ним — провал. Поэтому вал считаем не размытым пятном, а полосой
           заданной ширины вдоль контура, и следом ставим тень: столкновение
           читается по перепаду, а не по яркости. Силу берёт та грань,
           что стоит поперёк хода, — у Л это косая нога. */
        if (facing > 0) {
          const ridge = (rim - 0.014) / 0.018;
          const dip = (rim - 0.062) / 0.034;
          bernoulli += facing * bow * (Math.exp(-ridge * ridge) * 1.15 - Math.exp(-dip * dip) * 0.6);
        }

        /* Линии тока раздвигаются перед телом и смыкаются за ним. */
        const push = near * 0.5;
        flowU = u + normal.x * push * 0.12;
        flowV = v + normal.y * push * 0.12;
      }

      if (standing) {
        /* Коридор за кормой. «Шлейф» тянет его вниз по течению: чем длиннее,
           тем медленнее гаснет, — и одновременно углубляет затишье. */
        const behind = body.left.y - v;
        if (behind > 0) {
          const halfWidth = body.spread * 0.5 + behind * 0.35;
          across = (u - 0.5) / Math.max(halfWidth, 0.0001);
          /* Коридор считается только ниже кормы. Раньше «за телом» бралось
             как max(0, …), и выше кормы затишье не кончалось, а держалось
             в полную силу до верхнего края — вверх по течению уходила та же
             полоса, что и вниз. */
          shade = Math.exp(-across * across) * Math.exp(-behind * 1.8 / Math.max(trail, 0.2));
        }

        /* Отражение идёт от контура, а не от окружности: у прямого борта
           фронты прямые, у косого — косые. */
        const frontPhase = (body.apex.y + drift) * 22 + body.apex.x * 2.2 + time * 0.22;
        const lobe = 0.5 + 0.5 * clamp((v - 0.5) / Math.max(body.height, 0.0001) * 2, -1, 1);
        scatter = Math.sin(22 * rim - frontPhase) * 0.42 * lobe / Math.sqrt(1 + 22 * rim);
      }

      const waterV = flowV + drift;
      let ripple = Math.sin(waterV * 22 + flowU * 2.2 + time * 0.22) * 0.22;
      ripple += Math.sin(waterV * 38 - flowU * 6.5 + time * 0.16) * 0.11;
      ripple += Math.sin(waterV * 15 + flowU * 8.0 + time * 0.09) * 0.06;

      let field = ripple * (1 - Math.min(0.62 * trail, 0.94) * shade) + scatter + bernoulli * 0.62;

      /* Одного затишья мало: гладкий коридор читается дырой, а не шлейфом.
         Внутри него вода расчёсана вдоль хода на струи, и струи едут с
         водой — это и делает след следом. */
      if (shade > 0.02) {
        /* Фаза только поперечная: стоило подмешать в неё продольную волну,
           как полосы поехали наискось, а расширение коридора вниз по течению
           доворачивало их ещё — след закручивался спиралью. Струя идёт вдоль
           хода, поэтому вдоль хода меняется не фаза, а сила: волна яркости
           бежит по неподвижным струям вместе с водой. */
        const streak = Math.sin(across * 7.5);
        const pulse = 0.62 + 0.38 * Math.sin(waterV * 9 + time * 0.3);
        field += streak * pulse * shade * 0.34 * trail;
      }
      let wakeEnvelope = 0;

      for (const eddy of modeState.eddies) {
        const ex = u - eddy.x;
        const ey = v - eddy.y;
        const distance2 = ex * ex + ey * ey;
        const core = body.spread * (0.3 + eddy.age * 0.2);
        const q = distance2 / (core * core);
        if (q > 9) continue;
        const decay = Math.exp(-eddy.age * 0.42) * Math.exp(-q) * eddy.force;
        const reach = Math.max(Math.sqrt(distance2), 0.004);
        /* Ядро проваливается, по кромке вода вздымается: у вихря видно
           и воронку, и вал вокруг неё. */
        field += decay * (Math.min(q, 2.4) - 0.9) * 0.62;
        wakeEnvelope = Math.max(wakeEnvelope, decay);
        const swirl = eddy.spin * decay * 2.4;
        flowVelocityX += (-ey / reach) * swirl;
        flowVelocityY += (ex / reach) * swirl;
      }

      for (const ring of rings) {
        const dx = u - ring.x;
        const dy = v - ring.y;
        const reach2 = dx * dx + dy * dy;
        /* Гребень узкий, и считать синус вдали от него незачем. */
        if (reach2 > ring.outer2 || reach2 < ring.inner2) continue;
        /* Фронтов в воде десятки, и каждый должен быть тих: громкими они
           складываются не в клин, а в пятно вокруг тела. */
        const offset = Math.sqrt(reach2) - ring.radius;
        const crest = Math.exp(-Math.abs(offset) * 26);
        field += Math.sin(offset * 44) * crest * ring.life;
      }

      for (const trail of modeState.trails) {
        const dx = u - trail.x;
        const dy = v - trail.y;
        const reach = Math.hypot(dx, dy);
        const life = Math.exp(-trail.age * 0.58) * trail.strength * echo;
        const radius = trail.age * (0.11 + trail.strength * 0.055);
        const front = Math.exp(-Math.abs(reach - radius) * 17);
        field += Math.sin((reach - radius) * 54) * front * life * 0.9;
      }

      const mouseDistance = Math.hypot(u - modeState.mouse.x, v - modeState.mouse.y);
      const force = Math.min(Math.hypot(modeState.velocity.x, modeState.velocity.y) * 26, 1) * echo;
      field += Math.sin(mouseDistance * 48 - time * 3) * Math.exp(-mouseDistance * mouseDistance * 32) * force;

      /* Сначала наклон — им задают размах воды, потом срез снизу: он убирает
         спокойную гладь, оставляя одни гребни, и остаток растягивается на всю
         шкалу, чтобы срез не съедал заодно и градации. */
      const raw = 0.5 + field * gain - wakeEnvelope * 0.2;
      const level = clamp((raw - floor) / Math.max(1 - floor, 0.08), 0, 1);
      const index = Math.min(ramp.length - 1, Math.floor(level * ramp.length));
      let glyph = ramp[index];
      let stroke = false;
      /* Штрих ставим не рядом с телом, а там, где вода действительно
         поворачивает: меряем отклонение от общего сноса вниз. По близости
         выходило кольцо вокруг буквы и сплошные поля одинаковых стрелок —
         обводка области, а не течение. Стрелка вниз там, где и так всё
         едет вниз, не сообщает ничего. */
      const swing = Math.hypot(flowVelocityX, flowVelocityY + 1);
      const pace = Math.hypot(flowVelocityX, flowVelocityY);
      /* Стрелки ставим по редкой сетке: в каждой клетке они слипаются в
         сплошное поле треугольников, которое читается пятном вокруг буквы,
         а не течением. */
      if (on('strokes') && (row % 3 === 1) && (col % 3 === 1) && level > 0.18 && swing > 0.22 && pace > 0.35) {
        stroke = true;
        /* Рисуем не саму скорость, а её отклонение от общего сноса — то же,
           по чему штрих и отбирается. Абсолютная скорость в реке почти всюду
           направлена вниз, и поле выходило сплошной массой одинаковых
           треугольников. У отклонения же вихрь читается вращением, а нос —
           расступлением. */
        const screenVelocityX = flowVelocityX;
        const screenVelocityY = -(flowVelocityY + 1);
        const horizontal = Math.abs(screenVelocityX);
        const vertical = Math.abs(screenVelocityY);
        if (blocks) {
          if (vertical > horizontal * 1.45) glyph = screenVelocityY < 0 ? BLOCK_STROKES.up : BLOCK_STROKES.down;
          else if (horizontal > vertical * 1.45) glyph = screenVelocityX > 0 ? BLOCK_STROKES.right : BLOCK_STROKES.left;
          else if (screenVelocityX > 0) glyph = screenVelocityY < 0 ? BLOCK_STROKES.ne : BLOCK_STROKES.se;
          else glyph = screenVelocityY < 0 ? BLOCK_STROKES.nw : BLOCK_STROKES.sw;
        } else if (vertical > horizontal * 1.45) glyph = '|';
        else if (horizontal > vertical * 1.45) glyph = '-';
        else glyph = screenVelocityX * screenVelocityY > 0 ? '\\' : '/';
      }
      if (glyph === ' ') continue;
      /* Гамма растягивает верх: знаков там мало и они близки по весу,
         так что тона у гребней даёт прозрачность, а не набор. */
      ctx.globalAlpha = 0.22 + Math.pow(level, 0.62) * 0.78;
      if (stroke && stretch !== 1) marks.push(glyph, x, y, ctx.globalAlpha);
      else ctx.fillText(glyph, x / stretch, y);
    }
  }

  if (stretch !== 1) ctx.scale(1 / stretch, 1);
  for (let i = 0; i < marks.length; i += 4) {
    ctx.globalAlpha = marks[i + 3];
    ctx.fillText(marks[i], marks[i + 1], marks[i + 2]);
  }

  ctx.globalAlpha = 1;
  if (standing) {
    ctx.fillStyle = ink(0.97);
    ctx.beginPath();
    ctx.moveTo(body.apex.x * S, (1 - body.apex.y) * S);
    ctx.lineTo(body.right.x * S, (1 - body.right.y) * S);
    ctx.lineTo(body.left.x * S, (1 - body.left.y) * S);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

MODES.ascii = {
  label: 'ascii',
  note: 'Л идёт вверх, камера держит её в центре — поэтому река едет сверху вниз. Перед буквой вода встаёт бугром и расходится вдоль бортов, у бортов проседает, позади остаётся волновая тень, а с углов по очереди срываются вихри: косой борт срывает сильнее прямого. С носа непрерывно сходят волновые фронты — они живут в воде сами и складываются в клин. «Симметрия» ставит вершину посередине, и обе грани начинают срывать поровну: видно, что несимметричный след — заслуга именно Л. «Буква» убирает тело целиком. «Шлейф» тянет коридор за кормой: углубляет затишье и расчёсывает его на струи, которые едут вместе с водой. «Бурун» — сила вала у встречного борта: он стоит узкой полосой по обшивке, сразу за ним провал, и берёт его та грань, что стоит поперёк хода. «Размах» задаёт силу воды, «срез» съедает спокойную гладь снизу и оставляет одни гребни, а «штрихи» редкой сеткой показывают отклонение от сноса там, где вода поворачивает: у косой грани, на срывах и в вихрях. Стрелка вниз посреди реки, которая и так вся едет вниз, ничего не сообщает, поэтому ровный снос остаётся тоном. «Блоки» меняют набор: у пунктуации плотный конец обрывается на @, у геометрии ступень — это доля закрашенной клетки, и штрихи показывают все восемь направлений треугольниками.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'speed', label: 'течение', min: 0.15, max: 1.8, step: 0.05, value: 0.62 },
    { type: 'range', key: 'amount', label: 'эхо', min: 0, max: 2, step: 0.05, value: 1.1 },
    { type: 'range', key: 'detail', label: 'кегль', min: 0.55, max: 2.2, step: 0.05, value: 1.15 },
    { type: 'range', key: 'rise', label: 'рост', min: 0.06, max: 0.2, step: 0.005, value: 0.12 },
    { type: 'range', key: 'spread', label: 'раствор', min: 0.08, max: 0.34, step: 0.01, value: 0.2 },
    { type: 'range', key: 'gain', label: 'размах', min: 0.25, max: 1.8, step: 0.05, value: 0.7 },
    { type: 'range', key: 'floor', label: 'срез', min: 0, max: 0.7, step: 0.02, value: 0 },
    { type: 'range', key: 'bow', label: 'бурун', min: 0, max: 2.5, step: 0.05, value: 1.15 },
    { type: 'range', key: 'trail', label: 'шлейф', min: 0, max: 2.5, step: 0.05, value: 1 },
    { type: 'toggle', key: 'body', label: 'буква', value: true },
    { type: 'toggle', key: 'even', label: 'симметрия', value: false },
    { type: 'toggle', key: 'strokes', label: 'штрихи', value: true },
    { type: 'toggle', key: 'blocks', label: 'блоки', value: true },
  ],
  setup: setupAscii,
  onMove: moveWaterStudy,
  onDown: moveWaterStudy,
  step: stepAscii,
  draw: drawAsciiWater,
};

MODES.pixel = waterStudyMode(
  WATER_PIXEL_FRAGMENT,
  'Низкоразрешённая вода с четырьмя ступенями света. Курсор запускает квадратные фронты и россыпь пиксельной пены.',
  { mode: 'пиксели', speed: 'течение', amount: 'всплеск', detail: 'разрешение' },
  { speed: 0.76, amount: 1.15, detail: 0.9 },
);

/* ---------- эхо апекса ---------- */

/* Импульс проходит по одной ноге к вершине и возвращается по другой. На
   кончике его надо поймать кликом: удачный клик разворачивает маршрут, поздний
   или сделанный не на той ноге гасит эхо. */

const ECHO = {
  apex: { x: 0.57, y: 0.18 },
  feet: [{ x: 0.25, y: GROUND }, { x: 0.57, y: GROUND }],
};

function echoPoint(side, phase, t) {
  const start = ECHO.feet[side];
  const end = ECHO.feet[1 - side];
  return phase === 0
    ? { x: lerp(start.x, ECHO.apex.x, t), y: lerp(start.y, ECHO.apex.y, t) }
    : { x: lerp(ECHO.apex.x, end.x, t), y: lerp(ECHO.apex.y, end.y, t) };
}

function echoSide() {
  const split = (ECHO.feet[0].x + ECHO.feet[1].x) / 2;
  return pointer.x < split ? 0 : 1;
}

/* Вода не полем, а роем. У каждой точки своя скорость: снос тянет её вниз,
   контур Л она встречает по-настоящему — сквозь грань не проходит, а гасит
   нормальную составляющую и скользит вдоль. Вихри никто не расставляет:
   точки чувствуют соседей, вязкость подтягивает их к общей скорости, а
   давление растаскивает при сгущении — сорванный с угла слой сдвига
   сворачивается сам. Хвост из прошлых положений превращает рой в линии тока:
   у косой ноги линия идёт долго и полого, у прямой рвётся сразу за углом. */
const SWIRL_TAIL = 22;
const SWIRL_CORE = 0.0016;

function swirlSeed(part, y) {
  part.x = Math.random();
  part.y = y;
  for (let i = 0; i < SWIRL_TAIL; i += 1) {
    part.px[i] = part.x;
    part.py[i] = part.y;
  }
  part.head = 0;
}

function swirlFlow() {
  return num('speed') * 0.26;
}

function setupSwirl() {
  modeState.parts = [];
  modeState.blobs = [];
  modeState.crowd = 0;
  modeState.shed = 0;
  swirlFill();
}

function swirlFill() {
  const crowd = Math.round(num('crowd'));
  if (crowd === modeState.crowd) return;
  const parts = modeState.parts;
  while (parts.length > crowd) parts.pop();
  while (parts.length < crowd) {
    const part = { x: 0, y: 0, px: new Float64Array(SWIRL_TAIL), py: new Float64Array(SWIRL_TAIL), head: 0, swing: 0 };
    swirlSeed(part, Math.random());
    parts.push(part);
  }
  modeState.crowd = crowd;
}

/* Скорость в точке: общий снос плюс то, что наводят вихри. Ядро конечного
   радиуса — иначе у самого центра скорость улетает в бесконечность. */
function swirlVelocity(x, y, blobs, flow, out, body) {
  let vx = 0;
  let vy = -flow;

  /* Тело в потоке — это не только стенка. Одного отталкивания у обшивки мало:
     точки расходятся перед буквой и больше не сходятся, за кормой навсегда
     остаётся пустая труба. В воде линии тока замыкает само тело, поэтому
     добавляем классическое обтекание — поле диполя, у которого на поверхности
     скорость чисто касательная, а вдали снос ровный. Форму держит уже стенка,
     диполю достаточно радиуса с букву. */
  if (body) {
    const dx = x - body.mid.x;
    const dy = y - body.mid.y;
    const r2 = dx * dx + dy * dy;
    if (r2 > body.girth) {
      const share = body.girth / r2;
      const dot = (vy * dy) / r2;
      vx -= share * (2 * dot * dx);
      vy -= share * (2 * dot * dy - vy);
    }
  }
  for (const blob of blobs) {
    const dx = x - blob.x;
    const dy = y - blob.y;
    const r2 = dx * dx + dy * dy + SWIRL_CORE;
    const k = blob.turn / r2;
    vx -= dy * k;
    vy += dx * k;
  }
  out.x = vx;
  out.y = vy;
  return out;
}

/* Завихренность рождается на стенке: вода не может скользить по борту без
   трения, и весь этот сдвиг сходит с острого угла в воду. Поэтому вихри
   никто не расставляет по расписанию — сила схода берётся из скорости у
   грани, а грань у Л разная: косая разгоняет сильнее прямой. Дальше вихри
   двигают друг друга сами, и дорожка складывается из их взаимного вращения. */
function swirlShed(body, blobs, flow) {
  const probe = { x: 0, y: 0 };
  for (const side of [-1, 1]) {
    const corner = side < 0 ? body.left : body.right;
    const x = corner.x + side * 0.02;
    const y = corner.y + 0.004;
    swirlVelocity(x, y, blobs, flow, probe, body);
    const edge = Math.hypot(probe.x, probe.y) * letterHeel(body, side);
    blobs.push({
      x,
      y,
      turn: -side * edge * edge * 0.011 * num('curl'),
      age: 0,
    });
  }
  while (blobs.length > 260) blobs.shift();
}

function stepSwirl() {
  swirlFill();
  const parts = modeState.parts;
  const blobs = modeState.blobs;
  const flow = swirlFlow();
  const body = letterBody();
  const standing = on('body');
  const probe = { x: 0, y: 0 };

  if (standing) {
    modeState.shed += STEP;
    const beat = 0.055 / Math.max(flow / 0.16, 0.25);
    if (modeState.shed >= beat) {
      modeState.shed = 0;
      swirlShed(body, blobs, flow);
    }
  }

  /* Вихри несёт течение и наводят друг друга — сами себя не крутят. */
  for (const blob of blobs) {
    swirlVelocity(blob.x, blob.y, blobs, flow, probe, standing ? body : null);
    const own = blob.turn / SWIRL_CORE;
    blob.x += probe.x * STEP;
    blob.y += (probe.y - 0) * STEP;
    blob.age += STEP;
    blob.turn *= 1 - 0.16 * STEP;
    void own;
  }
  for (let i = blobs.length - 1; i >= 0; i -= 1) {
    if (blobs[i].y < -0.25 || Math.abs(blobs[i].turn) < 0.00002) blobs.splice(i, 1);
  }

  for (const part of parts) {
    swirlVelocity(part.x, part.y, blobs, flow, probe, standing ? body : null);
    let vx = probe.x;
    let vy = probe.y;

    if (standing) {
      const rim = letterDistance(part.x, part.y, body);
      if (rim < 0.02) {
        const normal = letterNormal(part.x, part.y, body);
        if (rim < 0.004) {
          const out = 0.004 - rim;
          part.x += normal.x * out;
          part.y += normal.y * out;
        }
        /* Сквозь борт точка не идёт: нормальную составляющую гасим у самой
           обшивки и отпускаем на расстоянии — так линия тока сама ложится
           вдоль грани, а не ломается об неё. */
        const into = vx * normal.x + vy * normal.y;
        if (into < 0) {
          const grip = 1 - Math.max(rim, 0) / 0.02;
          vx -= into * normal.x * grip;
          vy -= into * normal.y * grip;
        }
      }
    }

    part.swing = Math.hypot(vx, vy + flow) / Math.max(flow, 0.02);
    part.x += vx * STEP;
    part.y += vy * STEP;
    if (part.x < 0) part.x += 1;
    if (part.x > 1) part.x -= 1;
    if (part.y < -0.04) swirlSeed(part, 1.04);

    part.head = (part.head + 1) % SWIRL_TAIL;
    part.px[part.head] = part.x;
    part.py[part.head] = part.y;
  }
}

function drawSwirl() {
  const body = letterBody();
  const tail = Math.max(2, Math.round(num('tail')));

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, S * 0.0016);

  /* Разбираем рой на четыре ленты по тому, насколько точка отклонилась от
     общего сноса: ровная вода уходит в фон, закрученная выступает вперёд.
     Четыре пути вместо тысячи — иначе кадр уходит на смену прозрачности. */
  const bands = [[], [], [], []];
  for (const part of modeState.parts) {
    bands[Math.min(3, Math.floor(part.swing * 2.6))].push(part);
  }

  for (let band = 0; band < 4; band += 1) {
    if (!bands[band].length) continue;
    ctx.strokeStyle = ink(0.18 + band * 0.27);
    ctx.beginPath();
    for (const part of bands[band]) {
      let first = true;
      for (let i = tail - 1; i >= 0; i -= 1) {
        const at = (part.head - i + SWIRL_TAIL * 2) % SWIRL_TAIL;
        const back = (at + SWIRL_TAIL - 1) % SWIRL_TAIL;
        const x = part.px[at] * S;
        const y = (1 - part.py[at]) * S;
        /* Точка, ушедшая за край, возвращается с другой стороны — хвост через
           весь кадр рисовать нельзя. */
        if (first || Math.abs(part.px[at] - part.px[back]) > 0.5) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        first = false;
      }
    }
    ctx.stroke();
  }

  if (on('body')) {
    ctx.fillStyle = ink(0.97);
    ctx.beginPath();
    ctx.moveTo(body.apex.x * S, (1 - body.apex.y) * S);
    ctx.lineTo(body.right.x * S, (1 - body.right.y) * S);
    ctx.lineTo(body.left.x * S, (1 - body.left.y) * S);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  drawStatus(count(modeState.blobs.length, 'вихрь', 'вихря', 'вихрей'), false);
}

MODES.swirl = {
  label: 'трассеры',
  note: 'Вода здесь не поле, а рой: точки идут по течению и тянут за собой хвост из прошлых положений — получаются линии тока. Контур Л они встречают по-настоящему: сквозь грань не проходят, гасят нормальную составляющую и скользят вдоль. Обтекание вдали держит поле диполя — иначе точки расходятся перед буквой и больше не сходятся, за кормой навсегда остаётся пустая труба. Вихри никто не расставляет по расписанию: завихренность рождается на стенке, сходит с острых углов, и сила схода берётся из скорости у самой грани — у Л косая нога разгоняет сильнее прямой. Дальше вихри двигают друг друга сами: дорожка складывается из их взаимного вращения, а не из формулы. «Завихрение» задаёт, насколько охотно грань отдаёт вихрь; «симметрия» ставит вершину посередине, и обе ноги начинают срывать одинаково.
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'speed', label: 'течение', min: 0.15, max: 1.8, step: 0.05, value: 0.62 },
    { type: 'range', key: 'crowd', label: 'рой', min: 200, max: 3000, step: 50, value: 1600 },
    { type: 'range', key: 'curl', label: 'завихрение', min: 0, max: 3, step: 0.05, value: 1 },
    { type: 'range', key: 'tail', label: 'хвост', min: 2, max: 22, step: 1, value: 14 },
    { type: 'range', key: 'rise', label: 'рост', min: 0.06, max: 0.2, step: 0.005, value: 0.12 },
    { type: 'range', key: 'spread', label: 'раствор', min: 0.08, max: 0.34, step: 0.01, value: 0.2 },
    { type: 'toggle', key: 'body', label: 'буква', value: true },
    { type: 'toggle', key: 'even', label: 'симметрия', value: false },
  ],
  setup: setupSwirl,
  step: stepSwirl,
  draw: drawSwirl,
};


MODES.echo = {
  label: 'эхо',
  note: 'Кликни по одной ноге — импульс пойдёт к вершине. Кликни по другой, когда он почти дошёл: эхо развернётся. Ранний, поздний или неверный клик гасит импульс. Красное — сорванное эхо.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'tempo', label: 'темп', min: 0.35, max: 1.4, step: 0.05, value: 0.8 },
    { type: 'range', key: 'window', label: 'окно', min: 0.05, max: 0.3, step: 0.01, value: 0.14 },
    { type: 'button', label: 'заново', action: () => MODES.echo.setup() },
  ],

  setup() {
    modeState.pulse = null;
    modeState.echoes = 0;
    modeState.misses = 0;
    modeState.flash = 0;
    modeState.trail = [];
  },

  onDown() {
    const side = echoSide();
    if (!modeState.pulse) {
      modeState.pulse = { from: side, to: 1 - side, phase: 0, t: 0 };
      return;
    }

    const pulse = modeState.pulse;
    const window = num('window');
    const arriving = pulse.phase === 1 && side === pulse.to;
    const caught = arriving && pulse.t >= 1 - window && pulse.t < 1;
    if (!caught) {
      modeState.misses += 1;
      modeState.flash = -1;
      modeState.pulse = null;
      return;
    }

    modeState.echoes += 1;
    modeState.flash = 1;
    modeState.trail.push({ from: pulse.from, to: pulse.to });
    if (modeState.trail.length > 8) modeState.trail.shift();
    modeState.pulse = { from: pulse.to, to: pulse.from, phase: 0, t: 0 };
  },

  step() {
    modeState.flash *= 0.9;
    const pulse = modeState.pulse;
    if (!pulse) return;

    pulse.t += STEP * num('tempo') * 1.8;
    if (pulse.t < 1) return;
    if (pulse.phase === 0) {
      pulse.phase = 1;
      pulse.t = 0;
      return;
    }

    modeState.misses += 1;
    modeState.flash = -1;
    modeState.pulse = null;
  },

  draw() {
    baseline();
    for (const trail of modeState.trail) {
      legs(
        ECHO.apex.x,
        ECHO.apex.y,
        ECHO.feet[trail.from].x,
        ECHO.feet[trail.from].y,
        ECHO.feet[trail.to].x,
        ECHO.feet[trail.to].y,
        0.13,
        STEM * 0.65,
      );
    }

    legs(
      ECHO.apex.x,
      ECHO.apex.y,
      ECHO.feet[0].x,
      ECHO.feet[0].y,
      ECHO.feet[1].x,
      ECHO.feet[1].y,
      0.85,
      STEM,
    );
    dot(ECHO.apex.x, ECHO.apex.y, Math.abs(modeState.flash) > 0.12 ? RED : INK, 0.012);

    for (const foot of ECHO.feet) {
      ctx.beginPath();
      ctx.arc(foot.x * S, foot.y * S, 0.025 * S, 0, TAU);
      ctx.strokeStyle = ink(0.2);
      ctx.lineWidth = 0.002 * S;
      ctx.stroke();
    }

    if (modeState.pulse) {
      const pulse = modeState.pulse;
      const point = echoPoint(pulse.from, pulse.phase, pulse.t);
      dot(point.x, point.y, ink(1), 0.014);
      if (pulse.phase === 1) {
        const remaining = 1 - pulse.t;
        line(
          ECHO.feet[pulse.to].x,
          ECHO.feet[pulse.to].y,
          ECHO.feet[pulse.to].x,
          ECHO.feet[pulse.to].y + 0.045 * remaining,
          ink(0.5),
          0.004,
        );
      }
    }

    drawStatus(
      `${count(modeState.echoes, 'эхо', 'эхо', 'эхо')} · ${count(modeState.misses, 'срыв', 'срыва', 'срывов')}`,
      modeState.flash < -0.12,
    );
  },
};

/* ---------- развилка маршрутов ---------- */

/* Вершина принимает одиночный поток и отправляет его в одну из двух ног.
   Цель меняется после каждого выпуска, а маршрут фиксируется в момент входа. */

const FORK = {
  apex: { x: 0.57, y: 0.18 },
  feet: [{ x: 0.25, y: GROUND }, { x: 0.57, y: GROUND }],
};

function forkPoint(side, t) {
  return {
    x: lerp(FORK.apex.x, FORK.feet[side].x, t),
    y: lerp(FORK.apex.y, FORK.feet[side].y, t),
  };
}

function forkSetRoute(side) {
  modeState.route = side;
}

MODES.fork = {
  label: 'развилка',
  note: 'Кликай слева или справа от вершины, чтобы перевести поток в нужную ногу; работают и стрелки. Цель отмечена у выхода, но маршрут фиксируется в момент входа. Красное — поток ушёл не туда.',
  cursor: 'pointer',
  tools: [
    { type: 'range', key: 'tempo', label: 'темп', min: 0.25, max: 1.2, step: 0.05, value: 0.55 },
    { type: 'range', key: 'pause', label: 'пауза', min: 0.25, max: 1.4, step: 0.05, value: 0.7 },
    { type: 'button', label: 'заново', action: () => MODES.fork.setup() },
  ],

  setup() {
    modeState.route = 0;
    modeState.target = 0;
    modeState.packet = null;
    modeState.wait = 0;
    modeState.good = 0;
    modeState.bad = 0;
    modeState.flash = 0;
  },

  onDown() {
    const split = (FORK.feet[0].x + FORK.feet[1].x) / 2;
    forkSetRoute(pointer.x < split ? 0 : 1);
  },

  onMove() {
    if (!pointer.down) return;
    const split = (FORK.feet[0].x + FORK.feet[1].x) / 2;
    forkSetRoute(pointer.x < split ? 0 : 1);
  },

  onKey(event, down) {
    if (!down) return;
    if (event.code === 'ArrowLeft') forkSetRoute(0);
    if (event.code === 'ArrowRight') forkSetRoute(1);
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') event.preventDefault();
  },

  step() {
    modeState.flash *= 0.9;
    if (modeState.packet) {
      modeState.packet.t += STEP * num('tempo') * 1.7;
      if (modeState.packet.t < 1) return;

      if (modeState.packet.route === modeState.packet.target) {
        modeState.good += 1;
        modeState.flash = 1;
      } else {
        modeState.bad += 1;
        modeState.flash = -1;
      }
      modeState.target = 1 - modeState.target;
      modeState.packet = null;
      modeState.wait = 0;
      return;
    }

    modeState.wait += STEP;
    if (modeState.wait < num('pause')) return;
    modeState.packet = {
      route: modeState.route,
      target: modeState.target,
      t: 0,
    };
  },

  draw() {
    baseline();
    const active = modeState.route;
    legs(
      FORK.apex.x,
      FORK.apex.y,
      FORK.feet[0].x,
      FORK.feet[0].y,
      FORK.feet[1].x,
      FORK.feet[1].y,
      0.3,
      STEM,
    );
    line(
      FORK.apex.x,
      FORK.apex.y,
      FORK.feet[active].x,
      FORK.feet[active].y,
      ink(0.95),
      STEM * 1.45,
    );

    dot(FORK.apex.x, FORK.apex.y, Math.abs(modeState.flash) > 0.12 ? RED : INK, 0.012);
    for (let side = 0; side < 2; side += 1) {
      const foot = FORK.feet[side];
      ctx.beginPath();
      ctx.arc(foot.x * S, foot.y * S, 0.025 * S, 0, TAU);
      ctx.strokeStyle = side === modeState.target ? ink(0.75) : ink(0.18);
      ctx.lineWidth = side === modeState.target ? 0.004 * S : 0.002 * S;
      ctx.stroke();
    }

    if (modeState.packet) {
      const point = forkPoint(modeState.packet.route, modeState.packet.t);
      const right = modeState.packet.route === modeState.packet.target;
      dot(point.x, point.y, right ? ink(1) : RED, 0.014);
    }

    drawStatus(
      `${count(modeState.good, 'попадание', 'попадания', 'попаданий')} · ${count(modeState.bad, 'ошибка', 'ошибки', 'ошибок')}`,
      modeState.flash < -0.12,
    );
  },
};

/* ---------- стремянка ---------- */

/* Настоящая стремянка — это Л: лестничная сторона наклонная, подпорка прямая.
   Ноги одной длины не бывают: вертикальная равна высоте, наклонная — гипотенузе,
   поэтому раствор и рост связаны намертво. Отсюда игра: широкий раствор роняет
   вершину и разводит ноги распором, узкий поднимает вершину, но отнимает опору,
   и наверху качает тем сильнее, чем выше залез. */

const REACH = 0.07;
const LEG = 0.46;

MODES.ladder = {
  label: 'стремянка',
  note: 'Води курсор — стремянка идёт за ним, раствор на ползунке. Нажми и держи — лезешь; на верхней ступени рука достаёт до цели. Широко расставил — поедет по полу, узко — не устоишь: наверху качает. Красным — нога, которая пошла.',
  cursor: 'pointer',
  tools: [
    { type: 'range', key: 'span', label: 'раствор', min: 0.04, max: 0.3, step: 0.005, value: 0.16 },
    { type: 'range', key: 'grip', label: 'трение', min: 0.15, max: 0.7, step: 0.01, value: 0.4 },
    { type: 'button', label: 'заново', action: () => MODES.ladder.setup() },
  ],

  setup() {
    modeState.base = 0.5;
    modeState.span = num('span');
    modeState.climb = 0;
    modeState.sway = 0;
    modeState.swayV = 0;
    modeState.slip = 0;
    modeState.fall = 0;
    modeState.kind = '';
    modeState.gust = 0;
    modeState.taken = 0;
    modeState.goal = { x: 0.5, y: GROUND - 0.32 };
  },

  step() {
    if (modeState.fall > 0) {
      modeState.fall -= STEP;
      modeState.span += STEP * 0.5;
      if (modeState.fall <= 0) {
        modeState.climb = 0;
        modeState.sway = 0;
        modeState.swayV = 0;
        modeState.slip = 0;
        modeState.span = num('span');
      }
      return;
    }

    const climbing = pointer.down;
    if (!climbing && modeState.climb <= 0.001) {
      modeState.base = clamp(pointer.seen ? pointer.x : 0.5, 0.12, 0.94);
      modeState.span = num('span');
    }

    modeState.climb = clamp(modeState.climb + (climbing ? STEP * 0.7 : -STEP * 1.6), 0, 1);

    const span = modeState.span;
    const height = ladderHeight(span);

    /* Распор: чем шире ноги и чем выше груз, тем сильнее их разводит. */
    const thrust = (span / Math.max(height, 0.02)) * (0.35 + 0.65 * modeState.climb);
    const excess = thrust - num('grip');
    if (excess > 0) {
      modeState.slip = excess;
      modeState.span = clamp(span + excess * STEP * 1.6, 0.04, 0.5);
    } else {
      modeState.slip = Math.max(0, modeState.slip - STEP * 2);
    }

    /* Качание: белый шум на каждом кадре усреднился бы в ноль, поэтому ведёт
       медленный порыв, а обратно тянет пружина. Опора — ширина раствора:
       вышел за половину, и стремянка заваливается. */
    const shake = modeState.climb * (height / LEG);
    modeState.gust = modeState.gust * 0.96 + (Math.random() - 0.5) * 0.5;
    modeState.swayV += modeState.gust * shake * STEP * 2.6;
    modeState.swayV -= modeState.sway * STEP * 22;
    modeState.swayV *= 0.985;
    modeState.sway += modeState.swayV * STEP;

    if (Math.abs(modeState.sway) > span / 2 || modeState.span > 0.42) {
      modeState.fall = 1;
      modeState.kind = modeState.span > 0.42 ? 'поехала' : 'завалилась';
      return;
    }

    /* Тянутся рукой с той ступени, до которой долезли, а не только с верхней:
       низкую цель берут снизу, за высокой лезут туда, где качает. */
    if (modeState.climb > 0.05) {
      const hand = Math.hypot(
        handX(modeState.base, span, modeState.sway, modeState.climb) - modeState.goal.x,
        handY(height, modeState.climb) - modeState.goal.y,
      );
      if (hand < REACH) {
        modeState.taken += 1;
        modeState.climb = 0;
        modeState.goal = {
          x: clamp(0.2 + Math.random() * 0.6, 0.15, 0.85),
          y: GROUND - clamp(0.3 + modeState.taken * 0.025, 0, 0.62),
        };
      }
    }
  },

  onUp() { /* подъём кончается сам, отпускание читается в step */ },

  draw() {
    baseline();

    const span = modeState.span;
    const height = ladderHeight(span);
    const base = modeState.base;
    const tilt = modeState.fall > 0 ? 0 : modeState.sway;
    const apexX = base + tilt;
    const apexY = GROUND - height;
    const hot = modeState.slip > 0 || modeState.fall > 0;

    dot(modeState.goal.x, modeState.goal.y, ink(0.9), 0.008);
    ctx.beginPath();
    ctx.arc(modeState.goal.x * S, modeState.goal.y * S, REACH * S, 0, TAU);
    ctx.strokeStyle = ink(0.14);
    ctx.lineWidth = 0.002 * S;
    ctx.stroke();

    /* Ступени только на наклонной стороне: вторая нога — подпорка, а не лестница. */
    const steps = 6;
    for (let i = 1; i < steps; i += 1) {
      const u = i / steps;
      const x = lerp(base - span, apexX, u);
      const y = lerp(GROUND, apexY, u);
      line(x - 0.022, y, x + 0.022, y, ink(0.34), 0.004);
    }

    legs(apexX, apexY, base - span, GROUND, base, GROUND, 1, STEM);
    if (hot) {
      line(base - span, GROUND, base - span + 0.03, GROUND, RED, 0.008);
      line(base, GROUND, base - 0.03, GROUND, RED, 0.008);
    }

    if (modeState.climb > 0.02) {
      dot(handX(base, span, tilt, modeState.climb), handY(height, modeState.climb), ink(0.9), 0.011);
    }

    drawStatus(
      modeState.fall > 0 ? modeState.kind : count(modeState.taken, 'цель', 'цели', 'целей'),
      modeState.fall > 0,
    );
  },
};

/* Вертикальная нога равна росту, наклонная — постоянной длины: раздвинул шире,
   вершина села ниже. Это и есть весь торг стремянки. */
function ladderHeight(span) {
  return Math.sqrt(Math.max(0.0004, LEG * LEG - span * span));
}

/* Рука там, где стоят ноги: доля подъёма по наклонной, чуть выше ступени. */
function handX(base, span, tilt, climb) {
  return lerp(base - span, base + tilt, climb);
}

function handY(height, climb) {
  return lerp(GROUND, GROUND - height, climb) - 0.03;
}

/* ---------- ходьба ---------- */

/* Буква стоит на двух ногах — значит она есть только в двойной опоре. Стоит
   перенести ногу, и на экране палка. Отсюда счёт: каждый шаг, попавший в
   читаемый раствор, впечатывает Л в строку, а шаркающий и разъехавшийся не
   печатают ничего. Ходьбой пишут — потому стоять на месте и незачем. */

const WALK = { keep: 0.09, wide: 0.24 };

MODES.walk = {
  label: 'ходьба',
  note: 'Стрелки ← и → — левая и правая нога (мышью: клик по своей половине кадра). Держишь — нога уносится вперёд, отпустил — встаёт. Шаг, попавший между засечками, впечатывает Л в строку; короткий шаркает впустую, длинный уходит в шпагат — он красный. Ноги надо чередовать.',
  cursor: 'pointer',
  tools: [
    { type: 'range', key: 'speed', label: 'вынос', min: 0.1, max: 0.6, step: 0.01, value: 0.3 },
    { type: 'range', key: 'split', label: 'шпагат', min: 0.2, max: 0.5, step: 0.01, value: 0.32 },
    { type: 'toggle', key: 'ruler', label: 'линейка', value: true },
    { type: 'button', label: 'заново', action: () => MODES.walk.setup() },
  ],

  setup() {
    modeState.feet = [0.36, 0.5];
    modeState.swing = null;
    modeState.to = 0;
    modeState.held = false;
    modeState.drop = 0;
    modeState.fall = 0;
    modeState.prints = [];
    modeState.start = 0.5;
  },

  step() {
    if (modeState.fall > 0) {
      modeState.fall -= STEP;
      modeState.feet[0] -= STEP * 0.25;
      modeState.feet[1] += STEP * 0.25;
      if (modeState.fall <= 0) {
        const front = Math.max(...modeState.feet);
        modeState.feet = [front - 0.14, front];
        modeState.swing = null;
      }
      return;
    }

    if (modeState.swing === null) return;

    if (modeState.held) {
      /* Пока нога идёт к опорной, она проносится под корпусом и в шаг не
         считается: вперёд её уводит только то, что держат сверх этого. */
      const stance = modeState.feet[1 - modeState.swing];
      const carry = modeState.to < stance ? 3 : 1;
      modeState.to += STEP * num('speed') * carry;
      return;
    }

    modeState.drop += STEP * 7;
    if (modeState.drop < 1) return;

    const side = modeState.swing;
    const stance = modeState.feet[1 - side];
    const spread = Math.abs(modeState.to - stance);
    modeState.feet[side] = modeState.to;
    modeState.swing = null;
    modeState.drop = 0;

    if (spread > num('split')) {
      modeState.fall = 1.1;
      return;
    }
    if (spread >= WALK.keep && spread <= WALK.wide) {
      modeState.prints.push({ x: Math.max(modeState.to, stance), spread });
      if (modeState.prints.length > 80) modeState.prints.shift();
    }
  },

  press(side) {
    if (modeState.fall > 0 || modeState.swing !== null) return;
    modeState.swing = side;
    modeState.to = modeState.feet[side];
    modeState.held = true;
    modeState.drop = 0;
  },

  onKey(event, down) {
    const side = event.code === 'ArrowLeft' ? 0 : event.code === 'ArrowRight' ? 1 : null;
    if (side === null) return;
    event.preventDefault();
    if (down) this.press(side);
    else if (modeState.swing === side) modeState.held = false;
  },

  onDown() { this.press(pointer.x < 0.5 ? 0 : 1); },

  onUp() { modeState.held = false; },

  draw() {
    const front = Math.max(...modeState.feet);
    const camera = front - 0.5;
    const at = (x) => x - camera;

    baseline();
    if (on('ruler')) {
      const first = Math.ceil((camera + 0.04) / 0.1) * 0.1;
      for (let x = first; x < camera + 0.96; x += 0.1) {
        line(at(x), GROUND, at(x), GROUND + 0.018, ink(0.24), 0.002);
      }
    }

    for (const print of modeState.prints) {
      legs(
        at(print.x), GROUND - RISE,
        at(print.x - print.spread), GROUND,
        at(print.x), GROUND,
        0.24, STEM * 0.7,
      );
    }

    const side = modeState.swing;
    const feet = [...modeState.feet];
    let lift = 0;
    if (side !== null) {
      feet[side] = modeState.to;
      lift = modeState.held ? 0.05 : 0.05 * (1 - modeState.drop);
    }

    /* Окно читаемого раствора показано на земле: без него игра была бы
       угадыванием, а не расчётом. */
    if (side !== null) {
      const stance = modeState.feet[1 - side];
      const dir = modeState.to >= stance ? 1 : -1;
      line(at(stance + dir * WALK.keep), GROUND, at(stance + dir * WALK.wide), GROUND, ink(0.3), 0.006);
    }

    const spread = Math.abs(feet[0] - feet[1]);
    const reads = side === null && spread >= WALK.keep && spread <= WALK.wide;
    const apexX = Math.max(feet[0], feet[1]);
    const apexY = GROUND - RISE + (modeState.fall > 0 ? 0.06 * (1.1 - modeState.fall) : 0);
    const wide = modeState.fall > 0;

    legs(
      at(apexX), apexY,
      at(feet[0]), GROUND - (side === 0 ? lift : 0),
      at(feet[1]), GROUND - (side === 1 ? lift : 0),
      reads ? 1 : 0.42,
      reads ? STEM : STEM * 0.8,
    );

    if (wide) {
      line(at(feet[0]), GROUND, at(feet[1]), GROUND, RED, 0.005);
    }

    const gone = (front - modeState.start) / RISE;
    drawStatus(
      wide ? 'шпагат' : `${count(modeState.prints.length, 'буква', 'буквы', 'букв')} · ${gone.toFixed(1)} роста`,
      wide,
    );
  },
};

/* ---------- откос ---------- */

/* Сыпучее ложится под собственным углом: перепад между соседями больше
   критического — верх съезжает вниз. Слева получается прямой откос, справа
   его держит опалубка, и вместе это Л. Убери опалубку — песок расплывётся
   в симметричную кучу, и станет видно, что вертикаль справа букве необходима. */

const CELLS = 150;
const WALL = Math.round(CELLS * 0.62);

MODES.slope = {
  label: 'откос',
  note: 'Сыпь курсором. Песок ложится под углом с ползунка — это и есть наклонная нога. Опалубка справа держит вертикаль; сними её, и Л расплывётся в кучу. Красным — клетки, осыпающиеся прямо сейчас.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'angle', label: 'откос', min: 20, max: 60, step: 1, value: 40 },
    { type: 'range', key: 'rate', label: 'струя', min: 0.1, max: 1.2, step: 0.05, value: 0.5 },
    { type: 'toggle', key: 'form', label: 'опалубка', value: true },
    { type: 'toggle', key: 'pour', label: 'сама сыплет', value: false },
    { type: 'button', label: 'смести', action: () => MODES.slope.setup() },
  ],

  setup() {
    modeState.h = new Float32Array(CELLS);
    modeState.hot = new Float32Array(CELLS);
    modeState.moved = 0;
  },

  step() {
    const h = modeState.h;
    const hot = modeState.hot;
    const dx = 1 / CELLS;
    const drop = Math.tan((num('angle') * Math.PI) / 180) * dx;
    const wall = on('form');

    if (pointer.down || on('pour')) {
      const x = on('pour') && !pointer.down ? (WALL - 6) / CELLS : pointer.x;
      const i = clamp(Math.round(x * CELLS), 1, CELLS - 2);
      const add = num('rate') * STEP;
      h[i] += add * 0.6;
      h[i - 1] += add * 0.2;
      h[i + 1] += add * 0.2;
    }

    modeState.moved = 0;
    for (let pass = 0; pass < 4; pass += 1) {
      for (let i = 0; i < CELLS - 1; i += 1) {
        /* Опалубка держит песок ровно до своего верха: выше — перелив через
           край, и куча останавливается готовой Л, а не растёт без края. */
        if (wall && i + 1 === WALL && h[i] <= RISE) continue;
        const diff = h[i] - h[i + 1];
        if (Math.abs(diff) <= drop) continue;
        const move = (Math.abs(diff) - drop) * 0.5;
        const from = diff > 0 ? i : i + 1;
        const to = diff > 0 ? i + 1 : i;
        h[from] -= move;
        h[to] += move;
        /* Склон под критическим углом весь дрожит по чуть-чуть; красное —
           только там, где сорвался заметный кусок. */
        if (move > drop * 0.3) hot[from] = 1;
        modeState.moved += move;
      }
    }

    /* За опалубкой не насыпь, а сток: иначе перелив копится с той стороны,
       куча становится симметричной горой и вертикаль тонет в ней. */
    if (wall) for (let i = WALL; i < CELLS; i += 1) h[i] = 0;

    for (let i = 0; i < CELLS; i += 1) hot[i] = Math.max(0, hot[i] - STEP * 3);
  },

  draw() {
    baseline();
    const h = modeState.h;
    const hot = modeState.hot;

    ctx.beginPath();
    ctx.moveTo(0, GROUND * S);
    for (let i = 0; i < CELLS; i += 1) {
      ctx.lineTo(((i + 0.5) / CELLS) * S, (GROUND - h[i]) * S);
    }
    ctx.lineTo(S, GROUND * S);
    ctx.closePath();
    ctx.fillStyle = ink(0.12);
    ctx.fill();

    /* Масса лежит бледно, а поверхность идёт штрихом: буква живёт по кромке,
       а не в заливке, иначе Л тонет в чернильном треугольнике. */
    for (let i = 1; i < CELLS; i += 1) {
      if (h[i - 1] < 0.002 && h[i] < 0.002) continue;
      line((i - 0.5) / CELLS, GROUND - h[i - 1], (i + 0.5) / CELLS, GROUND - h[i], INK, STEM * 0.9);
    }

    for (let i = 0; i < CELLS; i += 1) {
      if (hot[i] > 0.4 && h[i] > 0.004) dot((i + 0.5) / CELLS, GROUND - h[i], RED, 0.005);
    }

    if (on('form')) {
      const x = WALL / CELLS;
      line(x, GROUND, x, GROUND - Math.max(RISE, h[WALL - 1] + 0.03), INK, STEM);
    }

    const alive = modeState.moved > 0.0006;
    drawStatus(alive ? 'осыпается' : `откос ${num('angle')}°`, alive);
  },
};

startLab({
  title: 'Л · две ноги',
  modes: MODES,
  start: 'river',
  ground: 'ink',
});
