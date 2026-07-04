package httppath

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNormalize(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"", ""},
		{"/", ""},
		{"/trimble", "/trimble"},
		{"/trimble/", "/trimble"},
		{"trimble/", "/trimble"},
		{"  /app/console/  ", "/app/console"},
	}
	for _, tc := range tests {
		if got := Normalize(tc.in); got != tc.want {
			t.Errorf("Normalize(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestStripMiddleware(t *testing.T) {
	var seenPath, seenPrefix string
	h := StripMiddleware(RootPath{Default: "/static"}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenPath = r.URL.Path
		seenPrefix = FromContext(r.Context())
	}))

	t.Run("header overrides default", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/proxy/api/config", nil)
		req.Header.Set("X-Forwarded-Prefix", "/proxy")
		seenPath, seenPrefix = "", ""
		h.ServeHTTP(httptest.NewRecorder(), req)
		if seenPath != "/api/config" {
			t.Fatalf("path = %q, want /api/config", seenPath)
		}
		if seenPrefix != "/proxy" {
			t.Fatalf("prefix = %q, want /proxy", seenPrefix)
		}
	})

	t.Run("default prefix strips", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/static/", nil)
		seenPath, seenPrefix = "", ""
		h.ServeHTTP(httptest.NewRecorder(), req)
		if seenPath != "/" {
			t.Fatalf("path = %q, want /", seenPath)
		}
		if seenPrefix != "/static" {
			t.Fatalf("prefix = %q, want /static", seenPrefix)
		}
	})

	t.Run("no prefix passes through", func(t *testing.T) {
		h2 := StripMiddleware(RootPath{}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			seenPath = r.URL.Path
		}))
		req := httptest.NewRequest(http.MethodGet, "/api/config", nil)
		h2.ServeHTTP(httptest.NewRecorder(), req)
		if seenPath != "/api/config" {
			t.Fatalf("path = %q, want /api/config", seenPath)
		}
	})
}
