package gsof

import (
	"encoding/binary"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/gkirk/dcol"
)

// WalkRecords invokes fn for each GSOF sub-record in a flattened buffer.
func WalkRecords(flat []byte, fn func(recType byte, payload []byte)) {
	ptr := 0
	for ptr+2 <= len(flat) {
		recType := flat[ptr]
		recLen := int(flat[ptr+1])
		end := ptr + 2 + recLen
		if end > len(flat) {
			break
		}
		fn(recType, flat[ptr+2:end])
		ptr = end
	}
}

func readFloat64BE(b []byte) (float64, bool) {
	if len(b) < 8 {
		return 0, false
	}
	return math.Float64frombits(binary.BigEndian.Uint64(b)), true
}

func readFloat32BE(b []byte) (float32, bool) {
	if len(b) < 4 {
		return 0, false
	}
	return math.Float32frombits(binary.BigEndian.Uint32(b)), true
}

func readInt32BE(b []byte) (int32, bool) {
	if len(b) < 4 {
		return 0, false
	}
	return int32(binary.BigEndian.Uint32(b)), true
}

// ParseLLHType2 — record 0x02 (Position LL): three IEEE doubles big-endian (rad, rad, m), 24 bytes.
func ParseLLHType2(payload []byte) (lat, lon, h float64, ok bool) {
	if len(payload) < 24 {
		return 0, 0, 0, false
	}
	lat, _ = readFloat64BE(payload[0:8])
	lon, _ = readFloat64BE(payload[8:16])
	h, _ = readFloat64BE(payload[16:24])
	return lat, lon, h, true
}

// ParseECEFDeltaType6 — record 0x06, 24 bytes: dX,dY,dZ doubles meters.
func ParseECEFDeltaType6(payload []byte) (dx, dy, dz float64, ok bool) {
	if len(payload) < 24 {
		return 0, 0, 0, false
	}
	dx, _ = readFloat64BE(payload[0:8])
	dy, _ = readFloat64BE(payload[8:16])
	dz, _ = readFloat64BE(payload[16:24])
	return dx, dy, dz, true
}

// TangentPlaneENU is GSOF record 7 (0x07) — tangent-plane east/north/up deltas from base to rover (meters).
type TangentPlaneENU struct {
	DeltaEastM  float64 `json:"delta_east_m"`
	DeltaNorthM float64 `json:"delta_north_m"`
	DeltaUpM    float64 `json:"delta_up_m"`
}

// ParseTangentPlaneENUType7 parses GSOF record 7 (0x07). Payload excludes record type/length bytes.
func ParseTangentPlaneENUType7(payload []byte) (*TangentPlaneENU, bool) {
	if len(payload) < 24 {
		return nil, false
	}
	east, okE := readFloat64BE(payload[0:8])
	north, okN := readFloat64BE(payload[8:16])
	up, okU := readFloat64BE(payload[16:24])
	if !okE || !okN || !okU {
		return nil, false
	}
	return &TangentPlaneENU{DeltaEastM: east, DeltaNorthM: north, DeltaUpM: up}, true
}

// ReceiverDiagnostics28 is GSOF record 28 decimal (0x1C) — receiver diagnostics (Trimble receiver help).
type ReceiverDiagnostics28 struct {
	BaseFlags                    uint8   `json:"base_flags,omitempty"`
	ReferenceStationInfoReceived bool    `json:"reference_station_info_received,omitempty"`
	LinkIntegrityPct             float64 `json:"link_integrity_pct,omitempty"`
	CommonL1SVs                  int     `json:"common_l1_svs,omitempty"`
	CommonL2SVs                  int     `json:"common_l2_svs,omitempty"`
	DatalinkLatencySec           float64 `json:"datalink_latency_s,omitempty"`
	DiffSVsInUse                 int     `json:"diff_svs_in_use,omitempty"`
	// RTKPositionAge is seconds; payload byte × 0.1 (tenths of a second, same unit style as datalink latency in this record).
	RTKPositionAge float64 `json:"rtk_position_age,omitempty"`
}

