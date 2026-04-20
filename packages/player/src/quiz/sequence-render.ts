import type { QuizConfig, QuizSequence } from "./types";

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

export function firstTrack(q: QuizConfig) {
  return q.tracks?.[0] || { id: "main", name: "Main", sequences: [] as QuizSequence[] };
}

/** Renders one sequence into the stage (shared by host + presentation views). */
export function renderSequence(el: SequenceStageEls, q: QuizConfig, seq: QuizSequence, idx: number, total: number) {
  el.seqKind.textContent = `${idx + 1} / ${total} • ${seq.type.toUpperCase()}`;
  const title = seq.type === "question" ? seq.prompt.text || "Question" : seq.title || q.title || "Quiz";
  const body = seq.type === "question" ? seq.prompt.body || "" : seq.body || "";
  el.seqTitle.textContent = title;
  el.seqBody.textContent = body;

  el.media.innerHTML = "";
  const bg = seq.media?.bgColor || q.branding?.backgroundColor || "#0a1628";
  el.stage.style.background = bg;

  if (q.mode.motion === "videoSequences" && seq.media?.videoUrl) {
    el.bgVideo.hidden = false;
    if (el.bgVideo.src !== seq.media.videoUrl) el.bgVideo.src = seq.media.videoUrl;
    void el.bgVideo.play().catch(() => void 0);
  } else if (seq.media?.bgImageUrl || q.branding?.backgroundImage) {
    el.bgVideo.hidden = true;
    const url = seq.media?.bgImageUrl || q.branding?.backgroundImage || "";
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

  if (seq.type === "question" && seq.input?.type === "buttons" && Array.isArray(seq.input.choices)) {
    el.answers.removeAttribute("hidden");
    el.answers.innerHTML = "";
    for (const c of seq.input.choices) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "quiz-answer";
      b.textContent = c.label;
      b.disabled = true;
      el.answers.appendChild(b);
    }
  } else {
    el.answers.setAttribute("hidden", "true");
    el.answers.innerHTML = "";
  }
}
