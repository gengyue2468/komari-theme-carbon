import { Tag, Tile } from "@carbon/react";
import { ArrowDown, ArrowUp } from "@carbon/icons-react";
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  cardPingFromMetrics,
  selectPingNetworks,
} from "~/lib/ping-display";
import { barToneClass } from "~/lib/ping-tone";
import { QuickIcon } from "~/components/BrandIcon";
import { RegionFlag } from "~/components/RegionFlag";
import {
  formatBillingCycle,
  formatBytes,
  formatRate,
  formatUptime,
  parseTags,
  percentOf,
  trafficLimitTypeLabel,
  trafficUsedBytes,
} from "~/lib/format";
import { getArchIcon, getOsIcon, getVirtIcon } from "~/lib/os-arch";
import type { NodeInfo, RealtimeMetrics } from "~/types/komari";

interface NodeCardProps {
  node: NodeInfo;
  online: boolean;
  realtimeReady: boolean;
  metrics?: RealtimeMetrics;
  lastSeenAt?: string;
  showUptime?: boolean;
}

/* ── Minimal helpers ── */

function Bar({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <div className="card-bar card-bar--empty" aria-hidden />;
  }
  const v = Math.min(100, Math.max(0, pct));
  return (
    <div className="card-bar">
      <div
        className={`card-bar__fill${v >= 90 ? " card-bar__fill--error" : v >= 75 ? " card-bar__fill--warn" : ""}`}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

function Kv({
  label,
  value,
  unit,
  hint,
  pct,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  pct: number | null;
}) {
  return (
    <div className="card-kv">
      <div className="card-kv__head">
        <span className="card-kv__label">{label}</span>
        {(value || unit) && (
          <span className="card-kv__value mono">
            {value}
            {unit && <span className="card-kv__unit">{unit}</span>}
          </span>
        )}
      </div>
      <Bar pct={pct} />
      {hint && <span className="card-kv__hint mono">{hint}</span>}
    </div>
  );
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card-row">
      <span className="card-row__label">{label}</span>
      <span className="card-row__value">{children}</span>
    </div>
  );
}

function formatLastSeen(value: string | undefined, language: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(language);
}

/* ── Card ── */

const SPARK_CELLS = 12;

function PingStrip({
  label,
  value,
  metric,
  bars,
}: {
  label: string;
  value: string;
  metric: "latency" | "loss";
  bars: Array<{ time: string; latency: number | null; loss: number | null }>;
}) {
  const cells =
    bars.length > 0
      ? Array.from({ length: SPARK_CELLS }, (_, index) => bars[index % bars.length])
      : [];

  return (
    <div className="card-spark">
      <div className="card-row">
        <span className="card-row__label">{label}</span>
        <span className="card-row__value mono">{value}</span>
      </div>
      <div className="card-spark__track" aria-hidden>
        {cells.map((point, index) => (
          <span
            key={`${point.time}-${index}`}
            className={`card-spark__cell ${barToneClass(metric, metric === "latency" ? point.latency : point.loss)}`}
          />
        ))}
      </div>
    </div>
  );
}

function StatGroup({ node, metrics, showUptime }: Pick<NodeCardProps, "node" | "metrics" | "showUptime">) {
  const { t } = useTranslation();
  const cpu = metrics?.cpu.usage ?? null;
  const ramTotalBytes = node.mem_total || metrics?.ram.total || 0;
  const diskTotalBytes = node.disk_total || metrics?.disk.total || 0;
  const ram =
    metrics && ramTotalBytes > 0
      ? percentOf(metrics.ram.used, ramTotalBytes)
      : null;
  const disk =
    metrics && diskTotalBytes > 0
      ? percentOf(metrics.disk.used, diskTotalBytes)
      : null;
  const trafficUsed = metrics
    ? trafficUsedBytes(
        metrics.network.totalUp,
        metrics.network.totalDown,
        node.traffic_limit_type,
      )
    : 0;
  const trafficPct =
    metrics && node.traffic_limit > 0
      ? percentOf(trafficUsed, node.traffic_limit)
      : null;

  const cycle = formatBillingCycle(node.billing_cycle);
  const price =
    node.price < 0
      ? t("detail.free")
      : node.price === 0
        ? "—"
        : `${node.currency}${node.price}${cycle ? `/${cycle}` : ""}`;

  const ramUsed = metrics ? formatBytes(metrics.ram.used) : "—";
  const ramTotal = formatBytes(ramTotalBytes);
  const diskUsed = metrics ? formatBytes(metrics.disk.used) : "—";
  const diskTotal = formatBytes(diskTotalBytes);

  return (
    <>
      <section className="card-section">
        <h3 className="card-section__title">{t("detail.system")}</h3>
        <div className="card-kv-grid">
          <Kv label={t("metrics.cpu")} value={cpu != null ? cpu.toFixed(0) : "—"} unit={cpu != null ? "%" : undefined} pct={cpu} hint={metrics ? `${metrics.load.load1.toFixed(2)}, ${metrics.load.load5.toFixed(2)}, ${metrics.load.load15.toFixed(2)}` : "—"} />
          <Kv label={t("metrics.ram")} value={ram != null ? ram.toFixed(0) : "—"} unit={ram != null ? "%" : undefined} pct={ram} hint={metrics ? `${ramUsed} / ${ramTotal}` : "—"} />
          <Kv label={t("metrics.disk")} value={disk != null ? disk.toFixed(0) : "—"} unit={disk != null ? "%" : undefined} pct={disk} hint={metrics ? `${diskUsed} / ${diskTotal}` : "—"} />
          <Kv label={t("metrics.traffic")} value={trafficPct != null ? trafficPct.toFixed(0) : "—"} unit={trafficPct != null ? "%" : undefined} pct={trafficPct} hint={metrics && node.traffic_limit > 0 ? `${formatBytes(trafficUsed)} / ${formatBytes(node.traffic_limit)} · ${trafficLimitTypeLabel(node.traffic_limit_type)}` : node.traffic_limit > 0 ? "—" : "∞"} />
        </div>
      </section>
      <section className="card-section">
        <h3 className="card-section__title">{t("detail.network")}</h3>
        <Row label={t("metrics.rate")}>
          <span className="card-rate mono">
            <span className="card-rate__up"><ArrowUp size={12} />{metrics ? formatRate(metrics.network.up) : "—"}</span>
            <span className="card-rate__down"><ArrowDown size={12} />{metrics ? formatRate(metrics.network.down) : "—"}</span>
          </span>
        </Row>
        {showUptime && <Row label={t("metrics.uptime")}><span className="mono">{metrics ? formatUptime(metrics.uptime) : "—"}</span></Row>}
        <Row label={t("detail.price")}><span className="mono">{price}</span></Row>
      </section>

    </>
  );
}

function SectionPing({
  metrics,
  realtimeReady,
  onOpenMore,
}: {
  metrics?: RealtimeMetrics;
  realtimeReady: boolean;
  onOpenMore: () => void;
}) {
  const { t } = useTranslation();
  const ping = useMemo(() => selectPingNetworks(metrics?.ping), [metrics?.ping]);
  const summary = useMemo(() => cardPingFromMetrics(metrics), [metrics]);

  return (
    <section className="card-section">
      <h3 className="card-section__title">{t("metrics.monitoringPoints")}</h3>
      {!realtimeReady ? (
        <span className="card-row__value mono">{t("app.statusLoading")}</span>
      ) : ping.visible.length > 0 ? (
        <div className="card-ping-points">
          {ping.visible.map((point) => (
            <div className="card-ping-point" key={point.id}>
              <div className="card-ping-point__head">
                <span className="card-ping-point__name" title={point.name}>
                  {point.name || point.id}
                </span>
              </div>
              <div className="card-ping-point__strips">
                <PingStrip
                  label={t("metrics.latency")}
                  value={point.latencyMs != null ? `${point.latencyMs} ms` : "—"}
                  metric="latency"
                  bars={
                    point.latencyMs != null
                      ? [{ time: point.id, latency: point.latencyMs, loss: null }]
                      : []
                  }
                />
                <PingStrip
                  label={t("metrics.loss")}
                  value={point.lossPct != null ? `${point.lossPct.toFixed(1)}%` : "—"}
                  metric="loss"
                  bars={
                    point.lossPct != null
                      ? [{ time: point.id, latency: null, loss: point.lossPct }]
                      : []
                  }
                />
              </div>
            </div>
          ))}
          {ping.extraCount > 0 ? (
            <button
              type="button"
              className="card-ping-points__more"
              onClick={(event) => {
                event.stopPropagation();
                onOpenMore();
              }}
              onKeyDown={(event) => event.stopPropagation()}
              aria-label={t("detail.morePingPoints", { count: ping.extraCount })}
            >
              {t("detail.morePingPointsCount", { count: ping.extraCount })}
            </button>
          ) : null}
          <div className="card-ping-points__summary">
            <PingStrip
              label={t("metrics.latency")}
              value={summary.avgLatencyMs != null ? `${summary.avgLatencyMs} ms` : "—"}
              metric="latency"
              bars={summary.bars}
            />
            <PingStrip
              label={t("metrics.loss")}
              value={summary.avgLossPct != null ? `${summary.avgLossPct.toFixed(1)}%` : "—"}
              metric="loss"
              bars={summary.bars}
            />
          </div>
        </div>
      ) : (
        <span className="card-row__value mono">N/A</span>
      )}
    </section>
  );
}

export const NodeCard = memo(
  function NodeCard({
    node,
    online,
    realtimeReady,
    metrics,
    lastSeenAt,
    showUptime,
  }: NodeCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const os = useMemo(() => getOsIcon(node.os), [node.os]);
  const arch = useMemo(
    () => getArchIcon(node.arch, node.cpu_name),
    [node.arch, node.cpu_name],
  );
  const tags = useMemo(() => parseTags(node.tags), [node.tags]);

  return (
    <Tile
      className={`node-card${!realtimeReady ? " is-loading" : online ? " is-online" : " is-offline"}`}
    >
      <a
        className="node-card__overlay"
        href={`/node/${node.uuid}`}
        aria-label={node.name}
        onClick={(event) => {
          event.preventDefault();
          navigate(`/node/${node.uuid}`);
        }}
      />
      {realtimeReady && !online ? (
        <div className="node-card__offline-note" role="status">
          <strong>{t("app.offline")}</strong>
          <span>
            {t("detail.lastSeen")} {formatLastSeen(lastSeenAt, i18n.language)}
          </span>
        </div>
      ) : null}
      <div className="node-card__content">
        <div className="node-card__head">
          <div className="node-card__head-left">
            <h3 className="node-card__title" title={node.name}>
              <RegionFlag region={node.region} className="node-card__flag" />
              {node.name}
            </h3>
          </div>
          <div className="node-card__head-right">
            {!realtimeReady || online ? (
              <Tag
                type={!realtimeReady ? "cool-gray" : "blue"}
                size="sm"
              >
                {!realtimeReady ? t("app.statusLoading") : t("app.online")}
              </Tag>
            ) : null}
          </div>
        </div>

        <div className="node-card__sub">
          {node.group ? (
            <Tag type="blue" size="sm">
              {node.group}
            </Tag>
          ) : null}
          <div className="node-card__badges">
            <QuickIcon icon={os.icon} size={16} title={os.label} />
            <QuickIcon icon={arch.icon} size={16} title={arch.label} />
          </div>
          <span className="node-card__cpu mono">{node.cpu_name}</span>
        </div>

        <StatGroup node={node} metrics={metrics} showUptime={showUptime} />
        <SectionPing
          metrics={metrics}
          realtimeReady={realtimeReady}
          onOpenMore={() => navigate(`/node/${node.uuid}#ping-chart`)}
        />

        {tags.length > 0 && (
          <div className="node-card__tags">
            {tags.map((tag) => (
              <Tag key={tag} type="gray" size="sm">
                {tag}
              </Tag>
            ))}
          </div>
        )}
      </div>
    </Tile>
  );
  },
  (prev, next) =>
    prev.online === next.online &&
    prev.realtimeReady === next.realtimeReady &&
    prev.lastSeenAt === next.lastSeenAt &&
    prev.showUptime === next.showUptime &&
    prev.node === next.node &&
    prev.metrics === next.metrics,
);
