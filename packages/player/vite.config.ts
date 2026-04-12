import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname),
  /** Must match `dist/play/` in assemble-dist so `/slug` routes still load `/play/assets/*`. */
  base: "/play/",
  publicDir: false,
  build: {
    outDir: "dist",
    emptyDir: true,
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8888",
    },
  },
});
