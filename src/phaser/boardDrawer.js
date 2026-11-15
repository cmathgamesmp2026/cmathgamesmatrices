/**
 * Board Drawer for Phaser
 * Renders the 10x10 boustrophedon grid, snakes, and ladders with Phaser Graphics.
 */

import {
  BOARD_SIZE,
  TOTAL_TILES,
  LADDERS,
  SNAKES,
  getTileCoordinates
} from '../game/boardLogic.js';

export class BoardDrawer {
  constructor(scene, boardWidth = 700, boardHeight = 700) {
    this.scene = scene;
    this.boardWidth = boardWidth;
    this.boardHeight = boardHeight;
    this.tileSize = boardWidth / BOARD_SIZE;

    this.gridGraphics = scene.add.graphics();
    this.ladderGraphics = scene.add.graphics();
    this.snakeGraphics = scene.add.graphics();
    this.tileTexts = [];
  }

  getTileCenter(tileNumber) {
    const coords = getTileCoordinates(tileNumber);
    const x = coords.col * this.tileSize + this.tileSize / 2;
    const y = coords.row * this.tileSize + this.tileSize / 2;
    return { x, y, col: coords.col, row: coords.row };
  }

  draw() {
    this.drawGrid();
    this.drawLadders();
    this.drawSnakes();
  }

  drawGrid() {
    this.gridGraphics.clear();

    const colors = [0xf8fafc, 0xe2e8f0]; // Modern crisp checkered pattern
    const borderCol = 0xcbd5e1;

    for (let tile = 1; tile <= TOTAL_TILES; tile++) {
      const coords = getTileCoordinates(tile);
      const x = coords.col * this.tileSize;
      const y = coords.row * this.tileSize;

      const isEvenCol = coords.col % 2 === 0;
      const isEvenRow = coords.row % 2 === 0;
      let fillColor = (isEvenCol ^ isEvenRow) ? colors[0] : colors[1];

      // Highlight Tile 1 (Start) and Tile 100 (Win)
      if (tile === 1) {
        fillColor = 0xdcfce7; // soft green
      } else if (tile === 100) {
        fillColor = 0xfef08a; // soft gold
      } else if (LADDERS[tile]) {
        fillColor = 0xfef3c7; // subtle ladder start tint
      } else if (SNAKES[tile]) {
        fillColor = 0xfee2e2; // subtle snake start tint
      }

      // Draw tile background
      this.gridGraphics.fillStyle(fillColor, 1);
      this.gridGraphics.fillRect(x, y, this.tileSize, this.tileSize);

      // Tile border
      this.gridGraphics.lineStyle(1.5, borderCol, 0.8);
      this.gridGraphics.strokeRect(x, y, this.tileSize, this.tileSize);

      // Tile Number Label
      let labelText = `${tile}`;
      let textStyle = {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        fontSize: '13px',
        fontWeight: 'bold',
        color: '#475569'
      };

      if (tile === 100) {
        labelText = '★ 100';
        textStyle.color = '#854d0e';
        textStyle.fontSize = '14px';
      } else if (tile === 1) {
        labelText = '▶ 1';
        textStyle.color = '#166534';
      }

      const txt = this.scene.add.text(x + 5, y + 4, labelText, textStyle);
      this.tileTexts.push(txt);
    }

    // Outer board border
    this.gridGraphics.lineStyle(3, 0x94a3b8, 1);
    this.gridGraphics.strokeRect(0, 0, this.boardWidth, this.boardHeight);
  }

  drawLadders() {
    this.ladderGraphics.clear();

    const railColor = 0xb45309; // amber / bronze
    const railHighlight = 0xf59e0b;
    const shadowColor = 0x000000;

    for (const [startTileStr, endTile] of Object.entries(LADDERS)) {
      const startTile = parseInt(startTileStr, 10);
      const start = this.getTileCenter(startTile);
      const end = this.getTileCenter(endTile);

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      const perpAngle = angle + Math.PI / 2;
      const halfWidth = 14;

      const pX = Math.cos(perpAngle) * halfWidth;
      const pY = Math.sin(perpAngle) * halfWidth;

      // Draw ladder drop shadow
      this.ladderGraphics.lineStyle(6, shadowColor, 0.15);
      this.ladderGraphics.lineBetween(start.x - pX + 3, start.y - pY + 4, end.x - pX + 3, end.y - pY + 4);
      this.ladderGraphics.lineBetween(start.x + pX + 3, start.y + pY + 4, end.x + pX + 3, end.y + pY + 4);

      // Rails
      this.ladderGraphics.lineStyle(5, railColor, 1);
      this.ladderGraphics.lineBetween(start.x - pX, start.y - pY, end.x - pX, end.y - pY);
      this.ladderGraphics.lineBetween(start.x + pX, start.y + pY, end.x + pX, end.y + pY);

      // Highlight inner stroke
      this.ladderGraphics.lineStyle(1.5, railHighlight, 0.8);
      this.ladderGraphics.lineBetween(start.x - pX, start.y - pY, end.x - pX, end.y - pY);
      this.ladderGraphics.lineBetween(start.x + pX, start.y + pY, end.x + pX, end.y + pY);

      // Rungs
      const rungSpacing = 22;
      const numRungs = Math.floor(length / rungSpacing);
      this.ladderGraphics.lineStyle(4, railColor, 1);

      for (let i = 1; i <= numRungs; i++) {
        const t = (i * rungSpacing) / length;
        if (t >= 0.95) continue;
        const rx = start.x + dx * t;
        const ry = start.y + dy * t;
        this.ladderGraphics.lineBetween(rx - pX, ry - pY, rx + pX, ry + pY);
      }

      // Start & End anchors
      this.ladderGraphics.fillStyle(railHighlight, 1);
      this.ladderGraphics.fillCircle(start.x - pX, start.y - pY, 4);
      this.ladderGraphics.fillCircle(start.x + pX, start.y + pY, 4);
      this.ladderGraphics.fillCircle(end.x - pX, end.y - pY, 4);
      this.ladderGraphics.fillCircle(end.x + pX, end.y + pY, 4);
    }
  }

