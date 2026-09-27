/** Distinct Carbon data hues for separately identified monitoring series. */
export const PING_TASK_COLORS = [
  "var(--cds-interactive)",
  "var(--carbon-data-down)",
  "var(--cds-support-warning)",
  "#6929c4",
  "#ff832b",
  "#ee5396",
] as const;

/**
 * Unified identity colors for the three Chinese ISPs across latency charts:
 * 电信 CT / 联通 CU / 移动 CM. Blue / red / neutral for quick scanning.
 */
export const ISP_COLORS: Record<"CT" | "CU" | "CM", string> = {
  CT: "var(--cds-interactive)", // 电信 — blue
  CU: "var(--cds-support-error)", // 联通 — red
  CM: "var(--carbon-data-down)", // 移动 — neutral
};

/** Upload / primary series */
export const COLOR_UP = "var(--cds-interactive)";
/** Download / secondary — neutral */
export const COLOR_DOWN = "var(--carbon-data-down)";

export function barToneClass(
  metric: "latency" | "loss",
  value: number | null,
): string {
  if (value == null) return "ping-bar__cell--empty";
  if (value < 0) return "ping-bar__cell--bad";
  if (metric === "latency") {
    if (value <= 60) return "ping-bar__cell--good";
    if (value <= 120) return "ping-bar__cell--ok";
    if (value <= 180) return "ping-bar__cell--fair";
    if (value <= 240) return "ping-bar__cell--slow";
    return "ping-bar__cell--bad";
  }
  if (value <= 1) return "ping-bar__cell--good";
  if (value <= 3) return "ping-bar__cell--ok";
  if (value <= 6) return "ping-bar__cell--fair";
  if (value <= 9) return "ping-bar__cell--slow";
  return "ping-bar__cell--bad";
}