// ParseReceiverDiagnosticsType28 parses GSOF record 28 (0x1C). Not record 40 (0x28).
func ParseReceiverDiagnosticsType28(payload []byte) (*ReceiverDiagnostics28, bool) {
	if len(payload) < 18 {
		return nil, false
	}
	baseFlags := payload[5]
	linkRaw := payload[6]
	out := &ReceiverDiagnostics28{
		BaseFlags:                    baseFlags,
		ReferenceStationInfoReceived: baseFlags&0x80 != 0,
		LinkIntegrityPct:             float64(linkRaw) * 100.0 / 256.0,
		CommonL1SVs:                  int(payload[9]),
		CommonL2SVs:                  int(payload[10]),
		DatalinkLatencySec:           float64(payload[11]) * 0.1,
		DiffSVsInUse:                 int(payload[13]),
		RTKPositionAge:               float64(payload[16]) * 0.1,
	}
	return out, true
}

// ParseVelocityType8 — record 0x08: flags, horiz vel float, heading float, vert vel float.
func ParseVelocityType8(payload []byte) (horiz, heading, vert float64, ok bool) {
	if len(payload) < 13 {
		return 0, 0, 0, false
	}
	hv, ok1 := readFloat32BE(payload[1:5])
	hd, ok2 := readFloat32BE(payload[5:9])
	vv, ok3 := readFloat32BE(payload[9:13])
	if !ok1 || !ok2 || !ok3 {
		return 0, 0, 0, false
	}
	return float64(hv), float64(hd), float64(vv), true
}

// ParseDOPType9 — record 0x09: PDOP, HDOP, VDOP, TDOP floats.
func ParseDOPType9(payload []byte) (pdop, hdop, vdop, tdop float64, ok bool) {
	if len(payload) < 16 {
		return 0, 0, 0, 0, false
	}
	p, _ := readFloat32BE(payload[0:4])
	h, _ := readFloat32BE(payload[4:8])
	v, _ := readFloat32BE(payload[8:12])
	t, _ := readFloat32BE(payload[12:16])
	return float64(p), float64(h), float64(v), float64(t), true
}

// ParseSigmaType12 — record 0x0C (38 bytes minimum for fields we use).
func ParseSigmaType12(payload []byte) (rms, se, sn, su, maj, min float64, ok bool) {
	if len(payload) < 30 {
		return 0, 0, 0, 0, 0, 0, false
	}
	r, _ := readFloat32BE(payload[0:4])
	a, _ := readFloat32BE(payload[4:8])
	b, _ := readFloat32BE(payload[8:12])
	// skip covar 12-16
	u, _ := readFloat32BE(payload[16:20])
	ma, _ := readFloat32BE(payload[20:24])
	mi, _ := readFloat32BE(payload[24:28])
	return float64(r), float64(a), float64(b), float64(u), float64(ma), float64(mi), true
}

// ParseSerialType15 — record 0x0F: int32 serial.
func ParseSerialType15(payload []byte) (serial int32, ok bool) {
	v, ok := readInt32BE(payload)
	return v, ok
}

// ParseBriefSVType33 — record 0x21.
func ParseBriefSVType33(payload []byte) (out []BriefSV, ok bool) {
	if len(payload) < 1 {
		return nil, false
	}
	n := int(payload[0])
	ptr := 1
	var res []BriefSV
	for i := 0; i < n && ptr+4 <= len(payload); i++ {
		res = append(res, BriefSV{
			PRN:     int(payload[ptr]),
			System:  int(payload[ptr+1]),
			Flags1:  payload[ptr+2],
			Flags2:  payload[ptr+3],
			HasAzEl: false,
		})
		ptr += 4
	}
	return res, len(res) == n
}

// BriefSV from type 33 (no az/el).
type BriefSV struct {
	PRN     int
	System  int
	Flags1  byte
	Flags2  byte
	HasAzEl bool
}

