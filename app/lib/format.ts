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

/**
 * Billing cycle (days) → semantic label, matching Komari's renewal mapping
 * (27–32=month, 87–95=quarter, 175–185=half-year, 360–370=year, …).
 * Non-positive cycles (e.g. -1) mean a one-time / lifetime price → "一次性/Once".
 */
export function formatBillingCycle(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return i18n.t("billing.once");
  if (days >= 27 && days <= 32) return i18n.t("billing.monthly");
  if (days >= 87 && days <= 95) return i18n.t("billing.quarterly");
  if (days >= 175 && days <= 185) return i18n.t("billing.semiannual");
  if (days >= 360 && days <= 370) return i18n.t("billing.yearly");
  if (days >= 720 && days <= 750) return i18n.t("billing.biennial");
  if (days >= 1080 && days <= 1150) return i18n.t("billing.triennial");
  if (days >= 1800 && days <= 1850) return i18n.t("time.years", { count: 5 });
  return i18n.t("time.days", { count: days });
}

/** Komari uses far-future dates (e.g. 2226) to mean never expires.
 *  Spec: an expiry more than 100 years in the future is treated as permanent. */
const NEVER_EXPIRE_DAYS = 36500;

export function isNeverExpire(expiredAt: string | null | undefined): boolean {
  if (!expiredAt) return true;
  const exp = new Date(expiredAt);
  if (!Number.isFinite(exp.getTime())) return false;
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
 * sum (双向) | max (取大) | min (取小) | up (出站) | down (入站). Default max.
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
    case "min":
      return Math.min(up, down);
    case "up":
      return up;
    case "down":
      return down;
    case "max":
    default:
      return Math.max(up, down);
  }
}

/** Localized label for Komari traffic_limit_type (max/sum/min/up/down). */
export function trafficLimitTypeLabel(limitType?: string | null): string {
  switch ((limitType || "max").toLowerCase()) {
    case "sum":
      return i18n.t("trafficType.sum");
    case "min":
      return i18n.t("trafficType.min");
    case "up":
      return i18n.t("trafficType.up");
    case "down":
      return i18n.t("trafficType.down");
    default:
      return i18n.t("trafficType.max");
  }
}

/**
 * Billing cycle (days) → number of calendar months, matching Komari's renewal
 * mapping (27–32→1, 87–95→3, 175–185→6, 360–370→12, …). Used for monthly cost.
 * Falls back to days/30 for non-standard cycles. 0 for non-positive cycles.
 */
export function billingCycleMonths(days: number): number {
  if (!Number.isFinite(days) || days <= 0) return 0;
  if (days >= 27 && days <= 32) return 1;
  if (days >= 87 && days <= 95) return 3;
  if (days >= 175 && days <= 185) return 6;
  if (days >= 360 && days <= 370) return 12;
  if (days >= 720 && days <= 750) return 24;
  if (days >= 1080 && days <= 1150) return 36;
  if (days >= 1800 && days <= 1850) return 60;
  return days / 30;
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
