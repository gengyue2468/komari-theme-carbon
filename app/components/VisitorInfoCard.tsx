import { Tile } from "@carbon/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RegionFlag } from "~/components/RegionFlag";

interface VisitorGeo {
  ip: string;
  isp: string;
  location: string;
  countryCode: string;
}

interface IpWhoResponse {
  success?: boolean;
  message?: string;
  ip?: string;
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
  connection?: {
    isp?: string;
    org?: string;
  };
}

interface IpSbResponse {
  ip?: string;
  isp?: string;
  organization?: string;
  asn_organization?: string;
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
}

interface IpApiResponse {
  error?: boolean;
  reason?: string;
  ip?: string;
  org?: string;
  country_name?: string;
  country_code?: string;
  region?: string;
  city?: string;
}

type VisitorDevice = "desktop" | "android" | "iphone" | "ipad" | "tablet";
type VisitorBrowser =
  | "unknown"
  | "edge"
  | "opera"
  | "chrome"
  | "firefox"
  | "safari";

interface VisitorClient {
  device: VisitorDevice;
  browser: VisitorBrowser;
}

const VISITOR_GEO_CACHE_KEY = "komari-carbon-visitor-geo-v1";
const VISITOR_GEO_CACHE_TTL = 24 * 60 * 60 * 1000;

function maskIpv4(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }
  return `${parts[0]}.${parts[1]}.${"*".repeat(parts[2].length)}.${parts[3]}`;
}

function maskIpv6(value: string): string | null {
  const [address, scope] = value.split("%", 2);
  if (!address.includes(":")) return null;
  const parts = address.split(":");
  if (parts.some((part) => part && !/^[\da-f]{1,4}$/i.test(part))) return null;
  const visible = parts.filter(Boolean).slice(0, 4);
  const masked = visible.length > 0 ? `${visible.join(":")}::*` : "::*";
  return scope ? `${masked}%${scope}` : masked;
}

function maskIp(value: string): string {
  return maskIpv4(value) ?? maskIpv6(value) ?? value;
}

