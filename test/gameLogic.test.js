import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getTileCoordinates,
  calculateTargetTile,
  resolveTurnMovement,
  LADDERS,
  SNAKES,
  WINNING_TILE
} from '../src/game/boardLogic.js';
import { rollDice, rollSingleDie } from '../src/game/diceLogic.js';

describe('Board Logic - Coordinates & Layout', () => {
  it('correctly maps tile 1 to bottom-left', () => {
    const coords = getTileCoordinates(1);
    assert.strictEqual(coords.col, 0); // left
    assert.strictEqual(coords.row, 9); // bottom
  });

  it('correctly maps tile 10 to bottom-right', () => {
    const coords = getTileCoordinates(10);
    assert.strictEqual(coords.col, 9); // right
    assert.strictEqual(coords.row, 9); // bottom
  });

  it('correctly maps tile 11 to second row from bottom, right side (boustrophedon)', () => {
    const coords = getTileCoordinates(11);
    assert.strictEqual(coords.col, 9); // right
    assert.strictEqual(coords.row, 8); // one above bottom
  });

  it('correctly maps tile 20 to second row from bottom, left side', () => {
    const coords = getTileCoordinates(20);
    assert.strictEqual(coords.col, 0); // left
    assert.strictEqual(coords.row, 8);
  });

  it('correctly maps tile 100 to top-left', () => {
    const coords = getTileCoordinates(100);
    assert.strictEqual(coords.col, 0); // left
    assert.strictEqual(coords.row, 0); // top
  });
});

describe('Board Logic - Bounce Back & Movement Resolution', () => {
  it('calculates regular moves without overshoot', () => {
    assert.strictEqual(calculateTargetTile(10, 4), 14);
    assert.strictEqual(calculateTargetTile(95, 5), 100);
  });

  it('calculates bounce-back when overshooting tile 100', () => {
    // at 98 rolling 4 -> 98 + 4 = 102, excess 2 -> 100 - 2 = 98
    assert.strictEqual(calculateTargetTile(98, 4), 98);
    // at 97 rolling 5 -> 97 + 5 = 102, excess 2 -> 98
    assert.strictEqual(calculateTargetTile(97, 5), 98);
    // at 99 rolling 3 -> 99 + 3 = 102, excess 2 -> 98
    assert.strictEqual(calculateTargetTile(99, 3), 98);
    // at 99 rolling 2 -> 101, excess 1 -> 99
    assert.strictEqual(calculateTargetTile(99, 2), 99);
  });

  it('applies ladders correctly', () => {
    // 4 -> 25
    const result = resolveTurnMovement(1, 3); // lands on 4
    assert.strictEqual(result.intermediateTile, 4);
    assert.strictEqual(result.finalTile, 25);
    assert.strictEqual(result.effect, 'ladder');
  });

  it('applies snakes correctly', () => {
    // 16 -> 6
    const result = resolveTurnMovement(10, 6); // lands on 16
    assert.strictEqual(result.intermediateTile, 16);
    assert.strictEqual(result.finalTile, 6);
    assert.strictEqual(result.effect, 'snake');
  });

  it('detects winning move exactly on 100', () => {
    const result = resolveTurnMovement(96, 4);
    assert.strictEqual(result.intermediateTile, 100);
    assert.strictEqual(result.finalTile, 100);
    assert.strictEqual(result.isWin, true);
    assert.strictEqual(result.effect, 'win');
  });
});

describe('Dice Logic & Probabilities', () => {
  it('rolls 1 die for Easy mode and 2 dice for Hard mode', () => {
    const easyRoll = rollDice({ difficulty: 'Easy', isCorrect: true });
    assert.strictEqual(easyRoll.diceValues.length, 1);
    assert.strictEqual(easyRoll.move, easyRoll.total);

    const hardRoll = rollDice({ difficulty: 'Hard', isCorrect: true });
    assert.strictEqual(hardRoll.diceValues.length, 2);
    assert.strictEqual(hardRoll.move, hardRoll.diceValues[0] + hardRoll.diceValues[1]);
  });

  it('favors high numbers (4, 5, 6) when answer is correct', () => {
    let highCount = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      const val = rollSingleDie(true);
      if (val >= 4) highCount++;
    }
    const ratio = highCount / trials;
    // Expected ~ 0.70 (allow +/- 0.06 margin for 1000 trials)
    assert.ok(ratio >= 0.64 && ratio <= 0.76, `High ratio was ${ratio}, expected ~0.70`);
  });

  it('favors low numbers (1, 2, 3) when answer is wrong', () => {
    let lowCount = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      const val = rollSingleDie(false);
      if (val <= 3) lowCount++;
    }
    const ratio = lowCount / trials;
    // Expected ~ 0.70 (allow +/- 0.06 margin for 1000 trials)
    assert.ok(ratio >= 0.64 && ratio <= 0.76, `Low ratio was ${ratio}, expected ~0.70`);
  });
});
