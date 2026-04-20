const RESERVED = new Set([
  "admin",
  "api",
  "assets",
  "play",
  "report",
  "static",
  "favicon.ico",
  "robots.txt",
  "_next",
  ".netlify",
  /** Reserved for Quiz public routes */
  "quiz",
  /** Scratch ticket prototype / future public route */
  "scratcher",
  "flip-cards",
]);

export default async (request, context) => {
  const url = new URL(request.url);
  const path = url.pathname;

  // Quiz public routes (host/join/leaderboard) are served from the player bundle under /play/.
  if (path === "/quiz" || path.startsWith("/quiz/")) {
    const seg = path.split("/").filter(Boolean);
    // /quiz/:slug/host
    if (seg.length >= 3 && seg[0] === "quiz" && seg[2] === "host") {
      return fetch(new URL("/play/quiz-host.html", url));
    }
    // /quiz/:slug/present/:code (audience / projector — follows session slide index)
    if (seg.length >= 4 && seg[0] === "quiz" && seg[2] === "present") {
      return fetch(new URL("/play/quiz-present.html", url));
    }
    // /quiz/:slug/join/:code
    if (seg.length >= 4 && seg[0] === "quiz" && seg[2] === "join") {
      return fetch(new URL("/play/quiz-join.html", url));
    }
    // /quiz/:slug/live/:code/leaderboard
    if (seg.length >= 5 && seg[0] === "quiz" && seg[2] === "live" && seg[4] === "leaderboard") {
      return fetch(new URL("/play/quiz-leaderboard.html", url));
    }
    // Default quiz landing: send host page (safe fallback for MVP).
    if (seg.length === 1 && seg[0] === "quiz") {
      return fetch(new URL("/play/quiz-host.html", url));
    }
    // Unknown quiz subroute: let Netlify handle (could become 404 or future routes).
  }

  if (
    path.startsWith("/admin") ||
    path.startsWith("/api/") ||
    path.startsWith("/.netlify") ||
    path.startsWith("/assets/") ||
    path === "/play" ||
    path.startsWith("/play/") ||
    path === "/report" ||
    path.startsWith("/report/")
  ) {
    return context.next();
  }

  if (path === "/" || path === "") {
    return Response.redirect(new URL("/admin/", url), 302);
  }

  const segments = path.split("/").filter(Boolean);
  if (segments.length !== 1) {
    return context.next();
  }

  const seg = segments[0];
  if (RESERVED.has(seg)) {
    return context.next();
  }

  if (/\.[a-zA-Z0-9]+$/.test(seg)) {
    return context.next();
  }

  if (seg.endsWith("_Report")) {
    return fetch(new URL("/report/index.html", url));
  }

  return fetch(new URL("/play/index.html", url));
};

export const config = {
  path: "/*",
};
