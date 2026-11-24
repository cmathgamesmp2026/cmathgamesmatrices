/**
 * Pool Seeding Script (`npm run seed-pool`)
 * Runs locally in Node.js (NOT on Cloudflare).
 * Reads Gemini key, pool settings, and Cloudflare D1 API credentials from `.env`.
 * Reuses /shared modules for Gemini calls, model fallback, exact-fraction verification,
 * SHA-256 signatures, and D1 parameterized queries.
 * Stops cleanly when all configured models hit quota and can be re-run to continue.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_GEMINI_MIN_GAP_MS,
  DEFAULT_POOL_TARGET_PER_TOPIC,
  getConfiguredModels,
  getIntSetting
} from '../shared/config.js';
import { TOPICS, APPLICATION_TOPIC_NUMBERS } from '../shared/topics.js';
import { InMemoryModelStateStore } from '../shared/modelState.js';
import { generateBatch, ServiceError } from '../shared/gemini.js';
import { getPoolCounts, getPoolContexts, saveToPool } from '../shared/d1Pool.js';
import { createD1HttpClient } from './d1HttpClient.js';

const DIFFICULTIES = [
  { label: 'Easy', key: 'easy' },
  { label: 'Hard', key: 'hard' }
];

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Seed the remote D1 question_pool up to targetPerTopic for every (topic, difficulty).
 * Injectable dependencies for unit testing.
 */
export async function runSeedPool({
  env = {},
  targetPerTopic = getIntSetting(env, 'POOL_TARGET_PER_TOPIC', DEFAULT_POOL_TARGET_PER_TOPIC, 1),
  batchSize = getIntSetting(env, 'BATCH_SIZE', DEFAULT_BATCH_SIZE, 1),
  minGapMs = getIntSetting(env, 'GEMINI_MIN_GAP_MS', DEFAULT_GEMINI_MIN_GAP_MS, 0),
  models = getConfiguredModels(env),
  modelStore = new InMemoryModelStateStore(),
  getCounts,
  getContexts,
  generateBatchFn,
  saveFn,
  sleep = defaultSleep,
  logger = console
} = {}) {
  const counts = await getCounts();
  let totalAdded = 0;
  let stoppedEarly = false;
  let lastCallAt = 0;

  outer: for (const topic of TOPICS) {
    for (const diff of DIFFICULTIES) {
      let current = counts[topic.number]?.[diff.key] || 0;
      let stalledAttempts = 0;

      while (current < targetPerTopic) {
        if (await modelStore.areAllExhausted(models)) {
          stoppedEarly = true;
          break outer;
        }

        const needed = Math.min(batchSize, targetPerTopic - current);
        const avoidContexts = APPLICATION_TOPIC_NUMBERS.includes(topic.number)
          ? await getContexts(topic.number, diff.label)
          : [];

        if (lastCallAt > 0 && minGapMs > 0) {
          const elapsed = Date.now() - lastCallAt;
          if (elapsed < minGapMs) {
            await sleep(minGapMs - elapsed);
          }
        }
        lastCallAt = Date.now();

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
            (await modelStore.areAllExhausted(models)) ||
            (err instanceof ServiceError && err.status === 429)
          ) {
            logger.warn(`[Seed] Stopping cleanly: all models exhausted (${err.message}).`);
            stoppedEarly = true;
            break outer;
          }
          logger.warn(`[Seed] Topic ${topic.number} (${diff.key}) batch failed: ${err.message}`);
          break;
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

  const quotaStatus = await modelStore.getStatus(models);
  return {
    totalAdded,
    totalMissing,
    missingByBucket,
    stoppedEarly,
    quotaStatus
  };
}

async function main() {
  dotenv.config({ path: '.env' });
  const env = { ...process.env };

  const targetPerTopic = getIntSetting(env, 'POOL_TARGET_PER_TOPIC', DEFAULT_POOL_TARGET_PER_TOPIC, 1);
  const batchSize = getIntSetting(env, 'BATCH_SIZE', DEFAULT_BATCH_SIZE, 1);
  const models = getConfiguredModels(env);

  console.log('--- Seeding Cloudflare D1 question_pool ---');
  console.log(`Target per topic & difficulty: ${targetPerTopic} (batch size: ${batchSize})`);
  console.log(`Configured models: ${models.join(', ')}`);

  const db = createD1HttpClient({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    databaseId: env.CLOUDFLARE_D1_DATABASE_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN
  });

  const modelStore = new InMemoryModelStateStore();

  const summary = await runSeedPool({
    env,
    targetPerTopic,
    batchSize,
    models,
    modelStore,
    getCounts: () => getPoolCounts(db),
    getContexts: (topicNum, diffLabel) => getPoolContexts(db, topicNum, diffLabel),
    generateBatchFn: (params) => generateBatch(params, { env, models, modelStore }),
    saveFn: (row) => saveToPool(db, row)
  });

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
