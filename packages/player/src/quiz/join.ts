import type { QuizConfig, SessionState } from "./types";
import { byId, fetchJson, fetchQuiz, qs, setFavicon, showApp, showError } from "./lib";

const ICONS = ["🐯", "🦊", "🐼", "🐸", "🐙", "🦁", "🐵", "🦉", "🐰", "🐺", "🐝", "🦄"];

function getSlugAndCode() {
  const slug = qs().get("slug");
  const code = qs().get("code");
  if (slug && code) return { slug, code };
  const seg = window.location.pathname.split("/").filter(Boolean);
  const i = seg.indexOf("quiz");
  const slug2 = i >= 0 ? seg[i + 1] : "";
  const code2 = i >= 0 ? seg[i + 3] : "";
  if (!slug2 || !code2) throw new Error("Missing slug/code");
  return { slug: slug2, code: code2 };
}

async function pollSession(code: string, rev: number) {
  return fetchJson<{ state: SessionState; changed: boolean }>(
    `/api/quiz-session?code=${encodeURIComponent(code)}&rev=${encodeURIComponent(String(rev))}`,
  );
}

function renderIcons(root: HTMLElement, active: { value: string }, onPick: () => void) {
  root.innerHTML = "";
  for (const i of ICONS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `quiz-icon ${active.value === i ? "is-active" : ""}`;
    b.textContent = i;
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
    const quiz = await fetchQuiz(slug);
    if (quiz.faviconUrl) setFavicon(quiz.faviconUrl);

    const logo = byId<HTMLImageElement>("quiz-logo");
    const title = byId("quiz-title");
    const sub = byId("quiz-sub");
    const joinStep = byId("join-step");
    const playStep = byId("play-step");
    const name = byId<HTMLInputElement>("join-name");
    const icons = byId("join-icons");
    const joinBtn = byId<HTMLButtonElement>("join-btn");

    const playStatus = byId("play-status");
    const playQuestion = byId("play-question");
    const playAnswers = byId("play-answers");
    const playWait = byId("play-wait");

    title.textContent = quiz.title || "Quiz";
    sub.textContent = `Code: ${code}`;
    const logoUrl = (quiz.branding?.logoUrl || "").trim();
    if (logoUrl) {
      logo.src = logoUrl;
      logo.style.display = "block";
    }

    const picked = { value: ICONS[0] };
    const rerenderIcons = () => renderIcons(icons, picked, rerenderIcons);
    rerenderIcons();

    let participantId = "";
    let rev = 0;

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
            b.textContent = `${p.icon} ${p.name}`;
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
        playWait.textContent = "Stay on this screen.";
        return;
      }
      if (cur.type !== "question" || !cur.question) {
        playQuestion.textContent = "Waiting…";
        playAnswers.innerHTML = "";
        playWait.textContent = "The host is between questions.";
        return;
      }
      playQuestion.textContent = cur.question.text || "Question";
      const choices = cur.question.choices || [];
      playAnswers.innerHTML = "";
      const canAnswer = state.phase === "open";
      for (const c of choices) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "quiz-answer";
        b.textContent = c.label;
        b.disabled = !canAnswer;
        b.addEventListener("click", async () => {
          if (!canAnswer) return;
          b.disabled = true;
          try {
            await fetchJson(`/api/quiz-answer`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: state.code, participantId, answer: { choiceId: c.id } }),
            });
          } catch {
            // ignore in MVP
          }
        });
        playAnswers.appendChild(b);
      }
      playWait.textContent = canAnswer ? "Pick an answer." : "Answers are locked. Wait for the next question.";
    };

    joinBtn.addEventListener("click", async () => {
      const displayName = name.value.trim();
      if (!displayName) return;
      joinBtn.disabled = true;
      try {
        const res = await fetchJson<{ participantId: string }>(`/api/quiz-join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, slug, name: displayName, icon: picked.value }),
        });
        participantId = res.participantId;
        setPlayVisible();
      } catch (e) {
        joinBtn.disabled = false;
        throw e;
      }
    });

    // If already joined, we could store participantId in localStorage. Keep it simple for MVP.
    setJoinVisible();
    showApp();

    // Poll loop (fast when open; slower otherwise).
    const loop = async () => {
      try {
        const r = await pollSession(code, rev);
        if (r.changed) {
          rev = r.state.revision;
          if (participantId) renderQuestion(r.state);
        }
      } catch {
        // ignore; keep looping
      } finally {
        const delay = 900;
        window.setTimeout(loop, delay);
      }
    };
    loop();
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed");
  }
}

void main();

