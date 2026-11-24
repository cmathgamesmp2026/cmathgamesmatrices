/**
 * Pool Seeding Script (`npm run seed-pool`)
 * Generates verified batches for every topic (1..10) and difficulty (easy, hard)
 * until each bucket has POOL_TARGET_PER_TOPIC (default 10) items.
 * Respects the Gemini request queue and model fallback; stops cleanly when all
 * models are exhausted and can be re-run on later days to continue.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

import {
  BATCH_SIZE,
  generateBatch,
  getConfiguredModels,
  modelQuota,
  ServiceError
} from '../services/gemini.js';
import { TOPICS, APPLICATION_TOPIC_NUMBERS } from '../services/gameSession.js';
import {
  checkPoolTableExists,
  getPoolCounts,
  getPoolContexts,
  saveToPool
} from '../services/questionPool.js';

export const POOL_TARGET_PER_TOPIC = Math.max(
  1,
  parseInt(process.env.POOL_TARGET_PER_TOPIC || '10', 10)
);

const DIFFICULTIES = [
  { label: 'Easy', key: 'easy' },
  { label: 'Hard', key: 'hard' }
];

/**
 * Seed the question pool up to targetPerTopic for every (topic, difficulty).
 * Injectable dependencies for unit testing.
 */
export async function runSeedPool({
  targetPerTopic = POOL_TARGET_PER_TOPIC,
  batchSize = BATCH_SIZE,
  models = getConfiguredModels(),
  quota = modelQuota,
  getCounts = getPoolCounts,
  getContexts = getPoolContexts,
  generateBatchFn = generateBatch,
  saveFn = saveToPool,
  logger = console
} = {}) {
  const counts = await getCounts();
  let totalAdded = 0;
  let stoppedEarly = false;

  outer: for (const topic of TOPICS) {
    for (const diff of DIFFICULTIES) {
      let current = counts[topic.number]?.[diff.key] || 0;
      let stalledAttempts = 0;

      while (current < targetPerTopic) {
        if (quota.areAllExhausted(models)) {
          stoppedEarly = true;
          break outer;
        }

        const needed = Math.min(batchSize, targetPerTopic - current);
        const avoidContexts = APPLICATION_TOPIC_NUMBERS.includes(topic.number)
          ? await getContexts(topic.number, diff.label)
          : [];

        logger.log(
          `[Seed] Topic ${topic.number} (${diff.key}): ${current}/${targetPerTopic} — generating batch of ${needed}...`
        );

        try {
          const items = await generateBatchFn({
            topic,
            difficulty: diff.label,
            batchSize: needed,
            avoidContexts
          });

          let addedThisBatch = 0;
          for (const item of items) {
            const res = await saveFn({
              topic: topic.number,
              difficulty: diff.label,
              payload: {
                topic: item.topic,
                topicNumber: item.topicNumber,
                lesson: item.lesson,
                question: item.question
              },
              context: item.context || null,
              initialTimesServed: 0
            });
            if (res.saved) {
              addedThisBatch += 1;
              totalAdded += 1;
              current += 1;
              counts[topic.number][diff.key] = current;
            }
          }

          logger.log(
            `[Seed] Topic ${topic.number} (${diff.key}): saved ${addedThisBatch} new item(s) (now ${current}/${targetPerTopic}).`
          );

          if (addedThisBatch === 0) {
            stalledAttempts += 1;
            if (stalledAttempts >= 2) {
              logger.warn(`[Seed] Topic ${topic.number} (${diff.key}): skipping after duplicate batches.`);
              break;
            }
          } else {
            stalledAttempts = 0;
          }
        } catch (err) {
          if (
            quota.areAllExhausted(models) ||
            (err instanceof ServiceError && err.status === 429)
          ) {
            logger.warn(`[Seed] Stopping cleanly: all models exhausted (${err.message}).`);
            stoppedEarly = true;
            break outer;
          }
          logger.warn(`[Seed] Topic ${topic.number} (${diff.key}) batch failed: ${err.message}`);
          break; // Move on to next bucket rather than spinning forever
        }
      }
    }
  }

  let totalMissing = 0;
  const missingByBucket = [];
  for (const topic of TOPICS) {
    for (const diff of DIFFICULTIES) {
      const count = counts[topic.number]?.[diff.key] || 0;
      const missing = Math.max(0, targetPerTopic - count);
      totalMissing += missing;
      if (missing > 0) {
        missingByBucket.push({ topic: topic.number, difficulty: diff.key, have: count, missing });
      }
    }
  }

  const quotaStatus = quota.getStatus(models);
  return {
    totalAdded,
    totalMissing,
    missingByBucket,
    stoppedEarly,
    quotaStatus
  };
}

async function main() {
  console.log('--- Seeding cmathgames.question_pool ---');
  console.log(`Target per topic & difficulty: ${POOL_TARGET_PER_TOPIC} (batch size: ${BATCH_SIZE})`);
  console.log(`Configured models: ${getConfiguredModels().join(', ')}`);

  const exists = await checkPoolTableExists();
  if (!exists) {
    process.exit(1);
  }

  const summary = await runSeedPool();
  console.log('\n--- Seed Summary ---');
  console.log(`Added this run: ${summary.totalAdded}`);
  console.log(`Still missing:  ${summary.totalMissing}`);

  if (summary.stoppedEarly) {
    console.log('Stopped because all configured Gemini models hit their quota. Re-run tomorrow to continue.');
    if (summary.quotaStatus.exhausted.length > 0) {
      for (const e of summary.quotaStatus.exhausted) {
        console.log(`  - ${e.model}: resets at ${e.resetAt}`);
      }
    }
  } else if (summary.totalMissing === 0) {
    console.log('All 10 topics (easy & hard) reached the target pool count!');
  }

  process.exit(0);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main().catch((err) => {
    console.error('[Seed Fatal Error]:', err.message);
    process.exit(1);
  });
}
