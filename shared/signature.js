/**
 * SHA-256 hex signature helper using Web Crypto API (Workers + Node >= 20).
 * Matches the exact canonical format: `${normalizedText}|${JSON.stringify(matrices)}`.
 */

export function canonicalQuestionString(question) {
  const text = String(question?.text || question?.question || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const matrices = question?.matrices ?? null;
  return `${text}|${JSON.stringify(matrices)}`;
}

export async function computeSignature(question) {
  const canonical = canonicalQuestionString(question);
  const data = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hashBuffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}
