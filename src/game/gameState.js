import { events, EVENTS } from './events.js';

class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.playerName = '';
    this.difficulty = 'Easy';
    this.currentTile = 1;
    this.turnsTaken = 0;
    this.correctAnswers = 0;
    this.wrongAnswers = 0;
    this.elapsedSeconds = 0;
    this.timerInterval = null;
    this.timerStarted = false;
    this.previousTopic = null;
    this.usedQuestions = [];
    this.currentQuestion = null;
    this.nextPrefetchedQuestion = null;
    this.isAnswering = false;
    this.isRollingOrMoving = false;
    this.isGameOver = false;
  }

  init(name, difficulty = 'Easy') {
    this.reset();
    this.playerName = (name || 'Player').trim().slice(0, 100);
    this.difficulty = difficulty === 'Hard' ? 'Hard' : 'Easy';
    this.notifyUpdate();
  }

  startTimer() {
    if (this.timerStarted || this.isGameOver) return;
    this.timerStarted = true;
    this.startTime = Date.now() - this.elapsedSeconds * 1000;

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
      this.notifyUpdate();
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  recordTurn({ isCorrect, topic, questionText }) {
    this.turnsTaken += 1;
    if (isCorrect) {
      this.correctAnswers += 1;
    } else {
      this.wrongAnswers += 1;
    }
    if (topic) {
      this.previousTopic = topic;
    }
    if (questionText && !this.usedQuestions.includes(questionText)) {
      this.usedQuestions.push(questionText.slice(0, 120));
    }
    this.notifyUpdate();
  }

  setCurrentTile(tile) {
    this.currentTile = tile;
    this.notifyUpdate();
  }

  getFormattedTime() {
    const mins = Math.floor(this.elapsedSeconds / 60);
    const secs = this.elapsedSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  getAccuracy() {
    const total = this.correctAnswers + this.wrongAnswers;
    if (total === 0) return 0;
    return Math.round((this.correctAnswers / total) * 100);
  }

  getSummary() {
    return {
      name: this.playerName,
      difficulty: this.difficulty,
      currentTile: this.currentTile,
      turnsTaken: this.turnsTaken,
      correctAnswers: this.correctAnswers,
      wrongAnswers: this.wrongAnswers,
      accuracy: this.getAccuracy(),
      timeTakenSeconds: this.elapsedSeconds,
      displayTime: this.getFormattedTime()
    };
  }

  notifyUpdate() {
    events.emit(EVENTS.UPDATE_STATS, this.getSummary());
  }
}

export const gameState = new GameState();
