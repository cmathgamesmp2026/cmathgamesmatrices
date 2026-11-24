import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Fraction, Matrix, verifyQuestion } from '../shared/mathVerify.js';

describe('Fraction Arithmetic', () => {
  it('correctly simplifies fractions', () => {
    const f1 = new Fraction(4, 8);
    assert.strictEqual(f1.toString(), '1/2');

    const f2 = new Fraction(-6, 9);
    assert.strictEqual(f2.toString(), '-2/3');

    const f3 = new Fraction(10, -5);
    assert.strictEqual(f3.toString(), '-2');
  });

  it('correctly adds and subtracts fractions', () => {
    const f1 = new Fraction(1, 3);
    const f2 = new Fraction(1, 6);
    assert.strictEqual(f1.add(f2).toString(), '1/2');
    assert.strictEqual(f1.sub(f2).toString(), '1/6');
  });

  it('multiplies and divides fractions', () => {
    const f1 = new Fraction(2, 3);
    const f2 = new Fraction(3, 4);
    assert.strictEqual(f1.mul(f2).toString(), '1/2');
    assert.strictEqual(f1.div(f2).toString(), '8/9');
  });
});

describe('Matrix Operations', () => {
  it('adds two matrices', () => {
    const A = new Matrix([[1, 2], [3, 4]]);
    const B = new Matrix([[5, 6], [7, 8]]);
    const C = A.add(B);
    assert.deepStrictEqual(C.toDisplayArray(), [['6', '8'], ['10', '12']]);
  });

  it('multiplies two matrices', () => {
    const A = new Matrix([[1, 2], [3, 4]]);
    const B = new Matrix([[2, 0], [1, 2]]);
    const C = A.multiply(B);
    // [1*2 + 2*1, 1*0 + 2*2] = [4, 4]
    // [3*2 + 4*1, 3*0 + 4*2] = [10, 8]
    assert.deepStrictEqual(C.toDisplayArray(), [['4', '4'], ['10', '8']]);
  });

  it('calculates 2x2 determinant', () => {
    const A = new Matrix([[4, 6], [3, 8]]);
    // 4*8 - 6*3 = 32 - 18 = 14
    assert.strictEqual(A.determinant().toString(), '14');
  });

  it('calculates 3x3 determinant', () => {
    const A = new Matrix([
      [1, 2, 3],
      [0, 1, 4],
      [5, 6, 0]
    ]);
    // det = 1*(0 - 24) - 2*(0 - 20) + 3*(0 - 5) = -24 + 40 - 15 = 1
    assert.strictEqual(A.determinant().toString(), '1');
  });

  it('calculates 2x2 inverse', () => {
    const A = new Matrix([[4, 7], [2, 6]]);
    // det = 24 - 14 = 10
    // adj = [[6, -7], [-2, 4]]
    // inv = [[6/10, -7/10], [-2/10, 4/10]] = [[3/5, -7/10], [-1/5, 2/5]]
    const inv = A.inverse();
    assert.deepStrictEqual(inv.toDisplayArray(), [
      ['3/5', '-7/10'],
      ['-1/5', '2/5']
    ]);
  });

  it('identifies singular matrices', () => {
    const A = new Matrix([[2, 4], [1, 2]]);
    assert.strictEqual(A.inverse(), null);
  });
});

describe('Question Verification Guard', () => {
  it('approves a valid 2x2 addition question', () => {
    const q = {
      topic: 'Addition and subtraction',
      type: 'add',
      question: 'Calculate A + B',
      matrices: {
        A: [[1, 2], [3, 4]],
        B: [[0, 1], [-1, 2]]
      },
      options: [
        [['1', '3'], ['2', '6']],
        [['1', '1'], ['4', '2']],
        [['0', '2'], ['-3', '8']],
        [['2', '3'], ['2', '6']]
      ],
      correctIndex: 0,
      explanation: 'Add corresponding elements.'
    };
    const res = verifyQuestion(q);
    assert.strictEqual(res.valid, true);
  });

  it('rejects an incorrect arithmetic answer from AI', () => {
    const q = {
      topic: 'Addition and subtraction',
      type: 'add',
      question: 'Calculate A + B',
      matrices: {
        A: [[1, 2], [3, 4]],
        B: [[0, 1], [-1, 2]]
      },
      options: [
        [['99', '99'], ['99', '99']], // wrong answer claimed as correct
        [['1', '3'], ['2', '6']],
        [['0', '2'], ['-3', '8']],
        [['2', '3'], ['2', '6']]
      ],
      correctIndex: 0,
      explanation: 'Step by step.'
    };
    const res = verifyQuestion(q);
    assert.strictEqual(res.valid, false);
    assert.match(res.reason, /Addition mismatch/);
  });

  it('rejects questions with out-of-syllabus keywords like eigenvalue', () => {
    const q = {
      topic: 'Determinant and invertibility',
      type: 'determinant',
      question: 'Find the eigenvalue of matrix A',
      matrices: { A: [[1, 2], [3, 4]] },
      options: ['1', '2', '3', '4'],
      correctIndex: 0,
      explanation: 'Eigenvalues'
    };
    const res = verifyQuestion(q);
    assert.strictEqual(res.valid, false);
    assert.match(res.reason, /forbidden out-of-syllabus/);
  });

  it('rejects questions with fewer than 4 distinct options', () => {
    const q = {
      topic: 'Matrix basics',
      type: 'concept',
      question: 'What is the dimension of A?',
      matrices: { A: [[1, 2, 3], [4, 5, 6]] },
      options: ['2x3', '2x3', '3x2', '6x1'], // duplicate
      correctIndex: 0,
      explanation: 'Rows x columns'
    };
    const res = verifyQuestion(q);
    assert.strictEqual(res.valid, false);
    assert.match(res.reason, /4 distinct choices/);
  });
});
