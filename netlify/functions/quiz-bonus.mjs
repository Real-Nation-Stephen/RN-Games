import { connectLambda } from "@netlify/blobs";
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
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  try {
    const body = JSON.parse(event.body || "{}");
    const code = String(body.code || "").trim().toUpperCase();
    const participantId = String(body.participantId || "").trim();
    const victimId = String(body.victimId || "").trim();
    if (!code || !participantId || !victimId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "code, participantId, victimId required" }) };
    }
    const session = await getSession(code);
    if (!session) return { statusCode: 404, headers, body: JSON.stringify({ error: "Session not found" }) };
    if (session.phase !== "bonus") return { statusCode: 423, headers, body: JSON.stringify({ error: "No bonus active" }) };
    const bonus = session.bonus;
    if (!bonus || bonus.kind !== "fastestCorrectSteal") {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Unsupported bonus" }) };
    }
    if (String(bonus.winnerId || "") !== participantId) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "Not winner" }) };
    }
    if (victimId === participantId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Cannot choose yourself" }) };
    }

    const points = Math.min(1000, Math.max(1, Number(bonus.points) || 100));
    session.participants = Array.isArray(session.participants) ? session.participants : [];
    const winner = session.participants.find((p) => p.id === participantId);
    const victim = session.participants.find((p) => p.id === victimId);
    if (!winner || !victim) return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid participant" }) };

    const taken = Math.min(Number(victim.score || 0), points);
    victim.score = Number(victim.score || 0) - taken;
    winner.score = Number(winner.score || 0) + taken;

    session.events = Array.isArray(session.events) ? session.events : [];
    session.events.push({ type: "pointsTransferred", at: Date.now(), from: victimId, to: participantId, points: taken });
    if (session.events.length > 200) session.events = session.events.slice(-200);

    session.phase = "closed";
    session.bonus = null;
    session.revision = Number(session.revision || 0) + 1;
    await setSession(code, session);
    return { statusCode: 204, headers, body: "" };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e instanceof Error ? e.message : "Bonus failed" }) };
  }
};

