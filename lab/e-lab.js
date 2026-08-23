/* Полигон Е / Ё: восемь трактовок общей стойки и трёх горизонталей.
   Режимы намеренно независимы: здесь сравнивается не оформление, а сам жест. */

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const modesBar = document.getElementById('modes');
const toolsBar = document.getElementById('tools');
const note = document.getElementById('note');
const stage = document.getElementById('stage');
const audioState = document.getElementById('audio-state');
const variantBar = document.getElementById('variant');

const INK = '#161616';
const PAPER = '#f1ede5';
const RED = '#e0210f';
const MUTED = '#8b877f';
const FAINT = 'rgba(22,22,22,.16)';
const STEP = 1 / 60;
const ROWS = [0.26, 0.5, 0.74];
const ENDS = [0.8, 0.66, 0.84];
const STEM_X = 0.22;
const TINE_X1 = 0.42;
const TINE_X2 = 0.78;

let S = 0;
let dpr = 1;
let current = null;
let variant = 'Е';
let modeState = {};
const toolValues = {};
const pointer = { x: 0, y: 0, px: 0, py: 0, down: false, moved: 0 };

function clamp(value, min, max) { return value < min ? min : value > max ? max : value; }
function mod(value, base) { return ((value % base) + base) % base; }
function lerp(a, b, t) { return a + (b - a) * t; }
function slot(key) { return `${current}:${key}`; }
function num(key) { return Number(toolValues[slot(key)]); }
function on(key) { return Boolean(toolValues[slot(key)]); }
function nearRow(y, radius = 0.07) {
  let best = -1;
  let distance = radius * S;
  ROWS.forEach((row, index) => {
    const next = Math.abs(y - row * S);
    if (next < distance) { distance = next; best = index; }
  });
  return best;
}

/* ---------- звук ---------- */

let audioContext = null;
let audioMaster = null;

function wakeAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
  if (!audioContext) {
    audioContext = new AudioContext();
    audioMaster = audioContext.createGain();
    audioMaster.gain.value = 0.24;
    audioMaster.connect(audioContext.destination);
    const unlock = audioContext.createBufferSource();
    unlock.buffer = audioContext.createBuffer(1, 1, 22050);
    unlock.connect(audioMaster);
    unlock.start();
  }
  const markActive = () => {
    if (audioContext.state !== 'running') return;
    audioState.dataset.on = 'true';
    audioState.textContent = 'звук активен';
  };
  if (audioContext.state !== 'running' && audioContext.state !== 'closed') audioContext.resume().then(markActive);
  else markActive();
  return audioContext;
}

function ping(frequency, duration = 0.32, volume = 0.16, type = 'sine', delay = 0) {
  const ac = wakeAudio();
  if (!ac) return;
  const start = ac.currentTime + delay;
  const oscillator = ac.createOscillator();
  const gain = ac.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audioMaster);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
  if (ac.state !== 'running' && ac.state !== 'closed') ac.resume();
}

function chord(frequencies, duration = 0.55, volume = 0.07) {
  frequencies.forEach((frequency, index) => ping(frequency, duration, volume, index === 1 ? 'triangle' : 'sine'));
}

/* ---------- общая графика ---------- */

function line(x1, y1, x2, y2, color = INK, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawSkeleton(color = FAINT, width = 1) {
  line(STEM_X * S, ROWS[0] * S, STEM_X * S, ROWS[2] * S, color, width);
  ROWS.forEach((row, index) => line(STEM_X * S, row * S, ENDS[index] * S, row * S, color, width));
}

function drawDots(color = INK, filled = true) {
  const radius = S * 0.018;
  [0.3, 0.42].forEach((x) => {
    ctx.beginPath();
    ctx.arc(x * S, 0.115 * S, radius, 0, Math.PI * 2);
    if (filled) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });
}

function drawSymbol(id, x, y, size, color = INK) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.2, size * 0.08);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const r = size * 0.33;
  if (id === 0) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  } else if (id === 1) {
    ctx.strokeRect(-r, -r, r * 2, r * 2);
  } else if (id === 2) {
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.1);
    ctx.lineTo(r, r * 0.8);
    ctx.lineTo(-r, r * 0.8);
    ctx.closePath();
    ctx.stroke();
  } else if (id === 3) {
    line(-r, 0, r, 0, color, ctx.lineWidth);
    line(0, -r, 0, r, color, ctx.lineWidth);
  } else if (id === 4) {
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const outer = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      const inner = outer + Math.PI / 5;
      const point = [Math.cos(outer) * r, Math.sin(outer) * r];
      const notch = [Math.cos(inner) * r * 0.42, Math.sin(inner) * r * 0.42];
      if (i === 0) ctx.moveTo(point[0], point[1]);
      else ctx.lineTo(point[0], point[1]);
      ctx.lineTo(notch[0], notch[1]);
    }
    ctx.closePath();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.quadraticCurveTo(-r * 0.5, -r, 0, 0);
    ctx.quadraticCurveTo(r * 0.5, r, r, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function makeBurst(x = 0.55 * S, y = 0.5 * S, count = 42) {
  modeState.burst = Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.22;
    const speed = S * (0.002 + Math.random() * 0.005);
    return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1 };
  });
}

function stepBurst() {
  if (!modeState.burst) return;
  for (const particle of modeState.burst) {
    particle.vy += S * 0.00005;
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.life -= 0.018;
  }
  modeState.burst = modeState.burst.filter((particle) => particle.life > 0);
}

function drawBurst() {
  if (!modeState.burst) return;
  ctx.fillStyle = RED;
  for (const particle of modeState.burst) {
    ctx.globalAlpha = particle.life;
    ctx.fillRect(particle.x, particle.y, S * 0.006, S * 0.006);
  }
  ctx.globalAlpha = 1;
}

const MODES = {};

/* ---------- 1. камертон ---------- */

// Длины собираются в до-мажор: нижняя длинная — до, верхняя — ми,
// короткая средняя — соль. Порядок высот следует длине, а не строке.
const TUNE_FREQUENCIES = [329.63, 392, 261.63];
const TUNE_NAMES = ['ми', 'соль', 'до'];
const LESSON_BLUE = '#1769c2';
const TUNE_CLASSES = [4, 7, 0];
const NOTE_NAMES = ['до', 'до♯', 'ре', 'ре♯', 'ми', 'фа', 'фа♯', 'соль', 'соль♯', 'ля', 'ля♯', 'си'];
const FRET_STEPS = [
  [0, 1, 3, 5, 7],
  [0, 2, 4, 5],
  [0, 2, 4, 5, 7],
];
const TUNE_FRET_NOTE = 'Тапни сегмент, проведи вдоль струны — гамма, поперёк строк — аккорд. Медленно потяни сегмент, чтобы повысить его ноту.';
const TUNE_DEMO = [
  [0, 0, 1], [0, 0, 1], [0, 1, 1], [1, 0, 1],
  [1, 0, 1], [0, 1, 1], [0, 0, 1], [2, 2, 1],
  [2, 0, 1], [2, 0, 1], [2, 2, 1], [0, 0, 1],
  [0, 0, 1], [2, 2, 1], [2, 2, 2],
];

function lessonTarget() {
  const lesson = modeState.lesson;
  if (!lesson || lesson.complete) return null;
  const [index, semitones] = TUNE_DEMO[lesson.index];
  return { index, semitones, fret: fretForSemitone(index, semitones) };
}

function updateLessonNote() {
  const lesson = modeState.lesson;
  if (!lesson) return;
  if (lesson.complete) {
    note.textContent = 'Ода к радости сыграна.';
    return;
  }
  const target = lessonTarget();
  note.textContent = `Ода к радости · ${lesson.index + 1} / ${TUNE_DEMO.length} · сыграй ${noteName(target.index, target.semitones)}`;
}

function startLesson() {
  if (current !== 'tuning') return;
  setToolValue('demo', false);
  stopDemo();
  setToolValue('frets', true);
  modeState.fretGesture = null;
  modeState.lesson = { index: 0, complete: false, celebration: 0 };
  updateLessonNote();
}

function stopLesson() {
  modeState.lesson = null;
  if (current === 'tuning') note.textContent = on('frets') ? TUNE_FRET_NOTE : MODES.tuning.note;
}

