package session

import "testing"

func TestGSOFSummary_RecordFlush(t *testing.T) {
	s := NewGSOFSummary()
	s.Record("yard", "out:10.0.0.1:2101", map[byte]int{0x01: 1, 0x02: 1})
	s.Record("yard", "out:10.0.0.1:2101", map[byte]int{0x01: 1, 0x09: 1})
	s.Flush()

	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.streams) != 0 {
		t.Fatalf("expected flush to clear streams, got %d", len(s.streams))
	}
}

func TestFormatGSOFSummaryTypes(t *testing.T) {
	got := formatGSOFSummaryTypes(
		map[byte]uint64{0x02: 3, 0x09: 1},
		map[byte]uint64{0x02: 3, 0x09: 1},
		3,
	)
	if got != "0x02(2):LLH:3 0x09(9):DOP:1@1/3" {
		t.Fatalf("got %q", got)
	}
	got = formatGSOFSummaryTypes(
		map[byte]uint64{0x02: 149, 0x09: 15},
		map[byte]uint64{0x02: 149, 0x09: 15},
		149,
	)
	if got != "0x02(2):LLH:149 0x09(9):DOP:15@15/149" {
		t.Fatalf("got %q", got)
	}
}
