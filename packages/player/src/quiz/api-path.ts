/**
 * Netlify `/api/quiz-session` → function redirects can drop query params in some setups.
 * Production: call the function directly so `code` / `rev` always reach the handler.
 * Vite dev: keep `/api/...` so the dev proxy to `netlify dev` still works.
 */
export function quizSessionEndpoint(): string {
  return import.meta.env.DEV ? "/api/quiz-session" : "/.netlify/functions/quiz-session";
}

export function quizSessionGetUrl(params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString();
  return `${quizSessionEndpoint()}?${q}`;
}
