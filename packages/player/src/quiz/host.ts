import type { QuizConfig, SessionState } from "./types";
import { byId, fetchJson, fetchQuiz, qs, setFavicon, showApp, showError } from "./lib";
import { layoutStage } from "./layout";
import { applyQuizSurface } from "./quiz-theme";
import { quizSessionEndpoint, quizSessionGetUrl } from "./api-path";
import { firstTrack, renderSequence, type SequenceStageEls } from "./sequence-render";
import { ensureQuizFontFaces } from "./font-loader";

const HOST_STORAGE_KEY = "rngames-quiz-host";

type HostStored = { slug: string; code: string; hostKey: string };

type Els = SequenceStageEls & {
  logo: HTMLImageElement;
  title: HTMLElement;
  sub: HTMLElement;
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
  createSession: HTMLButtonElement;
  joinLink: HTMLElement;
  qr: HTMLImageElement;
  presentPreview: HTMLIFrameElement;
  presentPreviewRefresh: HTMLButtonElement;
  list: HTMLOListElement;
  participantCount: HTMLElement;
  participants: HTMLElement;
  lockLobby: HTMLButtonElement;
  startTimer: HTMLButtonElement;
  revealNext: HTMLButtonElement;
  answered: HTMLElement;
  timer: HTMLElement;
  openPresent: HTMLButtonElement;
  openLeaderboard: HTMLButtonElement;
  lobbyHint: HTMLElement;
  sessionLost: HTMLElement;
};

function loadHostSession(): HostStored | null {
  try {
    const raw = sessionStorage.getItem(HOST_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HostStored;
  } catch {
    return null;
  }
}

function saveHostSession(slug: string, code: string, hostKey: string) {
  sessionStorage.setItem(HOST_STORAGE_KEY, JSON.stringify({ slug, code, hostKey }));
}

function clearHostSession() {
  sessionStorage.removeItem(HOST_STORAGE_KEY);
}

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
    presentPreview: byId("quiz-present-preview"),
    presentPreviewRefresh: byId("quiz-present-preview-refresh"),
    list: byId("quiz-seq-list"),
    participantCount: byId("quiz-participant-count"),
    participants: byId("quiz-participants"),
    lockLobby: byId("quiz-lock-lobby"),
    startTimer: byId("quiz-start-timer"),
    revealNext: byId("quiz-reveal-next"),
    answered: byId("quiz-answered"),
    timer: byId("quiz-timer"),
    openPresent: byId("quiz-open-present"),
    openLeaderboard: byId("quiz-open-leaderboard"),
    lobbyHint: byId("quiz-lobby-hint"),
    sessionLost: byId("quiz-session-lost"),
  };
}

function getSlug(): string {
  const p = qs().get("slug");
  if (p) return p;
  const seg = window.location.pathname.split("/").filter(Boolean);
  const i = seg.indexOf("quiz");
  if (i >= 0 && seg[i + 1]) return seg[i + 1];
  throw new Error("Missing slug");
}

