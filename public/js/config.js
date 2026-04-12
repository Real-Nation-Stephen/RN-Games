/**
 * Wheel / layout configuration — later this can be loaded from a CMS or JSON per deployment.
 * @typedef {Object} WheelConfig
 * @property {number} segmentCount
 * @property {string[]} prizes — labels per segment (analytics / future use)
 * @property {number[]|null} weights
 * @property {number} wheelRotationOffsetDeg
 * @property {boolean} useWeightedSpin
 * @property {Object} assets
 * @property {string|null} assets.segmentPanels — optional: one image URL per segment (overrides win/lose art)
 * @property {{ spin?: string | null; win?: string | null; lose?: string | null }} sounds — spin null = silent during spin; win/lose null = synthesized
 */

export const defaultConfig = {
  segmentCount: 12,
  prizes: [
    "Try again",
    "You win!",
    "Try again",
    "You win!",
    "Try again",
    "You win!",
    "Try again",
    "You win!",
    "Try again",
    "You win!",
    "Try again",
    "You win!",
  ],
  weights: null,
  wheelRotationOffsetDeg: 0,
  useWeightedSpin: false,
  assets: {
    logo: "assets/hkn/logo-panel-hkn.png",
    headline: "assets/hkn/headline-copy-hkn.png",
    button: "assets/hkn/button-hkn.png",
    wheel: "assets/hkn/wheel-12-hkn.png",
    frame: "assets/hkn/wheel-frame-hkn.png",
    winPanel: "assets/hkn/win-panel-hkn.png",
    losePanel: "assets/hkn/lose-panel-hkn.png",
    restart: "assets/hkn/restart-button-hkn.png",
    segmentPanels: null,
  },
  sounds: {
    spin: null,
    win: null,
    lose: null,
  },
  spin: {
    minFullRotations: 5,
    maxFullRotations: 8,
    durationMs: 4500,
    easing: "cubic-bezier(0.15, 0.85, 0.2, 1)",
  },
  landscape: {
    minAspectRatio: 1.25,
  },
};

/**
 * @param {WheelConfig} base
 * @returns {WheelConfig}
 */
export function configFromSearchParams(base) {
  const params = new URLSearchParams(window.location.search);
  const merged = structuredClone(base);

  const seg = params.get("segments");
  if (seg) {
    const n = parseInt(seg, 10);
    if (n >= 2 && n <= 64) {
      merged.segmentCount = n;
      merged.prizes = Array.from({ length: n }, (_, i) =>
        i % 2 === 1 ? "You win!" : "Try again",
      );
    }
  }

  if (params.get("weighted") === "1") {
    merged.useWeightedSpin = true;
    merged.weights = merged.prizes.map((_, i) => (i === 0 ? 10 : 1));
  }

  if (params.get("debug") === "1") {
    document.body.classList.add("is-debug");
  }

  return merged;
}
