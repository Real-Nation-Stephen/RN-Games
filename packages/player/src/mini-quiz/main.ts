import type { MiniQuizRecord } from "@rngames/shared/page-modules";
import {
  applyPageTheme,
  completeStep,
  engageStep,
  embeddedShellActive,
  fetchPageModule,
  flowModeActive,
  flowNextLabel,
  getSlugFromPath,
  initEmbeddedContexts,
  isInCourseEmbed,
  notifyCourseItemComplete,
  setupPagePreview,
  syncModuleSession,
  wirePageLogo,
  wirePoweredBy,
} from "../page-module/shared";

const els = {
  app: document.getElementById("page-app")!,
  intro: document.getElementById("quiz-intro")!,
  question: document.getElementById("quiz-question")!,
  results: document.getElementById("quiz-results")!,
  headline: document.getElementById("page-headline")!,
  body: document.getElementById("page-body")!,
  start: document.getElementById("quiz-start") as HTMLButtonElement,
  progress: document.getElementById("quiz-progress")!,
  prompt: document.getElementById("quiz-prompt")!,
  choices: document.getElementById("quiz-choices")!,
  resultsHeadline: document.getElementById("results-headline")!,
  resultsBody: document.getElementById("results-body")!,
  resultsScore: document.getElementById("results-score")!,
  continue: document.getElementById("quiz-continue") as HTMLButtonElement,
  error: document.getElementById("page-error")!,
};

function showError(msg: string) {
  els.error.hidden = false;
  els.error.textContent = msg;
}

function showPanel(panel: "intro" | "question" | "results") {
  els.intro.hidden = panel !== "intro";
  els.question.hidden = panel !== "question";
  els.results.hidden = panel !== "results";
}

function mountQuiz(cfg: MiniQuizRecord) {
  applyPageTheme(cfg, document.documentElement);
  wirePoweredBy(cfg);
  wirePageLogo(cfg);
  els.headline.textContent = cfg.headline;
  els.body.textContent = cfg.body;
  els.start.textContent = cfg.startLabel || "Start quiz";
  els.resultsHeadline.textContent = cfg.resultsHeadline || "Your results";
  els.resultsBody.textContent = cfg.resultsBody || "";
  els.continue.textContent = embeddedShellActive() ? flowNextLabel() : cfg.continueLabel || "Continue";
  els.app.hidden = false;
  showPanel("intro");

  const questions = cfg.questions || [];
  const answers: string[] = [];
  let engaged = false;

  function markEngaged() {
    if (!engaged) {
      engaged = true;
      engageStep();
    }
  }

  function showQuestion(index: number) {
    const q = questions[index];
    if (!q) {
      showResults();
      return;
    }
    showPanel("question");
    els.progress.textContent = `Question ${index + 1} of ${questions.length}`;
    els.prompt.textContent = q.prompt;
    els.choices.replaceChildren(
      ...q.choices.map((choice) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "page-btn page-quiz-choice";
        btn.textContent = choice.label;
        btn.onclick = () => {
          markEngaged();
          answers[index] = choice.id;
          showQuestion(index + 1);
        };
        return btn;
      }),
    );
  }

  function showResults() {
    const total = questions.length;
    const correctCount = questions.reduce(
      (n, q, i) => n + (answers[i] === q.correctChoiceId ? 1 : 0),
      0,
    );
    const scorePercent = total ? Math.round((correctCount / total) * 100) : 0;
    els.resultsScore.textContent = `${correctCount} of ${total} correct (${scorePercent}%)`;
    showPanel("results");
  }

  async function finish() {
    const total = questions.length;
    const correctCount = questions.reduce(
      (n, q, i) => n + (answers[i] === q.correctChoiceId ? 1 : 0),
      0,
    );
    const scorePercent = total ? Math.round((correctCount / total) * 100) : 0;
    const outcomes = {
      completed: true,
      "quiz.score": correctCount,
      "quiz.correctCount": correctCount,
      "quiz.scorePercent": scorePercent,
    };
    await syncModuleSession(
      { miniQuiz: { correctCount, scorePercent, total } },
      outcomes,
    );
    const payload = { gameId: cfg.id, ...outcomes };
    if (flowModeActive()) {
      completeStep(payload);
    } else if (isInCourseEmbed()) {
      notifyCourseItemComplete(payload);
    }
  }

  els.start.onclick = () => {
    markEngaged();
    if (!questions.length) {
      showResults();
      return;
    }
    showQuestion(0);
  };
  els.continue.onclick = () => void finish();
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") === "1") {
    setupPagePreview("mini-quiz", (cfg) => mountQuiz(cfg as MiniQuizRecord));
    return;
  }
  initEmbeddedContexts();
  const slug = getSlugFromPath("mini-quiz");
  if (!slug) {
    showError("Missing mini quiz slug.");
    return;
  }
  try {
    mountQuiz((await fetchPageModule(slug, "mini-quiz")) as MiniQuizRecord);
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed to load");
  }
}

void boot();
