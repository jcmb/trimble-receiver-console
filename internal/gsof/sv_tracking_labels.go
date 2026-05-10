package gsof

import "strings"

// TrackingLabelsL1L2L5 splits SV Flags2 (GSOF record 34) into slash-separated labels per frequency
// column: L1, L2, and L5 (Galileo E5a/E5b/Alt/E6 and GPS L5 share the L5 column; E6 uses bit 4 when present).
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
		if f&0x01 != 0 {
			l1 = append(l1, "L1P")
		}
		if f&0x02 != 0 {
			l2 = append(l2, "L2P")
		}
		if f&0x04 != 0 {
			l2 = append(l2, "L2CS")
		}
		if f&0x08 != 0 {
			l5 = append(l5, "L5")
		}
	case 2: // GLONASS — G1→L1, G2→L2; M/K SV flags appended on L1 per ICD convention
		if f&0x01 != 0 {
			l1 = append(l1, "G1P")
		}
		if f&0x02 != 0 {
			l2 = append(l2, "G2P")
		}
		if f&0x04 != 0 {
			l1 = append(l1, "M")
		}
		if f&0x08 != 0 {
			l1 = append(l1, "K")
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
