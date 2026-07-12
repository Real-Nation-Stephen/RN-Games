import {
  appendCourseQuery,
  courseCompletionPercent,
  isExperienceCompleteMessage,
  isExperienceContentReadyMessage,
  isEndScreenReadyMessage,
  isStepCompleteMessage,
  isStepEngagedMessage,
  isCourseItemCompleteMessage,
  isExperienceStepChangedMessage,
  FLOW_CONTENT_REVEAL,
  sectionUnlockState,
  isCourseItemAccessible,
  type PublicCourse,
  type PublicCourseItem,
  type PublicCourseSection,
  type CourseSession,
  type CoursePresentation,
} from "@rngames/shared";
import { appendFlowDebugQuery, flowDebug, flowDebugPanel } from "../flow-debug";

const els = {
  loading: document.getElementById("course-loading")!,
  error: document.getElementById("course-error")!,
  start: document.getElementById("course-start")!,
  startLogo: document.getElementById("course-start-logo")!,
  startTitle: document.getElementById("course-start-title")!,
  startDescription: document.getElementById("course-start-description")!,
  startIntro: document.getElementById("course-start-intro")!,
  startNew: document.getElementById("course-start-new")!,
  resumeInput: document.getElementById("course-resume-input") as HTMLInputElement,
  resumeSubmit: document.getElementById("course-resume-submit")!,
  classPanel: document.getElementById("course-class-panel")!,
  classInput: document.getElementById("course-class-input") as HTMLInputElement,
  classSubmit: document.getElementById("course-class-submit")!,
  startStatus: document.getElementById("course-start-status")!,
  startPowered: document.getElementById("course-start-powered")!,
  home: document.getElementById("course-home")!,
  player: document.getElementById("course-player")!,
  logo: document.getElementById("course-logo")!,
  title: document.getElementById("course-title")!,
  description: document.getElementById("course-description")!,
  progressFill: document.getElementById("course-progress-fill")!,
  progressLabel: document.getElementById("course-progress-label")!,
  sections: document.getElementById("course-sections")!,
  empty: document.getElementById("course-empty")!,
  resume: document.getElementById("course-resume")!,
  learningTitle: document.getElementById("course-learning-title")!,
  learningIntro: document.getElementById("course-learning-intro")!,
  resumeUrl: document.getElementById("course-resume-url") as HTMLInputElement,
  copyLink: document.getElementById("course-copy-link")!,
  resumeStatus: document.getElementById("course-resume-status")!,
  summary: document.getElementById("course-summary")!,
  certList: document.getElementById("course-cert-list")!,
  badges: document.getElementById("course-badges")!,
  badgeGrid: document.getElementById("course-badge-grid")!,
  complete: document.getElementById("course-complete")!,
  powered: document.getElementById("course-powered")!,
  back: document.getElementById("course-back")!,
  playerTitle: document.getElementById("course-player-title")!,
  frame: document.getElementById("course-frame") as HTMLIFrameElement,
  itemLoading: document.getElementById("course-item-loading")!,
  itemLoadingLogo: document.getElementById("course-item-loading-logo") as HTMLImageElement,
  itemLoadingText: document.getElementById("course-item-loading-text")!,
  markComplete: document.getElementById("course-mark-complete")!,
};

let course: PublicCourse | null = null;
let session: CourseSession | null = null;
let activeItem: PublicCourseItem | null = null;
let playerReady = false;
let itemLoadingFallbackTimer = 0;
let slug = "";
let previewToken = "";
let resumeToken = "";

const KIND_ICON: Record<PublicCourseItem["kind"], string> = {
  module: "🎮",
  experience: "✨",
  video: "▶️",
};

const INTERACTIVE_FOOTER_MODULE_TYPES = new Set([
  "flip-cards",
  "spinning-wheel",
  "scratcher",
  "catch",
  "runner",
]);

