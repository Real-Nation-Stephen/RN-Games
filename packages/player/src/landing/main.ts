import type { LandingBlock, LandingRecord, LandingScreen } from "@rngames/shared/page-modules";
import { getVisibleLandingScreens } from "@rngames/shared";
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

function flowEndCopyFromQuery(): { headline: string; body: string; cta: string } {
  const params = new URLSearchParams(window.location.search);
  return {
    headline: params.get("endHeadline")?.trim() || "",
    body: params.get("endBody")?.trim() || "",
    cta: params.get("endCta")?.trim() || "",
  };
}

function blocksForScreen(screen: LandingScreen, flowMode: boolean): LandingBlock[] {
  if (!flowMode || !screen.flowCompleteOverride) return screen.blocks;
  const end = flowEndCopyFromQuery();
  if (!end.headline && !end.body && screen.blocks.length) return screen.blocks;

  const blocks: LandingBlock[] = [];
  if (end.headline) {
    blocks.push({
      id: "flow-end-headline",
      type: "text",
      content: end.headline,
      variant: "headline",
      align: "inherit",
    });
  }
  if (end.body) {
    blocks.push({
      id: "flow-end-body",
      type: "text",
      content: end.body,
      variant: "body",
      align: "inherit",
    });
  }
  const buttonBlocks = screen.blocks.filter((b) => b.type === "button");
  if (buttonBlocks.length) {
    blocks.push(
      ...buttonBlocks.map((b) =>
        b.type === "button" && end.cta
          ? { ...b, label: end.cta, action: "primary" as const, isPrimary: true }
          : b,
      ),
    );
  } else {
    blocks.push({
      id: "flow-end-cta",
      type: "button",
      label: end.cta || flowNextLabel(),
      url: "",
      backgroundHex: "#2d6cdf",
      textHex: "#ffffff",
      align: "inherit",
      fullWidth: false,
      isPrimary: true,
      action: "primary",
    });
  }
  return blocks.length ? blocks : screen.blocks;
}

function pendingFlowOverrideScreen(
  screens: LandingScreen[],
  activeScreenId: string,
  flowMode: boolean,
): LandingScreen | null {
  if (!flowMode) return null;
  const override = screens.find((s) => s.flowCompleteOverride);
  if (!override || override.id === activeScreenId) return null;
  const activeIdx = screens.findIndex((s) => s.id === activeScreenId);
  const overrideIdx = screens.findIndex((s) => s.id === override.id);
  if (activeIdx < 0 || overrideIdx < 0 || activeIdx >= overrideIdx) return null;
  return override;
}

function onContinue(cfg: LandingRecord, label: string) {
  completeStep({ gameId: cfg.id, "landing.cta": label });
}

function mountLanding(cfg: LandingRecord) {
  applyPageTheme(cfg, document.documentElement);
  wirePoweredBy(cfg);
  wirePageLogo(cfg);

  const flowMode = flowModeActive();
  const screens = getVisibleLandingScreens(cfg, flowMode);
  let activeScreenId = screens[0]?.id || "";

  function renderScreen() {
    const screen = screens.find((s) => s.id === activeScreenId) || screens[0];
    if (!screen) return;
    activeScreenId = screen.id;

    const screenCfg: LandingRecord = {
      ...cfg,
      blocks: blocksForScreen(screen, flowMode),
    };
    const hasPrimary = renderLandingBlocks(els.blocks, screenCfg, {
      flowMode,
      flowNextLabel: flowNextLabel(),
      onEngage: () => engageStep(),
      onPrimaryAction: (label) => {
        const defer = pendingFlowOverrideScreen(screens, activeScreenId, flowMode);
        if (defer) {
          activeScreenId = defer.id;
          engageStep();
          renderScreen();
          return;
        }
        onContinue(cfg, label);
      },
      onScreenNavigate: (screenId) => {
        if (!screens.some((s) => s.id === screenId)) return;
        activeScreenId = screenId;
        engageStep();
        renderScreen();
      },
    });

    els.app.hidden = false;

    if (!flowMode && cfg.experienceAutoContinue && hasPrimary) {
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
