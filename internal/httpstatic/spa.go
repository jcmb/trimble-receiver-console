package httpstatic

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// SPADist serves files from fsys; unknown paths fall back to index.html for client-side routing.
// rootPath returns the public URL prefix for the current request (may be empty).
func SPADist(fsys fs.FS, rootPath func(*http.Request) string) http.Handler {
	indexHTML, _ := fs.ReadFile(fsys, "index.html")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		p := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if p == "." {
			p = ""
		}
		if p == "" {
			p = "index.html"
		}
		if _, err := fs.Stat(fsys, p); err != nil {
			p = "index.html"
		}
		if p == "index.html" && len(indexHTML) > 0 {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write(injectRootPath(indexHTML, rootPath(r)))
			return
		}
		http.ServeFileFS(w, r, fsys, p)
	})
}

func injectRootPath(html []byte, prefix string) []byte {
	prefix = strings.TrimSpace(prefix)
	if prefix == "/" {
		prefix = ""
	}
	if prefix != "" && !strings.HasPrefix(prefix, "/") {
		prefix = "/" + prefix
	}
	prefix = strings.TrimSuffix(prefix, "/")

	baseHref := "/"
	if prefix != "" {
		baseHref = prefix + "/"
	}
	encoded, err := json.Marshal(prefix)
	if err != nil {
		encoded = []byte(`""`)
	}
	// Base tag ensures ./assets/... resolve from the app root on deep routes like /graph/sv.
	tag := `<base href="` + baseHref + `">` +
		`<script>window.__TRIMBLE_ROOT_PATH__=` + string(encoded) + `;</script>`
	s := string(html)
	const head = "<head>"
	if i := strings.Index(s, head); i >= 0 {
		i += len(head)
		return []byte(s[:i] + tag + s[i:])
	}
	return append([]byte(tag), html...)
}
