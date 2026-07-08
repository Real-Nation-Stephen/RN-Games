import type { RedemptionRecord } from "@rngames/shared/page-modules";
import {
  applyPageTheme,
  completeStep,
  engageStep,
  fetchPageModule,
  flowModeActive,
  flowNextLabel,
  getSlugFromPath,
  initFlowContext,
  setupPagePreview,
  wirePageLogo,
  wirePoweredBy,
} from "../page-module/shared";

const els = {
  app: document.getElementById("page-app")!,
  headline: document.getElementById("page-headline")!,
  body: document.getElementById("page-body")!,
  codeLabel: document.getElementById("code-label")!,
  code: document.getElementById("redemption-code")!,
  cta: document.getElementById("page-cta") as HTMLButtonElement,
  error: document.getElementById("page-error")!,
};

function mountRedemption(cfg: RedemptionRecord) {
  applyPageTheme(cfg, document.documentElement);
  wirePoweredBy(cfg);
  wirePageLogo(cfg);
  els.headline.textContent = cfg.headline;
  els.body.textContent = cfg.instructions || cfg.body;
  els.codeLabel.textContent = cfg.codeLabel;
  els.code.textContent = cfg.redemptionCode;
  els.cta.textContent = flowModeActive() ? flowNextLabel() : cfg.primaryCta.label;
  els.app.hidden = false;
  engageStep();
  els.cta.onclick = () => completeStep({ gameId: cfg.id });
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") === "1") {
    setupPagePreview("redemption", (cfg) => mountRedemption(cfg as RedemptionRecord));
    return;
  }
  initFlowContext();
  const slug = getSlugFromPath("redemption");
  if (!slug) {
    els.error.textContent = "Missing slug.";
    els.error.hidden = false;
    return;
  }
  const cfg = (await fetchPageModule(slug, "redemption")) as RedemptionRecord;
  mountRedemption(cfg);
}

void boot().catch((e) => {
  els.error.hidden = false;
  els.error.textContent = e instanceof Error ? e.message : "Failed to load";
});
