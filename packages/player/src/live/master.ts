import { startRaceClock, raceClockHtml } from "./race-clock";
import { liveEndpoint, platformLiveEndpoint, liveGetUrl, liveJson } from "./api";
import { startLivePoll } from "./poll";
import { shortJoinUrl } from "./join-dock";
import { fillPinboardCard } from "./pinboard-card";

type AnyRec = Record<string, unknown>;

const STORE = "rngames:live-master";

function qs() {
  return new URLSearchParams(location.search);
}

function pathParts() {
  return location.pathname.split("/").filter(Boolean);
}

function slug(): string {
  const q = qs().get("slug");
  if (q) return q;
  const p = pathParts();
  return p[0] === "x" && p[1] ? p[1] : "";
}

function loadHost(): { slug: string; code: string; hostKey: string; controllerId: string } | null {
  try {
    const raw = sessionStorage.getItem(`${STORE}:${slug()}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveHost(v: { slug: string; code: string; hostKey: string; controllerId: string }) {
  sessionStorage.setItem(`${STORE}:${slug()}`, JSON.stringify(v));
}

function commandId(): string {
  return crypto.randomUUID();
}

const DEV_BEARER =
  "eyJhbGciOiJub25lIn0.eyJzdWIiOiJkZXYtbG9jYWwiLCJlbWFpbCI6ImRldkBsb2NhbC5wcmV2aWV3In0.dev";

function operatorHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (import.meta.env.VITE_DEV_AUTH === "1") headers.Authorization = `Bearer ${DEV_BEARER}`;
  return headers;
}

function operatorAccess(): string {
  return sessionStorage.getItem(`${STORE}:operator:${slug()}`) || "";
}

function consumeOperatorAccess() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (!hash.has("op")) return;
  sessionStorage.setItem(`${STORE}:operator:${slug()}`, hash.get("op") || "invalid");
  history.replaceState(null, "", `${location.pathname}${location.search}`);
}

function consumeHostKeyFromLocation(): string {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const fromHash = hash.get("hk") || hash.get("hostKey") || "";
  const fromQuery = qs().get("hk") || qs().get("hostKey") || "";
  const key = fromHash || fromQuery;
  if (key) sessionStorage.removeItem(`${STORE}:operator:${slug()}`);
  if (fromHash) {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }
  return key;
}

async function control(host: { code: string; hostKey: string; controllerId: string }, action: string, extra: Record<string, unknown> = {}) {
  return liveJson(liveEndpoint("live-control"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: host.code,
      hostKey: host.hostKey,
      controllerId: host.controllerId,
      commandId: commandId(),
      action,
      ...extra,
    }),
  });
}

function byId(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

const KIND_LABEL: Record<string, string> = {
  lobby: "Join screen",
  "mini-poll": "Poll",
  "fill-game": "Fill",
  "mini-quiz": "Quiz",
  pinboard: "Pinboard",
  "spinning-wheel": "Prize draw",
  scratcher: "Scratcher",
  closing: "Closing",
};

function kindLabel(kind: string): string {
  return KIND_LABEL[kind] || kind.replace(/-/g, " ");
}

function phaseLabel(kind: string, phase: string): string {
  if (kind === "fill-game") {
    if (phase === "racing") return "Race open";
    if (phase === "countdown") return "Starting countdown";
    if (phase === "held") return "Held";
    if (phase === "finished") return "Race finished";
    return "Waiting to open";
  }
  if (kind === "mini-poll") {
    if (phase === "open") return "Voting open";
    if (phase === "tallying") return "Tallying";
    if (phase === "revealed") return "Results shown";
    if (phase === "closed") return "Voting closed";
    return "Waiting to open";
  }
  if (kind === "mini-quiz") {
    if (phase === "open") return "Answers open";
    if (phase === "revealed") return "Answer revealed";
    if (phase === "done") return "Quiz complete";
    return "Waiting to open";
  }
  if (kind === "spinning-wheel") {
    if (phase === "spinning") return "Spinning";
    if (phase === "revealed") return "Winner shown";
    return "Ready to spin";
  }
  if (kind === "scratcher") {
    if (phase === "released") return "Cards released";
    if (phase === "celebrating") return "Celebrating";
    return "Waiting to release";
  }
  if (kind === "pinboard") return "Review queue";
  if (kind === "lobby") return "Guests can join";
  if (kind === "closing") return "Show is closed";
  return phase || "Idle";
}

function addButton(host: HTMLElement, label: string, onClick: () => void, className = "live-btn") {
  const b = document.createElement("button");
  b.className = className;
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", onClick);
  host.appendChild(b);
  return b;
}

function activitySig(state: AnyRec): string {
  const a = (state.activity || {}) as AnyRec;
  const subs = ((a.submissions || []) as AnyRec[]).map((s) => `${s.id}:${s.status}`).join(",");
  const scores = ((a.teams || []) as AnyRec[]).map((t) => `${t.id}:${t.score}:${t.target}`).join(",");
  return [
    a.kind,
    a.phase,
    a.questionIndex,
    a.finishedTeamId,
    a.winnerNumber,
    a.responseCount,
    a.target,
    a.durationSeconds,
    a.startsAt,
    state.roundAttemptId,
    scores,
    Array.isArray(a.pool) ? a.pool.length : "",
    state.held,
    state.currentStepIndex,
    subs,
  ].join("|");
}

let lastActivitySig = "";
let clockState: AnyRec | null = null;

function renderSteps(state: AnyRec) {
  clockState = state;
  const activity = (state.activity || {}) as AnyRec;
  const kind = String(activity.kind || "lobby");
  const list = byId("master-steps") as HTMLOListElement;
  list.replaceChildren();
  const addStep = (label: string, hint: string, current: boolean) => {
    const li = document.createElement("li");
    if (current) li.className = "current";
    li.append(label);
    const small = document.createElement("small");
    small.textContent = hint;
    li.appendChild(small);
    list.appendChild(li);
  };
  addStep("Join screen", "Lobby", kind === "lobby");
  for (const step of (state.steps || []) as AnyRec[]) {
    addStep(
      String(step.label || kindLabel(String(step.moduleType))),
      step.liveCapable ? String(step.moduleType).replace(/-/g, " ") : "Not live",
      !!step.current,
    );
  }
  addStep("Closing", "End of show", kind === "closing");
}

function renderActivity(state: AnyRec, host: { code: string; hostKey: string; controllerId: string }) {
  const activity = (state.activity || {}) as AnyRec;
  const kind = String(activity.kind || "lobby");
  const panel = byId("master-activity");
  panel.replaceChildren();
  const actions = document.createElement("div");
  actions.className = "live-actions";
  const add = (label: string, action: string, extra?: Record<string, unknown>) =>
    addButton(actions, label, () => void control(host, action, extra || {}).catch((e) => alert((e as Error).message)));

  if (kind === "mini-poll") {
    const p = document.createElement("p");
    p.className = "live-body";
    p.textContent = `${Number(activity.responseCount || 0)} votes in`;
    panel.appendChild(p);
    add("Open voting", "open");
    add("Close voting", "close");
    add("Tally scores", "tally");
    panel.appendChild(actions);
  } else if (kind === "fill-game") {
    const teams = (activity.teams || []) as AnyRec[];
    const scores = document.createElement("p");
    scores.className = "live-body";
    scores.textContent = teams.length
      ? teams.map((t) => `${t.name || t.id} ${Number(t.score || 0)}/${Number(t.target || 0)}`).join(" · ")
      : "No teams";
    panel.appendChild(scores);
    const timer = document.createElement("div"); timer.innerHTML = raceClockHtml(); panel.appendChild(timer);
    const durationLabel = document.createElement("label"); durationLabel.className = "live-master-field";
    durationLabel.append("Round length in seconds");
    const duration = document.createElement("input"); duration.type = "number"; duration.min = "10"; duration.max = "900";
    duration.value = String(activity.durationSeconds || 90); duration.disabled = activity.phase !== "idle";
    durationLabel.appendChild(duration); panel.appendChild(durationLabel);
    const applyDuration = addButton(actions, "Apply timer", () => void control(host, "set-duration", { durationSeconds: Number(duration.value) }).catch((e) => alert((e as Error).message)));
    applyDuration.disabled = activity.phase !== "idle";

    const field = document.createElement("label");
    field.className = "live-master-field";
    field.append("Net points to fill a keg");
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = "999";
    input.value = String(activity.target || teams[0]?.target || 8);
    input.disabled = activity.phase !== "idle";
    field.appendChild(input);
    panel.appendChild(field);
    const targetButton = addButton(actions, "Apply target", () =>
      void control(host, "set-target", { target: Number(input.value) || 1 }).catch((e) => alert((e as Error).message)),
    );
    targetButton.disabled = activity.phase !== "idle";
    const attendance = addButton(actions, "Suggest target from attendance", () => void control(host, "attendance-target").catch((e) => alert((e as Error).message)));
    attendance.disabled = activity.phase !== "idle";
    const start = addButton(actions, "Start countdown", () => void control(host, "start-race").catch((e) => alert((e as Error).message)));
    start.id = "master-fill-start";
    if (activity.readinessRequired) {
      const ready = document.createElement('p');
      ready.className = 'live-body';
      ready.id = 'master-fill-ready';
      ready.textContent = `${Number(activity.readyCount || 0)} / ${Number(activity.readyTotal || 0)} phones ready`;
      panel.appendChild(ready);
    }
    start.disabled = activity.phase !== "idle" || (!!activity.readinessRequired && (!activity.readyTotal || activity.readyCount !== activity.readyTotal));
    const hint = document.createElement("p"); hint.className = "live-body";
    hint.textContent = "3 seconds to prepare, then 3, 2, 1. First full keg wins; highest score wins at timeout. Equal scores draw. Click the Presenter once to enable its sound. Apply timer and target before starting.";
    panel.appendChild(hint);
    add("Finish early", "finish");
    panel.appendChild(actions);
  } else if (kind === "mini-quiz") {
    const p = document.createElement("p");
    p.className = "live-body";
    p.textContent = `Question ${Number(activity.questionIndex || 0) + 1} of ${Number(activity.questionCount || 0)}`;
    panel.appendChild(p);
    add("Open answers", "open");
    add("Close answers", "close");
    add("Reveal answer", "reveal");
    add("Next question", "next-question");
    panel.appendChild(actions);
  } else if (kind === "spinning-wheel") {
    const p = document.createElement("p");
    p.className = "live-body";
    p.textContent = `${Number((activity.pool as unknown[] | undefined)?.length || state.eligibleCount || 0)} in the draw`;
    panel.appendChild(p);
    add("Spin", "spin");
    panel.appendChild(actions);
  } else if (kind === "scratcher") {
    const field = document.createElement("label");
    field.className = "live-master-field";
    field.append("Winning cards");
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.value = String(activity.winnerCount || 1);
    input.disabled = activity.phase !== "idle";
    field.appendChild(input);
    panel.appendChild(field);
    addButton(actions, "Release scratchers", () =>
      void control(host, "release", { winnerCount: Number(input.value) || 1 }).catch((e) => alert((e as Error).message)),
    );
    panel.appendChild(actions);
  } else if (kind === "pinboard") {
    const subs = (activity.submissions || []) as AnyRec[];
    const pending = subs.filter((s) => String(s.status || "pending") === "pending");
    const reviewed = subs.filter((s) => String(s.status || "pending") !== "pending");
    const queue = document.createElement("div");
    queue.className = "live-master-queue";
    const renderGroup = (title: string, items: AnyRec[], empty: string) => {
      const h = document.createElement("h3");
      h.textContent = title;
      queue.appendChild(h);
      if (!items.length) {
        queue.appendChild(Object.assign(document.createElement("p"), { className: "live-body", textContent: empty }));
        return;
      }
      for (const s of items) {
        const card = document.createElement("div");
        card.className = "live-pin-card";
        fillPinboardCard(card, s, host);
        const row = document.createElement("div");
        row.className = "live-actions";
        const pendingItem = String(s.status) === "pending";
        if (pendingItem) {
          addButton(row, "Approve", () => void control(host, "approve", { submissionId: s.id }));
          addButton(row, "Reject", () => void control(host, "reject", { submissionId: s.id }), "live-btn live-btn-ghost");
        }
        addButton(row, "Remove", () => void control(host, "remove", { submissionId: s.id }), "live-btn live-btn-danger");
        card.appendChild(row);
        queue.appendChild(card);
      }
    };
    renderGroup(`Needs review (${pending.length})`, pending, "Nothing waiting");
    renderGroup(`Reviewed (${reviewed.length})`, reviewed, "Nothing reviewed yet");
    panel.appendChild(queue);
  } else {
    const p = document.createElement("p");
    p.className = "live-body";
    p.textContent = kind === "lobby" ? "Use Next when the room is ready." : "Use Previous / Next to move the show.";
    panel.appendChild(p);
  }
}

function renderMaster(state: AnyRec, host: { code: string; hostKey: string; controllerId: string }) {
  const activity = (state.activity || {}) as AnyRec;
  const kind = String(activity.kind || "lobby");
  byId("master-title").textContent = String(state.title || slug() || "Live run");
  byId("master-code").textContent = String(state.code || host.code);
  byId("master-counts").textContent = `${state.connectedCount || 0} connected · ${state.participantCount || 0} joined · ${state.eligibleCount || 0} eligible`;
  byId("master-join").textContent = shortJoinUrl(String(state.code || host.code));
  const held = byId("master-held");
  held.hidden = !state.held;
  byId("master-activity-title").textContent = kindLabel(kind);
  byId("master-phase").textContent = phaseLabel(kind, String(activity.phase || ""));
  renderSteps(state);

  const preview = document.getElementById("master-preview") as HTMLIFrameElement;
  const presentUrl = `${location.origin}/x/${encodeURIComponent(slug())}/present/${encodeURIComponent(String(state.code || host.code))}`;
  if (preview && !preview.src.endsWith(presentUrl) && preview.src !== presentUrl) preview.src = presentUrl;

  const sig = activitySig(state);
  const typing = byId("master-activity").querySelector("input:focus, textarea:focus");
  if (sig !== lastActivitySig && !typing) {
    lastActivitySig = sig;
    renderActivity(state, host);
  }

  // Readiness changes independently of the activity panel (including while a
  // moderator is editing the timer). Keep these controls current without
  // replacing focused inputs or losing their edits.
  const readiness = document.getElementById("master-fill-ready");
  if (readiness) readiness.textContent = `${Number(activity.readyCount || 0)} / ${Number(activity.readyTotal || 0)} phones ready`;
  const fillStart = document.getElementById("master-fill-start") as HTMLButtonElement | null;
  if (fillStart) fillStart.disabled = activity.phase !== "idle" || (!!activity.readinessRequired && (!activity.readyTotal || activity.readyCount !== activity.readyTotal));

  const awards = (state.awards || []) as AnyRec[];
  byId("master-awards").textContent = awards.length
    ? awards.map((a) => `#${a.participantNumber} ${a.source}`).join(" · ")
    : "No prizes reserved yet";
}

async function ensureRun(forceNew = false) {
  consumeOperatorAccess();
  const existing = loadHost();
  const fromLink = consumeHostKeyFromLocation();
  const grant = operatorAccess();
  const body: Record<string, unknown> = { slug: slug(), forceNew };
  if (grant) body.operatorKey = grant;
  if (fromLink) {
    body.hostKey = fromLink;
    // Keep a trusted Studio handoff key even when the old room has expired.
    // The fragment is consumed once; recovery still needs this authorization.
    saveHost({ slug: slug(), code: existing?.code || "", hostKey: fromLink,
      controllerId: existing?.controllerId || crypto.randomUUID() });
  }
  else if (existing) body.hostKey = existing.hostKey;
  try {
    const data = await liveJson(platformLiveEndpoint("live-run"), {
      method: "POST",
      headers: operatorHeaders(),
      body: JSON.stringify(body),
    });
    const host = {
      slug: slug(),
      code: String(data.code),
      hostKey: String(data.hostKey),
      controllerId: existing?.controllerId || crypto.randomUUID(),
    };
    saveHost(host);
    return host;
  } catch (e) {
    const err = e as Error & { status?: number; payload?: { code?: string } };
    if (err.status === 409 && forceNew === false) {
      throw Object.assign(new Error("A live run is already active. Start a new run from Studio, or paste the current host key."), err);
    }
    throw e;
  }
}

async function main() {
  const err = document.getElementById("err");
  if (!slug()) {
    if (err) {
      err.hidden = false;
      err.textContent = "Missing flow slug";
    }
    return;
  }
  document.getElementById("app")!.hidden = false;
  let host: { slug: string; code: string; hostKey: string; controllerId: string };
  try {
    host = await ensureRun(false);
  } catch (e) {
    const status = (e as Error & { status?: number }).status;
    if (status === 410 && err) {
      document.getElementById("app")!.hidden = true;
      err.hidden = false;
      err.textContent = "This session has expired. Start a fresh session to get a new join code.";
      const restart = document.createElement("button");
      restart.textContent = "Start a fresh session";
      restart.style.cssText = "display:block;margin-top:16px";
      restart.addEventListener("click", async () => {
        restart.disabled = true;
        try { await ensureRun(true); location.reload(); }
        catch (failure) {
          restart.disabled = false;
          err.replaceChildren(document.createTextNode(failure instanceof Error ? failure.message : "Could not start a session. Please try again."), restart);
        }
      });
      err.append(restart);
      return;
    }
    if ((status === 401 || status === 403) && operatorAccess()) {
      document.getElementById("app")!.hidden = true;
      if (err) {
        err.hidden = false;
        err.textContent = "This operator link is no longer valid. Ask your event organiser for a new link, then open it from the guide.";
      }
      return;
    }
    if (status === 401 || status === 403) {
      const pasted = window.prompt(
        "This console cannot start a live run. Open Flow Master from Studio, or paste the current host key to resume.",
      );
      if (pasted) {
        saveHost({
          slug: slug(),
          code: "",
          hostKey: pasted.trim(),
          controllerId: crypto.randomUUID(),
        });
        host = await ensureRun(false);
      } else {
        throw e;
      }
    } else {
      throw e;
    }
  }

  byId("btn-next").addEventListener("click", () => void control(host, "next").catch((e) => alert(e.message)));
  byId("btn-prev").addEventListener("click", () => void control(host, "prev").catch((e) => alert(e.message)));
  byId("btn-hold").addEventListener("click", () => void control(host, "hold"));
  byId("btn-resume").addEventListener("click", () => void control(host, "resume"));
  byId("btn-replay").addEventListener("click", () => void control(host, "replay"));
  byId("btn-end").addEventListener("click", () => void control(host, "end"));
  byId("btn-new").addEventListener("click", async () => {
    if (!confirm("Start a new run? This resets event state and prize history.")) return;
    host = await ensureRun(true);
  });
  byId("btn-takeover").addEventListener("click", () => void control(host, "takeover", { takeover: true, controllerId: host.controllerId }));
  byId("btn-present").addEventListener("click", () => {
    window.open(`/x/${encodeURIComponent(slug())}/present/${encodeURIComponent(host.code)}`, "_blank");
  });

  startLivePoll({
    code: () => host.code,
    role: "moderator",
    hostKey: () => host.hostKey,
    onState(state) {
      renderMaster(state, host);
    },
  });

  try {
    const data = await liveJson(
      liveGetUrl("live-run", { code: host.code, role: "moderator", hostKey: host.hostKey }),
    );
    if (data.state) renderMaster(data.state as AnyRec, host);
  } catch (e) {
    if (err) {
      err.hidden = false;
      err.textContent = e instanceof Error ? e.message : "Master failed";
    }
  }
}

void main().catch((e) => {
  const err = document.getElementById("err");
  if (err) {
    err.hidden = false;
    err.textContent = e instanceof Error ? e.message : "Master failed";
  }
});

const stopRaceClock = startRaceClock(document.body, () => clockState, (state) => { clockState = state; });
window.addEventListener("pagehide", stopRaceClock, { once: true });
