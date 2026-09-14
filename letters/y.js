import { reportEvent } from '../progress.js?v=7';

const STEP = 1 / 60;
const INK = '#161616';
const PAPER = '#f1ede5';
const RED = '#e0210f';
const ink = (alpha) => `rgba(22,22,22,${alpha})`;
const FESTIVE = ['#ff548a', '#ffb52e', '#38b5e5', '#9b78ef', '#a7cd39', '#ff7048'];
const PAINTS = ['чернила', 'праздник'];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

const FLOOR = 0.826;
const TALL = 0.68;
const WIDTH = 0.1035;
const STRIP = { top: 0.845, line: 0.95, left: 0.0474, pitch: 0.1142, width: 0.1031 };
const FORMANTS = [[300, 4, 1.6], [1550, 12, 1.1], [2450, 14, 0.5]];
const SCALES = [[0, 2, 4, 7, 9, 12], [0, 2, 4, 5, 7, 9, 11, 12]];
const SCALE_NAMES = ['пентатоника', 'мажор', 'как попало'];
const START_DRUMS = [1, 0, 2, 0, 1, 0, 2, 0];
const START_NOTES = [12, 19, 28];
const cell = (i) => STRIP.left + STRIP.pitch * i + STRIP.width / 2;

function formants(c, source, target) {
  for (const [frequency, q, level] of FORMANTS) {
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = frequency;
    band.Q.value = q;
    const amount = c.createGain();
    amount.gain.value = level;
    source.connect(band).connect(amount).connect(target);
  }
}

