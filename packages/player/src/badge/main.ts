import html2canvas from "html2canvas";
import type { BadgeRecord } from "@rngames/shared/page-modules";
import { buildBadgeSessionRoot, resolveSessionPath } from "@rngames/shared/page-modules";
import { mountScaledMergeOverlay } from "../page-module/cert-scaling";
import {
  applyPageTheme,
  completeStep,
  engageStep,
  fetchPageModule,
  getSlugFromPath,
  initEmbeddedContexts,
  isInCourseEmbed,
  loadModuleSessionRoot,
  notifyEndScreenReady,
  notifyStepContentReady,
  setupPagePreview,
  wirePageLogo,
  wirePoweredBy,
  wireEmbeddedFlowContinue,
} from "../page-module/shared";

const els = {
  app: document.getElementById("page-app")!,
  headline: document.getElementById("page-headline")!,
  wrap: document.getElementById("badge-wrap")!,
  downloads: document.getElementById("badge-downloads")!,
  downloadPng: document.getElementById("badge-download-png")!,
  cta: document.getElementById("page-cta") as HTMLButtonElement,
  error: document.getElementById("page-error")!,
};

let badgeStageEl: HTMLElement | null = null;
let badgeTitle = "badge";

function showError(msg: string) {
  els.error.hidden = false;
  els.error.textContent = msg;
}

function renderBadge(cfg: BadgeRecord, sessionRoot: Record<string, unknown>) {
  els.wrap.replaceChildren();
  const stage = document.createElement("div");
  stage.className = "cert-capture-stage";
  stage.style.position = "relative";
  stage.style.width = "100%";
  stage.style.aspectRatio = `${cfg.canvasWidth} / ${cfg.canvasHeight}`;

  if (cfg.badgeBackgroundUrl) {
    const img = document.createElement("img");
    img.src = cfg.badgeBackgroundUrl;
    img.alt = "";
    img.crossOrigin = "anonymous";
    img.style.width = "100%";
    img.style.height = "auto";
    img.style.display = "block";
    stage.appendChild(img);
  } else {
    stage.style.background = "#f5f5f5";
    stage.style.borderRadius = "8px";
    stage.style.minHeight = "160px";
  }

  const overlay = document.createElement("div");
  overlay.className = "cert-overlay";
  mountScaledMergeOverlay(stage, overlay, cfg.canvasWidth, cfg.mergeFields, (mf) =>
    resolveSessionPath(sessionRoot, mf.sourceKey) || mf.label,
  );
  stage.appendChild(overlay);
  els.wrap.appendChild(stage);
  badgeStageEl = stage;
}

async function captureCanvas(): Promise<HTMLCanvasElement> {
  if (!badgeStageEl) throw new Error("Nothing to capture");
  return html2canvas(badgeStageEl, {
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
  triggerDownload(blob, `${badgeTitle}.png`);
}

async function mountBadge(cfg: BadgeRecord, sessionRoot: Record<string, unknown>) {
  applyPageTheme(cfg, document.documentElement);
  wirePoweredBy(cfg);
  wirePageLogo(cfg);
  badgeTitle = (cfg.title || "badge").replace(/[^\w.-]+/g, "-").toLowerCase() || "badge";
  els.headline.textContent = cfg.headline;
  renderBadge(cfg, sessionRoot);
  els.app.hidden = false;

  els.downloads.hidden = false;
  wireEmbeddedFlowContinue({
    button: els.cta,
    standaloneLabel: cfg.primaryCta?.label || cfg.downloadLabel || "Continue",
    onContinue: () => completeStep({ gameId: cfg.id }),
  });

  els.downloadPng.onclick = () => void downloadPng().catch((e) => showError(e instanceof Error ? e.message : "Download failed"));

  if (isInCourseEmbed()) {
    notifyEndScreenReady();
    notifyStepContentReady();
  }

  engageStep();
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") === "1") {
    setupPagePreview("badge", (cfg) => {
      const c = cfg as BadgeRecord;
      const sample = buildBadgeSessionRoot({
        data: { formFields: { name: "Preview Name" } },
        outcomes: { "catch.score": 42, "runner.score": 1200, "quiz.score": 8 },
      });
      void mountBadge(c, sample);
    });
    return;
  }
  initEmbeddedContexts();
  const slug = getSlugFromPath("badge");
  if (!slug) {
    showError("Missing badge slug.");
    return;
  }
  try {
    const cfg = (await fetchPageModule(slug, "badge")) as BadgeRecord;
    const session = await loadModuleSessionRoot();
    await mountBadge(cfg, buildBadgeSessionRoot(session || undefined));
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed to load");
  }
}

void boot();
