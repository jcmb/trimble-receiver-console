// GETSESSTN (43h) and RETSESSTN (44h) — see Trimble 4000SE/SSE/SSi RS-232 Interface, Table 2-37 / 2-38.
package dcolserial

import (
	"encoding/binary"
	"math"
	"strings"
)

// DCOL command / reply types (normal DCOL, not GSOF).
const (
	TypeGETSESSTN = 0x43 // GETSESSTN — request session/station information
	TypeRETSESSTN = 0x44 // RETSESSTN — return survey session/station parameters
	// TypeNAK is the DCOL negative-ack packet type (receiver rejects a command); payload often starts with the rejected command byte.
	TypeNAK = 0x15
)

// SessionStationReq is the first payload byte of GETSESSTN (session/station request type).
type SessionStationReq byte

const (
	ReqIndividualSession SessionStationReq = 0 // Individual Session
	ReqIndividualStation SessionStationReq = 1 // Individual Station
	ReqSessionSummary    SessionStationReq = 2 // Session Summary
	ReqStationSummary    SessionStationReq = 3 // Station Summary
)

// SesStatIndicator is the first data byte of RETSESSTN (matches request kinds).
type SesStatIndicator byte

const (
	IndIndividualSession SesStatIndicator = 0
	IndIndividualStation SesStatIndicator = 1
	IndSessionSummary    SesStatIndicator = 2
	IndStationSummary    SesStatIndicator = 3
)

// SurveySchedMode values (RETSESSTN individual session).
const (
	SurveySchedAuto      = 0   // Auto
	SurveySchedOnceDate  = 2   // Once only specific date and time
	SurveySchedDailyTime = 255 // Any day at the given time (START/STOP TIME valid)
)

// PosStorageRate (RETSESSTN individual session).
const (
	PosStorage5Min       = 0
	PosStorageEveryEpoch = 1
	PosStorageEpochNoRaw = 2
)

// TypeOfPositions (RETSESSTN individual session).
const (
	PosType3D2D = 0
	PosType3D   = 1
	PosType2D   = 2
)

// GETSesstnPayload returns the 2-byte DCOL payload for GETSESSTN (after LENGTH).
// Index is ignored for ReqSessionSummary / ReqStationSummary per ICD.
func GETSesstnPayload(req SessionStationReq, index byte) []byte {
	return []byte{byte(req), index}
}

// --- RETSESSTN parsed forms ---

// RetSesstn holds one decoded RETSESSTN payload (after LENGTH).
type RetSesstn struct {
	Indicator SesStatIndicator `json:"indicator"`

	IndividualSession *IndividualSessionInfo `json:"individual_session,omitempty"`
	IndividualStation *IndividualStationInfo `json:"individual_station,omitempty"`
	SessionSummary    *SummaryBlock          `json:"session_summary,omitempty"`
	StationSummary    *SummaryBlock          `json:"station_summary,omitempty"`
}

// IndividualSessionInfo maps INDIVIDUAL SESSION fields (indicator 0).
// Multi-byte integers and float64 are decoded as little-endian per typical Trimble serial ICD;
// confirm against your receiver if values disagree.
type IndividualSessionInfo struct {
	SessionIndex        int     `json:"session_index"`
	SessionID           string  `json:"session_id"`            // 4 ASCII chars
	StartTimeMinOfDay   uint16  `json:"start_time_min_of_day"` // valid if SurveySchedMode == 255
	StopTimeMinOfDay    uint16  `json:"stop_time_min_of_day"`
	StartDateGPS        uint32  `json:"start_date_gps_sec"` // sec since GPS epoch midnight Sat/Sun Jan 5/6 1980
	StopDateGPS         uint32  `json:"stop_date_gps_sec"`
	EpochIntervalTenthS uint16  `json:"epoch_interval_tenths"` // measurement rate, tenths of seconds
	StationIndex        int     `json:"station_index"`
	SurveySchedMode     byte    `json:"survey_sched_mode"`
	ElevationMaskDeg    int     `json:"elevation_mask_deg"`
	MinimumSVs          int     `json:"minimum_svs"`
	PosStorageRate      byte    `json:"pos_storage_rate"`
	TypeOfPositions     byte    `json:"type_of_positions"`
	OverDetPosOff       bool    `json:"over_det_pos_off"`
	SmoothL1CA          bool    `json:"smooth_l1_ca"`
	MSLHeights          bool    `json:"msl_heights"`
	UseUserHeight       bool    `json:"use_user_height"`
	ReferenceHeightM    float64 `json:"reference_height_m"`
	AntennaSerial       uint32  `json:"antenna_serial"`
}