// ParseAllSVDetailType34 — record 0x22 (legacy single-page ALL SV detail).
func ParseAllSVDetailType34(payload []byte) (out []DetailSV, ok bool) {
	return parseAllSVDetailRows(payload, 0, 1)
}

// ParseAllSVDetailType48 — record 0x30: multiple-page ALL SV detail (recommended).
// Payload: version (1), page info (1), SV count (1), then the same 8- or 10-byte SV rows as type 34.
func ParseAllSVDetailType48(payload []byte) (out []DetailSV, ok bool) {
	if len(payload) < 3 {
		return nil, false
	}
	return parseAllSVDetailRows(payload, 2, 3)
}

// parseAllSVDetailRows parses SV rows; countIdx points at the SV count byte, dataStart at the first SV byte.
// Legacy receivers may append padding after the last row or send a short final page; we infer 8- vs 10-byte
// rows from declared count and available bytes, ignore trailing slack, and accept partial rows as long as
// at least one complete SV decodes (matches practical Trimble streams).
func parseAllSVDetailRows(payload []byte, countIdx, dataStart int) (out []DetailSV, ok bool) {
	if countIdx < 0 || dataStart < 0 || len(payload) <= countIdx || len(payload) < dataStart {
		return nil, false
	}
	n := int(payload[countIdx])
	if n == 0 {
		return nil, true
	}
	dataLen := len(payload) - dataStart
	if dataLen < 8 {
		return nil, false
	}

	var stride int
	switch {
	case dataLen >= n*10:
		stride = 10
	case dataLen >= n*8:
		stride = 8
	default:
		// Short packet (e.g. last page or truncated link): prefer 10-byte row layout when possible.
		if dataLen >= 10 {
			stride = 10
		} else {
			stride = 8
		}
	}

	hasL2 := stride >= 10
	has56 := stride >= 10

	ptr := dataStart
	var res []DetailSV
	for i := 0; i < n; i++ {
		if ptr+stride > len(payload) {
			break
		}
		prn := int(payload[ptr])
		sys := int(payload[ptr+1])
		f1 := payload[ptr+2]
		f2 := payload[ptr+3]
		el := float64(payload[ptr+4])
		az := float64(binary.BigEndian.Uint16(payload[ptr+5 : ptr+7]))
		snr1 := float64(payload[ptr+7]) / 4.0
		var snr2, snr3 float64
		if hasL2 && ptr+9 <= len(payload) {
			snr2 = float64(payload[ptr+8]) / 4.0
		}
		if has56 && ptr+10 <= len(payload) {
			snr3 = float64(payload[ptr+9]) / 4.0
		}
		ptr += stride
		res = append(res, DetailSV{
			PRN: prn, System: sys, Flags1: f1, Flags2: f2,
			Elevation: el, Azimuth: az,
			CN0L1: snr1, CN0L2: snr2, CN0L56: snr3,
			HasL2: hasL2, HasL56: has56,
		})
	}
	return res, len(res) > 0
}

type DetailSV struct {
	PRN       int
	System    int
	Flags1    byte
	Flags2    byte
	Elevation float64
	Azimuth   float64
	CN0L1     float64
	CN0L2     float64
	CN0L56    float64
	HasL2     bool
	HasL56    bool
}

func Flags1UsedInPos(f byte) bool { return f&0x40 != 0 }
func Flags1UsedInRTK(f byte) bool { return f&0x80 != 0 }

// ParsePositionType38 — record 0x26 (38 decimal). Layout varies by firmware; decode via dcol.DecodeGSOFPositionTypeInformation.
// Position fix type exists only when the payload includes the full known tail (dcol.GSOFPositionTypeInformationMinLenFullKnown bytes).
func ParsePositionType38(payload []byte) (posType int, networkFlags2 byte, hasNet2 bool, hasPositionType bool, ok bool) {
	if len(payload) < dcol.GSOFPositionTypeInformationMinLenThroughNetworkFlags {
		return 0, 0, false, false, false
	}
	info, _ := dcol.DecodeGSOFPositionTypeInformation(payload)
	hasNet2 = len(payload) >= 12
	if hasNet2 {
		networkFlags2 = info.NetworkFlags2
	}
	hasPositionType = len(payload) >= dcol.GSOFPositionTypeInformationMinLenFullKnown
	posType = int(info.PositionFixType)
	return posType, networkFlags2, hasNet2, hasPositionType, true
}

