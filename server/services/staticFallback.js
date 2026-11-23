/**
 * EMERGENCY FALLBACK ONLY.
 *
 * A handful of verified lessons used if live generation fails AND
 * USE_STATIC_FALLBACK is switched on in gemini.js (default: off).
 * This is not a question bank; normal play never reads this file.
 */

export const STATIC_LESSONS = [
  {
    topic: '5. Transpose of a matrix',
    lesson: {
      title: 'Transpose: swap rows and columns',
      keyPoints: [
        'The transpose of A, written Aᵀ, turns each row of A into a column.',
        'If A has m rows and n columns (m × n), then Aᵀ is n × m.'
      ],
      example: {
        type: 'transpose',
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
      text: 'What is Aᵀ?',
      matrices: { A: [[7, 1, 3], [0, 2, 5]] },
      options: [
        [[7, 0], [1, 2], [3, 5]],
        [[7, 1, 3], [0, 2, 5]],
        [[0, 7], [2, 1], [5, 3]],
        [[7, 0, 1], [2, 3, 5]]
      ],
      correctIndex: 0,
      explanation:
        'Row 1 of A is [7, 1, 3] and becomes column 1. Row 2 is [0, 2, 5] and becomes column 2, so Aᵀ = [[7, 0], [1, 2], [3, 5]].'
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
        type: 'scalar',
        description: 'Find 3A.',
        matrices: { A: [[1, 2], [0, 4]], k: 3 },
        steps: ['Multiply each entry by 3: [3×1, 3×2] and [3×0, 3×4].'],
        result: [[3, 6], [0, 12]]
      }
    },
    question: {
      type: 'scalar',
      text: 'What is 2A?',
      matrices: { A: [[2, -1], [5, 0]], k: 2 },
      options: [
        [[4, -1], [10, 0]],
        [[4, -2], [7, 2]],
        [[4, -2], [10, 0]],
        [[0, -3], [3, -2]]
      ],
      correctIndex: 2,
      explanation: 'Multiply every entry of A by 2: [[2×2, 2×(−1)], [2×5, 2×0]] = [[4, −2], [10, 0]].'
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
        type: 'determinant',
        description: 'Find det(A).',
        matrices: { A: [[3, 1], [2, 4]] },
        steps: ['a = 3, b = 1, c = 2, d = 4.', 'det(A) = (3)(4) − (1)(2) = 12 − 2 = 10.'],
        result: '10'
      }
    },
    question: {
      type: 'determinant',
      text: 'What is det(A)?',
      matrices: { A: [[5, 2], [3, 1]] },
      options: ['11', '1', '-1', '5'],
      correctIndex: 2,
      explanation: 'det(A) = ad − bc = (5)(1) − (2)(3) = 5 − 6 = −1.'
    }
  }
];

/** Pick the fallback for the assigned topic if there is one, otherwise the first. */
export function pickStaticFallback(topicNumber) {
  const match = STATIC_LESSONS.find((item) => parseInt(item.topic, 10) === topicNumber);
  return JSON.parse(JSON.stringify(match || STATIC_LESSONS[0]));
}
