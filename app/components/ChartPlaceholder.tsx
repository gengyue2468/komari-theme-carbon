export function ChartPlaceholder() {
  return (
    <div className="detail-chart-placeholder" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <span className="placeholder-solid" key={index} />
      ))}
    </div>
  );
}

export function LoadPlaceholder() {
  return (
    <div className="detail-load-placeholder" aria-hidden="true">
      <div className="detail-load-placeholder__toolbar placeholder-accent" />
      <ChartPlaceholder />
    </div>
  );
}

export function LatencyPlaceholder({
  variant = "full",
}: {
  variant?: "full" | "body" | "chart";
}) {
  if (variant === "chart") {
    return (
      <div className="detail-latency-placeholder__chart placeholder-accent" aria-hidden="true" />
    );
  }

  return (
    <div
      className={`detail-latency-placeholder detail-latency-placeholder--${variant}`}
      aria-hidden="true"
    >
      {variant === "full" ? (
        <div className="detail-latency-placeholder__toolbar">
          <span className="placeholder-accent" />
          <span className="placeholder-accent" />
        </div>
      ) : null}
      <div className="detail-latency-placeholder__tasks">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="detail-latency-placeholder__task" key={index}>
            <span className="placeholder-accent" />
            <div className="detail-latency-placeholder__task-body">
              <span className="placeholder-accent" />
              <span className="placeholder-accent" />
            </div>
          </div>
        ))}
      </div>
      <div className="detail-latency-placeholder__main">
        <div className="detail-latency-placeholder__chart placeholder-accent" />
      </div>
    </div>
  );
}
