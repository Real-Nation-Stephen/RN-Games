import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
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
  isInCourseEmbed,
  loadModuleSessionRoot,
  notifyEndScreenReady,
  notifyStepContentReady,
  setupPagePreview,
  wirePageLogo,
  wirePoweredBy,
} from "../page-module/shared";
import { mountScaledMergeOverlay } from "../page-module/cert-scaling";

const els = {
  app: document.getElementById("page-app")!,
  headline: document.getElementById("page-headline")!,
  wrap: document.getElementById("cert-wrap")!,
  downloads: document.getElementById("cert-downloads")!,
  downloadPng: document.getElementById("cert-download-png")!,
  downloadPdf: document.getElementById("cert-download-pdf")!,
  cta: document.getElementById("page-cta") as HTMLButtonElement,
  error: document.getElementById("page-error")!,
};

let certStageEl: HTMLElement | null = null;
let certTitle = "certificate";

function showError(msg: string) {
  els.error.hidden = false;
  els.error.textContent = msg;
}

function renderCertificate(cfg: CertificateRecord, sessionRoot: Record<string, unknown>) {
  els.wrap.replaceChildren();
  const stage = document.createElement("div");
  stage.className = "cert-capture-stage";
  stage.style.position = "relative";
  stage.style.width = "100%";
  stage.style.aspectRatio = `${cfg.canvasWidth} / ${cfg.canvasHeight}`;

  if (cfg.certificateBackgroundUrl) {
    const img = document.createElement("img");
    img.src = cfg.certificateBackgroundUrl;
    img.alt = "";
    img.crossOrigin = "anonymous";
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
  mountScaledMergeOverlay(stage, overlay, cfg.canvasWidth, cfg.mergeFields, (mf) =>
    resolveSessionPath(sessionRoot, mf.sourceKey) || mf.label,
  );
  stage.appendChild(overlay);
  els.wrap.appendChild(stage);
  certStageEl = stage;
}

async function captureCanvas(): Promise<HTMLCanvasElement> {
  if (!certStageEl) throw new Error("Nothing to capture");
  return html2canvas(certStageEl, {
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    scale: Math.min(2, window.devicePixelRatio || 1),
  });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadPng() {
  const canvas = await captureCanvas();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  if (!blob) throw new Error("Could not create image");
  triggerDownload(blob, `${certTitle}.png`);
}

async function downloadPdf() {
  const canvas = await captureCanvas();
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
    unit: "px",
    format: [canvas.width, canvas.height],
  });
  pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
  pdf.save(`${certTitle}.pdf`);
}

async function mountCertificate(cfg: CertificateRecord, sessionRoot: Record<string, unknown>) {
  applyPageTheme(cfg, document.documentElement);
  wirePoweredBy(cfg);
  wirePageLogo(cfg);
  certTitle = (cfg.title || "certificate").replace(/[^\w.-]+/g, "-").toLowerCase() || "certificate";
  els.headline.textContent = cfg.headline;
  renderCertificate(cfg, sessionRoot);
  els.app.hidden = false;

  const embedded = embeddedShellActive();
  els.downloads.hidden = false;
  els.cta.hidden = embedded;
  if (embedded) {
    els.cta.textContent = flowNextLabel();
    els.cta.onclick = () => completeStep({ gameId: cfg.id });
  } else {
    els.cta.textContent = cfg.primaryCta?.label || "Continue";
    els.cta.onclick = () => completeStep({ gameId: cfg.id });
  }

  els.downloadPng.onclick = () => void downloadPng().catch((e) => showError(e instanceof Error ? e.message : "Download failed"));
  els.downloadPdf.onclick = () => void downloadPdf().catch((e) => showError(e instanceof Error ? e.message : "Download failed"));

  if (isInCourseEmbed()) {
    notifyEndScreenReady();
    notifyStepContentReady();
  }

  engageStep();
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
