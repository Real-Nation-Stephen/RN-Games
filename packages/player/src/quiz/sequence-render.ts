import type { QuizConfig, QuizSequence } from "./types";
import { applySequenceFonts } from "./quiz-theme";

export type SequenceStageEls = {
  stage: HTMLElement;
  fit: HTMLElement;
  bgVideo: HTMLVideoElement;
  seqKind: HTMLElement;
  seqTitle: HTMLElement;
  seqBody: HTMLElement;
  media: HTMLElement;
  answers: HTMLElement;
};

export type RenderSequenceOptions =
  | undefined
  | {
      /** In kiosk mode, inputs become interactive. */
      interactive?: boolean;
      /** Whether media elements (e.g. audio play) are interactive. */
      mediaInteractive?: boolean;
      /**
       * Called when the kiosk user picks an answer. Host/present should not pass this.
       * For play-along, answers are still submitted via the phone UI.
       */
      onAnswer?: (answer: { choiceId?: string; value?: number; stopId?: string }) => void;
    };

let lastSeqSound: HTMLAudioElement | null = null;

function stopSeqSound() {
  if (lastSeqSound) {
    lastSeqSound.pause();
    lastSeqSound = null;
  }
}

function playSeqSound(url: string, loop: boolean) {
  stopSeqSound();
  const a = new Audio(url);
  a.loop = loop;
  lastSeqSound = a;
  void a.play().catch(() => void 0);
}

function renderAudioTile(
  media: HTMLElement,
  audioUrl: string,
  imageUrl: string | undefined,
  interactive: boolean,
) {
  const wrap = document.createElement("div");
  wrap.className = "quiz-audio-tile";

  const art = document.createElement("div");
  art.className = "quiz-audio-art";
  if (imageUrl) {
    art.style.backgroundImage = `url('${imageUrl}')`;
    art.style.backgroundSize = "cover";
    art.style.backgroundPosition = "center";
  } else {
    art.textContent = "♪";
  }

  const controls = document.createElement("div");
  controls.className = "quiz-audio-controls";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "quiz-audio-btn";
  btn.textContent = "Play";
  btn.disabled = !interactive;

  const a = new Audio(audioUrl);
  a.preload = "metadata";
  a.addEventListener("ended", () => (btn.textContent = "Play"));
  a.addEventListener("pause", () => (btn.textContent = "Play"));
  a.addEventListener("play", () => (btn.textContent = "Pause"));

  btn.addEventListener("click", async () => {
    try {
      if (a.paused) await a.play();
      else a.pause();
    } catch {
      /* ignore */
    }
  });

  controls.appendChild(btn);
  wrap.appendChild(art);
  wrap.appendChild(controls);
  media.appendChild(wrap);
}

export function firstTrack(q: QuizConfig) {
  return q.tracks?.[0] || { id: "main", name: "Main", sequences: [] as QuizSequence[] };
}

function animClass(id: string | undefined): string {
  const v = id && id !== "none" ? id : "none";
  return v === "none" ? "" : ` quiz-text-anim-${v}`;
}

function resolveRevealContent(quiz: QuizConfig, seq: Extract<QuizSequence, { type: "reveal" }>, seqs: QuizSequence[]) {
  const qid = seq.referencesQuestionId;
  const q = qid ? seqs.find((s) => s.type === "question" && s.id === qid) : undefined;
  if (q && q.type === "question") {
    let correctLabel = "";
    if (q.input?.type === "buttons" && q.correct?.choiceId) {
      const c = q.input.choices?.find((x) => x.id === q.correct?.choiceId);
      correctLabel = c?.label || q.correct.choiceId;
    }
    const title = seq.title || "Answer";
    const body =
      seq.body ||
      (correctLabel ? `Correct answer: ${correctLabel}` : (q.prompt.body || q.prompt.text || ""));
    return { title, body };
  }
  return { title: seq.title || "Reveal", body: seq.body || "" };
}

