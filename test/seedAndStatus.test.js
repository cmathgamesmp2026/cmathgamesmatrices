import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getPoolCounts } from '../shared/d1Pool.js';
import { InMemoryModelStateStore } from '../shared/modelState.js';
import { ServiceError } from '../shared/gemini.js';
import { runSeedPool } from '../scripts/seedPool.js';
import { migrateRows, normalizeMysqlTime } from '../scripts/migrateMysqlToD1.js';

describe('Pool Status Counts, Seeding Script & MySQL Migration', () => {
  it('getPoolCounts returns counts for all 10 topics and both difficulties', async () => {
    const fakeD1 = {
      prepare() {
        return {
          async all() {
            return {
              results: [
                { topic: 1, difficulty: 'easy', cnt: 6 },
                { topic: 1, difficulty: 'hard', cnt: 2 },
                { topic: 10, difficulty: 'hard', cnt: 10 }
              ]
            };
          }
        };
      }
    };

    const counts = await getPoolCounts(fakeD1);
    assert.strictEqual(Object.keys(counts).length, 10);
    assert.deepStrictEqual(counts[1], { easy: 6, hard: 2 });
    assert.deepStrictEqual(counts[2], { easy: 0, hard: 0 });
    assert.deepStrictEqual(counts[10], { easy: 0, hard: 10 });
  });

  it('runSeedPool stops cleanly when all models are exhausted and reports added & missing counts', async () => {
    const counts = {};
    for (let t = 1; t <= 10; t++) counts[t] = { easy: 0, hard: 0 };

    const modelStore = new InMemoryModelStateStore();
    let batchCalls = 0;

    const summary = await runSeedPool({
      targetPerTopic: 4,
      batchSize: 2,
      minGapMs: 0,
      models: ['m1'],
      modelStore,
      getCounts: async () => counts,
      getContexts: async () => [],
      logger: { log() {}, warn() {} },
      generateBatchFn: async ({ topic }) => {
        batchCalls += 1;
        if (batchCalls === 1) {
          return [
            { topic: topic.label, topicNumber: topic.number, lesson: {}, question: { text: 'q1' } },
            { topic: topic.label, topicNumber: topic.number, lesson: {}, question: { text: 'q2' } }
          ];
        }
        await modelStore.markExhausted('m1');
        throw new ServiceError('RATE_LIMIT', 'The question service is busy, please try again soon', 429);
      },
      saveFn: async () => ({ saved: true, duplicate: false, id: 1 })
    });

    assert.strictEqual(summary.stoppedEarly, true);
    assert.strictEqual(summary.totalAdded, 2);
    assert.strictEqual(summary.totalMissing, 78);
    assert.strictEqual(summary.quotaStatus.allExhausted, true);
    assert.strictEqual(summary.quotaStatus.exhausted.length, 1);
    assert.strictEqual(summary.quotaStatus.exhausted[0].model, 'm1');
  });

  it('migrateRows copies question_pool and leaderboard rows without creating duplicates when run twice', async () => {
    assert.strictEqual(normalizeMysqlTime('0:3:5'), '00:03:05');
    assert.strictEqual(normalizeMysqlTime('01:12:45'), '01:12:45');
    assert.strictEqual(normalizeMysqlTime(125), '00:02:05');

    const poolSigs = new Set();
    const lbRows = [];
    const fakeD1 = {
      prepare(sql) {
        let params = [];
        return {
          bind(...p) {
            params = p;
            return this;
          },
          async run() {
            if (sql.includes('INSERT OR IGNORE INTO question_pool')) {
              const sig = params[3];
              if (poolSigs.has(sig)) return { meta: { changes: 0 } };
              poolSigs.add(sig);
              return { meta: { changes: 1 } };
            }
            if (sql.includes('INSERT INTO matrices_snl')) {
              lbRows.push(params);
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          },
          async first() {
            if (sql.includes('SELECT id FROM matrices_snl')) {
              const match = lbRows.find(
                (r) =>
                  r[0] === params[0] &&
                  r[1] === params[1] &&
                  r[2] === params[2] &&
                  r[3] === params[3] &&
                  r[4] === params[4]
              );
              return match ? { id: 1 } : null;
            }
            return null;
          }
        };
      }
    };

    const poolRows = [
      { topic: 3, difficulty: 'easy', payload: { question: { text: 'Find 2A' } }, signature: 'sig-aaa', context: null, times_served: 2 }
    ];
    const leaderboardRows = [
      { name: 'Alice', turns_taken: 8, correct_answers: 7, wrong_answers: 1, time_taken: '0:02:15' }
    ];

    const first = await migrateRows({
      poolRows,
      leaderboardRows,
      withLeaderboard: true,
      d1: fakeD1,
      logger: { log() {} }
    });
    assert.strictEqual(first.poolCopied, 1);
    assert.strictEqual(first.poolSkipped, 0);
    assert.strictEqual(first.leaderboardCopied, 1);
    assert.strictEqual(first.leaderboardSkipped, 0);
    assert.strictEqual(lbRows[0][4], '00:02:15');

    const second = await migrateRows({
      poolRows,
      leaderboardRows,
      withLeaderboard: true,
      d1: fakeD1,
      logger: { log() {} }
    });
    assert.strictEqual(second.poolCopied, 0);
    assert.strictEqual(second.poolSkipped, 1);
    assert.strictEqual(second.leaderboardCopied, 0);
    assert.strictEqual(second.leaderboardSkipped, 1);
  });
});
