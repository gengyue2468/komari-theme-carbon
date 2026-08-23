import {
  DataTable,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from "@carbon/react";
import { ArrowDown, ArrowUp } from "@carbon/icons-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { QuickIcon } from "~/components/BrandIcon";
import { RegionFlag } from "~/components/RegionFlag";
import {
  formatBytes,
  formatRate,
  formatUptime,
  parseTags,
  percentOf,
  trafficLimitTypeLabel,
  trafficUsedBytes,
} from "~/lib/format";
import { getArchIcon, getOsIcon } from "~/lib/os-arch";
import {
  buildNodePingHistorySummary,
  formatLatencyMs,
  selectPingNetworks,
} from "~/lib/ping-display";
import { formatPriceWithCycle } from "~/lib/finance";
import type {
  NodeInfo,
  PingHistoryResponse,
  RealtimeMetrics,
} from "~/types/komari";

interface NodeTableProps {
  nodes: NodeInfo[];
  onlineIds: string[];
  realtimeReady: boolean;
  realtime: Record<string, RealtimeMetrics>;
  pingHistory?: PingHistoryResponse;
}

function MiniBar({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <div className="card-bar card-bar--sm card-bar--empty" aria-hidden />;
  }
  const v = Math.min(100, Math.max(0, pct));
  const tone =
    v >= 80 ? " card-bar__fill--error" : v >= 60 ? " card-bar__fill--warn" : "";
  return (
    <div className="card-bar card-bar--sm">
      <div className={`card-bar__fill${tone}`} style={{ width: `${v}%` }} />
    </div>
  );
}

function MetricCell({ pct, sub }: { pct: number | null; sub?: string }) {
  return (
    <div className="table-metric">
      <span className="table-metric__pct mono">
        {pct == null ? "—" : `${pct.toFixed(1)}%`}
      </span>
      <MiniBar pct={pct} />
      {sub ? <span className="table-metric__sub mono">{sub}</span> : null}
    </div>
  );
}

function sortPad(n: number): string {
  return n.toFixed(2).padStart(8, "0");
}

export function NodeTable({
  nodes,
  onlineIds,
  realtimeReady,
  realtime,
  pingHistory,
}: NodeTableProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const onlineSet = useMemo(() => new Set(onlineIds), [onlineIds]);

  const headers = useMemo(
    () => [
      { key: "status", header: t("table.status") },
      { key: "os", header: t("table.os") },
      { key: "arch", header: t("table.arch") },
      { key: "name", header: t("table.name") },
      { key: "tags", header: t("table.tags") },
      { key: "cpu", header: t("table.cpu") },
      { key: "mem", header: t("table.ram") },
      { key: "disk", header: t("table.disk") },
      { key: "traffic", header: t("table.traffic") },
      { key: "rate", header: t("table.rate") },
      { key: "monitoringPoints", header: t("table.monitoringPoints") },
    ],
    [t],
  );

  const rows = useMemo(
    () =>
      nodes.map((n) => {
        const on = realtimeReady && onlineSet.has(n.uuid);
        const m = realtimeReady ? realtime[n.uuid] : undefined;
        const cpu = m?.cpu.usage ?? null;
        const ramTotal = n.mem_total || m?.ram.total || 0;
        const diskTotal = n.disk_total || m?.disk.total || 0;
        const ramPct = m && ramTotal > 0 ? percentOf(m.ram.used, ramTotal) : null;
        const diskPct = m && diskTotal > 0 ? percentOf(m.disk.used, diskTotal) : null;
        const tUsed = m
          ? trafficUsedBytes(
              m.network.totalUp,
              m.network.totalDown,
              n.traffic_limit_type,
            )
          : 0;
        const tPct =
          m && n.traffic_limit > 0 ? percentOf(tUsed, n.traffic_limit) : null;
        const tags = parseTags(n.tags);
        const price = formatPriceWithCycle(n.price, n.billing_cycle, n.currency);

        return {
          id: n.uuid,
          status: on ? "1" : "0",
          os: n.os || "",
          arch: n.arch || "",
          name: n.name || "",
          tags: [n.group, ...tags].filter(Boolean).join(" "),
          cpu: sortPad(cpu ?? -1),
          mem: sortPad(ramPct ?? -1),
          disk: sortPad(diskPct ?? -1),
          traffic: sortPad(tPct ?? -1),
          rate: sortPad(m ? m.network.up + m.network.down : -1),
          monitoringPoints: "",
          _on: on,
          _m: m,
          _n: n,
          _os: getOsIcon(n.os),
          _arch: getArchIcon(n.arch, n.cpu_name),
          _tags: tags,
          _cpu: cpu,
          _ramPct: ramPct,
          _diskPct: diskPct,
          _tPct: tPct,
          _tUsed: tUsed,
          _tLimit: n.traffic_limit,
          _netUp: m ? formatRate(m.network.up) : "—",
          _netDown: m ? formatRate(m.network.down) : "—",
          _uptime: m ? formatUptime(m.uptime) : "—",
          _price: price,
          _nets: (() => {
            const history = buildNodePingHistorySummary(pingHistory, n.uuid);
            return history
              ? {
                  visible: history.networks.slice(0, 3),
                  extraCount: Math.max(0, history.networks.length - 3),
                }
              : selectPingNetworks(m?.ping);
          })(),
        };
      }),
    [nodes, onlineSet, realtime, realtimeReady, t, pingHistory],
  );

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  return (
    <div className="node-table-wrap">
      <p className="node-table__scroll-hint">
        {t("table.scrollHint")}
      </p>
      <DataTable rows={rows} headers={headers} isSortable size="lg">
        {({
          rows: dtRows,
          headers: dtHeaders,
          getHeaderProps,
          getRowProps,
          getTableProps,
          getTableContainerProps,
        }) => (
          <TableContainer {...getTableContainerProps()}>
            <Table {...getTableProps()} size="lg">
              <TableHead>
                <TableRow>
                  {dtHeaders.map((header) => {
                    const sortable =
                      header.key !== "tags" && header.key !== "monitoringPoints";
                    const { key, ...rest } = getHeaderProps({
                      header,
                      isSortable: sortable,
                    });
                    return (
                      <TableHeader key={key} {...rest}>
                        {header.header}
                      </TableHeader>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {dtRows.map((row) => {
                  const d = byId.get(row.id);
                  if (!d) return null;
                  const { key, ...rowRest } = getRowProps({ row });
                  return (
                    <TableRow
                      key={key}
                      {...rowRest}
                      className={
                        !realtimeReady
                          ? "table-row-clickable is-loading"
                          : d._on
                            ? "table-row-clickable"
                            : "table-row-clickable is-offline"
                      }
                      tabIndex={0}
                      role="link"
                      aria-label={d.name || row.id}
                      onClick={() => navigate(`/node/${row.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/node/${row.id}`);
                        }
                      }}
                    >
                      <TableCell>
                        <span
                          className={`table-status${!realtimeReady ? " is-loading" : d._on ? " is-online" : " is-offline"}`}
                        >
                          <span
                            className={`table-dot${!realtimeReady ? " is-loading" : d._on ? " is-on" : ""}`}
                            aria-hidden
                          />
                          <span className="table-status__label">
                            {!realtimeReady
                              ? t("app.statusLoading")
                              : d._on
                                ? t("app.online")
                                : t("app.offline")}
                          </span>
                        </span>
                      </TableCell>

                      <TableCell>
                        <span className="table-icon-cell" title={d._os.label}>
                          <QuickIcon icon={d._os.icon} size={16} title={d._os.label} />
                        </span>
                      </TableCell>

                      <TableCell>
                        <span className="table-icon-cell" title={d._arch.label}>
                          <QuickIcon
                            icon={d._arch.icon}
                            size={16}
                            title={d._arch.label}
                          />
                        </span>
                      </TableCell>

                      <TableCell>
                        <div className="table-name">
                          <div className="table-name__top">
                            <RegionFlag
                              region={d._n.region}
                              className="table-flag"
                            />
                            <span className="table-name__text">{d.name}</span>
                          </div>
                          <span className="table-name__sub mono">
                            {!realtimeReady
                              ? t("app.statusLoading")
                              : d._on
                                ? d._uptime
                                : t("app.offline")}
                            {d._price ? ` · ${d._price}` : ""}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="table-chips">
                          {d._n.group ? (
                            <Tag type="blue" size="sm">
                              {d._n.group}
                            </Tag>
                          ) : null}
                          {d._tags.slice(0, 2).map((tag) => (
                            <Tag key={tag} type="gray" size="sm">
                              {tag}
                            </Tag>
                          ))}
                        </div>
                      </TableCell>

                      <TableCell>
                        <MetricCell
                          pct={d._cpu}
                          sub={
                            d._m
                              ? `${d._m.load.load1.toFixed(2)} / ${d._m.load.load5.toFixed(2)} / ${d._m.load.load15.toFixed(2)}`
                              : undefined
                          }
                        />
                      </TableCell>

                      <TableCell>
                        <MetricCell
                          pct={d._ramPct}
                           sub={
                             d._m
                               ? `${formatBytes(d._m.ram.used)} / ${formatBytes(d._n.mem_total || d._m.ram.total)}`
                               : undefined
                          }
                        />
                      </TableCell>

                      <TableCell>
                        <MetricCell
                          pct={d._diskPct}
                           sub={
                             d._m
                               ? `${formatBytes(d._m.disk.used)} / ${formatBytes(d._n.disk_total || d._m.disk.total)}`
                               : undefined
                          }
                        />
                      </TableCell>

                      <TableCell>
                        <MetricCell
                          pct={d._tPct}
                          sub={
                            !d._m
                              ? "—"
                              : d._tLimit > 0
                                ? `${formatBytes(d._tUsed)} / ${formatBytes(d._tLimit)} · ${trafficLimitTypeLabel(d._n.traffic_limit_type)}`
                                : "∞"
                          }
                        />
                      </TableCell>

                      <TableCell>
                        <div className="table-rate-cell">
                          <span className="table-rate-cell__line table-rate__up mono">
                            <ArrowUp size={12} />
                            {d._netUp}
                          </span>
                          <span className="table-rate-cell__line table-rate__down mono">
                            <ArrowDown size={12} />
                            {d._netDown}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        {!realtimeReady ? (
                          <span className="table-ping-cell__empty mono">
                            {t("app.statusLoading")}
                          </span>
                        ) : d._nets.visible.length === 0 ? (
                          <span className="table-ping-cell__empty mono">—</span>
                        ) : (
                          <div className="table-ping-cell">
                            <div className="table-ping-cell__head">
                              <span />
                              <span>{t("metrics.latency")}</span>
                              <span>{t("metrics.loss")}</span>
                            </div>
                            {d._nets.visible.map((point) => (
                              <span
                                key={point.id}
                                className="table-ping-cell__line"
                              >
                                <span
                                  className="table-ping-cell__name"
                                  title={point.name}
                                >
                                  {point.name || point.id}
                                </span>
                                 <span className="table-ping-cell__metric mono">
                                   {formatLatencyMs(point.latencyMs)}
                                </span>
                                <span className="table-ping-cell__metric mono">
                                  {point.lossPct != null
                                    ? `${point.lossPct.toFixed(1)}%`
                                    : "—"}
                                </span>
                              </span>
                            ))}
                            {d._nets.extraCount > 0 ? (
                              <button
                                type="button"
                                className="table-ping-cell__more"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  navigate(`/node/${d.id}#ping-chart`);
                                }}
                                onKeyDown={(event) => event.stopPropagation()}
                                aria-label={t("detail.morePingPoints", {
                                  count: d._nets.extraCount,
                                })}
                              >
                                ... +{d._nets.extraCount}
                              </button>
                            ) : null}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
    </div>
  );
}
