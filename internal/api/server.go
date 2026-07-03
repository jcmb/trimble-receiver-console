package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	appcfg "github.com/gkirk/trimble-receiver-console/internal/config"
	"github.com/gkirk/trimble-receiver-console/internal/session"
	trimblecfg "github.com/gkirk/trimble-receiver-console/internal/trimble/configencode"
	"github.com/gkirk/trimble-receiver-console/internal/version"

	"nhooyr.io/websocket"
)

func consoleVersionPayload() string {
	return version.ConsoleBannerLine()
}

// Server is the HTTP API and static file server.
type Server struct {
	cfg    *appcfg.Config
	hub    *session.Hub
	dist   http.Handler
	origin []string
}

func New(cfg *appcfg.Config, hub *session.Hub, dist http.Handler) *Server {
	return &Server{cfg: cfg, hub: hub, dist: dist, origin: cfg.CORSOrigins}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/groups", s.cors(s.handleGroupsRoot))
	mux.HandleFunc("/api/groups/", s.cors(s.handleGroupsPath))
	mux.HandleFunc("/api/config", s.cors(s.handlePublicConfig))
	mux.HandleFunc("/api/stream", s.cors(s.handleStream))
	mux.Handle("/", s.dist)
	return mux
}

func (s *Server) cors(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		allow := ""
		if len(s.origin) == 1 && s.origin[0] == "*" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else if len(s.origin) > 0 {
			o := r.Header.Get("Origin")
			for _, x := range s.origin {
				if x == o {
					allow = o
					break
				}
			}
			if allow != "" {
				w.Header().Set("Access-Control-Allow-Origin", allow)
				w.Header().Set("Vary", "Origin")
			}
		}
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

type groupDTO struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	TCPListen   string   `json:"tcp_listen,omitempty"`
	GSOFConnect []string `json:"gsof_connect,omitempty"`
	People      []string `json:"people"`
}

func groupToDTO(g *session.GroupRuntime) groupDTO {
	return groupDTO{
		ID:          g.ID,
		Name:        g.Name,
		TCPListen:   g.TCPListen,
		GSOFConnect: append([]string(nil), g.GSOFConnect...),
		People:      append([]string(nil), g.People...),
	}
}

func (s *Server) handlePublicConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method", http.StatusMethodNotAllowed)
		return
	}
	groups := s.hub.OrderedGroups()
	pub := make([]groupDTO, 0, len(groups))
	for _, g := range groups {
		pub = append(pub, groupToDTO(g))
	}
	w.Header().Set("Content-Type", "application/json")
	payload := map[string]interface{}{
		"map_tile_url":     s.cfg.MapTileURL,
		"groups":           pub,
		"console_version":  consoleVersionPayload(),
	}
	if s.cfg.SuggestedGroupID != "" {
		payload["suggested_group_id"] = s.cfg.SuggestedGroupID
	}
	_ = json.NewEncoder(w).Encode(payload)
}

func (s *Server) handleGroupsRoot(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method", http.StatusMethodNotAllowed)
		return
	}
	groups := s.hub.OrderedGroups()
	pub := make([]groupDTO, 0, len(groups))
	for _, g := range groups {
		pub = append(pub, groupToDTO(g))
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"groups": pub})
}

// handleGroupsPath: /api/groups/{gid}/receivers[/{rid}[/config]]
func (s *Server) handleGroupsPath(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/groups/")
	parts := strings.Split(path, "/")
	if len(parts) < 1 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	gid := parts[0]
	gr := s.hub.Get(gid)
	if gr == nil {
		http.Error(w, "unknown group", http.StatusNotFound)
		return
	}
	if len(parts) >= 2 && parts[1] == "receivers" {
		if len(parts) == 2 && r.Method == http.MethodGet {
			list := session.SanitizeSnapshotsForJSON(gr.AttachSerialConnCounts(gr.Store.ListUniqueBySerial()))
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"receivers":       list,
				"console_version": consoleVersionPayload(),
			})
			return
		}
		if len(parts) == 3 && r.Method == http.MethodGet {
			rid := parts[2]
			snap, ok := gr.Store.FindSnapshot(rid)
			if !ok {
				cs := gr.Registry.Find(rid)
				if cs != nil {
					snap, ok = gr.Store.Get(cs.StoreKey())
				}
			}
			if !ok {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			cp := *snap
			k := session.ReceiverIdentityKey(&cp)
			if strings.HasPrefix(k, "sn:") {
				cp.SerialConnectionCount = gr.SerialConnectionCount(k)
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(session.SanitizeSnapshotForJSON(&cp))
			return
		}
		if len(parts) == 4 && parts[3] == "config" && r.Method == http.MethodPost {
			rid := parts[2]
			s.handleGroupConfig(w, r, gr, rid)
			return
		}
	}
	http.NotFound(w, r)
}

func (s *Server) handleGroupConfig(w http.ResponseWriter, r *http.Request, gr *session.GroupRuntime, rid string) {
	cs := gr.Registry.Find(rid)
	if cs == nil {
		http.Error(w, "receiver not connected", http.StatusNotFound)
		return
	}
	var body trimblecfg.ReceiverConfigJSON
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := cs.ApplyConfig(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleStream(w http.ResponseWriter, r *http.Request) {
	gid := r.URL.Query().Get("group")
	if gid == "" {
		http.Error(w, "query parameter group is required", http.StatusBadRequest)
		return
	}
	gr := s.hub.Get(gid)
	if gr == nil {
		http.Error(w, "unknown group", http.StatusNotFound)
		return
	}
	opts := &websocket.AcceptOptions{}
	if len(s.origin) == 1 && s.origin[0] == "*" {
		opts.InsecureSkipVerify = true
	} else if len(s.origin) > 0 {
		opts.OriginPatterns = s.origin
	}
	c, err := websocket.Accept(w, r, opts)
	if err != nil {
		log.Printf("websocket accept: %v", err)
		return
	}
	defer c.Close(websocket.StatusNormalClosure, "")
	ctx := c.CloseRead(r.Context())
	tick := time.NewTicker(250 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			list := session.SanitizeSnapshotsForJSON(gr.AttachSerialConnCounts(gr.Store.ListUniqueBySerial()))
			b, err := json.Marshal(map[string]interface{}{
				"receivers":       list,
				"console_version": consoleVersionPayload(),
			})
			if err != nil {
				log.Printf("websocket json encode group=%q: %v", gid, err)
				continue
			}
			writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err = c.Write(writeCtx, websocket.MessageText, b)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

// LogMiddleware logs requests.
func LogMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r)
		if os.Getenv("TRIMBLE_HTTP_DEBUG") != "" {
			log.Printf("%s %s", r.Method, r.URL.Path)
		}
	})
}
