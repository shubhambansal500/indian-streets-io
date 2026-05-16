class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
    this._serverPlayers  = new Map();
    this._remotePlayers  = new Map(); // id → { container, body, hpFill }
    this._coins          = new Map();
    this._powerupSprites = new Map();

    this._myId        = null;
    this._myContainer = null; // local player container
    this._myBody      = null; // circle inside container
    this._myHpFill    = null; // rectangle inside container
    this._myData      = null;

    this._cursors    = null;
    this._wasd       = null;
    this._attackKey  = null;
    this._mobileCtrl = null;

    this._floaters = [];
    this._isDead   = false;
    this._respawnAt  = 0;
    this._killerName = '';

    this._lastInputSent = 0;
    this._lastInput     = {};
    this._killFeedItems = [];

    this._lastDx = 1;
    this._lastDy = 0;

    this._minimapCtx   = null;
    this._dangerActive = false;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  init(data) { this._playerName = data.playerName || 'Guest'; }

  create() {
    this._buildMap();
    this._setupCamera();
    this._setupInput();
    this._setupMobile();
    this._setupNetwork();
    this._showHUD();
    soundManager.startAmbient();
    this._minimapCtx = document.getElementById('minimap-canvas').getContext('2d');
  }

  update(time, delta) {
    const dt = delta / 1000;

    const input = this._gatherInput();
    this._sendInput(input);

    // Immediate client-side attack feedback (don't wait for server round-trip)
    if (input.attack && this._myContainer && !this._isDead) {
      this._flashAttack();
      soundManager.attack();
    }

    if (this._myContainer && this._myData && !this._isDead) {
      this._localPredict(input, dt);
    }

    // Interpolate remote players + per-player effects
    let danger = false;
    this._remotePlayers.forEach((rp, id) => {
      const sd = this._serverPlayers.get(id);
      if (!sd || !sd.alive) return;

      rp.container.x += (sd.x - rp.container.x) * 0.2;
      rp.container.y += (sd.y - rp.container.y) * 0.2;

      // Danger: enemy within 150px
      if (this._myContainer && !this._isDead) {
        const dist = Math.hypot(rp.container.x - this._myContainer.x, rp.container.y - this._myContainer.y);
        if (dist < 150) danger = true;
      }

      // Rickshaw speed trail — ghost circle every 80ms
      if (sd.powerups?.includes('rickshaw')) {
        if (time - (rp.lastTrailTime || 0) > 80) {
          rp.lastTrailTime = time;
          const col = Phaser.Display.Color.HexStringToColor(sd.color).color;
          const ghost = this.add.circle(rp.container.x, rp.container.y, 18, col, 0.45).setDepth(4);
          this.tweens.add({
            targets: ghost, alpha: 0, scaleX: 0.5, scaleY: 0.5,
            duration: 260, ease: 'Power2',
            onComplete: () => ghost.destroy(),
          });
        }
      }
    });

    this._setDangerOverlay(danger);

    // Animate coins
    this._coins.forEach((s) => {
      s.y = s._baseY + Math.sin(time * 0.004 + s._phase) * 5;
      s.rotation += 0.02;
    });

    // Animate powerup sprites + labels
    this._powerupSprites.forEach((s) => {
      s.y = s._baseY + Math.sin(time * 0.003 + s._phase) * 6;
      s.angle += 1;
      if (s._label) s._label.y = s.y + 1;
    });

    this._updateFloaters(dt);

    if (this._isDead) {
      const pct = 1 - Math.max(0, this._respawnAt - Date.now()) / C.RESPAWN_DELAY;
      document.getElementById('respawn-fill').style.width = `${Math.round(pct * 100)}%`;
    }
  }

  // ─── Map ─────────────────────────────────────────────────────────────────────

  _buildMap() {
    const W    = C.MAP_WIDTH;
    const H    = C.MAP_HEIGHT;
    const GRID = 400;
    const g    = this.add.graphics();

    // ── 1. Road base ──────────────────────────────────────────────────────────
    g.fillStyle(0xC8A870, 1);
    g.fillRect(0, 0, W, H);

    // ── 2. Sidewalk curb strips along each block edge ─────────────────────────
    g.fillStyle(0xB09050, 1);
    for (let x = 0; x <= W; x += GRID) g.fillRect(x - 18, 0, 36, H);
    for (let y = 0; y <= H; y += GRID) g.fillRect(0, y - 18, W, 36);

    // ── 3. Road surface texture (subtle random wear marks) ────────────────────
    const rngT = this._seededRand(7);
    g.fillStyle(0xBB9860, 0.35);
    for (let i = 0; i < 300; i++) {
      const tx = rngT() * W;
      const ty = rngT() * H;
      g.fillRect(tx, ty, 2 + rngT() * 20, 2);
    }

    // ── 4. Center lane dashes ─────────────────────────────────────────────────
    g.fillStyle(0xFFFFFF, 0.55);
    for (let x = GRID / 2; x < W; x += GRID) {
      for (let y = 30; y < H; y += 36) g.fillRect(x - 2, y, 4, 20);
    }
    for (let y = GRID / 2; y < H; y += GRID) {
      for (let x = 30; x < W; x += 36) g.fillRect(x, y - 2, 20, 4);
    }

    // ── 5. Crosswalk stripes at intersections ─────────────────────────────────
    g.fillStyle(0xFFFFFF, 0.45);
    for (let x = 0; x <= W; x += GRID) {
      for (let y = 0; y <= H; y += GRID) {
        for (let s = -55; s < 55; s += 13) {
          g.fillRect(x + s, y - 52, 9, 28);
          g.fillRect(x + s, y + 24, 9, 28);
          g.fillRect(x - 52, y + s, 28, 9);
          g.fillRect(x + 24, y + s, 28, 9);
        }
      }
    }

    // ── 6. Buildings ──────────────────────────────────────────────────────────
    const PALETTE = [
      0xFF7043, 0xFFB74D, 0xFFF176, 0x81C784, 0x4FC3F7,
      0xBA68C8, 0xF48FB1, 0x80DEEA, 0xFFCC02, 0xFF8A65,
      0xA5D6A7, 0x90CAF9, 0xCE93D8, 0xFFAB91, 0xB2DFDB,
    ];
    const SIGN_COLORS = [
      0xFF3D00, 0x00ACC1, 0x43A047, 0xE91E63,
      0x7B1FA2, 0xF57C00, 0x1565C0,
    ];

    // Seed 42 = positions only (must match server MapData.js)
    // Seed 99 = colors only (client-only, never sent to server)
    const rng      = this._seededRand(42);
    const rngStyle = this._seededRand(99);
    this._buildings = [];

    for (let bx = 0; bx < W; bx += GRID) {
      for (let by = 0; by < H; by += GRID) {
        if (bx === 800 && by === 800) continue; // cricket ground cell

        const numB = Math.floor(rng() * 2) + 1;
        for (let b = 0; b < numB; b++) {
          const bw  = 80  + Math.floor(rng() * 230);
          const bh2 = 80  + Math.floor(rng() * 230);
          const mg  = 28;
          const bxo = mg + Math.floor(rng() * Math.max(1, GRID - bw - mg * 2));
          const byo = mg + Math.floor(rng() * Math.max(1, GRID - bh2 - mg * 2));
          const px  = bx + bxo;
          const py  = by + byo;
          const col = PALETTE[Math.floor(rngStyle() * PALETTE.length)];
          const sgn = SIGN_COLORS[Math.floor(rngStyle() * SIGN_COLORS.length)];
          this._buildings.push({ x: px, y: py, w: bw, h: bh2 });

          // Drop shadow
          g.fillStyle(0x000000, 0.22);
          g.fillRect(px + 7, py + 7, bw, bh2);

          // Building body
          g.fillStyle(col, 1);
          g.fillRect(px, py, bw, bh2);

          // Roof parapet (8px darker strip)
          const dc = Phaser.Display.Color.ValueToColor(col);
          dc.darken(28);
          g.fillStyle(dc.color, 1);
          g.fillRect(px, py, bw, 9);

          // Window grid
          g.fillStyle(0xFFFFFF, 0.22);
          for (let wx = px + 8; wx < px + bw - 12; wx += 22) {
            for (let wy = py + 14; wy < py + bh2 - 26; wy += 22) {
              g.fillRect(wx, wy, 12, 10);
            }
          }

          // Ground-floor shop sign strip
          if (bh2 > 60) {
            g.fillStyle(sgn, 0.85);
            g.fillRect(px, py + bh2 - 24, bw, 24);
            // Simulate text with dashes
            g.fillStyle(0xFFFFFF, 0.55);
            for (let sx = px + 8; sx < px + bw - 10; sx += 20) {
              g.fillRect(sx, py + bh2 - 17, 13, 4);
              g.fillRect(sx, py + bh2 - 9,  8,  3);
            }
          }
        }
      }
    }

    // ── 7. Cricket ground landmark ────────────────────────────────────────────
    {
      const gx = 820, gy = 820, gw = 340, gh = 300;
      g.fillStyle(0x388E3C, 1);
      g.fillRect(gx, gy, gw, gh);
      g.lineStyle(3, 0xFFFFFF, 0.8);
      g.strokeRect(gx + 16, gy + 16, gw - 32, gh - 32);
      // Outfield circle
      g.lineStyle(2, 0xFFFFFF, 0.45);
      g.strokeCircle(gx + gw / 2, gy + gh / 2, 100);
      // Pitch strip
      g.fillStyle(0x8D6E63, 1);
      g.fillRect(gx + gw / 2 - 20, gy + 30, 40, gh - 60);
      g.lineStyle(2, 0xFFFFFF, 0.8);
      g.lineBetween(gx + gw / 2 - 20, gy + 60,  gx + gw / 2 + 20, gy + 60);
      g.lineBetween(gx + gw / 2 - 20, gy + gh - 60, gx + gw / 2 + 20, gy + gh - 60);
      // Label
      this.add.text(gx + gw / 2, gy + 8, '🏏 CRICKET GROUND', {
        fontSize: '11px', fontFamily: 'system-ui',
        color: '#ffffff', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5, 0).setDepth(2);
    }

    // ── 8. Trees ──────────────────────────────────────────────────────────────
    const rngTr = this._seededRand(77);
    for (let i = 0; i < 80; i++) {
      const tx = 40 + rngTr() * (W - 80);
      const ty = 40 + rngTr() * (H - 80);
      // Trunk
      g.fillStyle(0x5D4037, 1);
      g.fillRect(tx - 4, ty, 8, 18);
      // Shadow
      g.fillStyle(0x000000, 0.12);
      g.fillCircle(tx + 3, ty + 3, 20);
      // Outer canopy
      g.fillStyle(0x1B5E20, 1);
      g.fillCircle(tx, ty - 2, 17);
      // Mid canopy
      g.fillStyle(0x2E7D32, 1);
      g.fillCircle(tx, ty - 4, 13);
      // Highlight
      g.fillStyle(0x66BB6A, 0.8);
      g.fillCircle(tx - 4, ty - 8, 6);
    }

    // ── 9. Chai stalls ────────────────────────────────────────────────────────
    const stallPositions = [
      [400, 200], [1200, 600], [800, 200], [600, 1200],
      [1300, 1200], [1400, 400], [400, 1400], [1000, 1200],
    ];
    for (const [sx, sy] of stallPositions) {
      // Cart body
      g.fillStyle(0xFF8F00, 1);
      g.fillRect(sx, sy, 50, 32);
      g.fillStyle(0xE65100, 1);
      g.fillRect(sx, sy, 50, 8);
      // Awning stripes
      g.fillStyle(0xFFFFFF, 0.6);
      for (let ax = sx; ax < sx + 50; ax += 10) g.fillRect(ax, sy, 5, 8);
      // Wheels
      g.fillStyle(0x424242, 1);
      g.fillCircle(sx + 10, sy + 36, 5);
      g.fillCircle(sx + 40, sy + 36, 5);
      // Chai emoji label
      this.add.text(sx + 25, sy + 12, '☕', { fontSize: '10px' })
        .setOrigin(0.5).setDepth(2);
    }

    // ── 10. Roundabouts ───────────────────────────────────────────────────────
    const roundabouts = [];
    for (let x = GRID; x < W; x += GRID) {
      for (let y = GRID; y < H; y += GRID) {
        roundabouts.push([x, y]);
      }
    }
    for (const [rx, ry] of roundabouts) {
      // Road circle
      g.fillStyle(0xC8A870, 1);
      g.fillCircle(rx, ry, 70);
      // Garden
      g.fillStyle(0x388E3C, 1);
      g.fillCircle(rx, ry, 52);
      // Inner path
      g.fillStyle(0xC8A870, 1);
      g.fillCircle(rx, ry, 32);
      // Center flower / decoration
      g.fillStyle(0x1B5E20, 1);
      g.fillCircle(rx, ry, 22);
      g.fillStyle(0xF44336, 0.9);
      g.fillCircle(rx, ry, 9);
      g.fillStyle(0xFFFF00, 0.9);
      g.fillCircle(rx, ry, 4);
    }

    // ── 11. Street lamps at intersections ─────────────────────────────────────
    for (let x = 0; x <= W; x += GRID) {
      for (let y = 0; y <= H; y += GRID) {
        // Pole
        g.fillStyle(0x546E7A, 1);
        g.fillRect(x - 3, y - 38, 6, 36);
        // Arm
        g.fillRect(x - 3, y - 38, 14, 4);
        // Lamp head
        g.fillStyle(0xFFEE58, 1);
        g.fillCircle(x + 11, y - 38, 6);
        // Glow halo
        g.fillStyle(0xFFEE58, 0.12);
        g.fillCircle(x + 11, y - 38, 18);
      }
    }

    // ── 12. Map border ────────────────────────────────────────────────────────
    g.lineStyle(14, 0x6D4C41, 1);
    g.strokeRect(0, 0, W, H);
    g.lineStyle(4, 0xFFB74D, 0.5);
    g.strokeRect(7, 7, W - 14, H - 14);
  }

  _collidesBuilding(x, y) {
    if (!this._buildings) return false;
    const r = C.PLAYER_RADIUS;
    for (const b of this._buildings) {
      if (x + r > b.x && x - r < b.x + b.w &&
          y + r > b.y && y - r < b.y + b.h) return true;
    }
    return false;
  }

  _seededRand(seed) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  }

  // ─── Camera ──────────────────────────────────────────────────────────────────

  _setupCamera() {
    this.cameras.main.setBounds(0, 0, C.MAP_WIDTH, C.MAP_HEIGHT);
  }

  // ─── Input ───────────────────────────────────────────────────────────────────

  _setupInput() {
    this._cursors   = this.input.keyboard.createCursorKeys();
    this._wasd      = this.input.keyboard.addKeys('W,A,S,D');
    this._attackKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  _setupMobile() {
    if (MobileControls.isMobile()) {
      this._mobileCtrl = new MobileControls();
      this._mobileCtrl.show();
    }
  }

  _gatherInput() {
    const kb = this._cursors;
    const w  = this._wasd;

    let left   = kb.left.isDown  || w.A.isDown;
    let right  = kb.right.isDown || w.D.isDown;
    let up     = kb.up.isDown    || w.W.isDown;
    let down   = kb.down.isDown  || w.S.isDown;
    let attack = Phaser.Input.Keyboard.JustDown(this._attackKey);

    if (this._mobileCtrl) {
      const mob = this._mobileCtrl.getInput();
      if (mob.left || mob.right || mob.up || mob.down) {
        left = mob.left; right = mob.right; up = mob.up; down = mob.down;
      }
      if (mob.attack) attack = true;
    }

    return { left, right, up, down, attack };
  }

  _sendInput(input) {
    const now = Date.now();
    if (now - this._lastInputSent < 16) return;
    this._lastInputSent = now;
    const cur = this._lastInput;
    if (cur.left === input.left && cur.right === input.right &&
        cur.up   === input.up   && cur.down  === input.down  &&
        !input.attack) return;
    this._lastInput = { ...input };
    network.sendInput(input);
  }

  // ─── Local prediction ────────────────────────────────────────────────────────

  _localPredict(input, dt) {
    if (!this._myContainer) return;

    let speed = C.PLAYER_SPEED;
    if (this._myData?.powerups?.includes('rickshaw')) speed *= 2.5;

    let dx = 0, dy = 0;
    if (input.left)  dx -= 1;
    if (input.right) dx += 1;
    if (input.up)    dy -= 1;
    if (input.down)  dy += 1;

    if (dx || dy) {
      const l = Math.hypot(dx, dy);
      dx /= l; dy /= l;
      this._lastDx = dx;
      this._lastDy = dy;
    }

    const nx = Phaser.Math.Clamp(this._myContainer.x + dx * speed * dt, C.PLAYER_RADIUS, C.MAP_WIDTH  - C.PLAYER_RADIUS);
    const ny = Phaser.Math.Clamp(this._myContainer.y + dy * speed * dt, C.PLAYER_RADIUS, C.MAP_HEIGHT - C.PLAYER_RADIUS);

    if (!this._collidesBuilding(nx, this._myContainer.y)) this._myContainer.x = nx;
    if (!this._collidesBuilding(this._myContainer.x, ny)) this._myContainer.y = ny;

    this.cameras.main.centerOn(this._myContainer.x, this._myContainer.y);
  }

  // ─── Network ─────────────────────────────────────────────────────────────────

  _setupNetwork() {
    network.on('gameState',    (state) => this._onGameState(state));
    network.on('disconnected', ()      => this._showNotif('⚠️ Disconnected — reconnecting…'));

    if (network.connected) {
      this._myId = network.myId;
      network.join(this._playerName);
    } else {
      const onConn = (data) => {
        this._myId = data.id;
        network.join(this._playerName);
        network.off('connected', onConn);
      };
      network.on('connected', onConn);
    }
  }

  _onGameState(state) {
    const { players, coins, powerups, events } = state;

    if (events) events.forEach(ev => this._handleEvent(ev));

    const seenIds = new Set();
    for (const pd of players) {
      seenIds.add(pd.id);
      this._serverPlayers.set(pd.id, pd);
      if (pd.id === this._myId) this._syncLocalPlayer(pd);
      else                       this._syncRemotePlayer(pd);
    }

    this._remotePlayers.forEach((_, id) => {
      if (!seenIds.has(id)) this._destroyRemotePlayer(id);
    });

    this._updateMinimap();

    const seenCoins = new Set(coins.map(c => c.id));
    coins.forEach(cd => { if (!this._coins.has(cd.id)) this._createCoin(cd); });
    this._coins.forEach((s, id) => {
      if (!seenCoins.has(id)) { s.destroy(); this._coins.delete(id); }
    });

    const seenPUs = new Set(powerups.map(p => p.id));
    powerups.forEach(pd => { if (!this._powerupSprites.has(pd.id)) this._createPowerupSprite(pd); });
    this._powerupSprites.forEach((s, id) => {
      if (!seenPUs.has(id)) {
        if (s._label) s._label.destroy();
        s.destroy();
        this._powerupSprites.delete(id);
      }
    });
  }

  // ─── Local player ────────────────────────────────────────────────────────────

  _syncLocalPlayer(pd) {
    if (!this._myContainer) {
      this._createLocalPlayer(pd);
    } else {
      const drift = Math.hypot(this._myContainer.x - pd.x, this._myContainer.y - pd.y);
      if (drift > 80) { this._myContainer.x = pd.x; this._myContainer.y = pd.y; }
    }

    // HP bar
    if (this._myHpFill) {
      const pct = Math.max(0, pd.hp / pd.maxHp);
      this._myHpFill.scaleX = pct;
      this._myHpFill.fillColor = pct > 0.5 ? 0x44ee44 : pct > 0.25 ? 0xffaa00 : 0xff4444;
    }

    // Powerup glow effect on body
    if (this._myBody) {
      if (pd.powerups?.includes('cowShield')) {
        this._myBody.setAlpha(0.6);
        this._myBody.setStrokeStyle(5, 0xffffff, 0.9);
      } else if (pd.powerups?.includes('rickshaw')) {
        this._myBody.setAlpha(1);
        this._myBody.setStrokeStyle(4, 0xFFD700, 0.9);
      } else {
        this._myBody.setAlpha(1);
        this._myBody.setStrokeStyle(4, 0x000000, 0.35);
      }
    }

    this._myData = pd;

    if (pd.alive && this._isDead) {
      this._isDead = false;
      document.getElementById('death-overlay').classList.remove('show');
      if (this._myContainer) this._myContainer.setVisible(true);
    }

    if (!pd.alive && !this._isDead) {
      this._isDead = true;
      this._respawnAt = Date.now() + (pd.respawnIn || C.RESPAWN_DELAY);
      if (this._myContainer) {
        this._spawnDeathEffect(this._myContainer.x, this._myContainer.y);
        this._myContainer.setVisible(false);
      }
      this._showDeathScreen(pd.respawnIn || C.RESPAWN_DELAY);
    }

    this._updateHUD(pd);
  }

  _createLocalPlayer(pd) {
    const col = Phaser.Display.Color.HexStringToColor(pd.color).color;

    const container = this.add.container(pd.x, pd.y).setDepth(10);

    const shadow = this.add.ellipse(5, 9, 44, 18, 0x000000, 0.22);
    const body   = this.add.circle(0, 0, 22, col);
    body.setStrokeStyle(4, 0x000000, 0.35);
    const sheen  = this.add.circle(-7, -7, 9, 0xffffff, 0.28);
    const crown  = this.add.text(0, -40, '★ YOU', {
      fontSize: '10px', fontFamily: 'system-ui',
      color: '#FFD700', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    const name   = this.add.text(0, -30, pd.name, {
      fontSize: '13px', fontFamily: 'system-ui', fontStyle: 'bold',
      color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);
    const hpBg   = this.add.rectangle(-24, 32, 48, 8, 0x000000, 0.55).setOrigin(0, 0.5);
    const hpFill = this.add.rectangle(-24, 32, 48, 8, 0x44ee44).setOrigin(0, 0.5);

    const emoji = this.add.text(0, 1, '🧑', { fontSize: '20px' }).setOrigin(0.5);
    container.add([shadow, hpBg, hpFill, body, sheen, emoji, crown, name]);

    this._myContainer = container;
    this._myBody      = body;
    this._myHpFill    = hpFill;

    this.cameras.main.startFollow(container, true, 0.08, 0.08);
  }

  // ─── Remote players ──────────────────────────────────────────────────────────

  _syncRemotePlayer(pd) {
    if (!this._remotePlayers.has(pd.id)) this._createRemotePlayer(pd);

    const rp = this._remotePlayers.get(pd.id);
    rp.container.setVisible(pd.alive);
    if (!pd.alive) return;

    // HP bar
    const pct = Math.max(0, pd.hp / pd.maxHp);
    rp.hpFill.scaleX = pct;
    rp.hpFill.fillColor = pct > 0.5 ? 0x44ee44 : pct > 0.25 ? 0xffaa00 : 0xff4444;

    // Powerup tint on body
    const col = Phaser.Display.Color.HexStringToColor(pd.color).color;
    if (pd.powerups?.includes('cowShield')) {
      rp.body.fillColor = 0xffffff;
      rp.body.setAlpha(0.65);
      rp.body.setStrokeStyle(5, 0xffffff, 0.9);
    } else if (pd.powerups?.includes('rickshaw')) {
      rp.body.fillColor = col;
      rp.body.setAlpha(1);
      rp.body.setStrokeStyle(4, 0xFFD700, 0.9);
    } else {
      rp.body.fillColor = col;
      rp.body.setAlpha(1);
      rp.body.setStrokeStyle(4, 0x000000, 0.3);
    }

    // CowShield pulsing ring
    if (pd.powerups?.includes('cowShield')) {
      if (!rp.cowRing) {
        rp.cowRing = this.add.circle(rp.container.x, rp.container.y, 32, 0xffffff, 0).setDepth(6);
        rp.cowRing.setStrokeStyle(3, 0xffffff, 0.85);
        rp.cowRingTween = this.tweens.add({
          targets: rp.cowRing, scaleX: 1.5, scaleY: 1.5, alpha: 0,
          duration: 750, ease: 'Sine.easeOut', repeat: -1,
          onUpdate: () => {
            if (rp.cowRing) { rp.cowRing.x = rp.container.x; rp.cowRing.y = rp.container.y; }
          },
        });
      }
    } else if (rp.cowRing) {
      rp.cowRingTween?.stop();
      rp.cowRing.destroy();
      rp.cowRing = null;
      rp.cowRingTween = null;
    }
  }

  _createRemotePlayer(pd) {
    const col = Phaser.Display.Color.HexStringToColor(pd.color).color;

    const container = this.add.container(pd.x, pd.y).setDepth(5);

    const shadow = this.add.ellipse(5, 9, 44, 18, 0x000000, 0.15);
    const body   = this.add.circle(0, 0, 22, col);
    body.setStrokeStyle(4, 0x000000, 0.3);
    const sheen  = this.add.circle(-7, -7, 9, 0xffffff, 0.22);
    const name   = this.add.text(0, -32, pd.name, {
      fontSize: '11px', fontFamily: 'system-ui',
      color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    const hpBg   = this.add.rectangle(-24, 30, 48, 7, 0x000000, 0.5).setOrigin(0, 0.5);
    const hpFill = this.add.rectangle(-24, 30, 48, 7, 0x44ee44).setOrigin(0, 0.5);

    const PEOPLE = ['🧑','👦','👩','🧔','👱','🧕','👲','🧓'];
    const emoji = this.add.text(0, 1, PEOPLE[Math.floor(Math.random()*PEOPLE.length)], { fontSize: '20px' }).setOrigin(0.5);
    container.add([shadow, hpBg, hpFill, body, sheen, emoji, name]);
    this._remotePlayers.set(pd.id, { container, body, hpFill });
  }

  _destroyRemotePlayer(id) {
    const rp = this._remotePlayers.get(id);
    if (!rp) return;
    if (rp.cowRingTween) rp.cowRingTween.stop();
    if (rp.cowRing) rp.cowRing.destroy();
    rp.container.destroy(true);
    this._remotePlayers.delete(id);
    this._serverPlayers.delete(id);
  }

  // ─── Coins ───────────────────────────────────────────────────────────────────

  _createCoin(cd) {
    const sprite = this.add.image(cd.x, cd.y, 'coin').setDepth(3);
    sprite._phase = Math.random() * Math.PI * 2;
    sprite._baseY = cd.y;
    this._coins.set(cd.id, sprite);
  }

  // ─── Powerups ────────────────────────────────────────────────────────────────

  _createPowerupSprite(pd) {
    const key    = `pu_${pd.type}`;
    const sprite = this.textures.exists(key)
      ? this.add.image(pd.x, pd.y, key).setDepth(3)
      : this.add.circle(pd.x, pd.y, 14, C.POWERUP_COLOR?.[pd.type] || 0xffffff).setDepth(3);

    sprite._phase = Math.random() * Math.PI * 2;
    sprite._baseY = pd.y;

    const label = this.add.text(pd.x, pd.y + 1, C.POWERUP_EMOJI[pd.type] || '?', {
      fontSize: '22px',
    }).setOrigin(0.5).setDepth(4);
    sprite._label = label;

    // Pulsing glow ring
    const ring = this.add.circle(pd.x, pd.y, 20, 0xffffff, 0).setDepth(2);
    ring.setStrokeStyle(2, 0xffffff, 0.5);
    sprite._ring = ring;
    this.tweens.add({
      targets: ring, scaleX: 1.6, scaleY: 1.6, alpha: 0,
      duration: 1000, ease: 'Sine.easeOut', repeat: -1,
      onUpdate: () => { ring.x = sprite.x; ring.y = sprite.y; },
    });

    this._powerupSprites.set(pd.id, sprite);
  }

  // ─── Event handling ──────────────────────────────────────────────────────────

  _handleEvent(ev) {
    switch (ev.type) {
      case 'attackLanded':   this._onAttackLanded(ev);   break;
      case 'attackWhiff':    this._onAttackWhiff(ev);    break;
      case 'coinCollected':  this._onCoinCollected(ev);  break;
      case 'powerupCollected': this._onPowerupCollected(ev); break;
      case 'playerKilled':   this._onPlayerKilled(ev);   break;
      case 'playerJoined':   this._showNotif(`🛺 ${ev.name} entered the streets!`); break;
      case 'playerLeft':     this._showNotif(`💨 ${ev.name} fled the chaos`); break;
    }
  }

  _onAttackLanded(ev) {
    ev.hits.forEach(hit => {
      // World position of hit target
      let wx, wy;
      if (hit.targetId === this._myId) {
        wx = this._myContainer?.x; wy = this._myContainer?.y;
      } else {
        const rp = this._remotePlayers.get(hit.targetId);
        wx = rp?.container.x; wy = rp?.container.y;
      }
      if (wx == null) return;

      // Damage number
      const col = hit.targetId === this._myId ? '#FF6B6B' : '#FFD700';
      this._spawnFloater(wx, wy - 28, `-${hit.damage}`, col);

      // Red impact sparks
      this._burst(wx, wy, 0xFF4444, 7, 180);

      // Flash the hit target
      const target = hit.targetId === this._myId
        ? this._myBody
        : this._remotePlayers.get(hit.targetId)?.body;
      if (target) {
        this.tweens.add({
          targets: target, alpha: 0.15, duration: 70,
          yoyo: true, repeat: 2,
        });
      }
    });

    // Sound + remote arc (self-arc is fired immediately on keypress in update)
    ev.hits.forEach(hit => { soundManager.hit(); });
    if (ev.attackerId !== this._myId) {
      const rp = this._remotePlayers.get(ev.attackerId);
      if (rp) this._flashAttackRemote(rp.container.x, rp.container.y);
    }
  }

  _onAttackWhiff(ev) {
    // Remote players: show arc via server event; local already fires in update()
    if (ev.attackerId !== this._myId) {
      const rp = this._remotePlayers.get(ev.attackerId);
      if (rp) this._flashAttackRemote(rp.container.x, rp.container.y);
    }
  }

  // Directional wedge arc for local player (uses last movement direction)
  _flashAttack() {
    if (!this._myContainer) return;
    const cx    = this._myContainer.x;
    const cy    = this._myContainer.y;
    const angle = Math.atan2(this._lastDy, this._lastDx);
    const r     = C.ATTACK_RANGE;
    const sweep = Math.PI * 0.65; // ~117°
    const segs  = 10;

    const g = this.add.graphics().setDepth(20);
    g.fillStyle(0xFFFFFF, 0.28);
    g.beginPath();
    g.moveTo(cx, cy);
    for (let i = 0; i <= segs; i++) {
      const a = angle - sweep / 2 + sweep * i / segs;
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.closePath();
    g.fillPath();

    g.lineStyle(2, 0xFFFFFF, 0.7);
    g.beginPath();
    for (let i = 0; i <= segs; i++) {
      const a  = angle - sweep / 2 + sweep * i / segs;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
    }
    g.strokePath();

    this.tweens.add({
      targets: g, alpha: 0,
      duration: 200, ease: 'Power2',
      onComplete: () => g.destroy(),
    });
  }

  // Simple radial flash for remote player attacks
  _flashAttackRemote(cx, cy) {
    const arc = this.add.circle(cx, cy, C.ATTACK_RANGE, 0xFFFFFF, 0.18).setDepth(20);
    this.tweens.add({
      targets: arc, alpha: 0, scaleX: 1.3, scaleY: 1.3,
      duration: 200, ease: 'Power2',
      onComplete: () => arc.destroy(),
    });
  }

  _onCoinCollected(ev) {
    if (ev.playerId !== this._myId || !this._myContainer) return;
    const { x, y } = this._myContainer;
    this._burst(x, y, 0xFFD700, 10, 150);
    this._spawnFloater(x, y - 32, `+₹${C.COIN_VALUE}`, '#FFD700');
    soundManager.coin();
  }

  _onPowerupCollected(ev) {
    if (ev.playerId === this._myId) {
      this._showNotif(`${ev.emoji} ${ev.label}`);
      if (this._myContainer) {
        this._burst(this._myContainer.x, this._myContainer.y, 0xFFFFFF, 14, 200);
        this.cameras.main.flash(350, 255, 215, 0, true);
      }
      soundManager.powerup();
    }
  }

  _onPlayerKilled(ev) {
    const isMe      = ev.killerId === this._myId;
    const multTag   = ev.mult > 1 ? ` 🔥${ev.mult}x` : '';
    const msg = isMe
      ? `🏆 You knocked out ${ev.victimName}! +${ev.bonusScore}${multTag}`
      : `💀 ${ev.killerName} eliminated ${ev.victimName}${ev.streak > 1 ? ` (${ev.streak} streak)` : ''}`;
    this._addKillFeedItem(msg, isMe);
    if (ev.victimId === this._myId) this._killerName = ev.killerName;
  }

  // ─── Mini-map ─────────────────────────────────────────────────────────────────

  _updateMinimap() {
    const ctx = this._minimapCtx;
    if (!ctx) return;
    const S  = 150; // canvas size px
    const MW = C.MAP_WIDTH;
    const MH = C.MAP_HEIGHT;
    const sx = S / MW;
    const sy = S / MH;

    ctx.clearRect(0, 0, S, S);

    // Road background
    ctx.fillStyle = 'rgba(180,140,80,0.6)';
    ctx.fillRect(0, 0, S, S);

    // Grid lines (roads)
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= MW; x += 400) {
      ctx.beginPath(); ctx.moveTo(x * sx, 0); ctx.lineTo(x * sx, S); ctx.stroke();
    }
    for (let y = 0; y <= MH; y += 400) {
      ctx.beginPath(); ctx.moveTo(0, y * sy); ctx.lineTo(S, y * sy); ctx.stroke();
    }

    // Remote players
    this._serverPlayers.forEach((pd) => {
      if (!pd.alive || pd.id === this._myId) return;
      ctx.beginPath();
      ctx.arc(pd.x * sx, pd.y * sy, 3, 0, Math.PI * 2);
      ctx.fillStyle = pd.color || '#fff';
      ctx.fill();
    });

    // Local player — bright white dot with halo
    if (this._myData && this._myData.alive) {
      const mx = this._myData.x * sx;
      const my = this._myData.y * sy;
      ctx.beginPath();
      ctx.arc(mx, my, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // ─── Danger overlay ───────────────────────────────────────────────────────────

  _setDangerOverlay(active) {
    if (active === this._dangerActive) return;
    this._dangerActive = active;
    const el = document.getElementById('danger-overlay');
    if (active) el.classList.add('active');
    else        el.classList.remove('active');
  }

  // ─── Effects ─────────────────────────────────────────────────────────────────

  _burst(x, y, tint, count, speed) {
    if (!this.textures.exists('particle')) return;
    const em = this.add.particles(x, y, 'particle', {
      speed: { min: speed * 0.5, max: speed },
      angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0 },
      tint,
      lifespan: 450,
      depth: 40,
      emitting: false,
    });
    em.explode(count);
    this.time.delayedCall(600, () => em.destroy());
  }

  _spawnDeathEffect(x, y) {
    this._burst(x, y, 0xFF6B6B, 20, 280);
    this._burst(x, y, 0xFFD700, 10, 180);
    this.cameras.main.shake(300, 0.012);
    soundManager.death();
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────────

  _showHUD() { document.getElementById('hud').classList.add('show'); }

  _updateHUD(pd) {
    document.getElementById('score-val').textContent = pd.score;

    const pct = Math.max(0, pd.hp / pd.maxHp);
    document.getElementById('hp-bar-fill').style.width  = `${Math.round(pct * 100)}%`;
    document.getElementById('hp-bar-fill').style.background =
      pct > 0.5 ? 'linear-gradient(90deg,#44ee44,#88ff44)'
                : pct > 0.25 ? 'linear-gradient(90deg,#FF8C00,#FFD700)'
                             : 'linear-gradient(90deg,#FF4444,#FF6B6B)';
    document.getElementById('hp-text').textContent = `❤️ ${Math.round(pd.hp)} / ${pd.maxHp}`;

    const puDiv = document.getElementById('powerup-display');
    puDiv.innerHTML = (pd.powerups || []).map(type =>
      `<div class="pu-badge">${C.POWERUP_EMOJI[type]} ${type}</div>`
    ).join('');

    // Leaderboard from server players
    const sorted = Array.from(this._serverPlayers.values())
      .sort((a, b) => b.score - a.score).slice(0, 8);
    document.getElementById('lb-rows').innerHTML = sorted.map((p, i) =>
      `<div class="lb-row${p.id === this._myId ? ' me' : ''}">
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-dot" style="background:${p.color}"></span>
        <span class="lb-name">${p.name}</span>
        <span class="lb-score">${p.score}</span>
      </div>`
    ).join('');
  }

  _showDeathScreen(respawnIn) {
    const overlay = document.getElementById('death-overlay');
    document.getElementById('death-stats').textContent =
      `Score: ${this._myData?.score || 0} · Kills: ${this._myData?.kills || 0}`;
    document.getElementById('killer-text').textContent =
      this._killerName ? `☠️ Eliminated by ${this._killerName}` : '';
    document.getElementById('respawn-fill').style.width = '0%';
    overlay.classList.add('show');
    this._respawnAt = Date.now() + respawnIn;
  }

  // ─── Kill feed ────────────────────────────────────────────────────────────────

  _addKillFeedItem(msg, isMe) {
    const feed = document.getElementById('kill-feed');
    const el   = document.createElement('div');
    el.className = 'kill-msg';
    el.textContent = msg;
    if (isMe) el.style.borderLeftColor = '#FFD700';
    feed.prepend(el);
    this._killFeedItems.push(el);
    if (this._killFeedItems.length > 5) this._killFeedItems.shift().remove();
    setTimeout(() => {
      el.style.transition = 'opacity 0.5s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }, 4000);
  }

  // ─── Floating text ───────────────────────────────────────────────────────────

  _spawnFloater(x, y, text, color = '#FFD700') {
    const t = this.add.text(x, y, text, {
      fontSize: '18px', fontStyle: 'bold', fontFamily: 'system-ui',
      color, stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(50);
    this._floaters.push({ text: t, vy: -90, life: 1.1 });
  }

  _updateFloaters(dt) {
    this._floaters = this._floaters.filter(f => {
      f.life -= dt;
      f.text.y += f.vy * dt;
      f.text.alpha = Math.max(0, f.life / 1.1);
      if (f.life <= 0) { f.text.destroy(); return false; }
      return true;
    });
  }

  // ─── Notifications ───────────────────────────────────────────────────────────

  _showNotif(msg) {
    const stack = document.getElementById('notif-stack');
    const el    = document.createElement('div');
    el.className = 'notif';
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.5s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }, 2500);
  }
}
