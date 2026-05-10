package configencode

import "fmt"

// Pack builds a Trimble-style DCOL frame: STX, reserved, type, len, payload..., checksum, ETX.
func Pack(cmd byte, payload []byte) ([]byte, error) {
	if len(payload) > 255 {
		return nil, fmt.Errorf("payload length %d exceeds 255", len(payload))
	}
	pl := append([]byte(nil), payload...)
	n := 6 + len(pl)
	b := make([]byte, n)
	b[0] = 0x02
	b[1] = 0x00
	b[2] = cmd
	b[3] = byte(len(pl))
	copy(b[4:], pl)
	var csum byte
	for i := 1; i < n-2; i++ {
		csum += b[i]
	}
	b[n-2] = csum
	b[n-1] = 0x03
	return b, nil
}
