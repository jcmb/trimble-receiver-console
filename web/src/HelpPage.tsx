import { Link } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";

export function HelpPage() {
  return (
    <div style={{ maxWidth: 900, margin: "24px auto", padding: "0 16px" }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <p style={{ margin: 0 }}>
          <Link to="/">← Back to console</Link>
        </p>
        <ThemeToggle />
      </div>
      <h1>GSOF messages</h1>
      <p className="muted">
        The console decodes Trimble GSOF sub-records carried inside DCOL packet type <code>64</code>. Configure the
        receiver to output the messages below over the TCP link to this application.
      </p>

      <p style={{ fontSize: 14, lineHeight: 1.5 }}>
        <strong>Note:</strong> Record type <code>15</code> (receiver serial) is <strong>not required</strong> when the link is{" "}
        <strong>two-way</strong> and identity is available via DCOL RET SERIAL (command <code>06h</code> / response{" "}
        <code>07h</code>).
      </p>

      <h2>Required</h2>
      <table>
        <thead>
          <tr>
            <th>Record</th>
            <th>Description</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>2</code>
            </td>
            <td>LLH (WGS84)</td>
            <td>Map position, height</td>
          </tr>
          <tr>
            <td>
              <code>48</code>
            </td>
            <td>Multiple-page ALL SV detail</td>
            <td>Sky plot, constellation counts, elevation/azimuth</td>
          </tr>
          <tr>
            <td>
              <code>8</code>
            </td>
            <td>Velocity</td>
            <td>Speed and heading in detail view</td>
          </tr>
          <tr>
            <td>
              <code>9</code>
            </td>
            <td>DOP</td>
            <td>PDOP / HDOP / VDOP / TDOP</td>
          </tr>
          <tr>
            <td>
              <code>12</code>
            </td>
            <td>Position sigma</td>
            <td>RMS, σ East/North/Up, error ellipse inputs</td>
          </tr>
          <tr>
            <td>
              <code>16</code>
            </td>
            <td>UTC time</td>
            <td>Solution time shown as UTC when present</td>
          </tr>
          <tr>
            <td>
              <code>38</code>
            </td>
            <td>Position type</td>
            <td>Fix type label; optional network / xFill flags</td>
          </tr>
        </tbody>
      </table>

      <h2>UI update rate</h2>
      <p className="muted" style={{ marginTop: 8 }}>
        Send these records at the same rate as your desired UI refresh (dashboard updates):
      </p>
      <ul style={{ lineHeight: 1.6 }}>
        <li>
          <code>2</code> — LLH (position on map and detail)
        </li>
        <li>
          <code>16</code> — UTC time (when using UTC for the clock display)
        </li>
        <li>
          <code>48</code> — ALL SV detail (sky plot and tracking table)
        </li>
      </ul>

      <h2>Lower rate</h2>
      <p className="muted" style={{ marginTop: 8 }}>
        These can be sent less often than the UI update group; the console shows the latest values received.
      </p>
      <table>
        <thead>
          <tr>
            <th>Record</th>
            <th>Description</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>7</code>
            </td>
            <td>Tangent plane ENU</td>
            <td>
              <strong>Vector</strong> card: Δ East / North / Up (m) base→rover
            </td>
          </tr>
          <tr>
            <td>
              <code>28</code>
            </td>
            <td>Receiver diagnostics</td>
            <td>
              <strong>Vector</strong> card: link integrity, common SV counts, datalink latency, diff SVs, RTK age
            </td>
          </tr>
          <tr>
            <td>
              <code>40</code>
            </td>
            <td>L-band status</td>
            <td>MSS panel</td>
          </tr>
          <tr>
            <td>
              <code>35</code> / <code>41</code>
            </td>
            <td>Received base / base position quality</td>
            <td>Base station card</td>
          </tr>
          <tr>
            <td>
              <code>57</code>
            </td>
            <td>Radio information</td>
            <td>Radio card (bands, channels, signal/noise)</td>
          </tr>
          <tr>
            <td>
              <code>6</code>
            </td>
            <td>ECEF delta</td>
            <td>RTK baseline vector</td>
          </tr>
          <tr>
            <td>
              <code>34</code>
            </td>
            <td>ALL SV detail (single-page)</td>
            <td>Fallback when <code>48</code> is not used</td>
          </tr>
          <tr>
            <td>
              <code>33</code>
            </td>
            <td>Brief all SV</td>
            <td>Fallback when no detailed SV records</td>
          </tr>
        </tbody>
      </table>

      <h2>Optional / fallback</h2>
      <p className="muted">
        Use <code>34</code> or <code>33</code> only when the preferred records above are unavailable on your firmware or
        link budget.
      </p>

      <h2>Retention</h2>
      <p className="muted">
        Receivers that have disconnected remain visible as <strong>offline</strong> for <strong>7 days</strong> after
        their last activity, then are removed from the list automatically.
      </p>

      <h2>Groups</h2>
      <p className="muted">
        Each group listens on its own TCP port. Receivers must connect to the port for their group. A{" "}
        <code>people</code> list in configuration is reserved for future Google sign-in; it is ignored in this version.
      </p>

      <p className="muted" style={{ marginTop: 24 }}>
        Refer to Trimble receiver documentation for enabling GSOF output (e.g. Alloy / receiver help: GSOF messages).
      </p>
    </div>
  );
}
