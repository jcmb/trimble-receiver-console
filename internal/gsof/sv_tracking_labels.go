package gsof

import "strings"

// TrackingLabelsL12L56 splits SV Flags2 (record 34) into slash-separated labels for the L1/L2
// bucket vs L5/E5/Alt bucket. Interpretation follows Trimble GSOF All SV Detail flag descriptions
// (varies by constellation).
func TrackingLabelsL12L56(system int, flags2 byte) (l12, l56 string) {
	a12, a56 := trackingLabelParts(system, flags2)
	return strings.Join(a12, "/"), strings.Join(a56, "/")
}

func trackingLabelParts(system int, f byte) (l12, l56 []string) {
	n := system % 6
	if n < 0 {
		n += 6
	}
	switch n {
	case 0, 1: // GPS, SBAS — same style as GPS L-band flags
		if f&0x01 != 0 {
			l12 = append(l12, "L1P")
		}
		if f&0x02 != 0 {
			l12 = append(l12, "L2P")
		}
		if f&0x04 != 0 {
			l12 = append(l12, "L2CS")
		}
		if f&0x08 != 0 {
			l56 = append(l56, "L5")
		}
	case 2: // GLONASS
		if f&0x01 != 0 {
			l12 = append(l12, "G1P")
		}
		if f&0x02 != 0 {
			l12 = append(l12, "G2P")
		}
		if f&0x04 != 0 {
			l12 = append(l12, "M")
		}
		if f&0x08 != 0 {
			l12 = append(l12, "K")
		}
	case 3: // Galileo
		if f&0x01 != 0 {
			l12 = append(l12, "E1")
		}
		if f&0x02 != 0 {
			l56 = append(l56, "E5a")
		}
		if f&0x04 != 0 {
			l56 = append(l56, "E5b")
		}
		if f&0x08 != 0 {
			l56 = append(l56, "Alt")
		}
	case 4: // QZSS
		if f&0x01 != 0 {
			l12 = append(l12, "L1CA")
		}
		if f&0x02 != 0 {
			l12 = append(l12, "L1C")
		}
		if f&0x04 != 0 {
			l12 = append(l12, "L1-SAIF")
		}
		if f&0x08 != 0 {
			l12 = append(l12, "L2C")
		}
		if f&0x10 != 0 {
			l56 = append(l56, "L5")
		}
	case 5: // BeiDou
		if f&0x01 != 0 {
			l12 = append(l12, "B1")
		}
		if f&0x02 != 0 {
			l12 = append(l12, "B2")
		}
		if f&0x04 != 0 {
			l56 = append(l56, "B3")
		}
	}
	return l12, l56
}
