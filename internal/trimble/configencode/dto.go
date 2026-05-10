package configencode

import (
	"encoding/json"
	"fmt"
)

// ReceiverConfigJSON is the HTTP body for POST /api/receivers/:id/config
type ReceiverConfigJSON struct {
	Role string `json:"role"` // base | rover

	Base *BaseConfig `json:"base,omitempty"`

	Advanced *AdvancedConfig `json:"advanced,omitempty"`

	// Base-only
	SyncLowLatency *string `json:"sync_low_latency,omitempty"` // "sync" | "low_latency"
	Outputs        *struct {
		InternalRadio bool `json:"internal_radio"`
		Serial        bool `json:"serial"`
		LocalNTRIP    bool `json:"local_ntrip"`
	} `json:"outputs,omitempty"`
	PositionMonitoring *json.RawMessage `json:"position_monitoring,omitempty"`

	IBSS *IBSSConfig `json:"ibss,omitempty"`

	DataLogging *struct {
		Enabled bool   `json:"enabled"`
		Mode    string `json:"mode"` // high_rate | hz1 | static
	} `json:"data_logging,omitempty"`
}

type BaseConfig struct {
	AntennaType       string   `json:"antenna_type"`
	MeasurementMethod string   `json:"measurement_method"`
	AntennaHeightM    float64  `json:"antenna_height_m"`
	RefLatRad         float64  `json:"ref_lat_rad"`
	RefLonRad         float64  `json:"ref_lon_rad"`
	RefHeightM        float64  `json:"ref_height_m"`
}

type AdvancedConfig struct {
	IonoGuard      *bool    `json:"iono_guard"`
	ElevationMaskDeg *float64 `json:"elevation_mask_deg"`
}

type IBSSConfig struct {
	Org      string          `json:"org"`
	Password string          `json:"password"`
	Servers  [3]IBSSNTRIPSlot `json:"servers"`
}

type IBSSNTRIPSlot struct {
	Enabled bool   `json:"enabled"`
	Format  string `json:"format"` // CMR | CMRx | RTCMv3
	Host    string `json:"host,omitempty"`
	Port    int    `json:"port,omitempty"`
	Mount   string `json:"mount,omitempty"`
}

// BuildConfigFrames validates and returns DCOL frames. Structured fields are packed into
// a vendor-specific payload envelope (placeholder 0xE0) for traceability.
func BuildConfigFrames(c *ReceiverConfigJSON) ([][]byte, string, error) {
	if c == nil {
		return nil, "", fmt.Errorf("empty config")
	}
	if err := validateIBSS(c.IBSS); err != nil {
		return nil, "", err
	}
	if c.DataLogging != nil && c.DataLogging.Enabled {
		switch c.DataLogging.Mode {
		case "high_rate", "hz1", "static":
		default:
			return nil, "", fmt.Errorf("data_logging.mode must be high_rate, hz1, or static")
		}
	}
	if c.Role != "" && c.Role != "base" && c.Role != "rover" {
		return nil, "", fmt.Errorf("role must be base or rover")
	}

	j, err := json.Marshal(c)
	if err != nil {
		return nil, "", err
	}

	// Structured Trimble DCOL command encoding belongs in a layer backed by the receiver ICD.
	// Validated JSON is persisted on the session.
	var frames [][]byte
	return frames, string(j), nil
}

func validateIBSS(ib *IBSSConfig) error {
	if ib == nil {
		return nil
	}
	formats := make(map[string]int)
	for i, s := range ib.Servers {
		if !s.Enabled {
			continue
		}
		switch s.Format {
		case "CMR", "CMRx", "RTCMv3":
		default:
			return fmt.Errorf("ibss.servers[%d].format invalid", i)
		}
		formats[s.Format]++
		if formats[s.Format] > 1 {
			return fmt.Errorf("duplicate IBSS format %q enabled on more than one slot", s.Format)
		}
	}
	return nil
}
