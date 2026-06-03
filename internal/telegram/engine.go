// Package telegram provides a high-performance, parallel Telegram bot engine
// for CleverConnect. It uses a worker pool spanning all CPU cores for maximum
// throughput and integrates deeply with the application's file manager, settings,
// and database layer.
package telegram

import (
	"context"
	"fmt"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"clever-connect/internal/db"
	"clever-connect/internal/logger"
	"clever-connect/internal/models"

	tele "gopkg.in/telebot.v4"
)

// ──────────────────────────────────────────────────────────────
// Engine is the central Telegram bot runtime. It is designed to
// be started and stopped dynamically from the admin panel.
// ──────────────────────────────────────────────────────────────

// Engine holds the running telebot instance and worker pool.
type Engine struct {
	Bot        *tele.Bot
	Config     *models.TelegramConfig
	workerPool chan func()
	ctx        context.Context
	cancel     context.CancelFunc
	wg         sync.WaitGroup
	running    atomic.Bool
	startedAt  time.Time
	mu         sync.RWMutex

	// Metrics (atomic for lock-free reads from API)
	messagesProcessed atomic.Int64
	commandsProcessed atomic.Int64
	filesSent         atomic.Int64
	errors            atomic.Int64
}

// Global singleton (only one bot can run at a time)
var (
	instance *Engine
	mu       sync.Mutex
)

// GetEngine returns the active engine instance, or nil.
func GetEngine() *Engine {
	mu.Lock()
	defer mu.Unlock()
	return instance
}

// IsRunning returns true if the bot engine is currently active.
func IsRunning() bool {
	e := GetEngine()
	return e != nil && e.running.Load()
}

// StartEngine boots the Telegram bot using the config stored in the database.
// It spawns runtime.NumCPU() worker goroutines for parallel message processing.
func StartEngine(cfg *models.TelegramConfig) error {
	mu.Lock()
	defer mu.Unlock()

	// Tear down any existing instance first
	if instance != nil && instance.running.Load() {
		instance.shutdown()
	}

	if cfg.BotToken == "" {
		return fmt.Errorf("telegram bot token is empty")
	}

	logger.Info("Telegram", "Initializing Telegram bot engine",
		"workers", runtime.NumCPU(),
		"polling_interval", cfg.PollingInterval,
	)

	pref := tele.Settings{
		Token:  cfg.BotToken,
		Poller: &tele.LongPoller{Timeout: time.Duration(cfg.PollingInterval) * time.Second},
	}

	bot, err := tele.NewBot(pref)
	if err != nil {
		return fmt.Errorf("failed to create telebot: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	eng := &Engine{
		Bot:        bot,
		Config:     cfg,
		workerPool: make(chan func(), runtime.NumCPU()*64), // buffered job queue
		ctx:        ctx,
		cancel:     cancel,
		startedAt:  time.Now(),
	}

	// Spin up worker goroutines — one per CPU core
	numWorkers := runtime.NumCPU()
	for i := 0; i < numWorkers; i++ {
		eng.wg.Add(1)
		go eng.worker(i)
	}

	// Register all command handlers and middleware
	eng.registerMiddleware()
	eng.registerCommands()

	// Start the bot polling loop in a dedicated goroutine
	eng.running.Store(true)
	go func() {
		logger.Info("Telegram", "Bot polling started", "username", bot.Me.Username)
		bot.Start()
	}()

	instance = eng

	logger.Info("Telegram", "Telegram bot engine started successfully",
		"bot_username", bot.Me.Username,
		"bot_id", bot.Me.ID,
		"workers", numWorkers,
	)

	return nil
}

// StopEngine gracefully shuts down the running bot engine.
func StopEngine() error {
	mu.Lock()
	defer mu.Unlock()

	if instance == nil || !instance.running.Load() {
		return fmt.Errorf("telegram bot engine is not running")
	}

	instance.shutdown()
	logger.Info("Telegram", "Telegram bot engine stopped")
	instance = nil
	return nil
}

// shutdown performs the actual teardown.
func (e *Engine) shutdown() {
	e.running.Store(false)
	e.cancel()
	e.Bot.Stop()
	close(e.workerPool)
	e.wg.Wait()
}

// worker is a goroutine that pulls jobs from the pool and executes them.
func (e *Engine) worker(id int) {
	defer e.wg.Done()
	for {
		select {
		case <-e.ctx.Done():
			return
		case job, ok := <-e.workerPool:
			if !ok {
				return
			}
			func() {
				defer func() {
					if r := recover(); r != nil {
						e.errors.Add(1)
						logger.Error("Telegram", "Worker panic recovered",
							"worker_id", id,
							"panic", fmt.Sprintf("%v", r),
						)
					}
				}()
				job()
			}()
		}
	}
}

// Dispatch submits a job to the worker pool for parallel execution.
// If the pool is full, it logs a warning and drops the job to prevent blocking.
func (e *Engine) Dispatch(job func()) {
	select {
	case e.workerPool <- job:
		// submitted
	default:
		e.errors.Add(1)
		logger.Warn("Telegram", "Worker pool is full — dropping job")
	}
}

// IsAdmin checks whether a Telegram user ID is in the admin list.
func (e *Engine) IsAdmin(userID int64) bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	for _, id := range parseAdminIDs(e.Config.AdminUserIDs) {
		if id == userID {
			return true
		}
	}
	return false
}

// ReloadConfig fetches the latest config from the database and hot-reloads it.
func (e *Engine) ReloadConfig() error {
	var cfg models.TelegramConfig
	if err := db.DB.First(&cfg).Error; err != nil {
		return fmt.Errorf("failed to reload telegram config: %w", err)
	}
	e.mu.Lock()
	e.Config = &cfg
	e.mu.Unlock()
	logger.Info("Telegram", "Configuration hot-reloaded")
	return nil
}

// Stats returns engine runtime metrics.
func (e *Engine) Stats() map[string]interface{} {
	return map[string]interface{}{
		"running":             e.running.Load(),
		"uptime_seconds":      int(time.Since(e.startedAt).Seconds()),
		"workers":             runtime.NumCPU(),
		"messages_processed":  e.messagesProcessed.Load(),
		"commands_processed":  e.commandsProcessed.Load(),
		"files_sent":          e.filesSent.Load(),
		"errors":              e.errors.Load(),
		"bot_username":        e.Bot.Me.Username,
		"bot_id":              e.Bot.Me.ID,
	}
}

// parseAdminIDs splits a comma-separated string of Telegram user IDs.
func parseAdminIDs(raw string) []int64 {
	parts := strings.Split(raw, ",")
	ids := make([]int64, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		var id int64
		if _, err := fmt.Sscanf(p, "%d", &id); err == nil {
			ids = append(ids, id)
		}
	}
	return ids
}
