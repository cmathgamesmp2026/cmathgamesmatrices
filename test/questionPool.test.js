import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  computeSignature,
  parsePayload,
  normalizeDifficulty,
  saveToPool,
  findUnseenForTopic,
  checkPoolTableExists
} from '../server/services/questionPool.js';
import {
  startNewGame,
  getSession,
  recordQuestion,
  isDuplicateQuestion,
  getFallbackTopics,
  SESSION_TTL_MS
} from '../server/services/gameSession.js';

describe('Question Pool: Signatures & Payload Parsing', () => {
  it('computes a 64-char SHA-256 hex signature normalised by lowercase and whitespace', () => {
    const sig1 = computeSignature({ text: '  What is  2A? ', matrices: { A: [[1, 2], [3, 4]], k: 2 } });
    const sig2 = computeSignature({ text: 'what is 2a?', matrices: { A: [[1, 2], [3, 4]], k: 2 } });
    const sig3 = computeSignature({ text: 'what is 2a?', matrices: { A: [[1, 2], [3, 5]], k: 2 } });

    assert.strictEqual(sig1.length, 64);
    assert.match(sig1, /^[0-9a-f]{64}$/);
    assert.strictEqual(sig1, sig2);
    assert.notStrictEqual(sig1, sig3);
  });

  it('handles both object and JSON string payloads from mysql2', () => {
    const obj = { topic: '3. Scalar multiplication', question: { text: 'Find 2A' } };
    assert.deepStrictEqual(parsePayload(obj), obj);
    assert.deepStrictEqual(parsePayload(JSON.stringify(obj)), obj);
  });

  it('normalises difficulty to lowercase easy or hard', () => {
    assert.strictEqual(normalizeDifficulty('Easy'), 'easy');
    assert.strictEqual(normalizeDifficulty('Hard'), 'hard');
    assert.strictEqual(normalizeDifficulty('HARD'), 'hard');
    assert.strictEqual(normalizeDifficulty(''), 'easy');
  });
});

describe('Question Pool: Saving, Deduplication & Startup Check', () => {
  it('saves payload with JSON.stringify and quietly skips ER_DUP_ENTRY duplicates', async () => {
    const calls = [];
    const fakePool = {
      async execute(sql, params) {
        calls.push({ sql, params });
        if (calls.length === 1) return [{ insertId: 42 }];
        const dupErr = new Error('Duplicate entry');
        dupErr.code = 'ER_DUP_ENTRY';
        throw dupErr;
      }
    };

    const payload = { topic: '5. Transpose', question: { text: 'Find A^T', matrices: { A: [[1, 2]] } } };
    const first = await saveToPool({ topic: 5, difficulty: 'Easy', payload }, fakePool);
    assert.strictEqual(first.saved, true);
    assert.strictEqual(first.id, 42);
    assert.strictEqual(typeof calls[0].params[2], 'string'); // stored with JSON.stringify

    const second = await saveToPool({ topic: 5, difficulty: 'Easy', payload }, fakePool);
    assert.strictEqual(second.saved, false);
    assert.strictEqual(second.duplicate, true);
  });

  it('logs clear message and returns false if question_pool table is missing', async () => {
    const fakePool = {
      async execute() {
        const err = new Error("Table 'cmathgames.question_pool' doesn't exist");
        err.code = 'ER_NO_SUCH_TABLE';
        throw err;
      }
    };
    const origError = console.error;
    const logs = [];
    console.error = (msg) => logs.push(String(msg));
    try {
      const exists = await checkPoolTableExists(fakePool);
      assert.strictEqual(exists, false);
      assert.ok(logs.some((l) => l.includes('question_pool table is missing, create it with the SQL I was given')));
    } finally {
      console.error = origError;
    }
  });
});

describe('Question Pool: Unseen Filtering, Lowest times_served & Per-Game Tracking', () => {
  it('excludes served ids, served signatures, and used contexts, and prefers lowest times_served', async () => {
    const rows = [
      { id: 1, topic: 9, difficulty: 'easy', payload: JSON.stringify({ q: 1 }), signature: 'sig1', context: 'sports gear', times_served: 0 },
      { id: 2, topic: 9, difficulty: 'easy', payload: { q: 2 }, signature: 'sig2', context: 'art supplies', times_served: 1 },
      { id: 3, topic: 9, difficulty: 'easy', payload: { q: 3 }, signature: 'sig3', context: 'bus and train fares', times_served: 1 },
      { id: 4, topic: 9, difficulty: 'easy', payload: { q: 4 }, signature: 'sig4', context: 'movie or concert tickets', times_served: 5 }
    ];
    const fakePool = { async execute() { return [rows]; } };

    // Exclude id 1 (served) and context 'art supplies' (already used in this game)
    const res = await findUnseenForTopic(
      {
        topic: 9,
        difficulty: 'Easy',
        servedIds: new Set([1]),
        servedSignatures: new Set(),
        usedContexts: new Set(['art supplies']),
        randomFn: () => 0
      },
      fakePool
    );

    assert.strictEqual(res.unseenCount, 2); // id 3 (times_served=1) and id 4 (times_served=5)
    assert.strictEqual(res.picked.id, 3); // lowest times_served among unseen
  });

  it('starts a new game with empty seen sets and expires games after 3 hours', () => {
    assert.strictEqual(SESSION_TTL_MS, 3 * 60 * 60 * 1000);

    const g1 = startNewGame(1000);
    recordQuestion(g1.session, { text: 'Find 2A', matrices: { A: [[1, 2]] } }, { id: 10, signature: 'abc', context: 'sports gear' });
    assert.strictEqual(isDuplicateQuestion(g1.session, { text: 'Find 2A' }, { id: 10 }), true);
    assert.strictEqual(isDuplicateQuestion(g1.session, { text: 'Other' }, { signature: 'abc' }), true);
    assert.strictEqual(isDuplicateQuestion(g1.session, { text: 'Other' }, { context: 'Sports Gear' }), true);

    // New game starts with empty seen sets, so earlier questions may repeat
    const g2 = startNewGame(2000);
    assert.notStrictEqual(g1.gameId, g2.gameId);
    assert.strictEqual(isDuplicateQuestion(g2.session, { text: 'Find 2A' }, { id: 10, signature: 'abc', context: 'sports gear' }), false);

    // After > 3 hours, g1 is cleaned up and a fresh session is created if queried
    const later = 1000 + SESSION_TTL_MS + 1000;
    const fresh = getSession(g1.gameId, later);
    assert.strictEqual(fresh.servedIds.size, 0);

    // Fallback topics return remaining 9 topics excluding the current one
    const fallbacks = getFallbackTopics(g2.session, 3);
    assert.strictEqual(fallbacks.length, 9);
    assert.ok(!fallbacks.some((t) => t.number === 3));
  });
});
