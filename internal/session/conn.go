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
	"github.com/gkirk/trimble-receiver-console/internal/dcolserial"
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

	// serialConnCounted ensures we increment GroupRuntime serial TCP counter once per session.
	serialConnCounted bool

	// Diagnostics
	mu             sync.Mutex
	gsofSeenLogged bool // log once that GSOF is present on this connection
	lastNoGSOFWarn time.Time
	openedAt       time.Time
	rxBytes        uint64 // ingress bytes (not exposed to clients; for diagnostics only)

	// outbound is true for client-mode dials (gsof_connect). Passive read only — no GET SERIAL on connect.
	outbound    bool
	dialTarget  string // configured host:port for outbound (empty for inbound)
	displayAddr string // UI label (remote addr or "→ host:port")
}

func NewConnSession(c net.Conn, gr *GroupRuntime, cfg *appcfg.Config) *ConnSession {
	return newConnSession(c, gr, cfg, "", false)
}

// NewOutboundConnSession serves an outbound GSOF dial (gsof_connect). It does not send GET SERIAL on
// connect so passive broadcast streams are not disturbed; store key is stable per dial target.
func NewOutboundConnSession(c net.Conn, gr *GroupRuntime, cfg *appcfg.Config, dialTarget string) *ConnSession {
	return newConnSession(c, gr, cfg, dialTarget, true)
}

func newConnSession(c net.Conn, gr *GroupRuntime, cfg *appcfg.Config, dialTarget string, outbound bool) *ConnSession {
	remote := c.RemoteAddr().String()
	key := "anon:" + remote
	displayAddr := remote
	if outbound {
		key = "out:" + dialTarget
		displayAddr = "→ " + dialTarget
	}
	configured := Mode(cfg.DefaultMode)
	if configured != ModeReadOnly && configured != ModeReadWrite {
		configured = ModeReadWrite
	}
	now := time.Now()
	snap := &ReceiverSnapshot{
		GroupID:       gr.ID,
		FirstSeen:     now,
		Serial:        "",
		RemoteAddr:    displayAddr,
		ConnectionKey: key,
		Mode:       EffectiveSnapshotMode(configured, false),
		Online:     true,
		LastUpdate: now,
		SVs:        nil,
	}
	gr.Store.Set(key, snap)
	return &ConnSession{
		group:       gr,
		conn:        c,
		storeKey:    key,
		store:       gr.Store,
		cfg:         cfg,
		parser:      trimble.NewDCOLParser(),
		mode:        configured,
		openedAt:    now,
		outbound:    outbound,
		dialTarget:  dialTarget,
		displayAddr: displayAddr,
	}
}

// CloseConn closes the TCP connection (e.g. retention purge for unidentified sessions).
func (s *ConnSession) CloseConn() error {
	return s.conn.Close()
}

