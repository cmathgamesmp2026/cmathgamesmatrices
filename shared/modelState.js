/**
 * Model fallback state tracker supporting both Cloudflare D1 (`model_state` table)
 * and an in-memory store (for local CLI scripts & unit tests).
 *
 * States stored in `model_state`:
 * - ready:       model is usable
 * - exhausted:   hit HTTP 429; blocked until next midnight Pacific (America/Los_Angeles)
 * - cooling:     hit persistent HTTP 503; blocked until short cooldown expires
 * - unavailable: non-retryable upstream error; blocked until short cooldown expires
 */

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
  const nextCal = new Date(Date.UTC(cur.year, cur.month - 1, cur.day + 1));
  const y = nextCal.getUTCFullYear();
  const m = nextCal.getUTCMonth() + 1;
  const d = nextCal.getUTCDate();

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

function isRowBlocked(row, nowSec) {
  if (!row || row.state === 'ready') return false;
  if (row.until == null) return false;
  return nowSec < Number(row.until);
}

function formatStatusFromMap(models, stateMap, nowMs) {
  const nowSec = Math.floor(nowMs / 1000);
  const exhausted = [];
  const states = {};
  let availableCount = 0;

  for (const model of models) {
    const row = stateMap.get(model);
    if (row && isRowBlocked(row, nowSec)) {
      const resetIso = new Date(Number(row.until) * 1000).toISOString();
      states[model] = {
        state: row.state,
        until: resetIso,
        lastError: row.last_error || null,
        avgMs: row.avg_ms ?? null
      };
      if (row.state === 'exhausted') {
        exhausted.push({ model, resetAt: resetIso });
      }
    } else {
      availableCount++;
      states[model] = {
        state: 'ready',
        until: null,
        lastError: row?.last_error || null,
        avgMs: row?.avg_ms ?? null
      };
    }
  }

  return {
    models,
    exhausted,
    allExhausted: availableCount === 0,
    states
  };
}

/**
 * D1-backed model state store using the `model_state` table.
 */
export class D1ModelStateStore {
  constructor(db) {
    this.db = db;
  }

  async _loadAll() {
    const { results } = await this.db
      .prepare('SELECT model, state, until, last_error, avg_ms FROM model_state')
      .all();
    const map = new Map();
    for (const row of results || []) {
      map.set(row.model, row);
    }
    return map;
  }

  async getAvailableModels(models, nowMs = Date.now()) {
    const nowSec = Math.floor(nowMs / 1000);
    const map = await this._loadAll();
    return models.filter((m) => !isRowBlocked(map.get(m), nowSec));
  }

  async isBlocked(model, nowMs = Date.now()) {
    const nowSec = Math.floor(nowMs / 1000);
    const row = await this.db
      .prepare('SELECT model, state, until, last_error, avg_ms FROM model_state WHERE model = ?')
      .bind(model)
      .first();
    return isRowBlocked(row, nowSec);
  }

  async isExhausted(model, nowMs = Date.now()) {
    const nowSec = Math.floor(nowMs / 1000);
    const row = await this.db
      .prepare('SELECT state, until FROM model_state WHERE model = ?')
      .bind(model)
      .first();
    return Boolean(row && row.state === 'exhausted' && row.until != null && nowSec < Number(row.until));
  }

  async areAllExhausted(models, nowMs = Date.now()) {
    const available = await this.getAvailableModels(models, nowMs);
    return available.length === 0;
  }

  async markExhausted(model, lastError = 'HTTP 429', nowMs = Date.now()) {
    const resetAtMs = getNextMidnightPacific(nowMs);
    const untilSec = Math.floor(resetAtMs / 1000);
    await this.db
      .prepare(
        `INSERT INTO model_state (model, state, until, last_error, avg_ms)
         VALUES (?, 'exhausted', ?, ?, NULL)
         ON CONFLICT(model) DO UPDATE SET
           state = 'exhausted',
           until = excluded.until,
           last_error = excluded.last_error`
      )
      .bind(model, untilSec, String(lastError || '').slice(0, 300))
      .run();
    return resetAtMs;
  }

  async markCooling(model, cooldownSec = 30, lastError = 'HTTP 503', nowMs = Date.now()) {
    const untilSec = Math.floor(nowMs / 1000) + Math.max(1, cooldownSec);
    await this.db
      .prepare(
        `INSERT INTO model_state (model, state, until, last_error, avg_ms)
         VALUES (?, 'cooling', ?, ?, NULL)
         ON CONFLICT(model) DO UPDATE SET
           state = 'cooling',
           until = excluded.until,
           last_error = excluded.last_error`
      )
      .bind(model, untilSec, String(lastError || '').slice(0, 300))
      .run();
    return untilSec * 1000;
  }

