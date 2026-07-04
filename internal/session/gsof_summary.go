package session

import (
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
)

// GSOFSummary aggregates GSOF sub-record type counts per stream and logs periodic summaries.
type GSOFSummary struct {
	mu      sync.Mutex
	streams map[string]*gsofSummaryStream
}

type gsofSummaryStream struct {
	groupID  string
	identity string
	reports  uint64
	counts   map[byte]uint64 // total sub-record occurrences
	inReport map[byte]uint64 // reports that contained at least one of this type
}

// NewGSOFSummary creates a collector for -summary-gsof / summary_gsof.
func NewGSOFSummary() *GSOFSummary {
	return &GSOFSummary{streams: make(map[string]*gsofSummaryStream)}
}

// Record merges one GSOF report's sub-record histogram for groupID/identity.
func (s *GSOFSummary) Record(groupID, identity string, delta map[byte]int) {
	if s == nil || len(delta) == 0 {
		return
	}
	key := groupID + "\x00" + identity
	s.mu.Lock()
	defer s.mu.Unlock()
	st := s.streams[key]
	if st == nil {
		st = &gsofSummaryStream{
			groupID:  groupID,
			identity: identity,
			counts:   make(map[byte]uint64),
			inReport: make(map[byte]uint64),
		}
		s.streams[key] = st
	}
	st.reports++
	for t, n := range delta {
		if n > 0 {
			st.counts[t] += uint64(n)
			st.inReport[t]++
		}
	}
}

// Flush logs summaries for streams with activity since the last flush, then clears interval state.
func (s *GSOFSummary) Flush() {
	if s == nil {
		return
	}
	s.mu.Lock()
	if len(s.streams) == 0 {
		s.mu.Unlock()
		return
	}
	snapshot := make([]*gsofSummaryStream, 0, len(s.streams))
	for _, st := range s.streams {
		if st.reports == 0 {
			continue
		}
		cp := &gsofSummaryStream{
			groupID:  st.groupID,
			identity: st.identity,
			reports:  st.reports,
			counts:   make(map[byte]uint64, len(st.counts)),
			inReport: make(map[byte]uint64, len(st.inReport)),
		}
		for t, n := range st.counts {
			cp.counts[t] = n
		}
		for t, n := range st.inReport {
			cp.inReport[t] = n
		}
		snapshot = append(snapshot, cp)
	}
	s.streams = make(map[string]*gsofSummaryStream)
	s.mu.Unlock()

	for _, st := range snapshot {
		log.Printf("gsof summary group=%q identity=%q reports=%d subrecords=%d types=%s",
			st.groupID, st.identity, st.reports, gsofSummarySubrecordTotal(st.counts), formatGSOFSummaryTypes(st.counts, st.inReport, st.reports))
	}
}

func formatGSOFSummaryTypes(counts, inReport map[byte]uint64, reports uint64) string {
	if len(counts) == 0 {
		return ""
	}
	keys := make([]byte, 0, len(counts))
	for k := range counts {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i] < keys[j] })
	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteByte(' ')
		}
		name := gsofRecordShortName(k)
		seen := inReport[k]
		if name != "" {
			fmt.Fprintf(&b, "0x%02X(%d):%s:%d", k, k, name, counts[k])
		} else {
			fmt.Fprintf(&b, "0x%02X(%d):%d", k, k, counts[k])
		}
		if reports > 0 && seen != reports {
			fmt.Fprintf(&b, "@%d/%d", seen, reports)
		}
	}
	return b.String()
}

func gsofSummarySubrecordTotal(m map[byte]uint64) uint64 {
	var n uint64
	for _, v := range m {
		n += v
	}
	return n
}

// gsofRecordShortName returns a brief label for common GSOF sub-record types (decimal in parens above).
func gsofRecordShortName(t byte) string {
	switch t {
	case 0x01:
		return "GPS time"
	case 0x02:
		return "LLH"
	case 0x06:
		return "ECEF delta"
	case 0x07:
		return "tangent plane"
	case 0x08:
		return "velocity"
	case 0x09:
		return "DOP"
	case 0x0C:
		return "sigma"
	case 0x0F:
		return "serial"
	case 0x10:
		return "UTC time"
	case 0x1C:
		return "rcv diag"
	case 0x21:
		return "brief SV"
	case 0x22:
		return "ALL SV 34"
	case 0x23:
		return "rcv base"
	case 0x25:
		return "batt/mem"
	case 0x26:
		return "pos type"
	case 0x28:
		return "L-band"
	case 0x29:
		return "base qual"
	case 0x30:
		return "ALL SV 48"
	case 0x39:
		return "radio"
	default:
		return ""
	}
}
