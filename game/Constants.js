'use strict';

const Constants = {
  // Map
  MAP_WIDTH: 1600,
  MAP_HEIGHT: 1600,

  // Player
  PLAYER_SPEED: 180,       // px/sec base speed
  PLAYER_HP: 100,
  PLAYER_RADIUS: 22,
  MAX_PLAYERS: 20,

  // Combat
  ATTACK_RANGE: 75,        // px
  ATTACK_DAMAGE: 25,
  ATTACK_COOLDOWN: 600,    // ms
  RESPAWN_DELAY: 1500,     // ms

  // Pickups
  COIN_RADIUS: 10,
  COIN_VALUE: 10,
  NUM_COINS: 40,

  // Powerups
  NUM_POWERUPS: 6,
  POWERUP_RADIUS: 14,
  POWERUP_RESPAWN_MS: 18000,

  POWERUP_TYPES: [
    'rickshaw',    // speed boost
    'chai',        // hp regen
    'cricketBat',  // next hit 3x damage
    'trafficJam',  // slow nearby players
    'cowShield',   // temporary immunity
    'mumbaiLocal', // random teleport
  ],

  POWERUP_DURATION: {
    rickshaw:    5000,
    chai:        8000,
    cricketBat:  10000, // lasts until used or expires
    trafficJam:  5000,
    cowShield:   4000,
    mumbaiLocal: 0,     // instant
  },

  POWERUP_EMOJI: {
    rickshaw:    '🛺',
    chai:        '☕',
    cricketBat:  '🏏',
    trafficJam:  '🚦',
    cowShield:   '🐄',
    mumbaiLocal: '🚂',
  },

  POWERUP_LABEL: {
    rickshaw:    'Auto Rickshaw Boost!',
    chai:        'Chai Energy!',
    cricketBat:  'Cricket Bat Smash!',
    trafficJam:  'Traffic Jam!',
    cowShield:   'Cow Shield!',
    mumbaiLocal: 'Mumbai Local!',
  },

  // Network
  TICK_RATE: 20,           // server ticks/sec
  LEADERBOARD_RATE: 2000,  // ms between leaderboard broadcasts

  // Player palette
  PLAYER_COLORS: [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98FB98', '#F0E68C', '#87CEEB', '#FFA07A',
    '#20B2AA', '#FF69B4', '#CD853F', '#7B68EE', '#32CD32',
    '#FFD700', '#FF4500', '#1E90FF', '#ADFF2F', '#FF1493',
  ],

  // Kill score bonus
  KILL_BONUS: 50,
};

module.exports = Constants;
