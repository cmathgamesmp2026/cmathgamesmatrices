/**
 * HTML/CSS Matrix, Math, and Step-by-Step Working Renderer
 * Formats 2D arrays, vectors, fractions, and multi-step explanations into clean HTML.
 */

/** Escape text coming from the AI before it goes into innerHTML. */
export function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format a fraction or number value into clean HTML.
 * Renders neat fractions with horizontal bar or clean integer.
 */
export function formatValueHTML(val) {
  if (val == null) return '';
  const str = String(val).trim();

  // Stacked fraction e.g. "3/4" or "-1/2"
  if (str.includes('/') && !str.includes(' ')) {
    const [num, den] = str.split('/');
    if (num && den && !isNaN(Number(num)) && !isNaN(Number(den))) {
      const isNegative = num.startsWith('-');
      const cleanNum = isNegative ? num.slice(1) : num;
      return `
        <span class="math-fraction ${isNegative ? 'is-neg' : ''}">
          ${isNegative ? '<span class="math-sign">-</span>' : ''}
          <span class="frac-stack">
            <span class="frac-num">${cleanNum}</span>
            <span class="frac-bar"></span>
            <span class="frac-den">${den}</span>
          </span>
        </span>
      `;
    }
  }

  return `<span class="math-num">${escapeHTML(str)}</span>`;
}

/**
 * Renders a 2D matrix array as an HTML bracketed grid
 *
 * @param {Array<Array<any>>} matrixData
 * @param {string} [label] - Optional prefix label, e.g. "A = "
 * @returns {string} HTML string
 */
export function renderMatrixHTML(matrixData, label = '') {
  if (!Array.isArray(matrixData) || matrixData.length === 0) {
    return '';
  }

  // Handle 1D array as column vector
  const data = Array.isArray(matrixData[0]) ? matrixData : matrixData.map((x) => [x]);
  const rows = data.length;
  const cols = data[0].length;

  const cellsHTML = data
    .map((row) => {
      const rowHTML = row.map((cell) => `<div class="matrix-cell">${formatValueHTML(cell)}</div>`).join('');
      return `<div class="matrix-row">${rowHTML}</div>`;
    })
    .join('');

  const labelHTML = label ? `<span class="matrix-label">${escapeHTML(label)}</span>` : '';

  return `
    <div class="matrix-container" data-rows="${rows}" data-cols="${cols}">
      ${labelHTML}
      <div class="matrix-bracket-box">
        <div class="matrix-grid" style="grid-template-columns: repeat(${cols}, auto);">
          ${cellsHTML}
        </div>
      </div>
    </div>
  `;
}

/**
 * Checks if input is a matrix (2D array or stringified 2D array)
 */
export function isMatrixInput(input) {
  if (Array.isArray(input)) {
    return Array.isArray(input[0]) || (input.length > 0 && typeof input[0] !== 'object');
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('[[') && trimmed.endsWith(']]')) return true;
    if (trimmed.startsWith('[ [') && trimmed.endsWith('] ]')) return true;
  }
  return false;
}

/**
 * Parses and renders arbitrary option content (Matrix, Vector, or Text)
 */
export function renderOptionContent(option) {
  if (option == null) return '';

  // 1. If it's a 2D array
  if (Array.isArray(option)) {
    return renderMatrixHTML(option);
  }

  // 2. If it's a JSON string representing a matrix
  if (typeof option === 'string') {
    const trimmed = option.trim();
    if ((trimmed.startsWith('[[') || trimmed.startsWith('[ [')) && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed.replace(/'/g, '"'));
        if (Array.isArray(parsed)) {
          return renderMatrixHTML(parsed);
        }
      } catch {
        // Fall back to text
      }
    }

    // 3. If it's a vector like [1, 2, 3]
    if (trimmed.startsWith('[') && trimmed.endsWith(']') && !trimmed.slice(1, -1).includes('[')) {
      try {
        const items = trimmed
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim());
        return renderMatrixHTML(items.map((x) => [x]));
      } catch {
        // continue
      }
    }

    // 4. If it's a system solution like "x = 2, y = -1"
    if (/x\s*=.*y\s*=/i.test(trimmed)) {
      return `<div class="math-solution-text">${escapeHTML(trimmed).replace(/(x|y|z)/gi, '<strong class="math-var">$1</strong>')}</div>`;
    }

    // 5. If it's a simple fraction or number
    if (/^-?\d+(?:\/\d+)?$/.test(trimmed)) {
      return `<div class="math-single-val">${formatValueHTML(trimmed)}</div>`;
    }
  }

  // Regular text
  return `<span class="option-text">${escapeHTML(option)}</span>`;
}

/**
 * Formats matrices in the question header (e.g. A = [...], B = [...])
 */
