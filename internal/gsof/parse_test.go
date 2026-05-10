package gsof

import (
	"encoding/binary"
	"math"
	"testing"
)

func TestParseAllSVDetailType48(t *testing.T) {
	// Header: version, page (1 of 1), 1 SV; then same 10-byte row as type 34
	var b []byte
	b = append(b, 1, 0x11, 1) // version 1, page 1/1, n=1
	b = append(b, 5, 0, 0xC0, 0, 45)
	az := uint16(90)
	tmp := make([]byte, 2)
	binary.BigEndian.PutUint16(tmp, az)
	b = append(b, tmp...)
	b = append(b, 40*4)
	b = append(b, 0, 0)
	out, ok := ParseAllSVDetailType48(b)
	if !ok || len(out) != 1 {
		t.Fatalf("parse: ok=%v len=%d", ok, len(out))
	}
	if out[0].PRN != 5 || out[0].Elevation != 45 || out[0].Azimuth != 90 {
		t.Fatalf("%+v", out[0])
	}
}

func TestParseAllSVDetailType34(t *testing.T) {
	// One SV: PRN 5, GPS(0), flags, el=45, az=90 (BE), snr bytes
	var b []byte
	b = append(b, 1) // n svs
	b = append(b, 5, 0, 0xC0, 0, 45) // flags: used in pos + RTK
	az := uint16(90)
	tmp := make([]byte, 2)
	binary.BigEndian.PutUint16(tmp, az)
	b = append(b, tmp...)
	b = append(b, 40*4) // snr1 *4
	b = append(b, 0, 0) // snr2 snr3
	out, ok := ParseAllSVDetailType34(b)
	if !ok || len(out) != 1 {
		t.Fatalf("parse: ok=%v len=%d", ok, len(out))
	}
	if out[0].PRN != 5 || out[0].Elevation != 45 || out[0].Azimuth != 90 {
		t.Fatalf("%+v", out[0])
	}
}

func TestParseLBandType40(t *testing.T) {
	buf := []byte("ABCDE")
	buf = binary.BigEndian.AppendUint32(buf, math.Float32bits(1000))
	buf = binary.BigEndian.AppendUint16(buf, 500)
	buf = binary.BigEndian.AppendUint32(buf, math.Float32bits(44.5))
	if len(buf) != 15 {
		t.Fatalf("setup len %d", len(buf))
	}
	out, ok := ParseLBandType40(buf)
	if !ok || out == nil {
		t.Fatal("expected ok")
	}
	if out.SatelliteName != "ABCDE" || out.BitRateHz != 500 {
		t.Fatalf("%+v", out)
	}
	if out.NominalFrequencyMHz < 999.9 || out.NominalFrequencyMHz > 1000.1 {
		t.Fatalf("freq %v", out.NominalFrequencyMHz)
	}
	if out.SNRDbHz < 44.4 || out.SNRDbHz > 44.6 {
		t.Fatalf("snr %v", out.SNRDbHz)
	}

	buf = append(buf,
		1, // HP
		1, 1, // HP lib, VBS lib
		7, // Tracking
		1, // static
	)
	buf = binary.BigEndian.AppendUint32(buf, math.Float32bits(1.5))
	buf = binary.BigEndian.AppendUint32(buf, math.Float32bits(2.5))
	buf = append(buf, 0)
	buf = binary.BigEndian.AppendUint32(buf, math.Float32bits(0.9))
	buf = binary.BigEndian.AppendUint32(buf, math.Float32bits(1e-4))
	for _, v := range []uint32{100, 2, 5, 1000, 1, 3} {
		buf = binary.BigEndian.AppendUint32(buf, v)
	}
	buf = append(buf, 1)
	measHz := 1.23456789e9
	buf = binary.BigEndian.AppendUint64(buf, math.Float64bits(measHz))
	if len(buf) != 70 {
		t.Fatalf("full len %d want 70", len(buf))
	}
	full, ok := ParseLBandType40(buf)
	if !ok {
		t.Fatal("full parse")
	}
	if full.Engine != "HP" || full.BeamMode != "Tracking" || full.OmniSTARMotion != "static" {
		t.Fatalf("%+v", full)
	}
	if full.MeasuredFrequencyTrusted == nil || !*full.MeasuredFrequencyTrusted {
		t.Fatal("trusted flag")
	}
	if full.MeasuredSatelliteFrequencyHz < measHz-1 || full.MeasuredSatelliteFrequencyHz > measHz+1 {
		t.Fatalf("meas hz %v", full.MeasuredSatelliteFrequencyHz)
	}
}

func TestParseReceivedBaseType35(t *testing.T) {
	buf := []byte{0x08} // bit 3: valid
	buf = append(buf, []byte("MYBASE\x00\x00")...)
	buf = binary.BigEndian.AppendUint16(buf, 0x42)
	buf = binary.BigEndian.AppendUint64(buf, math.Float64bits(0.71))
	buf = binary.BigEndian.AppendUint64(buf, math.Float64bits(-1.234))
	buf = binary.BigEndian.AppendUint64(buf, math.Float64bits(56.78))
	out, ok := ParseReceivedBaseType35(buf)
	if !ok || out == nil {
		t.Fatal("parse 35")
	}
	if !out.InfoValid || out.BaseName != "MYBASE" || out.BaseID != 0x42 {
		t.Fatalf("%+v", out)
	}
}

