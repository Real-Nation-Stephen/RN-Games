import type { QuizConfig, QuizSequence } from "./types";
import { byId, fetchQuiz, qs, setFavicon, showApp, showError } from "./lib";
import { layoutStage } from "./layout";
import { applyQuizSurface } from "./quiz-theme";
import { ensureQuizFontFaces } from "./font-loader";
import { firstTrack, renderSequence, type SequenceStageEls } from "./sequence-render";

function getSlug(): string {
  const q = qs().get("slug");
  if (q) return q;
  const seg = window.location.pathname.split("/").filter(Boolean);
  const i = seg.indexOf("quiz");
  if (i >= 0 && seg[i + 1]) return seg[i + 1];
  throw new Error("Missing slug");
}

type KioskState = {
  idx: number;
  score: number;
  answers: Record<string, { choiceId?: string; value?: number; stopId?: string; correct?: boolean }>;
};

function isQuestion(seq: QuizSequence): seq is Extract<QuizSequence, { type: "question" }> {
  return seq.type === "question";
}

function isReveal(seq: QuizSequence): seq is Extract<QuizSequence, { type: "reveal" }> {
  return seq.type === "reveal";
}

function calcCorrect(q: Extract<QuizSequence, { type: "question" }>, answer: { choiceId?: string; value?: number; stopId?: string }) {
  if (!q.correct) return null;
  if (q.input.type === "buttons" && q.correct.choiceId) return answer.choiceId === q.correct.choiceId;
  if (q.input.type === "slider") {
    if (q.input.kind === "continuous" && typeof q.correct.value === "number") {
      const tol = q.input.continuous?.tolerance ?? 0;
      return typeof answer.value === "number" && Math.abs(answer.value - q.correct.value) <= tol;
    }
    if (q.input.kind === "discrete" && q.correct.stopId) return answer.stopId === q.correct.stopId;
  }
  return null;
}

function pointsFor(q: Extract<QuizSequence, { type: "question" }>, isCorrect: boolean | null) {
  if (isCorrect == null) return 0;
  const sc = q.scoring || {};
  const ok = Number(sc.pointsCorrect ?? 100);
  const bad = Number(sc.pointsWrong ?? 0);
  return isCorrect ? ok : bad;
}

async function main() {
  try {
    const slug = getSlug();
    const quiz = await fetchQuiz(slug);
    if (quiz.faviconUrl) setFavicon(quiz.faviconUrl);
    ensureQuizFontFaces(quiz);
    applyQuizSurface(byId("app"), quiz, "default");

    const el: SequenceStageEls & {
      logo: HTMLImageElement;
      title: HTMLElement;
      sub: HTMLElement;
      restart: HTMLButtonElement;
      footer: HTMLElement;
    } = {
      stage: byId("stage"),
      fit: byId("fit"),
      bgVideo: byId("quiz-bg-video"),
      logo: byId("quiz-logo"),
      title: byId("quiz-title"),
      sub: byId("quiz-sub"),
      seqKind: byId("quiz-seq-kind"),
      seqTitle: byId("quiz-seq-title"),
      seqBody: byId("quiz-seq-body"),
      media: byId("quiz-media"),
      answers: byId("quiz-answers"),
      restart: byId("kiosk-restart"),
      footer: byId("kiosk-footer"),
    };

    el.title.textContent = quiz.title || "Quiz";
    el.sub.textContent = "Kiosk mode";
    const logoUrl = (quiz.branding?.logoUrl || "").trim();
    if (logoUrl) {
      el.logo.src = logoUrl;
      el.logo.style.display = "block";
    }

    const track = firstTrack(quiz as QuizConfig);
    const seqs = track.sequences || [];

    const state: KioskState = { idx: 0, score: 0, answers: {} };

    const advance = () => {
      state.idx = Math.min(seqs.length - 1, state.idx + 1);
      render();
    };

    const restart = () => {
      state.idx = 0;
      state.score = 0;
      state.answers = {};
      render();
    };

    const render = () => {
      const seq = seqs[state.idx];
      if (!seq) return;
      el.footer.textContent = `Score: ${state.score}`;

      renderSequence(
        el,
        quiz,
        seq,
        state.idx,
        seqs.length,
        isQuestion(seq) && seq.input.mode !== "none"
          ? {
              interactive: true,
              mediaInteractive: true,
              onAnswer: (ans) => {
                const ok = calcCorrect(seq, ans);
                state.answers[seq.id] = { ...ans, correct: ok ?? undefined };
                state.score += pointsFor(seq, ok);
                // Kiosk MVP: advance immediately after answering.
                window.setTimeout(advance, 220);
              },
            }
          : undefined,
      );

      // End screen hint (MVP): allow restart from outro/ended-like slides.
      if (!isQuestion(seq) && !isReveal(seq) && (seq.type === "outro" || seq.type === "leaderboard")) {
        el.footer.textContent = `Final score: ${state.score} • Tap Restart for next player`;
      }
    };

    el.restart.addEventListener("click", restart);

    render();
    layoutStage(el.stage, el.fit, 1920, 1080);
    window.addEventListener("resize", () => layoutStage(el.stage, el.fit, 1920, 1080));
    showApp();
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed");
  }
}

void main();