export function renderMatricesSection(matrices) {
  if (!matrices || typeof matrices !== 'object') return '';

  const parts = [];
  if (matrices.A && Array.isArray(matrices.A)) {
    parts.push(renderMatrixHTML(matrices.A, 'A = '));
  }
  if (matrices.B && Array.isArray(matrices.B)) {
    parts.push(renderMatrixHTML(matrices.B, 'B = '));
  }
  if (matrices.C && Array.isArray(matrices.C)) {
    parts.push(renderMatrixHTML(matrices.C, 'C = '));
  }
  if (matrices.b && Array.isArray(matrices.b)) {
    parts.push(renderMatrixHTML(matrices.b, 'b = '));
  }

  if (parts.length === 0) return '';

  return `
    <div class="question-matrices-display">
      ${parts.join('')}
    </div>
  `;
}

/**
 * Strip leading bullet dashes, asterisks, bullets, or step numbering from a single step string.
 */
export function cleanStepString(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^(?:(?:step\s*\d+\s*[:.)\-–—]|\(\d+\)|\d+\s*[.):\-–—]|[-*•–—])\s*)+/i, '')
    .trim();
}

/**
 * Convert a single string (or array of strings) into clean individual step strings:
 *  - Splits on newline characters, " • ", and " - " / " – " / " — " item separators
 *    (without breaking arithmetic subtraction like "3 - 2 = 1" or "ad - bc").
 *  - Splits on sentence-final periods only if no other separators exist.
 *  - Strips leading "-", "*", "•" or numbering, trims whitespace, and drops empty pieces.
 */
export function splitTextToSteps(input) {
  if (input == null) return [];

  if (Array.isArray(input)) {
    const out = [];
    for (const item of input) {
      if (Array.isArray(item)) {
        out.push(item);
      } else if (typeof item === 'string') {
        const sub = splitSingleStringToSteps(item);
        out.push(...sub);
      } else if (item != null) {
        const cleaned = cleanStepString(String(item));
        if (cleaned) out.push(cleaned);
      }
    }
    return out;
  }

  if (typeof input === 'string') {
    return splitSingleStringToSteps(input);
  }

  return [];
}

