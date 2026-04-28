import type { QuizConfig, SessionState } from "./types";
import { byId, fetchQuiz, setFavicon, showApp, showError } from "./lib";
import { layoutStage } from "./layout";
import { quizSessionGetUrl } from "./api-path";
import { applyQuizSurface } from "./quiz-theme";
import { firstTrack, renderSequence, type SequenceStageEls } from "./sequence-render";
import { ensureQuizFontFaces } from "./font-loader";

function getSlugAndCode(): { slug: string; code: string | null } {
  const seg = window.location.pathname.split("/").filter(Boolean);
  const i = seg.indexOf("quiz");
  if (i >= 0 && seg[i + 1] && seg[i + 2] === "present") {
    const slug = seg[i + 1];
    const code = seg[i + 3] ? seg[i + 3].toUpperCase() : null;
    return { slug, code };
  }
  const q = new URLSearchParams(window.location.search);
  const slug = q.get("slug");
  const code = q.get("code");
  if (slug && code) return { slug, code: code.toUpperCase() };
  if (slug) return { slug, code: null };
  throw new Error("Missing slug");
}

async function main() {
  try {
    const { slug, code } = getSlugAndCode();
    const quiz = await fetchQuiz(slug);
    if (quiz.faviconUrl) setFavicon(quiz.faviconUrl);
    ensureQuizFontFaces(quiz);
    // Presentation should respect the same hex/theme tuning you set for the host surface.
    applyQuizSurface(byId("app"), quiz, "host");

    // Presentation branding: background + banner image (use host theme headerImageUrl if provided).
    const rs = document.documentElement.style;
    const bg = (quiz.branding?.backgroundImage || "").trim();
    if (bg) rs.setProperty("--quiz-present-bg-image", `url('${bg}')`);
    else rs.removeProperty("--quiz-present-bg-image");
    const banner = (quiz.branding?.host?.headerImageUrl || "").trim();
    if (banner) {
      rs.setProperty("--quiz-present-banner-image", `url('${banner}')`);
      // Common banner size for projector screens.
      rs.setProperty("--quiz-present-banner-h", "120px");
    } else {
      rs.removeProperty("--quiz-present-banner-image");
      rs.removeProperty("--quiz-present-banner-h");
    }

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
    el.sub.textContent = code ? `Room ${code} • audience view` : "Facilitated • audience view";
    // The banner is typically a full-width image; do not scale a logo inside it.
    el.logo.style.display = "none";

    const track = firstTrack(quiz);
    const seqs = track.sequences || [];
    let i = 0;
    let rev = 0;

    const applyIdx = (idx: number) => {
      i = Math.max(0, Math.min(seqs.length - 1, Number(idx) || 0));
      const seq = seqs[i];
      if (seq) renderSequence(el, quiz, seq, i, seqs.length);
      // Auto-switch split/full layout depending on whether media exists.
      const hasMedia = (el.media?.children?.length || 0) > 0;
      el.stage.dataset.presentLayout = hasMedia ? "split" : "full";
    };

    const apply = (state: SessionState) => {
      rev = state.revision;
      applyIdx(Number(state.currentSequenceIndex) || 0);
    };

    if (code) {
      async function getSessionJson(revNum: number) {
        const url = quizSessionGetUrl({ code, rev: String(revNum), cb: String(Date.now()) });
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`Session ${res.status}`);
        return res.json() as Promise<{ changed: boolean; state: SessionState | null }>;
      }

      const boot = await getSessionJson(0);
      if (!boot.changed || !boot.state) throw new Error("Session not found");
      apply(boot.state);

      const loop = async () => {
        try {
          const r = await getSessionJson(rev);
          if (r.changed && r.state) apply(r.state);
        } catch {
          /* keep polling */
        } finally {
          window.setTimeout(loop, 280);
        }
      };
      loop();
    } else {
      // Facilitated: follow local BroadcastChannel messages from the host.
      const key = `rngames-quiz-facilitated:${quiz.slug}:idx`;
      const chan = `rngames-quiz-facilitated:${quiz.slug}`;
      try {
        const raw = localStorage.getItem(key);
        const n = raw ? Number(raw) : 0;
        if (Number.isFinite(n)) applyIdx(n);
      } catch {
        applyIdx(0);
      }
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel(chan);
        bc.addEventListener("message", (e) => {
          const d = e.data as { type?: string; idx?: number };
          if (d?.type === "idx" && typeof d.idx === "number") applyIdx(d.idx);
        });
      }
    }

    layoutStage(el.stage, el.fit, 1920, 1080);
    window.addEventListener("resize", () => layoutStage(el.stage, el.fit, 1920, 1080));

    showApp();
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed");
  }
}

void main();
