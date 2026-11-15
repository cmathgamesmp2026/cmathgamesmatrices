/**
 * Global Event Bus
 * Facilitates decoupled communication between Phaser BoardScene and HTML UI.
 */

class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in event listener for "${event}":`, err);
        }
      });
    }
  }

  once(event, callback) {
    const wrapper = (data) => {
      this.off(event, wrapper);
      callback(data);
    };
    return this.on(event, wrapper);
  }
}

export const events = new EventBus();

// Event Name Constants
export const EVENTS = {
  START_GAME: 'START_GAME',
  RESTART_GAME: 'RESTART_GAME',
  QUESTION_LOADING: 'QUESTION_LOADING',
  QUESTION_READY: 'QUESTION_READY',
  QUESTION_ERROR: 'QUESTION_ERROR',
  ANSWER_SUBMITTED: 'ANSWER_SUBMITTED',
  ROLL_DICE_ANIMATION: 'ROLL_DICE_ANIMATION',
  DICE_ANIMATION_COMPLETE: 'DICE_ANIMATION_COMPLETE',
  MOVE_TOKEN: 'MOVE_TOKEN',
  STEP_LANDED: 'STEP_LANDED',
  SPECIAL_EFFECT: 'SPECIAL_EFFECT', // snake or ladder
  MOVE_COMPLETE: 'MOVE_COMPLETE',
  GAME_WON: 'GAME_WON',
  UPDATE_STATS: 'UPDATE_STATS'
};
