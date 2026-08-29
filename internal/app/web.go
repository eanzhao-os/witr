//go:build linux || darwin || freebsd || windows

package app

import (
	"github.com/pranshuparmar/witr/internal/web"
	"github.com/spf13/cobra"
)

var (
	webHost string
	webPort int
	webOpen bool
)

var webCmd = &cobra.Command{
	Use:   "web",
	Short: "Launch the witr Web UI dashboard",
	Long:  "Start a local web server providing an interactive graphical Web UI for exploring processes, ports, containers, and file locks.",
	Example: `  # Start Web UI on default port (http://127.0.0.1:7070)
  witr web

  # Start on custom port and automatically open browser
  witr web --port 8080 --open

  # Bind to all interfaces
  witr web --host 0.0.0.0 --port 7070`,
	RunE: func(cmd *cobra.Command, args []string) error {
		srv := web.NewServer(webHost, webPort)
		return srv.Start(webOpen)
	},
}

func init() {
	webCmd.Flags().StringVar(&webHost, "host", "127.0.0.1", "HTTP server bind address")
	webCmd.Flags().IntVarP(&webPort, "port", "p", 7070, "HTTP server listening port")
	webCmd.Flags().BoolVarP(&webOpen, "open", "o", true, "Automatically open Web UI in default browser")
	rootCmd.AddCommand(webCmd)
}
