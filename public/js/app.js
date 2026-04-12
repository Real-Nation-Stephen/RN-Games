import { defaultConfig, configFromSearchParams } from "./config.js";
import {
  computeSpinDelta,
  pickWeightedIndex,
  randomInt,
  segmentIsWin,
} from "./wheel.js";
import { startSpinAudioAsync, playOutcomeAudio, unlockAudio } from "./audio.js";
import { burstConfetti } from "./fanfare.js";

const DESIGN_W = 1920;
const DESIGN_H = 1080;

const els = {
  app: /** @type {HTMLElement} */ (document.getElementById("app")),
  fit: /** @type {HTMLElement} */ (document.getElementById("fit")),
  stage: /** @type {HTMLElement} */ (document.getElementById("stage")),
  spinZone: /** @type {HTMLElement} */ (document.getElementById("spin-zone")),
  wheel: /** @type {HTMLElement} */ (document.getElementById("wheel-rotate")),
  gate: /** @type {HTMLElement} */ (document.getElementById("orientation-gate")),
  panelWheel: /** @type {HTMLElement} */ (document.getElementById("panel-wheel")),
  copyResultLayer: /** @type {HTMLElement} */ (document.getElementById("copy-result-layer")),
  restartLayer: /** @type {HTMLElement} */ (document.getElementById("restart-layer")),
  imgLogo: /** @type {HTMLImageElement} */ (document.getElementById("img-logo")),
  imgHeadline: /** @type {HTMLImageElement} */ (document.getElementById("img-headline")),
  imgResult: /** @type {HTMLImageElement} */ (document.getElementById("img-result")),
  imgButton: /** @type {HTMLImageElement} */ (document.getElementById("img-button")),
  imgRestart: /** @type {HTMLImageElement} */ (document.getElementById("img-restart")),
  imgWheel: /** @type {HTMLImageElement} */ (document.getElementById("img-wheel")),
  imgFrame: /** @type {HTMLImageElement} */ (document.getElementById("img-frame")),
};

/** @type {ReturnType<typeof configFromSearchParams>} */
let config = configFromSearchParams(defaultConfig);

let accumulatedRotation = 0;
let spinning = false;
/** @type {(() => void) | null} */
let stopSpinSound = null;

function applyAssets() {
  const a = config.assets;
  els.imgLogo.src = a.logo;
  els.imgHeadline.src = a.headline;
  els.imgButton.src = a.button;
  els.imgRestart.src = a.restart;
  els.imgWheel.src = a.wheel;
  els.imgFrame.src = a.frame;
  els.imgLogo.alt = "Brand logo";
  els.imgHeadline.alt = "Headline and copy";
  els.imgButton.alt = "Tap to spin";
  els.imgRestart.alt = "Play again";
  els.imgWheel.alt = "Prize wheel";
  els.imgFrame.alt = "Wheel frame";
}

/**
 * @param {number} winnerIndex
 */
function resultPanelUrl(winnerIndex) {
  const panels = config.assets.segmentPanels;
  if (Array.isArray(panels) && panels.length === config.segmentCount) {
    return panels[winnerIndex] ?? panels[0];
  }
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
  const min = config.landscape.minAspectRatio;
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
}

/**
 * @param {number} winnerIndex
 */
function showResult(winnerIndex) {
  const isWin = segmentIsWin(winnerIndex);
  els.imgResult.src = resultPanelUrl(winnerIndex);
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

  void playOutcomeAudio(config.sounds, isWin);

  els.panelWheel.classList.add("is-land");
  window.setTimeout(() => els.panelWheel.classList.remove("is-land"), 800);
}

function spin() {
  if (spinning) return;
  if (els.app.classList.contains("state-result")) return;

  void unlockAudio().catch(() => {});

  spinning = true;
  els.spinZone.classList.add("is-spinning");

  const winner = pickWinnerIndex();
  const delta = computeSpinDelta({
    accumulatedDeg: accumulatedRotation,
    segmentCount: config.segmentCount,
    winnerIndex: winner,
    offsetDeg: config.wheelRotationOffsetDeg,
    minFullRotations: config.spin.minFullRotations,
    maxFullRotations: config.spin.maxFullRotations,
  });

  accumulatedRotation += delta;

  const { durationMs, easing } = config.spin;

  /* Wheel motion must never wait on audio — a blocked AudioContext used to skip the whole completion. */
  els.wheel.style.transition = "none";
  void els.wheel.offsetWidth;
  els.wheel.style.transition = `transform ${durationMs}ms ${easing}`;
  els.wheel.style.transform = `rotate(${accumulatedRotation}deg)`;

  stopSpinSound?.();
  stopSpinSound = null;
  startSpinAudioAsync(config.sounds, durationMs, (stop) => {
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

function init() {
  config = configFromSearchParams(defaultConfig);
  applyAssets();
  layoutScale();
  updateOrientationGate();

  els.spinZone.addEventListener("click", onSpinZoneActivate);
  els.spinZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
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

init();
