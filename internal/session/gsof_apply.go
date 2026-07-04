package session

import (
	"fmt"
	"log"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gkirk/dcol"

	"github.com/gkirk/trimble-receiver-console/internal/gsof"
)

const (
	verboseGSOFHexChunkBytes = 48   // bytes per log line (spaced hex)
	verboseGSOFHexMaxDump    = 8192 // cap per buffer to avoid huge logs
)

func spacedHexBytes(b []byte) string {
	if len(b) == 0 {
		return ""
	}
	var sb strings.Builder
	sb.Grow(len(b) * 3)
	for i, c := range b {
		if i > 0 {
			sb.WriteByte(' ')
		}
		fmt.Fprintf(&sb, "%02X", c)
	}
	return sb.String()
}

// logVerboseGSOFPacket logs raw or flattened GSOF packet bytes as spaced hex (chunked lines).
func logVerboseGSOFPacket(opts *ApplyGSOFOpts, tag string, b []byte) {
	if opts == nil || !opts.Verbose {
		return
	}
	total := len(b)
	if total == 0 {
		log.Printf("gsof verbose group=%q identity=%q %s bytes=0 (empty)", opts.GroupID, opts.Identity, tag)
		return
	}
	show := b
	truncNote := ""
	if total > verboseGSOFHexMaxDump {
		show = b[:verboseGSOFHexMaxDump]
		truncNote = fmt.Sprintf(" (truncated hex dump to first %d bytes)", verboseGSOFHexMaxDump)
	}
	log.Printf("gsof verbose group=%q identity=%q %s total_bytes=%d%s", opts.GroupID, opts.Identity, tag, total, truncNote)
	for off := 0; off < len(show); off += verboseGSOFHexChunkBytes {
		end := off + verboseGSOFHexChunkBytes
		if end > len(show) {
			end = len(show)
		}
		log.Printf("gsof verbose group=%q identity=%q %s [%04d:%04d]: %s",
			opts.GroupID, opts.Identity, tag, off, end, spacedHexBytes(show[off:end]))
	}
}

// ApplyGSOFOpts selects optional stderr logging for ApplyGSOFBuffer.
type ApplyGSOFOpts struct {
	Verbose  bool
	Summary  *GSOFSummary
	GroupID  string
	Identity string // serial number or anon store key
}

func formatGSOFTypeHistogram(m map[byte]int) string {
	if len(m) == 0 {
		return ""
	}
	keys := make([]byte, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i] < keys[j] })
	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteByte(' ')
		}
		fmt.Fprintf(&b, "%02X:%d", k, m[k])
	}
	return b.String()
}

func countGSOFSubrecords(m map[byte]int) int {
	n := 0
	for _, v := range m {
		n += v
	}
	return n
}

