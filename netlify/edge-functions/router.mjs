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
  "pinboard",
  "leaderboard",
  "catch",
  /** Runner arcade game public routes */
  "runner",
  /** Experience player routes */
  "x",
]);

export default async (request, context) => {
  const url = new URL(request.url);
  const path = url.pathname;

  // Experience: /x/:slug
  if (path === "/x" || path.startsWith("/x/")) {
    const seg = path.split("/").filter(Boolean);
    if (seg.length >= 2 && seg[0] === "x") {
      const slug = seg[1];
      const target = new URL("/play/experience.html", url);
      target.searchParams.set("slug", slug);
      if (url.searchParams.get("previewToken")) {
        target.searchParams.set("previewToken", url.searchParams.get("previewToken"));
      }
      return fetch(target);
    }
  }

  // Leaderboard module: /leaderboard/:slug live + /leaderboard/:slug/moderator
  if (path === "/leaderboard" || path.startsWith("/leaderboard/")) {
    const seg = path.split("/").filter(Boolean);
    if (seg.length >= 2 && seg[0] === "leaderboard") {
      const slug = seg[1];
      const surface = seg[2] || "board";
      if (surface === "moderator") {
        return fetch(new URL(`/play/leaderboard-moderate.html?slug=${encodeURIComponent(slug)}`, url));
      }
      return fetch(new URL(`/play/leaderboard-board.html?slug=${encodeURIComponent(slug)}`, url));
    }
  }

  // Catch game: /catch/:slug
  if (path === "/catch" || path.startsWith("/catch/")) {
    const seg = path.split("/").filter(Boolean);
    if (seg.length >= 2 && seg[0] === "catch") {
      const slug = seg[1];
      return fetch(new URL(`/play/catch.html?slug=${encodeURIComponent(slug)}`, url));
    }
  }

  // Runner game: /runner/:slug
  if (path === "/runner" || path.startsWith("/runner/")) {
    const seg = path.split("/").filter(Boolean);
    if (seg.length >= 2 && seg[0] === "runner") {
      const slug = seg[1];
      return fetch(new URL(`/play/runner.html?slug=${encodeURIComponent(slug)}`, url));
    }
  }

  // Pin board: /pinboard/:slug, /pinboard/:slug/submit, /pinboard/:slug/moderate
  if (path === "/pinboard" || path.startsWith("/pinboard/")) {
    const seg = path.split("/").filter(Boolean);
    if (seg.length >= 2 && seg[0] === "pinboard") {
      const slug = seg[1];
      const surface = seg[2] || "board";
      if (surface === "submit") {
        return fetch(new URL(`/play/pinboard-submit.html?slug=${encodeURIComponent(slug)}`, url));
      }
      if (surface === "moderate") {
        return fetch(new URL(`/play/pinboard-moderate.html?slug=${encodeURIComponent(slug)}`, url));
      }
      return fetch(new URL(`/play/pinboard-board.html?slug=${encodeURIComponent(slug)}`, url));
    }
  }

  // Quiz public routes (host/join/leaderboard) are served from the player bundle under /play/.
  if (path === "/quiz" || path.startsWith("/quiz/")) {
    const seg = path.split("/").filter(Boolean);
    // /quiz/:slug/host
    if (seg.length >= 3 && seg[0] === "quiz" && seg[2] === "host") {
      return fetch(new URL("/play/quiz-host.html", url));
    }
    // /quiz/:slug/present (facilitated / kiosk-only embed — no room code)
    if (seg.length === 3 && seg[0] === "quiz" && seg[2] === "present") {
      return fetch(new URL("/play/quiz-present.html", url));
    }
    // /quiz/:slug/present/:code (audience / projector — follows session slide index)
    if (seg.length >= 4 && seg[0] === "quiz" && seg[2] === "present") {
      return fetch(new URL("/play/quiz-present.html", url));
    }
    // /quiz/:slug/join/:code
    if (seg.length >= 4 && seg[0] === "quiz" && seg[2] === "join") {
      return fetch(new URL("/play/quiz-join.html", url));
    }
    // /quiz/:slug/kiosk (single-player, runs on the presentation device)
    if (seg.length >= 3 && seg[0] === "quiz" && seg[2] === "kiosk") {
      return fetch(new URL("/play/quiz-kiosk.html", url));
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
