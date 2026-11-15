/**
 * Dice Animator for Phaser
 * Renders crisp 2D rolling dice with animated pips, rotation, and bounce.
 */

export class DiceAnimator {
  constructor(scene, boardWidth = 700, boardHeight = 700) {
    this.scene = scene;
    this.boardWidth = boardWidth;
    this.boardHeight = boardHeight;

    this.container = scene.add.container(boardWidth / 2, boardHeight / 2);
    this.container.setDepth(100);
    this.container.setVisible(false);

    // Dark backdrop overlay during roll
    this.backdrop = scene.add.graphics();
    this.backdrop.fillStyle(0x0f172a, 0.45);
    this.backdrop.fillRoundedRect(-160, -80, 320, 160, 16);

    this.container.add(this.backdrop);

    // Sub-containers for Die 1 and Die 2
    this.die1Container = scene.add.container(-55, 0);
    this.die2Container = scene.add.container(55, 0);

    this.die1Graphics = scene.add.graphics();
    this.die2Graphics = scene.add.graphics();

    this.die1Container.add(this.die1Graphics);
    this.die2Container.add(this.die2Graphics);

    this.container.add([this.die1Container, this.die2Container]);

    // Banner text (e.g. "Rolling...", "Rolled: 5 + 4 = 9")
    this.statusText = scene.add.text(0, 52, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      fontSize: '18px',
      fontWeight: 'bold',
      color: '#ffffff',
      align: 'center'
    });
    this.statusText.setOrigin(0.5);
    this.container.add(this.statusText);

    this.dieSize = 64;
    this.isRolling = false;
  }

  drawDieFace(graphics, value) {
    graphics.clear();
    const half = this.dieSize / 2;

    // Soft drop shadow
    graphics.fillStyle(0x000000, 0.25);
    graphics.fillRoundedRect(-half + 3, -half + 4, this.dieSize, this.dieSize, 12);

    // Die Face background: Ivory White
    graphics.fillStyle(0xffffff, 1);
    graphics.fillRoundedRect(-half, -half, this.dieSize, this.dieSize, 12);

    // Subtle edge border
    graphics.lineStyle(2, 0xd1d5db, 1);
    graphics.strokeRoundedRect(-half, -half, this.dieSize, this.dieSize, 12);

    // Pips
    const pipColor = value === 1 ? 0xdc2626 : 0x1f2937; // Red center pip for 1, Dark slate for others
    const pipRadius = 4.5;
    const offset = 16;

    graphics.fillStyle(pipColor, 1);

    const drawPip = (x, y) => graphics.fillCircle(x, y, pipRadius);

    if (value === 1) {
      drawPip(0, 0);
    } else if (value === 2) {
      drawPip(-offset, -offset);
      drawPip(offset, offset);
    } else if (value === 3) {
      drawPip(-offset, -offset);
      drawPip(0, 0);
      drawPip(offset, offset);
    } else if (value === 4) {
      drawPip(-offset, -offset);
      drawPip(offset, -offset);
      drawPip(-offset, offset);
      drawPip(offset, offset);
    } else if (value === 5) {
      drawPip(-offset, -offset);
      drawPip(offset, -offset);
      drawPip(0, 0);
      drawPip(-offset, offset);
      drawPip(offset, offset);
    } else if (value === 6) {
      drawPip(-offset, -offset);
      drawPip(offset, -offset);
      drawPip(-offset, 0);
      drawPip(offset, 0);
      drawPip(-offset, offset);
      drawPip(offset, offset);
    }
  }

  /**
   * Plays dice tumbling animation and reveals outcome
   */
  roll({ diceValues = [1], total = 1, onComplete }) {
    if (this.isRolling) return;
    this.isRolling = true;

    const count = diceValues.length;
    this.container.setVisible(true);
    this.container.setAlpha(0);
    this.container.setScale(0.8);

    // Layout dice: 1 die centered, 2 dice spaced
    if (count === 1) {
      this.die1Container.setPosition(0, -6);
      this.die2Container.setVisible(false);
      this.backdrop.clear();
      this.backdrop.fillStyle(0x0f172a, 0.55);
      this.backdrop.fillRoundedRect(-110, -80, 220, 160, 16);
    } else {
      this.die1Container.setPosition(-45, -6);
      this.die2Container.setPosition(45, -6);
      this.die2Container.setVisible(true);
      this.backdrop.clear();
      this.backdrop.fillStyle(0x0f172a, 0.55);
      this.backdrop.fillRoundedRect(-160, -80, 320, 160, 16);
    }

    this.statusText.setText('Rolling...');

    // Pop in container
    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut'
    });

    // Rapidly cycle random faces
    let rollTimer = 0;
    const cycleInterval = 65;
    const totalRollDuration = 800;

    const cycleEvent = this.scene.time.addEvent({
      delay: cycleInterval,
      repeat: Math.floor(totalRollDuration / cycleInterval),
      callback: () => {
        const rand1 = Math.floor(Math.random() * 6) + 1;
        this.drawDieFace(this.die1Graphics, rand1);
        this.die1Container.setAngle((Math.random() - 0.5) * 40);

        if (count === 2) {
          const rand2 = Math.floor(Math.random() * 6) + 1;
          this.drawDieFace(this.die2Graphics, rand2);
          this.die2Container.setAngle((Math.random() - 0.5) * 40);
        }
      }
    });

    // Final landing
    this.scene.time.delayedCall(totalRollDuration, () => {
      cycleEvent.remove();

      // Set target values
      this.drawDieFace(this.die1Graphics, diceValues[0]);
      if (count === 2) {
        this.drawDieFace(this.die2Graphics, diceValues[1]);
      }

      // Snap angles to 0 with bounce
      this.scene.tweens.add({
        targets: [this.die1Container, this.die2Container],
        angle: 0,
        scaleX: { from: 1.3, to: 1.0 },
        scaleY: { from: 1.3, to: 1.0 },
        duration: 350,
        ease: 'Bounce.easeOut'
      });

      // Update text
      if (count === 1) {
        this.statusText.setText(`Rolled a ${diceValues[0]}!`);
      } else {
        this.statusText.setText(`Rolled ${diceValues[0]} + ${diceValues[1]} = ${total}!`);
      }

      // Hold briefly, then fade out and trigger movement callback
      this.scene.time.delayedCall(650, () => {
        this.scene.tweens.add({
          targets: this.container,
          alpha: 0,
          scale: 0.9,
          duration: 250,
          onComplete: () => {
            this.container.setVisible(false);
            this.isRolling = false;
            if (onComplete) onComplete();
          }
        });
      });
    });
  }

  destroy() {
    this.container.destroy();
  }
}
