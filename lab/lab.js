/* Каркас полигона.
   Грузится первым, сам подтягивает lab/<буква>-lab.js и ждёт от него startLab().
   Обычный скрипт, не модуль: файл буквы делит с каркасом глобальную область,
   поэтому тела механик пишут S, ctx, num() без импортов и без проброса контекста.
   Занятые имена перечислены в AGENTS.md — файл буквы их не переобъявляет. */

const STEP = 1 / 60;
const RED = '#e0210f';

const labBare = new URLSearchParams(location.search).has('bare');
const labSlug = (location.pathname.split('/').pop() || '').replace(/\.html?$/, '') || 'lab';

/* ---------- цвета ---------- */

const labGrounds = {
  paper: { mark: [22, 22, 22], field: [241, 237, 229], muted: '#8b877f' },
  ink: { mark: [241, 237, 229], field: [22, 22, 22], muted: 'rgba(241,237,229,.45)' },
};

let ground = 'paper';
let INK = '#161616';
let PAPER = '#f1ede5';
let MUTED = '#8b877f';
let FAINT = 'rgba(22,22,22,.16)';
let GHOST = 'rgba(22,22,22,.09)';

function labRgba(rgb, alpha) { return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`; }

/* Цвет метки и цвет поля. Всё, что рисуют механики, берётся отсюда:
   написанная руками rgba не переключится вместе с фоном. */
function ink(alpha = 1) { return labRgba(labGrounds[ground].mark, alpha); }
function paper(alpha = 1) { return labRgba(labGrounds[ground].field, alpha); }

function setGround(name) {
  ground = name in labGrounds ? name : 'paper';
  INK = ink(1);
  PAPER = paper(1);
  MUTED = labGrounds[ground].muted;
  FAINT = ink(0.16);
  GHOST = ink(0.09);
  document.body.dataset.ground = ground;
  labGroundButton?.setAttribute('aria-pressed', String(ground === 'ink'));
}

/* ---------- сцена ---------- */

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const labModesBar = document.getElementById('modes');
const labToolsBar = document.getElementById('tools');
const labVariantBar = document.getElementById('variant');
const labGlobalsBar = document.getElementById('globals');
const labIdentity = document.getElementById('identity');
const note = document.getElementById('note');

let S = 600;
let dpr = 1;
let current = '';
let variant = null;
let paused = false;
let modeState = {};

const toolValues = {};
const pointer = {
  x: 0.5, y: 0.5, px: 0.5, py: 0.5,
  down: false, seen: false, pressure: 0.5,
};

let labModes = {};
let labConfig = {};
let labGroundButton = null;
let labPauseButton = null;
let labStarted = false;

/* ---------- помощники ---------- */

function clamp(value, min, max) { return value < min ? min : value > max ? max : value; }
function lerp(a, b, t) { return a + (b - a) * t; }
function slot(key) { return `${current}:${key}`; }

/* Значение инструмента: сначала своё у режима, потом общее из globalTools. */
function labValue(key) {
  const scoped = slot(key);
  return scoped in toolValues ? toolValues[scoped] : toolValues[key];
}

function num(key) { return Number(labValue(key)); }
function on(key) { return Boolean(labValue(key)); }

function dot(x, y, color, radius = 0.008) {
  ctx.beginPath();
  ctx.arc(x * S, y * S, radius * S, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function line(x1, y1, x2, y2, color = INK, width = 0.008) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width * S;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x1 * S, y1 * S);
  ctx.lineTo(x2 * S, y2 * S);
  ctx.stroke();
}

function drawStatus(text, hot = false) {
  if (!text) return;
  ctx.fillStyle = hot ? RED : MUTED;
  ctx.font = `${Math.round(S * 0.022)}px 'DM Mono', ui-monospace, monospace`;
  ctx.textAlign = 'right';
  ctx.fillText(text, S * 0.96, S * 0.06);
  ctx.textAlign = 'left';
}

/* ---------- инструменты ---------- */

/* Свои инструменты режима плюс общие на весь полигон. */
function labTools(mode) {
  const globals = (labConfig.globalTools || []).map((tool) => ({ ...tool, global: true }));
  return [...(mode.tools || []), ...globals];
}

/* Режим передаётся явно: на чтении адреса current ещё пуст. */
function labToolKey(tool, name = current) { return tool.global ? tool.key : `${name}:${tool.key}`; }

function renderTools(mode) {
  labToolsBar.innerHTML = '';
  for (const tool of labTools(mode)) {
    if (tool.type === 'button') {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tool.label;
      button.addEventListener('click', tool.action);
      labToolsBar.append(button);
      continue;
    }

    const key = labToolKey(tool);
    const value = key in toolValues ? toolValues[key] : tool.value;
    toolValues[key] = value;

    if (tool.type === 'toggle') {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tool.label;
      button.setAttribute('aria-pressed', String(value));
      button.addEventListener('click', () => {
        toolValues[key] = !toolValues[key];
        button.setAttribute('aria-pressed', String(toolValues[key]));
        mode.onTool?.(tool.key);
        labWriteHash();
      });
      labToolsBar.append(button);
      continue;
    }

    const label = document.createElement('label');
    const input = document.createElement('input');
    const output = document.createElement('output');
    input.type = 'range';
    input.min = tool.min;
    input.max = tool.max;
    input.step = tool.step;
    input.value = value;
    output.value = String(value);
    input.addEventListener('input', () => {
      toolValues[key] = Number(input.value);
      output.value = input.value;
      mode.onTool?.(tool.key);
      labWriteHash();
    });
    label.append(tool.label, input, output);
    labToolsBar.append(label);
  }
}

/* ---------- состояние в адресе ---------- */

/* #режим&ключ=значение. Ключ bg занят фоном, инструмент так называть нельзя. */
function labReadHash() {
  const raw = decodeURIComponent(location.hash.slice(1));
  if (!raw) return { mode: '', values: {}, bg: '' };
  const parts = raw.split('&');
  const mode = parts.shift() || '';
  const values = {};
  let bg = '';
  for (const part of parts) {
    const split = part.indexOf('=');
    if (split < 1) continue;
    const key = part.slice(0, split);
    const value = part.slice(split + 1);
    if (key === 'bg') bg = value;
    else values[key] = value;
  }
  return { mode, values, bg };
}

let labHashTimer = 0;
function labWriteHash() {
  if (labBare) return;
  clearTimeout(labHashTimer);
  labHashTimer = setTimeout(() => {
    const parts = [current];
    for (const tool of labTools(labModes[current])) {
      if (tool.type === 'button') continue;
      const value = toolValues[labToolKey(tool)];
      parts.push(`${tool.key}=${tool.type === 'toggle' ? Number(Boolean(value)) : value}`);
    }
    if (ground !== (labConfig.ground || 'paper')) parts.push(`bg=${ground}`);
    history.replaceState(null, '', `#${parts.join('&')}`);
  }, 250);
}

