/**
 * Generative background music: a low drone, slow minor chords and sparse bell notes,
 * all from oscillators. Nothing is recorded or loaded.
 */
export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private chordIndex = 0;
  private nextChordAt = 0;
  volume = 0.4;
  private readonly chords = [
    [55, 82.41, 130.81, 164.81], // A minor
    [43.65, 65.41, 130.81, 155.56], // F
    [49, 73.42, 146.83, 174.61], // G
    [41.2, 61.74, 123.47, 146.83], // E minor-ish
  ];
  private readonly bells = [440, 523.25, 659.25, 783.99, 880, 1046.5];

  start(ctx: AudioContext): void {
    if (this.ctx) return;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume * 0.5;
    // A little reverb made from filtered noise
    const conv = ctx.createConvolver();
    const len = ctx.sampleRate * 2.5;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2) * 0.4;
    }
    conv.buffer = buf;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.master.connect(conv).connect(wet).connect(ctx.destination);
    this.master.connect(ctx.destination);
    this.nextChordAt = ctx.currentTime;
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 500);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v * 0.5;
  }

  private tick(): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    if (now >= this.nextChordAt - 0.6) {
      const chord = this.chords[this.chordIndex % this.chords.length]!;
      this.chordIndex++;
      const dur = 9;
      this.nextChordAt = now + dur;
      for (const f of chord) this.pad(f, now, dur);
    }
    if (Math.random() < 0.18) this.bell(this.bells[Math.floor(Math.random() * this.bells.length)]!, now + Math.random() * 0.4);
  }

  private pad(freq: number, start: number, dur: number): void {
    const ctx = this.ctx!;
    for (const detune of [-6, 5]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(0.05, start + 2.5);
      g.gain.setValueAtTime(0.05, start + dur - 2.5);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur + 0.6);
      osc.connect(f).connect(g).connect(this.master!);
      osc.start(start);
      osc.stop(start + dur + 0.7);
    }
  }

  private bell(freq: number, start: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(0.06, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 3.5);
    osc.connect(g).connect(this.master!);
    osc.start(start);
    osc.stop(start + 3.6);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }
}
