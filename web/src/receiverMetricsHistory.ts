import type { ReceiverSnapshot } from "./types";
import { receiverKey } from "./receiverIdentity";

export type ReceiverMetricsSample = {
  /** Wall-clock ms when the sample was recorded. */
  at: number;
  has_position_type: boolean;
  position_type?: number;
  position_type_label?: string;
  has_llh: boolean;
  lat_deg?: number;
  lon_deg?: number;
  height_m?: number;
  has_sigma: boolean;
  sigma_east_m?: number;
  sigma_north_m?: number;
  sigma_up_m?: number;
  position_rms_m?: number;
  has_dop: boolean;
  pdop?: number;
  hdop?: number;
  vdop?: number;
  tdop?: number;
  has_velocity: boolean;
  horizontal_vel_ms?: number;
  vertical_vel_ms?: number;
  heading_deg?: number;
  has_vector: boolean;
  common_l1_svs?: number;
  common_l2_svs?: number;
  datalink_latency_s?: number;
  diff_svs_in_use?: number;
  rtk_position_age?: number;
  link_integrity_pct?: number;
  has_sv_info: boolean;
  sv_used_by_system?: Record<string, number>;
  sv_tracked_by_system?: Record<string, number>;
  sv_used_total?: number;
  sv_tracked_total?: number;
};

const MAX_SAMPLES = 2000;
const MAX_AGE_MS = 60 * 60 * 1000;
const MIN_SAMPLE_GAP_MS = 500;

const store = new Map<string, ReceiverMetricsSample[]>();
const listeners = new Set<() => void>();
const EMPTY_HISTORY: ReceiverMetricsSample[] = [];

function notify() {
  for (const fn of listeners) {
    fn();
  }
}

function trimSamples(arr: ReceiverMetricsSample[], now: number): ReceiverMetricsSample[] {
  const cutoff = now - MAX_AGE_MS;
  const out = arr.filter((s) => s.at >= cutoff);
  if (out.length > MAX_SAMPLES) {
    return out.slice(out.length - MAX_SAMPLES);
  }
  return out;
}

function svInfoFromReceiver(r: ReceiverSnapshot): {
  has: boolean;
  used?: Record<string, number>;
  tracked?: Record<string, number>;
  usedTotal?: number;
  trackedTotal?: number;
} {
  const usedMap = r.sv_used_by_system;
  const trackedMap = r.sv_tracked_by_system;
  if (
    (usedMap && Object.keys(usedMap).length > 0) ||
    (trackedMap && Object.keys(trackedMap).length > 0)
  ) {
    const used = usedMap ? { ...usedMap } : {};
    const tracked = trackedMap ? { ...trackedMap } : {};
    return {
      has: true,
      used,
      tracked,
      usedTotal: Object.values(used).reduce((a, b) => a + b, 0),
      trackedTotal: Object.values(tracked).reduce((a, b) => a + b, 0),
    };
  }
  const sats = r.satellites;
  if (sats?.length) {
    return {
      has: true,
      usedTotal: sats.filter((s) => s.used_in_position).length,
      trackedTotal: sats.length,
    };
  }
  return { has: false };
}

function sampleFromReceiver(r: ReceiverSnapshot, at: number): ReceiverMetricsSample {
  const d = r.vector?.diagnostics;
  const sv = svInfoFromReceiver(r);
  const hasVector = !!(
    d &&
    (d.common_l1_svs != null ||
      d.common_l2_svs != null ||
      d.datalink_latency_s != null ||
      d.diff_svs_in_use != null ||
      d.rtk_position_age != null ||
      d.link_integrity_pct != null)
  );
  return {
    at,
    has_position_type: r.has_position_type,
    position_type: r.has_position_type ? r.position_type : undefined,
    position_type_label: r.has_position_type ? r.position_type_label : undefined,
    has_llh: r.has_llh,
    lat_deg: r.has_llh ? (r.lat_rad * 180) / Math.PI : undefined,
    lon_deg: r.has_llh ? (r.lon_rad * 180) / Math.PI : undefined,
    height_m: r.has_llh ? r.height_m : undefined,
    has_sigma: r.has_sigma,
    sigma_east_m: r.has_sigma ? r.sigma_east_m : undefined,
    sigma_north_m: r.has_sigma ? r.sigma_north_m : undefined,
    sigma_up_m: r.has_sigma ? r.sigma_up_m : undefined,
    position_rms_m: r.has_sigma ? r.position_rms_m : undefined,
    has_dop: r.has_dop,
    pdop: r.has_dop ? r.pdop : undefined,
    hdop: r.has_dop ? r.hdop : undefined,
    vdop: r.has_dop ? r.vdop : undefined,
    tdop: r.has_dop ? r.tdop : undefined,
    has_velocity: r.has_velocity,
    horizontal_vel_ms: r.has_velocity ? r.horizontal_vel_ms : undefined,
    vertical_vel_ms: r.has_velocity ? r.vertical_vel_ms : undefined,
    heading_deg: r.has_velocity ? (r.heading_rad * 180) / Math.PI : undefined,
    has_vector: hasVector,
    common_l1_svs: hasVector ? d!.common_l1_svs : undefined,
    common_l2_svs: hasVector ? d!.common_l2_svs : undefined,
    datalink_latency_s: hasVector ? d!.datalink_latency_s : undefined,
    diff_svs_in_use: hasVector ? d!.diff_svs_in_use : undefined,
    rtk_position_age: hasVector ? d!.rtk_position_age : undefined,
    link_integrity_pct: hasVector ? d!.link_integrity_pct : undefined,
    has_sv_info: sv.has,
    sv_used_by_system: sv.used,
    sv_tracked_by_system: sv.tracked,
    sv_used_total: sv.usedTotal,
    sv_tracked_total: sv.trackedTotal,
  };
}

function hasAnyData(s: ReceiverMetricsSample): boolean {
  return (
    s.has_position_type ||
    s.has_llh ||
    s.has_sigma ||
    s.has_dop ||
    s.has_velocity ||
    s.has_vector ||
    s.has_sv_info
  );
}

/** Record metric samples from the latest receiver snapshots (WebSocket tick). */
export function ingestReceiverMetricsSamples(receivers: ReceiverSnapshot[]) {
  const now = Date.now();
  let changed = false;
  for (const r of receivers) {
    const next = sampleFromReceiver(r, now);
    if (!hasAnyData(next)) continue;
    const key = receiverKey(r);
    const prev = store.get(key);
    const last = prev?.[prev.length - 1];
    if (last && now - last.at < MIN_SAMPLE_GAP_MS) continue;
    const updated = trimSamples([...(prev ?? []), next], now);
    store.set(key, updated);
    changed = true;
  }
  if (changed) notify();
}

export function getReceiverMetricsHistory(key: string): ReceiverMetricsSample[] {
  if (!key) return EMPTY_HISTORY;
  return store.get(key) ?? EMPTY_HISTORY;
}

export function clearReceiverMetricsHistory(key: string) {
  if (!store.has(key)) return;
  store.delete(key);
  notify();
}

export function subscribeReceiverMetricsHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
