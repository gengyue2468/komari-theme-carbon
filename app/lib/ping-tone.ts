/** Distinct hues: blue / purple / amber / violet / orange / magenta */
export const PING_TASK_COLORS = [
  "var(--cds-interactive)",
  "#8a3ffc",
  "var(--cds-support-warning)",
  "#6929c4",
  "#ff832b",
  "#ee5396",
] as const;

/**
 * Unified identity colors for the three Chinese ISPs across latency charts:
 * 电信 CT / 联通 CU / 移动 CM. No green — 移动 uses purple.
 */
export const ISP_COLORS: Record<"CT" | "CU" | "CM", string> = {
  CT: "var(--cds-interactive)", // 电信 — blue
  CU: "var(--cds-support-error)", // 联通 — red
  CM: "#8a3ffc", // 移动 — purple
};

/** Upload / primary series */
export const COLOR_UP = "var(--cds-interactive)";
/** Download / secondary — purple, not near-blue support-info */
export const COLOR_DOWN = "#8a3ffc";

export function latencyToneClass(ms: number): string {
  if (ms <= 60) return "ping-tone--good";
  if (ms <= 100) return "ping-tone--ok";
  if (ms <= 180) return "ping-tone--fair";
  if (ms <= 260) return "ping-tone--slow";
  return "ping-tone--bad";
}

export function barToneClass(
  metric: "latency" | "loss",
  value: number | null,
): string {
  if (value == null) return "ping-bar__cell--empty";
  if (metric === "latency") {
    if (value <= 60) return "ping-bar__cell--good";
    if (value <= 100) return "ping-bar__cell--ok";
    if (value <= 160) return "ping-bar__cell--fair";
    if (value <= 200) return "ping-bar__cell--slow";
    return "ping-bar__cell--bad";
  }
  if (value <= 1) return "ping-bar__cell--good";
  if (value <= 3) return "ping-bar__cell--ok";
  if (value <= 6) return "ping-bar__cell--fair";
  if (value <= 9) return "ping-bar__cell--slow";
  return "ping-bar__cell--bad";
}
