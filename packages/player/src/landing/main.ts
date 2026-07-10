import type { LandingRecord } from "@rngames/shared/page-modules";
import { getLandingScreens } from "@rngames/shared";
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

  const screens = getLandingScreens(cfg);
  let activeScreenId = screens[0]?.id || "";

  function renderScreen() {
    const screen = screens.find((s) => s.id === activeScreenId) || screens[0];
    if (!screen) return;
    activeScreenId = screen.id;

    const screenCfg: LandingRecord = { ...cfg, blocks: screen.blocks };
    const hasPrimary = renderLandingBlocks(els.blocks, screenCfg, {
      flowMode: flowModeActive(),
      flowNextLabel: flowNextLabel(),
      onEngage: () => engageStep(),
      onPrimaryAction: (label) => onContinue(cfg, label),
      onScreenNavigate: (screenId) => {
        if (!screens.some((s) => s.id === screenId)) return;
        activeScreenId = screenId;
        engageStep();
        renderScreen();
      },
    });

    els.app.hidden = false;

    if (!flowModeActive() && cfg.experienceAutoContinue && hasPrimary) {
      engageStep();
      scheduleAutoContinue(cfg, () => onContinue(cfg, cfg.primaryCta.label));
    }
  }

  renderScreen();
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