function registerLessonNote(index, semitones) {
  const lesson = modeState.lesson;
  const target = lessonTarget();
  if (!lesson || !target || index !== target.index || semitones !== target.semitones) return;
  lesson.index += 1;
  if (lesson.index >= TUNE_DEMO.length) {
    lesson.complete = true;
    lesson.celebration = 1;
    setToolValue('lesson', false);
  }
  updateLessonNote();
}

function noteName(index, semitones = 0) {
  return NOTE_NAMES[mod(TUNE_CLASSES[index] + Math.round(semitones), 12)];
}

function fretAt(index, x) {
  const start = STEM_X * S;
  const end = ENDS[index] * S;
  if (x < start || x > end) return -1;
  return clamp(Math.floor(((x - start) / (end - start)) * FRET_STEPS[index].length), 0, FRET_STEPS[index].length - 1);
}

function fretForSemitone(index, semitones) {
  const exact = FRET_STEPS[index].indexOf(semitones);
  if (exact >= 0) return exact;
  return FRET_STEPS[index].reduce((best, value, fret) => (
    Math.abs(value - semitones) < Math.abs(FRET_STEPS[index][best] - semitones) ? fret : best
  ), 0);
}

function lightFret(index, fret) {
  const tine = modeState.tines[index];
  if (!tine || fret < 0) return;
  tine.fretHighlights[fret] = 1;
  tine.lastFret = fret;
}

function strikeTine(index, amount = 0.02, position = 1, semitones = 0, fret = -1) {
  const tine = modeState.tines[index];
  if (!tine) return;
  const leverage = 0.55 + clamp(position, 0, 1) * 0.45;
  tine.v += amount * S * 0.06 * leverage;
  tine.offset += amount * S * leverage;
  tine.cooldown = 0.045;
  tine.highlight = 1;
  if (on('frets')) lightFret(index, fret >= 0 ? fret : fretForSemitone(index, semitones));
  const volume = clamp(Math.abs(amount) * 2.8, 0.035, 0.2);
  if (audioContext) {
    const frequency = TUNE_FREQUENCIES[index] * 2 ** (semitones / 12);
    ping(frequency, 1.5, volume, index === 1 ? 'triangle' : 'sine');
  }
}

function bendPitch(index, offset, baseSemitones = 0) {
  const tension = clamp(Math.abs(offset) / (S * 0.14), 0, 1);
  const semitones = tension * num('bendRange');
  return {
    frequency: TUNE_FREQUENCIES[index] * 2 ** ((baseSemitones + semitones) / 12),
    semitones,
    baseSemitones,
    tension,
  };
}

function createBendVoice(index, baseSemitones = 0) {
  const ac = audioContext;
  if (!ac || ac.state !== 'running' || modeState.held !== index || modeState.bendVoice) return;
  const oscillator = ac.createOscillator();
  const gain = ac.createGain();
  oscillator.type = index === 1 ? 'triangle' : 'sine';
  oscillator.frequency.value = TUNE_FREQUENCIES[index] * 2 ** (baseSemitones / 12);
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.012, ac.currentTime + 0.04);
  oscillator.connect(gain);
  gain.connect(audioMaster);
  oscillator.start();
  modeState.bendVoice = { oscillator, gain, index, baseSemitones };
}

function beginBendVoice(index, baseSemitones = 0) {
  const ac = wakeAudio();
  if (!ac) return;
  if (ac.state === 'running') createBendVoice(index, baseSemitones);
  else ac.resume().then(() => createBendVoice(index, baseSemitones));
}

function updateBendVoice(index) {
  const voice = modeState.bendVoice;
  if (!voice || voice.index !== index || !audioContext) return;
  const pitch = bendPitch(index, modeState.tines[index].offset, voice.baseSemitones);
  const now = audioContext.currentTime;
  voice.oscillator.frequency.setTargetAtTime(pitch.frequency, now, 0.015);
  voice.gain.gain.setTargetAtTime(0.012 + pitch.tension * 0.028, now, 0.025);
}

function releaseBendVoice(index) {
  const voice = modeState.bendVoice;
  const baseSemitones = voice?.baseSemitones ?? modeState.heldSemitones ?? 0;
  const pitch = bendPitch(index, modeState.tines[index].offset, baseSemitones);
  if (!voice || voice.index !== index || !audioContext) {
    ping(pitch.frequency, 1.2, 0.12, index === 1 ? 'triangle' : 'sine');
    return;
  }
  const now = audioContext.currentTime;
  voice.oscillator.frequency.cancelScheduledValues(now);
  voice.oscillator.frequency.setValueAtTime(pitch.frequency, now);
  const homeFrequency = TUNE_FREQUENCIES[index] * 2 ** (baseSemitones / 12);
  voice.oscillator.frequency.exponentialRampToValueAtTime(homeFrequency, now + 0.8);
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(0.1, now);
  voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
  voice.oscillator.stop(now + 1.32);
  modeState.bendVoice = null;
}

function stopBendVoice() {
  const voice = modeState.bendVoice;
  if (!voice || !audioContext) return;
  const now = audioContext.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setTargetAtTime(0.0001, now, 0.01);
  voice.oscillator.stop(now + 0.08);
  modeState.bendVoice = null;
}

function releaseDemoTine() {
  const currentNote = modeState.demo?.current;
  if (!currentNote || currentNote.semitones <= 0) return;
  const tine = modeState.tines[currentNote.index];
  tine.held = false;
  tine.v += Math.sign(currentNote.target) * 1.2;
  currentNote.released = true;
}

function beginDemoNote() {
  const demo = modeState.demo;
  const [index, semitones, beats] = TUNE_DEMO[demo.index];
  const duration = (60 / num('demoTempo')) * beats;
  const direction = index === 2 ? -1 : 1;
  const target = direction * (semitones / num('bendRange')) * S * 0.14;
  demo.current = { index, semitones, duration, elapsed: 0, target, released: false };
  if (semitones > 0) {
    modeState.tines[index].held = true;
    modeState.tines[index].v = 0;
    if (on('frets')) lightFret(index, fretForSemitone(index, semitones));
    const frequency = TUNE_FREQUENCIES[index] * 2 ** (semitones / 12);
    ping(frequency, Math.min(0.7, duration * 0.9), 0.11, index === 1 ? 'triangle' : 'sine');
  } else {
    const directionOfHit = demo.index % 2 ? 1 : -1;
    strikeTine(index, directionOfHit * 0.038, 0.82);
  }
}

function startDemo() {
  if (current !== 'tuning') return;
  wakeAudio();
  stopBendVoice();
  if (modeState.held >= 0) modeState.tines[modeState.held].held = false;
  modeState.held = -1;
  modeState.demo = { index: 0, current: null, pause: 0.25 };
}

function stopDemo() {
  if (!modeState.demo) return;
  releaseDemoTine();
  modeState.demo = null;
}

function stepDemo() {
  const demo = modeState.demo;
  if (!demo || !on('demo')) return;
  if (demo.pause > 0) {
    demo.pause -= STEP;
    return;
  }
  if (!demo.current) beginDemoNote();
  const note = demo.current;
  note.elapsed += STEP;
  if (note.semitones > 0 && !note.released) {
    const attack = Math.min(0.14, note.duration * 0.3);
    const releaseAt = note.duration * 0.72;
    const tine = modeState.tines[note.index];
    if (note.elapsed < attack) {
      const t = note.elapsed / attack;
      tine.offset = note.target * (1 - (1 - t) ** 3);
    } else if (note.elapsed < releaseAt) {
      tine.offset = note.target + Math.sin(note.elapsed * 48) * S * 0.0015;
    } else {
      releaseDemoTine();
    }
  }
  if (note.elapsed < note.duration) return;
  if (!note.released) releaseDemoTine();
  demo.current = null;
  demo.index += 1;
  if (demo.index >= TUNE_DEMO.length) {
    demo.index = 0;
    demo.pause = 1.1;
  }
}