// ParseTimeType1 — record 0x01 position time (GPS week + ms of week).
func ParseTimeType1(payload []byte) (gpsMs int32, week int, ok bool) {
	if len(payload) < 10 {
		return 0, 0, false
	}
	gpsMs = int32(binary.BigEndian.Uint32(payload[0:4]))
	week = int(int16(binary.BigEndian.Uint16(payload[4:6])))
	return gpsMs, week, true
}

// ParseUTCType16 — record 0x10: GPS week/ms + GPS–UTC offset (seconds) + flags.
func ParseUTCType16(payload []byte) (gpsMs int32, week int, utcOffsetSec int16, flags byte, ok bool) {
	if len(payload) < 9 {
		return 0, 0, 0, 0, false
	}
	gpsMs = int32(binary.BigEndian.Uint32(payload[0:4]))
	week = int(int16(binary.BigEndian.Uint16(payload[4:6])))
	utcOffsetSec = int16(binary.BigEndian.Uint16(payload[6:8]))
	flags = payload[8]
	return gpsMs, week, utcOffsetSec, flags, true
}

// ParseBattMemType37 — record 0x25 battery % and logging time remaining (hours).
func ParseBattMemType37(payload []byte) (batteryPct float64, logHoursRemain float64, ok bool) {
	if len(payload) < 10 {
		return 0, 0, false
	}
	batteryPct = float64(binary.BigEndian.Uint16(payload[0:2]))
	h, ok := readFloat64BE(payload[2:10])
	if !ok {
		return batteryPct, 0, true
	}
	return batteryPct, h, true
}

// LBandStatusInfo is GSOF record 40 (0x28) — LBAND STATUS INFO (Trimble OEM GNSS GSOF).
// Layout matches gsof_lbandStatusInfo: payload is the record body after type/length bytes.
type LBandStatusInfo struct {
	SatelliteName                string  `json:"satellite_name,omitempty"`
	NominalFrequencyMHz          float64 `json:"nominal_frequency_mhz,omitempty"`
	BitRateHz                    uint16  `json:"bit_rate_hz,omitempty"`
	SNRDbHz                      float64 `json:"snr_db_hz,omitempty"`
	Engine                       string  `json:"engine,omitempty"` // HP, XP, G2, unknown
	HPLibraryActive              bool    `json:"hp_library_active,omitempty"`
	VBSLibraryActive             bool    `json:"vbs_library_active,omitempty"`
	BeamMode                     string  `json:"beam_mode,omitempty"`
	OmniSTARMotion               string  `json:"omnistar_motion,omitempty"`
	SigmaHorizontalThresholdM    float64 `json:"sigma_horizontal_threshold_m,omitempty"` // 3σ horizontal precision threshold
	SigmaVerticalThresholdM      float64 `json:"sigma_vertical_threshold_m,omitempty"`   // 3σ vertical precision threshold
	NMEAEncryptionOn             bool    `json:"nmea_encryption_on,omitempty"`
	IQRatio                      float64 `json:"iq_ratio,omitempty"`
	EstimatedBitErrorRate        float64 `json:"estimated_bit_error_rate,omitempty"`
	TotalUniqueWords             uint32  `json:"total_unique_words,omitempty"`
	BadUniqueWords               uint32  `json:"bad_unique_words,omitempty"`
	BadUniqueWordBits            uint32  `json:"bad_unique_word_bits,omitempty"`
	TotalViterbiSymbols          uint32  `json:"total_viterbi_symbols,omitempty"`
	BadViterbiSymbols            uint32  `json:"bad_viterbi_symbols,omitempty"`
	BadMessages                  uint32  `json:"bad_messages,omitempty"`
	MeasuredFrequencyTrusted     *bool   `json:"measured_frequency_trusted,omitempty"` // nil if not present in payload
	MeasuredSatelliteFrequencyHz float64 `json:"measured_satellite_frequency_hz,omitempty"`
}

