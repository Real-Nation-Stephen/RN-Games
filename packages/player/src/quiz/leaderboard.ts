import type { SessionState } from "./types";
import { byId, fetchJson, fetchQuiz, qs, setFavicon, showApp, showError } from "./lib";
import { layoutStage } from "./layout";

function getSlugAndCode() {
  const slug = qs().get("slug");
  const code = qs().get("code");
  if (slug && code) return { slug, code };
  const seg = window.location.pathname.split("/").filter(Boolean);
  const i = seg.indexOf("quiz");
  const slug2 = i >= 0 ? seg[i + 1] : "";
  const code2 = i >= 0 ? seg[i + 3] : "";
  if (!slug2 || !code2) throw new Error("Missing slug/code");
  return { slug: slug2, code: code2 };
}

async function pollSession(code: string, rev: number) {
  return fetchJson<{ state: SessionState; changed: boolean }>(
    `/api/quiz-session?code=${encodeURIComponent(code)}&rev=${encodeURIComponent(String(rev))}`,
  );
}

function render(list: HTMLOListElement, state: SessionState) {
  const sorted = [...(state.participants || [])].sort((a, b) => b.score - a.score);
  list.innerHTML = "";
  sorted.slice(0, 20).forEach((p, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="quiz-rank">${idx + 1}</span><div><div style="font-weight:800">${p.icon} ${p.name}</div><div class="muted" style="font-size:0.85rem">Score</div></div><div class="quiz-score">${p.score}</div>`;
    list.appendChild(li);
  });
}

async function main() {
  try {
    const { slug, code } = getSlugAndCode();
    const quiz = await fetchQuiz(slug);
    if (quiz.faviconUrl) setFavicon(quiz.faviconUrl);

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

