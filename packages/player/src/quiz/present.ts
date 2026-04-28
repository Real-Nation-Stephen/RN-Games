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
    const qsp = new URLSearchParams(window.location.search);
    const preview = qsp.get("preview") === "1";
    const { slug, code } = getSlugAndCode();
    let quiz: QuizConfig | null = null;

    if (preview) {
      await new Promise<void>((resolve) => {
        const onMsg = (e: MessageEvent) => {
          if (e.origin !== window.location.origin) return;
          if (e.data?.type !== "rngames-quiz-config") return;
          const cfg = e.data.config as QuizConfig;
          if (!cfg || cfg.gameType !== "quiz") return;
          quiz = cfg;
          window.removeEventListener("message", onMsg);
          resolve();
        };
        window.addEventListener("message", onMsg);
      });
    } else {
      quiz = await fetchQuiz(slug);
    }
    if (!quiz) throw new Error("Missing quiz config");
    if (quiz.faviconUrl) setFavicon(quiz.faviconUrl);
    ensureQuizFontFaces(quiz);
    // Presentation should respect the same hex/theme tuning you set for the host surface.
    applyQuizSurface(byId("app"), quiz, "host");

    const powered = document.getElementById("quiz-powered");
    if (powered && quiz.showPoweredBy === false) powered.setAttribute("hidden", "true");

    const el: SequenceStageEls & { logo: HTMLImageElement; title: HTMLElement; sub: HTMLElement; slideLogo: HTMLImageElement } = {
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
      slideLogo: byId("quiz-slide-logo"),
    };

    // Present stage base color (global). This is the "Default stage background (hex)" users expect to control.
    const stageBg = (quiz.branding?.backgroundColor || "").trim() || "#0a1628";
    el.stage.style.setProperty("--quiz-stage-bg", stageBg);
    // Also paint the full-page trim behind the stage.
    document.documentElement.style.setProperty("--page-bg-solid", stageBg);

    // Presentation branding:
    // - Apply directly to the stage (used by `.quiz-stage--present` background)
    // - Also apply to the page background layer (`body::before`) as a reliable fallback
    //   in case other layers (e.g. `#app` surface background) visually dominate.
    const bg = (quiz.branding?.backgroundImage || "").trim();
    if (bg) {
      const bgCss = `url('${bg}')`;
      // Use full-page background for Present by default (matches expectation of "full screen" background).
      // Per-slide overrides still use `--quiz-present-bg-image-override` on the stage.
      el.stage.style.removeProperty("--quiz-present-bg-image");
      document.documentElement.style.setProperty("--quiz-present-bg-image", bgCss);
      document.documentElement.style.setProperty("--page-bg-image", bgCss);
      // Preload so broken URLs are obvious (and we can fall back cleanly).
      const img = new Image();
      img.src = bg;
      img.onerror = () => {
        // If it fails to load, don't leave a broken background reference.
        el.stage.style.removeProperty("--quiz-present-bg-image");
        document.documentElement.style.removeProperty("--quiz-present-bg-image");
        document.documentElement.style.setProperty("--page-bg-image", "none");
      };
    } else {
      el.stage.style.removeProperty("--quiz-present-bg-image");
      document.documentElement.style.removeProperty("--quiz-present-bg-image");
      document.documentElement.style.setProperty("--page-bg-image", "none");
    }
    const banner = (quiz.branding?.host?.headerImageUrl || "").trim();
    if (banner) {
      el.stage.style.setProperty("--quiz-present-banner-image", `url('${banner}')`);
      // Common banner size for projector screens.
      el.stage.style.setProperty("--quiz-present-banner-h", "120px");
    } else {
      el.stage.style.removeProperty("--quiz-present-banner-image");
      el.stage.style.removeProperty("--quiz-present-banner-h");
    }

    el.title.textContent = quiz.title || "Quiz";
    el.sub.textContent = code ? `Room ${code} • audience view` : "Facilitated • audience view";
    // The banner is typically a full-width image; do not scale a logo inside it.
    el.logo.style.display = "none";

    const track = firstTrack(quiz);
    const seqs = track.sequences || [];
    let i = 0;
    let rev = 0;
    let lastState: SessionState | null = null;

    const applyIdx = (idx: number) => {
      i = Math.max(0, Math.min(seqs.length - 1, Number(idx) || 0));
      const seq = seqs[i];
      if (seq) renderSequence(el, quiz, seq, i, seqs.length);

      // Special runtime overlays for play-along.
      if (seq?.type === "connection" && code) {
        // Show a QR to the join screen (same as host).
        const joinUrl = `${window.location.origin}/quiz/${slug}/join/${code}`;
        el.answers.hidden = false;
        el.answers.innerHTML = "";
        const wrap = document.createElement("div");
        wrap.style.display = "flex";
        wrap.style.flexDirection = "column";
        wrap.style.alignItems = "center";
        wrap.style.gap = "14px";
        const hint = document.createElement("div");
        hint.className = "muted";
        hint.style.fontSize = "0.9rem";
        hint.textContent = "Scan to join";
        const img = document.createElement("img");
        img.alt = "Join QR code";
        img.loading = "lazy";
        img.decoding = "async";
        img.style.width = "260px";
        img.style.height = "260px";
        img.style.objectFit = "contain";
        img.style.borderRadius = "16px";
        img.style.background = "rgba(255,255,255,0.92)";
        img.style.padding = "10px";
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(joinUrl)}`;
        const txt = document.createElement("div");
        txt.style.fontWeight = "800";
        txt.textContent = `Room ${code}`;
        wrap.appendChild(txt);
        wrap.appendChild(hint);
        wrap.appendChild(img);
        el.answers.appendChild(wrap);
      } else if (seq?.type === "leaderboard" && lastState) {
        const sorted = [...(lastState.participants || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
        el.answers.hidden = false;
        el.answers.innerHTML = "";
        const list = document.createElement("ol");
        list.style.listStyle = "none";
        list.style.padding = "0";
        list.style.margin = "0";
        list.style.display = "grid";
        list.style.gap = "10px";
        sorted.slice(0, 10).forEach((p, idx2) => {
          const row = document.createElement("li");
          row.style.display = "grid";
          row.style.gridTemplateColumns = "56px 1fr 120px";
          row.style.alignItems = "center";
          row.style.gap = "12px";
          row.style.padding = "10px 14px";
          row.style.borderRadius = "14px";
          row.style.background = "rgba(0,0,0,0.18)";
          const rank = document.createElement("div");
          rank.style.fontWeight = "900";
          rank.style.fontSize = "1.15rem";
          rank.textContent = String(idx2 + 1);
          const who = document.createElement("div");
          who.style.fontWeight = "800";
          who.textContent = `${p.icon || ""} ${p.name || "Player"}`.trim();
          const score = document.createElement("div");
          score.style.textAlign = "right";
          score.style.fontWeight = "900";
          score.textContent = String(p.score || 0);
          row.appendChild(rank);
          row.appendChild(who);
          row.appendChild(score);
          list.appendChild(row);
        });
        el.answers.appendChild(list);
      }

      // Auto-switch split/full layout depending on whether media exists.
      const hasMedia = (el.media?.children?.length || 0) > 0;
      el.stage.dataset.presentLayout = hasMedia ? "split" : "full";
    };

    const apply = (state: SessionState) => {
      rev = state.revision;
      lastState = state;
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
