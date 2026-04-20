import { connectLambda } from "@netlify/blobs";
import { readIndex, getWheelJson } from "./lib/blobs.mjs";
import { getSession, makeSessionCode, nowIso, setSession } from "./lib/quiz-store.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};

function minimalCurrent(quiz, seqIdx) {
  const seq = quiz?.tracks?.[0]?.sequences?.[seqIdx];
  if (!seq) return null;
  if (seq.type !== "question") return { type: seq.type };
  const choices = seq.input?.type === "buttons" ? seq.input.choices || [] : [];
  return { type: "question", question: { text: seq.prompt?.text || "Question", choices } };
}

export const handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } };
  }

  try {
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const slugRaw = String(body.slug || "").trim();
      const slug = slugRaw.toLowerCase();
      if (!slug) return { statusCode: 400, headers, body: JSON.stringify({ error: "slug required" }) };
      const list = await readIndex();
      const item = list.find((x) => String(x.slug || "").toLowerCase() === slug);
      if (!item) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Quiz not found", slug: slugRaw }) };
      }
      const quiz = await getWheelJson(item.id);
      const isQuiz = quiz?.gameType === "quiz" || item.gameType === "quiz";
      if (!quiz || !isQuiz) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Quiz not found", slug: slugRaw }) };
      }

      const maxParticipants = Math.min(500, Math.max(10, Number(quiz.playAlong?.maxParticipants) || 150));
      const retentionHours = Math.min(72, Math.max(1, Number(quiz.playAlong?.retentionHours) || 24));

      let code = makeSessionCode();
      for (let i = 0; i < 6; i++) {
        const existing = await getSession(code);
        if (!existing) break;
        code = makeSessionCode();
      }

      const hostKey = Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
      const createdAt = nowIso();
      const expiresAt = new Date(Date.now() + retentionHours * 3600 * 1000).toISOString();
      const session = {
        revision: 1,
        code,
        hostKey,
        quizId: quiz.id,
        quizSlug: String(quiz.slug || item.slug || slug),
        createdAt,
        expiresAt,
        currentSequenceIndex: 0,
        phase: "lobby",
        openedAt: null,
        closesAt: null,
        participants: [],
        answers: {},
        events: [],
      };
      await setSession(code, session);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          code,
          hostKey,
          maxParticipants,
          state: {
            revision: session.revision,
            code,
            quizId: session.quizId,
            quizSlug: session.quizSlug,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            currentSequenceIndex: session.currentSequenceIndex,
            phase: session.phase,
            openedAt: session.openedAt,
            closesAt: session.closesAt,
            participants: session.participants,
            current: minimalCurrent(quiz, session.currentSequenceIndex),
          },
        }),
      };
    }

    if (event.httpMethod === "GET") {
      const code = String(event.queryStringParameters?.code || "").trim().toUpperCase();
      const rev = Number(event.queryStringParameters?.rev || 0);
      if (!code) return { statusCode: 400, headers, body: JSON.stringify({ error: "code required" }) };
      const session = await getSession(code);
      if (!session) return { statusCode: 404, headers, body: JSON.stringify({ error: "Session not found" }) };
      if (Date.now() > Date.parse(session.expiresAt || "1970-01-01")) {
        return { statusCode: 410, headers, body: JSON.stringify({ error: "Session expired" }) };
      }
      if (rev && Number(session.revision) === rev) {
        return { statusCode: 200, headers, body: JSON.stringify({ changed: false, state: null }) };
      }

      const quiz = await getWheelJson(session.quizId);
      const current = quiz?.gameType === "quiz" ? minimalCurrent(quiz, session.currentSequenceIndex) : null;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          changed: true,
          state: {
            revision: session.revision,
            code: session.code,
            quizId: session.quizId,
            quizSlug: session.quizSlug,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            currentSequenceIndex: session.currentSequenceIndex,
            phase: session.phase,
            openedAt: session.openedAt,
            closesAt: session.closesAt,
            participants: session.participants || [],
            current,
            bonus: session.bonus || null,
          },
        }),
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e instanceof Error ? e.message : "Failed" }) };
  }
};

