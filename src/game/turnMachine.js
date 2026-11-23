/**
 * Turn state machine (pure logic, no DOM or Phaser).
 *
 * One turn always runs in this order and cannot be skipped or reordered:
 *   LEARN -> TEST -> ANSWERED -> ROLLING -> MOVING -> (next turn) LEARN
 *
 * Every transition method returns true when it was accepted and false when it
 * was ignored because the machine was in the wrong state. The UI must rely on
 * these return values, not only on hiding or disabling buttons.
 */

export const TURN_STATES = Object.freeze({
  LEARN: 'LEARN',
  TEST: 'TEST',
  ANSWERED: 'ANSWERED',
  ROLLING: 'ROLLING',
  MOVING: 'MOVING'
});

/** Step indicator mapping: 1 Learn, 2 Test, 3 Roll. */
export const TURN_STEPS = Object.freeze({
  LEARN: 1,
  TEST: 2,
  ANSWERED: 3,
  ROLLING: 3,
  MOVING: 3
});

export class TurnMachine {
  constructor() {
    this.reset();
  }

  /** Start of a new game: first turn begins at LEARN. */
  reset() {
    this.state = TURN_STATES.LEARN;
    this.answerCorrect = null;
    this.selectedIndex = null;
  }

  get step() {
    return TURN_STEPS[this.state];
  }

  /** Internal: move from one specific state to another, otherwise ignore. */
  _move(from, to) {
    if (this.state !== from) return false;
    this.state = to;
    return true;
  }

  /** LEARN -> TEST ("I'm ready, test me"). */
  startTest() {
    return this._move(TURN_STATES.LEARN, TURN_STATES.TEST);
  }

  /** TEST -> ANSWERED. Only the first answer counts; later calls are ignored. */
  submitAnswer(selectedIndex, isCorrect) {
    if (!this._move(TURN_STATES.TEST, TURN_STATES.ANSWERED)) return false;
    this.selectedIndex = selectedIndex;
    this.answerCorrect = Boolean(isCorrect);
    return true;
  }

  /** ANSWERED -> ROLLING. A roll request in any other state is ignored. */
  requestRoll() {
    return this._move(TURN_STATES.ANSWERED, TURN_STATES.ROLLING);
  }

  /** ROLLING -> MOVING (dice animation finished, token starts moving). */
  startMoving() {
    return this._move(TURN_STATES.ROLLING, TURN_STATES.MOVING);
  }

  /** MOVING -> LEARN (the token has finished; the next turn begins). */
  nextTurn() {
    if (!this._move(TURN_STATES.MOVING, TURN_STATES.LEARN)) return false;
    this.answerCorrect = null;
    this.selectedIndex = null;
    return true;
  }

  canRoll() {
    return this.state === TURN_STATES.ANSWERED;
  }
}
