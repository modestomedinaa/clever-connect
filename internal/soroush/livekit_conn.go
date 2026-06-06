// Package soroush implements the Soroush SFU RTP-based QUIC tunnel engine.
package soroush

import (
	"net"
	"time"

	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"
)

// LiveKitAddr implements net.Addr to natively map QUIC sessions to distinct SFU identities.
type LiveKitAddr struct {
	Identity string
}

func (a *LiveKitAddr) Network() string { return "livekit" }
func (a *LiveKitAddr) String() string  { return a.Identity }

// rxPacket pairs the raw payload with its validated sender address.
type rxPacket struct {
	data []byte
	addr net.Addr
}

// RtpPacketConn bridges QUIC UDP payloads to isolated WebRTC Audio Tracks.
type RtpPacketConn struct {
	localTrack *webrtc.TrackLocalStaticSample
	rxQueue    chan rxPacket
	closed     bool
}

// NewRtpPacketConn creates a new RTP-based packet connection backed by a
// WebRTC audio track for transmission.
func NewRtpPacketConn(track *webrtc.TrackLocalStaticSample) *RtpPacketConn {
	return &RtpPacketConn{
		localTrack: track,
		rxQueue:    make(chan rxPacket, 4096), // Enhanced depth for high-throughput concurrency
	}
}

// PushRx captures payloads, validates the 'Q' tag, and preserves sender origin.
func (c *RtpPacketConn) PushRx(payload []byte, senderIdentity string) {
	if len(payload) == 0 {
		return
	}

	// Filter for the custom QUIC multiplexer tag ('Q')
	if payload[0] == 0x51 {
		// Strip the tag and safely extract the underlying payload
		cleanData := make([]byte, len(payload)-1)
		copy(cleanData, payload[1:])

		packet := rxPacket{
			data: cleanData,
			addr: &LiveKitAddr{Identity: senderIdentity},
		}

		select {
		case c.rxQueue <- packet:
		default:
			// Queue full — drop frame safely. QUIC's recovery layer handles it natively.
		}
	}
}

// ReadFrom extracts frames and presents the true sender address to the QUIC multiplexer engine.
func (c *RtpPacketConn) ReadFrom(p []byte) (n int, addr net.Addr, err error) {
	packet, ok := <-c.rxQueue
	if !ok {
		return 0, nil, net.ErrClosed
	}
	n = copy(p, packet.data)
	return n, packet.addr, nil
}

// WriteTo transmits outbound frames into the LiveKit audio router track.
func (c *RtpPacketConn) WriteTo(p []byte, addr net.Addr) (n int, err error) {
	if c.closed {
		return 0, net.ErrClosed
	}

	// 1-byte overhead for the protocol isolation tag
	payload := make([]byte, 1+len(p))
	payload[0] = 0x51
	copy(payload[1:], p)

	// Keep strict 20ms pacing frame windows to prevent SFU anti-flood triggers
	err = c.localTrack.WriteSample(media.Sample{
		Data:     payload,
		Duration: time.Millisecond * 20,
	})

	return len(p), err
}

func (c *RtpPacketConn) Close() error {
	c.closed = true
	close(c.rxQueue)
	return nil
}

// Satisfy net.PacketConn boilerplate constraints
func (c *RtpPacketConn) LocalAddr() net.Addr                { return &LiveKitAddr{Identity: "local"} }
func (c *RtpPacketConn) SetDeadline(t time.Time) error      { return nil }
func (c *RtpPacketConn) SetReadDeadline(t time.Time) error  { return nil }
func (c *RtpPacketConn) SetWriteDeadline(t time.Time) error { return nil }

var _ net.PacketConn = (*RtpPacketConn)(nil)
