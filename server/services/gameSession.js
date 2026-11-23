/**
 * Per-game server state: topic order, contexts for application problems,
 * and the questions already used. Held in memory (a game lasts minutes).
 *
 * - Topics come from a shuffled order of the 10 syllabus topics, with no repeat
 *   until all 10 have been used, then a fresh shuffle.
 * - assignTurn() is idempotent per turn number, so a retry, a prefetch or a
 *   difficulty change for the same turn never burns another topic.
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

const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
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
    usedContexts: new Set(),
    usedQuestionKeys: new Set(),
    recentQuestions: [],
    lastSeen: Date.now()
  };
}

/** Get (or create) the session for a game id, pruning old sessions. */
export function getSession(gameId, now = Date.now()) {
  for (const [id, s] of sessions) {
    if (now - s.lastSeen > SESSION_TTL_MS) sessions.delete(id);
  }
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
  let free = CONTEXTS.filter((c) => !session.usedContexts.has(c));
  if (free.length < 2) {
    // Every context has been used in a very long game: start the pool again.
    session.usedContexts.clear();
    free = [...CONTEXTS];
  }
  const [lessonContext, questionContext] = shuffled(free, rnd);
  session.usedContexts.add(lessonContext);
  session.usedContexts.add(questionContext);
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

/** Key used to stop the same question appearing twice in one game. */
export function questionKey(question) {
  const text = String(question.text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return `${text}|${JSON.stringify(question.matrices ?? null)}`;
}

export function isDuplicateQuestion(session, question) {
  return session.usedQuestionKeys.has(questionKey(question));
}

export function recordQuestion(session, question) {
  session.usedQuestionKeys.add(questionKey(question));
  session.recentQuestions.push(String(question.text || '').slice(0, 100));
  if (session.recentQuestions.length > 8) session.recentQuestions.shift();
}
