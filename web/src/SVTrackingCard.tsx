import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { SVInfo } from "./types";
import { SV_SYSTEM_NAMES, sysIndex, fmtSvElevation, fmtSvAzimuth, svHasAzEl } from "./svSkyShared";

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

/** GSOF uses 0.0 when the frequency is not being tracked; real C/N₀ is always positive. */
function fmtL1Cn(sv: SVInfo): string {
  if (!Number.isFinite(sv.cn0_db_hz) || sv.cn0_db_hz <= 0) return "—";
  return sv.cn0_db_hz.toFixed(1);
}

function fmtL2Cn(sv: SVInfo): string {
  if (sv.cn0_l2_db_hz == null || !Number.isFinite(sv.cn0_l2_db_hz)) return "—";
  if (sv.cn0_l2_db_hz <= 0) return "—";
  return sv.cn0_l2_db_hz.toFixed(1);
}

function fmtL5Cn(sv: SVInfo): string {
  if (sv.cn0_l56_db_hz == null || !Number.isFinite(sv.cn0_l56_db_hz)) return "—";
  if (sv.cn0_l56_db_hz <= 0) return "—";
  return sv.cn0_l56_db_hz.toFixed(1);
}

function dispTrack(s: string | undefined): string {
  const t = s?.trim();
  return t ? t : "—";
}

/** Valid positive C/N₀ sorts before missing/zero; both missing compares equal. */
function cmpCnDbHz(
  a: number | null | undefined,
  b: number | null | undefined,
): number {
  const okA = a != null && Number.isFinite(a) && a > 0;
  const okB = b != null && Number.isFinite(b) && b > 0;
  if (!okA && !okB) return 0;
  if (!okA) return 1;
  if (!okB) return -1;
  return a - b;
}

function cmpAzEl(a: SVInfo, b: SVInfo, col: "elev" | "azim"): number {
  const okA = svHasAzEl(a);
  const okB = svHasAzEl(b);
  if (!okA && !okB) return 0;
  if (!okA) return 1;
  if (!okB) return -1;
  if (col === "elev") return a.elevation_deg - b.elevation_deg;
  return a.azimuth_deg - b.azimuth_deg;
}

