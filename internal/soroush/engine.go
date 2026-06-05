// Package soroush implements the Soroush SFU P2P Swarm tunnel engine.
// It operates as an additive, parallel service to the existing Ehco infrastructure,
// routing traffic securely through LiveKit WebRTC DataChannels signaled via tokens.
package soroush

import (
	"context"
	"fmt"
	"io"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"

	"clever-connect/internal/db"
	"clever-connect/internal/logger"
	"clever-connect/internal/models"

	"github.com/hashicorp/yamux"
	lksdk "github.com/livekit/server-sdk-go/v2"
)

const component = "Soroush"

var (
	engineMu     sync.Mutex
	engineCtx    context.Context
	engineCancel context.CancelFunc
	running      bool

	// Telemetry counters
	totalStreams  atomic.Int64
	bytesRelayed atomic.Int64
	startedAt    time.Time
)

// StartEngine starts the LiveKit tunnel in either server or client mode.
func StartEngine(cfg *models.SoroushTunnelConfig, accounts []models.SoroushAccount, isServer bool) error {
	engineMu.Lock()
	defer engineMu.Unlock()

	if running {
		return fmt.Errorf("soroush engine is already running")
	}

	if cfg.PSK == "" {
		return fmt.Errorf("PSK is required for in-band DataChannel authentication")
	}

	// Make sure the frontend/database provides the extracted LiveKit tokens
	if cfg.LiveKitToken == "" {
		return fmt.Errorf("LiveKitToken is required for SFU WebRTC connection")
	}

	engineCtx, engineCancel = context.WithCancel(context.Background())
	running = true
	startedAt = time.Now()
	totalStreams.Store(0)
	bytesRelayed.Store(0)

	mode := "client"
	if isServer {
		mode = "server"
	}

	logger.Info(component, "Starting Soroush LiveKit engine",
		"mode", mode,
		"accounts", len(accounts),
		"socks_port", cfg.SocksPort,
		"max_workers", cfg.MaxWorkers,
	)

	if isServer {
		go runServer(engineCtx, cfg)
	} else {
		go runClient(engineCtx, cfg, accounts)
	}

	return nil
}

// runServer starts the server-side (Queen) engine bound to the LiveKit Room.
func runServer(ctx context.Context, cfg *models.SoroushTunnelConfig) {
	logger.Info(component, "Server engine goroutine started, initializing SFU Listener")

	url := cfg.LiveKitURL
	if url == "" {
		url = "wss://im-server.splus.ir" // Standard endpoint
	}

	// Create listener + callback BEFORE connecting (room.callback is unexported in v2 SDK)
	listener, listenerCb := NewLiveKitListener()

	room, err := lksdk.ConnectToRoomWithToken(url, cfg.LiveKitToken, listenerCb)
	if err != nil {
		logger.Error(component, "Server: Failed to connect to LiveKit Room", "error", err)
		return
	}
	defer room.Disconnect()

	// Bind the room reference so LiveKitConn.Write() can publish data
	listener.BindRoom(room)

	logger.Info(component, "Server: Connected to SFU. Virtual Listener active, awaiting worker traffic...")
	defer listener.Close()

	// Spin off context cancellation watcher
	go func() {
		<-ctx.Done()
		room.Disconnect()
		listener.Close()
	}()

	for {
		conn, err := listener.Accept()
		if err != nil {
			logger.Error(component, "Server: SFU Listener error", "error", err)
			return
		}

		go handleIncomingWorker(ctx, conn.(*LiveKitConn), cfg)
	}
}

