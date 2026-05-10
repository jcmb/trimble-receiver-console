package ingress

import (
	"log"
	"net"
	"time"

	appcfg "github.com/gkirk/trimble-receiver-console/internal/config"
	"github.com/gkirk/trimble-receiver-console/internal/session"
)

// ServeTCP accepts inbound receiver connections for one group until ln closes.
func ServeTCP(gr *session.GroupRuntime, cfg *appcfg.Config) error {
	ln, err := net.Listen("tcp", gr.TCPListen)
	if err != nil {
		return err
	}
	defer ln.Close()
	log.Printf("TCP group %q (%s) listening on %s", gr.Name, gr.ID, gr.TCPListen)
	for {
		c, err := ln.Accept()
		if err != nil {
			if ne, ok := err.(net.Error); ok && ne.Temporary() {
				log.Printf("accept temporary: %v", err)
				time.Sleep(100 * time.Millisecond)
				continue
			}
			log.Printf("accept: %v", err)
			return err
		}
		log.Printf("TCP connect group_id=%q name=%q listen=%s remote=%s", gr.ID, gr.Name, gr.TCPListen, c.RemoteAddr())
		cs := session.NewConnSession(c, gr, cfg)
		gr.Registry.Add(cs)
		go func() {
			defer gr.Registry.Remove(cs)
			cs.Run()
		}()
	}
}
