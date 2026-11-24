import { formatMMSS, validateGameResult } from '../../shared/time.js';
import { jsonResponse, readJsonBody } from '../../shared/http.js';

async function fetchLeaderboard(db, limit = 10) {
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const { results } = await db
    .prepare(
      `SELECT id, name, turns_taken, correct_answers, wrong_answers, time_taken
       FROM matrices_snl
       ORDER BY time_taken ASC, turns_taken ASC
       LIMIT ?`
    )
    .bind(safeLimit)
    .all();

  return (results || []).map((row, index) => ({
    rank: index + 1,
    id: row.id,
    name: row.name,
    turnsTaken: row.turns_taken,
    correctAnswers: row.correct_answers,
    wrongAnswers: row.wrong_answers,
    displayTime: formatMMSS(row.time_taken)
  }));
}

/**
 * GET /api/leaderboard
 * Fetch top 10 players ordered by fastest time first, then fewest turns.
 */
export async function onRequestGet(context) {
  try {
    const db = context.env?.DB;
    if (!db) {
      return jsonResponse({ success: false, error: 'Database binding DB is not configured.' }, 500);
    }

    const url = new URL(context.request.url);
    const limit = parseInt(url.searchParams.get('limit'), 10) || 10;
    const leaderboard = await fetchLeaderboard(db, limit);
    return jsonResponse({ success: true, leaderboard });
  } catch (err) {
    console.error('[API /leaderboard GET Error]:', err?.message || err);
    return jsonResponse(
      {
        success: false,
        error: 'Failed to fetch leaderboard.',
        details: err?.message || String(err)
      },
      500
    );
  }
}

/**
 * POST /api/leaderboard
 * Save a new game victory result with server-side validation and return updated top 10.
 */
export async function onRequestPost(context) {
  try {
    const db = context.env?.DB;
    if (!db) {
      return jsonResponse({ success: false, error: 'Database binding DB is not configured.' }, 500);
    }

    const body = await readJsonBody(context.request);
    const validated = validateGameResult(body);
    if (!validated.ok) {
      return jsonResponse({ success: false, error: validated.error }, 400);
    }

    const { name, turnsTaken, correctAnswers, wrongAnswers, timeTaken, displayTime } = validated.value;

    const insertRes = await db
      .prepare(
        `INSERT INTO matrices_snl (name, turns_taken, correct_answers, wrong_answers, time_taken)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(name, turnsTaken, correctAnswers, wrongAnswers, timeTaken)
      .run();

    const saved = {
      id: insertRes?.meta?.last_row_id ?? null,
      name,
      turns_taken: turnsTaken,
      correct_answers: correctAnswers,
      wrong_answers: wrongAnswers,
      time_taken: timeTaken,
      display_time: displayTime
    };

    const updatedLeaderboard = await fetchLeaderboard(db, 10);

    return jsonResponse({
      success: true,
      result: saved,
      leaderboard: updatedLeaderboard
    });
  } catch (err) {
    console.error('[API /leaderboard POST Error]:', err?.message || err);
    return jsonResponse(
      {
        success: false,
        error: 'Failed to save game result.',
        details: err?.message || String(err)
      },
      500
    );
  }
}
