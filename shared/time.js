/**
 * Shared time formatting and leaderboard result validation helpers.
 * Pure ES module (Workers + Node compatible, no Node-only APIs).
 */

export const MAX_NAME_LENGTH = 100;
export const MAX_TURNS = 10000;
export const MAX_ANSWERS = 10000;
export const MAX_TIME_SECONDS = 359999; // 99:59:59

const HHMMSS_RE = /^\d{2}:\d{2}:\d{2}$/;

/**
 * Format total seconds to zero-padded HH:MM:SS (sorts lexicographically in SQLite/D1).
 */
export function secondsToHHMMSS(totalSeconds) {
  const raw = Number(totalSeconds);
  const clamped = Number.isFinite(raw) ? Math.min(MAX_TIME_SECONDS, Math.max(0, Math.floor(raw))) : 0;
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0')
  ].join(':');
}

/**
 * Format HH:MM:SS or total seconds to MM:SS for user display.
 */
export function formatMMSS(timeVal) {
  if (typeof timeVal === 'number' && Number.isFinite(timeVal)) {
    const secs = Math.max(0, Math.floor(timeVal));
    const minutes = Math.floor(secs / 60);
    const seconds = secs % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  if (typeof timeVal === 'string') {
    const parts = timeVal.split(':');
    if (parts.length === 3) {
      const minutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      const seconds = parseInt(parts[2], 10);
      if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
    }
    if (parts.length === 2) {
      return timeVal;
    }
  }
  return '00:00';
}

/**
 * Validate and normalize a game result payload before inserting into D1.
 * Returns { ok: true, value } or { ok: false, error }.
 */
export function validateGameResult(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Invalid request body.' };
  }

  const trimmedName = String(input.name ?? '').trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmedName) {
    return { ok: false, error: 'Player name is required.' };
  }

  const turns = Number(input.turnsTaken);
  if (!Number.isInteger(turns) || turns < 1 || turns > MAX_TURNS) {
    return { ok: false, error: `turnsTaken must be an integer between 1 and ${MAX_TURNS}.` };
  }

  const correct = input.correctAnswers === undefined ? 0 : Number(input.correctAnswers);
  if (!Number.isInteger(correct) || correct < 0 || correct > MAX_ANSWERS) {
    return { ok: false, error: `correctAnswers must be an integer between 0 and ${MAX_ANSWERS}.` };
  }

  const wrong = input.wrongAnswers === undefined ? 0 : Number(input.wrongAnswers);
  if (!Number.isInteger(wrong) || wrong < 0 || wrong > MAX_ANSWERS) {
    return { ok: false, error: `wrongAnswers must be an integer between 0 and ${MAX_ANSWERS}.` };
  }

  let timeFormatted;
  if (typeof input.timeTaken === 'string' && input.timeTaken.trim() !== '') {
    const candidate = input.timeTaken.trim();
    if (!HHMMSS_RE.test(candidate)) {
      return { ok: false, error: 'timeTaken must be in HH:MM:SS format.' };
    }
    const [, mm, ss] = candidate.split(':').map(Number);
    if (mm > 59 || ss > 59) {
      return { ok: false, error: 'timeTaken must have valid minutes and seconds (00-59).' };
    }
    timeFormatted = candidate;
  } else {
    const secs = input.timeTakenSeconds === undefined ? 0 : Number(input.timeTakenSeconds);
    if (!Number.isFinite(secs) || secs < 0 || secs > MAX_TIME_SECONDS) {
      return { ok: false, error: `timeTakenSeconds must be between 0 and ${MAX_TIME_SECONDS}.` };
    }
    timeFormatted = secondsToHHMMSS(secs);
  }

  return {
    ok: true,
    value: {
      name: trimmedName,
      turnsTaken: turns,
      correctAnswers: correct,
      wrongAnswers: wrong,
      timeTaken: timeFormatted,
      displayTime: formatMMSS(timeFormatted)
    }
  };
}
