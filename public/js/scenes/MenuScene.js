class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    const menu    = document.getElementById('menu-overlay');
    const playBtn = document.getElementById('play-btn');
    const input   = document.getElementById('name-input');

    menu.style.display = 'flex';
    document.getElementById('hud').classList.remove('show');
    document.getElementById('death-overlay').classList.remove('show');

    // Connect to server as soon as menu loads (reduces join latency)
    if (!network.connected) network.connect();

    const startGame = () => {
      const name = input.value.trim() || `Street_${Math.floor(Math.random() * 9000) + 1000}`;
      menu.style.display = 'none';
      this.scene.start('Game', { playerName: name });
    };

    playBtn.onclick = startGame;
    input.onkeydown = (e) => { if (e.key === 'Enter') startGame(); };
    input.focus();
  }
}
