package dcolserial

import (
	"encoding/binary"
	"math"
	"testing"
)

func TestGETSesstnPayload(t *testing.T) {
	p := GETSesstnPayload(ReqIndividualSession, 7)
	if len(p) != 2 || p[0] != 0 || p[1] != 7 {
		t.Fatalf("%v", p)
	}
}

func TestParseRetSesstnIndividualSession(t *testing.T) {
	buf := make([]byte, 43)
	buf[0] = byte(IndIndividualSession)
	buf[1] = 3
	copy(buf[2:6], []byte("ABCD"))
	binary.LittleEndian.PutUint16(buf[6:8], 600)
	binary.LittleEndian.PutUint16(buf[8:10], 1200)
	binary.LittleEndian.PutUint32(buf[10:14], 100)
	binary.LittleEndian.PutUint32(buf[14:18], 200)
	binary.LittleEndian.PutUint16(buf[18:20], 50)
	buf[20] = 2
	buf[21], buf[22], buf[23], buf[24] = 0, 10, 4, 1
	buf[25], buf[26], buf[27], buf[28], buf[29] = 0, 0, 0, 0, 0
	binary.LittleEndian.PutUint64(buf[31:39], math.Float64bits(123.5))
	binary.LittleEndian.PutUint32(buf[39:43], 424242)

	out, ok := ParseRetSesstnPayload(buf)
	if !ok || out.IndividualSession == nil {
		t.Fatal(ok, out)
	}
	s := out.IndividualSession
	if s.SessionIndex != 3 || s.SessionID != "ABCD" || s.StartTimeMinOfDay != 600 {
		t.Fatalf("%+v", s)
	}
	if s.ReferenceHeightM != 123.5 || s.AntennaSerial != 424242 {
		t.Fatalf("%+v", s)
	}
}

func TestParseRetSesstnSessionSummary(t *testing.T) {
	buf := make([]byte, 2+2*5)
	buf[0] = byte(IndSessionSummary)
	buf[1] = 2
	buf[2] = 10
	copy(buf[3:7], "SE01")
	buf[7] = 11
	copy(buf[8:12], "SE02")

	out, ok := ParseRetSesstnPayload(buf)
	if !ok || out.SessionSummary == nil || len(out.SessionSummary.Items) != 2 {
		t.Fatalf("%v %+v", ok, out.SessionSummary)
	}
	if out.SessionSummary.Items[0].Index != 10 || out.SessionSummary.Items[0].ID != "SE01" {
		t.Fatal(out.SessionSummary.Items[0])
	}
}
