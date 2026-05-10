package gsof

import "testing"

func TestTrackingLabelsGPSL2CS(t *testing.T) {
	// GPS system 0: L1 C/A + L2 CS on bit 2 (ignore duplicate C/A from bit 1 clear)
	const sys = 0
	flags := byte(0x04) // bit 2 only
	l1, l2, l5 := TrackingLabelsL1L2L5(sys, flags)
	if l1 != "C/A" {
		t.Fatalf("L1 want C/A got %q", l1)
	}
	if l2 != "CS" {
		t.Fatalf("L2 want CS got %q", l2)
	}
	if l5 != "" {
		t.Fatalf("L5 want empty got %q", l5)
	}
}

func TestTrackingLabelsGPSL2P(t *testing.T) {
	const sys = 0
	flags := byte(0x02) // bit 1 P on L2
	l1, l2, _ := TrackingLabelsL1L2L5(sys, flags)
	if l1 != "C/A" || l2 != "P" {
		t.Fatalf("got L1=%q L2=%q", l1, l2)
	}
}

func TestTrackingLabelsMSSUsesGPSFlagMapNotQZSS(t *testing.T) {
	const sys = 10
	flags := byte(0x04) // GPS: L2 CS on bit 2; QZSS same bits would map to L1-SAIF on L1.
	l1, l2, l5 := TrackingLabelsL1L2L5(sys, flags)
	if l1 != "C/A" {
		t.Fatalf("L1 want C/A got %q", l1)
	}
	if l2 != "CS" {
		t.Fatalf("L2 want CS got %q", l2)
	}
	if l5 != "" {
		t.Fatalf("L5 want empty got %q", l5)
	}
}
