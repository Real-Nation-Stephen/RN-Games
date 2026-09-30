type AnyRec = Record<string, unknown>;
let offset = 0;
let bestRtt = Infinity;
let sampledAt = 0;

/** Midpoint clock estimate; favour low latency samples and refresh periodically. */
export function observeServerTime(serverTime: unknown, sentAt: number, receivedAt = Date.now()) {
  const now = Number(serverTime);
  if (!Number.isFinite(now) || now <= 0) return;
  const rtt = receivedAt - sentAt;
  if (rtt <= bestRtt || receivedAt - sampledAt > 30_000) {
    offset = now - (sentAt + receivedAt) / 2;
    bestRtt = rtt;
    sampledAt = receivedAt;
  }
}

export function serverNow() { return Date.now() + offset; }

export function timedFillState(state: AnyRec): AnyRec {
  const a = state.activity as AnyRec;
  if (a?.kind !== "fill-game" || state.held) return state;
  let phase = a.phase;
  if (phase === "countdown" && serverNow() >= Number(a.startsAt)) phase = "racing";
  // Stop input locally at zero; only the server can declare a winner.
  if (phase === "racing" && a.endsAt && serverNow() >= Number(a.endsAt)) phase = "awaiting-result";
  return phase === a.phase ? state : { ...state, activity: { ...a, phase } };
}

export function raceClockHtml(): string {
  return '<div class="live-race-clock" role="timer" aria-label="Round timer"><span data-race-clock></span></div>';
}

export function fillResultText(activity: AnyRec): string {
  if (activity.phase !== "finished") return "";
  if (activity.tied) return "It's a draw!";
  const winner = ((activity.teams || []) as AnyRec[]).find((t) => t.id === activity.finishedTeamId);
  return winner ? `${winner.name || "Team"} wins!` : "Race finished";
}

let soundContext: AudioContext | null = null;
export async function enableRaceSound() {
  soundContext ||= new AudioContext();
  await soundContext.resume();
}
function beep(go: boolean) {
  if (!soundContext || soundContext.state !== "running") return;
  const oscillator = soundContext.createOscillator();
  const gain = soundContext.createGain();
  oscillator.frequency.value = go ? 880 : 440;
  gain.gain.setValueAtTime(0.0001, soundContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, soundContext.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, soundContext.currentTime + (go ? 0.45 : 0.16));
  oscillator.connect(gain); gain.connect(soundContext.destination);
  oscillator.start(); oscillator.stop(soundContext.currentTime + 0.5);
}

/** One clock per surface; questions are already cached when the deadline opens them. */
export function startRaceClock(root: HTMLElement, getState: () => AnyRec | null, transition: (s: AnyRec) => void, sound = false) {
  let frame = 0;
  let lastSound = "";
  let observedStart = 0;
  const tick = () => {
    const state = getState();
    const a = state?.activity as AnyRec | undefined;
    if (state && a?.kind === "fill-game") {
      const projected = timedFillState(state);
      if (projected !== state) transition(projected);
      const current = projected.activity as AnyRec;
      const now = serverNow();
      let label = "Ready when you are";
      if (current.phase === "countdown") {
        observedStart = Number(current.startsAt);
        label = now < Number(current.countdownAt) ? "Get ready…" : String(Math.max(1, Math.ceil((Number(current.startsAt) - now) / 1000)));
      } else if (current.phase === "racing") {
        const seconds = Math.max(0, Math.ceil((Number(current.endsAt) - now) / 1000));
        label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      } else if (current.phase === "held") label = "Paused";
      else if (current.phase === "finished") label = fillResultText(current);
      else if (current.phase === "awaiting-result") label = "Time's up — checking results…";
      for (const el of root.querySelectorAll<HTMLElement>("[data-race-clock]")) {
        el.textContent = label;
        el.dataset.countdownDigit = String(current.phase === "countdown" && /^[123]$/.test(label));
      }
      if (sound && !state.held) {
        const countdown = current.phase === "countdown" && now >= Number(current.countdownAt);
        const go = observedStart === Number(current.startsAt) && current.phase === "racing" && now - observedStart < 500;
        const cue = countdown ? label : go ? "go" : "";
        const key = `${state.roundAttemptId}:${current.startsAt}:${cue}`;
        if (cue && key !== lastSound) { lastSound = key; beep(go); }
      }
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
