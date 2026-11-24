import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getPoolCounts } from '../server/services/questionPool.js';
import { runSeedPool } from '../server/scripts/seedPool.js';
import { ModelQuotaTracker } from '../server/services/geminiQueue.js';
import { ServiceError } from '../server/services/gemini.js';

describe('Pool Status Counts & Seeding Script', () => {
  it('getPoolCounts returns counts for all 10 topics and both difficulties', async () => {
    const fakePool = {
      async execute() {
        return [[
          { topic: 1, difficulty: 'easy', cnt: 6 },
          { topic: 1, difficulty: 'hard', cnt: 2 },
          { topic: 10, difficulty: 'hard', cnt: 10 }
        ]];
      }
    };

    const counts = await getPoolCounts(fakePool);
    assert.strictEqual(Object.keys(counts).length, 10);
    assert.deepStrictEqual(counts[1], { easy: 6, hard: 2 });
    assert.deepStrictEqual(counts[2], { easy: 0, hard: 0 });
    assert.deepStrictEqual(counts[10], { easy: 0, hard: 10 });
  });

  it('runSeedPool stops cleanly when all models are exhausted and reports added & missing counts', async () => {
    const counts = {};
    for (let t = 1; t <= 10; t++) counts[t] = { easy: 0, hard: 0 };

    const quota = new ModelQuotaTracker();
    let batchCalls = 0;

    const summary = await runSeedPool({
      targetPerTopic: 4,
      batchSize: 2,
      models: ['m1'],
      quota,
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
        quota.markExhausted('m1');
        throw new ServiceError('RATE_LIMIT', 'The question service is busy, please try again soon', 429);
      },
      saveFn: async () => ({ saved: true, duplicate: false, id: 1 })
    });

    assert.strictEqual(summary.stoppedEarly, true);
    assert.strictEqual(summary.totalAdded, 2);
    // 20 buckets * 4 target = 80 total needed; 2 added => 78 missing
    assert.strictEqual(summary.totalMissing, 78);
    assert.strictEqual(summary.quotaStatus.allExhausted, true);
    assert.strictEqual(summary.quotaStatus.exhausted.length, 1);
    assert.strictEqual(summary.quotaStatus.exhausted[0].model, 'm1');
  });
});
