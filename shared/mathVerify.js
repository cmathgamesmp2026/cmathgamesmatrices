/**
 * Accurate Math Verification Service
 * Independently recomputes answers using exact fraction arithmetic
 * and validates question adherence to the syllabus.
 */

// Helper to compute greatest common divisor (GCD)
function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/**
 * Exact Fraction class to avoid floating-point inaccuracies
 */
export class Fraction {
  constructor(num, den = 1) {
    if (den === 0) {
      throw new Error('Denominator cannot be zero');
    }
    const n = Math.round(Number(num));
    const d = Math.round(Number(den));
    const sign = (n * d < 0) ? -1 : 1;
    const g = gcd(Math.abs(n), Math.abs(d)) || 1;
    this.n = sign * (Math.abs(n) / g);
    this.d = Math.abs(d) / g;
  }

  add(other) {
    const o = Fraction.from(other);
    return new Fraction(this.n * o.d + o.n * this.d, this.d * o.d);
  }

  sub(other) {
    const o = Fraction.from(other);
    return new Fraction(this.n * o.d - o.n * this.d, this.d * o.d);
  }

  mul(other) {
    const o = Fraction.from(other);
    return new Fraction(this.n * o.n, this.d * o.d);
  }

  div(other) {
    const o = Fraction.from(other);
    if (o.n === 0) throw new Error('Division by zero fraction');
    return new Fraction(this.n * o.d, this.d * o.n);
  }

  equals(other) {
    try {
      const o = Fraction.from(other);
      return this.n === o.n && this.d === o.d;
    } catch {
      return false;
    }
  }

  toString() {
    if (this.d === 1) return `${this.n}`;
    return `${this.n}/${this.d}`;
  }

  toNumber() {
    return this.n / this.d;
  }

  static from(val) {
    if (val instanceof Fraction) return val;
    if (typeof val === 'number') {
      if (Number.isInteger(val)) return new Fraction(val, 1);
      // approximate decimal to fraction
      const s = val.toString();
      if (s.includes('.')) {
        const dec = s.split('.')[1].length;
        const den = Math.pow(10, Math.min(dec, 6));
        const num = Math.round(val * den);
        return new Fraction(num, den);
      }
      return new Fraction(Math.round(val), 1);
    }
    if (typeof val === 'string') {
      const trimmed = val.trim().replace(/[\u2212\u2013]/g, "-");
      if (trimmed.includes('/')) {
        const parts = trimmed.split('/');
        const n = parseInt(parts[0].trim(), 10);
        const d = parseInt(parts[1].trim(), 10);
        if (!isNaN(n) && !isNaN(d)) return new Fraction(n, d);
      }
      const num = parseFloat(trimmed);
      if (!isNaN(num)) return Fraction.from(num);
    }
    throw new Error(`Cannot convert to Fraction: ${val}`);
  }
}

/**
 * Matrix class with exact Fraction arithmetic
 */
export class Matrix {
  constructor(data) {
    if (!Array.isArray(data) || data.length === 0 || !Array.isArray(data[0])) {
      throw new Error('Matrix data must be a non-empty 2D array');
    }
    this.rows = data.length;
    this.cols = data[0].length;
    this.data = data.map((row) => {
      if (!Array.isArray(row) || row.length !== this.cols) {
        throw new Error('Inconsistent matrix row lengths');
      }
      return row.map((cell) => Fraction.from(cell));
    });
  }

  get(r, c) {
    return this.data[r][c];
  }

  set(r, c, val) {
    this.data[r][c] = Fraction.from(val);
  }

