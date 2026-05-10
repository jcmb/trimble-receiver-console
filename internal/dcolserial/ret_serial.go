// Package dcolserial parses Trimble OEM DCOL report payloads (normal DCOL, not GSOF transport).
package dcolserial

import (
	"encoding/binary"
	"strconv"
	"strings"
)

// RetSerialInfo is DCOL response 07h RETSERIAL (payload bytes after LENGTH; see Trimble ICD).
type RetSerialInfo struct {
	ReceiverSerialShort string `json:"receiver_serial_short,omitempty"` // legacy 8-char field
	LongSerial          string `json:"long_serial,omitempty"`
	ReceiverType        string `json:"receiver_type,omitempty"`
	NavProcessorVersion string `json:"nav_processor_version,omitempty"`
	SigProcessorVersion string `json:"sig_processor_version,omitempty"`
	BootROMVersion      string `json:"boot_rom_version,omitempty"`
	AntennaSerial       string `json:"antenna_serial,omitempty"`
	AntennaType         string `json:"antenna_type,omitempty"`
	ChannelsTotal       int    `json:"channels_total,omitempty"`      // ICD: # CHANNELS (ASCII)
	ChannelsL1Only      int    `json:"channels_l1_only,omitempty"`    // # CHANNELS L1
	UsableChannels      int    `json:"usable_channels,omitempty"`     // binary uint16
	PhysicalChannels    int    `json:"physical_channels,omitempty"`   // binary uint16
	SimultaneousTrack   int    `json:"simultaneous_track,omitempty"`  // single byte
	AntennaINIVersion   string `json:"antenna_ini_version,omitempty"`
}

func trimASCII(b []byte) string {
	return strings.TrimSpace(string(b))
}

func asciiField(payload []byte, start, n int) string {
	if len(payload) < start+n {
		return ""
	}
	return trimASCII(payload[start : start+n])
}

func parseASCIIInt2(payload []byte, start int) int {
	if len(payload) < start+2 {
		return 0
	}
	v, _ := strconv.Atoi(trimASCII(payload[start : start+2]))
	return v
}

// ParseRetSerialPayload parses RETSERIAL data bytes (indices match ICD bytes 4–161, i.e. payload[0] = first data byte after LENGTH).
func ParseRetSerialPayload(payload []byte) (RetSerialInfo, bool) {
	if len(payload) < 8 {
		return RetSerialInfo{}, false
	}
	var info RetSerialInfo
	info.ReceiverSerialShort = asciiField(payload, 0, 8)
	info.ReceiverType = asciiField(payload, 8, 8)
	info.NavProcessorVersion = asciiField(payload, 16, 5)
	info.SigProcessorVersion = asciiField(payload, 21, 5)
	info.BootROMVersion = asciiField(payload, 26, 5)
	info.AntennaSerial = asciiField(payload, 31, 8)
	info.AntennaType = asciiField(payload, 39, 2)
	info.ChannelsTotal = parseASCIIInt2(payload, 41)
	info.ChannelsL1Only = parseASCIIInt2(payload, 43)
	if len(payload) >= 55 {
		info.LongSerial = asciiField(payload, 45, 10)
	}
	if len(payload) >= 153 {
		info.UsableChannels = int(binary.BigEndian.Uint16(payload[148:150]))
		info.PhysicalChannels = int(binary.BigEndian.Uint16(payload[150:152]))
		info.SimultaneousTrack = int(payload[152])
	}
	if len(payload) >= 158 {
		info.AntennaINIVersion = asciiField(payload, 153, 5)
	}
	return info, true
}
