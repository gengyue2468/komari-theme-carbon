import type { Config } from "@react-router/dev/config";

export default {
  ssr: false,
  // This theme is a client-only SPA. Do not run the server/prerender phase
  // during builds; it cannot reach the user's Komari API at build time.
  prerender: false,
  buildDirectory: "build",
} satisfies Config;
