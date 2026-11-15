import express from 'express';
import { saveGameResult, getLeaderboard } from '../services/db.js';

const router = express.Router();

/**
 * GET /api/leaderboard
 * Fetch top 10 players
 */
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const leaderboard = await getLeaderboard(limit);
    res.json({ success: true, leaderboard });
  } catch (err) {
    console.error('[API /leaderboard GET Error]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leaderboard.',
      details: err.message
    });
  }
});

/**
 * POST /api/leaderboard
 * Save a new game victory result
 */
router.post('/', async (req, res) => {
  try {
    const { name, turnsTaken, correctAnswers, wrongAnswers, timeTakenSeconds } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Player name is required.' });
    }

    const saved = await saveGameResult({
      name,
      turnsTaken,
      correctAnswers,
      wrongAnswers,
      timeTakenSeconds
    });

    const updatedLeaderboard = await getLeaderboard(10);

    res.json({
      success: true,
      result: saved,
      leaderboard: updatedLeaderboard
    });
  } catch (err) {
    console.error('[API /leaderboard POST Error]:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to save game result.',
      details: err.message
    });
  }
});

export default router;
