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
    const thumb = qsp.get("thumb") === "1";
    const { slug, code } = getSlugAndCode();
    let quiz: QuizConfig | null = null;

    if (thumb) {
      // Used for thumbnails: remove entrance animations so html2canvas captures text immediately.
      document.body.dataset.quizThumb = "1";
    }

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
    let lastRevealSeqId = "";
    let lastRevealShown = -1;

    const findQuestion = (id: string) => {
      const s = seqs.find((x) => x && (x as any).id === id);
      return s && (s as any).type === "question" ? (s as any) : null;
    };

    const formatAnswer = (q: any) => {
      const cid = String(q?.correct?.choiceId || "").trim();
      const choices = q?.input?.type === "buttons" ? q?.input?.choices || [] : [];
      const choice = choices.find((c: any) => String(c.id) === cid);
      const lead = cid ? `${cid.toUpperCase()}. ` : "";
      const label = String(choice?.label || "").trim();
      return `${lead}${label || cid || "—"}`.trim();
    };

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
      } else if (seq?.type === "reveal" && lastState) {
        const ids = Array.isArray((seq as any).referencesQuestionIds)
          ? ((seq as any).referencesQuestionIds as string[]).map((s) => String(s || "").trim()).filter(Boolean)
          : [];
        const single = String((seq as any).referencesQuestionId || "").trim();
        const qids = ids.length ? ids : single ? [single] : [];
        if (qids.length) {
          const shown =
            String(lastState.revealSeqId || "") === String((seq as any).id || "") ? Math.max(0, Number(lastState.revealShown || 0)) : 0;
          el.answers.hidden = false;
          el.answers.innerHTML = "";

          const wrap = document.createElement("div");
          wrap.style.display = "grid";
          wrap.style.gap = "12px";
          wrap.style.maxWidth = "88ch";

          qids.forEach((qid, idx2) => {
            const q = findQuestion(qid);
            const block = document.createElement("div");
            block.style.padding = "12px 14px";
            block.style.borderRadius = "14px";
            block.style.border = "1px solid rgba(255,255,255,0.12)";
            block.style.background = "rgba(0,0,0,0.16)";

            const qt = document.createElement("div");
            qt.style.fontWeight = "900";
            qt.style.marginBottom = "6px";
            qt.textContent = `Question: ${String(q?.prompt?.text || "Question").trim()}`;

            const ans = document.createElement("div");
            ans.className = "muted";
            ans.style.fontWeight = "800";
            ans.textContent = `Answer: ${formatAnswer(q)}`;

            if (idx2 >= shown) {
              ans.style.display = "none";
            } else {
              // Animate only the newly revealed answer.
              const seqId = String((seq as any).id || "");
              const shouldAnim = seqId === lastRevealSeqId && shown > lastRevealShown && idx2 === shown - 1;
              if (shouldAnim) ans.classList.add("quiz-text-anim-fadeIn");
            }

            block.appendChild(qt);
            block.appendChild(ans);
            wrap.appendChild(block);
          });

          el.answers.appendChild(wrap);
          lastRevealSeqId = String((seq as any).id || "");
          lastRevealShown = shown;
        }
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
          const icon = String(p.icon || "").trim();
          const looksLikeUrl = /^https?:\/\//.test(icon) || icon.startsWith("/api/") || icon.startsWith("/play/");
          if (looksLikeUrl) {
            who.style.display = "flex";
            who.style.alignItems = "center";
            who.style.gap = "8px";
            const img = document.createElement("img");
            img.src = icon;
            img.alt = "";
            img.loading = "lazy";
            img.decoding = "async";
            img.style.width = "22px";
            img.style.height = "22px";
            img.style.objectFit = "contain";
            img.style.borderRadius = "8px";
            who.appendChild(img);
            who.appendChild(document.createTextNode(p.name || "Player"));
          } else {
            who.textContent = `${icon || ""} ${p.name || "Player"}`.trim();
          }
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
        return { status: res.status, json: (async () => (await res.ok ? res.json() : null))() } as const;
      }

      const maxAttempts = 10;
      let boot: { changed: boolean; state: SessionState | null } | null = null;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const r = await getSessionJson(0);
        if (r.status === 404 || r.status === 410 || r.status === 423) {
          await new Promise((z) => setTimeout(z, 120 + attempt * 80));
          continue;
        }
        const j = (await r.json) as { changed: boolean; state: SessionState | null } | null;
        if (j && j.changed && j.state) boot = j;
        break;
      }
      if (!boot?.changed || !boot.state) throw new Error("Session not found");
      apply(boot.state);

      const loop = async () => {
        try {
          const r0 = await getSessionJson(rev);
          if (r0.status !== 200) return;
          const r = (await r0.json) as { changed: boolean; state: SessionState | null } | null;
          if (r?.changed && r.state) apply(r.state);
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
