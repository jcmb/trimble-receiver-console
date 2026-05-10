/**
 * Labels for the 2-character ANTENNA TYPE field in DCOL **07h RET SERIAL** (payload bytes 43–44),
 * per Trimble OEM ICD for that message (ASCII pair).
 *
 * This is **not** the full Trimble `antenna.ini` catalog (thousands of RINEX / calibration entries).
 * That database is published in vendor tools and mirrors such as
 * https://trimbletools.com/Antenna_DB/8.11.html — those rows map RINEX antenna names to calibration
 * data, not necessarily these 2-character RET SERIAL codes.
 *
 * ICD explicitly documents:
 * - `E` — unknown external antenna
 * - `KS` — Zephyr Model 2
 * - `GS` — Zephyr Geodetic
 */
export const TRIMBLE_RET_SERIAL_ANTENNA_TYPE: Record<string, string> = {
  E: "Unknown external antenna",
  KS: "Zephyr Model 2",
  GS: "Zephyr Geodetic",
};

/** Human-readable antenna type for RET SERIAL; falls back to raw code if unknown. */
export function trimbleRetSerialAntennaLabel(code: string | undefined): string {
  const raw = code?.trim();
  if (!raw) return "—";
  const key = raw.toUpperCase();
  const label = TRIMBLE_RET_SERIAL_ANTENNA_TYPE[key];
  if (label) return `${label} (${key})`;
  return raw;
}
