package session

import (
	"github.com/gkirk/trimble-receiver-console/internal/gsof"
	"math"
)

// finiteFloat replaces NaN and ±Inf with 0 for JSON encoding (encoding/json rejects non-finite floats).
func finiteFloat(f float64) float64 {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return 0
	}
	return f
}

func finiteFloatPtr(p *float64) *float64 {
	if p == nil {
		return nil
	}
	v := finiteFloat(*p)
	return &v
}

// SanitizeSnapshotsForJSON copies receiver snapshots for API/WebSocket encoding.
func SanitizeSnapshotsForJSON(in []*ReceiverSnapshot) []*ReceiverSnapshot {
	if len(in) == 0 {
		return in
	}
	out := make([]*ReceiverSnapshot, len(in))
	for i, s := range in {
		out[i] = SanitizeSnapshotForJSON(s)
	}
	return out
}

// SanitizeSnapshotForJSON returns a shallow copy safe for encoding/json (no NaN or Inf in floats).
func SanitizeSnapshotForJSON(s *ReceiverSnapshot) *ReceiverSnapshot {
	if s == nil {
		return nil
	}
	cp := *s
	cp.LatRad = finiteFloat(cp.LatRad)
	cp.LonRad = finiteFloat(cp.LonRad)
	cp.HeightM = finiteFloat(cp.HeightM)
	cp.BatteryPercent = finiteFloat(cp.BatteryPercent)
	cp.LoggingHoursRemain = finiteFloat(cp.LoggingHoursRemain)
	cp.PositionRMS = finiteFloat(cp.PositionRMS)
	cp.SigmaEast = finiteFloat(cp.SigmaEast)
	cp.SigmaNorth = finiteFloat(cp.SigmaNorth)
	cp.SigmaUp = finiteFloat(cp.SigmaUp)
	cp.SemiMajor = finiteFloat(cp.SemiMajor)
	cp.SemiMinor = finiteFloat(cp.SemiMinor)
	cp.PDOP = finiteFloat(cp.PDOP)
	cp.HDOP = finiteFloat(cp.HDOP)
	cp.VDOP = finiteFloat(cp.VDOP)
	cp.TDOP = finiteFloat(cp.TDOP)
	cp.HorizontalVelMS = finiteFloat(cp.HorizontalVelMS)
	cp.VerticalVelMS = finiteFloat(cp.VerticalVelMS)
	cp.HeadingRad = finiteFloat(cp.HeadingRad)
	cp.DeltaXM = finiteFloat(cp.DeltaXM)
	cp.DeltaYM = finiteFloat(cp.DeltaYM)
	cp.DeltaZM = finiteFloat(cp.DeltaZM)

	if cp.Vector != nil {
		v := *cp.Vector
		if v.TangentPlane != nil {
			tp := *v.TangentPlane
			tp.DeltaEastM = finiteFloat(tp.DeltaEastM)
			tp.DeltaNorthM = finiteFloat(tp.DeltaNorthM)
			tp.DeltaUpM = finiteFloat(tp.DeltaUpM)
			v.TangentPlane = &tp
		}
		if v.Diagnostics != nil {
			d := *v.Diagnostics
			d.LinkIntegrityPct = finiteFloat(d.LinkIntegrityPct)
			d.DatalinkLatencySec = finiteFloat(d.DatalinkLatencySec)
			d.RTKPositionAge = finiteFloat(d.RTKPositionAge)
			v.Diagnostics = &d
		}
		cp.Vector = &v
	}
	if cp.LBandStatus != nil {
		lb := *cp.LBandStatus
		lb.NominalFrequencyMHz = finiteFloat(lb.NominalFrequencyMHz)
		lb.SNRDbHz = finiteFloat(lb.SNRDbHz)
		lb.SigmaHorizontalThresholdM = finiteFloat(lb.SigmaHorizontalThresholdM)
		lb.SigmaVerticalThresholdM = finiteFloat(lb.SigmaVerticalThresholdM)
		lb.IQRatio = finiteFloat(lb.IQRatio)
		lb.EstimatedBitErrorRate = finiteFloat(lb.EstimatedBitErrorRate)
		lb.MeasuredSatelliteFrequencyHz = finiteFloat(lb.MeasuredSatelliteFrequencyHz)
		cp.LBandStatus = &lb
	}
	if cp.ReceivedBase != nil {
		rb := *cp.ReceivedBase
		rb.LatRad = finiteFloat(rb.LatRad)
		rb.LonRad = finiteFloat(rb.LonRad)
		rb.HeightM = finiteFloat(rb.HeightM)
		cp.ReceivedBase = &rb
	}
	if cp.BasePositionQuality != nil {
		bq := *cp.BasePositionQuality
		bq.LatRad = finiteFloat(bq.LatRad)
		bq.LonRad = finiteFloat(bq.LonRad)
		bq.HeightM = finiteFloat(bq.HeightM)
		cp.BasePositionQuality = &bq
	}
	if cp.RadioInfo != nil {
		ri := *cp.RadioInfo
		if len(ri.Radios) > 0 {
			radios := make([]gsof.RadioBandEntry, len(ri.Radios))
			copy(radios, ri.Radios)
			for i := range radios {
				radios[i].SignalDbm = finiteFloatPtr(radios[i].SignalDbm)
				radios[i].NoiseDbm = finiteFloatPtr(radios[i].NoiseDbm)
			}
			ri.Radios = radios
		}
		cp.RadioInfo = &ri
	}
	if len(cp.SVs) > 0 {
		svs := make([]SVInfo, len(cp.SVs))
		copy(svs, cp.SVs)
		for i := range svs {
			svs[i].Elevation = finiteFloat(svs[i].Elevation)
			svs[i].Azimuth = finiteFloat(svs[i].Azimuth)
			svs[i].CN0 = finiteFloat(svs[i].CN0)
			svs[i].CN0L2 = finiteFloatPtr(svs[i].CN0L2)
			svs[i].CN0L56 = finiteFloatPtr(svs[i].CN0L56)
		}
		cp.SVs = svs
	}
	return &cp
}
