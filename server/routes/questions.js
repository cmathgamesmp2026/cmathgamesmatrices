import express from 'express';
import {
  generateBatch,
  shuffleOptions,
  ServiceError,
  modelQuota,
  getConfiguredModels
} from '../services/gemini.js';
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
  incrementTimesServed,
  getPoolContexts
} from '../services/questionPool.js';

const router = express.Router();

// Track active background refill keys ("topic:difficulty") so we don't fire duplicate bursts
const activeRefills = new Set();

/**
 * Collect contexts already in the pool plus those used in this game (for topics 9 & 10).
 */
async function collectAvoidContexts(topicNumber, difficulty, session) {
  if (!APPLICATION_TOPIC_NUMBERS.includes(topicNumber)) return [];
  const combined = new Set([...session.usedContexts]);
  if (isPoolAvailable()) {
    try {
      const pooled = await getPoolContexts(topicNumber, difficulty);
      pooled.forEach((c) => combined.add(c));
    } catch {
      // ignore read errors when gathering hint contexts
    }
  }
  return [...combined];
}

/**
 * Trigger a non-blocking background batch generation to top up the pool for (topic, difficulty).
 * Skips quietly if all models are exhausted.
 */
function triggerBackgroundRefill({ topic, difficulty, session }) {
  if (modelQuota.areAllExhausted(getConfiguredModels())) return;

  const key = `${topic.number}:${difficulty.toLowerCase()}`;
  if (activeRefills.has(key)) return;
  activeRefills.add(key);

  (async () => {
    try {
      const avoidContexts = await collectAvoidContexts(topic.number, difficulty, session);
      const items = await generateBatch({
        topic,
        difficulty,
        avoidContexts,
        avoidQuestions: session.recentQuestions
      });
      if (isPoolAvailable()) {
        for (const item of items) {
          await saveToPool({
            topic: topic.number,
            difficulty,
            payload: {
              topic: item.topic,
              topicNumber: item.topicNumber,
              lesson: item.lesson,
              question: item.question
            },
            context: item.context || null,
            initialTimesServed: 0
          });
        }
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
 *  3. If fewer than POOL_MIN_PER_TOPIC unseen items remain, generate a batch in the background.
 *  4. If no unseen item exists for the topic, generate a batch live (unless all models are exhausted)
 *     and save all verified items to the pool. If that fails, move to the next topic in the
 *     shuffled order that still has an unseen item in the pool.
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

        // Step 3: If fewer than POOL_MIN_PER_TOPIC unseen items remain, refill in background
        const remainingUnseen = unseenCount - 1;
        if (remainingUnseen < POOL_MIN_PER_TOPIC) {
          triggerBackgroundRefill({
            topic: assignment.topic,
            difficulty: normalizedDiff,
            session
          });
        }

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

  // Step 4a: No unseen pool item for this topic -> live batch generation (if any model has quota)
  let liveErr = null;
  if (!modelQuota.areAllExhausted(getConfiguredModels())) {
    try {
      const avoidContexts = await collectAvoidContexts(assignment.topic.number, normalizedDiff, session);
      const items = await generateBatch({
        topic: assignment.topic,
        difficulty: normalizedDiff,
        avoidContexts,
        avoidQuestions: session.recentQuestions
      });

      let chosenContent = null;
      let chosenMeta = null;

      for (const item of items) {
        const payload = {
          topic: item.topic,
          topicNumber: item.topicNumber,
          lesson: item.lesson,
          question: item.question
        };
        const signature = computeSignature(item.question);
        const context = APPLICATION_TOPIC_NUMBERS.includes(assignment.topic.number)
          ? item.context || assignment.questionContext || null
          : null;

        const isUnseen = !isDuplicateQuestion(session, item.question, { signature, context });
        const willServeNow = !chosenContent && isUnseen;

        let savedId = null;
        if (isPoolAvailable()) {
          try {
            const saved = await saveToPool({
              topic: assignment.topic.number,
              difficulty: normalizedDiff,
              payload,
              context,
              initialTimesServed: willServeNow ? 1 : 0
            });
            savedId = saved.id;
          } catch (saveErr) {
            console.warn('[QuestionPool Save Error]:', saveErr.message);
          }
        }

        if (willServeNow) {
          chosenContent = payload;
          chosenMeta = { id: savedId, signature, context };
        }
      }

      if (chosenContent) {
        recordQuestion(session, chosenContent.question, chosenMeta);
        return res.json({ success: true, content: chosenContent, source: 'live-batch' });
      }
      liveErr = new ServiceError('VERIFY_FAILED', 'All generated items were duplicates.', 502);
    } catch (err) {
      liveErr = err;
      console.warn(`[API /question] Live batch generation failed for topic ${assignment.topic.number}: ${err.message}`);
    }
  } else {
    liveErr = new ServiceError('RATE_LIMIT', 'The question service is busy, please try again soon', 429);
  }

  // Step 4b: Live failed or all models exhausted -> try next topic in shuffled order with an unseen item
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
});

export default router;
