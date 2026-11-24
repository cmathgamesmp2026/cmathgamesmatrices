import express from 'express';
import { generateTurn, shuffleOptions, ServiceError } from '../services/gemini.js';
import {
  startNewGame,
  getSession,
  assignTurn,
  getFallbackTopics,
  isValidGameId,
  isDuplicateQuestion,
  recordQuestion,
  APPLICATION_TOPIC_NUMBERS
} from '../services/gameSession.js';
import {
  POOL_MIN_PER_TOPIC,
  isPoolAvailable,
  computeSignature,
  saveToPool,
  findUnseenForTopic,
  incrementTimesServed
} from '../services/questionPool.js';

const router = express.Router();

// Track active background refill keys ("topic:difficulty") so we don't fire duplicate bursts
const activeRefills = new Set();

/**
 * Trigger a non-blocking background generation to top up the pool for (topic, difficulty).
 */
function triggerBackgroundRefill({ assignment, difficulty, avoidQuestions }) {
  const key = `${assignment.topic.number}:${difficulty.toLowerCase()}`;
  if (activeRefills.has(key)) return;
  activeRefills.add(key);

  (async () => {
    try {
      const content = await generateTurn({
        assignment,
        difficulty,
        avoidQuestions
      });
      if (isPoolAvailable()) {
        const context = APPLICATION_TOPIC_NUMBERS.includes(assignment.topic.number)
          ? assignment.questionContext
          : null;
        await saveToPool({
          topic: assignment.topic.number,
          difficulty,
          payload: content,
          context,
          initialTimesServed: 0
        });
      }
    } catch (err) {
      console.warn(`[Background Refill ${key}] skipped: ${err.message}`);
    } finally {
      activeRefills.delete(key);
    }
  })();
}

/**
 * POST /api/question/start
 * Creates a new server-side gameId with empty seen sets and returns it.
 */
router.post('/start', (req, res) => {
  const { gameId } = startNewGame();
  res.json({ success: true, gameId });
});

/**
 * POST /api/question
 * Body: { gameId, turn, difficulty }
 *
 * Serving order:
 *  1. Pick the turn's topic (shuffled order, no repeat until all 10 used).
 *  2. Look in the pool for that topic and difficulty, excluding everything seen in this game.
 *     Prefer lowest times_served, random among ties. Increment times_served.
 *  3. If fewer than POOL_MIN_PER_TOPIC unseen items remain, generate more in the background.
 *  4. If no unseen item exists for the topic, generate live and save to pool.
 *     If live generation fails, move to the next topic in the shuffled order with an unseen item.
 *  5. If nothing unseen can be found or generated, return busy message with Retry. Never repeat.
 */
router.post('/', async (req, res) => {
  const { gameId, turn, difficulty } = req.body || {};

  if (!isValidGameId(gameId)) {
    return res.status(400).json({ success: false, error: 'A valid gameId is required.' });
  }
  if (!Number.isInteger(turn) || turn < 1 || turn > 500) {
    return res.status(400).json({ success: false, error: 'A valid turn number is required.' });
  }

  const normalizedDiff = difficulty === 'Hard' ? 'Hard' : 'Easy';
  const session = getSession(gameId);
  const assignment = assignTurn(session, turn);

  // Step 2: Look in the pool first (if pool table is available)
  if (isPoolAvailable()) {
    try {
      const { unseenCount, picked } = await findUnseenForTopic({
        topic: assignment.topic.number,
        difficulty: normalizedDiff,
        servedIds: session.servedIds,
        servedSignatures: session.servedSignatures,
        usedContexts: session.usedContexts
      });

      if (picked && picked.payload) {
        await incrementTimesServed(picked.id);
        recordQuestion(session, picked.payload.question, {
          id: picked.id,
          signature: picked.signature,
          context: picked.context
        });

        // Step 3: If fewer than POOL_MIN_PER_TOPIC unseen items remain after serving this one, refill in background
        const remainingUnseen = unseenCount - 1;
        if (remainingUnseen < POOL_MIN_PER_TOPIC) {
          triggerBackgroundRefill({
            assignment,
            difficulty: normalizedDiff,
            avoidQuestions: session.recentQuestions
          });
        }

        // Re-shuffle options so correctIndex is randomized even on reused items
        const servedContent = {
          ...picked.payload,
          question: shuffleOptions(picked.payload.question)
        };
        return res.json({ success: true, content: servedContent, source: 'pool' });
      }
    } catch (poolErr) {
      console.warn('[QuestionPool Read Error]:', poolErr.message);
    }
  }

  // Step 4a: No unseen pool item for this topic -> generate live
  try {
    const content = await generateTurn({
      assignment,
      difficulty: normalizedDiff,
      avoidQuestions: session.recentQuestions,
      isDuplicate: (question) =>
        isDuplicateQuestion(session, question, { signature: computeSignature(question) })
    });

    const signature = computeSignature(content.question);
    const context = APPLICATION_TOPIC_NUMBERS.includes(assignment.topic.number)
      ? assignment.questionContext
      : null;

    let savedId = null;
    if (isPoolAvailable()) {
      try {
        const saved = await saveToPool({
          topic: assignment.topic.number,
          difficulty: normalizedDiff,
          payload: content,
          context,
          initialTimesServed: 1
        });
        savedId = saved.id;
      } catch (saveErr) {
        console.warn('[QuestionPool Save Error]:', saveErr.message);
      }
    }

    recordQuestion(session, content.question, { id: savedId, signature, context });
    return res.json({ success: true, content, source: 'live' });
  } catch (liveErr) {
    console.warn(`[API /question] Live generation failed for topic ${assignment.topic.number}: ${liveErr.message}`);

    // Step 4b: Live failed -> try the next topic in the shuffled order that still has an unseen item
    if (isPoolAvailable()) {
      const fallbackTopics = getFallbackTopics(session, assignment.topic.number);
      for (const fallbackTopic of fallbackTopics) {
        try {
          const { picked } = await findUnseenForTopic({
            topic: fallbackTopic.number,
            difficulty: normalizedDiff,
            servedIds: session.servedIds,
            servedSignatures: session.servedSignatures,
            usedContexts: session.usedContexts
          });
          if (picked && picked.payload) {
            await incrementTimesServed(picked.id);
            assignment.topic = fallbackTopic;
            recordQuestion(session, picked.payload.question, {
              id: picked.id,
              signature: picked.signature,
              context: picked.context
            });
            const servedContent = {
              ...picked.payload,
              question: shuffleOptions(picked.payload.question)
            };
            return res.json({ success: true, content: servedContent, source: 'pool-fallback' });
          }
        } catch (fbErr) {
          console.warn(`[QuestionPool Fallback Error topic ${fallbackTopic.number}]:`, fbErr.message);
        }
      }
    }

    // Step 5: Nothing unseen can be found or generated -> return busy message, never repeat
    const status = liveErr instanceof ServiceError ? liveErr.status : 503;
    return res.status(status).json({
      success: false,
      code: liveErr instanceof ServiceError ? liveErr.code : 'BUSY',
      error: 'The question service is busy, please try again soon'
    });
  }
});

export default router;
