import { connectLambda } from "@netlify/blobs";
import { readIndex, getWheelJson } from "./lib/blobs.mjs";
import { getSession, setSession } from "./lib/quiz-store.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};

const BAD_NAMES = ["mike hunt", "ben dover", "dixie normus", "phil mccracken", "ivana tinkle"];

function normName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function isBlockedName(name) {
  const n = normName(name);
  if (!n || n.length < 2) return true;
  if (n.length > 32) return true;
  if (BAD_NAMES.includes(n)) return true;
  if (/(https?:\/\/|www\.)/.test(n)) return true;
  if (/[^a-z0-9 \-_'"]/i.test(name)) return false; // allow unicode/emoji in display
  return false;
}

export const handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...headers, "Access-Control-Allow-Methods": "POST, OPTIONS" } };
  }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  try {
    const body = JSON.parse(event.body || "{}");
    const code = String(body.code || "").trim().toUpperCase();
    const slug = String(body.slug || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const icon = String(body.icon || "🙂").trim().slice(0, 4);
    const existingParticipantId = String(body.participantId || "").trim();
    if (!code || !slug) return { statusCode: 400, headers, body: JSON.stringify({ error: "code and slug required" }) };
    let session = await getSession(code);
    if (!session) return { statusCode: 404, headers, body: JSON.stringify({ error: "Session not found" }) };
    if (Date.now() > Date.parse(session.expiresAt || "1970-01-01")) {
      return { statusCode: 410, headers, body: JSON.stringify({ error: "Session expired" }) };
    }
    if (String(session.quizSlug || "").toLowerCase() !== slug) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Session/quiz mismatch" }) };
    }

    const list = await readIndex();
    const item = list.find((x) => String(x.slug || "").toLowerCase() === slug);
    const quiz = item ? await getWheelJson(item.id) : null;
    const maxParticipants = Math.min(500, Math.max(10, Number(quiz?.playAlong?.maxParticipants) || 150));

    /** Reconnect: same participantId already in session */
    if (existingParticipantId) {
      const p = (session.participants || []).find((x) => x.id === existingParticipantId);
      if (p) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ participantId: p.id, name: p.name, reconnected: true }),
        };
      }
      if (session.lobbyOpen === false) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: "lobby_closed", code: "lobby_closed" }) };
      }
    }

    if (session.lobbyOpen === false) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "lobby_closed", code: "lobby_closed" }) };
    }

    /** New registration (including stale participantId while lobby is open) requires a display name. */
    if (!name.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "name required", code: "name_required" }) };
    }

    const existingCount = Array.isArray(session.participants) ? session.participants.length : 0;
    if (existingCount >= maxParticipants) {
      return { statusCode: 429, headers, body: JSON.stringify({ error: "Session full" }) };
    }

    let displayName = name;
    if (quiz?.playAlong?.profanityBlock !== false && isBlockedName(name)) {
      displayName = `Guest ${existingCount + 1}`;
    }

    const participantId = Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
    const p = { id: participantId, name: displayName, icon, score: 0, joinedAt: Date.now() };
    session.participants = Array.isArray(session.participants) ? session.participants : [];
    session.participants.push(p);
    session.revision = Number(session.revision || 0) + 1;
    await setSession(code, session);

    return { statusCode: 200, headers, body: JSON.stringify({ participantId, name: displayName }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e instanceof Error ? e.message : "Join failed" }) };
  }
};

