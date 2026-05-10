package session

import (
	"testing"
	"time"

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

func TestHasReceiverDetails(t *testing.T) {
	if HasReceiverDetails(nil) {
		t.Fatal()
	}
	if HasReceiverDetails(&ReceiverSnapshot{}) {
		t.Fatal()
	}
	if !HasReceiverDetails(&ReceiverSnapshot{Serial: "x"}) {
		t.Fatal()
	}
	if !HasReceiverDetails(&ReceiverSnapshot{GSOFReportCount: 1}) {
		t.Fatal()
	}
	if !HasReceiverDetails(&ReceiverSnapshot{DCOLRetSerial: &DCOLRetSerialSnapshot{}}) {
		t.Fatal()
	}
}

func TestListUniqueBySerial_prefersNewestConnection(t *testing.T) {
	st := NewStore()
	oldT := time.Now().Add(-2 * time.Hour)
	newT := time.Now().Add(-time.Hour)
	st.Set("anon:10.0.0.1:1", &ReceiverSnapshot{
		Serial:     "SN123",
		FirstSeen:  oldT,
		LastUpdate: oldT,
		RemoteAddr: "10.0.0.1:1",
		Online:     false,
	})
	st.Set("anon:10.0.0.2:2", &ReceiverSnapshot{
		Serial:     "SN123",
		FirstSeen:  newT,
		LastUpdate: newT,
		RemoteAddr: "10.0.0.2:2",
		Online:     true,
	})
	list := st.ListUniqueBySerial()
	if len(list) != 1 {
		t.Fatalf("len=%d want 1", len(list))
	}
	if list[0].RemoteAddr != "10.0.0.2:2" {
		t.Fatalf("got %+v", list[0])
	}
}
