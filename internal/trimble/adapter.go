package trimble

import (
	"github.com/gkirk/dcol"
)

// NewDCOLParser returns a dcol parser with public handlers registered.
func NewDCOLParser() *dcol.Parser {
	reg := dcol.NewRegistry()
	dcol.RegisterPublic(reg)
	return dcol.NewParser(reg)
}

// ProcessStreamChunk is a thin alias for Parser.Process with TransportIsUDP=false.
func ProcessStreamChunk(p *dcol.Parser, data []byte, remote string, ignoreGap1 bool, emit func(dcol.Message)) {
	env := dcol.Env{
		Verbose:                       0,
		RemoteAddr:                    remote,
		TransportIsUDP:                false,
		IgnoreTCPGSOFTransmissionGap1: ignoreGap1,
	}
	p.Process(data, env, emit)
}
