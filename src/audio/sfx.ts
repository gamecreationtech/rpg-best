/**
 * Every sound is synthesised with the Web Audio API. Recipes follow the design
 * table: short noise thumps, sine pings, sweeps and arpeggios. Nothing is loaded.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  volume = 0.7;

  /** Must be called from a user gesture on iOS. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  private tone(freq: number, type: OscillatorType, start: number, duration: number, gain: number, endFreq?: number, attack = 0.005): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(g).connect(this.master!);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private noise(start: number, duration: number, gain: number, filterFreq: number, type: BiquadFilterType = 'lowpass', q = 1): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer!;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(f).connect(g).connect(this.master!);
    src.start(start);
    src.stop(start + duration + 0.02);
  }

  play(id: string): void {
    if (!this.ctx || !this.master || this.volume <= 0) return;
    const t = this.ctx.currentTime;
    switch (id) {
      case 'hit':
        this.noise(t, 0.09, 0.5, 900);
        this.tone(140, 'sine', t, 0.09, 0.4, 80);
        break;
      case 'crit':
        this.noise(t, 0.13, 0.6, 2400, 'highpass');
        for (const f of [260, 520, 1040]) this.tone(f, 'square', t, 0.13, 0.12, f * 0.7);
        break;
      case 'playerHurt':
        this.tone(85, 'sine', t, 0.2, 0.6, 50);
        this.tone(170, 'triangle', t, 0.16, 0.25, 90);
        this.noise(t, 0.12, 0.3, 500);
        break;
      case 'enemyDeath':
        this.tone(380, 'sawtooth', t, 0.28, 0.25, 70);
        this.noise(t, 0.2, 0.35, 700);
        break;
      case 'levelUp': {
        const notes = [261.6, 329.6, 392, 523.3, 659.3, 784, 987.8];
        notes.forEach((f, i) => this.tone(f, 'triangle', t + i * 0.16, 0.5, 0.25, undefined, 0.01));
        this.tone(130.8, 'sine', t, 1.5, 0.2);
        break;
      }
      case 'potionHp':
        this.tone(200, 'sine', t, 0.38, 0.35, 420, 0.03);
        this.noise(t + 0.05, 0.25, 0.15, 1200, 'bandpass', 4);
        break;
      case 'potionMp':
        this.tone(420, 'sine', t, 0.38, 0.3, 820, 0.03);
        this.noise(t + 0.05, 0.25, 0.12, 2000, 'bandpass', 4);
        break;
      case 'bandage':
        this.noise(t, 0.22, 0.4, 2600, 'bandpass', 2);
        this.tone(24, 'square', t, 0.22, 0.08);
        break;
      case 'incense':
        this.noise(t, 0.55, 0.25, 1400, 'bandpass', 1.5);
        this.tone(175, 'sine', t, 0.55, 0.2);
        this.tone(350, 'sine', t, 0.55, 0.12);
        break;
      case 'skillCast':
        this.tone(110, 'sawtooth', t, 0.24, 0.18, 1060, 0.02);
        this.noise(t, 0.2, 0.2, 1800, 'bandpass', 1);
        break;
      case 'heavyStrike':
        this.tone(62, 'sine', t, 0.38, 0.7, 40);
        this.tone(68, 'triangle', t, 0.3, 0.3, 45);
        this.noise(t, 0.15, 0.5, 400);
        break;
      case 'itemPickup':
        this.tone(880, 'sine', t, 0.08, 0.25);
        this.tone(1320, 'sine', t + 0.07, 0.08, 0.25);
        break;
      case 'itemEquip':
        for (const f of [1150, 2300, 3450]) this.tone(f, 'square', t, 0.18, 0.06, f * 0.9);
        this.noise(t, 0.06, 0.3, 4000, 'highpass');
        break;
      case 'coin':
        for (const f of [1600, 2550, 3800]) this.tone(f, 'sine', t, 0.24, 0.15, f);
        break;
      case 'forgeSmelt':
        for (const f of [305, 610, 1220]) this.tone(f, 'triangle', t, 0.48, 0.2, f * 0.98);
        this.noise(t, 0.1, 0.5, 3000, 'highpass');
        break;
      case 'uiClick':
        this.tone(820, 'sine', t, 0.05, 0.15);
        break;
      case 'freeze':
        this.noise(t, 0.3, 0.2, 5000, 'highpass');
        this.tone(1800, 'sine', t, 0.3, 0.1, 900);
        break;
      case 'explode':
        this.noise(t, 0.4, 0.6, 300);
        this.tone(70, 'sine', t, 0.4, 0.5, 30);
        break;
      case 'lightning':
        this.noise(t, 0.18, 0.5, 3000, 'highpass');
        this.tone(900, 'sawtooth', t, 0.12, 0.15, 200);
        break;
      case 'portal':
        this.tone(220, 'sine', t, 0.8, 0.2, 880, 0.1);
        this.tone(330, 'triangle', t, 0.8, 0.12, 1320, 0.1);
        break;
    }
  }
}
