package session

import (
	"strings"
	"sync"
	"time"

	"github.com/gkirk/trimble-receiver-console/internal/dcolserial"
	"github.com/gkirk/trimble-receiver-console/internal/gsof"
)

// Mode matches config.Mode for per-session capability.
type Mode string

const (
	ModeReadOnly  Mode = "read_only"
	ModeReadWrite Mode = "read_write"
)

// EffectiveSnapshotMode is the mode exposed to API clients: read_write only when the session
// is configured for writes and a DCOL RET SERIAL (07h) reply has been received (bidirectional DCOL).
func EffectiveSnapshotMode(configured Mode, hasDCOLSerialReply bool) Mode {
	if configured == ModeReadOnly {
		return ModeReadOnly
	}
	if !hasDCOLSerialReply {
		return ModeReadOnly
	}
	return ModeReadWrite
}

// SVInfo is one satellite for sky plot and counts.
type SVInfo struct {
	PRN       int      `json:"prn"`
	System    int      `json:"system"` // 0 GPS, 1 SBAS, 2 GLO, 3 Gal, 4 QZSS, 5 BDS
	Elevation float64  `json:"elevation_deg"`
	Azimuth   float64  `json:"azimuth_deg"`
	CN0       float64  `json:"cn0_db_hz"` // L1 (first carrier); backward-compatible primary SNR
	CN0L2     *float64 `json:"cn0_l2_db_hz,omitempty"`
	CN0L56    *float64 `json:"cn0_l56_db_hz,omitempty"` // third SNR byte — displayed in L5 column
	TrackL1   string   `json:"track_l1,omitempty"`
	TrackL2   string   `json:"track_l2,omitempty"`
	TrackL5   string   `json:"track_l5,omitempty"` // includes Galileo E6 with E5a/E5b/Alt
	UsedInPos bool     `json:"used_in_position"`
	UsedInRTK bool     `json:"used_in_rtk"`
}

// DCOLRetSerialSnapshot merges parsed RETSERIAL fields with ingest metadata for the API.
type DCOLRetSerialSnapshot struct {
	dcolserial.RetSerialInfo
	ReceivedAt time.Time `json:"received_at"`
}

// VectorCardSnapshot groups GSOF record 7 (tangent-plane ENU) and record 28 (receiver diagnostics) for the UI.
type VectorCardSnapshot struct {
	TangentPlane *gsof.TangentPlaneENU       `json:"tangent_plane,omitempty"`
	Diagnostics  *gsof.ReceiverDiagnostics28 `json:"diagnostics,omitempty"`
}

