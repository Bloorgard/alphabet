import {
  DAILY_MARK_LIMIT,
  LETTERS,
  MAX_LEVEL,
  WALLET_CAP,
  areaAt,
  dailyStart,
  gridSize,
  normalizeName,
  parseScore,
  priceForCount,
  rankFor,
  scorePoints,
  validCoordinate,
  validLetter,
} from './core.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function headers(request, env) {
  const origin = env.CORS_ORIGIN || '*';
  return {
    ...JSON_HEADERS,
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'Authorization, Content-Type, X-Player-Token',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'cache-control': 'no-store',
  };
}

function json(request, env, body, status = 200, cacheControl = 'no-store') {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers(request, env), 'cache-control': cacheControl },
  });
}

function error(request, env, message, status = 400) {
  return json(request, env, { error: message }, status);
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function tokenFrom(request) {
  const bearer = request.headers.get('Authorization') || '';
  if (bearer.startsWith('Bearer ')) return bearer.slice(7).trim();
  return request.headers.get('X-Player-Token')?.trim() || '';
}

async function playerFrom(request, env) {
  const token = tokenFrom(request);
  if (!token) return null;
  return env.DB.prepare('SELECT id, name, ip_hash, hidden FROM players WHERE id = ?').bind(token).first();
}

async function hashIp(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const salt = env.IP_HASH_SALT || 'local-development-salt';
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function state(request, env) {
  const [canvas, marks, scores, players] = await Promise.all([
    env.DB.prepare('SELECT level, updated_at FROM canvas WHERE id = 1').first(),
    env.DB.prepare('SELECT x, y, level, player_id, created_at FROM marks ORDER BY id').all(),
    env.DB.prepare('SELECT player_id, letter, value, updated_at FROM scores ORDER BY letter, value DESC, updated_at ASC, player_id ASC').all(),
    env.DB.prepare('SELECT id, name, hidden FROM players').all(),
  ]);

  const names = Object.fromEntries(players.results.filter((player) => !player.hidden).map((player) => [player.id, player.name]));
  const top = Object.fromEntries(LETTERS.map((letter) => [letter, []]));
  for (const score of scores.results) {
    if (top[score.letter].length >= 5) continue;
    const player = players.results.find((item) => item.id === score.player_id);
    if (!player || player.hidden) continue;
    top[score.letter].push({ name: player.name, value: score.value });
  }

  return json(request, env, {
    canvas: { level: canvas?.level || 0, updatedAt: canvas?.updated_at || 0 },
    marks: marks.results.filter((mark) => names[mark.player_id]).map((mark) => ({
      x: mark.x, y: mark.y, level: mark.level, playerId: mark.player_id, createdAt: mark.created_at,
    })),
    names,
    top,
    participants: players.results.filter((player) => !player.hidden).length,
  }, 200, 'public, max-age=15, s-maxage=15');
}

async function join(request, env) {
  const data = await body(request);
  const name = normalizeName(data?.name);
  if (!name) return error(request, env, 'Имя: от 1 до 5 букв, кириллица или латиница');

  const token = crypto.randomUUID();
  const now = Date.now();
  const ipHash = await hashIp(request, env);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO players (id, name, created_at, ip_hash) VALUES (?, ?, ?, ?)').bind(token, name, now, ipHash),
    env.DB.prepare('INSERT INTO wallet (player_id, earned, spent) VALUES (?, 0, 0)').bind(token),
  ]);
  return json(request, env, { token, name });
}

