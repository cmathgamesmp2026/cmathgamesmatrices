/**
 * MySQL Question Pool Service
 * Reads from and writes to the existing `cmathgames.question_pool` table using
 * parameterised queries only. Never runs CREATE, ALTER, or DROP.
 */

import crypto from 'crypto';
import { getPool } from './db.js';
import { APPLICATION_TOPIC_NUMBERS } from './gameSession.js';

export const POOL_MIN_PER_TOPIC = Math.max(1, parseInt(process.env.POOL_MIN_PER_TOPIC || '4', 10));

let poolAvailable = false;

export function isPoolAvailable() {
  return poolAvailable;
}

export function setPoolAvailable(available) {
  poolAvailable = Boolean(available);
}

export function normalizeDifficulty(difficulty) {
  return String(difficulty || '').toLowerCase() === 'hard' ? 'hard' : 'easy';
}

/**
 * SHA-256 hex signature of normalised question text (lowercase, collapsed whitespace)
 * plus its matrices.
 */
export function computeSignature(question) {
  const text = String(question?.text || question?.question || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const matrices = question?.matrices ?? null;
  const canonical = `${text}|${JSON.stringify(matrices)}`;
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Handle mysql2 JSON column returning either an already-parsed object or a JSON string.
 */
export function parsePayload(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') return JSON.parse(raw);
  return null;
}

/**
 * Check on server start that `cmathgames.question_pool` exists (read-only).
 * If missing, log the required error message and run without the pool.
 */
export async function checkPoolTableExists(dbPool = getPool()) {
  try {
    await dbPool.execute('SELECT 1 FROM cmathgames.question_pool LIMIT 1');
    poolAvailable = true;
    return true;
  } catch (err) {
    poolAvailable = false;
    if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146)) {
      console.error('question_pool table is missing, create it with the SQL I was given');
    } else {
      console.error('[QuestionPool] Could not access cmathgames.question_pool:', err.message);
      console.error('question_pool table is missing, create it with the SQL I was given');
    }
    return false;
  }
}

/**
 * Save a single verified lesson + question payload to `cmathgames.question_pool`.
 * Quietly skips duplicates when MySQL raises ER_DUP_ENTRY.
 */
export async function saveToPool(
  { topic, difficulty, payload, context = null, initialTimesServed = 0 },
  dbPool = getPool()
) {
  const topicNum = parseInt(topic, 10);
  const diff = normalizeDifficulty(difficulty);
  const signature = computeSignature(payload?.question);
  const cleanContext =
    context && typeof context === 'string' ? context.trim().slice(0, 100) : null;

  const sql = `
    INSERT INTO cmathgames.question_pool (topic, difficulty, payload, signature, context, times_served)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  try {
    const [result] = await dbPool.execute(sql, [
      topicNum,
      diff,
      JSON.stringify(payload),
      signature,
      cleanContext,
      Math.max(0, parseInt(initialTimesServed, 10) || 0)
    ]);
    return { saved: true, duplicate: false, id: result.insertId, signature };
  } catch (err) {
    if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
      return { saved: false, duplicate: true, id: null, signature };
    }
    throw err;
  }
}

/**
 * Find unseen pool items for (topic, difficulty), excluding servedIds, servedSignatures,
 * and (for topics 9 and 10) usedContexts.
 * Prefers the lowest times_served and picks randomly among ties.
 */
export async function findUnseenForTopic(
  {
    topic,
    difficulty,
    servedIds = new Set(),
    servedSignatures = new Set(),
    usedContexts = new Set(),
    randomFn = Math.random
  },
  dbPool = getPool()
) {
  const topicNum = parseInt(topic, 10);
  const diff = normalizeDifficulty(difficulty);
  const isAppTopic = APPLICATION_TOPIC_NUMBERS.includes(topicNum);

  const sql = `
    SELECT id, topic, difficulty, payload, signature, context, times_served
    FROM cmathgames.question_pool
    WHERE topic = ? AND difficulty = ?
    ORDER BY times_served ASC, id ASC
  `;
  const [rows] = await dbPool.execute(sql, [topicNum, diff]);

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
export async function incrementTimesServed(id, dbPool = getPool()) {
  await dbPool.execute(
    'UPDATE cmathgames.question_pool SET times_served = times_served + 1 WHERE id = ?',
    [id]
  );
}

/** Return distinct contexts already stored in the pool for a topic and difficulty. */
export async function getPoolContexts(topic, difficulty, dbPool = getPool()) {
  const topicNum = parseInt(topic, 10);
  const diff = normalizeDifficulty(difficulty);
  const [rows] = await dbPool.execute(
    'SELECT DISTINCT context FROM cmathgames.question_pool WHERE topic = ? AND difficulty = ? AND context IS NOT NULL',
    [topicNum, diff]
  );
  return rows.map((r) => r.context).filter(Boolean);
}

/** Return pool counts per topic (1..10) and difficulty ('easy', 'hard'). */
export async function getPoolCounts(dbPool = getPool()) {
  const counts = {};
  for (let t = 1; t <= 10; t++) {
    counts[t] = { easy: 0, hard: 0 };
  }
  const [rows] = await dbPool.execute(
    'SELECT topic, difficulty, COUNT(*) AS cnt FROM cmathgames.question_pool GROUP BY topic, difficulty'
  );
  for (const row of rows) {
    const t = Number(row.topic);
    const d = normalizeDifficulty(row.difficulty);
    if (counts[t]) {
      counts[t][d] = Number(row.cnt) || 0;
    }
  }
  return counts;
}
