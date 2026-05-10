package dcolserial

import "testing"

func TestParseRetSerialPayload_minimal(t *testing.T) {
	p := make([]byte, 158)
	copy(p[0:8], []byte("12345678"))
	copy(p[8:16], []byte("BD970   "))
	copy(p[16:21], []byte("5.12 "))
	copy(p[21:26], []byte("3.00 "))
	copy(p[26:31], []byte("1.00 "))
	copy(p[31:39], []byte("ANT12345"))
	copy(p[39:41], []byte("KS"))
	copy(p[41:43], []byte("24"))
	copy(p[43:45], []byte("12"))
	copy(p[45:55], []byte("9876543210"))
	p[148], p[149] = 0, 20 // usable channels BE
	p[150], p[151] = 0, 24 // physical
	p[152] = 16
	copy(p[153:158], []byte("2.1  "))

	info, ok := ParseRetSerialPayload(p)
	if !ok {
		t.Fatal("expected ok")
	}
	if info.LongSerial != "9876543210" || info.ReceiverSerialShort != "12345678" {
		t.Fatalf("%+v", info)
	}
	if info.ChannelsTotal != 24 || info.ChannelsL1Only != 12 {
		t.Fatalf("ch %+v", info)
	}
	if info.UsableChannels != 20 || info.PhysicalChannels != 24 || info.SimultaneousTrack != 16 {
		t.Fatalf("ext %+v", info)
	}
}