async function score(request, env, player) {
  const data = await body(request);
  const letter = data?.letter;
  const value = parseScore(data?.value);
  if (!validLetter(letter) || value === null) return error(request, env, 'Некорректная буква или результат');

  const now = Date.now();
  const rows = await env.DB.prepare('SELECT player_id, value, updated_at, best_rank FROM scores WHERE letter = ?').bind(letter).all();
  const previous = rows.results.find((row) => row.player_id === player.id);
  if (previous && value <= previous.value) {
    const wallet = await env.DB.prepare('SELECT earned - spent AS balance FROM wallet WHERE player_id = ?').bind(player.id).first();
    return json(request, env, { earned: 0, wallet: wallet?.balance || 0 });
  }

  const nextRank = rankFor(rows.results, player.id, value, now);
  const points = scorePoints(previous, value, nextRank);

  const claimId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO scores (player_id, letter, value, updated_at, best_rank)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (player_id, letter) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at,
        best_rank = MIN(COALESCE(scores.best_rank, excluded.best_rank), excluded.best_rank)
      WHERE excluded.value > scores.value
    `).bind(player.id, letter, value, now, nextRank),
    env.DB.prepare(`
      INSERT INTO score_claims (id, player_id, letter, value, points, created_at)
      SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1
    `).bind(claimId, player.id, letter, value, points, now),
    env.DB.prepare(`
      UPDATE wallet
      SET earned = MIN(spent + ?, earned + COALESCE((SELECT points FROM score_claims WHERE id = ?), 0))
      WHERE player_id = ?
    `).bind(WALLET_CAP, claimId, player.id),
  ]);

  const wallet = await env.DB.prepare('SELECT earned - spent AS balance FROM wallet WHERE player_id = ?').bind(player.id).first();
  return json(request, env, { earned: points, wallet: wallet?.balance || 0, rank: nextRank });
}

async function event(request, env, player) {
  const data = await body(request);
  if (!validLetter(data?.letter)) return error(request, env, 'Некорректная буква');

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO events (player_id, letter, created_at) VALUES (?, ?, ?)').bind(player.id, data.letter, now),
    env.DB.prepare(`
      UPDATE wallet
      SET earned = MIN(spent + ?, earned + 1)
      WHERE player_id = ? AND changes() = 1
    `).bind(WALLET_CAP, player.id),
  ]);

  const claimed = await env.DB.prepare('SELECT COUNT(*) AS count FROM events WHERE player_id = ? AND letter = ? AND created_at = ?').bind(player.id, data.letter, now).first();
  const wallet = await env.DB.prepare('SELECT earned - spent AS balance FROM wallet WHERE player_id = ?').bind(player.id).first();
  return json(request, env, { earned: claimed?.count ? 1 : 0, wallet: wallet?.balance || 0 });
}

async function mark(request, env, player) {
  const data = await body(request);
  if (!Number.isInteger(data?.x) || !Number.isInteger(data?.y)) return error(request, env, 'Координаты должны быть целыми');

  const canvas = await env.DB.prepare('SELECT level FROM canvas WHERE id = 1').first();
  const level = canvas?.level || 0;
  if (!validCoordinate(data.x, level) || !validCoordinate(data.y, level)) return error(request, env, 'Клетка вне холста');

  const now = Date.now();
  const day = dailyStart(now);
  const grid = gridSize(level);
  const area = areaAt(level);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO marks (player_id, x, y, level, created_at)
      SELECT ?, ?, ?, ?, ?
      WHERE (SELECT earned - spent FROM wallet WHERE player_id = ?) >=
        CASE
          WHEN (SELECT COUNT(*) FROM marks WHERE level = ?) * 1.0 / ? < 0.25 THEN 1
          WHEN (SELECT COUNT(*) FROM marks WHERE level = ?) * 1.0 / ? < 0.5 THEN 2
          WHEN (SELECT COUNT(*) FROM marks WHERE level = ?) * 1.0 / ? < 0.75 THEN 3
          ELSE 4
        END
        AND (SELECT COUNT(*) FROM marks WHERE player_id = ? AND created_at >= ?) < ?
        AND (SELECT COUNT(*) FROM marks AS own JOIN players AS ip_player ON ip_player.id = own.player_id
             WHERE ip_player.ip_hash = ? AND own.created_at >= ?) < ?
        AND ? < ? AND ? < ?
    `).bind(
      player.id, data.x, data.y, level, now,
      player.id, level, area, level, area, level, area,
      player.id, day, DAILY_MARK_LIMIT, player.ip_hash, day, DAILY_MARK_LIMIT,
      data.x, grid, data.y, grid,
    ),
    env.DB.prepare(`
      UPDATE wallet
      SET spent = spent + CASE
        WHEN ((SELECT COUNT(*) FROM marks WHERE level = ?) - 1) * 1.0 / ? < 0.25 THEN 1
        WHEN ((SELECT COUNT(*) FROM marks WHERE level = ?) - 1) * 1.0 / ? < 0.5 THEN 2
        WHEN ((SELECT COUNT(*) FROM marks WHERE level = ?) - 1) * 1.0 / ? < 0.75 THEN 3
        ELSE 4
      END
      WHERE player_id = ? AND changes() = 1
    `).bind(level, area, level, area, level, area, player.id),
    env.DB.prepare(`
      UPDATE canvas
      SET level = level + 1, updated_at = ?
      WHERE id = 1 AND level < ? AND changes() = 1
        AND (SELECT COUNT(*) FROM marks WHERE level = canvas.level) * 1.0 / ? >= 0.85
    `).bind(now, MAX_LEVEL, area),
  ]);

  const inserted = await env.DB.prepare('SELECT COUNT(*) AS count FROM marks WHERE player_id = ? AND x = ? AND y = ? AND level = ? AND created_at = ?').bind(player.id, data.x, data.y, level, now).first();
  const wallet = await env.DB.prepare('SELECT earned - spent AS balance FROM wallet WHERE player_id = ?').bind(player.id).first();
  const currentCanvas = await env.DB.prepare('SELECT level FROM canvas WHERE id = 1').first();
  return json(request, env, {
    ok: Boolean(inserted?.count),
    wallet: wallet?.balance || 0,
    level: currentCanvas?.level || level,
    price: priceForCount(Math.max(0, (await env.DB.prepare('SELECT COUNT(*) AS count FROM marks WHERE level = ?').bind(level).first())?.count || 0) - (inserted?.count ? 1 : 0), level),
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(request, env) });
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return error(request, env, 'Not found', 404);
    try {
      if (request.method === 'GET' && url.pathname === '/api/state') return await state(request, env);
      if (request.method !== 'POST') return error(request, env, 'Method not allowed', 405);
      if (url.pathname === '/api/join') return await join(request, env);
      const player = await playerFrom(request, env);
      if (!player) return error(request, env, 'Нужен токен участника', 401);
      if (url.pathname === '/api/score') return await score(request, env, player);
      if (url.pathname === '/api/event') return await event(request, env, player);
      if (url.pathname === '/api/mark') return await mark(request, env, player);
      return error(request, env, 'Not found', 404);
    } catch (cause) {
      console.error(cause);
      return error(request, env, 'Временная ошибка сервера', 500);
    }
  },
};
