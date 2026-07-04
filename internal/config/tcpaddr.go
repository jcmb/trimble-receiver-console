package config

import (
	"fmt"
	"net"
	"strings"
)

// NormalizeTCPDialAddr validates host:port for outbound TCP dials and returns a canonical form.
func NormalizeTCPDialAddr(s string) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", fmt.Errorf("empty address")
	}
	host, port, err := net.SplitHostPort(s)
	if err != nil {
		return "", fmt.Errorf("invalid host:port %q: %w", s, err)
	}
	if strings.TrimSpace(host) == "" {
		return "", fmt.Errorf("invalid host:port %q: missing host", s)
	}
	if strings.TrimSpace(port) == "" {
		return "", fmt.Errorf("invalid host:port %q: missing port", s)
	}
	if _, err := net.LookupPort("tcp", port); err != nil {
		return "", fmt.Errorf("invalid port in %q: %w", s, err)
	}
	return net.JoinHostPort(host, port), nil
}

// NormalizeTCPDialAddrs trims, validates, and deduplicates dial targets (first occurrence wins).
func NormalizeTCPDialAddrs(in []string) ([]string, error) {
	if len(in) == 0 {
		return nil, nil
	}
	seen := make(map[string]struct{})
	out := make([]string, 0, len(in))
	for i, raw := range in {
		addr, err := NormalizeTCPDialAddr(raw)
		if err != nil {
			return nil, fmt.Errorf("gsof_connect[%d]: %w", i, err)
		}
		if _, dup := seen[addr]; dup {
			continue
		}
		seen[addr] = struct{}{}
		out = append(out, addr)
	}
	return out, nil
}
