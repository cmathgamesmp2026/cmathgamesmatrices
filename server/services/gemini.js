import { GoogleGenAI } from '@google/genai';
import { verifyQuestion, SYLLABUS_TOPICS, compareValues } from './mathVerify.js';

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

const SYSTEM_PROMPT = `You are a university mathematics professor creating exam-quality Computing Mathematics questions for a "Matrices" topic.
All questions MUST strictly adhere to the course syllabus.

### STRICT SYLLABUS (CMATHS Topic 2: Matrices):
1. Matrix basics: dimension (m x n), entries a_jk notation, identifying row and column, vector (m x 1), square matrix, identity matrix I, diagonal matrix, null (zero) matrix, leading diagonal.
2. Addition and subtraction: only for same dimensions, "conformable / non-conformable", commutative and associative properties of addition.
3. Scalar multiplication, including expressions like 2D - 3C and 2I + C.
4. Matrix multiplication: conformability rule (columns of A = rows of B), size of the product, row-times-column method, non-commutativity (AB != BA in general), associativity, AI = IA = A.
5. Transpose of a matrix.
6. Inverse of a matrix: definition (AB = BA = I), proving B is the inverse of A by multiplication.
7. Determinant and invertibility: det(A) != 0 means invertible (non-singular), det(A) = 0 means singular (no inverse). 2x2 formula ad - bc, and 3x3 by cofactor expansion along the first row.
8. Inverse using A⁻¹ = (1/det A) * adj(A): 2x2 (adj swaps a and d, negates b and c) and 3x3 (adjugate as transpose of cofactor matrix).
9. Systems of linear equations: write as AX = b, solve with X = A⁻¹b, for 2x2 and 3x3 systems.
10. Application problems solved with matrices (e.g. item prices from purchase totals like muffins & coffee, song-feature ratings like energy & acoustic, cost/quantity/inventory tables).

### STRICTLY OUT OF SYLLABUS (NEVER GENERATE):
Vectors (dot product, cross product, collinearity, parallel vectors, magnitude or angle between vectors), row reduction or Gaussian elimination, Gauss-Jordan, Cramer's rule, eigenvalues or eigenvectors, rank, matrix powers or exponentials, LU or Cholesky or QR decompositions, matrices larger than 3x3, complex numbers, calculus.

### FORMAT REQUIREMENTS:
- Output MUST be valid JSON only matching the schema below.
- Exact fractions (e.g. "1/8", "-3/5", "2/7") must be used for non-integers, NEVER long repeating decimals like 0.125 or 0.3333.
- If an option is a matrix, send it as a 2D JSON array of numbers or fraction strings (e.g. [["1/2", "-1/2"], ["0", "1"]]).
- Provide 4 distinct options. The correct answer MUST be mathematically accurate and match the question and matrices data.

JSON schema:
{
  "topic": "<One of the 10 syllabus topics>",
  "type": "add|sub|scalar|multiply|transpose|determinant|inverse|solve_system|conformability|properties|application|concept",
  "question": "<Clear, concise question statement>",
  "matrices": {
    "A": [[..],[..]],
    "B": [[..]],
    "b": [..]
  },
  "options": [
    "<Option A>",
    "<Option B>",
    "<Option C>",
    "<Option D>"
  ],
  "correctIndex": 0,
  "explanation": "<Step-by-step working showing exact calculations>"
}`;

/**
 * Shuffles the 4 options and updates correctIndex
 */
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

/**
 * Calls Gemini API to generate a matrix question adhering to syllabus and verified by mathVerify.js
 */
export async function generateQuestion({ difficulty = 'Easy', previousTopic = null, usedQuestions = [] } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY is not configured in .env. Please set your Gemini API key.');
  }

  const preferredModel = (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
  const ai = new GoogleGenAI({ apiKey });

  // Priority order: user-specified model first, followed by reliable fallbacks
  const modelsToTry = [
    preferredModel,
    ...SUPPORTED_GEMINI_MODELS.filter((m) => m !== preferredModel)
  ];

  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const currentModel = modelsToTry[(attempt - 1) % modelsToTry.length];
    try {
      const difficultyPrompt =
        difficulty === 'Easy'
          ? 'Difficulty: EASY. Focus on Topics 1 to 6 (Matrix basics, dimensions, entry notation, addition/subtraction, scalar multiplication, matrix multiplication, transpose) plus simple 2x2 determinants, 2x2 inverses, and simple 2x2 applications. Use small integers between -5 and 9.'
          : 'Difficulty: HARD. Include 3x3 determinants, 3x3 inverses using adjugate, 3x3 systems of linear equations (X = A⁻¹b), multi-step expressions like 2D - 3C, and tougher application problems. Keep entries as small integers.';

      let topicPrompt = '';
      if (previousTopic) {
        topicPrompt = `IMPORTANT: The previous topic was "${previousTopic}". To maintain topic rotation, do NOT choose "${previousTopic}". Pick a different syllabus topic from the 10 approved topics.`;
      } else {
        // Randomly recommend a topic to prevent clustering
        const randomTopic = SYLLABUS_TOPICS[Math.floor(Math.random() * SYLLABUS_TOPICS.length)];
        topicPrompt = `Recommended topic focus for this turn: "${randomTopic}".`;
      }

      let historyPrompt = '';
      if (usedQuestions.length > 0) {
        const recent = usedQuestions.slice(-5).map((q) => `"${q.slice(0, 50)}..."`).join(', ');
        historyPrompt = `Do not repeat or generate trivial variations of recent questions: [${recent}].`;
      }

      const userPrompt = `Generate a single Computing Mathematics question on Matrices.
${difficultyPrompt}
${topicPrompt}
${historyPrompt}

Ensure that all arithmetic and matrix values in "matrices" and "options" are 100% accurate.
Respond with pure JSON only matching the schema.`;

      const response = await ai.models.generateContent({
        model: currentModel,
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          temperature: 0.7
        }
      });

      const responseText = response.text?.trim();
      if (!responseText) {
        throw new Error('Empty response received from Gemini');
      }

      // Clean possible markdown code fences if present
      const cleanJson = responseText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      const questionData = JSON.parse(cleanJson);

      // Verify the question using our independent math verification engine
      const verification = verifyQuestion(questionData);
      if (!verification.valid) {
        console.warn(`[Gemini Attempt ${attempt}] Verification rejected question: ${verification.reason}`);
        lastError = new Error(`Verification rejected: ${verification.reason}`);
        continue; // Retry
      }

      // Shuffle options so correct answer is not fixed at correctIndex
      const finalizedQuestion = shuffleOptions(questionData);
      return finalizedQuestion;
    } catch (err) {
      console.warn(`[Gemini Attempt ${attempt}] Error: ${err.message}`);
      lastError = err;
    }
  }

  throw new Error(`Failed to generate a verified question after ${maxAttempts} attempts: ${lastError?.message}`);
}
