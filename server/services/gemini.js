import { GoogleGenAI } from '@google/genai';
import { verifyTurn, compareValues } from './mathVerify.js';
import { pickStaticFallback } from './staticFallback.js';

export const SUPPORTED_GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-4-argon'
];

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

/** Emergency switch: if true, a few hardcoded verified lessons are used when generation fails. */
export const USE_STATIC_FALLBACK = false;

/** Verification retries per turn (so at most 1 + 2 = 3 Gemini calls that produce a rejected turn). */
export const MAX_VERIFY_RETRIES = 2;

/** Growing delays before retrying a 503 (about 1s, then 3s). */
export const RETRY_DELAYS_MS = [1000, 3000];

/** Error with a machine-readable code and the HTTP status the API should return. */
export class ServiceError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.status = status;
  }
}

const SYSTEM_PROMPT = `You write one short lesson and one test question at a time for a first-year Computing Mathematics course, "CMATHS Topic 2: Matrices". Students read your lesson, then answer your question on the SAME topic.

### SYLLABUS: the lesson and question MUST stay inside this and nothing else
1. Matrix basics: dimension (m × n), entries a_jk (row j, column k), vector (m × 1), square matrix, identity matrix I, diagonal matrix, null (zero) matrix, leading diagonal.
2. Addition and subtraction: only for same dimensions (conformable / non-conformable), commutative and associative properties of addition.
3. Scalar multiplication, including expressions like 2D − 3C and 2I + C.
4. Matrix multiplication: conformability (columns of A = rows of B), the size of the product, row-times-column method, AB ≠ BA in general, associativity, AI = IA = A.
5. Transpose of a matrix.
6. Inverse of a matrix: definition (AB = BA = I), proving B is the inverse of A by multiplying.
7. Determinant and invertibility: det ≠ 0 means invertible (non-singular), det = 0 means singular (no inverse). 2×2 formula ad − bc, and 3×3 by cofactor expansion along the first row.
8. Inverse using A⁻¹ = (1/det A) · adj(A): 2×2 (swap a and d, negate b and c) and 3×3 (adjugate as the transpose of the cofactor matrix).
9. Systems of linear equations: write as AX = b, solve with X = A⁻¹b, for 2×2 and 3×3 systems.
10. Application problems solved with matrices.

### OUT OF SYLLABUS: never include
Vectors (dot product, collinearity, parallel vectors, magnitude, angle between vectors), row reduction or Gaussian elimination, Cramer's rule, eigenvalues or eigenvectors, rank, matrix powers or exponentials, LU or other decompositions, matrices larger than 3×3, complex numbers, calculus, or anything not listed above.

### DATA CONVENTIONS (the server recomputes every answer with exact fractions, so follow these exactly)
- "matrices" holds the data the question uses. Keys: "A", "B" (arrays of rows, entries are small integers or fraction strings like "1/8"), "b" (right-hand side of a system, a flat array), "k" and "k2" (scalars), "op" ("+" or "-").
- type "add" / "sub": answer is A + B / A − B. Needs A and B.
- type "scalar": answer is k·A, or k·A + k2·B (op "+") / k·A − k2·B (op "-") when B is given. To use the identity I, put the identity matrix in A or B (for "2I + C": A = identity, k = 2, B = C, k2 = 1, op "+"). The question text must show the expression, e.g. "Find 2A − 3B".
- type "multiply": answer is AB. Needs A and B.
- type "transpose": answer is the transpose of A.
- type "determinant": answer is det(A) as a number or fraction string, e.g. "-7" or "3/2".
- type "inverse": answer is A⁻¹ as a matrix (fraction strings allowed), or the text "A is singular, so it has no inverse" when det(A) = 0.
- type "solve_system": A is the coefficient matrix, "b" the right-hand side. Options are written like "x = 2, y = 3" or "x = 1, y = 2, z = 3" (fractions as "1/2"), variables in column order of A. The question text must say what x, y, z stand for.
- type "conformability": needs A and B. The question text must say either "multiply AB" or "add A and B". Every option is either "Not conformable" or "Conformable, result is r × c" (with the right sizes).
- types "properties" and "concept": text answers about definitions or properties (no recomputation). Use these only for topic 1 style definitions, or for property questions in topics 2 and 4.
- Do NOT use type "application" for anything computational. Price-finding problems use "solve_system" (topic 9 and 10); cost/quantity table problems use "multiply" (topic 10). The question text defines what each row and column means.
- Matrix answers (options) are arrays of rows. Fractions are written as "a/b" strings, never long decimals.

### LESSON RULES
- Plain friendly language. 2 to 4 short key points, about 80 words in total. Define each term the first time you use it.
- ONE worked example with small integers and clear steps. The example has its own "type" (same list and conventions as above), its own "matrices", "steps" (following the step rules below), and a "result" written in the same format as an answer option would be.
- The lesson must NOT contain the answer to the test question.

### QUESTION RULES
- Same topic as the lesson. The question MUST use different numbers from the lesson example (different matrices, and for application problems a different real-world context).
- Exactly 4 distinct options and exactly ONE correct answer. The 3 wrong options are plausible mistakes: forgetting to swap or negate in the adjugate, multiplying in the wrong order, adding instead of multiplying, sign errors in the determinant, forgetting to scale every entry.
- "correctIndex" is the index (0 to 3) of the correct option.
- Use small realistic whole-number prices and quantities in application problems.

### STEP-BY-STEP WORKING RULES (for both question.explanation and lesson.example.steps)
- In question.explanation, return an object:
  "explanation": {
    "summary": "<one short sentence saying what method is used>",
    "steps": ["<step 1>", "<step 2>", "<step 3>"],
    "conclusion": "<one short sentence with the final answer>"
  }
- ONE calculation or idea per step, each as its own array item.
- No markdown, bullet dashes, asterisks or numbering inside the strings. The UI adds the formatting.
- Keep each step under about 20 words.
- Even for conceptual questions with no calculation (e.g. conformability, properties, matrix basics), split the reasoning into short separate steps, with at least 2 steps.
- Step patterns by question type (apply to both question.explanation.steps and lesson.example.steps):
  - add / sub: one step per entry, e.g. "Row 1, Col 1: 1 + 5 = 6"
  - scalar: one step per entry, e.g. "Row 1, Col 1: 2 × 3 = 6"
  - multiply: first a step checking the sizes (e.g. "A is 2×3 and B is 3×2, so AB is possible and is 2×2"), then one step per entry, e.g. "Row 1 × Column 1: (3)(1) + (2)(−1) = 1"
  - transpose: one step per row, e.g. "Row 1 [2, 7] becomes Column 1"
  - determinant: one step stating the formula, one step substituting the numbers, one step simplifying. For 3×3, one step per cofactor term.
  - inverse (2×2): steps for the determinant, the adjugate (swap a and d, negate b and c), then multiplying by 1/det.
  - inverse (3×3): steps for the determinant, the cofactor matrix, the transpose to get the adjugate, then multiplying by 1/det.
  - check an inverse: one step per entry of AB, then a conclusion about whether AB = I.
  - solve_system: steps for writing AX = b, finding A⁻¹, then computing X = A⁻¹b, then reading off each variable.
  - application: steps for naming what each variable means, writing the matrix equation, solving, then stating each answer in words.
  - conformability / properties / concept: one step per reason (e.g. "Columns of A = 3", "Rows of B = 2", "3 ≠ 2, so AB cannot be done").

### OUTPUT: ONE JSON object only, no markdown, exactly this shape
{
  "topic": "<number>. <topic name>",
  "lesson": {
    "title": "...",
    "keyPoints": ["...", "..."],
    "example": { "type": "...", "description": "...", "matrices": {}, "steps": ["...", "..."], "result": "..." }
  },
  "question": {
    "type": "...",
    "text": "...",
    "matrices": {},
    "options": ["..", "..", "..", ".."],
    "correctIndex": 0,
    "explanation": {
      "summary": "<one short sentence saying what method is used>",
      "steps": ["<step 1>", "<step 2>", "<step 3>"],
      "conclusion": "<one short sentence with the final answer>"
    }
  }
}`;