func TestParseBasePositionQualityType41(t *testing.T) {
	var buf []byte
	buf = binary.BigEndian.AppendUint32(buf, 12345)
	buf = binary.BigEndian.AppendUint16(buf, 2300)
	buf = binary.BigEndian.AppendUint64(buf, math.Float64bits(0.5))
	buf = binary.BigEndian.AppendUint64(buf, math.Float64bits(1.0))
	buf = binary.BigEndian.AppendUint64(buf, math.Float64bits(10.0))
	buf = append(buf, 4)
	out, ok := ParseBasePositionQualityType41(buf)
	if !ok || out == nil {
		t.Fatal("parse 41")
	}
	if out.GPSMs != 12345 || out.GPSWeek != 2300 || out.Quality != 4 || out.QualityLabel == "" {
		t.Fatalf("%+v", out)
	}
}

func TestParseRadioType57(t *testing.T) {
	var buf []byte
	buf = binary.BigEndian.AppendUint16(buf, 2301)
	buf = binary.BigEndian.AppendUint32(buf, 5000)
	buf = append(buf, 1)
	// one radio segment: len 9
	seg := []byte{9, 0x02, 7}
	sig := int16(-85)
	noise := int16(-90)
	seg = binary.BigEndian.AppendUint16(seg, uint16(sig))
	seg = append(seg, 4)
	seg = binary.BigEndian.AppendUint16(seg, uint16(noise))
	seg = append(seg, 2)
	buf = append(buf, seg...)
	out, ok := ParseRadioType57(buf)
	if !ok || out == nil || len(out.Radios) != 1 {
		t.Fatalf("ok=%v %+v", ok, out)
	}
	if out.GPSWeek != 2301 || out.GPSMs != 5000 {
		t.Fatalf("time %+v", out)
	}
	r0 := out.Radios[0]
	if r0.Band != "900 MHz" || r0.Channel != 7 || r0.SignalDbm == nil || *r0.SignalDbm != -85 {
		t.Fatalf("%+v", r0)
	}
}

func TestParseLLHType2(t *testing.T) {
	buf := make([]byte, 24)
	binary.BigEndian.PutUint64(buf[0:8], math.Float64bits(0.71))
	binary.BigEndian.PutUint64(buf[8:16], math.Float64bits(-1.234))
	binary.BigEndian.PutUint64(buf[16:24], math.Float64bits(100.5))
	lat, lon, h, ok := ParseLLHType2(buf)
	if !ok || lat != 0.71 || lon != -1.234 || h != 100.5 {
		t.Fatalf("%v %v %v ok=%v", lat, lon, h, ok)
	}
}

func TestParsePositionType38_partialVsFull(t *testing.T) {
	// 11-byte prefix (through NetworkFlags): no PositionFixType field.
	var p []byte
	tmp := make([]byte, 4)
	binary.BigEndian.PutUint32(tmp, math.Float32bits(1.5))
	p = append(p, tmp...)
	p = append(p, 0x10, 0x20)
	binary.BigEndian.PutUint32(tmp, math.Float32bits(3.25))
	p = append(p, tmp...)
	p = append(p, 0x30)
	if len(p) != 11 {
		t.Fatalf("len %d", len(p))
	}
	_, _, _, hasPT, ok := ParsePositionType38(p)
	if !ok || hasPT {
		t.Fatalf("partial should not report position type: hasPT=%v", hasPT)
	}

	full := append([]byte(nil), p...)
	full = append(full, 0x31, 0x40)
	binary.BigEndian.PutUint16(tmp[:2], 0x0506)
	full = append(full, tmp[:2]...)
	full = append(full, 0x07)
	binary.BigEndian.PutUint32(tmp, 0x08090a0b)
	full = append(full, tmp...)
	full = append(full, 0x0c)
	binary.BigEndian.PutUint32(tmp, math.Float32bits(9))
	full = append(full, tmp...)
	full = append(full, 0x0d)
	if len(full) != 26 {
		t.Fatalf("full len %d", len(full))
	}
	pt, _, _, hasPT2, ok2 := ParsePositionType38(full)
	if !ok2 || !hasPT2 || pt != 0x0d {
		t.Fatalf("pt=%d hasPT=%v ok=%v", pt, hasPT2, ok2)
	}
}

func TestParseTangentPlaneENUType7(t *testing.T) {
	buf := make([]byte, 24)
	binary.BigEndian.PutUint64(buf[0:8], math.Float64bits(1.25))
	binary.BigEndian.PutUint64(buf[8:16], math.Float64bits(-3.5))
	binary.BigEndian.PutUint64(buf[16:24], math.Float64bits(0.75))
	out, ok := ParseTangentPlaneENUType7(buf)
	if !ok || out == nil {
		t.Fatal(ok)
	}
	if out.DeltaEastM != 1.25 || out.DeltaNorthM != -3.5 || out.DeltaUpM != 0.75 {
		t.Fatalf("%+v", out)
	}
}

func TestParseReceiverDiagnosticsType28(t *testing.T) {
	buf := make([]byte, 18)
	buf[5] = 0x80
	buf[6] = 128
	buf[9] = 7
	buf[10] = 6
	buf[11] = 15
	buf[13] = 4
	buf[16] = 9
	out, ok := ParseReceiverDiagnosticsType28(buf)
	if !ok || out == nil {
		t.Fatal(ok)
	}
	if !out.ReferenceStationInfoReceived {
		t.Fatal("ref station flag")
	}
	wantPct := float64(128) * 100.0 / 256.0
	if math.Abs(out.LinkIntegrityPct-wantPct) > 1e-9 {
		t.Fatalf("pct got %v want %v", out.LinkIntegrityPct, wantPct)
	}
	if out.CommonL1SVs != 7 || out.CommonL2SVs != 6 || out.DiffSVsInUse != 4 {
		t.Fatalf("%+v", out)
	}
	if out.DatalinkLatencySec != 1.5 {
		t.Fatalf("latency %v", out.DatalinkLatencySec)
	}
	if math.Abs(out.RTKPositionAge-0.9) > 1e-9 {
		t.Fatalf("rtk age sec got %v want 0.9", out.RTKPositionAge)
	}
}
