import { useSyncExternalStore } from "react";
import {
  getReceiverMetricsHistory,
  subscribeReceiverMetricsHistory,
  type ReceiverMetricsSample,
} from "./receiverMetricsHistory";

export function useReceiverMetricsHistory(receiverKey: string): ReceiverMetricsSample[] {
  return useSyncExternalStore(
    subscribeReceiverMetricsHistory,
    () => getReceiverMetricsHistory(receiverKey),
    () => getReceiverMetricsHistory(receiverKey),
  );
}
