import type { PinboardConfig, PinboardState, PinboardSubmission } from "./types";
import { DEFAULT_PINBOARD_CONFIG } from "./config-default";
import {
  fetchPublicConfig,
  fetchState,
  postSubmission,
  patchState,
  getGameSlug,
  isDemoSlug,
} from "./api";

const STATE_KEY = "rngames-pinboard-state";
const CONFIG_KEY = "rngames-pinboard-config";

function stateKey(eventId: string) {
  return `${STATE_KEY}:${eventId}`;
}

export function getEventIdFromQuery(): string {
  return getGameSlug() || "demo";
}

function loadLocalConfig(eventId: string): PinboardConfig {
  try {
    const raw = localStorage.getItem(`${CONFIG_KEY}:${eventId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as PinboardConfig;
      return { ...DEFAULT_PINBOARD_CONFIG, ...parsed, eventId: parsed.eventId || eventId };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PINBOARD_CONFIG, eventId };
}

export async function loadConfig(eventId: string): Promise<PinboardConfig> {
  if (!isDemoSlug(eventId)) {
    const remote = await fetchPublicConfig(eventId);
    if (remote) return remote;
  }
  return loadLocalConfig(eventId);
}

export function saveConfig(config: PinboardConfig) {
  localStorage.setItem(`${CONFIG_KEY}:${config.eventId}`, JSON.stringify(config));
}

function loadLocalState(eventId: string): PinboardState {
  try {
    const raw = localStorage.getItem(stateKey(eventId));
    if (raw) {
      const parsed = JSON.parse(raw) as PinboardState;
      return {
        version: 1,
        eventId,
        submissions: Array.isArray(parsed.submissions) ? parsed.submissions : [],
        boardClearedAt: parsed.boardClearedAt ?? null,
      };
    }
  } catch {
    /* ignore */
  }
  return { version: 1, eventId, submissions: [], boardClearedAt: null };
}

async function loadRemoteState(eventId: string): Promise<PinboardState> {
  return fetchState(eventId);
}

export async function loadState(eventId: string): Promise<PinboardState> {
  if (isDemoSlug(eventId)) return loadLocalState(eventId);
  return loadRemoteState(eventId);
}

function saveLocalState(state: PinboardState) {
  localStorage.setItem(stateKey(state.eventId), JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("pinboard-state-changed", { detail: { eventId: state.eventId } }));
}

export function saveState(state: PinboardState) {
  if (isDemoSlug(state.eventId)) {
    saveLocalState(state);
    return;
  }
  saveLocalState(state);
}

export async function addSubmission(
  eventId: string,
  sub: Omit<PinboardSubmission, "id" | "status" | "createdAt">,
) {
  if (isDemoSlug(eventId)) {
    const state = loadLocalState(eventId);
    const entry: PinboardSubmission = {
      ...sub,
      id: crypto.randomUUID(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    state.submissions.unshift(entry);
    saveLocalState(state);
    return entry;
  }
  const res = await postSubmission(eventId, sub);
  window.dispatchEvent(new CustomEvent("pinboard-state-changed", { detail: { eventId } }));
  return res.submission as PinboardSubmission;
}

export async function updateSubmission(eventId: string, id: string, patch: Partial<PinboardSubmission>) {
  if (isDemoSlug(eventId)) {
    const state = loadLocalState(eventId);
    const i = state.submissions.findIndex((s) => s.id === id);
    if (i < 0) return null;
    state.submissions[i] = { ...state.submissions[i], ...patch };
    saveLocalState(state);
    return state.submissions[i];
  }
  if (patch.status === "approved" && patch.placement) {
    await patchState(eventId, { action: "approve", id, placement: patch.placement });
  } else if (patch.status === "rejected") {
    await patchState(eventId, { action: "reject", id });
  } else {
    await patchState(eventId, { action: "patch", id, patch });
  }
  window.dispatchEvent(new CustomEvent("pinboard-state-changed", { detail: { eventId } }));
  return null;
}

export async function clearBoard(eventId: string) {
  if (isDemoSlug(eventId)) {
    const state = loadLocalState(eventId);
    state.submissions = state.submissions.filter((s) => s.status !== "approved");
    state.boardClearedAt = new Date().toISOString();
    saveLocalState(state);
    return;
  }
  await patchState(eventId, { action: "clear_board" });
  window.dispatchEvent(new CustomEvent("pinboard-state-changed", { detail: { eventId } }));
}

export async function removeFromBoard(eventId: string, id: string) {
  if (isDemoSlug(eventId)) {
    const state = loadLocalState(eventId);
    const s = state.submissions.find((x) => x.id === id);
    if (!s) return;
    s.status = "rejected";
    s.placement = undefined;
    saveLocalState(state);
    return;
  }
  await patchState(eventId, { action: "remove", id });
  window.dispatchEvent(new CustomEvent("pinboard-state-changed", { detail: { eventId } }));
}

export function subscribeState(eventId: string, fn: (state: PinboardState) => void) {
  let closed = false;
  const run = async () => {
    if (closed) return;
    try {
      fn(await loadState(eventId));
    } catch {
      if (isDemoSlug(eventId)) fn(loadLocalState(eventId));
    }
  };
  void run();
  const onStorage = (e: StorageEvent) => {
    if (e.key === stateKey(eventId)) void run();
  };
  const onCustom = (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (d?.eventId === eventId) void run();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("pinboard-state-changed", onCustom);
  const interval = window.setInterval(() => void run(), 3000);
  return () => {
    closed = true;
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pinboard-state-changed", onCustom);
    window.clearInterval(interval);
  };
}