  async markUnavailable(model, cooldownSec = 60, lastError = 'Upstream error', nowMs = Date.now()) {
    const untilSec = Math.floor(nowMs / 1000) + Math.max(1, cooldownSec);
    await this.db
      .prepare(
        `INSERT INTO model_state (model, state, until, last_error, avg_ms)
         VALUES (?, 'unavailable', ?, ?, NULL)
         ON CONFLICT(model) DO UPDATE SET
           state = 'unavailable',
           until = excluded.until,
           last_error = excluded.last_error`
      )
      .bind(model, untilSec, String(lastError || '').slice(0, 300))
      .run();
    return untilSec * 1000;
  }

  async recordSuccess(model, elapsedMs) {
    const existing = await this.db
      .prepare('SELECT avg_ms FROM model_state WHERE model = ?')
      .bind(model)
      .first();
    const prevAvg = existing && existing.avg_ms != null ? Number(existing.avg_ms) : null;
    const nextAvg = prevAvg == null ? elapsedMs : Math.round(prevAvg * 0.7 + elapsedMs * 0.3);

    await this.db
      .prepare(
        `INSERT INTO model_state (model, state, until, last_error, avg_ms)
         VALUES (?, 'ready', NULL, NULL, ?)
         ON CONFLICT(model) DO UPDATE SET
           state = 'ready',
           until = NULL,
           last_error = NULL,
           avg_ms = excluded.avg_ms`
      )
      .bind(model, nextAvg)
      .run();
  }

  async getStatus(models, nowMs = Date.now()) {
    const map = await this._loadAll();
    return formatStatusFromMap(models, map, nowMs);
  }
}

/**
 * In-memory model state store with the exact same async API as D1ModelStateStore
 * (used by local CLI scripts and unit tests).
 */
export class InMemoryModelStateStore {
  constructor() {
    this.rows = new Map();
  }

  reset() {
    this.rows.clear();
  }

  async getAvailableModels(models, nowMs = Date.now()) {
    const nowSec = Math.floor(nowMs / 1000);
    return models.filter((m) => !isRowBlocked(this.rows.get(m), nowSec));
  }

  async isBlocked(model, nowMs = Date.now()) {
    const nowSec = Math.floor(nowMs / 1000);
    return isRowBlocked(this.rows.get(model), nowSec);
  }

  async isExhausted(model, nowMs = Date.now()) {
    const nowSec = Math.floor(nowMs / 1000);
    const row = this.rows.get(model);
    return Boolean(row && row.state === 'exhausted' && row.until != null && nowSec < Number(row.until));
  }

  async areAllExhausted(models, nowMs = Date.now()) {
    const available = await this.getAvailableModels(models, nowMs);
    return available.length === 0;
  }

  async markExhausted(model, lastError = 'HTTP 429', nowMs = Date.now()) {
    const resetAtMs = getNextMidnightPacific(nowMs);
    const untilSec = Math.floor(resetAtMs / 1000);
    const prev = this.rows.get(model);
    this.rows.set(model, {
      model,
      state: 'exhausted',
      until: untilSec,
      last_error: String(lastError || '').slice(0, 300),
      avg_ms: prev?.avg_ms ?? null
    });
    return resetAtMs;
  }

  async markCooling(model, cooldownSec = 30, lastError = 'HTTP 503', nowMs = Date.now()) {
    const untilSec = Math.floor(nowMs / 1000) + Math.max(1, cooldownSec);
    const prev = this.rows.get(model);
    this.rows.set(model, {
      model,
      state: 'cooling',
      until: untilSec,
      last_error: String(lastError || '').slice(0, 300),
      avg_ms: prev?.avg_ms ?? null
    });
    return untilSec * 1000;
  }

  async markUnavailable(model, cooldownSec = 60, lastError = 'Upstream error', nowMs = Date.now()) {
    const untilSec = Math.floor(nowMs / 1000) + Math.max(1, cooldownSec);
    const prev = this.rows.get(model);
    this.rows.set(model, {
      model,
      state: 'unavailable',
      until: untilSec,
      last_error: String(lastError || '').slice(0, 300),
      avg_ms: prev?.avg_ms ?? null
    });
    return untilSec * 1000;
  }

  async recordSuccess(model, elapsedMs) {
    const prev = this.rows.get(model);
    const prevAvg = prev?.avg_ms ?? null;
    const nextAvg = prevAvg == null ? elapsedMs : Math.round(prevAvg * 0.7 + elapsedMs * 0.3);
    this.rows.set(model, {
      model,
      state: 'ready',
      until: null,
      last_error: null,
      avg_ms: nextAvg
    });
  }

  async getStatus(models, nowMs = Date.now()) {
    return formatStatusFromMap(models, this.rows, nowMs);
  }
}