// IndividualStationInfo maps INDIVIDUAL STATION fields (indicator 1).
type IndividualStationInfo struct {
	StationIndex    int     `json:"station_index"`    // 31 = reference position
	StationID       string  `json:"station_id"`       // 8 chars; ref pos: 4 spaces + 4 NUL
	StationName     string  `json:"station_name"`     // 50 chars, space-padded
	StationAccuracy byte    `json:"station_accuracy"` // 0 low, 1 high
	LatitudeDeg     float64 `json:"latitude_deg"`
	LongitudeDeg    float64 `json:"longitude_deg"`
	HeightM         float64 `json:"height_m"`
}

// SummaryEntry is one row in SESSION SUMMARY or STATION SUMMARY.
type SummaryEntry struct {
	Index int    `json:"index"`
	ID    string `json:"id"` // 4-char session id or 8-char station id (+ NUL pad per ICD)
}

// SummaryBlock holds repeated indices for summary types 2 / 3.
type SummaryBlock struct {
	Count int            `json:"count"`
	Items []SummaryEntry `json:"items"`
}

const (
	lenIndividualSession = 43 // indicator + session fields through antenna serial uint32 (Table 2-38)
	lenIndividualStation = 85 // indicator + station block per Table 2-38
	entrySessionSummary  = 5  // 1 index + 4 char session id
	entryStationSummary  = 9  // 1 index + 8 char station id
)

// ParseRetSesstnPayload decodes RETSESSTN payload bytes (same span as LENGTH covers).
func ParseRetSesstnPayload(payload []byte) (RetSesstn, bool) {
	if len(payload) < 1 {
		return RetSesstn{}, false
	}
	ind := SesStatIndicator(payload[0])
	out := RetSesstn{Indicator: ind}

	switch ind {
	case IndIndividualSession:
		if len(payload) < lenIndividualSession {
			return RetSesstn{}, false
		}
		p := payload[1:]
		s := IndividualSessionInfo{
			SessionIndex:        int(p[0]),
			SessionID:           trimSpaceASCII(p[1:5]),
			StartTimeMinOfDay:   leUint16(p[5:7]),
			StopTimeMinOfDay:    leUint16(p[7:9]),
			StartDateGPS:        leUint32(p[9:13]),
			StopDateGPS:         leUint32(p[13:17]),
			EpochIntervalTenthS: leUint16(p[17:19]),
			StationIndex:        int(p[19]),
			SurveySchedMode:     p[20],
			ElevationMaskDeg:    int(p[21]),
			MinimumSVs:          int(p[22]),
			PosStorageRate:      p[23],
			TypeOfPositions:     p[24],
			OverDetPosOff:       p[25] != 0,
			SmoothL1CA:          p[26] != 0,
			// p[27] reserved
			MSLHeights:       p[28] != 0,
			UseUserHeight:    p[29] != 0,
			ReferenceHeightM: leFloat64(p[30:38]),
			AntennaSerial:    leUint32(p[38:42]),
		}
		out.IndividualSession = &s
		return out, true

	case IndIndividualStation:
		if len(payload) < lenIndividualStation {
			return RetSesstn{}, false
		}
		p := payload[1:]
		st := IndividualStationInfo{
			StationIndex:    int(p[0]),
			StationID:       trimStationID8(p[1:9]),
			StationName:     trimSpaceASCII(p[9:59]),
			StationAccuracy: p[59],
			LatitudeDeg:     leFloat64(p[60:68]),
			LongitudeDeg:    leFloat64(p[68:76]),
			HeightM:         leFloat64(p[76:84]),
		}
		out.IndividualStation = &st
		return out, true

	case IndSessionSummary:
		b, ok := parseSummaryTable(payload, entrySessionSummary)
		if !ok {
			return RetSesstn{}, false
		}
		out.SessionSummary = b
		return out, true

	case IndStationSummary:
		b, ok := parseSummaryTable(payload, entryStationSummary)
		if !ok {
			return RetSesstn{}, false
		}
		out.StationSummary = b
		return out, true

	default:
		return RetSesstn{}, false
	}
}

