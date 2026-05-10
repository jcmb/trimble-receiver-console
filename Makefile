.PHONY: all web server
all: server

# Set at link time; defaults to git describe (commit + dirty suffix) or "dev"
VERSION ?= $(shell git describe --always --dirty 2>/dev/null || echo dev)
LDFLAGS := -X 'github.com/gkirk/trimble-receiver-console/internal/version.Version=$(VERSION)'

web:
	cd web && VITE_WEB_UI_VERSION=$(VERSION) npm ci && npm run build

server: web
	mkdir -p bin
	go build -ldflags "$(LDFLAGS)" -o bin/trimble-console ./cmd/server
