declare module "../js/wheel.js" {
  export function computeSpinDelta(opts: {
    accumulatedDeg: number;
    segmentCount: number;
    winnerIndex: number;
    offsetDeg?: number;
    minFullRotations: number;
    maxFullRotations: number;
  }): number;
}
