'use strict';

class SoundManager {
  constructor() {
    this._actx = null;
    this._ambientNode = null;
  }

  _ctx() {
    if (!this._actx) {
      this._actx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._actx.state === 'suspended') this._actx.resume();
    return this._actx;
  }

  // freq sweep oscillator
  _osc(freq, type, gain, dur, freqEnd, delay) {
    try {
      const ctx = this._ctx();
      const t = ctx.currentTime + (delay || 0);
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    } catch (_) {}
  }

  // filtered noise burst
  _noise(gain, dur, cutoff, delay) {
    try {
      const ctx = this._ctx();
      const t   = ctx.currentTime + (delay || 0);
      const sr  = ctx.sampleRate;
      const buf = ctx.createBuffer(1, Math.ceil(sr * dur), sr);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src  = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = cutoff || 800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filt);
      filt.connect(g);
      g.connect(ctx.destination);
      src.start(t);
    } catch (_) {}
  }

  coin() {
    this._osc(523,  'sine', 0.28, 0.06);
    this._osc(784,  'sine', 0.22, 0.07, null, 0.06);
    this._osc(1047, 'sine', 0.18, 0.09, null, 0.12);
  }

  attack() {
    try {
      const ctx  = this._ctx();
      const now  = ctx.currentTime;
      const sr   = ctx.sampleRate;
      const buf  = ctx.createBuffer(1, Math.ceil(sr * 0.18), sr);
      const d    = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src  = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type  = 'bandpass';
      filt.frequency.setValueAtTime(3200, now);
      filt.frequency.exponentialRampToValueAtTime(280, now + 0.18);
      filt.Q.value = 2.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.38, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      src.connect(filt);
      filt.connect(g);
      g.connect(ctx.destination);
      src.start(now);
    } catch (_) {}
  }

  hit() {
    this._noise(0.55, 0.06, 2200);
    this._osc(95, 'sine', 0.65, 0.18, 38);
  }

  death() {
    this._noise(0.45, 0.28, 600);
    this._osc(140, 'sine', 0.7,  0.07, 50);
    this._osc(60,  'sine', 0.55, 0.5,  28, 0.05);
    this._osc(210, 'square', 0.12, 0.09, null, 0.02);
  }

  powerup() {
    [261, 329, 392, 523, 784].forEach((f, i) => {
      this._osc(f, 'triangle', 0.2, 0.14, null, i * 0.08);
    });
  }

  startAmbient() {
    if (this._ambientNode) return;
    try {
      const ctx  = this._ctx();
      const sr   = ctx.sampleRate;
      const buf  = ctx.createBuffer(1, sr * 2, sr);
      const d    = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src  = ctx.createBufferSource();
      src.buffer = buf;
      src.loop   = true;
      const filt = ctx.createBiquadFilter();
      filt.type  = 'lowpass';
      filt.frequency.value = 140;
      const g = ctx.createGain();
      g.gain.value = 0.038;
      src.connect(filt);
      filt.connect(g);
      g.connect(ctx.destination);
      src.start();
      this._ambientNode = src;
    } catch (_) {}
  }
}

const soundManager = new SoundManager();
