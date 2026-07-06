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

function renderTextBlock(block: Extract<LandingBlock, { type: "text" }>): HTMLElement {
  const el = document.createElement(block.variant === "headline" ? "h1" : block.variant === "subheadline" ? "h2" : "p");
  el.className = `landing-text landing-text--${block.variant}`;
  el.textContent = block.content;
  el.style.textAlign = textAlign(block.align);
  if (block.colorHex) el.style.color = block.colorHex;
  return el;
}

function renderImageBlock(block: Extract<LandingBlock, { type: "image" }>): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "landing-image-wrap";
  wrap.style.display = "flex";
  wrap.style.justifyContent = alignStyle(block.align);
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
  for (const img of block.images) {
    const cell = document.createElement("figure");
    cell.className = "landing-gallery__cell";
    if (img.url) {
      const el = document.createElement("img");
      el.src = img.url;
      el.alt = img.alt;
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
  opts: LandingMountOptions,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "landing-button-wrap";
  wrap.style.display = "flex";
  wrap.style.justifyContent = alignStyle(block.align);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "page-btn landing-btn";
  btn.textContent = opts.flowMode && block.isPrimary ? opts.flowNextLabel : block.label;
  btn.style.background = block.backgroundHex;
  btn.style.color = block.textHex;
  if (block.fullWidth) btn.style.width = "100%";

  btn.addEventListener("click", () => {
    opts.onEngage();
    if (block.url && !opts.flowMode) {
      window.open(block.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (block.isPrimary || opts.flowMode) opts.onPrimaryAction(block.label);
    else if (block.url) window.location.href = block.url;
  });

  wrap.appendChild(btn);
  return wrap;
}

export function renderLandingBlocks(
  container: HTMLElement,
  cfg: LandingRecord,
  opts: LandingMountOptions,
): boolean {
  const settings = cfg.pageSettings;
  container.className = "page-card landing-blocks";
  container.style.maxWidth = `${settings.maxWidthPx}px`;
  container.style.textAlign = textAlign(settings.contentAlign);
  container.style.padding = `${settings.paddingPx}px`;
  container.replaceChildren();

  let hasPrimary = false;
  for (const block of cfg.blocks) {
    let el: HTMLElement | null = null;
    switch (block.type) {
      case "text":
        el = renderTextBlock(block);
        break;
      case "image":
        el = renderImageBlock(block);
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
        el.style.justifyContent = "center";
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
        el = renderButtonBlock(block, opts);
        break;
    }
    if (el) container.appendChild(el);
  }

  const app = document.getElementById("page-app");
  if (app) {
    app.style.justifyContent = settings.verticalAlign === "top" ? "flex-start" : "center";
    app.style.alignItems = settings.contentAlign === "left" ? "flex-start" : settings.contentAlign === "right" ? "flex-end" : "center";
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
