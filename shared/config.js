/**
 * Shared Gemini & Pool configuration helpers.
 * Reads exclusively from an explicit `env` object (context.env on Cloudflare Workers,
 * or a parsed env object in local Node scripts).
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

export const SUPPORTED_GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-4-argon'
];

export const DEFAULT_GEMINI_MIN_GAP_MS = 4000;
export const DEFAULT_BATCH_SIZE = 4;
export const DEFAULT_POOL_MIN_PER_TOPIC = 4;
export const DEFAULT_POOL_TARGET_PER_TOPIC = 10;

export function getConfiguredModels(env = {}) {
  const list = String(env?.GEMINI_MODELS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  if (list.length > 0) return list;

  const single = String(env?.GEMINI_MODEL || '').trim();
  if (single) return [single];

  return [DEFAULT_GEMINI_MODEL];
}

export function getIntSetting(env, key, fallback, min = 0) {
  const parsed = parseInt(String(env?.[key] ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}
