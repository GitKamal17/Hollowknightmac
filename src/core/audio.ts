// Every sound is synthesised with WebAudio at runtime. No audio files.

interface ToneOpts {
  f: number;
  f2?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  attack?: number;
}

interface NoiseOpts {
  dur: number;
  gain?: number;
  type?: BiquadFilterType;
  f: number;
  f2?: number;
  q?: number;
  delay?: number;
  attack?: number;
}

const MIN_GAP = 0.03;

export class AudioFx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<string, number>();
  private ambient = false;
  muted = false;

  /** Must be called from a user gesture before anything can play. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.55;
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp).connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  private tone(o: ToneOpts): void {
    const c = this.ctx!;
    const t0 = c.currentTime + (o.delay ?? 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t0 + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  private noise(o: NoiseOpts): void {
    const c = this.ctx!;
    const t0 = c.currentTime + (o.delay ?? 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = c.createBiquadFilter();
    filt.type = o.type ?? 'bandpass';
    filt.frequency.setValueAtTime(o.f, t0);
    if (o.f2) filt.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
    filt.Q.value = o.q ?? 1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t0 + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(filt).connect(g).connect(this.master!);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + o.dur + 0.05);
  }

  startAmbient(): void {
    if (this.ambient || !this.ctx || !this.master) return;
    this.ambient = true;
    const c = this.ctx;
    const bus = c.createGain();
    bus.gain.value = 0.0001;
    bus.gain.exponentialRampToValueAtTime(1, c.currentTime + 4);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    bus.connect(lp).connect(this.master);
    for (const [f, gain] of [
      [55, 0.05],
      [82.4, 0.03],
      [110.3, 0.012],
    ] as const) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = gain;
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.05 + f / 4000;
      const lg = c.createGain();
      lg.gain.value = gain * 0.6;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(bus);
      o.start();
      lfo.start();
    }
    // Cave wind: looped noise through a slowly wandering band-pass.
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 300;
    bp.Q.value = 0.8;
    const wlfo = c.createOscillator();
    wlfo.frequency.value = 0.07;
    const wl = c.createGain();
    wl.gain.value = 160;
    wlfo.connect(wl).connect(bp.frequency);
    const wg = c.createGain();
    wg.gain.value = 0.035;
    src.connect(bp).connect(wg).connect(bus);
    src.start();
    wlfo.start();
  }

  play(name: string): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < MIN_GAP) return;
    this.last.set(name, now);
    try {
      this.sound(name);
    } catch {
      /* never let audio take the game down */
    }
  }

  private sound(name: string): void {
    switch (name) {
      case 'jump':
        this.noise({ dur: 0.09, f: 1400, gain: 0.08, q: 0.7 });
        this.tone({ f: 190, f2: 300, dur: 0.08, gain: 0.07 });
        break;
      case 'walljump':
        this.noise({ dur: 0.08, f: 900, gain: 0.1 });
        this.tone({ f: 240, f2: 380, dur: 0.07, gain: 0.06, type: 'triangle' });
        break;
      case 'land':
        this.noise({ dur: 0.1, f: 380, type: 'lowpass', gain: 0.16 });
        break;
      case 'cling':
        this.noise({ dur: 0.06, f: 2400, gain: 0.05, q: 2 });
        break;
      case 'slash':
        this.noise({ dur: 0.13, f: 4200, f2: 1100, gain: 0.16, q: 1.4, attack: 0.01 });
        break;
      case 'hit':
        this.tone({ f: 720, f2: 380, dur: 0.09, gain: 0.16, type: 'triangle' });
        this.noise({ dur: 0.08, f: 2600, gain: 0.14, q: 0.8 });
        this.tone({ f: 120, f2: 60, dur: 0.12, gain: 0.2 });
        break;
      case 'hitBoss':
        this.tone({ f: 540, f2: 260, dur: 0.1, gain: 0.14, type: 'triangle' });
        this.noise({ dur: 0.1, f: 1600, gain: 0.14 });
        this.tone({ f: 90, f2: 45, dur: 0.15, gain: 0.22 });
        break;
      case 'block':
        this.tone({ f: 1320, dur: 0.18, gain: 0.08, type: 'square' });
        this.tone({ f: 1870, dur: 0.12, gain: 0.05, type: 'square' });
        this.noise({ dur: 0.05, f: 5000, gain: 0.1 });
        break;
      case 'pogo':
        this.tone({ f: 520, f2: 820, dur: 0.08, gain: 0.08, type: 'triangle' });
        this.noise({ dur: 0.06, f: 3000, gain: 0.08 });
        break;
      case 'dash':
        this.noise({ dur: 0.22, f: 600, f2: 2600, gain: 0.16, q: 0.9, attack: 0.02 });
        break;
      case 'hurt':
        this.tone({ f: 150, f2: 55, dur: 0.35, gain: 0.3, type: 'sawtooth' });
        this.noise({ dur: 0.25, f: 700, type: 'lowpass', gain: 0.25 });
        break;
      case 'spike':
        this.noise({ dur: 0.15, f: 3200, gain: 0.12 });
        break;
      case 'splash':
        this.noise({ dur: 0.4, f: 900, f2: 300, gain: 0.2, q: 0.6 });
        break;
      case 'death':
        this.tone({ f: 420, f2: 40, dur: 1.1, gain: 0.25, type: 'triangle' });
        this.noise({ dur: 0.8, f: 400, type: 'lowpass', gain: 0.2 });
        break;
      case 'focus':
        this.tone({ f: 220, f2: 440, dur: 0.9, gain: 0.06, attack: 0.3 });
        break;
      case 'healed':
        this.tone({ f: 660, dur: 0.4, gain: 0.12 });
        this.tone({ f: 990, dur: 0.5, gain: 0.08, delay: 0.06 });
        break;
      case 'enemyDie':
        this.noise({ dur: 0.3, f: 900, type: 'lowpass', gain: 0.2 });
        this.tone({ f: 260, f2: 70, dur: 0.28, gain: 0.16, type: 'triangle' });
        break;
      case 'shard':
        this.tone({ f: 1760 + Math.random() * 300, dur: 0.07, gain: 0.05 });
        break;
      case 'shardBounce':
        this.tone({ f: 2400 + Math.random() * 400, dur: 0.03, gain: 0.015 });
        break;
      case 'relic':
        [440, 554, 659, 880, 1109].forEach((f, i) => this.tone({ f, dur: 0.9, gain: 0.08, delay: i * 0.09, attack: 0.02 }));
        break;
      case 'echo':
        this.tone({ f: 330, f2: 660, dur: 0.6, gain: 0.1, type: 'triangle' });
        this.noise({ dur: 0.6, f: 1200, gain: 0.06 });
        break;
      case 'rest':
        [262, 330, 392].forEach((f, i) => this.tone({ f, dur: 1.2, gain: 0.06, delay: i * 0.12, attack: 0.08 }));
        break;
      case 'mothCharge':
        this.noise({ dur: 0.25, f: 1800, f2: 600, gain: 0.08, q: 3 });
        break;
      case 'lunge':
        this.noise({ dur: 0.18, f: 500, gain: 0.1 });
        break;
      case 'roar':
        this.tone({ f: 70, f2: 50, dur: 1.4, gain: 0.3, type: 'sawtooth', attack: 0.1 });
        this.tone({ f: 105, f2: 70, dur: 1.2, gain: 0.15, type: 'sawtooth', attack: 0.1 });
        this.noise({ dur: 1.3, f: 500, type: 'lowpass', gain: 0.3, attack: 0.1 });
        break;
      case 'bossTell':
        this.tone({ f: 160, f2: 120, dur: 0.25, gain: 0.08, type: 'triangle' });
        break;
      case 'bossJump':
        this.noise({ dur: 0.25, f: 300, type: 'lowpass', gain: 0.2 });
        break;
      case 'bossLand':
        this.tone({ f: 70, f2: 30, dur: 0.45, gain: 0.4 });
        this.noise({ dur: 0.4, f: 260, type: 'lowpass', gain: 0.35 });
        break;
      case 'bossCharge':
        this.noise({ dur: 0.5, f: 400, f2: 900, gain: 0.18 });
        break;
      case 'burst':
        this.tone({ f: 300, f2: 600, dur: 0.2, gain: 0.12, type: 'triangle' });
        this.noise({ dur: 0.2, f: 1400, gain: 0.12 });
        break;
      case 'debris':
        this.noise({ dur: 0.18, f: 600, type: 'lowpass', gain: 0.18 });
        break;
      case 'bossDeath':
        this.tone({ f: 200, f2: 40, dur: 2, gain: 0.25, type: 'sawtooth' });
        break;
      case 'bossBreak':
        this.noise({ dur: 1.2, f: 800, f2: 120, type: 'lowpass', gain: 0.4 });
        [523, 659, 784].forEach((f, i) => this.tone({ f, dur: 1.6, gain: 0.07, delay: 0.4 + i * 0.15, attack: 0.1 }));
        break;
      case 'gate':
        this.tone({ f: 90, f2: 60, dur: 0.6, gain: 0.25, type: 'square' });
        this.noise({ dur: 0.5, f: 300, type: 'lowpass', gain: 0.3 });
        break;
      case 'doublejump':
        this.noise({ dur: 0.16, f: 2200, f2: 900, gain: 0.1, q: 1.2 });
        this.tone({ f: 520, f2: 780, dur: 0.12, gain: 0.05, type: 'triangle' });
        break;
      case 'skitter':
        this.noise({ dur: 0.12, f: 3600, gain: 0.05, q: 4 });
        break;
      case 'spit':
        this.noise({ dur: 0.14, f: 700, f2: 1500, gain: 0.12, q: 2 });
        this.tone({ f: 180, f2: 320, dur: 0.1, gain: 0.06 });
        break;
      case 'parry':
        this.tone({ f: 1760, dur: 0.35, gain: 0.12, type: 'triangle' });
        this.tone({ f: 2637, dur: 0.25, gain: 0.06, type: 'sine' });
        this.noise({ dur: 0.06, f: 6000, gain: 0.14 });
        break;
      case 'enemySlash':
        this.noise({ dur: 0.12, f: 3000, f2: 1400, gain: 0.12, q: 1.6 });
        break;
      case 'crescent':
        this.tone({ f: 660, f2: 330, dur: 0.3, gain: 0.08, type: 'triangle' });
        this.noise({ dur: 0.25, f: 1800, gain: 0.07 });
        break;
      case 'vesperIntro':
        [392, 466, 587].forEach((f, i) => this.tone({ f, dur: 0.6, gain: 0.07, delay: i * 0.1, type: 'triangle' }));
        this.noise({ dur: 0.3, f: 4000, gain: 0.08, delay: 0.3 });
        break;
      case 'shopOpen':
        this.tone({ f: 523, dur: 0.15, gain: 0.06, type: 'triangle' });
        this.tone({ f: 659, dur: 0.2, gain: 0.05, type: 'triangle', delay: 0.07 });
        break;
      case 'buy':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone({ f, dur: 0.3, gain: 0.06, delay: i * 0.05 }));
        break;
      case 'denied':
        this.tone({ f: 200, f2: 150, dur: 0.18, gain: 0.08, type: 'square' });
        break;
      case 'hoard':
        for (let i = 0; i < 8; i++) this.tone({ f: 1500 + Math.random() * 1200, dur: 0.12, gain: 0.04, delay: i * 0.04 });
        break;
      case 'menu':
        this.tone({ f: 880, dur: 0.05, gain: 0.05, type: 'triangle' });
        break;
      case 'confirm':
        this.tone({ f: 660, dur: 0.12, gain: 0.07, type: 'triangle' });
        this.tone({ f: 990, dur: 0.15, gain: 0.05, type: 'triangle', delay: 0.05 });
        break;
      case 'pause':
        this.tone({ f: 440, f2: 330, dur: 0.12, gain: 0.06, type: 'triangle' });
        break;
    }
  }
}
