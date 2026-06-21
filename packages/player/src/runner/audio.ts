let audioCtx: AudioContext | null = null;
let muted = false;

const sfxByUrl = new Map<string, HTMLAudioElement[]>();
const MUTE_KEY = "runner-muted";
const POOL_SIZE = 5;

export function isRunnerMuted() {
  return muted;
}

export function initRunnerAudio() {
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    muted = false;
  }
}

export function setRunnerMuted(next: boolean) {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export async function unlockRunnerAudio() {
  if (muted) return;
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") await audioCtx.resume();
  } catch {
    /* ignore */
  }
}

function ensurePool(url: string): HTMLAudioElement[] {
  let pool = sfxByUrl.get(url);
  if (!pool) {
    pool = Array.from({ length: POOL_SIZE }, () => {
      const a = new Audio(url);
      a.crossOrigin = "anonymous";
      a.preload = "auto";
      return a;
    });
    sfxByUrl.set(url, pool);
  }
  return pool;
}

export function preloadRunnerSfx(urls: (string | null | undefined)[]) {
  for (const u of urls) {
    const url = (u || "").trim();
    if (url) ensurePool(url);
  }
}

export function playRunnerSfx(url: string | null | undefined) {
  const u = (url || "").trim();
  if (!u || muted) return;
  void unlockRunnerAudio();
  const pool = ensurePool(u);
  const el = pool.find((a) => a.paused || a.ended) ?? pool[0];
  try {
    el.currentTime = 0;
    el.volume = 0.9;
    void el.play().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

export function playRunnerBeep(freq = 880, durationSec = 0.12) {
  if (muted) return;
  void unlockRunnerAudio();
  try {
    const ctx = audioCtx || new AudioContext();
    audioCtx = ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + durationSec + 0.02);
  } catch {
    /* ignore */
  }
}
