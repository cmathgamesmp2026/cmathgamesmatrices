import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TurnMachine, TURN_STATES } from '../src/game/turnMachine.js';
import { gameState } from '../src/game/gameState.js';

describe('Turn state machine', () => {
  it('starts in LEARN at step 1', () => {
    const m = new TurnMachine();
    assert.strictEqual(m.state, TURN_STATES.LEARN);
    assert.strictEqual(m.step, 1);
  });

  it('runs LEARN -> TEST -> ANSWERED -> ROLLING -> MOVING -> LEARN in order', () => {
    const m = new TurnMachine();
    assert.ok(m.startTest());
    assert.strictEqual(m.step, 2);
    assert.ok(m.submitAnswer(1, true));
    assert.strictEqual(m.state, TURN_STATES.ANSWERED);
    assert.strictEqual(m.step, 3);
    assert.ok(m.requestRoll());
    assert.ok(m.startMoving());
    assert.ok(m.nextTurn());
    assert.strictEqual(m.state, TURN_STATES.LEARN);
    assert.strictEqual(m.answerCorrect, null);
  });

  it('ignores a roll before an answer is submitted', () => {
    const m = new TurnMachine();
    assert.strictEqual(m.requestRoll(), false); // LEARN
    m.startTest();
    assert.strictEqual(m.requestRoll(), false); // TEST
    assert.strictEqual(m.state, TURN_STATES.TEST);
  });

  it('cannot skip the lesson or answer without testing', () => {
    const m = new TurnMachine();
    assert.strictEqual(m.submitAnswer(0, true), false);
    assert.strictEqual(m.state, TURN_STATES.LEARN);
  });

  it('locks the answer after the first submission', () => {
    const m = new TurnMachine();
    m.startTest();
    assert.ok(m.submitAnswer(2, false));
    assert.strictEqual(m.submitAnswer(0, true), false);
    assert.strictEqual(m.selectedIndex, 2);
    assert.strictEqual(m.answerCorrect, false);
  });

  it('allows only one roll per turn', () => {
    const m = new TurnMachine();
    m.startTest();
    m.submitAnswer(0, true);
    assert.ok(m.requestRoll());
    assert.strictEqual(m.requestRoll(), false);
    assert.strictEqual(m.canRoll(), false);
  });

  it('does not start the next turn until the move is finished', () => {
    const m = new TurnMachine();
    m.startTest();
    m.submitAnswer(0, true);
    assert.strictEqual(m.nextTurn(), false);
    m.requestRoll();
    assert.strictEqual(m.nextTurn(), false);
  });
});

describe('Game start and turn counting', () => {
  it('always starts on tile 1, even after a previous game moved the token', () => {
    gameState.init('A', 'car', 'Easy');
    gameState.setCurrentTile(57);
    gameState.init('B', 'gem', 'Hard');
    assert.strictEqual(gameState.currentTile, 1);
  });

  it('counts a turn only when it is completed, not when answered', () => {
    gameState.init('A');
    gameState.recordAnswer({ isCorrect: true, topic: '3. Scalar multiplication', questionText: 'q' });
    assert.strictEqual(gameState.turnsTaken, 0);
    assert.strictEqual(gameState.correctAnswers, 1);
    gameState.completeTurn();
    assert.strictEqual(gameState.turnsTaken, 1);
  });
});
