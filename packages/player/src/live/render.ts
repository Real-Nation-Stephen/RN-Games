import { cueProgress, prefersReducedMotion } from "./theme";

type AnyRec = Record<string, unknown>;

function el(html: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild as HTMLElement;
}

export function renderLogo(url?: string): string {
  return url ? `<img class="live-logo" alt="" src="${escapeAttr(url)}" />` : "";
}

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

export function optionLayout(opt: AnyRec): { hasText: boolean; hasImage: boolean } {
  return { hasText: !!String(opt.label || "").trim(), hasImage: !!String(opt.imageUrl || "").trim() };
}

export function renderLobby(state: AnyRec, featuredDock: boolean): HTMLElement {
  const js = (state.joinScreen || {}) as AnyRec;
  const box = el(`<div class="live-stage-inner"></div>`);
  box.innerHTML = `
    ${renderLogo(String(js.logoUrl || ""))}
    <p class="live-kicker">Live</p>
    <h1 class="live-headline">${escapeHtml(js.headline || state.title || "Join")}</h1>
    <p class="live-body">${escapeHtml(js.instructions || "")}</p>
    ${featuredDock ? `<div data-dock="featured"></div>` : ""}
  `;
  return box;
}

export function renderClosing(state: AnyRec): HTMLElement {
  const js = (state.joinScreen || {}) as AnyRec;
  const box = el(`<div class="live-stage-inner"></div>`);
  box.innerHTML = `
    ${renderLogo(String(js.logoUrl || ""))}
    <h1 class="live-headline">${escapeHtml(js.closingHeadline || "Thanks for playing")}</h1>
    <p class="live-body">${escapeHtml(js.closingBody || "")}</p>
  `;
  return box;
}

export function renderPollPresenter(state: AnyRec): HTMLElement {
  const activity = (state.activity || {}) as AnyRec;
  const component = (state.component || {}) as AnyRec;
  const branding = (component.branding || {}) as AnyRec;
  const phase = String(activity.phase || "idle");
  const cue = state.cue as { startedAt: number; durationMs: number; kind: string } | null;
  const box = el(`<div class="live-stage-inner"></div>`);
  const logo = renderLogo(String(branding.logoUrl || component.logoUrl || ""));
  if ((phase === "tallying" || (cue && cue.kind === "tally" && cueProgress(cue) < 1)) && phase !== "revealed") {
    box.innerHTML = `
      ${logo}
      <p class="live-kicker">${escapeHtml(activity.responseCount || 0)} responses</p>
      <h1 class="live-headline">Results incoming</h1>
      <div class="live-anticipation" aria-hidden="true"></div>
    `;
    if (prefersReducedMotion()) {
      box.innerHTML = `<h1 class="live-headline">Results</h1>`;
    }
    return box;
  }
  if (phase === "revealed" && activity.tally) {
    const tally = activity.tally as AnyRec;
    const opts = (component.options || []) as AnyRec[];
    const result = String(tally.result || "");
    const status =
      result === "zero" ? "No votes yet" : result === "tie" ? "It's a tie" : "";
    box.innerHTML = `
      ${logo}
      <h1 class="live-headline">${escapeHtml(component.question || "Poll")}</h1>
      ${status ? `<p class="live-body">${status}</p>` : ""}
      <div class="live-options two"></div>
    `;
    const row = box.querySelector(".live-options") as HTMLElement;
    for (const opt of opts) {
      const counts = (tally.counts || {}) as AnyRec;
      const percents = (tally.percents || {}) as AnyRec;
      const n = Number(counts[String(opt.id)] || 0);
      const pct = Number(percents[String(opt.id)] || 0);
      const lay = optionLayout(opt);
      const card = el(`<div class="live-option${lay.hasImage ? " has-image" : ""}${lay.hasText ? "" : " no-text"}"></div>`);
      card.innerHTML = `${lay.hasImage ? `<img alt="${escapeAttr(opt.accessibleLabel || opt.label)}" src="${escapeAttr(opt.imageUrl)}" />` : ""}
        ${lay.hasText ? `<span>${escapeHtml(opt.label)}</span>` : `<span class="live-option-label">${escapeHtml(opt.accessibleLabel || opt.label)}</span>`}
        <strong>${pct}% · ${n}</strong>`;
      row.appendChild(card);
    }
    return box;
  }
  const opts = (component.options || []) as AnyRec[];
  box.innerHTML = `
    ${logo}
    <p class="live-kicker">${phase === "open" ? "Vote now" : phase === "closed" ? "Voting closed" : "Get ready"} · ${escapeHtml(activity.responseCount || 0)} in</p>
    <h1 class="live-headline">${escapeHtml(component.question || "Poll")}</h1>
    <div class="live-options two"></div>
  `;
  const row = box.querySelector(".live-options") as HTMLElement;
  for (const opt of opts) {
    const lay = optionLayout(opt);
    const card = el(`<div class="live-option${lay.hasImage ? " has-image" : ""}${lay.hasText ? "" : " no-text"}"></div>`);
    card.innerHTML = `${lay.hasImage ? `<img alt="${escapeAttr(opt.accessibleLabel || opt.label)}" src="${escapeAttr(opt.imageUrl)}" />` : ""}
      ${lay.hasText ? `<span>${escapeHtml(opt.label)}</span>` : `<span class="live-option-label">${escapeHtml(opt.accessibleLabel || opt.label)}</span>`}`;
    row.appendChild(card);
  }
  return box;
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
  const activity = (state.activity || {}) as AnyRec;
  const component = (state.component || {}) as AnyRec;
  const teams = (activity.teams || component.teams || []) as AnyRec[];
  const box = el(`<div class="live-stage-inner"></div>`);
  const branding = (component.branding || {}) as AnyRec;
  const maskUrl = String(component.maskUrl || activity.maskUrl || "");
  const overlayUrl = String(component.foregroundUrl || activity.foregroundUrl || "");
  const place = ((component.maskPlacement || activity.maskPlacement) || {}) as AnyRec;
  const hasArt = !!(maskUrl || overlayUrl);
  box.innerHTML = `
    ${renderLogo(String(branding.logoUrl || ""))}
    <p class="live-kicker">${activity.phase === "racing" ? "Fill in progress" : activity.finishedTeamId ? "We have a winner" : "Fill game"}</p>
    <div class="live-fill-row"></div>
  `;
  const row = box.querySelector(".live-fill-row") as HTMLElement;
  for (const team of teams) {
    const target = Math.max(1, Number(team.target) || 1);
    const score = Number(team.score || 0);
    const pct = Math.max(0, Math.min(100, (score / target) * 100));
    const metric = activity.metric === "percent" ? `${Math.round(pct)}%` : `${score}/${target}`;
    const col = el(`<div></div>`);
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
      <h2 class="live-headline" style="font-size:2rem;color:${escapeAttr(team.colorHex)}">${escapeHtml(team.name)}</h2>
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
    window.setTimeout(() => fly.remove(), 1000);
  }
  if (seenEvents.size > 200) {
    const keep = events.map((e) => String(e.id));
    for (const id of [...seenEvents]) if (!keep.includes(id)) seenEvents.delete(id);
  }
  return box;
}

