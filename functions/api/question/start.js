import { jsonResponse } from '../../../shared/http.js';
import { cleanupOldGameSeen } from '../../../shared/d1Pool.js';

/**
 * POST /api/question/start
 * Cleans up game_seen rows older than 3 hours and returns a new server-issued gameId.
 */
export async function onRequestPost(context) {
  try {
    const db = context.env?.DB;
    if (db) {
      try {
        await cleanupOldGameSeen(db);
      } catch (err) {
        console.warn('[API /question/start] cleanupOldGameSeen warning:', err?.message || err);
      }
    }

    const gameId = crypto.randomUUID();
    return jsonResponse({ success: true, gameId });
  } catch (err) {
    console.error('[API /question/start Error]:', err?.message || err);
    return jsonResponse({ success: false, error: 'Failed to start game session.' }, 500);
  }
}
