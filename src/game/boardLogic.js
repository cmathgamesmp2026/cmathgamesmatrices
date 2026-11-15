/**
 * Snake and Ladders Board Logic
 * Pure module independent of Phaser for testability.
 */

export const BOARD_SIZE = 10;
export const TOTAL_TILES = 100;
export const WINNING_TILE = 100;
export const START_TILE = 1;

// Ladders: start -> end (goes up)
export const LADDERS = {
  4: 25,
  13: 46,
  27: 57,
  33: 49,
  42: 63,
  50: 69,
  62: 81,
  74: 92
};

// Snakes: start -> end (goes down)
export const SNAKES = {
  99: 41,
  95: 75,
  89: 53,
  70: 34,
  64: 60,
  56: 19,
  47: 26,
  16: 6
};

/**
 * Maps tile number (1..100) to 0-based grid (col, row).
 * Bottom row is row 9, top row is row 0.
 * Left col is 0, right col is 9.
 * Classic boustrophedon (zig-zag):
 * Row 0 (bottom, rowIdx = 9 in canvas): 1 -> 10 (left to right)
 * Row 1 (rowIdx = 8): 20 <- 11 (right to left)
 * ...
 * Row 9 (top, rowIdx = 0 in canvas): 100 <- 91 (right to left)
 */
export function getTileCoordinates(tileNumber) {
  if (tileNumber < 1 || tileNumber > TOTAL_TILES) {
    throw new Error(`Tile number out of bounds (1..100): ${tileNumber}`);
  }
  const zeroBased = tileNumber - 1;
  const rowFromBottom = Math.floor(zeroBased / BOARD_SIZE); // 0 at bottom, 9 at top
  const canvasRow = BOARD_SIZE - 1 - rowFromBottom; // 9 at bottom, 0 at top

  const remainder = zeroBased % BOARD_SIZE;
  // Even rows from bottom go left to right: col 0..9
  // Odd rows from bottom go right to left: col 9..0
  const canvasCol = (rowFromBottom % 2 === 0) ? remainder : (BOARD_SIZE - 1 - remainder);

  return { col: canvasCol, row: canvasRow, rowFromBottom };
}

/**
 * Calculates landing tile after rolling dice, applying bounce-back rule.
 * Overshooting 100 bounces back by excess.
 * E.g., at 98 rolling 4 -> 102 -> 100 - 2 = 98.
 */
export function calculateTargetTile(currentTile, move) {
  if (move <= 0) return currentTile;
  const rawTarget = currentTile + move;
  if (rawTarget <= WINNING_TILE) {
    return rawTarget;
  }
  const excess = rawTarget - WINNING_TILE;
  return WINNING_TILE - excess;
}

/**
 * Resolves full turn movement:
 * 1. Step-by-step path for normal movement (with bounce back if applicable)
 * 2. Intermediate tile (before snake or ladder)
 * 3. Final tile after applying snake or ladder (if any)
 * Note: Snakes and ladders trigger only ONCE per landing (no chains).
 */
export function resolveTurnMovement(currentTile, move) {
  const intermediateTile = calculateTargetTile(currentTile, move);

  // Generate intermediate tile path for animation
  const path = [];
  if (currentTile + move <= WINNING_TILE) {
    for (let t = currentTile + 1; t <= intermediateTile; t++) {
      path.push(t);
    }
  } else {
    // Moved up to 100, then bounced back
    for (let t = currentTile + 1; t <= WINNING_TILE; t++) {
      path.push(t);
    }
    for (let t = WINNING_TILE - 1; t >= intermediateTile; t--) {
      path.push(t);
    }
  }

  let finalTile = intermediateTile;
  let effect = 'none'; // 'none' | 'ladder' | 'snake' | 'win'

  if (intermediateTile === WINNING_TILE) {
    effect = 'win';
  } else if (LADDERS[intermediateTile]) {
    finalTile = LADDERS[intermediateTile];
    effect = 'ladder';
  } else if (SNAKES[intermediateTile]) {
    finalTile = SNAKES[intermediateTile];
    effect = 'snake';
  }

  return {
    fromTile: currentTile,
    move,
    path,
    intermediateTile,
    finalTile,
    effect,
    ladderEnd: effect === 'ladder' ? finalTile : null,
    snakeEnd: effect === 'snake' ? finalTile : null,
    isWin: finalTile === WINNING_TILE
  };
}
