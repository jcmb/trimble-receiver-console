import { useEffect, useState } from "react";

const emptySlot = { enabled: false, format: "RTCMv3", host: "", port: 2101, mount: "" };

type CfgTab = "general" | "radio" | "advanced" | "data_logging" | "rover" | "base" | "ibss";

const TABS: { id: CfgTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "radio", label: "Radio" },
  { id: "advanced", label: "Advanced" },
  { id: "data_logging", label: "Data logging" },
  { id: "rover", label: "Rover" },
  { id: "base", label: "Base" },
  { id: "ibss", label: "IBSS" },
];

export function ConfigForm({
  groupId: _groupId,
  receiverKey: _receiverKey,
  mode,
}: {
  groupId: string;
  receiverKey: string;
  mode: "read_only" | "read_write";
}) {
  const [tab, setTab] = useState<CfgTab>("general");
  const [role, setRole] = useState<"base" | "rover">("rover");
  const [iono, setIono] = useState<boolean | null>(null);
  const [elev, setElev] = useState<string>("");
  const [syncLow, setSyncLow] = useState<"sync" | "low_latency">("sync");
  const [outIR, setOutIR] = useState(false);
  const [outSer, setOutSer] = useState(false);
  const [outNt, setOutNt] = useState(false);
  const [antennaType, setAntennaType] = useState("");
  const [measMethod, setMeasMethod] = useState("");
  const [antennaH, setAntennaH] = useState<string>("0");
  const [refLatDeg, setRefLatDeg] = useState<string>("0");
  const [refLonDeg, setRefLonDeg] = useState<string>("0");
  const [refH, setRefH] = useState<string>("0");
  const [ibssOrg, setIbssOrg] = useState("");
  const [ibssPass, setIbssPass] = useState("");
  const [servers, setServers] = useState([{ ...emptySlot }, { ...emptySlot }, { ...emptySlot }]);
  const [logEn, setLogEn] = useState(false);
  const [logMode, setLogMode] = useState<"high_rate" | "hz1" | "static">("hz1");

  const readOnly = mode === "read_only";

  useEffect(() => {
    if (role === "rover" && tab === "base") setTab("general");
    if (role === "base" && tab === "rover") setTab("general");
  }, [role, tab]);

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      {readOnly && (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          This receiver session is read-only — fields are shown for reference only.
        </p>
      )}
      <div className={`row config-tab-strip${readOnly ? " config-tab-strip-readonly" : ""}`} style={{ flexWrap: "wrap", gap: 6 }}>
        {TABS.map((t) => {
          const tabConflict =
            (t.id === "base" && role === "rover") || (t.id === "rover" && role === "base");
          const title = tabConflict
            ? t.id === "base"
              ? "Not available while role is Rover"
              : "Not available while role is Base"
            : undefined;
          return (
            <button
              key={t.id}
              type="button"
              title={title}
              disabled={tabConflict}
              onClick={() => setTab(t.id)}
              className={`nav-tab${tab === t.id ? " active" : ""}${tabConflict ? " nav-tab-disabled" : ""}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "general" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label className="row">
            Role
            <select
              value={role}
              disabled={readOnly}
              onChange={(e) => setRole(e.target.value as "base" | "rover")}
            >
              <option value="rover">Rover</option>
              <option value="base">Base</option>
            </select>
          </label>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Structured fields are validated and stored; DCOL encoding is completed per your receiver ICD.
          </p>
        </div>
      )}

      {tab === "radio" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
            {role === "rover" ? (
              <>
                Radio and correction paths apply on the <strong>receive (Rx)</strong> side when this receiver is a rover.
              </>
            ) : (
              <>
                Radio and correction outputs apply on the <strong>transmit (Tx)</strong> side when this receiver is a base.
              </>
            )}
          </p>
          <label>
            <input type="checkbox" checked={outIR} disabled={readOnly} onChange={(e) => setOutIR(e.target.checked)} />{" "}
            Internal radio
          </label>
          <label>
            <input type="checkbox" checked={outSer} disabled={readOnly} onChange={(e) => setOutSer(e.target.checked)} />{" "}
            Serial
          </label>
          <label>
            <input type="checkbox" checked={outNt} disabled={readOnly} onChange={(e) => setOutNt(e.target.checked)} />{" "}
            Local NTRIP
          </label>
          {role === "base" && (
            <div className="row" style={{ marginTop: 8, flexWrap: "wrap", gap: 12 }}>
              <span className="muted">Sync / low latency (Tx)</span>
              <label>
                <input
                  type="radio"
                  name="sl"
                  disabled={readOnly}
                  checked={syncLow === "sync"}
                  onChange={() => setSyncLow("sync")}
                />{" "}
                Sync
              </label>
              <label>
                <input
                  type="radio"
                  name="sl"
                  disabled={readOnly}
                  checked={syncLow === "low_latency"}
                  onChange={() => setSyncLow("low_latency")}
                />{" "}
                Low latency
              </label>
            </div>
          )}
        </div>
      )}

      {tab === "advanced" && (
        <div className="panel row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          <label className="row">
            IonoGuard
            <select
              value={iono === null ? "" : iono ? "on" : "off"}
              disabled={readOnly}
              onChange={(e) => setIono(e.target.value === "" ? null : e.target.value === "on")}
            >
              <option value="">(unchanged)</option>
              <option value="on">Enable</option>
              <option value="off">Disable</option>
            </select>
          </label>
          <label>
            Elevation mask (deg)
            <input value={elev} disabled={readOnly} onChange={(e) => setElev(e.target.value)} placeholder="e.g. 10" />
          </label>
        </div>
      )}

      {tab === "data_logging" && (
        <fieldset className="panel" style={{ borderStyle: "solid" }} disabled={readOnly}>
          <legend>Data logging</legend>
          <label>
            <input type="checkbox" checked={logEn} onChange={(e) => setLogEn(e.target.checked)} /> Enable
          </label>
          <select value={logMode} onChange={(e) => setLogMode(e.target.value as typeof logMode)}>
            <option value="high_rate">High rate</option>
            <option value="hz1">1 Hz</option>
            <option value="static">Static</option>
          </select>
        </fieldset>
      )}

      {tab === "rover" && (
        <p className="muted" style={{ margin: 0 }}>
          Rover-specific DCOL options can be added once byte layouts are wired in the encoder. Use <strong>Radio</strong> for
          Rx-path correction inputs and <strong>IBSS</strong> for NTRIP.
        </p>
      )}

      {tab === "base" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {role !== "base" && (
            <p className="muted" style={{ margin: 0 }}>
              Set role to <strong>Base</strong> under General to edit reference station fields.
            </p>
          )}
          {role === "base" && (
            <>
              <label>
                Antenna type
                <input value={antennaType} disabled={readOnly} onChange={(e) => setAntennaType(e.target.value)} />
              </label>
              <label>
                Measurement method
                <input value={measMethod} disabled={readOnly} onChange={(e) => setMeasMethod(e.target.value)} />
              </label>
              <label>
                Antenna height (m)
                <input value={antennaH} disabled={readOnly} onChange={(e) => setAntennaH(e.target.value)} />
              </label>
              <label>
                Reference latitude (deg)
                <input value={refLatDeg} disabled={readOnly} onChange={(e) => setRefLatDeg(e.target.value)} />
              </label>
              <label>
                Reference longitude (deg)
                <input value={refLonDeg} disabled={readOnly} onChange={(e) => setRefLonDeg(e.target.value)} />
              </label>
              <label>
                Reference height (m)
                <input value={refH} disabled={readOnly} onChange={(e) => setRefH(e.target.value)} />
              </label>
            </>
          )}
        </div>
      )}

      {tab === "ibss" && (
        <fieldset className="panel" style={{ borderStyle: "solid" }} disabled={readOnly}>
          <legend>IBSS NTRIP (3 slots)</legend>
          <label>
            Org <input value={ibssOrg} onChange={(e) => setIbssOrg(e.target.value)} />
          </label>
          <label>
            Password <input type="password" value={ibssPass} onChange={(e) => setIbssPass(e.target.value)} />
          </label>
          {[0, 1, 2].map((i) => (
            <div key={i} className="panel" style={{ marginTop: 8 }}>
              <strong>Server {i + 1}</strong>
              <label className="row">
                <input
                  type="checkbox"
                  checked={servers[i]!.enabled}
                  onChange={(e) => {
                    const next = [...servers];
                    next[i] = { ...next[i]!, enabled: e.target.checked };
                    setServers(next);
                  }}
                />
                Enabled
              </label>
              <label>
                Format
                <select
                  value={servers[i]!.format}
                  onChange={(e) => {
                    const next = [...servers];
                    next[i] = { ...next[i]!, format: e.target.value };
                    setServers(next);
                  }}
                >
                  <option value="CMR">CMR</option>
                  <option value="CMRx">CMRx</option>
                  <option value="RTCMv3">RTCMv3</option>
                </select>
              </label>
              <label>
                Host{" "}
                <input
                  value={servers[i]!.host}
                  onChange={(e) => {
                    const n = [...servers];
                    n[i]!.host = e.target.value;
                    setServers(n);
                  }}
                />
              </label>
              <label>
                Port{" "}
                <input
                  type="number"
                  value={servers[i]!.port || ""}
                  onChange={(e) => {
                    const n = [...servers];
                    n[i]!.port = parseInt(e.target.value, 10) || 0;
                    setServers(n);
                  }}
                />
              </label>
              <label>
                Mount{" "}
                <input
                  value={servers[i]!.mount}
                  onChange={(e) => {
                    const n = [...servers];
                    n[i]!.mount = e.target.value;
                    setServers(n);
                  }}
                />
              </label>
            </div>
          ))}
        </fieldset>
      )}

      <button type="button" disabled title="Configuration apply is not implemented yet">
        Not implemented
      </button>
    </form>
  );
}