// ReceiverSnapshot is JSON-serialized to API/WebSocket clients.
type ReceiverSnapshot struct {
	GroupID         string    `json:"group_id"`
	FirstSeen       time.Time `json:"first_seen"`
	Serial          string    `json:"serial"`
	FirmwareVersion string    `json:"firmware_version"`
	RemoteAddr      string    `json:"remote_addr"`
	Mode            Mode      `json:"mode"`
	Online          bool      `json:"online"`
	LastUpdate      time.Time `json:"last_update"`
	// Completed GSOF reports (DCOL 0x40 reassembled → GSOFBuffer non-empty)
	LastGSOFAt        time.Time `json:"last_gsof_at"`
	GSOFReportCount   uint64    `json:"gsof_report_count"`
	LatRad            float64   `json:"lat_rad"`
	LonRad            float64   `json:"lon_rad"`
	HeightM           float64   `json:"height_m"`
	HasLLH            bool      `json:"has_llh"`
	PositionType      int       `json:"position_type"`
	PositionTypeLabel string    `json:"position_type_label"`
	HasPositionType   bool      `json:"has_position_type"`
	// Solution epoch from GSOF time records (0x10 UTC preferred over 0x01 GPS week/ms).
	SolutionTime    time.Time `json:"solution_time,omitempty"`
	TimeSource      string    `json:"time_source,omitempty"` // UTC | GPS
	SolutionGPSWeek int       `json:"solution_gps_week,omitempty"`
	SolutionGPSMs   int32     `json:"solution_gps_ms,omitempty"`
	// Power / internal logging (GSOF 0x25)
	BatteryPercent     float64 `json:"battery_percent,omitempty"`
	LoggingHoursRemain float64 `json:"logging_hours_remain,omitempty"`
	HasPowerLogging    bool    `json:"has_power_logging,omitempty"`
	// GSOF record 40 — LBAND STATUS INFO
	LBandStatus *gsof.LBandStatusInfo `json:"l_band_status,omitempty"`
	// GSOF 35 / 41 — received base + moving-base position & quality
	ReceivedBase        *gsof.ReceivedBaseInfo        `json:"received_base,omitempty"`
	BasePositionQuality *gsof.BasePositionQualityInfo `json:"base_position_quality,omitempty"`
	// GSOF 57 — radio information
	RadioInfo *gsof.RadioInfo `json:"radio_info,omitempty"`
	// DCOL report 07h RETSERIAL (reply to command 06h GETSERIAL) — normal DCOL, not GSOF.
	DCOLRetSerial *DCOLRetSerialSnapshot `json:"dcol_ret_serial,omitempty"`
	// xFill hints from position type extended (GSOF 0x26 NETWORK_FLAGS2 when present)
	XFillPresent bool `json:"xfill_present,omitempty"`
	XFillReady   bool `json:"xfill_ready,omitempty"`
	// Receiver hardware / product string when known (future GSOF or serial query)
	ReceiverType string `json:"receiver_type,omitempty"`
	// Error estimates (Type 12 sigma)
	PositionRMS float64 `json:"position_rms_m"`
	SigmaEast   float64 `json:"sigma_east_m"`
	SigmaNorth  float64 `json:"sigma_north_m"`
	SigmaUp     float64 `json:"sigma_up_m"`
	SemiMajor   float64 `json:"-"`
	SemiMinor   float64 `json:"-"`
	HasSigma    bool    `json:"has_sigma"`
	PDOP        float64 `json:"pdop"`
	HDOP        float64 `json:"hdop"`
	VDOP        float64 `json:"vdop"`
	TDOP        float64 `json:"tdop"`
	HasDOP      bool    `json:"has_dop"`
	// Velocity Type 8
	HorizontalVelMS float64 `json:"horizontal_vel_ms"`
	VerticalVelMS   float64 `json:"vertical_vel_ms"`
	HeadingRad      float64 `json:"heading_rad"`
	HasVelocity     bool    `json:"has_velocity"`
	// RTK baseline ECEF delta Type 6
	DeltaXM           float64             `json:"delta_x_m"`
	DeltaYM           float64             `json:"delta_y_m"`
	DeltaZM           float64             `json:"delta_z_m"`
	HasBaseline       bool                `json:"has_baseline"`
	Vector            *VectorCardSnapshot `json:"vector,omitempty"`
	SVs               []SVInfo            `json:"satellites"`
	SVUsedBySystem    map[string]int      `json:"sv_used_by_system"`
	SVTrackedBySystem map[string]int      `json:"sv_tracked_by_system"`
	StreamWarnings    []string            `json:"stream_warnings,omitempty"`
	// Last config applied (intent), for UI
	LastConfigJSON string `json:"last_config_json,omitempty"`
	ConfigStatus   string `json:"config_status,omitempty"`
	// SerialConnectionCount is lifetime TCP sessions that identified this receiver (per identity key); set when encoding API responses.
	SerialConnectionCount int64 `json:"serial_connection_count,omitempty"`
}

// HasReceiverDetails reports whether the snapshot has identifying or telemetry data beyond a bare TCP attach.
func HasReceiverDetails(s *ReceiverSnapshot) bool {
	if s == nil {
		return false
	}
	if strings.TrimSpace(s.Serial) != "" {
		return true
	}
	if s.DCOLRetSerial != nil {
		return true
	}
	if s.GSOFReportCount > 0 {
		return true
	}
	return false
}

// ReceiverIdentityKey matches list deduplication: DCOL long serial, else GSOF serial, else anon:remote_addr.
func ReceiverIdentityKey(v *ReceiverSnapshot) string {
	if v.DCOLRetSerial != nil {
		if ls := strings.TrimSpace(v.DCOLRetSerial.LongSerial); ls != "" {
			return "sn:" + strings.ToLower(ls)
		}
		if sh := strings.TrimSpace(v.DCOLRetSerial.ReceiverSerialShort); sh != "" {
			return "sn:" + strings.ToLower(sh)
		}
	}
	if s := strings.TrimSpace(v.Serial); s != "" {
		return "sn:" + strings.ToLower(s)
	}
	return "anon:" + v.RemoteAddr
}

// preferReceiverSnapshot returns true if a should replace b in the dedupe map (newer connection wins).
func preferReceiverSnapshot(a, b *ReceiverSnapshot) bool {
	if b == nil {
		return true
	}
	if a == nil {
		return false
	}
	if a.FirstSeen.After(b.FirstSeen) {
		return true
	}
	if b.FirstSeen.After(a.FirstSeen) {
		return false
	}
	if a.Online != b.Online {
		return a.Online
	}
	return a.LastUpdate.After(b.LastUpdate)
}

// Store holds snapshots keyed by serial (or temporary connection id).
type Store struct {
	mu   sync.RWMutex
	data map[string]*ReceiverSnapshot
}

func NewStore() *Store {
	return &Store{data: make(map[string]*ReceiverSnapshot)}
}

func (s *Store) Set(serial string, snap *ReceiverSnapshot) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if snap == nil {
		return
	}
	s.data[serial] = snap
}

func (s *Store) Get(serial string) (*ReceiverSnapshot, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.data[serial]
	return v, ok
}

