/** Format decimal degrees as DMS with hemisphere letter. */
export function toDMS(deg: number, kind: "lat" | "lon", secondsDecimals = 6): string {
  const hemi =
    kind === "lat" ? (deg >= 0 ? "N" : "S") : deg >= 0 ? "E" : "W";
  const x = Math.abs(deg);
  const D = Math.floor(x);
  const minFloat = (x - D) * 60;
  const M = Math.floor(minFloat);
  const S = (minFloat - M) * 60;
  return `${D}° ${M}′ ${S.toFixed(secondsDecimals)}″ ${hemi}`;
}

/** One-line lat/lon in DMS for list cells (radians → degrees internally). */
export function formatLatLonDMS(latRad: number, lonRad: number, secondsDecimals: number): string {
  const lat = (latRad * 180) / Math.PI;
  const lon = (lonRad * 180) / Math.PI;
  return `${toDMS(lat, "lat", secondsDecimals)}, ${toDMS(lon, "lon", secondsDecimals)}`;
}

const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);

/** Ellipsoidal lat/lon (radians) + height (m) → ECEF XYZ (m), WGS84. */
export function llhRadToEcefWgs84(latRad: number, lonRad: number, hM: number): { x: number; y: number; z: number } {
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const x = (n + hM) * cosLat * cosLon;
  const y = (n + hM) * cosLat * sinLon;
  const z = (n * (1 - WGS84_E2) + hM) * sinLat;
  return { x, y, z };
}

/** Multi-line string for `title` tooltips: decimal LLH + ECEF. */
export function positionHoverText(latRad: number, lonRad: number, hM: number): string {
  const latDeg = (latRad * 180) / Math.PI;
  const lonDeg = (lonRad * 180) / Math.PI;
  const { x, y, z } = llhRadToEcefWgs84(latRad, lonRad, hM);
  return [
    `Decimal WGS84: ${latDeg.toFixed(6)}°, ${lonDeg.toFixed(6)}°, ${hM.toFixed(3)} m (ellipsoidal)`,
    `ECEF WGS84 (m): X=${x.toFixed(3)}, Y=${y.toFixed(3)}, Z=${z.toFixed(3)}`,
  ].join("\n");
}
