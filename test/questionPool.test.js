import { describe, it } from 'node:test';
import assert from 'node:assert';
import { computeSignature } from '../shared/signature.js';
import {
  parsePayload,
  normalizeDifficulty,
  saveToPool,
  findUnseenForTopic
} from '../shared/d1Pool.js';
import {
  TOPICS,
  SESSION_TTL_MS,
  assignTurnForGame,
  getFallbackTopicsForGame
} from '../shared/topics.js';

describe('Question Pool: Signatures & Payload Parsing', () => {
  it('computes a 64-char SHA-256 hex signature normalised by lowercase and whitespace', async () => {
    const sig1 = await computeSignature({ text: '  What is  2A? ', matrices: { A: [[1, 2], [3, 4]], k: 2 } });
    const sig2 = await computeSignature({ text: 'what is 2a?', matrices: { A: [[1, 2], [3, 4]], k: 2 } });
    const sig3 = await computeSignature({ text: 'what is 2a?', matrices: { A: [[1, 2], [3, 5]], k: 2 } });

    assert.strictEqual(sig1.length, 64);
    assert.match(sig1, /^[0-9a-f]{64}$/);
    assert.strictEqual(sig1, sig2);
    assert.notStrictEqual(sig1, sig3);
  });

  it('handles both object and JSON string payloads', () => {
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

describe('Question Pool: Saving, Deduplication & Unseen Filtering', () => {
  it('saves payload with JSON.stringify and quietly skips duplicate signatures via INSERT OR IGNORE', async () => {
    const calls = [];
    const seen = new Map();
    const fakeD1 = {
      prepare(sql) {
        let params = [];
        return {
          bind(...p) {
            params = p;
            return this;
          },
          async run() {
            calls.push({ sql, params });
            const sig = params[3];
            if (seen.has(sig)) return { meta: { changes: 0 } };
            seen.set(sig, 42);
            return { meta: { changes: 1, last_row_id: 42 } };
          },
          async first() {
            const id = seen.get(params[0]);
            return id ? { id } : null;
          }
        };
      }
    };

    const payload = { topic: '5. Transpose', question: { text: 'Find A^T', matrices: { A: [[1, 2]] } } };
    const first = await saveToPool(fakeD1, { topic: 5, difficulty: 'Easy', payload });
    assert.strictEqual(first.saved, true);
    assert.strictEqual(first.id, 42);
    assert.strictEqual(typeof calls[0].params[2], 'string');

    const second = await saveToPool(fakeD1, { topic: 5, difficulty: 'Easy', payload });
    assert.strictEqual(second.saved, false);
    assert.strictEqual(second.duplicate, true);
    assert.strictEqual(second.id, 42);
  });

  it('excludes served ids, served signatures, and used contexts, and prefers lowest times_served', async () => {
    const rows = [
      { id: 1, topic: 9, difficulty: 'easy', payload: JSON.stringify({ q: 1 }), signature: 'sig1', context: 'sports gear', times_served: 0 },
      { id: 2, topic: 9, difficulty: 'easy', payload: JSON.stringify({ q: 2 }), signature: 'sig2', context: 'art supplies', times_served: 1 },
      { id: 3, topic: 9, difficulty: 'easy', payload: JSON.stringify({ q: 3 }), signature: 'sig3', context: 'bus and train fares', times_served: 1 },
      { id: 4, topic: 9, difficulty: 'easy', payload: JSON.stringify({ q: 4 }), signature: 'sig4', context: 'movie or concert tickets', times_served: 5 }
    ];
    const fakeD1 = {
      prepare() {
        return {
          bind() {
            return {
              async all() {
                return { results: rows };
              }
            };
          }
        };
      }
    };

    const res = await findUnseenForTopic(fakeD1, {
      topic: 9,
      difficulty: 'Easy',
      servedIds: new Set([1]),
      servedSignatures: new Set(),
      usedContexts: new Set(['art supplies']),
      randomFn: () => 0
    });

    assert.strictEqual(res.unseenCount, 2);
    assert.strictEqual(res.picked.id, 3);
    assert.strictEqual(SESSION_TTL_MS, 3 * 60 * 60 * 1000);
    assert.strictEqual(TOPICS.length, 10);

    const a1 = assignTurnForGame('game-test-1234', 1);
    const fallbacks = getFallbackTopicsForGame('game-test-1234', 1, a1.topic.number);
    assert.strictEqual(fallbacks.length, 9);
    assert.ok(!fallbacks.some((t) => t.number === a1.topic.number));
  });
});
