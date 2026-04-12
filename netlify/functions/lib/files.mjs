import { randomUUID } from "node:crypto";
import { blobStore } from "./store.mjs";

/**
 * @param {Buffer | Uint8Array} buffer
 * @param {string} contentType
 * @returns {Promise<string>} opaque file id
 */
export async function saveBinary(buffer, contentType) {
  const id = randomUUID();
  const st = await blobStore();
  const u8 = buffer instanceof Buffer ? new Uint8Array(buffer) : buffer;
  await st.set(`file:${id}`, u8);
  await st.setJSON(`filemeta:${id}`, {
    contentType: contentType || "application/octet-stream",
  });
  return id;
}

/**
 * @returns {Promise<{ body: ArrayBuffer; contentType: string } | null>}
 */
export async function loadBinary(id) {
  const st = await blobStore();
  const meta = await st.get(`filemeta:${id}`, { type: "json" });
  const raw = await st.get(`file:${id}`, { type: "arrayBuffer" });
  if (!raw) return null;
  return {
    body: raw,
    contentType: (meta && meta.contentType) || "application/octet-stream",
  };
}
