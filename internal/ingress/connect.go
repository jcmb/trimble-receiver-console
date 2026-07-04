package ingress

import (
	"context"
	"log"
	"net"
	"sync"
	"time"

	appcfg "github.com/gkirk/trimble-receiver-console/internal/config"
	"github.com/gkirk/trimble-receiver-console/internal/session"
)

const (
	gsofDialTimeout   = 10 * time.Second
	gsofDialKeepAlive = 30 * time.Second
	gsofReconnectMin  = time.Second
	gsofReconnectMax  = 30 * time.Second
)

// RunGSOFOutbound dials target (host:port) for GSOF/DCOL until ctx is cancelled.
// Each successful dial runs a ConnSession; disconnects trigger reconnect with backoff.
func RunGSOFOutbound(ctx context.Context, gr *session.GroupRuntime, cfg *appcfg.Config, target string) {
	log.Printf("GSOF outbound group_id=%q name=%q target=%s", gr.ID, gr.Name, target)

	dialer := &net.Dialer{
		Timeout:   gsofDialTimeout,
		KeepAlive: gsofDialKeepAlive,
	}
	backoff := gsofReconnectMin

	var holder struct {
		mu   sync.Mutex
		conn net.Conn
	}
	go func() {
		<-ctx.Done()
		holder.mu.Lock()
		if holder.conn != nil {
			_ = holder.conn.Close()
		}
		holder.mu.Unlock()
	}()

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		conn, err := dialer.DialContext(ctx, "tcp", target)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("GSOF outbound dial failed group_id=%q target=%s: %v (retry in %s)", gr.ID, target, err, backoff)
			select {
			case <-time.After(backoff):
			case <-ctx.Done():
				return
			}
			backoff *= 2
			if backoff > gsofReconnectMax {
				backoff = gsofReconnectMax
			}
			continue
		}
		backoff = gsofReconnectMin

		if tc, ok := conn.(*net.TCPConn); ok {
			_ = tc.SetKeepAlive(true)
			_ = tc.SetKeepAlivePeriod(gsofDialKeepAlive)
		}

		holder.mu.Lock()
		holder.conn = conn
		holder.mu.Unlock()

		log.Printf("GSOF outbound connected group_id=%q target=%s remote=%s", gr.ID, target, conn.RemoteAddr())
		cs := session.NewOutboundConnSession(conn, gr, cfg, target)
		gr.Registry.Add(cs)
		cs.Run()
		gr.Registry.Remove(cs)

		holder.mu.Lock()
		holder.conn = nil
		holder.mu.Unlock()

		select {
		case <-ctx.Done():
			return
		case <-time.After(gsofReconnectMin):
		}
		log.Printf("GSOF outbound disconnected group_id=%q target=%s; reconnecting", gr.ID, target)
	}
}