var lbandBeamModeLabels = []string{
	"Off",
	"FFT init",
	"FFT running",
	"Search init",
	"Search running",
	"Track init",
	"Track searching",
	"Tracking",
}

func lbandEngineLabel(b byte) string {
	switch b {
	case 1:
		return "HP"
	case 0:
		return "XP"
	case 2:
		return "G2"
	case 0xFF:
		return "unknown"
	default:
		return fmt.Sprintf("unknown(%d)", b)
	}
}

func lbandBeamModeLabel(b byte) string {
	if int(b) < len(lbandBeamModeLabels) {
		return lbandBeamModeLabels[b]
	}
	return fmt.Sprintf("unknown(%d)", b)
}

func lbandOmniMotionLabel(b byte) string {
	switch b {
	case 1:
		return "static"
	case 0:
		return "dynamic"
	case 2:
		return "not_ready"
	case 0xFF:
		return "unknown"
	default:
		return fmt.Sprintf("unknown(%d)", b)
	}
}

// ReceivedBaseInfo is GSOF record 35 (0x23) — Received base (Trimble OEM GSOF).
type ReceivedBaseInfo struct {
	Flags     byte    `json:"flags,omitempty"`
	InfoValid bool    `json:"info_valid,omitempty"` // flags bit 3: base information valid
	BaseName  string  `json:"base_name,omitempty"`
	BaseID    uint16  `json:"base_id,omitempty"`
	LatRad    float64 `json:"lat_rad,omitempty"`
	LonRad    float64 `json:"lon_rad,omitempty"`
	HeightM   float64 `json:"height_m,omitempty"`
}

// ParseReceivedBaseType35 parses GSOF record 35 (0x23).
func ParseReceivedBaseType35(payload []byte) (*ReceivedBaseInfo, bool) {
	if len(payload) < 35 {
		return nil, false
	}
	flags := payload[0]
	name := strings.TrimRight(string(payload[1:9]), "\x00 ")
	id := binary.BigEndian.Uint16(payload[9:11])
	lat, ok1 := readFloat64BE(payload[11:19])
	lon, ok2 := readFloat64BE(payload[19:27])
	h, ok3 := readFloat64BE(payload[27:35])
	if !ok1 || !ok2 || !ok3 {
		return nil, false
	}
	return &ReceivedBaseInfo{
		Flags:     flags,
		InfoValid: flags&0x08 != 0,
		BaseName:  name,
		BaseID:    id,
		LatRad:    lat,
		LonRad:    lon,
		HeightM:   h,
	}, true
}

// BasePositionQualityInfo is GSOF record 41 (0x29) — Base position and quality indicator.
type BasePositionQualityInfo struct {
	GPSMs        uint32  `json:"gps_ms,omitempty"`
	GPSWeek      int     `json:"gps_week,omitempty"`
	LatRad       float64 `json:"lat_rad,omitempty"`
	LonRad       float64 `json:"lon_rad,omitempty"`
	HeightM      float64 `json:"height_m,omitempty"`
	Quality      int     `json:"quality,omitempty"`
	QualityLabel string  `json:"quality_label,omitempty"`
}

func basePositionQualityLabel(q int) string {
	switch q {
	case 0:
		return "Fix not available or invalid"
	case 1:
		return "Autonomous GPS"
	case 2:
		return "Differential SBAS or OmniSTAR VBS"
	case 4:
		return "RTK fixed, xFill"
	case 5:
		return "OmniSTAR XP/HP, CenterPoint RTX, float RTK, or Location RTK"
	default:
		return fmt.Sprintf("Unknown (%d)", q)
	}
}