// ApplyGSOFBuffer merges GSOF sub-records into snap.
func ApplyGSOFBuffer(snap *ReceiverSnapshot, gsofBuf []byte, opts *ApplyGSOFOpts) {
	flat := dcol.FlattenGSOFBuffer(gsofBuf)
	if opts != nil && opts.Verbose {
		logVerboseGSOFPacket(opts, "gsof_packet_raw", gsofBuf)
		logVerboseGSOFPacket(opts, "gsof_packet_flat", flat)
	}
	var recCounts map[byte]int
	if opts != nil && (opts.Verbose || opts.Summary != nil) {
		recCounts = make(map[byte]int)
	}
	var detail48 []gsof.DetailSV
	var detail34 []gsof.DetailSV
	var brief []gsof.BriefSV

	var utcT time.Time
	var hasUTC bool
	var gpsWeek int
	var gpsMs int32
	var hasGPSTime bool

	gsof.WalkRecords(flat, func(recType byte, payload []byte) {
		if recCounts != nil {
			recCounts[recType]++
		}
		switch recType {
		case 0x01:
			if ms, w, ok := gsof.ParseTimeType1(payload); ok {
				gpsMs, gpsWeek = ms, w
				hasGPSTime = true
			}
		case 0x02:
			if opts != nil && opts.Verbose {
				log.Printf("gsof verbose group=%q identity=%q type=0x02 payload_bytes=%d payload_hex=%s",
					opts.GroupID, opts.Identity, len(payload), spacedHexBytes(payload))
			}
			if lat, lon, h, ok := gsof.ParseLLHType2(payload); ok {
				if math.IsNaN(lat) || math.IsNaN(lon) || math.IsNaN(h) ||
					math.IsInf(lat, 0) || math.IsInf(lon, 0) || math.IsInf(h, 0) {
					if opts != nil && opts.Verbose {
						log.Printf("gsof verbose group=%q identity=%q type=0x02 skip non-finite lat=%g lon=%g h_m=%g",
							opts.GroupID, opts.Identity, lat, lon, h)
					}
					break
				}
				snap.LatRad, snap.LonRad, snap.HeightM = lat, lon, h
				snap.HasLLH = true
				if opts != nil && opts.Verbose {
					latDeg := lat * 180 / math.Pi
					lonDeg := lon * 180 / math.Pi
					log.Printf("gsof verbose group=%q identity=%q type=0x02 applied HasLLH=true lat_deg=%.7f lon_deg=%.7f h_m=%.3f",
						opts.GroupID, opts.Identity, latDeg, lonDeg, h)
				}
			} else if opts != nil && opts.Verbose {
				log.Printf("gsof verbose group=%q identity=%q type=0x02 parse failed (need 24 bytes, got %d)",
					opts.GroupID, opts.Identity, len(payload))
			}
		case 0x10:
			if ms, w, utcOff, _, ok := gsof.ParseUTCType16(payload); ok {
				gpsMs, gpsWeek = ms, w
				hasGPSTime = true
				utcT = gsof.GPSToUTC(w, ms, utcOff)
				hasUTC = true
			}
		case 0x25:
			if pct, logH, ok := gsof.ParseBattMemType37(payload); ok {
				snap.BatteryPercent = pct
				snap.LoggingHoursRemain = logH
				snap.HasPowerLogging = true
			}
		case 0x28:
			if lb, ok := gsof.ParseLBandType40(payload); ok {
				snap.LBandStatus = lb
			}
		case 0x07:
			if tp, ok := gsof.ParseTangentPlaneENUType7(payload); ok {
				if snap.Vector == nil {
					snap.Vector = &VectorCardSnapshot{}
				}
				snap.Vector.TangentPlane = tp
			}
		case 0x1C:
			if d, ok := gsof.ParseReceiverDiagnosticsType28(payload); ok {
				if snap.Vector == nil {
					snap.Vector = &VectorCardSnapshot{}
				}
				snap.Vector.Diagnostics = d
			}
		case 0x06:
			if dx, dy, dz, ok := gsof.ParseECEFDeltaType6(payload); ok {
				snap.DeltaXM, snap.DeltaYM, snap.DeltaZM = dx, dy, dz
				snap.HasBaseline = true
			}
		case 0x08:
			if hv, hd, vv, ok := gsof.ParseVelocityType8(payload); ok {
				snap.HorizontalVelMS = hv
				snap.HeadingRad = hd
				snap.VerticalVelMS = vv
				snap.HasVelocity = true
			}
		case 0x09:
			if p, h, v, t, ok := gsof.ParseDOPType9(payload); ok {
				snap.PDOP, snap.HDOP, snap.VDOP, snap.TDOP = p, h, v, t
				snap.HasDOP = true
			}
		case 0x0C:
			if rms, se, sn, su, maj, min, ok := gsof.ParseSigmaType12(payload); ok {
				snap.PositionRMS = rms
				snap.SigmaEast, snap.SigmaNorth, snap.SigmaUp = se, sn, su
				snap.SemiMajor, snap.SemiMinor = maj, min
				snap.HasSigma = true
			}
		case 0x0F:
			if s, ok := gsof.ParseSerialType15(payload); ok {
				snap.Serial = strconv.FormatInt(int64(s), 10)
			}
		case 0x21:
			if b, ok := gsof.ParseBriefSVType33(payload); ok {
				brief = b
			}
		case 0x22:
			if d, ok := gsof.ParseAllSVDetailType34(payload); ok {
				detail34 = d
			}
		case 0x30:
			if d, ok := gsof.ParseAllSVDetailType48(payload); ok {
				detail48 = append(detail48, d...)
			}
		case 0x26:
			if pt, net2, hasNet2, hasPT, ok := gsof.ParsePositionType38(payload); ok {
				if hasPT {
					snap.PositionType = pt
					snap.HasPositionType = true
					snap.PositionTypeLabel = PositionTypeLabel(pt)
				}
				if hasNet2 {
					snap.XFillPresent = true
					snap.XFillReady = net2&0x01 != 0
				}
			}
		case 0x23:
			if rb, ok := gsof.ParseReceivedBaseType35(payload); ok {
				snap.ReceivedBase = rb
			}
		case 0x29:
			if bq, ok := gsof.ParseBasePositionQualityType41(payload); ok {
				snap.BasePositionQuality = bq
			}
		case 0x39:
			if ri, ok := gsof.ParseRadioType57(payload); ok {
				snap.RadioInfo = ri
			}
		}
	})

	if recCounts != nil {
		if opts.Verbose {
			_, has02 := recCounts[0x02]
			log.Printf("gsof verbose group=%q identity=%q gsof_buf=%dB flat=%dB subrecords=%d hist=%s type02_present=%v",
				opts.GroupID, opts.Identity, len(gsofBuf), len(flat), countGSOFSubrecords(recCounts), formatGSOFTypeHistogram(recCounts), has02)
		}
		if opts.Summary != nil {
			opts.Summary.Record(opts.GroupID, opts.Identity, recCounts)
		}
	}

	if hasUTC {
		snap.SolutionTime = utcT
		snap.TimeSource = "UTC"
		snap.SolutionGPSWeek = gpsWeek
		snap.SolutionGPSMs = gpsMs
	} else if hasGPSTime {
		snap.SolutionTime = gsof.GPSTime(gpsWeek, gpsMs)
		snap.TimeSource = "GPS"
		snap.SolutionGPSWeek = gpsWeek
		snap.SolutionGPSMs = gpsMs
	}

	if len(detail48) > 0 {
		snap.SVs = detailToSVInfo(dedupeDetailSVKeepLast(detail48))
	} else if len(detail34) > 0 {
		snap.SVs = detailToSVInfo(dedupeDetailSVKeepLast(detail34))
	} else if len(brief) > 0 {
		snap.SVs = briefToSVInfo(brief)
	}
	rebuildSVCounts(snap)
}

