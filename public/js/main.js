// Entry point — Phaser game config
const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#C2A87A',
  scene: [BootScene, MenuScene, GameScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: false,   // pixel-crisp + faster
    powerPreference: 'high-performance',
  },
  fps: {
    target: 60,
    forceSetTimeOut: false,
  },
  input: {
    activePointers: 4,  // support multi-touch
  },
};

const game = new Phaser.Game(config);

// Prevent context menu on right-click (desktop)
window.addEventListener('contextmenu', e => e.preventDefault());

// Prevent default touch behaviours (scroll, zoom) on game canvas
window.addEventListener('touchmove', e => {
  if (e.target.tagName === 'CANVAS') e.preventDefault();
}, { passive: false });