function strumTines() {
  ROWS.forEach((row, index) => {
    const y = row * S;
    const crossed = (pointer.py < y && pointer.y >= y) || (pointer.py > y && pointer.y <= y);
    const tine = modeState.tines[index];
    const inside = pointer.x >= STEM_X * S - S * 0.012 && pointer.x <= tine.end + S * 0.012;
    if (!crossed || !inside || tine.cooldown > 0) return;
    const fret = on('frets') ? fretAt(index, pointer.x) : -1;
    if (on('frets') && fret < 0) return;
    const semitones = fret >= 0 ? FRET_STEPS[index][fret] : 0;
    const direction = Math.sign(pointer.y - pointer.py) || 1;
    const strength = clamp(Math.abs(pointer.y - pointer.py) / S * 0.7, 0.012, 0.07);
    const position = clamp((pointer.x - STEM_X * S) / (tine.end - STEM_X * S), 0, 1);
    strikeTine(index, direction * strength, position, semitones, fret);
    registerLessonNote(index, semitones);
  });
}

function beginFretBend(gesture) {
  const { row, fret } = gesture;
  if (row < 0 || fret < 0) return;
  const tine = modeState.tines[row];
  modeState.held = row;
  modeState.heldFret = fret;
  modeState.heldSemitones = FRET_STEPS[row][fret];
  modeState.grabY = gesture.startY - tine.offset;
  tine.held = true;
  tine.v = 0;
  lightFret(row, fret);
  beginBendVoice(row, modeState.heldSemitones);
  gesture.mode = 'bend';
}

function moveFretGesture() {
  const gesture = modeState.fretGesture;
  if (!gesture) {
    strumTines();
    return;
  }
  const dx = pointer.x - gesture.startX;
  const dy = pointer.y - gesture.startY;
  const distance = Math.hypot(dx, dy);
  const threshold = Math.max(8, S * 0.016);
  const elapsed = performance.now() - gesture.startedAt;

  if (gesture.mode === 'pending' && distance > threshold) {
    if (Math.abs(dx) > Math.abs(dy) * 0.85) {
      gesture.mode = 'horizontal';
    } else if (elapsed < 150) {
      gesture.mode = 'strum';
    } else {
      beginFretBend(gesture);
    }
  }

  if (gesture.mode === 'horizontal') {
    const fret = fretAt(gesture.row, pointer.x);
    if (fret >= 0 && fret !== gesture.fret) {
      gesture.fret = fret;
      const tine = modeState.tines[gesture.row];
      const position = clamp((pointer.x - STEM_X * S) / (tine.end - STEM_X * S), 0, 1);
      const direction = Math.sign(pointer.x - pointer.px) || 1;
      strikeTine(gesture.row, direction * 0.03, position, FRET_STEPS[gesture.row][fret], fret);
      registerLessonNote(gesture.row, FRET_STEPS[gesture.row][fret]);
    }
    return;
  }
  if (gesture.mode === 'strum' || gesture.row < 0) strumTines();
}

function tinePath(tine, start, length) {
  ctx.beginPath();
  ctx.moveTo(start, tine.y);
  ctx.bezierCurveTo(
    start + length * TINE_X1, tine.y,
    start + length * TINE_X2, tine.y + tine.offset * 0.48,
    tine.end, tine.y + tine.offset,
  );
}

function tineYAt(tine, xRatio) {
  if (xRatio <= 0) return tine.y;
  if (xRatio >= 1) return tine.y + tine.offset;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 10; step += 1) {
    const t = (low + high) / 2;
    const u = 1 - t;
    const curveX = 3 * u * u * t * TINE_X1 + 3 * u * t * t * TINE_X2 + t * t * t;
    if (curveX < xRatio) low = t;
    else high = t;
  }
  const t = (low + high) / 2;
  const bend = 1.44 * (1 - t) * t * t + t * t * t;
  return tine.y + tine.offset * bend;
}

