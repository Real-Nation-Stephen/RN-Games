import { liveEndpoint, liveGetUrl, liveJson } from "./api";
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

function consumeHostKeyFromLocation(): string {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const fromHash = hash.get("hk") || hash.get("hostKey") || "";
  const fromQuery = qs().get("hk") || qs().get("hostKey") || "";
  const key = fromHash || fromQuery;
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

function renderMaster(state: AnyRec, host: { code: string; hostKey: string; controllerId: string }) {
  const activity = (state.activity || {}) as AnyRec;
  const kind = String(activity.kind || "lobby");
  byId("master-code").textContent = String(state.code || host.code);
  byId("master-counts").textContent = `${state.connectedCount || 0} connected · ${state.participantCount || 0} joined · ${state.eligibleCount || 0} eligible for prizes`;
  byId("master-join").textContent = shortJoinUrl(String(state.code || host.code));
  const list = byId("master-steps") as HTMLOListElement;
  list.innerHTML = "";
  const steps = (state.steps || []) as AnyRec[];
  const lobby = document.createElement("li");
  lobby.textContent = "Join screen";
  if (kind === "lobby") lobby.className = "current";
  list.appendChild(lobby);
  for (const step of steps) {
    const li = document.createElement("li");
    li.textContent = `${step.label} (${step.moduleType})${step.liveCapable ? "" : " — not live"}`;
    if (step.current) li.className = "current";
    list.appendChild(li);
  }
  const closing = document.createElement("li");
  closing.textContent = "Closing";
  if (kind === "closing") closing.className = "current";
  list.appendChild(closing);

  const preview = document.getElementById("master-preview") as HTMLIFrameElement;
  const presentUrl = `${location.origin}/x/${encodeURIComponent(slug())}/present/${encodeURIComponent(String(state.code || host.code))}`;
  if (preview && !preview.src.endsWith(presentUrl) && preview.src !== presentUrl) preview.src = presentUrl;

  const panel = byId("master-activity");
  panel.innerHTML = `<h3>${kind}</h3>`;
  const add = (label: string, action: string, extra?: Record<string, unknown>) => {
    const b = document.createElement("button");
    b.className = "live-btn";
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => void control(host, action, extra || {}).catch((e) => alert(e.message)));
    panel.appendChild(b);
  };

  if (kind === "mini-poll") {
    add("Open voting", "open");
    add("Close voting", "close");
    add("Tally scores", "tally");
  } else if (kind === "fill-game") {
    add("Open race", "open");
    add("Finish early", "finish");
  } else if (kind === "mini-quiz") {
    add("Open answers", "open");
    add("Close answers", "close");
    add("Reveal answer", "reveal");
    add("Next question", "next-question");
  } else if (kind === "spinning-wheel") {
    add("Spin", "spin");
  } else if (kind === "scratcher") {
    const label = document.createElement("label");
    label.textContent = "Winner count ";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.value = String(activity.winnerCount || 1);
    input.style.width = "4rem";
    label.appendChild(input);
    panel.appendChild(label);
    const b = document.createElement("button");
    b.className = "live-btn";
    b.textContent = "Release scratchers";
    b.addEventListener("click", () =>
      void control(host, "release", { winnerCount: Number(input.value) || 1 }).catch((e) => alert(e.message)),
    );
    panel.appendChild(b);
  } else if (kind === "pinboard") {
    const subs = (activity.submissions || []) as AnyRec[];
    for (const s of subs) {
      const card = document.createElement("div");
      card.className = "live-pin-card";
      fillPinboardCard(card, s, host);
      const row = document.createElement("div");
      row.className = "live-actions";
      for (const [label, action] of [
        ["Approve", "approve"],
        ["Reject", "reject"],
        ["Remove", "remove"],
      ] as const) {
        const b = document.createElement("button");
        b.className = "live-btn";
        b.textContent = label;
        b.addEventListener("click", () => void control(host, action, { submissionId: s.id }));
        row.appendChild(b);
      }
      card.appendChild(row);
      panel.appendChild(card);
    }
    if (!subs.length) panel.appendChild(Object.assign(document.createElement("p"), { className: "live-body", textContent: "No submissions yet" }));
  }

  const awards = (state.awards || []) as AnyRec[];
  byId("master-awards").textContent = awards.length
    ? awards.map((a) => `#${a.participantNumber} ${a.source}`).join(", ")
    : "No prizes reserved yet";
}

async function ensureRun(forceNew = false) {
  const existing = loadHost();
  const fromLink = consumeHostKeyFromLocation();
  const body: Record<string, unknown> = { slug: slug(), forceNew };
  if (fromLink) body.hostKey = fromLink;
  else if (existing && !forceNew) body.hostKey = existing.hostKey;
  try {
    const data = await liveJson(liveEndpoint("live-run"), {
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
