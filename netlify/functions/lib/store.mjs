import { getStore } from "@netlify/blobs";

const NAME = "rngames-platform";

export async function blobStore() {
  return getStore({ name: NAME });
}
