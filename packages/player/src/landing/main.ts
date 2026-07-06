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
  wirePoweredBy,
} from "../page-module/shared";

const els = {
  app: document.getElementById("page-app")!,
  headline: document.getElementById("page-headline")!,
  body: document.getElementById("page-body")!,
  cta: document.getElementById("page-cta") as HTMLButtonElement,
  error: document.getElementById("page-error")!,
};

function showError(msg: string) {
  els.error.hidden = false;
  els.error.textContent = msg;
  els.app.hidden = true;
}

function onContinue(cfg: LandingRecord) {
  completeStep({ gameId: cfg.id, "landing.cta": cfg.primaryCta.label });
}

function mountLanding(cfg: LandingRecord) {
  applyPageTheme(cfg, document.documentElement);
  wirePoweredBy(cfg);
  els.headline.textContent = cfg.headline;
  els.body.textContent = cfg.body;
  els.cta.textContent = flowModeActive() ? flowNextLabel() : cfg.primaryCta.label;
  els.app.hidden = false;
  els.cta.onclick = () => {
    engageStep();
    onContinue(cfg);
  };
  if (flowModeActive() && cfg.experienceAutoContinue) {
    engageStep();
    scheduleAutoContinue(cfg, () => onContinue(cfg));
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
