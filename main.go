package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"strings"
	"time"

	"clever-connect/internal/config"
	"clever-connect/internal/db"
	"clever-connect/internal/handlers"

	"github.com/gin-gonic/gin"
)

//go:embed all:web/client/dist
var clientDist embed.FS

//go:embed all:web/server/dist
var serverDist embed.FS

func main() {
	log.Println("[Core] Starting CleverConnect VPN Orchestrator...")

	// Load configuration
	cfg := config.LoadConfig()
	log.Printf("[Core] Application Mode: %s", strings.ToUpper(cfg.AppMode))

	// Initialize Database
	database := db.InitDB(cfg)
	_ = database // keep reference

	// Setup Gin Router
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())

	// Logging Middleware
	router.Use(func(c *gin.Context) {
		start := time.Now()
		c.Next()
		log.Printf("[HTTP] %s %s | Status: %d | Latency: %v", c.Request.Method, c.Request.URL.Path, c.Writer.Status(), time.Since(start))
	})

	// Setup API Route Handlers
	authHandler := handlers.NewAuthHandler(cfg)
	wsHandler := handlers.NewWSHandler(cfg)

	// API Group
	api := router.Group("/api")
	{
		api.POST("/auth/login", authHandler.Login)

		// Protected API routes
		protected := api.Group("")
		protected.Use(handlers.AuthMiddleware(cfg.JWTSecret))
		{
			protected.POST("/clients/disconnect/:id", func(c *gin.Context) {
				id := c.Param("id")
				c.JSON(http.StatusOK, gin.H{"status": "disconnected", "id": id})
			})
		}
	}

	// Real-time WebSocket endpoint (protected via token query param handled in middleware)
	router.GET("/ws", handlers.AuthMiddleware(cfg.JWTSecret), wsHandler.ServeWS)

	// Static Assets & SPA Fallback Serving
	var embedFS fs.FS
	var err error

	if cfg.AppMode == "server" {
		embedFS, err = fs.Sub(serverDist, "web/server/dist")
		if err != nil {
			log.Fatalf("[Static] Failed to sub server embed FS: %v", err)
		}
		log.Println("[Static] Serving CleverConnect Server Panel UI...")
	} else {
		embedFS, err = fs.Sub(clientDist, "web/client/dist")
		if err != nil {
			log.Fatalf("[Static] Failed to sub client embed FS: %v", err)
		}
		log.Println("[Static] Serving CleverConnect Client Panel UI...")
	}

	router.Use(serveEmbeddedSPA(embedFS))

	// Start Gin Server
	log.Printf("[Core] Orchestrator listening on http://127.0.0.1:%s", cfg.Port)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("[Core] Failed to run server: %v", err)
	}
}



func serveEmbeddedSPA(embedFS fs.FS) gin.HandlerFunc {
	fileServer := http.FileServer(http.FS(embedFS))

	return func(c *gin.Context) {
		path := c.Request.URL.Path

		// If route matches API endpoints, continue to other middleware/handlers
		if strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/ws") {
			c.Next()
			return
		}

		// Format file path for searching inside embedded FS
		filePath := strings.TrimPrefix(path, "/")
		if filePath == "" {
			filePath = "index.html"
		}

		// Check if target file exists in embed FS
		_, err := embedFS.Open(filePath)
		if err != nil {
			// Serve index.html as fallback for Single Page App router
			indexFile, err := embedFS.Open("index.html")
			if err != nil {
				c.String(http.StatusInternalServerError, "Embedded index.html not found")
				return
			}
			defer indexFile.Close()

			stat, err := indexFile.Stat()
			if err != nil {
				c.String(http.StatusInternalServerError, "Failed to inspect index.html")
				return
			}

			c.DataFromReader(http.StatusOK, stat.Size(), "text/html; charset=utf-8", indexFile, nil)
			c.Abort()
			return
		}

		// File exists - serve it
		fileServer.ServeHTTP(c.Writer, c.Request)
		c.Abort()
	}
}