/* Значения из адреса кладём под ключи режима до того, как панель их прочтёт. */
function labSeedFromHash(name, values) {
  const mode = labModes[name];
  if (!mode) return;
  for (const tool of labTools(mode)) {
    if (tool.type === 'button' || !(tool.key in values)) continue;
    const raw = values[tool.key];
    toolValues[labToolKey(tool, name)] = tool.type === 'toggle' ? raw === '1' : Number(raw);
  }
}

/* Адрес, вставленный в уже открытую вкладку, меняет только хеш и страницу не
   перезагружает. Свой replaceState hashchange не поднимает, петли нет. */
window.addEventListener('hashchange', () => {
  if (!labStarted || labBare) return;
  const saved = labReadHash();
  if (!(saved.mode in labModes)) return;
  setGround(saved.bg || labConfig.ground || 'paper');
  labSeedFromHash(saved.mode, saved.values);
  setMode(saved.mode);
});

/* ---------- режимы ---------- */

function setMode(name) {
  current = name;
  const mode = labModes[name];
  modeState = {};
  renderTools(mode);
  mode.setup?.();
  canvas.style.cursor = mode.cursor || 'default';
  note.textContent = mode.note;
  const names = Object.keys(labModes);
  stage.dataset.index = `${String(names.indexOf(name) + 1).padStart(2, '0')} / ${String(names.length).padStart(2, '0')}`;
  for (const button of labModesBar.children) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === name));
  }
  labWriteHash();
}

