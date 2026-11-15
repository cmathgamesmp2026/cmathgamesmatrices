import { describe, it } from 'node:test';
import assert from 'node:assert';
import { shuffleOptions } from '../server/services/gemini.js';

describe('Gemini Option Shuffler', () => {
  it('preserves the correct answer reference while shuffling', () => {
    const question = {
      topic: 'Matrix basics',
      type: 'concept',
      question: 'What is the leading diagonal of a 2x2 matrix?',
      options: ['a11 and a22', 'a12 and a21', 'a11 and a12', 'a21 and a22'],
      correctIndex: 0,
      explanation: 'The leading diagonal consists of elements where row index equals column index.'
    };

    const originalAnswer = question.options[question.correctIndex];

    for (let i = 0; i < 20; i++) {
      const shuffled = shuffleOptions(question);
      assert.strictEqual(shuffled.options.length, 4);
      assert.strictEqual(shuffled.options[shuffled.correctIndex], originalAnswer);
    }
  });

  it('correctly handles matrix array options during shuffling', () => {
    const question = {
      topic: 'Transpose of a matrix',
      type: 'transpose',
      question: 'Find the transpose of matrix A',
      options: [
        [['1', '3'], ['2', '4']],
        [['1', '2'], ['3', '4']],
        [['4', '3'], ['2', '1']],
        [['-1', '-3'], ['-2', '-4']]
      ],
      correctIndex: 0,
      explanation: 'Rows become columns.'
    };

    const originalAnswer = question.options[0];
    const shuffled = shuffleOptions(question);
    assert.strictEqual(shuffled.options.length, 4);
    assert.deepStrictEqual(shuffled.options[shuffled.correctIndex], originalAnswer);
  });
});
