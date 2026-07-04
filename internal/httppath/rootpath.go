package httppath

import (
	"context"
	"net/http"
	"strings"
)

type ctxKey int

const rootPathKey ctxKey = iota

// Normalize returns a URL path prefix without a trailing slash, or "" for site root.
func Normalize(p string) string {
	p = strings.TrimSpace(p)
	if p == "" || p == "/" {
		return ""
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return strings.TrimSuffix(p, "/")
}

// RootPath is the configured fallback when X-Forwarded-Prefix is absent.
type RootPath struct {
	Default string
}

// FromRequest returns the effective URL prefix for the request.
// X-Forwarded-Prefix wins when set; otherwise Default is used.
func (rp RootPath) FromRequest(r *http.Request) string {
	if h := strings.TrimSpace(r.Header.Get("X-Forwarded-Prefix")); h != "" {
		return Normalize(h)
	}
	return Normalize(rp.Default)
}

// WithContext stores the effective prefix on the request context.
func WithContext(r *http.Request, prefix string) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), rootPathKey, prefix))
}

// FromContext returns the effective prefix stored by StripMiddleware.
func FromContext(ctx context.Context) string {
	if v, ok := ctx.Value(rootPathKey).(string); ok {
		return v
	}
	return ""
}

// StripMiddleware records the effective prefix and strips it from r.URL.Path when present.
func StripMiddleware(rp RootPath, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		prefix := rp.FromRequest(r)
		r = WithContext(r, prefix)
		if prefix != "" {
			p := r.URL.Path
			switch {
			case p == prefix || p == prefix+"/":
				r.URL.Path = "/"
			case strings.HasPrefix(p, prefix+"/"):
				r.URL.Path = strings.TrimPrefix(p, prefix)
			}
		}
		next.ServeHTTP(w, r)
	})
}