// ParseBasePositionQualityType41 parses GSOF record 41 (0x29).
func ParseBasePositionQualityType41(payload []byte) (*BasePositionQualityInfo, bool) {
	if len(payload) < 31 {
		return nil, false
	}
	gpsMs := binary.BigEndian.Uint32(payload[0:4])
	week := int(binary.BigEndian.Uint16(payload[4:6]))
	lat, ok1 := readFloat64BE(payload[6:14])
	lon, ok2 := readFloat64BE(payload[14:22])
	h, ok3 := readFloat64BE(payload[22:30])
	if !ok1 || !ok2 || !ok3 {
		return nil, false
	}
	q := int(payload[30])
	return &BasePositionQualityInfo{
		GPSMs:        gpsMs,
		GPSWeek:      week,
		LatRad:       lat,
		LonRad:       lon,
		HeightM:      h,
		Quality:      q,
		QualityLabel: basePositionQualityLabel(q),
	}, true
}

// RadioBandEntry is one radio block inside GSOF record 57 (0x39).
type RadioBandEntry struct {
	Band       string   `json:"band,omitempty"`
	Channel    int      `json:"channel,omitempty"`
	SignalDbm  *float64 `json:"signal_dbm,omitempty"`
	SignalBars int      `json:"signal_bars,omitempty"`
	NoiseDbm   *float64 `json:"noise_dbm,omitempty"`
	NoiseBars  int      `json:"noise_bars,omitempty"`
}

// RadioInfo is GSOF record 57 (0x39) — Radio information.
type RadioInfo struct {
	GPSWeek int              `json:"gps_week,omitempty"`
	GPSMs   uint32           `json:"gps_ms,omitempty"`
	Radios  []RadioBandEntry `json:"radios,omitempty"`
}

func radioBandLabel(b byte) string {
	switch b {
	case 0xFF:
		return "No radio detected"
	case 0x01:
		return "450 MHz"
	case 0x02:
		return "900 MHz"
	case 0x03:
		return "220 MHz"
	case 0x04:
		return "2.4 GHz"
	case 0x05:
		return "Cell modem"
	default:
		return fmt.Sprintf("Unknown (0x%02X)", b)
	}
}

// ParseRadioType57 parses GSOF record 57 (0x39).
func ParseRadioType57(payload []byte) (*RadioInfo, bool) {
	if len(payload) < 7 {
		return nil, false
	}
	week := int(binary.BigEndian.Uint16(payload[0:2]))
	ms := binary.BigEndian.Uint32(payload[2:6])
	n := int(payload[6])
	out := &RadioInfo{GPSWeek: week, GPSMs: ms}
	ptr := 7
	for i := 0; i < n && ptr < len(payload); i++ {
		segLen := int(payload[ptr])
		if segLen < 1 || ptr+segLen > len(payload) {
			break
		}
		chunk := payload[ptr : ptr+segLen]
		ptr += segLen
		if len(chunk) < 9 {
			continue
		}
		bandCode := chunk[1]
		band := radioBandLabel(bandCode)
		ch := int(chunk[2])
		sig := int16(binary.BigEndian.Uint16(chunk[3:5]))
		sigBars := int(chunk[5])
		noise := int16(binary.BigEndian.Uint16(chunk[6:8]))
		noiseBars := int(chunk[8])

		var sigDbm *float64
		if sig != 0x7FFF {
			if bandCode == 0x05 && sig == 0 {
				sigDbm = nil
			} else {
				v := float64(sig)
				sigDbm = &v
			}
		}
		var noiseDbm *float64
		if noise != 0x7FFF {
			v := float64(noise)
			noiseDbm = &v
		}
		out.Radios = append(out.Radios, RadioBandEntry{
			Band:       band,
			Channel:    ch,
			SignalDbm:  sigDbm,
			SignalBars: sigBars,
			NoiseDbm:   noiseDbm,
			NoiseBars:  noiseBars,
		})
	}
	return out, true
}

