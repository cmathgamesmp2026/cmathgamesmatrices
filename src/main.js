import './styles/main.css';
import { createPhaserGame } from './phaser/gameConfig.js';
import { HTMLUI } from './ui/htmlUI.js';

window.addEventListener('DOMContentLoaded', () => {
  // Initialize Phaser Game Board
  const phaserGame = createPhaserGame('phaser-container');

  // Initialize HTML UI Controller
  const htmlUI = new HTMLUI();

  // Attach to window for debugging if needed
  window.__MATRICES_GAME__ = {
    phaserGame,
    htmlUI
  };
});
