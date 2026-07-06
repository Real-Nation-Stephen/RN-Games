/** No-op ingest for now. Phase G posts to `/api/track`. Wires flow session when present. */
import { loadFlowContext, parseFlowContextFromSearch } from "./flow-bridge.js";

export interface TrackEvent {
  type: string;
  gameId: string;
  moduleId?: string;
  campaignId?: string;
  sessionId?: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export type TrackEventInput = Omit<TrackEvent, "timestamp"> & { timestamp?: string };

function resolveFlowIds(): { sessionId?: string; campaignId?: string } {
  if (typeof window === "undefined") return {};
  const fromUrl = parseFlowContextFromSearch(new URLSearchParams(window.location.search));
  const ctx = fromUrl ?? loadFlowContext();
  if (!ctx) return {};
  return { sessionId: ctx.sessionId, campaignId: ctx.experienceId };
}

export function track(event: TrackEventInput): void {
  const flow = resolveFlowIds();
  const record: TrackEvent = {
    ...event,
    sessionId: event.sessionId ?? flow.sessionId,
    campaignId: event.campaignId ?? flow.campaignId,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };
  if (typeof fetch === "undefined") return;
  void fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
    keepalive: true,
  }).catch(() => {});
}
