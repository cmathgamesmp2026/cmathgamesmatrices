/**
 * Snake and Ladders Dice Logic
 * Implements biased dice rolling based on answer correctness.
 *
 * Rules:
 * - Correct answer: each die has a 70% chance to roll 4, 5 or 6 (30% chance to roll 1, 2 or 3).
 * - Wrong answer: each die has a 70% chance to roll 1, 2 or 3 (30% chance to roll 4, 5 or 6).
 * - Within each group of three numbers, every value is equally likely.
 */

export const BIASED_PROBABILITY = 0.70;

/**
 * Rolls a single biased die.
 *
 * @param {boolean} isCorrect - Whether the user answered the question correctly.
 * @param {Function} [randomFn=Math.random] - Optional random number generator [0, 1).
 * @returns {number} Integer between 1 and 6.
 */
export function rollSingleDie(isCorrect, randomFn = Math.random) {
  const r = randomFn();

  // Favored group gets 70% probability
  // Correct -> [4, 5, 6] (70%), [1, 2, 3] (30%)
  // Wrong   -> [1, 2, 3] (70%), [4, 5, 6] (30%)
  const favoredGroup = isCorrect ? [4, 5, 6] : [1, 2, 3];
  const unfavoredGroup = isCorrect ? [1, 2, 3] : [4, 5, 6];

  const group = r < BIASED_PROBABILITY ? favoredGroup : unfavoredGroup;

  // Within the group of three, every value is equally likely
  const subIndex = Math.floor(randomFn() * 3);
  return group[subIndex];
}

/**
 * Rolls dice according to difficulty and correctness.
 * Easy = 1 die
 * Hard = 2 dice (sum of both dice)
 *
 * @param {Object} options
 * @param {'Easy'|'Hard'} options.difficulty
 * @param {boolean} options.isCorrect
 * @param {Function} [options.randomFn=Math.random]
 * @returns {{ diceValues: number[], total: number, move: number, isCorrect: boolean, difficulty: string }}
 */
export function rollDice({ difficulty = 'Easy', isCorrect = false, randomFn = Math.random } = {}) {
  const count = difficulty === 'Hard' ? 2 : 1;
  const diceValues = [];

  for (let i = 0; i < count; i++) {
    diceValues.push(rollSingleDie(isCorrect, randomFn));
  }

  const total = diceValues.reduce((sum, val) => sum + val, 0);

  return {
    diceValues,
    total,
    move: total,
    isCorrect,
    difficulty
  };
}
