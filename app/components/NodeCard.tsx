import { Tag, Tile, Tooltip } from "@carbon/react";
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  cardPingFromMetrics,
  formatLatencyMs,
  type NodePingHistorySummary,
  selectPingNetworks,
} from "~/lib/ping-display";
import { barToneClass } from "~/lib/ping-tone";
import { QuickIcon } from "~/components/BrandIcon";
import { InfoTip, PingPointInfo } from "~/components/InfoTip";
import { RegionFlag } from "~/components/RegionFlag";
import {
  formatBytes,
  formatDateTimeWithoutSeconds,
  formatRate,
  formatUptimeWithFormat,
  parseTags,
  percentOf,
  trafficLimitTypeLabel,
  trafficUsedBytes,
} from "~/lib/format";
import { getArchIcon, getOsIcon, getVirtIcon } from "~/lib/os-arch";
import { formatPriceWithCycle } from "~/lib/finance";
import type {
  NodeInfo,
  RealtimeMetrics,
} from "~/types/komari";

interface NodeCardProps {
  node: NodeInfo;
  online: boolean;
  realtimeReady: boolean;
  metrics?: RealtimeMetrics;
  pingSummary?: NodePingHistorySummary;
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
        className={`card-bar__fill${v >= 80 ? " card-bar__fill--error" : v >= 60 ? " card-bar__fill--warn" : ""}`}
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
  label: React.ReactNode;
  value: string;
  unit?: string;
  hint?: string;
  pct: number | null;
}) {
  return (
    <div className="card-kv">
      <div className="card-kv__head">
        <span className="card-kv__label">
          {label}
        </span>
        {(value || unit) && (
          <span className="card-kv__value numeric">
            {value}
            {unit && <span className="card-kv__unit">{unit}</span>}
          </span>
        )}
      </div>
      <Bar pct={pct} />
      {hint && <span className="card-kv__hint numeric">{hint}</span>}
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
  return formatDateTimeWithoutSeconds(value, language);
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
        <span className="card-row__value numeric">{value}</span>
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

  const price = formatPriceWithCycle(node.price, node.billing_cycle, node.currency);

  const ramUsed = metrics ? formatBytes(metrics.ram.used) : "—";
  const ramTotal = formatBytes(ramTotalBytes);
  const diskUsed = metrics ? formatBytes(metrics.disk.used) : "—";
  const diskTotal = formatBytes(diskTotalBytes);

  return (
    <>
      <section className="card-section">
        <h3 className="card-section__title">{t("detail.system")}</h3>
        <div className="card-kv-grid">
          <Kv
            label={t("metrics.cpu")}
            value={cpu != null ? cpu.toFixed(1) : "—"}
            unit={cpu != null ? "%" : undefined}
            pct={cpu}
            hint={
              metrics
                ? `${metrics.load.load1.toFixed(2)} / ${metrics.load.load5.toFixed(2)} / ${metrics.load.load15.toFixed(2)}`
                : "—"
            }
          />
          <Kv
            label={t("metrics.ram")}
            value={ram != null ? ram.toFixed(1) : "—"}
            unit={ram != null ? "%" : undefined}
            pct={ram}
            hint={metrics ? `${ramUsed} / ${ramTotal}` : "—"}
          />
          <Kv
            label={t("metrics.disk")}
            value={disk != null ? disk.toFixed(1) : "—"}
            unit={disk != null ? "%" : undefined}
            pct={disk}
            hint={metrics ? `${diskUsed} / ${diskTotal}` : "—"}
          />
          <Kv
            label={t("metrics.traffic")}
            value={trafficPct != null ? trafficPct.toFixed(1) : "—"}
            unit={trafficPct != null ? "%" : undefined}
            pct={trafficPct}
            hint={
              node.traffic_limit > 0
                ? metrics
                  ? `${formatBytes(trafficUsed)} / ${formatBytes(node.traffic_limit)} / ${trafficLimitTypeLabel(node.traffic_limit_type)}`
                  : "—"
                : metrics
                  ? `${formatBytes(trafficUsed)} / ∞`
                  : "— / ∞"
            }
          />
        </div>
      </section>
      <section className="card-section">
        <h3 className="card-section__title">{t("detail.network")}</h3>
        <Row label={t("metrics.rate")}>
          <span className="card-rate numeric">
            <span className="card-rate__up">
              <span className="direction-label">{t("metrics.outbound")}</span>
              {metrics ? formatRate(metrics.network.up) : "—"}
            </span>
            <span className="card-rate__down">
              <span className="direction-label">{t("metrics.inbound")}</span>
              {metrics ? formatRate(metrics.network.down) : "—"}
            </span>
          </span>
        </Row>
        {showUptime ? (
          <Row label={t("metrics.uptime")}>
            <span className="numeric">
              {metrics ? formatUptimeWithFormat(metrics.uptime, "minute") : "—"}
            </span>
          </Row>
        ) : null}
        <Row label={t("detail.price")}>
          <span className="numeric">{price}</span>
        </Row>
      </section>

    </>
  );
}

function SectionPing({
  nodeUuid,
  metrics,
  pingSummary,
  realtimeReady,
  onOpenMore,
}: {
  nodeUuid: string;
  metrics?: RealtimeMetrics;
  pingSummary?: NodePingHistorySummary;
  realtimeReady: boolean;
  onOpenMore: () => void;
}) {
  const { t } = useTranslation();
  const historySummary = pingSummary;
  const ping = historySummary
    ? {
        visible: historySummary.networks.slice(0, 3),
        extraCount: Math.max(0, historySummary.networks.length - 3),
      }
    : selectPingNetworks(metrics?.ping);
  const summary = historySummary ?? cardPingFromMetrics(metrics);

  return (
    <section className="card-section">
      <h3 className="card-section__title">{t("metrics.monitoringPoints")}</h3>
      {!realtimeReady ? (
        <span className="card-row__value">{t("app.statusLoading")}</span>
      ) : ping.visible.length > 0 ? (
        <div className="card-ping-points">
          {ping.visible.map((point) => (
            <div className="card-ping-point" key={point.id}>
              <div className="card-ping-point__head">
                <span className="card-ping-point__name">
                  <span className="card-ping-point__name-text">
                    {point.name || point.id}
                  </span>
                  <InfoTip
                    label={t("detail.pingPointInfo", { name: point.name || point.id })}
                    description={
                      <PingPointInfo point={point} hasHistory={historySummary != null} />
                    }
                  />
                </span>
              </div>
              <div className="card-ping-point__strips">
                <PingStrip
                  label={t("metrics.latency")}
                  value={formatLatencyMs(point.latencyMs)}
                  metric="latency"
                  bars={
                    point.latencyMs != null && point.latencyMs < 0
                      ? [{ time: point.id, latency: -1, loss: null }]
                      : historySummary?.bars ?? (point.latencyMs != null
                        ? [{ time: point.id, latency: point.latencyMs, loss: null }]
                        : [])
                  }
                />
                <PingStrip
                  label={t("metrics.loss")}
                  value={point.lossPct != null ? `${point.lossPct.toFixed(1)}%` : "—"}
                  metric="loss"
                  bars={historySummary?.bars ?? (point.lossPct != null
                    ? [{ time: point.id, latency: null, loss: point.lossPct }]
                    : [])}
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
              value={formatLatencyMs(summary.avgLatencyMs)}
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
        <span className="card-row__value">{t("detail.notApplicable")}</span>
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
    pingSummary,
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
              <span className="node-card__title-text">{node.name}</span>
            </h3>
          </div>
          <div className="node-card__head-right">
            {!realtimeReady || online ? (
              <Tooltip
                as="span"
                label={!realtimeReady ? t("app.statusLoading") : t("app.online")}
                align="top"
              >
                <span
                  className={`node-card__status-dot${!realtimeReady ? " is-loading" : ""}`}
                  role="status"
                  aria-label={!realtimeReady ? t("app.statusLoading") : t("app.online")}
                />
              </Tooltip>
            ) : null}
          </div>
        </div>

        <div className="node-card__sub">
          {node.group ? (
            <Tag type="blue" size="sm">
              {node.group}
            </Tag>
          ) : null}
          <div className="node-card__sub-meta">
            <span className="node-card__cpu">{node.cpu_name}</span>
            <div className="node-card__badges">
              <QuickIcon icon={os.icon} size={16} title={os.label} />
              <QuickIcon icon={arch.icon} size={16} title={arch.label} />
            </div>
          </div>
        </div>

        <StatGroup node={node} metrics={metrics} showUptime={showUptime} />
        <SectionPing
          nodeUuid={node.uuid}
          metrics={metrics}
           pingSummary={pingSummary}
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
    prev.metrics === next.metrics &&
    prev.pingSummary === next.pingSummary,
);
