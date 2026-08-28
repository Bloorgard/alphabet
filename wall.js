/* Холст буквы Я: доступ к состоянию и блок на главной.

   Последнюю букву челленджа рисует не автор, а участники: клетка достаётся
   за игру в буквах и ставится на общее полотно. Здесь холст только
   показывается и служит входом в букву; ставят клетки внутри сцены Я.

   Модуль ничего не ломает, если сервер молчит: блок остаётся скрытым,
   страница живёт как прежде. */

import { YA_AREA, maskCells } from './ya-mask.js?v=1';

const API = 'https://alphabet.pustota.link/api';
const TOKEN_KEY = 'alphabet-player';

/* На локальной копии боевой API недоступен по CORS, а смотреть надо.
   Демонстрационное состояние детерминировано и живёт до перезагрузки. */
export const DEMO = location.hostname === 'localhost' || new URLSearchParams(location.search).has('demo');

const demo = {
  level: 0,
  marks: maskCells().length ? demoMarks() : [],
  name: null,
  wallet: 4,
  today: 0,
};

function demoMarks() {
  const order = shuffled(maskCells(), 5);
  const grid = 32;
  return order.slice(0, 148).map((index, i) => ({
    x: index % grid,
    y: Math.floor(index / grid),
    level: 0,
    owner: i >= 140 ? 'me' : `player-${i % 37}`,
    createdAt: Date.UTC(2026, 7, 20 + (i % 8)),
  }));
}

export function shuffled(list, seed) {
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

export function token() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

/* Состояние холста: уровень, отметки, лидеры игровых букв, свой кошелёк. */
export async function loadState() {
  if (DEMO) {
    return {
      level: demo.level,
      marks: demo.marks,
      names: { me: demo.name, 'player-3': 'ЗЕВ', 'player-7': 'ОСЬ' },
      leaders: [['З', 'ЗЕВ', 61], ['Ё', 'МУХА', 54], ['К', 'ОСЬ', 48]],
      me: demo.name ? 'me' : '',
      name: demo.name,
      wallet: demo.wallet,
    };
  }

  const response = await fetch(`${API}/state`);
  if (!response.ok) throw new Error('нет состояния');
  const state = await response.json();
  const mine = token();
  const leaders = Object.entries(state.top)
    .filter(([, rows]) => rows.length)
    .map(([letter, rows]) => [letter, rows[0].name, rows[0].value]);
  return {
    level: state.canvas.level,
    marks: state.marks.map((mark) => ({ ...mark, owner: mark.playerId })),
    names: state.names,
    leaders,
    me: mine,
    name: state.names[mine] || null,
    wallet: state.wallet ?? 0,
  };
}

export async function joinPlayer(name) {
  if (DEMO) {
    demo.name = name;
    return { name };
  }
  const response = await fetch(`${API}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error('имя не принято');
  const data = await response.json();
  localStorage.setItem(TOKEN_KEY, data.token);
  return data;
}

export async function putMark(x, y) {
  if (DEMO) {
    if (!demo.wallet) return { ok: false };
    demo.marks = [...demo.marks, { x, y, level: demo.level, owner: 'me', createdAt: Date.now() }];
    demo.wallet -= 1;
    return { ok: true, wallet: demo.wallet };
  }
  const response = await fetch(`${API}/mark`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token()}` },
    body: JSON.stringify({ x, y }),
  });
  if (!response.ok) return { ok: false };
  return response.json();
}

/* ---------- блок на главной ---------- */

const wall = document.querySelector('#wall');
const canvas = document.querySelector('#wall-canvas');
const caption = document.querySelector('#wall-caption');

function draw(state) {
  const ctx = canvas.getContext('2d');
  const size = canvas.getBoundingClientRect().width;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const grid = 32 * (2 ** state.level);
  const step = size / grid;
  const gap = Math.max(0.5, step * 0.1);

  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const styles = getComputedStyle(document.documentElement);
  const ink = styles.getPropertyValue('--ink').trim();
  const red = styles.getPropertyValue('--red').trim();

  let mine = 0;
  for (const mark of state.marks) {
    const own = state.me && mark.owner === state.me;
    if (own) mine += 1;
    const span = 2 ** (state.level - mark.level);
    /* Прежние уровни крупнее и бледнее: история не стирается, а уходит
       в подложку, по которой рисуют дальше. */
    ctx.globalAlpha = own ? 1 : Math.max(0.25, 0.72 / span);
    ctx.fillStyle = own ? red : ink;
    ctx.fillRect(mark.x * span * step, mark.y * span * step, step * span - gap, step * span - gap);
  }
  ctx.globalAlpha = 1;

  caption.textContent = mine
    ? `${state.marks.length}/${YA_AREA} · твоих ${mine}`
    : `${state.marks.length}/${YA_AREA}`;
}

async function start() {
  if (!wall || !canvas || !caption) return;
  try {
    const state = await loadState();
    wall.hidden = false;
    draw(state);
    window.addEventListener('resize', () => draw(state));
    /* Холст — вход в букву. Событием, а не вызовом: иначе получается кольцо
       app → letters/ya.js → wall.js → app. */
    canvas.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('open-letter', { detail: 'Я' }));
    });
    document.addEventListener('wall-changed', async () => draw(await loadState()));
  } catch (error) {
    /* Сайт живёт на одном сервере, холст на другом. Молчит холст — молчит
       и блок: страница остаётся прежней. */
    wall.hidden = true;
  }
}

start();
