import { isNeverExpire } from "~/lib/format";
import type { NodeInfo } from "~/types/komari";

const FINANCE_CURRENCY_CONFIG = {
  AUD: { rate: 0.20941, symbol: "A$" },
  BRL: { rate: 0.74734, symbol: "R$" },
  CAD: { rate: 0.20691, symbol: "C$" },
  CHF: { rate: 0.11746, symbol: "CHF" },
  CNY: { rate: 1, symbol: "¥" },
  CZK: { rate: 3.0787, symbol: "Kč" },
  DKK: { rate: 0.95296, symbol: "kr" },
  EUR: { rate: 0.1275, symbol: "€" },
  GBP: { rate: 0.11027, symbol: "£" },
  HKD: { rate: 1.1594, symbol: "$" },
  HUF: { rate: 44.688, symbol: "Ft" },
  IDR: { rate: 2622.37, symbol: "Rp" },
  INR: { rate: 14.0178, symbol: "₹" },
  JPY: { rate: 23.707, symbol: "¥" },
  KRW: { rate: 224.11, symbol: "₩" },
  KZT: { rate: 64, symbol: "₸" },
  MYR: { rate: 0.59945, symbol: "RM" },
  NOK: { rate: 1.4096, symbol: "kr" },
  NZD: { rate: 0.2535, symbol: "NZ$" },
  PHP: { rate: 8.9288, symbol: "₱" },
  PLN: { rate: 0.54138, symbol: "zł" },
  RUB: { rate: 11.9, symbol: "₽" },
  SEK: { rate: 1.3895, symbol: "kr" },
  SGD: { rate: 0.18975, symbol: "S$" },
  THB: { rate: 4.8172, symbol: "฿" },
  TRY: { rate: 6.849, symbol: "₺" },
  UAH: { rate: 3.6, symbol: "₴" },
  USD: { rate: 0.14799, symbol: "$" },
  VND: { rate: 3500, symbol: "₫" },
  ZAR: { rate: 2.3995, symbol: "R" },
} as const;

export type CurrencyCode = keyof typeof FINANCE_CURRENCY_CONFIG;
export type ExchangeRates = Record<CurrencyCode, number>;

export const DISPLAY_CURRENCIES = [
  "CNY",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "HKD",
  "KRW",
  "RUB",
  "SGD",
  "AUD",
  "CAD",
  "CHF",
  "THB",
  "VND",
  "MYR",
  "INR",
] as const satisfies readonly CurrencyCode[];

export const DEFAULT_EXCHANGE_RATES = Object.fromEntries(
  Object.entries(FINANCE_CURRENCY_CONFIG).map(([c, cfg]) => [c, cfg.rate]),
) as ExchangeRates;

export const CURRENCY_SYMBOLS = Object.fromEntries(
  Object.entries(FINANCE_CURRENCY_CONFIG).map(([c, cfg]) => [c, cfg.symbol]),
) as Record<CurrencyCode, string>;

const CACHE_KEY = "komari_finance_rates_cny_v1";
const MS_DAY = 86_400_000;
const MONTH_DAYS = 30;
const FIN_CURRENCY_KEY = "fin_currency";

const ALIASES: Record<string, CurrencyCode> = {
  $: "USD",
  US$: "USD",
  RMB: "CNY",
  "￥": "CNY",
  "¥": "CNY",
  "€": "EUR",
  "£": "GBP",
};

export function normalizeCurrency(currency?: string | null): CurrencyCode {
  const v = String(currency || "CNY").trim().toUpperCase();
  if (v in FINANCE_CURRENCY_CONFIG) return v as CurrencyCode;
  return ALIASES[v] || ALIASES[String(currency || "").trim()] || "CNY";
}

export function getStoredFinanceCurrency(): CurrencyCode {
  try {
    return normalizeCurrency(localStorage.getItem(FIN_CURRENCY_KEY) || "CNY");
  } catch {
    return "CNY";
  }
}

export function setStoredFinanceCurrency(c: CurrencyCode) {
  try {
    localStorage.setItem(FIN_CURRENCY_KEY, c);
  } catch {
    // ignore
  }
}

function priceToCny(node: NodeInfo, rates: ExchangeRates): number {
  const price = Number(node.price);
  if (!Number.isFinite(price) || price <= 0) return 0;
  const cur = normalizeCurrency(node.currency);
  if (cur === "CNY") return price;
  const rate = rates[cur] || DEFAULT_EXCHANGE_RATES[cur] || 1;
  return price / rate;
}

export function calcTotalValueCny(
  nodes: NodeInfo[],
  rates: ExchangeRates,
): number {
  return nodes.reduce((sum, n) => sum + priceToCny(n, rates), 0);
}

