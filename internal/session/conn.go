package session

import (
	"fmt"
	"io"
	"log"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/gkirk/dcol"

	appcfg "github.com/gkirk/trimble-receiver-console/internal/config"
	"github.com/gkirk/trimble-receiver-console/internal/trimble"
	trimblecfg "github.com/gkirk/trimble-receiver-console/internal/trimble/configencode"
)

// ConnSession serves one TCP connection (one receiver) within a group.
type ConnSession struct {
	group      *GroupRuntime
	conn       net.Conn
	storeKey   string
	store      *Store
	cfg        *appcfg.Config
	parser     *dcol.Parser
	mode       Mode
	writeMu    sync.Mutex
	lastSerial string

	// Diagnostics
	mu             sync.Mutex
	gsofSeenLogged bool // log once that GSOF is present on this connection
	lastNoGSOFWarn time.Time
	openedAt           time.Time
	rxBytes            uint64 // ingress bytes (not exposed to clients; for diagnostics only)
}

func NewConnSession(c net.Conn, gr *GroupRuntime, cfg *appcfg.Config) *ConnSession {
	key := "anon:" + c.RemoteAddr().String()
	mode := Mode(cfg.DefaultMode)
	if mode != ModeReadOnly && mode != ModeReadWrite {
		mode = ModeReadWrite
	}
	now := time.Now()
	snap := &ReceiverSnapshot{
		GroupID:    gr.ID,
		FirstSeen:  now,
		Serial:     "",
		RemoteAddr: c.RemoteAddr().String(),
		Mode:       mode,
		Online:     true,
		LastUpdate: now,
		SVs:        nil,
	}
	gr.Store.Set(key, snap)
	return &ConnSession{
		group:    gr,
		conn:     c,
		storeKey: key,
		store:    gr.Store,
		cfg:      cfg,
		parser:   trimble.NewDCOLParser(),
		mode:     mode,
		openedAt: now,
	}
}

func (s *ConnSession) Run() {
	remote := s.conn.RemoteAddr().String()
	defer func() {
		log.Printf("TCP disconnect group_id=%q remote=%s store_key=%s", s.group.ID, remote, s.storeKey)
		s.conn.Close()
	}()
	buf := make([]byte, 32*1024)
	for {
		n, err := s.conn.Read(buf)
		if n > 0 {
			s.rxBytes += uint64(n)
			trimble.ProcessStreamChunk(s.parser, buf[:n], s.conn.RemoteAddr().String(), s.cfg.IgnoreTCPGSOFTransmissionGap1, func(m dcol.Message) {
				s.handleMessage(m)
			})
			s.maybeWarnNoGSOF()
		}
		if err != nil {
			if err != io.EOF && !isCloseError(err) {
				log.Printf("TCP read error group_id=%q remote=%s: %v", s.group.ID, remote, err)
			}
			break
		}
	}
	s.markOffline()
}

func (s *ConnSession) maybeWarnNoGSOF() {
	snap, ok := s.store.Get(s.storeKey)
	if !ok || snap == nil {
		return
	}
	if snap.GSOFReportCount > 0 || s.rxBytes == 0 {
		return
	}
	if time.Since(s.openedAt) < 3*time.Second {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if time.Since(s.lastNoGSOFWarn) < 15*time.Second {
		return
	}
	s.lastNoGSOFWarn = time.Now()
	log.Printf("TCP data but no GSOF yet group_id=%q remote=%s bytes=%d — expect DCOL type 64 GSOF frames (STX…ETX). Is the receiver outputting GSOF on this port?",
		s.group.ID, snap.RemoteAddr, s.rxBytes)
}

func isCloseError(err error) bool {
	if err == nil {
		return false
	}
	if ne, ok := err.(net.Error); ok && ne.Timeout() {
		return true
	}
	return strings.Contains(err.Error(), "use of closed network connection")
}

func (s *ConnSession) handleMessage(m dcol.Message) {
	if len(m.GSOFBuffer) == 0 {
		return
	}
	s.mu.Lock()
	if !s.gsofSeenLogged {
		log.Printf("Receiving GSOF reports group_id=%q store_key=%s", s.group.ID, s.storeKey)
		s.gsofSeenLogged = true
	}
	s.mu.Unlock()

	snap, _ := s.store.Get(s.storeKey)
	if snap == nil {
		t := time.Now()
		snap = &ReceiverSnapshot{
			GroupID:    s.group.ID,
			FirstSeen:  t,
			RemoteAddr: s.conn.RemoteAddr().String(),
			Mode:       s.mode,
			Online:     true,
			LastUpdate: t,
		}
	}
	snap.GroupID = s.group.ID
	if snap.FirstSeen.IsZero() {
		snap.FirstSeen = time.Now()
	}
	snap.Online = true
	snap.LastUpdate = time.Now()
	snap.LastGSOFAt = time.Now()
	snap.GSOFReportCount++
	snap.Mode = s.mode
	snap.RemoteAddr = s.conn.RemoteAddr().String()
	if len(m.StreamWarnings) > 0 {
		snap.StreamWarnings = append([]string(nil), m.StreamWarnings...)
	}
	prevSerial := snap.Serial
	ApplyGSOFBuffer(snap, m.GSOFBuffer)

	if snap.Serial != "" && snap.Serial != prevSerial && strings.HasPrefix(s.storeKey, "anon:") {
		s.store.Delete(s.storeKey)
		s.storeKey = snap.Serial
	}
	s.lastSerial = snap.Serial
	s.store.Set(s.storeKey, snap)
}

func (s *ConnSession) markOffline() {
	snap, ok := s.store.Get(s.storeKey)
	if !ok {
		return
	}
	snap.Online = false
	snap.LastUpdate = time.Now()
	s.store.Set(s.storeKey, snap)
}

// StoreKey returns the current map key (serial or anon:addr).
func (s *ConnSession) StoreKey() string { return s.storeKey }

// GroupID returns the configured group id.
func (s *ConnSession) GroupID() string { return s.group.ID }

// Store returns the snapshot store (for read from API).
func (s *ConnSession) Store() *Store { return s.store }

// ApplyConfig validates and optionally writes DCOL frames to the receiver.
func (s *ConnSession) ApplyConfig(body *trimblecfg.ReceiverConfigJSON) error {
	if body == nil {
		return fmt.Errorf("empty body")
	}
	if s.mode == ModeReadOnly {
		return fmt.Errorf("session is read_only")
	}
	frames, j, err := trimblecfg.BuildConfigFrames(body)
	if err != nil {
		return err
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	for _, fr := range frames {
		if _, err := s.conn.Write(fr); err != nil {
			return err
		}
	}
	snap, _ := s.store.Get(s.storeKey)
	if snap != nil {
		snap.LastConfigJSON = j
		if len(frames) > 0 {
			snap.ConfigStatus = "applied"
		} else {
			snap.ConfigStatus = "validated"
		}
		s.store.Set(s.storeKey, snap)
	}
	return nil
}
