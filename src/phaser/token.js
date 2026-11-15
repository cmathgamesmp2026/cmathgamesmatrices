/**
 * Player Token for Phaser
 * Handles token rendering, hopping animations along tiles, and ladder/snake traversal.
 */

export class PlayerToken {
  constructor(scene, boardDrawer) {
    this.scene = scene;
    this.boardDrawer = boardDrawer;
    this.container = scene.add.container(0, 0);

    this.shadow = scene.add.graphics();
    this.tokenBody = scene.add.graphics();
    this.glowRing = scene.add.graphics();

    this.container.add([this.shadow, this.glowRing, this.tokenBody]);

    this.currentTile = 1;
    this.radius = 18;
    this.drawToken();

    // Set initial position
    this.teleportTo(1);
  }

  drawToken() {
    // Shadow
    this.shadow.clear();
    this.shadow.fillStyle(0x000000, 0.25);
    this.shadow.fillEllipse(0, 10, this.radius * 2, this.radius);

    // Glow ring
    this.glowRing.clear();
    this.glowRing.lineStyle(3, 0x60a5fa, 0.6);
    this.glowRing.strokeCircle(0, 0, this.radius + 3);

    // Main token body: Sapphire Blue gradient-feel with glossy rim
    this.tokenBody.clear();
    this.tokenBody.fillStyle(0x1d4ed8, 1); // outer rich blue
    this.tokenBody.fillCircle(0, 0, this.radius);

    this.tokenBody.fillStyle(0x3b82f6, 1); // lighter inner core
    this.tokenBody.fillCircle(0, 0, this.radius - 3);

    // White concentric badge ring & star / pawn accent
    this.tokenBody.lineStyle(2, 0xffffff, 0.9);
    this.tokenBody.strokeCircle(0, 0, this.radius - 7);

    this.tokenBody.fillStyle(0xffffff, 1);
    this.tokenBody.fillCircle(0, 0, 4);

    // Subtle idle floating / pulsing tween
    this.scene.tweens.add({
      targets: this.glowRing,
      alpha: { from: 0.3, to: 0.9 },
      scale: { from: 0.95, to: 1.1 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  teleportTo(tileNumber) {
    this.currentTile = tileNumber;
    const center = this.boardDrawer.getTileCenter(tileNumber);
    this.container.setPosition(center.x, center.y);
    this.container.setScale(1);
  }

  /**
   * Animates a sequence of tile hops, followed by a ladder climb or snake slide if triggered.
   */
  animateMovement({ path, intermediateTile, finalTile, effect, onStep, onComplete }) {
    if (!path || path.length === 0) {
      if (onComplete) onComplete();
      return;
    }

    let stepIndex = 0;

    const hopNext = () => {
      if (stepIndex >= path.length) {
        // Reached intermediate tile
        this.currentTile = intermediateTile;
        if (effect === 'ladder') {
          this.animateLadderClimb(intermediateTile, finalTile, onComplete);
        } else if (effect === 'snake') {
          this.animateSnakeDrop(intermediateTile, finalTile, onComplete);
        } else if (effect === 'win') {
          this.animateVictory(onComplete);
        } else {
          if (onComplete) onComplete();
        }
        return;
      }

      const targetTile = path[stepIndex];
      stepIndex++;
      this.currentTile = targetTile;
      if (onStep) onStep(targetTile);

      const targetCoords = this.boardDrawer.getTileCenter(targetTile);

      // Hop tween: moves to target x, y with an arc in y and slight scale bounce
      const startX = this.container.x;
      const startY = this.container.y;
      const hopHeight = 16;

      this.scene.tweens.add({
        targets: this.container,
        scaleX: 1.25,
        scaleY: 1.25,
        duration: 90,
        yoyo: true,
        ease: 'Quad.easeOut'
      });

      this.scene.tweens.add({
        targets: this.container,
        x: targetCoords.x,
        y: targetCoords.y,
        duration: 180,
        ease: 'Quad.easeInOut',
        onComplete: () => {
          hopNext();
        }
      });
    };

    hopNext();
  }

  animateLadderClimb(startTile, endTile, onComplete) {
    const endCoords = this.boardDrawer.getTileCenter(endTile);

    // Ladder climb: smooth upward slide with celebratory scale and golden sparkle
    this.scene.tweens.add({
      targets: this.container,
      x: endCoords.x,
      y: endCoords.y,
      duration: 800,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        this.currentTile = endTile;
        // Bounce on landing
        this.scene.tweens.add({
          targets: this.container,
          scaleX: { from: 1.4, to: 1.0 },
          scaleY: { from: 0.7, to: 1.0 },
          duration: 300,
          ease: 'Bounce.easeOut',
          onComplete: () => {
            if (onComplete) onComplete();
          }
        });
      }
    });
  }

  animateSnakeDrop(startTile, endTile, onComplete) {
    const endCoords = this.boardDrawer.getTileCenter(endTile);

    // Snake drop: wobble and slide down
    this.scene.tweens.add({
      targets: this.container,
      angle: { from: -15, to: 15 },
      yoyo: true,
      repeat: 3,
      duration: 150
    });

    this.scene.tweens.add({
      targets: this.container,
      x: endCoords.x,
      y: endCoords.y,
      duration: 850,
      ease: 'Back.easeIn',
      onComplete: () => {
        this.container.angle = 0;
        this.currentTile = endTile;
        // Squish on impact
        this.scene.tweens.add({
          targets: this.container,
          scaleX: 1.3,
          scaleY: 0.7,
          yoyo: true,
          duration: 250,
          ease: 'Quad.easeOut',
          onComplete: () => {
            if (onComplete) onComplete();
          }
        });
      }
    });
  }

  animateVictory(onComplete) {
    this.scene.tweens.add({
      targets: this.container,
      scaleX: 1.6,
      scaleY: 1.6,
      yoyo: true,
      repeat: 2,
      duration: 350,
      ease: 'Bounce.easeOut',
      onComplete: () => {
        if (onComplete) onComplete();
      }
    });
  }

  destroy() {
    this.container.destroy();
  }
}
