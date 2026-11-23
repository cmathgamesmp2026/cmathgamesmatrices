import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  splitTextToSteps,
  normalizeExplanation,
  renderWorkingHTML
} from '../src/ui/matrixRenderer.js';
import { verifyTurn } from '../server/services/mathVerify.js';
import { TOPICS } from '../server/services/gameSession.js';

describe('Step-by-step Working Display & Shared Renderer', () => {
  it('renders the multiplication example as numbered separate lines with summary and bold conclusion', () => {
    const explanation = {
      summary: 'Compute AB using row-by-column multiplication.',
      steps: [
        'Row 1 × Column 1: (3)(1) + (2)(−1) = 3 − 2 = 1',
        'Row 1 × Column 2: (3)(−2) + (2)(3) = −6 + 6 = 0',
        'Row 2 × Column 1: (1)(1) + (1)(−1) = 1 − 1 = 0',
        'Row 2 × Column 2: (1)(−2) + (1)(3) = −2 + 3 = 1'
      ],
      conclusion: 'The product is the identity matrix I, so B is the inverse of A.'
    };

    const html = renderWorkingHTML(explanation);
    assert.ok(html.includes('Compute AB using row-by-column multiplication.'));
    assert.ok(html.includes('<span class="working-step-num">1.</span>'));
    assert.ok(html.includes('<span class="working-step-num">2.</span>'));
    assert.ok(html.includes('<span class="working-step-num">3.</span>'));
    assert.ok(html.includes('<span class="working-step-num">4.</span>'));
    assert.ok(html.includes('Row 1 × Column 1: (3)(1) + (2)(−1) = 3 − 2 = 1'));
    assert.ok(html.includes('The product is the identity matrix I, so B is the inverse of A.'));
    assert.strictEqual((html.match(/class="working-step-item"/g) || []).length, 4);
  });

  it('renders every question type (multiply, determinant, inverse, solve_system, application, transpose, concept, add, sub, scalar, conformability, properties) line by line', () => {
    const samples = [
      {
        type: 'multiply',
        explanation: {
          summary: 'Check sizes and multiply rows of A by columns of B.',
          steps: [
            'A is 2×2 and B is 2×2, so AB is 2×2',
            'Row 1 × Column 1: (1)(2) + (3)(0) = 2',
            'Row 1 × Column 2: (1)(1) + (3)(4) = 13'
          ],
          conclusion: 'AB = [[2, 13], [4, 9]]'
        }
      },
      {
        type: 'determinant',
        explanation: {
          summary: 'Use the 2×2 determinant formula det(A) = ad − bc.',
          steps: [
            'Formula: det(A) = ad − bc',
            'Substitute a = 5, b = 2, c = 3, d = 1: (5)(1) − (2)(3)',
            'Simplify: 5 − 6 = −1'
          ],
          conclusion: 'Therefore, det(A) = −1.'
        }
      },
      {
        type: 'inverse',
        explanation: {
          summary: 'Use A⁻¹ = (1/det A) · adj(A).',
          steps: [
            'Find determinant: det(A) = (4)(6) − (7)(2) = 24 − 14 = 10',
            'Form adj(A) by swapping 4 and 6, negating 7 and 2: [[6, -7], [-2, 4]]',
            'Multiply adj(A) by 1/10'
          ],
          conclusion: [['3/5', '-7/10'], ['-1/5', '2/5']]
        }
      },
      {
        type: 'solve_system',
        explanation: {
          summary: 'Write the linear system as AX = b and solve X = A⁻¹b.',
          steps: [
            'Coefficient matrix A = [[2, 1], [1, 1]] and constant vector b = [5, 3]',
            'det(A) = 2 − 1 = 1, so A⁻¹ = [[1, -1], [-1, 2]]',
            'Compute X = A⁻¹b = [[1(5) - 1(3)], [-1(5) + 2(3)]] = [[2], [1]]',
            'Read off variables: x = 2 and y = 1'
          ],
          conclusion: 'The solution is x = 2, y = 1.'
        }
      },
      {
        type: 'application',
        explanation: {
          summary: 'Model the ticket purchases as a matrix equation AX = b.',
          steps: [
            'Let x be the adult ticket price and y be the child ticket price',
            'Write the matrix equation [[3, 2], [1, 4]] [x, y]ᵀ = [55, 45]ᵀ',
            'Multiply A⁻¹ by b to get X = [13, 8]ᵀ',
            'State in words: an adult ticket costs $13 and a child ticket costs $8'
          ],
          conclusion: 'Adult ticket = $13, child ticket = $8.'
        }
      },
      {
        type: 'transpose',
        explanation: {
          summary: 'Swap rows and columns to form Aᵀ.',
          steps: [
            'Row 1 [7, 1, 3] becomes Column 1',
            'Row 2 [0, 2, 5] becomes Column 2'
          ],
          conclusion: 'Aᵀ = [[7, 0], [1, 2], [3, 5]]'
        }
      },
      {
        type: 'concept',
        explanation: {
          summary: 'Check the definition of a square identity matrix.',
          steps: [
            'An identity matrix I must be a square matrix (n × n)',
            'All entries on the leading diagonal are 1 and all other entries are 0'
          ],
          conclusion: 'Matrix I₂ = [[1, 0], [0, 1]] is the 2×2 identity matrix.'
        }
      },
      {
        type: 'add',
        explanation: {
          summary: 'Add corresponding entries of A and B.',
          steps: ['Row 1, Col 1: 1 + 5 = 6', 'Row 1, Col 2: 2 + 3 = 5'],
          conclusion: '[[6, 5]]'
        }
      },
      {
        type: 'sub',
        explanation: {
          summary: 'Subtract corresponding entries of B from A.',
          steps: ['Row 1, Col 1: 5 - 1 = 4', 'Row 1, Col 2: 3 - 2 = 1'],
          conclusion: '[[4, 1]]'
        }
      },
      {
        type: 'scalar',
        explanation: {
          summary: 'Multiply each entry by the scalar k = 2.',
          steps: ['2 × 3 = 6', '2 × (-1) = -2'],
          conclusion: '[[6, -2]]'
        }
      },
      {
        type: 'conformability',
        explanation: {
          summary: 'Compare columns of A with rows of B.',
          steps: ['Columns of A = 3', 'Rows of B = 2', '3 ≠ 2, so AB cannot be done'],
          conclusion: 'Not conformable for multiplication.'
        }
      },
      {
        type: 'properties',
        explanation: {
          summary: 'Recall the commutativity rule for matrix multiplication.',
          steps: ['In general, AB ≠ BA for matrices', 'Order of multiplication changes the row-by-column dot products'],
          conclusion: 'Matrix multiplication is not commutative.'
        }
      }
    ];

    for (const s of samples) {
      const html = renderWorkingHTML(s.explanation);
      const count = (html.match(/class="working-step-item"/g) || []).length;
      assert.ok(count >= 2, `Expected at least 2 rendered step elements for type ${s.type}, got ${count}`);
      assert.ok(html.includes('working-summary'), `Missing summary for ${s.type}`);
      assert.ok(html.includes('working-conclusion'), `Missing conclusion for ${s.type}`);
    }
  });

  it('renders matrices inside steps or conclusion as bracketed grids', () => {
    const html = renderWorkingHTML({
      summary: 'Transpose A.',
      steps: ['Row 1 becomes Col 1', 'Resulting matrix is [[1, 4], [2, 5]]'],
      conclusion: [[1, 4], [2, 5]]
    });
    assert.ok(html.includes('matrix-bracket-box'));
  });

  it('splits a single paragraph string with dashes, bullets, newlines or periods into separate steps and strips prefixes', () => {
    // Joined by " - " without breaking arithmetic minus "3 - 2 = 1"
    const dashJoined =
      '- 1. Row 1 × Column 1: (3)(1) + (2)(-1) = 3 - 2 = 1 - 2. Row 1 × Column 2: (3)(-2) + (2)(3) = 0 - 3. Therefore AB = I';
    const steps1 = splitTextToSteps(dashJoined);
    assert.deepStrictEqual(steps1, [
      'Row 1 × Column 1: (3)(1) + (2)(-1) = 3 - 2 = 1',
      'Row 1 × Column 2: (3)(-2) + (2)(3) = 0',
      'Therefore AB = I'
    ]);

    // Joined by bullets " • "
    const bulletJoined = '• Columns of A = 3 • Rows of B = 2 • 3 ≠ 2, so AB cannot be done';
    assert.deepStrictEqual(splitTextToSteps(bulletJoined), [
      'Columns of A = 3',
      'Rows of B = 2',
      '3 ≠ 2, so AB cannot be done'
    ]);

    // Sentence-final periods fallback when no other separators exist
    const periodJoined = 'Formula is det(A) = ad - bc. Substitute values: (5)(1) - (2)(3) = 5 - 6. The determinant is -1.';
    assert.deepStrictEqual(splitTextToSteps(periodJoined), [
      'Formula is det(A) = ad - bc',
      'Substitute values: (5)(1) - (2)(3) = 5 - 6',
      'The determinant is -1.'
    ]);
  });

  it('applies the string fallback instead of rejecting when explanation.steps is missing or empty', () => {
    const turn = {
      topic: '7. Determinant and invertibility',
      lesson: {
        title: 'The 2×2 determinant',
        keyPoints: [
          'For A = [[a, b], [c, d]], the determinant is det(A) = ad − bc.',
          'If det(A) ≠ 0 the matrix has an inverse; if det(A) = 0 it is singular.'
        ],
        example: {
          type: 'determinant',
          description: 'Find det(A).',
          matrices: { A: [[3, 1], [2, 4]] },
          steps: ['a = 3, b = 1, c = 2, d = 4 - det(A) = (3)(4) - (1)(2) = 10'],
          result: '10'
        }
      },
      question: {
        type: 'determinant',
        text: 'What is det(A)?',
        matrices: { A: [[5, 2], [3, 1]] },
        options: ['11', '1', '-1', '5'],
        correctIndex: 2,
        explanation: {
          summary: 'Use det(A) = ad - bc - Substitute (5)(1) - (2)(3) = -1',
          steps: [],
          conclusion: ''
        }
      }
    };

    const res = verifyTurn(turn, TOPICS[6]);
    assert.strictEqual(res.valid, true, res.reason);
    assert.ok(Array.isArray(turn.question.explanation.steps));
    assert.strictEqual(turn.question.explanation.steps.length, 2);
    assert.strictEqual(turn.lesson.example.steps.length, 2);
  });
});
