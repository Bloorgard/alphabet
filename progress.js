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

const API = '/api';
const TOKEN_KEY = 'alphabet.token';
const QUEUE_KEY = 'alphabet.pending';

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
  if (!playerToken()) {
    remember('scores', letter, score);
    return null;
  }
  return post('/score', { letter, value: score });
}

/* Событие неигровой буквы — то, ради чего буква сделана. Сервер засчитает
   его один раз за всё время, поэтому повторные вызовы безвредны. */
export async function reportEvent(letter) {
  if (!playerToken()) {
    remember('events', letter, true);
    return null;
  }
  return post('/event', { letter });
}
