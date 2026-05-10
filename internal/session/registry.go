package session

import (
	"sync"
)

// Registry tracks active TCP sessions for API lookup by serial or anon key.
type Registry struct {
	mu   sync.RWMutex
	all  []*ConnSession
}

func (r *Registry) Add(s *ConnSession) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.all = append(r.all, s)
}

func (r *Registry) Remove(s *ConnSession) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i, x := range r.all {
		if x == s {
			r.all = append(r.all[:i], r.all[i+1:]...)
			return
		}
	}
}

// Find resolves :id from URL (serial number or anon:host:port).
func (r *Registry) Find(id string) *ConnSession {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, s := range r.all {
		if s.StoreKey() == id {
			return s
		}
		snap, _ := s.store.Get(s.StoreKey())
		if snap != nil && snap.Serial == id {
			return s
		}
	}
	return nil
}