/** Renders one sequence into the stage (shared by host + presentation views). */
export function renderSequence(
  el: SequenceStageEls,
  q: QuizConfig,
  seq: QuizSequence,
  idx: number,
  total: number,
  opts?: RenderSequenceOptions,
) {
  stopSeqSound();
  const st = "style" in seq ? seq.style : undefined;
  const titleAnim =
    seq.type === "question"
      ? seq.textAnimation
      : st?.textAnimation;
  el.seqTitle.className = `quiz-h1${animClass(titleAnim)}`;
  el.seqBody.className = `quiz-body${animClass(st?.textAnimation)}`;

  el.seqKind.textContent = `${idx + 1} / ${total} • ${seq.type.toUpperCase()}`;

  let title = "";
  let body = "";
  if (seq.type === "question") {
    title = seq.prompt.text || "Question";
    body = seq.prompt.body || "";
  } else if (seq.type === "reveal") {
    const track = firstTrack(q);
    const r = resolveRevealContent(q, seq, track.sequences || []);
    title = r.title;
    body = r.body;
  } else {
    const o = seq as { headline?: string; title?: string; subhead?: string; body?: string };
    title = o.headline || o.title || q.title || "Quiz";
    body = o.subhead || o.body || "";
  }

  el.seqTitle.textContent = title;
  el.seqBody.textContent = body;

  el.media.innerHTML = "";
  const bgHex = st?.bgHex || seq.media?.bgColor || q.branding?.backgroundColor || "#0a1628";
  el.stage.style.background = bgHex;

  if (st?.textHex) {
    el.seqTitle.style.color = st.textHex;
    el.seqBody.style.color = st.textHex;
  } else {
    el.seqTitle.style.removeProperty("color");
    el.seqBody.style.removeProperty("color");
  }

  applySequenceFonts(el, q);
  if (q.branding?.fonts?.subheading && seq.type !== "question") {
    el.seqBody.style.fontFamily = q.branding.fonts.subheading;
  }

  const styleBg = st?.bgImageUrl || seq.media?.bgImageUrl;
  if (q.mode.motion === "videoSequences" && seq.media?.videoUrl) {
    el.bgVideo.hidden = false;
    if (el.bgVideo.src !== seq.media.videoUrl) el.bgVideo.src = seq.media.videoUrl;
    void el.bgVideo.play().catch(() => void 0);
  } else if (styleBg || q.branding?.backgroundImage) {
    el.bgVideo.hidden = true;
    const url = styleBg || q.branding?.backgroundImage || "";
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.style.width = "100%";
    img.style.borderRadius = "14px";
    img.style.marginTop = "12px";
    el.media.appendChild(img);
  } else {
    el.bgVideo.hidden = true;
  }

  const soundUrl = st?.soundUrl;
  if (soundUrl) playSeqSound(soundUrl, st?.soundLoop === true);

  // Question prompt media (image/audio). Presentation view places `el.media` in the left panel.
  if (seq.type === "question") {
    const img = (seq.prompt.imageUrl || "").trim();
    const aud = (seq.prompt.audioUrl || "").trim();
    if (img) {
      const elImg = document.createElement("img");
      elImg.src = img;
      elImg.alt = "";
      elImg.style.width = "100%";
      elImg.style.borderRadius = "12px";
      mediaImgFix(elImg);
      el.media.appendChild(elImg);
    }
    if (aud) {
      renderAudioTile(el.media, aud, img || undefined, opts?.mediaInteractive === true);
    }
  }

  if (seq.type === "question" && seq.input?.type === "buttons" && Array.isArray(seq.input.choices)) {
    el.answers.removeAttribute("hidden");
    el.answers.innerHTML = "";
    const btnHex = st?.buttonHex;
    for (const c of seq.input.choices) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "quiz-answer";
      b.textContent = c.label;
      const interactive = opts?.interactive === true;
      b.disabled = !interactive;
      if (interactive && opts?.onAnswer) {
        b.addEventListener("click", () => opts.onAnswer?.({ choiceId: c.id }));
      }
      if (btnHex) {
        b.style.background = btnHex;
        b.style.borderColor = "rgba(255,255,255,0.25)";
      }
      el.answers.appendChild(b);
    }
  } else if (seq.type === "question" && seq.input?.type === "slider") {
    const interactive = opts?.interactive === true;
    el.answers.removeAttribute("hidden");
    el.answers.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gap = "10px";
    wrap.style.gridColumn = "1 / -1";

    const range = document.createElement("input");
    range.type = "range";
    range.className = "quiz-slider";
    range.disabled = !interactive;

    if (seq.input.kind === "continuous" && seq.input.continuous) {
      range.min = String(seq.input.continuous.min);
      range.max = String(seq.input.continuous.max);
      const mid = (Number(seq.input.continuous.min) + Number(seq.input.continuous.max)) / 2;
      range.value = String(mid);
    } else if (seq.input.kind === "discrete" && seq.input.discrete) {
      const stops = seq.input.discrete.stops || [];
      range.min = "0";
      range.max = String(Math.max(0, stops.length - 1));
      range.step = "1";
      range.value = String(Math.floor(stops.length / 2));
    }

    if (seq.input.kind === "discrete" && seq.input.discrete) {
      const stops = seq.input.discrete.stops || [];
      const ticks = document.createElement("div");
      ticks.className = "quiz-slider-ticks";
      ticks.style.display = "grid";
      ticks.style.gridTemplateColumns = `repeat(${Math.max(1, stops.length)}, minmax(0, 1fr))`;
      ticks.style.gap = "0";
      for (const s of stops) {
        const t = document.createElement("div");
        t.className = "quiz-slider-tick";
        t.style.display = "grid";
        t.style.justifyItems = "center";
        t.style.gap = "6px";
        const notch = document.createElement("span");
        notch.style.width = "3px";
        notch.style.height = "18px";
        notch.style.borderRadius = "2px";
        notch.style.background = "rgba(255,255,255,0.92)";
        const label = document.createElement("span");
        label.style.fontSize = "12px";
        label.style.fontWeight = "800";
        label.style.color = "rgba(0,0,0,0.65)";
        label.textContent = s.label || s.id;
        t.appendChild(notch);
        t.appendChild(label);
        ticks.appendChild(t);
      }
      wrap.appendChild(ticks);
    }

    if (interactive && opts?.onAnswer) {
      const submit = () => {
        if (seq.input.kind === "continuous" && seq.input.continuous) {
          opts.onAnswer?.({ value: Number(range.value) });
        } else if (seq.input.kind === "discrete" && seq.input.discrete) {
          const stops = seq.input.discrete.stops || [];
          const idx = Math.max(0, Math.min(stops.length - 1, Number(range.value) || 0));
          const stop = stops[idx];
          opts.onAnswer?.({ stopId: stop?.id, value: stop?.value });
        }
      };
      range.addEventListener("change", submit);
    }

    wrap.appendChild(range);
    el.answers.appendChild(wrap);
  } else {
    el.answers.setAttribute("hidden", "true");
    el.answers.innerHTML = "";
  }
}

function mediaImgFix(img: HTMLImageElement) {
  img.decoding = "async";
  img.loading = "eager";
  img.style.display = "block";
}