  add(other) {
    const o = Matrix.from(other);
    if (this.rows !== o.rows || this.cols !== o.cols) {
      throw new Error(`Non-conformable for addition: (${this.rows}x${this.cols}) vs (${o.rows}x${o.cols})`);
    }
    const result = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        row.push(this.data[r][c].add(o.data[r][c]));
      }
      result.push(row);
    }
    return new Matrix(result);
  }

  sub(other) {
    const o = Matrix.from(other);
    if (this.rows !== o.rows || this.cols !== o.cols) {
      throw new Error(`Non-conformable for subtraction: (${this.rows}x${this.cols}) vs (${o.rows}x${o.cols})`);
    }
    const result = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        row.push(this.data[r][c].sub(o.data[r][c]));
      }
      result.push(row);
    }
    return new Matrix(result);
  }

  scalarMul(k) {
    const factor = Fraction.from(k);
    const result = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        row.push(this.data[r][c].mul(factor));
      }
      result.push(row);
    }
    return new Matrix(result);
  }

  multiply(other) {
    const o = Matrix.from(other);
    if (this.cols !== o.rows) {
      throw new Error(`Non-conformable for multiplication: (${this.rows}x${this.cols}) vs (${o.rows}x${o.cols})`);
    }
    const result = [];
    for (let i = 0; i < this.rows; i++) {
      const row = [];
      for (let j = 0; j < o.cols; j++) {
        let sum = new Fraction(0);
        for (let k = 0; k < this.cols; k++) {
          sum = sum.add(this.data[i][k].mul(o.data[k][j]));
        }
        row.push(sum);
      }
      result.push(row);
    }
    return new Matrix(result);
  }

  transpose() {
    const result = [];
    for (let c = 0; c < this.cols; c++) {
      const row = [];
      for (let r = 0; r < this.rows; r++) {
        row.push(this.data[r][c]);
      }
      result.push(row);
    }
    return new Matrix(result);
  }

  determinant() {
    if (this.rows !== this.cols) {
      throw new Error('Determinant requires a square matrix');
    }
    if (this.rows === 1) {
      return this.data[0][0];
    }
    if (this.rows === 2) {
      // ad - bc
      const a = this.data[0][0];
      const b = this.data[0][1];
      const c = this.data[1][0];
      const d = this.data[1][1];
      return a.mul(d).sub(b.mul(c));
    }
    if (this.rows === 3) {
      // Cofactor expansion along first row
      const a = this.data[0][0];
      const b = this.data[0][1];
      const c = this.data[0][2];

      const minor00 = this.minor(0, 0).determinant();
      const minor01 = this.minor(0, 1).determinant();
      const minor02 = this.minor(0, 2).determinant();

      const term1 = a.mul(minor00);
      const term2 = b.mul(minor01);
      const term3 = c.mul(minor02);

      return term1.sub(term2).add(term3);
    }
    throw new Error('Determinants larger than 3x3 are out of syllabus');
  }

  minor(cutRow, cutCol) {
    const sub = [];
    for (let r = 0; r < this.rows; r++) {
      if (r === cutRow) continue;
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        if (c === cutCol) continue;
        row.push(this.data[r][c]);
      }
      sub.push(row);
    }
    return new Matrix(sub);
  }

  cofactor(r, c) {
    const minorDet = this.minor(r, c).determinant();
    const sign = (r + c) % 2 === 0 ? 1 : -1;
    return minorDet.mul(new Fraction(sign));
  }

  adjugate() {
    if (this.rows !== this.cols) {
      throw new Error('Adjugate requires a square matrix');
    }
    if (this.rows === 2) {
      // For [[a, b], [c, d]], adj = [[d, -b], [-c, a]]
      return new Matrix([
        [this.data[1][1], this.data[0][1].mul(new Fraction(-1))],
        [this.data[1][0].mul(new Fraction(-1)), this.data[0][0]]
      ]);
    }
    if (this.rows === 3) {
      // Transpose of cofactor matrix
      const adj = [];
      for (let r = 0; r < 3; r++) {
        const row = [];
        for (let c = 0; c < 3; c++) {
          // adj[r][c] = cofactor[c][r]
          row.push(this.cofactor(c, r));
        }
        adj.push(row);
      }
      return new Matrix(adj);
    }
    throw new Error('Adjugate only supported for 2x2 and 3x3');
  }

  inverse() {
    const det = this.determinant();
    if (det.n === 0) {
      return null; // Singular / no inverse
    }
    const adj = this.adjugate();
    const invDet = new Fraction(1).div(det);
    return adj.scalarMul(invDet);
  }

  toDisplayArray() {
    return this.data.map((row) => row.map((cell) => cell.toString()));
  }

  equals(other) {
    try {
      const o = Matrix.from(other);
      if (this.rows !== o.rows || this.cols !== o.cols) return false;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (!this.data[r][c].equals(o.data[r][c])) return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  static identity(n) {
    const rows = [];
    for (let r = 0; r < n; r++) {
      const row = [];
      for (let c = 0; c < n; c++) {
        row.push(r === c ? 1 : 0);
      }
      rows.push(row);
    }
    return new Matrix(rows);
  }

  static from(data) {
    if (data instanceof Matrix) return data;
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return Matrix.from(parsed);
      } catch {
        // try to parse bracket matrix e.g. [[1, 2], [3, 4]]
        const match = data.match(/\[\s*\[.*?\]\s*\]/s);
        if (match) {
          const parsed = JSON.parse(match[0].replace(/'/g, '"'));
          return new Matrix(parsed);
        }
      }
    }
    if (Array.isArray(data)) {
      // 1D array converted to column vector or row vector
      if (!Array.isArray(data[0])) {
        // treat as column vector
        return new Matrix(data.map((item) => [item]));
      }
      return new Matrix(data);
    }
    throw new Error('Cannot construct Matrix from provided input');
  }
}

/**
 * Syllabus Topics validation
 */
export const SYLLABUS_TOPICS = [
  'Matrix basics',
  'Addition and subtraction',
  'Scalar multiplication',
  'Matrix multiplication',
  'Transpose of a matrix',
  'Inverse of a matrix',
  'Determinant and invertibility',
  'Inverse using formula',
  'Systems of linear equations',
  'Application problems'
];

export const FORBIDDEN_PATTERNS = [
  /\beigen\w*/i,
  /\bdot product\b/i,
  /\bcross product\b/i,
  /\bgauss\w*/i,
  /\bcramer/i,
  /\brank\b/i,
  /\b(lu|qr) (decomposition|factori[sz]ation)\b/i,
  /\bcholesky\b/i,
  /\bdecomposition\b/i,
  /\bvector space\b/i,
  /\bcollinear\w*/i,
  /\bparallel vectors?\b/i,
  /\bmagnitude of (a )?vector\b/i,
  /\bangle between\b/i,
  /\brow[- ]reduc\w*/i,
  /\bmatrix (power|exponential)\w*/i,
  /\bcomplex numbers?\b/i,
  /\b(derivative|integral|calculus)\b/i
];

// Kept for compatibility with older imports.
export const FORBIDDEN_KEYWORDS = FORBIDDEN_PATTERNS.map((p) => p.source);

/**
 * Check if the text contains strictly forbidden out-of-syllabus terms
 * (word-boundary matching, so "ranking" or "frank" are not flagged).
 */
export function isOutOfSyllabus(text) {
  if (!text || typeof text !== 'string') return false;
  return FORBIDDEN_PATTERNS.some((re) => re.test(text));
}

/**
 * Matches a syllabus topic against the allowed syllabus
 */
export function validateTopic(topic) {
  if (!topic || typeof topic !== 'string') return false;
  const lower = topic.toLowerCase().trim();
  return SYLLABUS_TOPICS.some(
    (t) =>
      lower.includes(t.toLowerCase()) ||
      t.toLowerCase().includes(lower) ||
      (lower.includes('inverse') && t.includes('Inverse')) ||
      (lower.includes('determinant') && t.includes('Determinant')) ||
      (lower.includes('system') && t.includes('Systems')) ||
      (lower.includes('scalar') && t.includes('Scalar')) ||
      (lower.includes('multiply') && t.includes('Matrix multiplication')) ||
      (lower.includes('addition') && t.includes('Addition and subtraction')) ||
      (lower.includes('transpose') && t.includes('Transpose')) ||
      (lower.includes('application') && t.includes('Application')) ||
      (lower.includes('basic') && t.includes('Matrix basics'))
  );
}

/**
 * Helper to parse an option into Matrix, Fraction, or clean string
 */
export function parseOptionValue(option) {
  if (option == null) return null;

  // If already array
  if (Array.isArray(option)) {
    try {
      return Matrix.from(option);
    } catch {
      return option;
    }
  }

  if (typeof option === 'number') {
    return Fraction.from(option);
  }

  if (typeof option === 'string') {
    const trimmed = option.trim().replace(/[\u2212\u2013]/g, "-");

    // Check for JSON-encoded matrix
    if (trimmed.startsWith('[[') || trimmed.startsWith('[ [')) {
      try {
        const parsed = JSON.parse(trimmed.replace(/'/g, '"'));
        return Matrix.from(parsed);
      } catch {
        // continue
      }
    }

    // Check for vector format e.g. [1, 2] or [1/2, -3]
    if (trimmed.startsWith('[') && trimmed.endsWith(']') && !trimmed.slice(1, -1).includes('[')) {
      try {
        const items = trimmed
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim());
        const fractions = items.map((s) => Fraction.from(s));
        return fractions;
      } catch {
        // continue
      }
    }

    // Check for "x = ..., y = ..." linear system format
    const eqMatch = trimmed.match(/x\s*=\s*(-?\d+(?:\/\d+)?|\d+\.\d+),\s*y\s*=\s*(-?\d+(?:\/\d+)?|\d+\.\d+)(?:,\s*z\s*=\s*(-?\d+(?:\/\d+)?|\d+\.\d+))?/i);
    if (eqMatch) {
      const vals = [Fraction.from(eqMatch[1]), Fraction.from(eqMatch[2])];
      if (eqMatch[3]) vals.push(Fraction.from(eqMatch[3]));
      return vals;
    }

    // Check for scalar fraction or number
    if (/^-?\d+(?:\/\d+)?$/.test(trimmed)) {
      try {
        return Fraction.from(trimmed);
      } catch {
        // continue
      }
    }

    // Otherwise normalized text
    return trimmed.toLowerCase().replace(/\s+/g, ' ');
  }

  return option;
}

/**
 * Compare two values: either Matrix, Fraction, Array of Fractions, or String
 */
export function compareValues(valA, valB) {
  if (valA === valB) return true;
  if (valA == null || valB == null) return false;

  // Matrix comparison
  if (valA instanceof Matrix || valB instanceof Matrix) {
    try {
      const mA = Matrix.from(valA);
      const mB = Matrix.from(valB);
      return mA.equals(mB);
    } catch {
      return false;
    }
  }

  // Fraction comparison
  if (valA instanceof Fraction || valB instanceof Fraction) {
    try {
      const fA = Fraction.from(valA);
      const fB = Fraction.from(valB);
      return fA.equals(fB);
    } catch {
      return false;
    }
  }

  // Array of fractions (vectors)
  if (Array.isArray(valA) && Array.isArray(valB)) {
    if (valA.length !== valB.length) return false;
    for (let i = 0; i < valA.length; i++) {
      if (!compareValues(valA[i], valB[i])) return false;
    }
    return true;
  }

  // String comparison
  const strA = String(valA).toLowerCase().replace(/[^a-z0-9]/g, '');
  const strB = String(valB).toLowerCase().replace(/[^a-z0-9]/g, '');
  return strA === strB;
}

/**
 * Main verification function for a single question (old shape: { topic, type, question,
 * matrices, options, correctIndex }). Recomputes the answer with exact fractions.
 *
 * @returns {{ valid: boolean, reason?: string, computedAnswer?: any }}
 */

export const ALLOWED_TYPES = [
  'add', 'sub', 'scalar', 'multiply', 'transpose', 'determinant', 'inverse',
  'solve_system', 'conformability', 'properties', 'application', 'concept'
];

/** Matrix data every computational type must supply, so nothing is silently skipped. */
const REQUIRED_MATRICES = {
  add: ['A', 'B'],
  sub: ['A', 'B'],
  scalar: ['A', 'k'],
  multiply: ['A', 'B'],
  transpose: ['A'],
  determinant: ['A'],
  inverse: ['A'],
  solve_system: ['A', 'b'],
  conformability: ['A', 'B']
};

const TYPE_LABELS = {
  add: 'Addition',
  sub: 'Subtraction',
  scalar: 'Scalar multiplication',
  multiply: 'Matrix multiplication',
  transpose: 'Transpose',
  determinant: 'Determinant',
  inverse: 'Inverse',
  solve_system: 'System solution',
  conformability: 'Conformability'
};

const NEGATED_RE = /not\s+conformable|non-?\s?conformable|undefined|not\s+defined|cannot|can't|impossible|not\s+possible/i;
const SINGULAR_RE = /singular|no inverse|does not exist|doesn't exist|not invertible|non-?invertible|undefined/i;

/**
 * Independently compute the expected answer for a computational type.
 * @returns {{ok:false, reason:string} | {ok:true, kind:string, value?:any}}
 *   kind: 'none' (nothing to compute) | 'matrix' | 'fraction' | 'vector' | 'singular' |
 *         'nonConformable' | 'conformability'
 */
export function computeExpected(type, matrices, text = '') {
  const need = REQUIRED_MATRICES[type];
  if (!need) return { ok: true, kind: 'none' };

  for (const key of need) {
    if (!matrices || matrices[key] === undefined || matrices[key] === null) {
      return { ok: false, reason: `Type "${type}" requires matrices.${key}` };
    }
  }

  try {
    const A = Matrix.from(matrices.A);

    switch (type) {
      case 'add':
        return { ok: true, kind: 'matrix', value: A.add(Matrix.from(matrices.B)) };
      case 'sub':
        return { ok: true, kind: 'matrix', value: A.sub(Matrix.from(matrices.B)) };
      case 'scalar': {
        let value = A.scalarMul(Fraction.from(matrices.k));
        if (matrices.B !== undefined && matrices.B !== null) {
          const k2 = matrices.k2 !== undefined && matrices.k2 !== null ? Fraction.from(matrices.k2) : new Fraction(1);
          const term = Matrix.from(matrices.B).scalarMul(k2);
          const isSub = matrices.op === '-' || matrices.op === '\u2212';
          value = isSub ? value.sub(term) : value.add(term);
        }
        return { ok: true, kind: 'matrix', value };
      }
      case 'multiply': {
        const B = Matrix.from(matrices.B);
        if (A.cols !== B.rows) return { ok: true, kind: 'nonConformable' };
        return { ok: true, kind: 'matrix', value: A.multiply(B) };
      }
      case 'transpose':
        return { ok: true, kind: 'matrix', value: A.transpose() };
      case 'determinant':
        return { ok: true, kind: 'fraction', value: A.determinant() };
      case 'inverse': {
        const inv = A.inverse();
        if (inv === null) return { ok: true, kind: 'singular' };
        return { ok: true, kind: 'matrix', value: inv };
      }
      case 'solve_system': {
        const b = Matrix.from(Array.isArray(matrices.b[0]) ? matrices.b : matrices.b.map((x) => [x]));
        if (A.rows !== A.cols || A.rows !== b.rows) {
          return { ok: false, reason: 'System dimensions do not match (A must be square, b must have one entry per row)' };
        }
        const inv = A.inverse();
        if (inv === null) return { ok: false, reason: 'System matrix A is singular (no unique solution)' };
        const X = inv.multiply(b);
        return { ok: true, kind: 'vector', value: X.data.map((r) => r[0]), matrix: X };
      }
      case 'conformability': {
        const B = Matrix.from(matrices.B);
        const t = String(text);
        if (/multipl|product|\bAB\b|\bBA\b/i.test(t)) {
          const swap = /\bBA\b/.test(t) && !/\bAB\b/.test(t);
          const [L, R] = swap ? [B, A] : [A, B];
          const conformable = L.cols === R.rows;
          return { ok: true, kind: 'conformability', conformable, size: conformable ? [L.rows, R.cols] : null };
        }
        if (/\badd|\bsum\b|subtract|difference|A\s*[+\-\u2212]\s*B/i.test(t)) {
          const conformable = A.rows === B.rows && A.cols === B.cols;
          return { ok: true, kind: 'conformability', conformable, size: conformable ? [A.rows, A.cols] : null };
        }
        return { ok: false, reason: 'Conformability question must say whether it is about multiplying AB or adding A and B' };
      }
      default:
        return { ok: true, kind: 'none' };
    }
  } catch (err) {
    return { ok: false, reason: `Math evaluation error: ${err.message}` };
  }
}

function describeExpected(exp) {
  if (exp.kind === 'matrix') return JSON.stringify(exp.value.toDisplayArray());
  if (exp.kind === 'fraction') return exp.value.toString();
  if (exp.kind === 'vector') return exp.value.map((f) => f.toString()).join(', ');
  if (exp.kind === 'conformability') return exp.conformable ? `conformable, size ${exp.size.join('x')}` : 'not conformable';
  return exp.kind;
}

/** Does an answer option (or lesson result) agree with the independently computed answer? */
export function claimMatches(exp, option) {
  const text = String(option).replace(/[\u2212\u2013]/g, '-');
  switch (exp.kind) {
    case 'none':
      return true;
    case 'matrix':
    case 'fraction':
      return compareValues(parseOptionValue(option), exp.value);
    case 'vector': {
      const parsed = parseOptionValue(option);
      return compareValues(parsed, exp.value) || compareValues(parsed, exp.matrix);
    }
    case 'singular':
      return SINGULAR_RE.test(text);
    case 'nonConformable':
      return NEGATED_RE.test(text);
    case 'conformability': {
      const negated = NEGATED_RE.test(text);
      if (!exp.conformable) return negated;
      if (negated) return false;
      const size = text.match(/(\d+)\s*[x\u00d7*]\s*(\d+)/i);
      if (size && (Number(size[1]) !== exp.size[0] || Number(size[2]) !== exp.size[1])) return false;
      return true;
    }
    default:
      return false;
  }
}

export function verifyQuestion(questionData) {
  if (!questionData || typeof questionData !== 'object') {
    return { valid: false, reason: 'Question data is null or not an object' };
  }

  const { topic, type, question, matrices, options, correctIndex } = questionData;

  // 1. Basic structure
  if (!question || typeof question !== 'string') {
    return { valid: false, reason: 'Missing question text' };
  }
  if (!ALLOWED_TYPES.includes(type)) {
    return { valid: false, reason: `Unknown question type: ${type}` };
  }
  if (!Array.isArray(options) || options.length !== 4) {
    return { valid: false, reason: `Must have exactly 4 options, found ${options?.length}` };
  }
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    return { valid: false, reason: `Invalid correctIndex: ${correctIndex}` };
  }

  const uniqueOptions = new Set(options.map((o) => (typeof o === 'object' ? JSON.stringify(o) : String(o).trim())));
  if (uniqueOptions.size < 4) {
    return { valid: false, reason: 'Options must be 4 distinct choices' };
  }

  // 2. Syllabus
  if (!validateTopic(topic)) {
    return { valid: false, reason: `Topic "${topic}" is not in syllabus` };
  }
  if (isOutOfSyllabus(question) || isOutOfSyllabus(topic)) {
    return { valid: false, reason: 'Question or topic contains forbidden out-of-syllabus concepts' };
  }

  // 3. Independent recomputation
  const exp = computeExpected(type, matrices, question);
  if (!exp.ok) return { valid: false, reason: exp.reason };
  if (exp.kind === 'none') return { valid: true, computedAnswer: null };

  if (!claimMatches(exp, options[correctIndex])) {
    return {
      valid: false,
      reason: `${TYPE_LABELS[type] || type} mismatch: computed ${describeExpected(exp)}`
    };
  }

  // Exactly ONE option may be correct (a distractor must not also be right).
  const matching = options.filter((o) => claimMatches(exp, o)).length;
  if (matching !== 1) {
    return { valid: false, reason: `${matching} options match the computed answer (expected exactly 1)` };
  }

  return { valid: true, computedAnswer: exp.value ?? null };
}

/** Recompute a lesson's worked example and compare with its stated result. */
export function verifyLessonExample(example) {
  if (!example || typeof example !== 'object') {
    return { valid: false, reason: 'Lesson example missing' };
  }
  if (!ALLOWED_TYPES.includes(example.type)) {
    return { valid: false, reason: `Lesson example has unknown type: ${example.type}` };
  }
  const exp = computeExpected(example.type, example.matrices, example.description || '');
  if (!exp.ok) return { valid: false, reason: `Lesson example: ${exp.reason}` };
  if (exp.kind === 'none') return { valid: true };
  if (!claimMatches(exp, example.result)) {
    return {
      valid: false,
      reason: `Lesson example result mismatch: computed ${describeExpected(exp)}, lesson says ${JSON.stringify(example.result)}`
    };
  }
  return { valid: true };
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

export function cleanStepText(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^(?:(?:step\s*\d+\s*[:.)\-–—]|\(\d+\)|\d+\s*[.):\-–—]|[-*•–—])\s*)+/i, '')
    .trim();
}