func (s *ConnSession) Run() {
	remote := s.conn.RemoteAddr().String()
	defer func() {
		log.Printf("TCP disconnect group_id=%q remote=%s store_key=%s", s.group.ID, remote, s.storeKey)
		s.conn.Close()
	}()
	buf := make([]byte, 32*1024)
	if !s.outbound {
		s.sendStartupDCOLQueries()
	} else {
		log.Printf("GSOF outbound passive read group_id=%q target=%s remote=%s", s.group.ID, s.dialTarget, remote)
	}
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
	snap, _ := s.store.Get(s.storeKey)
	if snap == nil {
		t := time.Now()
		snap = &ReceiverSnapshot{
			GroupID:    s.group.ID,
			FirstSeen:  t,
			RemoteAddr: s.displayAddr,
			Mode:       EffectiveSnapshotMode(s.mode, false),
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
	snap.ConnectionKey = s.storeKey
	if s.outbound {
		snap.RemoteAddr = s.displayAddr
	} else {
		snap.RemoteAddr = s.conn.RemoteAddr().String()
	}
	if len(m.StreamWarnings) > 0 {
		snap.StreamWarnings = append([]string(nil), m.StreamWarnings...)
	}

	if m.PacketType == 0x07 && len(m.Payload) >= 8 {
		if info, ok := dcolserial.ParseRetSerialPayload(m.Payload); ok {
			now := time.Now()
			snap.DCOLRetSerial = &DCOLRetSerialSnapshot{
				RetSerialInfo: info,
				ReceivedAt:    now,
			}
			// Primary firmware string from RET SERIAL (07h): navigation processor version field.
			snap.FirmwareVersion = strings.TrimSpace(info.NavProcessorVersion)
		}
	}

	snap.Mode = EffectiveSnapshotMode(s.mode, snap.DCOLRetSerial != nil)

	if len(m.GSOFBuffer) == 0 {
		s.maybeBumpSerialConnection(snap)
		s.store.Set(s.storeKey, snap)
		return
	}

	s.mu.Lock()
	if !s.gsofSeenLogged {
		log.Printf("Receiving GSOF reports group_id=%q store_key=%s", s.group.ID, s.storeKey)
		s.gsofSeenLogged = true
	}
	s.mu.Unlock()

	snap.LastGSOFAt = time.Now()
	snap.GSOFReportCount++
	prevSerial := snap.Serial
	var gsofLog *ApplyGSOFOpts
	if s.cfg.VerboseGSOF || s.group.GSOFSummary != nil {
		id := snap.Serial
		if id == "" {
			id = s.storeKey
		}
		if s.cfg.VerboseGSOF {
			log.Printf("gsof verbose group=%q identity=%q dcol_packet_type=0x%02X seq=%d gsof_buffer_len=%d dcol_payload_len=%d",
				s.group.ID, id, m.PacketType, m.SequenceNumber, len(m.GSOFBuffer), len(m.Payload))
		}
		gsofLog = &ApplyGSOFOpts{GroupID: s.group.ID, Identity: id, Summary: s.group.GSOFSummary}
		if s.cfg.VerboseGSOF {
			gsofLog.Verbose = true
		}
	}
	ApplyGSOFBuffer(snap, m.GSOFBuffer, gsofLog)

	if snap.Serial != "" && snap.Serial != prevSerial && (strings.HasPrefix(s.storeKey, "anon:") || strings.HasPrefix(s.storeKey, "out:")) {
		s.store.Delete(s.storeKey)
		s.storeKey = snap.Serial
		snap.ConnectionKey = s.storeKey
	}
	s.lastSerial = snap.Serial
	s.maybeBumpSerialConnection(snap)
	s.store.Set(s.storeKey, snap)
}

func (s *ConnSession) maybeBumpSerialConnection(snap *ReceiverSnapshot) {
	if s.serialConnCounted || snap == nil {
		return
	}
	k := ReceiverIdentityKey(snap)
	if !strings.HasPrefix(k, "sn:") {
		return
	}
	s.serialConnCounted = true
	s.group.IncrementSerialConnection(k)
}

// sendStartupDCOLQueries sends connection-time DCOL commands (GET SERIAL 06h).
// Periodic / cyclic DCOL polling can be added separately from this one-shot path.
func (s *ConnSession) sendStartupDCOLQueries() {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	if fr, err := trimblecfg.Pack(0x06, nil); err != nil {
		log.Printf("DCOL GETSERIAL pack error group_id=%q: %v", s.group.ID, err)
	} else if _, werr := s.conn.Write(fr); werr != nil {
		log.Printf("DCOL GETSERIAL write group_id=%q remote=%s: %v", s.group.ID, s.conn.RemoteAddr(), werr)
	}
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
	snap, _ := s.store.Get(s.storeKey)
	if snap == nil || snap.DCOLRetSerial == nil {
		return fmt.Errorf("connection is read-only: no DCOL RET SERIAL (07h) response to GET SERIAL (06h)")
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
	snap, _ = s.store.Get(s.storeKey)
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
