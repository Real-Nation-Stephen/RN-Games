import { pickLiveCopy } from "@rngames/shared";

type AnyRec = Record<string, unknown>;

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeAttr(s: unknown): string {
  return escapeHtml(s);
}

export function renderLogo(url?: string): string {
  return url ? `<img class="live-logo" alt="" src="${escapeAttr(url)}" />` : "";
}

export function textHtml(value: unknown): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

export function padNumber(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "000";
  return String(Math.max(0, Math.round(n))).padStart(3, "0");
}

export function joinScreenOf(state: AnyRec): AnyRec {
  return (state.joinScreen || {}) as AnyRec;
}

export function activityOf(state: AnyRec): AnyRec {
  return (state.activity || {}) as AnyRec;
}

export function componentOf(state: AnyRec): AnyRec {
  return (state.component || {}) as AnyRec;
}

export function liveCopyOf(state: AnyRec): AnyRec {
  return (componentOf(state).liveCopy || {}) as AnyRec;
}

export function headerLabel(state: AnyRec): string {
  const js = joinScreenOf(state);
  const component = componentOf(state);
  const activity = activityOf(state);
  const prefix = String(js.headerLabel || "").trim();
  const title = String(component.title || state.title || activity.kind || "Live");
  return prefix ? `${prefix} / ${title}` : title;
}

export function connectedLabel(state: AnyRec): string {
  const n = Math.max(0, Number(state.connectedCount || 0));
  return `${n} ${n === 1 ? "person" : "people"} connected`;
}

/**
 * Identity for Presenter entrance animation only.
 * Scores, vote counts, wheel pool and pinboard copy must not live here —
 * those update in place by re-rendering without replaying entrance.
 */
export function entranceIdentity(state: AnyRec): string {
  const activity = activityOf(state);
  const latest = ((activity.celebrationQueue || []) as AnyRec[]).slice(-1)[0];
  const step = ((state.steps || []) as AnyRec[]).find((s) => s.current) || {};
  const question = (componentOf(state).currentQuestion || {}) as AnyRec;
  return [
    activity.kind,
    activity.phase,
    state.roundAttemptId,
    step.id || state.nodeId,
    activity.questionIndex,
    question.id,
    latest?.participantNumber,
    activity.winnerNumber,
    activity.finishedTeamId,
  ].join(":");
}

/** Phone scene transitions only — not vote counts, scores, or wheel pool. */
export function phoneEntranceIdentity(state: AnyRec): string {
  const activity = activityOf(state);
  const me = (state.me || {}) as AnyRec;
  const question = ((me.question || componentOf(state).currentQuestion || {}) as AnyRec);
  const ticket = (me.ticket || {}) as AnyRec;
  return [
    activity.kind,
    activity.phase,
    state.roundAttemptId,
    question.id,
    me.votedOptionId,
    me.answered ? 1 : 0,
    me.waitingForBank ? 1 : 0,
    me.alreadyWon ? 1 : 0,
    me.isWinner ? 1 : 0,
    ticket.ticketId,
    ticket.revealed ? 1 : 0,
    activity.winnerNumber,
    activity.finishedTeamId,
  ].join(":");
}

export function fillPresenterHead(el: HTMLElement | null, state: AnyRec) {
  if (!el) return;
  const js = joinScreenOf(state);
  el.innerHTML = `${renderLogo(String(js.logoUrl || ""))}<p class="live-frame-label">${escapeHtml(headerLabel(state))}</p>`;
}

export function phoneFrame(opts: {
  logoUrl?: string;
  number?: unknown;
  footer?: string;
  bodyHtml: string;
  extraClass?: string;
}): HTMLElement {
  const d = document.createElement("div");
  d.className = `live-phone-frame${opts.extraClass ? ` ${opts.extraClass}` : ""}`;
  const footer = opts.footer
    ? `<p class="live-phone-foot">${escapeHtml(opts.footer)}</p>`
    : `<p class="live-phone-foot">Connected</p>`;
  d.innerHTML = `
    <header class="live-phone-head">
      ${renderLogo(opts.logoUrl)}
      <p class="live-phone-id">You are ${padNumber(opts.number)}</p>
    </header>
    <div class="live-phone-body">${opts.bodyHtml}</div>
    ${footer}
  `;
  return d;
}

export function contentBox(html: string, extraClass = ""): HTMLElement {
  const box = document.createElement("div");
  box.className = `live-frame-content${extraClass ? ` ${extraClass}` : ""}`;
  box.innerHTML = html;
  return box;
}

export function artImg(url: string, extraClass = "live-hero-art"): string {
  const src = String(url || "").trim();
  if (!src) return "";
  return `<img class="${extraClass}" alt="" src="${escapeAttr(src)}" />`;
}

export function copy(state: AnyRec, key: string, fallback: string): string {
  return pickLiveCopy(liveCopyOf(state), key, fallback);
}
