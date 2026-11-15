/**
 * HTML UI Controller
 * Manages Start Screen, HUD Stats, Question Card, Matrices Rendering,
 * Results Screen, and Leaderboard.
 */

import { events, EVENTS } from '../game/events.js';
import { gameState } from '../game/gameState.js';
import { rollDice } from '../game/diceLogic.js';
import { resolveTurnMovement } from '../game/boardLogic.js';
import { renderOptionContent, renderMatricesSection } from './matrixRenderer.js';

export class HTMLUI {
  constructor() {
    this.elements = {
      // Screens
      startScreen: document.getElementById('start-screen'),
      gameScreen: document.getElementById('game-screen'),
      victoryModal: document.getElementById('victory-modal'),
      leaderboardModal: document.getElementById('leaderboard-modal'),

      // Start screen inputs
      nameInput: document.getElementById('player-name-input'),
      difficultySelect: document.getElementById('difficulty-select'),
      startGameBtn: document.getElementById('start-game-btn'),
      viewLeaderboardBtn: document.getElementById('view-leaderboard-btn'),
      nameError: document.getElementById('name-error'),

      // HUD elements
      hudPlayerName: document.getElementById('hud-player-name'),
      hudDifficulty: document.getElementById('hud-difficulty'),
      hudCurrentTile: document.getElementById('hud-current-tile'),
      hudProgressBar: document.getElementById('hud-progress-bar'),
      hudTurnCount: document.getElementById('hud-turn-count'),
      hudCorrectCount: document.getElementById('hud-correct-count'),
      hudWrongCount: document.getElementById('hud-wrong-count'),
      hudTimer: document.getElementById('hud-timer'),

      // Question card
      questionContainer: document.getElementById('question-container'),
      questionTopic: document.getElementById('question-topic'),
      questionText: document.getElementById('question-text'),
      questionMatrices: document.getElementById('question-matrices'),
      optionsGrid: document.getElementById('options-grid'),
      feedbackSection: document.getElementById('feedback-section'),
      feedbackResult: document.getElementById('feedback-result'),
      feedbackExplanation: document.getElementById('feedback-explanation'),
      actionBanner: document.getElementById('action-banner'),

      // Loading & Error states
      questionLoading: document.getElementById('question-loading'),
      questionError: document.getElementById('question-error'),
      errorText: document.getElementById('error-text'),
      retryQuestionBtn: document.getElementById('retry-question-btn'),

      // Victory modal
      victoryName: document.getElementById('victory-name'),
      victoryTime: document.getElementById('victory-time'),
      victoryTurns: document.getElementById('victory-turns'),
      victoryCorrect: document.getElementById('victory-correct'),
      victoryWrong: document.getElementById('victory-wrong'),
      victoryLeaderboardBody: document.getElementById('victory-leaderboard-body'),
      playAgainBtn: document.getElementById('play-again-btn'),

      // Leaderboard modal
      closeLeaderboardBtn: document.getElementById('close-leaderboard-btn'),
      leaderboardBody: document.getElementById('leaderboard-body')
    };

    this.currentQuestion = null;
    this.prefetchedQuestion = null;
    this.isFetchingQuestion = false;

    this.initEventListeners();
    this.initBusListeners();
  }

