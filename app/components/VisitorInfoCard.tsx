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

interface VisitorClient {
  device: string;
  browser: string;
}

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
  let device = "Desktop";
  if (/android/i.test(userAgent)) device = "Android";
  else if (/iphone|ipod/i.test(userAgent)) device = "iPhone";
  else if (/ipad/i.test(userAgent)) device = "iPad";
  else if (/tablet/i.test(userAgent)) device = "Tablet";

  let browser = "Unknown browser";
  if (/Edg\//i.test(userAgent)) browser = "Edge";
  else if (/OPR\//i.test(userAgent)) browser = "Opera";
  else if (/Chrome\//i.test(userAgent)) browser = "Chrome";
  else if (/Firefox\//i.test(userAgent)) browser = "Firefox";
  else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) browser = "Safari";

  return { device, browser };
}

function locationFrom(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" · ") || "Unknown location";
}

async function fetchJson<T>(
  url: string,
  outerSignal: AbortSignal,
  timeoutMs = 4_500,
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
  const loaders: Array<() => Promise<VisitorGeo>> = [
    async () => {
      const data = await fetchJson<IpWhoResponse>("https://ipwho.is/", signal);
      if (data.success === false || !data.ip) throw new Error(data.message || "ipwho.is unavailable");
      return {
        ip: data.ip,
        isp: data.connection?.isp || data.connection?.org || "Unknown ISP",
        location: locationFrom([data.country, data.region, data.city]),
        countryCode: data.country_code || "",
      };
    },
    async () => {
      const data = await fetchJson<IpSbResponse>("https://api.ip.sb/geoip", signal);
      if (!data.ip) throw new Error("ip.sb unavailable");
      return {
        ip: data.ip,
        isp: data.isp || data.organization || data.asn_organization || "Unknown ISP",
        location: locationFrom([data.country, data.region, data.city]),
        countryCode: data.country_code || "",
      };
    },
    async () => {
      const data = await fetchJson<IpApiResponse>("https://ipapi.co/json/", signal);
      if (data.error || !data.ip) throw new Error(data.reason || "ipapi unavailable");
      return {
        ip: data.ip,
        isp: data.org || "Unknown ISP",
        location: locationFrom([data.country_name, data.region, data.city]),
        countryCode: data.country_code || "",
      };
    },
  ];

  for (const load of loaders) {
    try {
      return await load();
    } catch {
      if (signal.aborted) return null;
    }
  }
  return null;
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
  const [client, setClient] = useState<VisitorClient>({ device: "Desktop", browser: "Unknown browser" });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setClient(detectClient(navigator.userAgent));

    void fetchVisitorGeo(controller.signal)
      .then((result) => {
        if (active) setGeo(result);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const location = loading ? t("visitor.loading") : geo?.location || t("visitor.unavailable");
  const ip = loading ? t("visitor.loading") : geo ? maskIp(geo.ip) : t("visitor.unavailable");
  const isp = loading ? t("visitor.loading") : geo?.isp || t("visitor.unavailable");
  const countryCode = geo?.countryCode.toUpperCase() || "";
  const visitTime = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

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
            <span><b>IP</b> {ip}</span>
            <span><b>{t("visitor.device")}</b> {client.device}</span>
            <span><b>{t("visitor.browser")}</b> {client.browser}</span>
          </div>
        ) : null}

        {expanded ? (
          <div className="visitor-card__details">
            <DetailRow label={t("visitor.ip")} value={ip} />
            <DetailRow label={t("visitor.device")} value={client.device} />
            <DetailRow label={t("visitor.browser")} value={client.browser} />
            <DetailRow label={t("visitor.isp")} value={isp} />
            <DetailRow label={t("visitor.location")} value={location} />
            <DetailRow label={t("visitor.visitTime")} value={visitTime} />
          </div>
        ) : null}

      </Tile>
    </aside>
  );
}
