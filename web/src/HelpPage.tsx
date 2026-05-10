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

      <h2>Required (full UI)</h2>
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
              <code>15</code>
            </td>
            <td>Receiver serial</td>
            <td>List/map key, identity</td>
          </tr>
          <tr>
            <td>
              <code>2</code> or <code>62</code>
            </td>
            <td>LLH (WGS84) / Code LLH</td>
            <td>
              Map position; <code>62</code> adds position type
            </td>
          </tr>
          <tr>
            <td>
              <code>34</code>
            </td>
            <td>All SV detail</td>
            <td>Sky plot, constellation counts, elevation/azimuth</td>
          </tr>
        </tbody>
      </table>

      <h2>Recommended</h2>
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
              <code>40</code>
            </td>
            <td>L-band status (LBAND STATUS INFO)</td>
            <td>MSS panel: satellite, frequency, SNR, beam, decodes, measured frequency</td>
          </tr>
          <tr>
            <td>
              <code>38</code>
            </td>
            <td>Position type</td>
            <td>
              Fix type / flags if not using <code>62</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>12</code>
            </td>
            <td>Position sigma</td>
            <td>RMS, sigmas, error ellipse</td>
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
              <code>8</code>
            </td>
            <td>Velocity</td>
            <td>Rover kinematic speed and heading</td>
          </tr>
          <tr>
            <td>
              <code>6</code>
            </td>
            <td>ECEF delta</td>
            <td>RTK baseline vector (rover–base)</td>
          </tr>
          <tr>
            <td>
              <code>35</code>
            </td>
            <td>Received base</td>
            <td>Base station card: name, ID, validity, WGS84 position</td>
          </tr>
          <tr>
            <td>
              <code>41</code>
            </td>
            <td>Base position and quality</td>
            <td>Same card as <code>35</code>: moving-base antenna LLH, quality, GPS time</td>
          </tr>
          <tr>
            <td>
              <code>57</code>
            </td>
            <td>Radio information</td>
            <td>Radio card: band, channel, signal/noise (dBm) and bar counts per radio</td>
          </tr>
        </tbody>
      </table>

      <h2>Optional / fallback</h2>
      <table>
        <thead>
          <tr>
            <th>Record</th>
            <th>Description</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>33</code>
            </td>
            <td>Brief all SV</td>
            <td>
              Used if <code>34</code> is absent (no sky geometry)
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Retention</h2>
      <p className="muted">
        Receivers that have disconnected remain visible as <strong>offline</strong> for{" "}
        <strong>7 days</strong> after their last activity, then are removed from the list automatically.
      </p>

      <h2>Groups</h2>
      <p className="muted">
        Each group listens on its own TCP port. Receivers must connect to the port for their group. A{" "}
        <code>people</code> list in configuration is reserved for future Google sign-in; it is ignored in this
        version.
      </p>

      <p className="muted" style={{ marginTop: 24 }}>
        Refer to Trimble receiver documentation for enabling GSOF output (e.g. Alloy / receiver help: GSOF
        messages).
      </p>
    </div>
  );
}
