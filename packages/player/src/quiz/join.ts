import type { SessionState } from "./types";
import { byId, fetchJson, fetchQuiz, qs, setFavicon, showApp, showError } from "./lib";
import { quizSessionGetUrl } from "./api-path";
import { applyQuizSurface } from "./quiz-theme";
import { ensureQuizFontFaces } from "./font-loader";

const DEFAULT_ICONS = ["🐯", "🦊", "🐼", "🐸", "🐙", "🦁", "🐵", "🦉", "🐰", "🐺", "🐝", "🦄"];

function storageKey(slug: string, code: string) {
  return `rngames-quiz-player:${slug}:${code}`;
}

function getSlugAndCode() {
  const slug = qs().get("slug");
  const code = qs().get("code");
  if (slug && code) return { slug, code: code.toUpperCase() };
  const seg = window.location.pathname.split("/").filter(Boolean);
  const i = seg.indexOf("quiz");
  const slug2 = i >= 0 ? seg[i + 1] : "";
  const code2 = i >= 0 ? seg[i + 3] : "";
  if (!slug2 || !code2) throw new Error("Missing slug/code");
  return { slug: slug2, code: code2.toUpperCase() };
}

async function pollSession(code: string, rev: number) {
  const url = quizSessionGetUrl({ code, rev: String(rev), cb: String(Date.now()) });
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  const t = await res.text();
  if (!t) throw new Error("Empty session response");
  return JSON.parse(t) as { state: SessionState; changed: boolean };
}