func parseSummary(payload []byte, entryLen int) (*SummaryBlock, bool) {
	if len(payload) < 2 {
		return nil, false
	}
	n := int(payload[1])
	need := 2 + n*entryLen
	if len(payload) < need || n < 0 {
		return nil, false
	}
	items := make([]SummaryEntry, 0, n)
	off := 2
	for i := 0; i < n; i++ {
		idx := int(payload[off])
		off++
		idBytes := payload[off : off+entryLen-1]
		off += entryLen - 1
		items = append(items, SummaryEntry{Index: idx, ID: trimID(idBytes)})
	}
	return &SummaryBlock{Count: n, Items: items}, true
}

// parseSummaryTable tries classic survey summary layout first, then OEM variants where a zero
// in the count byte does not mean "empty" (reserved byte or 16-bit count).
func parseSummaryTable(payload []byte, entryLen int) (*SummaryBlock, bool) {
	b, ok := parseSummary(payload, entryLen)
	if ok && b.Count > 0 {
		return b, true
	}
	if ok && len(payload) <= 2 {
		return b, true
	}
	if b3, ok3 := parseSummaryAltCountAtByte2(payload, entryLen); ok3 && b3.Count > 0 {
		return b3, true
	}
	if b2, ok2 := parseSummaryAltUInt16CountLE(payload, entryLen); ok2 && b2.Count > 0 {
		return b2, true
	}
	if ok {
		return b, true
	}
	if b3, ok3 := parseSummaryAltCountAtByte2(payload, entryLen); ok3 {
		return b3, true
	}
	if b2, ok2 := parseSummaryAltUInt16CountLE(payload, entryLen); ok2 {
		return b2, true
	}
	return nil, false
}

// parseSummaryAltUInt16CountLE handles layouts where the entry count is a little-endian
// uint16 at bytes [1:3] and row data starts at byte 3 (seen on some OEM firmware).
func parseSummaryAltUInt16CountLE(payload []byte, entryLen int) (*SummaryBlock, bool) {
	if len(payload) < 3 {
		return nil, false
	}
	n := int(binary.LittleEndian.Uint16(payload[1:3]))
	if n > 512 {
		return nil, false
	}
	need := 3 + n*entryLen
	if len(payload) < need {
		return nil, false
	}
	items := make([]SummaryEntry, 0, n)
	off := 3
	for i := 0; i < n; i++ {
		idx := int(payload[off])
		off++
		idBytes := payload[off : off+entryLen-1]
		off += entryLen - 1
		items = append(items, SummaryEntry{Index: idx, ID: trimID(idBytes)})
	}
	return &SummaryBlock{Count: n, Items: items}, true
}

// parseSummaryAltCountAtByte2 handles a single reserved byte at [1] and count at [2].
func parseSummaryAltCountAtByte2(payload []byte, entryLen int) (*SummaryBlock, bool) {
	if len(payload) < 3 {
		return nil, false
	}
	n := int(payload[2])
	need := 3 + n*entryLen
	if len(payload) < need || n < 0 {
		return nil, false
	}
	items := make([]SummaryEntry, 0, n)
	off := 3
	for i := 0; i < n; i++ {
		idx := int(payload[off])
		off++
		idBytes := payload[off : off+entryLen-1]
		off += entryLen - 1
		items = append(items, SummaryEntry{Index: idx, ID: trimID(idBytes)})
	}
	return &SummaryBlock{Count: n, Items: items}, true
}

func trimID(b []byte) string {
	i := len(b)
	for i > 0 && b[i-1] == 0 {
		i--
	}
	return strings.TrimSpace(string(b[:i]))
}

func trimStationID8(b []byte) string {
	return trimID(b)
}

func trimSpaceASCII(b []byte) string {
	return strings.TrimRight(string(b), " \x00")
}

func leUint16(b []byte) uint16 {
	if len(b) < 2 {
		return 0
	}
	return binary.LittleEndian.Uint16(b)
}

func leUint32(b []byte) uint32 {
	if len(b) < 4 {
		return 0
	}
	return binary.LittleEndian.Uint32(b)
}

func leFloat64(b []byte) float64 {
	if len(b) < 8 {
		return math.NaN()
	}
	u := binary.LittleEndian.Uint64(b)
	return math.Float64frombits(u)
}
