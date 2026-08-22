const INK = '#161616';
const PAPER = '#f1ede5';
const RED = '#e0210f';
const BLUE = '#1769c2';
const STEP = 1 / 60;
const ROWS = [0.26, 0.5, 0.74];
const ENDS = [0.782, 0.642, 0.822];
const STEM_X = 0.202;
const TINE_X1 = 0.42;
const TINE_X2 = 0.78;
const FREQUENCIES = [329.63, 392, 261.63];
const BASE_NAMES = ['ми', 'соль', 'до'];
const NOTE_CLASSES = [4, 7, 0];
const NOTE_NAMES = ['до', 'до♯', 'ре', 'ре♯', 'ми', 'фа', 'фа♯', 'соль', 'соль♯', 'ля', 'ля♯', 'си'];
const FRET_STEPS = [
  [0, 1, 3, 5, 7],
  [0, 2, 4, 5],
  [0, 2, 4, 5, 7],
];
const ODE = [
  [0, 0, 1], [0, 0, 1], [0, 1, 1], [1, 0, 1],
  [1, 0, 1], [0, 1, 1], [0, 0, 1], [2, 2, 1],
  [2, 0, 1], [2, 0, 1], [2, 2, 1], [0, 0, 1],
  [0, 0, 1], [2, 2, 1], [2, 2, 2],
];
const ODE_TEMPO = 96;

const PARAMS = {
  decay: 0.987,
  bend: 1,
  bendRange: 7,
  frets: true,
  demo: false,
  lesson: false,
};

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function mod(value, base) {
  return ((value % base) + base) % base;
}

