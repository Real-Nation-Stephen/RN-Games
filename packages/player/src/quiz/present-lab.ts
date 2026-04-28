import { byId, showApp, showError } from "./lib";
import { layoutStage } from "./layout";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function renderButtons(root: HTMLElement, labels: string[], variant: "grid" | "row") {
  root.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = variant === "row" ? "quiz-present-answers quiz-present-answers--row" : "quiz-present-answers";
  labels.forEach((t) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "quiz-present-answer";
    b.textContent = t;
    b.disabled = true;
    wrap.appendChild(b);
  });
  root.appendChild(wrap);
}

function renderSlider(root: HTMLElement) {
  root.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "quiz-present-slider";
  const r = document.createElement("input");
  r.type = "range";
  r.min = "0";
  r.max = "100";
  r.value = "50";
  r.disabled = true;
  wrap.appendChild(r);
  root.appendChild(wrap);
}

function setMedia(kind: "image" | "music" | "none") {
  const media = byId("lab-media");
  media.innerHTML = "";
  if (kind === "none") {
    media.innerHTML = `<div class="quiz-present-media__placeholder" style="opacity:0.35">NO MEDIA</div>`;
    return;
  }
  if (kind === "image") {
    media.innerHTML = `<div class="quiz-present-media__placeholder">IMAGE</div>`;
    return;
  }
  media.innerHTML = `<div class="quiz-present-media__placeholder">MUSIC</div>`;
}

function setLayout(layout: "split" | "full") {
  const stage = byId("stage");
  stage.dataset.presentLayout = layout;
}

async function main() {
  try {
    const stage = byId("stage");
    const fit = byId("fit");
    layoutStage(stage, fit, 1920, 1080);
    window.addEventListener("resize", () => layoutStage(stage, fit, 1920, 1080));

    const title = byId("lab-title");
    const kind = byId("lab-kind");
    const input = byId("lab-input");

    const ctlLayout = byId<HTMLSelectElement>("ctl-layout");
    const ctlInput = byId<HTMLSelectElement>("ctl-input");
    const ctlMedia = byId<HTMLSelectElement>("ctl-media");
    const ctlRandom = byId<HTMLButtonElement>("ctl-random");

    const questions = [
      "Question text goes in this box here",
      "Which of these best describes your ideal weekend?",
      "Pick the closest answer",
      "How many years old is this song?",
      "Drag the slider to the correct value",
    ];

    const rerender = () => {
      kind.textContent = `Question ${pick([1, 2, 3, 4])} / ${pick([10, 12, 20])}`;
      title.textContent = title.textContent || pick(questions);

      const layout = (ctlLayout.value as "split" | "full") || "split";
      setLayout(layout);

      const media = (ctlMedia.value as "image" | "music" | "none") || "image";
      setMedia(media);

      const inputMode = ctlInput.value;
      if (inputMode === "slider") renderSlider(input);
      else if (inputMode === "buttons5") renderButtons(input, ["Answer", "Answer", "Answer", "Answer", "Answer"], "row");
      else renderButtons(input, ["Answer", "Answer", "Answer", "Answer"], "grid");
    };

    ctlLayout.addEventListener("change", rerender);
    ctlInput.addEventListener("change", rerender);
    ctlMedia.addEventListener("change", rerender);
    ctlRandom.addEventListener("click", () => {
      title.textContent = pick(questions);
      rerender();
    });

    // initial
    title.textContent = pick(questions);
    rerender();
    showApp();
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed");
  }
}

void main();