function courseMessageMatchesActiveItem(data: {
  courseSessionId?: string;
  courseItemId?: string;
}): boolean {
  if (!activeItem) {
    flowDebug("course", "message ignored — no active item", data as Record<string, unknown>);
    return false;
  }
  if (data.courseSessionId && session && data.courseSessionId !== session.sessionId) {
    flowDebug("course", "message session mismatch", {
      msgSession: data.courseSessionId,
      activeSession: session.sessionId,
      courseItemId: data.courseItemId,
    });
    return false;
  }
  if (data.courseItemId && data.courseItemId !== activeItem.id) {
    flowDebug("course", "message item mismatch", {
      msgItem: data.courseItemId,
      activeItem: activeItem.id,
    });
    return false;
  }
  return true;
}

function showCourseFooter() {
  playerReady = true;
  flowDebugPanel("course", "footer shown");
  updatePlayerFooter();
}

function hideCourseFooter() {
  playerReady = false;
  flowDebugPanel("course", "footer hidden");
  updatePlayerFooter();
}

function showCourseFooterIfLastStep(data: { isLastFlowStep?: boolean }) {
  if (data.isLastFlowStep !== true) {
    flowDebug("course", "footer skipped — not last flow step", data as Record<string, unknown>);
    return;
  }
  showCourseFooter();
}

function getCourseSlug(): string {
  const q = new URLSearchParams(window.location.search).get("slug");
  if (q?.trim()) return q.trim();
  const seg = window.location.pathname.split("/").filter(Boolean);
  const i = seg.indexOf("course");
  if (i >= 0 && seg[i + 1]) return seg[i + 1];
  return "";
}

function getPreviewToken(): string {
  return new URLSearchParams(window.location.search).get("previewToken")?.trim() || "";
}

function getResumeToken(): string {
  return new URLSearchParams(window.location.search).get("resumeToken")?.trim() || "";
}

function normalizeSession(s: CourseSession): CourseSession {
  return {
    ...s,
    earnedCertificates: Array.isArray(s.earnedCertificates) ? s.earnedCertificates : [],
    earnedBadges: Array.isArray(s.earnedBadges) ? s.earnedBadges : [],
  };
}

function sessionStorageKey() {
  return `rngames:course-session:${slug}`;
}

function saveSessionLocal(s: CourseSession) {
  try {
    localStorage.setItem(
      sessionStorageKey(),
      JSON.stringify({ sessionId: s.sessionId, participantId: s.participantId }),
    );
  } catch {
    /* ignore */
  }
}

function loadSessionLocal(): { sessionId: string; participantId: string } | null {
  try {
    const raw = localStorage.getItem(sessionStorageKey());
    if (!raw) return null;
    return JSON.parse(raw) as { sessionId: string; participantId: string };
  } catch {
    return null;
  }
}

type View = "loading" | "error" | "start" | "home" | "player";

function showView(view: View) {
  els.loading.hidden = view !== "loading";
  els.error.hidden = view !== "error";
  els.start.hidden = view !== "start";
  els.home.hidden = view !== "home";
  els.player.hidden = view !== "player";
}

function showError(msg: string) {
  showView("error");
  els.error.textContent = msg;
}

function pickCourseBackground(p: CoursePresentation): string {
  const w = window.innerWidth;
  const bg = p.backgrounds || {};
  if (w < 768 && bg.mobile) return bg.mobile;
  if (w < 1024 && bg.tablet) return bg.tablet;
  return bg.desktop || "";
}

function applyPresentation(c: PublicCourse) {
  const p = c.presentation;
  const html = document.documentElement;
  const bgUrl = pickCourseBackground(p);

  html.style.setProperty("--course-bg", p.backgroundHex || "#0a1628");
  html.style.setProperty("--course-bg-image", bgUrl ? `url('${bgUrl}')` : "none");
  html.style.setProperty("--course-card", p.cardHex || "#122038");
  html.style.setProperty("--course-headline", p.headlineHex || "#ffffff");
  html.style.setProperty("--course-text", p.bodyHex || "#e8eef5");
  html.style.setProperty("--course-muted", colorMix(p.bodyHex || "#e8eef5", 55));
  html.style.setProperty("--course-accent", p.accentHex || "#5ec8ff");

  html.classList.remove("course-bg-fixed", "course-bg-scroll");
  html.classList.add(p.backgroundMode === "scroll" ? "course-bg-scroll" : "course-bg-fixed");

  if (p.faviconUrl) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = p.faviconUrl;
  }

  document.title = c.title;

  els.home.classList.remove("layout-rows", "layout-cards", "layout-bento");
  els.home.classList.add(`layout-${c.settings?.layout || "cards"}`);

  if (p.logoUrl) {
    els.logo.replaceChildren();
    const img = document.createElement("img");
    img.src = p.logoUrl;
    img.alt = "";
    els.logo.appendChild(img);
    els.logo.className = `course-logo course-logo--${p.logoAlign || "center"}`;
    els.logo.hidden = false;
  } else {
    els.logo.hidden = true;
    els.logo.replaceChildren();
  }

  els.powered.hidden = p.showPoweredBy === false;
}

