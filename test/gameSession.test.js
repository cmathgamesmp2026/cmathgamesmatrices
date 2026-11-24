import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  TOPICS,
  CONTEXTS,
  assignTurnForGame,
  pickContextsForTurn
} from '../shared/topics.js';

describe('Topic order', () => {
  it('uses each of the 10 topics once before any repeats, cycle after cycle', () => {
    const gameId = 'session-test-abc123';
    for (let cycle = 0; cycle < 3; cycle++) {
      const seen = [];
      for (let i = 0; i < 10; i++) {
        seen.push(assignTurnForGame(gameId, cycle * 10 + i + 1).topic.number);
      }
      assert.deepStrictEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
  });

  it('never gives the same topic twice in a row, even across a reshuffle', () => {
    for (let trial = 0; trial < 50; trial++) {
      const gameId = `trial-game-${trial}-xyz`;
      let prev = null;
      for (let turn = 1; turn <= 40; turn++) {
        const n = assignTurnForGame(gameId, turn).topic.number;
        assert.notStrictEqual(n, prev);
        prev = n;
      }
    }
  });

  it('gives the same assignment when the same turn is requested again', () => {
    const gameId = 'idempotent-game-1234';
    const first = assignTurnForGame(gameId, 3);
    const second = assignTurnForGame(gameId, 3);
    assert.strictEqual(first.topic.number, second.topic.number);
  });
});

describe('Application contexts (topics 9 and 10)', () => {
  it('gives two different contexts per application turn and respects usedContexts', () => {
    const used = new Set();
    for (let turn = 1; turn <= 4; turn++) {
      const { lessonContext, questionContext } = pickContextsForTurn('ctx-game-1234', turn, used);
      assert.notStrictEqual(lessonContext, questionContext);
      assert.ok(!used.has(lessonContext.toLowerCase()));
      assert.ok(!used.has(questionContext.toLowerCase()));
      used.add(lessonContext.toLowerCase());
      used.add(questionContext.toLowerCase());
    }
  });

  it('never offers muffins or coffee as a context', () => {
    for (const c of CONTEXTS) {
      assert.doesNotMatch(c, /muffin|coffee/i);
    }
    assert.strictEqual(TOPICS.length, 10);
  });
});