async function postJoin(body: Record<string, unknown>) {
  const res = await fetch(`/api/quiz-join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await res.text();
  if (!res.ok) {
    let msg = t || `HTTP ${res.status}`;
    try {
      const j = JSON.parse(t) as { error?: string; code?: string };
      if (j.code === "lobby_closed" || /lobby_closed/i.test(String(j.error))) {
        msg = "This game has already started — new players cannot join.";
      } else if (j.error) {
        msg = j.error;
      }
    } catch {
      /* plain text */
    }
    throw new Error(msg);
  }
  return t ? (JSON.parse(t) as { participantId: string; reconnected?: boolean }) : { participantId: "" };
}

function looksLikeUrl(s: string) {
  return /^https?:\/\//.test(s) || s.startsWith("/api/") || s.startsWith("/play/");
}

function renderIcons(
  root: HTMLElement,
  icons: string[],
  active: { value: string },
  taken: Set<string>,
  onPick: () => void,
) {
  root.innerHTML = "";
  for (const i of icons) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `quiz-icon ${active.value === i ? "is-active" : ""}`;
    const isTaken = taken.has(i) && active.value !== i;
    b.disabled = isTaken;
    if (isTaken) b.title = "Taken";
    if (looksLikeUrl(i)) {
      b.textContent = "";
      const img = document.createElement("img");
      img.src = i;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "contain";
      img.style.borderRadius = "10px";
      b.appendChild(img);
    } else {
      b.textContent = i;
    }
    b.addEventListener("click", () => {
      active.value = i;
      onPick();
    });
    root.appendChild(b);
  }
}

async function main() {
  try {
    const { slug, code } = getSlugAndCode();
    const debug = qs().get("debug") === "1";
    const quiz = await fetchQuiz(slug);
    const mobileCopy = quiz.branding?.mobileCopy || {};
    if (quiz.faviconUrl) setFavicon(quiz.faviconUrl);
    ensureQuizFontFaces(quiz);
    applyQuizSurface(byId("app"), quiz, "mobile");

    const logo = byId<HTMLImageElement>("quiz-logo");
    const title = byId("quiz-title");
    const sub = byId("quiz-sub");
    const joinStep = byId("join-step");
    const playStep = byId("play-step");
    const joinTitle = byId("join-title");
    const joinNameLabel = byId("join-name-label");
    const joinIconLabel = byId("join-icon-label");
    const joinHelp = byId("join-help");
    const name = byId<HTMLInputElement>("join-name");
    const icons = byId("join-icons");
    const joinBtn = byId<HTMLButtonElement>("join-btn");

    const playStatus = byId("play-status");
    const playQuestion = byId("play-question");
    const playAnswers = byId("play-answers");
    const playWait = byId("play-wait");
    const playTimer = document.getElementById("play-timer") as HTMLElement | null;
    const playSubmit = byId<HTMLButtonElement>("play-submit");
    const playHolding = byId("play-holding");
    const playSubmitted = byId("play-submitted");

    title.textContent = quiz.title || "Quiz";
    sub.textContent = `Code: ${code}`;
    const logoUrl = (quiz.branding?.logoUrl || "").trim();
    if (logoUrl) {
      logo.src = logoUrl;
      logo.style.display = "block";
    }

    const iconSetRaw = String(quiz.branding?.mobile?.playerIconSetUrl || "").trim();
    const iconSet = iconSetRaw
      ? iconSetRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : DEFAULT_ICONS;
    if (debug) {
      const d = document.getElementById("debug-icons");
      if (d) {
        d.textContent = `icons: ${iconSetRaw ? iconSet.length : 0}`;
        d.removeAttribute("hidden");
      }
    }
    const picked = { value: iconSet[0] || DEFAULT_ICONS[0] };
    const takenIcons = new Set<string>();
    const syncTaken = (state: SessionState | null) => {
      takenIcons.clear();
      const parts = state?.participants || [];
      for (const p of parts) {
        const v = String(p?.icon || "").trim();
        if (v) takenIcons.add(v);
      }
      // If the currently selected icon is taken (and we haven't joined yet),
      // auto-select the first available icon so the UI stays accurate.
      if (!participantId && picked.value && takenIcons.has(picked.value)) {
        const next = iconSet.find((x) => !takenIcons.has(x)) || picked.value;
        picked.value = next;
      }
    };
    const rerenderIcons = () => renderIcons(icons, iconSet, picked, takenIcons, rerenderIcons);
    rerenderIcons();

    let participantId = "";
    let rev = 0;
    let lastQuestionId = "";
    let selectedChoiceId = "";
    let submittedForQuestionId = "";

    const key = storageKey(slug, code);

    // Apply customizable copy.
    joinTitle.textContent = mobileCopy.joinTitle || "Join";
    joinNameLabel.textContent = mobileCopy.joinNameLabel || "Your name (player / team)";
    name.placeholder = mobileCopy.joinNamePlaceholder || "Type a name…";
    joinIconLabel.textContent = mobileCopy.joinIconLabel || "Icon";
    joinBtn.textContent = mobileCopy.joinButtonLabel || "Join session";
    joinHelp.textContent = mobileCopy.joinHelpText || "You’ll be locked to the host screen — no skipping ahead.";
    playSubmit.textContent = mobileCopy.submitButtonLabel || "Submit answer";
    playSubmitted.textContent = mobileCopy.submittedText || "Your answer has been recorded.";

    const setPlayVisible = () => {
      joinStep.setAttribute("hidden", "true");
      playStep.removeAttribute("hidden");
    };

    const setJoinVisible = () => {
      joinStep.removeAttribute("hidden");
      playStep.setAttribute("hidden", "true");
    };

    const renderQuestion = (state: SessionState) => {
      playStatus.textContent = `Session ${state.code} • ${state.phase}`;
      playSubmit.disabled = true;
      playHolding.setAttribute("hidden", "true");
      if (playTimer) playTimer.setAttribute("hidden", "true");
      if (state.phase === "bonus" && state.bonus?.kind === "fastestCorrectSteal") {
        const winner = state.bonus.winnerId;
        if (participantId && winner === participantId) {
          playQuestion.textContent = "Bonus: steal points";
          playWait.textContent = "Pick a player/team to steal points from.";
          playAnswers.innerHTML = "";
          const choices = (state.participants || []).filter((p) => p.id !== participantId);
          choices.slice(0, 10).forEach((p) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "quiz-answer";
            const icon = String(p.icon || "").trim();
            const looks = looksLikeUrl(icon);
            if (looks) {
              b.textContent = "";
              b.style.display = "flex";
              b.style.alignItems = "center";
              b.style.gap = "10px";
              const img = document.createElement("img");
              img.src = icon;
              img.alt = "";
              img.loading = "lazy";
              img.decoding = "async";
              img.style.width = "26px";
              img.style.height = "26px";
              img.style.objectFit = "contain";
              img.style.borderRadius = "8px";
              b.appendChild(img);
              b.appendChild(document.createTextNode(String(p.name || "Player")));
            } else {
              b.textContent = `${icon} ${p.name}`.trim();
            }
            b.addEventListener("click", async () => {
              try {
                await fetchJson(`/api/quiz-bonus`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ code: state.code, participantId, victimId: p.id }),
                });
              } catch {
                /* ignore */
              }
            });
            playAnswers.appendChild(b);
          });
        } else {
          playQuestion.textContent = "Bonus in progress…";
          playAnswers.innerHTML = "";
          playWait.textContent = "Wait for the host to continue.";
        }
        return;
      }
      const cur = state.current;
      if (!cur) {
        playQuestion.textContent = "Waiting for host…";
        playAnswers.innerHTML = "";
        playWait.textContent = mobileCopy.betweenQuestionsText || "Stay on this screen.";
        return;
      }
      if (cur.type !== "question" || !cur.question) {
        playQuestion.textContent = "Waiting…";
        playAnswers.innerHTML = "";
        playWait.textContent = mobileCopy.betweenQuestionsText || "The host is between questions.";
        return;
      }
      playQuestion.textContent = cur.question.text || "Question";
      const choices = cur.question.choices || [];
      playAnswers.innerHTML = "";
      const canAnswer = state.phase === "open";
      if (playTimer && state.phase === "open" && typeof state.closesAt === "number") {
        const ms = Math.max(0, state.closesAt - Date.now());
        const s = Math.ceil(ms / 1000);
        playTimer.textContent = `⏱ ${s}s`;
        playTimer.removeAttribute("hidden");
      }
      const qid = String(cur.question.id || "");
      if (qid && qid !== lastQuestionId) {
        lastQuestionId = qid;
        selectedChoiceId = "";
        submittedForQuestionId = "";
      }

      // Already submitted for this question: show holding state.
      if (qid && submittedForQuestionId === qid) {
        playAnswers.innerHTML = "";
        playSubmit.disabled = true;
        playHolding.removeAttribute("hidden");
        playWait.textContent = "";
        return;
      }

      for (const c of choices) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `quiz-answer ${selectedChoiceId === c.id ? "is-selected" : ""}`;
        b.textContent = c.label;
        b.disabled = !canAnswer;
        b.addEventListener("click", async () => {
          if (!canAnswer) return;
          selectedChoiceId = c.id;
          // Rerender selection state.
          Array.from(playAnswers.querySelectorAll("button.quiz-answer")).forEach((btn) => btn.classList.remove("is-selected"));
          b.classList.add("is-selected");
          playSubmit.disabled = !selectedChoiceId;
        });
        playAnswers.appendChild(b);
      }
      playWait.textContent = canAnswer
        ? mobileCopy.pickAnswerText || "Pick an answer."
        : state.phase === "closed"
          ? mobileCopy.answersLockedText || "Time’s up — answers are closed."
          : mobileCopy.answersLockedText || "Answers are locked. Wait for the next question.";

      playSubmit.disabled = !canAnswer || !selectedChoiceId;
    };

    playSubmit.addEventListener("click", async () => {
      if (!participantId || !selectedChoiceId) return;
      playSubmit.disabled = true;
      try {
        await fetchJson(`/api/quiz-answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, participantId, answer: { choiceId: selectedChoiceId } }),
        });
        // Mark submitted for current question (best-effort).
        submittedForQuestionId = lastQuestionId || submittedForQuestionId || "1";
        playHolding.removeAttribute("hidden");
        playAnswers.innerHTML = "";
        playWait.textContent = "";
      } catch {
        // If it failed, re-enable submit (keep selection).
        playSubmit.disabled = false;
      }
    });

    joinBtn.addEventListener("click", async () => {
      const displayName = name.value.trim();
      if (!displayName) return;
      joinBtn.disabled = true;
      try {
        const res = await postJoin({ code, slug, name: displayName, icon: picked.value });
        participantId = res.participantId;
        try {
          localStorage.setItem(key, JSON.stringify({ participantId }));
        } catch {
          /* storage full / private mode */
        }
        setPlayVisible();
      } catch (e) {
        joinBtn.disabled = false;
        // Allow user to pick a different icon if their choice was taken.
        const msg = e instanceof Error ? e.message : "";
        if (/icon_taken/i.test(msg)) {
          joinBtn.disabled = false;
          return;
        }
        throw e;
      }
    });

    setJoinVisible();

    const stored = (() => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as { participantId?: string };
      } catch {
        return null;
      }
    })();

    if (stored?.participantId) {
      joinBtn.disabled = true;
      try {
        const res = await postJoin({ code, slug, participantId: stored.participantId });
        participantId = res.participantId;
        setPlayVisible();
      } catch (e) {
        try {
          localStorage.removeItem(key);
        } catch {
          /* ignore */
        }
        const msg = e instanceof Error ? e.message : "Could not rejoin";
        if (msg.includes("already started")) {
          showError(msg);
          return;
        }
      } finally {
        joinBtn.disabled = false;
      }
    }

    showApp();

    const loop = async () => {
      let delay = 520;
      try {
        const r = await pollSession(code, rev);
        if (r.changed && r.state) {
          rev = r.state.revision;
          // Keep icon availability fresh even before joining.
          if (!participantId) {
            syncTaken(r.state);
            rerenderIcons();
          } else {
            // If the user's stored icon becomes taken (rare), keep their own selection allowed.
            syncTaken(r.state);
          }
          if (participantId) renderQuestion(r.state);
          delay = r.state.phase === "open" ? 260 : 400;
        }
      } catch {
        delay = 1200;
      } finally {
        window.setTimeout(loop, delay);
      }
    };
    loop();
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed");
  }
}

void main();
