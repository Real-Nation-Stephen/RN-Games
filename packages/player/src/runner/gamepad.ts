const BTN_A = 0;
const BTN_B = 1;
const BTN_START = 9;
const BTN_SELECT = 8;
const DPAD_BUTTONS = [12, 13, 14, 15];
const JUMP_EXCLUDE = new Set([BTN_START, BTN_SELECT]);

export type RunnerMenuAction = "advance" | "start" | "replay";
export type RunnerMenuDirection = "up" | "down" | "left" | "right";

const keys = new Set<string>();
const prevMenuButtons = new Set<number>();
const prevJumpButtons = new Set<number>();
const prevMenuDirections = new Set<RunnerMenuDirection>();
let prevJumpKeys = false;
let prevDpadActive = false;

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

function edgeButton(pressed: Set<number>, prev: Set<number>, index: number) {
  return pressed.has(index) && !prev.has(index);
}

function dpadActive() {
  const pads = navigator.getGamepads?.() || [];
  for (const pad of pads) {
    if (!pad) continue;
    for (const i of DPAD_BUTTONS) {
      if (buttonDown(pad, i)) return true;
    }
    const hat = pad.axes[9];
    if (hat !== undefined && Math.abs(hat) > 0.1) return true;
  }
  if (
    keys.has("ArrowUp") ||
    keys.has("ArrowDown") ||
    keys.has("ArrowLeft") ||
    keys.has("ArrowRight")
  ) {
    return true;
  }
  return false;
}

function collectPressedDirections(): Set<RunnerMenuDirection> {
  const pressed = new Set<RunnerMenuDirection>();
  const pads = navigator.getGamepads?.() || [];
  for (const pad of pads) {
    if (!pad) continue;
    if (buttonDown(pad, 12) || pad.axes[1] < -0.5) pressed.add("up");
    if (buttonDown(pad, 13) || pad.axes[1] > 0.5) pressed.add("down");
    if (buttonDown(pad, 14) || pad.axes[0] < -0.5) pressed.add("left");
    if (buttonDown(pad, 15) || pad.axes[0] > 0.5) pressed.add("right");
  }
  if (keys.has("ArrowUp")) pressed.add("up");
  if (keys.has("ArrowDown")) pressed.add("down");
  if (keys.has("ArrowLeft")) pressed.add("left");
  if (keys.has("ArrowRight")) pressed.add("right");
  return pressed;
}

export function pollJumpInput(): boolean {
  const pressed = collectPressedButtons();
  const keyJump =
    (keys.has(" ") ||
      keys.has("ArrowUp") ||
      keys.has("ArrowDown") ||
      keys.has("ArrowLeft") ||
      keys.has("ArrowRight")) &&
    !prevJumpKeys;
  prevJumpKeys =
    keys.has(" ") ||
    keys.has("ArrowUp") ||
    keys.has("ArrowDown") ||
    keys.has("ArrowLeft") ||
    keys.has("ArrowRight");

  let padJump = false;
  for (const i of pressed) {
    if (!JUMP_EXCLUDE.has(i) && !prevJumpButtons.has(i)) {
      padJump = true;
      break;
    }
  }
  const dpad = dpadActive();
  const dpadEdge = dpad && !prevDpadActive;
  prevDpadActive = dpad;
  prevJumpButtons.clear();
  for (const i of pressed) prevJumpButtons.add(i);
  return padJump || dpadEdge || keyJump;
}

export function pollMenuAction(): RunnerMenuAction | null {
  const pressed = collectPressedButtons();
  let action: RunnerMenuAction | null = null;
  if (edgeButton(pressed, prevMenuButtons, BTN_START) || edgeButton(pressed, prevMenuButtons, BTN_SELECT)) {
    action = "start";
  } else if (edgeButton(pressed, prevMenuButtons, BTN_B)) {
    action = "replay";
  } else if (edgeButton(pressed, prevMenuButtons, BTN_A)) {
    action = "advance";
  }
  prevMenuButtons.clear();
  for (const i of pressed) prevMenuButtons.add(i);
  return action;
}

export function pollMenuDirection(): RunnerMenuDirection | null {
  const pressed = collectPressedDirections();
  let direction: RunnerMenuDirection | null = null;
  for (const candidate of ["up", "down", "left", "right"] as const) {
    if (pressed.has(candidate) && !prevMenuDirections.has(candidate)) {
      direction = candidate;
      break;
    }
  }
  prevMenuDirections.clear();
  for (const value of pressed) prevMenuDirections.add(value);
  return direction;
}

export function bindRunnerKeyboard() {
  const onDown = (e: KeyboardEvent) => keys.add(e.key);
  const onUp = (e: KeyboardEvent) => keys.delete(e.key);
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  return () => {
    window.removeEventListener("keydown", onDown);
    window.removeEventListener("keyup", onUp);
  };
}
