import type { SessionState } from "./types";
import { byId, fetchJson, fetchQuiz, qs, setFavicon, showApp, showError } from "./lib";
import { layoutStage } from "./layout";
import { quizSessionGetUrl } from "./api-path";
import { applyQuizSurface } from "./quiz-theme";
import { ensureQuizFontFaces } from "./font-loader";

function getSlugAndCode() {
  const slug = qs().get("slug");
  const code = qs().get("code");
  if (slug && code) return { slug, code: code.toUpperCase() };
  const seg = window.location.pathname.split("/").filter(Boolean);
  const i = seg.indexOf("quiz");
  const slug2 = i >= 0 ? seg[i + 1] : "";
  const code2 = i >= 0 ? seg[i + 3] : "";
  if (!slug2 || !code2) throw new Error("Missing slug/code");
  return { slug: slug2, code: code2.toUpperCase() };
}

async function pollSession(code: string, rev: number) {
  const url = quizSessionGetUrl({ code, rev: String(rev), cb: String(Date.now()) });
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  const t = await res.text();
  if (!t) throw new Error("Empty session response");
  return JSON.parse(t) as { state: SessionState; changed: boolean };
}

function render(list: HTMLOListElement, state: SessionState) {
  const sorted = [...(state.participants || [])].sort((a, b) => b.score - a.score);
  list.innerHTML = "";
  sorted.slice(0, 20).forEach((p, idx) => {
    const li = document.createElement("li");
    const icon = String(p.icon || "").trim();
    const looksLikeUrl = /^https?:\/\//.test(icon) || icon.startsWith("/api/") || icon.startsWith("/play/");
    const left = document.createElement("div");
    const who = document.createElement("div");
    who.style.fontWeight = "800";
    if (looksLikeUrl) {
      const img = document.createElement("img");
      img.src = icon;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.style.width = "22px";
      img.style.height = "22px";
      img.style.objectFit = "contain";
      img.style.verticalAlign = "middle";
      img.style.marginRight = "8px";
      who.appendChild(img);
      who.appendChild(document.createTextNode(p.name));
    } else {
      who.textContent = `${icon} ${p.name}`.trim();
    }
    const sub = document.createElement("div");
    sub.className = "muted";
    sub.style.fontSize = "0.85rem";
    sub.textContent = "Score";
    left.appendChild(who);
    left.appendChild(sub);
    li.innerHTML = `<span class="quiz-rank">${idx + 1}</span>`;
    li.appendChild(left);
    const score = document.createElement("div");
    score.className = "quiz-score";
    score.textContent = String(p.score);
    li.appendChild(score);
    list.appendChild(li);
  });
}

async function main() {
  try {
    const { slug, code } = getSlugAndCode();
    const quiz = await fetchQuiz(slug);
    if (quiz.faviconUrl) setFavicon(quiz.faviconUrl);
    ensureQuizFontFaces(quiz);
    applyQuizSurface(byId("app"), quiz, "leaderboard");

    const logo = byId<HTMLImageElement>("quiz-logo");
    const title = byId("quiz-title");
    const sub = byId("quiz-sub");
    const list = byId<HTMLOListElement>("lb-list");
    const stage = byId<HTMLElement>("stage");
    const fit = byId<HTMLElement>("fit");

    title.textContent = quiz.title || "Leaderboard";
    sub.textContent = `Code: ${code}`;
    const logoUrl = (quiz.branding?.logoUrl || "").trim();
    if (logoUrl) {
      logo.src = logoUrl;
      logo.style.display = "block";
    }

    layoutStage(stage, fit, 1920, 1080);
    window.addEventListener("resize", () => layoutStage(stage, fit, 1920, 1080));

    // Fullscreen button (leaderboard).
    const fsBtn = document.getElementById("quiz-fs-btn") as HTMLButtonElement | null;
    if (fsBtn) {
      const canFs = typeof document !== "undefined" && !!document.documentElement?.requestFullscreen;
      if (!canFs) fsBtn.setAttribute("hidden", "true");
      fsBtn.addEventListener("click", async () => {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else await document.documentElement.requestFullscreen();
        } catch {
          /* ignore */
        }
      });
    }

    let rev = 0;
    const loop = async () => {
      try {
        const r = await pollSession(code, rev);
        if (r.changed) {
          rev = r.state.revision;
          render(list, r.state);
        }
      } catch {
        // ignore
      } finally {
        window.setTimeout(loop, 380);
      }
    };
    loop();

    showApp();
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed");
  }
}

void main();