export function splitTextToSteps(input) {
  if (input == null) return [];
  if (Array.isArray(input)) {
    const out = [];
    for (const item of input) {
      if (typeof item === 'string') {
        out.push(...splitTextToSteps(item));
      } else if (item != null) {
        const c = cleanStepText(String(item));
        if (c) out.push(c);
      }
    }
    return out;
  }
  const raw = String(input).trim();
  if (!raw) return [];

  const isNumberedList = /^(?:[-*•–—]\s*)?(?:step\s*)?1\s*[.):]/i.test(raw);
  const separatorRe = isNumberedList
    ? /\r?\n+|\s+•\s+|\s+[-–—]\s+(?=(?:[Ss]tep\s*\d|\d+\s*[.):]\s+[A-Z]|[-*•]\s|[A-Z][a-z]|(?:det|adj)\s*\(|A⁻¹|[a-z]{3,}\s+[a-z]))|(?<=[.;!])\s+[-–—]\s+|(?<=[a-z]{3,})\s+[-–—]\s+(?=[a-zA-Z]{3,})/
    : /\r?\n+|\s+•\s+|\s+[-–—]\s+(?=(?:[Ss]tep\s*\d|[-*•]\s|[A-Z][a-z]|(?:det|adj)\s*\(|A⁻¹|[a-z]{3,}\s+[a-z]))|(?<=[.;!])\s+[-–—]\s+|(?<=[a-z]{3,})\s+[-–—]\s+(?=[a-zA-Z]{3,})/;

  const parts = separatorRe.test(raw)
    ? raw.split(separatorRe)
    : raw.split(/\.(?:\s+|$)(?=[A-Z0-9(\["'])/);

  return parts.map((p) => cleanStepText(p)).filter((p) => p.length > 0);
}

/**
 * Ensures explanation has { summary, steps, conclusion } where steps is a non-empty array of strings.
 * If explanation is a string or explanation.steps is missing/empty, applies the string fallback.
 */
export function normalizeExplanationObject(explanation, question = null) {
  let summary = '';
  let steps = [];
  let conclusion = '';

  if (typeof explanation === 'string' || Array.isArray(explanation)) {
    steps = splitTextToSteps(explanation);
  } else if (explanation && typeof explanation === 'object') {
    if (typeof explanation.summary === 'string') summary = cleanStepText(explanation.summary);
    if (explanation.conclusion !== undefined && explanation.conclusion !== null) {
      conclusion = Array.isArray(explanation.conclusion)
        ? JSON.stringify(explanation.conclusion)
        : cleanStepText(String(explanation.conclusion));
    }
    if (Array.isArray(explanation.steps) && explanation.steps.length > 0) {
      steps = splitTextToSteps(explanation.steps);
    }
    if (steps.length === 0) {
      const fallbackText =
        typeof explanation.text === 'string'
          ? explanation.text
          : typeof explanation.working === 'string'
          ? explanation.working
          : [summary, conclusion].filter(Boolean).join('. ');
      steps = splitTextToSteps(fallbackText);
    }
  }

  if (steps.length === 0) {
    const answerOpt =
      question && Array.isArray(question.options) && question.options[question.correctIndex] !== undefined
        ? question.options[question.correctIndex]
        : null;
    const formattedAns = Array.isArray(answerOpt) ? JSON.stringify(answerOpt) : String(answerOpt ?? '');
    steps = [formattedAns ? `Correct answer: ${formattedAns}` : 'Apply the definition from the lesson.'];
  }

  return { summary, steps, conclusion };
}

function canonValue(v) {
  if (v === undefined || v === null) return null;
  try {
    if (Array.isArray(v)) return Matrix.from(v).toDisplayArray();
    return Fraction.from(v).toString();
  } catch {
    return String(v);
  }
}

function matricesKey(m) {
  if (!m || typeof m !== 'object') return null;
  return JSON.stringify(['A', 'B', 'b', 'k', 'k2', 'op'].map((k) => canonValue(m[k])));
}

function oversizeMatrix(m) {
  if (!m || typeof m !== 'object') return null;
  for (const [key, v] of Object.entries(m)) {
    if (!Array.isArray(v)) continue;
    const rows = v.length;
    const cols = Array.isArray(v[0]) ? v[0].length : 1;
    if (rows > 3 || cols > 3) return `matrices.${key} is ${rows}x${cols} (larger than 3x3 is out of syllabus)`;
  }
  return null;
}

/**
 * Verify a whole turn (lesson + question). Nothing is shown until this passes.
 *   1. the question's correct answer matches the option at correctIndex (and only that option)
 *   2. the lesson example's stated result matches the recomputed value
 *   3. valid shape, topic is one of the 10 (and the assigned one), 4 distinct options
 *   4. the question's matrices differ from the lesson example's matrices
 *
 * @param {object} turn   { topic, lesson, question }
 * @param {{ number: number, name: string } | null} expectedTopic  topic the server assigned
 */
export function verifyTurn(turn, expectedTopic = null) {
  const fail = (reason) => ({ valid: false, reason });

  if (!turn || typeof turn !== 'object') return fail('Response is not a JSON object');
  const { lesson, question } = turn;
  if (!lesson || typeof lesson !== 'object') return fail('Missing lesson');
  if (!question || typeof question !== 'object') return fail('Missing question');

  if (typeof lesson.title !== 'string' || !lesson.title.trim()) return fail('Lesson has no title');
  if (
    !Array.isArray(lesson.keyPoints) ||
    lesson.keyPoints.length < 2 ||
    lesson.keyPoints.length > 4 ||
    lesson.keyPoints.some((p) => typeof p !== 'string' || !p.trim())
  ) {
    return fail('Lesson needs 2 to 4 non-empty key points');
  }
  const words = lesson.keyPoints.join(' ').split(/\s+/).length;
  if (words > 150) return fail(`Lesson key points are too long (${words} words)`);

  const ex = lesson.example;
  if (!ex || typeof ex !== 'object') return fail('Lesson has no worked example');
  if (Array.isArray(ex.steps) && ex.steps.length > 0) {
    ex.steps = splitTextToSteps(ex.steps);
  } else if (typeof ex.steps === 'string' && ex.steps.trim()) {
    ex.steps = splitTextToSteps(ex.steps);
  }
  if (!Array.isArray(ex.steps) || ex.steps.length === 0) return fail('Lesson example has no steps');
  if (ex.result === undefined || ex.result === null) return fail('Lesson example has no result');
  if (typeof question.text !== 'string' || !question.text.trim()) return fail('Question has no text');

  // Normalize question.explanation so explanation.steps is always a non-empty array of strings
  // (applies fallback splitting instead of rejecting the question if explanation is a string or steps is missing/empty).
  question.explanation = normalizeExplanationObject(question.explanation, question);

  // Topic must be one of the 10 and the one the server assigned
  const topicText = String(turn.topic ?? '');
  if (expectedTopic) {
    const num = parseInt((topicText.match(/^\s*(\d+)/) || [])[1], 10);
    const nameOk = topicText.toLowerCase().includes(expectedTopic.name.toLowerCase());
    if (num !== expectedTopic.number && !nameOk) {
      return fail(`Topic mismatch: expected "${expectedTopic.number}. ${expectedTopic.name}", got "${topicText}"`);
    }
  } else if (!validateTopic(topicText)) {
    return fail(`Topic "${topicText}" is not in syllabus`);
  }
  const topicName = expectedTopic ? expectedTopic.name : topicText;

  // Out-of-syllabus content anywhere in the lesson or question
  for (const s of collectStrings({ lesson, question })) {
    if (isOutOfSyllabus(s)) return fail(`Out-of-syllabus content: "${s.slice(0, 60)}"`);
  }

  // Nothing bigger than 3x3
  const big = oversizeMatrix(ex.matrices) || oversizeMatrix(question.matrices);
  if (big) return fail(big);

  // Application topics must not default to muffins and coffee
  if (expectedTopic && (expectedTopic.number === 9 || expectedTopic.number === 10)) {
    const all = collectStrings({ lesson, question }).join(' ');
    if (/\bmuffins?\b|\bcoffee\b/i.test(all)) return fail('Application context defaulted to muffins/coffee');
  }

  // 1 + 3. Question: exactly one correct answer, matches the recomputed value
  const q = verifyQuestion({
    topic: topicName,
    type: question.type,
    question: question.text,
    matrices: question.matrices,
    options: question.options,
    correctIndex: question.correctIndex
  });
  if (!q.valid) return fail(`Question: ${q.reason}`);

  // 2. Lesson example is recomputed, so the lesson never teaches a wrong answer
  const l = verifyLessonExample(ex);
  if (!l.valid) return fail(l.reason);

  // 4. The question must not reuse the lesson example's numbers
  if (ex.matrices && question.matrices) {
    const sameAll = matricesKey(ex.matrices) === matricesKey(question.matrices);
    const sameA =
      ex.matrices.A !== undefined &&
      question.matrices.A !== undefined &&
      JSON.stringify(canonValue(ex.matrices.A)) === JSON.stringify(canonValue(question.matrices.A));
    if (sameAll || sameA) return fail('Question uses the same matrices as the lesson example');
  }

  return { valid: true };
}
