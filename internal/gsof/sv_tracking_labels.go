package gsof

import "strings"

// TrackingLabelsL1L2L5 splits SV Flags2 (GSOF ALL SV detail: records 34 or 48) into slash-separated labels per frequency
// column: L1, L2, and L5.
//
// GPS, SBAS, GLONASS — Trimble SV Flags2:
//   - Bit 0 clear → L1 C/A; bit 0 set → L1 P (GPS/SBAS doc: P on L1).
//   - GPS/SBAS L2: bit 2 set → L2 CS (L2 civil); else bit 1 set → P; else C/A.
//   - GLONASS L2: same C/A vs P on bit 1 only (no separate CS flag in our map).
//   - GLONASS: bits 3–4 are not tracking-mode related (ignored here).
//   - GPS/SBAS L5: bit 3 set → L5.
//
// Other constellations use their own bit maps (Galileo E1/E5…, QZSS, BeiDou).
func TrackingLabelsL1L2L5(system int, flags2 byte) (l1, l2, l5 string) {
	a1, a2, a5 := trackingPartsL1L2L5(system, flags2)
	return strings.Join(a1, "/"), strings.Join(a2, "/"), strings.Join(a5, "/")
}

func trackingPartsL1L2L5(system int, f byte) (l1, l2, l5 []string) {
	n := system % 6
	if n < 0 {
		n += 6
	}
	switch n {
	case 0, 1: // GPS, SBAS
		if f&0x01 == 0 {
			l1 = append(l1, "C/A")
		} else {
			l1 = append(l1, "P")
		}
		if f&0x04 != 0 {
			l2 = append(l2, "CS")
		} else if f&0x02 != 0 {
			l2 = append(l2, "P")
		} else {
			l2 = append(l2, "C/A")
		}
		if f&0x08 != 0 {
			l5 = append(l5, "L5")
		}
	case 2: // GLONASS — same C/A vs P on bits 0–1 as GPS; bits 3–4 are not tracking-mode flags
		if f&0x01 == 0 {
			l1 = append(l1, "C/A")
		} else {
			l1 = append(l1, "P")
		}
		if f&0x02 == 0 {
			l2 = append(l2, "C/A")
		} else {
			l2 = append(l2, "P")
		}
	case 3: // Galileo — E6 shares the L5 column with other high-band signals
		if f&0x01 != 0 {
			l1 = append(l1, "E1")
		}
		if f&0x02 != 0 {
			l5 = append(l5, "E5a")
		}
		if f&0x04 != 0 {
			l5 = append(l5, "E5b")
		}
		if f&0x08 != 0 {
			l5 = append(l5, "Alt")
		}
		if f&0x10 != 0 {
			l5 = append(l5, "E6")
		}
	case 4: // QZSS
		if f&0x01 != 0 {
			l1 = append(l1, "L1CA")
		}
		if f&0x02 != 0 {
			l1 = append(l1, "L1C")
		}
		if f&0x04 != 0 {
			l1 = append(l1, "L1-SAIF")
		}
		if f&0x08 != 0 {
			l2 = append(l2, "L2C")
		}
		if f&0x10 != 0 {
			l5 = append(l5, "L5")
		}
	case 5: // BeiDou
		if f&0x01 != 0 {
			l1 = append(l1, "B1")
		}
		if f&0x02 != 0 {
			l2 = append(l2, "B2")
		}
		if f&0x04 != 0 {
			l5 = append(l5, "B3")
		}
	}
	return l1, l2, l5
}
