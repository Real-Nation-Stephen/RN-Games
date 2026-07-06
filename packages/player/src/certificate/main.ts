import type { CertificateRecord } from "@rngames/shared/page-modules";
import { resolveSessionPath } from "@rngames/shared/page-modules";
import { parseFlowContextFromSearch } from "@rngames/shared";
import {
  applyPageTheme,
  completeStep,
  engageStep,
  fetchPageModule,
  fetchSession,
  flowModeActive,
  flowNextLabel,
  getSlugFromPath,
  initFlowContext,
  wirePoweredBy,
} from "../page-module/shared";

const els = {
  app: document.getElementById("page-app")!,
  headline: document.getElementById("page-headline")!,
  wrap: document.getElementById("cert-wrap")!,
  cta: document.getElementById("page-cta") as HTMLButtonElement,
  error: document.getElementById("page-error")!,
};

function showError(msg: string) {
  els.error.hidden = false;
  els.error.textContent = msg;
}

function renderCertificate(cfg: CertificateRecord, sessionRoot: Record<string, unknown>) {
  els.wrap.replaceChildren();
  const stage = document.createElement("div");
  stage.style.position = "relative";
  stage.style.width = "100%";
  stage.style.aspectRatio = `${cfg.canvasWidth} / ${cfg.canvasHeight}`;

  if (cfg.certificateBackgroundUrl) {
    const img = document.createElement("img");
    img.src = cfg.certificateBackgroundUrl;
    img.alt = "";
    img.style.width = "100%";
    img.style.height = "auto";
    img.style.display = "block";
    stage.appendChild(img);
  } else {
    stage.style.background = "#f5f5f5";
    stage.style.borderRadius = "8px";
    stage.style.minHeight = "200px";
  }

  const overlay = document.createElement("div");
  overlay.className = "cert-overlay";
  for (const mf of cfg.mergeFields) {
    const el = document.createElement("div");
    el.className = "cert-field";
    el.style.left = `${mf.xPercent}%`;
    el.style.top = `${mf.yPercent}%`;
    el.style.fontSize = `${mf.fontSizePx}px`;
    el.style.color = mf.colorHex;
    el.style.fontWeight = mf.fontWeight === "bold" ? "700" : "400";
    el.textContent = resolveSessionPath(sessionRoot, mf.sourceKey) || mf.label;
    overlay.appendChild(el);
  }
  stage.appendChild(overlay);
  els.wrap.appendChild(stage);
}

async function boot() {
  const flow = initFlowContext();
  const slug = getSlugFromPath("certificate");
  if (!slug) {
    showError("Missing certificate slug.");
    return;
  }
  try {
    const cfg = (await fetchPageModule(slug, "certificate")) as CertificateRecord;
    applyPageTheme(cfg, document.documentElement);
    wirePoweredBy(cfg);
    els.headline.textContent = cfg.headline;
    els.cta.textContent = flowModeActive() ? flowNextLabel() : cfg.primaryCta.label;

    const session = flow?.sessionId ? await fetchSession(flow.sessionId) : null;
    const sessionRoot = {
      ...(session?.data || {}),
      ...(session?.outcomes || {}),
      form: { fieldValues: (session?.outcomes?.["form.fieldValues"] as Record<string, unknown>) || session?.data?.formFields || {} },
    };
    renderCertificate(cfg, sessionRoot);
    els.app.hidden = false;
    engageStep();

    els.cta.addEventListener("click", () => {
      completeStep({ gameId: cfg.id });
    });
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed to load");
  }
}

void boot();
