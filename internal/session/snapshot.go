package session

import (
	"sync"
	"time"

	"github.com/gkirk/trimble-receiver-console/internal/gsof"
)

// Mode matches config.Mode for per-session capability.
type Mode string

const (
	ModeReadOnly  Mode = "read_only"
	ModeReadWrite Mode = "read_write"
)

// SVInfo is one satellite for sky plot and counts.
type SVInfo struct {
	PRN       int     `json:"prn"`
	System    int     `json:"system"` // 0 GPS, 1 SBAS, 2 GLO, 3 Gal, 4 QZSS, 5 BDS
	Elevation float64 `json:"elevation_deg"`
	Azimuth   float64 `json:"azimuth_deg"`
	CN0       float64 `json:"cn0_db_hz"` // first freq, dB-Hz (doc: stored as dB*4 for some records; we normalize when known)
	UsedInPos bool    `json:"used_in_position"`
	UsedInRTK bool    `json:"used_in_rtk"`
}

// ReceiverSnapshot is JSON-serialized to API/WebSocket clients.
type ReceiverSnapshot struct {
	GroupID           string    `json:"group_id"`
	FirstSeen         time.Time `json:"first_seen"`
	Serial            string    `json:"serial"`
	FirmwareVersion   string    `json:"firmware_version"`
	RemoteAddr        string    `json:"remote_addr"`
	Mode              Mode      `json:"mode"`
	Online            bool      `json:"online"`
	LastUpdate        time.Time `json:"last_update"`
	// Completed GSOF reports (DCOL 0x40 reassembled → GSOFBuffer non-empty)
	LastGSOFAt       time.Time `json:"last_gsof_at"`
	GSOFReportCount  uint64    `json:"gsof_report_count"`
	LatRad            float64   `json:"lat_rad"`
	LonRad            float64   `json:"lon_rad"`
	HeightM           float64   `json:"height_m"`
	HasLLH            bool      `json:"has_llh"`
	PositionType      int       `json:"position_type"`
	PositionTypeLabel string    `json:"position_type_label"`
	HasPositionType   bool      `json:"has_position_type"`
	// Solution epoch from GSOF time records (0x10 UTC preferred over 0x01 / 0x3E GPS week).
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
	// xFill hints from position type extended (GSOF 0x26 NETWORK_FLAGS2 when present)
	XFillPresent bool `json:"xfill_present,omitempty"`
	XFillReady   bool `json:"xfill_ready,omitempty"`
	// Receiver hardware / product string when known (future GSOF or serial query)
	ReceiverType string `json:"receiver_type,omitempty"`
	// Error estimates (Type 12 sigma)
	PositionRMS   float64 `json:"position_rms_m"`
	SigmaEast     float64 `json:"sigma_east_m"`
	SigmaNorth    float64 `json:"sigma_north_m"`
	SigmaUp       float64 `json:"sigma_up_m"`
	SemiMajor     float64 `json:"-"`
	SemiMinor     float64 `json:"-"`
	HasSigma      bool    `json:"has_sigma"`
	PDOP          float64 `json:"pdop"`
	HDOP          float64 `json:"hdop"`
	VDOP          float64 `json:"vdop"`
	TDOP          float64 `json:"tdop"`
	HasDOP        bool    `json:"has_dop"`
	// Velocity Type 8
	HorizontalVelMS float64 `json:"horizontal_vel_ms"`
	VerticalVelMS   float64 `json:"vertical_vel_ms"`
	HeadingRad      float64 `json:"heading_rad"`
	HasVelocity     bool    `json:"has_velocity"`
	// RTK baseline ECEF delta Type 6
	DeltaXM           float64 `json:"delta_x_m"`
	DeltaYM           float64 `json:"delta_y_m"`
	DeltaZM           float64 `json:"delta_z_m"`
	HasBaseline       bool    `json:"has_baseline"`
	SVs               []SVInfo `json:"satellites"`
	SVUsedBySystem    map[string]int `json:"sv_used_by_system"`
	SVTrackedBySystem map[string]int `json:"sv_tracked_by_system"`
	StreamWarnings    []string `json:"stream_warnings,omitempty"`
	// Last config applied (intent), for UI
	LastConfigJSON string `json:"last_config_json,omitempty"`
	ConfigStatus   string `json:"config_status,omitempty"`
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

// PositionFixLabels maps GSOF position type byte (Type 62 / Type 38) to a short label.
// Source: Trimble GSOF Position Type record, Position Fix Type table (subset).
var PositionFixLabels = map[int]string{
	0:  "No fix / old",
	1:  "Autonomous",
	2:  "Propagated autonomous",
	3:  "SBAS diff",
	5:  "Differential",
	7:  "RTK float",
	9:  "RTK fixed",
	23: "INS autonomous",
	29: "INS RTK",
}

func PositionTypeLabel(code int) string {
	if s, ok := PositionFixLabels[code]; ok {
		return s
	}
	return "Unknown"
}
