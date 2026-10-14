import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 開発時に /api を転送する先。Docker Compose では backend サービス（http://backend:8000）を指定する
const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://localhost:8000";

// Docker で Windows のフォルダをマウントすると、ファイルの変更が通知されないので、
// VITE_USE_POLLING=true のときは定期的に確かめる方式（ポーリング）で変更を検出する
const usePolling = process.env.VITE_USE_POLLING === "true";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 開発時は /api へのリクエストを FastAPI に転送する
    proxy: {
      "/api": apiProxyTarget,
    },
    watch: usePolling ? { usePolling: true } : undefined,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
