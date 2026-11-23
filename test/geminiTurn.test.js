import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  generateTurn,
  getHttpStatus,
  ServiceError,
  MAX_VERIFY_RETRIES,
  RETRY_DELAYS_MS
} from '../server/services/gemini.js';
import { STATIC_LESSONS } from '../server/services/staticFallback.js';
import { verifyQuestion } from '../server/services/mathVerify.js';
import { TOPICS } from '../server/services/gameSession.js';

const assignment = { turn: 1, topic: TOPICS[2], lessonContext: null, questionContext: null }; // topic 3
const goodJson = () => JSON.stringify(STATIC_LESSONS[1]);
const badAnswerJson = () => {
  const t = JSON.parse(goodJson());
  t.question.correctIndex = 0; // wrong
  return JSON.stringify(t);
};
const makeLogger = () => {
  const warnings = [];
  return { warnings, warn: (m) => warnings.push(String(m)) };
};
const status = (code) => Object.assign(new Error(`HTTP ${code}`), { status: code });

describe('generateTurn: success', () => {
  it('returns the assigned topic, a lesson and a shuffled, still-correct question', async () => {
    const logger = makeLogger();
    const out = await generateTurn({ assignment }, { callModel: async () => goodJson(), sleep: async () => {}, logger });
    assert.strictEqual(out.topic, '3. Scalar multiplication');
    assert.strictEqual(out.topicNumber, 3);
    assert.ok(out.lesson.title);
    assert.strictEqual(out.question.options.length, 4);
    const check = verifyQuestion({
      topic: 'Scalar multiplication',
      type: out.question.type,
      question: out.question.text,
      matrices: out.question.matrices,
      options: out.question.options,
      correctIndex: out.question.correctIndex
    });
    assert.strictEqual(check.valid, true, check.reason);
  });

  it('accepts JSON wrapped in a markdown fence', async () => {
    const out = await generateTurn(
      { assignment },
      { callModel: async () => '```json\n' + goodJson() + '\n```', sleep: async () => {}, logger: makeLogger() }
    );
    assert.strictEqual(out.topicNumber, 3);
  });
});

describe('generateTurn: verification retries', () => {
  it('rejects a wrong answer, logs why, then accepts a good one', async () => {
    const logger = makeLogger();
    const replies = [badAnswerJson(), goodJson()];
    let calls = 0;
    const out = await generateTurn(
      { assignment },
      { callModel: async () => replies[calls++], sleep: async () => {}, logger }
    );
    assert.strictEqual(calls, 2);
    assert.strictEqual(out.topicNumber, 3);
    assert.strictEqual(logger.warnings.length, 1);
    assert.match(logger.warnings[0], /rejected: Question: .*mismatch/);
  });

  it('gives up after 2 verification retries (3 calls) and never shows the bad turn', async () => {
    const logger = makeLogger();
    let calls = 0;
    await assert.rejects(
      generateTurn({ assignment }, { callModel: async () => (calls++, badAnswerJson()), sleep: async () => {}, logger }),
      (err) => err instanceof ServiceError && err.code === 'VERIFY_FAILED'
    );
    assert.strictEqual(calls, MAX_VERIFY_RETRIES + 1);
    assert.strictEqual(logger.warnings.length, MAX_VERIFY_RETRIES + 1);
  });

  it('treats invalid JSON as a rejected attempt', async () => {
    const logger = makeLogger();
    const replies = ['this is not json', goodJson()];
    let calls = 0;
    await generateTurn({ assignment }, { callModel: async () => replies[calls++], sleep: async () => {}, logger });
    assert.match(logger.warnings[0], /Invalid JSON/);
  });

  it('rejects a duplicate question', async () => {
    const logger = makeLogger();
    let dup = true;
    const out = await generateTurn(
      { assignment, isDuplicate: () => (dup ? ((dup = false), true) : false) },
      { callModel: async () => goodJson(), sleep: async () => {}, logger }
    );
    assert.strictEqual(out.topicNumber, 3);
    assert.match(logger.warnings[0], /Duplicate/);
  });
});

describe('generateTurn: 429 and 503', () => {
  it('does NOT retry a 429 and reports it as busy', async () => {
    let calls = 0;
    const sleeps = [];
    await assert.rejects(
      generateTurn(
        { assignment },
        { callModel: async () => { calls++; throw status(429); }, sleep: async (ms) => sleeps.push(ms), logger: makeLogger() }
      ),
      (err) => err.code === 'RATE_LIMIT' && err.status === 429 && /busy, please try again soon/.test(err.message)
    );
    assert.strictEqual(calls, 1);
    assert.deepStrictEqual(sleeps, []);
  });

  it('detects a 429 that only appears inside the error message', async () => {
    const msg = '{"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED"}}';
    let calls = 0;
    await assert.rejects(
      generateTurn(
        { assignment },
        { callModel: async () => { calls++; throw new Error(msg); }, sleep: async () => {}, logger: makeLogger() }
      ),
      (err) => err.code === 'RATE_LIMIT'
    );
    assert.strictEqual(calls, 1);
  });

  it('retries a 503 twice with growing delays (1s then 3s), then succeeds', async () => {
    let calls = 0;
    const sleeps = [];
    const out = await generateTurn(
      { assignment },
      {
        callModel: async () => {
          calls++;
          if (calls <= 2) throw status(503);
          return goodJson();
        },
        sleep: async (ms) => sleeps.push(ms),
        logger: makeLogger()
      }
    );
    assert.strictEqual(calls, 3);
    assert.deepStrictEqual(sleeps, RETRY_DELAYS_MS);
    assert.deepStrictEqual(sleeps, [1000, 3000]);
    assert.strictEqual(out.topicNumber, 3);
  });

  it('gives up after 2 retries of a persistent 503', async () => {
    let calls = 0;
    const sleeps = [];
    await assert.rejects(
      generateTurn(
        { assignment },
        { callModel: async () => { calls++; throw status(503); }, sleep: async (ms) => sleeps.push(ms), logger: makeLogger() }
      ),
      (err) => err.code === 'UNAVAILABLE' && err.status === 503
    );
    assert.strictEqual(calls, 3);
    assert.deepStrictEqual(sleeps, [1000, 3000]);
  });

  it('does not retry other errors', async () => {
    let calls = 0;
    await assert.rejects(
      generateTurn(
        { assignment },
        { callModel: async () => { calls++; throw status(400); }, sleep: async () => {}, logger: makeLogger() }
      ),
      (err) => err.code === 'UPSTREAM_ERROR'
    );
    assert.strictEqual(calls, 1);
  });

  it('getHttpStatus reads status fields and embedded JSON', () => {
    assert.strictEqual(getHttpStatus({ status: 503 }), 503);
    assert.strictEqual(getHttpStatus(new Error('{"error":{"code":429}}')), 429);
    assert.strictEqual(getHttpStatus(new Error('boom')), null);
  });
});

describe('Static fallback (USE_STATIC_FALLBACK)', () => {
  it('is off by default: a failure is reported, not hidden', async () => {
    await assert.rejects(
      generateTurn({ assignment }, { callModel: async () => { throw status(429); }, sleep: async () => {}, logger: makeLogger() })
    );
  });

  it('returns a verified hardcoded lesson only when switched on', async () => {
    const out = await generateTurn(
      { assignment },
      { callModel: async () => { throw status(429); }, sleep: async () => {}, logger: makeLogger(), useStaticFallback: true }
    );
    assert.strictEqual(out.topicNumber, 3);
    assert.strictEqual(out.question.options.length, 4);
  });
});
