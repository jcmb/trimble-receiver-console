import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { SVInfo } from "./types";
import { SV_SYSTEM_NAMES, sysIndex, trackedSatellitesForSky } from "./svSkyShared";

type SortCol =
  | "system"
  | "prn"
  | "elev"
  | "azim"
  | "position"
  | "rtk"
  | "l1cn"
  | "l1tr"
  | "l2cn"
  | "l2tr"
  | "l5cn"
  | "l5tr";

function cmpTie(a: SVInfo, b: SVInfo): number {
  const ia = sysIndex(a);
  const ib = sysIndex(b);
  if (ia !== ib) return ia - ib;
  return a.prn - b.prn;
}

function fmtL1Cn(sv: SVInfo): string {
  return sv.cn0_db_hz.toFixed(1);
}

function fmtL2Cn(sv: SVInfo): string {
  return sv.cn0_l2_db_hz != null ? sv.cn0_l2_db_hz.toFixed(1) : "—";
}

function fmtL5Cn(sv: SVInfo): string {
  return sv.cn0_l56_db_hz != null ? sv.cn0_l56_db_hz.toFixed(1) : "—";
}

function dispTrack(s: string | undefined): string {
  const t = s?.trim();
  return t ? t : "—";
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
    case "position":
      v = Number(a.used_in_position) - Number(b.used_in_position);
      break;
    case "rtk":
      v = Number(a.used_in_rtk) - Number(b.used_in_rtk);
      break;
    case "l1cn":
      v = fmtL1Cn(a).localeCompare(fmtL1Cn(b));
      break;
    case "l1tr":
      v = dispTrack(a.track_l1).localeCompare(dispTrack(b.track_l1));
      break;
    case "l2cn":
      v = fmtL2Cn(a).localeCompare(fmtL2Cn(b));
      break;
    case "l2tr":
      v = dispTrack(a.track_l2).localeCompare(dispTrack(b.track_l2));
      break;
    case "l5cn":
      v = fmtL5Cn(a).localeCompare(fmtL5Cn(b));
      break;
    case "l5tr":
      v = dispTrack(a.track_l5).localeCompare(dispTrack(b.track_l5));
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
      setSortAsc(col === "system" || col === "position" || col === "l1tr" || col === "l2tr" || col === "l5tr");
    }
  }

  const btnReset: CSSProperties = {
    background: "none",
    border: "none",
    padding: "6px 8px 8px",
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
    padding: "6px 8px 6px 0",
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
    fontSize: 12,
  };

  /** Tracking codes — isolate from numeric C/N₀ columns so long labels do not visually bleed */
  const tdTrack: CSSProperties = {
    ...tdMono,
    maxWidth: "7.5rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const groupTh: CSSProperties = {
    ...th,
    textAlign: "center",
    borderLeft: "1px solid var(--table-border)",
    padding: "6px 4px",
    fontSize: 11,
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
        GSOF ALL SV detail (records 48 or 34): one C/N₀ value per frequency column when the extended 10-byte SV row is present. Tracking codes
        come from SV Flags2 (constellation-specific). The <strong>L5</strong> column includes Galileo E5/E6-class signals
        (E6 shares this column). Click a column header to sort.
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
              <th rowSpan={2} style={th}>
                <button type="button" style={{ ...btnReset, textAlign: "left" }} onClick={() => onSort("system")}>
                  System{sortMark("system")}
                </button>
              </th>
              <th rowSpan={2} style={{ ...th, textAlign: "right", paddingLeft: 8 }}>
                <button type="button" style={{ ...btnReset, textAlign: "right", paddingLeft: 8 }} onClick={() => onSort("prn")}>
                  PRN{sortMark("prn")}
                </button>
              </th>
              <th rowSpan={2} style={{ ...th, textAlign: "right", paddingLeft: 8 }}>
                <button type="button" style={{ ...btnReset, textAlign: "right", paddingLeft: 8 }} onClick={() => onSort("elev")}>
                  Elev°{sortMark("elev")}
                </button>
              </th>
              <th rowSpan={2} style={{ ...th, textAlign: "right", paddingLeft: 8 }}>
                <button type="button" style={{ ...btnReset, textAlign: "right", paddingLeft: 8 }} onClick={() => onSort("azim")}>
                  Azim°{sortMark("azim")}
                </button>
              </th>
              <th rowSpan={2} style={{ ...th, paddingLeft: 10 }}>
                <button type="button" style={{ ...btnReset, textAlign: "left", paddingLeft: 10 }} onClick={() => onSort("position")}>
                  Position{sortMark("position")}
                </button>
              </th>
              <th rowSpan={2} style={{ ...th, paddingLeft: 10 }}>
                <button type="button" style={{ ...btnReset, textAlign: "left", paddingLeft: 10 }} onClick={() => onSort("rtk")}>
                  RTK{sortMark("rtk")}
                </button>
              </th>
              <th colSpan={2} style={{ ...groupTh, borderLeft: "1px solid var(--table-border)" }}>
                L1
              </th>
              <th colSpan={2} style={groupTh}>
                L2
              </th>
              <th colSpan={2} style={groupTh}>
                L5
              </th>
            </tr>
            <tr>
              <th style={{ ...th, textAlign: "center", borderLeft: "1px solid var(--table-border)", padding: "4px 6px" }}>
                <button type="button" style={{ ...btnReset, textAlign: "center" }} onClick={() => onSort("l1tr")}>
                  Tracking{sortMark("l1tr")}
                </button>
              </th>
              <th style={{ ...th, textAlign: "center", padding: "4px 6px" }}>
                <button type="button" style={{ ...btnReset, textAlign: "center" }} onClick={() => onSort("l1cn")}>
                  C/N₀{sortMark("l1cn")}
                </button>
              </th>
              <th style={{ ...th, textAlign: "center", padding: "4px 6px" }}>
                <button type="button" style={{ ...btnReset, textAlign: "center" }} onClick={() => onSort("l2tr")}>
                  Tracking{sortMark("l2tr")}
                </button>
              </th>
              <th style={{ ...th, textAlign: "center", padding: "4px 6px" }}>
                <button type="button" style={{ ...btnReset, textAlign: "center" }} onClick={() => onSort("l2cn")}>
                  C/N₀{sortMark("l2cn")}
                </button>
              </th>
              <th style={{ ...th, textAlign: "center", padding: "4px 6px" }}>
                <button type="button" style={{ ...btnReset, textAlign: "center" }} onClick={() => onSort("l5tr")}>
                  Tracking{sortMark("l5tr")}
                </button>
              </th>
              <th style={{ ...th, textAlign: "center", padding: "4px 6px" }}>
                <button type="button" style={{ ...btnReset, textAlign: "center" }} onClick={() => onSort("l5cn")}>
                  C/N₀{sortMark("l5cn")}
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
                  <td style={{ ...td, paddingLeft: 10 }}>{sv.used_in_position ? "Used" : "Not used"}</td>
                  <td style={{ ...tdMono, paddingLeft: 10 }}>{sv.used_in_rtk ? "Yes" : "—"}</td>
                  <td style={{ ...tdTrack, borderLeft: "1px solid var(--table-border)" }}>{dispTrack(sv.track_l1)}</td>
                  <td style={tdNum}>{fmtL1Cn(sv)}</td>
                  <td style={tdTrack}>{dispTrack(sv.track_l2)}</td>
                  <td style={tdNum}>{fmtL2Cn(sv)}</td>
                  <td style={tdTrack}>{dispTrack(sv.track_l5)}</td>
                  <td style={tdNum}>{fmtL5Cn(sv)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
