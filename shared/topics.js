/**
 * Syllabus topics, application contexts, and deterministic per-game topic ordering.
 * Pure ES module (no Node-only APIs, no shared memory required across Workers).
 *
 * - Topics come from a shuffled order of the 10 syllabus topics, with no repeat
 *   until all 10 have been used, then a fresh shuffle (never repeating across
 *   the cycle boundary).
 * - assignTurnForGame(gameId, turn) is deterministic and idempotent per turn,
 *   so retries or difficulty switches for the same turn never burn another topic.
 */

import { SYLLABUS_TOPICS } from './mathVerify.js';

export const TOPICS = SYLLABUS_TOPICS.map((name, i) => ({
  number: i + 1,
  name,
  label: `${i + 1}. ${name}`
}));

/** Topics 9 and 10 use a real-world context. */
export const APPLICATION_TOPIC_NUMBERS = [9, 10];

export const CONTEXTS = [
  'stationery and school supplies',
  'canteen meals and drinks',
  'movie or concert tickets',
  'sports gear',
  'phone or streaming plans',
  'bus and train fares',
  'gym or club memberships',
  'online game items',
  'art supplies',
  'gardening supplies',
  'recipes and ingredients',
  'factory production of different products'
];

export const SESSION_TTL_SECONDS = 3 * 60 * 60; // 3 hours
export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

export function isValidGameId(gameId) {
  return typeof gameId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(gameId);
}

/** FNV-1a 32-bit string hash for seeding deterministic per-game topic order. */
function hashString32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 deterministic PRNG returning floats in [0, 1). */
function createPrng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(items, rnd = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Compute the shuffled 10-topic order for a given (gameId, cycleIndex).
 * Guarantees no repeat across the boundary from cycleIndex - 1 to cycleIndex.
 */
export function getTopicOrderForCycle(gameId, cycleIndex) {
  const baseNumbers = TOPICS.map((t) => t.number);
  let prevLast = null;
  let order = null;

  for (let c = 0; c <= cycleIndex; c++) {
    const rnd = createPrng(hashString32(`${gameId}:cycle:${c}`));
    order = shuffled(baseNumbers, rnd);
    if (prevLast !== null && order[0] === prevLast) {
      [order[0], order[1]] = [order[1], order[0]];
    }
    prevLast = order[order.length - 1];
  }

  return order;
}

/**
 * Deterministically pick two unused contexts for an application topic turn.
 */
export function pickContextsForTurn(gameId, turn, usedContexts = new Set()) {
  const rnd = createPrng(hashString32(`${gameId}:ctx:${turn}`));
  let free = CONTEXTS.filter((c) => !usedContexts.has(c.toLowerCase()));
  if (free.length < 2) {
    free = [...CONTEXTS];
  }
  const [lessonContext, questionContext] = shuffled(free, rnd);
  return { lessonContext, questionContext };
}

/**
 * Deterministically assign the topic (and contexts for topics 9 & 10) for (gameId, turn).
 * Idempotent for the same (gameId, turn).
 */
export function assignTurnForGame(gameId, turn, usedContexts = new Set()) {
  const cycleIndex = Math.floor((turn - 1) / TOPICS.length);
  const posInCycle = (turn - 1) % TOPICS.length;
  const order = getTopicOrderForCycle(gameId, cycleIndex);
  const number = order[posInCycle];
  const topic = TOPICS[number - 1];

  const assignment = {
    turn,
    topic,
    order,
    posInCycle,
    lessonContext: null,
    questionContext: null
  };

  if (APPLICATION_TOPIC_NUMBERS.includes(number)) {
    Object.assign(assignment, pickContextsForTurn(gameId, turn, usedContexts));
  }

  return assignment;
}

/**
 * Return the remaining 9 topics in the shuffled cycle order after the current turn's topic.
 */
export function getFallbackTopicsForGame(gameId, turn, excludeTopicNumber) {
  const cycleIndex = Math.floor((turn - 1) / TOPICS.length);
  const posInCycle = (turn - 1) % TOPICS.length;
  const order = getTopicOrderForCycle(gameId, cycleIndex);
  const remaining = order.slice(posInCycle + 1);
  const earlier = order.slice(0, posInCycle + 1);
  const ordered = [...remaining, ...earlier].filter((n) => n !== excludeTopicNumber);
  return ordered.map((n) => TOPICS[n - 1]);
}
