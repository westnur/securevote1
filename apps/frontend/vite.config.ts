/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)); // correct on Windows too

/**
 * Adds a Content-Security-Policy to the PRODUCTION build only (the dev server needs
 * inline scripts for hot reload). connect-src allows the API (same origin) and the
 * local Hardhat RPC endpoint.
 */
function cspPlugin(rpcOrigins: string): Plugin {
  return {
    name: "securevote-csp",
    apply: "build",
    transformIndexHtml(html) {
      const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        `connect-src 'self' ${rpcOrigins}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; ");
      return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ROOT, "");
  const api = `http://127.0.0.1:${env.PORT || 4000}`;
  const rpc = env.PUBLIC_RPC_URL || env.RPC_URL || "http://127.0.0.1:8545";
  const rpcOrigins = [...new Set([new URL(rpc).origin, "http://127.0.0.1:8545", "http://localhost:8545"])].join(" ");
  return {
    envDir: ROOT, // single .env at the repository root; only VITE_* variables reach the bundle
    plugins: [react(), tailwindcss(), cspPlugin(rpcOrigins)],
    server: {
      host: "localhost",
      port: 5173,
      strictPort: true,
      proxy: { "/api": { target: api, changeOrigin: false } },
    },
    preview: {
      host: "localhost",
      port: 4173,
      strictPort: true,
      proxy: { "/api": { target: api, changeOrigin: false } },
    },
    build: { sourcemap: false, chunkSizeWarningLimit: 1200 },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      css: false,
    },
  };
});
