import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "/report/",
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyDir: true,
  },
  server: {
    port: 5175,
    proxy: { "/api": "http://127.0.0.1:8888" },
  },
});