const TOPIC_FOCUS = {
  1: { Easy: 'dimension, entries a_jk, square/identity/diagonal/null matrices, leading diagonal', Hard: 'the same ideas on a 3×3 matrix, or combining two facts (e.g. dimension and the leading diagonal)' },
  2: { Easy: 'adding or subtracting 2×2 or 2×3 matrices, or deciding if two matrices are conformable', Hard: 'adding or subtracting 3×3 matrices, or using commutative/associative properties' },
  3: { Easy: 'k·A for a 2×2 matrix', Hard: 'multi-step expressions such as 2D − 3C or 2I + C with 2×2 or 3×3 matrices' },
  4: { Easy: 'the size of a product, or multiplying 2×2 matrices (or a 2×2 by a 2×1)', Hard: 'multiplying 2×3 by 3×2 or 3×3 matrices, or AB ≠ BA / AI = A style reasoning' },
  5: { Easy: 'the transpose of a 2×3 or 3×2 matrix', Hard: 'the transpose of a 3×3 matrix' },
  6: { Easy: 'show whether B is the inverse of A by computing AB for 2×2 matrices (type "multiply")', Hard: 'the same idea with 3×3 matrices that have small integer entries' },
  7: { Easy: 'a 2×2 determinant (ad − bc) or whether a 2×2 matrix is singular', Hard: 'a 3×3 determinant by cofactor expansion along the first row' },
  8: { Easy: 'the inverse of a 2×2 matrix using (1/det) · adj', Hard: 'the inverse of a 3×3 matrix using the adjugate (use a matrix with determinant ±1 or ±2 to keep fractions small)' },
  9: { Easy: 'solving a 2×2 system AX = b with X = A⁻¹b', Hard: 'solving a 3×3 system AX = b with X = A⁻¹b' },
  10: { Easy: 'a simple 2×2 real-world setup solved with matrices', Hard: 'a 3×3 real-world setup, or a cost/quantity table product' }
};

