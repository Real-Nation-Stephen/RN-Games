import type {
  LandingBlock,
  LandingRecord,
  PageModuleRecord,
} from "@rngames/shared/page-modules";

export type LandingMountOptions = {
  flowMode: boolean;
  flowNextLabel: string;
  onPrimaryAction: (label: string) => void;
  onEngage: () => void;
  onScreenNavigate?: (screenId: string) => void;
  deferEntranceAnimation?: boolean;
};

function alignStyle(align: string): string {
  if (align === "left") return "flex-start";
  if (align === "right") return "flex-end";
  return "center";
}

function textAlign(align: string): string {
  if (align === "left" || align === "right") return align;
  return "center";
}

function resolveBlockAlign(blockAlign: string, pageAlign: string): string {
  if (blockAlign === "inherit" || !blockAlign) return pageAlign;
  return blockAlign;
}

function objectFit(fit: string): string {
  if (fit === "fill") return "fill";
  if (fit === "cover") return "cover";
  return "contain";
}

function videoEmbedUrl(url: string, autoplay: boolean, muted: boolean): string | null {
  const u = url.trim();
  if (!u) return null;
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(u)) return u;
  try {
    const parsed = new URL(u);
    if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) {
      let id = parsed.searchParams.get("v");
      if (!id && parsed.hostname.includes("youtu.be")) id = parsed.pathname.replace("/", "");
      if (!id) return null;
      const params = new URLSearchParams({ rel: "0", modestbranding: "1" });
      if (autoplay) params.set("autoplay", "1");
      if (muted) params.set("mute", "1");
      return `https://www.youtube.com/embed/${id}?${params}`;
    }
    if (parsed.hostname.includes("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean).pop();
      if (!id) return null;
      const params = new URLSearchParams();
      if (autoplay) params.set("autoplay", "1");
      if (muted) params.set("muted", "1");
      return `https://player.vimeo.com/video/${id}?${params}`;
    }
  } catch {
    return null;
  }
  return null;
}

function renderTextBlock(block: Extract<LandingBlock, { type: "text" }>, pageAlign: string): HTMLElement {
  const el = document.createElement(block.variant === "headline" ? "h1" : block.variant === "subheadline" ? "h2" : "p");
  el.className = `landing-text landing-text--${block.variant}`;
  el.textContent = block.content;
  el.style.textAlign = textAlign(resolveBlockAlign(block.align, pageAlign));
  if (block.colorHex) el.style.color = block.colorHex;
  if (block.fontSizePx) el.style.fontSize = `${block.fontSizePx}px`;
  return el;
}

function renderImageBlock(block: Extract<LandingBlock, { type: "image" }>, pageAlign: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "landing-image-wrap";
  wrap.style.display = "flex";
  wrap.style.justifyContent = alignStyle(resolveBlockAlign(block.align, pageAlign));
  if (!block.url) return wrap;
  const img = document.createElement("img");
  img.src = block.url;
  img.alt = block.alt;
  img.className = `landing-image landing-image--${block.fit}`;
  img.style.objectFit = objectFit(block.fit);
  img.style.maxHeight = `${block.maxHeightPx}px`;
  img.style.borderRadius = `${block.borderRadiusPx}px`;
  img.style.width = block.fullWidth ? "100%" : "auto";
  img.style.maxWidth = "100%";
  wrap.appendChild(img);
  return wrap;
}

function renderImageTextBlock(block: Extract<LandingBlock, { type: "image_text" }>): HTMLElement {
  const row = document.createElement("div");
  row.className = `landing-image-text landing-image-text--${block.layout}`;
  row.style.gap = `${block.gapPx}px`;

  const media = document.createElement("div");
  media.className = "landing-image-text__media";
  if (block.imageUrl) {
    const img = document.createElement("img");
    img.src = block.imageUrl;
    img.alt = block.imageAlt;
    img.style.objectFit = objectFit(block.imageFit);
    media.appendChild(img);
  }

  const copy = document.createElement("div");
  copy.className = "landing-image-text__copy";
  const h = document.createElement("h2");
  h.className = "landing-text landing-text--subheadline";
  h.textContent = block.headline;
  const p = document.createElement("p");
  p.className = "landing-text landing-text--body";
  p.textContent = block.body;
  copy.append(h, p);

  if (block.layout === "image_right") row.append(copy, media);
  else row.append(media, copy);
  return row;
}

