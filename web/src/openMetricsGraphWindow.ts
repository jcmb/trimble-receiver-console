import type { MetricsPanelId } from "./metricsSeries";

export function metricsGraphUrl(
  panel: MetricsPanelId,
  groupId: string,
  receiverKey: string,
  receiverLabel?: string,
): string {
  const params = new URLSearchParams({
    group: groupId,
    receiver: receiverKey,
  });
  if (receiverLabel) params.set("label", receiverLabel);
  return `/graph/${panel}?${params.toString()}`;
}

/** Open a metrics graph in a compact popup window. */
export function openMetricsGraphWindow(
  panel: MetricsPanelId,
  groupId: string,
  receiverKey: string,
  receiverLabel?: string,
): void {
  const url = metricsGraphUrl(panel, groupId, receiverKey, receiverLabel);
  const w = Math.min(
    Math.max(520, Math.round(window.outerWidth * 0.56)),
    Math.round(window.screen.availWidth * 0.52),
  );
  const h = Math.min(
    Math.max(440, Math.round(window.outerHeight * 0.62)),
    Math.round(window.screen.availHeight * 0.58),
  );
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2));
  const top = Math.max(0, Math.round(window.screenY + 48));
  // Do not pass noopener/noreferrer here — browsers then ignore size and open a full tab.
  const features = [
    `width=${w}`,
    `height=${h}`,
    `left=${left}`,
    `top=${top}`,
    "menubar=no",
    "toolbar=no",
    "location=no",
    "status=no",
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");
  const name = `trimble-graph-${panel}-${receiverKey}`;
  const popup = window.open(url, name, features);
  if (popup) {
    popup.opener = null;
    popup.focus();
  }
}
