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
	// GSOFConnect lists host:port targets for outbound TCP dials (client mode) to GSOF streams.
	GSOFConnect []string `yaml:"gsof_connect"`
	People    []string `yaml:"people"`
}

// Config is loaded from YAML.
type Config struct {
	// HTTPListen is an optional legacy full listen address (host:port). When set, it overrides HTTPBind and HTTPPort.
	HTTPListen string `yaml:"http_listen"`
	// HTTPBind is the address the HTTP UI binds to (ignored when HTTPListen is set). Default 0.0.0.0.
	HTTPBind string `yaml:"http_bind"`
	// HTTPPort is the TCP port for the HTTP UI (ignored when HTTPListen is set). Default 7002.
	HTTPPort int `yaml:"http_port"`
	// TCPListen is used only when groups is empty (backward compatibility).
	TCPListen string `yaml:"tcp_listen"`
	// GSOFConnect is used only when groups is empty; copied into the default group (see NormalizeGroups).
	GSOFConnect []string `yaml:"gsof_connect"`
	Groups    []GroupConfig `yaml:"groups"`

	DefaultMode Mode `yaml:"default_mode"`
	IgnoreTCPGSOFTransmissionGap1 bool `yaml:"ignore_tcp_gsof_transmission_gap1"`
	// VerboseGSOF logs each GSOF report's record-type histogram and LLH (0x02) decode steps to stderr.
	VerboseGSOF bool `yaml:"verbose_gsof"`
	// SummaryGSOF logs periodic GSOF sub-record type summaries to stderr (see -summary-gsof).
	SummaryGSOF bool `yaml:"summary_gsof"`
	CORSOrigins []string `yaml:"cors_origins"`
	MapTileURL  string   `yaml:"map_tile_url"`

	// SuggestedGroupID is set at runtime (e.g. -gsof-connect-group); not loaded from YAML.
	SuggestedGroupID string `yaml:"-"`
}

func Default() *Config {
	return &Config{
		HTTPBind:                      "0.0.0.0",
		HTTPPort:                      7002,
		TCPListen:                     "0.0.0.0:9000",
		Groups:                        nil,
		DefaultMode:                   ModeReadWrite,
		IgnoreTCPGSOFTransmissionGap1: true,
		VerboseGSOF:                   false,
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
		bind = "0.0.0.0"
	}
	port := c.HTTPPort
	if port == 0 {
		port = 7002
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
	if c.TCPListen == "" && len(c.GSOFConnect) == 0 {
		c.TCPListen = "0.0.0.0:9000"
	}
	c.Groups = []GroupConfig{
		{ID: id, Name: name, TCPListen: c.TCPListen, GSOFConnect: append([]string(nil), c.GSOFConnect...), People: nil},
	}
}

func normalizeGroupIngress(g *GroupConfig) error {
	g.TCPListen = strings.TrimSpace(g.TCPListen)
	addrs, err := NormalizeTCPDialAddrs(g.GSOFConnect)
	if err != nil {
		return fmt.Errorf("group %q: %w", g.ID, err)
	}
	g.GSOFConnect = addrs
	if g.TCPListen == "" && len(g.GSOFConnect) == 0 {
		return fmt.Errorf("group %q: set tcp_listen and/or gsof_connect", g.ID)
	}
	if g.TCPListen != "" {
		if _, err := net.ResolveTCPAddr("tcp", g.TCPListen); err != nil {
			return fmt.Errorf("group %q: invalid tcp_listen %q: %w", g.ID, g.TCPListen, err)
		}
	}
	return nil
}

// ApplyCLIGSOFConnect merges command-line -gsof-connect targets into one group.
// groupID empty selects the first group. When noInbound is true, tcp_listen is cleared on that group.
func (c *Config) ApplyCLIGSOFConnect(groupID string, targets []string, noInbound bool) error {
	if len(targets) == 0 {
		return nil
	}
	if len(c.Groups) == 0 {
		c.NormalizeGroups()
	}
	normalized, err := NormalizeTCPDialAddrs(targets)
	if err != nil {
		return err
	}
	idx := 0
	if strings.TrimSpace(groupID) != "" {
		found := false
		for i, g := range c.Groups {
			if g.ID == groupID {
				idx = i
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("unknown group id %q for -gsof-connect-group", groupID)
		}
	}
	g := &c.Groups[idx]
	merged, err := NormalizeTCPDialAddrs(append(append([]string(nil), g.GSOFConnect...), normalized...))
	if err != nil {
		return err
	}
	g.GSOFConnect = merged
	if noInbound {
		g.TCPListen = ""
	}
	return normalizeGroupIngress(g)
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
		if g.Name == "" {
			c.Groups[i].Name = g.ID
		}
		if err := normalizeGroupIngress(&c.Groups[i]); err != nil {
			return err
		}
		if g.TCPListen != "" {
			if other, dup := seenAddr[g.TCPListen]; dup {
				return fmt.Errorf("groups %q and %q: duplicate tcp_listen %q", other, g.ID, g.TCPListen)
			}
			seenAddr[g.TCPListen] = g.ID
		}
	}
	return nil
}
