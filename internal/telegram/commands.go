package telegram

import (
	"fmt"
	"runtime"
	"strings"
	"time"

	"clever-connect/internal/db"
	"clever-connect/internal/logger"
	"clever-connect/internal/models"

	tele "gopkg.in/telebot.v4"
)

// registerCommands wires all bot commands and callback handlers.
func (e *Engine) registerCommands() {

	// ────────────────── /start ──────────────────
	e.Bot.Handle("/start", func(c tele.Context) error {
		e.commandsProcessed.Add(1)

		e.mu.RLock()
		welcome := e.Config.WelcomeMessage
		e.mu.RUnlock()

		if welcome == "" {
			welcome = "👋 Welcome to *CleverConnect Bot*!\n\nUse /help to see available commands."
		}

		// Replace placeholders
		welcome = strings.ReplaceAll(welcome, "{name}", c.Sender().FirstName)
		welcome = strings.ReplaceAll(welcome, "{username}", c.Sender().Username)

		return c.Send(welcome, &tele.SendOptions{ParseMode: tele.ModeMarkdown})
	})

	// ────────────────── /help ──────────────────
	e.Bot.Handle("/help", func(c tele.Context) error {
		e.commandsProcessed.Add(1)

		isAdmin := e.IsAdmin(c.Sender().ID)

		help := "🤖 *CleverConnect Bot Commands*\n\n"
		help += "📌 `/start` — Welcome message\n"
		help += "❓ `/help` — This help menu\n"
		help += "📊 `/status` — Bot & server status\n"
		help += "🆔 `/myid` — Get your Telegram user ID\n"

		if isAdmin {
			help += "\n🔐 *Admin Commands:*\n"
			help += "📁 `/files` — Browse server files\n"
			help += "⚙️ `/settings` — View bot configuration\n"
			help += "🔄 `/reload` — Hot-reload config from DB\n"
		}

		return c.Send(help, &tele.SendOptions{ParseMode: tele.ModeMarkdown})
	})

	// ────────────────── /myid ──────────────────
	e.Bot.Handle("/myid", func(c tele.Context) error {
		e.commandsProcessed.Add(1)
		msg := fmt.Sprintf("🆔 Your Telegram User ID: `%d`\n👤 Username: @%s",
			c.Sender().ID, c.Sender().Username)
		return c.Send(msg, &tele.SendOptions{ParseMode: tele.ModeMarkdown})
	})

	// ────────────────── /status ──────────────────
	e.Bot.Handle("/status", func(c tele.Context) error {
		e.commandsProcessed.Add(1)

		uptime := time.Since(e.startedAt)
		stats := fmt.Sprintf(
			"📊 *CleverConnect Bot Status*\n\n"+
				"🟢 *Status:* Online\n"+
				"⏱ *Uptime:* %s\n"+
				"🧵 *Workers:* %d (all CPU cores)\n"+
				"📨 *Messages Processed:* %d\n"+
				"⚡ *Commands Processed:* %d\n"+
				"📁 *Files Sent:* %d\n"+
				"❌ *Errors:* %d\n"+
				"🤖 *Bot:* @%s",
			formatUptime(uptime),
			runtime.NumCPU(),
			e.messagesProcessed.Load(),
			e.commandsProcessed.Load(),
			e.filesSent.Load(),
			e.errors.Load(),
			e.Bot.Me.Username,
		)
		return c.Send(stats, &tele.SendOptions{ParseMode: tele.ModeMarkdown})
	})

	// ────────────────── /settings (Admin only) ──────────────────
	e.Bot.Handle("/settings", e.AdminOnly(func(c tele.Context) error {
		e.commandsProcessed.Add(1)

		e.mu.RLock()
		cfg := e.Config
		e.mu.RUnlock()

		adminIDs := cfg.AdminUserIDs
		if adminIDs == "" {
			adminIDs = "(none configured)"
		}

		features := []string{}
		if cfg.EnableFileSharing {
			features = append(features, "📁 File Sharing")
		}
		if cfg.EnableNotifications {
			features = append(features, "🔔 Notifications")
		}
		if len(features) == 0 {
			features = append(features, "None enabled")
		}

		msg := fmt.Sprintf(
			"⚙️ *Bot Configuration*\n\n"+
				"🤖 *Bot Username:* @%s\n"+
				"👥 *Admin IDs:* `%s`\n"+
				"⏱ *Polling Interval:* %ds\n"+
				"🎯 *Enabled Features:*\n%s\n"+
				"📝 *Welcome Message:*\n_%s_",
			e.Bot.Me.Username,
			adminIDs,
			cfg.PollingInterval,
			strings.Join(features, "\n"),
			truncate(cfg.WelcomeMessage, 100),
		)
		return c.Send(msg, &tele.SendOptions{ParseMode: tele.ModeMarkdown})
	}))

	// ────────────────── /reload (Admin only) ──────────────────
	e.Bot.Handle("/reload", e.AdminOnly(func(c tele.Context) error {
		e.commandsProcessed.Add(1)

		if err := e.ReloadConfig(); err != nil {
			logger.Error("Telegram", "Config reload failed", "error", err)
			return c.Send("❌ Failed to reload configuration: " + err.Error())
		}
		return c.Send("✅ Configuration reloaded successfully from database.")
	}))

	// ────────────────── /files (Admin only) ──────────────────
	e.Bot.Handle("/files", e.AdminOnly(func(c tele.Context) error {
		e.commandsProcessed.Add(1)
		return e.handleFileBrowse(c, "/")
	}))

	// ────────────────── Callback query router (for inline keyboards) ──────────────────
	e.Bot.Handle(tele.OnCallback, func(c tele.Context) error {
		data := c.Callback().Data
		logger.Info("Telegram", "Callback received", "data", data, "user_id", c.Sender().ID)

		switch {
		case strings.HasPrefix(data, "fb:"):
			// File browser navigation
			if !e.IsAdmin(c.Sender().ID) {
				return c.Respond(&tele.CallbackResponse{Text: "⛔ Admin only"})
			}
			path := strings.TrimPrefix(data, "fb:")
			return e.handleFileBrowse(c, path)

		case strings.HasPrefix(data, "send:"):
			// Send file to chat
			if !e.IsAdmin(c.Sender().ID) {
				return c.Respond(&tele.CallbackResponse{Text: "⛔ Admin only"})
			}
			filePath := strings.TrimPrefix(data, "send:")
			// Dispatch file sending to worker pool for parallel processing
			e.Dispatch(func() {
				if err := e.sendFileToChat(c, filePath); err != nil {
					logger.Error("Telegram", "Failed to send file", "path", filePath, "error", err)
				}
			})
			return c.Respond(&tele.CallbackResponse{Text: "📤 Sending file..."})

		default:
			return c.Respond(&tele.CallbackResponse{Text: "Unknown action"})
		}
	})

	// ────────────────── Register bot commands menu ──────────────────
	commands := []tele.Command{
		{Text: "start", Description: "Welcome message"},
		{Text: "help", Description: "Show available commands"},
		{Text: "status", Description: "Bot & server status"},
		{Text: "myid", Description: "Get your Telegram user ID"},
		{Text: "files", Description: "Browse server files (admin)"},
		{Text: "settings", Description: "View bot config (admin)"},
		{Text: "reload", Description: "Reload config from DB (admin)"},
	}

	if err := e.Bot.SetCommands(commands); err != nil {
		logger.Warn("Telegram", "Failed to set bot commands menu", "error", err)
	}

	// Seed default Telegram config if none exists
	seedTelegramConfig()
}

// seedTelegramConfig ensures a default config row exists in the database.
func seedTelegramConfig() {
	var cfg models.TelegramConfig
	if err := db.DB.First(&cfg).Error; err != nil {
		logger.Info("Telegram", "Seeding default Telegram bot configuration")
		db.DB.Create(&models.TelegramConfig{
			PollingInterval:     10,
			MaxFileSize:         50,
			EnableFileSharing:   true,
			EnableNotifications: true,
			WelcomeMessage:      "👋 Welcome to *CleverConnect Bot*, {name}!\n\nUse /help to see available commands.",
		})
	}
}
