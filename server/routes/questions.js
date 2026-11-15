import express from 'express';
import { generateQuestion } from '../services/gemini.js';

const router = express.Router();

/**
 * GET /api/question
 * Generate a single matrices question using Gemini live
 */
router.get('/', async (req, res) => {
  try {
    const difficulty = req.query.difficulty === 'Hard' ? 'Hard' : 'Easy';
    const previousTopic = req.query.previousTopic ? String(req.query.previousTopic) : null;
    let usedQuestions = [];
    if (req.query.usedQuestions) {
      try {
        usedQuestions = JSON.parse(req.query.usedQuestions);
      } catch {
        usedQuestions = [];
      }
    }

    const question = await generateQuestion({ difficulty, previousTopic, usedQuestions });
    res.json({ success: true, question });
  } catch (err) {
    console.error('[API /question Error]:', err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to generate question. Please try again.'
    });
  }
});

/**
 * POST /api/question
 * Also support POST with JSON body for easier passing of usedQuestions array
 */
router.post('/', async (req, res) => {
  try {
    const difficulty = req.body.difficulty === 'Hard' ? 'Hard' : 'Easy';
    const previousTopic = req.body.previousTopic || null;
    const usedQuestions = Array.isArray(req.body.usedQuestions) ? req.body.usedQuestions : [];

    const question = await generateQuestion({ difficulty, previousTopic, usedQuestions });
    res.json({ success: true, question });
  } catch (err) {
    console.error('[API /question Error]:', err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to generate question. Please try again.'
    });
  }
});

export default router;
