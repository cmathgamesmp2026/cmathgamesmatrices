/**
 * Player Token for Phaser
 * Handles token rendering with 6 selectable themes (Car, Chess, Rocket, Crown, Gem, Lightning),
 * hopping animations along tiles, and ladder/snake traversal.
 */

export const TOKEN_DEFINITIONS = {
  car: {
    name: 'Race Car',
    icon: '🏎️',
    outerColor: 0x991b1b,
    innerColor: 0xdc2626,
    glowColor: 0xf87171,
    ringColor: 0xffffff
  },
  chess: {
    name: 'Chess Knight',
    icon: '♟️',
    outerColor: 0x0f172a,
    innerColor: 0x334155,
    glowColor: 0xf59e0b,
    ringColor: 0xfbbf24
  },
  rocket: {
    name: 'Rocket',
    icon: '🚀',
    outerColor: 0x4338ca,
    innerColor: 0x6366f1,
    glowColor: 0x38bdf8,
    ringColor: 0x38bdf8
  },
  crown: {
    name: 'Royal Crown',
    icon: '👑',
    outerColor: 0xb45309,
    innerColor: 0xf59e0b,
    glowColor: 0xfde047,
    ringColor: 0xfffbeb
  },
  gem: {
    name: 'Diamond Gem',
    icon: '💎',
    outerColor: 0x047857,
    innerColor: 0x10b981,
    glowColor: 0x6ee7b7,
    ringColor: 0xa7f3d0
  },
  lightning: {
    name: 'Lightning',
    icon: '⚡',
    outerColor: 0x1e3a8a,
    innerColor: 0x2563eb,
    glowColor: 0xfacc15,
    ringColor: 0xfef08a
  }
};

export class PlayerToken {
  constructor(scene, boardDrawer, initialTokenType = 'car') {
    this.scene = scene;
    this.boardDrawer = boardDrawer;
    this.tokenType = initialTokenType;
    this.container = scene.add.container(0, 0);

    this.shadow = scene.add.graphics();
    this.glowRing = scene.add.graphics();
    this.tokenBody = scene.add.graphics();

    this.iconText = scene.add.text(0, -1, '🏎️', {
      fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, system-ui, sans-serif',
      fontSize: '20px',
      align: 'center'
    });
    this.iconText.setOrigin(0.5, 0.5);
    this.iconText.setResolution(2);

    this.container.add([this.shadow, this.glowRing, this.tokenBody, this.iconText]);

    this.currentTile = 1;
    this.radius = 20;
    this.drawToken();

    // Set initial position
    this.teleportTo(1);
  }

  setTokenType(tokenType) {
    if (TOKEN_DEFINITIONS[tokenType]) {
      this.tokenType = tokenType;
      this.drawToken();
    }
  }

  drawToken() {
    const def = TOKEN_DEFINITIONS[this.tokenType] || TOKEN_DEFINITIONS.car;

    // Shadow
    this.shadow.clear();
    this.shadow.fillStyle(0x000000, 0.3);
    this.shadow.fillEllipse(0, 11, this.radius * 2.1, this.radius * 1.1);

    // Glow ring
    this.glowRing.clear();
    this.glowRing.lineStyle(3.5, def.glowColor, 0.7);
    this.glowRing.strokeCircle(0, 0, this.radius + 3);

    // Main token body: Themed base disc
    this.tokenBody.clear();
    this.tokenBody.fillStyle(def.outerColor, 1);
    this.tokenBody.fillCircle(0, 0, this.radius);

    this.tokenBody.fillStyle(def.innerColor, 1);
    this.tokenBody.fillCircle(0, 0, this.radius - 2.5);

    // White / Accent concentric border ring
    this.tokenBody.lineStyle(1.5, def.ringColor, 0.9);
    this.tokenBody.strokeCircle(0, 0, this.radius - 3.5);

    // Update central emoji icon
    this.iconText.setText(def.icon);

    // Idle pulse tween
    if (this.idleTween) {
      this.idleTween.stop();
    }
    this.idleTween = this.scene.tweens.add({
      targets: this.glowRing,
      alpha: { from: 0.3, to: 0.95 },
      scale: { from: 0.95, to: 1.12 },
      duration: 1100,
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
    if (this.idleTween) this.idleTween.stop();
    this.container.destroy();
  }
}
