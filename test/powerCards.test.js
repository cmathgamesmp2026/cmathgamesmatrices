import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  PowerCardManager,
  CARD_TYPES,
  CARD_CAP,
  getTilePositionVector,
  formatVectorMove
} from '../src/game/powerCards.js';
import { TURN_STATES } from '../src/game/turnMachine.js';

describe('Position vector p = [row, col] and vector addition', () => {
  it('maps board tiles to 1-based [row, col] coordinates', () => {
    assert.deepStrictEqual(getTilePositionVector(1), [1, 1]);
    assert.deepStrictEqual(getTilePositionVector(10), [1, 10]);
    assert.deepStrictEqual(getTilePositionVector(11), [2, 10]);
    assert.deepStrictEqual(getTilePositionVector(13), [2, 8]);
    assert.deepStrictEqual(getTilePositionVector(48), [5, 8]);
    assert.deepStrictEqual(getTilePositionVector(100), [10, 1]);
  });

  it('formats a move as vector addition "[r1, c1] + [dr, dc] = [r2, c2]"', () => {
    const move = formatVectorMove(13, 48);
    assert.strictEqual(move.text, '[2, 8] + [3, 0] = [5, 8]');
  });
});

describe('PowerCardManager: earning cards & inventory Q = [I; 2; A⁻¹]', () => {
  it('awards nothing on a wrong answer', () => {
    const mgr = new PowerCardManager();
    const awarded = mgr.awardRandomCard(false);
    assert.strictEqual(awarded, null);
    assert.deepStrictEqual(mgr.getColumnVector(), [[0], [0], [0]]);
  });

  it('awards a random card on a correct answer and respects the cap of 2 each', () => {
    const mgr = new PowerCardManager();
    for (let i = 0; i < 6; i++) {
      const card = mgr.awardRandomCard(true, () => 0);
      assert.ok(card !== null);
    }
    assert.strictEqual(mgr.counts.identity, CARD_CAP);
    assert.strictEqual(mgr.counts.scalar, CARD_CAP);
    assert.strictEqual(mgr.counts.inverse, CARD_CAP);
    assert.deepStrictEqual(mgr.getColumnVector(), [[2], [2], [2]]);

    // All at cap of 2 -> award nothing
    const extra = mgr.awardRandomCard(true, () => 0);
    assert.strictEqual(extra, null);
    assert.deepStrictEqual(mgr.getColumnVector(), [[2], [2], [2]]);
  });

  it('only chooses among card types where count < 2', () => {
    const mgr = new PowerCardManager();
    mgr.counts.identity = 2;
    mgr.counts.scalar = 2;
    mgr.counts.inverse = 1;
    const card = mgr.awardRandomCard(true, () => 0.99);
    assert.strictEqual(card, CARD_TYPES.INVERSE);
    assert.strictEqual(mgr.counts.inverse, 2);
  });
});

describe('PowerCardManager: arming and using cards', () => {
  it('allows arming/using cards ONLY in the ANSWERED state', () => {
    const mgr = new PowerCardManager();
    mgr.counts = { identity: 1, scalar: 1, inverse: 1 };
    mgr.recordCompletedTurn(1);

    for (const state of [TURN_STATES.LEARN, TURN_STATES.TEST, TURN_STATES.ROLLING, TURN_STATES.MOVING]) {
      assert.strictEqual(mgr.toggleArm(CARD_TYPES.IDENTITY, state).ok, false);
      assert.strictEqual(mgr.toggleArm(CARD_TYPES.SCALAR, state).ok, false);
      assert.strictEqual(mgr.useInverse(state, 5).ok, false);
    }
  });

  it('allows only one card armed per turn and lets an armed card be put back', () => {
    const mgr = new PowerCardManager();
    mgr.counts = { identity: 1, scalar: 1, inverse: 0 };

    const armId = mgr.toggleArm(CARD_TYPES.IDENTITY, TURN_STATES.ANSWERED);
    assert.strictEqual(armId.ok, true);
    assert.strictEqual(mgr.armedCard, CARD_TYPES.IDENTITY);

    // Switching to Scalar puts Identity back
    const armSc = mgr.toggleArm(CARD_TYPES.SCALAR, TURN_STATES.ANSWERED);
    assert.strictEqual(armSc.ok, true);
    assert.strictEqual(mgr.armedCard, CARD_TYPES.SCALAR);

    // Clicking Scalar again puts it back
    const disarm = mgr.toggleArm(CARD_TYPES.SCALAR, TURN_STATES.ANSWERED);
    assert.strictEqual(disarm.ok, true);
    assert.strictEqual(mgr.armedCard, null);
  });

  it('Scalar (2) doubles the next roll total and is consumed on that roll', () => {
    const mgr = new PowerCardManager();
    mgr.counts.scalar = 1;
    mgr.toggleArm(CARD_TYPES.SCALAR, TURN_STATES.ANSWERED);

    const res = mgr.resolveRollWithCards(1, 4); // 1 + (2*4) = 9
    assert.strictEqual(res.scalarConsumed, true);
    assert.strictEqual(res.effectiveMove, 8);
    assert.strictEqual(res.movement.finalTile, 9);
    assert.strictEqual(mgr.counts.scalar, 0);
    assert.strictEqual(mgr.armedCard, null);
  });

  it('Identity (I) blocks the next snake landed on and is consumed only when it blocks a snake', () => {
    const mgr = new PowerCardManager();
    mgr.counts.identity = 1;
    mgr.toggleArm(CARD_TYPES.IDENTITY, TURN_STATES.ANSWERED);

    // Roll that does NOT land on a snake (tile 1 + 2 = 3): card is NOT consumed
    const normalRoll = mgr.resolveRollWithCards(1, 2);
    assert.strictEqual(normalRoll.identityConsumed, false);
    assert.strictEqual(normalRoll.movement.finalTile, 3);
    assert.strictEqual(mgr.counts.identity, 1);

    // Roll that lands on snake 16 -> 6 (from tile 12, roll 4 -> 16): snake is ignored and card is consumed
    const snakeRoll = mgr.resolveRollWithCards(12, 4);
    assert.strictEqual(snakeRoll.identityConsumed, true);
    assert.strictEqual(snakeRoll.movement.effect, 'snake_blocked');
    assert.strictEqual(snakeRoll.movement.finalTile, 16);
    assert.strictEqual(mgr.counts.identity, 0);
    assert.strictEqual(mgr.armedCard, null);
  });

  it('Inverse (A⁻¹) requires at least one previous turn and returns the token to its tile before the last turn', () => {
    const mgr = new PowerCardManager();
    mgr.counts.inverse = 1;

    // Turn 1: no previous turn completed yet
    assert.strictEqual(mgr.canUseInverse(TURN_STATES.ANSWERED), false);
    assert.strictEqual(mgr.useInverse(TURN_STATES.ANSWERED, 1).ok, false);

    // Complete Turn 1 (started on tile 1, moved to tile 6)
    mgr.recordCompletedTurn(1);

    // Turn 2 in ANSWERED state at tile 6: use Inverse immediately -> returns to tile 1
    assert.strictEqual(mgr.canUseInverse(TURN_STATES.ANSWERED), true);
    const inv = mgr.useInverse(TURN_STATES.ANSWERED, 6);
    assert.strictEqual(inv.ok, true);
    assert.strictEqual(inv.targetTile, 1);
    assert.strictEqual(inv.vectorMove.text, '[1, 6] + [0, -5] = [1, 1]');
    assert.strictEqual(mgr.counts.inverse, 0);
  });
});
