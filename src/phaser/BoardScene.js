import Phaser from 'phaser';
import { BoardDrawer } from './boardDrawer.js';
import { PlayerToken } from './token.js';
import { DiceAnimator } from './dice.js';
import { events, EVENTS } from '../game/events.js';

export default class BoardScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BoardScene' });
  }

  create() {
    const boardSize = 700;

    // Draw the 10x10 board, numbers, snakes and ladders
    this.boardDrawer = new BoardDrawer(this, boardSize, boardSize);
    this.boardDrawer.draw();

    // Player token
    this.token = new PlayerToken(this, this.boardDrawer);

    // Dice animator
    this.diceAnimator = new DiceAnimator(this, boardSize, boardSize);

    // Setup Event Listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Reset / Start Game
    events.on(EVENTS.START_GAME, ({ selectedToken } = {}) => {
      if (selectedToken) {
        this.token.setTokenType(selectedToken);
      }
      this.token.teleportTo(1);
    });

    events.on(EVENTS.TOKEN_CHANGED, ({ token } = {}) => {
      if (token) {
        this.token.setTokenType(token);
      }
    });

    events.on(EVENTS.RESTART_GAME, () => {
      this.token.teleportTo(1);
    });

    events.on(EVENTS.TELEPORT_TOKEN, ({ tile } = {}) => {
      if (typeof tile === 'number') {
        this.token.teleportTo(tile);
      }
    });

    // Roll Dice
    events.on(EVENTS.ROLL_DICE_ANIMATION, ({ diceValues, total }) => {
      this.diceAnimator.roll({
        diceValues,
        total,
        onComplete: () => {
          events.emit(EVENTS.DICE_ANIMATION_COMPLETE, { diceValues, total });
        }
      });
    });

    // Move Token
    events.on(EVENTS.MOVE_TOKEN, ({ path, intermediateTile, finalTile, effect }) => {
      this.token.animateMovement({
        path,
        intermediateTile,
        finalTile,
        effect,
        onStep: (tile) => {
          events.emit(EVENTS.STEP_LANDED, { tile });
        },
        onComplete: () => {
          events.emit(EVENTS.MOVE_COMPLETE, { currentTile: finalTile, effect });
        }
      });
    });
  }
}
