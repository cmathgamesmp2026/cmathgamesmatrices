import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool = null;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

/**
 * Format total seconds to HH:MM:SS format for MySQL TIME column
 */
export function secondsToHHMMSS(totalSeconds) {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = secs % 60;
  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0')
  ].join(':');
}

/**
 * Format HH:MM:SS or seconds to MM:SS for user display
 */
export function formatMMSS(timeVal) {
  if (typeof timeVal === 'number') {
    const minutes = Math.floor(timeVal / 60);
    const seconds = timeVal % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  if (typeof timeVal === 'string') {
    const parts = timeVal.split(':');
    if (parts.length === 3) {
      const minutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      const seconds = parseInt(parts[2], 10);
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    if (parts.length === 2) {
      return timeVal;
    }
  }
  return '00:00';
}

/**
 * Initializes the database schema and table
 */
export async function initializeDatabase() {
  const p = getPool();
  const conn = await p.getConnection();
  try {
    await conn.query(`CREATE SCHEMA IF NOT EXISTS cmathgames;`);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS cmathgames.matrices_snl (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        turns_taken INT NOT NULL,
        correct_answers INT NOT NULL DEFAULT 0,
        wrong_answers INT NOT NULL DEFAULT 0,
        time_taken TIME NOT NULL
      );
    `);
    console.log('[Database] Schema "cmathgames" and table "matrices_snl" initialized successfully.');
  } finally {
    conn.release();
  }
}

/**
 * Save game result with parameterized query and server-side validation
 */
export async function saveGameResult({ name, turnsTaken, correctAnswers, wrongAnswers, timeTakenSeconds }) {
  // Validate and sanitize name
  const trimmedName = String(name || '').trim().slice(0, 100);
  if (!trimmedName) {
    throw new Error('Player name cannot be empty');
  }

  const turns = Math.max(1, parseInt(turnsTaken, 10) || 1);
  const correct = Math.max(0, parseInt(correctAnswers, 10) || 0);
  const wrong = Math.max(0, parseInt(wrongAnswers, 10) || 0);
  const timeFormatted = secondsToHHMMSS(timeTakenSeconds || 0);

  const p = getPool();
  const sql = `
    INSERT INTO cmathgames.matrices_snl (name, turns_taken, correct_answers, wrong_answers, time_taken)
    VALUES (?, ?, ?, ?, ?)
  `;
  const [result] = await p.execute(sql, [trimmedName, turns, correct, wrong, timeFormatted]);
  return {
    id: result.insertId,
    name: trimmedName,
    turns_taken: turns,
    correct_answers: correct,
    wrong_answers: wrong,
    time_taken: timeFormatted,
    display_time: formatMMSS(timeTakenSeconds)
  };
}

/**
 * Fetch top 10 leaderboard ordered by fastest time first, then fewest turns
 */
export async function getLeaderboard(limit = 10) {
  const p = getPool();
  const sql = `
    SELECT id, name, turns_taken, correct_answers, wrong_answers, time_taken,
           TIME_TO_SEC(time_taken) AS time_seconds
    FROM cmathgames.matrices_snl
    ORDER BY time_taken ASC, turns_taken ASC
    LIMIT ?
  `;
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const [rows] = await p.execute(sql, [safeLimit]);

  return rows.map((row, index) => ({
    rank: index + 1,
    id: row.id,
    name: row.name,
    turnsTaken: row.turns_taken,
    correctAnswers: row.correct_answers,
    wrongAnswers: row.wrong_answers,
    displayTime: formatMMSS(row.time_taken)
  }));
}