export function mountE(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { ...PARAMS };
  const pointer = { x: 0, y: 0, px: 0, py: 0, down: false };
  const state = {
    tines: [],
    held: -1,
    heldFret: -1,
    heldSemitones: 0,
    bendVoice: null,
    fretGesture: null,
    demo: null,
    lesson: null,
  };

  workspace.dataset.ground = 'paper';
  canvas.style.cursor = 'crosshair';

  let S = 0;
  let W = 0;
  let H = 0;
  let frameId = 0;
  let last = performance.now();
  let debt = 0;
  let audioContext = null;
  let audioMaster = null;
  let fretsButton = null;
  let demoButton = null;
  let lessonButton = null;

  function noteName(index, semitones = 0) {
    return NOTE_NAMES[mod(NOTE_CLASSES[index] + Math.round(semitones), 12)];
  }

  function nearRow(y, radius = 0.07) {
    let best = -1;
    let distance = radius * S;
    ROWS.forEach((row, index) => {
      const next = Math.abs(y - row * S);
      if (next < distance) {
        distance = next;
        best = index;
      }
    });
    return best;
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

  function lessonTarget() {
    if (!state.lesson || state.lesson.complete) return null;
    const [index, semitones] = ODE[state.lesson.index];
    return { index, semitones, fret: fretForSemitone(index, semitones) };
  }

  function updateHint() {
    if (state.lesson?.complete) {
      hint.textContent = 'ода к радости сыграна';
      return;
    }
    if (state.lesson) {
      const target = lessonTarget();
      hint.textContent = `ода · ${state.lesson.index + 1} / ${ODE.length} · сыграй ${noteName(target.index, target.semitones)}`;
      return;
    }
    if (state.demo) {
      hint.textContent = 'ода играет сама · коснись, чтобы остановить';
      return;
    }
    hint.textContent = params.frets
      ? 'тапни сегмент · вдоль — гамма · поперёк — аккорд'
      : 'проведи поперёк струн · зажми и потяни';
  }

  function setSwitch(button, key, value) {
    params[key] = value;
    button?.setAttribute('aria-pressed', String(value));
  }

  function wakeAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    if (!audioContext) {
      audioContext = new AudioContext();
      audioMaster = audioContext.createGain();
      audioMaster.gain.value = 0.24;
      audioMaster.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
  }

  function ping(frequency, duration = 0.32, volume = 0.16, type = 'sine') {
    const ac = wakeAudio();
    if (!ac) return;
    const start = ac.currentTime;
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
  }

  function lightFret(index, fret) {
    const tine = state.tines[index];
    if (!tine || fret < 0) return;
    tine.fretHighlights[fret] = 1;
    tine.lastFret = fret;
  }

  function strikeTine(index, amount = 0.02, position = 1, semitones = 0, fret = -1) {
    const tine = state.tines[index];
    if (!tine) return;
    const leverage = 0.55 + clamp(position, 0, 1) * 0.45;
    tine.v += amount * S * 0.06 * leverage;
    tine.offset += amount * S * leverage;
    tine.cooldown = 0.045;
    tine.highlight = 1;
    if (params.frets) lightFret(index, fret >= 0 ? fret : fretForSemitone(index, semitones));
    if (audioContext?.state === 'running') {
      const frequency = FREQUENCIES[index] * 2 ** (semitones / 12);
      ping(frequency, 1.5, clamp(Math.abs(amount) * 2.8, 0.035, 0.2), index === 1 ? 'triangle' : 'sine');
    }
  }

  function bendPitch(index, offset, baseSemitones = 0) {
    const tension = clamp(Math.abs(offset) / (S * 0.14), 0, 1);
    const semitones = tension * params.bendRange;
    return {
      frequency: FREQUENCIES[index] * 2 ** ((baseSemitones + semitones) / 12),
      semitones,
      tension,
    };
  }

  function createBendVoice(index, baseSemitones = 0) {
    const ac = audioContext;
    if (!ac || ac.state !== 'running' || state.held !== index || state.bendVoice) return;
    const oscillator = ac.createOscillator();
    const gain = ac.createGain();
    oscillator.type = index === 1 ? 'triangle' : 'sine';
    oscillator.frequency.value = FREQUENCIES[index] * 2 ** (baseSemitones / 12);
    gain.gain.setValueAtTime(0.0001, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.012, ac.currentTime + 0.04);
    oscillator.connect(gain);
    gain.connect(audioMaster);
    oscillator.start();
    state.bendVoice = { oscillator, gain, index, baseSemitones };
  }

  function beginBendVoice(index, baseSemitones = 0) {
    const ac = wakeAudio();
    if (!ac) return;
    if (ac.state === 'running') createBendVoice(index, baseSemitones);
    else ac.resume().then(() => createBendVoice(index, baseSemitones));
  }

  function updateBendVoice(index) {
    const voice = state.bendVoice;
    if (!voice || voice.index !== index || !audioContext) return;
    const pitch = bendPitch(index, state.tines[index].offset, voice.baseSemitones);
    const now = audioContext.currentTime;
    voice.oscillator.frequency.setTargetAtTime(pitch.frequency, now, 0.015);
    voice.gain.gain.setTargetAtTime(0.012 + pitch.tension * 0.028, now, 0.025);
  }

  function releaseBendVoice(index) {
    const voice = state.bendVoice;
    const baseSemitones = voice?.baseSemitones ?? state.heldSemitones;
    const pitch = bendPitch(index, state.tines[index].offset, baseSemitones);
    if (!voice || voice.index !== index || !audioContext) {
      ping(pitch.frequency, 1.2, 0.12, index === 1 ? 'triangle' : 'sine');
      return;
    }
    const now = audioContext.currentTime;
    voice.oscillator.frequency.cancelScheduledValues(now);
    voice.oscillator.frequency.setValueAtTime(pitch.frequency, now);
    voice.oscillator.frequency.exponentialRampToValueAtTime(FREQUENCIES[index] * 2 ** (baseSemitones / 12), now + 0.8);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(0.1, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
    voice.oscillator.stop(now + 1.32);
    state.bendVoice = null;
  }

  function stopBendVoice() {
    const voice = state.bendVoice;
    if (!voice || !audioContext) return;
    const now = audioContext.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, 0.01);
    voice.oscillator.stop(now + 0.08);
    state.bendVoice = null;
  }

  function stopLesson() {
    setSwitch(lessonButton, 'lesson', false);
    state.lesson = null;
    updateHint();
  }

  function startLesson() {
    stopDemo();
    setSwitch(demoButton, 'demo', false);
    setSwitch(fretsButton, 'frets', true);
    setSwitch(lessonButton, 'lesson', true);
    state.fretGesture = null;
    state.lesson = { index: 0, complete: false, celebration: 0 };
    updateHint();
  }

  function registerLessonNote(index, semitones) {
    const target = lessonTarget();
    if (!target || index !== target.index || semitones !== target.semitones) return;
    state.lesson.index += 1;
    if (state.lesson.index >= ODE.length) {
      state.lesson.complete = true;
      state.lesson.celebration = 1;
      setSwitch(lessonButton, 'lesson', false);
    }
    updateHint();
  }

  function releaseDemoTine() {
    const currentNote = state.demo?.current;
    if (!currentNote?.bent || currentNote.released) return;
    const tine = state.tines[currentNote.index];
    tine.held = false;
    tine.v += Math.sign(currentNote.target) * 1.2;
    currentNote.released = true;
  }

  function beginDemoNote() {
    const demo = state.demo;
    const [index, semitones, beats] = ODE[demo.index];
    const duration = (60 / ODE_TEMPO) * beats;
    const bent = semitones > 0 && !params.frets;
    const direction = index === 2 ? -1 : 1;
    const target = direction * (semitones / params.bendRange) * S * 0.14;
    demo.current = { index, semitones, duration, elapsed: 0, target, bent, released: false };
    if (bent) {
      state.tines[index].held = true;
      state.tines[index].v = 0;
      ping(FREQUENCIES[index] * 2 ** (semitones / 12), Math.min(0.7, duration * 0.9), 0.11, index === 1 ? 'triangle' : 'sine');
      return;
    }
    const fret = params.frets ? fretForSemitone(index, semitones) : -1;
    const directionOfHit = demo.index % 2 ? 1 : -1;
    strikeTine(index, directionOfHit * 0.038, 0.82, semitones, fret);
  }

  function startDemo() {
    wakeAudio();
    stopLesson();
    setSwitch(demoButton, 'demo', true);
    stopBendVoice();
    if (state.held >= 0) state.tines[state.held].held = false;
    state.held = -1;
    state.demo = { index: 0, current: null, pause: 0.25 };
    updateHint();
  }

  function stopDemo() {
    if (!state.demo) return;
    releaseDemoTine();
    state.demo = null;
    updateHint();
  }

  function stepDemo() {
    const demo = state.demo;
    if (!demo || !params.demo) return;
    if (demo.pause > 0) {
      demo.pause -= STEP;
      return;
    }
    if (!demo.current) beginDemoNote();
    const currentNote = demo.current;
    currentNote.elapsed += STEP;
    if (currentNote.bent && !currentNote.released) {
      const attack = Math.min(0.14, currentNote.duration * 0.3);
      const releaseAt = currentNote.duration * 0.72;
      const tine = state.tines[currentNote.index];
      if (currentNote.elapsed < attack) {
        const t = currentNote.elapsed / attack;
        tine.offset = currentNote.target * (1 - (1 - t) ** 3);
      } else if (currentNote.elapsed < releaseAt) {
        tine.offset = currentNote.target + Math.sin(currentNote.elapsed * 48) * S * 0.0015;
      } else {
        releaseDemoTine();
      }
    }
    if (currentNote.elapsed < currentNote.duration) return;
    releaseDemoTine();
    demo.current = null;
    demo.index += 1;
    if (demo.index >= ODE.length) {
      demo.index = 0;
      demo.pause = 1.1;
    }
  }

  function strumTines() {
    ROWS.forEach((row, index) => {
      const y = row * S;
      const crossed = (pointer.py < y && pointer.y >= y) || (pointer.py > y && pointer.y <= y);
      const tine = state.tines[index];
      const inside = pointer.x >= STEM_X * S - S * 0.012 && pointer.x <= tine.end + S * 0.012;
      if (!crossed || !inside || tine.cooldown > 0) return;
      const fret = params.frets ? fretAt(index, pointer.x) : -1;
      if (params.frets && fret < 0) return;
      const semitones = fret >= 0 ? FRET_STEPS[index][fret] : 0;
      const direction = Math.sign(pointer.y - pointer.py) || 1;
      const strength = clamp(Math.abs(pointer.y - pointer.py) / S * 0.7, 0.012, 0.07);
      const position = clamp((pointer.x - STEM_X * S) / (tine.end - STEM_X * S), 0, 1);
      strikeTine(index, direction * strength, position, semitones, fret);
      registerLessonNote(index, semitones);
    });
  }

  function beginFretBend(gesture) {
    if (gesture.row < 0 || gesture.fret < 0) return;
    const tine = state.tines[gesture.row];
    state.held = gesture.row;
    state.heldFret = gesture.fret;
    state.heldSemitones = FRET_STEPS[gesture.row][gesture.fret];
    state.grabY = gesture.startY - tine.offset;
    tine.held = true;
    tine.v = 0;
    lightFret(gesture.row, gesture.fret);
    beginBendVoice(gesture.row, state.heldSemitones);
    gesture.mode = 'bend';
  }

  function moveFretGesture() {
    const gesture = state.fretGesture;
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
      if (Math.abs(dx) > Math.abs(dy) * 0.85) gesture.mode = 'horizontal';
      else if (elapsed < 150) gesture.mode = 'strum';
      else beginFretBend(gesture);
    }
    if (gesture.mode === 'horizontal') {
      const fret = fretAt(gesture.row, pointer.x);
      if (fret >= 0 && fret !== gesture.fret) {
        gesture.fret = fret;
        const tine = state.tines[gesture.row];
        const position = clamp((pointer.x - STEM_X * S) / (tine.end - STEM_X * S), 0, 1);
        const semitones = FRET_STEPS[gesture.row][fret];
        strikeTine(gesture.row, (Math.sign(pointer.x - pointer.px) || 1) * 0.03, position, semitones, fret);
        registerLessonNote(gesture.row, semitones);
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

  function step() {
    stepDemo();
    if (state.lesson?.complete) {
      state.lesson.celebration *= 0.965;
      if (state.lesson.celebration < 0.04) {
        state.lesson = null;
        updateHint();
      }
    }
    state.tines.forEach((tine, index) => {
      tine.cooldown = Math.max(0, tine.cooldown - STEP);
      tine.highlight = tine.held ? 1 : tine.highlight * 0.94;
      const highlightDecay = state.lesson ? 0.89 : 0.92;
      tine.fretHighlights = tine.fretHighlights.map((value) => (tine.held ? value : value * highlightDecay));
      if (tine.held && state.held === index && state.heldFret >= 0) tine.fretHighlights[state.heldFret] = 1;
      if (!tine.held) {
        tine.v += -tine.offset * 0.055 * params.bend;
        tine.v *= params.decay;
        tine.offset += tine.v;
        tine.offset = clamp(tine.offset, -S * 0.17, S * 0.17);
      }
    });
  }

  function draw() {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    const stroke = S * 0.016;
    const stemX = STEM_X * S;
    const target = lessonTarget();
    const eventColor = state.lesson ? BLUE : RED;

    state.tines.forEach((tine, index) => {
      const start = stemX;
      const length = tine.end - start;
      ctx.lineWidth = stroke;
      ctx.lineCap = 'butt';
      ctx.strokeStyle = params.frets ? INK : tine.highlight > 0.06 ? RED : INK;
      tinePath(tine, start, length);
      ctx.stroke();

      if (params.frets) {
        const count = FRET_STEPS[index].length;
        if (target?.index === index) {
          const x1 = start + (length * target.fret) / count;
          const x2 = start + (length * (target.fret + 1)) / count;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x1 - 1, 0, x2 - x1 + 2, S);
          ctx.clip();
          ctx.globalAlpha = 0.7 + Math.sin(performance.now() * 0.006) * 0.18;
          ctx.strokeStyle = BLUE;
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
      const tipHot = params.frets ? tine.fretHighlights[tipFret] > 0.06 : tine.highlight > 0.06;
      ctx.fillStyle = tipHot ? eventColor : INK;
      ctx.beginPath();
      ctx.arc(tine.end, tine.y + tine.offset, stroke / 2, 0, Math.PI * 2);
      ctx.fill();

      if (params.frets && !tine.held && tine.fretHighlights[tine.lastFret] > 0.12) {
        const t = (tine.lastFret + 0.5) / FRET_STEPS[index].length;
        ctx.fillStyle = eventColor;
        ctx.font = `${Math.max(9, S * 0.016)}px 'DM Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(noteName(index, FRET_STEPS[index][tine.lastFret]), start + length * t, tineYAt(tine, t) - S * 0.022);
      }

      if (target?.index === index) {
        const t = (target.fret + 0.5) / FRET_STEPS[index].length;
        ctx.fillStyle = BLUE;
        ctx.font = `${Math.max(9, S * 0.015)}px 'DM Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${noteName(index, target.semitones)} · ${state.lesson.index + 1}/${ODE.length}`, start + length * t, tineYAt(tine, t) - S * 0.024);
      }

      if (tine.held) {
        const demoNote = state.demo?.current;
        const automated = demoNote?.index === index && demoNote.bent;
        const pitch = automated ? { semitones: demoNote.semitones } : bendPitch(index, tine.offset, state.held === index ? state.heldSemitones : 0);
        const markerX = automated ? tine.end : pointer.x;
        const markerY = automated ? tine.y + tine.offset : pointer.y;
        ctx.fillStyle = eventColor;
        ctx.beginPath();
        ctx.arc(markerX, markerY, S * 0.011, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `${Math.max(9, S * 0.018)}px 'DM Mono', monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        const label = params.frets ? noteName(index, state.heldSemitones) : BASE_NAMES[index];
        ctx.fillText(`${automated ? 'авто · ' : ''}${label} +${pitch.semitones.toFixed(1)}`, markerX + S * 0.022, markerY - S * 0.016);
      }

      const energy = clamp((Math.abs(tine.offset) + Math.abs(tine.v) * 2) / (S * 0.1), 0, 1);
      if (energy > 0.04) {
        ctx.strokeStyle = state.lesson ? `rgba(23,105,194,${energy * 0.7})` : `rgba(224,33,15,${energy * 0.7})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(tine.end, tine.y + tine.offset, S * (0.022 + energy * 0.025), 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    if (state.lesson?.complete && state.lesson.celebration > 0.04) {
      const radius = S * (0.08 + (1 - state.lesson.celebration) * 0.18);
      ctx.strokeStyle = `rgba(23,105,194,${state.lesson.celebration * 0.8})`;
      ctx.lineWidth = Math.max(1, S * 0.004 * state.lesson.celebration);
      ctx.beginPath();
      ctx.arc(S * 0.5, S * 0.5, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Стойка лежит поверх струн, поэтому стыки остаются ровными и одноцветными.
    ctx.fillStyle = INK;
    ctx.fillRect(stemX - stroke / 2, ROWS[0] * S - stroke / 2, stroke, (ROWS[2] - ROWS[0]) * S + stroke);
  }

  function resize() {
    const bounds = workspace.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const previous = S || bounds.width;
    W = Math.max(1, bounds.width);
    H = Math.max(1, bounds.height);
    S = Math.min(W, H);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ratio = S / previous;
    if (!state.tines.length) {
      state.tines = ROWS.map((row, index) => ({
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
      return;
    }
    state.tines.forEach((tine, index) => {
      tine.y = ROWS[index] * S;
      tine.end = ENDS[index] * S;
      tine.offset *= ratio;
      tine.v *= ratio;
    });
  }

  function track(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    pointer.x = event.clientX - bounds.left;
    pointer.y = event.clientY - bounds.top;
  }

  function stopDemoFromTouch() {
    if (!state.demo) return;
    setSwitch(demoButton, 'demo', false);
    stopDemo();
  }

  function onPointerDown(event) {
    track(event);
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    pointer.down = true;
    canvas.setPointerCapture(event.pointerId);
    stopDemoFromTouch();
    wakeAudio();
    const row = nearRow(pointer.y, params.frets ? 0.085 : 0.055);
    if (params.frets) {
      const fret = row >= 0 ? fretAt(row, pointer.x) : -1;
      state.fretGesture = {
        row,
        fret,
        startX: pointer.x,
        startY: pointer.y,
        startedAt: performance.now(),
        mode: row >= 0 && fret >= 0 ? 'pending' : 'strum',
      };
      if (row >= 0 && fret >= 0) {
        const tine = state.tines[row];
        const position = clamp((pointer.x - STEM_X * S) / (tine.end - STEM_X * S), 0, 1);
        const semitones = FRET_STEPS[row][fret];
        strikeTine(row, 0.028, position, semitones, fret);
        registerLessonNote(row, semitones);
      }
      return;
    }
    if (row < 0 || pointer.x < STEM_X * S || pointer.x > ENDS[row] * S + S * 0.03) return;
    state.held = row;
    state.heldSemitones = 0;
    state.heldFret = -1;
    state.tines[row].held = true;
    state.grabY = pointer.y - state.tines[row].offset;
    beginBendVoice(row);
  }

  function onPointerMove(event) {
    track(event);
    if (state.held >= 0) {
      const tine = state.tines[state.held];
      tine.offset = clamp(pointer.y - state.grabY, -S * 0.14, S * 0.14);
      tine.v = clamp((pointer.y - pointer.py) * 0.12, -4, 4);
      if (state.heldFret >= 0) lightFret(state.held, state.heldFret);
      updateBendVoice(state.held);
      return;
    }
    if (state.demo) return;
    if (params.frets && pointer.down) moveFretGesture();
    else strumTines();
  }

  function onPointerUp(event) {
    track(event);
    if (state.held >= 0) {
      const index = state.held;
      const tine = state.tines[index];
      tine.held = false;
      tine.v = clamp(tine.v + (pointer.y - pointer.py) * 0.1, -5, 5);
      releaseBendVoice(index);
    }
    state.held = -1;
    state.heldSemitones = 0;
    state.heldFret = -1;
    state.fretGesture = null;
    pointer.down = false;
  }

  function frame(now) {
    debt = Math.min(0.1, debt + (now - last) / 1000);
    last = now;
    while (debt >= STEP) {
      step();
      debt -= STEP;
    }
    draw();
    frameId = requestAnimationFrame(frame);
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';

  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.hidden = true;
  panel.style.width = '178px';

  function makeSwitch(label, key, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sketch-switch';
    button.textContent = label;
    button.setAttribute('aria-pressed', String(params[key]));
    button.addEventListener('click', () => action(!params[key]));
    panel.append(button);
    return button;
  }

  fretsButton = makeSwitch('лады', 'frets', (enabled) => {
    setSwitch(fretsButton, 'frets', enabled);
    state.fretGesture = null;
    if (!enabled && state.lesson) stopLesson();
    updateHint();
  });

  demoButton = makeSwitch('ода сама', 'demo', (enabled) => {
    if (enabled) startDemo();
    else {
      setSwitch(demoButton, 'demo', false);
      stopDemo();
    }
  });

  lessonButton = makeSwitch('учусь', 'lesson', (enabled) => {
    if (enabled) startLesson();
    else stopLesson();
  });

  const ranges = [
    { key: 'decay', label: 'затухание', min: 0.965, max: 0.998, step: 0.001 },
    { key: 'bend', label: 'податливость', min: 0.5, max: 1.8, step: 0.05 },
    { key: 'bendRange', label: 'подтяжка', min: 2, max: 12, step: 1 },
  ];
  for (const control of ranges) {
    const label = document.createElement('label');
    const caption = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = control.min;
    input.max = control.max;
    input.step = control.step;
    input.value = params[control.key];
    const updateCaption = () => {
      if (control.key !== 'bendRange') {
        caption.textContent = control.label;
        return;
      }
      const value = Number(input.value);
      const unit = value >= 2 && value <= 4 ? 'полутона' : 'полутонов';
      caption.textContent = `+${value} ${unit}`;
    };
    updateCaption();
    input.addEventListener('input', () => {
      params[control.key] = Number(input.value);
      updateCaption();
    });
    label.append(caption, input);
    panel.append(label);
  }

  const chordButton = document.createElement('button');
  chordButton.type = 'button';
  chordButton.className = 'sketch-action';
  chordButton.textContent = 'аккорд';
  chordButton.addEventListener('click', () => {
    stopDemoFromTouch();
    wakeAudio();
    state.tines.forEach((_, index) => strikeTine(index, index === 1 ? 0.035 : -0.04));
  });
  panel.append(chordButton);

  const panelNote = document.createElement('p');
  panelNote.textContent = 'первое касание включает звук';
  panel.append(panelNote);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'sketch-toggle';
  toggle.dataset.letterLayer = '';
  toggle.textContent = 'параметры';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  });

  function onKeyDown(event) {
    if (event.key !== 'p' && event.key !== 'з') return;
    if (event.target.closest('input, textarea')) return;
    toggle.click();
  }

  workspace.append(hint, panel, toggle);
  updateHint();

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(workspace);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('keydown', onKeyDown);

  resize();
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    document.removeEventListener('keydown', onKeyDown);
    stopBendVoice();
    if (audioContext && audioContext.state !== 'closed') audioContext.close();
    hint.remove();
    panel.remove();
    toggle.remove();
    canvas.style.cursor = '';
    ctx.clearRect(0, 0, W, H);
    delete workspace.dataset.ground;
  };
}
