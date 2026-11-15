import Phaser from 'phaser';
import BoardScene from './BoardScene.js';

export function createPhaserGame(parentContainerId = 'phaser-container') {
  const config = {
    type: Phaser.AUTO,
    width: 700,
    height: 700,
    parent: parentContainerId,
    backgroundColor: '#0f172a',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [BoardScene]
  };

  return new Phaser.Game(config);
}