function detectClient(userAgent: string): VisitorClient {
  let device: VisitorDevice = "desktop";
  if (/android/i.test(userAgent)) device = "android";
  else if (/iphone|ipod/i.test(userAgent)) device = "iphone";
  else if (/ipad/i.test(userAgent)) device = "ipad";
  else if (/tablet/i.test(userAgent)) device = "tablet";

  let browser: VisitorBrowser = "unknown";
  if (/Edg\//i.test(userAgent)) browser = "edge";
  else if (/OPR\//i.test(userAgent)) browser = "opera";
  else if (/Chrome\//i.test(userAgent)) browser = "chrome";
  else if (/Firefox\//i.test(userAgent)) browser = "firefox";
  else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) browser = "safari";

  return { device, browser };
}

function locationFrom(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" · ");
}

function readCachedGeo(): VisitorGeo | null {
  try {
    const raw = sessionStorage.getItem(VISITOR_GEO_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<VisitorGeo> & { cachedAt?: number };
    if (
      !cached.cachedAt ||
      Date.now() - cached.cachedAt > VISITOR_GEO_CACHE_TTL ||
      typeof cached.ip !== "string"
    ) {
      sessionStorage.removeItem(VISITOR_GEO_CACHE_KEY);
      return null;
    }
    return {
      ip: cached.ip,
      isp: typeof cached.isp === "string" ? cached.isp : "",
      location: typeof cached.location === "string" ? cached.location : "",
      countryCode:
        typeof cached.countryCode === "string" ? cached.countryCode : "",
    };
  } catch {
    return null;
  }
}

function writeCachedGeo(geo: VisitorGeo) {
  try {
    // Keep only the already-masked address in session storage.
    sessionStorage.setItem(
      VISITOR_GEO_CACHE_KEY,
      JSON.stringify({
        ...geo,
        ip: maskIp(geo.ip),
        cachedAt: Date.now(),
      }),
    );
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

async function fetchJson<T>(
  url: string,
  outerSignal: AbortSignal,
  timeoutMs = 2_500,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = window.setTimeout(abort, timeoutMs);
  outerSignal.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timer);
    outerSignal.removeEventListener("abort", abort);
  }
}

async function fetchVisitorGeo(signal: AbortSignal): Promise<VisitorGeo | null> {
  if (signal.aborted) return null;
  const cached = readCachedGeo();
  if (cached) return cached;

  const requestController = new AbortController();
  const abortRequest = () => requestController.abort();
  const deadline = window.setTimeout(abortRequest, 5_500);
  signal.addEventListener("abort", abortRequest, { once: true });

  const loaders: Array<(requestSignal: AbortSignal) => Promise<VisitorGeo>> = [
    async (requestSignal) => {
      const data = await fetchJson<IpWhoResponse>("https://ipwho.is/", requestSignal);
      if (data.success === false || !data.ip) throw new Error(data.message || "ipwho.is unavailable");
      return {
        ip: data.ip,
        isp: data.connection?.isp || data.connection?.org || "",
        location: locationFrom([data.country, data.region, data.city]),
        countryCode: data.country_code || "",
      };
    },
    async (requestSignal) => {
      const data = await fetchJson<IpSbResponse>(
        "https://api.ip.sb/geoip",
        requestSignal,
      );
      if (!data.ip) throw new Error("ip.sb unavailable");
      return {
        ip: data.ip,
        isp: data.isp || data.organization || data.asn_organization || "",
        location: locationFrom([data.country, data.region, data.city]),
        countryCode: data.country_code || "",
      };
    },
    async (requestSignal) => {
      const data = await fetchJson<IpApiResponse>(
        "https://ipapi.co/json/",
        requestSignal,
      );
      if (data.error || !data.ip) throw new Error(data.reason || "ipapi unavailable");
      return {
        ip: data.ip,
        isp: data.org || "",
        location: locationFrom([data.country_name, data.region, data.city]),
        countryCode: data.country_code || "",
      };
    },
  ];

  try {
    for (const load of loaders) {
      try {
        if (requestController.signal.aborted) return null;
        const result = await load(requestController.signal);
        writeCachedGeo(result);
        return result;
      } catch {
        if (signal.aborted || requestController.signal.aborted) return null;
      }
    }
    return null;
  } finally {
    window.clearTimeout(deadline);
    signal.removeEventListener("abort", abortRequest);
  }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="visitor-card__row">
      <span className="visitor-card__row-label">{label}</span>
      <span className="visitor-card__row-value" title={value}>{value}</span>
    </div>
  );
}

export function VisitorInfoCard() {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [geo, setGeo] = useState<VisitorGeo | null>(null);
  const [client, setClient] = useState<VisitorClient>({
    device: "desktop",
    browser: "unknown",
  });
  const [visitAt, setVisitAt] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    let active = true;
    setClient(detectClient(navigator.userAgent));
    setVisitAt(Date.now());

    const load = () => {
      if (!active) return;
      void fetchVisitorGeo(controller.signal)
        .then((result) => {
          if (active) setGeo(result);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };
    let idleId: number | null = null;
    let timeoutId: number | null = null;
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(load, { timeout: 1_200 });
    } else {
      timeoutId = window.setTimeout(load, 0);
    }

    return () => {
      active = false;
      controller.abort();
      if (idleId != null) window.cancelIdleCallback(idleId);
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [visible]);

  const device = t(`visitor.devices.${client.device}`);
  const browser = t(`visitor.browsers.${client.browser}`);
  const location = loading
    ? t("visitor.loading")
    : geo?.location || t("visitor.unknownLocation");
  const ip = loading ? t("visitor.loading") : geo ? maskIp(geo.ip) : t("visitor.unavailable");
  const isp = loading ? t("visitor.loading") : geo?.isp || t("visitor.unknownIsp");
  const countryCode = geo?.countryCode.toUpperCase() || "";
  const visitTime = visitAt
    ? new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(visitAt))
    : t("visitor.loading");

  if (!visible) return null;

  return (
    <aside className={`visitor-card${expanded ? " is-expanded" : ""}`} aria-label={t("visitor.title")}>
      <Tile className="visitor-card__tile">
        <div className="visitor-card__header">
          <div className="visitor-card__identity">
            {countryCode ? (
              <RegionFlag region={countryCode} className="visitor-card__flag" title={location} />
            ) : (
              <span className="visitor-card__flag-fallback" aria-hidden="true">◎</span>
            )}
            <div className="visitor-card__heading">
              <strong className="visitor-card__location" title={location}>
                {t("visitor.welcome", { location })}
              </strong>
            </div>
          </div>
          <div className="visitor-card__actions">
            <button
              type="button"
              className="visitor-card__toggle"
              aria-expanded={expanded}
              aria-label={expanded ? t("visitor.collapse") : t("visitor.expand")}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "−" : "+"}
            </button>
            <button
              type="button"
              className="visitor-card__close"
              aria-label={t("visitor.close")}
              onClick={() => setVisible(false)}
            >
              ×
            </button>
          </div>
        </div>

        {!expanded ? (
          <div className="visitor-card__summary" aria-live="polite">
            <span><b>{t("visitor.ip")}</b> {ip}</span>
            <span><b>{t("visitor.device")}</b> {device}</span>
            <span><b>{t("visitor.browser")}</b> {browser}</span>
          </div>
        ) : null}

        {expanded ? (
          <div className="visitor-card__details">
            <DetailRow label={t("visitor.ip")} value={ip} />
            <DetailRow label={t("visitor.device")} value={device} />
            <DetailRow label={t("visitor.browser")} value={browser} />
            <DetailRow label={t("visitor.isp")} value={isp} />
            <DetailRow label={t("visitor.location")} value={location} />
            <DetailRow label={t("visitor.visitTime")} value={visitTime} />
          </div>
        ) : null}

      </Tile>
    </aside>
  );
}