export function renderQuizPresenter(state: AnyRec): HTMLElement {
  const activity = (state.activity || {}) as AnyRec;
  const component = (state.component || {}) as AnyRec;
  const branding = (component.branding || {}) as AnyRec;
  const q = (component.currentQuestion || {}) as AnyRec;
  const box = el(`<div class="live-stage-inner"></div>`);
  const phase = String(activity.phase || "idle");
  const pct = activity.percentCorrect;
  const footer =
    phase === "revealed"
      ? activity.noAnswers
        ? "No answers yet"
        : `${pct}% correct`
      : `${activity.responseCount || 0} answered`;
  box.innerHTML = `
    ${renderLogo(String(branding.logoUrl || component.logoUrl || ""))}
    <p class="live-kicker">Q${Number(activity.questionIndex || 0) + 1} / ${escapeHtml(activity.questionCount || 0)} · ${escapeHtml(footer)}</p>
    <h1 class="live-headline">${escapeHtml(q.prompt || "Get ready")}</h1>
    <div class="live-options two"></div>
  `;
  const row = box.querySelector(".live-options") as HTMLElement;
  for (const c of (q.choices || []) as AnyRec[]) {
    const card = el(`<div class="live-option${phase === "revealed" && c.id === q.correctChoiceId ? " is-selected" : ""}">${escapeHtml(c.label)}</div>`);
    row.appendChild(card);
  }
  return box;
}

export function renderPinboardPresenter(state: AnyRec): HTMLElement {
  const activity = (state.activity || {}) as AnyRec;
  const component = (state.component || {}) as AnyRec;
  const board = (component.board || {}) as AnyRec;
  const branding = (component.branding || {}) as AnyRec;
  const box = el(`<div class="live-stage-inner"></div>`);
  const subs = (activity.submissions || []) as AnyRec[];
  box.innerHTML = `${renderLogo(String(branding.logoUrl || board.brandLogoUrl || ""))}<h1 class="live-headline">${escapeHtml(board.header || component.title || "Pinboard")}</h1>${board.subhead ? `<p class="live-body">${escapeHtml(board.subhead)}</p>` : ""}<div class="live-pin-grid"></div>`;
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
  const activity = (state.activity || {}) as AnyRec;
  const box = el(`<div class="live-stage-inner"></div>`);
  const queue = (activity.celebrationQueue || []) as AnyRec[];
  const latest = queue[queue.length - 1];
  if (latest && activity.phase !== "idle") {
    box.innerHTML = `
      <p class="live-kicker">Scratcher</p>
      <h1 class="live-headline">We have a winner!</h1>
      <p class="live-number">${String(latest.participantNumber).padStart(3, "0")}</p>
    `;
    return box;
  }
  box.innerHTML = `
    <p class="live-kicker">Scratcher</p>
    <h1 class="live-headline">${activity.phase === "released" ? "Scratchers released" : "Ready to release"}</h1>
    <p class="live-body">${escapeHtml(activity.revealedCount || 0)} / ${escapeHtml(activity.recipientCount || 0)} revealed</p>
  `;
  return box;
}

export function renderUnsupported(state: AnyRec): HTMLElement {
  const box = el(`<div class="live-stage-inner"></div>`);
  box.innerHTML = `<h1 class="live-headline">Holding</h1><p class="live-body">This step isn’t live-capable. Use Next on Flow Master.</p>`;
  return box;
}
