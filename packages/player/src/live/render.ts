import { raceClockHtml } from "./race-clock";
import { cueProgress, prefersReducedMotion } from "./theme";
import {
  activityOf,
  artImg,
  componentOf,
  contentBox,
  copy,
  escapeAttr,
  escapeHtml,
  joinScreenOf,
  padNumber,
  renderLogo,
  textHtml,
} from "./frame";

type AnyRec = Record<string, unknown>;

function el(html: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild as HTMLElement;
}

export { escapeHtml, escapeAttr, renderLogo };

export function optionLayout(opt: AnyRec): { hasText: boolean; hasImage: boolean } {
  return { hasText: !!String(opt.label || "").trim(), hasImage: !!String(opt.imageUrl || "").trim() };
}

export function renderLobby(state: AnyRec, _featuredDock = false): HTMLElement {
  const js = joinScreenOf(state);
  const hero = artImg(String(js.heroImageUrl || ""));
  return contentBox(
    `
    <div class="live-split">
      <div class="live-split-copy">
        ${js.eyebrow ? `<p class="live-eyebrow">${textHtml(js.eyebrow)}</p>` : ""}
        <h1 class="live-display">${textHtml(js.headline || state.title || "Join")}</h1>
        ${js.instructions ? `<p class="live-lede">${textHtml(js.instructions)}</p>` : ""}
        ${js.joinCue ? `<p class="live-body">${textHtml(js.joinCue)}</p>` : ""}
      </div>
      ${hero ? `<div class="live-split-art">${hero}</div>` : ""}
    </div>
  `,
    "is-welcome",
  );
}

export function renderClosing(state: AnyRec): HTMLElement {
  const js = joinScreenOf(state);
  const takeaway = String(js.closingTakeaway || js.closingBody || "");
  const thanks = String(js.closingThanks || "");
  return contentBox(
    `
    <div class="live-closing">
      <h1 class="live-display live-display-lg">${textHtml(js.closingHeadline || "Thanks for playing")}</h1>
      ${takeaway ? `<p class="live-accent-line">${textHtml(takeaway)}</p>` : ""}
      ${thanks ? `<p class="live-body">${textHtml(thanks)}</p>` : ""}
    </div>
  `,
    "is-closing",
  );
}

export function pollImage(component: AnyRec): string {
  return component.questionImageUrl ? `<img class="live-question-image" src="${escapeAttr(component.questionImageUrl)}" alt="${escapeAttr(component.questionImageAlt || "Question image")}" />` : "";
}

export function pollAnswer(component: AnyRec, activity: AnyRec): string {
  if (activity.phase !== "revealed" || !activity.correctOptionId) return "";
  const option = ((component.options || []) as AnyRec[]).find((o) => o.id === activity.correctOptionId);
  return option ? `<p class="live-poll-answer">Correct answer: ${escapeHtml(option.label || option.accessibleLabel)}</p>` : "";
}

export function renderPollPresenter(state: AnyRec): HTMLElement {
  const activity = activityOf(state);
  const component = componentOf(state);
  const phase = String(activity.phase || "idle");
  const cue = state.cue as { startedAt: number; durationMs: number; kind: string } | null;
  if ((phase === "tallying" || (cue && cue.kind === "tally" && cueProgress(cue) < 1)) && phase !== "revealed") {
    if (prefersReducedMotion()) {
      return contentBox(`<h1 class="live-question">Results</h1>`);
    }
    return contentBox(
      `<p class="live-eyebrow">${escapeHtml(activity.responseCount || 0)} responses</p><h1 class="live-question">Results incoming</h1><div class="live-anticipation" aria-hidden="true"></div>`,
    );
  }
  const opts = (component.options || []) as AnyRec[];
  const sub = String(component.subquestion || "");
  if (phase === "revealed" && activity.tally) {
    const tally = activity.tally as AnyRec;
    const result = String(tally.result || "");
    const status = result === "zero" ? "No votes yet" : result === "tie" ? "It's a tie" : "";
    const box = contentBox(
      `<h1 class="live-question">${textHtml(component.question || "Poll")}</h1>${pollImage(component)}${pollAnswer(component, activity)}${sub ? `<p class="live-subhead">${textHtml(sub)}</p>` : ""}${status ? `<p class="live-body">${escapeHtml(status)}</p>` : ""}<div class="live-options live-poll-options" style="--poll-columns:${opts.length}"></div>`,
    );
    const row = box.querySelector(".live-options") as HTMLElement;
    for (const opt of opts) appendPollCard(row, opt, tally);
    return box;
  }
  const box = contentBox(
    `<h1 class="live-question">${textHtml(component.question || "Poll")}</h1>${pollImage(component)}${pollAnswer(component, activity)}${sub ? `<p class="live-subhead">${textHtml(sub)}</p>` : ""}<div class="live-options live-poll-options" style="--poll-columns:${opts.length}"></div>`,
  );
  const row = box.querySelector(".live-options") as HTMLElement;
  for (const opt of opts) appendPollCard(row, opt);
  return box;
}