export function mountY(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { scale: 0, tempo: 120, voice: 5, beat: 8, drone: false, paint: 0 };
  const festive = (i) => FESTIVE[i % FESTIVE.length];
  const pointer = { x: 0, y: 0, px: 0, py: 0, down: false, id: null };
  let singers = [];
  let bubbles = [];
  let drums = [];
  let marks = [];
  let next = 0;
  let beat = 0;
  let time = 0;
  let grab = null;
  let sent = false;
  let paused = false;
  let serial = 0;
  let audio = null;
  let W = 1;
  let H = 1;
  let S = 1;
  let ox = 0;
  let oy = 0;
  let dpr = 1;
  let debt = 0;
  let last = performance.now();
  let frameId = 0;

  function wakeAudio() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
    if (!audio) {
      const context = new Context();
      const out = context.createDynamicsCompressor();
      const level = context.createGain();
      level.gain.value = 0.8;
      out.connect(level).connect(context.destination);
      const voices = context.createGain();
      const beats = context.createGain();
      voices.connect(out);
      beats.connect(out);
      const unlock = context.createBufferSource();
      unlock.buffer = context.createBuffer(1, 1, 22050);
      unlock.connect(out);
      unlock.start();
      audio = { context, voices, beats, noise: null };
    }
    if (!paused && audio.context.state !== 'running' && audio.context.state !== 'closed') audio.context.resume();
    return audio;
  }

  /* ---------- голоса ---------- */

  function pitch(singer) {
    const semis = clamp((singer.H - 0.06) / (TALL - 0.06), 0, 1) * 28;
    let note = semis;
    if (params.scale < 2) {
      const octave = Math.floor(semis / 12);
      const within = semis - octave * 12;
      let best = 0;
      for (const degree of SCALES[params.scale]) if (Math.abs(degree - within) < Math.abs(best - within)) best = degree;
      note = octave * 12 + best;
    }
    return 98 * 2 ** (note / 12);
  }

  function sing(singer, seconds = 0) {
    singer.until = seconds ? time + seconds : 0;
    singer.singing = true;
    if (singer.voice || !wakeAudio()) return;
    const c = audio.context, now = c.currentTime, frequency = pitch(singer);
    const source = c.createOscillator();
    source.type = 'sawtooth';
    source.frequency.value = frequency;
    const vibrato = c.createOscillator();
    vibrato.frequency.value = 4.5 + Math.random() * 1.5;
    const depth = c.createGain();
    depth.gain.value = frequency * 0.014;
    vibrato.connect(depth).connect(source.frequency);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.06);
    gain.connect(audio.voices);
    formants(c, source, gain);
    source.start(now);
    vibrato.start(now);
    singer.voice = { source, vibrato, depth, gain };
  }

  function hush(singer, sigh = true) {
    singer.singing = false;
    const voice = singer.voice;
    singer.voice = null;
    if (!voice) return;
    const now = audio.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.setTargetAtTime(0, now, sigh ? 0.09 : 0.02);
    if (sigh) voice.source.frequency.setTargetAtTime(voice.source.frequency.value * 0.78, now, 0.12);
    voice.source.stop(now + 0.6);
    voice.vibrato.stop(now + 0.6);
  }

  function retune(singer) {
    if (!singer.voice) return;
    const frequency = pitch(singer), now = audio.context.currentTime;
    singer.voice.source.frequency.setTargetAtTime(frequency, now, params.scale === 2 ? 0.01 : 0.025);
    singer.voice.depth.gain.setTargetAtTime(frequency * 0.014, now, 0.05);
  }

  /* ---------- бит: «ык» на восемь долей ---------- */

  function hit(at, low) {
    const c = audio.context, out = audio.beats;
    const length = low ? 0.2 : 0.08;
    const source = c.createOscillator();
    source.type = 'sawtooth';
    source.frequency.setValueAtTime(low ? 120 : 340, at);
    source.frequency.exponentialRampToValueAtTime(low ? 60 : 250, at + length);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(low ? 0.9 : 0.55, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    gain.connect(out);
    formants(c, source, gain);
    source.start(at);
    source.stop(at + length + 0.05);
    if (low) {
      const thump = c.createOscillator();
      thump.frequency.setValueAtTime(90, at);
      thump.frequency.exponentialRampToValueAtTime(40, at + 0.16);
      const body = c.createGain();
      body.gain.setValueAtTime(0.8, at);
      body.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
      thump.connect(body).connect(out);
      thump.start(at);
      thump.stop(at + 0.25);
    }
    if (!audio.noise) {
      audio.noise = c.createBuffer(1, Math.round(c.sampleRate * 0.04), c.sampleRate);
      const data = audio.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const click = c.createBufferSource();
    click.buffer = audio.noise;
    const air = c.createBiquadFilter();
    air.type = 'bandpass';
    air.frequency.value = 1700;
    air.Q.value = 0.8;
    const snap = c.createGain();
    const k = at + length * 0.85;
    snap.gain.setValueAtTime(0.0001, k);
    snap.gain.exponentialRampToValueAtTime(low ? 0.1 : 0.14, k + 0.008);
    snap.gain.exponentialRampToValueAtTime(0.0001, k + 0.04);
    click.connect(air).connect(snap).connect(out);
    click.start(k);
  }

  // Удары ставятся по часам звука с запасом вперёд, чтобы ритм не зависел от кадров.
  function schedule() {
    if (!audio || !drums.some(Boolean)) { next = 0; return; }
    const now = audio.context.currentTime, span = 30 / params.tempo;
    if (next < now - 0.05) next = now + 0.05;
    while (next < now + 0.12) {
      const kind = drums[beat];
      if (kind) hit(next, kind === 1);
      marks.push({ index: beat, at: next, hit: Boolean(kind) });
      beat = (beat + 1) % 8;
      next += span;
    }
    for (const mark of marks) if (mark.hit && !mark.shown && mark.at <= now) {
      mark.shown = true;
      bubbles.push({ x: cell(mark.index), y: STRIP.top - 0.005, size: 0.04, age: 0, color: mark.index, drift: (Math.random() - 0.5) * 0.05, text: 'ык' });
    }
    marks = marks.filter((mark) => mark.at > now - 1);
  }

  /* ---------- сцена ---------- */

  function addSinger(x, height) {
    if (singers.length >= 16) hush(singers.shift(), false);
    const singer = { x, color: serial++, H: clamp(height, WIDTH, TALL), singing: false, voice: null, until: 0, sway: 0, puff: 0, doomed: false, clock: 0 };
    singers.push(singer);
    return singer;
  }

  function clear() {
    for (const singer of singers) hush(singer, false);
    singers = [];
    bubbles = [];
    marks = [];
    drums = [0, 0, 0, 0, 0, 0, 0, 0];
    next = 0;
    beat = 0;
    serial = 0;
    grab = null;
  }

  function reset() {
    clear();
    drums = [...START_DRUMS];
    START_NOTES.forEach((semis, i) => addSinger(0.113 + i * 0.157, 0.06 + semis / 28 * (TALL - 0.06)));
  }

  function chorus() {
    if (params.drone && singers.length && singers.every((s) => s.singing)) {
      for (const singer of singers) hush(singer);
      return;
    }
    for (const singer of singers) sing(singer, params.drone ? 0 : 1.6);
  }

  function step() {
    time += STEP;
    if (audio) {
      audio.voices.gain.value = params.voice / 5;
      audio.beats.gain.value = params.beat / 5;
    }
    schedule();
    for (const s of singers) {
      if (s.singing && s.until && time > s.until && grab?.singer !== s) hush(s);
      s.sway *= 0.9;
      s.puff = lerp(s.puff, s.singing ? 1 : 0, 0.18);
      if (!s.singing) continue;
      s.clock += STEP;
      if (s.clock > 0.22) {
        s.clock = 0;
        bubbles.push({ x: s.x + (Math.random() - 0.5) * WIDTH * 0.6, y: FLOOR - s.H - WIDTH * 0.3,
          size: WIDTH * (0.35 + Math.random() * 0.3), age: 0, color: s.color, drift: (Math.random() - 0.5) * 0.04 });
      }
    }
    for (const b of bubbles) {
      b.age += STEP / 1.5;
      b.y -= STEP * 0.06;
      b.x += b.drift * STEP;
    }
    bubbles = bubbles.filter((b) => b.age < 1).slice(-90);
    if (!sent && next && singers.some((s) => s.singing)) { sent = true; reportEvent('Ы'); }
  }

  function line(x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width * S;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x1 * S, y1 * S);
    ctx.lineTo(x2 * S, y2 * S);
    ctx.stroke();
  }

  /* Геометрическая Ы: прямые палки, пузо — полукруг, концы квадратные. Все размеры в долях кадра. */
  function glyph(x, bottom, top, D, T, color, lean = 0, belly = 0) {
    const left = x - D / 2, right = x + D / 2;
    const b = bottom - T / 2, t = top + T / 2;
    const R = D * 0.273 + belly, cx = left + D * 0.374, cy = b - R;
    const stem = (y) => left + lean * (b - y) / (b - t);
    ctx.strokeStyle = color;
    ctx.lineWidth = T * S;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo((left + lean) * S, t * S);
    ctx.lineTo(left * S, b * S);
    ctx.moveTo((right + lean) * S, t * S);
    ctx.lineTo(right * S, b * S);
    ctx.lineCap = 'square';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(left * S, b * S);
    ctx.lineTo(cx * S, b * S);
    ctx.arc(cx * S, cy * S, R * S, Math.PI / 2, -Math.PI / 2, true);
    ctx.lineTo(stem(cy - R) * S, (cy - R) * S);
    ctx.lineCap = 'butt';
    ctx.stroke();
  }

  function draw() {
    if (params.scale < 2) {
      for (let octave = 0; octave < 3; octave++) for (const degree of SCALES[params.scale]) {
        const semis = octave * 12 + degree;
        if (semis > 28 || (degree === 12 && octave < 2)) continue;
        const y = FLOOR - (0.06 + semis / 28 * (TALL - 0.06));
        line(0.047, y, 0.949, y, ink(degree % 12 ? 0.09 : 0.16), 0.001);
      }
    }
    line(0.047, FLOOR, 0.949, FLOOR, INK, 0.0014);

    const now = audio ? audio.context.currentTime : 0;
    let cursor = -1;
    const struck = {};
    for (const mark of marks) if (mark.at <= now) {
      if (!mark.poke && next) cursor = mark.index;
      if (mark.hit || mark.poke) struck[mark.index] = mark.at;
    }
    for (let i = 0; i < 8; i++) {
      const x = STRIP.left + STRIP.pitch * i;
      line(x, STRIP.line, x + STRIP.width, STRIP.line, INK, i === cursor ? 0.0042 : 0.0014);
      if (!drums[i]) continue;
      const kick = Math.max(0, 1 - (now - (struck[i] ?? -9)) / 0.18);
      const lift = Math.sin(kick * Math.PI) * 0.012;
      glyph(cell(i), 0.936 - lift, 0.873 - lift, 0.0485, drums[i] === 1 ? 0.0167 : 0.0084, params.paint ? festive(i) : kick > 0 ? RED : INK);
    }

    for (const s of singers) {
      const shake = s.puff * Math.sin(time * 34 + s.x * 50) * 0.012;
      const belly = s.puff * WIDTH * (0.03 + Math.sin(time * 9 + s.x * 20) * 0.02);
      const color = s.doomed ? ink(0.25) : params.paint ? festive(s.color) : s.singing ? RED : INK;
      glyph(s.x, FLOOR, FLOOR - s.H, WIDTH, WIDTH * 0.281, color, (s.sway * 0.2 + shake) * s.H, belly);
    }

    ctx.textAlign = 'center';
    for (const b of bubbles) {
      ctx.fillStyle = params.paint ? festive(b.color) : RED;
      ctx.globalAlpha = 1 - b.age;
      ctx.font = `500 ${Math.round(b.size * S * (0.8 + b.age * 0.6))}px 'DM Mono', monospace`;
      ctx.fillText(b.text || 'ы', b.x * S, b.y * S);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  /* ---------- ввод ---------- */

  function hitSinger() {
    for (let i = singers.length - 1; i >= 0; i--) {
      const s = singers[i];
      if (Math.abs(pointer.x - s.x) < WIDTH * 0.64 + 0.012 && pointer.y > FLOOR - s.H - 0.03 && pointer.y < FLOOR + 0.02) return s;
    }
    return null;
  }

  function track(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    pointer.x = (event.clientX - bounds.left - ox) / S;
    pointer.y = (event.clientY - bounds.top - oy) / S;
  }

  function down(event) {
    if (pointer.down || (event.pointerType === 'mouse' && event.button !== 0)) return;
    track(event);
    if (pointer.x < 0 || pointer.x > 1 || pointer.y < 0 || pointer.y > 1) return;
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    pointer.down = true;
    pointer.id = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    if (pointer.y > STRIP.top) {
      const index = clamp(Math.floor((pointer.x - STRIP.left) / STRIP.pitch), 0, 7);
      drums[index] = (drums[index] + 1) % 3;
      if (drums[index] && wakeAudio()) {
        hit(audio.context.currentTime, drums[index] === 1);
        marks.push({ index, at: audio.context.currentTime, poke: true });
      }
      return;
    }
    let singer = hitSinger();
    const was = Boolean(singer?.singing);
    const dy = singer ? FLOOR - singer.H - pointer.y : 0;
    if (!singer) singer = addSinger(clamp(pointer.x, 0.05, 0.95), FLOOR - pointer.y);
    grab = { singer, was, dy, dx: singer.x - pointer.x, x0: pointer.x, y0: pointer.y };
    sing(singer);
  }

  function move(event) {
    if (event.pointerId !== pointer.id) return;
    track(event);
    if (!grab) return;
    const s = grab.singer;
    s.sway = clamp(s.sway + (pointer.x - pointer.px) * 6, -1, 1);
    s.x = clamp(pointer.x + grab.dx, 0.05, 0.95);
    s.doomed = pointer.y > STRIP.top + 0.01;
    s.H = clamp(FLOOR - pointer.y - grab.dy, WIDTH, TALL);
    retune(s);
  }

  function up(event) {
    if (event.pointerId !== pointer.id) return;
    pointer.down = false;
    pointer.id = null;
    if (!grab) return;
    const { singer, was, x0, y0 } = grab;
    grab = null;
    const tap = Math.hypot(pointer.x - x0, pointer.y - y0) < 0.01;
    if (singer.doomed) {
      hush(singer);
      singers.splice(singers.indexOf(singer), 1);
    } else if (!params.drone || event.type === 'pointercancel' || (was && tap)) hush(singer);
  }

  /* ---------- панель ---------- */

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'касание — новая Ы · тяни вверх — выше · внизу — бит';

  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.hidden = true;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'sketch-toggle';
  toggle.dataset.letterLayer = '';
  toggle.textContent = 'параметры (tab)';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  });

  function action(label, run, className = 'sketch-action') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', run);
    panel.append(button);
    return button;
  }

  function range(key, label, min, max, step) {
    const wrap = document.createElement('label');
    const caption = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = params[key];
    const paint = () => { caption.textContent = `${label} · ${params[key]}`; };
    input.addEventListener('input', () => { params[key] = Number(input.value); paint(); });
    paint();
    wrap.append(caption, input);
    panel.append(wrap);
  }

  const scale = action('', () => {
    params.scale = (params.scale + 1) % SCALE_NAMES.length;
    scale.textContent = `лад · ${SCALE_NAMES[params.scale]}`;
    for (const singer of singers) retune(singer);
  });
  scale.textContent = `лад · ${SCALE_NAMES[params.scale]}`;
  range('tempo', 'темп', 70, 180, 10);
  range('voice', 'громкость хора', 0, 10, 1);
  range('beat', 'громкость бита', 0, 10, 1);
  const drone = action('не замолкать', () => {
    params.drone = !params.drone;
    drone.setAttribute('aria-pressed', String(params.drone));
  }, 'sketch-switch');
  drone.setAttribute('aria-pressed', 'false');
  const paint = action(`краска · ${PAINTS[0]}`, () => {
    params.paint = (params.paint + 1) % PAINTS.length;
    paint.textContent = `краска · ${PAINTS[params.paint]}`;
  });
  action('хором', chorus);
  action('очистить', clear);
  action('заново', reset);
  const pause = action('пауза', () => {
    paused = !paused;
    pause.textContent = paused ? 'продолжить' : 'пауза';
    debt = 0;
    if (audio && audio.context.state !== 'closed') paused ? audio.context.suspend() : audio.context.resume();
  });

  function key(event) {
    if (event.target.closest('input, textarea, select')) return;
    const pressed = event.key.toLowerCase();
    if (event.key === 'Tab') { event.preventDefault(); toggle.click(); }
    if (event.code === 'Space') { event.preventDefault(); pause.click(); }
    if (event.code === 'KeyC' || pressed === 'c' || pressed === 'с') clear();
    if (event.code === 'KeyR' || pressed === 'r' || pressed === 'к') reset();
  }

  function resize() {
    W = workspace.clientWidth;
    H = workspace.clientHeight;
    S = Math.min(W, H);
    ox = (W - S) / 2;
    oy = (H - S) / 2;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  function frame(now) {
    debt = paused ? 0 : Math.min(0.1, debt + (now - last) / 1000);
    last = now;
    while (debt >= STEP) {
      step();
      debt -= STEP;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    ctx.translate(ox, oy);
    draw();
    frameId = requestAnimationFrame(frame);
  }

  workspace.dataset.ground = 'paper';
  canvas.style.cursor = 'pointer';
  workspace.append(hint, panel, toggle);
  const observer = new ResizeObserver(resize);
  observer.observe(workspace);
  resize();
  reset();
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  document.addEventListener('keydown', key);
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    observer.disconnect();
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    document.removeEventListener('keydown', key);
    if (audio && audio.context.state !== 'closed') audio.context.close();
    hint.remove();
    panel.remove();
    toggle.remove();
    canvas.style.cursor = '';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