func (s *Store) List() []*ReceiverSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*ReceiverSnapshot, 0, len(s.data))
	for _, v := range s.data {
		out = append(out, v)
	}
	return out
}

// ListUniqueBySerial returns one snapshot per receiver identity: long serial (DCOL) or GSOF serial,
// falling back to anon:remote_addr. When duplicates exist, the most recently connected row wins (FirstSeen).
func (s *Store) ListUniqueBySerial() []*ReceiverSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	best := make(map[string]*ReceiverSnapshot)
	for _, v := range s.data {
		if v == nil {
			continue
		}
		k := ReceiverIdentityKey(v)
		if prev := best[k]; preferReceiverSnapshot(v, prev) {
			best[k] = v
		}
	}
	out := make([]*ReceiverSnapshot, 0, len(best))
	for _, v := range best {
		out = append(out, v)
	}
	return out
}

// PurgeUndetailed removes bare connections that never gained serial, DCOL RET SERIAL, or GSOF within
// minAge of FirstSeen. Online sessions are closed first; store rows are removed once offline (or immediately if already offline).
func (s *Store) PurgeUndetailed(reg *Registry, now time.Time, minAge time.Duration) (closed, deleted int) {
	s.mu.Lock()
	keys := make([]string, 0, len(s.data))
	for k, v := range s.data {
		if v == nil || HasReceiverDetails(v) {
			continue
		}
		if now.Sub(v.FirstSeen) < minAge {
			continue
		}
		keys = append(keys, k)
	}
	s.mu.Unlock()

	for _, k := range keys {
		v, ok := s.Get(k)
		if !ok || v == nil || HasReceiverDetails(v) {
			continue
		}
		if now.Sub(v.FirstSeen) < minAge {
			continue
		}
		cs := reg.Find(k)
		if cs != nil && v.Online {
			_ = cs.CloseConn()
			closed++
			continue
		}
		s.Delete(k)
		deleted++
	}
	return closed, deleted
}

func (s *Store) Delete(serial string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.data, serial)
}

// PurgeOfflineBefore deletes entries that are offline and have not been updated since cutoff.
func (s *Store) PurgeOfflineBefore(cutoff time.Time) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	n := 0
	for k, v := range s.data {
		if v == nil || v.Online {
			continue
		}
		if v.LastUpdate.Before(cutoff) {
			delete(s.data, k)
			n++
		}
	}
	return n
}

// PositionFixLabels maps GSOF position type byte (record 38 / type 0x26) to the official
// “Position Fix Type” plate name. Codes 0–51 per Trimble GSOF documentation.
var PositionFixLabels = map[int]string{
	0:  "No Fix or Old Position Fix",
	1:  "Full Measurement Autonomous",
	2:  "Propagated Autonomous",
	3:  "Full Differential SBAS",
	4:  "Propagated SBAS",
	5:  "Full Differential",
	6:  "Propagated Differential",
	7:  "Full Float RTK",
	8:  "Propagated Float RTK",
	9:  "Full Fixed-ambiguity RTK",
	10: "Propagated Fixed-ambiguity RTK",
	11: "Omnistar HP Differential",
	12: "Omnistar XP Differential",
	13: "Location-RTK (Dithered RTK)",
	14: "Omnistar VBS Differential",
	15: "Beacon Differential",
	16: "OmniSTAR HP/XP",
	17: "OmniSTAR HP/G2",
	18: "OmniSTAR G2",
	19: "Synchronous RTX",
	20: "LowLatency RTX",
	21: "OmniSTAR Multiple Source",
	22: "OmniSTAR L1-only",
	23: "INS Autonomous",
	24: "INS SBAS",
	25: "INS code-phase DGNSS or Omnistar-VBS",
	26: "INS RTX code-phase corrections",
	27: "INS RTX carrier-phase corrections",
	28: "INS Omnistar HP/XP/G2",
	29: "INS RTK (fixed or float)",
	30: "INS Dead-Reckoning",
	31: "RTX code-phase corrections",
	32: "RTX Fast in Sync mode",
	33: "RTX Fast in Low Latency mode",
	34: "RESERVED",
	35: "RESERVED",
	36: "xFill-RTX",
	37: "LowLatency RTX-RangePoint",
	38: "Synchronous RTX-RangePoint",
	39: "LowLatency RTX-ViewPoint",
	40: "Synchronous RTX-ViewPoint",
	41: "LowLatency RTX-FieldPoint",
	42: "Synchronous RTX-FieldPoint",
	43: "OmniSTAR G2+ solution type",
	44: "OmniSTAR G4+ solution type",
	45: "RESERVED",
	46: "RESERVED",
	47: "RESERVED",
	48: "L1S SLAS",
	49: "INS xFill-RTX",
	50: "CLAS",
	51: "INS CLAS",
}

func PositionTypeLabel(code int) string {
	if s, ok := PositionFixLabels[code]; ok {
		return s
	}
	return "Unknown"
}