MODES.tuning = {
  label: 'камертон',
  note: 'Пересекай язычки без нажатия. Зажми и тяни — натяжение повышает ноту; после отпускания она съезжает обратно. Первый клик будит звук.',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'decay', label: 'затухание', min: 0.965, max: 0.998, step: 0.001, value: 0.987 },
    { type: 'range', key: 'bend', label: 'податливость', min: 0.5, max: 1.8, step: 0.05, value: 1 },
    { type: 'range', key: 'bendRange', label: 'подтяжка', min: 2, max: 12, step: 1, value: 7 },
    { type: 'toggle', key: 'frets', label: 'лады', value: false, action: (enabled) => {
      modeState.fretGesture = null;
      if (!enabled && on('lesson')) {
        setToolValue('lesson', false);
        stopLesson();
      }
      note.textContent = enabled ? TUNE_FRET_NOTE : MODES.tuning.note;
    } },
    { type: 'range', key: 'demoTempo', label: 'темп демо', min: 60, max: 140, step: 1, value: 96 },
    { type: 'toggle', key: 'demo', label: 'ода сама', value: false, action: (enabled) => {
      if (enabled) {
        setToolValue('lesson', false);
        stopLesson();
        startDemo();
      }
      else stopDemo();
    } },
    { type: 'toggle', key: 'lesson', label: 'учусь', value: false, action: (enabled) => {
      if (enabled) startLesson();
      else stopLesson();
    } },
    { type: 'button', label: 'аккорд', action: () => {
      setToolValue('demo', false);
      stopDemo();
      wakeAudio();
      modeState.tines.forEach((_, index) => strikeTine(index, index === 1 ? 0.035 : -0.04));
    } },
  ],
  setup() {
    modeState.tines = ROWS.map((row, index) => ({
      y: row * S,
      end: ENDS[index] * S,
      offset: 0,
      v: 0,
      held: false,
      cooldown: 0,
      highlight: 0,
      fretHighlights: FRET_STEPS[index].map(() => 0),
      lastFret: 0,
    }));
    modeState.held = -1;
    modeState.heldSemitones = 0;
    modeState.heldFret = -1;
    modeState.fretGesture = null;
    modeState.bendVoice = null;
    modeState.demo = null;
    modeState.lesson = null;
  },
  teardown() {
    setToolValue('demo', false);
    setToolValue('lesson', false);
    stopDemo();
    stopLesson();
    stopBendVoice();
  },
  step() {
    stepDemo();
    if (modeState.lesson?.complete) {
      modeState.lesson.celebration *= 0.965;
      if (modeState.lesson.celebration < 0.04) modeState.lesson = null;
    }
    modeState.tines.forEach((tine, index) => {
      tine.cooldown = Math.max(0, tine.cooldown - STEP);
      tine.highlight = tine.held ? 1 : tine.highlight * 0.94;
      const highlightDecay = modeState.lesson ? 0.89 : 0.92;
      tine.fretHighlights = tine.fretHighlights.map((value) => (tine.held ? value : value * highlightDecay));
      if (tine.held && modeState.held === index && modeState.heldFret >= 0) {
        tine.fretHighlights[modeState.heldFret] = 1;
      }
      if (!tine.held) {
        tine.v += -tine.offset * 0.055 * num('bend');
        tine.v *= num('decay');
        tine.offset += tine.v;
        tine.offset = clamp(tine.offset, -S * 0.17, S * 0.17);
      }
    });
  },
  onDown() {
    if (modeState.demo) {
      setToolValue('demo', false);
      stopDemo();
    }
    wakeAudio();
    const row = nearRow(pointer.y, on('frets') ? 0.085 : 0.055);
    if (on('frets')) {
      const fret = row >= 0 ? fretAt(row, pointer.x) : -1;
      modeState.fretGesture = {
        row,
        fret,
        startX: pointer.x,
        startY: pointer.y,
        startedAt: performance.now(),
        mode: row >= 0 && fret >= 0 ? 'pending' : 'strum',
      };
      if (row >= 0 && fret >= 0) {
        const tine = modeState.tines[row];
        const position = clamp((pointer.x - STEM_X * S) / (tine.end - STEM_X * S), 0, 1);
        const semitones = FRET_STEPS[row][fret];
        strikeTine(row, 0.028, position, semitones, fret);
        registerLessonNote(row, semitones);
      }
      return;
    }
    if (row < 0 || pointer.x < STEM_X * S || pointer.x > ENDS[row] * S + S * 0.03) return;
    modeState.held = row;
    modeState.heldSemitones = 0;
    modeState.heldFret = -1;
    modeState.tines[row].held = true;
    modeState.grabY = pointer.y - modeState.tines[row].offset;
    beginBendVoice(row);
  },
  onMove() {
    if (modeState.held >= 0) {
      const tine = modeState.tines[modeState.held];
      tine.offset = clamp(pointer.y - modeState.grabY, -S * 0.14, S * 0.14);
      tine.v = clamp((pointer.y - pointer.py) * 0.12, -4, 4);
      if (modeState.heldFret >= 0) lightFret(modeState.held, modeState.heldFret);
      updateBendVoice(modeState.held);
      return;
    }
    if (modeState.demo) return;
    if (on('frets') && pointer.down) moveFretGesture();
    else strumTines();
  },
  onUp() {
    if (modeState.held >= 0) {
      const index = modeState.held;
      const tine = modeState.tines[index];
      tine.held = false;
      tine.v = clamp(tine.v + (pointer.y - pointer.py) * 0.1, -5, 5);
      releaseBendVoice(index);
    }
    modeState.held = -1;
    modeState.heldSemitones = 0;
    modeState.heldFret = -1;
    modeState.fretGesture = null;
  },
  draw() {
    const stroke = S * 0.016;
    const stemX = STEM_X * S;
    const frets = on('frets');
    const lesson = modeState.lesson;
    const target = lessonTarget();
    const eventColor = lesson ? LESSON_BLUE : RED;
    modeState.tines.forEach((tine, index) => {
      const start = stemX;
      const length = tine.end - start;
      ctx.lineWidth = stroke;
      ctx.lineCap = 'butt';
      ctx.strokeStyle = frets ? INK : tine.highlight > 0.06 ? RED : INK;
      tinePath(tine, start, length);
      ctx.stroke();

      if (frets) {
        const count = FRET_STEPS[index].length;
        if (target?.index === index) {
          const x1 = start + (length * target.fret) / count;
          const x2 = start + (length * (target.fret + 1)) / count;
          const pulse = 0.7 + Math.sin(performance.now() * 0.006) * 0.18;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x1 - 1, 0, x2 - x1 + 2, S);
          ctx.clip();
          ctx.globalAlpha = pulse;
          ctx.strokeStyle = LESSON_BLUE;
          ctx.lineWidth = stroke;
          tinePath(tine, start, length);
          ctx.stroke();
          ctx.restore();
        }
        tine.fretHighlights.forEach((highlight, fret) => {
          if (highlight <= 0.06) return;
          const x1 = start + (length * fret) / count;
          const x2 = start + (length * (fret + 1)) / count;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x1 - 1, 0, x2 - x1 + 2, S);
          ctx.clip();
          ctx.strokeStyle = eventColor;
          tinePath(tine, start, length);
          ctx.stroke();
          ctx.restore();
        });
        ctx.strokeStyle = 'rgba(241,237,229,.88)';
        ctx.lineWidth = 1;
        for (let fret = 1; fret < count; fret += 1) {
          const t = fret / count;
          const x = start + length * t;
          const y = tineYAt(tine, t);
          ctx.beginPath();
          ctx.moveTo(x, y - stroke * 0.75);
          ctx.lineTo(x, y + stroke * 0.75);
          ctx.stroke();
        }
      }

      const tipFret = FRET_STEPS[index].length - 1;
      const tipHot = frets ? tine.fretHighlights[tipFret] > 0.06 : tine.highlight > 0.06;
      ctx.fillStyle = tipHot ? eventColor : INK;
      ctx.beginPath();
      ctx.arc(tine.end, tine.y + tine.offset, stroke / 2, 0, Math.PI * 2);
      ctx.fill();

      if (frets && !tine.held && tine.fretHighlights[tine.lastFret] > 0.12) {
        const count = FRET_STEPS[index].length;
        const t = (tine.lastFret + 0.5) / count;
        const labelX = start + length * t;
        const labelY = tineYAt(tine, t);
        ctx.fillStyle = eventColor;
        ctx.font = `${Math.max(9, S * 0.016)}px 'DM Mono', ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(noteName(index, FRET_STEPS[index][tine.lastFret]), labelX, labelY - S * 0.022);
      }

      if (target?.index === index) {
        const count = FRET_STEPS[index].length;
        const t = (target.fret + 0.5) / count;
        const labelX = start + length * t;
        const labelY = tineYAt(tine, t);
        ctx.fillStyle = LESSON_BLUE;
        ctx.font = `${Math.max(9, S * 0.015)}px 'DM Mono', ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${noteName(index, target.semitones)} · ${lesson.index + 1}/${TUNE_DEMO.length}`, labelX, labelY - S * 0.024);
      }

      if (tine.held) {
        const demoNote = modeState.demo?.current;
        const automated = demoNote?.index === index && demoNote.semitones > 0;
        const pitch = automated
          ? { semitones: demoNote.semitones }
          : bendPitch(index, tine.offset, modeState.held === index ? modeState.heldSemitones : 0);
        ctx.fillStyle = eventColor;
        ctx.beginPath();
        const markerX = automated ? tine.end : pointer.x;
        const markerY = automated ? tine.y + tine.offset : pointer.y;
        ctx.arc(markerX, markerY, S * 0.011, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = eventColor;
        ctx.font = `${Math.max(9, S * 0.018)}px 'DM Mono', ui-monospace, monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        const prefix = automated ? 'авто · ' : '';
        const baseSemitones = automated ? demoNote.semitones : modeState.held === index ? modeState.heldSemitones : 0;
        const label = frets ? noteName(index, baseSemitones) : TUNE_NAMES[index];
        const suffix = automated && frets ? '' : ` +${pitch.semitones.toFixed(1)}`;
        ctx.fillText(`${prefix}${label}${suffix}`, markerX + S * 0.022, markerY - S * 0.016);
      }
      const energy = clamp((Math.abs(tine.offset) + Math.abs(tine.v) * 2) / (S * 0.1), 0, 1);
      if (energy > 0.04) {
        ctx.strokeStyle = lesson ? `rgba(23,105,194,${energy * 0.7})` : `rgba(224,33,15,${energy * 0.7})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(tine.end, tine.y + tine.offset, S * (0.022 + energy * 0.025), 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    if (lesson?.complete && lesson.celebration > 0.04) {
      const radius = S * (0.08 + (1 - lesson.celebration) * 0.18);
      ctx.strokeStyle = `rgba(23,105,194,${lesson.celebration * 0.8})`;
      ctx.lineWidth = Math.max(1, S * 0.004 * lesson.celebration);
      ctx.beginPath();
      ctx.arc(S * 0.5, S * 0.5, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Гриф лежит поверх струн: цветная струна визуально уходит под него,
    // а в месте стыка остаётся один ровный прямоугольный профиль.
    ctx.fillStyle = INK;
    ctx.fillRect(
      stemX - stroke / 2,
      ROWS[0] * S - stroke / 2,
      stroke,
      (ROWS[2] - ROWS[0]) * S + stroke,
    );
  },
};

/* ---------- 2. игровой автомат ---------- */

const SLOT_ICONS = 6;

function slotIcon(index) {
  const reel = modeState.reels[index];
  return mod(-Math.round(reel.offset) + reel.base, SLOT_ICONS);
}

function loopSlot(reel) {
  reel.offset = mod(reel.offset, SLOT_ICONS);
}

function checkSlot() {
  if (modeState.reels.some((reel) => !reel.stopped) || modeState.checked) return;
  modeState.checked = true;
  const values = modeState.reels.map((_, index) => slotIcon(index));
  modeState.win = values.every((value) => value === values[0]);
  if (modeState.win) {
    makeBurst(0.54 * S, 0.5 * S, 56);
    chord([220, 330, 440], 0.8, 0.08);
  } else {
    values.forEach((value, index) => ping(130 + value * 34, 0.12, 0.035, 'square', index * 0.07));
  }
}

function spinSlots() {
  wakeAudio();
  modeState.checked = false;
  modeState.win = false;
  modeState.stopIndex = 0;
  modeState.reels.forEach((reel, index) => {
    reel.speed = -(4.2 + index * 1.1 + Math.random() * 2.4);
    reel.stopping = false;
    reel.snapping = false;
    reel.stopped = false;
  });
  ping(90, 0.18, 0.08, 'sawtooth');
}

function stopSlot() {
  const reel = modeState.reels.find((item) => !item.stopped && !item.stopping && !item.snapping);
  if (!reel) return;
  reel.stopping = true;
  ping(150 + modeState.stopIndex * 45, 0.09, 0.06, 'square');
  modeState.stopIndex += 1;
}

function forceSlotWin() {
  const target = Math.floor(Math.random() * SLOT_ICONS);
  modeState.reels.forEach((reel) => {
    reel.speed = 0;
    reel.offset = reel.base - target;
    loopSlot(reel);
    reel.stopping = false;
    reel.snapping = false;
    reel.stopped = true;
  });
  modeState.checked = false;
  checkSlot();
}

MODES.slot = {
  label: 'автомат',
  note: 'Три горизонтальные ленты. У Ё левая точка запускает, правая останавливает ленты по одной; сами ленты тоже можно прокручивать.',
  cursor: 'grab',
  ownsDots: true,
  tools: [
    { type: 'button', label: 'пуск', action: spinSlots },
    { type: 'button', label: 'стоп', action: stopSlot },
    { type: 'button', label: 'проверить выигрыш', action: forceSlotWin },
  ],
  setup() {
    modeState.reels = ROWS.map((_, index) => ({
      offset: Math.random() * SLOT_ICONS,
      speed: 0,
      base: Math.floor(Math.random() * SLOT_ICONS) + index,
      stopping: false,
      snapping: false,
      stopped: true,
      target: 0,
    }));
    modeState.held = -1;
    modeState.checked = true;
    modeState.win = false;
    modeState.stopIndex = 0;
    modeState.burst = [];
  },
  step() {
    modeState.reels.forEach((reel) => {
      if (!reel.stopped && !reel.snapping) {
        reel.offset += reel.speed * STEP;
        loopSlot(reel);
      }
      if (reel.stopping) {
        reel.speed *= 0.92;
        if (Math.abs(reel.speed) < 0.32) {
          reel.stopping = false;
          reel.snapping = true;
          reel.target = Math.round(reel.offset);
        }
      }
      if (reel.snapping) {
        reel.offset += (reel.target - reel.offset) * 0.22;
        if (Math.abs(reel.target - reel.offset) < 0.002) {
          reel.offset = reel.target;
          loopSlot(reel);
          reel.snapping = false;
          reel.stopped = true;
        }
      }
    });
    checkSlot();
    stepBurst();
  },
  onDown() {
    wakeAudio();
    if (variant === 'Ё') {
      const left = Math.hypot(pointer.x - 0.3 * S, pointer.y - 0.115 * S);
      const right = Math.hypot(pointer.x - 0.42 * S, pointer.y - 0.115 * S);
      if (left < S * 0.055) { spinSlots(); return; }
      if (right < S * 0.055) { stopSlot(); return; }
    }
    const row = nearRow(pointer.y, 0.07);
    if (row >= 0 && pointer.x > STEM_X * S && pointer.x < 0.86 * S) {
      modeState.held = row;
      modeState.reels[row].stopped = false;
      modeState.reels[row].snapping = false;
      modeState.reels[row].stopping = false;
      modeState.checked = false;
    }
  },
  onMove() {
    if (modeState.held < 0) return;
    const reel = modeState.reels[modeState.held];
    const cell = S * 0.105;
    const delta = pointer.x - pointer.px;
    reel.offset += delta / cell;
    loopSlot(reel);
    reel.speed = (delta / cell) / STEP;
  },
  onUp() {
    if (modeState.held < 0) return;
    const reel = modeState.reels[modeState.held];
    reel.speed = clamp(reel.speed, -8, 8);
    reel.stopping = true;
    modeState.held = -1;
  },
  draw() {
    const cell = S * 0.105;
    const center = 0.54 * S;
    line(STEM_X * S, ROWS[0] * S - S * 0.055, STEM_X * S, ROWS[2] * S + S * 0.055, INK, S * 0.016);
    ROWS.forEach((row, index) => {
      const y = row * S;
      const end = ENDS[index] * S;
      ctx.save();
      ctx.beginPath();
      ctx.rect(STEM_X * S, y - S * 0.055, end - STEM_X * S, S * 0.11);
      ctx.clip();
      ctx.fillStyle = 'rgba(22,22,22,.035)';
      ctx.fillRect(STEM_X * S, y - S * 0.055, end - STEM_X * S, S * 0.11);
      for (let k = -9; k <= 9; k += 1) {
        const x = center + (k + modeState.reels[index].offset) * cell;
        const id = mod(k + modeState.reels[index].base, SLOT_ICONS);
        const winning = modeState.win && Math.abs(x - center) < cell * 0.45;
        drawSymbol(id, x, y, S * 0.052, winning ? RED : INK);
        line(x + cell * 0.5, y - S * 0.04, x + cell * 0.5, y + S * 0.04, FAINT, 1);
      }
      ctx.restore();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(STEM_X * S, y - S * 0.055, end - STEM_X * S, S * 0.11);
    });
    line(center, ROWS[0] * S - S * 0.07, center, ROWS[2] * S + S * 0.07, modeState.win ? RED : FAINT, 1);
    if (variant === 'Ё') {
      drawDots(INK, false);
      ctx.fillStyle = modeState.reels.some((reel) => !reel.stopped) ? RED : INK;
      ctx.beginPath();
      ctx.arc(0.3 * S, 0.115 * S, S * 0.011, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0.42 * S, 0.115 * S, S * 0.011, 0, Math.PI * 2);
      ctx.fill();
    }
    drawBurst();
  },
};

/* ---------- 3. магнитные ленты ---------- */

const TAPE_PERIOD = 0.34;

function tapePhase(offset) { return mod(offset / S, TAPE_PERIOD); }

function checkTapes() {
  const phases = modeState.offsets.map(tapePhase);
  const d1 = Math.min(Math.abs(phases[0] - phases[1]), TAPE_PERIOD - Math.abs(phases[0] - phases[1]));
  const d2 = Math.min(Math.abs(phases[0] - phases[2]), TAPE_PERIOD - Math.abs(phases[0] - phases[2]));
  const matched = d1 < 0.008 && d2 < 0.008;
  if (matched && !modeState.matched) {
    modeState.flash = 1;
    if (audioContext) chord([164.81, 246.94, 329.63], 0.7, 0.06);
  }
  modeState.matched = matched;
}

function alignTapes() {
  wakeAudio();
  modeState.offsets = [0, 0, 0];
  checkTapes();
}

MODES.tapes = {
  label: 'ленты',
  note: 'Три звуковые петли проходят через общую головку-стойку. Тяни любую ленту, скретчь и совмещай красные склейки.',
  cursor: 'ew-resize',
  tools: [
    { type: 'toggle', key: 'run', label: 'ход', value: true },
    { type: 'range', key: 'tempo', label: 'скорость', min: -0.2, max: 0.2, step: 0.01, value: 0.05 },
    { type: 'button', label: 'совместить склейки', action: alignTapes },
  ],
  setup() {
    modeState.offsets = [0, S * 0.11, -S * 0.08];
    modeState.rates = [1, 0.78, 1.18];
    modeState.held = -1;
    modeState.flash = 0;
    modeState.matched = false;
    modeState.lastSound = 0;
  },
  step() {
    if (on('run') && modeState.held < 0) {
      modeState.offsets.forEach((_, index) => {
        modeState.offsets[index] += num('tempo') * modeState.rates[index] * S * STEP;
      });
    }
    modeState.flash *= 0.94;
    checkTapes();
  },
  onDown() {
    wakeAudio();
    const row = nearRow(pointer.y, 0.075);
    if (row >= 0 && pointer.x > STEM_X * S && pointer.x < ENDS[row] * S) modeState.held = row;
  },
  onMove() {
    if (modeState.held < 0) return;
    const delta = pointer.x - pointer.px;
    modeState.offsets[modeState.held] += delta;
    const now = performance.now();
    if (now - modeState.lastSound > 58 && Math.abs(delta) > 0.4) {
      const frequency = 120 + modeState.held * 95 + clamp(Math.abs(delta) * 9, 0, 260);
      ping(frequency, 0.08, clamp(Math.abs(delta) / 90, 0.015, 0.075), 'sawtooth');
      modeState.lastSound = now;
    }
    checkTapes();
  },
  onUp() { modeState.held = -1; },
  draw() {
    const head = STEM_X * S;
    line(head, ROWS[0] * S - S * 0.075, head, ROWS[2] * S + S * 0.075, modeState.flash > 0.08 ? RED : INK, S * 0.025);
    ROWS.forEach((row, index) => {
      const y = row * S;
      const end = ENDS[index] * S;
      ctx.save();
      ctx.beginPath();
      ctx.rect(head, y - S * 0.06, end - head, S * 0.12);
      ctx.clip();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = head - 3; x <= end + 3; x += 3) {
        const u = (x - modeState.offsets[index]) / S;
        const wave = Math.sin(u * 83 + index * 2.1) * 0.45 + Math.sin(u * 191 - index) * 0.22 + Math.sin(u * 37) * 0.2;
        const py = y + wave * S * 0.034;
        if (x <= head) ctx.moveTo(x, py);
        else ctx.lineTo(x, py);
      }
      ctx.stroke();
      const period = TAPE_PERIOD * S;
      const phase = mod(modeState.offsets[index], period);
      for (let x = head - period * 2 + phase; x < end + period; x += period) {
        line(x, y - S * 0.052, x, y + S * 0.052, RED, 2);
      }
      ctx.restore();
      line(head, y - S * 0.06, end, y - S * 0.06, FAINT, 1);
      line(head, y + S * 0.06, end, y + S * 0.06, FAINT, 1);
    });
  },
};

/* ---------- 4. синхронизация импульсов ---------- */

function resetPulses() {
  modeState.time = 0;
  modeState.arrivals = [null, null, null];
  modeState.wait = 0;
  modeState.checked = false;
}

function tunePulses() {
  wakeAudio();
  const duration = 1.8;
  modeState.speeds = ENDS.map((end) => (end - STEM_X) / duration);
  resetPulses();
}

MODES.pulses = {
  label: 'импульсы',
  note: 'Стойка одновременно выпускает три импульса. Тяни по каждой линии, меняя её скорость, и сведи три прихода к концам в один момент.',
  cursor: 'ew-resize',
  tools: [
    { type: 'button', label: 'новый импульс', action: resetPulses },
    { type: 'button', label: 'свести точно', action: tunePulses },
  ],
  setup() {
    modeState.speeds = [0.22, 0.31, 0.25];
    modeState.held = -1;
    modeState.flash = 0;
    resetPulses();
  },
  step() {
    modeState.flash *= 0.94;
    if (modeState.wait > 0) {
      modeState.wait -= STEP;
      if (modeState.wait <= 0) resetPulses();
      return;
    }
    modeState.time += STEP;
    modeState.speeds.forEach((speed, index) => {
      const length = ENDS[index] - STEM_X;
      if (modeState.arrivals[index] === null && modeState.time * speed >= length) {
        modeState.arrivals[index] = modeState.time;
        if (audioContext) ping(180 + index * 85, 0.12, 0.045, 'square');
      }
    });
    if (modeState.arrivals.every((time) => time !== null) && !modeState.checked) {
      modeState.checked = true;
      const spread = Math.max(...modeState.arrivals) - Math.min(...modeState.arrivals);
      if (spread < 0.1) {
        modeState.flash = 1;
        if (audioContext) chord([220, 277.18, 329.63], 0.65, 0.075);
      }
      modeState.wait = 0.9;
    }
  },
  onDown() {
    wakeAudio();
    modeState.held = nearRow(pointer.y, 0.07);
    if (modeState.held >= 0) this.onMove();
  },
  onMove() {
    if (modeState.held < 0) return;
    const start = STEM_X * S;
    const end = ENDS[modeState.held] * S;
    const t = clamp((pointer.x - start) / (end - start), 0, 1);
    modeState.speeds[modeState.held] = lerp(0.12, 0.48, t);
  },
  onUp() {
    if (modeState.held >= 0) resetPulses();
    modeState.held = -1;
  },
  draw() {
    const hot = modeState.flash > 0.04;
    line(STEM_X * S, ROWS[0] * S, STEM_X * S, ROWS[2] * S, hot ? RED : INK, S * 0.012);
    ROWS.forEach((row, index) => {
      const y = row * S;
      const start = STEM_X * S;
      const end = ENDS[index] * S;
      line(start, y, end, y, INK, 2);
      const length = ENDS[index] - STEM_X;
      const progress = clamp((modeState.time * modeState.speeds[index]) / length, 0, 1);
      const x = lerp(start, end, progress);
      ctx.fillStyle = modeState.arrivals[index] !== null && hot ? RED : INK;
      ctx.beginPath();
      ctx.arc(x, y, S * 0.018, 0, Math.PI * 2);
      ctx.fill();
      const speedT = (modeState.speeds[index] - 0.12) / 0.36;
      const marker = lerp(start, end, speedT);
      ctx.fillStyle = modeState.held === index ? RED : MUTED;
      ctx.beginPath();
      ctx.moveTo(marker, y + S * 0.045);
      ctx.lineTo(marker - S * 0.009, y + S * 0.062);
      ctx.lineTo(marker + S * 0.009, y + S * 0.062);
      ctx.closePath();
      ctx.fill();
    });
  },
};

/* ---------- 5. щели затвора ---------- */

const SHUTTER_PERIOD = 0.43;

function shutterDistance(a, b) {
  const period = SHUTTER_PERIOD * S;
  const diff = Math.abs(mod(a, period) - mod(b, period));
  return Math.min(diff, period - diff);
}

function checkShutters() {
  const matched = shutterDistance(modeState.offsets[0], modeState.offsets[1]) < S * 0.012
    && shutterDistance(modeState.offsets[0], modeState.offsets[2]) < S * 0.012;
  if (matched && !modeState.matched) {
    modeState.flash = 1;
    chord([174.61, 261.63, 349.23], 0.55, 0.06);
  }
  modeState.matched = matched;
}

function alignShutters() {
  wakeAudio();
  modeState.offsets = [0, 0, 0];
  checkShutters();
}

function drawFace(cx, color) {
  const cy = 0.5 * S;
  const radius = S * 0.275;
  ctx.strokeStyle = color;
  ctx.lineWidth = S * 0.012;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - radius * 0.35, cy - radius * 0.12, S * 0.017, 0, Math.PI * 2);
  ctx.arc(cx + radius * 0.35, cy - radius * 0.12, S * 0.017, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy + radius * 0.13, radius * 0.46, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
}

MODES.shutters = {
  label: 'щели',
  note: 'Три узких затвора показывают разные горизонтальные срезы повторяющегося образа. Перетаскивай полосы, пока лицо не соберётся.',
  cursor: 'ew-resize',
  tools: [{ type: 'button', label: 'собрать образ', action: alignShutters }],
  setup() {
    modeState.offsets = [0, S * 0.13, -S * 0.1];
    modeState.held = -1;
    modeState.matched = false;
    modeState.flash = 0;
  },
  step() { modeState.flash *= 0.93; },
  onDown() {
    wakeAudio();
    modeState.held = nearRow(pointer.y, 0.075);
  },
  onMove() {
    if (modeState.held < 0) return;
    modeState.offsets[modeState.held] += pointer.x - pointer.px;
    checkShutters();
  },
  onUp() { modeState.held = -1; },
  draw() {
    const start = STEM_X * S;
    line(start, ROWS[0] * S - S * 0.067, start, ROWS[2] * S + S * 0.067, INK, S * 0.015);
    ROWS.forEach((row, index) => {
      const y = row * S;
      const end = ENDS[index] * S;
      const band = S * 0.13;
      ctx.save();
      ctx.beginPath();
      ctx.rect(start, y - band / 2, end - start, band);
      ctx.clip();
      ctx.fillStyle = 'rgba(22,22,22,.025)';
      ctx.fillRect(start, y - band / 2, end - start, band);
      const period = SHUTTER_PERIOD * S;
      for (let k = -2; k <= 3; k += 1) {
        const cx = 0.53 * S + modeState.offsets[index] + k * period;
        drawFace(cx, modeState.matched && Math.abs(cx - 0.53 * S) < period * 0.48 ? RED : INK);
      }
      ctx.restore();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.strokeRect(start, y - band / 2, end - start, band);
    });
  },
};

/* ---------- 6. конвейеры ---------- */

function conveyorClosest(index) {
  return modeState.items[index].reduce((best, item) => {
    const distance = Math.min(item.pos, 1 - item.pos);
    return distance < best.distance ? { item, distance } : best;
  }, { item: null, distance: Infinity });
}

function checkConveyors() {
  if (modeState.cooldown > 0) return;
  const closest = [0, 1, 2].map(conveyorClosest);
  const ready = closest.every((entry) => entry.distance < 0.035);
  if (!ready) return;
  const symbols = closest.map((entry) => entry.item.symbol);
  if (symbols.every((symbol) => symbol === symbols[0])) {
    modeState.flash = 1;
    modeState.cooldown = 1.2;
    makeBurst(STEM_X * S, 0.5 * S, 34);
    if (audioContext) chord([146.83, 220, 293.66], 0.5, 0.06);
  }
}

function forceConveyorMatch() {
  wakeAudio();
  const symbol = Math.floor(Math.random() * SLOT_ICONS);
  modeState.items.forEach((items) => {
    const closest = items.reduce((best, item) => (item.pos < best.pos ? item : best), items[0]);
    closest.symbol = symbol;
    closest.pos = 0.01;
  });
  modeState.cooldown = 0;
  checkConveyors();
}

MODES.conveyors = {
  label: 'конвейеры',
  note: 'Три ленты непрерывно несут формы к общей стойке. Клик разворачивает отдельную ленту, горизонтальный бросок задаёт её скорость.',
  cursor: 'ew-resize',
  tools: [
    { type: 'toggle', key: 'run', label: 'ход', value: true },
    { type: 'button', label: 'подать тройку', action: forceConveyorMatch },
  ],
  setup() {
    modeState.items = ROWS.map((_, row) => Array.from({ length: 6 }, (__, index) => ({
      pos: (index + row * 0.21) / 6,
      symbol: mod(index * 2 + row, SLOT_ICONS),
    })));
    modeState.directions = [-1, 1, -1];
    modeState.speeds = [0.12, 0.09, 0.14];
    modeState.held = -1;
    modeState.drag = 0;
    modeState.flash = 0;
    modeState.cooldown = 0;
    modeState.burst = [];
  },
  step() {
    if (on('run')) {
      modeState.items.forEach((items, row) => {
        items.forEach((item) => {
          const previous = item.pos;
          item.pos = mod(item.pos + modeState.directions[row] * modeState.speeds[row] * STEP, 1);
          if (Math.abs(item.pos - previous) > 0.5) item.symbol = Math.floor(Math.random() * SLOT_ICONS);
        });
      });
    }
    modeState.flash *= 0.93;
    modeState.cooldown = Math.max(0, modeState.cooldown - STEP);
    checkConveyors();
    stepBurst();
  },
  onDown() {
    wakeAudio();
    modeState.held = nearRow(pointer.y, 0.075);
    modeState.drag = 0;
  },
  onMove() {
    if (modeState.held < 0) return;
    const delta = pointer.x - pointer.px;
    modeState.drag += delta;
    if (Math.abs(delta) > 0.2) {
      modeState.directions[modeState.held] = Math.sign(delta);
      modeState.speeds[modeState.held] = clamp(Math.abs(delta) / S / STEP, 0.04, 0.5);
    }
  },
  onUp() {
    if (modeState.held >= 0 && Math.abs(modeState.drag) < S * 0.012) {
      modeState.directions[modeState.held] *= -1;
    }
    modeState.held = -1;
  },
  draw() {
    const hot = modeState.flash > 0.06;
    const start = STEM_X * S;
    line(start, ROWS[0] * S - S * 0.06, start, ROWS[2] * S + S * 0.06, hot ? RED : INK, S * 0.02);
    ROWS.forEach((row, index) => {
      const y = row * S;
      const end = ENDS[index] * S;
      ctx.fillStyle = 'rgba(22,22,22,.035)';
      ctx.fillRect(start, y - S * 0.055, end - start, S * 0.11);
      line(start, y - S * 0.055, end, y - S * 0.055, INK, 1);
      line(start, y + S * 0.055, end, y + S * 0.055, INK, 1);
      for (let marker = start + S * 0.025; marker < end; marker += S * 0.055) {
        const direction = modeState.directions[index];
        line(marker - direction * S * 0.009, y + S * 0.038, marker, y + S * 0.029, FAINT, 1);
        line(marker, y + S * 0.029, marker + direction * S * 0.009, y + S * 0.038, FAINT, 1);
      }
      modeState.items[index].forEach((item) => {
        const x = lerp(start, end, item.pos);
        drawSymbol(item.symbol, x, y, S * 0.048, hot && item.pos < 0.05 ? RED : INK);
      });
    });
    drawBurst();
  },
};

/* ---------- 7. трёхдорожечный секвенсор ---------- */

const SEQ_LENGTHS = [8, 5, 8];
const SEQ_FREQS = [110, 220, 440];

function advanceSequence() {
  modeState.tick += 1;
  const hits = modeState.grid.map((row, index) => row[modeState.tick % SEQ_LENGTHS[index]]);
  hits.forEach((hit, index) => {
    if (hit && audioContext) ping(SEQ_FREQS[index], index === 0 ? 0.18 : 0.1, 0.075, index === 0 ? 'sine' : 'square');
  });
  if (hits.every(Boolean)) {
    modeState.flash = 1;
    if (audioContext) chord([220, 275, 330], 0.45, 0.055);
  }
}

function clearSequence() { modeState.grid.forEach((row) => row.fill(false)); }

function seedSequence() {
  modeState.grid = SEQ_LENGTHS.map((length, row) => Array.from({ length }, (_, step) => (
    row === 0 ? step % 4 === 0 : row === 1 ? step === 2 : step % 4 === 2
  )));
}

MODES.sequencer = {
  label: 'секвенсор',
  note: 'Е становится трёхдорожечным ритмом: 8 / 5 / 8 шагов. Ставь удары прямо на перекладинах; совпадение трёх дорожек вспыхивает.',
  cursor: 'pointer',
  tools: [
    { type: 'toggle', key: 'run', label: 'играть', value: true },
    { type: 'range', key: 'bpm', label: 'темп', min: 50, max: 180, step: 1, value: 104 },
    { type: 'button', label: 'очистить', action: clearSequence },
    { type: 'button', label: 'ритм', action: seedSequence },
  ],
  setup() {
    modeState.grid = SEQ_LENGTHS.map((length) => Array(length).fill(false));
    seedSequence();
    modeState.tick = -1;
    modeState.clock = 0;
    modeState.flash = 0;
  },
  step() {
    modeState.flash *= 0.9;
    if (!on('run')) return;
    modeState.clock += STEP;
    const interval = 30 / num('bpm');
    while (modeState.clock >= interval) {
      modeState.clock -= interval;
      advanceSequence();
    }
  },
  onDown() {
    wakeAudio();
    const row = nearRow(pointer.y, 0.075);
    if (row < 0) return;
    const start = STEM_X * S;
    const end = ENDS[row] * S;
    if (pointer.x < start || pointer.x > end) return;
    const step = clamp(Math.floor(((pointer.x - start) / (end - start)) * SEQ_LENGTHS[row]), 0, SEQ_LENGTHS[row] - 1);
    modeState.grid[row][step] = !modeState.grid[row][step];
    ping(SEQ_FREQS[row], 0.09, 0.055, row === 0 ? 'sine' : 'square');
  },
  draw() {
    const start = STEM_X * S;
    line(start, ROWS[0] * S - S * 0.05, start, ROWS[2] * S + S * 0.05, modeState.flash > 0.05 ? RED : INK, S * 0.018);
    ROWS.forEach((row, rowIndex) => {
      const y = row * S;
      const end = ENDS[rowIndex] * S;
      const length = SEQ_LENGTHS[rowIndex];
      const cell = (end - start) / length;
      for (let step = 0; step < length; step += 1) {
        const x = start + step * cell;
        const active = modeState.grid[rowIndex][step];
        const playing = step === mod(modeState.tick, length);
        ctx.fillStyle = active ? INK : 'transparent';
        if (active) ctx.fillRect(x + 2, y - S * 0.04, cell - 4, S * 0.08);
        ctx.strokeStyle = playing ? (modeState.flash > 0.05 ? RED : MUTED) : FAINT;
        ctx.lineWidth = playing ? 2 : 1;
        ctx.strokeRect(x + 1.5, y - S * 0.041, cell - 3, S * 0.082);
      }
    });
  },
};

/* ---------- 8. три горизонта ---------- */

const HORIZON_PERIOD = 0.44;

function horizonDistance(a, b) {
  const period = HORIZON_PERIOD * S;
  const diff = Math.abs(mod(a, period) - mod(b, period));
  return Math.min(diff, period - diff);
}

function checkHorizons() {
  const aligned = horizonDistance(modeState.offsets[0], modeState.offsets[1]) < S * 0.01
    && horizonDistance(modeState.offsets[0], modeState.offsets[2]) < S * 0.01;
  if (aligned && !modeState.aligned) {
    modeState.flash = 1;
    if (audioContext) chord([130.81, 196, 261.63], 0.9, 0.05);
  }
  modeState.aligned = aligned;
}

function alignHorizons() {
  wakeAudio();
  modeState.offsets = [0, 0, 0];
  checkHorizons();
}

function horizonCenters(offset) {
  const period = HORIZON_PERIOD * S;
  const centers = [];
  for (let k = -2; k <= 3; k += 1) centers.push(0.55 * S + offset + k * period);
  return centers;
}

MODES.horizons = {
  label: 'горизонты',
  note: 'Три полосы — не рельсы, а небо, вода и земля. Тяни слои с разным параллаксом; при совмещении солнце, отражение и дорога становятся одним событием.',
  cursor: 'ew-resize',
  tools: [
    { type: 'toggle', key: 'drift', label: 'ветер', value: true },
    { type: 'button', label: 'совместить мир', action: alignHorizons },
  ],
  setup() {
    modeState.offsets = [0, S * 0.15, -S * 0.09];
    modeState.held = -1;
    modeState.flash = 0;
    modeState.aligned = false;
  },
  step() {
    if (on('drift') && modeState.held < 0) {
      modeState.offsets[0] += S * 0.012 * STEP;
      modeState.offsets[1] += S * 0.006 * STEP;
      modeState.offsets[2] += S * 0.018 * STEP;
    }
    modeState.flash *= 0.95;
    checkHorizons();
  },
  onDown() {
    wakeAudio();
    modeState.held = nearRow(pointer.y, 0.085);
  },
  onMove() {
    if (modeState.held < 0) return;
    modeState.offsets[modeState.held] += pointer.x - pointer.px;
    checkHorizons();
  },
  onUp() { modeState.held = -1; },
  draw() {
    const start = STEM_X * S;
    const hot = modeState.flash > 0.04;
    line(start, ROWS[0] * S - S * 0.07, start, ROWS[2] * S + S * 0.07, hot ? RED : INK, S * 0.016);
    ROWS.forEach((row, index) => {
      const y = row * S;
      const end = ENDS[index] * S;
      const band = S * 0.135;
      ctx.save();
      ctx.beginPath();
      ctx.rect(start, y - band / 2, end - start, band);
      ctx.clip();
      ctx.fillStyle = index === 1 ? 'rgba(22,22,22,.025)' : 'rgba(241,237,229,.72)';
      ctx.fillRect(start, y - band / 2, end - start, band);
      line(start, y, end, y, INK, index === 1 ? 2 : 1);
      for (const center of horizonCenters(modeState.offsets[index])) {
        const color = hot && Math.abs(center - 0.55 * S) < S * 0.04 ? RED : INK;
        if (index === 0) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(center, y, S * 0.038, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(center - S * 0.13, y + S * 0.012, S * 0.022, Math.PI, 0);
          ctx.arc(center - S * 0.1, y + S * 0.012, S * 0.03, Math.PI, 0);
          ctx.stroke();
        } else if (index === 1) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          for (let wave = 0; wave < 3; wave += 1) {
            ctx.beginPath();
            ctx.moveTo(center - S * 0.065, y + wave * S * 0.018 - S * 0.018);
            ctx.quadraticCurveTo(center, y + wave * S * 0.018, center + S * 0.065, y + wave * S * 0.018 - S * 0.018);
            ctx.stroke();
          }
        } else {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(center - S * 0.12, y + S * 0.04);
          ctx.quadraticCurveTo(center - S * 0.04, y - S * 0.045, center, y + S * 0.015);
          ctx.quadraticCurveTo(center + S * 0.06, y - S * 0.03, center + S * 0.12, y + S * 0.04);
          ctx.stroke();
          line(center, y + S * 0.015, center, y + S * 0.065, color, 2);
        }
      }
      ctx.restore();
      line(start, y - band / 2, end, y - band / 2, FAINT, 1);
      line(start, y + band / 2, end, y + band / 2, FAINT, 1);
    });
  },
};

/* ---------- панель ---------- */

function renderTools(mode) {
  toolsBar.innerHTML = '';
  for (const tool of mode.tools) {
    if (tool.type === 'button') {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tool.label;
      button.addEventListener('click', tool.action);
      toolsBar.append(button);
      continue;
    }
    const key = slot(tool.key);
    const value = key in toolValues ? toolValues[key] : tool.value;
    toolValues[key] = value;
    if (tool.type === 'toggle') {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.tool = tool.key;
      button.textContent = tool.label;
      button.setAttribute('aria-pressed', String(value));
      button.addEventListener('click', () => {
        toolValues[key] = !toolValues[key];
        button.setAttribute('aria-pressed', String(toolValues[key]));
        wakeAudio();
        tool.action?.(toolValues[key]);
      });
      toolsBar.append(button);
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
    });
    label.append(tool.label, input, output);
    toolsBar.append(label);
  }
}

function setToolValue(key, value) {
  toolValues[slot(key)] = value;
  const control = toolsBar.querySelector(`[data-tool="${key}"]`);
  if (control) control.setAttribute('aria-pressed', String(Boolean(value)));
}

function setMode(name) {
  if (current) MODES[current].teardown?.();
  current = name;
  const mode = MODES[name];
  modeState = {};
  renderTools(mode);
  mode.setup?.();
  canvas.style.cursor = mode.cursor || 'default';
  note.textContent = name === 'tuning' && on('frets') ? TUNE_FRET_NOTE : mode.note;
  const names = Object.keys(MODES);
  stage.dataset.index = `${String(names.indexOf(name) + 1).padStart(2, '0')} / ${String(names.length).padStart(2, '0')}`;
  for (const button of modesBar.children) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === name));
  }
}

Object.entries(MODES).forEach(([name, mode]) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.mode = name;
  button.textContent = mode.label;
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => setMode(name));
  modesBar.append(button);
});

variantBar.addEventListener('click', (event) => {
  const button = event.target.closest('[data-variant]');
  if (!button) return;
  variant = button.dataset.variant;
  for (const option of variantBar.children) {
    option.setAttribute('aria-pressed', String(option === button));
  }
});

/* ---------- сцена ---------- */

function resize() {
  const bounds = canvas.getBoundingClientRect();
  const next = Math.max(1, bounds.width);
  const changed = Math.abs(next - S) > 1;
  S = next;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(S * dpr);
  canvas.height = Math.round(S * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (changed && current) setMode(current);
}

function track(event) {
  const bounds = canvas.getBoundingClientRect();
  pointer.px = pointer.x;
  pointer.py = pointer.y;
  pointer.x = event.clientX - bounds.left;
  pointer.y = event.clientY - bounds.top;
  if (pointer.down) pointer.moved += Math.hypot(pointer.x - pointer.px, pointer.y - pointer.py);
}

canvas.addEventListener('pointerdown', (event) => {
  wakeAudio();
  track(event);
  pointer.px = pointer.x;
  pointer.py = pointer.y;
  pointer.down = true;
  pointer.moved = 0;
  try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* Safari may reject capture */ }
  MODES[current].onDown?.(event);
});

canvas.addEventListener('pointerenter', (event) => {
  if (pointer.down) return;
  track(event);
  pointer.px = pointer.x;
  pointer.py = pointer.y;
});

canvas.addEventListener('pointermove', (event) => {
  track(event);
  MODES[current].onMove?.(event);
});

window.addEventListener('pointerup', () => {
  pointer.down = false;
  MODES[current].onUp?.();
});

let last = performance.now();
let debt = 0;
function frame(now) {
  debt = Math.min(0.1, debt + (now - last) / 1000);
  last = now;
  const mode = MODES[current];
  while (debt >= STEP) {
    mode.step?.();
    debt -= STEP;
  }
  ctx.clearRect(0, 0, S, S);
  mode.draw();
  if (variant === 'Ё' && !mode.ownsDots) drawDots();
  requestAnimationFrame(frame);
}

resize();
setMode('tuning');
new ResizeObserver(resize).observe(canvas);
requestAnimationFrame(frame);
