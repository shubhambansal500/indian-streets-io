'use strict';

const C = require('./Constants');

let colorIdx = 0;

class Player {
  constructor(id, name) {
    this.id = id;
    this.name = name.slice(0, 16);
    this.color = C.PLAYER_COLORS[colorIdx % C.PLAYER_COLORS.length];
    colorIdx++;

    this.x = this._randSpawn('x');
    this.y = this._randSpawn('y');

    this.hp = C.PLAYER_HP;
    this.maxHp = C.PLAYER_HP;
    this.score = 0;
    this.kills = 0;

    this.alive = true;
    this.respawnAt = 0;

    this.streak = 0; // consecutive kills without dying

    // Active powerups: { type -> expiresAt }
    this.powerups = {};
    this.cricketBatReady = false; // charged 3x hit
    this.lastAttack = 0;

    // Last validated input from client
    this.input = { left: false, right: false, up: false, down: false, attack: false };

    // Anti-cheat tracking
    this._lastInputTime = 0;
    this._lastInputX    = this.x;
    this._lastInputY    = this.y;
  }

  _randSpawn(axis) {
    const margin = 200;
    const max = axis === 'x' ? C.MAP_WIDTH : C.MAP_HEIGHT;
    return margin + Math.random() * (max - margin * 2);
  }

  update(dt, now, buildings) {
    if (!this.alive) {
      if (now >= this.respawnAt) this._respawn(buildings);
      return;
    }

    // Expire powerups
    for (const [type, expiresAt] of Object.entries(this.powerups)) {
      if (now >= expiresAt) {
        delete this.powerups[type];
        if (type === 'cricketBat') this.cricketBatReady = false;
      }
    }

    // Movement
    const input = this.input;
    let dx = 0, dy = 0;
    if (input.left)  dx -= 1;
    if (input.right) dx += 1;
    if (input.up)    dy -= 1;
    if (input.down)  dy += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
    }

    const speed = this._speed();

    // Separate X/Y so player slides along walls
    const nx = Math.max(C.PLAYER_RADIUS, Math.min(C.MAP_WIDTH  - C.PLAYER_RADIUS, this.x + dx * speed * dt));
    const ny = Math.max(C.PLAYER_RADIUS, Math.min(C.MAP_HEIGHT - C.PLAYER_RADIUS, this.y + dy * speed * dt));

    if (!this._collides(nx, this.y, buildings)) this.x = nx;
    if (!this._collides(this.x, ny, buildings)) this.y = ny;

    // Chai HP regen
    if (this.powerups.chai) {
      this.hp = Math.min(this.maxHp, this.hp + 12 * dt);
    }
  }

  _collides(x, y, buildings) {
    if (!buildings) return false;
    const r = C.PLAYER_RADIUS;
    for (const b of buildings) {
      if (x + r > b.x && x - r < b.x + b.w &&
          y + r > b.y && y - r < b.y + b.h) return true;
    }
    return false;
  }

  _speed() {
    let s = C.PLAYER_SPEED;
    if (this.powerups.rickshaw) s *= 2.5;
    if (this.powerups.trafficJam) s *= 0; // own jam doesn't slow self
    return s;
  }

  applyExternalSlow(until) {
    // Used by traffic jam targeting OTHER players
    this.powerups.slowed = until;
  }

  tryAttack(now) {
    if (!this.alive) return false;
    if (now - this.lastAttack < C.ATTACK_COOLDOWN) return false;
    this.lastAttack = now;
    return true;
  }

  attackDamage() {
    if (this.cricketBatReady) {
      this.cricketBatReady = false;
      delete this.powerups.cricketBat;
      return C.ATTACK_DAMAGE * 3;
    }
    return C.ATTACK_DAMAGE;
  }

  takeDamage(amount) {
    if (!this.alive) return false;
    if (this.powerups.cowShield) return false; // immune

    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.respawnAt = Date.now() + C.RESPAWN_DELAY;
      this.powerups = {};
      this.cricketBatReady = false;
      this.streak = 0; // dying resets victim's streak
      return true; // died
    }
    return false;
  }

  collectPowerup(type, now) {
    const duration = C.POWERUP_DURATION[type];

    if (type === 'mumbaiLocal') {
      // Instant teleport
      this.x = 100 + Math.random() * (C.MAP_WIDTH - 200);
      this.y = 100 + Math.random() * (C.MAP_HEIGHT - 200);
      return null; // no lingering effect
    }

    if (type === 'cricketBat') {
      this.cricketBatReady = true;
    }

    this.powerups[type] = now + duration;
    return type;
  }

  slowedBy(until) {
    // Traffic jam applied by another player
    this.powerups.slowed = until;
  }

  _respawn(buildings) {
    let attempts = 0;
    do {
      this.x = this._randSpawn('x');
      this.y = this._randSpawn('y');
      attempts++;
    } while (buildings && this._collides(this.x, this.y, buildings) && attempts < 50);
    this.hp = this.maxHp;
    this.alive = true;
    this.powerups = {};
    this.cricketBatReady = false;
  }

  activePowerupList() {
    return Object.keys(this.powerups).filter(k => k !== 'slowed');
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      x: Math.round(this.x),
      y: Math.round(this.y),
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      score: this.score,
      kills: this.kills,
      color: this.color,
      powerups: this.activePowerupList(),
      alive: this.alive,
      respawnIn: this.alive ? 0 : Math.max(0, this.respawnAt - Date.now()),
      streak: this.streak,
    };
  }
}

module.exports = Player;
