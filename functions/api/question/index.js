import { jsonResponse, readJsonBody } from '../../../shared/http.js';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_POOL_MIN_PER_TOPIC,
  getConfiguredModels,
  getIntSetting
} from '../../../shared/config.js';
import {
  APPLICATION_TOPIC_NUMBERS,
  isValidGameId,
  assignTurnForGame,
  getFallbackTopicsForGame
} from '../../../shared/topics.js';
import { computeSignature } from '../../../shared/signature.js';
import { D1ModelStateStore } from '../../../shared/modelState.js';
import {
  generateBatch,
  shuffleOptions,
  ServiceError,
  DEFAULT_LIVE_DEADLINE_MS
} from '../../../shared/gemini.js';
import {
  saveToPool,
  findUnseenForTopic,
  incrementTimesServed,
  getPoolContexts,
  getGameSeen,
  recordGameSeen,
  acquireLock,
  releaseLock
} from '../../../shared/d1Pool.js';

const BG_REFILL_LOCK_NAME = 'bg_refill';
const BG_REFILL_LOCK_TTL_SEC = 60;

async function collectAvoidContexts(db, topicNumber, difficulty, usedContexts) {
  if (!APPLICATION_TOPIC_NUMBERS.includes(topicNumber)) return [];
  const combined = new Set([...usedContexts]);
  try {
    const pooled = await getPoolContexts(db, topicNumber, difficulty);
    pooled.forEach((c) => combined.add(c));
  } catch {
    // ignore read errors when gathering hint contexts
  }
  return [...combined];
}

/**
 * Background pool top-up run inside context.waitUntil().
 * Uses a lock row in `locks` so at most one background generation runs at a time.
 */
