import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getConfiguredModels,
  getNextMidnightPacific,
  ModelQuotaTracker,
  GeminiRequestQueue
} from '../server/services/geminiQueue.js';
import {
  callWithModelFallback,
  generateBatch,
  ServiceError
} from '../server/services/gemini.js';
import { STATIC_LESSONS } from '../server/services/staticFallback.js';
import { TOPICS } from '../server/services/gameSession.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const errWithStatus = (code) => Object.assign(new Error(`HTTP ${code}`), { status: code });
const quietLogger = { warn() {} };

describe('Model Configuration & Midnight Pacific Reset', () => {
  it('reads GEMINI_MODELS comma-separated list and falls back to GEMINI_MODEL', () => {
    assert.deepStrictEqual(
      getConfiguredModels({ GEMINI_MODELS: 'model-a, model-b , model-c', GEMINI_MODEL: 'old' }),
      ['model-a', 'model-b', 'model-c']
    );
    assert.deepStrictEqual(
      getConfiguredModels({ GEMINI_MODELS: '', GEMINI_MODEL: 'single-model' }),
      ['single-model']
    );
  });

  it('computes the exact next midnight Pacific time (00:00:00 America/Los_Angeles)', () => {
    // 2026-11-24 12:00:00 UTC is 2026-11-24 04:00:00 PST (UTC-8)
    // Next midnight PST is 2026-11-25 08:00:00 UTC
    const now = Date.UTC(2026, 10, 24, 12, 0, 0);
    const reset = getNextMidnightPacific(now);
    assert.strictEqual(new Date(reset).toISOString(), '2026-11-25T08:00:00.000Z');

    // Summer time (PDT = UTC-7): 2026-07-10 12:00:00 UTC is 05:00 PDT
    // Next midnight PDT is 2026-07-11 07:00:00 UTC
    const summer = Date.UTC(2026, 6, 10, 12, 0, 0);
    const summerReset = getNextMidnightPacific(summer);
    assert.strictEqual(new Date(summerReset).toISOString(), '2026-07-11T07:00:00.000Z');
  });
});

describe('Model Fallback & Request Queue', () => {
  it('marks a model exhausted on 429 without retrying it, and switches to the next model', async () => {
    const quota = new ModelQuotaTracker();
    const queue = new GeminiRequestQueue({ minGapMs: 0 });
    const called = [];

    const out = await callWithModelFallback('prompt', {
      models: ['m1', 'm2'],
      quota,
      queue,
      sleep: async () => {},
      logger: quietLogger,
      callModel: async (_p, model) => {
        called.push(model);
        if (model === 'm1') throw errWithStatus(429);
        return 'ok-from-m2';
      }
    });

    assert.strictEqual(out, 'ok-from-m2');
    assert.deepStrictEqual(called, ['m1', 'm2']); // m1 was NOT retried on 429
    assert.strictEqual(quota.isExhausted('m1'), true);
    assert.strictEqual(quota.isExhausted('m2'), false);
  });

  it('retries 503 twice (1s then 3s) before switching to the next model', async () => {
    const quota = new ModelQuotaTracker();
    const queue = new GeminiRequestQueue({ minGapMs: 0 });
    const called = [];
    const sleeps = [];

    const out = await callWithModelFallback('prompt', {
      models: ['m1', 'm2'],
      quota,
      queue,
      sleep: async (ms) => sleeps.push(ms),
      logger: quietLogger,
      callModel: async (_p, model) => {
        called.push(model);
        if (model === 'm1') throw errWithStatus(503);
        return 'ok-from-m2';
      }
    });

    assert.strictEqual(out, 'ok-from-m2');
    assert.deepStrictEqual(called, ['m1', 'm1', 'm1', 'm2']);
    assert.deepStrictEqual(sleeps, [1000, 3000]);
  });

  it('stops calling Gemini once every model is exhausted', async () => {
    const quota = new ModelQuotaTracker();
    const queue = new GeminiRequestQueue({ minGapMs: 0 });
    let calls = 0;

    quota.markExhausted('m1');
    quota.markExhausted('m2');

    await assert.rejects(
      callWithModelFallback('prompt', {
        models: ['m1', 'm2'],
        quota,
        queue,
        logger: quietLogger,
        callModel: async () => {
          calls++;
          return 'should-not-run';
        }
      }),
      (err) => err instanceof ServiceError && err.status === 429
    );
    assert.strictEqual(calls, 0);
  });

  it('serialises concurrent requests with at least GEMINI_MIN_GAP_MS between them', async () => {
    let fakeTime = 10000;
    const sleeps = [];
    const queue = new GeminiRequestQueue({
      minGapMs: 4000,
      now: () => fakeTime,
      sleep: async (ms) => {
        sleeps.push(ms);
        fakeTime += ms;
      }
    });

    let active = 0;
    let maxActive = 0;
    const runTask = (id) =>
      queue.enqueue(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active--;
        return id;
      });

    const results = await Promise.all([runTask(1), runTask(2), runTask(3)]);
    assert.deepStrictEqual(results, [1, 2, 3]);
    assert.strictEqual(maxActive, 1); // only 1 runs at a time
    assert.deepStrictEqual(sleeps, [4000, 4000]);
  });
});

describe('Batch Generation & Per-Item Verification', () => {
  it('verifies each item in the batch independently, keeping only valid distinct items', async () => {
    const good1 = clone(STATIC_LESSONS[1]); // topic 3: 2A
    const good2 = clone(STATIC_LESSONS[1]);
    good2.question.text = 'What is 3A?';
    good2.question.matrices = { A: [[1, 3], [2, -1]], k: 3 };
    good2.question.options = [
      [[3, 9], [6, -3]],
      [[3, 3], [6, -1]],
      [[1, 9], [6, -3]],
      [[4, 6], [5, 2]]
    ];
    good2.question.correctIndex = 0;

    const bad = clone(STATIC_LESSONS[1]);
    bad.question.correctIndex = 0; // wrong answer

    const quota = new ModelQuotaTracker();
    const queue = new GeminiRequestQueue({ minGapMs: 0 });

    const verified = await generateBatch(
      { topic: TOPICS[2], difficulty: 'Easy', batchSize: 3 },
      {
        models: ['m1'],
        quota,
        queue,
        sleep: async () => {},
        logger: quietLogger,
        callModel: async () => JSON.stringify([good1, bad, good2])
      }
    );

    assert.strictEqual(verified.length, 2);
    assert.strictEqual(verified[0].topicNumber, 3);
    assert.strictEqual(verified[1].topicNumber, 3);
  });

  it('retries the whole batch at most once when 0 items pass', async () => {
    const bad = clone(STATIC_LESSONS[1]);
    bad.question.correctIndex = 0; // wrong
    const quota = new ModelQuotaTracker();
    const queue = new GeminiRequestQueue({ minGapMs: 0 });
    let calls = 0;

    await assert.rejects(
      generateBatch(
        { topic: TOPICS[2], difficulty: 'Easy', batchSize: 2 },
        {
          models: ['m1'],
          quota,
          queue,
          sleep: async () => {},
          logger: quietLogger,
          callModel: async () => {
            calls++;
            return JSON.stringify([bad]);
          }
        }
      ),
      (err) => err instanceof ServiceError && err.code === 'VERIFY_FAILED'
    );
    assert.strictEqual(calls, 2); // 1 initial + 1 retry max
  });
});
