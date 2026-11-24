import {
  DEFAULT_GEMINI_MODEL,
  SUPPORTED_GEMINI_MODELS,
  getConfiguredModels
} from '../../shared/config.js';
import { jsonResponse } from '../../shared/http.js';

/**
 * GET /api/health
 */
export async function onRequestGet(context) {
  const env = context.env || {};
  const apiKey = String(env.GEMINI_API_KEY || '').trim();
  const models = getConfiguredModels(env);

  return jsonResponse({
    status: 'ok',
    geminiConfigured: Boolean(apiKey && apiKey !== 'your_gemini_api_key_here'),
    model: env.GEMINI_MODEL || models[0] || DEFAULT_GEMINI_MODEL,
    models,
    supportedModels: SUPPORTED_GEMINI_MODELS
  });
}
