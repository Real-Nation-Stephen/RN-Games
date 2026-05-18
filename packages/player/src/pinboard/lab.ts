import type { PinboardConfig } from "./types";
import { DEFAULT_PINBOARD_CONFIG } from "./config-default";
import { getEventIdFromQuery, loadConfig, saveConfig } from "./store";

function $(id: string) {
  return document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
}

function val(id: string) {
  return ($(id) as HTMLInputElement)?.value?.trim() ?? "";
}

function checked(id: string) {
  return !!(document.getElementById(id) as HTMLInputElement)?.checked;
}

function setChecked(id: string, v: boolean) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.checked = v;
}

function setVal(id: string, v: string) {
  const el = $(id);
  if (el) el.value = v;
}

function readForm(): PinboardConfig {
  const eventId = val("lab-event") || "demo";
  const base = loadConfig(eventId);
  return {
    ...base,
    eventId,
    title: val("lab-title") || base.title,
    clientName: val("lab-client") || base.clientName,
    slug: val("lab-slug") || base.slug,
    faviconUrl: val("lab-favicon") || undefined,
    board: {
      ...base.board,
      header: val("lab-board-header"),
      subhead: val("lab-board-subhead"),
      headerColor: val("lab-board-header-color"),
      subheadColor: val("lab-board-subhead-color"),
      useBackgroundImage: checked("lab-board-use-bg-image"),
      backgroundColor: val("lab-board-bg-color"),
      backgroundImage: val("lab-board-bg-image"),
      brandLogoUrl: val("lab-board-logo"),
      brandLogoCorner: (val("lab-board-logo-corner") as PinboardConfig["board"]["brandLogoCorner"]) || "bl",
      polaroidFrames: checked("lab-board-polaroid"),
    },
    mobile: {
      ...base.mobile,
      headline: val("lab-mobile-headline"),
      subheadline: val("lab-mobile-subhead"),
      submitLabel: val("lab-mobile-submit"),
      thankYouMessage: val("lab-mobile-thanks"),
      backgroundHex: val("lab-mobile-bg"),
      useBackgroundImage: checked("lab-mobile-use-bg-image"),
      backgroundImageUrl: val("lab-mobile-bg-image"),
      textHex: val("lab-mobile-text"),
      buttonHex: val("lab-mobile-btn"),
      buttonTextHex: val("lab-mobile-btn-text"),
      photoPublishMode: (val("lab-photo-publish-mode") || base.mobile.photoPublishMode) as PinboardConfig["mobile"]["photoPublishMode"],
      uniformFrameId: val("lab-uniform-frame-id") || null,
      photoFrames: base.mobile.photoFrames,
      photoStickers: base.mobile.photoStickers,
    },
    moderator: {
      ...base.moderator,
      headline: val("lab-mod-headline"),
      approveLabel: val("lab-mod-approve"),
      rejectLabel: val("lab-mod-reject"),
      backgroundHex: val("lab-mod-bg"),
      textHex: val("lab-mod-text"),
      buttonHex: val("lab-mod-btn"),
      buttonTextHex: val("lab-mod-btn-text"),
    },
  };
}

function fillForm(cfg: PinboardConfig) {
  setVal("lab-event", cfg.eventId);
  setVal("lab-title", cfg.title);
  setVal("lab-client", cfg.clientName);
  setVal("lab-slug", cfg.slug);
  setVal("lab-favicon", cfg.faviconUrl || "");
  setVal("lab-board-header", cfg.board.header);
  setVal("lab-board-subhead", cfg.board.subhead);
  setVal("lab-board-header-color", cfg.board.headerColor);
  setVal("lab-board-subhead-color", cfg.board.subheadColor);
  setChecked("lab-board-use-bg-image", cfg.board.useBackgroundImage);
  setVal("lab-board-bg-color", cfg.board.backgroundColor);
  setVal("lab-board-bg-image", cfg.board.backgroundImage);
  setVal("lab-board-logo", cfg.board.brandLogoUrl);
  setVal("lab-board-logo-corner", cfg.board.brandLogoCorner);
  setChecked("lab-board-polaroid", cfg.board.polaroidFrames);
  setVal("lab-mobile-headline", cfg.mobile.headline);
  setVal("lab-mobile-subhead", cfg.mobile.subheadline);
  setVal("lab-mobile-submit", cfg.mobile.submitLabel);
  setVal("lab-mobile-thanks", cfg.mobile.thankYouMessage);
  setVal("lab-mobile-bg", cfg.mobile.backgroundHex || "");
  setChecked("lab-mobile-use-bg-image", cfg.mobile.useBackgroundImage ?? false);
  setVal("lab-mobile-bg-image", cfg.mobile.backgroundImageUrl || "");
  setVal("lab-mobile-text", cfg.mobile.textHex || "");
  setVal("lab-mobile-btn", cfg.mobile.buttonHex || "");
  setVal("lab-mobile-btn-text", cfg.mobile.buttonTextHex || "");
  setVal("lab-photo-publish-mode", cfg.mobile.photoPublishMode || "user_choice");
  setVal("lab-uniform-frame-id", cfg.mobile.uniformFrameId || "polaroid");
  setVal("lab-mod-headline", cfg.moderator.headline);
  setVal("lab-mod-approve", cfg.moderator.approveLabel);
  setVal("lab-mod-reject", cfg.moderator.rejectLabel);
  setVal("lab-mod-bg", cfg.moderator.backgroundHex || "");
  setVal("lab-mod-text", cfg.moderator.textHex || "");
  setVal("lab-mod-btn", cfg.moderator.buttonHex || "");
  setVal("lab-mod-btn-text", cfg.moderator.buttonTextHex || "");
  updateLinks(cfg.eventId);
}

function updateLinks(eventId: string) {
  const q = `?event=${encodeURIComponent(eventId)}`;
  const base = "/play";
  const set = (id: string, path: string) => {
    const a = document.getElementById(id) as HTMLAnchorElement | null;
    if (a) a.href = `${base}/${path}${q}`;
  };
  set("link-board", "pinboard-board.html");
  set("link-submit", "pinboard-submit.html");
  set("link-moderate", "pinboard-moderate.html");
}

async function bootstrap() {
  const eventId = getEventIdFromQuery();
  const cfg =
    eventId === "demo" && !localStorage.getItem(`rngames-pinboard-config:${eventId}`)
      ? { ...DEFAULT_PINBOARD_CONFIG }
      : await loadConfig(eventId);
  fillForm(cfg);

  document.getElementById("lab-load")?.addEventListener("click", () => {
    void loadConfig(val("lab-event") || "demo").then((c) => fillForm(c));
  });

  document.getElementById("lab-save")?.addEventListener("click", () => {
    const next = readForm();
    saveConfig(next);
    const status = document.getElementById("lab-status");
    if (status) status.textContent = `Saved config for event “${next.eventId}”.`;
    updateLinks(next.eventId);
  });

  document.getElementById("lab-reset")?.addEventListener("click", () => {
    if (!confirm("Reset config for this event to demo defaults?")) return;
    const eventId = val("lab-event") || "demo";
    saveConfig({ ...DEFAULT_PINBOARD_CONFIG, eventId });
    void loadConfig(eventId).then((c) => fillForm(c));
    const status = document.getElementById("lab-status");
    if (status) status.textContent = "Reset to defaults.";
  });
}

void bootstrap();
