import { blobStore } from "./store.mjs";

const INDEX_KEY = "wheels-index";

/** @returns {Promise<{ id: string; slug: string; title: string; clientName: string; updatedAt: string; reportingEnabled: boolean; thumbnailUrl?: string }[]>} */
export async function readIndex() {
  const st = await blobStore();
  const raw = await st.get(INDEX_KEY, { type: "json" });
  if (!raw || !Array.isArray(raw.list)) return [];
  return raw.list;
}

export async function writeIndex(list) {
  const st = await blobStore();
  await st.setJSON(INDEX_KEY, { list, updatedAt: new Date().toISOString() });
}

export async function getWheelJson(id) {
  const st = await blobStore();
  return st.get(`wheel:${id}`, { type: "json" });
}

export async function setWheelJson(id, data) {
  const st = await blobStore();
  await st.setJSON(`wheel:${id}`, data);
}

export async function deleteWheelBlob(id) {
  const st = await blobStore();
  await st.delete(`wheel:${id}`);
}

export async function getPinboardStateJson(wheelId) {
  const st = await blobStore();
  const raw = await st.get(`pinboard-state:${wheelId}`, { type: "json" });
  if (!raw) {
    return { version: 1, wheelId, submissions: [], boardClearedAt: null };
  }
  return {
    version: 1,
    wheelId,
    submissions: Array.isArray(raw.submissions) ? raw.submissions : [],
    boardClearedAt: raw.boardClearedAt ?? null,
  };
}

export async function setPinboardStateJson(wheelId, data) {
  const st = await blobStore();
  await st.setJSON(`pinboard-state:${wheelId}`, data);
}

export async function deletePinboardStateBlob(wheelId) {
  const st = await blobStore();
  await st.delete(`pinboard-state:${wheelId}`);
}

export async function getLeaderboardStateJson(wheelId) {
  const st = await blobStore();
  const raw = await st.get(`leaderboard-state:${wheelId}`, { type: "json" });
  if (!raw) {
    return { version: 1, wheelId, revision: 0, panOffset: 0, entries: [], clearedAt: null };
  }
  return {
    version: 1,
    wheelId,
    revision: Number(raw.revision) || 0,
    panOffset: Number(raw.panOffset) || 0,
    entries: Array.isArray(raw.entries) ? raw.entries : [],
    clearedAt: raw.clearedAt ?? null,
  };
}

export async function setLeaderboardStateJson(wheelId, data) {
  const st = await blobStore();
  await st.setJSON(`leaderboard-state:${wheelId}`, data);
}

export async function deleteLeaderboardStateBlob(wheelId) {
  const st = await blobStore();
  await st.delete(`leaderboard-state:${wheelId}`);
}

const EXPERIENCES_INDEX_KEY = "experiences-index";

export async function readExperiencesIndex() {
  const st = await blobStore();
  const raw = await st.get(EXPERIENCES_INDEX_KEY, { type: "json" });
  if (!raw || !Array.isArray(raw.list)) return [];
  return raw.list;
}

export async function writeExperiencesIndex(list) {
  const st = await blobStore();
  await st.setJSON(EXPERIENCES_INDEX_KEY, { list, updatedAt: new Date().toISOString() });
}

export async function getExperienceJson(id) {
  const st = await blobStore();
  return st.get(`experience:${id}`, { type: "json" });
}

export async function setExperienceJson(id, data) {
  const st = await blobStore();
  await st.setJSON(`experience:${id}`, data);
}

export async function deleteExperienceBlob(id) {
  const st = await blobStore();
  await st.delete(`experience:${id}`);
}

export async function getExperienceSessionJson(sessionId) {
  const st = await blobStore();
  return st.get(`experience-session:${sessionId}`, { type: "json" });
}

export async function setExperienceSessionJson(sessionId, data) {
  const st = await blobStore();
  await st.setJSON(`experience-session:${sessionId}`, data);
}

export async function deleteExperienceSessionJson(sessionId) {
  const st = await blobStore();
  await st.delete(`experience-session:${sessionId}`);
}

const COURSES_INDEX_KEY = "courses-index";

export async function readCoursesIndex() {
  const st = await blobStore();
  const raw = await st.get(COURSES_INDEX_KEY, { type: "json" });
  if (!raw || !Array.isArray(raw.list)) return [];
  return raw.list;
}

export async function writeCoursesIndex(list) {
  const st = await blobStore();
  await st.setJSON(COURSES_INDEX_KEY, { list, updatedAt: new Date().toISOString() });
}

export async function getCourseJson(id) {
  const st = await blobStore();
  return st.get(`course:${id}`, { type: "json" });
}

export async function setCourseJson(id, data) {
  const st = await blobStore();
  await st.setJSON(`course:${id}`, data);
}

export async function deleteCourseBlob(id) {
  const st = await blobStore();
  await st.delete(`course:${id}`);
}

export async function getCourseSessionJson(sessionId) {
  const st = await blobStore();
  return st.get(`course-session:${sessionId}`, { type: "json" });
}

export async function setCourseSessionJson(sessionId, data) {
  const st = await blobStore();
  await st.setJSON(`course-session:${sessionId}`, data);
}

export async function getCourseResumeIndex(resumeToken) {
  const st = await blobStore();
  return st.get(`course-resume:${resumeToken}`, { type: "json" });
}

export async function setCourseResumeIndex(resumeToken, data) {
  const st = await blobStore();
  await st.setJSON(`course-resume:${resumeToken}`, data);
}

export async function getCourseEmailIndex(courseSlug, email) {
  const st = await blobStore();
  return st.get(`course-email:${courseSlug}:${email}`, { type: "json" });
}

export async function setCourseEmailIndex(courseSlug, email, data) {
  const st = await blobStore();
  await st.setJSON(`course-email:${courseSlug}:${email}`, data);
}

export async function getFormSubmissionsJson(formId) {
  const st = await blobStore();
  const raw = await st.get(`form-submissions:${formId}`, { type: "json" });
  if (!raw) return { version: 1, formId, submissions: [] };
  return {
    version: 1,
    formId,
    submissions: Array.isArray(raw.submissions) ? raw.submissions : [],
  };
}

export async function setFormSubmissionsJson(formId, data) {
  const st = await blobStore();
  await st.setJSON(`form-submissions:${formId}`, data);
}

export async function getPollStateJson(landingId, blockId) {
  const st = await blobStore();
  const raw = await st.get(`poll-state:${landingId}:${blockId}`, { type: "json" });
  if (!raw) {
    return { version: 1, landingId, blockId, tallies: {}, ballots: [], clearedAt: null };
  }
  return {
    version: 1,
    landingId,
    blockId,
    tallies: raw.tallies && typeof raw.tallies === "object" ? raw.tallies : {},
    ballots: Array.isArray(raw.ballots) ? raw.ballots : [],
    clearedAt: raw.clearedAt ?? null,
  };
}

export async function setPollStateJson(landingId, blockId, data) {
  const st = await blobStore();
  await st.setJSON(`poll-state:${landingId}:${blockId}`, data);
}
