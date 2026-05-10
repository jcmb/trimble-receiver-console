import { Fragment, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import type {
  DCOLRetSerial,
  GroupInfo,
  LBandStatus,
  RadioInfo,
  ReceiverSnapshot,
  VectorSnapshot,
} from "./types";
import { formatLatLonDMS, toDMS, positionHoverText } from "./geoFormat";
import { ReceiverMap } from "./ReceiverMap";
import { SkyPlot } from "./SkyPlot";
import { SVTrackingCard } from "./SVTrackingCard";
import { ConfigForm } from "./ConfigForm";
import { ThemeToggle } from "./ThemeToggle";
import { trimbleRetSerialAntennaLabel } from "./trimbleAntennaLabels";

type Tab = "list" | "map" | "detail";

function tabLabel(t: Tab): string {
  switch (t) {
    case "list":
      return "List";
    case "map":
      return "Map";
    case "detail":
      return "Detail";
  }
}

function MainTabNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <nav className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      {(["list", "map", "detail"] as Tab[]).map((t) => (
        <button key={t} type="button" onClick={() => setTab(t)} className={`nav-tab${tab === t ? " active" : ""}`}>
          {tabLabel(t)}
        </button>
      ))}
    </nav>
  );
}

/** Nav processor field from RET SERIAL is encoded in centi-units; display as value/100. */
function formatNavFirmwareHundredths(raw: string | undefined): string {
  const t = raw?.trim();
  if (!t) return "—";
  const digits = t.replace(/[^\d]/g, "");
  if (digits.length === 0) return t;
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n)) return t;
  return (n / 100).toFixed(2);
}

type ListSortCol =
  | "serial"
  | "serial_connections"
  | "receiver_type"
  | "firmware"
  | "position_type"
  | "power"
  | "logging"
  | "lat_long"
  | "status"
  | "mode"
  | "remote";

function sortKeySerial(r: ReceiverSnapshot): string {
  const long = r.dcol_ret_serial?.long_serial?.trim();
  if (long) return long.toLowerCase();
  const short = r.dcol_ret_serial?.receiver_serial_short?.trim();
  if (short) return short.toLowerCase();
  const s = r.serial?.trim();
  if (s) return s.toLowerCase();
  return `anon:${r.remote_addr}`.toLowerCase();
}

/** Prefer RET SERIAL long serial (DCOL 07h); matches sort order. */
function displaySerial(r: ReceiverSnapshot): string {
  const long = r.dcol_ret_serial?.long_serial?.trim();
  if (long) return long;
  const short = r.dcol_ret_serial?.receiver_serial_short?.trim();
  if (short) return short;
  return r.serial?.trim() || "—";
}

function listReceiverTypeDisplay(r: ReceiverSnapshot): string {
  const d = r.dcol_ret_serial?.receiver_type?.trim();
  if (d) return d;
  return r.receiver_type?.trim() || "—";
}

function defaultListSortAsc(col: ListSortCol): boolean {
  switch (col) {
    case "power":
    case "logging":
    case "serial_connections":
      return false;
    default:
      return true;
  }
}

function listSortMark(active: boolean, asc: boolean): string {
  if (!active) return "";
  return asc ? " ▲" : " ▼";
}

const LIST_SORT_HEADERS: { label: string; col: ListSortCol }[] = [
  { label: "Serial", col: "serial" },
  { label: "TCP sessions", col: "serial_connections" },
  { label: "Receiver type", col: "receiver_type" },
  { label: "Firmware", col: "firmware" },
  { label: "Position type", col: "position_type" },
  { label: "Power", col: "power" },
  { label: "Logging", col: "logging" },
  { label: "Lat Long", col: "lat_long" },
  { label: "Status", col: "status" },
  { label: "Mode", col: "mode" },
  { label: "Remote", col: "remote" },
];

function ReceiverListTh({
  label,
  col,
  sortCol,
  asc,
  onSort,
}: {
  label: string;
  col: ListSortCol;
  sortCol: ListSortCol;
  asc: boolean;
  onSort: (c: ListSortCol) => void;
}) {
  const btnReset: CSSProperties = {
    background: "none",
    border: "none",
    padding: "6px 8px 8px 0",
    margin: 0,
    font: "inherit",
    fontWeight: 500,
    fontSize: 11,
    color: "var(--app-muted)",
    cursor: "pointer",
    textAlign: "left",
    whiteSpace: "nowrap",
    width: "100%",
  };
  return (
    <th style={{ textAlign: "left", padding: 0, verticalAlign: "bottom" }}>
      <button type="button" style={btnReset} onClick={() => onSort(col)} title={`Sort by ${label}`}>
        {label}
        {listSortMark(sortCol === col, asc)}
      </button>
    </th>
  );
}

