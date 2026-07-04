# Trimble receiver console

Go service that accepts **inbound TCP** connections from Trimble receivers, decodes **GSOF** (via [`github.com/gkirk/dcol`](https://github.com/gkirk/dcol)) from DCOL type `0x40` frames, and serves a **Vite + React** UI for list/map/status, sky plot, and configuration validation.

## Requirements

- **Go** 1.21+
- **Node.js** **20.19+** (or **22.12+**) — required by [Vite 8](https://vite.dev/); use `node -v` before `npm ci`.
- **npm** (or another client that respects `package-lock.json`) — only to install JS deps and run the Vite production build for the embedded UI.

## Configuration

```bash
cp config/config.example.yaml config.yaml
# edit listen addresses, groups, default_mode, map_tile_url, cors_origins, verbose_gsof
export TRIMBLE_CONFIG=$PWD/config.yaml
```

The server reads **`config.yaml`** in the working directory unless **`TRIMBLE_CONFIG`** points at another file.

### Listen ports

There are **two** independent TCP listeners:

| Purpose | YAML keys | Default |
|--------|-----------|---------|
| **Web UI** (browser) | `http_bind` + `http_port`, or legacy `http_listen` | `0.0.0.0:7002` |
| **Receiver ingress** (GSOF / DCOL over TCP) | `groups[].tcp_listen` (inbound), `groups[].gsof_connect` (outbound dials) | `0.0.0.0:9000` listen (single default group) |

**Outbound GSOF** — dial receivers or stream servers (client mode):

```yaml
groups:
  - id: remote
    name: "Remote streams"
    gsof_connect:
      - "192.168.10.5:2101"
      - "192.168.10.6:5018"
```

The console opens one TCP connection per entry, auto-reconnects on disconnect, and decodes GSOF the same way as inbound sessions. You can combine **`tcp_listen`** and **`gsof_connect`** on the same group.

**Command line** (repeat `-gsof-connect` for each target; merged into the first group unless `-gsof-connect-group` is set):

```bash
./bin/trimble-console -no-inbound-tcp -gsof-connect 192.168.1.50:2101
```

Use **`-no-inbound-tcp`** for outbound-only when you do not want the default inbound listen port.

**Outbound-only** (YAML, no local listen port):

```yaml
groups:
  - id: field
    name: "Field"
    gsof_connect:
      - "10.0.0.12:2101"
```

Legacy single-group layout (omit `groups:`):

```yaml
gsof_connect:
  - "192.168.1.50:2101"
# omit tcp_listen or set tcp_listen: "" when using outbound only
```

**Inbound listen on port 2101** (receiver connects to you):

```yaml
groups:
  - id: field
    name: "Field"
    tcp_listen: "0.0.0.0:2101"
    people: []
```

Point the receiver’s TCP output at **host:2101** on the machine running this console.

**Legacy single-group** (omit `groups:` entirely):

```yaml
tcp_listen: "0.0.0.0:2101"
```

**Web UI on localhost only** (reverse-proxy or SSH tunnel in front):

```yaml
http_bind: "127.0.0.1"
http_port: 7002
```

**Web UI on a different port** (e.g. 8080):

```yaml
http_bind: "0.0.0.0"
http_port: 8080
```

Or one combined address (overrides `http_bind` / `http_port`):

```yaml
http_listen: "0.0.0.0:8080"
```

Use `0.0.0.0` to accept connections on all interfaces; use `127.0.0.1` for localhost only.

### Reverse proxy (subpath)

The UI can be served under a URL prefix (e.g. `https://example.com/trimble-console/`) behind nginx, Caddy, or similar.

**Automatic detection:** set the **`X-Forwarded-Prefix`** header to the public path (no trailing slash). The server strips that prefix from incoming paths when the proxy forwards the full URI, injects the prefix into `index.html`, and returns it in **`/api/config`** as `root_path`.

**Static prefix:** set **`root_path`** in `config.yaml` or pass **`-root-path /trimble-console`** when the proxy does not send `X-Forwarded-Prefix`. The CLI flag overrides YAML. Per-request `X-Forwarded-Prefix` still wins when present.

nginx example (proxy strips the location prefix before forwarding):

```nginx
location /trimble-console/ {
    proxy_pass http://127.0.0.1:7002/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Prefix /trimble-console;
}
```

Caddy example:

```caddy
handle_path /trimble-console/* {
    reverse_proxy localhost:7002 {
        header_up X-Forwarded-Prefix /trimble-console
    }
}
```

Bind the Go process to localhost when the proxy is on the same host:

```yaml
http_bind: "127.0.0.1"
http_port: 7002
```

### Groups

- Each **group** has its own **`tcp_listen`** address. Receivers for that site connect to that port.
- The `people` list is **reserved** for a future Google-auth roster; it is exposed in the API but unused in v1.
- If **`groups`** is omitted, a single **`default`** group is created from legacy **`tcp_listen`** (default `0.0.0.0:9000`).

### Offline retention

Receivers that have disconnected stay in the UI as **offline** until **7 days** after their last update, then are removed automatically (hourly GC).

TCP connections that never report a serial, DCOL RET SERIAL (07h), or GSOF are closed and dropped from the list after **5 minutes** (checked every 30 seconds).

### Map tiles

The **Map** tab loads raster tiles from **`map_tile_url`** (default: OpenStreetMap). Hover a marker for fix type, DOP, SV counts, and coordinates. Alternative free layers (topographic, satellite) and attribution notes are listed on **Help** (`/help`) and in commented examples in `config/config.example.yaml`.

### GSOF debugging

For troubleshooting decode issues (e.g. legacy firmware, type **2** LLH, type **48** SV detail), enable verbose logging:

```yaml
verbose_gsof: true
```

Or at startup: `./bin/trimble-console -verbose-gsof` (overrides config). Logs include per-report record histograms, raw/flattened GSOF packet hex, and type **0x02** parse results on stderr.

For a lighter view, use **`summary_gsof: true`** or **`-summary-gsof`**: every **15 seconds** per stream, logs which GSOF sub-record types were seen and how many times (e.g. `0x02(2):LLH:42 0x09(9):DOP:42`).

**Note:** GSOF record type **62** (`0x3E`) is **not** used for position in this application; LLH comes from type **2**.

## Build

The web UI is **not** checked into git. Vite writes to `cmd/server/dist/`, which the Go binary embeds (`//go:embed`). You must build the UI before every `go build`:

```bash
make server          # native binary -> bin/trimble-console
# or
./scripts/build.sh server
```

Cross-compile (runs `make web` first):

```bash
make                 # Linux amd64/arm64/arm + macOS arm64
./scripts/build.sh   # same as make (see ./scripts/build.sh help)
```

Individual targets:

```bash
make web             # UI only -> cmd/server/dist
make linux-amd64     # bin/trimble-console-linux-amd64
make linux-arm64
make linux-arm       # GOARM=7 by default
make macos-arm64
```

Plain `go build ./cmd/server` without `make web` only works if `cmd/server/dist/` already exists from a prior build.

Client routes such as `/help` and `/graph/...` fall back to `index.html` for the embedded SPA.

### Development (UI + API)

Terminal 1 — run the Go server (defaults to **http://0.0.0.0:7002**):

```bash
export TRIMBLE_CONFIG=$PWD/config.yaml
make server && ./bin/trimble-console
```

Terminal 2 — Vite dev server with API proxy to port 7002:

```bash
cd web && npm ci && npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). API and WebSocket calls are proxied to the Go backend.

## Run (macOS / Linux)

```bash
./bin/trimble-console -help
```

```bash
# Outbound GSOF only (no config.yaml gsof_connect needed):
./bin/trimble-console -no-inbound-tcp \
  -gsof-connect 192.168.10.5:2101 \
  -gsof-connect 192.168.10.6:5018

# Outbound plus existing inbound listen from config:
./bin/trimble-console -gsof-connect 10.0.0.20:2101

# Target a specific group when using multiple groups:
./bin/trimble-console -gsof-connect-group field -gsof-connect 10.0.0.20:2101
```

- HTTP UI: `http://<host>:7002` by default (`http_bind` + `http_port`, or legacy `http_listen`)
- Receiver TCP: one port **per group** via `tcp_listen` (see [Listen ports](#listen-ports))

In the UI, pick a **group** first, then use **List**, **Map**, **Detail**, and **Configure** (footer tabs). **Help** (`/help`) summarizes GSOF records, map tiles, and metric graphs.

**Detail** shows receiver status (position, velocity, vector, SV information, sky plot, SV tracking table). **Configure** applies receiver settings when the stream is not read-only.

### Metric graphs

Blue underlined labels in the Detail **Status** panel open **separate graph windows** for that receiver. Each window plots session history (pause, zoom, legend toggles, PNG download). Graph types:

| Panel | Opens from | Plots |
|-------|------------|--------|
| Fix type | Fix type label | GSOF position type over time |
| Height & σ Up | Height, σ Up | Height (m) and σ Up (m) |
| Sigma & RMS | σ East/North/Up, RMS | Position sigmas and RMS |
| DOP | PDOP, HDOP, VDOP, TDOP | Dilution of precision |
| Velocity | Velocity fields | Horizontal/vertical speed (m/s), heading (°) |
| Vector | Vector diagnostics fields | Common/diff SV counts, RTK age, link integrity |
| SV Information | **Used** / **Tracked** column headers | Per-constellation used (solid) and tracked (dashed) SV counts |

Graph routes: `/graph/<panel>?group=...&receiver=...` (opened automatically from the UI).

**Terminal logs:** each TCP connect/disconnect is logged. While data flows, **GSOF** reception is logged once per connection. If bytes arrive but no GSOF is decoded, a warning explains that DCOL **0x40** GSOF frames are expected. With **`verbose_gsof`** or **`-verbose-gsof`**, each GSOF report logs record types and packet hex. With **`summary_gsof`** or **`-summary-gsof`**, a rollup of sub-record types is logged every 15 seconds per stream.

## HTTP API

- `GET /api/config` — `map_tile_url`, `groups` (id, name, tcp_listen, gsof_connect, people)
- `GET /api/groups` — same group list
- `GET /api/groups/{groupId}/receivers` — receivers (online + recently offline)
- `GET /api/groups/{groupId}/receivers/{serialOrAnonKey}`
- `POST /api/groups/{groupId}/receivers/{serialOrAnonKey}/config` — JSON body; optional **`raw_dcol_hex`**
- `GET /api/stream?group={groupId}` — WebSocket JSON `{ receivers: [...] }`

## Linux (systemd)

Sample unit: [deploy/trimble-console.service](deploy/trimble-console.service). Example install:

```bash
# Build on a dev machine (or CI): make web && make linux-amd64
sudo install -m755 bin/trimble-console-linux-amd64 /usr/local/bin/trimble-console
sudo mkdir -p /etc/trimble-console
sudo cp config/config.example.yaml /etc/trimble-console/config.yaml
# edit /etc/trimble-console/config.yaml — http_bind, http_port, groups, tcp_listen, etc.
sudo cp deploy/trimble-console.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now trimble-console
```

Set `TRIMBLE_CONFIG=/etc/trimble-console/config.yaml` in the unit or in `/etc/default/trimble-console` (see [deploy/env.example](deploy/env.example)).

Open firewall ports for the **HTTP UI** (default **7002/tcp**) and each **group `tcp_listen`** port. Logs: `journalctl -u trimble-console -f`.

On Fedora/RHEL, replace `User=www-data` in the unit with a dedicated service account if `www-data` does not exist.

## Cross-compile

Individual architectures (each runs `web` first):

```bash
make linux-amd64    # bin/trimble-console-linux-amd64
make linux-arm64    # bin/trimble-console-linux-arm64
make linux-arm       # bin/trimble-console-linux-arm (GOARM=7 by default)
make macos-arm64    # bin/trimble-console-macos-arm64 (Apple Silicon)
```

Plain `make` builds **all four** cross-compile targets after the UI (`linux-all` + `macos-arm64`).

**Note:** `cmd/server/dist/` is gitignored. CI and release builds must run `make web` (or `make server`) before `go build`; do not commit hashed Vite assets.
