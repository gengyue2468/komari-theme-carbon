export const PING_TASK_COLORS = [
  "var(--cds-interactive)",
  "var(--cds-support-info)",
  "var(--cds-support-warning)",
  "#8a3ffc",
  "#ff832b",
  "#ee5396",
] as const;

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
