import { liveJson } from "./api";
import { enableRaceSound, startRaceClock, timedFillState } from "./race-clock";
import { startLivePoll } from "./poll";
import { applyJoinTheme } from "./theme";
import { renderJoinDock, shortJoinUrl } from "./join-dock";
import {
  renderClosing,
  renderFillPresenter,
  renderLobby,
  renderPinboardPresenter,
  renderPollPresenter,
  renderQuizPresenter,
  renderScratcherPresenter,
  renderUnsupported,
  renderWheelPresenter,
} from "./render";
import { activityOf, connectedLabel, entranceIdentity, fillPresenterHead } from "./frame";
import { drawLiveWheel } from "./wheel-draw";

type AnyRec = Record<string, unknown>;

const seenFillEvents = new Set<string>();
let wheelRaf = 0;
let wheelResize: ResizeObserver | null = null;
let audioUnlocked = false;
let lastEntrance = "";
let lastPresenterState: AnyRec | null = null;
let enterTimer = 0;

function qs(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

function pathParts() {
  return window.location.pathname.split("/").filter(Boolean);
}

function getSlug(): string {
  const q = qs().get("slug");
  if (q) return q;
  const p = pathParts();
  return p[0] === "x" && p[1] ? p[1] : "";
}

function getCodeFromPath(): string {
  const q = (qs().get("code") || "").toUpperCase();
  if (q) return q;
  const p = pathParts();
  if (p[0] === "x" && p[2] === "present" && p[3]) return p[3].toUpperCase();
  return "";
}

async function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    await enableRaceSound();
  } catch {
    /* ignore */
  }
  try {
    await document.documentElement.requestFullscreen?.();
  } catch {
    /* ignore */
  }
}

function cancelPresenterWheel() {
  cancelAnimationFrame(wheelRaf);
  wheelRaf = 0;
  wheelResize?.disconnect();
  wheelResize = null;
}

function startPresenterWheel(root: HTMLElement) {
  cancelAnimationFrame(wheelRaf);
  const tick = () => {
    const current = lastPresenterState;
    if (!current) return;
    const wheel = activityOf(current);
    const canvas = root.querySelector("#live-wheel") as HTMLCanvasElement | null;
    const readout = root.querySelector("#wheel-readout") as HTMLElement | null;
    if (!canvas || String(wheel.phase) !== "spinning") {
      wheelRaf = 0;
      return;
    }
    const { number } = drawLiveWheel(canvas, wheel as never);
    if (readout) readout.textContent = number != null ? String(number).padStart(3, "0") : "—";
    wheelRaf = requestAnimationFrame(tick);
  };
  tick();
}

function snapshotFillHeights(root: HTMLElement): Record<string, string> {
  const prev: Record<string, string> = {};
  root.querySelectorAll<HTMLElement>("[data-team]").forEach((el) => {
    const fill = el.querySelector(".live-meter-fill") as HTMLElement | null;
    if (el.dataset.team && fill) prev[el.dataset.team] = fill.style.height;
  });
  return prev;
}

function animateFillMeters(root: HTMLElement, prev: Record<string, string>, fromZero: boolean) {
  root.querySelectorAll<HTMLElement>("[data-team]").forEach((el) => {
    const fill = el.querySelector(".live-meter-fill") as HTMLElement | null;
    if (!fill) return;
    const next = fill.style.height || "0%";
    const from = fromZero ? "0%" : prev[el.dataset.team || ""] || next;
    if (from === next) {
      fill.style.transition = "none";
      fill.style.height = next;
      return;
    }
    fill.style.transition = "none";
    fill.style.height = from;
    void fill.offsetHeight;
    fill.style.transition = "";
    fill.style.height = next;
  });
}

