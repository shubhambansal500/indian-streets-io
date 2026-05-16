class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    this._makeParticleTexture();
    this._makeCoinTexture();
    this._makePowerupTextures();
    this.scene.start('Menu');
  }

  _makeParticleTexture() {
    const g = this.make.graphics({ add: false });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(6, 6, 6);
    g.generateTexture('particle', 12, 12);
    g.destroy();
  }

  _makeCoinTexture() {
    const g = this.make.graphics({ add: false });
    g.fillStyle(0xAA7700, 1);    g.fillCircle(12, 12, 12);   // dark gold rim
    g.fillStyle(0xFFD700, 1);
    g.fillCircle(12, 12, 10);   // gold body
    g.fillStyle(0xFFEB3B, 1);
    g.fillCircle(12, 12, 6);    // inner bright
    g.fillStyle(0xffffff, 0.55);
    g.fillCircle(8, 8, 3);      // sheen
    g.generateTexture('coin', 24, 24);
    g.destroy();
  }

  _makePowerupTextures() {
    const configs = {
      rickshaw:    0xFFB300,
      chai:        0x6D4C41,
      cricketBat:  0x2E7D32,
      trafficJam:  0xE53935,
      cowShield:   0xEEEEEE,
      mumbaiLocal: 0x1565C0,
    };

    for (const [type, fill] of Object.entries(configs)) {
      const g = this.make.graphics({ add: false });

      // Drop shadow
      g.fillStyle(0x000000, 0.25);
      g.fillPoints(this._starPoints(20, 20, 5, 14, 6), true);

      // Star body
      g.fillStyle(fill, 1);
      g.fillPoints(this._starPoints(18, 18, 5, 14, 6), true);

      // Inner star highlight
      g.fillStyle(0xffffff, 0.25);
      g.fillPoints(this._starPoints(18, 18, 5, 8, 3), true);

      // Sheen dot
      g.fillStyle(0xffffff, 0.6);
      g.fillCircle(13, 12, 3);

      g.generateTexture(`pu_${type}`, 36, 36);
      g.destroy();
    }
  }

  _starPoints(cx, cy, n, outerR, innerR) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const angle = (i * Math.PI / n) - Math.PI / 2;
      const r = (i % 2 === 0) ? outerR : innerR;
      pts.push(new Phaser.Math.Vector2(
        cx + Math.cos(angle) * r,
        cy + Math.sin(angle) * r
      ));
    }
    return pts;
  }
}
