import type { QuizConfig } from "./types";

function normFamily(family: string): string {
  return String(family || "").trim().replace(/["']/g, "");
}

type Upload = { url: string; family: string; weight?: number | string; style?: "normal" | "italic" };

function faceCss(name: string, u: Upload): string {
  const fam = normFamily(u.family) || name;
  const weight = u.weight ?? "normal";
  const style = u.style ?? "normal";
  const url = String(u.url || "").trim();
  if (!url) return "";
  // Use a broad set of formats; browsers will pick the one they support.
  const src = `url('${url}') format('woff2'),url('${url}') format('woff'),url('${url}') format('truetype'),url('${url}') format('opentype')`;
  return `@font-face{font-family:'${fam}';src:${src};font-display:swap;font-style:${style};font-weight:${weight};}`;
}

/**
 * Registers any uploaded quiz fonts via @font-face.
 * This is separate from `applyQuizSurface()` (which only sets CSS variables).
 */
export function ensureQuizFontFaces(quiz: QuizConfig) {
  const u = quiz.branding?.fontUploads;
  if (!u) return;

  const parts: string[] = [];
  if (u.heading?.url && u.heading.family) parts.push(faceCss("QuizHeading", u.heading));
  if (u.subheading?.url && u.subheading.family) parts.push(faceCss("QuizSubheading", u.subheading));
  if (u.body?.url && u.body.family) parts.push(faceCss("QuizBody", u.body));
  if (u.button?.url && u.button.family) parts.push(faceCss("QuizButton", u.button));

  const css = parts.filter(Boolean).join("\n");
  if (!css) return;

  let el = document.getElementById("quiz-font-faces") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "quiz-font-faces";
    document.head.appendChild(el);
  }
  el.textContent = css;
}

