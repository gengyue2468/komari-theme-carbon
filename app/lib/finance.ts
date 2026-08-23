import { formatBillingCycle } from "~/lib/format";
import i18n from "~/i18n";
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
  ILS: { rate: 0.43085, symbol: "₪" },
  INR: { rate: 14.0178, symbol: "₹" },
  ISK: { rate: 18.4626, symbol: "kr" },
  JPY: { rate: 23.707, symbol: "¥" },
  KRW: { rate: 224.11, symbol: "₩" },
  KZT: { rate: 64, symbol: "₸" },
  MXN: { rate: 2.5472, symbol: "Mex$" },
  MYR: { rate: 0.59945, symbol: "RM" },
  NOK: { rate: 1.4096, symbol: "kr" },
  NZD: { rate: 0.2535, symbol: "NZ$" },
  PHP: { rate: 8.9288, symbol: "₱" },
  PLN: { rate: 0.54138, symbol: "zł" },
  RON: { rate: 0.66769, symbol: "lei" },
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
  "BRL",
  "INR",
  "AUD",
  "CAD",
  "SGD",
  "THB",
  "VND",
  "MYR",
  "PHP",
  "IDR",
  "NZD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "TRY",
  "ZAR",
  "KZT",
  "UAH",
  "CHF",
] as const satisfies readonly CurrencyCode[];

export const DEFAULT_EXCHANGE_RATES = Object.fromEntries(
  Object.entries(FINANCE_CURRENCY_CONFIG).map(([c, cfg]) => [c, cfg.rate]),
) as ExchangeRates;

export const CURRENCY_SYMBOLS = Object.fromEntries(
  Object.entries(FINANCE_CURRENCY_CONFIG).map(([c, cfg]) => [c, cfg.symbol]),
) as Record<CurrencyCode, string>;

const CACHE_KEY = "komari_finance_exchange_rates_cny_v1";
const MS_DAY = 86_400_000;
const FIN_CURRENCY_KEY = "fin_currency";

