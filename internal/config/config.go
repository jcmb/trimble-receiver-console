package config

import (
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

type Mode string

const (
	ModeReadOnly  Mode = "read_only"
	ModeReadWrite Mode = "read_write"
)

// GroupConfig defines one TCP ingress group (future: Google auth + people per group).
type GroupConfig struct {
	ID        string   `yaml:"id"`
	Name      string   `yaml:"name"`
	TCPListen string   `yaml:"tcp_listen"`
	People    []string `yaml:"people"`
}

// Config is loaded from YAML.
type Config struct {
	// HTTPListen is an optional legacy full listen address (host:port). When set, it overrides HTTPBind and HTTPPort.
	HTTPListen string `yaml:"http_listen"`
	// HTTPBind is the address the HTTP UI binds to (ignored when HTTPListen is set). Default 127.0.0.1.
	HTTPBind string `yaml:"http_bind"`
	// HTTPPort is the TCP port for the HTTP UI (ignored when HTTPListen is set). Default 8081.
	HTTPPort int `yaml:"http_port"`
	// TCPListen is used only when groups is empty (backward compatibility).
	TCPListen string `yaml:"tcp_listen"`
	Groups    []GroupConfig `yaml:"groups"`

	DefaultMode Mode `yaml:"default_mode"`
	IgnoreTCPGSOFTransmissionGap1 bool `yaml:"ignore_tcp_gsof_transmission_gap1"`
	CORSOrigins []string `yaml:"cors_origins"`
	MapTileURL  string   `yaml:"map_tile_url"`
}

func Default() *Config {
	return &Config{
		HTTPBind:                      "127.0.0.1",
		HTTPPort:                      8081,
		TCPListen:                     "0.0.0.0:9000",
		Groups:                        nil,
		DefaultMode:                   ModeReadWrite,
		IgnoreTCPGSOFTransmissionGap1: true,
		CORSOrigins:                   []string{"*"},
		MapTileURL:                    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
	}
}

func Load(path string) (*Config, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	c := Default()
	if err := yaml.Unmarshal(b, c); err != nil {
		return nil, fmt.Errorf("yaml: %w", err)
	}
	if c.DefaultMode != ModeReadOnly && c.DefaultMode != ModeReadWrite {
		return nil, fmt.Errorf("invalid default_mode %q", c.DefaultMode)
	}
	c.NormalizeGroups()
	if err := c.ValidateGroups(); err != nil {
		return nil, err
	}
	if err := c.ValidateHTTPListen(); err != nil {
		return nil, err
	}
	return c, nil
}

// ListenHTTP returns the listen address for the HTTP UI (bind + port, or legacy http_listen).
func (c *Config) ListenHTTP() string {
	if strings.TrimSpace(c.HTTPListen) != "" {
		return strings.TrimSpace(c.HTTPListen)
	}
	bind := c.HTTPBind
	if bind == "" {
		bind = "127.0.0.1"
	}
	port := c.HTTPPort
	if port == 0 {
		port = 8081
	}
	return net.JoinHostPort(bind, strconv.Itoa(port))
}

// ValidateHTTPListen checks that [Config.ListenHTTP] resolves as a TCP address.
func (c *Config) ValidateHTTPListen() error {
	addr := c.ListenHTTP()
	if _, err := net.ResolveTCPAddr("tcp", addr); err != nil {
		return fmt.Errorf("invalid HTTP listen address %q: %w", addr, err)
	}
	return nil
}

// NormalizeGroups builds a single default group from tcp_listen when groups is unset.
func (c *Config) NormalizeGroups() {
	if len(c.Groups) > 0 {
		return
	}
	id := "default"
	name := "Default"
	if c.TCPListen == "" {
		c.TCPListen = "0.0.0.0:9000"
	}
	c.Groups = []GroupConfig{
		{ID: id, Name: name, TCPListen: c.TCPListen, People: nil},
	}
}

// ValidateGroups checks ids and listen addresses are unique.
func (c *Config) ValidateGroups() error {
	seenID := make(map[string]struct{})
	seenAddr := make(map[string]string)
	for i, g := range c.Groups {
		if g.ID == "" {
			return fmt.Errorf("groups[%d]: missing id", i)
		}
		if _, dup := seenID[g.ID]; dup {
			return fmt.Errorf("duplicate group id %q", g.ID)
		}
		seenID[g.ID] = struct{}{}
		if g.TCPListen == "" {
			return fmt.Errorf("group %q: missing tcp_listen", g.ID)
		}
		if other, dup := seenAddr[g.TCPListen]; dup {
			return fmt.Errorf("groups %q and %q: duplicate tcp_listen %q", other, g.ID, g.TCPListen)
		}
		seenAddr[g.TCPListen] = g.ID
		if g.Name == "" {
			c.Groups[i].Name = g.ID
		}
	}
	return nil
}
