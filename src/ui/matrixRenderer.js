/**
 * HTML/CSS Matrix and Math Renderer
 * Formats 2D arrays, vectors, and fractions into clean bracketed mathematical structures.
 */

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

  return `<span class="math-num">${str}</span>`;
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

  const labelHTML = label ? `<span class="matrix-label">${label}</span>` : '';

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
      return `<div class="math-solution-text">${trimmed.replace(/(x|y|z)/gi, '<strong class="math-var">$1</strong>')}</div>`;
    }

    // 5. If it's a simple fraction or number
    if (/^-?\d+(?:\/\d+)?$/.test(trimmed)) {
      return `<div class="math-single-val">${formatValueHTML(trimmed)}</div>`;
    }
  }

  // Regular text
  return `<span class="option-text">${option}</span>`;
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
