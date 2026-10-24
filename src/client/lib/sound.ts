class SoundEffects {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    try {
      const saved = localStorage.getItem('reverse_escape_muted');
      if (saved === 'true') this.muted = true;
    } catch {
      // ignore storage errors
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem('reverse_escape_muted', String(this.muted));
    } catch {
      // ignore
    }
    return this.muted;
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(freq: number, durationSec: number, type: OscillatorType = 'sine', gainVal = 0.06): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + durationSec);
    } catch {
      // ignore audio context errors in headless browsers
    }
  }

  public playPlace(): void {
    this.playTone(520, 0.06, 'triangle', 0.05);
  }

  public playErase(): void {
    this.playTone(240, 0.06, 'sine', 0.04);
  }

  public playStep(): void {
    this.playTone(380, 0.04, 'sine', 0.03);
  }

  public playKeyPickup(): void {
    this.playTone(740, 0.09, 'triangle', 0.07);
    setTimeout(() => this.playTone(980, 0.12, 'triangle', 0.07), 60);
  }

  public playDoorUnlock(): void {
    this.playTone(440, 0.08, 'square', 0.05);
    setTimeout(() => this.playTone(660, 0.11, 'triangle', 0.06), 70);
  }

  public playSwitchToggle(): void {
    this.playTone(600, 0.09, 'sawtooth', 0.05);
  }

  public playSuccess(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, 0.16, 'triangle', 0.07), idx * 75);
    });
  }

  public playError(): void {
    this.playTone(180, 0.18, 'sawtooth', 0.06);
  }
}

export const soundFX = new SoundEffects();
