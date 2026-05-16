'use strict';

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const cors       = require('cors');

const GameRoom = require('./game/GameRoom');
const db       = require('./db/postgres');
const cache    = require('./db/redis');

const PORT = parseInt(process.env.PORT || '3000');
const app    = express();
const server = http.createServer(app);

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Socket.io ──────────────────────────────────────────────────────────────

const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 10000,
  pingInterval: 5000,
});

const room = new GameRoom(io);

io.on('connection', (socket) => {
  console.log(`[WS] Connected: ${socket.id}`);

  socket.on('join', ({ name }) => {
    const safeName = (name || 'Guest').trim().slice(0, 16) || 'Guest';
    room.addPlayer(socket, safeName);
  });

  socket.on('input', (input) => {
    room.handleInput(socket.id, input);
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Disconnected: ${socket.id}`);
    const player = room.players.get(socket.id);
    if (player && player.score > 0) {
      db.saveScore({ name: player.name, score: player.score, kills: player.kills });
    }
    room.removePlayer(socket.id);
  });
});

// ─── REST API ────────────────────────────────────────────────────────────────

app.get('/api/leaderboard', async (req, res) => {
  const cached = await cache.get('leaderboard');
  if (cached) return res.json(cached);

  const scores = await db.getTopScores(20);
  await cache.set('leaderboard', scores, 30); // 30s TTL
  res.json(scores);
});

app.get('/api/status', (req, res) => {
  res.json({
    players: room.players.size,
    uptime: process.uptime(),
    version: '1.0.0',
  });
});

// Catch-all → SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Boot ────────────────────────────────────────────────────────────────────

async function boot() {
  await Promise.all([db.connect(), cache.connect()]);
  server.listen(PORT, () => {
    console.log(`\n🚀 Indian Streets.io running on http://localhost:${PORT}\n`);
  });
}

boot();
