'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'indian_streets',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
});

async function connect() {
  try {
    const client = await pool.connect();
    console.log('[DB] PostgreSQL connected');
    client.release();
  } catch (err) {
    console.warn('[DB] PostgreSQL not available — running without persistence:', err.message);
  }
}

async function saveScore({ name, score, kills }) {
  try {
    await pool.query(
      `INSERT INTO leaderboard (player_name, score, kills, played_at)
       VALUES ($1, $2, $3, NOW())`,
      [name, score, kills]
    );
  } catch (err) {
    // Non-fatal — game runs fine without DB
  }
}

async function getTopScores(limit = 10) {
  try {
    const res = await pool.query(
      `SELECT player_name, score, kills, played_at
         FROM leaderboard
        ORDER BY score DESC
        LIMIT $1`,
      [limit]
    );
    return res.rows;
  } catch {
    return [];
  }
}

module.exports = { connect, saveScore, getTopScores };
