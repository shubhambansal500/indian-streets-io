# 🛺 Indian Streets.io

Chaotic multiplayer browser survival game. Survive the streets. Collect coins. Dominate.

## Quick Start (3 commands)

```bash
git clone <repo> && cd indian-streets-io
npm install
npm run dev        # → http://localhost:3000
```

No PostgreSQL or Redis required to start — the server degrades gracefully without them.

## With Docker (full stack)

```bash
cp .env.example .env
docker compose up --build
# → http://localhost:3000
```

## Production (with nginx)

```bash
docker compose --profile prod up --build -d
# → http://localhost:80
```

---

## Architecture

```
indian-streets-io/
├── server.js              # Express + Socket.io entry point
├── game/
│   ├── Constants.js       # Shared game constants (server)
│   ├── Player.js          # Player entity + movement + combat
│   ├── Coin.js            # Coin entity
│   ├── Powerup.js         # Powerup entity + respawn logic
│   └── GameRoom.js        # Game loop, collision, broadcast (20 Hz)
├── db/
│   ├── postgres.js        # Score persistence (optional)
│   ├── redis.js           # Leaderboard cache (optional)
│   └── schema.sql         # DB schema
└── public/                # Static frontend (served by Express)
    ├── index.html         # Shell + CSS + HUD + menu
    └── js/
        ├── Constants.js       # Client-side constants mirror
        ├── main.js            # Phaser 3 game config
        ├── scenes/
        │   ├── BootScene.js   # Generates procedural textures
        │   ├── MenuScene.js   # Name input, connect
        │   └── GameScene.js   # Main game: map, players, network sync
        └── systems/
            ├── NetworkManager.js  # Socket.io wrapper + event bus
            └── MobileControls.js  # Virtual joystick + attack button
```

## Multiplayer Architecture

```
Client (Phaser 3, 60 fps)
  │  sends: input { left,right,up,down,attack }  ← on change only
  │  receives: gameState { players, coins, powerups, events } ← 20 Hz
  ▼
Server (Node.js + Socket.io)
  │  GameRoom ticks at 20 Hz (50ms intervals)
  │  Server-authoritative movement + combat
  │  Anti-cheat: input whitelist, speed cap, attack cooldown
  ▼
State broadcast → all connected sockets
```

**Client-side prediction**: Local player moves immediately on input (no wait for server roundtrip). Server reconciles if drift > 80px.

**Remote player interpolation**: Remote sprites lerp toward latest server position each frame (factor 0.2).

## Powerups

| Powerup | Effect | Duration |
|---|---|---|
| 🛺 Auto Rickshaw Boost | 2.5× speed | 5s |
| ☕ Chai Energy | +12 HP/sec regen | 8s |
| 🏏 Cricket Bat Smash | Next attack = 3× damage | Until used |
| 🚦 Traffic Jam | Slows all nearby players 50% | 5s |
| 🐄 Cow Shield | Full immunity to damage | 4s |
| 🚂 Mumbai Local | Random teleport across map | Instant |

## Controls

| Action | Keyboard | Mobile |
|---|---|---|
| Move | WASD / Arrow keys | Left joystick |
| Attack | Spacebar | Right ⚔️ button |

## Scaling Strategy

- **Horizontal**: run multiple Node processes behind nginx with sticky sessions (socket.io requires affinity)
- **Rooms**: add `GameRoom` instances per region/room — players matchmake into available rooms
- **State sync**: switch from full-state broadcast to delta encoding at 100+ players
- **Redis Pub/Sub**: for cross-process room state if needed

## Monetization Ideas (post-MVP)

- 🎨 Cosmetic skins (player colors, trail effects)
- 🏆 Season pass with cosmetic rewards
- 🎪 Custom room creation (private matches)
- 📊 Stats dashboard for streamers
- 👕 Merch (if it goes viral 😄)

## Future Roadmap

- [ ] Tiled map editor integration (more detailed city)
- [ ] 3–5 more powerups (Samosa Shield, Monsoon Flood, etc.)
- [ ] Sound effects (honking, chai slurp, crowd roar)
- [ ] Seasonal events (Diwali fireworks, IPL mode)
- [ ] Replay system for viral clips
- [ ] Team mode (2v2, 5v5)
- [ ] Custom rooms with link sharing
- [ ] Streamer mode (viewer voting on events)
