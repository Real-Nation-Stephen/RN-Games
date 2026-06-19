const DEADZONE = 0.4;

/** -1 = left, +1 = right, 0 = neutral */
export function pollHorizontalInput(): number {
  let x = 0;

  const pads = navigator.getGamepads?.() || [];
  for (const pad of pads) {
    if (!pad) continue;
    const axisX = pad.axes[0] ?? 0;
    if (Math.abs(axisX) >= DEADZONE) {
      x = axisX < 0 ? -1 : 1;
      break;
    }
  }

  if (x === 0) {
    if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) x = -1;
    else if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) x = 1;
  }

  return x;
}

const keys = new Set<string>();

export function bindCatchKeyboard() {
  const onDown = (e: KeyboardEvent) => keys.add(e.key);
  const onUp = (e: KeyboardEvent) => keys.delete(e.key);
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  return () => {
    window.removeEventListener("keydown", onDown);
    window.removeEventListener("keyup", onUp);
  };
}
