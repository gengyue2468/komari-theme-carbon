import type { Locale } from "@carbon/charts";

/**
 * Carbon-charts Locale: localizes number/date/time formatting plus the
 * tooltip's built-in "Group"/"Total" labels so every chart reads in the
 * current UI language.
 */
export interface ChartLocaleTranslations {
  group: string;
  total: string;
}

export function buildChartLocale(
  language: string,
  translations: ChartLocaleTranslations,
): Locale {
  return {
    code: language,
    number: (value: number) => new Intl.NumberFormat(language).format(value),
    date: (value: Date, _language: string, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(language, options).format(value),
    time: (value: Date, _language: string, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(language, options).format(value),
    translations,
  };
}

/**
 * One time format for the tooltip date row so charts never disagree:
 * "MM-DD HH:mm" (localized). Axis ticks keep Carbon's adaptive auto-format.
 */
const CHART_TIME_OPTS: Intl.DateTimeFormatOptions = {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
};

export function formatChartTime(
  language: string,
  value: Date | number | string,
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value ?? "");
  return new Intl.DateTimeFormat(language, CHART_TIME_OPTS).format(d);
}

/**
 * Tooltip value formatter. Carbon applies this to EVERY row, including the
 * title row holding the hovered timestamp — so Date values must be routed to
 * the shared time format, otherwise each chart shows a different date string.
 * `formatNumber` supplies the per-chart unit (%, rate, ms, …).
 */
export function makeTooltipValueFormatter(
  language: string,
  formatNumber: (value: number) => string,
): (value: unknown, label: string) => string {
  return (value) => {
    if (value instanceof Date) return formatChartTime(language, value);
    if (typeof value === "number" && Number.isFinite(value)) {
      return formatNumber(value);
    }
    // ISO strings (dates) get the shared format; anything else (group names…)
    // passes through unchanged.
    if (typeof value === "string") return formatChartTime(language, value);
    return String(value ?? "");
  };
}
