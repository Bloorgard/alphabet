/* Холст буквы Я на главной.

   Последнюю букву челленджа рисует не автор, а участники: клетка достаётся
   за игру в буквах и ставится на общее полотно. Здесь холст только
   показывается — ставят клетки внутри сцены Я.

   Модуль ничего не ломает, если сервер молчит: блок остаётся скрытым,
   страница живёт как прежде. */

import { YA_AREA, maskCells } from './ya-mask.js?v=1';

const API = 'https://alphabet.pustota.link/api';
const GRID = 32;

/* На локальной копии боевой API недоступен по CORS, а композицию смотреть
   надо. Демонстрационные отметки детерминированы: холст не пересыпается
   на каждой перезагрузке. */
const DEMO = location.hostname === 'localhost' || new URLSearchParams(location.search).has('demo');

const wall = document.querySelector('#wall');
const canvas = document.querySelector('#wall-canvas');
const caption = document.querySelector('#wall-caption');

function shuffled(list, seed) {
  const out = list.slice();
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

async function load() {
  if (DEMO) {
    const order = shuffled(maskCells(), 5);
    const marks = order.slice(0, 148).map((index) => ({ x: index % GRID, y: Math.floor(index / GRID), level: 0 }));
    const mine = new Set(order.slice(140, 148).map((index) => `${index % GRID}:${Math.floor(index / GRID)}`));
    return { level: 0, marks, mine };
  }

  const response = await fetch(`${API}/state`);
  if (!response.ok) throw new Error('нет состояния');
  const state = await response.json();
  const token = localStorage.getItem('alphabet-player') || '';
  const mine = new Set(
    state.marks.filter((mark) => mark.playerId === token).map((mark) => `${mark.x}:${mark.y}`),
  );
  return { level: state.canvas.level, marks: state.marks, mine };
}

function draw(state) {
  const ctx = canvas.getContext('2d');
  const size = canvas.getBoundingClientRect().width;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const grid = GRID * (2 ** state.level);
  const step = size / grid;
  const gap = Math.max(0.5, step * 0.1);

  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
  const red = getComputedStyle(document.documentElement).getPropertyValue('--red').trim();

  for (const mark of state.marks) {
    const own = state.mine.has(`${mark.x}:${mark.y}`);
    const span = 2 ** (state.level - mark.level);
    /* Прежние уровни крупнее и бледнее: история не стирается, а уходит
       в подложку, по которой рисуют дальше. */
    ctx.globalAlpha = own ? 1 : Math.max(0.25, 0.72 / span);
    ctx.fillStyle = own ? red : ink;
    ctx.fillRect(mark.x * span * step, mark.y * span * step, step * span - gap, step * span - gap);
  }
  ctx.globalAlpha = 1;

  const mine = state.mine.size;
  caption.textContent = mine
    ? `${state.marks.length}/${YA_AREA} · твоих ${mine}`
    : `${state.marks.length}/${YA_AREA}`;
}

async function start() {
  if (!wall || !canvas || !caption) return;
  try {
    const state = await load();
    wall.hidden = false;
    draw(state);
    window.addEventListener('resize', () => draw(state));
  } catch (error) {
    /* Сайт живёт на одном сервере, холст на другом. Молчит холст — молчит
       и блок: страница остаётся прежней. */
    wall.hidden = true;
  }
}

start();
