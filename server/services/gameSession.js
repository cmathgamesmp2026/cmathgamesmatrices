/**
 * Per-game server state: topic order, contexts for application problems,
 * and the pool items / signatures already served in this game.
 * Held in memory with cleanup of games older than 3 hours.
 *
 * - Topics come from a shuffled order of the 10 syllabus topics, with no repeat
 *   until all 10 have been used, then a fresh shuffle.
 * - assignTurn() is idempotent per turn number, so a retry or a difficulty
 *   change for the same turn never burns another topic.
 */

import crypto from 'crypto';
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

export const SESSION_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
const MAX_SESSIONS = 2000;
const sessions = new Map();

export function isValidGameId(gameId) {
  return typeof gameId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(gameId);
}

function shuffled(items, rnd = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createSession(rnd = Math.random) {
  return {
    order: shuffled(TOPICS.map((t) => t.number), rnd),
    pos: 0,
    lastTopic: null,
    turns: new Map(), // turn number -> assignment
    servedIds: new Set(), // pool item ids served in this game
    servedSignatures: new Set(), // SHA-256 signatures served in this game
    usedContexts: new Set(), // lowercase application contexts actually served in this game
    assignedContexts: new Set(), // lowercase contexts already assigned to live turns
    usedQuestionKeys: new Set(),
    recentQuestions: [],
    lastSeen: Date.now()
  };
}

function pruneSessions(now = Date.now()) {
  for (const [id, s] of sessions) {
    if (now - s.lastSeen > SESSION_TTL_MS) sessions.delete(id);
  }
}

/** Create a brand-new server-issued game id and empty seen sets. */
export function startNewGame(now = Date.now(), rnd = Math.random) {
  pruneSessions(now);
  if (sessions.size >= MAX_SESSIONS) {
    sessions.delete(sessions.keys().next().value);
  }
  const gameId = crypto.randomUUID();
  const session = createSession(rnd);
  session.lastSeen = now;
  sessions.set(gameId, session);
  return { gameId, session };
}

/** Get (or create) the session for a game id, pruning games older than 3 hours. */
export function getSession(gameId, now = Date.now()) {
  pruneSessions(now);
  if (sessions.size >= MAX_SESSIONS && !sessions.has(gameId)) {
    sessions.delete(sessions.keys().next().value);
  }
  let session = sessions.get(gameId);
  if (!session) {
    session = createSession();
    sessions.set(gameId, session);
  }
  session.lastSeen = now;
  return session;
}

function pickContexts(session, rnd) {
  let free = CONTEXTS.filter(
    (c) => !session.usedContexts.has(c.toLowerCase()) && !session.assignedContexts.has(c.toLowerCase())
  );
  if (free.length < 2) {
    // Every context has been used in a very long game: start the pool again.
    session.assignedContexts.clear();
    free = CONTEXTS.filter((c) => !session.usedContexts.has(c.toLowerCase()));
    if (free.length < 2) free = [...CONTEXTS];
  }
  const [lessonContext, questionContext] = shuffled(free, rnd);
  session.assignedContexts.add(lessonContext.toLowerCase());
  session.assignedContexts.add(questionContext.toLowerCase());
  return { lessonContext, questionContext };
}

/** Assign (once per turn number) the topic and, for topics 9/10, two different contexts. */
export function assignTurn(session, turn, rnd = Math.random) {
  if (session.turns.has(turn)) return session.turns.get(turn);

  if (session.pos >= session.order.length) {
    let next = shuffled(TOPICS.map((t) => t.number), rnd);
    // Avoid the same topic twice in a row across the reshuffle.
    if (next[0] === session.lastTopic) [next[0], next[1]] = [next[1], next[0]];
    session.order = next;
    session.pos = 0;
  }
  const number = session.order[session.pos++];
  session.lastTopic = number;

  const assignment = { turn, topic: TOPICS[number - 1], lessonContext: null, questionContext: null };
  if (APPLICATION_TOPIC_NUMBERS.includes(number)) {
    Object.assign(assignment, pickContexts(session, rnd));
  }
  session.turns.set(turn, assignment);
  return assignment;
}

/**
 * Return the remaining topics in the shuffled order after the failed topic,
 * so the server can fall back to the next topic that still has an unseen pool item.
 */
export function getFallbackTopics(session, excludeTopicNumber) {
  const remaining = session.order.slice(session.pos);
  const earlier = session.order.slice(0, session.pos);
  const ordered = [...remaining, ...earlier].filter((n) => n !== excludeTopicNumber);
  return ordered.map((n) => TOPICS[n - 1]);
}

/** Key used to stop the same question appearing twice in one game. */
export function questionKey(question) {
  const text = String(question?.text || question?.question || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return `${text}|${JSON.stringify(question?.matrices ?? null)}`;
}

export function isDuplicateQuestion(session, question, { id = null, signature = null, context = null } = {}) {
  if (id != null && session.servedIds.has(id)) return true;
  if (signature && session.servedSignatures.has(signature)) return true;
  if (context && session.usedContexts.has(String(context).toLowerCase())) return true;
  return session.usedQuestionKeys.has(questionKey(question));
}

export function recordQuestion(session, question, { id = null, signature = null, context = null } = {}) {
  if (id != null) session.servedIds.add(id);
  if (signature) session.servedSignatures.add(signature);
  if (context) {
    const lower = String(context).toLowerCase();
    session.usedContexts.add(lower);
    session.assignedContexts.add(lower);
  }
  session.usedQuestionKeys.add(questionKey(question));
  session.recentQuestions.push(String(question?.text || '').slice(0, 100));
  if (session.recentQuestions.length > 8) session.recentQuestions.shift();
}