func handleIncomingWorker(ctx context.Context, conn *LiveKitConn, cfg *models.SoroushTunnelConfig) {
	logger.Info(component, "Server: Worker connection detected, executing Handshake", "target", conn.targetIdentity)

	// 3-second zero-trust handshake
	challenge := make([]byte, 64)
	errChan := make(chan error, 1)
	go func() {
		_, err := io.ReadFull(conn, challenge)
		errChan <- err
	}()

	select {
	case <-time.After(3 * time.Second):
		logger.Warn(component, "Server: Handshake timeout, rejecting SFU pipe", "target", conn.targetIdentity)
		conn.Close()
		return
	case err := <-errChan:
		if err != nil {
			logger.Warn(component, "Server: Handshake read error", "error", err)
			conn.Close()
			return
		}
	}

	if err := VerifyHandshakeChallenge(cfg.PSK, challenge); err != nil {
		logger.Warn(component, "Server: Unauthorized handshake, dropping pipe", "error", err)
		conn.Close()
		return
	}

	logger.Info(component, "Server: Handshake verified, mounting Yamux", "target", conn.targetIdentity)

	yamuxCfg := yamux.DefaultConfig()
	yamuxCfg.LogOutput = nil
	yamuxCfg.MaxStreamWindowSize = 1024 * 1024
	yamuxCfg.ConnectionWriteTimeout = 5 * time.Second
	yamuxCfg.AcceptBacklog = 1024

	yamuxSess, err := yamux.Server(conn, yamuxCfg)
	if err != nil {
		logger.Error(component, "Server: Failed to map Yamux over SFU pipe", "error", err)
		conn.Close()
		return
	}

	StartRelayHandler(ctx, yamuxSess)
}

// runClient starts the client-side (Swarm) engine.
func runClient(ctx context.Context, cfg *models.SoroushTunnelConfig, accounts []models.SoroushAccount) {
	logger.Info(component, "Client engine goroutine started")

	pool := NewMultiplexerPool(cfg.LoadBalanceAlgo)

	go func() {
		if err := StartSOCKS5Listener(ctx, cfg.SocksPort, pool); err != nil {
			logger.Error(component, "SOCKS5 listener error", "error", err)
		}
	}()

	go pool.HealthCheck(ctx)

	maxWorkers := cfg.MaxWorkers
	if maxWorkers > len(accounts) {
		maxWorkers = len(accounts)
	}

	var wg sync.WaitGroup
	for i := 0; i < maxWorkers; i++ {
		wg.Add(1)
		go func(acct models.SoroushAccount) {
			defer wg.Done()
			runWorker(ctx, cfg, &acct, pool)
		}(accounts[i])
	}

	wg.Wait()
	logger.Info(component, "Client engine shutting down — all workers exited")
}

