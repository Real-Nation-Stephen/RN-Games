import { connectLambda } from "@netlify/blobs";
import { requireAuth } from "./lib/auth.mjs";
import { blobStore } from "./lib/store.mjs";
import { readExperiencesIndex, readIndex } from "./lib/blobs.mjs";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function hourKeys(hoursBack) {
  const keys = [];
  const now = Date.now();
  for (let i = 0; i < hoursBack; i++) {
    const d = new Date(now - i * 3600_000);
    keys.push(`track-log:${d.toISOString().slice(0, 13)}`);
  }
  return keys;
}

function bump(map, key, n = 1) {
  map.set(key, (map.get(key) || 0) + n);
}

function aggregateEvents(events, experiencesById, modulesById) {
  const byType = new Map();
  const byExperience = new Map();
  const byComponent = new Map();
  const bySession = new Map();
  const uniqueSessions = new Set();
  let total = 0;

  for (const ev of events) {
    total++;
    bump(byType, ev.eventName || ev.type || "unknown");
    const expId = ev.flowId || ev.campaignId || ev.context?.flowId || ev.payload?.experienceId;
    if (expId) {
      const row = experiencesById.get(String(expId));
      const label = row ? `${row.title} (${row.slug})` : String(expId);
      bump(byExperience, label);
    }
    const gameId = ev.componentInstanceId || ev.gameId || ev.moduleId;
    if (gameId) {
      const row = modulesById.get(String(gameId));
      const label = row ? `${row.title} (${row.gameType || "module"})` : String(gameId);
      bump(byComponent, label);
    }
    const sid = ev.sessionId || ev.context?.flowSessionId || ev.context?.courseSessionId || ev.payload?.sessionId;
    if (sid) {
      uniqueSessions.add(String(sid));
      bump(bySession, String(sid));
    }
  }

  const toRows = (map) =>
    [...map.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

  return {
    total,
    uniqueSessions: uniqueSessions.size,
    byType: toRows(byType),
    byExperience: toRows(byExperience),
    byComponent: toRows(byComponent),
    topSessions: toRows(bySession).slice(0, 50),
  };
}

export const handler = async (event, context) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod === "GET") {
    const deny = requireAuth(event, context);
    if (deny) return { ...deny, headers: { ...headers, ...deny.headers } };

    try {
      const hours = Math.min(168, Math.max(1, Number(event.queryStringParameters?.hours) || 48));
      const format = event.queryStringParameters?.format;
      const st = await blobStore();
      const keys = hourKeys(hours);
      const events = [];

      for (const key of keys) {
        const raw = await st.get(key, { type: "json" });
        if (Array.isArray(raw?.events)) events.push(...raw.events);
      }

      const [experiences, modules] = await Promise.all([readExperiencesIndex(), readIndex()]);
      const experiencesById = new Map(experiences.map((x) => [x.id, x]));
      const modulesById = new Map(modules.map((x) => [x.id, x]));
      const stats = aggregateEvents(events, experiencesById, modulesById);

      if (format === "csv") {
        const lines = ["bucket,label,count"];
        for (const row of stats.byType) lines.push(`type,"${row.label.replace(/"/g, '""')}",${row.count}`);
        for (const row of stats.byExperience)
          lines.push(`experience,"${row.label.replace(/"/g, '""')}",${row.count}`);
        for (const row of stats.byComponent)
          lines.push(`component,"${row.label.replace(/"/g, '""')}",${row.count}`);
        return {
          statusCode: 200,
          headers: {
            ...headers,
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="analytics-export.csv"',
          },
          body: lines.join("\n"),
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          hours,
          eventCount: stats.total,
          uniqueSessions: stats.uniqueSessions,
          campaign: stats.byExperience,
          experience: stats.byExperience,
          component: stats.byComponent,
          user: stats.topSessions,
          byType: stats.byType,
        }),
        headers,
      };
    } catch (e) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: e instanceof Error ? e.message : "Server error" }),
      };
    }
  }

  return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
};
