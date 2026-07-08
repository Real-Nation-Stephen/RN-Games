import { appendCourseQuery, courseCompletionPercent } from "@rngames/shared";
import { isStepCompleteMessage } from "@rngames/shared";

type PublicCourseItem = {
  id: string;
  sectionId: string;
  sectionTitle: string;
  kind: "module" | "experience" | "video";
  label: string;
  launchPath: string;
  moduleType?: string;
  missing?: boolean;
  archived?: boolean;
};

type PublicCourse = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sections: { id: string; title: string; items: PublicCourseItem[] }[];
  items: PublicCourseItem[];
  itemCount: number;
};

type CourseSession = {
  sessionId: string;
  courseId: string;
  courseSlug: string;
  participantId: string;
  email?: string;
  resumeToken?: string;
  completedItemIds: string[];
  currentItemId: string | null;
  lastVisitedItemId: string | null;
  earnedCertificates: string[];
  outcomes?: Record<string, unknown>;
  completedAt?: string | null;
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

const els = {
  loading: document.getElementById("course-loading")!,
  error: document.getElementById("course-error")!,
  home: document.getElementById("course-home")!,
  player: document.getElementById("course-player")!,
  title: document.getElementById("course-title")!,
  description: document.getElementById("course-description")!,
  progressFill: document.getElementById("course-progress-fill")!,
  progressLabel: document.getElementById("course-progress-label")!,
  sections: document.getElementById("course-sections")!,
  resume: document.getElementById("course-resume")!,
  email: document.getElementById("course-email") as HTMLInputElement,
  saveEmail: document.getElementById("course-save-email")!,
  resumeLink: document.getElementById("course-resume-link")!,
  resumeStatus: document.getElementById("course-resume-status")!,
  summary: document.getElementById("course-summary")!,
  certList: document.getElementById("course-cert-list")!,
  complete: document.getElementById("course-complete")!,
  back: document.getElementById("course-back")!,
  playerTitle: document.getElementById("course-player-title")!,
  frame: document.getElementById("course-frame") as HTMLIFrameElement,
  markComplete: document.getElementById("course-mark-complete")!,
};

let course: PublicCourse | null = null;
let session: CourseSession | null = null;
let activeItem: PublicCourseItem | null = null;
let slug = "";
let previewToken = "";
let resumeToken = "";

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

function showError(msg: string) {
  els.loading.hidden = true;
  els.home.hidden = true;
  els.player.hidden = true;
  els.error.hidden = false;
  els.error.textContent = msg;
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
      return data.session as CourseSession;
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
  return data.session as CourseSession;
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
  session = data.session as CourseSession;
  saveSessionLocal(session);
}

function itemById(id: string | null | undefined): PublicCourseItem | undefined {
  return course?.items.find((i) => i.id === id);
}

function renderHome() {
  if (!course || !session) return;
  els.loading.hidden = true;
  els.error.hidden = true;
  els.home.hidden = false;
  els.player.hidden = true;

  els.title.textContent = course.title;
  els.description.textContent = course.description || "";

  const pct = courseCompletionPercent(session, course.itemCount);
  els.progressFill.style.width = `${pct}%`;
  els.progressLabel.textContent = `${pct}% complete · ${session.completedItemIds.length} of ${course.itemCount} items`;

  els.resume.hidden = false;
  if (session.email) els.email.value = session.email;

  const origin = window.location.origin;
  if (session.resumeToken) {
    els.resumeLink.hidden = false;
    els.resumeLink.textContent = `Resume link: ${origin}/course/${course.slug}?resumeToken=${session.resumeToken}`;
  } else {
    els.resumeLink.hidden = true;
  }

  const certs = session.earnedCertificates
    .map((id) => itemById(id))
    .filter(Boolean) as PublicCourseItem[];
  if (certs.length) {
    els.summary.hidden = false;
    els.certList.innerHTML = certs.map((c) => `<li>${c.label}</li>`).join("");
  } else {
    els.summary.hidden = true;
  }

  els.complete.hidden = !session.completedAt;

  els.sections.innerHTML = course.sections
    .map((section) => {
      const items = section.items
        .map((item) => {
          const done = session!.completedItemIds.includes(item.id);
          const current = session!.currentItemId === item.id;
          const disabled = item.missing || item.archived || !item.launchPath;
          return `
            <div class="course-item${done ? " is-complete" : ""}${current ? " is-current" : ""}">
              <div class="course-item-label">
                <div>${item.label}${done ? " ✓" : ""}</div>
                <div class="course-item-kind">${item.kind}${item.missing ? " · missing" : ""}${item.archived ? " · archived" : ""}</div>
              </div>
              <button type="button" class="course-btn course-btn-primary" data-item-id="${item.id}" ${disabled ? "disabled" : ""}>
                ${done ? "Review" : "Start"}
              </button>
            </div>
          `;
        })
        .join("");
      return `<section class="course-section"><h3>${section.title}</h3>${items || '<p class="course-muted">No items</p>'}</section>`;
    })
    .join("");

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
  return `${url.origin}${withCourse}`;
}

async function openItem(itemId: string) {
  const item = itemById(itemId);
  if (!item || !item.launchPath || item.missing) return;
  activeItem = item;
  await patchSession({ itemId, action: "visit" });

  els.home.hidden = true;
  els.player.hidden = false;
  els.playerTitle.textContent = item.label;
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
  session = patchData.session as CourseSession;
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
    els.resumeStatus.textContent = `Resume link emailed to ${email}.`;
  } else if (mailData.reason === "email_not_configured") {
    els.resumeStatus.textContent = "Email delivery is not configured on this site — copy the link below.";
  } else {
    els.resumeStatus.textContent = mailData.error || "Could not send email — copy the link below.";
  }

  renderHome();
}

window.addEventListener("message", (ev) => {
  if (!isStepCompleteMessage(ev.data)) return;
  if (ev.data.courseSessionId && session && ev.data.courseSessionId !== session.sessionId) return;
  void completeActiveItem(ev.data.outcomes || {});
});

els.back.addEventListener("click", () => {
  activeItem = null;
  els.frame.src = "about:blank";
  renderHome();
});

els.markComplete.addEventListener("click", () => void completeActiveItem());
els.saveEmail.addEventListener("click", () => void saveEmail());

async function boot() {
  slug = getCourseSlug();
  previewToken = getPreviewToken();
  resumeToken = getResumeToken();
  if (!slug) {
    showError("Missing course slug.");
    return;
  }

  try {
    course = await fetchCourse();
    session = await createOrResumeSession();
    saveSessionLocal(session);
    renderHome();
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed to load course");
  }
}

void boot();
