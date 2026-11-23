import express from 'express';
import { generateTurn, ServiceError } from '../services/gemini.js';
import {
  getSession,
  assignTurn,
  isValidGameId,
  isDuplicateQuestion,
  recordQuestion
} from '../services/gameSession.js';

const router = express.Router();

/**
 * POST /api/question
 * Body: { gameId, turn, difficulty }
 * One request returns BOTH the lesson and its test question for that turn:
 *   { success: true, content: { topic, topicNumber, lesson, question } }
 *
 * The server picks the topic (shuffled order, no repeat until all 10 are used),
 * so asking again for the same turn (retry, difficulty change) keeps the same topic.
 */
router.post('/', async (req, res) => {
  const { gameId, turn, difficulty } = req.body || {};

  if (!isValidGameId(gameId)) {
    return res.status(400).json({ success: false, error: 'A valid gameId is required.' });
  }
  if (!Number.isInteger(turn) || turn < 1 || turn > 500) {
    return res.status(400).json({ success: false, error: 'A valid turn number is required.' });
  }

  try {
    const session = getSession(gameId);
    const assignment = assignTurn(session, turn);

    const content = await generateTurn({
      assignment,
      difficulty: difficulty === 'Hard' ? 'Hard' : 'Easy',
      avoidQuestions: session.recentQuestions,
      isDuplicate: (question) => isDuplicateQuestion(session, question)
    });

    recordQuestion(session, content.question);
    res.json({ success: true, content });
  } catch (err) {
    console.error('[API /question Error]:', err.message);
    const status = err instanceof ServiceError ? err.status : 500;
    res.status(status).json({
      success: false,
      code: err instanceof ServiceError ? err.code : 'ERROR',
      error: err instanceof ServiceError ? err.message : 'Something went wrong preparing the lesson.'
    });
  }
});

export default router;
