package configencode

import (
	"bytes"
	"testing"
)

func TestPackChecksum(t *testing.T) {
	b, err := Pack(0x40, []byte{1, 2, 3})
	if err != nil {
		t.Fatal(err)
	}
	if b[0] != 0x02 || b[len(b)-1] != 0x03 {
		t.Fatalf("framing: %x", b)
	}
	var csum byte
	for i := 1; i < len(b)-2; i++ {
		csum += b[i]
	}
	if csum != b[len(b)-2] {
		t.Fatalf("checksum")
	}
	if !bytes.Contains(b, []byte{1, 2, 3}) {
		t.Fatalf("payload missing")
	}
}