// runWorker manages a single worker connection to the SFU Room
func runWorker(ctx context.Context, cfg *models.SoroushTunnelConfig, acct *models.SoroushAccount, pool *MultiplexerPool) {
	defer func() {
		db.DB.Model(acct).Update("status", "idle")
	}()

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		logger.Info(component, "Worker starting SFU connection phase", "phone", maskPhone(acct.PhoneNumber))
		db.DB.Model(acct).Update("status", "connecting")

		jitter := time.Duration(1000+rand.Intn(2000)) * time.Millisecond
		sleepWithContext(ctx, jitter)

		// Reload configuration dynamically
		var latestCfg models.SoroushTunnelConfig
		if err := db.DB.First(&latestCfg).Error; err == nil {
			cfg = &latestCfg
		}

		url := cfg.LiveKitURL
		if url == "" {
			url = "wss://im-server.splus.ir"
		}

		// Because it's an SFU room, we must manually construct a virtual connection targeting the Queen's ID.
		// Soroush's token dictates identity, so the server target identity may need configuration.
		serverTargetIdentity := "server"

		// Pre-wire the data callback BEFORE connecting (room.callback is unexported in v2 SDK).
		// We'll set the room reference on conn after connection succeeds.
		var conn *LiveKitConn
		roomCb := lksdk.NewRoomCallback()
		roomCb.OnDataReceived = func(data []byte, params lksdk.DataReceiveParams) {
			if conn != nil && params.SenderIdentity == serverTargetIdentity {
				_ = conn.WriteIncoming(data)
			}
		}

		// Connect as an active participant to the SFU.
		room, err := lksdk.ConnectToRoomWithToken(url, cfg.LiveKitToken, roomCb)
		if err != nil {
			logger.Error(component, "Worker: Failed to connect to SFU Room", "error", err)
			db.DB.Model(acct).Update("status", "error")
			sleepWithContext(ctx, 10*time.Second)
			continue
		}

		conn = NewLiveKitConn(room, serverTargetIdentity)

		// Send 64-byte HKDF challenge
		challenge, err := BuildHandshakeChallenge(cfg.PSK)
		if err != nil {
			logger.Error(component, "Worker: Failed to build handshake challenge", "error", err)
			conn.Close()
			room.Disconnect()
			continue
		}

		if _, err := conn.Write(challenge); err != nil {
			logger.Error(component, "Worker: Failed to write handshake challenge", "error", err)
			conn.Close()
			room.Disconnect()
			continue
		}

		logger.Info(component, "Worker: SFU connection established, initiating Yamux", "phone", maskPhone(acct.PhoneNumber))

		yamuxCfg := yamux.DefaultConfig()
		yamuxCfg.LogOutput = nil
		yamuxCfg.MaxStreamWindowSize = 1024 * 1024
		yamuxCfg.ConnectionWriteTimeout = 5 * time.Second
		yamuxCfg.AcceptBacklog = 1024

		yamuxSess, yamuxError := yamux.Client(conn, yamuxCfg)
		if yamuxError != nil {
			logger.Error(component, "Worker: Failed to map Yamux client over SFU pipe", "error", yamuxError)
			conn.Close()
			room.Disconnect()
			continue
		}

		// Inject into load balancer pool
		wc := &WorkerChannel{
			AccountID:    fmt.Sprintf("%d", acct.ID),
			Transport:    &WebRTCTransport{}, // Stub for backwards compatibility with pool
			YamuxSession: yamuxSess,
			Healthy:      true,
		}
		pool.Inject(wc)

		logger.Info(component, "Worker connection active and routed", "phone", maskPhone(acct.PhoneNumber))
		db.DB.Model(acct).Update("status", "tunnel_active")

		select {
		case <-ctx.Done():
			pool.Purge(wc.AccountID)
			conn.Close()
			room.Disconnect()
			return
		case <-yamuxSess.CloseChan():
			logger.Warn(component, "Worker yamux session closed by peer, resetting", "phone", maskPhone(acct.PhoneNumber))
			db.DB.Model(acct).Update("status", "error")
			pool.Purge(wc.AccountID)
			conn.Close()
			room.Disconnect()
			sleepWithContext(ctx, 3*time.Second)
		}
	}
}

// StopEngine gracefully stops the tunnel engine.
func StopEngine() {
	engineMu.Lock()
	runningVal := running
	engineMu.Unlock()

	if !runningVal {
		return
	}

	logger.Info(component, "Stopping LiveKit Soroush tunnel engine")
	engineCancel()

	engineMu.Lock()
	running = false
	engineMu.Unlock()
}

// IsRunning returns whether the engine is currently active.
func IsRunning() bool {
	engineMu.Lock()
	defer engineMu.Unlock()
	return running
}

// TunnelStatus contains the current state of the Soroush tunnel engine.
type TunnelStatus struct {
	Running      bool      `json:"running"`
	Mode         string    `json:"mode"`
	TotalStreams  int64     `json:"total_streams"`
	BytesRelayed int64     `json:"bytes_relayed"`
	Uptime       string    `json:"uptime"`
	PoolStats    PoolStats `json:"pool_stats"`
}

// GetStatus returns the current tunnel status snapshot.
func GetStatus() *TunnelStatus {
	engineMu.Lock()
	isRunning := running
	engineMu.Unlock()

	status := &TunnelStatus{
		Running:      isRunning,
		TotalStreams:  totalStreams.Load(),
		BytesRelayed: bytesRelayed.Load(),
	}

	if isRunning {
		status.Uptime = time.Since(startedAt).Truncate(time.Second).String()
	}

	return status
}

func sleepWithContext(ctx context.Context, d time.Duration) {
	select {
	case <-time.After(d):
	case <-ctx.Done():
	}
}

func maskPhone(phone string) string {
	if len(phone) < 4 {
		return "****"
	}
	return phone[:3] + "****" + phone[len(phone)-2:]
}