function colorMix(hex: string, pct: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  if (Number.isNaN(n)) return "#9eb0c7";
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => Math.round(c * (pct / 100) + 158 * (1 - pct / 100));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function iconHtml(iconUrl?: string, iconEmoji?: string, fallback?: string): string {
  if (iconUrl) return `<img src="${escapeAttr(iconUrl)}" alt="" />`;
  if (iconEmoji) return escapeHtml(iconEmoji);
  return escapeHtml(fallback || "📚");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function embedVideoUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") && u.searchParams.get("v")) {
      return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
    }
    if (u.hostname === "youtu.be") {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    /* use raw url */
  }
  return url;
}

async function fetchCourse(): Promise<PublicCourse> {
  const q = new URLSearchParams({ slug });
  if (previewToken) q.set("previewToken", previewToken);
  const res = await fetch(`/api/public-course?${q.toString()}`);
  if (!res.ok) throw new Error("Course not found");
  const data = await res.json();
  return data.course as PublicCourse;
}

async function postCourseSession(body: Record<string, unknown>): Promise<CourseSession> {
  const res = await fetch("/api/course-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Could not start course session");
  }
  return normalizeSession(data.session as CourseSession);
}

function parseResumeTokenInput(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `${window.location.origin}${raw.startsWith("/") ? "" : "/"}${raw}`);
    const token = url.searchParams.get("resumeToken")?.trim();
    if (token) return token;
  } catch {
    /* plain token */
  }
  return raw;
}

function resumeUrlForSession(c: PublicCourse, s: CourseSession): string {
  if (!s.resumeToken) return `${window.location.origin}/course/${c.slug}`;
  return `${window.location.origin}/course/${c.slug}?resumeToken=${encodeURIComponent(s.resumeToken)}`;
}

function syncResumeUrl() {
  if (!course || !session?.resumeToken || previewToken) return;
  const next = new URL(`/course/${course.slug}`, window.location.origin);
  next.searchParams.set("resumeToken", session.resumeToken);
  const target = `${next.pathname}${next.search}`;
  if (`${window.location.pathname}${window.location.search}` !== target) {
    history.replaceState(null, "", target);
  }
  resumeToken = session.resumeToken;
}

function establishSession(next: CourseSession) {
  session = normalizeSession(next);
  saveSessionLocal(session);
  syncResumeUrl();
}

async function resumeWithToken(token: string): Promise<CourseSession> {
  return postCourseSession({ slug, resumeToken: token });
}

async function startNewSession(): Promise<CourseSession> {
  const body: Record<string, unknown> = { slug, intent: "new" };
  if (previewToken) {
    body.previewToken = previewToken;
    const saved = loadSessionLocal();
    if (saved?.sessionId) body.sessionId = saved.sessionId;
  }
  return postCourseSession(body);
}

async function joinWithClassCode(code: string): Promise<CourseSession> {
  return postCourseSession({
    slug,
    intent: "new",
    classCode: code.trim().toUpperCase(),
  });
}

async function patchSession(body: Record<string, unknown>) {
  if (!session) return;
  const res = await fetch("/api/course-session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: session.sessionId, ...body }),
  });
  if (!res.ok) throw new Error("Could not update progress");
  const data = await res.json();
  session = normalizeSession(data.session as CourseSession);
  saveSessionLocal(session);
  syncResumeUrl();
}

function itemById(id: string | null | undefined): PublicCourseItem | undefined {
  return course?.items.find((i) => i.id === id);
}