export default function ConsoleHome() {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [groupId, setGroupId] = useState<string | null>(() => localStorage.getItem("trimble_group_id"));
  const [receivers, setReceivers] = useState<ReceiverSnapshot[]>([]);
  const [consoleVersion, setConsoleVersion] = useState("trimble-receiver-console version dev");
  const [mapTileUrl, setMapTileUrl] = useState(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
  );
  const [tab, setTab] = useState<Tab>("list");
  const [sel, setSel] = useState<string | null>(null);
  const [listSortCol, setListSortCol] = useState<ListSortCol>("serial");
  const [listSortAsc, setListSortAsc] = useState(true);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((j) => {
        if (j.map_tile_url) setMapTileUrl(j.map_tile_url);
        if (Array.isArray(j.groups)) setGroups(j.groups);
        if (typeof j.console_version === "string" && j.console_version) setConsoleVersion(j.console_version);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (groupId) localStorage.setItem("trimble_group_id", groupId);
    else localStorage.removeItem("trimble_group_id");
  }, [groupId]);

  useEffect(() => {
    if (groups.length === 0) return;
    if (groupId && !groups.some((g) => g.id === groupId)) {
      setGroupId(null);
      setSel(null);
    }
  }, [groups, groupId]);

  useEffect(() => {
    if (!groupId) {
      setReceivers([]);
      return;
    }
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const u = `${proto}//${location.host}/api/stream?group=${encodeURIComponent(groupId)}`;
    const ws = new WebSocket(u);
    ws.onmessage = (ev) => {
      try {
        const j = JSON.parse(ev.data);
        if (Array.isArray(j.receivers)) setReceivers(j.receivers);
        if (typeof j.console_version === "string" && j.console_version) setConsoleVersion(j.console_version);
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [groupId]);

  const sortedReceivers = useMemo(() => {
    const arr = receivers.slice();
    arr.sort((a, b) => compareReceivers(a, b, listSortCol, listSortAsc));
    return arr;
  }, [receivers, listSortCol, listSortAsc]);

  const handleListSort = useCallback((c: ListSortCol) => {
    setListSortCol((prev) => {
      if (prev !== c) {
        setListSortAsc(defaultListSortAsc(c));
        return c;
      }
      setListSortAsc((x) => !x);
      return prev;
    });
  }, []);

  const selected = useMemo(
    () => receivers.find((r) => keyOf(r) === sel) ?? null,
    [receivers, sel]
  );

  const pickFirst = useCallback(() => {
    if (sortedReceivers.length && !sel) setSel(keyOf(sortedReceivers[0]!));
  }, [sortedReceivers, sel]);

  useEffect(() => {
    pickFirst();
  }, [pickFirst]);

  const selectedGroup = groups.find((g) => g.id === groupId);

  if (groups.length === 0) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <header className="panel" style={{ margin: 12 }}>
          <div className="row" style={{ justifyContent: "space-between", width: "100%" }}>
            <div>
              <strong>Trimble receiver console</strong>
              <span className="muted" style={{ marginLeft: 12 }}>
                Loading…
              </span>
            </div>
            <ThemeToggle />
          </div>
        </header>
      </div>
    );
  }

  if (!groupId) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <header className="panel" style={{ margin: 12 }}>
            <div className="row" style={{ justifyContent: "space-between", width: "100%" }}>
            <div>
              <strong>Trimble receiver console</strong>
              <span className="muted" style={{ marginLeft: 12 }}>
                Select a group to continue
              </span>
            </div>
            <div className="row">
              <Link to="/help">Help (GSOF)</Link>
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="panel" style={{ margin: "0 12px", maxWidth: 520 }}>
          <h2 style={{ marginTop: 0 }}>Group</h2>
          <p className="muted">Each group has its own TCP port. Connect receivers to the port shown.</p>
          <label className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <span>Choose group</span>
            <select
              value=""
              onChange={(e) => {
                const v = e.target.value;
                setGroupId(v || null);
                setSel(null);
              }}
              style={{ padding: 8 }}
            >
              <option value="">—</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.id}) — TCP {g.tcp_listen}
                </option>
              ))}
            </select>
          </label>
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        className="panel"
        style={{
          margin: 12,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
        <div>
          <strong>Trimble receiver console</strong>
          <span className="muted" style={{ marginLeft: 12 }}>
            {selectedGroup ? `${selectedGroup.name} · TCP ${selectedGroup.tcp_listen}` : groupId}
          </span>
        </div>
        <div className="row">
          <label className="row" style={{ gap: 8 }}>
            <span className="muted">Group</span>
            <select
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                setSel(null);
              }}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <Link to="/help">Help</Link>
          <ThemeToggle />
        </div>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.4 }}>
          <span title="Server binary (from API)">{consoleVersion}</span>
          {" · "}
          <span title="Embedded web bundle build id">
            Web UI <code style={{ fontSize: "inherit" }}>{__WEB_UI_VERSION__}</code>
          </span>
        </p>
      </header>

      <div className="panel footer-tab-bar" style={{ margin: "0 12px 8px", flexShrink: 0 }}>
        <MainTabNav tab={tab} setTab={setTab} />
      </div>

      <main
        style={{
          flex: 1,
          minHeight: 0,
          margin: "0 12px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflow: "auto",
        }}
      >
        {tab === "list" && (
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Receivers</h2>
            <table>
              <thead>
                <tr>
                  {LIST_SORT_HEADERS.map(({ label, col }) => (
                    <ReceiverListTh
                      key={col}
                      label={label}
                      col={col}
                      sortCol={listSortCol}
                      asc={listSortAsc}
                      onSort={handleListSort}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedReceivers.map((r) => (
                  <tr key={keyOf(r)}>
                    <td>
                      <button
                        type="button"
                        className="link-as-button"
                        title="Open details"
                        onClick={() => {
                          setSel(keyOf(r));
                          setTab("detail");
                        }}
                        style={{ textAlign: "left", fontWeight: 600 }}
                      >
                        {displaySerial(r)}
                      </button>
                    </td>
                    <td style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                      {r.serial_connection_count != null && r.serial_connection_count > 0
                        ? String(r.serial_connection_count)
                        : "—"}
                    </td>
                    <td className="muted" style={{ fontSize: 13 }}>
                      {listReceiverTypeDisplay(r)}
                    </td>
                    <td className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                      {listFirmwareDisplay(r)}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {r.has_position_type ? `${r.position_type_label} (${r.position_type})` : "—"}
                    </td>
                    <td className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                      {r.has_power_logging && r.battery_percent != null
                        ? `${r.battery_percent.toFixed(0)}%`
                        : "—"}
                    </td>
                    <td className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                      {formatListLogging(r)}
                    </td>
                    <td>
                      {r.has_llh ? (
                        <button
                          type="button"
                          title="Open map"
                          className="link-as-button"
                          onClick={() => {
                            setSel(keyOf(r));
                            setTab("map");
                          }}
                          style={{
                            textAlign: "left",
                            maxWidth: 340,
                          }}
                        >
                          {formatLatLonDMS(r.lat_rad, r.lon_rad, 2)}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {r.online ? (
                        <span className="badge on">online</span>
                      ) : (
                        <span className="muted">
                          Last seen{" "}
                          {r.last_update ? new Date(r.last_update).toLocaleString() : "—"}
                        </span>
                      )}
                    </td>
                    <td>{r.mode}</td>
                    <td className="muted" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                      {r.remote_addr}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {receivers.length === 0 && (
              <p className="muted">No receivers yet for this group (or all aged out after 7 days offline).</p>
            )}
          </div>
        )}

        {tab === "map" && (
          <div className="panel" style={{ flex: 1, minHeight: 420 }}>
            <h2 style={{ marginTop: 0 }}>Map</h2>
            <ReceiverMap
              receivers={receivers}
              tileUrl={mapTileUrl}
              onSelect={(k) => {
                setSel(k);
                setTab("detail");
              }}
            />
          </div>
        )}

        {tab === "detail" && (
          <div className="console-detail-layout">
            <div className="panel console-detail-status">
              <h2 style={{ marginTop: 0 }}>Status</h2>
              {!selected && <p className="muted">Select a receiver from the list or map.</p>}
              {selected && <StatusPanel r={selected} />}
            </div>
            <div className="panel console-detail-config">
              <h2 style={{ marginTop: 0 }}>Configuration</h2>
              {!selected && <p className="muted">Select a receiver from the list or map.</p>}
              {selected && groupId ? (
                <ConfigForm groupId={groupId} receiverKey={keyOf(selected)} mode={selected.mode} />
              ) : null}
            </div>
            <div className="panel console-detail-sky">
              <h2 style={{ marginTop: 0 }}>Sky plot</h2>
              {!selected && <p className="muted">Select a receiver from the list or map.</p>}
              {selected && selected.satellites?.length ? (
                <SkyPlot svs={selected.satellites} />
              ) : selected ? (
                <p className="muted">No SV geometry (enable GSOF ALL SV detail, record 48 or 34).</p>
              ) : null}
            </div>
            <div className="panel console-detail-sv">
              <h2 style={{ marginTop: 0 }}>SV tracking</h2>
              {!selected && <p className="muted">Select a receiver from the list or map.</p>}
              {selected && selected.satellites?.length ? (
                <SVTrackingCard svs={selected.satellites} />
              ) : selected ? (
                <p className="muted">No SV geometry (enable GSOF ALL SV detail, record 48 or 34).</p>
              ) : null}
            </div>
          </div>
        )}
      </main>

      <footer className="panel footer-tab-bar" style={{ margin: "0 12px 12px", flexShrink: 0 }}>
        <MainTabNav tab={tab} setTab={setTab} />
      </footer>
    </div>
  );
}

function keyOf(r: ReceiverSnapshot): string {
  return r.serial || `anon:${r.remote_addr}`;
}

/** DCOL 07h nav processor version (same presentation as detail Status panel). */
function listFirmwareDisplay(r: ReceiverSnapshot): string {
  const nav = r.dcol_ret_serial?.nav_processor_version;
  if (nav?.trim()) {
    return formatNavFirmwareHundredths(nav);
  }
  const top = r.firmware_version?.trim();
  if (top) {
    return formatNavFirmwareHundredths(r.firmware_version);
  }
  return "—";
}

function compareReceivers(a: ReceiverSnapshot, b: ReceiverSnapshot, col: ListSortCol, asc: boolean): number {
  const dir = asc ? 1 : -1;

  function tieBreak(): number {
    const s = sortKeySerial(a).localeCompare(sortKeySerial(b));
    if (s !== 0) return s;
    return keyOf(a).localeCompare(keyOf(b));
  }

  if (col !== "status") {
    const pa = a.online ? 0 : 1;
    const pb = b.online ? 0 : 1;
    if (pa !== pb) return pa - pb;
  }

  let v = 0;
  switch (col) {
    case "serial":
      v = sortKeySerial(a).localeCompare(sortKeySerial(b));
      break;
    case "serial_connections":
      v = (a.serial_connection_count ?? 0) - (b.serial_connection_count ?? 0);
      break;
    case "receiver_type":
      v = listReceiverTypeDisplay(a).localeCompare(listReceiverTypeDisplay(b));
      break;
    case "firmware":
      v = listFirmwareDisplay(a).localeCompare(listFirmwareDisplay(b));
      break;
    case "position_type": {
      const ac = a.has_position_type ? a.position_type : -999;
      const bc = b.has_position_type ? b.position_type : -999;
      v = ac - bc;
      if (v === 0 && a.has_position_type && b.has_position_type) {
        v = a.position_type_label.localeCompare(b.position_type_label);
      }
      break;
    }
    case "power": {
      const aHas = a.has_power_logging && a.battery_percent != null && Number.isFinite(a.battery_percent);
      const bHas = b.has_power_logging && b.battery_percent != null && Number.isFinite(b.battery_percent);
      if (!aHas && !bHas) v = 0;
      else if (!aHas) v = 1;
      else if (!bHas) v = -1;
      else v = a.battery_percent! - b.battery_percent!;
      break;
    }
    case "logging": {
      const aHas = a.has_power_logging && a.logging_hours_remain != null && a.logging_hours_remain > 0;
      const bHas = b.has_power_logging && b.logging_hours_remain != null && b.logging_hours_remain > 0;
      const av = a.logging_hours_remain ?? 0;
      const bv = b.logging_hours_remain ?? 0;
      if (!aHas && !bHas) v = 0;
      else if (!aHas) v = 1;
      else if (!bHas) v = -1;
      else v = av - bv;
      break;
    }
    case "lat_long": {
      const al = a.has_llh ? a.lat_rad : Number.NEGATIVE_INFINITY;
      const bl = b.has_llh ? b.lat_rad : Number.NEGATIVE_INFINITY;
      v = al - bl;
      if (v !== 0) break;
      const ao = a.has_llh ? a.lon_rad : Number.NEGATIVE_INFINITY;
      const bo = b.has_llh ? b.lon_rad : Number.NEGATIVE_INFINITY;
      v = ao - bo;
      break;
    }
    case "status":
      v = (a.online ? 0 : 1) - (b.online ? 0 : 1);
      break;
    case "mode":
      v = a.mode.localeCompare(b.mode);
      break;
    case "remote":
      v = a.remote_addr.localeCompare(b.remote_addr);
      break;
    default:
      v = 0;
  }

  if (v !== 0) return v * dir;
  return tieBreak();
}

function formatListLogging(r: ReceiverSnapshot): string {
  if (!r.has_power_logging) return "—";
  if (r.logging_hours_remain != null && r.logging_hours_remain > 0) {
    return `~${r.logging_hours_remain.toFixed(1)} h`;
  }
  return "—";
}

function formatSolutionTime(r: ReceiverSnapshot): string {
  if (!r.solution_time) return "—";
  const d = new Date(r.solution_time);
  if (Number.isNaN(d.getTime())) return "—";
  const src = r.time_source === "UTC" ? "UTC" : r.time_source === "GPS" ? "GPS" : "";
  return `${d.toLocaleString()}${src ? ` · ${src}` : ""}`;
}

function formatUptimeSince(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  let sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 0) sec = 0;
  const d = Math.floor(sec / 86400);
  sec %= 86400;
  const h = Math.floor(sec / 3600);
  sec %= 3600;
  const m = Math.floor(sec / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function llhCloseDeg(
  a: { lat_rad?: number; lon_rad?: number; height_m?: number },
  b: { lat_rad?: number; lon_rad?: number; height_m?: number }
): boolean {
  if (a.lat_rad == null || a.lon_rad == null || b.lat_rad == null || b.lon_rad == null) {
    return false;
  }
  const latA = (a.lat_rad * 180) / Math.PI;
  const lonA = (a.lon_rad * 180) / Math.PI;
  const latB = (b.lat_rad * 180) / Math.PI;
  const lonB = (b.lon_rad * 180) / Math.PI;
  const hA = a.height_m ?? 0;
  const hB = b.height_m ?? 0;
  return (
    Math.abs(latA - latB) < 1e-7 &&
    Math.abs(lonA - lonB) < 1e-7 &&
    Math.abs(hA - hB) < 1e-3
  );
}

function channelsRetSerialSummary(rs: DCOLRetSerial): string {
  const parts: string[] = [];
  if (rs.usable_channels != null) parts.push(`Usable ${rs.usable_channels}`);
  if (rs.physical_channels != null) parts.push(`Physical ${rs.physical_channels}`);
  if (rs.simultaneous_track != null) parts.push(`Simultaneous track ${rs.simultaneous_track}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function VectorCard({ vector }: { vector?: VectorSnapshot }) {
  if (!vector?.tangent_plane && !vector?.diagnostics) return null;
  const tp = vector.tangent_plane;
  const d = vector.diagnostics;
  const tdL: CSSProperties = {
    padding: "8px 14px 8px 0",
    verticalAlign: "top",
    color: "var(--app-muted)",
    fontSize: 12,
    whiteSpace: "nowrap",
    width: "11rem",
    maxWidth: "42%",
  };
  const tdV: CSSProperties = {
    padding: "8px 12px 8px 0",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 13,
    color: "var(--app-text)",
    width: "auto",
  };
  const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse" };
  const mono: CSSProperties = {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 13,
    color: "var(--app-text)",
  };
  const deltaBarStyle: CSSProperties = {
    marginTop: d ? 14 : 0,
    paddingTop: d ? 12 : 0,
    borderTop: d ? "1px solid var(--table-border)" : undefined,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: "10px 28px",
    rowGap: 10,
  };
  const deltaItemStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: "8px 10px",
    minWidth: "min(100%, 12rem)",
  };
  const deltaLabelStyle: CSSProperties = {
    fontSize: 12,
    color: "var(--app-muted)",
    whiteSpace: "nowrap",
  };
  return (
    <div className="status-card">
      <h3 className="status-card-title mixed-case">Vector</h3>
      {d && (
        <table style={tableStyle}>
          <tbody>
            <tr>
              <td style={tdL}>Ref. station info</td>
              <td style={tdV}>{d.reference_station_info_received ? "Received" : "—"}</td>
            </tr>
            <tr>
              <td style={tdL}>Link integrity</td>
              <td style={tdV}>
                {d.link_integrity_pct != null ? `${d.link_integrity_pct.toFixed(1)}%` : "—"}
              </td>
            </tr>
            <tr>
              <td style={tdL}>Common L1 / L2 SVs</td>
              <td style={tdV}>
                {(d.common_l1_svs ?? "—") + " / " + (d.common_l2_svs ?? "—")}
              </td>
            </tr>
            <tr>
              <td style={tdL}>Datalink latency</td>
              <td style={tdV}>
                {d.datalink_latency_s != null ? `${d.datalink_latency_s.toFixed(1)} s` : "—"}
              </td>
            </tr>
            <tr>
              <td style={tdL}>Diff SVs in use</td>
              <td style={tdV}>{d.diff_svs_in_use ?? "—"}</td>
            </tr>
            <tr>
              <td style={tdL}>RTK position age</td>
              <td style={tdV}>
                {d.rtk_position_age != null ? `${d.rtk_position_age.toFixed(2)} s` : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      )}
      {tp && (
        <div style={deltaBarStyle}>
          <div style={deltaItemStyle}>
            <span style={deltaLabelStyle}>Δ East (m)</span>
            <span style={mono}>{tp.delta_east_m.toFixed(4)}</span>
          </div>
          <div style={deltaItemStyle}>
            <span style={deltaLabelStyle}>Δ North (m)</span>
            <span style={mono}>{tp.delta_north_m.toFixed(4)}</span>
          </div>
          <div style={deltaItemStyle}>
            <span style={deltaLabelStyle}>Δ Up (m)</span>
            <span style={mono}>{tp.delta_up_m.toFixed(4)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function BaseStationCard({ r }: { r: ReceiverSnapshot }) {
  const rb = r.received_base;
  const bq = r.base_position_quality;
  const dlStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(7rem, auto) 1fr",
    gap: "6px 12px",
    margin: 0,
    fontSize: 13,
  };
  const mono: CSSProperties = { margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
  const llhLine = (latRad: number | undefined, lonRad: number | undefined, hM: number | undefined) => {
    if (latRad == null || lonRad == null) return "—";
    const lat = (latRad * 180) / Math.PI;
    const lon = (lonRad * 180) / Math.PI;
    const hStr = hM != null ? `${hM.toFixed(3)} m ellipsoidal` : "—";
    return `${toDMS(lat, "lat", 4)}, ${toDMS(lon, "lon", 4)} · ${hStr}`;
  };

  if (!rb && !bq) {
    return null;
  }

  const showAntenna =
    !!rb &&
    !!bq &&
    !llhCloseDeg(
      { lat_rad: rb.lat_rad, lon_rad: rb.lon_rad, height_m: rb.height_m },
      { lat_rad: bq.lat_rad, lon_rad: bq.lon_rad, height_m: bq.height_m }
    );

  return (
    <div className="status-card">
      <h3 className="status-card-title mixed-case">Base station</h3>
      <dl style={dlStyle}>
        {rb && (
          <>
            <dt className="muted" style={{ margin: 0 }}>
              Valid.
            </dt>
            <dd style={{ margin: 0 }}>{rb.info_valid ? "Yes" : "No"}</dd>
            <dt className="muted" style={{ margin: 0 }}>
              Base name
            </dt>
            <dd style={{ margin: 0 }}>{rb.base_name?.trim() ? rb.base_name : "—"}</dd>
            <dt className="muted" style={{ margin: 0 }}>
              Base ID
            </dt>
            <dd style={{ margin: 0 }}>{rb.base_id != null ? rb.base_id : "—"}</dd>
          </>
        )}
        {bq && (
          <>
            <dt className="muted" style={{ margin: 0 }}>
              Position
            </dt>
            <dd style={mono}>{llhLine(bq.lat_rad, bq.lon_rad, bq.height_m)}</dd>
            <dt className="muted" style={{ margin: 0 }}>
              Quality
            </dt>
            <dd style={{ margin: 0 }}>{bq.quality_label ?? "—"}</dd>
          </>
        )}
        {!bq && rb && (
          <>
            <dt className="muted" style={{ margin: 0 }}>
              Position
            </dt>
            <dd style={mono}>{llhLine(rb.lat_rad, rb.lon_rad, rb.height_m)}</dd>
          </>
        )}
      </dl>
      {showAntenna && rb && (
        <>
          <h4 className="muted" style={{ fontSize: 11, margin: "14px 0 8px", letterSpacing: "0.04em" }}>
            Antenna position
          </h4>
          <dl style={dlStyle}>
            <dt className="muted" style={{ margin: 0 }}>
              Position
            </dt>
            <dd style={mono}>{llhLine(rb.lat_rad, rb.lon_rad, rb.height_m)}</dd>
          </dl>
        </>
      )}
      {!rb && bq && (
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 12 }}>
          No GSOF type 35 (received base) in the latest snapshot — identity fields unavailable.
        </p>
      )}
    </div>
  );
}

function RadioInfoCard({ ri }: { ri: RadioInfo }) {
  return (
    <div className="status-card">
      <h3 className="status-card-title mixed-case">Radio information</h3>
      {ri.radios && ri.radios.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 0, fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "4px 8px 4px 0", color: "var(--app-muted)", fontWeight: 500, fontSize: 11 }}>
                Band
              </th>
              <th style={{ textAlign: "right", padding: 4, color: "var(--app-muted)", fontWeight: 500, fontSize: 11 }}>Ch</th>
              <th style={{ textAlign: "right", padding: 4, color: "var(--app-muted)", fontWeight: 500, fontSize: 11 }}>Signal</th>
              <th style={{ textAlign: "right", padding: 4, color: "var(--app-muted)", fontWeight: 500, fontSize: 11 }}>Bars</th>
              <th style={{ textAlign: "right", padding: 4, color: "var(--app-muted)", fontWeight: 500, fontSize: 11 }}>Noise</th>
              <th style={{ textAlign: "right", padding: 4, color: "var(--app-muted)", fontWeight: 500, fontSize: 11 }}>N bars</th>
            </tr>
          </thead>
          <tbody>
            {ri.radios.map((x, i) => (
              <tr key={i}>
                <td style={{ padding: "4px 8px 4px 0" }}>{x.band ?? "—"}</td>
                <td style={{ textAlign: "right", padding: 4 }}>{x.channel ?? "—"}</td>
                <td style={{ textAlign: "right", padding: 4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                  {x.signal_dbm != null ? `${x.signal_dbm} dBm` : "—"}
                </td>
                <td style={{ textAlign: "right", padding: 4 }}>{x.signal_bars ?? "—"}</td>
                <td style={{ textAlign: "right", padding: 4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                  {x.noise_dbm != null ? `${x.noise_dbm} dBm` : "—"}
                </td>
                <td style={{ textAlign: "right", padding: 4 }}>{x.noise_bars ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted" style={{ margin: "10px 0 0 0", fontSize: 13 }}>
          No radio entries in the latest report.
        </p>
      )}
    </div>
  );
}

function StreamBadge({ r }: { r: ReceiverSnapshot }) {
  const v = streamVisual(r);
  return (
    <span className={`badge ${v.cls}`} title={v.title}>
      {v.text}
    </span>
  );
}

function streamVisual(r: ReceiverSnapshot): { cls: string; text: string; title: string } {
  const gsofN = r.gsof_report_count ?? 0;
  if (!r.online) {
    return { cls: "off", text: "—", title: "Offline" };
  }
  if (gsofN === 0) {
    return {
      cls: "stream-wait",
      text: "Waiting for GSOF",
      title: "Connected; no assembled GSOF (DCOL type 64) yet — check receiver GSOF output on this port",
    };
  }
  const t = r.last_gsof_at ? new Date(r.last_gsof_at).getTime() : 0;
  if (!t || Number.isNaN(t)) {
    return { cls: "stream-tcp", text: "GSOF ?", title: "GSOF count > 0 but no timestamp" };
  }
  const age = Date.now() - t;
  if (age < 4000) {
    return { cls: "stream-live", text: "GSOF live", title: `Last GSOF ${Math.round(age / 1000)}s ago` };
  }
  if (age < 30000) {
    return { cls: "stream-stale", text: "GSOF idle", title: `Last GSOF ${Math.round(age / 1000)}s ago` };
  }
  return { cls: "stream-stale", text: "GSOF stale", title: `Last GSOF ${Math.round(age / 1000)}s ago` };
}

function StatusPanel({ r }: { r: ReceiverSnapshot }) {
  const lat = r.has_llh ? (r.lat_rad * 180) / Math.PI : null;
  const lon = r.has_llh ? (r.lon_rad * 180) / Math.PI : null;
  const hoverLLH = r.has_llh ? positionHoverText(r.lat_rad, r.lon_rad, r.height_m) : undefined;
  const svUsedTotal = r.satellites?.filter((s) => s.used_in_position).length ?? 0;

  const th: CSSProperties = {
    textAlign: "left",
    fontWeight: 500,
    fontSize: 11,
    color: "var(--app-muted)",
    padding: "0 12px 8px 0",
    borderBottom: "1px solid var(--table-border)",
  };
  const tdL: CSSProperties = {
    padding: "8px 12px 8px 0",
    verticalAlign: "top",
    color: "var(--app-muted)",
    fontSize: 12,
    width: "4.5rem",
  };
  const tdV: CSSProperties = {
    padding: "8px 12px 8px 0",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 13,
    color: "var(--app-text)",
  };
  const tdS: CSSProperties = {
    padding: "8px 0",
    textAlign: "right",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 13,
    color: "var(--mono-dim)",
    whiteSpace: "nowrap",
  };
  const metricTh: CSSProperties = {
    textAlign: "center",
    fontWeight: 500,
    fontSize: 11,
    color: "var(--app-muted)",
    padding: "6px 8px",
    borderBottom: "1px solid var(--table-border)",
  };
  const metricTd: CSSProperties = {
    textAlign: "center",
    padding: "8px 8px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 13,
    borderBottom: "1px solid var(--table-border)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="row" style={{ flexWrap: "wrap", gap: "8px 16px", alignItems: "center" }}>
        <span className="badge">{r.online ? "online" : "offline"}</span>
        <span>
          Group <strong>{r.group_id}</strong>
        </span>
        <span>
          Serial <strong>{displaySerial(r)}</strong>
        </span>
        {r.serial_connection_count != null && r.serial_connection_count > 0 ? (
          <span className="muted">
            TCP sessions <strong>{r.serial_connection_count}</strong>
          </span>
        ) : null}
        <span className="muted">
          Receiver type <strong>{listReceiverTypeDisplay(r)}</strong>
        </span>
        <span className="muted" style={{ fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
          {r.remote_addr}
        </span>
        <span className="row" style={{ gap: 8, marginLeft: "auto" }}>
          <StreamBadge r={r} />
          <span className="muted" style={{ fontSize: 12 }}>
            {r.gsof_report_count != null && r.gsof_report_count > 0
              ? `${r.gsof_report_count} GSOF report(s)`
              : r.online
                ? "No GSOF yet"
                : ""}
            {r.last_gsof_at ? ` · last ${new Date(r.last_gsof_at).toLocaleString()}` : ""}
          </span>
        </span>
      </div>

      {/* DCOL 06h / 07h at TCP connect */}
      <div className="status-card">
        <h3 className="status-card-title mixed-case">Receiver & antenna</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={tdL}>TCP peer</td>
              <td style={tdV}>{r.remote_addr}</td>
            </tr>
            {r.dcol_ret_serial && (
              <>
                <tr>
                  <td style={tdL}>Receiver type</td>
                  <td style={tdV}>{r.dcol_ret_serial.receiver_type?.trim() || "—"}</td>
                </tr>
                <tr>
                  <td style={tdL}>Serial number</td>
                  <td style={tdV}>{r.dcol_ret_serial.long_serial?.trim() || "—"}</td>
                </tr>
                {!r.dcol_ret_serial.long_serial?.trim() && (
                  <tr>
                    <td style={tdL}>Serial (8-char)</td>
                    <td style={tdV}>{r.dcol_ret_serial.receiver_serial_short?.trim() || "—"}</td>
                  </tr>
                )}
                <tr>
                  <td style={tdL}>Firmware</td>
                  <td style={tdV}>{formatNavFirmwareHundredths(r.dcol_ret_serial.nav_processor_version)}</td>
                </tr>
                <tr>
                  <td style={tdL}>Antenna type</td>
                  <td style={tdV}>{trimbleRetSerialAntennaLabel(r.dcol_ret_serial.antenna_type)}</td>
                </tr>
                <tr>
                  <td style={tdL}>Antenna serial</td>
                  <td style={tdV}>{r.dcol_ret_serial.antenna_serial?.trim() || "—"}</td>
                </tr>
                <tr>
                  <td style={tdL}>Base long ant serial</td>
                  <td style={tdV}>{r.dcol_ret_serial.base_long_ant_serial?.trim() || "—"}</td>
                </tr>
                <tr>
                  <td style={tdL}>Base NGS ant descriptor</td>
                  <td style={tdV}>{r.dcol_ret_serial.base_ngs_ant_descriptor?.trim() || "—"}</td>
                </tr>
                <tr>
                  <td style={tdL}>Channels</td>
                  <td style={tdV}>{channelsRetSerialSummary(r.dcol_ret_serial)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
        {!r.dcol_ret_serial && r.online && (
          <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
            Waiting for RET SERIAL (07h)…
          </p>
        )}
        {!r.dcol_ret_serial && !r.online && (
          <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
            —
          </p>
        )}
      </div>

      {/* Position — first */}
      <div className="status-card">
        <h3 className="status-card-title mixed-case">Position</h3>
        <div
          style={{
            marginBottom: 14,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            gap: "6px 10px",
          }}
        >
          <span
            className="muted"
            style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}
          >
            Time
          </span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 14 }}>{formatSolutionTime(r)}</span>
        </div>

        {r.has_llh && lat != null && lon != null ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}></th>
                <th style={th}>WGS84 (hover for decimal + ECEF)</th>
                <th
                  style={{ ...th, textAlign: "right", paddingRight: 0 }}
                  title="1σ from GSOF sigma record 12: σ East, σ North, σ Up in meters"
                >
                  σ (m)
                </th>
              </tr>
            </thead>
            <tbody>
              <tr title={hoverLLH}>
                <td style={tdL}>Lat</td>
                <td style={tdV}>{toDMS(lat, "lat")}</td>
                <td style={tdS} title={hoverLLH}>
                  {r.has_sigma ? `σN ${r.sigma_north_m.toFixed(3)}` : "—"}
                </td>
              </tr>
              <tr title={hoverLLH}>
                <td style={tdL}>Lon</td>
                <td style={tdV}>{toDMS(lon, "lon")}</td>
                <td style={tdS} title={hoverLLH}>
                  {r.has_sigma ? `σE ${r.sigma_east_m.toFixed(3)}` : "—"}
                </td>
              </tr>
              <tr title={hoverLLH}>
                <td style={tdL}>H</td>
                <td style={tdV}>{r.height_m.toFixed(3)} m ellipsoidal</td>
                <td style={tdS} title={hoverLLH}>
                  {r.has_sigma ? `σU ${r.sigma_up_m.toFixed(3)}` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            No position coordinates in the latest GSOF set.
          </p>
        )}

        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px solid var(--table-border)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              <tr>
                <td style={tdL}>Fix type</td>
                <td style={tdV}>
                  {r.has_position_type ? `${r.position_type_label} (${r.position_type})` : "—"}
                </td>
              </tr>
              <tr>
                <td style={tdL}>RMS</td>
                <td style={tdV}>{r.has_sigma ? `${r.position_rms_m.toFixed(3)} m` : "—"}</td>
              </tr>
              <tr>
                <td style={tdL}>SVs used</td>
                <td style={tdV}>{svUsedTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {r.has_dop && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={metricTh}>PDOP</th>
                    <th style={metricTh}>HDOP</th>
                    <th style={metricTh}>VDOP</th>
                    <th style={metricTh}>TDOP</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={metricTd}>{r.pdop.toFixed(2)}</td>
                    <td style={metricTd}>{r.hdop.toFixed(2)}</td>
                    <td style={metricTd}>{r.vdop.toFixed(2)}</td>
                    <td style={metricTd}>{r.tdop.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
          </div>
        )}

        {r.has_velocity && (
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: "1px solid var(--table-border)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }} aria-label="Velocity">
              <caption
                style={{
                  captionSide: "top",
                  textAlign: "left",
                  padding: "0 0 8px",
                  fontSize: 12,
                  color: "var(--app-muted)",
                  lineHeight: 1.35,
                }}
              >
                Velocity
              </caption>
              <thead>
                <tr>
                  <th style={metricTh}>Horizontal (m/s)</th>
                  <th style={metricTh}>Vertical (m/s)</th>
                  <th style={metricTh}>Heading (°)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={metricTd}>{r.horizontal_vel_ms.toFixed(3)}</td>
                  <td style={metricTd}>{r.vertical_vel_ms.toFixed(3)}</td>
                  <td style={metricTd}>{((r.heading_rad * 180) / Math.PI).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <VectorCard vector={r.vector} />

      <div className="status-card">
        <h3 className="status-card-title mixed-case">SV Information</h3>
        <ConstellationTable r={r} />
      </div>

      <div className="status-card">
        <h3 className="status-card-title mixed-case">Summary</h3>
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(5.5rem, auto) 1fr",
            gap: "10px 4px",
            margin: 0,
            fontSize: 14,
            lineHeight: 1.5,
            alignItems: "baseline",
          }}
        >
          <dt className="muted" style={{ margin: 0, fontSize: 12 }}>
            Power
          </dt>
          <dd style={{ margin: 0 }}>
            {r.has_power_logging && r.battery_percent != null ? (
              <>{r.battery_percent.toFixed(0)}% battery</>
            ) : r.has_power_logging ? (
              <span className="muted">—</span>
            ) : (
              <span className="muted">—</span>
            )}
          </dd>
          <dt className="muted" style={{ margin: 0, fontSize: 12 }}>
            Logging
          </dt>
          <dd style={{ margin: 0 }}>
            {r.has_power_logging ? (
              r.logging_hours_remain != null && r.logging_hours_remain > 0 ? (
                <>~{r.logging_hours_remain.toFixed(1)} h internal storage remaining</>
              ) : (
                <span className="muted">Capacity not reported</span>
              )
            ) : (
              <span className="muted">—</span>
            )}
          </dd>
          <dt className="muted" style={{ margin: 0, fontSize: 12 }}>
            Console uptime
          </dt>
          <dd style={{ margin: 0 }}>
            {r.first_seen ? formatUptimeSince(r.first_seen) : "—"}
            {r.first_seen && (
              <span className="muted" style={{ fontSize: 12 }}>
                {" "}
                (since {new Date(r.first_seen).toLocaleString()})
              </span>
            )}
          </dd>
        </dl>
      </div>

      <div className="status-card">
        <h3 className="status-card-title mixed-case">MSS</h3>
        <LBandStatusDetails lb={r.l_band_status} />
      </div>

      <div className="status-card">
        <h3 className="status-card-title mixed-case">xFill</h3>
        <div style={{ fontSize: 14 }}>
          {!r.xfill_present ? (
            <span className="muted">— no GSOF record 38 network flags in this stream</span>
          ) : r.xfill_ready ? (
            "Ready"
          ) : (
            "Not ready"
          )}
        </div>
      </div>

      {(r.received_base || r.base_position_quality) && <BaseStationCard r={r} />}
      {r.radio_info && <RadioInfoCard ri={r.radio_info} />}

      {r.has_baseline && (
        <div className="status-card">
          <h3 className="status-card-title">RTK ECEF Δ</h3>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
            ΔX {r.delta_x_m.toFixed(3)} · ΔY {r.delta_y_m.toFixed(3)} · ΔZ {r.delta_z_m.toFixed(3)} m
          </div>
        </div>
      )}
      {r.config_status && (
        <div className="muted" style={{ fontSize: 12 }}>
          Last config: {r.config_status}
          {r.last_config_json && (
            <details style={{ marginTop: 6 }}>
              <summary>JSON</summary>
              <pre style={{ maxHeight: 200, overflow: "auto", fontSize: 11 }}>{r.last_config_json}</pre>
            </details>
          )}
        </div>
      )}
      {r.stream_warnings && r.stream_warnings.length > 0 && (
        <details>
          <summary className="muted">Stream warnings ({r.stream_warnings.length})</summary>
          <ul>
            {r.stream_warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function lBandExtraItems(lb: LBandStatus): { label: string; value: string }[] {
  const items: { label: string; value: string }[] = [];
  const add = (label: string, value: string | undefined) => {
    if (value === undefined || value === "") return;
    items.push({ label, value });
  };
  if (lb.nominal_frequency_mhz != null) add("Nominal frequency", `${lb.nominal_frequency_mhz.toFixed(6)} MHz`);
  if (lb.bit_rate_hz != null) add("Satellite bit rate", `${lb.bit_rate_hz} Hz`);
  if (lb.snr_db_hz != null) add("SNR", `${lb.snr_db_hz.toFixed(2)} dB-Hz`);
  if (lb.engine) add("HP/XP/G2 engine", lb.engine);
  if (lb.hp_library_active !== undefined) {
    add("HP library mode", lb.hp_library_active ? "active" : "not active");
  }
  if (lb.vbs_library_active !== undefined) {
    add("VBS library mode", lb.vbs_library_active ? "active" : "not active");
  }
  if (lb.omnistar_motion) add("OmniSTAR motion", lb.omnistar_motion);
  if (lb.sigma_horizontal_threshold_m != null) {
    add("3σ horizontal precision threshold", `${lb.sigma_horizontal_threshold_m.toFixed(3)} m`);
  }
  if (lb.sigma_vertical_threshold_m != null) {
    add("3σ vertical precision threshold", `${lb.sigma_vertical_threshold_m.toFixed(3)} m`);
  }
  if (lb.nmea_encryption_on !== undefined) {
    add("NMEA encryption", lb.nmea_encryption_on ? "On" : "Off");
  }
  if (lb.iq_ratio != null) add("I/Q ratio", lb.iq_ratio.toFixed(6));
  if (lb.estimated_bit_error_rate != null) {
    add("Estimated bit error rate", lb.estimated_bit_error_rate.toExponential(4));
  }
  if (lb.total_unique_words != null) add("Unique words detected (total)", String(lb.total_unique_words));
  if (lb.bad_unique_words != null) add("Bad unique words", String(lb.bad_unique_words));
  if (lb.bad_unique_word_bits != null) add("Bad unique word bits", String(lb.bad_unique_word_bits));
  if (lb.total_viterbi_symbols != null) add("Viterbi symbols (total)", String(lb.total_viterbi_symbols));
  if (lb.bad_viterbi_symbols != null) add("Bad Viterbi symbols", String(lb.bad_viterbi_symbols));
  if (lb.bad_messages != null) add("Bad messages", String(lb.bad_messages));
  if (lb.measured_satellite_frequency_hz != null && lb.measured_frequency_trusted !== undefined) {
    add(
      "Measured satellite frequency",
      `${lb.measured_satellite_frequency_hz.toLocaleString(undefined, { maximumFractionDigits: 3 })} Hz (${
        lb.measured_frequency_trusted ? "corrected for local clock" : "not corrected — do not trust"
      })`
    );
  }
  return items;
}

function LBandStatusDetails({ lb }: { lb: LBandStatus | undefined }) {
  if (!lb) {
    return <span className="muted">—</span>;
  }

  const sv = lb.satellite_name?.trim() || "—";
  const tracking = lb.beam_mode?.trim() || "—";
  const extra = lBandExtraItems(lb);

  const dlStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(7rem, auto) 1fr",
    gap: "6px 12px",
    margin: 0,
    fontSize: 13,
  };

  return (
    <div>
      <dl style={dlStyle}>
        <dt className="muted" style={{ margin: 0 }}>
          SV
        </dt>
        <dd style={{ margin: 0 }}>{sv}</dd>
        <dt className="muted" style={{ margin: 0 }}>
          Tracking
        </dt>
        <dd style={{ margin: 0 }}>{tracking}</dd>
      </dl>
      {extra.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary className="muted" style={{ cursor: "pointer", fontSize: 13, userSelect: "none" }}>
            Details
          </summary>
          <dl style={{ ...dlStyle, marginTop: 10 }}>
            {extra.map((it, i) => (
              <Fragment key={i}>
                <dt className="muted" style={{ margin: 0 }}>
                  {it.label}
                </dt>
                <dd style={{ margin: 0 }}>{it.value}</dd>
              </Fragment>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}

/** SBAS / MSS are not position SVs in typical setups — hide misleading zero counts. */
function constellationCountDisplay(name: string, n: number): string {
  if ((name === "SBAS" || name === "RTX (MSS)") && n === 0) return "—";
  return String(n);
}

function ConstellationTable({ r }: { r: ReceiverSnapshot }) {
  const used = r.sv_used_by_system ?? {};
  const tracked = r.sv_tracked_by_system ?? {};
  const names = [...new Set([...Object.keys(used), ...Object.keys(tracked)])].sort();
  if (names.length === 0) {
    return <span className="muted">—</span>;
  }
  return (
    <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left", padding: "4px 8px 4px 0" }}>Constellation</th>
          <th style={{ textAlign: "right", padding: 4 }}>Used</th>
          <th style={{ textAlign: "right", padding: 4 }}>Tracked</th>
        </tr>
      </thead>
      <tbody>
        {names.map((name) => (
          <tr key={name}>
            <td style={{ padding: "2px 8px 2px 0" }}>{name}</td>
            <td style={{ textAlign: "right", padding: 4 }}>{constellationCountDisplay(name, used[name] ?? 0)}</td>
            <td style={{ textAlign: "right", padding: 4 }}>{constellationCountDisplay(name, tracked[name] ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
