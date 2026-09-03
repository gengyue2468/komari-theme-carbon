import { InformationFilled } from "@carbon/icons-react";
import { DefinitionTooltip } from "@carbon/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatLatencyMs } from "~/lib/ping-display";

interface InfoTipProps {
  label: string;
  description: ReactNode;
}

export function InfoTip({ label, description }: InfoTipProps) {
  return (
    <DefinitionTooltip
      align="top"
      autoAlign
      className="info-tip"
      definition={<span className="info-tip__content">{description}</span>}
      openOnHover
      triggerClassName="info-tip__trigger"
      aria-label={label}
    >
      <InformationFilled size={12} aria-hidden />
    </DefinitionTooltip>
  );
}

function pingAssessment(
  point: { latencyMs: number | null; lossPct?: number },
): "stable" | "highLatency" | "packetLoss" | "unavailable" {
  if (point.lossPct != null && point.lossPct >= 5) return "packetLoss";
  if (point.latencyMs == null || point.latencyMs < 0) return "unavailable";
  if (point.latencyMs >= 200) return "highLatency";
  return "stable";
}

export function PingPointInfo({
  point,
  hasHistory,
}: {
  point: { latencyMs: number | null; lossPct?: number };
  hasHistory: boolean;
}) {
  const { t } = useTranslation();
  const loss = point.lossPct != null ? `${point.lossPct.toFixed(1)}%` : "—";
  const assessment = pingAssessment(point);

  return (
    <span className="ping-info-tip">
      <span>
        {hasHistory ? t("detail.pingWindow", { hours: 1 }) : t("detail.pingLatest")}
      </span>
      <span>
        {t("metrics.latency")}: {formatLatencyMs(point.latencyMs)}
      </span>
      <span>
        {t("metrics.loss")}: {loss}
      </span>
      <span className="ping-info-tip__assessment">
        {t(`detail.pingAssessment.${assessment}`)}
      </span>
    </span>
  );
}
