import { startRaceClock, timedFillState, raceClockHtml, fillResultText, observeServerTime } from "./race-clock";
import { liveEndpoint, liveJson } from "./api";
import { startLivePoll } from "./poll";
import { applyJoinTheme } from "./theme";
import { optionLayout, escapeHtml, escapeAttr, pollImage, pollAnswer } from "./render";
import { mountScratcher } from "./scratch";
import { drawLiveWheel } from "./wheel-draw";
import {
  activityOf,
  artImg,
  componentOf,
  copy,
  joinScreenOf,
  padNumber,
  phoneFrame,
  phoneEntranceIdentity,
  textHtml,
} from "./frame";

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

let scratchHandle: { destroy: () => void; attach: (host: HTMLElement) => void } | null = null;
let lastTicketKey = "";
let lastState: AnyRec | null = null;
let lastPhoneScene = "";
let phoneWheelRaf = 0;
let phoneEnterTimer = 0;
let readyAttempt = '';

function acknowledgeReady(code: string, state: AnyRec) {
  const readiness = activityOf(state);
  const key = `${state.runId}:${state.roundAttemptId}`;
  if (readiness.kind !== 'fill-game' || !readiness.readinessRequired || readyAttempt === key || !Array.isArray(componentOf(state).questions)) return;
  readyAttempt = key;
  void act(code, 'ready').catch(() => { if (readyAttempt === key) readyAttempt = ''; });
}

function cancelPhoneWheel() {
  cancelAnimationFrame(phoneWheelRaf);
  phoneWheelRaf = 0;
}

function startPhoneWheelTick(root: HTMLElement) {
  cancelPhoneWheel();
  const tick = () => {
    const current = lastState;
    if (!current) return;
    const act = activityOf(current);
    const canvas = root.querySelector("#live-wheel") as HTMLCanvasElement | null;
    const readout = root.querySelector("#wheel-readout") as HTMLElement | null;
    if (!canvas || String(act.phase) !== "spinning") {
      phoneWheelRaf = 0;
      return;
    }
    const { number } = drawLiveWheel(canvas, act as never);
    if (readout) readout.textContent = number != null ? padNumber(number) : "—";
    phoneWheelRaf = requestAnimationFrame(tick);
  };
  tick();
}

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

function phoneChrome(state: AnyRec, bodyHtml: string, footer?: string, extraClass?: string): HTMLElement {
  const js = joinScreenOf(state);
  const me = (state.me || {}) as AnyRec;
  return phoneFrame({
    logoUrl: String(js.logoUrl || ""),
    number: me.participantNumber,
    footer,
    bodyHtml,
    extraClass,
  });
}

function safeTeamHex(value: unknown): string {
  const hex = String(value || "");
  return /^#[0-9a-fA-F]{3,8}$/.test(hex) ? hex : "";
}

function teamDisplayName(me: AnyRec): string {
  return String(me.teamName || me.teamId || "");
}

function teamNameHtml(me: AnyRec): string {
  const name = escapeHtml(teamDisplayName(me));
  const hex = safeTeamHex(me.teamColorHex);
  const style = hex ? ` style="color:${hex}"` : "";
  return `<span${style}>${name}</span>`;
}

function playPhoneEnter(root: HTMLElement) {
  root.classList.remove("live-enter");
  void root.offsetWidth;
  root.classList.add("live-enter");
  window.clearTimeout(phoneEnterTimer);
  phoneEnterTimer = window.setTimeout(() => root.classList.remove("live-enter"), 950);
}

function mountPhone(root: HTMLElement, node: HTMLElement, enter: boolean) {
  root.replaceChildren(node);
  if (enter) playPhoneEnter(root);
}

function lockChoices(row: HTMLElement, chosen?: HTMLElement) {
  for (const btn of row.querySelectorAll("button")) {
    (btn as HTMLButtonElement).disabled = true;
  }
  chosen?.classList.add("is-selected");
}

