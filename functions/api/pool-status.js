import { getConfiguredModels } from '../../shared/config.js';
import { jsonResponse } from '../../shared/http.js';
import { D1ModelStateStore } from '../../shared/modelState.js';
import { getPoolCounts } from '../../shared/d1Pool.js';

/**
 * GET /api/pool-status
 * Returns question pool counts per topic/difficulty and model fallback/quota state from D1.
 */
export async function onRequestGet(context) {
  const env = context.env || {};
  const db = env.DB;
  const models = getConfiguredModels(env);

  let counts = null;
  let poolAvailable = false;
  let quotaStatus = {
    models,
    exhausted: [],
    allExhausted: false,
    states: {}
  };

  if (db) {
    try {
      counts = await getPoolCounts(db);
      poolAvailable = true;
    } catch (err) {
      console.warn('[API /pool-status] Pool DB error:', err?.message || err);
    }

    try {
      const modelStore = new D1ModelStateStore(db);
      quotaStatus = await modelStore.getStatus(models);
    } catch (err) {
      console.warn('[API /pool-status] Model state DB error:', err?.message || err);
    }
  }

  return jsonResponse({
    success: true,
    poolAvailable,
    counts,
    models: quotaStatus.models,
    exhaustedModels: quotaStatus.exhausted,
    allModelsExhausted: quotaStatus.allExhausted,
    modelStates: quotaStatus.states
  });
}
