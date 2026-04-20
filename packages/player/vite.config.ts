import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname),
  /** Must match `dist/play/` in assemble-dist so `/slug` routes still load `/play/assets/*`. */
  base: "/play/",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        scratcher: resolve(__dirname, "scratcher.html"),
        "scratcher-embed": resolve(__dirname, "scratcher-embed.html"),
        "scratcher-test-1x1": resolve(__dirname, "scratcher-test-1x1.html"),
        "scratcher-test-9x16": resolve(__dirname, "scratcher-test-9x16.html"),
        "scratcher-test-4x3": resolve(__dirname, "scratcher-test-4x3.html"),
        "quiz-host": resolve(__dirname, "quiz-host.html"),
        "quiz-join": resolve(__dirname, "quiz-join.html"),
        "quiz-leaderboard": resolve(__dirname, "quiz-leaderboard.html"),
        "flip-cards-dada-test": resolve(__dirname, "flip-cards-dada-test.html"),
        "flip-cards": resolve(__dirname, "flip-cards.html"),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8888",
    },
  },
});
