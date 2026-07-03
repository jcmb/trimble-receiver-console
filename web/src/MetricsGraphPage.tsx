import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { MetricsPanelChart } from "./MetricsPanelChart";
import { clearReceiverMetricsHistory, ingestReceiverMetricsSamples, type ReceiverMetricsSample } from "./receiverMetricsHistory";
import { isMetricsPanelId, PANEL_TITLES } from "./metricsSeries";
import { receiverKey } from "./receiverIdentity";
import { useGroupReceiverStream } from "./useGroupReceiverStream";
import { useReceiverMetricsHistory } from "./useReceiverMetricsHistory";

export function MetricsGraphPage() {
  const { panel: panelParam } = useParams<{ panel: string }>();
  const [search] = useSearchParams();
  const groupId = search.get("group");
  const receiverKeyParam = search.get("receiver");
  const receiverLabel = search.get("label") ?? receiverKeyParam ?? "Receiver";

  const panel = panelParam && isMetricsPanelId(panelParam) ? panelParam : null;
  const receivers = useGroupReceiverStream(groupId);
  const [paused, setPaused] = useState(false);
  const [frozenSamples, setFrozenSamples] = useState<ReceiverMetricsSample[]>([]);

  const liveSamples = useReceiverMetricsHistory(receiverKeyParam ?? "");

  useEffect(() => {
    if (paused) return;
    ingestReceiverMetricsSamples(receivers);
  }, [receivers, paused]);

  const chartSamples = paused ? frozenSamples : liveSamples;

  const togglePause = useCallback(() => {
    setPaused((wasPaused) => {
      if (wasPaused) return false;
      setFrozenSamples(liveSamples.slice());
      return true;
    });
  }, [liveSamples]);
  const current = useMemo(
    () =>
      receiverKeyParam
        ? receivers.find((r) => receiverKey(r) === receiverKeyParam) ?? null
        : null,
    [receivers, receiverKeyParam],
  );

  useEffect(() => {
    if (!panel) return;
    document.title = `${receiverLabel} — ${PANEL_TITLES[panel]}`;
  }, [panel, receiverLabel]);

  if (!panel || !groupId || !receiverKeyParam) {
    return (
      <div className="metrics-graph-page">
        <header className="metrics-graph-page-header panel">
          <strong>Invalid graph link</strong>
          <Link to="/">Back to console</Link>
        </header>
        <main className="panel metrics-graph-page-body">
          <p className="muted">This graph URL is missing required parameters.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="metrics-graph-page">
      <header className="metrics-graph-page-header panel">
        <div>
          <h1 className="metrics-graph-page-title">{PANEL_TITLES[panel]}</h1>
          <p className="muted metrics-graph-page-sub">
            {receiverLabel}
            {current?.has_position_type
              ? ` · ${current.position_type_label} (${current.position_type})`
              : ""}
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            className="nav-tab"
            onClick={() => clearReceiverMetricsHistory(receiverKeyParam)}
            title="Clear history for this receiver in this window (session only)"
          >
            Clear history
          </button>
        </div>
      </header>
      <main className="panel metrics-graph-page-body">
        <MetricsPanelChart
          panel={panel}
          samples={chartSamples}
          frozen={paused}
          paused={paused}
          onTogglePause={togglePause}
        />
      </main>
    </div>
  );
}
