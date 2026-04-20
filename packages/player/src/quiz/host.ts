import type { QuizConfig, QuizSequence } from "./types";
import { byId, fetchJson, fetchQuiz, qs, setFavicon, showApp, showError } from "./lib";
import { layoutStage } from "./layout";

type Els = {
  stage: HTMLElement;
  fit: HTMLElement;
  bgVideo: HTMLVideoElement;
  logo: HTMLImageElement;
  title: HTMLElement;
  sub: HTMLElement;
  seqKind: HTMLElement;
  seqTitle: HTMLElement;
  seqBody: HTMLElement;
  media: HTMLElement;
  answers: HTMLElement;
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
  createSession: HTMLButtonElement;
  joinLink: HTMLElement;
  qr: HTMLImageElement;
  list: HTMLOListElement;
};

function getEls(): Els {
  return {
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
    prev: byId("quiz-prev"),
    next: byId("quiz-next"),
    createSession: byId("quiz-create-session"),
    joinLink: byId("quiz-join-link"),
    qr: byId("quiz-qr"),
    list: byId("quiz-seq-list"),
  };
}

function getSlug(): string {
  const p = qs().get("slug");
  if (p) return p;
  // Fallback: /quiz/<slug>/host routed pages may also have slug in pathname.
  const seg = window.location.pathname.split("/").filter(Boolean);
  const i = seg.indexOf("quiz");
  if (i >= 0 && seg[i + 1]) return seg[i + 1];
  throw new Error("Missing slug");
}

function firstTrack(q: QuizConfig) {
  return q.tracks?.[0] || { id: "main", name: "Main", sequences: [] as QuizSequence[] };
}

function renderSeq(el: Els, q: QuizConfig, seq: QuizSequence, idx: number, total: number) {
  el.seqKind.textContent = `${idx + 1} / ${total} • ${seq.type.toUpperCase()}`;
  const title = seq.type === "question" ? seq.prompt.text || "Question" : seq.title || q.title || "Quiz";
  const body = seq.type === "question" ? seq.prompt.body || "" : seq.body || "";
  el.seqTitle.textContent = title;
  el.seqBody.textContent = body;

  el.media.innerHTML = "";
  const bg = seq.media?.bgColor || q.branding?.backgroundColor || "#0a1628";
  el.stage.style.background = bg;

  // Video-per-sequence mode: one background video per sequence, no controls.
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

async function main() {
  try {
    const preview = qs().get("preview") === "1";
    const slug = preview ? (qs().get("slug") || "") : getSlug();
    let quiz: QuizConfig | null = null;

    if (preview) {
      // Wait for studio postMessage (same-origin only).
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
    const el = getEls();

    el.title.textContent = quiz.title || "Quiz";
    el.sub.textContent = `/${quiz.slug}`;
    const logoUrl = (quiz.branding?.logoUrl || "").trim();
    if (logoUrl) {
      el.logo.src = logoUrl;
      el.logo.style.display = "block";
    }

    const track = firstTrack(quiz);
    const seqs = track.sequences || [];
    let i = 0;

    let sessionCode = "";
    let hostKey = "";

    const setJoin = (code: string, key?: string) => {
      sessionCode = code;
      if (key) hostKey = key;
      const u = new URL(window.location.origin);
      u.pathname = `/quiz/${quiz.slug}/join/${code}`;
      el.joinLink.textContent = u.toString();
      // Ultra-light QR (Google Charts is simplest, but keep offline-friendly by letting the host copy link too).
      const qr = new URL("https://chart.googleapis.com/chart");
      qr.searchParams.set("cht", "qr");
      qr.searchParams.set("chs", "240x240");
      qr.searchParams.set("chl", u.toString());
      el.qr.src = qr.toString();
    };

    const renderList = () => {
      el.list.innerHTML = "";
      seqs.forEach((s, idx) => {
        const li = document.createElement("li");
        li.style.opacity = idx === i ? "1" : "0.72";
        li.innerHTML = `<code>${s.type}</code> ${(s.type === "question" ? s.prompt.text : s.title) || s.id}`;
        el.list.appendChild(li);
      });
    };

    const render = () => {
      const seq = seqs[i];
      if (!seq) return;
      renderSeq(el, quiz, seq, i, seqs.length);
      renderList();
      el.prev.disabled = i <= 0;
      el.next.disabled = i >= seqs.length - 1;
    };

    const control = async (action: string) => {
      if (!sessionCode || !hostKey) return;
      await fetchJson(`/api/quiz-control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: sessionCode, hostKey, action }),
      });
    };

    el.prev.addEventListener("click", async () => {
      i = Math.max(0, i - 1);
      render();
      if (!preview) await control("prev");
    });
    el.next.addEventListener("click", async () => {
      i = Math.min(seqs.length - 1, i + 1);
      render();
      if (!preview) await control("next");
    });

    // Session wiring comes in the play-along todo; for preview mode, hide session controls.
    if (preview) {
      el.createSession.hidden = true;
      setJoin("PREVIEW");
    } else {
      el.createSession.addEventListener("click", async () => {
        const res = await fetchJson<{ code: string; hostKey: string }>(`/api/quiz-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: quiz.slug }),
        });
        setJoin(res.code, res.hostKey);
      });
      el.joinLink.textContent = "Click Start session";
      el.qr.removeAttribute("src");
    }

    layoutStage(el.stage, el.fit, 1920, 1080);
    window.addEventListener("resize", () => layoutStage(el.stage, el.fit, 1920, 1080));

    render();
    showApp();
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed to load");
  }
}

void main();

