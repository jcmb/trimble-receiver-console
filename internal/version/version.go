// Package version holds the binary version string, normally set at link time via:
//
//	go build -ldflags "-X github.com/gkirk/trimble-receiver-console/internal/version.Version=$(git describe --always --dirty)"
//
// When Version is empty or "dev", Display falls back to VCS metadata from the Go module build (go 1.18+).
package version

import (
	"fmt"
	"runtime/debug"
)

// Version is the release / build identifier (git describe, tag, or "dev").
var Version = "dev"

// Display returns Version when it is set to something other than the default placeholder,
// otherwise a short VCS revision from [debug.ReadBuildInfo] when available.
func Display() string {
	if Version != "" && Version != "dev" {
		return Version
	}
	bi, ok := debug.ReadBuildInfo()
	if !ok {
		return Version
	}
	var rev, dirty string
	for _, s := range bi.Settings {
		switch s.Key {
		case "vcs.revision":
			rev = s.Value
		case "vcs.modified":
			if s.Value == "true" {
				dirty = "-dirty"
			}
		}
	}
	if rev == "" {
		return Version
	}
	if len(rev) > 12 {
		rev = rev[:12]
	}
	return rev + dirty
}

// ConsoleBannerLine matches the web/API "trimble-receiver-console version …" text.
func ConsoleBannerLine() string {
	return fmt.Sprintf("trimble-receiver-console version %s", Display())
}
