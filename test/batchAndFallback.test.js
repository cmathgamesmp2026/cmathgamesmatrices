import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getConfiguredModels } from '../shared/config.js';
import { getNextMidnightPacific, InMemoryModelStateStore } from '../shared/modelState.js';
import { callWithModelFallback, generateBatch, ServiceError } from '../shared/gemini.js';
import { STATIC_LESSONS } from '../shared/staticFallback.js';
import { TOPICS } from '../shared/topics.js';

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
    const now = Date.UTC(2026, 10, 24, 12, 0, 0);
    const reset = getNextMidnightPacific(now);
    assert.strictEqual(new Date(reset).toISOString(), '2026-11-25T08:00:00.000Z');

    const summer = Date.UTC(2026, 6, 10, 12, 0, 0);
    const summerReset = getNextMidnightPacific(summer);
    assert.strictEqual(new Date(summerReset).toISOString(), '2026-07-11T07:00:00.000Z');
  });
});

describe('Model Fallback (Workers-compatible model_state)', () => {
  it('marks a model exhausted on 429 without retrying it, and switches to the next model', async () => {
    const modelStore = new InMemoryModelStateStore();
    const called = [];

    const out = await callWithModelFallback('prompt', {
      models: ['m1', 'm2'],
      modelStore,
      sleep: async () => {},
      logger: quietLogger,
      callModel: async (_p, model) => {
        called.push(model);
        if (model === 'm1') throw errWithStatus(429);
        return 'ok-from-m2';
      }
    });

    assert.strictEqual(out, 'ok-from-m2');
    assert.deepStrictEqual(called, ['m1', 'm2']);
    assert.strictEqual(await modelStore.isExhausted('m1'), true);
    assert.strictEqual(await modelStore.isExhausted('m2'), false);
  });

  it('retries 503 twice (1s then 3s) before marking cooling and switching to the next model', async () => {
    const modelStore = new InMemoryModelStateStore();
    const called = [];
    const sleeps = [];

    const out = await callWithModelFallback('prompt', {
      models: ['m1', 'm2'],
      modelStore,
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
    assert.strictEqual(await modelStore.isBlocked('m1'), true);
  });

  it('stops calling Gemini once every model is exhausted', async () => {
    const modelStore = new InMemoryModelStateStore();
    let calls = 0;

    await modelStore.markExhausted('m1');
    await modelStore.markExhausted('m2');

    await assert.rejects(
      callWithModelFallback('prompt', {
        models: ['m1', 'm2'],
        modelStore,
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
});

describe('Batch Generation & Per-Item Verification', () => {
  it('verifies each item in the batch independently, keeping only valid distinct items', async () => {
    const good1 = clone(STATIC_LESSONS[1]);
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

    const modelStore = new InMemoryModelStateStore();

    const verified = await generateBatch(
      { topic: TOPICS[2], difficulty: 'Easy', batchSize: 3 },
      {
        models: ['m1'],
        modelStore,
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
    bad.question.correctIndex = 0;
    const modelStore = new InMemoryModelStateStore();
    let calls = 0;

    await assert.rejects(
      generateBatch(
        { topic: TOPICS[2], difficulty: 'Easy', batchSize: 2 },
        {
          models: ['m1'],
          modelStore,
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
    assert.strictEqual(calls, 2);
  });
});