function buildUserPrompt({ assignment, difficulty, avoidQuestions }) {
  const { topic } = assignment;
  const level = difficulty === 'Hard' ? 'Hard' : 'Easy';
  const focus = TOPIC_FOCUS[topic.number][level];

  const lines = [
    `Write the lesson and question for topic ${topic.label}.`,
    `Difficulty: ${level.toUpperCase()}. Focus: ${focus}.`,
    level === 'Easy'
      ? 'Easy rules: topics 7 to 9 stay at 2×2 level; use small integers (about -5 to 9).'
      : 'Hard rules: 3×3 and tougher multi-step questions are allowed; keep every entry a small integer.'
  ];

  if (assignment.lessonContext) {
    lines.push(
      `The lesson's worked example uses this real-world context: ${assignment.lessonContext}.`,
      `The test question uses a DIFFERENT context: ${assignment.questionContext}.`,
      'Do not use muffins or coffee. Use small realistic whole-number prices and quantities.'
    );
  }
  if (avoidQuestions.length > 0) {
    lines.push(`Do not repeat these earlier questions: ${avoidQuestions.map((q) => `"${q}"`).join('; ')}.`);
  }
  lines.push('Check all arithmetic carefully. Reply with the JSON object only.');
  return lines.join('\n');
}

/** Shuffles the 4 options and updates correctIndex (works on the question object). */
export function shuffleOptions(questionObj) {
  const originalCorrect = questionObj.options[questionObj.correctIndex];
  const items = questionObj.options.map((opt, idx) => ({ opt, isCorrect: idx === questionObj.correctIndex }));

  // Fisher-Yates shuffle
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  const newOptions = items.map((item) => item.opt);
  let newCorrectIndex = items.findIndex((item) => item.isCorrect);
  if (newCorrectIndex === -1) {
    newCorrectIndex = newOptions.findIndex((opt) => compareValues(opt, originalCorrect));
  }

  return {
    ...questionObj,
    options: newOptions,
    correctIndex: newCorrectIndex !== -1 ? newCorrectIndex : 0
  };
}

/** Work out the HTTP status behind an SDK error (429 quota, 503 overloaded, ...). */
export function getHttpStatus(err) {
  const direct = err?.status ?? err?.code ?? err?.error?.code;
  if (typeof direct === 'number') return direct;
  const message = String(err?.message || '');
  const embedded = message.match(/"code"\s*:\s*(\d{3})/);
  if (embedded) return Number(embedded[1]);
  if (/RESOURCE_EXHAUSTED|quota/i.test(message)) return 429;
  if (/UNAVAILABLE|overloaded|high demand/i.test(message)) return 503;
  return null;
}