  drawSnakes() {
    this.snakeGraphics.clear();

    for (const [startTileStr, endTile] of Object.entries(SNAKES)) {
      const startTile = parseInt(startTileStr, 10);
      const head = this.getTileCenter(startTile); // Snake starts at higher tile
      const tail = this.getTileCenter(endTile); // Snake drops to lower tile

      this.drawSingleSnake(head, tail);
    }
  }

  drawSingleSnake(head, tail) {
    const dx = tail.x - head.x;
    const dy = tail.y - head.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = 30;

    // Normal vector for undulating curves
    const nx = -dy / dist;
    const ny = dx / dist;

    const points = [];
    // 2-3 wave periods along snake body
    const waves = Math.max(2, Math.floor(dist / 140));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Interpolated position along straight line
      const lx = head.x + dx * t;
      const ly = head.y + dy * t;

      // Sine wave offset with tapering at head and tail
      const amplitude = Math.sin(t * Math.PI) * 22;
      const wave = Math.sin(t * Math.PI * 2 * waves);

      const x = lx + nx * amplitude * wave;
      const y = ly + ny * amplitude * wave;
      points.push({ x, y, t });
    }

    // Shadow
    this.snakeGraphics.lineStyle(10, 0x000000, 0.15);
    for (let i = 0; i < points.length - 1; i++) {
      this.snakeGraphics.lineBetween(points[i].x + 3, points[i].y + 4, points[i + 1].x + 3, points[i + 1].y + 4);
    }

    // Snake Body: crimson/coral snake with pattern rings
    const bodyColor = 0xdc2626; // vibrant red
    const stripeColor = 0x7f1d1d; // deep wine red
    const bellyColor = 0xfecaca;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      // Tapering width from head (16px) to tail (3px)
      const thickness = 14 * (1 - p1.t * 0.75) + 3;
      const isStripe = Math.floor(p1.t * 12) % 2 === 0;

      this.snakeGraphics.lineStyle(thickness, isStripe ? stripeColor : bodyColor, 1);
      this.snakeGraphics.lineBetween(p1.x, p1.y, p2.x, p2.y);
    }

    // Snake Head at start tile
    const headAngle = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
    this.snakeGraphics.fillStyle(bodyColor, 1);
    this.snakeGraphics.fillCircle(head.x, head.y, 11);

    // Eyes
    const eyeOffsetAngle1 = headAngle + Math.PI / 3;
    const eyeOffsetAngle2 = headAngle - Math.PI / 3;
    const eyeDist = 6;

    const eye1X = head.x + Math.cos(eyeOffsetAngle1) * eyeDist;
    const eye1Y = head.y + Math.sin(eyeOffsetAngle1) * eyeDist;
    const eye2X = head.x + Math.cos(eyeOffsetAngle2) * eyeDist;
    const eye2Y = head.y + Math.sin(eyeOffsetAngle2) * eyeDist;

    this.snakeGraphics.fillStyle(0xfacc15, 1); // Yellow eyes
    this.snakeGraphics.fillCircle(eye1X, eye1Y, 3.5);
    this.snakeGraphics.fillCircle(eye2X, eye2Y, 3.5);

    this.snakeGraphics.fillStyle(0x000000, 1); // Black pupils
    this.snakeGraphics.fillCircle(eye1X, eye1Y, 1.8);
    this.snakeGraphics.fillCircle(eye2X, eye2Y, 1.8);

    // Forked tongue
    const tongueAngle = headAngle + Math.PI;
    const tBaseX = head.x + Math.cos(tongueAngle) * 9;
    const tBaseY = head.y + Math.sin(tongueAngle) * 9;
    const tTipX = tBaseX + Math.cos(tongueAngle) * 8;
    const tTipY = tBaseY + Math.sin(tongueAngle) * 8;

    this.snakeGraphics.lineStyle(2, 0xef4444, 1);
    this.snakeGraphics.lineBetween(tBaseX, tBaseY, tTipX, tTipY);
    // Fork tips
    this.snakeGraphics.lineBetween(tTipX, tTipY, tTipX + Math.cos(tongueAngle + 0.5) * 4, tTipY + Math.sin(tongueAngle + 0.5) * 4);
    this.snakeGraphics.lineBetween(tTipX, tTipY, tTipX + Math.cos(tongueAngle - 0.5) * 4, tTipY + Math.sin(tongueAngle - 0.5) * 4);

    // Tapered Tail
    this.snakeGraphics.fillStyle(stripeColor, 1);
    this.snakeGraphics.fillCircle(tail.x, tail.y, 3);
  }

  destroy() {
    this.gridGraphics.destroy();
    this.ladderGraphics.destroy();
    this.snakeGraphics.destroy();
    this.tileTexts.forEach((t) => t.destroy());
    this.tileTexts = [];
  }
}