const ALIASES: Record<string, CurrencyCode> = {
  $: "USD",
  "A$": "AUD",
  "AU$": "AUD",
  "C$": "CAD",
  "CA$": "CAD",
  "CN¥": "CNY",
  "HK$": "HKD",
  "JP¥": "JPY",
  "NZ$": "NZD",
  "R$": "BRL",
  "S$": "SGD",
  US$: "USD",
  RMB: "CNY",
  RM: "MYR",
  RP: "IDR",
  "₽": "RUB",
  "₩": "KRW",
  "₸": "KZT",
  "₱": "PHP",
  "₺": "TRY",
  "₴": "UAH",
  "₫": "VND",
  "₹": "INR",
  "฿": "THB",
  "KČ": "CZK",
  FT: "HUF",
  "ZŁ": "PLN",
  R: "ZAR",
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

export function formatPriceWithCycle(
  price: number,
  billingCycle: number,
  currency = "CNY",
): string {
  if (price <= 0) return i18n.t("detail.free");
  const code = normalizeCurrency(currency);
  const cycle = formatBillingCycle(billingCycle);
  return `${CURRENCY_SYMBOLS[code]}${price}/${cycle}`;
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

export function calcValueCny(node: NodeInfo, rates: ExchangeRates): number {
  return priceToCny(node, rates);
}

export function calcMonthlyValueCny(
  node: NodeInfo,
  rates: ExchangeRates,
): number {
  const price = priceToCny(node, rates);
  const cycle = Number(node.billing_cycle);
  if (price <= 0 || !Number.isFinite(cycle) || cycle <= 0) return 0;
  return (price / cycle) * 30;
}

export function calcRemainingValueCny(
  node: NodeInfo,
  rates: ExchangeRates,
  now = new Date(),
): number {
  if (!node.expired_at) return 0;
  const price = priceToCny(node, rates);
  if (price <= 0) return 0;
  const exp = new Date(node.expired_at).getTime();
  if (!Number.isFinite(exp)) return 0;
  const diff = exp - now.getTime();
  if (diff / (MS_DAY * 365) > 100) return price;
  const cycle = Number(node.billing_cycle);
  const cycleMs = cycle * MS_DAY;
  return diff > 0 && cycleMs > 0 ? price * (diff / cycleMs) : 0;
}

export function calcTotalValueCny(
  nodes: NodeInfo[],
  rates: ExchangeRates,
): number {
  return nodes.reduce(
    (sum, n) => (n.tags?.includes("白嫖中") ? sum : sum + priceToCny(n, rates)),
    0,
  );
}

export function calcMonthlyCny(nodes: NodeInfo[], rates: ExchangeRates): number {
  return nodes.reduce(
    (sum, n) =>
      n.tags?.includes("白嫖中") ? sum : sum + calcMonthlyValueCny(n, rates),
    0,
  );
}

export function calcRemainingCny(
  nodes: NodeInfo[],
  rates: ExchangeRates,
  now = new Date(),
): number {
  return nodes.reduce(
    (sum, n) =>
      n.tags?.includes("白嫖中")
        ? sum
        : sum + calcRemainingValueCny(n, rates, now),
    0,
  );
}

export function formatFinanceAmount(
  amount: number,
  currency: CurrencyCode,
  language = "zh-CN",
): { currency: CurrencyCode; symbol: string; value: string } {
  const safe = Number.isFinite(amount) ? amount : 0;
  const value = new Intl.NumberFormat(language, {
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
  return readCacheValue(false);
}

function readCacheValue(allowStale: boolean): ExchangeRates | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as {
      base?: string;
      date?: string;
      rates: Partial<ExchangeRates>;
    };
    if (j.base !== "CNY" || !j.date || (!allowStale && j.date !== todayKey())) {
      return null;
    }
    return { ...DEFAULT_EXCHANGE_RATES, ...j.rates };
  } catch {
    return null;
  }
}

function writeCache(rates: ExchangeRates) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        base: "CNY",
        date: todayKey(),
        fetchedAt: Date.now(),
        rates,
      }),
    );
  } catch {
    // ignore
  }
}

/** Today's cached rates if already fetched (synchronous, no network). */
export function readStoredRates(): ExchangeRates | null {
  if (typeof localStorage === "undefined") return null;
  return readCache();
}

async function fetchRates(): Promise<ExchangeRates | null> {
  const apis = [
    "https://api.frankfurter.app/latest?from=CNY",
    "https://open.er-api.com/v6/latest/CNY",
  ];
  for (const url of apis) {
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, { signal: ctrl.signal });
      window.clearTimeout(t);
      if (!res.ok) continue;
      const data = (await res.json()) as { rates?: Record<string, number> };
      if (!data.rates) continue;
      const next = { ...DEFAULT_EXCHANGE_RATES };
      for (const code of Object.keys(FINANCE_CURRENCY_CONFIG) as CurrencyCode[]) {
        if (code === "CNY") continue;
        const value = Number(data.rates[code]);
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error(`Missing exchange rate: ${code}`);
        }
        next[code] = value;
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
  const staleCached = cached ?? readCacheValue(true);
  if (cached) return cached;
  const fetched = await fetchRates();
  if (fetched) {
    writeCache(fetched);
    return fetched;
  }
  return staleCached ?? DEFAULT_EXCHANGE_RATES;
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
  language = "zh-CN",
): FinanceSummary {
  const remCny = calcRemainingCny(nodes, rates);
  const totCny = calcTotalValueCny(nodes, rates);
  const monCny = calcMonthlyCny(nodes, rates);
  const rem = formatFinanceAmount(convertFromCny(remCny, base, rates), base, language);
  const tot = formatFinanceAmount(convertFromCny(totCny, base, rates), base, language);
  const mon = formatFinanceAmount(convertFromCny(monCny, base, rates), base, language);

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
