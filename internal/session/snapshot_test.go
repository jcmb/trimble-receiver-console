package session

import (
	"testing"

	"github.com/gkirk/trimble-receiver-console/internal/gsof"
)

func TestDedupeDetailSVKeepLast(t *testing.T) {
	in := []gsof.DetailSV{
		{PRN: 14, System: 0, CN0L1: 40},
		{PRN: 14, System: 0, CN0L1: 41},
		{PRN: 15, System: 0, CN0L1: 42},
	}
	got := dedupeDetailSVKeepLast(in)
	if len(got) != 2 {
		t.Fatalf("len=%d want 2: %+v", len(got), got)
	}
	if got[0].PRN != 14 || got[0].CN0L1 != 41 {
		t.Fatalf("first row %+v want PRN14 CN0 41", got[0])
	}
	if got[1].PRN != 15 {
		t.Fatal(got[1])
	}
}

func TestEffectiveSnapshotMode(t *testing.T) {
	if EffectiveSnapshotMode(ModeReadOnly, false) != ModeReadOnly {
		t.Fatal()
	}
	if EffectiveSnapshotMode(ModeReadOnly, true) != ModeReadOnly {
		t.Fatal()
	}
	if EffectiveSnapshotMode(ModeReadWrite, false) != ModeReadOnly {
		t.Fatal()
	}
	if EffectiveSnapshotMode(ModeReadWrite, true) != ModeReadWrite {
		t.Fatal()
	}
}
