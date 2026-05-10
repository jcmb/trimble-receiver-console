.PHONY: all web server linux-all linux-amd64 linux-arm64 linux-arm
# Default: build embedded UI once, then Linux binaries for amd64, arm64, and arm.
# Use `make server` for a single native (host OS/arch) binary at bin/trimble-console.
all: linux-all

# Set at link time; defaults to git describe (commit + dirty suffix) or "dev"
VERSION ?= $(shell git describe --always --dirty 2>/dev/null || echo dev)
LDFLAGS := -X 'github.com/gkirk/trimble-receiver-console/internal/version.Version=$(VERSION)'

# linux/arm uses GOARM (5/6/7). Default 7 matches common ARMv7 boards (e.g. Pi 2+). Override: make linux-arm GOARM=6
GOARM ?= 7

# Disable cgo for portable Linux binaries when cross-compiling from macOS or another OS.
LINUX_CGO := CGO_ENABLED=0

web:
	cd web && VITE_WEB_UI_VERSION=$(VERSION) npm ci && npm run build

server: web
	mkdir -p bin
	go build -ldflags "$(LDFLAGS)" -o bin/trimble-console ./cmd/server

linux-amd64: web
	mkdir -p bin
	$(LINUX_CGO) GOOS=linux GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o bin/trimble-console-linux-amd64 ./cmd/server

linux-arm64: web
	mkdir -p bin
	$(LINUX_CGO) GOOS=linux GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o bin/trimble-console-linux-arm64 ./cmd/server

linux-arm: web
	mkdir -p bin
	$(LINUX_CGO) GOOS=linux GOARCH=arm GOARM=$(GOARM) go build -ldflags "$(LDFLAGS)" -o bin/trimble-console-linux-arm ./cmd/server

# Build UI once, then all three Linux targets (avoids repeating npm ci).
linux-all: web
	mkdir -p bin
	$(LINUX_CGO) GOOS=linux GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o bin/trimble-console-linux-amd64 ./cmd/server
	$(LINUX_CGO) GOOS=linux GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o bin/trimble-console-linux-arm64 ./cmd/server
	$(LINUX_CGO) GOOS=linux GOARCH=arm GOARM=$(GOARM) go build -ldflags "$(LDFLAGS)" -o bin/trimble-console-linux-arm ./cmd/server
