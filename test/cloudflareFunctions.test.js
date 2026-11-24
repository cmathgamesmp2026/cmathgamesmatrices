import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { computeSignature } from '../shared/signature.js';
import {
  TOPICS,
  assignTurnForGame,
  getFallbackTopicsForGame,
  SESSION_TTL_SECONDS
} from '../shared/topics.js';
import {
  saveToPool,
  findUnseenForTopic,
  acquireLock,
  releaseLock,
  cleanupOldGameSeen
} from '../shared/d1Pool.js';
import { D1ModelStateStore } from '../shared/modelState.js';
import { STATIC_LESSONS } from '../shared/staticFallback.js';
import { onRequestPost as startGamePost } from '../functions/api/question/start.js';
import { onRequestPost as questionPost } from '../functions/api/question/index.js';
import { onRequestGet as poolStatusGet } from '../functions/api/pool-status.js';

/**
 * Lightweight in-memory SQLite-like mock of Cloudflare D1 supporting the exact
 * prepared statements used by /shared/d1Pool.js, /shared/modelState.js, and /functions.
 */
function createMockD1() {
  const pool = [];
  let nextPoolId = 1;
  const gameSeen = [];
  const modelState = new Map();
  const locks = new Map();

  function exec(sql, params) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('INSERT OR IGNORE INTO question_pool')) {
      const [topic, difficulty, payload, signature, context, times_served] = params;
      if (pool.some((r) => r.signature === signature)) {
        return { results: [], meta: { changes: 0 } };
      }
      const id = nextPoolId++;
      pool.push({ id, topic, difficulty, payload, signature, context, times_served });
      return { results: [], meta: { changes: 1, last_row_id: id } };
    }

    if (s.startsWith('SELECT id FROM question_pool WHERE signature = ?')) {
      const row = pool.find((r) => r.signature === params[0]);
      return { results: row ? [{ id: row.id }] : [] };
    }

    if (s.startsWith('SELECT id, topic, difficulty, payload, signature, context, times_served FROM question_pool')) {
      const [topic, difficulty] = params;
      const rows = pool
        .filter((r) => r.topic === topic && r.difficulty === difficulty)
        .sort((a, b) => a.times_served - b.times_served || a.id - b.id);
      return { results: rows };
    }

    if (s.startsWith('UPDATE question_pool SET times_served = times_served + 1 WHERE id = ?')) {
      const row = pool.find((r) => r.id === params[0]);
      if (row) row.times_served += 1;
      return { results: [], meta: { changes: row ? 1 : 0 } };
    }

    if (s.startsWith('SELECT DISTINCT context FROM question_pool')) {
      const [topic, difficulty] = params;
      const set = new Set(
        pool.filter((r) => r.topic === topic && r.difficulty === difficulty && r.context).map((r) => r.context)
      );
      return { results: [...set].map((context) => ({ context })) };
    }

    if (s.startsWith('SELECT topic, difficulty, COUNT(*) AS cnt FROM question_pool')) {
      const map = new Map();
      for (const r of pool) {
        const k = `${r.topic}:${r.difficulty}`;
        map.set(k, (map.get(k) || 0) + 1);
      }
      const results = [];
      for (const [k, cnt] of map) {
        const [topic, difficulty] = k.split(':');
        results.push({ topic: Number(topic), difficulty, cnt });
      }
      return { results };
    }

    if (s.startsWith('DELETE FROM game_seen WHERE created_at < ?')) {
      const cutoff = params[0];
      let removed = 0;
      for (let i = gameSeen.length - 1; i >= 0; i--) {
        if (gameSeen[i].created_at < cutoff) {
          gameSeen.splice(i, 1);
          removed++;
        }
      }
      return { results: [], meta: { changes: removed } };
    }

    if (s.startsWith('SELECT pool_id, signature, context FROM game_seen WHERE game_id = ?')) {
      return { results: gameSeen.filter((r) => r.game_id === params[0]) };
    }

    if (s.startsWith('INSERT OR IGNORE INTO game_seen')) {
      const [game_id, pool_id, signature, context, created_at] = params;
      if (gameSeen.some((r) => r.game_id === game_id && r.pool_id === pool_id)) {
        return { results: [], meta: { changes: 0 } };
      }
      gameSeen.push({ game_id, pool_id, signature, context, created_at });
      return { results: [], meta: { changes: 1 } };
    }

    if (s.startsWith('SELECT model, state, until, last_error, avg_ms FROM model_state WHERE model = ?')) {
      const row = modelState.get(params[0]);
      return { results: row ? [row] : [] };
    }

    if (s.startsWith('SELECT state, until FROM model_state WHERE model = ?')) {
      const row = modelState.get(params[0]);
      return { results: row ? [row] : [] };
    }

    if (s.startsWith('SELECT avg_ms FROM model_state WHERE model = ?')) {
      const row = modelState.get(params[0]);
      return { results: row ? [row] : [] };
    }

    if (s.startsWith('SELECT model, state, until, last_error, avg_ms FROM model_state')) {
      return { results: [...modelState.values()] };
    }

    if (s.startsWith('INSERT INTO model_state')) {
      if (s.includes("'exhausted'")) {
        const [model, until, last_error] = params;
        const prev = modelState.get(model);
        modelState.set(model, { model, state: 'exhausted', until, last_error, avg_ms: prev?.avg_ms ?? null });
      } else if (s.includes("'cooling'")) {
        const [model, until, last_error] = params;
        const prev = modelState.get(model);
        modelState.set(model, { model, state: 'cooling', until, last_error, avg_ms: prev?.avg_ms ?? null });
      } else if (s.includes("'unavailable'")) {
        const [model, until, last_error] = params;
        const prev = modelState.get(model);
        modelState.set(model, { model, state: 'unavailable', until, last_error, avg_ms: prev?.avg_ms ?? null });
      } else if (s.includes("'ready'")) {
        const [model, avg_ms] = params;
        modelState.set(model, { model, state: 'ready', until: null, last_error: null, avg_ms });
      }
      return { results: [], meta: { changes: 1 } };
    }

    if (s.startsWith('DELETE FROM locks WHERE name = ? AND until <= ?')) {
      const [name, nowSec] = params;
      const until = locks.get(name);
      if (until !== undefined && until <= nowSec) {
        locks.delete(name);
        return { results: [], meta: { changes: 1 } };
      }
      return { results: [], meta: { changes: 0 } };
    }

    if (s.startsWith('INSERT OR IGNORE INTO locks')) {
      const [name, until] = params;
      if (locks.has(name)) return { results: [], meta: { changes: 0 } };
      locks.set(name, until);
      return { results: [], meta: { changes: 1 } };
    }

    if (s.startsWith('DELETE FROM locks WHERE name = ?')) {
      const existed = locks.delete(params[0]);
      return { results: [], meta: { changes: existed ? 1 : 0 } };
    }

    throw new Error(`Unhandled mock D1 SQL: ${s}`);
  }

  return {
    _state: { pool, gameSeen, modelState, locks },
    prepare(sql) {
      const stmt = {
        _params: [],
        bind(...params) {
          stmt._params = params;
          return stmt;
        },
        async all() {
          return exec(sql, stmt._params);
        },
        async first() {
          const res = exec(sql, stmt._params);
          return res.results[0] || null;
        },
        async run() {
          return exec(sql, stmt._params);
        }
      };
      return stmt;
    }
  };
}

