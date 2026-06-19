/**
 * First-party event tracking — stub until Phase G ingest.
 * Call sites in A–F use this shape so we do not retrofit player surfaces later.
 */
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

/** No-op ingest for now. Phase G posts to `/api/track`. */
export function track(_event: TrackEventInput): void {
  /* stub */
}