function renderPhone(root: HTMLElement, state: AnyRec, code: string) {
  if (lastState?.runId === state.runId && Number(state.revision) < Number(lastState.revision)) return;
  state = timedFillState(state);
  lastState = state;
  acknowledgeReady(code, state);
  const me = (state.me || {}) as AnyRec;
  const activity = activityOf(state);
  const component = componentOf(state);
  const kind = String(activity.kind || "lobby");
  const js = joinScreenOf(state);
  applyJoinTheme(state.joinScreen as Record<string, unknown>, undefined, {
    surface: "phone",
    component,
  });
  if (kind !== "spinning-wheel" || String(activity.phase) !== "spinning") {
    cancelPhoneWheel();
  }

  const scene = phoneEntranceIdentity(state);
  const enter = scene !== lastPhoneScene;
  if (
    !enter &&
    root.querySelector(".live-phone-frame") &&
    !(kind === "spinning-wheel" && String(activity.phase) === "spinning" && !root.querySelector("#live-wheel"))
  ) {
    if (kind === "spinning-wheel" && String(activity.phase) === "spinning") {
      const kicker = root.querySelector(".live-eyebrow");
      if (kicker) kicker.textContent = me.inPool ? "You're in this draw" : "Watch the draw";
      if (!phoneWheelRaf) startPhoneWheelTick(root);
    }
    return;
  }
  lastPhoneScene = scene;

  const show = (bodyHtml: string, footer?: string, extraClass?: string) => {
    mountPhone(root, phoneChrome(state, bodyHtml, footer, extraClass), enter);
  };

  if (kind === "lobby") {
    show(
      `<h1 class="live-display">${textHtml(js.phoneHeadline || js.headline || "You're in")}</h1><p class="live-body">${textHtml(js.phoneBody || "Waiting for the host to begin.")}</p>`,
      "Connected · keep this screen open",
      "is-lobby",
    );
    return;
  }
  if (kind === "closing") {
    const takeaway = String(js.closingTakeaway || js.closingBody || "");
    const thanks = String(js.closingThanks || "");
    show(
      `<h1 class="live-display">${textHtml(js.closingHeadline || "Thanks")}</h1>${takeaway ? `<p class="live-accent-line">${textHtml(takeaway)}</p>` : ""}${thanks ? `<p class="live-body">${textHtml(thanks)}</p>` : ""}`,
      "Connected",
      "is-closing",
    );
    return;
  }
  if (kind === "mini-poll") {
    const voted = me.votedOptionId;
    const phase = String(activity.phase);
    const sub = String(component.subquestion || "");
    const footerOpen = "Connected · the host will reveal the result";
    if (phase === "tallying") {
      show(`<h1 class="live-display">Results incoming</h1><div class="live-anticipation"></div>`, footerOpen, "is-lobby");
      return;
    }
    if (phase === "revealed" && activity.tally) {
      const tally = activity.tally as AnyRec;
      const opts = (component.options || []) as AnyRec[];
      const result = String(tally.result || "");
      const status = result === "zero" ? "No votes yet" : result === "tie" ? "It's a tie" : "";
      const shell = phoneChrome(
        state,
        `<h1 class="live-question">${textHtml(component.question)}</h1>${pollImage(component)}${pollAnswer(component, activity)}${sub ? `<p class="live-subhead">${textHtml(sub)}</p>` : ""}${status ? `<p class="live-body">${status}</p>` : ""}<div class="live-options"></div>`,
        footerOpen,
      );
      const row = shell.querySelector(".live-options") as HTMLElement;
      for (const opt of opts) {
        const pct = Number((tally.percents as AnyRec)?.[String(opt.id)] || 0);
        const lay = optionLayout(opt);
        const card = document.createElement("div");
        card.className = `live-option${lay.hasImage ? " has-image" : ""}${lay.hasText ? "" : " no-text"}`;
        card.innerHTML = `${lay.hasImage ? `<img alt="${escapeAttr(opt.accessibleLabel || opt.label)}" src="${escapeAttr(opt.imageUrl)}" />` : ""}<span class="${lay.hasText ? "" : "live-option-label"}">${escapeHtml(lay.hasText ? opt.label : opt.accessibleLabel || "")}</span><span class="live-tally-bar" style="--pct:${pct}%"></span><strong>${pct}%</strong>`;
        row.appendChild(card);
      }
      mountPhone(root, shell, enter);
      return;
    }
    if (voted) {
      const selected = ((component.options || []) as AnyRec[]).find((o) => o.id === voted);
      const lay = selected ? optionLayout(selected) : { hasText: false, hasImage: false };
      show(
        `<h1 class="live-display">Locked in.</h1>
        ${selected ? `<div class="live-option is-selected${lay.hasImage ? " has-image" : ""}">${lay.hasImage ? `<img alt="${escapeAttr(selected.accessibleLabel || selected.label)}" src="${escapeAttr(selected.imageUrl)}" />` : ""}<span>${escapeHtml(selected.label || selected.accessibleLabel || "")}</span></div>` : ""}
        <p class="live-body">Eyes up—the host will reveal the result.</p>`,
        footerOpen,
        "is-locked",
      );
      return;
    }
    const shell = phoneChrome(
      state,
      `<h1 class="live-question">${textHtml(component.question || "Vote")}</h1>${pollImage(component)}${sub ? `<p class="live-subhead">${textHtml(sub)}</p>` : ""}<div class="live-options"></div>`,
      footerOpen,
    );
    const row = shell.querySelector(".live-options") as HTMLElement;
    for (const opt of (component.options || []) as AnyRec[]) {
      const lay = optionLayout(opt);
      const btn = document.createElement("button");
      btn.className = `live-option${lay.hasImage ? " has-image" : ""}${lay.hasText ? "" : " no-text"}`;
      btn.type = "button";
      btn.innerHTML = `${lay.hasImage ? `<img alt="${escapeAttr(opt.accessibleLabel || opt.label)}" src="${escapeAttr(opt.imageUrl)}" />` : ""}<span class="${lay.hasText ? "" : "live-option-label"}">${escapeHtml(lay.hasText ? opt.label : opt.accessibleLabel || "")}</span>`;
      btn.disabled = phase !== "open";
      btn.addEventListener("click", () => {
        lockChoices(row, btn);
        void act(code, "vote", { optionId: opt.id });
      });
      row.appendChild(btn);
    }
    mountPhone(root, shell, enter);
    return;
  }
  if (kind === "fill-game") {
    const q = (me.question || {}) as AnyRec;
    const fb = me.lastFeedback as AnyRec | null;
    if (activity.phase === "finished" || activity.phase === "awaiting-result") {
      show(`<h1 class="live-display">${textHtml(fillResultText(activity) || "Time’s up")}</h1><p class="live-lede">${teamNameHtml(me)}</p>`, "Eyes up for the results", "is-lobby");
      return;
    }
    if (!["racing", "countdown"].includes(String(activity.phase))) {
      show(`${raceClockHtml()}<h1 class="live-display">${activity.phase === "held" ? "Race paused" : "Get ready"}</h1><p class="live-lede">${teamNameHtml(me)}</p>`, "Connected · wait for the host", "is-lobby");
      return;
    }
    if (me.waitingForBank) {
      show(`${raceClockHtml()}<h1 class="live-display">All answered</h1><p class="live-body">Cheer your team on and watch the screen.</p><p class="live-lede">${teamNameHtml(me)}</p>`, "Connected", "is-lobby");
      return;
    }
    const preparing = activity.phase === "countdown";
    const shell = phoneChrome(state,
      `${raceClockHtml()}<p class="live-eyebrow">${teamNameHtml(me)}${fb ? (fb.correct ? " · Correct +1" : " · Incorrect −1") : ""}</p><div class="live-race-question"${preparing ? " hidden" : ""}><h1 class="live-question">${escapeHtml(q.prompt || "")}</h1><div class="live-options"></div></div>`,
      preparing ? "Questions loaded · get ready" : "Race on");
    const row = shell.querySelector(".live-options") as HTMLElement;
    for (const c of (q.choices || []) as AnyRec[]) {
      const btn = document.createElement("button");
      btn.className = "live-option";
      btn.type = "button";
      btn.textContent = String(c.label || "");
      btn.disabled = preparing;
      btn.addEventListener("click", async () => {
        if (timedFillState(lastState || state).activity && (timedFillState(lastState || state).activity as AnyRec).phase !== "racing") return;
        lockChoices(row, btn);
        const sentAt = Date.now();
        try {
          const response = await act(code, "answer", { questionId: q.id, choiceId: c.id });
          const next = response.state as AnyRec;
          observeServerTime(next?.now, sentAt);
          if (next && next.runId === lastState?.runId && next.roundAttemptId === lastState?.roundAttemptId) renderPhone(root, next, code);
        } catch (error) {
          // Do not leave the player stuck behind disabled buttons after a rejected request.
          if (row.isConnected && (timedFillState(lastState || state).activity as AnyRec).phase === "racing") {
            for (const button of row.querySelectorAll("button")) (button as HTMLButtonElement).disabled = false;
            const message = document.createElement("p"); message.className = "live-body";
            message.textContent = error instanceof Error ? error.message : "Answer not sent. Please try again.";
            row.appendChild(message);
          }
        }
      });
      row.appendChild(btn);
    }
    mountPhone(root, shell, enter);
    return;
  }
  if (kind === "mini-quiz") {
    const q = (component.currentQuestion || {}) as AnyRec;
    const phase = String(activity.phase);
    if (phase === "idle" || phase === "done") {
      show(`<h1 class="live-display">${phase === "done" ? "Quiz complete" : "Get ready"}</h1>`, "Connected", "is-lobby");
      return;
    }
    if (phase === "revealed") {
      show(
        `<h1 class="live-question">${textHtml(q.prompt)}</h1><p class="live-lede">${me.correct ? "Correct" : me.answered ? "Not this one" : "You didn't answer"}</p><p class="live-body">${activity.noAnswers ? "No answers yet" : `${activity.percentCorrect}% correct`}</p>`,
        "Connected",
      );
      return;
    }
    if (me.answered) {
      const selected = ((q.choices || []) as AnyRec[]).find((c) => c.id === me.choiceId);
      show(
        `<h1 class="live-display">Locked in.</h1>${selected ? `<div class="live-option is-selected"><span>${escapeHtml(selected.label || "")}</span></div>` : ""}<p class="live-body">Eyes up—the host will reveal the answer.</p>`,
        "Connected · the host will reveal the answer",
        "is-locked",
      );
      return;
    }
    const shell = phoneChrome(state, `<h1 class="live-question">${textHtml(q.prompt || "")}</h1><div class="live-options"></div>`, "Connected");
    const row = shell.querySelector(".live-options") as HTMLElement;
    for (const c of (q.choices || []) as AnyRec[]) {
      const btn = document.createElement("button");
      btn.className = "live-option";
      btn.type = "button";
      btn.textContent = String(c.label || "");
      btn.disabled = phase !== "open";
      btn.addEventListener("click", () => {
        lockChoices(row, btn);
        void act(code, "answer", { questionId: q.id, choiceId: c.id });
      });
      row.appendChild(btn);
    }
    mountPhone(root, shell, enter);
    return;
  }
  if (kind === "pinboard") {
    const shell = phoneChrome(
      state,
      `<h1 class="live-question">${textHtml((component.board as AnyRec)?.header || (component.mobile as AnyRec)?.headline || component.title || "Add to the board")}</h1>
      <textarea id="pin-note" rows="3" placeholder="A short note"></textarea>
      <input id="pin-photo" type="file" accept="image/*" />
      <button class="live-btn" id="pin-send" type="button">Submit</button>
      <p class="live-body">Pending posts stay off the audience screens until approved.</p>`,
      "Connected",
      "is-pinboard",
    );
    shell.querySelector("#pin-send")?.addEventListener("click", async () => {
      const btn = shell.querySelector("#pin-send") as HTMLButtonElement | null;
      const note = shell.querySelector("#pin-note") as HTMLTextAreaElement | null;
      const photo = shell.querySelector("#pin-photo") as HTMLInputElement | null;
      if (!btn || btn.disabled) return;
      btn.disabled = true;
      try {
        let imageDataUrl: string | undefined;
        const file = photo?.files?.[0];
        if (file) imageDataUrl = await compressImage(file);
        await act(code, "submit", { kind: imageDataUrl ? "photo" : "note", text: note?.value || "", imageDataUrl });
        if (note) note.value = "";
        if (photo) photo.value = "";
        btn.textContent = "Sent";
      } catch {
        btn.disabled = false;
      }
    });
    mountPhone(root, shell, enter);
    return;
  }
  if (kind === "spinning-wheel") {
    const inPool = !!me.inPool;
    const isWinner = !!me.isWinner && activity.phase === "revealed";
    if (activity.phase === "spinning") {
      const existing = root.querySelector("#live-wheel") as HTMLCanvasElement | null;
      if (existing) {
        const kicker = root.querySelector(".live-eyebrow");
        if (kicker) kicker.textContent = inPool ? "You're in this draw" : "Watch the draw";
        if (!phoneWheelRaf) startPhoneWheelTick(root);
        return;
      }
      const wrap = phoneChrome(
        state,
        `<p class="live-eyebrow">${inPool ? "You're in this draw" : "Watch the draw"}</p><p class="live-pointer-readout" id="wheel-readout">—</p><div class="live-wheel-wrap"><canvas id="live-wheel"></canvas></div>`,
        "Connected",
        "is-wheel is-spinning",
      );
      mountPhone(root, wrap, enter);
      startPhoneWheelTick(root);
      return;
    }
    show(
      isWinner
        ? `<h1 class="live-display">${textHtml(copy(state, "winHeadline", "You won!"))}</h1><p class="live-number live-number-accent">${padNumber(me.participantNumber)}</p><p class="live-body">${textHtml(copy(state, "phoneWinBody", ""))}</p>`
        : `<h1 class="live-display">${activity.phase === "revealed" ? textHtml(copy(state, "loseHeadline", "Not this round")) : textHtml(copy(state, "headline", "Prize draw"))}</h1><p class="live-body">Your number is ${padNumber(me.participantNumber)}</p>`,
      "Connected",
      isWinner ? "is-win" : activity.phase === "revealed" ? "is-lose" : "is-wheel",
    );
    return;
  }
  if (kind === "scratcher") {
    const assets = (component.assets || {}) as AnyRec;
    if (me.alreadyWon) {
      scratchHandle?.destroy();
      scratchHandle = null;
      lastTicketKey = "";
      const medallion = String(copy(state, "medallionUrl", "") || assets.button || "");
      show(
        `${medallion ? artImg(medallion, "live-medallion") : ""}<h1 class="live-display">${textHtml(copy(state, "alreadyWonHeadline", "You've already won."))}</h1><p class="live-number live-number-accent">${padNumber(me.participantNumber)}</p><p class="live-lede">${textHtml(copy(state, "alreadyWonBody", "Your prize is secured. Give the next winner a cheer."))}</p><p class="live-note">${textHtml(copy(state, "onePrizeNote", "One prize per person"))}</p>`,
        "Connected",
        "is-already-won",
      );
      return;
    }
    if (me.waitingNextRelease || !me.ticket) {
      scratchHandle?.destroy();
      scratchHandle = null;
      lastTicketKey = "";
      const cover = String(assets.top || "");
      show(
        `${cover ? `<div class="live-cover-card is-phone">${artImg(cover, "live-cover-art")}</div>` : ""}<h1 class="live-display">${textHtml(copy(state, "waitingHeadline", "Your moment is coming."))}</h1><p class="live-body">${textHtml(copy(state, "waitingBody", "Keep this screen open. Your card will appear here."))}</p>`,
        "Connected · waiting for a card",
        "is-waiting",
      );
      return;
    }
    const ticket = me.ticket as AnyRec;
    if (ticket.revealed) {
      scratchHandle?.destroy();
      scratchHandle = null;
      lastTicketKey = "";
      if (ticket.isWin) {
        const winArt = String(assets.bottomWin || "");
        show(
          `${winArt ? artImg(winArt, "live-outcome-art") : ""}<h1 class="live-display">${textHtml(copy(state, "phoneWinHeadline", copy(state, "winnerHeadline", "That's a win!")))}</h1><p class="live-number live-number-accent">${padNumber(me.participantNumber)}</p><p class="live-body">${textHtml(copy(state, "phoneWinBody", copy(state, "winnerBody", "Show your number to the host.")))}</p>`,
          "Connected",
          "is-win",
        );
      } else {
        const loseArt = String(assets.bottomLose || "");
        show(
          `${loseArt ? artImg(loseArt, "live-outcome-art") : ""}<h1 class="live-display">${textHtml(copy(state, "loseHeadline", "Not this time."))}</h1><p class="live-body">${textHtml(copy(state, "loseBody", "Give the winners a cheer."))}</p>`,
          "Connected",
          "is-lose",
        );
      }
      return;
    }
    const key = `${state.roundAttemptId}:${me.participantId}`;
    if (lastTicketKey === key && scratchHandle && root.querySelector("#scratch-host")) {
      return;
    }
    scratchHandle?.destroy();
    lastTicketKey = key;
    const shell = phoneChrome(
      state,
      `<h1 class="live-question">${textHtml(copy(state, "phoneInstruction", "Scratch your card"))}</h1><div id="scratch-host"></div>`,
      "Connected",
      "is-scratch",
    );
    mountPhone(root, shell, enter);
    const host = shell.querySelector("#scratch-host") as HTMLElement;
    scratchHandle = mountScratcher({
      host,
      isWin: !!ticket.isWin,
      winSrc: String(assets.bottomWin || ""),
      loseSrc: String(assets.bottomLose || ""),
      coverSrc: String(assets.top || ""),
      formatId: String(component.scratcherFormat || "9x16"),
      threshold: Number(component.clearThreshold ?? 0.97),
      onComplete: () => void act(code, "reveal-ticket", { ticketId: ticket.ticketId }),
    });
    return;
  }
  show(`<h1 class="live-display">Holding</h1>`);
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
  manual?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go?.dispatchEvent(new Event("click"));
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
    const joinedAt = Date.now();
    const joined = await join(code, slug);
    observeServerTime((joined.state as AnyRec)?.now, joinedAt);
    if (gate) gate.hidden = true;
    app.hidden = false;
    const root = document.getElementById("live-main") as HTMLElement;
    renderPhone(root, joined.state as AnyRec, code);
    const cred = loadCred(code);
    const stopClock = startRaceClock(root, () => lastState, (state) => renderPhone(root, state, code));
    window.addEventListener("pagehide", stopClock, { once: true });
    // Presence does not need to be written for every score update.
    const heartbeatTimer = window.setInterval(() => { void act(code, "heartbeat").catch(() => undefined); }, 15_000);
    window.addEventListener("pagehide", () => window.clearInterval(heartbeatTimer), { once: true });
    startLivePoll({
      code: () => code,
      role: "participant",
      participantId: () => cred?.participantId || "",
      participantSecret: () => cred?.secret || "",
      onState(state) {
        renderPhone(root, state, code);

      },
      onUnchanged() { if (lastState) acknowledgeReady(code, lastState); },
    });
  } catch (e) {
    if (err) {
      err.hidden = false;
      err.textContent = e instanceof Error ? e.message : "Could not join";
    }
  }
}

void main();
