import { describe, it } from 'node:test';
import assert from 'node:assert';
import { secondsToHHMMSS, formatMMSS } from '../server/services/db.js';

describe('Database Service Helpers', () => {
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
});