function enrichItems(): PublicCourseItem[] {
  if (!course || !session) return [];
  const startedAt = session.startedAt || new Date().toISOString();
  const settings = course.settings || { navigationMode: "sequential", layout: "cards" };

  return course.items.map((item) => {
    const section = course!.sections.find((s) => s.id === item.sectionId);
    const sectionLock = section ? sectionUnlockState(section, startedAt) : { locked: false };
    const withLock: PublicCourseItem = {
      ...item,
      locked: sectionLock.locked,
      lockReason: sectionLock.reason,
    };
    const access = isCourseItemAccessible(withLock, course!.items, session!, settings, sectionLock.locked);
    if (!access.accessible && access.reason) {
      withLock.locked = true;
      withLock.lockReason = access.reason;
    }
    return withLock;
  });
}

function renderSection(section: PublicCourseSection, items: PublicCourseItem[]): string {
  const startedAt = session!.startedAt || new Date().toISOString();
  const sectionLock = sectionUnlockState(section, startedAt);
  const sectionItems = items.filter((i) => i.sectionId === section.id);

  const itemsHtml = sectionItems
    .map((item) => {
      const done = session!.completedItemIds.includes(item.id);
      const current = session!.currentItemId === item.id;
      const locked = !!item.locked;
      const title = item.displayTitle || item.label;
      const meta = [
        item.kind,
        item.missing ? "missing" : "",
        item.archived ? "archived" : "",
        locked && item.lockReason ? item.lockReason : "",
      ]
        .filter(Boolean)
        .join(" · ");

      return `
        <article class="course-item${done ? " is-complete" : ""}${current ? " is-current" : ""}${locked ? " is-locked" : ""}">
          <div class="course-item-main">
            <div class="course-item-icon">${iconHtml(item.iconUrl, item.iconEmoji, KIND_ICON[item.kind])}</div>
            <div class="course-item-label">
              <p class="course-item-title">${escapeHtml(title)}${done ? '<span class="course-item-check" aria-hidden="true">✓</span>' : ""}</p>
              <div class="course-item-meta">${escapeHtml(meta)}</div>
            </div>
          </div>
          <div class="course-item-actions">
            <button type="button" class="course-btn course-btn-primary" data-item-id="${escapeAttr(item.id)}" ${locked || item.missing || item.archived || !item.launchPath ? "disabled" : ""}>
              ${locked ? "Locked" : done ? "Review" : "Start"}
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  const sectionIcon = iconHtml(section.iconUrl, section.iconEmoji, "📂");

  return `
    <section class="course-section">
      <div class="course-section-head">
        <div class="course-section-icon">${sectionIcon}</div>
        <div class="course-section-titles">
          <h3>${escapeHtml(section.title)}</h3>
          ${section.description ? `<p class="course-section-desc">${escapeHtml(section.description)}</p>` : ""}
        </div>
      </div>
      ${sectionLock.locked ? `<p class="course-section-lock">🔒 ${escapeHtml(sectionLock.reason || "Section locked")}</p>` : ""}
      <div class="course-items">${itemsHtml || '<p class="course-muted">No items in this section</p>'}</div>
    </section>
  `;
}

function renderStartScreen(message = "") {
  if (!course) return;
  applyPresentation(course);
  showView("start");

  els.startTitle.textContent = course.title;
  els.startDescription.textContent = course.description || "";
  els.startDescription.style.whiteSpace = "pre-wrap";

  const linkLabel = course.settings?.learningLinkLabel?.trim() || "Learning link";
  els.startIntro.textContent =
    "Create a personal learning link to save your progress, resume later with your link, or join a class if your educator gave you a code.";

  els.startNew.textContent = `Start and get my ${linkLabel.toLowerCase()}`;
  els.classPanel.hidden = !course.classEnrollmentEnabled;

  if (course.presentation.logoUrl) {
    els.startLogo.replaceChildren();
    const img = document.createElement("img");
    img.src = course.presentation.logoUrl;
    img.alt = "";
    els.startLogo.appendChild(img);
    els.startLogo.className = `course-logo course-logo--${course.presentation.logoAlign || "center"}`;
    els.startLogo.hidden = false;
  } else {
    els.startLogo.hidden = true;
    els.startLogo.replaceChildren();
  }

  els.startPowered.hidden = course.presentation.showPoweredBy === false;

  if (message) {
    els.startStatus.hidden = false;
    els.startStatus.textContent = message;
    els.startStatus.classList.remove("is-ok");
  } else {
    els.startStatus.hidden = true;
    els.startStatus.textContent = "";
  }
}

function renderHome() {
  if (!course || !session) return;
  applyPresentation(course);
  showView("home");

  els.title.textContent = course.title;
  els.description.textContent = course.description || "";
  els.description.style.whiteSpace = "pre-wrap";

  const pct = courseCompletionPercent(session, course.itemCount);
  els.progressFill.style.width = `${pct}%`;
  els.progressLabel.textContent =
    course.itemCount > 0
      ? `${pct}% complete · ${session.completedItemIds.length} of ${course.itemCount} items`
      : "No curriculum items yet";

  els.resume.hidden = false;

  const settings = course.settings || {};
  const linkLabel = settings.learningLinkLabel?.trim() || "Learning link";
  els.learningTitle.textContent = `Save your ${linkLabel.toLowerCase()}`;
  els.learningIntro.textContent =
    settings.learningLinkIntro?.trim() ||
    "Bookmark this page or copy your link below — your progress saves as you go.";

  els.resumeUrl.value = resumeUrlForSession(course, session);
  els.resumeStatus.hidden = true;

  const enriched = enrichItems();
  const certs = (session.earnedCertificates || [])
    .map((id) => enriched.find((i) => i.id === id))
    .filter(Boolean) as PublicCourseItem[];
  if (certs.length) {
    els.summary.hidden = false;
    els.certList.innerHTML = certs.map((c) => `<li>${escapeHtml(c.displayTitle || c.label)}</li>`).join("");
  } else {
    els.summary.hidden = true;
  }

  const badgeItems = enriched.filter((i) => i.moduleType === "badge" && !i.missing && !i.archived);
  const earnedBadgeIds = new Set(session.earnedBadges || []);
  if (badgeItems.length) {
    els.badges.hidden = false;
    els.badgeGrid.innerHTML = badgeItems
      .map((item) => {
        const earned = earnedBadgeIds.has(item.id);
        const art = item.badgeArtUrl || item.iconUrl;
        const title = escapeHtml(item.displayTitle || item.label);
        if (art) {
          return `<figure class="course-badge ${earned ? "course-badge--earned" : "course-badge--locked"}" title="${title}">
            <img src="${escapeAttr(art)}" alt="${title}" loading="lazy" />
            <figcaption>${title}</figcaption>
          </figure>`;
        }
        return `<figure class="course-badge course-badge--placeholder ${earned ? "course-badge--earned" : "course-badge--locked"}" title="${title}">
          <span aria-hidden="true">🏅</span>
          <figcaption>${title}</figcaption>
        </figure>`;
      })
      .join("");
  } else {
    els.badges.hidden = true;
  }

  els.complete.hidden = !session.completedAt;
  els.empty.hidden = course.itemCount > 0;
  els.sections.hidden = course.itemCount === 0;

  els.sections.innerHTML = course.sections.map((section) => renderSection(section, enriched)).join("");

  els.sections.querySelectorAll("[data-item-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.itemId;
      if (id) void openItem(id);
    });
  });
}

function applyItemLoadingPresentation() {
  if (!course) return;
  const p = course.presentation;
  els.itemLoading.style.setProperty("--course-loading-bg", p.backgroundHex || "#0a1628");
  els.itemLoadingText.textContent = p.loadingText?.trim() || "Course content loading";
  els.itemLoadingText.style.color = p.loadingTextHex || p.bodyHex || "#e8eef5";
  if (p.logoUrl) {
    els.itemLoadingLogo.src = p.logoUrl;
    els.itemLoadingLogo.hidden = false;
  } else {
    els.itemLoadingLogo.hidden = true;
    els.itemLoadingLogo.removeAttribute("src");
  }
}

function showItemLoading() {
  applyItemLoadingPresentation();
  els.itemLoading.hidden = false;
  if (itemLoadingFallbackTimer) window.clearTimeout(itemLoadingFallbackTimer);
  itemLoadingFallbackTimer = window.setTimeout(() => {
    hideItemLoading();
  }, 15000);
}

function hideItemLoading() {
  if (itemLoadingFallbackTimer) {
    window.clearTimeout(itemLoadingFallbackTimer);
    itemLoadingFallbackTimer = 0;
  }
  els.itemLoading.hidden = true;
  try {
    els.frame.contentWindow?.postMessage({ type: FLOW_CONTENT_REVEAL }, "*");
  } catch {
    /* ignore */
  }
}

function itemLaunchUrl(item: PublicCourseItem): string {
  if (!session || !course) return item.launchPath;
  let path = item.launchPath;
  if (item.kind === "video") return embedVideoUrl(path);
  if (!path.startsWith("http")) {
    path = `${window.location.origin}${path.startsWith("/") ? "" : "/"}${path}`;
  }
  const url = new URL(path);
  const relative = `${url.pathname}${url.search}`;
  const withCourse = appendCourseQuery(relative, {
    sessionId: session.sessionId,
    courseId: course.id,
    courseSlug: course.slug,
    itemId: item.id,
  });
  const finalUrl = new URL(`${url.origin}${withCourse}`);
  if (item.previewToken) {
    finalUrl.searchParams.set("previewToken", item.previewToken);
  }
  if (previewToken) {
    finalUrl.searchParams.set("coursePreviewToken", previewToken);
    finalUrl.searchParams.set("courseSlug", course.slug);
  }
  if (item.kind !== "experience") {
    finalUrl.searchParams.set("courseLastStep", "1");
  }
  if (item.kind === "experience" && course.presentation) {
    const p = course.presentation;
    finalUrl.searchParams.set("courseLoadingBg", p.backgroundHex || "#0a1628");
    finalUrl.searchParams.set("courseLoadingText", p.loadingText?.trim() || "Course content loading");
    finalUrl.searchParams.set("courseLoadingTextHex", p.loadingTextHex || p.bodyHex || "#e8eef5");
    if (p.logoUrl) finalUrl.searchParams.set("courseLoadingLogo", p.logoUrl);
  }
  return appendFlowDebugQuery(finalUrl.toString());
}

function updatePlayerFooter() {
  if (!activeItem) {
    els.markComplete.hidden = true;
    return;
  }
  if (activeItem.kind === "experience") {
    els.markComplete.hidden = !playerReady;
    els.markComplete.textContent = "Mark complete & continue";
    return;
  }
  els.markComplete.hidden = !playerReady;
  els.markComplete.textContent = "Mark complete & continue";
}

async function openItem(itemId: string) {
  const enriched = enrichItems();
  const item = enriched.find((i) => i.id === itemId);
  if (!item || !item.launchPath || item.missing || item.locked) return;
  activeItem = item;
  playerReady = false;
  updatePlayerFooter();
  await patchSession({ itemId, action: "visit" });

  showView("player");
  els.playerTitle.textContent = item.displayTitle || item.label;
  showItemLoading();
  els.frame.src = itemLaunchUrl(item);
}

async function completeActiveItem(outcomes: Record<string, unknown> = {}) {
  if (!activeItem) return;
  await patchSession({ itemId: activeItem.id, action: "complete", outcomes });
  activeItem = null;
  els.frame.src = "about:blank";
  renderHome();
}

async function copyResumeLink() {
  const url = els.resumeUrl.value.trim();
  if (!url) return;
  els.resumeStatus.hidden = false;
  try {
    await navigator.clipboard.writeText(url);
    els.resumeStatus.textContent = "Link copied to clipboard.";
  } catch {
    els.resumeUrl.focus();
    els.resumeUrl.select();
    els.resumeStatus.textContent = "Select the link above and copy it manually.";
  }
}

async function handleStartNew() {
  if (!course) return;
  els.startNew.setAttribute("disabled", "true");
  els.startStatus.hidden = true;
  try {
    establishSession(await startNewSession());
    renderHome();
  } catch (e) {
    renderStartScreen(e instanceof Error ? e.message : "Could not start course");
  } finally {
    els.startNew.removeAttribute("disabled");
  }
}

async function handleResumeSubmit() {
  if (!course) return;
  const token = parseResumeTokenInput(els.resumeInput.value);
  if (!token) {
    renderStartScreen("Paste your learning link to resume.");
    return;
  }
  els.resumeSubmit.setAttribute("disabled", "true");
  try {
    establishSession(await resumeWithToken(token));
    renderHome();
  } catch (e) {
    renderStartScreen(e instanceof Error ? e.message : "Learning link not found");
  } finally {
    els.resumeSubmit.removeAttribute("disabled");
  }
}

async function handleClassSubmit() {
  if (!course) return;
  const code = els.classInput.value.trim();
  if (!code) {
    renderStartScreen("Enter your class code.");
    return;
  }
  els.classSubmit.setAttribute("disabled", "true");
  try {
    establishSession(await joinWithClassCode(code));
    renderHome();
  } catch (e) {
    renderStartScreen(e instanceof Error ? e.message : "Invalid class code");
  } finally {
    els.classSubmit.removeAttribute("disabled");
  }
}

window.addEventListener("message", (ev) => {
  if (isExperienceContentReadyMessage(ev.data)) {
    hideItemLoading();
    return;
  }
  if (isExperienceStepChangedMessage(ev.data)) {
    if (!courseMessageMatchesActiveItem(ev.data)) return;
    if (ev.data.isLastFlowStep === true) return;
    hideCourseFooter();
    return;
  }
  if (isEndScreenReadyMessage(ev.data)) {
    flowDebug("course", "END_SCREEN_READY", ev.data as Record<string, unknown>);
    if (!courseMessageMatchesActiveItem(ev.data)) return;
    showCourseFooterIfLastStep(ev.data);
    return;
  }
  if (isCourseItemCompleteMessage(ev.data)) {
    flowDebug("course", "COURSE_ITEM_COMPLETE", ev.data as Record<string, unknown>);
    if (!courseMessageMatchesActiveItem(ev.data)) return;
    void completeActiveItem(ev.data.outcomes || {});
    return;
  }
  if (isStepEngagedMessage(ev.data)) {
    if (!courseMessageMatchesActiveItem(ev.data)) return;
    const moduleType = ev.data.moduleType || "";
    if (INTERACTIVE_FOOTER_MODULE_TYPES.has(moduleType)) {
      showCourseFooterIfLastStep(ev.data);
    }
    return;
  }
  if (isExperienceCompleteMessage(ev.data)) {
    flowDebug("course", "EXPERIENCE_COMPLETE", ev.data as Record<string, unknown>);
    if (!courseMessageMatchesActiveItem(ev.data)) return;
    showCourseFooter();
    return;
  }
  if (!isStepCompleteMessage(ev.data)) return;
  if (!courseMessageMatchesActiveItem(ev.data)) return;
  if (!ev.data.courseItemId) return;
  if (activeItem?.kind === "experience") return;
  showCourseFooter();
});

window.addEventListener("resize", () => {
  if (course) applyPresentation(course);
});

els.back.addEventListener("click", () => {
  activeItem = null;
  playerReady = false;
  els.frame.src = "about:blank";
  renderHome();
});

els.markComplete.addEventListener("click", () => void completeActiveItem());
els.copyLink.addEventListener("click", () => void copyResumeLink());
els.startNew.addEventListener("click", () => void handleStartNew());
els.resumeSubmit.addEventListener("click", () => void handleResumeSubmit());
els.classSubmit.addEventListener("click", () => void handleClassSubmit());
els.resumeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") void handleResumeSubmit();
});
els.classInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") void handleClassSubmit();
});

els.frame.addEventListener("load", () => {
  if (activeItem?.kind === "experience") return;
  hideItemLoading();
});

async function boot() {
  slug = getCourseSlug();
  previewToken = getPreviewToken();
  resumeToken = getResumeToken();
  if (new URLSearchParams(window.location.search).get("rngDebug") === "1") {
    flowDebugPanel("course", "debug enabled");
  }
  showView("loading");

  if (!slug) {
    showError("Missing course slug.");
    return;
  }

  try {
    course = await fetchCourse();

    if (resumeToken) {
      try {
        establishSession(await resumeWithToken(resumeToken));
        renderHome();
        return;
      } catch {
        renderStartScreen("That learning link could not be found. Start fresh or paste another link.");
        return;
      }
    }

    if (previewToken) {
      establishSession(await startNewSession());
      renderHome();
      return;
    }

    renderStartScreen();
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed to load course");
  }
}

void boot();
