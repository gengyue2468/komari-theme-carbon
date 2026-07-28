import type { Config } from "@react-router/dev/config";

export default {
  ssr: false,
  // Keep client assets (fonts) after SPA pre-render build
  buildDirectory: "build",
} satisfies Config;
