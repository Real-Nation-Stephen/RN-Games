import { connectLambda } from "@netlify/blobs";
import { getWheelJson } from "./lib/blobs.mjs";
import { getSession, setSession } from "./lib/quiz-store.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...headers, "Access-Control-Allow-Methods": "POST, OPTIONS" } };
  }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  try {
    const body = JSON.parse(event.body || "{}");
    const code = String(body.code || "").trim().toUpperCase();
    const participantId = String(body.participantId || "").trim();
    const answer = body.answer || null;
    if (!code || !participantId || !answer) return { statusCode: 400, headers, body: JSON.stringify({ error: "code, participantId, answer required" }) };

    const session = await getSession(code);
    if (!session) return { statusCode: 404, headers, body: JSON.stringify({ error: "Session not found" }) };
    if (session.phase !== "open") return { statusCode: 423, headers, body: JSON.stringify({ error: "Answers locked" }) };

    const quiz = await getWheelJson(session.quizId);
    if (!quiz || quiz.gameType !== "quiz") return { statusCode: 500, headers, body: JSON.stringify({ error: "Quiz missing" }) };
    const seq = quiz.tracks?.[0]?.sequences?.[session.currentSequenceIndex];
    if (!seq || seq.type !== "question") return { statusCode: 400, headers, body: JSON.stringify({ error: "Not a question" }) };

    const pid = participantId;
    const already = (session.answers?.[seq.id] || []).some((x) => x.participantId === pid);
    if (already) return { statusCode: 204, headers, body: "" };

    const pointsCorrect = Number(seq.scoring?.pointsCorrect ?? 100);
    const pointsWrong = Number(seq.scoring?.pointsWrong ?? 0);

    let correct = false;
    if (seq.input?.type === "buttons") {
      correct = String(answer.choiceId || "") === String(seq.correct?.choiceId || "");
    }

    const award = correct ? pointsCorrect : pointsWrong;
    session.answers = session.answers || {};
    session.answers[seq.id] = Array.isArray(session.answers[seq.id]) ? session.answers[seq.id] : [];
    session.answers[seq.id].push({
      participantId: pid,
      value: answer,
      submittedAt: Date.now(),
      correct,
      pointsAwarded: award,
    });

    session.participants = Array.isArray(session.participants) ? session.participants : [];
    const p = session.participants.find((x) => x.id === pid);
    if (p) p.score = Number(p.score || 0) + award;

    session.revision = Number(session.revision || 0) + 1;
    await setSession(code, session);
    return { statusCode: 204, headers, body: "" };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e instanceof Error ? e.message : "Answer failed" }) };
  }
};

