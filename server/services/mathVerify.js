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
      const trimmed = val.trim();
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

export const FORBIDDEN_KEYWORDS = [
  'eigen',
  'eigenvalue',
  'eigenvector',
  'dot product',
  'cross product',
  'gaussian elimination',
  'gauss-jordan',
  'cramer',
  'rank',
  'lu decomposition',
  'cholesky',
  'qr decomposition',
  'vector space',
  'collinear',
  'magnitude of vector',
  'angle between'
];

/**
 * Check if the text or topic contains strictly forbidden out-of-syllabus terms
 */
export function isOutOfSyllabus(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  return false;
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
    const trimmed = option.trim();

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
 * Main verification function
 * Validates syllabus constraints and independently computes answer for computational types.
 *
 * @param {Object} questionData - The question object from Gemini
 * @returns {{ valid: boolean, reason?: string, computedAnswer?: any }}
 */
export function verifyQuestion(questionData) {
  if (!questionData || typeof questionData !== 'object') {
    return { valid: false, reason: 'Question data is null or not an object' };
  }

  const { topic, type, question, matrices, options, correctIndex } = questionData;

  // 1. Check basic structure
  if (!question || typeof question !== 'string') {
    return { valid: false, reason: 'Missing question text' };
  }
  if (!Array.isArray(options) || options.length !== 4) {
    return { valid: false, reason: `Must have exactly 4 options, found ${options?.length}` };
  }
  if (typeof correctIndex !== 'number' || correctIndex < 0 || correctIndex > 3) {
    return { valid: false, reason: `Invalid correctIndex: ${correctIndex}` };
  }

  // Check that options are distinct
  const uniqueOptions = new Set(options.map((o) => (typeof o === 'object' ? JSON.stringify(o) : String(o).trim())));
  if (uniqueOptions.size < 4) {
    return { valid: false, reason: 'Options must be 4 distinct choices' };
  }

  // 2. Syllabus validation
  if (!validateTopic(topic)) {
    return { valid: false, reason: `Topic "${topic}" is not in syllabus` };
  }
  if (isOutOfSyllabus(question) || isOutOfSyllabus(topic)) {
    return { valid: false, reason: 'Question or topic contains forbidden out-of-syllabus concepts' };
  }

  // 3. Computational verification
  const claimedOption = options[correctIndex];
  const parsedClaimed = parseOptionValue(claimedOption);

  try {
    let computed = null;

    if (type === 'add' && matrices?.A && matrices?.B) {
      const A = Matrix.from(matrices.A);
      const B = Matrix.from(matrices.B);
      computed = A.add(B);
      if (!compareValues(parsedClaimed, computed)) {
        return { valid: false, reason: `Addition mismatch: computed ${JSON.stringify(computed.toDisplayArray())}` };
      }
    } else if (type === 'sub' && matrices?.A && matrices?.B) {
      const A = Matrix.from(matrices.A);
      const B = Matrix.from(matrices.B);
      computed = A.sub(B);
      if (!compareValues(parsedClaimed, computed)) {
        return { valid: false, reason: `Subtraction mismatch: computed ${JSON.stringify(computed.toDisplayArray())}` };
      }
    } else if (type === 'scalar' && matrices?.A) {
      const A = Matrix.from(matrices.A);
      // Check if scalar k or expression is given
      let k = matrices.k != null ? Fraction.from(matrices.k) : null;
      if (!k) {
        // Try to parse scalar factor from question text e.g. "Find 3A", "-2A", "2D - 3C", "2I + C"
        const multMatch = question.match(/([+-]?\d+)\s*(?:A|C|D|M)/);
        if (multMatch) {
          k = Fraction.from(parseInt(multMatch[1], 10));
        } else {
          k = new Fraction(2); // default scalar
        }
      }

      // Check if expression involves 2 matrices: k*A + c*B or k*I + A
      if (matrices.B && (question.includes('-') || question.includes('+'))) {
        const B = Matrix.from(matrices.B);
        const matchC = question.match(/([+-]?\d+)\s*B/i) || question.match(/([+-]?\d+)\s*C/i);
        const cVal = matchC ? Fraction.from(parseInt(matchC[1], 10)) : new Fraction(1);
        const isSub = question.includes('-');
        computed = isSub ? A.scalarMul(k).sub(B.scalarMul(cVal)) : A.scalarMul(k).add(B.scalarMul(cVal));
      } else if (question.includes('I') && matrices.A) {
        const I = Matrix.identity(A.rows);
        computed = I.scalarMul(k).add(A);
      } else {
        computed = A.scalarMul(k);
      }

      if (!compareValues(parsedClaimed, computed)) {
        return { valid: false, reason: `Scalar multiplication mismatch: computed ${JSON.stringify(computed.toDisplayArray())}` };
      }
    } else if (type === 'multiply' && matrices?.A && matrices?.B) {
      const A = Matrix.from(matrices.A);
      const B = Matrix.from(matrices.B);
      if (A.cols !== B.rows) {
        // Non-conformable
        const nonConfKeywords = ['not conformable', 'non-conformable', 'undefined', 'cannot be multiplied'];
        const claimStr = String(claimedOption).toLowerCase();
        if (!nonConfKeywords.some((kw) => claimStr.includes(kw))) {
          return { valid: false, reason: 'Expected non-conformable multiplication result' };
        }
      } else {
        computed = A.multiply(B);
        if (!compareValues(parsedClaimed, computed)) {
          return { valid: false, reason: `Matrix multiplication mismatch: computed ${JSON.stringify(computed.toDisplayArray())}` };
        }
      }
    } else if (type === 'transpose' && matrices?.A) {
      const A = Matrix.from(matrices.A);
      computed = A.transpose();
      if (!compareValues(parsedClaimed, computed)) {
        return { valid: false, reason: `Transpose mismatch: computed ${JSON.stringify(computed.toDisplayArray())}` };
      }
    } else if (type === 'determinant' && matrices?.A) {
      const A = Matrix.from(matrices.A);
      computed = A.determinant();
      if (!compareValues(parsedClaimed, computed)) {
        return { valid: false, reason: `Determinant mismatch: computed ${computed.toString()}` };
      }
    } else if (type === 'inverse' && matrices?.A) {
      const A = Matrix.from(matrices.A);
      computed = A.inverse();
      if (computed === null) {
        // Singular
        const singKeywords = ['singular', 'no inverse', 'does not exist', 'undefined'];
        const claimStr = String(claimedOption).toLowerCase();
        if (!singKeywords.some((kw) => claimStr.includes(kw))) {
          return { valid: false, reason: 'Expected singular / no inverse result' };
        }
      } else {
        if (!compareValues(parsedClaimed, computed)) {
          return { valid: false, reason: `Inverse mismatch: computed ${JSON.stringify(computed.toDisplayArray())}` };
        }
      }
    } else if (type === 'solve_system' && matrices?.A && matrices?.b) {
      const A = Matrix.from(matrices.A);
      const bData = Array.isArray(matrices.b[0]) ? matrices.b : matrices.b.map((x) => [x]);
      const b = Matrix.from(bData);
      const invA = A.inverse();
      if (invA) {
        const X = invA.multiply(b);
        // Column vector of fractions
        const solFractions = X.data.map((r) => r[0]);
        if (!compareValues(parsedClaimed, solFractions) && !compareValues(parsedClaimed, X)) {
          return { valid: false, reason: `System solution mismatch: computed ${JSON.stringify(solFractions.map((f) => f.toString()))}` };
        }
      }
    } else if (type === 'conformability' && matrices?.A && matrices?.B) {
      const A = Matrix.from(matrices.A);
      const B = Matrix.from(matrices.B);
      const isMul = question.toLowerCase().includes('multipl') || question.toLowerCase().includes('ab');
      const claimStr = String(claimedOption).toLowerCase();
      if (isMul) {
        const conformable = A.cols === B.rows;
        if (conformable) {
          const expectedSize = `${A.rows}x${B.cols}`;
          if (!claimStr.includes('conformable') && !claimStr.includes(expectedSize)) {
            return { valid: false, reason: `Expected conformable product of size ${expectedSize}` };
          }
        } else {
          if (!claimStr.includes('not conformable') && !claimStr.includes('non-conformable') && !claimStr.includes('undefined')) {
            return { valid: false, reason: 'Expected non-conformable result for multiplication' };
          }
        }
      }
    }

    return { valid: true, computedAnswer: computed };
  } catch (err) {
    return { valid: false, reason: `Math evaluation error: ${err.message}` };
  }
}
