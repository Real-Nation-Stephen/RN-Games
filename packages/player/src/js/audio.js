let ctx = null;

function getCtx() {
  if (!ctx) {
    ctx = new AudioContext();
  }
  return ctx;
}

export async function unlockAudio() {
  const c = getCtx();
  if (c.state === "suspended") {
    await c.resume();
  }
}

export function playUrlSound(url, durationMs) {
  const audio = new Audio(url);
  audio.crossOrigin = "anonymous";
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      /* */
    }
  };
  void audio.play().catch(() => {});
  if (durationMs != null) {
    window.setTimeout(stop, durationMs);
  } else {
    audio.addEventListener("ended", stop);
  }
  return stop;
}

function playToneSequence(notes, durationEach, type = "sine", gainValue = 0.2) {
  try {
    const c = getCtx();
    const master = c.createGain();
    master.gain.value = gainValue;
    master.connect(c.destination);
    let t = c.currentTime;
    notes.forEach((freq) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.02);
      g.gain.linearRampToValueAtTime(0, t + durationEach);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + durationEach + 0.05);
      t += durationEach * 0.85;
    });
  } catch (err) {
    console.warn("Tone sequence failed:", err);
  }
}

function playWinSynth() {
  playToneSequence([523.25, 659.25, 783.99, 1046.5], 0.11, "triangle", 0.18);
}

function playLoseSynth() {
  playToneSequence([220, 185], 0.22, "sine", 0.16);
}

export async function startSpinAudio(sounds, spinDurationMs) {
  if (sounds?.spin) {
    await unlockAudio();
    return playUrlSound(sounds.spin, spinDurationMs);
  }
  return () => {};
}

export function startSpinAudioAsync(sounds, spinDurationMs, onReady) {
  void (async () => {
    try {
      const stop = await startSpinAudio(sounds, spinDurationMs);
      onReady(stop);
    } catch (err) {
      console.warn("Spin audio failed:", err);
      onReady(null);
    }
  })();
}

/**
 * Per-segment reveal URL, else synthesized win/lose
 */
export async function playRevealSound(sounds, segmentIndex, isWin) {
  try {
    await unlockAudio();
    const url = sounds?.segmentReveal?.[segmentIndex];
    if (url) {
      playUrlSound(url, null);
      return;
    }
    if (isWin) playWinSynth();
    else playLoseSynth();
  } catch (err) {
    console.warn("Reveal audio failed:", err);
  }
}
