import test from 'node:test';
import assert from 'node:assert/strict';
import {
  areaAt,
  dailyStart,
  gridSize,
  normalizeName,
  priceForCount,
  rankFor,
  scorePoints,
  validCoordinate,
} from '../src/core.js';

test('normalizes only short alphabetic names', () => {
  assert.equal(normalizeName(' петя '), 'ПЕТЯ');
  assert.equal(normalizeName('Ё'), 'Ё');
  assert.equal(normalizeName('123'), null);
  assert.equal(normalizeName('слишком'), null);
});

test('keeps canvas powers of two and letter area proportional', () => {
  assert.equal(gridSize(0), 32);
  assert.equal(gridSize(2), 128);
  assert.equal(areaAt(1), 393 * 4);
  assert.equal(validCoordinate(31, 0), true);
  assert.equal(validCoordinate(32, 0), false);
});

test('raises the mark price by fill ratio', () => {
  assert.equal(priceForCount(0, 0), 1);
  assert.equal(priceForCount(98, 0), 1);
  assert.equal(priceForCount(99, 0), 2);
  assert.equal(priceForCount(197, 0), 3);
  assert.equal(priceForCount(295, 0), 4);
});

test('uses UTC day boundaries', () => {
  const now = Date.parse('2026-08-28T02:00:00+04:00');
  assert.equal(new Date(dailyStart(now)).toISOString(), '2026-08-27T00:00:00.000Z');
});

test('ranks the proposed score with stable tie breaking', () => {
  const scores = [
    { player_id: 'a', value: 4, updated_at: 10 },
    { player_id: 'b', value: 3, updated_at: 20 },
  ];
  assert.equal(rankFor(scores, 'c', 5, 30), 1);
  assert.equal(rankFor(scores, 'c', 3, 30), 3);
});

test('awards score events once and adds movement bonuses', () => {
  assert.equal(scorePoints(null, 3, 1), 1);
  assert.equal(scorePoints({ value: 3, best_rank: 7 }, 4, 5), 2);
  assert.equal(scorePoints({ value: 3, best_rank: 7 }, 4, 1), 4);
  assert.equal(scorePoints({ value: 4, best_rank: 1 }, 4, 1), 0);
});
