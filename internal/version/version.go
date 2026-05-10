// Package version holds the binary version string, normally set at link time via:
//
//	go build -ldflags "-X github.com/gkirk/trimble-receiver-console/internal/version.Version=$(git describe --always --dirty)"
package version

// Version is the release / build identifier (git describe, tag, or "dev").
var Version = "dev"
