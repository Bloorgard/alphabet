/* Тонкий слой между буквой и холстом Я.

   Буква знает про копилку ровно две вещи: чем кончилась партия и как эта
   буква называется. Всё остальное — рекорд, место в топе, начисление —
   считает сервер, потому что иначе счёт пришлось бы охранять на клиенте.

   Слой обязан молчать при любой беде: сайт лежит на одном хостинге, холст
   на Cloudflare, и они друг о друге не знают. Нет сети, нет ответа, нет
   ещё имени участника — буква не должна ни падать, ни ждать.

   Пока участник не представился, токена нет и слать некуда. Результат в
   этом случае не выбрасывается, а ложится в очередь: холст, получив имя,
   отправит накопленное сам. Очередь держит по одному, лучшему результату
   на букву — сервер всё равно начисляет только за улучшение рекорда. */

export const API = '/api';
const TOKEN_KEY = 'alphabet.token';
const QUEUE_KEY = 'alphabet.pending';

/* Локальная копия сайта живёт без Worker: боевой API не пустит её по CORS,
   а проверять связь игры с холстом надо. На localhost слой отвечает сам. */
export const DEMO = location.hostname === 'localhost' || new URLSearchParams(location.search).has('demo');

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Приватный режим или переполненное хранилище: очередь просто не ведётся. */
  }
}

export function saveToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* Без хранилища участник живёт до перезагрузки — это лучше, чем отказ. */
  }
}

export function playerToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/* Очередь непредставившегося участника: {letter: value} и {letter: true}. */
export function pendingProgress() {
  const queue = readStore(QUEUE_KEY, {});
  return queue && typeof queue === 'object' ? queue : {};
}

export function clearPendingProgress() {
  writeStore(QUEUE_KEY, {});
}

function remember(kind, letter, value) {
  const queue = pendingProgress();
  const box = queue[kind] && typeof queue[kind] === 'object' ? queue[kind] : {};
  if (kind === 'scores') box[letter] = Math.max(Number(box[letter]) || 0, value);
  else box[letter] = true;
  queue[kind] = box;
  writeStore(QUEUE_KEY, queue);
}

async function post(path, body) {
  if (DEMO) return { earned: 1, demo: true };
  const token = playerToken();
  if (!token) return null;
  try {
    const response = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/* Результат игровой буквы. Возвращает {earned, wallet} или null, если
   отправить не удалось — буква на это никак не реагирует. */
export async function reportScore(letter, value) {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0) return null;
  if (!playerToken() && !DEMO) {
    remember('scores', letter, score);
    return null;
  }
  const result = await post('/score', { letter, value: score });
  if (result?.earned > 0) award(result.earned);
  return result;
}

/* Награда показывается там, где заработана: связь игры с холстом должна
   читаться в самой букве, а не обнаруживаться потом на главной. Видимость
   держится на стилях, а не на анимации — иначе при prefers-reduced-motion
   подпись не появится вовсе. */
function award(earned) {
  const workspace = document.querySelector('.letter-workspace');
  if (!workspace) return;
  const note = document.createElement('p');
  note.className = 'wall-award';
  note.dataset.letterLayer = '';
  const forms = ['клетка', 'клетки', 'клеток'];
  const ten = earned % 10;
  const hundred = earned % 100;
  const form = ten === 1 && hundred !== 11 ? forms[0]
    : ten >= 2 && ten <= 4 && (hundred < 10 || hundred >= 20) ? forms[1]
    : forms[2];
  note.textContent = `+${earned} ${form} на холсте Я`;
  workspace.append(note);
  setTimeout(() => note.classList.add('is-gone'), 3000);
  setTimeout(() => note.remove(), 3400);
}

/* Событие неигровой буквы — то, ради чего буква сделана. Сервер засчитает
   его один раз за всё время, поэтому повторные вызовы безвредны. */
export async function reportEvent(letter) {
  if (!playerToken() && !DEMO) {
    remember('events', letter, true);
    return null;
  }
  return post('/event', { letter });
}