async function main() {
  try {
    const preview = qs().get("preview") === "1";
    const slug = preview ? (qs().get("slug") || "") : getSlug();
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
    ensureQuizFontFaces(quiz);

    const debugQuiz =
      qs().get("debugQuiz") === "1" ||
      (typeof window !== "undefined" && window.localStorage?.getItem("rngames-debug-quiz") === "1");

    if (quiz.faviconUrl) setFavicon(quiz.faviconUrl);
    const el = getEls();
    const appRoot = byId("app");
    applyQuizSurface(appRoot, quiz, "host");

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
    let rev = 0;

    const playMode = preview ? "facilitated" : (quiz.playMode || (quiz.playAlong?.enabled ? "playAlong" : "facilitated"));
    const facilitatedKey = `rngames-quiz-facilitated:${quiz.slug}:idx`;
    const facilitatedChan = `rngames-quiz-facilitated:${quiz.slug}`;
    const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(facilitatedChan) : null;

    let sessionCode = "";
    let hostKey = "";
    let navBusy = false;
    /** After POST /quiz-session, GET may briefly 404 (blobs / edge). Retry before treating as dead. */
    let sessionYoungUntil = 0;

    async function fetchQuizSessionRaw(code: string, revNum: number): Promise<Response> {
      let last: Response | undefined;
      const max = 6;
      for (let attempt = 0; attempt < max; attempt++) {
        const url = quizSessionGetUrl({
          code,
          rev: String(revNum),
          cb: `${Date.now()}-${attempt}`,
        });
        last = await fetch(url, { cache: "no-store" });
        if (debugQuiz) {
          const peek = await last.clone().text();
          console.info("[rngames quiz-host] session poll", { url, status: last.status, bodyPreview: peek.slice(0, 200) });
        }
        if (last.status !== 404) return last;
        const mayRetry = Date.now() < sessionYoungUntil || attempt < 4;
        if (!mayRetry) return last;
        await new Promise((r) => setTimeout(r, 100 + attempt * 75));
      }
      return last!;
    }

    const setJoin = (code: string, key?: string) => {
      sessionCode = code;
      if (key) hostKey = key;
      const u = new URL(window.location.origin);
      u.pathname = `/quiz/${quiz.slug}/join/${code}`;
      el.joinLink.textContent = u.toString();
      const enc = encodeURIComponent(u.toString());
      /** Primary + fallback CDNs — avoids single-provider failures in the field. */
      el.qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${enc}`;
      el.qr.dataset.fallback = `https://chart.googleapis.com/chart?cht=qr&chs=280x280&chl=${enc}`;
      el.qr.removeAttribute("hidden");
      el.openPresent.disabled = false;
      el.openLeaderboard.disabled = false;
      el.sessionLost.setAttribute("hidden", "true");

      // Keep the host preview in sync with the real presentation view.
      const presentUrl =
        playMode === "playAlong"
          ? `${window.location.origin}/quiz/${quiz.slug}/present/${code}?embed=1`
          : `${window.location.origin}/quiz/${quiz.slug}/present?embed=1`;

      // Blob/session consistency can cause Present to 404 briefly. Use cachebusted retries.
      const setPreviewSrc = () => {
        const cb = Date.now();
        const glue = presentUrl.includes("?") ? "&" : "?";
        el.presentPreview.src = `${presentUrl}${glue}cb=${cb}`;
      };
      setPreviewSrc();
      window.setTimeout(setPreviewSrc, 900);
      window.setTimeout(setPreviewSrc, 2200);
    };

    el.presentPreviewRefresh.addEventListener("click", () => {
      try {
        const src = el.presentPreview.src;
        if (!src) return;
        // cachebust refresh
        const u = new URL(src);
        u.searchParams.set("cb", String(Date.now()));
        el.presentPreview.src = u.toString();
      } catch {
        /* ignore */
      }
    });

    // Fullscreen button (host).
    const fsBtn = document.getElementById("quiz-fs-btn") as HTMLButtonElement | null;
    if (fsBtn) {
      const canFs = typeof document !== "undefined" && !!document.documentElement?.requestFullscreen;
      if (!canFs) fsBtn.setAttribute("hidden", "true");
      fsBtn.addEventListener("click", async () => {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else await document.documentElement.requestFullscreen();
        } catch {
          /* ignore */
        }
      });
    }

    const renderList = () => {
      el.list.innerHTML = "";
      seqs.forEach((s, idx) => {
        const sectionTitle = (s as { section?: { title?: string } })?.section?.title;
        if (sectionTitle) {
          const head = document.createElement("li");
          head.className = "quiz-section-head";
          head.textContent = sectionTitle;
          el.list.appendChild(head);
        }
        const li = document.createElement("li");
        li.style.opacity = idx === i ? "1" : "0.72";
        const label =
          s.type === "question"
            ? s.prompt.text
            : s.type === "reveal"
              ? s.title || s.referencesQuestionId
              : (s as { headline?: string; title?: string }).headline || s.title || s.id;
        li.innerHTML = `<code>${s.type}</code> <span style="opacity:0.85">${label || ""}</span>`;
        el.list.appendChild(li);
      });
    };

    const renderParticipants = (parts: SessionState["participants"]) => {
      const list = Array.isArray(parts) ? parts : [];
      el.participantCount.textContent = String(list.length);
      el.participants.innerHTML = "";
      const max = 20;
      list.slice(0, max).forEach((p) => {
        const chip = document.createElement("span");
        chip.className = "quiz-participant-chip";
        chip.title = String(p.name || "").trim() || "Player";
        const icon = String(p.icon || "").trim();
        const looksLikeUrl = /^https?:\/\//.test(icon) || icon.startsWith("/api/") || icon.startsWith("/play/");
        if (looksLikeUrl) {
          const img = document.createElement("img");
          img.src = icon;
          img.alt = "";
          img.loading = "lazy";
          img.decoding = "async";
          img.style.width = "22px";
          img.style.height = "22px";
          img.style.objectFit = "contain";
          img.style.borderRadius = "8px";
          chip.textContent = "";
          chip.appendChild(img);
        } else {
          chip.textContent = icon || "•";
        }
        el.participants.appendChild(chip);
      });
      if (list.length > max) {
        const more = document.createElement("span");
        more.className = "quiz-participant-more";
        more.textContent = `+${list.length - max}`;
        el.participants.appendChild(more);
      }
    };

    const updateLobbyUi = (state: Pick<SessionState, "lobbyOpen">) => {
      const open = state.lobbyOpen !== false;
      el.lockLobby.textContent = open ? "Lock lobby (start game)" : "Lobby locked";
      el.lockLobby.disabled = !open;
      el.lobbyHint.textContent = open ? "Players can still join." : "No new players can join this room.";
    };

    const applyServerState = (state: SessionState) => {
      // Expose latest state for the lightweight timer tick.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__rngamesHostState = state;
      rev = state.revision;
      i = Math.max(0, Math.min(seqs.length - 1, Number(state.currentSequenceIndex) || 0));
      const seq = seqs[i];
      // Host "preview" is rendered via iframe; avoid rendering the full stage content here.
      renderList();
      el.prev.disabled = i <= 0 || navBusy;
      el.next.disabled = i >= seqs.length - 1 || navBusy;
      renderParticipants(state.participants);
      updateLobbyUi(state);

      const isQuestion = state.current?.type === "question";
      const canStart = isQuestion && state.phase !== "open" && !navBusy;
      el.startTimer.disabled = !canStart;

      const revealIds = (seq as any)?.type === "reveal" ? ((seq as any).referencesQuestionIds as string[] | undefined) : undefined;
      const canReveal = playMode === "playAlong" && Array.isArray(revealIds) && revealIds.filter(Boolean).length > 0;
      if (canReveal) el.revealNext.removeAttribute("hidden");
      else el.revealNext.setAttribute("hidden", "true");

      if (isQuestion && playMode === "playAlong") {
        const a = Number(state.answeredCount || 0);
        const n = (state.participants || []).length;
        el.answered.textContent = `${a} / ${n} answered`;
        el.answered.hidden = false;
      } else {
        el.answered.hidden = true;
      }
    };

    el.startTimer.addEventListener("click", async () => {
      if (!sessionCode || !hostKey) return;
      el.startTimer.disabled = true;
      try {
        await control("open");
      } catch {
        await pollOnce();
      }
    });

    // Timer countdown UI (host).
    let lastBeepSecond = -1;
    let audioCtx: AudioContext | null = null;
    const beep = (freq = 880, ms = 85) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtx) audioCtx = new Ctx();
        const ctx = audioCtx;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        g.gain.value = 0.0001;
        o.connect(g);
        g.connect(ctx.destination);
        const now = ctx.currentTime;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.12, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
        o.start(now);
        o.stop(now + ms / 1000);
      } catch {
        /* ignore */
      }
    };
    const tickTimer = () => {
      try {
        // rev/phase are updated via polling; we only render remaining time here.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stAny = (window as any).__rngamesHostState as SessionState | undefined;
        const st = stAny;
        if (st?.phase === "open" && typeof st.closesAt === "number") {
          const ms = Math.max(0, st.closesAt - Date.now());
          const s = Math.ceil(ms / 1000);
          el.timer.textContent = `⏱ ${s}s`;
          el.timer.hidden = false;
          if (s > 0 && s <= 5 && s !== lastBeepSecond) {
            lastBeepSecond = s;
            beep(s <= 2 ? 1040 : 880, 75);
          }
        } else {
          el.timer.hidden = true;
          lastBeepSecond = -1;
        }
      } catch {
        el.timer.hidden = true;
      } finally {
        window.setTimeout(tickTimer, 200);
      }
    };
    tickTimer();

    const render = () => {
      const seq = seqs[i];
      if (!seq) return;
      // Host preview is rendered via iframe.
      renderList();
      el.prev.disabled = i <= 0 || navBusy;
      el.next.disabled = i >= seqs.length - 1 || navBusy;
    };

    const broadcastFacilitatedIdx = () => {
      if (playMode !== "facilitated") return;
      try {
        localStorage.setItem(facilitatedKey, String(i));
      } catch {
        /* ignore */
      }
      bc?.postMessage({ type: "idx", idx: i });
    };

    const pollOnce = async () => {
      if (!sessionCode || preview || pollDead) return;
      const res = await fetchQuizSessionRaw(sessionCode, rev);
      if (res.status === 404 || res.status === 410) {
        /** fetchQuizSessionRaw can still return 404 after inner retries; do not drop a brand-new room while blobs catch up. */
        if (res.status === 404 && Date.now() < sessionYoungUntil) return;
        handleSessionMissing();
        return;
      }
      if (!res.ok) return;
      sessionYoungUntil = 0;
      const r = (await res.json()) as { changed: boolean; state: SessionState | null };
      if (r.changed && r.state) applyServerState(r.state);
    };

    let pollStarted = false;
    let pollDead = false;

    const handleSessionMissing = () => {
      pollDead = true;
      sessionYoungUntil = 0;
      clearHostSession();
      sessionCode = "";
      hostKey = "";
      el.joinLink.textContent = "Start a session to get a join link.";
      el.qr.setAttribute("hidden", "true");
      el.openPresent.disabled = true;
      el.openLeaderboard.disabled = true;
      el.lockLobby.disabled = true;
      el.lobbyHint.textContent = "Session no longer available.";
      el.sessionLost.removeAttribute("hidden");
      rev = 0;
      render();
      renderParticipants([]);
    };

    const ensurePolling = () => {
      if (preview || pollStarted) return;
      pollStarted = true;
      const tick = async () => {
        if (!pollDead) await pollOnce();
        window.setTimeout(tick, pollDead ? 2000 : 320);
      };
      void tick();
    };

    const control = async (action: string) => {
      if (!sessionCode || !hostKey) return;
      const data = await fetchJson<{ ok?: boolean; state: SessionState }>(`/api/quiz-control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: sessionCode, hostKey, action }),
      });
      if (data?.state) applyServerState(data.state);
    };

    el.prev.addEventListener("click", async () => {
      if (preview) {
        i = Math.max(0, i - 1);
        render();
        return;
      }
      if (!sessionCode || !hostKey || navBusy) return;
      navBusy = true;
      el.prev.disabled = true;
      el.next.disabled = true;
      try {
        await control("prev");
      } catch {
        await pollOnce();
        render();
      } finally {
        navBusy = false;
        const seq = seqs[i];
        if (seq) {
          el.prev.disabled = i <= 0;
          el.next.disabled = i >= seqs.length - 1;
        }
      }
    });

    el.next.addEventListener("click", async () => {
      if (preview) {
        i = Math.min(seqs.length - 1, i + 1);
        render();
        return;
      }
      if (!sessionCode || !hostKey || navBusy) return;
      navBusy = true;
      el.prev.disabled = true;
      el.next.disabled = true;
      try {
        await control("next");
      } catch {
        await pollOnce();
        render();
      } finally {
        navBusy = false;
        const seq = seqs[i];
        if (seq) {
          el.prev.disabled = i <= 0;
          el.next.disabled = i >= seqs.length - 1;
        }
      }
    });

    el.lockLobby.addEventListener("click", async () => {
      if (!sessionCode || !hostKey) return;
      el.lockLobby.disabled = true;
      try {
        await control("lockLobby");
      } catch {
        await pollOnce();
      } finally {
        el.lockLobby.disabled = false;
      }
    });

    el.revealNext.addEventListener("click", async () => {
      if (preview) return;
      if (!sessionCode || !hostKey || navBusy) return;
      el.revealNext.disabled = true;
      try {
        await control("revealNext");
      } catch {
        await pollOnce();
      } finally {
        el.revealNext.disabled = false;
      }
    });

    const openWindow = (path: string) => {
      window.open(path, "quiz-popout", "noopener,noreferrer,width=1280,height=720");
    };

    el.openPresent.addEventListener("click", () => {
      if (playMode === "playAlong") {
        if (!sessionCode) return;
        openWindow(`/quiz/${quiz.slug}/present/${sessionCode}`);
      } else {
        openWindow(`/quiz/${quiz.slug}/present`);
      }
    });

    el.openLeaderboard.addEventListener("click", () => {
      if (playMode !== "playAlong") return;
      if (!sessionCode) return;
      openWindow(`/quiz/${quiz.slug}/live/${sessionCode}/leaderboard`);
    });

    if (preview) {
      el.createSession.hidden = true;
      el.lockLobby.hidden = true;
      el.openPresent.hidden = true;
      el.openLeaderboard.hidden = true;
      el.lobbyHint.hidden = true;
      setJoin("PREVIEW");
    } else {
      if (playMode === "kiosk") {
        // Kiosk has no host controller; use this screen as a launcher.
        el.createSession.textContent = "Open kiosk";
        el.openPresent.textContent = "Kiosk";
        el.openPresent.disabled = false;
        el.openLeaderboard.hidden = true;
        el.lockLobby.hidden = true;
        el.lobbyHint.textContent = "Kiosk mode runs on the presentation device.";
        // Hide join panel + players list.
        const right = document.querySelector(".quiz-right") as HTMLElement | null;
        if (right) right.style.display = "none";
        el.createSession.addEventListener("click", () => {
          window.location.href = `/quiz/${quiz.slug}/kiosk`;
        });
        layoutStage(el.stage, el.fit, 1920, 1080);
        window.addEventListener("resize", () => layoutStage(el.stage, el.fit, 1920, 1080));
        showApp();
        return;
      } else if (playMode === "facilitated") {
        // Facilitated: no session storage, no join links; host drives locally + broadcasts to present.
        el.createSession.textContent = "Start (facilitated)";
        el.openPresent.disabled = false;
        el.openLeaderboard.hidden = true;
        el.lockLobby.hidden = true;
        el.lobbyHint.textContent = "Facilitated mode: no player join. Use Prev/Next to run the room.";
        const right = document.querySelector(".quiz-right") as HTMLElement | null;
        if (right) right.style.display = "none";

        // Restore last local index if available.
        try {
          const raw = localStorage.getItem(facilitatedKey);
          const n = raw ? Number(raw) : 0;
          if (Number.isFinite(n)) i = Math.max(0, Math.min(seqs.length - 1, n));
        } catch {
          /* ignore */
        }
        render();
        broadcastFacilitatedIdx();

        el.createSession.addEventListener("click", () => {
          i = 0;
          render();
          broadcastFacilitatedIdx();
        });

        el.prev.addEventListener("click", () => {
          if (navBusy) return;
          i = Math.max(0, i - 1);
          render();
          broadcastFacilitatedIdx();
        });
        el.next.addEventListener("click", () => {
          if (navBusy) return;
          i = Math.min(seqs.length - 1, i + 1);
          render();
          broadcastFacilitatedIdx();
        });

        // Disable play-along handlers below by short-circuiting.
        layoutStage(el.stage, el.fit, 1920, 1080);
        window.addEventListener("resize", () => layoutStage(el.stage, el.fit, 1920, 1080));
        showApp();
        return;
      }

      el.joinLink.textContent = "Start a session to get a join link.";
      el.qr.setAttribute("hidden", "true");
      el.openPresent.disabled = true;
      el.openLeaderboard.disabled = true;

      const stored = loadHostSession();
      if (stored && stored.slug === quiz.slug) {
        sessionCode = stored.code;
        hostKey = stored.hostKey;
        setJoin(stored.code);
        const bootRes = await fetchQuizSessionRaw(sessionCode, 0);
        if (bootRes.status === 404 || bootRes.status === 410) {
          handleSessionMissing();
        } else if (bootRes.ok) {
          const boot = (await bootRes.json()) as { changed: boolean; state: SessionState | null };
          if (boot.changed && boot.state) {
            applyServerState(boot.state);
          } else {
            render();
            renderParticipants([]);
            updateLobbyUi({ lobbyOpen: true });
          }
          ensurePolling();
        } else {
          clearHostSession();
          sessionCode = "";
          hostKey = "";
          el.joinLink.textContent = "Start a session to get a join link.";
          el.qr.setAttribute("hidden", "true");
          el.openPresent.disabled = true;
          el.openLeaderboard.disabled = true;
        }
      }

      el.createSession.addEventListener("click", async () => {
        pollDead = false;
        /** Blob reads can lag writes longer than a single request; keep UI alive until polls succeed or this expires. */
        sessionYoungUntil = Date.now() + 120000;
        const res = await fetchJson<{ code: string; hostKey: string; state?: SessionState }>(quizSessionEndpoint(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: quiz.slug }),
        });
        if (debugQuiz) {
          console.info("[rngames quiz-host] POST start session OK", { endpoint: quizSessionEndpoint(), code: res.code });
        }
        saveHostSession(quiz.slug, res.code, res.hostKey);
        setJoin(res.code, res.hostKey);
        if (res.state) applyServerState(res.state);
        else render();
        el.lockLobby.disabled = false;
        el.lobbyHint.textContent = "Players can still join.";
        ensurePolling();
      });

      el.qr.addEventListener("error", () => {
        const fb = el.qr.dataset.fallback;
        if (fb && el.qr.src !== fb) el.qr.src = fb;
      });
    }

    layoutStage(el.stage, el.fit, 1920, 1080);
    window.addEventListener("resize", () => layoutStage(el.stage, el.fit, 1920, 1080));

    if (!preview && !sessionCode) {
      render();
      renderParticipants([]);
      el.lockLobby.disabled = true;
      el.lobbyHint.textContent = "Start a session first.";
    } else if (preview) {
      render();
    }

    showApp();
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed to load");
  }
}

void main();
