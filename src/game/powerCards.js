/**
 * Power Cards & Position Vector Logic (pure module, independent of DOM and Phaser).
 *
 * Cards earned from correct answers:
 *  - Identity (I): arm it. The next snake landed on is ignored (I * p = p).
 *    Consumed only when it actually blocks a snake.
 *  - Scalar (2): arm it. The player's next roll total is doubled (2 * roll).
 *    Consumed on that roll.
 *  - Inverse (A^-1): use immediately. Returns the token to where it was before
 *    the last turn, then the player continues. Needs at least one previous turn.
 */

import { getTileCoordinates, resolveTurnMovement } from './boardLogic.js';
import { TURN_STATES } from './turnMachine.js';

export const CARD_TYPES = Object.freeze({
  IDENTITY: 'identity',
  SCALAR: 'scalar',
  INVERSE: 'inverse'
});

/** Order in the 3x1 inventory vector Q = [I; 2; A^-1]. */
export const CARD_ORDER = Object.freeze([
  CARD_TYPES.IDENTITY,
  CARD_TYPES.SCALAR,
  CARD_TYPES.INVERSE
]);

export const CARD_CAP = 2;

export const CARD_META = Object.freeze({
  identity: {
    id: 'identity',
    symbol: 'I',
    name: 'Identity (I)',
    mode: 'arm',
    note: 'Identity matrix leaves a position vector unchanged (I × p = p): ignores the next snake.'
  },
  scalar: {
    id: 'scalar',
    symbol: '2',
    name: 'Scalar (2)',
    mode: 'arm',
    note: 'Scalar multiplication scales a quantity (2 × roll): doubles your next roll total.'
  },
  inverse: {
    id: 'inverse',
    symbol: 'A⁻¹',
    name: 'Inverse (A⁻¹)',
    mode: 'immediate',
    note: 'Matrix inverse reverses a step (A⁻¹A = I): returns to your tile before the last turn.'
  }
});

/**
 * 1-based [row, col] position vector p for a board tile (1..100).
 * Row 1 is the bottom row (tiles 1..10), row 10 is the top row (tiles 91..100).
 * Column 1 is the left column, column 10 is the right column.
 */
export function getTilePositionVector(tileNumber) {
  const { col, rowFromBottom } = getTileCoordinates(tileNumber);
  return [rowFromBottom + 1, col + 1];
}

/**
 * Formats a move between two tiles as vector addition on p = [row, col],
 * e.g. "[2, 8] + [3, 0] = [5, 8]".
 */
export function formatVectorMove(fromTile, toTile) {
  const [r1, c1] = getTilePositionVector(fromTile);
  const [r2, c2] = getTilePositionVector(toTile);
  const dr = r2 - r1;
  const dc = c2 - c1;
  return {
    from: [r1, c1],
    delta: [dr, dc],
    to: [r2, c2],
    text: `[${r1}, ${c1}] + [${dr}, ${dc}] = [${r2}, ${c2}]`
  };
}

