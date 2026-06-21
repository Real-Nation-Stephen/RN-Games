import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@rngames/shared/track": resolve(__dirname, "../shared/src/track.ts"),
      "@rngames/shared": resolve(__dirname, "../shared/src/index.ts"),
    },
  },
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
        "quiz-present": resolve(__dirname, "quiz-present.html"),
        "quiz-present-lab": resolve(__dirname, "quiz-present-lab.html"),
        "quiz-join": resolve(__dirname, "quiz-join.html"),
        "quiz-leaderboard": resolve(__dirname, "quiz-leaderboard.html"),
        "quiz-kiosk": resolve(__dirname, "quiz-kiosk.html"),
        "flip-cards-dada-test": resolve(__dirname, "flip-cards-dada-test.html"),
        "flip-cards": resolve(__dirname, "flip-cards.html"),
        "pinboard-board": resolve(__dirname, "pinboard-board.html"),
        "pinboard-submit": resolve(__dirname, "pinboard-submit.html"),
        "pinboard-moderate": resolve(__dirname, "pinboard-moderate.html"),
        "pinboard-lab": resolve(__dirname, "pinboard-lab.html"),
        "leaderboard-board": resolve(__dirname, "leaderboard-board.html"),
        "leaderboard-moderate": resolve(__dirname, "leaderboard-moderate.html"),
        catch: resolve(__dirname, "catch.html"),
        runner: resolve(__dirname, "runner.html"),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8888",
      "/.netlify/functions": "http://127.0.0.1:8888",
    },
  },
});
