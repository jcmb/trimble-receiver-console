import type { ReactNode } from "react";
import { openMetricsGraphWindow } from "./openMetricsGraphWindow";
import { PANEL_LINK_LABELS, type MetricsPanelId } from "./metricsSeries";

export type MetricGraphContext = {
  groupId: string;
  receiverKey: string;
  receiverLabel: string;
};

type Props = MetricGraphContext & {
  panel: MetricsPanelId;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
};

/** Clickable field label that opens the graph window for that metric group. */
export function MetricGraphLabel({
  panel,
  groupId,
  receiverKey,
  receiverLabel,
  children,
  className,
  style,
  disabled,
}: Props) {
  if (!groupId || disabled) {
    return (
      <span className={className} style={style}>
        {children}
      </span>
    );
  }
  return (
    <a
      href="#"
      role="button"
      className={`metric-graph-link${className ? ` ${className}` : ""}`}
      style={style}
      title={`Open ${PANEL_LINK_LABELS[panel]} graph in new window`}
      onClick={(e) => {
        e.preventDefault();
        openMetricsGraphWindow(panel, groupId, receiverKey, receiverLabel);
      }}
    >
      {children}
    </a>
  );
}
