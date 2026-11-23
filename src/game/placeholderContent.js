/**
 * STAGE 1 SCAFFOLDING ONLY.
 *
 * Three fixed lesson + question pairs so the turn flow
 * (Learn -> Test -> Roll) can be tried before the Gemini endpoint exists.
 * Stage 2 replaces this with live Gemini content; this is not a question bank.
 *
 * Shape matches the Gemini output contract:
 *   { topic, lesson: {title, keyPoints, example}, question: {...} }
 */

const PLACEHOLDERS = [
  {
    topic: '5. Transpose of a matrix',
    lesson: {
      title: 'Transpose: swap rows and columns',
      keyPoints: [
        'The transpose of A, written Aᵀ, turns each row of A into a column.',
        'If A has m rows and n columns (m × n), then Aᵀ is n × m.'
      ],
      example: {
        description: 'Find the transpose of A.',
        matrices: { A: [[1, 2, 3], [4, 5, 6]] },
        steps: [
          'Row 1 of A is [1, 2, 3], so it becomes column 1.',
          'Row 2 of A is [4, 5, 6], so it becomes column 2.'
        ],
        result: [[1, 4], [2, 5], [3, 6]]
      }
    },
    question: {
      type: 'transpose',
      text: 'What is Bᵀ?',
      matrices: { B: [[7, 1, 3], [0, 2, 5]] },
      options: [
        [[7, 0], [1, 2], [3, 5]],
        [[7, 1, 3], [0, 2, 5]],
        [[0, 7], [2, 1], [5, 3]],
        [[7, 0, 1], [2, 3, 5]]
      ],
      correctIndex: 0,
      explanation:
        'Row 1 of B is [7, 1, 3] and becomes column 1. Row 2 is [0, 2, 5] and becomes column 2, so Bᵀ = [[7, 0], [1, 2], [3, 5]].'
    }
  },
  {
    topic: '3. Scalar multiplication',
    lesson: {
      title: 'Scalar multiplication: scale every entry',
      keyPoints: [
        'A scalar is just an ordinary number, such as 3.',
        'To find kA, multiply every entry of A by k.'
      ],
      example: {
        description: 'Find 3A.',
        matrices: { A: [[1, 2], [0, 4]] },
        steps: ['Multiply each entry by 3: [3×1, 3×2] and [3×0, 3×4].'],
        result: [[3, 6], [0, 12]]
      }
    },
    question: {
      type: 'scalar',
      text: 'What is 2C?',
      matrices: { C: [[2, -1], [5, 0]] },
      options: [
        [[4, -1], [10, 0]],
        [[4, -2], [7, 2]],
        [[4, -2], [10, 0]],
        [[0, -3], [3, -2]]
      ],
      correctIndex: 2,
      explanation: 'Multiply every entry of C by 2: [[2×2, 2×(−1)], [2×5, 2×0]] = [[4, −2], [10, 0]].'
    }
  },
  {
    topic: '7. Determinant and invertibility',
    lesson: {
      title: 'The 2×2 determinant',
      keyPoints: [
        'For A = [[a, b], [c, d]], the determinant is det(A) = ad − bc.',
        'If det(A) ≠ 0 the matrix has an inverse; if det(A) = 0 it does not (it is singular).'
      ],
      example: {
        description: 'Find det(A).',
        matrices: { A: [[3, 1], [2, 4]] },
        steps: ['a = 3, b = 1, c = 2, d = 4.', 'det(A) = (3)(4) − (1)(2) = 12 − 2 = 10.'],
        result: '10'
      }
    },
    question: {
      type: 'determinant',
      text: 'What is det(B)?',
      matrices: { B: [[5, 2], [3, 1]] },
      options: ['11', '1', '-1', '5'],
      correctIndex: 2,
      explanation: 'det(B) = ad − bc = (5)(1) − (2)(3) = 5 − 6 = −1.'
    }
  }
];

let cursor = 0;

/** Restart the placeholder rotation (called at the start of each game). */
export function resetPlaceholderContent() {
  cursor = 0;
}

/** Return the next placeholder lesson + question (deep copy, rotating). */
export function nextPlaceholderContent() {
  const item = PLACEHOLDERS[cursor % PLACEHOLDERS.length];
  cursor += 1;
  return JSON.parse(JSON.stringify(item));
}
