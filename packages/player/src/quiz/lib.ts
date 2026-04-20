import type { QuizConfig } from "./types";

export function qs() {
  return new URLSearchParams(window.location.search);
}

export function mustParam(name: string): string {
  const v = qs().get(name);
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null as unknown as T;
  const t = await res.text();
  if (!t) return null as unknown as T;
  return JSON.parse(t) as T;
}

export async function fetchOk(url: string, init?: RequestInit): Promise<void> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
}

export async function fetchQuiz(slug: string): Promise<QuizConfig> {
  const q = await fetchJson<QuizConfig>(`/api/public-wheel?slug=${encodeURIComponent(slug)}`);
  if (!q || q.gameType !== "quiz") throw new Error("Not a quiz");
  return q;
}

export function setFavicon(url: string) {
  const u = (url || "").trim();
  const head = document.head;
  const link =
    (head.querySelector("link[rel='icon']") as HTMLLinkElement | null) ||
    (head.querySelector("link[rel='shortcut icon']") as HTMLLinkElement | null);
  if (u) {
    const el = link || document.createElement("link");
    el.rel = "icon";
    el.href = u;
    head.appendChild(el);
  } else if (link) link.remove();
}

export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el as T;
}

export function showError(msg: string) {
  const box = document.getElementById("quiz-error");
  const m = document.getElementById("quiz-error-msg");
  if (m) m.textContent = msg;
  if (box) box.removeAttribute("hidden");
  document.getElementById("app")?.setAttribute("hidden", "true");
}

export function showApp() {
  document.getElementById("quiz-error")?.setAttribute("hidden", "true");
  document.getElementById("app")?.removeAttribute("hidden");
}