describe('Web Crypto Signature & Deterministic Per-Game Topic Order', () => {
  it('computes 64-char SHA-256 hex signature using crypto.subtle', async () => {
    const s1 = await computeSignature({ text: '  What is  2A? ', matrices: { A: [[1, 2], [3, 4]], k: 2 } });
    const s2 = await computeSignature({ text: 'what is 2a?', matrices: { A: [[1, 2], [3, 4]], k: 2 } });
    const s3 = await computeSignature({ text: 'what is 2a?', matrices: { A: [[1, 2], [3, 5]], k: 2 } });

    assert.strictEqual(s1.length, 64);
    assert.match(s1, /^[0-9a-f]{64}$/);
    assert.strictEqual(s1, s2);
    assert.notStrictEqual(s1, s3);
  });

  it('cycles all 10 topics without repeats and is idempotent per (gameId, turn)', () => {
    const gameId = 'game-alpha-1234';
    for (let cycle = 0; cycle < 3; cycle++) {
      const seen = [];
      for (let i = 0; i < 10; i++) {
        const turn = cycle * 10 + i + 1;
        const a1 = assignTurnForGame(gameId, turn);
        const a2 = assignTurnForGame(gameId, turn);
        assert.strictEqual(a1.topic.number, a2.topic.number);
        seen.push(a1.topic.number);
      }
      assert.deepStrictEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
    const fallbacks = getFallbackTopicsForGame(gameId, 1, assignTurnForGame(gameId, 1).topic.number);
    assert.strictEqual(fallbacks.length, 9);
  });
});

describe('D1 Locks, Concurrent Game Isolation & Exhausted Model Fallback', () => {
  it('enforces single-holder locks with TTL expiry', async () => {
    const db = createMockD1();
    assert.strictEqual(await acquireLock(db, 'bg_refill', 60, 1000), true);
    assert.strictEqual(await acquireLock(db, 'bg_refill', 60, 1010), false);
    assert.strictEqual(await acquireLock(db, 'bg_refill', 60, 1061), true);
    await releaseLock(db, 'bg_refill');
    assert.strictEqual(await acquireLock(db, 'bg_refill', 60, 1062), true);
  });

  it('isolates two concurrent games and still serves from pool when all models are exhausted', async () => {
    const DB = createMockD1();
    const env = { DB, GEMINI_MODELS: 'm1,m2', POOL_MIN_PER_TOPIC: '1' };

    // Mark all models exhausted in D1 model_state
    const modelStore = new D1ModelStateStore(DB);
    await modelStore.markExhausted('m1');
    await modelStore.markExhausted('m2');

    // Seed 2 items into the pool across all 10 topics (using static fallback template)
    for (const topic of TOPICS) {
      for (let i = 1; i <= 2; i++) {
        const base = JSON.parse(JSON.stringify(STATIC_LESSONS[0]));
        base.topic = topic.label;
        base.topicNumber = topic.number;
        base.question.text = `Topic ${topic.number} question #${i}`;
        await saveToPool(DB, {
          topic: topic.number,
          difficulty: 'Easy',
          payload: base,
          context: topic.number >= 9 ? `context-${i}` : null,
          initialTimesServed: 0
        });
      }
    }

    // Start two concurrent games
    const start1 = await (await startGamePost({ env, request: new Request('https://example.test/api/question/start', { method: 'POST' }) })).json();
    const start2 = await (await startGamePost({ env, request: new Request('https://example.test/api/question/start', { method: 'POST' }) })).json();
    assert.strictEqual(start1.success, true);
    assert.strictEqual(start2.success, true);
    assert.notStrictEqual(start1.gameId, start2.gameId);

    // Game 1 plays turn 1 -> served from pool even though all models are exhausted
    const q1Res = await questionPost({
      env,
      request: new Request('https://example.test/api/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: start1.gameId, turn: 1, difficulty: 'Easy' })
      })
    });
    assert.strictEqual(q1Res.status, 200);
    const q1 = await q1Res.json();
    assert.strictEqual(q1.success, true);
    assert.strictEqual(q1.source, 'pool');

    // Game 2 plays turn 1 -> has its own independent game_seen
    const q2Res = await questionPost({
      env,
      request: new Request('https://example.test/api/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: start2.gameId, turn: 1, difficulty: 'Easy' })
      })
    });
    assert.strictEqual(q2Res.status, 200);
    const q2 = await q2Res.json();
    assert.strictEqual(q2.success, true);
    assert.strictEqual(q2.source, 'pool');

    // Check /api/pool-status reports allModelsExhausted = true and counts
    const statusRes = await poolStatusGet({ env, request: new Request('https://example.test/api/pool-status') });
    assert.strictEqual(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.strictEqual(statusData.success, true);
    assert.strictEqual(statusData.poolAvailable, true);
    assert.strictEqual(statusData.allModelsExhausted, true);
    assert.strictEqual(statusData.counts[1].easy, 2);
  });

  it('cleans up game_seen rows older than 3 hours', async () => {
    const DB = createMockD1();
    const nowSec = 100000;
    DB._state.gameSeen.push(
      { game_id: 'old-game', pool_id: 1, signature: 's1', context: null, created_at: nowSec - SESSION_TTL_SECONDS - 10 },
      { game_id: 'new-game', pool_id: 2, signature: 's2', context: null, created_at: nowSec - 60 }
    );
    await cleanupOldGameSeen(DB, nowSec);
    assert.strictEqual(DB._state.gameSeen.length, 1);
    assert.strictEqual(DB._state.gameSeen[0].game_id, 'new-game');
  });
});

describe('Workers Runtime Hygiene Check', () => {
  it('ensures no file in /functions or /shared uses Node-only modules or process.env', () => {
    const roots = ['functions', 'shared'];
    const forbidden = [
      /\bprocess\.env\b/,
      /from\s+['"](?:node:)?(?:fs|path|crypto|express|mysql2|dotenv|@google\/genai)['"]/,
      /require\(['"](?:fs|path|crypto|express|mysql2|dotenv)['"]\)/
    ];

    function walk(dir) {
      const files = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...walk(full));
        else if (entry.name.endsWith('.js')) files.push(full);
      }
      return files;
    }

    for (const root of roots) {
      for (const file of walk(root)) {
        const content = fs.readFileSync(file, 'utf8');
        for (const re of forbidden) {
          assert.ok(!re.test(content), `Forbidden pattern ${re} found in ${file}`);
        }
      }
    }
  });
});