function mountActivity(root: HTMLElement, state: AnyRec) {
  state = timedFillState(state);
  const activity = activityOf(state);
  const kind = String(activity.kind || "lobby");
  const scene = entranceIdentity(state);
  const enter = scene !== lastEntrance;
  if (
    !enter &&
    kind === "spinning-wheel" &&
    String(activity.phase) === "spinning" &&
    root.querySelector("#live-wheel")
  ) {
    lastPresenterState = state;
    lastEntrance = scene;
    if (!wheelRaf) startPresenterWheel(root);
    return;
  }
  const prevFill = kind === "fill-game" ? snapshotFillHeights(root) : {};
  lastPresenterState = state;
  lastEntrance = scene;
  cancelPresenterWheel();
  root.replaceChildren();
  root.classList.remove("live-enter");
  if (kind === "lobby") root.appendChild(renderLobby(state, true));
  else if (kind === "closing") root.appendChild(renderClosing(state));
  else if (kind === "mini-poll") root.appendChild(renderPollPresenter(state));
  else if (kind === "fill-game") root.appendChild(renderFillPresenter(state, seenFillEvents));
  else if (kind === "mini-quiz") root.appendChild(renderQuizPresenter(state));
  else if (kind === "pinboard") root.appendChild(renderPinboardPresenter(state));
  else if (kind === "scratcher") root.appendChild(renderScratcherPresenter(state));
  else if (kind === "spinning-wheel") {
    root.appendChild(renderWheelPresenter(state));
    const canvas = root.querySelector("#live-wheel") as HTMLCanvasElement | null;
    if (canvas) {
      const redraw = () => {
        if (canvas.isConnected) drawLiveWheel(canvas, activityOf(lastPresenterState || state) as never);
      };
      redraw();
      // A resize or a late font must not leave a stretched / stale bitmap.
      wheelResize = new ResizeObserver(redraw);
      wheelResize.observe(canvas);
      void document.fonts.ready.then(redraw);
    }
    if (String(activity.phase) === "spinning") startPresenterWheel(root);
  } else root.appendChild(renderUnsupported(state));
  if (kind === "fill-game") animateFillMeters(root, prevFill, enter);
  if (enter) {
    void root.offsetWidth;
    root.classList.add("live-enter");
    window.clearTimeout(enterTimer);
    enterTimer = window.setTimeout(() => root.classList.remove("live-enter"), 950);
  }
}

async function main() {
  const app = document.getElementById("app");
  const err = document.getElementById("err");
  if (!app) return;
  app.addEventListener("click", () => void unlockAudio(), { once: true });
  let code = getCodeFromPath();
  const slug = getSlug();

  if (!code && slug) {
    const data = await liveJson(`/api/live-run?slug=${encodeURIComponent(slug)}&role=public`);
    code = String((data.state as AnyRec)?.code || "");
  }

  const inner = document.getElementById("live-main") as HTMLElement;
  const dock = document.getElementById("live-dock") as HTMLElement;
  const status = document.getElementById("live-status") as HTMLElement;
  const head = document.getElementById("live-head") as HTMLElement;

  if (!code) {
    if (err) {
      err.hidden = false;
      err.textContent = "No active live run. Open Flow Master and start a run.";
    }
    return;
  }
  app.hidden = false;

  const stopClock = startRaceClock(inner, () => lastPresenterState, (state) => mountActivity(inner, state), true);
  window.addEventListener("pagehide", stopClock, { once: true });
  startLivePoll({
    code: () => code,
    role: "public",
    onState(state) {
      applyJoinTheme(state.joinScreen as Record<string, unknown>, undefined, {
        surface: "presenter",
        component: ((state.component as AnyRec) || {}) as Record<string, unknown>,
      });
      fillPresenterHead(head, state);
      mountActivity(inner, state);
      if (status) status.textContent = connectedLabel(state);
      void renderJoinDock(dock, { code, joinUrl: shortJoinUrl(code) });
    },
  });
}

void main().catch((e) => {
  const err = document.getElementById("err");
  if (err) {
    err.hidden = false;
    err.textContent = e instanceof Error ? e.message : "Failed to load presenter";
  }
});
