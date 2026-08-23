import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const KOMARI_TARGET =
    env.VITE_PROXY_TARGET ||
    process.env.VITE_PROXY_TARGET ||
    "https://v-ps.net";

  return {
    plugins: [reactRouter()],
    resolve: {
      tsconfigPaths: true,
    },
    css: {
      preprocessorOptions: {
        scss: {
          silenceDeprecations: ["legacy-js-api", "global-builtin", "import"],
        },
      },
    },
    server: {
      proxy: {
        "/api": {
          target: KOMARI_TARGET,
          changeOrigin: true,
          secure: true,
          ws: true,
          // Remote has cors_origin_check_enabled; strip browser Origin so POSTs aren't 403.
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq, req) => {
              const host = req.headers.host;
              const isLocal =
                /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host ?? "") ||
                /^\[::1\](?::\d+)?$/.test(host ?? "");
              const localOrigin = host ? `http://${host}` : null;

              proxyReq.removeHeader("origin");
              proxyReq.removeHeader("referer");
              proxyReq.setHeader("origin", isLocal && localOrigin ? localOrigin : KOMARI_TARGET);
              proxyReq.setHeader("referer", `${KOMARI_TARGET}/`);
            });
            proxy.on("proxyReqWs", (proxyReq, req) => {
              const host = req.headers.host;
              const isLocal =
                /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host ?? "") ||
                /^\[::1\](?::\d+)?$/.test(host ?? "");

              proxyReq.removeHeader("origin");
              proxyReq.setHeader(
                "origin",
                isLocal && host ? `http://${host}` : KOMARI_TARGET,
              );
            });
          },
        },
        // Site favicon from Komari host (matches production /favicon.ico)
        "/favicon.ico": {
          target: KOMARI_TARGET,
          changeOrigin: true,
          secure: true,
        },
      },
    },
    build: {
      outDir: "build/client",
    },
  };
});
