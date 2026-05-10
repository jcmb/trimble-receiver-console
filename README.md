# Trimble receiver console

Go service that accepts **inbound TCP** connections from Trimble receivers, decodes **GSOF** (via [`github.com/gkirk/dcol`](https://github.com/gkirk/dcol)) from DCOL type `0x40` frames, and serves a **Vite + React** UI for list/map/status, sky plot, and configuration validation.

## Requirements

- **Go** 1.21+
- **Node.js** **20.19+** (or **22.12+**) — required by [Vite 8](https://vite.dev/); use `node -v` before `npm ci`.
- **npm** (or another client that respects `package-lock.json`) — only to install JS deps and run the Vite production build for the embedded UI.

## Configuration

```bash
cp config/config.example.yaml config.yaml
# edit http_bind / http_port (or legacy http_listen), groups (id, name, tcp_listen, people), default_mode, map_tile_url, cors_origins
export TRIMBLE_CONFIG=$PWD/config.yaml
```

### Groups

- Each **group** has its own **`tcp_listen`** address. Receivers for that site connect to that port.
- The `people` list is **reserved** for a future Google-auth roster; it is exposed in the API but unused in v1.
- If **`groups`** is omitted, a single **`default`** group is created from legacy **`tcp_listen`** (default `0.0.0.0:9000`).

### Offline retention

Receivers that have disconnected stay in the UI as **offline** until **7 days** after their last update, then are removed automatically (hourly GC).

## Build

```bash
make   # npm ci && vite build + cross-compile -> bin/trimble-console-linux-{amd64,arm64,arm}
```

Native binary for the host OS/arch (after a web build):

```bash
make server   # also produces bin/trimble-console
# or, after `make web` once:
go build -o bin/trimble-console ./cmd/server
```

The UI is embedded from `cmd/server/dist` (`//go:embed`). Client routes such as `/help` fall back to `index.html`.

## Run (macOS / Linux)

```bash
./bin/trimble-console
```

- HTTP UI: `http_bind` + `http_port` (defaults `127.0.0.1`, `8081`), or legacy `http_listen` for one combined address
- Receiver TCP: one port **per group** (see config)

In the UI, pick a **group** first, then manage receivers for that group. **Help** (`/help`) summarizes required/optional GSOF records.

**Terminal logs:** each TCP connect/disconnect is logged. While data flows, **GSOF** reception is logged (throttled ~every 2s). If bytes arrive but no GSOF is decoded, a warning explains that DCOL **0x40** GSOF frames are expected.

## HTTP API

- `GET /api/config` — `map_tile_url`, `groups` (id, name, tcp_listen, people)
- `GET /api/groups` — same group list
- `GET /api/groups/{groupId}/receivers` — receivers (online + recently offline)
- `GET /api/groups/{groupId}/receivers/{serialOrAnonKey}`
- `POST /api/groups/{groupId}/receivers/{serialOrAnonKey}/config` — JSON body; optional **`raw_dcol_hex`**
- `GET /api/stream?group={groupId}` — WebSocket JSON `{ receivers: [...] }`

## Linux (systemd)

See [deploy/trimble-console.service](deploy/trimble-console.service). Set `EnvironmentFile` with `TRIMBLE_CONFIG=/etc/trimble-console/config.yaml`.

## Cross-compile

```bash
GOOS=linux GOARCH=amd64 go build -o bin/trimble-console-linux ./cmd/server
```

(Rebuild `cmd/server/dist` first if the UI changed.)