export class PowerCardManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.counts = {
      identity: 0,
      scalar: 0,
      inverse: 0
    };
    this.armedCard = null;
    this.previousTurnTile = null;
    this.completedTurns = 0;
    this.lastAwarded = null;
  }

  /** 3x1 column vector [[I], [2], [A^-1]] of current card counts. */
  getColumnVector() {
    return [
      [this.counts.identity],
      [this.counts.scalar],
      [this.counts.inverse]
    ];
  }

  /**
   * Award one random card on a correct answer among types below the cap of 2.
   * Returns the awarded card type ('identity' | 'scalar' | 'inverse') or null.
   */
  awardRandomCard(isCorrect, randomFn = Math.random) {
    if (!isCorrect) {
      this.lastAwarded = null;
      return null;
    }

    const eligible = CARD_ORDER.filter((type) => this.counts[type] < CARD_CAP);
    if (eligible.length === 0) {
      this.lastAwarded = null;
      return null;
    }

    const index = Math.min(eligible.length - 1, Math.floor(randomFn() * eligible.length));
    const chosen = eligible[index];
    this.counts[chosen] += 1;
    this.lastAwarded = chosen;
    return chosen;
  }

  /**
   * Arm or disarm (put back) Identity (I) or Scalar (2).
   * Only allowed in the ANSWERED state, before rolling, and only one card can be armed.
   */
  toggleArm(cardType, turnState) {
    if (turnState !== TURN_STATES.ANSWERED) {
      return { ok: false, reason: 'Cards can only be used in the ANSWERED state, before rolling.' };
    }
    if (cardType !== CARD_TYPES.IDENTITY && cardType !== CARD_TYPES.SCALAR) {
      return { ok: false, reason: 'Only Identity (I) or Scalar (2) can be armed.' };
    }

    // Putting an armed card back
    if (this.armedCard === cardType) {
      this.armedCard = null;
      return { ok: true, armedCard: null, action: 'disarmed' };
    }

    if (this.counts[cardType] <= 0) {
      return { ok: false, reason: `No ${CARD_META[cardType].name} card available.` };
    }

    // Arming replaces any other armed card (putting the previous one back)
    this.armedCard = cardType;
    return { ok: true, armedCard: cardType, action: 'armed' };
  }

  canUseInverse(turnState) {
    return (
      turnState === TURN_STATES.ANSWERED &&
      this.counts.inverse > 0 &&
      this.completedTurns >= 1 &&
      this.previousTurnTile !== null
    );
  }

  /**
   * Immediately use Inverse (A^-1) in the ANSWERED state.
   * Returns { ok, targetTile, vectorMove } if used.
   */
  useInverse(turnState, currentTile) {
    if (turnState !== TURN_STATES.ANSWERED) {
      return { ok: false, reason: 'Cards can only be used in the ANSWERED state, before rolling.' };
    }
    if (this.counts.inverse <= 0) {
      return { ok: false, reason: 'No Inverse (A⁻¹) card available.' };
    }
    if (this.completedTurns < 1 || this.previousTurnTile === null) {
      return { ok: false, reason: 'Inverse (A⁻¹) needs at least one previous turn.' };
    }

    const targetTile = this.previousTurnTile;
    this.counts.inverse -= 1;
    this.previousTurnTile = null;

    return {
      ok: true,
      fromTile: currentTile,
      targetTile,
      vectorMove: formatVectorMove(currentTile, targetTile)
    };
  }

  /**
   * Apply any armed card to a dice roll from currentTile.
   * - Scalar (2) doubles the roll total and is consumed on this roll.
   * - Identity (I) ignores a snake if landed on and is consumed ONLY when it blocks a snake.
   */
  resolveRollWithCards(currentTile, baseRollTotal) {
    let effectiveMove = baseRollTotal;
    let scalarConsumed = false;
    let identityConsumed = false;
    let blockedSnakeTile = null;

    if (this.armedCard === CARD_TYPES.SCALAR && this.counts.scalar > 0) {
      effectiveMove = baseRollTotal * 2;
      this.counts.scalar -= 1;
      this.armedCard = null;
      scalarConsumed = true;
    }

    const movement = resolveTurnMovement(currentTile, effectiveMove);

    if (movement.effect === 'snake' && this.armedCard === CARD_TYPES.IDENTITY && this.counts.identity > 0) {
      blockedSnakeTile = movement.intermediateTile;
      movement.blockedSnakeTo = movement.finalTile;
      movement.finalTile = movement.intermediateTile;
      movement.effect = 'snake_blocked';
      movement.snakeEnd = null;
      this.counts.identity -= 1;
      this.armedCard = null;
      identityConsumed = true;
    }

    return {
      baseRollTotal,
      effectiveMove,
      scalarConsumed,
      identityConsumed,
      blockedSnakeTile,
      movement,
      vectorMove: formatVectorMove(currentTile, movement.finalTile)
    };
  }

  /** Record the start tile of a completed turn so Inverse (A^-1) can revert it next turn. */
  recordCompletedTurn(turnStartTile) {
    this.previousTurnTile = turnStartTile;
    this.completedTurns += 1;
  }
}