/** The real Gemini call: JSON mode, returns the raw response text. */
async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
    throw new ServiceError('NOT_CONFIGURED', 'GEMINI_API_KEY is not configured in .env.', 500);
  }
  const model = (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      temperature: 0.6
    }
  });
  return response.text;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One Gemini call with the error policy:
 *  - 429 (quota): never retried.
 *  - 503: retried up to 2 times with a growing delay (about 1s then 3s).
 */
async function callWithRetry(callModel, prompt, { sleep, logger }) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await callModel(prompt);
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      const status = getHttpStatus(err);
      if (status === 429) {
        throw new ServiceError('RATE_LIMIT', 'The question service is busy, please try again soon.', 429);
      }
      if (status === 503) {
        if (attempt < RETRY_DELAYS_MS.length) {
          logger.warn(`[Gemini] 503, retrying in ${RETRY_DELAYS_MS[attempt]}ms (retry ${attempt + 1}/${RETRY_DELAYS_MS.length})`);
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        throw new ServiceError('UNAVAILABLE', 'The question service is temporarily unavailable, please try again.', 503);
      }
      throw new ServiceError('UPSTREAM_ERROR', `The question service failed: ${String(err?.message || err).slice(0, 200)}`, 502);
    }
  }
  throw new ServiceError('UNAVAILABLE', 'The question service is temporarily unavailable, please try again.', 503);
}

function parseJson(text) {
  const clean = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(clean);
}

/** Shape sent to the browser: canonical topic, lesson, shuffled question. */
function finalizeTurn(turn, assignment) {
  return {
    topic: assignment.topic.label,
    topicNumber: assignment.topic.number,
    lesson: turn.lesson,
    question: shuffleOptions(turn.question)
  };
}

/**
 * Generate ONE verified lesson + question for a turn.
 * Never returns anything that failed verification.
 *
 * @param {{ assignment: object, difficulty: 'Easy'|'Hard', avoidQuestions?: string[], isDuplicate?: Function }} params
 * @param {{ callModel?: Function, sleep?: Function, logger?: Console, useStaticFallback?: boolean }} [deps] injectable for tests
 */
export async function generateTurn(
  { assignment, difficulty = 'Easy', avoidQuestions = [], isDuplicate = null },
  { callModel = callGemini, sleep = defaultSleep, logger = console, useStaticFallback = USE_STATIC_FALLBACK } = {}
) {
  const prompt = buildUserPrompt({ assignment, difficulty, avoidQuestions });

  try {
    let lastReason = 'unknown';
    for (let attempt = 0; attempt <= MAX_VERIFY_RETRIES; attempt++) {
      const text = await callWithRetry(callModel, prompt, { sleep, logger });

      let turn;
      try {
        turn = parseJson(text);
      } catch (err) {
        lastReason = `Invalid JSON: ${err.message}`;
        logger.warn(`[Turn ${assignment.turn}] attempt ${attempt + 1} rejected: ${lastReason}`);
        continue;
      }

      const verdict = verifyTurn(turn, assignment.topic);
      if (!verdict.valid) {
        lastReason = verdict.reason;
        logger.warn(`[Turn ${assignment.turn}] attempt ${attempt + 1} rejected: ${lastReason}`);
        continue;
      }
      if (isDuplicate && isDuplicate(turn.question)) {
        lastReason = 'Duplicate of an earlier question in this game';
        logger.warn(`[Turn ${assignment.turn}] attempt ${attempt + 1} rejected: ${lastReason}`);
        continue;
      }

      return finalizeTurn(turn, assignment);
    }

    throw new ServiceError(
      'VERIFY_FAILED',
      'Could not prepare a checked lesson right now, please try again.',
      502
    );
  } catch (err) {
    if (useStaticFallback && !(err instanceof ServiceError && err.code === 'NOT_CONFIGURED')) {
      logger.warn(`[Turn ${assignment.turn}] using static fallback because: ${err.message}`);
      const fallback = pickStaticFallback(assignment.topic.number);
      return {
        topic: fallback.topic,
        topicNumber: parseInt(fallback.topic, 10),
        lesson: fallback.lesson,
        question: shuffleOptions(fallback.question)
      };
    }
    throw err;
  }
}
