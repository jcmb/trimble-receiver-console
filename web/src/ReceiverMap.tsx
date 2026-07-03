import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import type { ReceiverSnapshot } from "./types";
import { displayReceiverLabel, receiverKey } from "./receiverIdentity";

// @ts-expect-error patch default icons for bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function svUsedTotal(r: ReceiverSnapshot): number {
  if (r.satellites?.length) {
    return r.satellites.filter((s) => s.used_in_position).length;
  }
  if (r.sv_used_by_system) {
    return Object.values(r.sv_used_by_system).reduce((a, b) => a + b, 0);
  }
  return 0;
}

/** Best-effort attribution from common free tile URL patterns (override in UI text via Help). */
function inferTileAttribution(tileUrl: string): string {
  const u = tileUrl.toLowerCase();
  if (u.includes("openstreetmap.org") && !u.includes("opentopomap")) {
    return '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noreferrer">OpenStreetMap</a>';
  }
  if (u.includes("opentopomap.org")) {
    return 'Map data: &copy; OpenStreetMap contributors, SRTM | Style: &copy; <a href="https://opentopomap.org/" rel="noreferrer">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/" rel="noreferrer">CC-BY-SA</a>)';
  }
  if (u.includes("arcgisonline.com") && (u.includes("imagery") || u.includes("world_imagery"))) {
    return "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS user community";
  }
  if (u.includes("usgs.gov")) {
    return "Tiles courtesy of the U.S. Geological Survey";
  }
  return "Map tiles — follow the license for your configured tile URL";
}

function FitBounds({ receivers }: { receivers: ReceiverSnapshot[] }) {
  const map = useMap();
  useEffect(() => {
    const pts = receivers
      .filter((r) => r.online && r.has_llh)
      .map((r) => L.latLng((r.lat_rad * 180) / Math.PI, (r.lon_rad * 180) / Math.PI));
    if (pts.length === 1) {
      map.setView(pts[0]!, 15);
    } else if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
    }
  }, [map, receivers]);
  return null;
}

export function ReceiverMap({
  receivers,
  tileUrl,
  onSelect,
}: {
  receivers: ReceiverSnapshot[];
  tileUrl: string;
  onSelect: (key: string) => void;
}) {
  const withPos = receivers.filter((r) => r.has_llh);
  const center =
    withPos.length > 0
      ? ([(withPos[0]!.lat_rad * 180) / Math.PI, (withPos[0]!.lon_rad * 180) / Math.PI] as [number, number])
      : ([20, 0] as [number, number]);

  const attribution = inferTileAttribution(tileUrl);

  return (
    <MapContainer
      center={center}
      zoom={withPos.length ? 4 : 2}
      className="receiver-map-leaflet"
      style={{ height: "100%", width: "100%", minHeight: 240 }}
      scrollWheelZoom
    >
      <TileLayer attribution={attribution} url={tileUrl} />
      <FitBounds receivers={receivers} />
      {receivers
        .filter((r) => r.has_llh)
        .map((r) => {
          const k = receiverKey(r);
          const latDeg = (r.lat_rad * 180) / Math.PI;
          const lonDeg = (r.lon_rad * 180) / Math.PI;
          const used = svUsedTotal(r);
          const tracked =
            r.satellites && r.satellites.length > 0
              ? r.satellites.length
              : r.sv_tracked_by_system
                ? Object.values(r.sv_tracked_by_system).reduce((a, b) => a + b, 0)
                : 0;
          return (
            <Marker
              key={k}
              position={[latDeg, lonDeg]}
              eventHandlers={{
                click: () => onSelect(k),
              }}
            >
              <Tooltip
                direction="top"
                offset={[0, -36]}
                opacity={0.95}
                className="receiver-map-tooltip"
              >
                <div className="receiver-map-tooltip-inner">
                  <div className="receiver-map-tooltip-title">{displayReceiverLabel(r)}</div>
                  <div>{r.online ? "Online" : "Offline"}</div>
                  {r.has_position_type ? <div>Fix: {r.position_type_label}</div> : null}
                  {r.has_dop ? (
                    <div>
                      PDOP {r.pdop.toFixed(2)} · HDOP {r.hdop.toFixed(2)}
                      {r.has_sigma ? ` · RMS ${r.position_rms_m.toFixed(2)} m` : ""}
                    </div>
                  ) : null}
                  <div>
                    SVs: {used} used
                    {tracked > 0 ? ` · ${tracked} tracked` : ""}
                  </div>
                  <div className="receiver-map-tooltip-muted">
                    {latDeg.toFixed(6)}°, {lonDeg.toFixed(6)}° · H {r.height_m.toFixed(2)} m
                  </div>
                </div>
              </Tooltip>
              <Popup>
                <div>
                  <strong>{displayReceiverLabel(r)}</strong>
                  <br />
                  <button type="button" onClick={() => onSelect(k)}>
                    Open detail
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
    </MapContainer>
  );
}
