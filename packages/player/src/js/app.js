import {
  computeSpinDelta,
  pickWeightedIndex,
  randomInt,
} from "./wheel.js";
import { startSpinAudioAsync, playRevealSound, unlockAudio } from "./audio.js";
import { burstConfetti } from "./fanfare.js";

const DESIGN_W = 1920;
const DESIGN_H = 1080;

const API_BASE = "/api";

function getWheelSlug() {
  const q = new URLSearchParams(window.location.search).get("slug");
  if (q) return q.trim();
  let path = window.location.pathname.replace(/^\/+|\/$/g, "");
  if (path.endsWith("_Report")) return "";
  return path || "";
}

const els = {
  playerError: document.getElementById("player-error"),
  playerErrorMsg: document.getElementById("player-error-msg"),
  app: document.getElementById("app"),
  fit: document.getElementById("fit"),
  stage: document.getElementById("stage"),
  spinZone: document.getElementById("spin-zone"),
  wheel: document.getElementById("wheel-rotate"),
  gate: document.getElementById("orientation-gate"),
  panelWheel: document.getElementById("panel-wheel"),
  copyResultLayer: document.getElementById("copy-result-layer"),
  restartLayer: document.getElementById("restart-layer"),
  imgLogo: document.getElementById("img-logo"),
  imgHeadline: document.getElementById("img-headline"),
  imgResult: document.getElementById("img-result"),
  imgButton: document.getElementById("img-button"),
  imgRestart: document.getElementById("img-restart"),
  imgWheel: document.getElementById("img-wheel"),
  imgFrame: document.getElementById("img-frame"),
  bgMusic: document.getElementById("bg-music"),
  fsBtn: document.getElementById("wheel-fs-btn"),
};

/** @type {any} */
let config = null;
let wheelSlug = "";

let accumulatedRotation = 0;
let spinning = false;
/** @type {(() => void) | null} */
let stopSpinSound = null;

function applyPageBackground(url) {
  if (url) {
    document.documentElement.style.setProperty("--page-bg-image", `url('${url}')`);
  } else {
    document.documentElement.style.setProperty("--page-bg-image", "none");
  }
}

function setImgSrc(el, url) {
  if (!url) {
    el.removeAttribute("src");
    return;
  }
  el.crossOrigin = "anonymous";
  el.src = url;
}

function applyAssets() {
  const a = config.assets;
  setImgSrc(els.imgLogo, a.logo);
  setImgSrc(els.imgHeadline, a.headline);
  setImgSrc(els.imgButton, a.button);
  setImgSrc(els.imgRestart, a.restart);
  setImgSrc(els.imgWheel, a.wheel);
  setImgSrc(els.imgFrame, a.frame);
  els.imgLogo.alt = "Brand logo";
  els.imgHeadline.alt = "Headline and copy";
  els.imgButton.alt = "Tap to spin";
  els.imgRestart.alt = "Play again";
  els.imgWheel.alt = "Prize wheel";
  els.imgFrame.alt = "Wheel frame";
  applyPageBackground(a.background || "");
}

function segmentIsWin(segmentIndex) {
  const o = config.segmentOutcome?.[segmentIndex];
  return o === true;
}

function resultPanelUrl(winnerIndex) {
  const panels = config.assets.segmentPanels;
  if (Array.isArray(panels) && panels.length === config.segmentCount) {
    const u = panels[winnerIndex];
    if (u) return u;
  }
  const legacy = config.assets.segmentHeadlines;
  if (Array.isArray(legacy) && legacy[winnerIndex]) return legacy[winnerIndex];
  return segmentIsWin(winnerIndex)
    ? config.assets.winPanel
    : config.assets.losePanel;
}

function layoutScale() {
  const pad = 24;
  const vw = window.innerWidth - pad * 2;
  const vh = window.innerHeight - pad * 2;
  const scale = Math.min(vw / DESIGN_W, vh / DESIGN_H);
  els.stage.style.transform = `scale(${scale})`;
  els.fit.style.width = `${DESIGN_W * scale}px`;
  els.fit.style.height = `${DESIGN_H * scale}px`;
}

function updateOrientationGate() {
  const ratio = window.innerWidth / window.innerHeight;
  const min = config.landscape?.minAspectRatio ?? 1.25;
  const show = ratio < min;
  els.gate.classList.toggle("is-visible", show);
  document.body.style.overflow = show ? "hidden" : "";
}

function pickWinnerIndex() {
  const n = config.segmentCount;
  if (config.useWeightedSpin && config.weights && config.weights.length === n) {
    return pickWeightedIndex(config.weights);
  }
  return randomInt(n);
}

function clearOutcomeStyling() {
  els.stage.classList.remove("stage--outcome-win", "stage--outcome-lose");
}

function resetToHeadline() {
  els.app.classList.remove("state-result");
  els.copyResultLayer.setAttribute("aria-hidden", "true");
  els.restartLayer.setAttribute("aria-hidden", "true");
  els.spinZone.setAttribute("aria-label", "Spin the wheel");
  clearOutcomeStyling();
  setImgSrc(els.imgHeadline, config.assets.headline);
}

