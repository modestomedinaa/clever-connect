package soroush

import (
	"net"
	"sync"

	"github.com/hashicorp/yamux"
)

// WebRTCTransport manages the LiveKit SFU DataChannel connection.
// Retained as a thin wrapper for backwards compatibility with the
// pool and worker injection interface.
type WebRTCTransport struct {
	rawConn  net.Conn
	yamuxSes *yamux.Session
	mu       sync.Mutex
	closed   bool
}

// NewWebRTCTransport creates a new WebRTCTransport.
func NewWebRTCTransport() *WebRTCTransport {
	return &WebRTCTransport{}
}

// YamuxSession returns the active yamux session.
func (t *WebRTCTransport) YamuxSession() *yamux.Session {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.yamuxSes
}

// Close closes the transport and cleans up resources.
func (t *WebRTCTransport) Close() {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.closed {
		return
	}
	t.closed = true

	if t.yamuxSes != nil {
		t.yamuxSes.Close()
	}
	if t.rawConn != nil {
		t.rawConn.Close()
	}
}
