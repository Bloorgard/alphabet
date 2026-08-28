export const LETTERS = [
  'А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ё', 'Ж', 'З', 'И', 'Й',
  'К', 'Л', 'М', 'Н', 'О', 'П', 'Р', 'С', 'Т', 'У', 'Ф', 'Х',
  'Ц', 'Ч', 'Ш', 'Щ', 'Ъ', 'Ы', 'Ь', 'Э', 'Ю', 'Я',
];

export const YA_BASE_GRID = 32;
/* Клеток внутри контура Я на сетке 32×32. Число не выдумано: столько даёт
   растеризация Manrope 700 с порогом альфы 110 — тем же кодом, что рисует
   холст на клиенте (см. lab/ya-lab.js). Меняется вместе с ним. */
export const YA_BASE_AREA = 357;
export const MAX_LEVEL = 2;
export const WALLET_CAP = 10;
export const DAILY_MARK_LIMIT = 5;
export const MAX_SCORE = 1_000_000;

export function normalizeName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().toUpperCase();
  return /^[A-ZА-ЯЁ]{1,5}$/.test(name) ? name : null;
}

export function validLetter(value) {
  return typeof value === 'string' && LETTERS.includes(value);
}

export function parseScore(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > MAX_SCORE) return null;
  return value;
}

export function gridSize(level) {
  return YA_BASE_GRID * (2 ** level);
}

export function areaAt(level) {
  return YA_BASE_AREA * (4 ** level);
}

export function priceForCount(count, level) {
  const ratio = count / areaAt(level);
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

export function validCoordinate(value, level) {
  return Number.isInteger(value) && value >= 0 && value < gridSize(level);
}

export function dailyStart(now) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

export function rankFor(scores, playerId, value, updatedAt) {
  const rows = scores
    .filter((score) => score.player_id !== playerId)
    .concat({ player_id: playerId, value, updated_at: updatedAt });
  rows.sort((a, b) => b.value - a.value || a.updated_at - b.updated_at || a.player_id.localeCompare(b.player_id));
  return rows.findIndex((score) => score.player_id === playerId) + 1;
}

export function scorePoints(previous, nextValue, nextRank) {
  if (previous && nextValue <= previous.value) return 0;
  let points = 1;
  if (previous?.best_rank && nextRank < previous.best_rank) points += 1;
  if (previous?.best_rank && previous.best_rank > 1 && nextRank === 1) points += 2;
  return points;
}
