import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Paths the Express server owns. In dev they proxy to it; in production
// CloudFront routes them to Lambda instead of the SPA bucket.
const SERVER_PATHS = ["/api", "/auth", "/logout", "/uploads", "/invite", "/og"];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      SERVER_PATHS.map((p) => [p, { target: "http://localhost:8080", changeOrigin: true }]),
    ),
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
