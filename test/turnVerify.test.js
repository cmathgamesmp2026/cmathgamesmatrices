import { describe, it } from 'node:test';
import assert from 'node:assert';
import { verifyTurn, verifyQuestion, isOutOfSyllabus } from '../shared/mathVerify.js';
import { STATIC_LESSONS } from '../shared/staticFallback.js';
import { TOPICS } from '../shared/topics.js';

const topicFor = (number) => TOPICS[number - 1];
const clone = (x) => JSON.parse(JSON.stringify(x));
const scalarTurn = () => clone(STATIC_LESSONS[1]); // topic 3

/** A valid topic 9 turn (2x2 systems), different numbers in lesson and question. */
const systemTurn = () => ({
  topic: '9. Systems of linear equations',
  lesson: {
    title: 'Solving AX = b',
    keyPoints: ['Write the system as AX = b.', 'Then X = A⁻¹b.'],
    example: {
      type: 'solve_system',
      description: 'Pens (x) and rulers (y): 2x + y = 5 and x + y = 3.',
      matrices: { A: [[2, 1], [1, 1]], b: [5, 3] },
      steps: ['det(A) = 1', 'A⁻¹ = [[1, -1], [-1, 2]]', 'X = A⁻¹b = [2, 1]'],
      result: 'x = 2, y = 1'
    }
  },
  question: {
    type: 'solve_system',
    text: 'A bus ticket is x dollars and a train ticket is y dollars. x + y = 5 and x − y = 1. Find x and y.',
    matrices: { A: [[1, 1], [1, -1]], b: [5, 1] },
    options: ['x = 3, y = 2', 'x = 2, y = 3', 'x = 4, y = 1', 'x = 1, y = 4'],
    correctIndex: 0,
    explanation: 'X = A⁻¹b gives x = 3, y = 2.'
  }
});

describe('verifyTurn: accepts correct lessons and questions', () => {
  it('accepts every static fallback lesson for its own topic', () => {
    for (const item of STATIC_LESSONS) {
      const number = parseInt(item.topic, 10);
      const res = verifyTurn(clone(item), topicFor(number));
      assert.strictEqual(res.valid, true, `${item.topic}: ${res.reason}`);
    }
  });

  it('accepts a 2x2 system turn', () => {
    assert.strictEqual(verifyTurn(systemTurn(), topicFor(9)).valid, true);
  });

  it('accepts a unicode minus sign in a determinant option', () => {
    const t = clone(STATIC_LESSONS[2]);
    t.question.options = ['11', '1', '\u22121', '5'];
    assert.strictEqual(verifyTurn(t, topicFor(7)).valid, true);
  });

  it('accepts a conformability question with sizes', () => {
    const t = {
      topic: '4. Matrix multiplication',
      lesson: {
        title: 'When can you multiply?',
        keyPoints: ['AB works when columns of A = rows of B.', 'The product has rows of A and columns of B.'],
        example: {
          type: 'conformability',
          description: 'Can we multiply AB?',
          matrices: { A: [[1, 2], [3, 4], [5, 6]], B: [[1, 2, 3], [4, 5, 6]] },
          steps: ['A is 3 × 2, B is 2 × 3.', '2 = 2, so we can multiply.'],
          result: 'Conformable, result is 3 × 3'
        }
      },
      question: {
        type: 'conformability',
        text: 'A is 2 × 3 and B is 3 × 2. Can you multiply AB? If so, what is its size?',
        matrices: { A: [[1, 2, 3], [4, 5, 6]], B: [[1, 2], [3, 4], [5, 6]] },
        options: ['Conformable, result is 2 × 2', 'Not conformable', 'Conformable, result is 3 × 3', 'Conformable, result is 2 × 3'],
        correctIndex: 0,
        explanation: 'Columns of A (3) = rows of B (3), so AB is 2 × 2.'
      }
    };
    const res = verifyTurn(t, topicFor(4));
    assert.strictEqual(res.valid, true, res.reason);
  });
});