// dedupeDetailSVKeepLast collapses duplicate (system, PRN) rows from multiple GSOF ALL-SV
// records or pages; the last row wins so the snapshot matches one row per SV.
func dedupeDetailSVKeepLast(in []gsof.DetailSV) []gsof.DetailSV {
	if len(in) <= 1 {
		return in
	}
	order := make([]string, 0, len(in))
	m := make(map[string]gsof.DetailSV)
	for _, s := range in {
		k := strconv.Itoa(s.System) + ":" + strconv.Itoa(s.PRN)
		if _, ok := m[k]; !ok {
			order = append(order, k)
		}
		m[k] = s
	}
	out := make([]gsof.DetailSV, 0, len(order))
	for _, k := range order {
		out = append(out, m[k])
	}
	return out
}

func detailToSVInfo(d []gsof.DetailSV) []SVInfo {
	out := make([]SVInfo, 0, len(d))
	for _, s := range d {
		t1, t2, t5 := gsof.TrackingLabelsL1L2L5(s.System, s.Flags2)
		var l2, l56 *float64
		if s.HasL2 {
			v := s.CN0L2
			l2 = &v
		}
		if s.HasL56 {
			v := s.CN0L56
			l56 = &v
		}
		out = append(out, SVInfo{
			PRN:       s.PRN,
			System:    s.System,
			Elevation: s.Elevation,
			Azimuth:   s.Azimuth,
			HasAzEl:   true,
			CN0:       s.CN0L1,
			CN0L2:     l2,
			CN0L56:    l56,
			TrackL1:   t1,
			TrackL2:   t2,
			TrackL5:   t5,
			UsedInPos: gsof.Flags1UsedInPos(s.Flags1),
			UsedInRTK: gsof.Flags1UsedInRTK(s.Flags1),
		})
	}
	return out
}

func briefToSVInfo(b []gsof.BriefSV) []SVInfo {
	out := make([]SVInfo, 0, len(b))
	for _, s := range b {
		out = append(out, SVInfo{
			PRN:       s.PRN,
			System:    s.System,
			HasAzEl:   false,
			CN0:       0,
			UsedInPos: gsof.Flags1UsedInPos(s.Flags1),
			UsedInRTK: gsof.Flags1UsedInRTK(s.Flags1),
		})
	}
	return out
}

func rebuildSVCounts(snap *ReceiverSnapshot) {
	used := make(map[string]int)
	tracked := make(map[string]int)
	for _, sv := range snap.SVs {
		name := gsof.SystemName(sv.System)
		if sv.UsedInPos {
			used[name]++
		}
		tracked[name]++
	}
	snap.SVUsedBySystem = used
	snap.SVTrackedBySystem = tracked
}
