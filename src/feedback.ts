/** Beeps (Web Audio), vibration, and the screen wake lock. */
import type { CueType } from './engine/timer';

let ctx: AudioContext | null = null;

/** Must be called from a user gesture (the Start tap) to unlock audio. */
export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, ms: number, at = 0, gain = 0.25): void {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  // Short attack/release envelope so beeps don't click.
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.setValueAtTime(gain, t + ms / 1000 - 0.03);
  g.gain.linearRampToValueAtTime(0, t + ms / 1000);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + ms / 1000 + 0.02);
}

const SOUNDS: Record<CueType, () => void> = {
  tick: () => tone(880, 90),
  ready: () => tone(660, 140),
  go: () => tone(1320, 320, 0, 0.3),
  rest: () => {
    tone(740, 160);
    tone(520, 260, 0.18);
  },
  finish: () => {
    tone(880, 160);
    tone(1100, 160, 0.18);
    tone(1320, 420, 0.36, 0.3);
  },
};

const VIBES: Record<CueType, number[]> = {
  tick: [40],
  ready: [60],
  go: [220],
  rest: [90, 80, 90],
  finish: [200, 100, 200, 100, 400],
};

export function cue(type: CueType, opts: { sound: boolean; vibration: boolean }): void {
  if (opts.sound) {
    if (ctx?.state === 'suspended') void ctx.resume();
    SOUNDS[type]();
  }
  if (opts.vibration && 'vibrate' in navigator) {
    try {
      navigator.vibrate(VIBES[type]);
    } catch {
      /* ignore */
    }
  }
}

// --- Wake lock -------------------------------------------------------------

let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function acquire(): Promise<void> {
  if (!wanted || sentinel || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    sentinel = null;
  }
}

// The lock is released automatically when the page is hidden; re-acquire.
document.addEventListener('visibilitychange', () => void acquire());

export function keepAwake(on: boolean): void {
  wanted = on;
  if (on) void acquire();
  else if (sentinel) {
    void sentinel.release();
    sentinel = null;
  }
}
