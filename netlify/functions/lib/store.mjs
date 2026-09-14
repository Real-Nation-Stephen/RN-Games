import { getRuntimeStore, platformStoreName } from "./blob-runtime.mjs";

export async function blobStore() {
  return getRuntimeStore(platformStoreName());
}
