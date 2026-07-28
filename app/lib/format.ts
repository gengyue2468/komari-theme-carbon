import i18n from "~/i18n";

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${(bytes / k ** i).toFixed(decimals)} ${sizes[i]}`;
}

export function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(i18n.t("time.days", { count: d }));
  if (h > 0) parts.push(i18n.t("time.hours", { count: h }));
  if (m > 0 || parts.length === 0) {
    parts.push(i18n.t("time.minutes", { count: m }));
  }
  return parts.join(" ");
}

export function formatUptime(seconds: number): string {
  return formatDuration(seconds);
}

/** Komari uses far-future dates (e.g. 2226) to mean never expires. */
const NEVER_EXPIRE_YEAR = 2099;
const NEVER_EXPIRE_DAYS = 36500;

export function isNeverExpire(expiredAt: string | null | undefined): boolean {
  if (!expiredAt) return true;
  const exp = new Date(expiredAt);
  if (!Number.isFinite(exp.getTime())) return false;
  if (exp.getUTCFullYear() >= NEVER_EXPIRE_YEAR) return true;
  const days = (exp.getTime() - Date.now()) / 86400000;
  return days >= NEVER_EXPIRE_DAYS;
}

/** Remaining time until expired_at (ISO), day precision only. */
export function formatRemainTime(expiredAt: string | null | undefined): string {
  if (isNeverExpire(expiredAt)) return i18n.t("detail.never");
  const exp = new Date(expiredAt!).getTime();
  if (!Number.isFinite(exp)) return "—";
  const diffSec = Math.floor((exp - Date.now()) / 1000);
  if (diffSec <= 0) return i18n.t("detail.expired");
  const days = Math.max(1, Math.ceil(diffSec / 86400));
  return i18n.t("time.days", { count: days });
}

export function percentOf(used: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, (used / total) * 100));
}

/**
 * Traffic used bytes per Komari traffic_limit_type:
 * max | sum | up | down (default max).
 */
export function trafficUsedBytes(
  totalUp: number,
  totalDown: number,
  limitType?: string | null,
): number {
  const up = totalUp || 0;
  const down = totalDown || 0;
  switch ((limitType || "max").toLowerCase()) {
    case "sum":
      return up + down;
    case "up":
      return up;
    case "down":
      return down;
    case "max":
    default:
      return Math.max(up, down);
  }
}

export function parseTags(tags: string): string[] {
  if (!tags.trim()) return [];
  return tags
    .split(/[;,|]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Coerce managed theme_settings that may arrive as strings. */
export function asNumber(
  raw: unknown,
  fallback: number,
  min?: number,
  max?: number,
): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  let v = n;
  if (min != null) v = Math.max(min, v);
  if (max != null) v = Math.min(max, v);
  return v;
}