function logSpin(winnerIndex, isWin) {
  if (!config.reportingEnabled) return;
  void fetch(`${API_BASE}/log-spin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: wheelSlug,
      segmentIndex: winnerIndex,
      prizeLabel: config.prizes[winnerIndex] ?? "",
      outcome: isWin ? "win" : "lose",
    }),
  }).catch(() => {});
}

function showResult(winnerIndex) {
  const isWin = segmentIsWin(winnerIndex);
  setImgSrc(els.imgResult, resultPanelUrl(winnerIndex));
  els.imgResult.alt = isWin ? "You won" : "Try again";

  clearOutcomeStyling();
  els.stage.classList.add(isWin ? "stage--outcome-win" : "stage--outcome-lose");

  els.app.classList.add("state-result");
  els.copyResultLayer.setAttribute("aria-hidden", "false");
  els.restartLayer.setAttribute("aria-hidden", "false");
  els.spinZone.setAttribute("aria-label", "Play again");

  if (isWin) {
    try {
      burstConfetti();
    } catch (err) {
      console.warn("Confetti failed:", err);
    }
  }

  void playRevealSound(config.sounds || {}, winnerIndex, isWin);
  logSpin(winnerIndex, isWin);

  els.panelWheel.classList.add("is-land");
  window.setTimeout(() => els.panelWheel.classList.remove("is-land"), 800);
}

function spin() {
  if (spinning) return;
  if (els.app.classList.contains("state-result")) return;

  void unlockAudio().catch(() => {});
  maybeStartMusic();

  spinning = true;
  els.spinZone.classList.add("is-spinning");

  const winner = pickWinnerIndex();
  const delta = computeSpinDelta({
    accumulatedDeg: accumulatedRotation,
    segmentCount: config.segmentCount,
    winnerIndex: winner,
    offsetDeg: config.wheelRotationOffsetDeg ?? 0,
    minFullRotations: config.spin.minFullRotations,
    maxFullRotations: config.spin.maxFullRotations,
  });

  accumulatedRotation += delta;

  const { durationMs, easing } = config.spin;

  els.wheel.style.transition = "none";
  void els.wheel.offsetWidth;
  els.wheel.style.transition = `transform ${durationMs}ms ${easing}`;
  els.wheel.style.transform = `rotate(${accumulatedRotation}deg)`;

  stopSpinSound?.();
  stopSpinSound = null;
  startSpinAudioAsync(config.sounds || {}, durationMs, (stop) => {
    stopSpinSound = stop;
  });

  window.setTimeout(() => {
    spinning = false;
    els.spinZone.classList.remove("is-spinning");
    stopSpinSound?.();
    stopSpinSound = null;
    try {
      showResult(winner);
    } catch (err) {
      console.error("showResult failed:", err);
    }
  }, durationMs + 80);
}

function onSpinZoneActivate() {
  if (els.app.classList.contains("state-result")) {
    resetToHeadline();
  } else {
    spin();
  }
}

let musicStarted = false;
function maybeStartMusic() {
  const url = config.sounds?.music;
  const el = els.bgMusic;
  if (!url || !el || musicStarted) return;
  el.src = url;
  el.volume = Math.min(1, Math.max(0, config.sounds.musicVolume ?? 0.35));
  musicStarted = true;
  void el.play().catch(() => {});
}

function wireUi() {
  els.spinZone.addEventListener("click", () => {
    maybeStartMusic();
    onSpinZoneActivate();
  });
  els.spinZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      maybeStartMusic();
      onSpinZoneActivate();
    }
  });

  window.addEventListener("resize", () => {
    layoutScale();
    updateOrientationGate();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.app.classList.contains("state-result")) {
      resetToHeadline();
    }
  });
}

function showError(msg) {
  els.playerError.hidden = false;
  els.playerErrorMsg.textContent = msg;
  els.app.hidden = true;
  if (els.fsBtn) els.fsBtn.hidden = true;
}

function applyFaviconAndTitle() {
  const url = config.faviconUrl;
  let link = document.querySelector('link[rel="icon"]');
  if (url) {
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = url;
  } else if (link) {
    link.remove();
  }
  if (config.title) {
    document.title = config.title;
  }
}

let fullscreenWired = false;
function wireFullscreenIfNeeded() {
  const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";
  if (isPreview || !els.fsBtn) return;
  els.fsBtn.hidden = false;
  if (fullscreenWired) return;
  fullscreenWired = true;
  els.fsBtn.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* ignore */
    }
  });
  document.addEventListener("fullscreenchange", () => {
    const fs = !!document.fullscreenElement;
    els.fsBtn.setAttribute("aria-pressed", fs ? "true" : "false");
    els.fsBtn.textContent = fs ? "Exit fullscreen" : "Fullscreen";
  });
}

function applyLoadedConfig() {
  if (config.sounds?.segmentReveal && config.sounds.segmentReveal.length < config.segmentCount) {
    config.sounds.segmentReveal = Array.from(
      { length: config.segmentCount },
      (_, i) => config.sounds.segmentReveal[i] ?? null,
    );
  }
  els.app.hidden = false;
  els.playerError.hidden = true;
  applyAssets();
  applyFaviconAndTitle();
  layoutScale();
  updateOrientationGate();
  wireUi();
  wireFullscreenIfNeeded();
}

function setupPreviewMode() {
  els.playerError.hidden = true;
  els.app.hidden = true;
  if (els.fsBtn) els.fsBtn.hidden = true;
  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    if (e.data?.type !== "rngames-wheel-config") return;
    config = e.data.config;
    if (!config) return;
    applyLoadedConfig();
  });
}

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") === "1") {
    setupPreviewMode();
    return;
  }

  wheelSlug = getWheelSlug();
  if (!wheelSlug) {
    showError("Missing wheel address. Open a valid wheel URL.");
    return;
  }

  const res = await fetch(
    `${API_BASE}/public-wheel?slug=${encodeURIComponent(wheelSlug)}`,
  );
  if (!res.ok) {
    showError(res.status === 404 ? "Wheel not found." : "Could not load wheel.");
    return;
  }

  config = await res.json();
  applyLoadedConfig();
}

bootstrap();
