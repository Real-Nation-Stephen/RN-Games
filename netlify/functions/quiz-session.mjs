import { connectLambda } from "@netlify/blobs";
import { readIndex, getWheelJson } from "./lib/blobs.mjs";
import { getQueryParam } from "./lib/query.mjs";
import { getSession, makeSessionCode, nowIso, setSession } from "./lib/quiz-store.mjs";
import { sessionPublicState } from "./lib/quiz-minimal.mjs";

/** Prevent CDN/browser caching GET by path only — query varies per room/rev. */
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

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
        /** While true, new participants may join. Host locks when the quiz begins. */
        lobbyOpen: true,
        participants: [],
        answers: {},
        events: [],
      };
      await setSession(code, session);
      /** Do not require an immediate read-after-write: Netlify Blobs can be eventually consistent, so getSession right after setJSON may still return null even when the write succeeded (setJSON throws on failure). */
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          code,
          hostKey,
          maxParticipants,
          state: sessionPublicState(session, quiz),
        }),
      };
    }

    if (event.httpMethod === "GET") {
      const code = String(getQueryParam(event, "code") || "").trim().toUpperCase();
      const rev = Number(getQueryParam(event, "rev") || 0);
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
      const list = await readIndex();
      const idxItem = list.find((x) => x.id === session.quizId);
      const isQuizDoc = quiz?.gameType === "quiz" || idxItem?.gameType === "quiz";
      const quizForState = isQuizDoc && quiz ? quiz : null;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          changed: true,
          state: sessionPublicState(session, quizForState),
        }),
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e instanceof Error ? e.message : "Failed" }) };
  }
};