function renderGalleryBlock(block: Extract<LandingBlock, { type: "gallery" }>): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "landing-gallery";
  grid.style.gridTemplateColumns = `repeat(${block.columns}, minmax(0, 1fr))`;
  grid.style.gap = `${block.gapPx}px`;
  const fit = block.imageFit || "cover";
  for (const img of block.images) {
    const cell = document.createElement("figure");
    cell.className = `landing-gallery__cell landing-gallery__cell--${fit}`;
    if (img.url) {
      const el = document.createElement("img");
      el.src = img.url;
      el.alt = img.alt;
      el.style.objectFit = fit === "fill" ? "fill" : fit;
      cell.appendChild(el);
    }
    if (img.caption) {
      const cap = document.createElement("figcaption");
      cap.textContent = img.caption;
      cell.appendChild(cap);
    }
    grid.appendChild(cell);
  }
  return grid;
}

function renderVideoBlock(block: Extract<LandingBlock, { type: "video" }>): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = `landing-video landing-video--${block.aspectRatio.replace(":", "-")}`;
  const embed = videoEmbedUrl(block.url, block.autoplay, block.muted);
  if (!embed) return wrap;
  if (embed.includes("youtube") || embed.includes("vimeo")) {
    const iframe = document.createElement("iframe");
    iframe.src = embed;
    iframe.title = "Video";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    wrap.appendChild(iframe);
  } else {
    const video = document.createElement("video");
    video.src = embed;
    video.controls = true;
    if (block.autoplay) video.autoplay = true;
    if (block.muted) video.muted = true;
    video.playsInline = true;
    wrap.appendChild(video);
  }
  return wrap;
}

