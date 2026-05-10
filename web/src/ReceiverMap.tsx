import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import type { ReceiverSnapshot } from "./types";

// @ts-expect-error patch default icons for bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

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

  return (
    <MapContainer center={center} zoom={withPos.length ? 4 : 2} style={{ height: 380, width: "100%" }}>
      <TileLayer attribution="&copy; OpenStreetMap" url={tileUrl} />
      <FitBounds receivers={receivers} />
      {receivers
        .filter((r) => r.has_llh)
        .map((r) => {
          const k = r.serial || `anon:${r.remote_addr}`;
          return (
            <Marker
              key={k}
              position={[(r.lat_rad * 180) / Math.PI, (r.lon_rad * 180) / Math.PI]}
              eventHandlers={{
                click: () => onSelect(k),
              }}
            >
              <Popup>
                <div>
                  <strong>{r.serial || "unknown serial"}</strong>
                  <br />
                  <button type="button" onClick={() => onSelect(k)}>
                    Details
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
    </MapContainer>
  );
}
