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
]);

export default async (request, context) => {
  const url = new URL(request.url);
  const path = url.pathname;

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
