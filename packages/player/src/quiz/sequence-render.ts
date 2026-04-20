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
export function renderSequence(el: SequenceStageEls, q: QuizConfig, seq: QuizSequence, idx: number, total: number) {
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

  if (seq.type === "question" && seq.input?.type === "buttons" && Array.isArray(seq.input.choices)) {
    el.answers.removeAttribute("hidden");
    el.answers.innerHTML = "";
    const btnHex = st?.buttonHex;
    for (const c of seq.input.choices) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "quiz-answer";
      b.textContent = c.label;
      b.disabled = true;
      if (btnHex) {
        b.style.background = btnHex;
        b.style.borderColor = "rgba(255,255,255,0.25)";
      }
      el.answers.appendChild(b);
    }
  } else {
    el.answers.setAttribute("hidden", "true");
    el.answers.innerHTML = "";
  }
}