describe('verifyTurn: rejects bad content', () => {
  it('rejects a wrong correct answer', () => {
    const t = scalarTurn();
    t.question.correctIndex = 0; // [[4,-1],[10,0]] is wrong
    const res = verifyTurn(t, topicFor(3));
    assert.strictEqual(res.valid, false);
    assert.match(res.reason, /Question: .*mismatch/);
  });

  it("rejects a lesson whose worked example result is wrong", () => {
    const t = scalarTurn();
    t.lesson.example.result = [[3, 6], [0, 11]];
    const res = verifyTurn(t, topicFor(3));
    assert.strictEqual(res.valid, false);
    assert.match(res.reason, /Lesson example result mismatch/);
  });

  it('rejects when two options are correct', () => {
    const t = scalarTurn();
    t.question.options[0] = [[4, -2], [10, 0]]; // same as the correct option
    const res = verifyTurn(t, topicFor(3));
    assert.strictEqual(res.valid, false);
  });

  it('rejects a question that reuses the lesson example matrices', () => {
    const t = scalarTurn();
    t.question.matrices = clone(t.lesson.example.matrices);
    t.question.text = 'What is 3A?';
    t.question.options = [[[3, 6], [0, 12]], [[3, 2], [0, 4]], [[1, 2], [0, 4]], [[3, 6], [0, 4]]];
    t.question.correctIndex = 0;
    const res = verifyTurn(t, topicFor(3));
    assert.strictEqual(res.valid, false);
    assert.match(res.reason, /same matrices as the lesson example/);
  });

  it('rejects a computational type with no matrices (nothing is silently skipped)', () => {
    const t = scalarTurn();
    delete t.question.matrices;
    const res = verifyTurn(t, topicFor(3));
    assert.strictEqual(res.valid, false);
    assert.match(res.reason, /requires matrices/);
  });

  it('rejects a topic that is not the assigned one', () => {
    const res = verifyTurn(scalarTurn(), topicFor(5));
    assert.strictEqual(res.valid, false);
    assert.match(res.reason, /Topic mismatch/);
  });

  it('rejects fewer than 4 distinct options', () => {
    const t = scalarTurn();
    t.question.options[3] = t.question.options[1];
    assert.strictEqual(verifyTurn(t, topicFor(3)).valid, false);
  });

  it('rejects out-of-syllabus content in the lesson', () => {
    const t = scalarTurn();
    t.lesson.keyPoints[0] = 'Scaling is related to the eigenvalues of a matrix.';
    const res = verifyTurn(t, topicFor(3));
    assert.strictEqual(res.valid, false);
    assert.match(res.reason, /Out-of-syllabus/);
  });

  it('rejects matrices larger than 3x3', () => {
    const t = scalarTurn();
    t.question.matrices.A = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    const res = verifyTurn(t, topicFor(3));
    assert.strictEqual(res.valid, false);
    assert.match(res.reason, /larger than 3x3/);
  });

  it('rejects a singular system (no unique solution)', () => {
    const t = systemTurn();
    t.question.matrices = { A: [[1, 2], [2, 4]], b: [3, 6] };
    const res = verifyTurn(t, topicFor(9));
    assert.strictEqual(res.valid, false);
    assert.match(res.reason, /singular/);
  });

  it('rejects muffins and coffee in application topics', () => {
    const t = systemTurn();
    t.question.text = 'A muffin costs x and a coffee costs y. x + y = 5 and x − y = 1.';
    const res = verifyTurn(t, topicFor(9));
    assert.strictEqual(res.valid, false);
    assert.match(res.reason, /muffins\/coffee/);
  });

  it('rejects malformed lessons', () => {
    const t = scalarTurn();
    t.lesson.keyPoints = ['Only one point.'];
    assert.strictEqual(verifyTurn(t, topicFor(3)).valid, false);
    assert.strictEqual(verifyTurn(null, topicFor(3)).valid, false);
    assert.strictEqual(verifyTurn({ topic: '3. Scalar multiplication' }, topicFor(3)).valid, false);
  });
});

describe('out-of-syllabus detection', () => {
  it('flags real out-of-syllabus terms but not ordinary words', () => {
    assert.strictEqual(isOutOfSyllabus('Find the eigenvalues of A'), true);
    assert.strictEqual(isOutOfSyllabus("Use Cramer's rule"), true);
    assert.strictEqual(isOutOfSyllabus('Find the rank of the matrix'), true);
    assert.strictEqual(isOutOfSyllabus('Rate each song and see the ranking'), false);
    assert.strictEqual(isOutOfSyllabus('Frank buys 3 pens'), false);
  });
});

describe('verifyQuestion still works on its own', () => {
  it('checks a scalar question using explicit k', () => {
    const q = clone(STATIC_LESSONS[1].question);
    const res = verifyQuestion({
      topic: 'Scalar multiplication',
      type: q.type,
      question: q.text,
      matrices: q.matrices,
      options: q.options,
      correctIndex: q.correctIndex
    });
    assert.strictEqual(res.valid, true, res.reason);
  });

  it('checks 2A - 3B with k2 and op', () => {
    const res = verifyQuestion({
      topic: 'Scalar multiplication',
      type: 'scalar',
      question: 'Find 2A - 3B',
      matrices: { A: [[1, 2], [3, 4]], k: 2, B: [[1, 0], [0, 1]], k2: 3, op: '-' },
      options: [[[-1, 4], [6, 5]], [[5, 4], [6, 11]], [[-1, 4], [6, 8]], [[3, 6], [9, 12]]],
      correctIndex: 0
    });
    assert.strictEqual(res.valid, true, res.reason);
  });
});
