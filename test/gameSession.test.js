import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  TOPICS,
  CONTEXTS,
  createSession,
  assignTurn,
  questionKey,
  recordQuestion,
  isDuplicateQuestion
} from '../server/services/gameSession.js';

describe('Topic order', () => {
  it('uses each of the 10 topics once before any repeats, cycle after cycle', () => {
    const session = createSession();
    for (let cycle = 0; cycle < 3; cycle++) {
      const seen = [];
      for (let i = 0; i < 10; i++) {
        seen.push(assignTurn(session, cycle * 10 + i + 1).topic.number);
      }
      assert.deepStrictEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
  });

  it('never gives the same topic twice in a row, even across a reshuffle', () => {
    for (let trial = 0; trial < 50; trial++) {
      const session = createSession();
      let prev = null;
      for (let turn = 1; turn <= 40; turn++) {
        const n = assignTurn(session, turn).topic.number;
        assert.notStrictEqual(n, prev);
        prev = n;
      }
    }
  });

  it('gives the same assignment when the same turn is requested again', () => {
    const session = createSession();
    const first = assignTurn(session, 1);
    const again = assignTurn(session, 1);
    assert.strictEqual(first, again);
    assert.strictEqual(session.pos, 1); // no topic was burned
  });
});

describe('Application contexts (topics 9 and 10)', () => {
  it('gives two different contexts per application turn and never reuses one in a game', () => {
    const session = createSession();
    const used = [];
    for (let turn = 1; turn <= 30; turn++) {
      const a = assignTurn(session, turn);
      if (a.topic.number === 9 || a.topic.number === 10) {
        assert.ok(a.lessonContext && a.questionContext);
        assert.notStrictEqual(a.lessonContext, a.questionContext);
        used.push(a.lessonContext, a.questionContext);
      } else {
        assert.strictEqual(a.lessonContext, null);
      }
    }
    assert.strictEqual(used.length, 12); // 3 cycles x 2 application topics x 2 contexts
    assert.strictEqual(new Set(used).size, 12);
    used.forEach((c) => assert.ok(CONTEXTS.includes(c)));
  });

  it('never offers muffins or coffee as a context', () => {
    assert.ok(!CONTEXTS.some((c) => /muffin|coffee/i.test(c)));
  });
});

describe('Duplicate questions', () => {
  it('detects a question already used in the game', () => {
    const session = createSession();
    const q = { text: 'What is 2A?', matrices: { A: [[1, 2], [3, 4]], k: 2 } };
    assert.strictEqual(isDuplicateQuestion(session, q), false);
    recordQuestion(session, q);
    assert.strictEqual(isDuplicateQuestion(session, { ...q, text: '  what is 2a?  ' }), true);
    assert.notStrictEqual(questionKey(q), questionKey({ ...q, matrices: { A: [[1, 2], [3, 5]], k: 2 } }));
  });

  it('has 10 topics matching the syllabus', () => {
    assert.strictEqual(TOPICS.length, 10);
    assert.strictEqual(TOPICS[0].label, '1. Matrix basics');
  });
});
