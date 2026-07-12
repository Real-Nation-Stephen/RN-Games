import { randomUUID } from "node:crypto";
import { blobStore } from "./store.mjs";
import { getDb, isMeasurementDbEnabled } from "./db.mjs";
import { normaliseIncomingEvent, validateMandatoryEvent } from "./event-validate.mjs";

function hourKey(date = new Date()) {
  return date.toISOString().slice(0, 13);
}

export async function appendEventsToBlob(events, hour = hourKey()) {
  const st = await blobStore();
  const key = `track-log:${hour}`;
  const raw = await st.get(key, { type: "json" });
  const list = Array.isArray(raw?.events) ? raw.events : [];
  list.push(...events);
  const trimmed = list.slice(-5000);
  await st.setJSON(key, { events: trimmed, updatedAt: new Date().toISOString() });
  return { key, count: events.length };
}

/**
 * Idempotent insert — ON CONFLICT (event_id) DO NOTHING.
 * Returns { inserted, duplicate }.
 */
export async function insertEventToDb(ev) {
  const db = await getDb();
  const propertiesJson = JSON.stringify(ev.properties || {});
  const privacyJson = JSON.stringify(ev.privacy || {});
  const rawJson = JSON.stringify(ev.rawEnvelope || ev);

  const rows = await db.sql`
    INSERT INTO events (
      event_id, event_version, schema_version, event_name, event_category,
      occurred_at, received_at, deployment_id, deployment_context,
      component_type, component_instance_id, session_id,
      course_id, course_session_id, course_item_id,
      flow_id, flow_session_id, flow_step_id, participant_id,
      preview, properties, privacy, raw_envelope
    ) VALUES (
      ${ev.eventId},
      ${ev.eventVersion},
      ${ev.schemaVersion},
      ${ev.eventName},
      ${ev.eventCategory},
      ${ev.occurredAt},
      NOW(),
      ${ev.deploymentId},
      ${ev.deploymentContext},
      ${ev.componentType},
      ${ev.componentInstanceId},
      ${ev.sessionId},
      ${ev.courseId},
      ${ev.courseSessionId},
      ${ev.courseItemId},
      ${ev.flowId},
      ${ev.flowSessionId},
      ${ev.flowStepId},
      ${ev.participantId},
      ${ev.preview},
      ${propertiesJson}::jsonb,
      ${privacyJson}::jsonb,
      ${rawJson}::jsonb
    )
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id
  `.execute();

  const inserted = Array.isArray(rows) && rows.length > 0;
  return { inserted, duplicate: !inserted };
}

export async function ingestEvents(rawEvents) {
  const results = [];
  const stampedForBlob = [];

  for (const raw of rawEvents) {
    let ev = normaliseIncomingEvent(raw);
    if (!ev.eventId) ev = { ...ev, eventId: randomUUID() };

    const validation = validateMandatoryEvent(ev);
    if (!validation.ok) {
      results.push({
        eventId: ev.eventId || null,
        ok: false,
        error: "missing_mandatory_fields",
        missing: validation.missing,
      });
      continue;
    }

    stampedForBlob.push({
      ...ev.rawEnvelope,
      eventId: ev.eventId,
      eventVersion: ev.eventVersion,
      schemaVersion: ev.schemaVersion,
      eventName: ev.eventName,
      eventCategory: ev.eventCategory,
      occurredAt: ev.occurredAt,
      deploymentId: ev.deploymentId,
      deploymentContext: ev.deploymentContext,
      componentType: ev.componentType,
      componentInstanceId: ev.componentInstanceId,
      sessionId: ev.sessionId,
      context: {
        deploymentId: ev.deploymentId,
        deploymentContext: ev.deploymentContext,
        courseId: ev.courseId,
        courseSessionId: ev.courseSessionId,
        courseItemId: ev.courseItemId,
        flowId: ev.flowId,
        flowSessionId: ev.flowSessionId,
        flowStepId: ev.flowStepId,
        participantId: ev.participantId,
        preview: ev.preview,
        componentType: ev.componentType,
        componentInstanceId: ev.componentInstanceId,
      },
      properties: ev.properties,
      privacy: ev.privacy,
      type: ev.rawEnvelope?.type || ev.eventName,
      gameId: ev.componentInstanceId,
      timestamp: ev.occurredAt,
      payload: ev.properties,
    });

    let blobWritten = false;
    let dbInserted = false;
    let duplicate = false;
    let dbError = null;

    try {
      await appendEventsToBlob(stampedForBlob.slice(-1));
      blobWritten = true;
    } catch (e) {
      results.push({
        eventId: ev.eventId,
        ok: false,
        error: "blob_write_failed",
        message: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    if (isMeasurementDbEnabled()) {
      try {
        const dbResult = await insertEventToDb(ev);
        dbInserted = dbResult.inserted;
        duplicate = dbResult.duplicate;
      } catch (e) {
        dbError = e instanceof Error ? e.message : String(e);
      }
    }

    results.push({
      eventId: ev.eventId,
      ok: true,
      blobWritten,
      dbInserted,
      duplicate,
      dbError,
    });
  }

  return results;
}

/**
 * Replay events from Blob hour buckets into Database (idempotent).
 */
export async function replayBlobEventsToDb({ hours = 48, dryRun = false } = {}) {
  const st = await blobStore();
  const list = await st.list({ prefix: "track-log:" });
  const keys = (list?.blobs || [])
    .map((b) => b.key)
    .filter(Boolean)
    .sort()
    .slice(-hours);

  let eventsScanned = 0;
  let eventsInserted = 0;
  let eventsSkipped = 0;
  const errors = [];

  for (const key of keys) {
    const raw = await st.get(key, { type: "json" });
    const events = Array.isArray(raw?.events) ? raw.events : [];
    for (const blobEv of events) {
      eventsScanned += 1;
      let ev = normaliseIncomingEvent(blobEv);
      if (!ev.eventId) {
        errors.push({ key, error: "missing_event_id" });
        continue;
      }
      const validation = validateMandatoryEvent(ev);
      if (!validation.ok) {
        errors.push({ key, eventId: ev.eventId, error: "invalid_envelope", missing: validation.missing });
        continue;
      }
      if (dryRun) {
        eventsSkipped += 1;
        continue;
      }
      try {
        const { inserted, duplicate } = await insertEventToDb(ev);
        if (inserted) eventsInserted += 1;
        else if (duplicate) eventsSkipped += 1;
      } catch (e) {
        errors.push({
          key,
          eventId: ev.eventId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return { blobKeys: keys, eventsScanned, eventsInserted, eventsSkipped, errors };
}

export async function recordReplayRun(summary) {
  if (!isMeasurementDbEnabled()) return null;
  try {
    const db = await getDb();
    const id = randomUUID();
    await db.sql`
      INSERT INTO ingest_replay_runs (
        id, started_at, completed_at, blob_keys,
        events_scanned, events_inserted, events_skipped, errors
      ) VALUES (
        ${id},
        NOW(),
        NOW(),
        ${summary.blobKeys},
        ${summary.eventsScanned},
        ${summary.eventsInserted},
        ${summary.eventsSkipped},
        ${JSON.stringify(summary.errors || [])}
      )
    `.execute();
    return id;
  } catch {
    return null;
  }
}
