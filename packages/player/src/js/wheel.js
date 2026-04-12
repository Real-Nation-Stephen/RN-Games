function mod360(x) {
  return ((x % 360) + 360) % 360;
}

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

export function randomInt(n) {
  return Math.floor(Math.random() * n);
}

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
