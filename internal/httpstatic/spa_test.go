package httpstatic

import (
	"strings"
	"testing"
)

func TestInjectRootPath(t *testing.T) {
	html := []byte(`<!DOCTYPE html><html><head><meta charset="UTF-8" /></head><body></body></html>`)

	t.Run("subpath injects base and script", func(t *testing.T) {
		out := string(injectRootPath(html, "/trimble-console"))
		if !strings.Contains(out, `<base href="/trimble-console/">`) {
			t.Fatalf("missing base tag: %s", out)
		}
		if !strings.Contains(out, `window.__TRIMBLE_ROOT_PATH__="/trimble-console"`) {
			t.Fatalf("missing root path script: %s", out)
		}
	})

	t.Run("root uses slash base", func(t *testing.T) {
		out := string(injectRootPath(html, ""))
		if !strings.Contains(out, `<base href="/">`) {
			t.Fatalf("missing root base tag: %s", out)
		}
	})
}
