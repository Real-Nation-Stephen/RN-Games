import type { LandingRecord } from "@rngames/shared/page-modules";
import {
  applyPageTheme,
  completeStep,
  engageStep,
  fetchPageModule,
  flowModeActive,
  flowNextLabel,
  getSlugFromPath,
  initFlowContext,
  scheduleAutoContinue,
  setupPagePreview,
  wirePageLogo,
  wirePoweredBy,
} from "../page-module/shared";
import { renderLandingBlocks } from "../page-module/blocks";

const els = {
  app: document.getElementById("page-app")!,
  blocks: document.getElementById("page-blocks")!,
  error: document.getElementById("page-error")!,
};

function showError(msg: string) {
  els.error.hidden = false;
  els.error.textContent = msg;
  els.app.hidden = true;
}

function onContinue(cfg: LandingRecord, label: string) {
  completeStep({ gameId: cfg.id, "landing.cta": label });
}

function mountLanding(cfg: LandingRecord) {
  applyPageTheme(cfg, document.documentElement);
  wirePoweredBy(cfg);
  wirePageLogo(cfg);

  const hasPrimary = renderLandingBlocks(els.blocks, cfg, {
    flowMode: flowModeActive(),
    flowNextLabel: flowNextLabel(),
    onEngage: () => engageStep(),
    onPrimaryAction: (label) => onContinue(cfg, label),
  });

  els.app.hidden = false;

  if (flowModeActive() && cfg.experienceAutoContinue && hasPrimary) {
    engageStep();
    scheduleAutoContinue(cfg, () => onContinue(cfg, cfg.primaryCta.label));
  }
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") === "1") {
    setupPagePreview("landing", (cfg) => mountLanding(cfg as LandingRecord));
    return;
  }
  initFlowContext();
  const slug = getSlugFromPath("landing");
  if (!slug) {
    showError("Missing page slug.");
    return;
  }
  try {
    mountLanding(await fetchPageModule(slug, "landing"));
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed to load");
  }
}

void boot();
