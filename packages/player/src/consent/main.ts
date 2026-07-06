import type { ConsentRecord } from "@rngames/shared/page-modules";
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
  wirePoweredBy,
} from "../page-module/shared";

const els = {
  app: document.getElementById("page-app")!,
  headline: document.getElementById("page-headline")!,
  body: document.getElementById("page-body")!,
  list: document.getElementById("consent-list")!,
  cta: document.getElementById("page-cta") as HTMLButtonElement,
  gdpr: document.getElementById("gdpr-link") as HTMLAnchorElement,
  error: document.getElementById("page-error")!,
};

function mountConsent(cfg: ConsentRecord) {
  applyPageTheme(cfg, document.documentElement);
  wirePoweredBy(cfg);
  els.headline.textContent = cfg.headline;
  els.body.textContent = cfg.introText || cfg.body;
  els.cta.textContent = flowModeActive() ? flowNextLabel() : cfg.acceptLabel;
  if (cfg.gdprUrl) {
    els.gdpr.href = cfg.gdprUrl;
    els.gdpr.textContent = cfg.gdprLinkLabel;
    els.gdpr.hidden = false;
  } else {
    els.gdpr.hidden = true;
  }
  els.list.replaceChildren(
    ...cfg.items.map((it) => {
      const row = document.createElement("label");
      row.className = "consent-item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.name = it.id;
      cb.required = !!it.required;
      cb.addEventListener("change", () => engageStep(), { once: true });
      row.append(cb, document.createTextNode(it.label));
      return row;
    }),
  );
  els.app.hidden = false;
  els.cta.onclick = () => {
    for (const it of cfg.items) {
      if (!it.required) continue;
      const cb = els.list.querySelector<HTMLInputElement>(`input[name="${it.id}"]`);
      if (!cb?.checked) {
        els.error.hidden = false;
        els.error.textContent = "Please accept all required items.";
        return;
      }
    }
    els.error.hidden = true;
    completeStep({ gameId: cfg.id, consentGranted: true });
  };
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") === "1") {
    setupPagePreview("consent", (cfg) => mountConsent(cfg as ConsentRecord));
    return;
  }
  initFlowContext();
  const slug = getSlugFromPath("consent");
  if (!slug) {
    els.error.hidden = false;
    els.error.textContent = "Missing slug.";
    return;
  }
  const cfg = (await fetchPageModule(slug, "consent")) as ConsentRecord;
  mountConsent(cfg);
}

void boot().catch((e) => {
  els.error.hidden = false;
  els.error.textContent = e instanceof Error ? e.message : "Failed to load";
});
