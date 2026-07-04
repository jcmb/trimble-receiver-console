package session

import (
	"encoding/json"
	"math"
	"testing"
	"time"
)

func TestSanitizeSnapshotForJSON_nanVelocity(t *testing.T) {
	snap := &ReceiverSnapshot{
		GroupID:           "default",
		ConnectionKey:     "out:172.27.0.14:6000",
		Online:            true,
		GSOFReportCount:   149,
		HasLLH:            true,
		LatRad:            0.5,
		LonRad:            -1.2,
		HasVelocity:       true,
		HorizontalVelMS:   math.NaN(),
		HeadingRad:        math.Inf(1),
		LastUpdate:        time.Now(),
	}
	_, err := json.Marshal([]*ReceiverSnapshot{snap})
	if err == nil {
		t.Fatal("expected NaN marshal failure")
	}
	safe := SanitizeSnapshotForJSON(snap)
	_, err = json.Marshal([]*ReceiverSnapshot{safe})
	if err != nil {
		t.Fatalf("sanitize: %v", err)
	}
}
