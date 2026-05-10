package session

import (
	"strings"
)

// IncrementSerialConnection records one TCP session that reached an identified receiver (sn:… key).
func (g *GroupRuntime) IncrementSerialConnection(identityKey string) {
	if g == nil || !strings.HasPrefix(identityKey, "sn:") {
		return
	}
	g.serialConnMu.Lock()
	defer g.serialConnMu.Unlock()
	if g.serialConnCount == nil {
		g.serialConnCount = make(map[string]int64)
	}
	g.serialConnCount[identityKey]++
}

// SerialConnectionCount returns how many TCP sessions have identified this receiver key (process lifetime).
func (g *GroupRuntime) SerialConnectionCount(identityKey string) int64 {
	if g == nil {
		return 0
	}
	g.serialConnMu.Lock()
	defer g.serialConnMu.Unlock()
	return g.serialConnCount[identityKey]
}

// AttachSerialConnCounts returns shallow snapshot copies with serial_connection_count set for sn: identities.
func (g *GroupRuntime) AttachSerialConnCounts(list []*ReceiverSnapshot) []*ReceiverSnapshot {
	if g == nil {
		return list
	}
	out := make([]*ReceiverSnapshot, len(list))
	for i, p := range list {
		if p == nil {
			out[i] = nil
			continue
		}
		cp := *p
		k := ReceiverIdentityKey(&cp)
		if strings.HasPrefix(k, "sn:") {
			cp.SerialConnectionCount = g.SerialConnectionCount(k)
		}
		out[i] = &cp
	}
	return out
}