function setVariant(name) {
  variant = name;
  for (const button of labVariantBar.children) {
    button.setAttribute('aria-pressed', String(button.dataset.variant === name));
  }
  labModes[current]?.onVariant?.(name);
}

/* ---------- кадр ---------- */

function labStep() {
  labModes[current].step?.();
}

function labDraw() {
  ctx.clearRect(0, 0, S, S);
  labModes[current].draw();
}

function resize() {
  const bounds = canvas.getBoundingClientRect();
  S = Math.max(1, bounds.width);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(S * dpr);
  canvas.height = Math.round(S * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function track(event) {
  const bounds = canvas.getBoundingClientRect();
  pointer.px = pointer.x;
  pointer.py = pointer.y;
  pointer.x = (event.clientX - bounds.left) / S;
  pointer.y = (event.clientY - bounds.top) / S;
  pointer.pressure = event.pointerType === 'mouse' ? 0.5 : event.pressure || 0.5;
  pointer.seen = true;
}

/* ---------- снимок ---------- */

/* Канвас прозрачный, фон даёт CSS: без подложки снимок вышел бы дыркой. */
function snapshot() {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const outCtx = out.getContext('2d');
  outCtx.fillStyle = paper();
  outCtx.fillRect(0, 0, out.width, out.height);
  outCtx.drawImage(canvas, 0, 0);
  const link = document.createElement('a');
  link.download = `${labSlug}-${current}.png`;
  link.href = out.toDataURL('image/png');
  link.click();
}

function setPaused(value) {
  paused = value;
  labPauseButton?.setAttribute('aria-pressed', String(paused));
}

/* ---------- панель полигона ---------- */

function labBuildGlobals() {
  const make = (label, action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', action);
    labGlobalsBar.append(button);
    return button;
  };
  labPauseButton = make('пауза', () => setPaused(!paused));
  labPauseButton.setAttribute('aria-pressed', 'false');
  labGroundButton = make('фон', () => {
    setGround(ground === 'paper' ? 'ink' : 'paper');
    labWriteHash();
  });
  labGroundButton.setAttribute('aria-pressed', 'false');
  /* Примечание к механике бывает длинным и в узком окне отодвигает ползунки.
     Сворачиваем его отсюда: кнопка живёт в общем ряду и переключается как
     «фон». Свёрнуто по умолчанию — правило одно на все полигоны, чтобы длина
     конкретного текста не решала, мешает он управлению или нет. Состояние
     держим в памяти вкладки, а не в адресе — ключи в хеше заняты инструментами
     режима, и «note» мог бы столкнуться с чьим-то. */
  document.body.setAttribute('data-quiet', '');
  const noteButton = make('текст', () => {
    document.body.toggleAttribute('data-quiet');
    noteButton.setAttribute('aria-pressed', String(!document.body.hasAttribute('data-quiet')));
  });
  noteButton.setAttribute('aria-pressed', 'false');
  make('снимок', snapshot);
}

function labBuildModes() {
  for (const [name, mode] of Object.entries(labModes)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mode = name;
    button.textContent = mode.label;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => setMode(name));
    labModesBar.append(button);
  }
}

function labBuildVariants(names) {
  labVariantBar.hidden = false;
  for (const name of names) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.variant = name;
    button.textContent = name;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => setVariant(name));
    labVariantBar.append(button);
  }
}

/* ---------- ввод ---------- */

/* До startLab режимов ещё нет, а указатель над сценой уже ходит. */
canvas.addEventListener('pointerdown', (event) => {
  if (!labStarted) return;
  track(event);
  pointer.px = pointer.x;
  pointer.py = pointer.y;
  pointer.down = true;
  try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* Safari может отказать */ }
  labModes[current].onDown?.(event);
});

