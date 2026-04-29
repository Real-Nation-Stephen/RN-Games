import { connectLambda } from "@netlify/blobs";
import { readIndex, getWheelJson } from "./lib/blobs.mjs";
import { getSession, setSession } from "./lib/quiz-store.mjs";
import { sessionPublicState } from "./lib/quiz-minimal.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

async function loadQuizForSession(session) {
  const quiz = await getWheelJson(session.quizId);
  const list = await readIndex();
  const idxItem = list.find((x) => x.id === session.quizId);
  const isQuiz = quiz?.gameType === "quiz" || idxItem?.gameType === "quiz";
  if (!quiz || !isQuiz) return null;
  return quiz;
}

export const handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...headers, "Access-Control-Allow-Methods": "POST, OPTIONS" } };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  try {
    const body = JSON.parse(event.body || "{}");
    const code = String(body.code || "").trim().toUpperCase();
    const hostKey = String(body.hostKey || "").trim();
    const action = String(body.action || "");
    if (!code || !hostKey || !action) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "code, hostKey, action required" }) };
    }

    const session = await getSession(code);
    if (!session) return { statusCode: 404, headers, body: JSON.stringify({ error: "Session not found" }) };
    if (String(session.hostKey || "") !== hostKey) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    const quiz = await loadQuizForSession(session);
    if (!quiz) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Quiz missing" }) };
    }
    const seqs = quiz.tracks?.[0]?.sequences || [];
    const maxIdx = Math.max(0, seqs.length - 1);
    const syncReveal = () => {
      const s = seqs[session.currentSequenceIndex];
      const ids = Array.isArray(s?.referencesQuestionIds) ? s.referencesQuestionIds.filter(Boolean) : [];
      const isMultiReveal = s?.type === "reveal" && ids.length > 0;
      if (isMultiReveal) {
        session.revealSeqId = s.id;
        session.revealShown = typeof session.revealShown === "number" && session.revealShown >= 0 ? session.revealShown : 0;
      } else {
        session.revealSeqId = undefined;
        session.revealShown = undefined;
      }
    };

    if (action === "lockLobby") {
      session.lobbyOpen = false;
      syncReveal();
    } else if (action === "prev") {
      session.currentSequenceIndex = clamp(Number(session.currentSequenceIndex || 0) - 1, 0, maxIdx);
      session.bonus = null;
      const s = seqs[session.currentSequenceIndex];
      // For play-along, do NOT auto-open questions on navigation.
      // Host explicitly starts the timer (and unlocks answers) via action === "open".
      if (s?.type === "question") {
        session.phase = "closed";
        session.openedAt = null;
        session.closesAt = null;
      } else {
        session.phase = "closed";
        session.openedAt = null;
        session.closesAt = null;
      }
      // Reset multi-reveal progress when landing on a reveal slide.
      const ids = Array.isArray(s?.referencesQuestionIds) ? s.referencesQuestionIds.filter(Boolean) : [];
      if (s?.type === "reveal" && ids.length > 0) {
        session.revealSeqId = s.id;
        session.revealShown = 0;
      } else {
        session.revealSeqId = undefined;
        session.revealShown = undefined;
      }
    } else if (action === "next") {
      session.currentSequenceIndex = clamp(Number(session.currentSequenceIndex || 0) + 1, 0, maxIdx);
      session.bonus = null;
      const s = seqs[session.currentSequenceIndex];
      if (s?.type === "question") {
        session.phase = "closed";
        session.openedAt = null;
        session.closesAt = null;
      } else {
        session.phase = "closed";
        session.openedAt = null;
        session.closesAt = null;
      }
      const ids = Array.isArray(s?.referencesQuestionIds) ? s.referencesQuestionIds.filter(Boolean) : [];
      if (s?.type === "reveal" && ids.length > 0) {
        session.revealSeqId = s.id;
        session.revealShown = 0;
      } else {
        session.revealSeqId = undefined;
        session.revealShown = undefined;
      }
    } else if (action === "open") {
      session.phase = "open";
      session.openedAt = Date.now();
      const s = seqs[session.currentSequenceIndex];
      const seconds = Number(s?.timerSeconds || 0);
      session.closesAt = seconds > 0 ? session.openedAt + seconds * 1000 : null;
      session.bonus = null;
      syncReveal();
    } else if (action === "close") {
      const s = seqs[session.currentSequenceIndex];
      const bonusEnabled = quiz.playAlong?.bonus?.fastestCorrectSteal === true;
      const stealPoints = Math.min(1000, Math.max(10, Number(quiz.playAlong?.bonus?.stealPoints) || 100));
      /** `bonusStealEligible === false` opts out; missing/undefined keeps previous global behaviour. */
      const qEligible = s?.type === "question" && s?.bonusStealEligible !== false;
      if (bonusEnabled && qEligible) {
        const ans = Array.isArray(session.answers?.[s.id]) ? session.answers[s.id] : [];
        const correct = ans.filter((a) => a && a.correct === true && a.participantId && typeof a.submittedAt === "number");
        correct.sort((a, b) => a.submittedAt - b.submittedAt);
        const winner = correct[0]?.participantId;
        if (winner) {
          session.phase = "bonus";
          session.bonus = { kind: "fastestCorrectSteal", winnerId: winner, points: stealPoints };
        } else {
          session.phase = "closed";
          session.bonus = null;
        }
      } else {
        session.phase = "closed";
        session.bonus = null;
      }
      session.openedAt = null;
      session.closesAt = null;
      syncReveal();
    } else if (action === "revealNext") {
      const s = seqs[session.currentSequenceIndex];
      const ids = Array.isArray(s?.referencesQuestionIds) ? s.referencesQuestionIds.filter(Boolean) : [];
      if (s?.type === "reveal" && ids.length > 0) {
        session.revealSeqId = s.id;
        const cur = typeof session.revealShown === "number" ? session.revealShown : 0;
        session.revealShown = Math.min(ids.length, Math.max(0, cur) + 1);
      } else {
        session.revealSeqId = undefined;
        session.revealShown = undefined;
      }
    } else if (action === "end") {
      session.phase = "ended";
      session.openedAt = null;
      session.closesAt = null;
      session.bonus = null;
      session.lobbyOpen = false;
      syncReveal();
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action" }) };
    }

    session.revision = Number(session.revision || 0) + 1;
    await setSession(code, session);

    const state = sessionPublicState(session, quiz);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, state }),
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e instanceof Error ? e.message : "Control failed" }) };
  }
};