function renderButtonBlock(
  block: Extract<LandingBlock, { type: "button" }>,
  pageAlign: string,
  opts: LandingMountOptions,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "landing-button-wrap";
  wrap.style.display = "flex";
  wrap.style.justifyContent = alignStyle(resolveBlockAlign(block.align, pageAlign));

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "page-btn landing-btn";
  btn.textContent = block.label;
  btn.style.background = block.backgroundHex;
  btn.style.color = block.textHex;
  if (block.fullWidth) btn.style.width = "100%";

  btn.addEventListener("click", () => {
    opts.onEngage();
    const action =
      block.action ??
      (block.targetScreenId ? "screen" : block.isPrimary ? "primary" : block.url ? "link" : "primary");
    if (action === "screen" && block.targetScreenId && opts.onScreenNavigate) {
      opts.onScreenNavigate(block.targetScreenId);
      return;
    }
    if (action === "link" && block.url && !opts.flowMode) {
      window.open(block.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (action === "primary" || block.isPrimary || opts.flowMode) opts.onPrimaryAction(block.label);
    else if (block.url) window.location.href = block.url;
  });

  wrap.appendChild(btn);
  return wrap;
}

function renderEmbedBlock(block: Extract<LandingBlock, { type: "embed" }>): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "landing-embed";
  wrap.style.height = `${block.heightPx}px`;
  if (!block.url) return wrap;
  const iframe = document.createElement("iframe");
  iframe.src = block.url;
  iframe.title = block.title || "Embedded content";
  iframe.loading = "lazy";
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups");
  wrap.appendChild(iframe);
  return wrap;
}

/** Sync logo column width/alignment with landing page settings. */
export function applyLandingPageLayout(cfg: LandingRecord) {
  const settings = cfg.pageSettings;
  const width = `${settings.maxWidthPx}px`;
  const pad = `${settings.paddingPx}px`;
  document.documentElement.style.setProperty("--page-content-width", width);

  const app = document.getElementById("page-app");
  if (app) {
    const offset = Math.max(0, Math.min(100, settings.contentOffsetYPercent ?? 50));
    const vertical = settings.verticalAlign === "center" ? "center" : "flex-start";
    app.style.justifyContent = vertical;
    app.style.paddingTop = vertical === "flex-start" ? `calc(${offset} * 0.55vh)` : "";
    app.style.alignItems = "center";
  }

  const logo = document.getElementById("page-logo");
  if (logo) {
    logo.style.width = "100%";
    logo.style.maxWidth = width;
    logo.style.marginLeft = "auto";
    logo.style.marginRight = "auto";
    logo.style.paddingLeft = pad;
    logo.style.paddingRight = pad;
    logo.style.boxSizing = "border-box";
    if (settings.logoMatchPageAlign !== false && cfg.logoUrl) {
      logo.className = `page-logo page-logo--${settings.contentAlign}`;
    }
  }
}

export function renderLandingBlocks(
  container: HTMLElement,
  cfg: LandingRecord,
  opts: LandingMountOptions,
): boolean {
  const settings = cfg.pageSettings;
  const pageAlign = settings.contentAlign;
  container.className = "page-card landing-blocks";
  container.style.maxWidth = `${settings.maxWidthPx}px`;
  container.style.width = "100%";
  container.style.textAlign = textAlign(pageAlign);
  container.style.padding = `${settings.paddingPx}px`;
  container.style.boxSizing = "border-box";
  container.replaceChildren();

  applyLandingPageLayout(cfg);

  let hasPrimary = false;
  for (const block of cfg.blocks) {
    let el: HTMLElement | null = null;
    switch (block.type) {
      case "text":
        el = renderTextBlock(block, pageAlign);
        break;
      case "image":
        el = renderImageBlock(block, pageAlign);
        break;
      case "image_text":
        el = renderImageTextBlock(block);
        break;
      case "gallery":
        el = renderGalleryBlock(block);
        break;
      case "video":
        el = renderVideoBlock(block);
        break;
      case "spacer": {
        el = document.createElement("div");
        el.className = "landing-spacer";
        el.style.height = `${block.heightPx}px`;
        break;
      }
      case "divider": {
        el = document.createElement("div");
        el.className = "landing-divider-wrap";
        el.style.display = "flex";
        el.style.justifyContent = alignStyle(pageAlign);
        const line = document.createElement("hr");
        line.className = "landing-divider";
        line.style.width = `${block.widthPercent}%`;
        line.style.border = "none";
        line.style.height = `${block.thicknessPx}px`;
        line.style.background = block.colorHex;
        el.appendChild(line);
        break;
      }
      case "button":
        if (block.isPrimary) hasPrimary = true;
        el = renderButtonBlock(block, pageAlign, opts);
        break;
      case "embed":
        el = renderEmbedBlock(block);
        break;
    }
    if (el) container.appendChild(el);
  }

  if (settings.entranceAnimation && !opts.deferEntranceAnimation) {
    container.classList.add("landing-animate-in");
  }

  return hasPrimary;
}

export function applyPageFonts(cfg: PageModuleRecord) {
  const uploads = cfg.typography?.fontUploads || {};
  const families = cfg.typography?.fonts || {};
  let style = document.getElementById("page-font-styles") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "page-font-styles";
    document.head.appendChild(style);
  }
  const rules: string[] = [];
  for (const role of ["heading", "body", "button"] as const) {
    const up = uploads[role];
    if (up?.url && up.family) {
      rules.push(`@font-face{font-family:'${up.family}';src:url('${up.url}');font-display:swap;}`);
    }
  }
  style.textContent = rules.join("");
  const root = document.documentElement;
  if (families.heading) root.style.setProperty("--page-font-heading", families.heading);
  if (families.body) root.style.setProperty("--page-font-body", families.body);
  if (families.button) root.style.setProperty("--page-font-button", families.button);
}
