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
  const bytes = buffer instanceof Buffer ? buffer : Buffer.from(buffer);
  /** @netlify/blobs expects string | ArrayBuffer | Blob — not Uint8Array alone. */
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  await st.set(`file:${id}`, arrayBuffer);
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
