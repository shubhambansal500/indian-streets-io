// Client-side mirror of server Constants (no require() in browser)
const C = {
  MAP_WIDTH:    3200,
  MAP_HEIGHT:   3200,
  PLAYER_SPEED: 180,
  PLAYER_HP:    100,
  PLAYER_RADIUS: 22,
  ATTACK_RANGE:  75,
  ATTACK_DAMAGE: 25,
  ATTACK_COOLDOWN: 600,
  COIN_RADIUS:   10,
  COIN_VALUE:    10,
  KILL_BONUS:    50,

  POWERUP_TYPES: ['rickshaw', 'chai', 'cricketBat', 'trafficJam', 'cowShield', 'mumbaiLocal'],

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

  POWERUP_COLOR: {
    rickshaw:    0xFFD700,
    chai:        0x8B4513,
    cricketBat:  0x228B22,
    trafficJam:  0xFF4500,
    cowShield:   0xF5F5DC,
    mumbaiLocal: 0x4169E1,
  },

  TICK_RATE: 20,
};
