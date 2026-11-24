/**
 * Cloudflare D1 helpers for `question_pool`, `game_seen`, and `locks`.
 * Uses D1 prepared statements with .bind() only. Pure Workers-compatible ES module.
 */

import { computeSignature } from './signature.js';
import { APPLICATION_TOPIC_NUMBERS, SESSION_TTL_SECONDS } from './topics.js';

export function normalizeDifficulty(difficulty) {
  return String(difficulty || '').toLowerCase() === 'hard' ? 'hard' : 'easy';
}

export function parsePayload(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') return JSON.parse(raw);
  return null;
}

/**
 * Save a single verified lesson + question payload to `question_pool`.
 * Quietly skips duplicates via INSERT OR IGNORE on the UNIQUE signature column.
 */
export async function saveToPool(
  db,
  { topic, difficulty, payload, context = null, initialTimesServed = 0 }
) {
  const topicNum = parseInt(topic, 10);
  const diff = normalizeDifficulty(difficulty);
  const signature = await computeSignature(payload?.question);
  const cleanContext =
    context && typeof context === 'string' ? context.trim().slice(0, 100) : null;
  const timesServed = Math.max(0, parseInt(initialTimesServed, 10) || 0);

  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO question_pool (topic, difficulty, payload, signature, context, times_served)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(topicNum, diff, JSON.stringify(payload), signature, cleanContext, timesServed)
    .run();

  const changes = res?.meta?.changes ?? 0;
  if (changes > 0) {
    return { saved: true, duplicate: false, id: res?.meta?.last_row_id ?? null, signature };
  }

  // Duplicate already exists: look up its id so callers can still record game_seen if needed
  const existing = await db
    .prepare('SELECT id FROM question_pool WHERE signature = ?')
    .bind(signature)
    .first();

  return { saved: false, duplicate: true, id: existing?.id ?? null, signature };
}

/**
 * Find unseen pool items for (topic, difficulty), excluding servedIds, servedSignatures,
 * and (for topics 9 and 10) usedContexts.
 * Prefers the lowest times_served and picks randomly among ties.
 */
export async function findUnseenForTopic(
  db,
  {
    topic,
    difficulty,
    servedIds = new Set(),
    servedSignatures = new Set(),
    usedContexts = new Set(),
    randomFn = Math.random
  }
) {
  const topicNum = parseInt(topic, 10);
  const diff = normalizeDifficulty(difficulty);
  const isAppTopic = APPLICATION_TOPIC_NUMBERS.includes(topicNum);

  const { results } = await db
    .prepare(
      `SELECT id, topic, difficulty, payload, signature, context, times_served
       FROM question_pool
       WHERE topic = ? AND difficulty = ?
       ORDER BY times_served ASC, id ASC`
    )
    .bind(topicNum, diff)
    .all();

  const rows = results || [];
  const unseen = rows.filter((row) => {
    if (servedIds.has(row.id)) return false;
    if (servedSignatures.has(row.signature)) return false;
    if (isAppTopic && row.context && usedContexts.has(String(row.context).toLowerCase())) {
      return false;
    }
    return true;
  });

  if (unseen.length === 0) {
    return { unseenCount: 0, picked: null };
  }

  const minServed = unseen[0].times_served;
  const tied = unseen.filter((row) => row.times_served === minServed);
  const chosen = tied[Math.min(tied.length - 1, Math.floor(randomFn() * tied.length))];

  return {
    unseenCount: unseen.length,
    picked: {
      id: chosen.id,
      topic: chosen.topic,
      difficulty: chosen.difficulty,
      payload: parsePayload(chosen.payload),
      signature: chosen.signature,
      context: chosen.context || null,
      timesServed: chosen.times_served
    }
  };
}

/** Increment times_served for a pool row after serving it. */
export async function incrementTimesServed(db, id) {
  await db
    .prepare('UPDATE question_pool SET times_served = times_served + 1 WHERE id = ?')
    .bind(id)
    .run();
}

/** Return distinct contexts already stored in the pool for a topic and difficulty. */
export async function getPoolContexts(db, topic, difficulty) {
  const topicNum = parseInt(topic, 10);
  const diff = normalizeDifficulty(difficulty);
  const { results } = await db
    .prepare(
      'SELECT DISTINCT context FROM question_pool WHERE topic = ? AND difficulty = ? AND context IS NOT NULL'
    )
    .bind(topicNum, diff)
    .all();
  return (results || []).map((r) => r.context).filter(Boolean);
}

/** Return pool counts per topic (1..10) and difficulty ('easy', 'hard'). */
export async function getPoolCounts(db) {
  const counts = {};
  for (let t = 1; t <= 10; t++) {
    counts[t] = { easy: 0, hard: 0 };
  }
  const { results } = await db
    .prepare('SELECT topic, difficulty, COUNT(*) AS cnt FROM question_pool GROUP BY topic, difficulty')
    .all();
  for (const row of results || []) {
    const t = Number(row.topic);
    const d = normalizeDifficulty(row.difficulty);
    if (counts[t]) {
      counts[t][d] = Number(row.cnt) || 0;
    }
  }
  return counts;
}

/** Delete game_seen rows older than 3 hours. */
export async function cleanupOldGameSeen(db, nowSec = Math.floor(Date.now() / 1000)) {
  const cutoff = nowSec - SESSION_TTL_SECONDS;
  await db.prepare('DELETE FROM game_seen WHERE created_at < ?').bind(cutoff).run();
}

/** Load per-game seen sets from `game_seen`. */
export async function getGameSeen(db, gameId) {
  const { results } = await db
    .prepare('SELECT pool_id, signature, context FROM game_seen WHERE game_id = ?')
    .bind(gameId)
    .all();

  const servedIds = new Set();
  const servedSignatures = new Set();
  const usedContexts = new Set();

  for (const row of results || []) {
    if (row.pool_id != null && Number(row.pool_id) > 0) {
      servedIds.add(Number(row.pool_id));
    }
    if (row.signature) {
      servedSignatures.add(row.signature);
    }
    if (row.context) {
      usedContexts.add(String(row.context).toLowerCase());
    }
  }

  return { servedIds, servedSignatures, usedContexts };
}

/** Record a served question in `game_seen`. */
export async function recordGameSeen(
  db,
  { gameId, poolId, signature, context = null, nowSec = Math.floor(Date.now() / 1000) }
) {
  const safePoolId = Number.isInteger(poolId) && poolId > 0 ? poolId : 0;
  const cleanContext = context && typeof context === 'string' ? context.trim().slice(0, 100) : null;
  await db
    .prepare(
      `INSERT OR IGNORE INTO game_seen (game_id, pool_id, signature, context, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(gameId, safePoolId, signature, cleanContext, nowSec)
    .run();
}

/**
 * Acquire a named lock in `locks`. Returns true if acquired, false if already held.
 * Expired locks (until <= nowSec) are cleared first.
 */
export async function acquireLock(db, name, ttlSeconds = 60, nowSec = Math.floor(Date.now() / 1000)) {
  await db.prepare('DELETE FROM locks WHERE name = ? AND until <= ?').bind(name, nowSec).run();
  const res = await db
    .prepare('INSERT OR IGNORE INTO locks (name, until) VALUES (?, ?)')
    .bind(name, nowSec + Math.max(1, ttlSeconds))
    .run();
  return (res?.meta?.changes ?? 0) > 0;
}

/** Release a named lock in `locks`. */
export async function releaseLock(db, name) {
  await db.prepare('DELETE FROM locks WHERE name = ?').bind(name).run();
}
