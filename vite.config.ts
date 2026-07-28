import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

const KOMARI_TARGET = process.env.VITE_PROXY_TARGET || "https://st.gy.run";

export default defineConfig({
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
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.removeHeader("origin");
            proxyReq.removeHeader("referer");
            proxyReq.setHeader("origin", KOMARI_TARGET);
            proxyReq.setHeader("referer", `${KOMARI_TARGET}/`);
          });
          proxy.on("proxyReqWs", (proxyReq) => {
            proxyReq.removeHeader("origin");
            proxyReq.setHeader("origin", KOMARI_TARGET);
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
});
