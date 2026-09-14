/**
 * Studio preview for Mini Poll / Fill. Unsaved config arrives via postMessage.
 * This module must never call live-run, live-join, live-action, or live-control.
 */
import { applyJoinTheme } from "./theme";
import { renderFillPresenter, renderPollPresenter, optionLayout, escapeHtml, escapeAttr, renderLogo } from "./render";

type AnyRec = Record<string, unknown>;

const root = document.getElementById("live-preview-root")!;
const params = new URLSearchParams(location.search);
const previewMode = params.get("preview") === "1";

(window as unknown as { __LIVE_PREVIEW_NO_RUN__: boolean }).__LIVE_PREVIEW_NO_RUN__ = true;

function phoneShell(html: string): HTMLElement {
  const d = document.createElement("div");
  d.className = "live-phone-chrome";
  d.innerHTML = html;
  return d;
}

function applyChrome(cfg: AnyRec, surface: "presenter" | "phone") {
  document.body.classList.toggle("is-phone-preview", surface === "phone");
  applyJoinTheme({}, (cfg.branding || {}) as AnyRec, { surface });
  const fav = String(cfg.faviconUrl || "");
  if (fav) {
    let el = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    if (!el) {
      el = document.createElement("link");
      el.rel = "icon";
      document.head.appendChild(el);
    }
    el.href = fav;
  }
}

function fakePollTally(cfg: AnyRec) {
  const opts = (cfg.options || []) as AnyRec[];
  const a = String(opts[0]?.id || "a");
  const b = String(opts[1]?.id || "b");
  return {
    counts: { [a]: 9, [b]: 6 },
    percents: { [a]: 60, [b]: 40 },
    result: "a",
    total: 15,
  };
}

function renderPollPhone(cfg: AnyRec, phase: string): HTMLElement {
  const opts = (cfg.options || []) as AnyRec[];
  if (phase === "tallying") {
    return phoneShell(`<h1 class="live-headline">Results incoming</h1><div class="live-anticipation"></div>`);
  }
  if (phase === "revealed") {
    const tally = fakePollTally(cfg);
    const shell = phoneShell(
      `<h1 class="live-headline">${escapeHtml(cfg.question)}</h1><div class="live-options"></div>`,
    );
    const row = shell.querySelector(".live-options") as HTMLElement;
    for (const opt of opts) {
      const lay = optionLayout(opt);
      const card = document.createElement("div");
      card.className = `live-option${lay.hasImage ? " has-image" : ""}${lay.hasText ? "" : " no-text"}`;
      card.innerHTML = `${lay.hasImage ? `<img alt="${escapeAttr(opt.accessibleLabel || opt.label)}" src="${escapeAttr(opt.imageUrl)}" />` : ""}<span class="${lay.hasText ? "" : "live-option-label"}">${escapeHtml(lay.hasText ? opt.label : opt.accessibleLabel || "")}</span><strong>${Number(tally.percents[String(opt.id)] || 0)}%</strong>`;
      row.appendChild(card);
    }
    return shell;
  }
  const shell = phoneShell(
    `${renderLogo(String((cfg.branding as AnyRec)?.logoUrl || ""))}<h1 class="live-headline">${escapeHtml(cfg.question || "Vote")}</h1><div class="live-options"></div>`,
  );
  const row = shell.querySelector(".live-options") as HTMLElement;
  for (const opt of opts) {
    const lay = optionLayout(opt);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `live-option${lay.hasImage ? " has-image" : ""}${lay.hasText ? "" : " no-text"}`;
    btn.innerHTML = `${lay.hasImage ? `<img alt="${escapeAttr(opt.accessibleLabel || opt.label)}" src="${escapeAttr(opt.imageUrl)}" />` : ""}<span class="${lay.hasText ? "" : "live-option-label"}">${escapeHtml(lay.hasText ? opt.label : opt.accessibleLabel || "")}</span>`;
    btn.disabled = phase !== "open";
    row.appendChild(btn);
  }
  return shell;
}

