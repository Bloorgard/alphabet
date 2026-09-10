import { reportScore } from '../progress.js?v=5';

/* Ш · кольца в воде.
   Три зубца — штырьки, перекладина — салазки: буква ездит по дну сосуда и
   ловит кольца, которые подбрасывают струи. Вода нигде не нарисована, она
   только в поведении: подъёмная сила, вязкость и пузырьки у работающего сопла. */

const STEP = 1 / 60;
const INK = '#161616';
const PAPER = '#f1ede5';
const RED = '#e0210f';

/* Геометрия буквы в долях сцены. Ширина выбрана так, чтобы Ш оставалось где
   ездить: занимает половину сцены, ход центра — от 0.25 до 0.75. */
const THICK = 0.06;
const SPACING = 0.22;
const TOP = 0.34;
const BOTTOM = 0.84;
const HALF = SPACING + THICK / 2;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function mountSh(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const pointer = { x: 0.5, y: 0.5, down: false };
  let W = 1;
  let H = 1;
  let S = 1;
  let ox = 0;
  let oy = 0;
  let dpr = 1;
  let last = performance.now();
  let debt = 0;
  let frameId = 0;

  const rig = { x: 0.5, target: 0.5 };

  const teeth = () => [rig.x - SPACING, rig.x, rig.x + SPACING];

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    S = Math.min(W, H);
    ox = (W - S) / 2;
    oy = (H - S) / 2;
  }

  function track(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left - ox) / S;
    pointer.y = (event.clientY - rect.top - oy) / S;
  }

  function step() {
    rig.x += (rig.target - rig.x) * 0.2;
  }

  /* Буква собрана штрихами со скруглёнными торцами: круглые концы зубцов и
     скруглённые углы перекладины — часть почерка, обводить контур незачем. */
  function drawRig() {
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = THICK * S;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const x of teeth()) {
      ctx.moveTo(x * S, TOP * S);
      ctx.lineTo(x * S, BOTTOM * S);
    }
    ctx.moveTo((rig.x - HALF + THICK / 2) * S, BOTTOM * S);
    ctx.lineTo((rig.x + HALF - THICK / 2) * S, BOTTOM * S);
    ctx.stroke();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    ctx.translate(ox, oy);
    drawRig();
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

  function move(event) {
    track(event);
    rig.target = clamp(pointer.x, HALF, 1 - HALF);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(workspace);
  resize();

  canvas.addEventListener('pointermove', move);
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    observer.disconnect();
    canvas.removeEventListener('pointermove', move);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
