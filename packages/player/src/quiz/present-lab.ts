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

function renderSliderDiscrete(root: HTMLElement) {
  root.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "quiz-present-slider";
  const r = document.createElement("input");
  r.type = "range";
  r.min = "0";
  r.max = "6";
  r.step = "1";
  r.value = "3";
  r.disabled = true;
  wrap.appendChild(r);

  const ticks = document.createElement("div");
  ticks.className = "quiz-present-slider-ticks";
  for (let i = 0; i <= 6; i++) {
    const t = document.createElement("div");
    t.className = "quiz-present-slider-tick";
    t.innerHTML = `<span class="quiz-present-slider-notch"></span><span class="quiz-present-slider-label">${i}</span>`;
    ticks.appendChild(t);
  }
  wrap.appendChild(ticks);
  root.appendChild(wrap);
}

function setMedia(kind: "image" | "music" | "none") {
  const media = byId("lab-media");
  media.innerHTML = "";
  if (kind === "none") {
    media.innerHTML = `<div class="quiz-present-media__placeholder" style="opacity:0.35">NO MEDIA</div>`;
    return;
  }
  media.innerHTML = `<div class="quiz-present-media__placeholder">${kind === "music" ? "MUSIC" : "IMAGE"}</div>`;
}

function setLayout(layout: "split" | "full") {
  const stage = byId("stage");
  stage.dataset.presentLayout = layout;
}

function setAlign(v: "top" | "middle", h: "left" | "center") {
  const stage = byId("stage");
  stage.dataset.presentValign = v;
  stage.dataset.presentHalign = h;
}

function applyBranding(bgUrl: string, bannerUrl: string, mediaUrl: string) {
  const root = document.documentElement.style;
  if (bgUrl) root.setProperty("--quiz-present-bg-image", `url('${bgUrl}')`);
  else root.removeProperty("--quiz-present-bg-image");
  if (bannerUrl) {
    root.setProperty("--quiz-present-banner-image", `url('${bannerUrl}')`);
    root.setProperty("--quiz-present-banner-h", "120px");
  } else {
    root.removeProperty("--quiz-present-banner-image");
    root.removeProperty("--quiz-present-banner-h");
  }
  root.setProperty("--quiz-btn-bg", "#8cc440");
  root.setProperty("--quiz-btn-text", "#ffffff");

  const media = byId("lab-media");
  if (mediaUrl) {
    media.innerHTML = "";
    const img = document.createElement("img");
    img.src = mediaUrl;
    img.alt = "";
    img.style.width = "min(520px, 100%)";
    img.style.aspectRatio = "1 / 1";
    img.style.display = "block";
    img.style.borderRadius = "10px";
    img.style.objectFit = "cover";
    media.appendChild(img);
  }
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
    const ctlVAlign = byId<HTMLSelectElement>("ctl-valign");
    const ctlHAlign = byId<HTMLSelectElement>("ctl-halign");
    const ctlRandom = byId<HTMLButtonElement>("ctl-random");
    const ctlBg = byId<HTMLInputElement>("ctl-bg");
    const ctlBanner = byId<HTMLInputElement>("ctl-banner");
    const ctlMediaUrl = byId<HTMLInputElement>("ctl-media-url");
    const ctlApplyBrand = byId<HTMLButtonElement>("ctl-apply-brand");

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

      const v = (ctlVAlign.value as "top" | "middle") || "top";
      const h = (ctlHAlign.value as "left" | "center") || "left";
      setAlign(v, h);

      const inputMode = ctlInput.value;
      if (inputMode === "sliderContinuous") renderSlider(input);
      else if (inputMode === "sliderDiscrete") renderSliderDiscrete(input);
      else if (inputMode === "buttons5") renderButtons(input, ["Answer", "Answer", "Answer", "Answer", "Answer"], "row");
      else renderButtons(input, ["Answer", "Answer", "Answer", "Answer"], "grid");
    };

    ctlLayout.addEventListener("change", rerender);
    ctlInput.addEventListener("change", rerender);
    ctlMedia.addEventListener("change", rerender);
    ctlVAlign.addEventListener("change", rerender);
    ctlHAlign.addEventListener("change", rerender);
    ctlRandom.addEventListener("click", () => {
      title.textContent = pick(questions);
      rerender();
    });

    ctlApplyBrand.addEventListener("click", () => {
      applyBranding(ctlBg.value.trim(), ctlBanner.value.trim(), ctlMediaUrl.value.trim());
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

