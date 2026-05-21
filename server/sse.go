package main

import (
	"errors"
	"fmt"
	"net/http"
)

type sseWriter struct {
	w       http.ResponseWriter
	flusher http.Flusher
}

func newSSEWriter(w http.ResponseWriter) (*sseWriter, error) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return nil, errors.New("streaming is not supported")
	}
	return &sseWriter{w: w, flusher: flusher}, nil
}

func (s *sseWriter) Start() {
	s.w.Header().Set("Content-Type", "text/event-stream")
	s.w.Header().Set("Cache-Control", "no-cache")
	s.w.Header().Set("Connection", "keep-alive")
	s.w.WriteHeader(http.StatusOK)
	s.Comment("connected")
}

func (s *sseWriter) Event(id int64, name string, value any) {
	if id > 0 {
		_, _ = fmt.Fprintf(s.w, "id: %d\n", id)
	}
	if name != "" {
		_, _ = fmt.Fprintf(s.w, "event: %s\n", name)
	}
	_, _ = fmt.Fprintf(s.w, "data: %s\n\n", sseJSON(value))
	s.flusher.Flush()
}

func (s *sseWriter) Error(err error) {
	if err == nil {
		return
	}
	s.Event(0, "error", map[string]string{"error": err.Error()})
}

func (s *sseWriter) Comment(text string) {
	if text == "" {
		text = "keepalive"
	}
	_, _ = fmt.Fprintf(s.w, ": %s\n\n", text)
	s.flusher.Flush()
}
