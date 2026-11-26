// audio.js — all sound is synthesised with WebAudio; no audio files, no network.
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.windGain = null;
    this.muted = false;
    this.started = false;
  }

  // Must be called from a user gesture at least once.
  start() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.started = true;
      this.buildEngineLoop();
    } catch (e) {
      this.started = false;
    }
  }

  buildEngineLoop() {
    const ctx = this.ctx;
    // Engine: two detuned saws through a low-pass filter.
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 1.2;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 52;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 55.5;
    this.engineOsc.connect(filter);
    osc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(ctx.destination);
    this.engineOsc.start();
    osc2.start();
    this.engineOsc2 = osc2;
    this.engineFilter = filter;

    // Wind: looped white-noise buffer through a band-pass.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900;
    band.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    noise.connect(band);
    band.connect(this.windGain);
    this.windGain.connect(ctx.destination);
    noise.start();
  }

  // Called every frame with the plane's state.
  update(throttle, speedKts, flying) {
    if (!this.started || !this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const thr = flying ? throttle : 0;
    const target = flying ? 0.02 + thr * 0.05 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.1);
    const freq = 46 + thr * 70 + speedKts * 0.12;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(freq * 1.07, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(320 + thr * 900, t, 0.15);
    const wind = flying ? Math.min(0.09, speedKts * 0.00045) : 0;
    this.windGain.gain.setTargetAtTime(wind, t, 0.2);
  }

  tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!this.started || !this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  ringChime() {
    this.tone(880, 0.35, 'sine', 0.18);
    this.tone(1318, 0.4, 'sine', 0.14, 0.08);
    this.tone(1760, 0.5, 'sine', 0.1, 0.16);
  }

  fuelChime() {
    this.tone(523, 0.25, 'triangle', 0.16);
    this.tone(784, 0.35, 'triangle', 0.14, 0.09);
  }

  thud() {
    this.tone(90, 0.3, 'sine', 0.3, 0, 45);
    this.noiseBurst(0.25, 0.25);
  }

  crash() {
    this.noiseBurst(0.7, 0.4);
    this.tone(70, 0.8, 'sawtooth', 0.2, 0, 30);
  }

  fanfare() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => this.tone(n, 0.4, 'triangle', 0.16, i * 0.12));
  }

  noiseBurst(dur, vol) {
    if (!this.started || !this.ctx || this.muted) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    src.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    src.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(this.muted ? 0 : 0.03, t, 0.05);
      if (this.windGain) this.windGain.gain.setTargetAtTime(0, t, 0.05);
    }
    return this.muted;
  }
}
