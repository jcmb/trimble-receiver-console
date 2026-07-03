package api

import (
	"encoding/json"
	"math"
	"testing"
	"time"

	"github.com/gkirk/trimble-receiver-console/internal/session"
)

func TestReceiverSnapshotJSON_nanFails(t *testing.T) {
	snap := &session.ReceiverSnapshot{
		GroupID:         "default",
		Online:          true,
		GSOFReportCount: 149,
		LatRad:          math.NaN(),
		HasLLH:          true,
		LastUpdate:      time.Now(),
	}
	_, err := json.Marshal(map[string]interface{}{"receivers": []*session.ReceiverSnapshot{snap}})
	if err == nil {
		t.Fatal("expected marshal error for NaN lat_rad")
	}
	t.Logf("marshal error: %v", err)
}
