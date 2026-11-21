// Command gateway connects Kaya to WhatsApp.
package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/dhananjay6561/kaya/gateway/internal/config"
	"github.com/dhananjay6561/kaya/gateway/internal/httpapi"
)

var version = "dev"

const shutdownGrace = 10 * time.Second

func main() {
	cmd := run
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		cmd = healthcheck
	}
	if err := cmd(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	envFile, err := config.LoadEnvFile()
	if err != nil {
		return err
	}
	baseDir, err := os.Getwd()
	if err != nil {
		return err
	}
	if envFile != "" {
		baseDir = filepath.Dir(envFile)
	}

	cfg, err := config.Load(os.Getenv, baseDir)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	addr := net.JoinHostPort(cfg.ListenHost, strconv.Itoa(cfg.Port))
	ln, err := new(net.ListenConfig).Listen(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", addr, err)
	}
	fmt.Printf("kaya gateway %s listening on %s (data: %s)\n", version, addr, cfg.DataDir)

	if err := httpapi.Serve(ctx, httpapi.NewServer(httpapi.NewHandler()), ln, shutdownGrace); err != nil {
		return err
	}
	fmt.Println("kaya gateway stopped")
	return nil
}

func healthcheck() error {
	port := os.Getenv("GATEWAY_PORT")
	if port == "" {
		port = "3001"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return httpapi.Check(ctx, "http://"+net.JoinHostPort("127.0.0.1", port)+"/health")
}
