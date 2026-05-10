import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { SVInfo } from "./types";
import { SV_SYSTEM_NAMES, sysIndex, trackedSatellitesForSky } from "./svSkyShared";

type SortCol = "system" | "prn" | "elev" | "azim" | "cn0" | "position" | "rtk";

function cmpTie(a: SVInfo, b: SVInfo): number {
  const ia = sysIndex(a);
  const ib = sysIndex(b);
  if (ia !== ib) return ia - ib;
  return a.prn - b.prn;
}

function compareSv(a: SVInfo, b: SVInfo, col: SortCol, asc: boolean): number {
  let v = 0;
  switch (col) {
    case "system":
      v = SV_SYSTEM_NAMES[sysIndex(a)].localeCompare(SV_SYSTEM_NAMES[sysIndex(b)]);
      break;
    case "prn":
      v = a.prn - b.prn;
      break;
    case "elev":
      v = a.elevation_deg - b.elevation_deg;
      break;
    case "azim":
      v = a.azimuth_deg - b.azimuth_deg;
      break;
    case "cn0":
      v = a.cn0_db_hz - b.cn0_db_hz;
      break;
    case "position":
      v = Number(a.used_in_position) - Number(b.used_in_position);
      break;
    case "rtk":
      v = Number(a.used_in_rtk) - Number(b.used_in_rtk);
      break;
    default:
      v = 0;
  }
  if (v !== 0) {
    return asc ? v : -v;
  }
  return cmpTie(a, b);
}

export function SVTrackingCard({ svs }: { svs: SVInfo[] }) {
  const tracked = useMemo(() => trackedSatellitesForSky(svs), [svs]);

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

  const [sortCol, setSortCol] = useState<SortCol>("elev");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    if (panelTab === "all") return;
    if (typeof panelTab === "number" && !activeSysIndices.includes(panelTab)) {
      setPanelTab("all");
    }
  }, [panelTab, activeSysIndices]);

  const filteredList = useMemo(() => {
    if (panelTab === "all") return tracked;
    return tracked.filter((sv) => sysIndex(sv) === panelTab);
  }, [tracked, panelTab]);

  const sortedList = useMemo(() => {
    const arr = filteredList.slice();
    arr.sort((a, b) => compareSv(a, b, sortCol, sortAsc));
    return arr;
  }, [filteredList, sortCol, sortAsc]);

  function onSort(col: SortCol) {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(col === "system" || col === "position");
    }
  }

  const btnReset: CSSProperties = {
    background: "none",
    border: "none",
    padding: "6px 10px 8px 0",
    margin: 0,
    font: "inherit",
    fontWeight: 500,
    fontSize: 11,
    color: "var(--app-muted)",
    cursor: "pointer",
    textAlign: "inherit",
    whiteSpace: "nowrap",
    width: "100%",
  };

  const th: CSSProperties = {
    textAlign: "left",
    fontWeight: 500,
    fontSize: 11,
    color: "var(--app-muted)",
    padding: 0,
    borderBottom: "1px solid var(--table-border)",
    whiteSpace: "nowrap",
    verticalAlign: "bottom",
  };

  const sortMark = (col: SortCol) => (sortCol === col ? (sortAsc ? " ↑" : " ↓") : "");

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
        Same fields as the sky plot hover. Tabs list only constellations with at least one satellite in view. Click a
        column header to sort.
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
              <th style={{ ...th, textAlign: "left" }}>
                <button type="button" style={{ ...btnReset, textAlign: "left" }} onClick={() => onSort("system")}>
                  System{sortMark("system")}
                </button>
              </th>
              <th style={{ ...th, textAlign: "right", paddingLeft: 8 }}>
                <button type="button" style={{ ...btnReset, textAlign: "right", paddingLeft: 8 }} onClick={() => onSort("prn")}>
                  PRN{sortMark("prn")}
                </button>
              </th>
              <th style={{ ...th, textAlign: "right", paddingLeft: 8 }}>
                <button type="button" style={{ ...btnReset, textAlign: "right", paddingLeft: 8 }} onClick={() => onSort("elev")}>
                  Elev°{sortMark("elev")}
                </button>
              </th>
              <th style={{ ...th, textAlign: "right", paddingLeft: 8 }}>
                <button type="button" style={{ ...btnReset, textAlign: "right", paddingLeft: 8 }} onClick={() => onSort("azim")}>
                  Azim°{sortMark("azim")}
                </button>
              </th>
              <th style={{ ...th, textAlign: "right", paddingLeft: 8 }}>
                <button type="button" style={{ ...btnReset, textAlign: "right", paddingLeft: 8 }} onClick={() => onSort("cn0")}>
                  C/N₀{sortMark("cn0")}
                </button>
              </th>
              <th style={{ ...th, paddingLeft: 12 }}>
                <button type="button" style={{ ...btnReset, textAlign: "left", paddingLeft: 12 }} onClick={() => onSort("position")}>
                  Position{sortMark("position")}
                </button>
              </th>
              <th style={{ ...th, paddingLeft: 12 }}>
                <button type="button" style={{ ...btnReset, textAlign: "left", paddingLeft: 12 }} onClick={() => onSort("rtk")}>
                  RTK{sortMark("rtk")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedList.map((sv) => {
              const si = sysIndex(sv);
              return (
                <tr key={`${si}-${sv.prn}`}>
                  <td style={td}>{SV_SYSTEM_NAMES[si]}</td>
                  <td style={tdNum}>{sv.prn}</td>
                  <td style={tdNum}>{sv.elevation_deg.toFixed(0)}</td>
                  <td style={tdNum}>{sv.azimuth_deg.toFixed(0)}</td>
                  <td style={tdNum}>{sv.cn0_db_hz.toFixed(1)}</td>
                  <td style={{ ...td, paddingLeft: 12 }}>{sv.used_in_position ? "Used" : "Not used"}</td>
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