export function calcMonthlyCny(nodes: NodeInfo[], rates: ExchangeRates): number {
  return nodes.reduce((sum, n) => {
    const p = priceToCny(n, rates);
    if (p <= 0) return sum;
    const cycle = Number(n.billing_cycle);
    if (!Number.isFinite(cycle) || cycle <= 0) return sum;
    return sum + (p / cycle) * MONTH_DAYS;
  }, 0);
}

export function calcRemainingCny(
  nodes: NodeInfo[],
  rates: ExchangeRates,
  now = new Date(),
): number {
  return nodes.reduce((sum, n) => {
    if (isNeverExpire(n.expired_at)) return sum;
    const p = priceToCny(n, rates);
    if (p <= 0) return sum;
    const exp = new Date(n.expired_at!).getTime();
    if (!Number.isFinite(exp)) return sum;
    const diff = exp - now.getTime();
    const cycle = Number(n.billing_cycle);
    const cycleMs = cycle * MS_DAY;
    if (diff > 0 && cycleMs > 0) return sum + p * (diff / cycleMs);
    return sum;
  }, 0);
}

export function formatFinanceAmount(
  amount: number,
  currency: CurrencyCode,
): { currency: CurrencyCode; symbol: string; value: string } {
  const safe = Number.isFinite(amount) ? amount : 0;
  const value = new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Math.abs(safe) < 100_000 ? 2 : 0,
    notation: Math.abs(safe) >= 100_000 ? "compact" : "standard",
  }).format(safe);
  return {
    currency,
    symbol: CURRENCY_SYMBOLS[currency],
    value,
  };
}

export function convertFromCny(
  amountCny: number,
  target: CurrencyCode,
  rates: ExchangeRates,
): number {
  const rate = rates[target] ?? DEFAULT_EXCHANGE_RATES[target] ?? 1;
  return amountCny * rate;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readCache(): ExchangeRates | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { date: string; rates: Partial<ExchangeRates> };
    if (j.date !== todayKey()) return null;
    return { ...DEFAULT_EXCHANGE_RATES, ...j.rates };
  } catch {
    return null;
  }
}

function writeCache(rates: ExchangeRates) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ date: todayKey(), rates }),
    );
  } catch {
    // ignore
  }
}

async function fetchRates(): Promise<ExchangeRates | null> {
  const apis = [
    "https://api.frankfurter.app/latest?from=CNY",
    "https://open.er-api.com/v6/latest/CNY",
  ];
  for (const url of apis) {
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(url, { signal: ctrl.signal });
      window.clearTimeout(t);
      if (!res.ok) continue;
      const data = (await res.json()) as { rates?: Record<string, number> };
      if (!data.rates) continue;
      const next = { ...DEFAULT_EXCHANGE_RATES };
      for (const code of Object.keys(FINANCE_CURRENCY_CONFIG) as CurrencyCode[]) {
        if (typeof data.rates[code] === "number") next[code] = data.rates[code];
      }
      next.CNY = 1;
      return next;
    } catch {
      // try next
    }
  }
  return null;
}

export async function getDailyExchangeRates(): Promise<ExchangeRates> {
  const cached = readCache();
  if (cached) return cached;
  const fetched = await fetchRates();
  if (fetched) {
    writeCache(fetched);
    return fetched;
  }
  return DEFAULT_EXCHANGE_RATES;
}

export interface FinanceSummary {
  remaining: { symbol: string; value: string; currency: string };
  total: { symbol: string; value: string; currency: string };
  monthly: { symbol: string; value: string; currency: string };
  rateRows: Array<{ currency: string; symbol: string; rate: string }>;
}

export function buildFinanceSummary(
  nodes: NodeInfo[],
  rates: ExchangeRates,
  base: CurrencyCode,
): FinanceSummary {
  const remCny = calcRemainingCny(nodes, rates);
  const totCny = calcTotalValueCny(nodes, rates);
  const monCny = calcMonthlyCny(nodes, rates);
  const rem = formatFinanceAmount(convertFromCny(remCny, base, rates), base);
  const tot = formatFinanceAmount(convertFromCny(totCny, base, rates), base);
  const mon = formatFinanceAmount(convertFromCny(monCny, base, rates), base);

  const rateRows = DISPLAY_CURRENCIES.filter((c) => c !== base).map((c) => {
    const baseRate = rates[base] || 1;
    const targetRate = rates[c] || 1;
    // 1 base = ? target  (both relative to CNY)
    const cross = targetRate / baseRate;
    return {
      currency: c,
      symbol: CURRENCY_SYMBOLS[c],
      rate: cross.toFixed(cross >= 100 ? 2 : 4),
    };
  });

  return {
    remaining: {
      symbol: rem.symbol,
      value: rem.value,
      currency: rem.currency,
    },
    total: { symbol: tot.symbol, value: tot.value, currency: tot.currency },
    monthly: {
      symbol: mon.symbol,
      value: mon.value,
      currency: `${mon.currency}/mo`,
    },
    rateRows,
  };
}
