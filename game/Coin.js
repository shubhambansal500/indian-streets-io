'use strict';

const C = require('./Constants');
const { v4: uuidv4 } = require('uuid');

class Coin {
  constructor() {
    this.id = uuidv4();
    this.respawn();
  }

  respawn() {
    const margin = 80;
    this.x = margin + Math.random() * (C.MAP_WIDTH  - margin * 2);
    this.y = margin + Math.random() * (C.MAP_HEIGHT - margin * 2);
    this.active = true;
  }

  collect() {
    this.active = false;
    // Respawn at new position after a short delay (handled by GameRoom)
  }

  serialize() {
    return { id: this.id, x: Math.round(this.x), y: Math.round(this.y) };
  }
}

module.exports = Coin;