// ParseLBandType40 parses GSOF record 40 — LBAND STATUS INFO (big-endian floats / counts per Trimble ICD).
// Returns false if the payload is too short for the header (name + nominal freq + bit rate + SNR).
func ParseLBandType40(payload []byte) (*LBandStatusInfo, bool) {
	if len(payload) < 15 {
		return nil, false
	}
	out := &LBandStatusInfo{}
	out.SatelliteName = strings.TrimRight(string(payload[0:5]), "\x00 ")
	if f, ok := readFloat32BE(payload[5:9]); ok {
		out.NominalFrequencyMHz = float64(f)
	}
	out.BitRateHz = binary.BigEndian.Uint16(payload[9:11])
	if f, ok := readFloat32BE(payload[11:15]); ok {
		out.SNRDbHz = float64(f)
	}
	if len(payload) < 20 {
		return out, true
	}
	out.Engine = lbandEngineLabel(payload[15])
	out.HPLibraryActive = payload[16] == 1
	out.VBSLibraryActive = payload[17] == 1
	out.BeamMode = lbandBeamModeLabel(payload[18])
	out.OmniSTARMotion = lbandOmniMotionLabel(payload[19])
	if len(payload) >= 28 {
		if f, ok := readFloat32BE(payload[20:24]); ok {
			out.SigmaHorizontalThresholdM = float64(f)
		}
		if f, ok := readFloat32BE(payload[24:28]); ok {
			out.SigmaVerticalThresholdM = float64(f)
		}
	}
	if len(payload) >= 37 {
		out.NMEAEncryptionOn = payload[28] == 1
		if f, ok := readFloat32BE(payload[29:33]); ok {
			out.IQRatio = float64(f)
		}
		if f, ok := readFloat32BE(payload[33:37]); ok {
			out.EstimatedBitErrorRate = float64(f)
		}
	}
	if len(payload) >= 61 {
		out.TotalUniqueWords = binary.BigEndian.Uint32(payload[37:41])
		out.BadUniqueWords = binary.BigEndian.Uint32(payload[41:45])
		out.BadUniqueWordBits = binary.BigEndian.Uint32(payload[45:49])
		out.TotalViterbiSymbols = binary.BigEndian.Uint32(payload[49:53])
		out.BadViterbiSymbols = binary.BigEndian.Uint32(payload[53:57])
		out.BadMessages = binary.BigEndian.Uint32(payload[57:61])
	}
	if len(payload) >= 70 {
		trusted := payload[61] == 1
		out.MeasuredFrequencyTrusted = &trusted
		if f, ok := readFloat64BE(payload[62:70]); ok {
			out.MeasuredSatelliteFrequencyHz = f
		}
	}
	return out, true
}

// GPSToUTC approximates UTC from GPS week + ms using GPS epoch and GPS–UTC offset (seconds).
func GPSToUTC(week int, gpsMs int32, gpsUTCOffsetSec int16) time.Time {
	sec := int64(week)*604800 + int64(gpsMs)/1000
	gps := time.Date(1980, 1, 6, 0, 0, 0, 0, time.UTC).Add(time.Duration(sec) * time.Second)
	return gps.Add(-time.Duration(gpsUTCOffsetSec) * time.Second)
}

// GPSTime returns GPS system time (not UTC) from week and milliseconds of week.
func GPSTime(week int, gpsMs int32) time.Time {
	sec := int64(week)*604800 + int64(gpsMs)/1000
	return time.Date(1980, 1, 6, 0, 0, 0, 0, time.UTC).Add(time.Duration(sec) * time.Second)
}

const (
	SysGPS = iota
	SysSBAS
	SysGLO
	SysGal
	SysQZSS
	SysBDS
)

func SystemName(sys int) string {
	switch sys {
	case SysGPS:
		return "GPS"
	case SysSBAS:
		return "SBAS"
	case SysGLO:
		return "GLONASS"
	case SysGal:
		return "Galileo"
	case SysQZSS:
		return "QZSS"
	case SysBDS:
		return "BeiDou"
	case 6:
		return "NavIC"
	case 10:
		// Trimble extended SV system: MSS / OmniSTAR / RTX L-band (not a GNSS slot; avoid folding with %6).
		return "RTX (MSS)"
	default:
		return "Other"
	}
}
