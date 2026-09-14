// Web Audio API procedural sound synthesizer for arctic horror atmosphere

class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private ambientGain: GainNode | null = null;
  private isAmbientPlaying: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nechto_sound_enabled');
      this.enabled = saved !== 'false';
    }
  }

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public toggleSound(): boolean {
    this.enabled = !this.enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('nechto_sound_enabled', String(this.enabled));
    }
    if (!this.enabled && this.ambientGain) {
      this.ambientGain.gain.setValueAtTime(0, this.ctx?.currentTime || 0);
    }
    return this.enabled;
  }

  // 1. Звук раздачи / взятия карты (шелест и легкий стук)
  public playCardDraw() {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.12);

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.13);
  }

  // 2. Звук огнемёта (мощный шипящий поток пламени)
  public playFlamethrower() {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 1.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1; // шум
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(1200, t + 0.3);
    filter.frequency.exponentialRampToValueAtTime(150, t + 1.4);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.4, t + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(t);
  }

  // 3. Звук сигнала тревоги (нападение / окно защиты)
  public playAlarm() {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.linearRampToValueAtTime(900, t + 0.15);
    osc.frequency.linearRampToValueAtTime(600, t + 0.3);
    osc.frequency.linearRampToValueAtTime(900, t + 0.45);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.6);
  }

  // 4. Звук удара топора / установки двери (глухой деревянно-металлический стук)
  public playBarricade() {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.26);
  }

  // 5. Звук заражения / мрачный диссонанс
  public playInfectionSting() {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'sine';

    osc1.frequency.setValueAtTime(180, t);
    osc1.frequency.exponentialRampToValueAtTime(90, t + 1.2);

    osc2.frequency.setValueAtTime(254.5, t); // Тритон к 180 (дьявольский интервал)
    osc2.frequency.exponentialRampToValueAtTime(127, t + 1.2);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 1.25);
    osc2.stop(t + 1.25);
  }

  // 6. Звук успешной защиты («Нет, спасибо!» / «Мимо!»)
  public playDefenseSuccess() {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.2);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.32);
  }

  // 7. Пульс сердца при напряженных моментах
  public playHeartbeat() {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(65, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.16);
  }
}

export const soundFx = new SoundManager();
