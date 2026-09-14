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
} from "./render";
import { drawLiveWheel } from "./wheel-draw";

type AnyRec = Record<string, unknown>;

const seenFillEvents = new Set<string>();
let wheelRaf = 0;
let audioUnlocked = false;

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
    const ctx = new AudioContext();
    await ctx.resume();
  } catch {
    /* ignore */
  }
  try {
    await document.documentElement.requestFullscreen?.();
  } catch {
    /* ignore */
  }
}

function mountActivity(root: HTMLElement, state: AnyRec) {
  const activity = (state.activity || {}) as AnyRec;
  const kind = String(activity.kind || "lobby");
  root.replaceChildren();
  if (kind === "lobby") root.appendChild(renderLobby(state, true));
  else if (kind === "closing") root.appendChild(renderClosing(state));
  else if (kind === "mini-poll") root.appendChild(renderPollPresenter(state));
  else if (kind === "fill-game") root.appendChild(renderFillPresenter(state, seenFillEvents));
  else if (kind === "mini-quiz") root.appendChild(renderQuizPresenter(state));
  else if (kind === "pinboard") root.appendChild(renderPinboardPresenter(state));
  else if (kind === "scratcher") root.appendChild(renderScratcherPresenter(state));
  else if (kind === "spinning-wheel") {
    const wrap = document.createElement("div");
    wrap.className = "live-stage-inner";
    wrap.innerHTML = `<p class="live-kicker">Live draw</p><p class="live-pointer-readout" id="wheel-readout">—</p><div class="live-wheel-wrap"><canvas id="live-wheel"></canvas></div>`;
    root.appendChild(wrap);
    const canvas = wrap.querySelector("canvas") as HTMLCanvasElement;
    const readout = wrap.querySelector("#wheel-readout") as HTMLElement;
    const wheel = activity as {
      pool: number[];
      winnerNumber: number | null;
      spinStartedAt: number | null;
      durationMs: number;
      pointerOffsetDeg: number;
      phase: string;
    };
    const tick = () => {
      const { number } = drawLiveWheel(canvas, wheel);
      readout.textContent = number != null ? String(number).padStart(3, "0") : "—";
      if (wheel.phase === "spinning") wheelRaf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(wheelRaf);
    tick();
  } else root.appendChild(renderUnsupported(state));
}

async function main() {
  const app = document.getElementById("app");
  const err = document.getElementById("err");
  if (!app) return;
  app.addEventListener("click", () => void unlockAudio(), { once: true });
  let code = getCodeFromPath();
  const slug = getSlug();

  if (!code && slug) {
    const res = await fetch(`/api/live-run?slug=${encodeURIComponent(slug)}&role=public`);
    if (res.ok) {
      const data = await res.json();
      code = String(data.state?.code || "");
    }
  }

  const inner = document.getElementById("live-main") as HTMLElement;
  const dock = document.getElementById("live-dock") as HTMLElement;
  const status = document.getElementById("live-status") as HTMLElement;

  if (!code) {
    if (err) {
      err.hidden = false;
      err.textContent = "No active live run. Open Flow Master and start a run.";
    }
    return;
  }
  app.hidden = false;

  startLivePoll({
    code: () => code,
    role: "public",
    onState(state) {
      applyJoinTheme(
        state.joinScreen as Record<string, string>,
        ((state.component as AnyRec) || {}).branding as Record<string, string>,
        { surface: "presenter" },
      );
      mountActivity(inner, state);
      const kind = String((state.activity as AnyRec)?.kind || "lobby");
      const featured = kind === "lobby";
      const innerDock = inner.querySelector("[data-dock='featured']") as HTMLElement | null;
      if (innerDock) {
        void renderJoinDock(innerDock, { code, joinUrl: shortJoinUrl(code), featured: true });
      }
      dock.style.display = featured ? "none" : "flex";
      if (!featured) void renderJoinDock(dock, { code, joinUrl: shortJoinUrl(code), featured: false });
      status.textContent = `${state.connectedCount || 0} connected · ${state.code}`;
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
