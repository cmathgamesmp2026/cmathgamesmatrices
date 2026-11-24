/**
 * Gemini Request Queue & Model Quota Tracker
 * - Serialises all Gemini calls so only 1 runs at a time, with a minimum gap
 *   of GEMINI_MIN_GAP_MS (default 4000ms) between requests.
 * - Tracks models exhausted by HTTP 429 until the next midnight Pacific time
 *   (America/Los_Angeles).
 */

export const GEMINI_MIN_GAP_MS = Math.max(0, parseInt(process.env.GEMINI_MIN_GAP_MS || '4000', 10));

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

/**
 * Parse GEMINI_MODELS (comma-separated priority list), falling back to
 * GEMINI_MODEL (single model) and then DEFAULT_GEMINI_MODEL.
 */
export function getConfiguredModels(env = process.env) {
  const list = String(env.GEMINI_MODELS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  if (list.length > 0) return list;

  const single = String(env.GEMINI_MODEL || '').trim();
  if (single) return [single];

  return [DEFAULT_GEMINI_MODEL];
}

/**
 * Return the UTC epoch ms for the next 00:00:00 in America/Los_Angeles (Pacific time),
 * handling both PST (UTC-8) and PDT (UTC-7) cleanly.
 */
export function getNextMidnightPacific(nowMs = Date.now()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const partsOf = (ms) => {
    const map = {};
    for (const p of fmt.formatToParts(new Date(ms))) {
      if (p.type !== 'literal') map[p.type] = Number(p.value);
    }
    return map;
  };

  const cur = partsOf(nowMs);
  // Compute tomorrow's calendar date in Pacific time using UTC calendar arithmetic
  const nextCal = new Date(Date.UTC(cur.year, cur.month - 1, cur.day + 1));
  const y = nextCal.getUTCFullYear();
  const m = nextCal.getUTCMonth() + 1;
  const d = nextCal.getUTCDate();

  // Initial guess: 08:00 UTC (midnight PST). Adjust once using actual Pacific wall-clock offset.
  let guess = Date.UTC(y, m - 1, d, 8, 0, 0);
  for (let i = 0; i < 2; i++) {
    const p = partsOf(guess);
    const localAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const targetAsUtc = Date.UTC(y, m - 1, d, 0, 0, 0);
    const diff = targetAsUtc - localAsUtc;
    if (diff === 0) break;
    guess += diff;
  }

  return guess;
}

export class ModelQuotaTracker {
  constructor() {
    this.exhaustedUntil = new Map(); // modelName -> resetAtMs
  }

  reset() {
    this.exhaustedUntil.clear();
  }

  markExhausted(model, nowMs = Date.now()) {
    const resetAt = getNextMidnightPacific(nowMs);
    this.exhaustedUntil.set(model, resetAt);
    return resetAt;
  }

  isExhausted(model, nowMs = Date.now()) {
    const resetAt = this.exhaustedUntil.get(model);
    if (resetAt == null) return false;
    if (nowMs >= resetAt) {
      this.exhaustedUntil.delete(model);
      return false;
    }
    return true;
  }

  getAvailableModels(models = getConfiguredModels(), nowMs = Date.now()) {
    return models.filter((m) => !this.isExhausted(m, nowMs));
  }

  areAllExhausted(models = getConfiguredModels(), nowMs = Date.now()) {
    return this.getAvailableModels(models, nowMs).length === 0;
  }

  getStatus(models = getConfiguredModels(), nowMs = Date.now()) {
    const exhausted = [];
    for (const model of models) {
      if (this.isExhausted(model, nowMs)) {
        const resetAt = this.exhaustedUntil.get(model);
        exhausted.push({
          model,
          resetAt: new Date(resetAt).toISOString()
        });
      }
    }
    return {
      models,
      exhausted,
      allExhausted: exhausted.length >= models.length
    };
  }
}

export class GeminiRequestQueue {
  constructor({ minGapMs = GEMINI_MIN_GAP_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() } = {}) {
    this.minGapMs = minGapMs;
    this.sleep = sleep;
    this.now = now;
    this.tail = Promise.resolve();
    this.lastRunAt = 0;
  }

  enqueue(taskFn) {
    const run = async () => {
      if (this.lastRunAt > 0 && this.minGapMs > 0) {
        const elapsed = this.now() - this.lastRunAt;
        if (elapsed < this.minGapMs) {
          await this.sleep(this.minGapMs - elapsed);
        }
      }
      this.lastRunAt = this.now();
      return taskFn();
    };

    const resultPromise = this.tail.then(run, run);
    // Keep the queue alive even if one request rejects
    this.tail = resultPromise.then(() => {}, () => {});
    return resultPromise;
  }
}

export const modelQuota = new ModelQuotaTracker();
export const geminiQueue = new GeminiRequestQueue();
