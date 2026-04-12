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
