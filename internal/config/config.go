package config

import (
	"os"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	AppMode             string // "client" or "server"
	Port                string
	JWTSecret           []byte
	WSHeartbeatInterval time.Duration

	// SQLite (Client mode)
	SQLitePath string

	// MySQL (Server mode)
	MySQLUser     string
	MySQLPassword string
	MySQLHost     string
	MySQLPort     string
	MySQLDBName   string

	// Seed Admin
	AdminUsername string
	AdminPassword string
}

func LoadConfig() *Config {
	// Try loading from .env if present
	_ = godotenv.Load()

	appMode := os.Getenv("APP_MODE")
	if appMode == "" {
		appMode = "client" // default
	}

	port := os.Getenv("PORT")
	if port == "" {
		if appMode == "server" {
			port = "8081"
		} else {
			port = "8080"
		}
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "super-secret-jwt-key"
	}

	wsIntervalStr := os.Getenv("WS_HEARTBEAT_INTERVAL")
	wsInterval := 5 * time.Second
	if wsIntervalStr != "" {
		if parsed, err := time.ParseDuration(wsIntervalStr); err == nil {
			wsInterval = parsed
		}
	}

	return &Config{
		AppMode:             appMode,
		Port:                port,
		JWTSecret:           []byte(jwtSecret),
		WSHeartbeatInterval: wsInterval,
		SQLitePath:          getEnv("SQLITE_DB_PATH", "data/client.db"),
		MySQLUser:           getEnv("MYSQL_USER", "root"),
		MySQLPassword:       os.Getenv("MYSQL_PASSWORD"),
		MySQLHost:           getEnv("MYSQL_HOST", "127.0.0.1"),
		MySQLPort:           getEnv("MYSQL_PORT", "3306"),
		MySQLDBName:         getEnv("MYSQL_DB_NAME", "clever_connect_server"),
		AdminUsername:       getEnv("ADMIN_USERNAME", "salman"),
		AdminPassword:       getEnv("ADMIN_PASSWORD", "136517"),
	}
}

func getEnv(key, defaultVal string) string {
	val := os.Getenv(key)
	if val == "" {
		return defaultVal
	}
	return val
}
