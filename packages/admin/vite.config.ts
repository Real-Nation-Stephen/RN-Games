import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "/admin/",
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:8888",
      "/.netlify": "http://127.0.0.1:8888",
      "/play": "http://127.0.0.1:5173",
    },
  },
});
