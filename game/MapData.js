'use strict';

// Single source of truth for building collision rects.
// Uses seed-42 RNG for positions — must stay in sync with client GameScene._buildMap().

const C    = require('./Constants');
const GRID = 400;

function seededRand(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

let _cache = null;

function getBuildings() {
  if (_cache) return _cache;
  _cache = [];
  const rng = seededRand(42); // position-only seed — matches client

  for (let bx = 0; bx < C.MAP_WIDTH; bx += GRID) {
    for (let by = 0; by < C.MAP_HEIGHT; by += GRID) {
      if (bx === 800 && by === 800) continue; // cricket ground cell

      const numB = Math.floor(rng() * 2) + 1;
      for (let b = 0; b < numB; b++) {
        const bw  = 80  + Math.floor(rng() * 230);
        const bh  = 80  + Math.floor(rng() * 230);
        const mg  = 28;
        const bxo = mg + Math.floor(rng() * Math.max(1, GRID - bw - mg * 2));
        const byo = mg + Math.floor(rng() * Math.max(1, GRID - bh - mg * 2));
        _cache.push({ x: bx + bxo, y: by + byo, w: bw, h: bh });
      }
    }
  }
  return _cache;
}

module.exports = { getBuildings };
