/**
 * HTML UI Controller
 * Manages Start Screen, Token Selection, In-game Difficulty Switching, HUD Stats,
 * Question Card, Matrices Rendering, Results Screen, and Leaderboard.
 */

import { events, EVENTS } from '../game/events.js';
import { gameState } from '../game/gameState.js';
import { rollDice } from '../game/diceLogic.js';
import { resolveTurnMovement } from '../game/boardLogic.js';
import { TurnMachine, TURN_STATES } from '../game/turnMachine.js';
import { nextPlaceholderContent, resetPlaceholderContent } from '../game/placeholderContent.js';
import { renderOptionContent, renderMatricesSection } from './matrixRenderer.js';

// Stage 1: lessons and questions are placeholders. Stage 2 turns this off and uses Gemini.
const USE_PLACEHOLDER_CONTENT = true;

export const TOKEN_ICONS = {
  car: '🏎️',
  chess: '♟️',
  rocket: '🚀',
  crown: '👑',
  gem: '💎',
  lightning: '⚡'
};

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
      tokenButtons: document.querySelectorAll('.token-btn'),
      startGameBtn: document.getElementById('start-game-btn'),
      viewLeaderboardBtn: document.getElementById('view-leaderboard-btn'),
      nameError: document.getElementById('name-error'),

      // HUD elements
      hudPlayerName: document.getElementById('hud-player-name'),
      hudTokenIcon: document.getElementById('hud-token-icon'),
      diffBtnEasy: document.getElementById('diff-btn-easy'),
      diffBtnHard: document.getElementById('diff-btn-hard'),
      hudCurrentTile: document.getElementById('hud-current-tile'),
      hudProgressBar: document.getElementById('hud-progress-bar'),
      hudTurnCount: document.getElementById('hud-turn-count'),
      hudCorrectCount: document.getElementById('hud-correct-count'),
      hudWrongCount: document.getElementById('hud-wrong-count'),
      hudTimer: document.getElementById('hud-timer'),

      // Question card
      stepItems: document.querySelectorAll('.step-item'),
      lessonContainer: document.getElementById('lesson-container'),
      lessonTopic: document.getElementById('lesson-topic'),
      lessonTopicCount: document.getElementById('lesson-topic-count'),
      lessonTitle: document.getElementById('lesson-title'),
      lessonKeyPoints: document.getElementById('lesson-key-points'),
      lessonExampleDesc: document.getElementById('lesson-example-desc'),
      lessonExampleMatrices: document.getElementById('lesson-example-matrices'),
      lessonExampleSteps: document.getElementById('lesson-example-steps'),
      lessonExampleResult: document.getElementById('lesson-example-result'),
      readyBtn: document.getElementById('ready-btn'),
      rollBtn: document.getElementById('roll-btn'),
      rollHint: document.getElementById('roll-hint'),
      questionContainer: document.getElementById('question-container'),
      questionTopic: document.getElementById('question-topic'),
      questionDiffBadge: document.getElementById('question-diff-badge'),
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

    this.selectedToken = 'car';
    this.machine = new TurnMachine();
    this.currentContent = null;
    this.loadId = 0;

    this.initEventListeners();
    this.initBusListeners();
  }

  initEventListeners() {
    // Token selection buttons
    this.elements.tokenButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.elements.tokenButtons.forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedToken = btn.dataset.token || 'car';
        gameState.setToken(this.selectedToken);
      });
    });

    // In-game difficulty toggle buttons
    if (this.elements.diffBtnEasy) {
      this.elements.diffBtnEasy.addEventListener('click', () => this.handleDifficultyChange('Easy'));
    }
    if (this.elements.diffBtnHard) {
      this.elements.diffBtnHard.addEventListener('click', () => this.handleDifficultyChange('Hard'));
    }

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

    // Retry button (shown if a lesson could not be loaded)
    this.elements.retryQuestionBtn.addEventListener('click', () => {
      this.elements.questionError.classList.add('hidden');
      this.beginTurn();
    });

    // Turn flow controls
    this.elements.readyBtn.addEventListener('click', () => this.handleReady());
    this.elements.rollBtn.addEventListener('click', () => this.handleRoll());
    document.addEventListener('keydown', (e) => this.handleKeydown(e));

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

  handleDifficultyChange(newDifficulty) {
    // Difficulty can only change while the lesson is showing (LEARN state).
    if (this.machine.state !== TURN_STATES.LEARN) return;
    if (gameState.difficulty === newDifficulty) return;

    gameState.setDifficulty(newDifficulty);

    // Reload this turn's lesson + question under the new difficulty
    this.beginTurn();
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
    gameState.init(rawName, this.selectedToken, gameState.difficulty);

    // Switch screen
    this.elements.startScreen.classList.add('hidden');
    this.elements.victoryModal.classList.add('hidden');
    this.elements.gameScreen.classList.remove('hidden');

    events.emit(EVENTS.START_GAME, {
      playerName: gameState.playerName,
      selectedToken: this.selectedToken,
      difficulty: gameState.difficulty
    });

    // Fetch the first lesson (the first turn always begins at LEARN)
    this.machine.reset();
    resetPlaceholderContent();
    this.beginTurn();
  }

  updateHUD(stats) {
    this.elements.hudPlayerName.textContent = stats.name;
    if (this.elements.hudTokenIcon) {
      this.elements.hudTokenIcon.textContent = TOKEN_ICONS[stats.selectedToken] || '🏎️';
    }

    // Update in-game difficulty toggle buttons (enabled/disabled state is set in syncTurnUI)
    const isHard = stats.difficulty === 'Hard';
    if (this.elements.diffBtnEasy) {
      this.elements.diffBtnEasy.classList.toggle('active', !isHard);
    }
    if (this.elements.diffBtnHard) {
      this.elements.diffBtnHard.classList.toggle('active', isHard);
    }

    // Update question card difficulty badge
    if (this.elements.questionDiffBadge) {
      this.elements.questionDiffBadge.textContent = isHard ? 'Hard • 2 Dice' : 'Easy • 1 Die';
      this.elements.questionDiffBadge.className = `difficulty-badge ${isHard ? 'hard' : 'easy'}`;
    }

    this.elements.hudCurrentTile.textContent = `Tile ${stats.currentTile} / 100`;
    this.elements.hudProgressBar.style.width = `${stats.currentTile}%`;
    this.elements.hudTurnCount.textContent = `Turn ${stats.turnsTaken + 1}`;
    this.elements.hudCorrectCount.textContent = `✓ ${stats.correctAnswers}`;
    this.elements.hudWrongCount.textContent = `✗ ${stats.wrongAnswers}`;
    this.elements.hudTimer.textContent = stats.displayTime;
  }

  // ---------------------------------------------------------------------
  // Turn flow: LEARN -> TEST -> ANSWERED -> ROLLING -> MOVING
  // The TurnMachine decides what is allowed; the UI only reflects it.
  // ---------------------------------------------------------------------

  /**
   * Returns the lesson + question for the current turn.
   * Stage 1 uses placeholder content; Stage 2 swaps in the Gemini endpoint.
   */
  async getTurnContent() {
    if (USE_PLACEHOLDER_CONTENT) {
      return nextPlaceholderContent();
    }
    throw new Error('The lesson service is not connected yet.');
  }

  /** Show the lesson card for a new turn (the machine is already in LEARN). */
  async beginTurn() {
    const loadId = ++this.loadId;
    const el = this.elements;

    el.lessonContainer.classList.add('hidden');
    el.questionContainer.classList.add('hidden');
    el.questionError.classList.add('hidden');
    el.questionLoading.classList.remove('hidden');
    this.syncTurnUI();

    try {
      const content = await this.getTurnContent();
      if (loadId !== this.loadId) return; // a newer load replaced this one

      this.currentContent = content;
      this.renderLesson(content);
      el.questionLoading.classList.add('hidden');
      el.lessonContainer.classList.remove('hidden');

      // The timer starts when the first lesson appears.
      gameState.startTimer();
      this.syncTurnUI();
    } catch (err) {
      if (loadId !== this.loadId) return;
      console.error('[Lesson Load Error]:', err);
      el.questionLoading.classList.add('hidden');
      el.errorText.textContent = err.message || 'Could not load the lesson. Please try again.';
      el.questionError.classList.remove('hidden');
    }
  }

  /** Keep step indicator, banner, roll button and difficulty toggle in sync with the machine. */
  syncTurnUI() {
    const el = this.elements;
    const state = this.machine.state;
    const step = this.machine.step;

    el.stepItems.forEach((item) => {
      const n = Number(item.dataset.step);
      item.classList.toggle('current', n === step);
      item.classList.toggle('done', n < step);
    });

    const rollEnabled = this.machine.canRoll();
    el.rollBtn.disabled = !rollEnabled;
    if (state === TURN_STATES.ANSWERED) {
      el.rollHint.textContent = 'Press Roll (or Space) to roll the dice';
    } else if (state === TURN_STATES.ROLLING || state === TURN_STATES.MOVING) {
      el.rollHint.textContent = 'Rolling...';
    } else {
      el.rollHint.textContent = 'Answer the question to roll';
    }

    // Difficulty can only change while reading the lesson.
    const canChangeDifficulty = state === TURN_STATES.LEARN;
    if (el.diffBtnEasy) el.diffBtnEasy.disabled = !canChangeDifficulty;
    if (el.diffBtnHard) el.diffBtnHard.disabled = !canChangeDifficulty;

    if (state === TURN_STATES.LEARN) {
      this.setBanner('Read the lesson, then take the test.');
    } else if (state === TURN_STATES.TEST) {
      this.setBanner('Pick an answer (keys 1-4).');
    }
  }

  setBanner(text, className = 'action-banner') {
    this.elements.actionBanner.textContent = text;
    this.elements.actionBanner.className = className;
  }

  /** Split "5. Transpose of a matrix" into { number: 5, name: 'Transpose of a matrix' }. */
  parseTopic(topic) {
    const match = String(topic || '').match(/^\s*(\d+)\s*[.:\-–)]?\s*(.*)$/);
    return match ? { number: Number(match[1]), name: match[2] || String(topic) } : { number: null, name: String(topic || '') };
  }

  renderLesson(content) {
    const el = this.elements;
    const { lesson, topic } = content;
    const parsed = this.parseTopic(topic);

    el.lessonTopic.textContent = parsed.name;
    el.lessonTopicCount.textContent = parsed.number ? `Topic ${parsed.number} of 10` : '';
    el.lessonTitle.textContent = lesson.title;

    el.lessonKeyPoints.innerHTML = '';
    lesson.keyPoints.forEach((point) => {
      const li = document.createElement('li');
      li.textContent = point;
      el.lessonKeyPoints.appendChild(li);
    });

    const ex = lesson.example;
    el.lessonExampleDesc.textContent = ex.description || '';
    el.lessonExampleMatrices.innerHTML = renderMatricesSection(ex.matrices);
    el.lessonExampleMatrices.classList.toggle('hidden', !ex.matrices);

    el.lessonExampleSteps.innerHTML = '';
    (ex.steps || []).forEach((step) => {
      const li = document.createElement('li');
      li.textContent = step;
      el.lessonExampleSteps.appendChild(li);
    });

    el.lessonExampleResult.innerHTML = `<span>Result:</span> ${renderOptionContent(ex.result)}`;
  }

  /** LEARN -> TEST: show the question for the same topic. */
  handleReady() {
    if (!this.machine.startTest()) return;
    this.elements.lessonContainer.classList.add('hidden');
    this.displayQuestion(this.currentContent);
    this.syncTurnUI();
  }

  displayQuestion(content) {
    const q = content.question;
    const el = this.elements;

    el.questionContainer.classList.remove('hidden');
    el.feedbackSection.classList.add('hidden');

    el.questionTopic.textContent = this.parseTopic(content.topic).name;
    const isHard = gameState.difficulty === 'Hard';
    el.questionDiffBadge.textContent = isHard ? 'Hard • 2 Dice' : 'Easy • 1 Die';
    el.questionDiffBadge.className = `difficulty-badge ${isHard ? 'hard' : 'easy'}`;
    el.questionText.textContent = q.text;

    // Render Matrix data if provided (e.g. A = [...], B = [...])
    el.questionMatrices.innerHTML = renderMatricesSection(q.matrices);

    // Options (4 choices)
    el.optionsGrid.innerHTML = '';
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
      el.optionsGrid.appendChild(btn);
    });
  }

  /** TEST -> ANSWERED: lock the options, show correct/wrong and the working. */
  handleOptionClick(selectedIndex) {
    const q = this.currentContent && this.currentContent.question;
    if (!q || selectedIndex < 0 || selectedIndex >= q.options.length) return;

    const isCorrect = selectedIndex === q.correctIndex;
    // Only the first answer is accepted; any later click is ignored here.
    if (!this.machine.submitAnswer(selectedIndex, isCorrect)) return;

    // Lock options & highlight results
    this.elements.optionsGrid.querySelectorAll('.option-card').forEach((btn, idx) => {
      btn.disabled = true;
      if (idx === q.correctIndex) btn.classList.add('correct');
      if (idx === selectedIndex && !isCorrect) btn.classList.add('wrong');
    });

    gameState.recordAnswer({
      isCorrect,
      topic: this.currentContent.topic,
      questionText: q.text
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
    this.elements.feedbackExplanation.innerHTML = '';
    const working = document.createElement('strong');
    working.textContent = 'Working: ';
    this.elements.feedbackExplanation.appendChild(working);
    this.elements.feedbackExplanation.appendChild(document.createTextNode(q.explanation || 'See your notes for the steps.'));

    this.setBanner('Answered! Press Roll to move.', 'action-banner active');
    this.syncTurnUI();
  }

  /** ANSWERED -> ROLLING -> MOVING. Ignored in every other state. */
  handleRoll() {
    if (!this.machine.requestRoll()) return;

    const isCorrect = this.machine.answerCorrect;
    const roll = rollDice({ difficulty: gameState.difficulty, isCorrect });
    const movement = resolveTurnMovement(gameState.currentTile, roll.move);

    this.setBanner(
      `Rolling ${gameState.difficulty === 'Hard' ? '2 dice' : '1 die'}... (${isCorrect ? 'Correct bias' : 'Wrong bias'})`,
      'action-banner active'
    );
    this.syncTurnUI();

    // Listen once for dice animation complete, then trigger token movement
    events.once(EVENTS.DICE_ANIMATION_COMPLETE, () => {
      if (!this.machine.startMoving()) return;

      let rollDesc = roll.diceValues.join(' + ');
      if (roll.diceValues.length > 1) rollDesc += ` = ${roll.total}`;
      this.setBanner(`Rolled ${rollDesc}! Moving forward...`, 'action-banner active');

      events.emit(EVENTS.MOVE_TOKEN, {
        path: movement.path,
        intermediateTile: movement.intermediateTile,
        finalTile: movement.finalTile,
        effect: movement.effect
      });
    });

    // Trigger Phaser Dice Roll Animation
    events.emit(EVENTS.ROLL_DICE_ANIMATION, {
      diceValues: roll.diceValues,
      total: roll.total,
      isCorrect
    });
  }

  handleMoveCompleted(finalTile, effect) {
    // Ignore stray completion events that do not belong to a move in progress.
    if (this.machine.state !== TURN_STATES.MOVING) return;

    gameState.setCurrentTile(finalTile);
    gameState.completeTurn(); // a completed turn = lesson + question + roll + move

    // Display feedback on tile landing
    if (effect === 'ladder') {
      this.setBanner(`🎉 Awesome! Climbed a ladder to Tile ${finalTile}!`, 'action-banner ladder');
    } else if (effect === 'snake') {
      this.setBanner(`🐍 Oh no! Slid down a snake to Tile ${finalTile}!`, 'action-banner snake');
    } else if (effect === 'win') {
      this.setBanner('🏆 VICTORY! Reached Tile 100!', 'action-banner win');
    } else {
      this.setBanner(`Landed on Tile ${finalTile}.`);
    }

    if (finalTile === 100) {
      gameState.stopTimer();
      gameState.isGameOver = true;
      this.handleGameWon();
    } else {
      // The machine stays in MOVING until the next lesson is ready, so no input slips through.
      setTimeout(() => {
        if (this.machine.nextTurn()) this.beginTurn();
      }, 1400);
    }
  }

  /** Enter = continue from lesson, 1-4 = pick option, Space = roll. */
  handleKeydown(e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = this.elements;
    if (el.gameScreen.classList.contains('hidden') || gameState.isGameOver) return;
    if (!el.victoryModal.classList.contains('hidden') || !el.leaderboardModal.classList.contains('hidden')) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    if (e.key === 'Enter') {
      const lessonVisible = !el.lessonContainer.classList.contains('hidden');
      if (lessonVisible && this.machine.state === TURN_STATES.LEARN) {
        e.preventDefault();
        this.handleReady();
      }
    } else if (e.key >= '1' && e.key <= '4') {
      if (this.machine.state === TURN_STATES.TEST) {
        e.preventDefault();
        this.handleOptionClick(Number(e.key) - 1);
      }
    } else if (e.key === ' ' || e.code === 'Space') {
      if (this.machine.canRoll()) {
        e.preventDefault();
        this.handleRoll();
      }
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
