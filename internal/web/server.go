package web

import (
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"time"
)

//go:embed static/*
var staticFS embed.FS

type Server struct {
	Host string
	Port int
	srv  *http.Server
}

func NewServer(host string, port int) *Server {
	if host == "" {
		host = "127.0.0.1"
	}
	if port <= 0 {
		port = 7070
	}
	return &Server{
		Host: host,
		Port: port,
	}
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()

	// REST API routes
	mux.HandleFunc("/api/system", s.handleSystem)
	mux.HandleFunc("/api/processes", s.handleProcesses)
	mux.HandleFunc("/api/ports", s.handlePorts)
	mux.HandleFunc("/api/containers", s.handleContainers)
	mux.HandleFunc("/api/locks", s.handleLocks)
	mux.HandleFunc("/api/analyze", s.handleAnalyze)
	mux.HandleFunc("/api/action", s.handleAction)

	// Static assets from embedded FS
	sub, err := fs.Sub(staticFS, "static")
	if err != nil {
		mux.Handle("/", http.FileServer(http.Dir("internal/web/static")))
	} else {
		fileServer := http.FileServer(http.FS(sub))
		mux.Handle("/", fileServer)
	}

	return corsMiddleware(mux)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) Start(openBrowser bool) error {
	addr := fmt.Sprintf("%s:%d", s.Host, s.Port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to bind to %s: %w", addr, err)
	}

	url := fmt.Sprintf("http://%s", addr)
	fmt.Printf("\n✨ witr Web UI is running at: %s\n", url)
	fmt.Printf("   Press Ctrl+C to stop the server\n\n")

	if openBrowser {
		go func() {
			time.Sleep(200 * time.Millisecond)
			_ = openURL(url)
		}()
	}

	s.srv = &http.Server{
		Handler:      s.routes(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	return s.srv.Serve(listener)
}

func openURL(url string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", url).Start()
	case "windows":
		return exec.Command("cmd", "/c", "start", url).Start()
	default: // linux, freebsd
		return exec.Command("xdg-open", url).Start()
	}
}