function appendPollCard(row: HTMLElement, opt: AnyRec, tally?: AnyRec) {
  const lay = optionLayout(opt);
  const card = el(`<div class="live-option${lay.hasImage ? " has-image" : ""}${lay.hasText ? "" : " no-text"}"></div>`);
  const counts = (tally?.counts || {}) as AnyRec;
  const percents = (tally?.percents || {}) as AnyRec;
  const n = Number(counts[String(opt.id)] || 0);
  const pct = Number(percents[String(opt.id)] || 0);
  card.innerHTML = `${lay.hasImage ? `<img alt="${escapeAttr(opt.accessibleLabel || opt.label)}" src="${escapeAttr(opt.imageUrl)}" />` : ""}
    ${lay.hasText ? `<span>${escapeHtml(opt.label)}</span>` : `<span class="live-option-label">${escapeHtml(opt.accessibleLabel || opt.label)}</span>`}
    ${tally ? `<span class="live-tally-bar" style="--pct:${pct}%"></span><strong>${pct}% · ${n}</strong>` : ""}`;
  row.appendChild(card);
}

function clampFillPercent(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function fillWindowStyle(place: AnyRec | undefined): string {
  const x = clampFillPercent(place?.xPercent, 0, 0, 100);
  const y = clampFillPercent(place?.yPercent, 0, 0, 100);
  const w = clampFillPercent(place?.widthPercent, 100, 5, 100);
  const h = clampFillPercent(place?.heightPercent, 100, 5, 100);
  return `left:${x}%;top:${y}%;width:${w}%;height:${h}%`;
}

export function renderFillPresenter(state: AnyRec, seenEvents: Set<string>): HTMLElement {
  const activity = activityOf(state);
  const component = componentOf(state);
  const teams = (activity.teams || component.teams || []) as AnyRec[];
  const maskUrl = String(component.maskUrl || activity.maskUrl || "");
  const overlayUrl = String(component.foregroundUrl || activity.foregroundUrl || "");
  const place = ((component.maskPlacement || activity.maskPlacement) || {}) as AnyRec;
  const hasArt = !!(maskUrl || overlayUrl);
  const heading = String(component.presenterHeading || component.title || "Fill game");
  const body = String(component.presenterBody || "");
  const box = contentBox(
    `<h1 class="live-question">${textHtml(heading)}</h1>${raceClockHtml()}${body ? `<p class="live-subhead">${textHtml(body)}</p>` : ""}<div class="live-fill-row"></div>`,
    "is-fill",
  );
  const row = box.querySelector(".live-fill-row") as HTMLElement;
  for (const team of teams) {
    const target = Math.max(1, Number(team.target) || 1);
    const score = Number(team.score || 0);
    const pct = Math.max(0, Math.min(100, (score / target) * 100));
    const metric = activity.metric === "percent" ? `${Math.round(pct)}%` : `${score}/${target}`;
    const col = el(`<div class="live-fill-team"></div>`);
    const maskCss = maskUrl
      ? `-webkit-mask-image:url('${escapeAttr(maskUrl)}');mask-image:url('${escapeAttr(maskUrl)}');`
      : "";
    col.innerHTML = `
      <div class="live-meter${hasArt ? " has-art" : ""}" data-team="${escapeAttr(team.id)}">
        <div class="live-meter-art">
          <div class="live-meter-stage"${maskCss ? ` style="${maskCss}"` : ""}>
            <div class="live-meter-window" style="${fillWindowStyle(place)}">
              <div class="live-meter-fill" style="height:${pct}%;background:${escapeAttr(team.fillHex || team.colorHex)}"></div>
            </div>
          </div>
          ${overlayUrl ? `<div class="live-meter-fg" style="background-image:url('${escapeAttr(overlayUrl)}')"></div>` : ""}
        </div>
      </div>
      <h2 class="live-team-name" style="color:${escapeAttr(team.colorHex)}">${escapeHtml(team.name)}</h2>
      <p class="live-body">${metric}</p>
    `;
    row.appendChild(col);
  }
  const events = (activity.events || []) as AnyRec[];
  for (const ev of events) {
    const id = String(ev.id || "");
    if (!id || seenEvents.has(id)) continue;
    seenEvents.add(id);
    const meter = box.querySelector(`[data-team="${CSS.escape(String(ev.teamId))}"]`) as HTMLElement | null;
    if (!meter) continue;
    const fly = el(`<div class="live-fly">${Number(ev.delta) > 0 ? "+1" : "−1"}</div>`);
    fly.style.left = `${20 + Math.random() * 60}%`;
    fly.style.bottom = "40%";
    fly.style.color = Number(ev.delta) > 0 ? "#3ecf8e" : "#ff6b6b";
    meter.appendChild(fly);
    window.setTimeout(() => fly.remove(), 1200);
  }
  if (seenEvents.size > 200) {
    const keep = events.map((e) => String(e.id));
    for (const id of [...seenEvents]) if (!keep.includes(id)) seenEvents.delete(id);
  }
  return box;
}

export function renderQuizPresenter(state: AnyRec): HTMLElement {
  const activity = activityOf(state);
  const component = componentOf(state);
  const q = (component.currentQuestion || {}) as AnyRec;
  const phase = String(activity.phase || "idle");
  const pct = activity.percentCorrect;
  const kicker =
    phase === "revealed"
      ? activity.noAnswers
        ? "No answers yet"
        : `${pct}% correct`
      : `Question ${Number(activity.questionIndex || 0) + 1} / ${escapeHtml(activity.questionCount || 0)}`;
  const box = contentBox(
    `<p class="live-eyebrow">${kicker}</p><h1 class="live-question">${textHtml(q.prompt || "Get ready")}</h1><div class="live-options two live-quiz-choices"></div>`,
  );
  const row = box.querySelector(".live-options") as HTMLElement;
  for (const c of (q.choices || []) as AnyRec[]) {
    const card = el(
      `<div class="live-option live-chip${phase === "revealed" && c.id === q.correctChoiceId ? " is-selected is-correct" : ""}">${escapeHtml(c.label)}</div>`,
    );
    row.appendChild(card);
  }
  return box;
}

export function renderPinboardPresenter(state: AnyRec): HTMLElement {
  const activity = activityOf(state);
  const component = componentOf(state);
  const board = (component.board || {}) as AnyRec;
  const subs = (activity.submissions || []) as AnyRec[];
  const box = contentBox(
    `<h1 class="live-question">${textHtml(board.header || component.title || "Pinboard")}</h1>${board.subhead ? `<p class="live-subhead">${textHtml(board.subhead)}</p>` : ""}<div class="live-pin-grid"></div>`,
  );
  const grid = box.querySelector(".live-pin-grid") as HTMLElement;
  if (!subs.length) {
    grid.innerHTML = `<p class="live-body">Waiting for approved posts</p>`;
    return box;
  }
  for (const s of subs) {
    const card = el(`<article class="live-pin-card"></article>`);
    if (s.imagePath) {
      const img = document.createElement("img");
      img.alt = "";
      img.src = String(s.imagePath);
      card.appendChild(img);
    }
    const p = document.createElement("p");
    p.textContent = String(s.text || "");
    card.appendChild(p);
    const small = document.createElement("small");
    small.textContent = `#${String(s.participantNumber ?? "")}`;
    card.appendChild(small);
    grid.appendChild(card);
  }
  return box;
}

export function renderScratcherPresenter(state: AnyRec): HTMLElement {
  const activity = activityOf(state);
  const component = componentOf(state);
  const assets = (component.assets || {}) as AnyRec;
  const queue = (activity.celebrationQueue || []) as AnyRec[];
  const latest = queue[queue.length - 1];
  const cover = String(assets.top || "");
  if (latest && activity.phase !== "idle") {
    const prize = copy(state, "prizeName", "");
    return contentBox(
      `
      <div class="live-winner">
        <h1 class="live-display">${textHtml(copy(state, "winnerHeadline", "That's a win!"))}</h1>
        <p class="live-number live-number-accent">${padNumber(latest.participantNumber)}</p>
        ${prize ? `<p class="live-prize">${textHtml(prize)}</p>` : ""}
        <p class="live-body">${textHtml(copy(state, "winnerBody", "Give them a cheer."))}</p>
      </div>
    `,
      "is-winner",
    );
  }
  const released = activity.phase === "released";
  const eyebrow = released
    ? copy(state, "releasedEyebrow", "Your card is on your phone")
    : copy(state, "idleEyebrow", String(component.title || "Scratcher"));
  const headline = released
    ? copy(state, "releasedHeadline", copy(state, "idleHeadline", "Your next\nmoment."))
    : copy(state, "idleHeadline", "Your next\nmoment.");
  const body = released
    ? copy(state, "releasedBody", "Scratch your screen.")
    : copy(state, "idleBody", "Keep your phone ready. Your card is coming.");
  const winnerCount = Number(activity.winnerCount || 0);
  const accent =
    released && winnerCount > 0
      ? copy(state, "releasedAccent", "{n} winning cards").replace("{n}", String(winnerCount))
      : "";
  const revealed = Number(activity.revealedCount || 0);
  const recipients = Number(activity.recipientCount || 0);
  const progress =
    released && recipients > 0
      ? `<div class="live-progress" data-live-progress><span class="live-progress-bar" style="width:${Math.round((revealed / recipients) * 100)}%"></span><span class="live-progress-label">${revealed} / ${recipients} revealed</span></div>`
      : "";
  return contentBox(
    `
    <div class="live-split">
      <div class="live-split-copy">
        <p class="live-eyebrow">${textHtml(eyebrow)}</p>
        <h1 class="live-display">${textHtml(headline)}</h1>
        ${accent ? `<p class="live-accent-line">${textHtml(accent)}</p>` : ""}
        <p class="live-lede">${textHtml(body)}</p>
        ${progress}
      </div>
      ${cover ? `<div class="live-cover-card">${artImg(cover, "live-cover-art")}</div>` : ""}
    </div>
  `,
    released ? "is-scratch-released" : "is-scratch-idle",
  );
}

export function renderWheelPresenter(state: AnyRec): HTMLElement {
  const activity = activityOf(state);
  const component = componentOf(state);
  const assets = (component.assets || {}) as AnyRec;
  const spinning = activity.phase === "spinning";
  const revealed = activity.phase === "revealed";
  const eyebrow = copy(state, "eyebrow", "Live draw");
  const headline = spinning
    ? copy(state, "spinningHeadline", copy(state, "headline", "Watch the draw"))
    : revealed
      ? copy(state, "winHeadline", "That's your number!")
      : copy(state, "headline", String(component.title || "Prize draw"));
  const body = copy(state, "body", "Watch the number. Listen for yours.");
  const number = revealed && activity.winnerNumber != null ? padNumber(activity.winnerNumber) : "";
  const frame = String(assets.frame || "");
  const poolSize = Array.isArray(activity.pool) ? activity.pool.length : 0;
  const readoutLabel = revealed ? "Winning number" : spinning ? "Under the pointer" : "Numbers in the draw";
  return contentBox(
    `
    <div class="live-split is-wheel-split">
      <div class="live-split-copy">
        <p class="live-eyebrow">${textHtml(eyebrow)}</p>
        <h1 class="live-display">${textHtml(headline)}</h1>
        <div class="live-wheel-result">
          <p class="live-wheel-result-label">${readoutLabel}</p>
          <p class="live-pointer-readout live-number-accent" id="wheel-readout">${number || (spinning ? "—" : String(poolSize))}</p>
        </div>
        <p class="live-body">${textHtml(body)}</p>
      </div>
      <div class="live-wheel-wrap">
        <canvas id="live-wheel" role="img" aria-label="Participant prize wheel"></canvas>
        ${frame ? `<img class="live-wheel-frame" alt="" src="${escapeAttr(frame)}" />` : ""}
      </div>
    </div>
  `,
    `is-wheel${spinning ? " is-spinning" : revealed ? " is-revealed" : ""}`,
  );
}

export function renderUnsupported(_state: AnyRec): HTMLElement {
  return contentBox(`<h1 class="live-question">Holding</h1><p class="live-body">This step isn’t live-capable. Use Next on Flow Master.</p>`);
}
