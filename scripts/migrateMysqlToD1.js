/**
 * One-time MySQL -> Cloudflare D1 migration script (`npm run migrate-mysql-to-d1`).
 * Runs locally in Node.js (NOT on Cloudflare).
 *
 * Reads MySQL + Cloudflare D1 credentials from `.env.migrate` (falling back to `.env`
 * for Cloudflare D1 vars if not duplicated in `.env.migrate`).
 *
 * Usage:
 *   npm run migrate-mysql-to-d1
 *   npm run migrate-mysql-to-d1 -- --with-leaderboard
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { computeSignature } from '../shared/signature.js';
import { normalizeDifficulty } from '../shared/d1Pool.js';
import { secondsToHHMMSS } from '../shared/time.js';
import { createD1HttpClient } from './d1HttpClient.js';

/**
 * Normalize a MySQL TIME value (string like '0:03:05' or '00:03:05', or seconds)
 * into zero-padded 'HH:MM:SS' text so D1 sorts lexicographically.
 */
export function normalizeMysqlTime(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return secondsToHHMMSS(raw);
  }
  const str = String(raw || '').trim();
  const match = str.match(/^(\d+):(\d{1,2}):(\d{1,2})/);
  if (match) {
    return [
      String(parseInt(match[1], 10)).padStart(2, '0'),
      String(parseInt(match[2], 10)).padStart(2, '0'),
      String(parseInt(match[3], 10)).padStart(2, '0')
    ].join(':');
  }
  return '00:00:00';
}

/**
 * Migrate question_pool (and optionally matrices_snl) rows into D1 without creating duplicates.
 * Injectable for unit testing.
 */
export async function migrateRows({
  poolRows = [],
  leaderboardRows = [],
  withLeaderboard = false,
  d1,
  logger = console
}) {
  let poolCopied = 0;
  let poolSkipped = 0;

  for (const row of poolRows) {
    const payloadObj = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    const payloadStr = JSON.stringify(payloadObj);
    const signature =
      typeof row.signature === 'string' && row.signature.trim().length > 0
        ? row.signature.trim()
        : await computeSignature(payloadObj?.question);
    const topic = parseInt(row.topic, 10);
    const difficulty = normalizeDifficulty(row.difficulty);
    const context = row.context && typeof row.context === 'string' ? row.context.trim().slice(0, 100) : null;
    const timesServed = Math.max(0, parseInt(row.times_served, 10) || 0);

    const res = await d1
      .prepare(
        `INSERT OR IGNORE INTO question_pool (topic, difficulty, payload, signature, context, times_served)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(topic, difficulty, payloadStr, signature, context, timesServed)
      .run();

    if ((res?.meta?.changes ?? 0) > 0) {
      poolCopied++;
    } else {
      poolSkipped++;
    }
  }

  let leaderboardCopied = 0;
  let leaderboardSkipped = 0;

  if (withLeaderboard) {
    for (const row of leaderboardRows) {
      const name = String(row.name || '').trim().slice(0, 100);
      if (!name) {
        leaderboardSkipped++;
        continue;
      }
      const turnsTaken = Math.max(1, parseInt(row.turns_taken, 10) || 1);
      const correctAnswers = Math.max(0, parseInt(row.correct_answers, 10) || 0);
      const wrongAnswers = Math.max(0, parseInt(row.wrong_answers, 10) || 0);
      const timeTaken = normalizeMysqlTime(row.time_taken);

      const existing = await d1
        .prepare(
          `SELECT id FROM matrices_snl
           WHERE name = ? AND turns_taken = ? AND correct_answers = ? AND wrong_answers = ? AND time_taken = ?
           LIMIT 1`
        )
        .bind(name, turnsTaken, correctAnswers, wrongAnswers, timeTaken)
        .first();

      if (existing) {
        leaderboardSkipped++;
        continue;
      }

      await d1
        .prepare(
          `INSERT INTO matrices_snl (name, turns_taken, correct_answers, wrong_answers, time_taken)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(name, turnsTaken, correctAnswers, wrongAnswers, timeTaken)
        .run();
      leaderboardCopied++;
    }
  }

  logger.log(`question_pool: ${poolCopied} copied, ${poolSkipped} skipped.`);
  if (withLeaderboard) {
    logger.log(`matrices_snl:  ${leaderboardCopied} copied, ${leaderboardSkipped} skipped.`);
  }

  return { poolCopied, poolSkipped, leaderboardCopied, leaderboardSkipped };
}

async function main() {
  // Load .env first (for Cloudflare D1 credentials), then override with .env.migrate
  dotenv.config({ path: '.env' });
  dotenv.config({ path: '.env.migrate', override: true });

  const withLeaderboard = process.argv.includes('--with-leaderboard');
  const dbName = process.env.DB_NAME || 'cmathgames';

  const d1 = createD1HttpClient({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN
  });

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: dbName
  });

  try {
    console.log(`--- Migrating MySQL (${dbName}) -> Cloudflare D1 ---`);
    const [poolRows] = await conn.execute(
      'SELECT topic, difficulty, payload, signature, context, times_served FROM question_pool ORDER BY id ASC'
    );

    let leaderboardRows = [];
    if (withLeaderboard) {
      const [lbRows] = await conn.execute(
        'SELECT name, turns_taken, correct_answers, wrong_answers, time_taken FROM matrices_snl ORDER BY id ASC'
      );
      leaderboardRows = lbRows;
    }

    await migrateRows({ poolRows, leaderboardRows, withLeaderboard, d1 });
    console.log('Migration complete.');
  } finally {
    await conn.end();
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main().catch((err) => {
    console.error('[Migrate Fatal Error]:', err.message);
    process.exit(1);
  });
}
