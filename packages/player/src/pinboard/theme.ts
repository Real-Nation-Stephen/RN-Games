import type { PinboardBrandingSurface, PinboardConfig } from "./types";

export function injectFontFaces(cfg: PinboardConfig) {
  let el = document.getElementById("pinboard-font-faces");
  if (!el) {
    el = document.createElement("style");
    el.id = "pinboard-font-faces";
    document.head.appendChild(el);
  }
  const parts: string[] = [];
  const add = (family: string, url: string) => {
    if (!family || !url) return;
    parts.push(
      `@font-face{font-family:${family};src:url('${url}') format('woff2'),url('${url}') format('woff'),url('${url}') format('truetype');font-display:swap;}`,
    );
  };
  const b = cfg.board;
  add("PinHeading", b.fontUploads?.heading?.url || "");
  add("PinSubhead", b.fontUploads?.subheading?.url || "");
  add("PinBody", b.fontUploads?.body?.url || "");
  el.textContent = parts.join("\n");
}

export function applySurface(root: HTMLElement, surface: PinboardBrandingSurface) {
  const bg = surface.backgroundHex || "#121820";
  root.style.setProperty("--pin-surface-bg", bg);
  const bgImg =
    surface.backgroundImageUrl ||
    ("backgroundImage" in surface ? (surface as { backgroundImage?: string }).backgroundImage : "");
  if (surface.useBackgroundImage && bgImg) {
    root.style.setProperty("--pin-surface-bg-image", `url(${bgImg})`);
  } else {
    root.style.removeProperty("--pin-surface-bg-image");
  }
  if (surface.textHex) root.style.setProperty("--pin-text", surface.textHex);
  if (surface.buttonHex) root.style.setProperty("--pin-btn-bg", surface.buttonHex);
  if (surface.buttonTextHex) root.style.setProperty("--pin-btn-text", surface.buttonTextHex);
}

export function applyBoardChrome(cfg: PinboardConfig) {
  const root = document.documentElement;
  const b = cfg.board;
  injectFontFaces(cfg);
  if (b.useBackgroundImage && b.backgroundImage) {
    root.style.setProperty("--pin-board-bg-image", `url(${b.backgroundImage})`);
  } else {
    root.style.removeProperty("--pin-board-bg-image");
  }
  const bgHex = b.backgroundHex || b.backgroundColor || "#3d5a4c";
  const headerHex = b.headerHex || b.headerColor || "#ffffff";
  const subheadHex = b.subheadHex || b.subheadColor || "#dce8e4";
  root.style.setProperty("--pin-board-bg-solid", bgHex);
  root.style.setProperty("--pin-header-color", headerHex);
  root.style.setProperty("--pin-subhead-color", subheadHex);
  root.style.setProperty(
    "--pin-font-heading",
    b.fontUploads?.heading?.url ? "PinHeading, system-ui, sans-serif" : "system-ui, sans-serif",
  );
  root.style.setProperty(
    "--pin-font-subhead",
    b.fontUploads?.subheading?.url ? "PinSubhead, system-ui, sans-serif" : "system-ui, sans-serif",
  );
  document.body.dataset.brandCorner = b.brandLogoCorner || "bl";
}
