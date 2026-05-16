'use strict';

const C        = require('./Constants');
const Player   = require('./Player');
const Coin     = require('./Coin');
const Powerup  = require('./Powerup');
const { getBuildings } = require('./MapData');

class GameRoom {
  constructor(io) {
    this.io = io;
    this.players = new Map();   // socketId -> Player
    this.coins = [];
    this.powerups = [];
    this.events = [];           // queued events to flush with each tick
    this.lastTick = Date.now();

    this._initCoins();
    this._initPowerups();
    this._startLoop();
  }

  _initCoins() {
    for (let i = 0; i < C.NUM_COINS; i++) {
      this.coins.push(new Coin());
    }
  }

  _initPowerups() {
    for (let i = 0; i < C.NUM_POWERUPS; i++) {
      this.powerups.push(new Powerup());
    }
  }

  // ─── Socket lifecycle ────────────────────────────────────────────────────────

  addPlayer(socket, name) {
    // Ignore duplicate joins from the same socket
    if (this.players.has(socket.id)) return;

    if (this.players.size >= C.MAX_PLAYERS) {
      socket.emit('roomFull');
      return;
    }
    const player = new Player(socket.id, name);
    this.players.set(socket.id, player);

    socket.emit('joined', {
      id: socket.id,
      mapWidth: C.MAP_WIDTH,
      mapHeight: C.MAP_HEIGHT,
      color: player.color,
    });

    this._queueEvent('playerJoined', { id: socket.id, name: player.name, color: player.color });
    console.log(`[+] ${name} joined (${this.players.size} players)`);
  }

  removePlayer(socketId) {
    const p = this.players.get(socketId);
    if (!p) return;
    this.players.delete(socketId);
    this._queueEvent('playerLeft', { id: socketId, name: p.name });
    console.log(`[-] ${p.name} left (${this.players.size} players)`);
  }

  handleInput(socketId, input) {
    const player = this.players.get(socketId);
    if (!player || !player.alive) return;

    // Anti-cheat: whitelist only boolean fields
    player.input = {
      left:   !!input.left,
      right:  !!input.right,
      up:     !!input.up,
      down:   !!input.down,
      attack: !!input.attack,
    };

    if (input.attack) this._processAttack(player);
  }

  // ─── Game loop ───────────────────────────────────────────────────────────────

  _startLoop() {
    const interval = 1000 / C.TICK_RATE;
    this._tickTimer = setInterval(() => this._tick(), interval);
  }

  stop() {
    clearInterval(this._tickTimer);
  }

  _tick() {
    const now = Date.now();
    const dt  = Math.min((now - this.lastTick) / 1000, 0.1); // cap at 100ms
    this.lastTick = now;

    const buildings = getBuildings();
    for (const player of this.players.values()) {
      player.update(dt, now, buildings);
    }

    // Check coin pickups
    for (const coin of this.coins) {
      if (!coin.active) continue;
      for (const player of this.players.values()) {
        if (!player.alive) continue;
        const dist = Math.hypot(player.x - coin.x, player.y - coin.y);
        if (dist < C.PLAYER_RADIUS + C.COIN_RADIUS) {
          coin.collect();
          player.score += C.COIN_VALUE;
          this._queueEvent('coinCollected', { coinId: coin.id, playerId: player.id, score: player.score });
          // Respawn coin elsewhere immediately
          coin.respawn();
          break;
        }
      }
    }

    // Check powerup pickups + respawn expired ones
    for (const pu of this.powerups) {
      pu.tryRespawn(now);
      if (!pu.active) continue;
      for (const player of this.players.values()) {
        if (!player.alive) continue;
        const dist = Math.hypot(player.x - pu.x, player.y - pu.y);
        if (dist < C.PLAYER_RADIUS + C.POWERUP_RADIUS) {
          const type = pu.type;

          // Traffic jam: slow all nearby players
          if (type === 'trafficJam') {
            const slowUntil = now + C.POWERUP_DURATION.trafficJam;
            for (const other of this.players.values()) {
              if (other.id === player.id || !other.alive) continue;
              const d2 = Math.hypot(other.x - player.x, other.y - player.y);
              if (d2 < 250) other.slowedBy(slowUntil);
            }
          }

          player.collectPowerup(type, now);
          pu.collect(now);
          this._queueEvent('powerupCollected', {
            powerupId: pu.id,
            playerId: player.id,
            type,
            label: C.POWERUP_LABEL[type],
            emoji: C.POWERUP_EMOJI[type],
          });
          break;
        }
      }
    }

    // Broadcast state
    this._broadcast(now);
  }

  // ─── Attack processing ───────────────────────────────────────────────────────

  _processAttack(attacker) {
    const now = Date.now();
    if (!attacker.tryAttack(now)) return;

    const damage = attacker.attackDamage();
    const hits = [];

    for (const target of this.players.values()) {
      if (target.id === attacker.id || !target.alive) continue;
      const dist = Math.hypot(attacker.x - target.x, attacker.y - target.y);
      if (dist > C.ATTACK_RANGE) continue;

      const died = target.takeDamage(damage);
      hits.push({ targetId: target.id, damage, died });

      if (died) {
        attacker.kills++;
        attacker.score += C.KILL_BONUS;
        this._queueEvent('playerKilled', {
          killerId: attacker.id,
          killerName: attacker.name,
          victimId: target.id,
          victimName: target.name,
          bonusScore: C.KILL_BONUS,
        });
      }
    }

    if (hits.length > 0) {
      this._queueEvent('attackLanded', {
        attackerId: attacker.id,
        hits,
        x: Math.round(attacker.x),
        y: Math.round(attacker.y),
      });
    } else {
      // Whiff — still emit so client can show swing animation
      this._queueEvent('attackWhiff', { attackerId: attacker.id });
    }
  }

  // ─── Broadcast ───────────────────────────────────────────────────────────────

  _broadcast(now) {
    const players   = Array.from(this.players.values()).map(p => p.serialize());
    const coins     = this.coins.filter(c => c.active).map(c => c.serialize());
    const powerups  = this.powerups.filter(p => p.active).map(p => p.serialize());
    const leaderboard = this._buildLeaderboard();

    this.io.emit('gameState', {
      players,
      coins,
      powerups,
      leaderboard,
      events: this.events,
      ts: now,
    });

    this.events = []; // flush
  }

  _buildLeaderboard() {
    return Array.from(this.players.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((p, i) => ({
        rank: i + 1,
        id: p.id,
        name: p.name,
        score: p.score,
        kills: p.kills,
        color: p.color,
      }));
  }

  _queueEvent(type, data) {
    this.events.push({ type, ...data });
  }
}

module.exports = GameRoom;