function compareSv(a: SVInfo, b: SVInfo, col: SortCol, asc: boolean): number {
  let v = 0;
  switch (col) {
    case "system":
      v = sysIndex(a) - sysIndex(b);
      break;
    case "prn":
      v = a.prn - b.prn;
      break;
    case "elev":
      v = cmpAzEl(a, b, "elev");
      break;
    case "azim":
      v = cmpAzEl(a, b, "azim");
      break;
    case "position":
      v = Number(a.used_in_position) - Number(b.used_in_position);
      break;
    case "rtk":
      v = Number(a.used_in_rtk) - Number(b.used_in_rtk);
      break;
    case "l1cn":
      v = cmpCnDbHz(a.cn0_db_hz, b.cn0_db_hz);
      break;
    case "l1tr":
      v = dispTrack(a.track_l1).localeCompare(dispTrack(b.track_l1));
      break;
    case "l2cn":
      v = cmpCnDbHz(a.cn0_l2_db_hz, b.cn0_l2_db_hz);
      break;
    case "l2tr":
      v = dispTrack(a.track_l2).localeCompare(dispTrack(b.track_l2));
      break;
    case "l5cn":
      v = cmpCnDbHz(a.cn0_l56_db_hz, b.cn0_l56_db_hz);
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
  const activeSysIndices = useMemo(() => {
    const seen = new Set<number>();
    const ordered: number[] = [];
    for (const sv of svs) {
      const i = sysIndex(sv);
      if (!seen.has(i)) {
        seen.add(i);
        ordered.push(i);
      }
    }
    return ordered;
  }, [svs]);

  type PanelTab = "all" | number;
  const [panelTab, setPanelTab] = useState<PanelTab>("all");

  const [sortCol, setSortCol] = useState<SortCol>("system");
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    if (panelTab === "all") return;
    if (typeof panelTab === "number" && !activeSysIndices.includes(panelTab)) {
      setPanelTab("all");
    }
  }, [panelTab, activeSysIndices]);

  const filteredList = useMemo(() => {
    if (panelTab === "all") return svs;
    return svs.filter((sv) => sysIndex(sv) === panelTab);
  }, [svs, panelTab]);

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

  const bandDivider: CSSProperties = {
    borderLeft: "2px solid var(--table-border)",
  };

  /** Tracking codes — centered under “Tracking” headers, distinct from right-aligned C/N. */
  const tdTrack: CSSProperties = {
    ...tdMono,
    whiteSpace: "nowrap",
    textAlign: "center",
    paddingLeft: 10,
    paddingRight: 10,
  };

  const groupTh: CSSProperties = {
    ...th,
    textAlign: "center",
    padding: "6px 4px",
    verticalAlign: "middle",
    fontWeight: 600,
    color: "var(--app-text)",
  };
  const groupThFirst: CSSProperties = {
    ...groupTh,
    borderLeft: "1px solid var(--table-border)",
  };
  const thSub: CSSProperties = {
    ...th,
    textAlign: "center",
    padding: "4px 6px",
    verticalAlign: "bottom",
    borderBottom: "1px solid var(--table-border)",
  };
  const thSubFirst: CSSProperties = {
    ...thSub,
    borderLeft: "1px solid var(--table-border)",
  };
  const thSubL5First: CSSProperties = {
    ...thSub,
    ...bandDivider,
  };
  const groupThL5: CSSProperties = {
    ...groupTh,
    ...bandDivider,
  };

  if (svs.length === 0) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        No satellites in this snapshot.
      </p>
    );
  }

  return (
    <>
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
        <table style={{ width: "100%", borderCollapse: "collapse", margin: 0, tableLayout: "fixed" }}>
          <colgroup>
            <col />
            <col style={{ width: "3.25rem" }} />
            <col style={{ width: "3.5rem" }} />
            <col style={{ width: "3.5rem" }} />
            <col style={{ width: "6.5rem" }} />
            <col style={{ width: "3.5rem" }} />
            <col style={{ minWidth: "4.25rem" }} />
            <col style={{ minWidth: "5.75rem" }} />
            <col style={{ minWidth: "4.25rem" }} />
            <col style={{ minWidth: "5.75rem" }} />
            <col style={{ minWidth: "4.25rem" }} />
            <col style={{ minWidth: "5.75rem" }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...th, verticalAlign: "bottom" }}>
                <button type="button" style={{ ...btnReset, textAlign: "left" }} onClick={() => onSort("system")}>
                  System{sortMark("system")}
                </button>
              </th>
              <th rowSpan={2} style={{ ...th, textAlign: "right", paddingLeft: 8, verticalAlign: "bottom" }}>
                <button type="button" style={{ ...btnReset, textAlign: "right", paddingLeft: 8 }} onClick={() => onSort("prn")}>
                  PRN{sortMark("prn")}
                </button>
              </th>
              <th rowSpan={2} style={{ ...th, textAlign: "right", paddingLeft: 8, verticalAlign: "bottom" }}>
                <button type="button" style={{ ...btnReset, textAlign: "right", paddingLeft: 8 }} onClick={() => onSort("elev")}>
                  Elev°{sortMark("elev")}
                </button>
              </th>
              <th rowSpan={2} style={{ ...th, textAlign: "right", paddingLeft: 8, verticalAlign: "bottom" }}>
                <button type="button" style={{ ...btnReset, textAlign: "right", paddingLeft: 8 }} onClick={() => onSort("azim")}>
                  Azim°{sortMark("azim")}
                </button>
              </th>
              <th rowSpan={2} style={{ ...th, paddingLeft: 10, verticalAlign: "bottom" }}>
                <button type="button" style={{ ...btnReset, textAlign: "left", paddingLeft: 10 }} onClick={() => onSort("position")}>
                  Position{sortMark("position")}
                </button>
              </th>
              <th rowSpan={2} style={{ ...th, paddingLeft: 10, verticalAlign: "bottom" }}>
                <button type="button" style={{ ...btnReset, textAlign: "left", paddingLeft: 10 }} onClick={() => onSort("rtk")}>
                  RTK{sortMark("rtk")}
                </button>
              </th>
              <th colSpan={2} style={groupThFirst}>
                L1
              </th>
              <th colSpan={2} style={groupTh}>
                L2
              </th>
              <th colSpan={2} style={groupThL5}>
                L5
              </th>
            </tr>
            <tr>
              <th style={thSubFirst}>
                <button type="button" style={{ ...btnReset, textAlign: "center" }} onClick={() => onSort("l1cn")}>
                  C/N₀{sortMark("l1cn")}
                </button>
              </th>
              <th style={thSub}>
                <button type="button" style={{ ...btnReset, textAlign: "center" }} onClick={() => onSort("l1tr")}>
                  Tracking{sortMark("l1tr")}
                </button>
              </th>
              <th style={thSub}>
                <button type="button" style={{ ...btnReset, textAlign: "center" }} onClick={() => onSort("l2cn")}>
                  C/N₀{sortMark("l2cn")}
                </button>
              </th>
              <th style={thSub}>
                <button type="button" style={{ ...btnReset, textAlign: "center" }} onClick={() => onSort("l2tr")}>
                  Tracking{sortMark("l2tr")}
                </button>
              </th>
              <th style={thSubL5First}>
                <button type="button" style={{ ...btnReset, textAlign: "center" }} onClick={() => onSort("l5cn")}>
                  C/N₀{sortMark("l5cn")}
                </button>
              </th>
              <th style={thSub}>
                <button type="button" style={{ ...btnReset, textAlign: "center" }} onClick={() => onSort("l5tr")}>
                  Tracking{sortMark("l5tr")}
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
                  <td style={tdNum}>{fmtSvElevation(sv)}</td>
                  <td style={tdNum}>{fmtSvAzimuth(sv)}</td>
                  <td style={{ ...td, paddingLeft: 10 }}>{sv.used_in_position ? "Used" : "Not used"}</td>
                  <td style={{ ...tdMono, paddingLeft: 10 }}>{sv.used_in_rtk ? "Yes" : "—"}</td>
                  <td
                    style={{ ...tdNum, borderLeft: "1px solid var(--table-border)" }}
                    title={
                      Number.isFinite(sv.cn0_db_hz) && sv.cn0_db_hz <= 0 ? "Not tracking on L1" : undefined
                    }
                  >
                    {fmtL1Cn(sv)}
                  </td>
                  <td style={tdTrack}>{dispTrack(sv.track_l1)}</td>
                  <td
                    style={tdNum}
                    title={
                      sv.cn0_l2_db_hz != null && sv.cn0_l2_db_hz <= 0 ? "Not tracking on L2" : undefined
                    }
                  >
                    {fmtL2Cn(sv)}
                  </td>
                  <td style={tdTrack}>{dispTrack(sv.track_l2)}</td>
                  <td
                    style={{ ...tdNum, ...bandDivider }}
                    title={
                      sv.cn0_l56_db_hz != null && sv.cn0_l56_db_hz <= 0 ? "Not tracking on L5" : undefined
                    }
                  >
                    {fmtL5Cn(sv)}
                  </td>
                  <td style={tdTrack}>{dispTrack(sv.track_l5)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