async function runBackgroundRefill({ db, env, topic, difficulty, usedContexts, modelStore, models, batchSize }) {
  if (await modelStore.areAllExhausted(models)) return;

  const acquired = await acquireLock(db, BG_REFILL_LOCK_NAME, BG_REFILL_LOCK_TTL_SEC);
  if (!acquired) return;

  try {
    const avoidContexts = await collectAvoidContexts(db, topic.number, difficulty, usedContexts);
    const items = await generateBatch(
      {
        topic,
        difficulty,
        batchSize,
        avoidContexts
      },
      {
        env,
        models,
        modelStore
      }
    );

    for (const item of items) {
      await saveToPool(db, {
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
  } catch (err) {
    console.warn(`[Background Refill ${topic.number}:${difficulty.toLowerCase()}] skipped: ${err?.message || err}`);
  } finally {
    try {
      await releaseLock(db, BG_REFILL_LOCK_NAME);
    } catch {
      // ignore lock release errors; TTL will expire it automatically
    }
  }
}

/**
 * POST /api/question
 * Body: { gameId, turn, difficulty }
 *
 * Serving order (exact parity with Express server):
 *  1. Pick the turn's topic (shuffled order per gameId, no repeat until all 10 used, idempotent per turn).
 *  2. Look in the pool for that topic and difficulty, excluding everything seen in game_seen.
 *     Prefer lowest times_served, random among ties. Increment times_served and record in game_seen.
 *  3. If fewer than POOL_MIN_PER_TOPIC unseen items remain, schedule a locked background refill via waitUntil().
 *  4. If no unseen item exists for the topic, generate a batch live (within deadline, unless all models are blocked)
 *     and save all verified items to the pool. If that fails, move to the next topic in the
 *     shuffled order that still has an unseen item in the pool.
 *  5. If nothing unseen can be found or generated, return busy message with Retry. Never repeat.
 */
export async function onRequestPost(context) {
  const env = context.env || {};
  const db = env.DB;

  if (!db) {
    return jsonResponse({ success: false, error: 'Database binding DB is not configured.' }, 500);
  }

  const body = (await readJsonBody(context.request)) || {};
  const { gameId, turn, difficulty } = body;

  if (!isValidGameId(gameId)) {
    return jsonResponse({ success: false, error: 'A valid gameId is required.' }, 400);
  }
  if (!Number.isInteger(turn) || turn < 1 || turn > 500) {
    return jsonResponse({ success: false, error: 'A valid turn number is required.' }, 400);
  }

  const normalizedDiff = difficulty === 'Hard' ? 'Hard' : 'Easy';
  const models = getConfiguredModels(env);
  const poolMinPerTopic = getIntSetting(env, 'POOL_MIN_PER_TOPIC', DEFAULT_POOL_MIN_PER_TOPIC, 1);
  const batchSize = getIntSetting(env, 'BATCH_SIZE', DEFAULT_BATCH_SIZE, 1);
  const liveDeadlineMs = getIntSetting(env, 'GEMINI_LIVE_DEADLINE_MS', DEFAULT_LIVE_DEADLINE_MS, 2000);
  const modelStore = new D1ModelStateStore(db);

  const seen = await getGameSeen(db, gameId);
  const assignment = assignTurnForGame(gameId, turn, seen.usedContexts);

  // Step 2: Look in the pool first
  try {
    const { unseenCount, picked } = await findUnseenForTopic(db, {
      topic: assignment.topic.number,
      difficulty: normalizedDiff,
      servedIds: seen.servedIds,
      servedSignatures: seen.servedSignatures,
      usedContexts: seen.usedContexts
    });

    if (picked && picked.payload) {
      await incrementTimesServed(db, picked.id);
      await recordGameSeen(db, {
        gameId,
        poolId: picked.id,
        signature: picked.signature,
        context: picked.context
      });

      // Step 3: If fewer than POOL_MIN_PER_TOPIC unseen items remain, refill in background
      const remainingUnseen = unseenCount - 1;
      if (remainingUnseen < poolMinPerTopic) {
        const nextUsedContexts = new Set(seen.usedContexts);
        if (picked.context) nextUsedContexts.add(String(picked.context).toLowerCase());

        const refillPromise = runBackgroundRefill({
          db,
          env,
          topic: assignment.topic,
          difficulty: normalizedDiff,
          usedContexts: nextUsedContexts,
          modelStore,
          models,
          batchSize
        });

        if (typeof context.waitUntil === 'function') {
          context.waitUntil(refillPromise);
        }
      }

      const servedContent = {
        ...picked.payload,
        question: shuffleOptions(picked.payload.question)
      };
      return jsonResponse({ success: true, content: servedContent, source: 'pool' });
    }
  } catch (poolErr) {
    console.warn('[QuestionPool Read Error]:', poolErr?.message || poolErr);
  }

  // Step 4a: No unseen pool item for this topic -> live batch generation with deadline
  let liveErr = null;
  if (!(await modelStore.areAllExhausted(models))) {
    try {
      const avoidContexts = await collectAvoidContexts(
        db,
        assignment.topic.number,
        normalizedDiff,
        seen.usedContexts
      );
      const items = await generateBatch(
        {
          topic: assignment.topic,
          difficulty: normalizedDiff,
          batchSize,
          avoidContexts
        },
        {
          env,
          models,
          modelStore,
          deadlineMs: Date.now() + liveDeadlineMs
        }
      );

      let chosenContent = null;
      let chosenMeta = null;
      const isAppTopic = APPLICATION_TOPIC_NUMBERS.includes(assignment.topic.number);

      for (const item of items) {
        const payload = {
          topic: item.topic,
          topicNumber: item.topicNumber,
          lesson: item.lesson,
          question: item.question
        };
        const signature = await computeSignature(item.question);
        const itemContext = isAppTopic ? item.context || assignment.questionContext || null : null;

        const isDuplicate =
          seen.servedSignatures.has(signature) ||
          (isAppTopic && itemContext && seen.usedContexts.has(String(itemContext).toLowerCase()));
        const willServeNow = !chosenContent && !isDuplicate;

        let savedId = null;
        try {
          const saved = await saveToPool(db, {
            topic: assignment.topic.number,
            difficulty: normalizedDiff,
            payload,
            context: itemContext,
            initialTimesServed: willServeNow ? 1 : 0
          });
          savedId = saved.id;
        } catch (saveErr) {
          console.warn('[QuestionPool Save Error]:', saveErr?.message || saveErr);
        }

        if (willServeNow) {
          chosenContent = payload;
          chosenMeta = { poolId: savedId, signature, context: itemContext };
        }
      }

      if (chosenContent) {
        await recordGameSeen(db, {
          gameId,
          poolId: chosenMeta.poolId,
          signature: chosenMeta.signature,
          context: chosenMeta.context
        });
        return jsonResponse({ success: true, content: chosenContent, source: 'live-batch' });
      }
      liveErr = new ServiceError('VERIFY_FAILED', 'All generated items were duplicates.', 502);
    } catch (err) {
      liveErr = err;
      console.warn(
        `[API /question] Live batch generation failed for topic ${assignment.topic.number}: ${err?.message || err}`
      );
    }
  } else {
    liveErr = new ServiceError('RATE_LIMIT', 'The question service is busy, please try again soon', 429);
  }

  // Step 4b: Live failed or all models exhausted -> try next topic in shuffled order with an unseen item
  const fallbackTopics = getFallbackTopicsForGame(gameId, turn, assignment.topic.number);
  for (const fallbackTopic of fallbackTopics) {
    try {
      const { picked } = await findUnseenForTopic(db, {
        topic: fallbackTopic.number,
        difficulty: normalizedDiff,
        servedIds: seen.servedIds,
        servedSignatures: seen.servedSignatures,
        usedContexts: seen.usedContexts
      });
      if (picked && picked.payload) {
        await incrementTimesServed(db, picked.id);
        await recordGameSeen(db, {
          gameId,
          poolId: picked.id,
          signature: picked.signature,
          context: picked.context
        });
        const servedContent = {
          ...picked.payload,
          question: shuffleOptions(picked.payload.question)
        };
        return jsonResponse({ success: true, content: servedContent, source: 'pool-fallback' });
      }
    } catch (fbErr) {
      console.warn(`[QuestionPool Fallback Error topic ${fallbackTopic.number}]:`, fbErr?.message || fbErr);
    }
  }

  // Step 5: Nothing unseen can be found or generated -> return busy message, never repeat
  const status = liveErr instanceof ServiceError ? liveErr.status : 503;
  return jsonResponse(
    {
      success: false,
      code: liveErr instanceof ServiceError ? liveErr.code : 'BUSY',
      error: 'The question service is busy, please try again soon'
    },
    status
  );
}
