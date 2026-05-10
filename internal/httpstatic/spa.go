package httpstatic

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// SPADist serves files from fsys; unknown paths fall back to index.html for client-side routing.
func SPADist(fsys fs.FS) http.Handler {
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
		http.ServeFileFS(w, r, fsys, p)
	})
}
