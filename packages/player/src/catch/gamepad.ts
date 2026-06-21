const DEADZONE = 0.4;

const BTN_A = 0;
const BTN_B = 1;
const BTN_START = 9;
const BTN_SELECT = 8;

export type CatchMenuAction = "advance" | "start" | "replay";

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
const prevButtons = new Set<number>();

function buttonDown(pad: Gamepad, index: number) {
  const btn = pad.buttons[index];
  return !!btn && (btn.pressed || btn.value > 0.5);
}

function collectPressedButtons(): Set<number> {
  const pressed = new Set<number>();
  const pads = navigator.getGamepads?.() || [];
  for (const pad of pads) {
    if (!pad) continue;
    for (let i = 0; i < pad.buttons.length; i++) {
      if (buttonDown(pad, i)) pressed.add(i);
    }
  }
  if (keys.has("Enter") || keys.has(" ")) pressed.add(BTN_A);
  if (keys.has("b") || keys.has("B")) pressed.add(BTN_B);
  if (keys.has("s") || keys.has("S")) {
    pressed.add(BTN_START);
    pressed.add(BTN_SELECT);
  }
  return pressed;
}

function edgeButton(pressed: Set<number>, index: number) {
  return pressed.has(index) && !prevButtons.has(index);
}

/** A = advance, Start = begin round, B = play again. Returns once per press. */
export function pollMenuAction(): CatchMenuAction | null {
  const pressed = collectPressedButtons();
  let action: CatchMenuAction | null = null;

  if (edgeButton(pressed, BTN_START) || edgeButton(pressed, BTN_SELECT)) {
    action = "start";
  } else if (edgeButton(pressed, BTN_B)) {
    action = "replay";
  } else if (edgeButton(pressed, BTN_A)) {
    action = "advance";
  }

  prevButtons.clear();
  for (const i of pressed) prevButtons.add(i);
  return action;
}

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
