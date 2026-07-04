package session

import (
	"net"
	"testing"

	appcfg "github.com/gkirk/trimble-receiver-console/internal/config"
)

func TestNewOutboundConnSession_storeKey(t *testing.T) {
	c1, c2 := net.Pipe()
	defer c1.Close()
	defer c2.Close()

	gr := &GroupRuntime{ID: "g1", Name: "G", Store: NewStore(), Registry: &Registry{}}
	cfg := appcfg.Default()

	cs := NewOutboundConnSession(c1, gr, cfg, "192.168.1.10:2101")
	if cs.StoreKey() != "out:192.168.1.10:2101" {
		t.Fatalf("store key=%q", cs.StoreKey())
	}
	if !cs.outbound {
		t.Fatal("want outbound=true")
	}
	snap, ok := gr.Store.Get(cs.StoreKey())
	if !ok || snap == nil {
		t.Fatal("snapshot missing")
	}
	if snap.RemoteAddr != "→ 192.168.1.10:2101" {
		t.Fatalf("remote_addr=%q", snap.RemoteAddr)
	}
}
