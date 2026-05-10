package main

import (
	"context"
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"

	"github.com/gkirk/trimble-receiver-console/internal/api"
	appcfg "github.com/gkirk/trimble-receiver-console/internal/config"
	"github.com/gkirk/trimble-receiver-console/internal/httpstatic"
	"github.com/gkirk/trimble-receiver-console/internal/ingress"
	"github.com/gkirk/trimble-receiver-console/internal/session"
	"github.com/gkirk/trimble-receiver-console/internal/version"
)

//go:embed all:dist
var dist embed.FS

func main() {
	log.Printf("trimble-receiver-console version %s", version.Version)

	cfgPath := os.Getenv("TRIMBLE_CONFIG")
	if cfgPath == "" {
		cfgPath = "config.yaml"
	}
	cfg, err := appcfg.Load(cfgPath)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("config %s: %v — using defaults", cfgPath, err)
		}
		cfg = appcfg.Default()
		cfg.NormalizeGroups()
		_ = cfg.ValidateGroups()
	}

	hub := session.NewHub(cfg)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go hub.StartRetentionGC(ctx)

	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		log.Fatalf("embed dist: %v", err)
	}
	static := httpstatic.SPADist(sub)

	srv := api.New(cfg, hub, static)

	for _, g := range hub.OrderedGroups() {
		g := g
		go func() {
			if err := ingress.ServeTCP(g, cfg); err != nil {
				log.Fatalf("tcp group %q: %v", g.ID, err)
			}
		}()
	}

	h := api.LogMiddleware(srv.Handler())
	log.Printf("HTTP UI on http://%s", cfg.HTTPListen)
	for _, g := range hub.OrderedGroups() {
		log.Printf("Group %q (%s) TCP %s", g.Name, g.ID, g.TCPListen)
	}
	if err := http.ListenAndServe(cfg.HTTPListen, h); err != nil {
		log.Fatal(err)
	}
}
