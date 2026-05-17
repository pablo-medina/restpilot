import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig(({ mode }) => ({
  base: "./",
  clearScreen: false,
  server: {
    host: host ?? "127.0.0.1",
    port: 1420,
    strictPort: true
  },
  build: {
    target: ["chrome105", "safari13"],
    minify: mode !== "development",
    sourcemap: mode === "development"
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test-setup.ts"]
  }
}));
