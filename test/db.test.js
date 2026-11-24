import { describe, it } from 'node:test';
import assert from 'node:assert';
import { secondsToHHMMSS, formatMMSS, validateGameResult } from '../shared/time.js';
import { onRequestGet, onRequestPost } from '../functions/api/leaderboard.js';

describe('Shared Time & Validation Helpers', () => {
  it('correctly converts seconds to HH:MM:SS format', () => {
    assert.strictEqual(secondsToHHMMSS(0), '00:00:00');
    assert.strictEqual(secondsToHHMMSS(59), '00:00:59');
    assert.strictEqual(secondsToHHMMSS(60), '00:01:00');
    assert.strictEqual(secondsToHHMMSS(125), '00:02:05');
    assert.strictEqual(secondsToHHMMSS(3661), '01:01:01');
  });

  it('correctly formats display time to MM:SS', () => {
    assert.strictEqual(formatMMSS(0), '00:00');
    assert.strictEqual(formatMMSS(75), '01:15');
    assert.strictEqual(formatMMSS('00:04:32'), '04:32');
    assert.strictEqual(formatMMSS('01:15:20'), '75:20');
  });

  it('validates and trims game result payloads', () => {
    const ok = validateGameResult({
      name: '  Alice  ',
      turnsTaken: 12,
      correctAnswers: 9,
      wrongAnswers: 3,
      timeTakenSeconds: 185
    });
    assert.strictEqual(ok.ok, true);
    assert.strictEqual(ok.value.name, 'Alice');
    assert.strictEqual(ok.value.timeTaken, '00:03:05');
    assert.strictEqual(ok.value.displayTime, '03:05');

    const longName = validateGameResult({
      name: 'A'.repeat(150),
      turnsTaken: 5,
      correctAnswers: 5,
      wrongAnswers: 0,
      timeTaken: '00:01:30'
    });
    assert.strictEqual(longName.ok, true);
    assert.strictEqual(longName.value.name.length, 100);
    assert.strictEqual(longName.value.timeTaken, '00:01:30');

    assert.strictEqual(validateGameResult({ name: '   ', turnsTaken: 5 }).ok, false);
    assert.strictEqual(validateGameResult({ name: 'Bob', turnsTaken: 0 }).ok, false);
    assert.strictEqual(validateGameResult({ name: 'Bob', turnsTaken: 5, correctAnswers: -1 }).ok, false);
    assert.strictEqual(validateGameResult({ name: 'Bob', turnsTaken: 5, timeTaken: '1:2:3' }).ok, false);
    assert.strictEqual(validateGameResult({ name: 'Bob', turnsTaken: 5, timeTaken: '00:65:00' }).ok, false);
  });
});

describe('Leaderboard Pages Function (D1)', () => {
  function createMockD1() {
    const rows = [];
    let nextId = 1;
    return {
      prepare(sql) {
        return {
          bind(...params) {
            return {
              async all() {
                if (sql.includes('FROM matrices_snl')) {
                  const limit = params[0];
                  const sorted = [...rows].sort((a, b) => {
                    if (a.time_taken !== b.time_taken) return a.time_taken.localeCompare(b.time_taken);
                    return a.turns_taken - b.turns_taken;
                  });
                  return { results: sorted.slice(0, limit) };
                }
                return { results: [] };
              },
              async run() {
                if (sql.includes('INSERT INTO matrices_snl')) {
                  const [name, turns_taken, correct_answers, wrong_answers, time_taken] = params;
                  const id = nextId++;
                  rows.push({ id, name, turns_taken, correct_answers, wrong_answers, time_taken });
                  return { success: true, meta: { last_row_id: id } };
                }
                return { success: true, meta: {} };
              }
            };
          }
        };
      }
    };
  }

  it('saves results and returns top 10 ordered by time_taken ASC, turns_taken ASC', async () => {
    const DB = createMockD1();

    const post1 = await onRequestPost({
      env: { DB },
      request: new Request('https://example.test/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Slow',
          turnsTaken: 8,
          correctAnswers: 6,
          wrongAnswers: 2,
          timeTakenSeconds: 200
        })
      })
    });
    assert.strictEqual(post1.status, 200);
    const data1 = await post1.json();
    assert.strictEqual(data1.success, true);
    assert.strictEqual(data1.result.time_taken, '00:03:20');

    const post2 = await onRequestPost({
      env: { DB },
      request: new Request('https://example.test/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Fast',
          turnsTaken: 10,
          correctAnswers: 8,
          wrongAnswers: 2,
          timeTakenSeconds: 95
        })
      })
    });
    assert.strictEqual(post2.status, 200);
    const data2 = await post2.json();
    assert.strictEqual(data2.leaderboard.length, 2);
    assert.strictEqual(data2.leaderboard[0].name, 'Fast');
    assert.strictEqual(data2.leaderboard[0].rank, 1);
    assert.strictEqual(data2.leaderboard[0].displayTime, '01:35');
    assert.strictEqual(data2.leaderboard[1].name, 'Slow');

    const getRes = await onRequestGet({
      env: { DB },
      request: new Request('https://example.test/api/leaderboard?limit=10')
    });
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.success, true);
    assert.strictEqual(getData.leaderboard.length, 2);
  });

  it('rejects invalid payloads with 400', async () => {
    const DB = createMockD1();
    const res = await onRequestPost({
      env: { DB },
      request: new Request('https://example.test/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', turnsTaken: 5 })
      })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
  });
});
