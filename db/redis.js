'use strict';

const { createClient } = require('redis');

let client = null;

async function connect() {
  try {
    client = createClient({
      socket: {
        host:           process.env.REDIS_HOST || 'localhost',
        port:           parseInt(process.env.REDIS_PORT || '6379'),
        connectTimeout: 2000,
        reconnectStrategy: false,  // don't retry — fail fast in dev
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

    client.on('error', () => {}); // suppress noise

    await Promise.race([
      client.connect(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500)),
    ]);
    console.log('[Cache] Redis connected');
  } catch (err) {
    client = null;
    console.warn('[Cache] Redis not available — running without cache:', err.message);
  }
}

async function set(key, value, ttlSeconds = 60) {
  if (!client) return;
  try {
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch {}
}

async function get(key) {
  if (!client) return null;
  try {
    const val = await client.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

module.exports = { connect, set, get };