canvas.addEventListener('pointermove', (event) => {
  if (!labStarted) return;
  track(event);
  labModes[current].onMove?.(event);
});

canvas.addEventListener('dblclick', (event) => {
  if (!labStarted) return;
  track(event);
  labModes[current].onDouble?.(event);
});

window.addEventListener('pointerup', () => {
  if (!labStarted) return;
  pointer.down = false;
  labModes[current].onUp?.();
});

/* Клавиши по event.code: раскладка не должна ничего решать. Откат на event.key —
   для событий, приходящих без кода (автоматика, часть экранных клавиатур). */
function labChord(event) {
  if (event.code) return event.code;
  const key = event.key || '';
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  if (/^[a-zA-Z]$/.test(key)) return `Key${key.toUpperCase()}`;
  if (key === ' ') return 'Space';
  if (key === '.') return 'Period';
  return '';
}

function labTyping(event) {
  const node = event.target;
  return node instanceof HTMLElement
    && (node.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName));
}

window.addEventListener('keydown', (event) => {
  if (!labStarted || labTyping(event)) return;

  const chord = labChord(event);
  const digit = /^Digit([1-9])$/.exec(chord);
  if (digit) {
    const name = Object.keys(labModes)[Number(digit[1]) - 1];
    if (name) setMode(name);
    return;
  }

  if (chord === 'Space') { event.preventDefault(); setPaused(!paused); return; }
  if (chord === 'Period') { labStep(); labDraw(); return; }
  if (chord === 'KeyR') { setMode(current); return; }
  if (chord === 'KeyS') { snapshot(); return; }
  if (chord === 'KeyB') { setGround(ground === 'paper' ? 'ink' : 'paper'); labWriteHash(); return; }

  labModes[current].onKey?.(event, true);
});

window.addEventListener('keyup', (event) => {
  if (!labStarted || labTyping(event)) return;
  labModes[current].onKey?.(event, false);
});

/* Плитка на перечне стоит замершей: страница-родитель будит её по наведению. */
if (labBare) {
  window.addEventListener('message', (event) => {
    if (event.data === 'lab:run') setPaused(false);
    if (event.data === 'lab:hold') setPaused(true);
  });
}

/* ---------- запуск ---------- */

function labFrame(now) {
  const elapsed = (now - labFrame.last) / 1000;
  labFrame.last = now;
  if (!paused) {
    labFrame.debt = Math.min(0.1, labFrame.debt + elapsed);
    while (labFrame.debt >= STEP) {
      labStep();
      labFrame.debt -= STEP;
    }
  }
  labDraw();
  requestAnimationFrame(labFrame);
}
labFrame.last = performance.now();
labFrame.debt = 0;

function startLab(config) {
  labConfig = config;
  labModes = config.modes;

  document.title = `${config.title} — полигон`;
  labIdentity.textContent = config.title;
  labBuildModes();
  labBuildGlobals();

  const saved = labReadHash();
  setGround(saved.bg || config.ground || 'paper');

  resize();

  if (config.variants) {
    labBuildVariants(config.variants);
    setVariant(config.variants[0]);
  }

  const start = saved.mode in labModes ? saved.mode : (config.start || Object.keys(labModes)[0]);
  labSeedFromHash(start, saved.values);
  setMode(start);
  labStarted = true;

  /* Плитке нужна обжитая сцена, а не первый пустой кадр. */
  if (labBare) {
    document.body.dataset.bare = '';
    resize();
    for (let i = 0; i < 120; i += 1) labStep();
    setPaused(true);
  }

  new ResizeObserver(resize).observe(canvas);
  requestAnimationFrame(labFrame);
}

/* Файл буквы грузится отсюда, а не тегом на странице: так стаб одинаков для всех
   букв. Метка времени вместо версии — полигон это стенд, свежесть кода важнее
   кэша, и ручных ?24 против него больше нет нигде. */
document.body.append(Object.assign(document.createElement('script'), {
  src: `${labSlug}-lab.js?t=${Date.now()}`,
}));