function renderFillPhone(cfg: AnyRec, phase: string): HTMLElement {
  const q = ((cfg.questions || []) as AnyRec[])[0] || {};
  if (phase === "finished") {
    return phoneShell(`<h1 class="live-headline">Race over</h1><p class="live-body">Preview only — no scores were recorded.</p>`);
  }
  if (phase !== "racing") {
    return phoneShell(`<h1 class="live-headline">Get ready</h1><p class="live-body">Preview of the phone question screen.</p>`);
  }
  const shell = phoneShell(
    `<p class="live-kicker">Preview</p><h1 class="live-headline">${escapeHtml(q.prompt || "")}</h1><div class="live-options"></div>`,
  );
  const row = shell.querySelector(".live-options") as HTMLElement;
  for (const c of (q.choices || []) as AnyRec[]) {
    const btn = document.createElement("button");
    btn.className = "live-option";
    btn.type = "button";
    btn.textContent = String(c.label || "");
    btn.disabled = true;
    row.appendChild(btn);
  }
  return shell;
}

function syntheticPollState(cfg: AnyRec, phase: string): AnyRec {
  return {
    activity: {
      kind: "mini-poll",
      phase,
      responseCount: phase === "idle" ? 0 : 15,
      tally: phase === "revealed" ? fakePollTally(cfg) : null,
    },
    component: cfg,
    cue:
      phase === "tallying"
        ? { kind: "tally", startedAt: Date.now(), durationMs: Number(cfg.revealDurationMs) || 3000 }
        : null,
  };
}

function syntheticFillState(cfg: AnyRec, phase: string): AnyRec {
  const teams = ((cfg.teams || []) as AnyRec[]).map((t, i) => {
    const target = Math.max(1, Number(t.target) || 8);
    const score =
      phase === "idle" ? 0 : phase === "finished" ? (i === 0 ? target : Math.round(target * 0.75)) : i === 0 ? Math.round(target * 0.5) : Math.round(target * 0.25);
    return { ...t, score };
  });
  return {
    activity: {
      kind: "fill-game",
      phase: phase === "finished" ? "finished" : phase,
      finishedTeamId: phase === "finished" ? teams[0]?.id : null,
      metric: cfg.metric,
      teams,
      events: [],
    },
    component: cfg,
  };
}

function mountPreview(payload: AnyRec) {
  const cfg = (payload.config || {}) as AnyRec;
  const kind = String(payload.kind || cfg.gameType || params.get("kind") || "");
  const surface = payload.surface === "phone" ? "phone" : "presenter";
  const phase = String(payload.previewPhase || (kind === "fill-game" ? "racing" : "open"));
  applyChrome(cfg, surface);
  root.replaceChildren();
  const stage = document.createElement("div");
  stage.className = "live-stage";
  if (kind === "mini-poll") {
    stage.appendChild(surface === "phone" ? renderPollPhone(cfg, phase) : renderPollPresenter(syntheticPollState(cfg, phase)));
  } else if (kind === "fill-game") {
    stage.appendChild(
      surface === "phone" ? renderFillPhone(cfg, phase) : renderFillPresenter(syntheticFillState(cfg, phase), new Set()),
    );
  } else {
    stage.innerHTML = `<div class="live-stage-inner"><p class="live-body">Unknown live component.</p></div>`;
  }
  if (cfg.showPoweredBy !== false) {
    const pb = document.createElement("p");
    pb.className = "live-kicker";
    pb.style.position = "absolute";
    pb.style.bottom = "12px";
    pb.style.left = "0";
    pb.style.right = "0";
    pb.style.textAlign = "center";
    pb.textContent = "Powered by Real Nation";
    stage.appendChild(pb);
  }
  root.appendChild(stage);
}

function bootPreview() {
  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    if (e.data?.type !== "rngames-live-component-config") return;
    if (e.data.config) mountPreview(e.data as AnyRec);
  });
  root.innerHTML = `<div class="live-stage-inner"><p class="live-body">Waiting for unsaved preview…</p></div>`;
}

async function bootSaved() {
  const slug = params.get("slug") || location.pathname.split("/").filter(Boolean).pop() || "";
  if (!slug || slug === "live-preview.html" || slug === "mini-poll" || slug === "fill-game") {
    root.innerHTML = `<div class="live-stage-inner"><p class="live-body">This component runs inside an interactive Flow. Open it from Studio preview, or add it to a Flow.</p></div>`;
    return;
  }
  const res = await fetch(`/api/public-wheel?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) {
    root.innerHTML = `<div class="live-stage-inner"><p class="live-body">Could not load saved component.</p></div>`;
    return;
  }
  const cfg = (await res.json()) as AnyRec;
  mountPreview({
    kind: cfg.gameType,
    config: cfg,
    surface: "phone",
    previewPhase: cfg.gameType === "fill-game" ? "racing" : "open",
  });
}

if (previewMode) bootPreview();
else void bootSaved();
