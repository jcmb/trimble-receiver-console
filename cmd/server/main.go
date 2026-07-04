package main

import (
	"context"
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gkirk/trimble-receiver-console/internal/api"
	appcfg "github.com/gkirk/trimble-receiver-console/internal/config"
	"github.com/gkirk/trimble-receiver-console/internal/httppath"
	"github.com/gkirk/trimble-receiver-console/internal/httpstatic"
	"github.com/gkirk/trimble-receiver-console/internal/ingress"
	"github.com/gkirk/trimble-receiver-console/internal/session"
	"github.com/gkirk/trimble-receiver-console/internal/version"
)

//go:embed all:dist
var dist embed.FS

// hostPortList is a repeatable flag value (-gsof-connect host:port).
type hostPortList []string

func (h *hostPortList) String() string {
	return strings.Join(*h, ", ")
}

func (h *hostPortList) Set(v string) error {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil
	}
	for _, part := range strings.Split(v, ",") {
		part = strings.TrimSpace(part)
		if part != "" {
			*h = append(*h, part)
		}
	}
	return nil
}

func init() {
	flag.Usage = printCLIUsage
}

func printCLIUsage() {
	const prog = "trimble-console"
	fmt.Fprintf(os.Stderr, "Usage: %s [options]\n\n", prog)
	fmt.Fprintf(os.Stderr, "%s\n\n", version.ConsoleBannerLine())
	fmt.Fprintf(os.Stderr, `Trimble receiver console: inbound and/or outbound GSOF/DCOL over TCP, plus a web UI.

Most settings (HTTP bind/port, groups, map tiles, default_mode) come from config.yaml.
Set TRIMBLE_CONFIG to use a different config file path (default: ./config.yaml).

Command-line options
`)
	flag.PrintDefaults()
	fmt.Fprintf(os.Stderr, `
Environment
  TRIMBLE_CONFIG    Path to YAML config (default: config.yaml in the working directory)

Examples
  # Defaults: HTTP UI on 0.0.0.0:7002, inbound TCP 0.0.0.0:9000
  %s

  # Dial outbound GSOF streams (no inbound listen on the target group)
  %s -no-inbound-tcp -gsof-connect 192.168.10.5:2101 -gsof-connect 192.168.10.6:5018

  # Add outbound dials while keeping inbound listen from config
  %s -gsof-connect 10.0.0.20:2101

  # Outbound targets for a named group (when config defines multiple groups)
  %s -gsof-connect-group field -gsof-connect 10.0.0.20:2101

  # Debug GSOF decode (type 0x02 LLH, packet hex on stderr)
  %s -verbose-gsof

  # Periodic GSOF sub-record type summary (every 15s per stream)
  %s -summary-gsof

See README.md and /help in the web UI for GSOF record requirements and map_tile_url.
`, prog, prog, prog, prog, prog, prog)
}

func main() {
	var cliGSOFConnect hostPortList
	help := flag.Bool("help", false, "print command-line help and exit")
	verboseGSOF := flag.Bool("verbose-gsof", false, "log GSOF per-report record histogram and type 0x02 (LLH) decode details")
	summaryGSOF := flag.Bool("summary-gsof", false, "log periodic GSOF sub-record type summaries (every 15s per stream)")
	gsofConnectGroup := flag.String("gsof-connect-group", "", "group id for -gsof-connect (default: first group)")
	noInboundTCP := flag.Bool("no-inbound-tcp", false, "with -gsof-connect: do not listen for inbound receiver TCP on that group")
	rootPath := flag.String("root-path", "", "public URL path prefix when served under a subpath (e.g. /trimble-console); overridden per request by X-Forwarded-Prefix")
	flag.Var(&cliGSOFConnect, "gsof-connect", "outbound GSOF TCP dial target host:port (repeatable)")
	flag.Parse()

	if *help {
		printCLIUsage()
		os.Exit(0)
	}

	log.Printf("%s", version.ConsoleBannerLine())

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
		if err := cfg.ValidateGroups(); err != nil {
			log.Fatalf("config: %v", err)
		}
		if err := cfg.ValidateHTTPListen(); err != nil {
			log.Fatalf("config: %v", err)
		}
	}
	if len(cliGSOFConnect) > 0 {
		if err := cfg.ApplyCLIGSOFConnect(*gsofConnectGroup, cliGSOFConnect, *noInboundTCP); err != nil {
			log.Fatalf("gsof-connect: %v", err)
		}
		if err := cfg.ValidateGroups(); err != nil {
			log.Fatalf("config after -gsof-connect: %v", err)
		}
		groupID := cfg.Groups[0].ID
		if strings.TrimSpace(*gsofConnectGroup) != "" {
			groupID = *gsofConnectGroup
		}
		cfg.SuggestedGroupID = groupID
		log.Printf("CLI GSOF outbound group_id=%q targets: %s (select this group in the web UI)", groupID, strings.Join(cliGSOFConnect, ", "))
		if strings.TrimSpace(*gsofConnectGroup) == "" && len(cfg.Groups) > 1 {
			log.Printf("note: -gsof-connect applies to the first group %q; use -gsof-connect-group <id> for another group", cfg.Groups[0].ID)
		}
	}
	if cfg.SuggestedGroupID == "" {
		var outboundGroups []string
		for _, g := range cfg.Groups {
			if len(g.GSOFConnect) > 0 {
				outboundGroups = append(outboundGroups, g.ID)
			}
		}
		if len(outboundGroups) == 1 {
			cfg.SuggestedGroupID = outboundGroups[0]
		}
	}
	if *verboseGSOF {
		cfg.VerboseGSOF = true
		log.Printf("verbose GSOF logging enabled (-verbose-gsof)")
	}
	if *summaryGSOF {
		cfg.SummaryGSOF = true
		log.Printf("GSOF subtype summary enabled (-summary-gsof, interval %s)", session.GSOFSummaryInterval)
	}
	if strings.TrimSpace(*rootPath) != "" {
		cfg.RootPath = httppath.Normalize(*rootPath)
	}
	if cfg.RootPath != "" {
		log.Printf("HTTP UI root path %q (-root-path or config root_path; X-Forwarded-Prefix overrides per request)", cfg.RootPath)
	}

	hub := session.NewHub(cfg)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go hub.StartRetentionGC(ctx)
	go hub.StartGSOFSummary(ctx)

	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		log.Fatalf("embed dist: %v", err)
	}
	rp := httppath.RootPath{Default: cfg.RootPath}
	static := httpstatic.SPADist(sub, rp.FromRequest)
	srv := api.New(cfg, hub, static)

	for _, g := range hub.OrderedGroups() {
		if g.TCPListen != "" {
			g := g
			go func() {
				if err := ingress.ServeTCP(g, cfg); err != nil {
					log.Fatalf("tcp listen group %q: %v", g.ID, err)
				}
			}()
		}
		for _, target := range g.GSOFConnect {
			g, target := g, target
			go ingress.RunGSOFOutbound(ctx, g, cfg, target)
		}
	}

	h := api.LogMiddleware(srv.Handler())
	httpAddr := cfg.ListenHTTP()
	log.Printf("HTTP UI on http://%s", httpAddr)
	for _, g := range hub.OrderedGroups() {
		if g.TCPListen != "" {
			log.Printf("Group %q (%s) TCP listen %s", g.Name, g.ID, g.TCPListen)
		}
		for _, t := range g.GSOFConnect {
			log.Printf("Group %q (%s) GSOF outbound %s", g.Name, g.ID, t)
		}
	}
	if err := http.ListenAndServe(httpAddr, h); err != nil {
		log.Fatal(err)
	}
}