function splitSingleStringToSteps(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return [];

  const isNumberedList = /^(?:[-*•–—]\s*)?(?:step\s*)?1\s*[.):]/i.test(raw);
  const separatorRe = isNumberedList
    ? /\r?\n+|\s+•\s+|\s+[-–—]\s+(?=(?:[Ss]tep\s*\d|\d+\s*[.):]\s+[A-Z]|[-*•]\s|[A-Z][a-z]|(?:det|adj)\s*\(|A⁻¹|[a-z]{3,}\s+[a-z]))|(?<=[.;!])\s+[-–—]\s+|(?<=[a-z]{3,})\s+[-–—]\s+(?=[a-zA-Z]{3,})/
    : /\r?\n+|\s+•\s+|\s+[-–—]\s+(?=(?:[Ss]tep\s*\d|[-*•]\s|[A-Z][a-z]|(?:det|adj)\s*\(|A⁻¹|[a-z]{3,}\s+[a-z]))|(?<=[.;!])\s+[-–—]\s+|(?<=[a-z]{3,})\s+[-–—]\s+(?=[a-zA-Z]{3,})/;

  let parts;
  if (separatorRe.test(raw)) {
    parts = raw.split(separatorRe);
  } else {
    // No newline, bullet, or dash separator found: split on sentence-final periods.
    parts = raw.split(/\.(?:\s+|$)(?=[A-Z0-9(\["'])/);
  }

  return parts
    .map((piece) => cleanStepString(piece))
    .filter((piece) => piece.length > 0);
}

/**
 * Normalizes any explanation or worked-example structure into:
 *   { summary: string, steps: Array<string|Array>, conclusion: string|Array }
 * Never rejects if steps are missing/empty; falls back to splitting string content.
 */
export function normalizeExplanation(explanation) {
  if (explanation == null) {
    return { summary: '', steps: [], conclusion: '' };
  }

  if (typeof explanation === 'string' || Array.isArray(explanation)) {
    return {
      summary: '',
      steps: splitTextToSteps(explanation),
      conclusion: ''
    };
  }

  if (typeof explanation === 'object') {
    const rawSummary = explanation.summary ?? explanation.description ?? '';
    const summary = typeof rawSummary === 'string' ? cleanStepString(rawSummary) : '';

    const hasConclusion = explanation.conclusion !== undefined && explanation.conclusion !== null;
    const hasResult = explanation.result !== undefined && explanation.result !== null;
    const rawConclusion = hasConclusion ? explanation.conclusion : hasResult ? explanation.result : '';
    const conclusion = Array.isArray(rawConclusion)
      ? rawConclusion
      : typeof rawConclusion === 'string' || typeof rawConclusion === 'number'
      ? cleanStepString(String(rawConclusion))
      : '';

    let steps = [];
    if (Array.isArray(explanation.steps) && explanation.steps.length > 0) {
      steps = splitTextToSteps(explanation.steps);
    }

    // Fallback (Section 4 & 5): if steps is missing or empty, extract from text fields
    if (steps.length === 0) {
      const fallbackSource =
        typeof explanation.text === 'string'
          ? explanation.text
          : typeof explanation.working === 'string'
          ? explanation.working
          : typeof rawSummary === 'string' && rawSummary.length > 0
          ? rawSummary
          : typeof conclusion === 'string'
          ? conclusion
          : '';
      steps = splitTextToSteps(fallbackSource);
    }

    return { summary, steps, conclusion };
  }

  return { summary: '', steps: [], conclusion: '' };
}

/**
 * Renders a step or conclusion value. If the value is a 2D matrix array, a JSON matrix string,
 * or contains an inline 2D matrix like "Aᵀ = [[7, 0], [1, 2], [3, 5]]", renders the matrix
 * as an HTML bracketed grid.
 */
export function renderStepValueHTML(val) {
  if (val == null) return '';
  if (Array.isArray(val)) {
    return renderMatrixHTML(val);
  }

  const str = String(val).trim();
  if (!str) return '';

  // Pure matrix string
  if ((str.startsWith('[[') || str.startsWith('[ [')) && str.endsWith(']')) {
    try {
      const parsed = JSON.parse(str.replace(/'/g, '"'));
      if (Array.isArray(parsed)) return renderMatrixHTML(parsed);
    } catch {
      // fall through
    }
  }

  // String with one or more inline 2D matrices e.g. "Therefore A^T = [[1, 4], [2, 5]]."
  const inlineMatrixRe = /\[\s*\[[^\]]+\](?:\s*,\s*\[[^\]]+\])*\s*\]/g;
  if (inlineMatrixRe.test(str)) {
    inlineMatrixRe.lastIndex = 0;
    let html = '';
    let lastIdx = 0;
    let match;
    while ((match = inlineMatrixRe.exec(str)) !== null) {
      const before = str.slice(lastIdx, match.index);
      if (before) html += `<span>${escapeHTML(before)}</span>`;
      try {
        const normalizedJson = match[0].replace(/'/g, '"').replace(/[\u2212\u2013]/g, '-');
        const parsed = JSON.parse(normalizedJson);
        if (Array.isArray(parsed)) {
          html += renderMatrixHTML(parsed);
        } else {
          html += `<span>${escapeHTML(match[0])}</span>`;
        }
      } catch {
        html += `<span>${escapeHTML(match[0])}</span>`;
      }
      lastIdx = match.index + match[0].length;
    }
    const tail = str.slice(lastIdx);
    if (tail) html += `<span>${escapeHTML(tail)}</span>`;
    return `<span class="working-inline-matrix">${html}</span>`;
  }

  return `<span>${escapeHTML(str)}</span>`;
}

/**
 * Shared step-by-step renderer used for:
 *  - Question working / explanation (for all 12 question types & all 10 topics, correct or wrong)
 *  - Lesson worked example (lesson.example)
 *
 * Builds the layout from the steps array (one element per step, never relying on newlines).
 */
export function renderWorkingHTML(explanationInput, { matrices = null, conclusionPrefix = '' } = {}) {
  const { summary, steps, conclusion } = normalizeExplanation(explanationInput);

  const summaryHTML = summary
    ? `<div class="working-summary">${renderStepValueHTML(summary)}</div>`
    : '';

  const matricesHTML = matrices ? renderMatricesSection(matrices) : '';

  const stepsItemsHTML = steps
    .map(
      (step, idx) => `
      <li class="working-step-item">
        <span class="working-step-num">${idx + 1}.</span>
        <div class="working-step-body">${renderStepValueHTML(step)}</div>
      </li>`
    )
    .join('');

  const stepsListHTML = stepsItemsHTML
    ? `<ol class="working-steps-list">${stepsItemsHTML}</ol>`
    : '';

  const hasConclusion =
    (Array.isArray(conclusion) && conclusion.length > 0) ||
    (typeof conclusion === 'string' && conclusion.length > 0);

  const prefixHTML = conclusionPrefix ? `<span class="working-conclusion-prefix">${escapeHTML(conclusionPrefix)} </span>` : '';
  const conclusionHTML = hasConclusion
    ? `<div class="working-conclusion">${prefixHTML}${renderStepValueHTML(conclusion)}</div>`
    : '';

  return `
    <div class="working-block">
      ${summaryHTML}
      ${matricesHTML}
      ${stepsListHTML}
      ${conclusionHTML}
    </div>
  `;
}
