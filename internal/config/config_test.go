package config

import "testing"

func TestValidateGroups_outboundOnly(t *testing.T) {
	c := &Config{
		Groups: []GroupConfig{
			{ID: "a", Name: "A", GSOFConnect: []string{"192.168.1.10:2101", "10.0.0.5:5018"}},
		},
	}
	if err := c.ValidateGroups(); err != nil {
		t.Fatal(err)
	}
	if c.Groups[0].TCPListen != "" {
		t.Fatalf("tcp_listen=%q want empty", c.Groups[0].TCPListen)
	}
	if len(c.Groups[0].GSOFConnect) != 2 {
		t.Fatalf("gsof_connect=%v", c.Groups[0].GSOFConnect)
	}
}

func TestValidateGroups_listenAndOutbound(t *testing.T) {
	c := &Config{
		Groups: []GroupConfig{
			{
				ID:          "mix",
				TCPListen:   "0.0.0.0:9001",
				GSOFConnect: []string{"127.0.0.1:2101"},
			},
		},
	}
	if err := c.ValidateGroups(); err != nil {
		t.Fatal(err)
	}
}

func TestValidateGroups_neitherIngress(t *testing.T) {
	c := &Config{
		Groups: []GroupConfig{{ID: "x", Name: "X"}},
	}
	if err := c.ValidateGroups(); err == nil {
		t.Fatal("expected error")
	}
}

func TestNormalizeGroups_defaultOutbound(t *testing.T) {
	c := &Config{
		GSOFConnect: []string{"192.168.0.2:2101"},
	}
	c.NormalizeGroups()
	if err := c.ValidateGroups(); err != nil {
		t.Fatal(err)
	}
	if len(c.Groups) != 1 || len(c.Groups[0].GSOFConnect) != 1 {
		t.Fatalf("%+v", c.Groups)
	}
}

func TestApplyCLIGSOFConnect_noInbound(t *testing.T) {
	c := Default()
	c.NormalizeGroups()
	if err := c.ApplyCLIGSOFConnect("", []string{"192.168.1.1:2101"}, true); err != nil {
		t.Fatal(err)
	}
	if err := c.ValidateGroups(); err != nil {
		t.Fatal(err)
	}
	if c.Groups[0].TCPListen != "" {
		t.Fatalf("tcp_listen=%q", c.Groups[0].TCPListen)
	}
	if len(c.Groups[0].GSOFConnect) != 1 {
		t.Fatalf("%v", c.Groups[0].GSOFConnect)
	}
}

func TestNormalizeTCPDialAddr(t *testing.T) {
	got, err := NormalizeTCPDialAddr(" 192.168.1.1:2101 ")
	if err != nil {
		t.Fatal(err)
	}
	if got != "192.168.1.1:2101" {
		t.Fatalf("got %q", got)
	}
}