  initEventListeners() {
    // Start game button
    this.elements.startGameBtn.addEventListener('click', () => this.handleStartGame());
    this.elements.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleStartGame();
    });

    // View leaderboard from start screen
    this.elements.viewLeaderboardBtn.addEventListener('click', () => this.showLeaderboardModal());
    this.elements.closeLeaderboardBtn.addEventListener('click', () => {
      this.elements.leaderboardModal.classList.add('hidden');
    });

    // Retry question button
    this.elements.retryQuestionBtn.addEventListener('click', () => {
      this.elements.questionError.classList.add('hidden');
      this.loadTurnQuestion();
    });

    // Play again button
    this.elements.playAgainBtn.addEventListener('click', () => this.handlePlayAgain());
  }

  initBusListeners() {
    // Update HUD counters on gameState changes
    events.on(EVENTS.UPDATE_STATS, (stats) => {
      this.updateHUD(stats);
    });

    // When move completes
    events.on(EVENTS.MOVE_COMPLETE, ({ currentTile, effect }) => {
      this.handleMoveCompleted(currentTile, effect);
    });
  }

  handleStartGame() {
    const rawName = this.elements.nameInput.value.trim();
    if (!rawName) {
      this.elements.nameError.textContent = 'Please enter your name to begin!';
      this.elements.nameError.classList.remove('hidden');
      this.elements.nameInput.focus();
      return;
    }

    this.elements.nameError.classList.add('hidden');
    const difficulty = this.elements.difficultySelect.value;
    gameState.init(rawName, difficulty);

    // Switch screen
    this.elements.startScreen.classList.add('hidden');
    this.elements.victoryModal.classList.add('hidden');
    this.elements.gameScreen.classList.remove('hidden');

    events.emit(EVENTS.START_GAME, { playerName: gameState.playerName, difficulty });

    // Fetch first question
    this.loadTurnQuestion();
  }

  updateHUD(stats) {
    this.elements.hudPlayerName.textContent = stats.name;
    this.elements.hudDifficulty.textContent = stats.difficulty;
    this.elements.hudDifficulty.className = `difficulty-badge ${stats.difficulty.toLowerCase()}`;
    this.elements.hudCurrentTile.textContent = `Tile ${stats.currentTile} / 100`;
    this.elements.hudProgressBar.style.width = `${stats.currentTile}%`;
    this.elements.hudTurnCount.textContent = `Turn ${stats.turnsTaken + 1}`;
    this.elements.hudCorrectCount.textContent = `✓ ${stats.correctAnswers}`;
    this.elements.hudWrongCount.textContent = `✗ ${stats.wrongAnswers}`;
    this.elements.hudTimer.textContent = stats.displayTime;
  }

  /**
   * Fetches the next question with up to 2 retries on failure (total 3 attempts).
   */
  async fetchQuestionWithRetry(difficulty, previousTopic, usedQuestions, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch('/api/question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ difficulty, previousTopic, usedQuestions })
        });
        const data = await res.json();
        if (data.success && data.question) {
          return data.question;
        }
        throw new Error(data.error || 'Server could not produce a verified question');
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise((r) => setTimeout(r, 900));
      }
    }
  }

  /**
   * Starts pre-fetching the upcoming question in background while player rolls/moves
   */
  async prefetchNextQuestion() {
    if (this.isFetchingQuestion || this.prefetchedQuestion) return;
    this.isFetchingQuestion = true;
    try {
      this.prefetchedQuestion = await this.fetchQuestionWithRetry(
        gameState.difficulty,
        gameState.previousTopic,
        gameState.usedQuestions
      );
    } catch (err) {
      console.warn('[Prefetch Notice] Background prefetch will retry on turn demand:', err.message);
      this.prefetchedQuestion = null;
    } finally {
      this.isFetchingQuestion = false;
    }
  }

  /**
   * Loads question for current turn: uses pre-fetched question if available, else loads live.
   */
  async loadTurnQuestion() {
    this.elements.questionContainer.classList.add('hidden');
    this.elements.questionError.classList.add('hidden');
    this.elements.questionLoading.classList.remove('hidden');
    this.elements.feedbackSection.classList.add('hidden');
    this.elements.actionBanner.textContent = 'Answer the question to roll the dice!';
    this.elements.actionBanner.className = 'action-banner';

    try {
      let q = this.prefetchedQuestion;
      this.prefetchedQuestion = null;

      if (!q) {
        q = await this.fetchQuestionWithRetry(
          gameState.difficulty,
          gameState.previousTopic,
          gameState.usedQuestions
        );
      }

      this.currentQuestion = q;
      this.displayQuestion(q);

      // Start timer on first question display
      gameState.startTimer();

      // Trigger background prefetch for the NEXT turn
      this.prefetchNextQuestion();
    } catch (err) {
      console.error('[Question Load Error]:', err);
      this.elements.questionLoading.classList.add('hidden');
      this.elements.errorText.textContent = err.message || 'Unable to connect to Gemini API. Please check your network or API key.';
      this.elements.questionError.classList.remove('hidden');
    }
  }

  displayQuestion(q) {
    this.elements.questionLoading.classList.add('hidden');
    this.elements.questionError.classList.add('hidden');
    this.elements.questionContainer.classList.remove('hidden');

    // Topic tag & Question Statement
    this.elements.questionTopic.textContent = q.topic;
    this.elements.questionText.textContent = q.question;

    // Render Matrix data if provided (e.g. A = [...], B = [...])
    this.elements.questionMatrices.innerHTML = renderMatricesSection(q.matrices);

    // Options (4 choices)
    this.elements.optionsGrid.innerHTML = '';
    const optionLabels = ['A', 'B', 'C', 'D'];

    q.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-card';
      btn.dataset.index = idx;

      btn.innerHTML = `
        <div class="option-header">
          <span class="option-badge">${optionLabels[idx]}</span>
        </div>
        <div class="option-body">
          ${renderOptionContent(opt)}
        </div>
      `;

      btn.addEventListener('click', () => this.handleOptionClick(idx));
      this.elements.optionsGrid.appendChild(btn);
    });
  }

  handleOptionClick(selectedIndex) {
    if (gameState.isAnswering || gameState.isRollingOrMoving) return;
    gameState.isAnswering = true;
    gameState.isRollingOrMoving = true;

    const q = this.currentQuestion;
    const isCorrect = selectedIndex === q.correctIndex;

    // Lock options & highlight results
    const optionButtons = this.elements.optionsGrid.querySelectorAll('.option-card');
    optionButtons.forEach((btn, idx) => {
      btn.disabled = true;
      if (idx === q.correctIndex) {
        btn.classList.add('correct');
      }
      if (idx === selectedIndex && !isCorrect) {
        btn.classList.add('wrong');
      }
    });

    // Record turn in gameState
    gameState.recordTurn({
      isCorrect,
      topic: q.topic,
      questionText: q.question
    });

    // Show feedback & working explanation
    this.elements.feedbackSection.classList.remove('hidden');
    if (isCorrect) {
      this.elements.feedbackResult.className = 'feedback-result correct';
      this.elements.feedbackResult.innerHTML = `
        <span class="feedback-icon">✓</span>
        <span>Correct! High roll chance unlocked (70% for 4, 5, 6)!</span>
      `;
    } else {
      this.elements.feedbackResult.className = 'feedback-result wrong';
      this.elements.feedbackResult.innerHTML = `
        <span class="feedback-icon">✗</span>
        <span>Incorrect. Low roll chance applied (70% for 1, 2, 3).</span>
      `;
    }
    this.elements.feedbackExplanation.innerHTML = `<strong>Working:</strong> ${q.explanation || 'See textbook matrix steps.'}`;

    // Perform biased dice roll
    const roll = rollDice({
      difficulty: gameState.difficulty,
      isCorrect
    });

    // Calculate movement path & snake/ladder outcomes
    const movement = resolveTurnMovement(gameState.currentTile, roll.move);

    // Update banner & trigger Phaser dice animation
    if (gameState.difficulty === 'Hard') {
      this.elements.actionBanner.textContent = `Rolling 2 dice... (${isCorrect ? 'Correct bias' : 'Wrong bias'})`;
    } else {
      this.elements.actionBanner.textContent = `Rolling 1 die... (${isCorrect ? 'Correct bias' : 'Wrong bias'})`;
    }
    this.elements.actionBanner.className = 'action-banner active';

    // Trigger Phaser Dice Roll Animation
    events.emit(EVENTS.ROLL_DICE_ANIMATION, {
      diceValues: roll.diceValues,
      total: roll.total,
      isCorrect
    });

    // Listen once for dice animation complete, then trigger token movement
    events.once(EVENTS.DICE_ANIMATION_COMPLETE, () => {
      let rollDesc = roll.diceValues.join(' + ');
      if (roll.diceValues.length > 1) {
        rollDesc += ` = ${roll.total}`;
      }
      this.elements.actionBanner.textContent = `Rolled ${rollDesc}! Moving forward...`;

      // Trigger Token Movement in Phaser
      events.emit(EVENTS.MOVE_TOKEN, {
        path: movement.path,
        intermediateTile: movement.intermediateTile,
        finalTile: movement.finalTile,
        effect: movement.effect
      });
    });
  }

  handleMoveCompleted(finalTile, effect) {
    gameState.setCurrentTile(finalTile);
    gameState.isAnswering = false;

    // Display feedback on tile landing
    if (effect === 'ladder') {
      this.elements.actionBanner.textContent = `🎉 Awesome! Climbed a ladder to Tile ${finalTile}!`;
      this.elements.actionBanner.className = 'action-banner ladder';
    } else if (effect === 'snake') {
      this.elements.actionBanner.textContent = `🐍 Oh no! Slid down a snake to Tile ${finalTile}!`;
      this.elements.actionBanner.className = 'action-banner snake';
    } else if (effect === 'win') {
      this.elements.actionBanner.textContent = `🏆 VICTORY! Reached Tile 100!`;
      this.elements.actionBanner.className = 'action-banner win';
    } else {
      this.elements.actionBanner.textContent = `Landed on Tile ${finalTile}.`;
    }

    if (finalTile === 100) {
      // Victory!
      gameState.stopTimer();
      gameState.isGameOver = true;
      gameState.isRollingOrMoving = false;
      this.handleGameWon();
    } else {
      // Prepare for next turn
      gameState.isRollingOrMoving = false;
      setTimeout(() => {
        this.loadTurnQuestion();
      }, 1400);
    }
  }

  async handleGameWon() {
    const summary = gameState.getSummary();

    // Populate modal stats
    this.elements.victoryName.textContent = summary.name;
    this.elements.victoryTime.textContent = summary.displayTime;
    this.elements.victoryTurns.textContent = summary.turnsTaken;
    this.elements.victoryCorrect.textContent = summary.correctAnswers;
    this.elements.victoryWrong.textContent = summary.wrongAnswers;

    this.elements.victoryModal.classList.remove('hidden');

    // Save result to MySQL database via API
    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: summary.name,
          turnsTaken: summary.turnsTaken,
          correctAnswers: summary.correctAnswers,
          wrongAnswers: summary.wrongAnswers,
          timeTakenSeconds: summary.timeTakenSeconds
        })
      });
      const data = await res.json();
      if (data.success && data.leaderboard) {
        this.renderLeaderboardTable(this.elements.victoryLeaderboardBody, data.leaderboard);
      }
    } catch (err) {
      console.error('Failed to submit victory result to leaderboard:', err);
    }
  }

  async showLeaderboardModal() {
    this.elements.leaderboardModal.classList.remove('hidden');
    this.elements.leaderboardBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading scores...</td></tr>';
    try {
      const res = await fetch('/api/leaderboard?limit=10');
      const data = await res.json();
      if (data.success && data.leaderboard) {
        this.renderLeaderboardTable(this.elements.leaderboardBody, data.leaderboard);
      } else {
        this.elements.leaderboardBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No records yet! Be the first to win!</td></tr>';
      }
    } catch (err) {
      this.elements.leaderboardBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#ef4444;">Could not load leaderboard: ${err.message}</td></tr>`;
    }
  }

  renderLeaderboardTable(tbodyElement, rows) {
    if (!rows || rows.length === 0) {
      tbodyElement.innerHTML = '<tr><td colspan="5" style="text-align:center;">No records found.</td></tr>';
      return;
    }

    tbodyElement.innerHTML = rows
      .map((row) => {
        const medal = row.rank === 1 ? '🥇 ' : row.rank === 2 ? '🥈 ' : row.rank === 3 ? '🥉 ' : '';
        return `
          <tr>
            <td><strong>${medal}${row.rank}</strong></td>
            <td>${row.name}</td>
            <td><strong>${row.displayTime}</strong></td>
            <td>${row.turnsTaken}</td>
            <td><span class="score-pill">✓ ${row.correctAnswers} / ✗ ${row.wrongAnswers}</span></td>
          </tr>
        `;
      })
      .join('');
  }

  handlePlayAgain() {
    gameState.reset();
    events.emit(EVENTS.RESTART_GAME);
    this.elements.victoryModal.classList.add('hidden');
    this.elements.gameScreen.classList.add('hidden');
    this.elements.startScreen.classList.remove('hidden');
  }
}
