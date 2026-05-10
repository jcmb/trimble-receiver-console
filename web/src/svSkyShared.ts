import type { SVInfo } from "./types";

export const SV_SYSTEM_NAMES = ["GPS", "SBAS", "GLO", "Gal", "QZSS", "BDS"] as const;

export function sysIndex(sv: SVInfo): number {
  const n = SV_SYSTEM_NAMES.length;
  return ((sv.system % n) + n) % n;
}

/** Same eligibility filter as the sky plot (exclude placeholder-only rows). */
export function trackedSatellitesForSky(svs: SVInfo[]): SVInfo[] {
  const out: SVInfo[] = [];
  for (const sv of svs) {
    if (sv.elevation_deg <= 0 && sv.azimuth_deg <= 0 && !sv.used_in_position) {
      continue;
    }
    out.push(sv);
  }
  return out;
}

export type SvDetailRow = { label: string; value: string };

/** Rows matching the sky-plot hover tooltip (structured for the tracking card). */
export function svDetailRows(sv: SVInfo): SvDetailRow[] {
  const sys = SV_SYSTEM_NAMES[sysIndex(sv)] ?? "?";
  const rows: SvDetailRow[] = [
    { label: "SV", value: `${sys} PRN ${sv.prn}` },
    {
      label: "Elevation · Azimuth",
      value: `${sv.elevation_deg.toFixed(0)}° · ${sv.azimuth_deg.toFixed(0)}°`,
    },
    { label: "C/N₀", value: `${sv.cn0_db_hz.toFixed(1)} dB-Hz` },
    {
      label: "Position",
      value: sv.used_in_position ? "Used in position" : "Not used in position",
    },
  ];
  if (sv.used_in_rtk) {
    rows.push({ label: "RTK", value: "Used in RTK" });
  }
  return rows;
}

/** Tooltip text — must stay aligned with `svDetailRows`. */
export function svTooltipText(sv: SVInfo): string {
  const sys = SV_SYSTEM_NAMES[sysIndex(sv)] ?? "?";
  const lines = [
    `${sys} PRN ${sv.prn}`,
    `Elevation ${sv.elevation_deg.toFixed(0)}° · Azimuth ${sv.azimuth_deg.toFixed(0)}°`,
    `C/N₀ ${sv.cn0_db_hz.toFixed(1)} dB-Hz`,
    sv.used_in_position ? "Used in position" : "Not used in position",
  ];
  if (sv.used_in_rtk) {
    lines.push("Used in RTK");
  }
  return lines.join("\n");
}
