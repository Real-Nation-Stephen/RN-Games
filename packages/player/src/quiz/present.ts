import type { QuizConfig, SessionState } from "./types";
import { byId, fetchJson, fetchQuiz, setFavicon, showApp, showError } from "./lib";
import { layoutStage } from "./layout";
import { firstTrack, renderSequence, type SequenceStageEls } from "./sequence-render";

function getSlugAndCode(): { slug: string; code: string } {
  const seg = window.location.pathname.split("/").filter(Boolean);
  const i = seg.indexOf("quiz");
  if (i >= 0 && seg[i + 1] && seg[i + 2] === "present" && seg[i + 3]) {
    return { slug: seg[i + 1], code: seg[i + 3].toUpperCase() };
  }
  const q = new URLSearchParams(window.location.search);
  const slug = q.get("slug");
  const code = q.get("code");
  if (slug && code) return { slug, code: code.toUpperCase() };
  throw new Error("Missing slug or room code");
}

async function main() {
  try {
    const { slug, code } = getSlugAndCode();
    const quiz = await fetchQuiz(slug);
    if (quiz.faviconUrl) setFavicon(quiz.faviconUrl);

    const el: SequenceStageEls & { logo: HTMLImageElement; title: HTMLElement; sub: HTMLElement } = {
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
    };

    el.title.textContent = quiz.title || "Quiz";
    el.sub.textContent = `Room ${code} • audience view`;
    const logoUrl = (quiz.branding?.logoUrl || "").trim();
    if (logoUrl) {
      el.logo.src = logoUrl;
      el.logo.style.display = "block";
    }

    const track = firstTrack(quiz);
    const seqs = track.sequences || [];
    let i = 0;
    let rev = 0;

    const apply = (state: SessionState) => {
      rev = state.revision;
      i = Math.max(0, Math.min(seqs.length - 1, Number(state.currentSequenceIndex) || 0));
      const seq = seqs[i];
      if (seq) renderSequence(el, quiz, seq, i, seqs.length);
    };

    const boot = await fetchJson<{ changed: boolean; state: SessionState | null }>(
      `/api/quiz-session?code=${encodeURIComponent(code)}&rev=0`,
    );
    if (!boot.changed || !boot.state) throw new Error("Session not found");
    apply(boot.state);

    const loop = async () => {
      try {
        const r = await fetchJson<{ changed: boolean; state: SessionState | null }>(
          `/api/quiz-session?code=${encodeURIComponent(code)}&rev=${encodeURIComponent(String(rev))}`,
        );
        if (r.changed && r.state) apply(r.state);
      } catch {
        /* keep polling */
      } finally {
        window.setTimeout(loop, 280);
      }
    };
    loop();

    layoutStage(el.stage, el.fit, 1920, 1080);
    window.addEventListener("resize", () => layoutStage(el.stage, el.fit, 1920, 1080));

    showApp();
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed");
  }
}

void main();
