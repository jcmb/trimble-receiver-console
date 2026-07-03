package session

import (
	"context"
	"log"
	"sync"
	"time"

	appcfg "github.com/gkirk/trimble-receiver-console/internal/config"
)

// ReceiverOfflineRetention is how long we keep offline receiver rows after last activity/disconnect.
const ReceiverOfflineRetention = 7 * 24 * time.Hour

// UndetailedReceiverRetention drops TCP attaches that never reported serial, DCOL RET SERIAL, or GSOF.
const UndetailedReceiverRetention = 5 * time.Minute

// GroupRuntime is runtime state for one configured group.
type GroupRuntime struct {
	ID          string
	Name        string
	TCPListen   string
	GSOFConnect []string
	People      []string
	Store       *Store
	Registry    *Registry
	GSOFSummary *GSOFSummary

	serialConnMu    sync.Mutex
	serialConnCount map[string]int64 // keyed by ReceiverIdentityKey ("sn:…")
}

// Hub owns per-group stores and registries.
type Hub struct {
	mu          sync.RWMutex
	groups      map[string]*GroupRuntime
	order       []string
	gsofSummary *GSOFSummary
}

// NewHub builds runtime groups from config (after NormalizeGroups).
func NewHub(cfg *appcfg.Config) *Hub {
	h := &Hub{groups: make(map[string]*GroupRuntime)}
	if cfg.SummaryGSOF {
		h.gsofSummary = NewGSOFSummary()
	}
	for _, g := range cfg.Groups {
		people := append([]string(nil), g.People...)
		gr := &GroupRuntime{
			ID:          g.ID,
			Name:        g.Name,
			TCPListen:   g.TCPListen,
			GSOFConnect: append([]string(nil), g.GSOFConnect...),
			People:      people,
			Store:       NewStore(),
			Registry:    &Registry{},
			GSOFSummary: h.gsofSummary,
		}
		h.groups[g.ID] = gr
		h.order = append(h.order, g.ID)
	}
	return h
}

// Get returns a group by id or nil.
func (h *Hub) Get(id string) *GroupRuntime {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.groups[id]
}

// OrderedGroups returns groups in config order (for API / GC).
func (h *Hub) OrderedGroups() []*GroupRuntime {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]*GroupRuntime, 0, len(h.order))
	for _, id := range h.order {
		out = append(out, h.groups[id])
	}
	return out
}

// List is an alias for OrderedGroups.
func (h *Hub) List() []*GroupRuntime {
	return h.OrderedGroups()
}

// StartRetentionGC periodically removes stale offline receivers and bare unidentified connections.
func (h *Hub) StartRetentionGC(ctx context.Context) {
	go func() {
		t := time.NewTicker(1 * time.Hour)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				h.purgeStale()
			}
		}
	}()
	go func() {
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				h.purgeUndetailed()
			}
		}
	}()
}

// GSOFSummaryInterval is how often -summary-gsof logs subtype rollups.
const GSOFSummaryInterval = 15 * time.Second

// StartGSOFSummary periodically logs GSOF sub-record type summaries when enabled.
func (h *Hub) StartGSOFSummary(ctx context.Context) {
	if h.gsofSummary == nil {
		return
	}
	go func() {
		t := time.NewTicker(GSOFSummaryInterval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				h.gsofSummary.Flush()
			}
		}
	}()
}

func (h *Hub) purgeStale() {
	cutoff := time.Now().Add(-ReceiverOfflineRetention)
	list := h.OrderedGroups()

	for _, g := range list {
		n := g.Store.PurgeOfflineBefore(cutoff)
		if n > 0 {
			log.Printf("retention: removed %d stale offline receiver(s) from group %q", n, g.ID)
		}
	}
}

func (h *Hub) purgeUndetailed() {
	for _, g := range h.OrderedGroups() {
		closed, deleted := g.Store.PurgeUndetailed(g.Registry, time.Now(), UndetailedReceiverRetention)
		if closed > 0 || deleted > 0 {
			log.Printf("undetailed retention: group %q closed %d session(s), removed %d row(s)", g.ID, closed, deleted)
		}
	}
}
