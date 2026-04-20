import type { QuizConfig } from "./types";

/** Apply optional surface kits + base branding as CSS variables on a root element (typically `#app` or `body`). */
export function applyQuizSurface(
  root: HTMLElement,
  quiz: QuizConfig,
  surface: "default" | "mobile" | "host" | "leaderboard",
) {
  const b = quiz.branding;
  const kit =
    surface === "mobile" ? b?.mobile : surface === "host" ? b?.host : surface === "leaderboard" ? b?.leaderboard : undefined;

  const bg = kit?.backgroundHex || b?.backgroundColor || "#0a1628";
  root.style.setProperty("--quiz-surface-bg", bg);
  if (kit?.backgroundImageUrl) root.style.setProperty("--quiz-surface-bg-image", `url(${kit.backgroundImageUrl})`);
  else root.style.removeProperty("--quiz-surface-bg-image");

  if (kit?.textHex) root.style.setProperty("--quiz-text", kit.textHex);
  else root.style.removeProperty("--quiz-text");

  if (kit?.mutedHex) root.style.setProperty("--quiz-muted", kit.mutedHex);
  else root.style.removeProperty("--quiz-muted");

  if (kit?.buttonHex) root.style.setProperty("--quiz-btn-bg", kit.buttonHex);
  else root.style.removeProperty("--quiz-btn-bg");

  if (kit?.buttonTextHex) root.style.setProperty("--quiz-btn-text", kit.buttonTextHex);
  else root.style.removeProperty("--quiz-btn-text");

  if (kit?.overlayHex) root.style.setProperty("--quiz-overlay", kit.overlayHex);
  else root.style.removeProperty("--quiz-overlay");

  const fh = kit?.fontHeading || b?.fonts?.heading;
  const fb = kit?.fontBody || b?.fonts?.body;
  if (fh) root.style.setProperty("--quiz-font-heading", fh);
  else root.style.removeProperty("--quiz-font-heading");
  if (fb) root.style.setProperty("--quiz-font-body", fb);
  else root.style.removeProperty("--quiz-font-body");
}

export function applySequenceFonts(el: { seqTitle: HTMLElement; seqBody: HTMLElement }, quiz: QuizConfig) {
  const h = quiz.branding?.fonts?.heading;
  const sub = quiz.branding?.fonts?.subheading;
  const body = quiz.branding?.fonts?.body;
  if (h) el.seqTitle.style.fontFamily = h;
  else el.seqTitle.style.removeProperty("font-family");
  if (sub && el.seqBody) {
    /* subhead uses seqBody for intro split — keep body font on paragraph */
  }
  if (body) el.seqBody.style.fontFamily = body;
  else el.seqBody.style.removeProperty("font-family");
}
