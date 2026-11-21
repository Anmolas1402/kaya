package httpapi

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHealth(t *testing.T) {
	rec := httptest.NewRecorder()
	NewHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", http.NoBody))

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("content type %q", got)
	}
	if got := rec.Body.String(); got != `{"status":"ok"}`+"\n" {
		t.Errorf("body %q", got)
	}
}

func TestHealthRejectsOtherMethods(t *testing.T) {
	rec := httptest.NewRecorder()
	NewHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/health", http.NoBody))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status %d, want 405", rec.Code)
	}
}

func TestServeAnswersThenStopsOnCancel(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- Serve(ctx, NewServer(NewHandler()), ln, time.Second) }()

	url := "http://" + ln.Addr().String() + "/health"
	checkCtx, checkCancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer checkCancel()
	if err := Check(checkCtx, url); err != nil {
		t.Fatalf("check while running: %v", err)
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("serve returned %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("serve did not stop after cancel")
	}
	if err := Check(checkCtx, url); err == nil {
		t.Fatal("check passed after shutdown")
	}
}

func TestCheckFailsOnBadStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()
	if err := Check(context.Background(), srv.URL); err == nil {
		t.Fatal("expected an error for 503")
	}
}
