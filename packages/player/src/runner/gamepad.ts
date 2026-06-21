const BTN_A = 0;
const BTN_B = 1;
const BTN_START = 9;
const BTN_SELECT = 8;

export type RunnerMenuAction = "advance" | "start" | "replay";

const keys = new Set<string>();
const prevButtons = new Set<number>();
let prevJumpKeys = false;

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

export function pollJumpInput(): boolean {
  const pressed = collectPressedButtons();
  const keyJump = (keys.has(" ") || keys.has("ArrowUp")) && !prevJumpKeys;
  prevJumpKeys = keys.has(" ") || keys.has("ArrowUp");
  const padJump = edgeButton(pressed, BTN_A);
  prevButtons.clear();
  for (const i of pressed) prevButtons.add(i);
  return padJump || keyJump;
}

export function pollMenuAction(): RunnerMenuAction | null {
  const pressed = collectPressedButtons();
  let action: RunnerMenuAction | null = null;
  if (edgeButton(pressed, BTN_START) || edgeButton(pressed, BTN_SELECT)) action = "start";
  else if (edgeButton(pressed, BTN_B)) action = "replay";
  else if (edgeButton(pressed, BTN_A)) action = "advance";
  prevButtons.clear();
  for (const i of pressed) prevButtons.add(i);
  return action;
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
