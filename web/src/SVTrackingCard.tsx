import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { SVInfo } from "./types";
import { SV_SYSTEM_NAMES, sysIndex, trackedSatellitesForSky } from "./svSkyShared";

function cmpSkySv(a: SVInfo, b: SVInfo): number {
  if (b.elevation_deg !== a.elevation_deg) {
    return b.elevation_deg - a.elevation_deg;
  }
  const ia = sysIndex(a);
  const ib = sysIndex(b);
  if (ia !== ib) return ia - ib;
  return a.prn - b.prn;
}

export function SVTrackingCard({ svs }: { svs: SVInfo[] }) {
  const tracked = useMemo(() => trackedSatellitesForSky(svs).slice().sort(cmpSkySv), [svs]);

  const activeSysIndices = useMemo(() => {
    const seen = new Set<number>();
    const ordered: number[] = [];
    for (const sv of tracked) {
      const i = sysIndex(sv);
      if (!seen.has(i)) {
        seen.add(i);
        ordered.push(i);
      }
    }
    return ordered;
  }, [tracked]);

  type PanelTab = "all" | number;
  const [panelTab, setPanelTab] = useState<PanelTab>("all");

  useEffect(() => {
    if (panelTab === "all") return;
    if (typeof panelTab === "number" && !activeSysIndices.includes(panelTab)) {
      setPanelTab("all");
    }
  }, [panelTab, activeSysIndices]);

  const visibleList = useMemo(() => {
    if (panelTab === "all") return tracked;
    return tracked.filter((sv) => sysIndex(sv) === panelTab);
  }, [tracked, panelTab]);

  const th: CSSProperties = {
    textAlign: "left",
    fontWeight: 500,
    fontSize: 11,
    color: "var(--app-muted)",
    padding: "6px 10px 8px 0",
    borderBottom: "1px solid var(--table-border)",
    whiteSpace: "nowrap",
  };
  const thNum: CSSProperties = { ...th, textAlign: "right", paddingLeft: 8 };
  const td: CSSProperties = {
    padding: "6px 10px 6px 0",
    fontSize: 13,
    verticalAlign: "middle",
    borderBottom: "1px solid var(--table-border)",
  };
  const tdNum: CSSProperties = {
    ...td,
    textAlign: "right",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    paddingLeft: 8,
  };
  const tdMono: CSSProperties = {
    ...td,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  };

  if (tracked.length === 0) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        No satellites with usable geometry in this snapshot (same filter as the sky plot).
      </p>
    );
  }

  return (
    <>
      <p style={{ fontSize: 12, color: "var(--app-muted)", margin: "0 0 12px", lineHeight: 1.4 }}>
        Same fields as the sky plot hover. Tabs list only constellations with at least one satellite in view.
      </p>
      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          className={`nav-tab${panelTab === "all" ? " active" : ""}`}
          onClick={() => setPanelTab("all")}
        >
          All
        </button>
        {activeSysIndices.map((i) => (
          <button
            key={SV_SYSTEM_NAMES[i]}
            type="button"
            className={`nav-tab${panelTab === i ? " active" : ""}`}
            onClick={() => setPanelTab(i)}
          >
            {SV_SYSTEM_NAMES[i]}
          </button>
        ))}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", margin: 0 }}>
          <thead>
            <tr>
              <th style={th}>System</th>
              <th style={{ ...th, textAlign: "right" }}>PRN</th>
              <th style={thNum}>Elev°</th>
              <th style={thNum}>Azim°</th>
              <th style={thNum}>C/N₀</th>
              <th style={{ ...th, paddingLeft: 12 }}>Position</th>
              <th style={{ ...th, paddingLeft: 12 }}>RTK</th>
            </tr>
          </thead>
          <tbody>
            {visibleList.map((sv) => {
              const si = sysIndex(sv);
              return (
                <tr key={`${si}-${sv.prn}`}>
                  <td style={td}>{SV_SYSTEM_NAMES[si]}</td>
                  <td style={tdNum}>{sv.prn}</td>
                  <td style={tdNum}>{sv.elevation_deg.toFixed(0)}</td>
                  <td style={tdNum}>{sv.azimuth_deg.toFixed(0)}</td>
                  <td style={tdNum}>{sv.cn0_db_hz.toFixed(1)}</td>
                  <td style={{ ...td, paddingLeft: 12 }}>
                    {sv.used_in_position ? "Used" : "Not used"}
                  </td>
                  <td style={{ ...tdMono, paddingLeft: 12 }}>{sv.used_in_rtk ? "Yes" : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
