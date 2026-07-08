import type { CertificateRecord } from "@rngames/shared/page-modules";
import { buildCertificateSessionRoot, resolveSessionPath } from "@rngames/shared/page-modules";
import {
  applyPageTheme,
  completeStep,
  engageStep,
  embeddedShellActive,
  fetchPageModule,
  flowNextLabel,
  getSlugFromPath,
  initEmbeddedContexts,
  loadModuleSessionRoot,
  setupPagePreview,
  wirePageLogo,
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
    el.className = `cert-field cert-field--${mf.textAlign || "center"}`;
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

async function mountCertificate(cfg: CertificateRecord, sessionRoot: Record<string, unknown>) {
  applyPageTheme(cfg, document.documentElement);
  wirePoweredBy(cfg);
  wirePageLogo(cfg);
  els.headline.textContent = cfg.headline;
  els.cta.textContent = embeddedShellActive() ? flowNextLabel() : cfg.downloadLabel || cfg.primaryCta.label;
  renderCertificate(cfg, sessionRoot);
  els.app.hidden = false;
  engageStep();
  els.cta.onclick = () => completeStep({ gameId: cfg.id });
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") === "1") {
    setupPagePreview("certificate", (cfg) => {
      const c = cfg as CertificateRecord;
      const sample = buildCertificateSessionRoot({
        data: { formFields: { name: "Preview Name" } },
        outcomes: { "catch.score": 42, "runner.score": 1200, "quiz.score": 8 },
      });
      void mountCertificate(c, sample);
    });
    return;
  }
  initEmbeddedContexts();
  const slug = getSlugFromPath("certificate");
  if (!slug) {
    showError("Missing certificate slug.");
    return;
  }
  try {
    const cfg = (await fetchPageModule(slug, "certificate")) as CertificateRecord;
    const session = await loadModuleSessionRoot();
    await mountCertificate(cfg, buildCertificateSessionRoot(session || undefined));
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed to load");
  }
}

void boot();
