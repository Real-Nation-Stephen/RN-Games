import {
  appendCourseQuery,
  courseCompletionPercent,
  isExperienceCompleteMessage,
  isStepCompleteMessage,
  sectionUnlockState,
  isCourseItemAccessible,
  type PublicCourse,
  type PublicCourseItem,
  type PublicCourseSection,
  type CourseSession,
  type CoursePresentation,
} from "@rngames/shared";

const els = {
  loading: document.getElementById("course-loading")!,
  error: document.getElementById("course-error")!,
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
  email: document.getElementById("course-email") as HTMLInputElement,
  saveEmail: document.getElementById("course-save-email")!,
  ackWrap: document.getElementById("course-learning-ack-wrap")!,
  ack: document.getElementById("course-learning-ack") as HTMLInputElement,
  ackText: document.getElementById("course-learning-ack-text")!,
  resumeLink: document.getElementById("course-resume-link")!,
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
  markComplete: document.getElementById("course-mark-complete")!,
};

let course: PublicCourse | null = null;
let session: CourseSession | null = null;
let activeItem: PublicCourseItem | null = null;
let playerReady = false;
let slug = "";
let previewToken = "";
let resumeToken = "";

const KIND_ICON: Record<PublicCourseItem["kind"], string> = {
  module: "🎮",
  experience: "✨",
  video: "▶️",
};

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

type View = "loading" | "error" | "home" | "player";

function showView(view: View) {
  els.loading.hidden = view !== "loading";
  els.error.hidden = view !== "error";
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

async function createOrResumeSession(): Promise<CourseSession> {
  if (resumeToken) {
    const res = await fetch("/api/course-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeToken, slug }),
    });
    if (res.ok) {
      const data = await res.json();
      return normalizeSession(data.session as CourseSession);
    }
  }

  const saved = loadSessionLocal();
  const res = await fetch("/api/course-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug,
      previewToken: previewToken || undefined,
      sessionId: saved?.sessionId,
      participantId: saved?.participantId,
    }),
  });
  if (!res.ok) throw new Error("Could not start course session");
  const data = await res.json();
  return normalizeSession(data.session as CourseSession);
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
              <p class="course-item-title">${escapeHtml(title)}${done ? " ✓" : ""}</p>
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
  if (session.email) els.email.value = session.email;

  const settings = course.settings || {};
  const linkLabel = settings.learningLinkLabel?.trim() || "Learning link";
  els.learningTitle.textContent = `Save your ${linkLabel.toLowerCase()}`;
  els.learningIntro.textContent =
    settings.learningLinkIntro?.trim() ||
    "Enter your email to receive your learning link so you can return and pick up where you left off.";
  els.saveEmail.textContent = `Email ${linkLabel.toLowerCase()}`;

  const requireAck = settings.learningLinkRequireAcknowledgement !== false;
  els.ackWrap.hidden = !requireAck;
  if (requireAck) {
    els.ack.checked = false;
    const ackCopy = settings.learningLinkAcknowledgementText?.trim() || "";
    const privacyUrl = settings.learningLinkPrivacyUrl?.trim();
    if (privacyUrl) {
      els.ackText.innerHTML = `${escapeHtml(ackCopy)} <a href="${escapeAttr(privacyUrl)}" target="_blank" rel="noreferrer">Privacy policy</a>`;
    } else {
      els.ackText.textContent = ackCopy;
    }
  }

  const origin = window.location.origin;
  if (session.resumeToken) {
    els.resumeLink.hidden = false;
    els.resumeLink.textContent = `${linkLabel}: ${origin}/course/${course.slug}?resumeToken=${session.resumeToken}`;
  } else {
    els.resumeLink.hidden = true;
  }

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
  return finalUrl.toString();
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
  els.frame.src = itemLaunchUrl(item);
}

async function completeActiveItem(outcomes: Record<string, unknown> = {}) {
  if (!activeItem) return;
  await patchSession({ itemId: activeItem.id, action: "complete", outcomes });
  activeItem = null;
  els.frame.src = "about:blank";
  renderHome();
}

async function saveEmail() {
  const email = els.email.value.trim();
  if (!email || !session || !course) return;

  const settings = course.settings || {};
  if (settings.learningLinkRequireAcknowledgement !== false && !els.ack.checked) {
    els.resumeStatus.hidden = false;
    els.resumeStatus.textContent = "Please confirm how we will use your email.";
    return;
  }

  els.resumeStatus.hidden = false;
  els.resumeStatus.textContent = "Saving…";

  const patchRes = await fetch("/api/course-session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: session.sessionId, email }),
  });
  if (!patchRes.ok) {
    els.resumeStatus.textContent = "Could not save email.";
    return;
  }
  const patchData = await patchRes.json();
  session = normalizeSession(patchData.session as CourseSession);
  saveSessionLocal(session);

  const resumeUrl = session.resumeToken
    ? `${window.location.origin}/course/${course.slug}?resumeToken=${session.resumeToken}`
    : `${window.location.origin}/course/${course.slug}`;

  const mailRes = await fetch("/api/course-resume-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      sessionId: session.sessionId,
      resumeUrl,
    }),
  });
  const mailData = await mailRes.json().catch(() => ({}));

  if (mailRes.ok && mailData.sent) {
    const linkLabel = course.settings?.learningLinkLabel?.trim() || "Learning link";
    els.resumeStatus.textContent = `Your ${linkLabel.toLowerCase()} was emailed to ${email}.`;
  } else if (mailData.reason === "email_not_configured") {
    els.resumeStatus.textContent = "Email delivery is not configured on this site — copy the link below.";
  } else {
    els.resumeStatus.textContent = mailData.error || "Could not send email — copy the link below.";
  }

  renderHome();
}

window.addEventListener("message", (ev) => {
  if (isExperienceCompleteMessage(ev.data)) {
    if (ev.data.courseSessionId && session && ev.data.courseSessionId !== session.sessionId) return;
    if (ev.data.courseItemId && activeItem && ev.data.courseItemId !== activeItem.id) return;
    if (!activeItem || activeItem.kind !== "experience") return;
    playerReady = true;
    updatePlayerFooter();
    return;
  }
  if (!isStepCompleteMessage(ev.data)) return;
  if (ev.data.courseSessionId && session && ev.data.courseSessionId !== session.sessionId) return;
  if (ev.data.courseItemId && activeItem && ev.data.courseItemId !== activeItem.id) return;
  if (!ev.data.courseItemId) return;
  if (activeItem?.kind === "experience") return;
  playerReady = true;
  updatePlayerFooter();
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
els.saveEmail.addEventListener("click", () => void saveEmail());

async function boot() {
  slug = getCourseSlug();
  previewToken = getPreviewToken();
  resumeToken = getResumeToken();
  showView("loading");

  if (!slug) {
    showError("Missing course slug.");
    return;
  }

  try {
    course = await fetchCourse();
    session = normalizeSession(await createOrResumeSession());
    saveSessionLocal(session);
    renderHome();
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed to load course");
  }
}

void boot();
