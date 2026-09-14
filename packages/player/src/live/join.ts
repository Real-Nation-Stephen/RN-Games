import { liveEndpoint, liveJson } from "./api";
import { startLivePoll } from "./poll";
import { applyJoinTheme } from "./theme";
import { optionLayout, renderLogo, escapeHtml, escapeAttr } from "./render";
import { mountScratcher } from "./scratch";
import { drawLiveWheel } from "./wheel-draw";

type AnyRec = Record<string, unknown>;

const STORE = "rngames:live-participant";

function qs() {
  return new URLSearchParams(location.search);
}

function pathParts() {
  return location.pathname.split("/").filter(Boolean);
}

function loadCred(code: string): { participantId: string; secret: string } | null {
  try {
    const raw = localStorage.getItem(`${STORE}:${code}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCred(code: string, participantId: string, secret: string) {
  localStorage.setItem(`${STORE}:${code}`, JSON.stringify({ participantId, secret }));
}

let scratchHandle: { destroy: () => void } | null = null;
let lastTicketKey = "";
let lastState: AnyRec | null = null;

async function join(code: string, slug?: string) {
  const prev = loadCred(code);
  const data = await liveJson(liveEndpoint("live-join"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      slug,
      participantId: prev?.participantId,
      secret: prev?.secret,
    }),
  });
  saveCred(code, String(data.participantId), String(data.secret));
  return data;
}

async function act(code: string, action: string, extra: Record<string, unknown> = {}) {
  const cred = loadCred(code);
  if (!cred) throw new Error("Not joined");
  const state = lastState || {};
  const step = ((state.steps || []) as AnyRec[]).find((s) => s.current);
  const kind = String((state.activity as AnyRec)?.kind || "lobby");
  return liveJson(liveEndpoint("live-action"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      action,
      commandId: crypto.randomUUID(),
      runId: state.runId,
      nodeId: step?.id || kind,
      roundAttemptId: state.roundAttemptId,
      ...cred,
      ...extra,
    }),
  });
}

function phoneShell(html: string): HTMLElement {
  const d = document.createElement("div");
  d.className = "live-phone-chrome";
  d.innerHTML = html;
  return d;
}

function renderPhone(root: HTMLElement, state: AnyRec, code: string) {
  lastState = state;
  const me = (state.me || {}) as AnyRec;
  const activity = (state.activity || {}) as AnyRec;
  const component = (state.component || {}) as AnyRec;
  const kind = String(activity.kind || "lobby");
  applyJoinTheme(state.joinScreen as Record<string, string>, (component.branding || {}) as Record<string, string>, {
    surface: "phone",
  });

  if (kind === "lobby") {
    const js = (state.joinScreen || {}) as AnyRec;
    root.replaceChildren(
      phoneShell(`
        ${renderLogo(String(js.logoUrl || ""))}
        <p class="live-kicker">You are</p>
        <p class="live-number">${String(me.participantNumber || 0).padStart(3, "0")}</p>
        <h1 class="live-headline">${escapeHtml(js.headline || "You're in")}</h1>
        <p class="live-body">Waiting for the host to begin.</p>
      `),
    );
    return;
  }
  if (kind === "closing") {
    const js = (state.joinScreen || {}) as AnyRec;
    root.replaceChildren(
      phoneShell(`<h1 class="live-headline">${escapeHtml(js.closingHeadline || "Thanks")}</h1><p class="live-body">${escapeHtml(js.closingBody || "")}</p>
        <p class="live-number">${String(me.participantNumber || 0).padStart(3, "0")}</p>`),
    );
    return;
  }
  if (kind === "mini-poll") {
    const voted = me.votedOptionId;
    const phase = String(activity.phase);
    if (phase === "tallying") {
      root.replaceChildren(phoneShell(`<h1 class="live-headline">Results incoming</h1><div class="live-anticipation"></div>`));
      return;
    }
    if (phase === "revealed" && activity.tally) {
      const tally = activity.tally as AnyRec;
      const opts = (component.options || []) as AnyRec[];
      const result = String(tally.result || "");
      const status = result === "zero" ? "No votes yet" : result === "tie" ? "It's a tie" : "";
      const shell = phoneShell(`<h1 class="live-headline">${escapeHtml(component.question)}</h1>${status ? `<p class="live-body">${status}</p>` : ""}<div class="live-options"></div>`);
      const row = shell.querySelector(".live-options") as HTMLElement;
      for (const opt of opts) {
        const pct = Number((tally.percents as AnyRec)?.[String(opt.id)] || 0);
        const lay = optionLayout(opt);
        const card = document.createElement("div");
        card.className = `live-option${lay.hasImage ? " has-image" : ""}${lay.hasText ? "" : " no-text"}`;
        card.innerHTML = `${lay.hasImage ? `<img alt="${escapeAttr(opt.accessibleLabel || opt.label)}" src="${escapeAttr(opt.imageUrl)}" />` : ""}<span class="${lay.hasText ? "" : "live-option-label"}">${escapeHtml(lay.hasText ? opt.label : opt.accessibleLabel || "")}</span><strong>${pct}%</strong>`;
        row.appendChild(card);
      }
      root.replaceChildren(shell);
      return;
    }
    const shell = phoneShell(`<h1 class="live-headline">${escapeHtml(component.question || "Vote")}</h1><div class="live-options"></div>`);
    const row = shell.querySelector(".live-options") as HTMLElement;
    for (const opt of (component.options || []) as AnyRec[]) {
      const lay = optionLayout(opt);
      const btn = document.createElement("button");
      btn.className = `live-option${voted === opt.id ? " is-selected" : ""}${lay.hasImage ? " has-image" : ""}${lay.hasText ? "" : " no-text"}`;
      btn.type = "button";
      btn.innerHTML = `${lay.hasImage ? `<img alt="${escapeAttr(opt.accessibleLabel || opt.label)}" src="${escapeAttr(opt.imageUrl)}" />` : ""}<span class="${lay.hasText ? "" : "live-option-label"}">${escapeHtml(lay.hasText ? opt.label : opt.accessibleLabel || "")}</span>`;
      btn.disabled = !!voted || phase !== "open";
      btn.addEventListener("click", () => void act(code, "vote", { optionId: opt.id }));
      row.appendChild(btn);
    }
    if (voted) {
      const p = document.createElement("p");
      p.className = "live-body";
      p.textContent = phase === "open" ? "Vote in" : "Waiting";
      shell.appendChild(p);
    }
    root.replaceChildren(shell);
    return;
  }
  if (kind === "fill-game") {
    const q = (me.question || {}) as AnyRec;
    const fb = me.lastFeedback as AnyRec | null;
    if (me.waitingForBank) {
      root.replaceChildren(phoneShell(`<h1 class="live-headline">You're done</h1><p class="live-body">Wait for your team — more questions aren't needed.</p>`));
      return;
    }
    if (activity.phase !== "racing") {
      root.replaceChildren(phoneShell(`<h1 class="live-headline">${activity.finishedTeamId ? "Race over" : "Get ready"}</h1><p class="live-body">Team ${escapeHtml(me.teamId || "")}</p>`));
      return;
    }
    const shell = phoneShell(`
      <p class="live-kicker">${escapeHtml(me.teamId || "")}${fb ? (fb.correct ? " · Correct +1" : " · Incorrect −1") : ""}</p>
      <h1 class="live-headline">${escapeHtml(q.prompt || "")}</h1>
      <div class="live-options"></div>
    `);
    const row = shell.querySelector(".live-options") as HTMLElement;
    for (const c of (q.choices || []) as AnyRec[]) {
      const btn = document.createElement("button");
      btn.className = "live-option";
      btn.type = "button";
      btn.textContent = String(c.label || "");
      btn.addEventListener("click", () => void act(code, "answer", { questionId: q.id, choiceId: c.id }));
      row.appendChild(btn);
    }
    root.replaceChildren(shell);
    return;
  }
  if (kind === "mini-quiz") {
    const q = (component.currentQuestion || {}) as AnyRec;
    const phase = String(activity.phase);
    if (phase === "idle" || phase === "done") {
      root.replaceChildren(phoneShell(`<h1 class="live-headline">${phase === "done" ? "Quiz complete" : "Get ready"}</h1>`));
      return;
    }
    if (phase === "revealed") {
      root.replaceChildren(
        phoneShell(`<h1 class="live-headline">${escapeHtml(q.prompt)}</h1>
          <p class="live-body">${me.correct ? "Correct" : me.answered ? "Not this one" : "You didn't answer"}</p>
          <p class="live-body">${activity.noAnswers ? "No answers yet" : `${activity.percentCorrect}% correct`}</p>`),
      );
      return;
    }
    const shell = phoneShell(`<h1 class="live-headline">${escapeHtml(q.prompt || "")}</h1><div class="live-options"></div>`);
    const row = shell.querySelector(".live-options") as HTMLElement;
    for (const c of (q.choices || []) as AnyRec[]) {
      const btn = document.createElement("button");
      btn.className = `live-option${me.choiceId === c.id ? " is-selected" : ""}`;
      btn.type = "button";
      btn.textContent = String(c.label || "");
      btn.disabled = !!me.answered || phase !== "open";
      btn.addEventListener("click", () => void act(code, "answer", { questionId: q.id, choiceId: c.id }));
      row.appendChild(btn);
    }
    root.replaceChildren(shell);
    return;
  }
  if (kind === "pinboard") {
    const shell = phoneShell(`<h1 class="live-headline">Add to the board</h1>
      <textarea id="pin-note" rows="3" style="width:100%;border-radius:12px;padding:10px" placeholder="A short note"></textarea>
      <input id="pin-photo" type="file" accept="image/*" />
      <button class="live-btn" id="pin-send" type="button">Submit</button>
      <p class="live-body">Pending posts stay off the audience screens until approved.</p>`);
    shell.querySelector("#pin-send")?.addEventListener("click", async () => {
      const text = (shell.querySelector("#pin-note") as HTMLTextAreaElement).value;
      const file = (shell.querySelector("#pin-photo") as HTMLInputElement).files?.[0];
      let imageDataUrl: string | undefined;
      if (file) {
        imageDataUrl = await compressImage(file);
      }
      await act(code, "submit", { kind: imageDataUrl ? "photo" : "note", text, imageDataUrl });
    });
    root.replaceChildren(shell);
    return;
  }
  if (kind === "spinning-wheel") {
    const inPool = !!me.inPool;
    const isWinner = !!me.isWinner && activity.phase === "revealed";
    if (activity.phase === "spinning") {
      const wrap = phoneShell(`<p class="live-kicker">${inPool ? "You're in this draw" : "Watch the draw"}</p><p class="live-pointer-readout" id="wheel-readout">—</p><div class="live-wheel-wrap"><canvas id="live-wheel"></canvas></div>`);
      const canvas = wrap.querySelector("canvas") as HTMLCanvasElement;
      const readout = wrap.querySelector("#wheel-readout") as HTMLElement;
      const tick = () => {
        const { number } = drawLiveWheel(canvas, activity as never);
        readout.textContent = number != null ? String(number).padStart(3, "0") : "—";
        if (activity.phase === "spinning") requestAnimationFrame(tick);
      };
      tick();
      root.replaceChildren(wrap);
      return;
    }
    root.replaceChildren(
      phoneShell(
        isWinner
          ? `<h1 class="live-headline">You won!</h1><p class="live-number">${String(me.participantNumber).padStart(3, "0")}</p>`
          : `<h1 class="live-headline">${activity.phase === "revealed" ? "Not this round" : "Prize draw"}</h1><p class="live-body">Your number is ${String(me.participantNumber).padStart(3, "0")}</p>`,
      ),
    );
    return;
  }
  if (kind === "scratcher") {
    if (me.alreadyWon) {
      root.replaceChildren(phoneShell(`<h1 class="live-headline">Already won this session</h1><p class="live-body">One prize per participant for the whole run.</p>`));
      return;
    }
    if (me.waitingNextRelease || !me.ticket) {
      root.replaceChildren(phoneShell(`<h1 class="live-headline">Waiting</h1><p class="live-body">You'll get a ticket on the next release if you're still eligible.</p>`));
      return;
    }
    const ticket = me.ticket as AnyRec;
    if (ticket.revealed) {
      root.replaceChildren(
        phoneShell(
          ticket.isWin
            ? `<h1 class="live-headline">You won!</h1><p class="live-number">${String(me.participantNumber).padStart(3, "0")}</p>`
            : `<h1 class="live-headline">Not this time</h1>`,
        ),
      );
      return;
    }
    const shell = phoneShell(`<h1 class="live-headline">Scratch your ticket</h1><div id="scratch-host"></div>`);
    root.replaceChildren(shell);
    const key = `${state.roundAttemptId}:${me.participantId}`;
    if (lastTicketKey !== key) {
      scratchHandle?.destroy();
      lastTicketKey = key;
      const assets = (component.assets || {}) as AnyRec;
      scratchHandle = mountScratcher({
        host: shell.querySelector("#scratch-host") as HTMLElement,
        isWin: !!ticket.isWin,
        winSrc: String(assets.bottomWin || ""),
        loseSrc: String(assets.bottomLose || ""),
        threshold: Number(component.clearThreshold || 0.45),
        onComplete: () => void act(code, "reveal-ticket", { ticketId: ticket.ticketId }),
      });
    }
    return;
  }
  root.replaceChildren(phoneShell(`<h1 class="live-headline">Holding</h1>`));
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const max = 720;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = url;
  });
}

async function main() {
  const app = document.getElementById("app");
  const err = document.getElementById("err");
  const gate = document.getElementById("gate");
  if (!app) return;
  const parts = pathParts();
  let code = (qs().get("code") || "").toUpperCase();
  if (!code && parts[0] === "j" && parts[1]) code = parts[1].toUpperCase();
  const slug = qs().get("slug") || (parts[0] === "x" && parts[1] ? parts[1] : "");

  const manual = document.getElementById("manual-code") as HTMLInputElement | null;
  const go = document.getElementById("manual-go");
  go?.addEventListener("click", () => {
    const c = (manual?.value || "").trim().toUpperCase();
    if (c) location.href = `/j/${encodeURIComponent(c)}`;
  });

  if (!code && slug) {
    try {
      const data = await liveJson(`/api/live-run?slug=${encodeURIComponent(slug)}&role=public`);
      code = String((data.state as AnyRec)?.code || "");
    } catch {
      /* show gate */
    }
  }
  if (!code) {
    if (gate) gate.hidden = false;
    return;
  }
  try {
    const joined = await join(code, slug);
    if (gate) gate.hidden = true;
    app.hidden = false;
    const root = document.getElementById("live-main") as HTMLElement;
    renderPhone(root, joined.state as AnyRec, code);
    const cred = loadCred(code);
    startLivePoll({
      code: () => code,
      role: "participant",
      participantId: () => cred?.participantId || "",
      participantSecret: () => cred?.secret || "",
      onState(state) {
        renderPhone(root, state, code);
        void act(code, "heartbeat").catch(() => undefined);
      },
    });
  } catch (e) {
    if (err) {
      err.hidden = false;
      err.textContent = e instanceof Error ? e.message : "Could not join";
    }
  }
}

void main();
