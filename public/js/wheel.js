function mod360(x) {
  return ((x % 360) + 360) % 360;
}

/**
 * HKN test wheel: clockwise from top, segments alternate lose / win / lose / …
 * (index 0 = lose, 1 = win, …)
 * @param {number} segmentIndex
 */
export function segmentIsWin(segmentIndex) {
  return segmentIndex % 2 === 1;
}

/**
 * @param {number[]} weights
 */
export function pickWeightedIndex(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/**
 * @param {number} n
 */
export function randomInt(n) {
  return Math.floor(Math.random() * n);
}

/**
 * Compute degrees to add so (accumulated + add) % 360 aligns with winner, including full spins.
 * @param {object} opts
 * @param {number} opts.accumulatedDeg
 * @param {number} opts.segmentCount
 * @param {number} opts.winnerIndex
 * @param {number} opts.offsetDeg
 * @param {number} opts.minFullRotations
 * @param {number} opts.maxFullRotations
 */
export function computeSpinDelta(opts) {
  const {
    accumulatedDeg,
    segmentCount,
    winnerIndex,
    offsetDeg = 0,
    minFullRotations,
    maxFullRotations,
  } = opts;
  const seg = 360 / segmentCount;
  const centerAngle = seg * (winnerIndex + 0.5);
  const desiredRem = mod360(360 - mod360(centerAngle + offsetDeg));

  const curRem = mod360(accumulatedDeg);
  let addMod = (desiredRem - curRem + 360) % 360;

  const spins =
    minFullRotations +
    Math.floor(Math.random() * (maxFullRotations - minFullRotations + 1));

  if (addMod < 0.0001 && spins === 0) {
    addMod = 360;
  }

  return 360 * spins + addMod;
}
