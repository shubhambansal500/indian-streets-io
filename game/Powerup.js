'use strict';

const C = require('./Constants');
const { v4: uuidv4 } = require('uuid');

class Powerup {
  constructor(type) {
    this.id = uuidv4();
    this.type = type || this._randomType();
    this.respawn();
  }

  _randomType() {
    return C.POWERUP_TYPES[Math.floor(Math.random() * C.POWERUP_TYPES.length)];
  }

  respawn() {
    const margin = 100;
    this.x = margin + Math.random() * (C.MAP_WIDTH  - margin * 2);
    this.y = margin + Math.random() * (C.MAP_HEIGHT - margin * 2);
    this.active = true;
    this.respawnAt = 0;
  }

  collect(now) {
    this.active = false;
    this.respawnAt = now + C.POWERUP_RESPAWN_MS;
    // Change type on respawn for variety
    this.type = this._randomType();
  }

  tryRespawn(now) {
    if (!this.active && now >= this.respawnAt) {
      this.respawn();
    }
  }

  serialize() {
    return { id: this.id, x: Math.round(this.x), y: Math.round(this.y), type: this.type };
  }
}

module.exports = Powerup;
