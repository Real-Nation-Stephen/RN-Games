import { getDb, isMeasurementDbEnabled } from "./db.mjs";
import { deploymentIdFor } from "./measurement.mjs";

const METRIC_DEFS = {
  enrolments: {
    label: "Enrolments",
    basis: "Count of course.enrolled events",
    eventName: "course.enrolled",
  },
  courseStarts: {
    label: "Course starts",
    basis: "Count of course.started events (first home view after enrolment)",
    eventName: "course.started",
  },
  courseReturns: {
    label: "Course returns",
    basis: "Count of course.resumed events",
    eventName: "course.resumed",
  },
  courseCompletions: {
    label: "Course completions",
    basis: "Count of course.completed events",
    eventName: "course.completed",
  },
  flowStarts: {
    label: "Flow starts",
    basis: "Count of flow.started events",
    eventName: "flow.started",
  },
  flowReturns: {
    label: "Flow returns",
    basis: "Count of flow.resumed events",
    eventName: "flow.resumed",
  },
  flowCompletions: {
    label: "Flow completions",
    basis: "Count of flow.completed events",
    eventName: "flow.completed",
  },
  uniqueCourseSessions: {
    label: "Unique course sessions",
    basis: "COUNT(DISTINCT session_id) for course-scoped events — not labelled as unique learners",
    eventNames: ["course.enrolled", "course.started", "course.resumed"],
  },
  uniqueFlowSessions: {
    label: "Unique flow sessions",
    basis: "COUNT(DISTINCT session_id) for flow-scoped events — not labelled as unique learners",
    eventNames: ["flow.started", "flow.resumed", "flow.viewed"],
  },
};

export async function queryDeploymentMetrics(deploymentId, { from, to, excludePreview = true } = {}) {
  if (!isMeasurementDbEnabled()) {
    return {
      available: false,
      reason: "Netlify Database ingest is not enabled (MEASUREMENT_DB_ENABLED).",
      metrics: [],
      dataFreshness: null,
    };
  }

  try {
    const db = await getDb();
    const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString();
    const toDate = to || new Date().toISOString();
    const metrics = [];

    for (const [id, def] of Object.entries(METRIC_DEFS)) {
      if (def.eventName) {
        const rows = excludePreview
          ? await db.sql`
              SELECT COUNT(*)::int AS count FROM events
              WHERE deployment_id = ${deploymentId} AND event_name = ${def.eventName}
                AND occurred_at >= ${fromDate} AND occurred_at <= ${toDate} AND preview = false
            `.execute()
          : await db.sql`
              SELECT COUNT(*)::int AS count FROM events
              WHERE deployment_id = ${deploymentId} AND event_name = ${def.eventName}
                AND occurred_at >= ${fromDate} AND occurred_at <= ${toDate}
            `.execute();
        metrics.push({
          id,
          label: def.label,
          basis: def.basis,
          value: rows?.[0]?.count ?? 0,
          unit: "events",
        });
      } else if (def.eventNames) {
        const rows = excludePreview
          ? await db.sql`
              SELECT COUNT(DISTINCT session_id)::int AS count FROM events
              WHERE deployment_id = ${deploymentId}
                AND event_name = ANY(${def.eventNames})
                AND occurred_at >= ${fromDate} AND occurred_at <= ${toDate} AND preview = false
            `.execute()
          : await db.sql`
              SELECT COUNT(DISTINCT session_id)::int AS count FROM events
              WHERE deployment_id = ${deploymentId}
                AND event_name = ANY(${def.eventNames})
                AND occurred_at >= ${fromDate} AND occurred_at <= ${toDate}
            `.execute();
        metrics.push({
          id,
          label: def.label,
          basis: def.basis,
          value: rows?.[0]?.count ?? 0,
          unit: "unique_sessions",
        });
      }
    }

    const completionRate = deploymentId.startsWith("dep_course_")
      ? computeRate(metrics, "courseStarts", "courseCompletions")
      : computeRate(metrics, "flowStarts", "flowCompletions");

    if (completionRate !== null) {
      metrics.push({
        id: "completionRate",
        label: "Completion rate",
        basis: "Completions divided by starts (same period)",
        value: completionRate,
        unit: "percent",
      });
    }

    const freshRows = await db.sql`
      SELECT MAX(received_at) AS latest FROM events WHERE deployment_id = ${deploymentId}
    `.execute();

    const funnelRows = excludePreview
      ? await db.sql`
          SELECT event_name, COUNT(*)::int AS count FROM events
          WHERE deployment_id = ${deploymentId}
            AND event_name IN ('flow.step_started', 'flow.step_completed')
            AND occurred_at >= ${fromDate} AND occurred_at <= ${toDate} AND preview = false
          GROUP BY event_name
        `.execute()
      : await db.sql`
          SELECT event_name, COUNT(*)::int AS count FROM events
          WHERE deployment_id = ${deploymentId}
            AND event_name IN ('flow.step_started', 'flow.step_completed')
            AND occurred_at >= ${fromDate} AND occurred_at <= ${toDate}
          GROUP BY event_name
        `.execute();

    const dailyRows = excludePreview
      ? await db.sql`
          SELECT DATE(occurred_at) AS day, COUNT(*)::int AS count FROM events
          WHERE deployment_id = ${deploymentId}
            AND occurred_at >= ${fromDate} AND occurred_at <= ${toDate} AND preview = false
          GROUP BY DATE(occurred_at) ORDER BY day
        `.execute()
      : await db.sql`
          SELECT DATE(occurred_at) AS day, COUNT(*)::int AS count FROM events
          WHERE deployment_id = ${deploymentId}
            AND occurred_at >= ${fromDate} AND occurred_at <= ${toDate}
          GROUP BY DATE(occurred_at) ORDER BY day
        `.execute();

    const componentRows = excludePreview
      ? await db.sql`
          SELECT component_type, COUNT(*)::int AS count FROM events
          WHERE deployment_id = ${deploymentId}
            AND occurred_at >= ${fromDate} AND occurred_at <= ${toDate} AND preview = false
          GROUP BY component_type ORDER BY count DESC LIMIT 20
        `.execute()
      : await db.sql`
          SELECT component_type, COUNT(*)::int AS count FROM events
          WHERE deployment_id = ${deploymentId}
            AND occurred_at >= ${fromDate} AND occurred_at <= ${toDate}
          GROUP BY component_type ORDER BY count DESC LIMIT 20
        `.execute();

    return {
      available: true,
      deploymentId,
      from: fromDate,
      to: toDate,
      metrics,
      dataFreshness: freshRows?.[0]?.latest || null,
      participationOverTime: dailyRows || [],
      flowFunnel: funnelRows || [],
      perComponent: componentRows || [],
    };
  } catch (e) {
    return {
      available: false,
      reason: e instanceof Error ? e.message : "Metrics query failed",
      metrics: [],
      dataFreshness: null,
    };
  }
}

function computeRate(metrics, startsId, completionsId) {
  const starts = metrics.find((m) => m.id === startsId)?.value || 0;
  const completions = metrics.find((m) => m.id === completionsId)?.value || 0;
  if (!starts) return null;
  return Math.round((completions / starts) * 1000) / 10;
}

export function metricsDeploymentId(kind, recordId) {
  return deploymentIdFor(kind, recordId);
}
