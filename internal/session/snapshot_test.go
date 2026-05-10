package session

import "testing"

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
