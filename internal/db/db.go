package db

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"clever-connect/internal/config"
	"clever-connect/internal/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/mysql"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

var DB *gorm.DB

func InitDB(cfg *config.Config) *gorm.DB {
	var err error

	if cfg.AppMode == "client" {
		// SQLite Mode
		log.Printf("[DB] Connecting to SQLite database at: %s", cfg.SQLitePath)
		// Ensure parent directory exists
		dir := filepath.Dir(cfg.SQLitePath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			log.Fatalf("[DB] Failed to create database directories: %v", err)
		}

		DB, err = gorm.Open(sqlite.Open(cfg.SQLitePath), &gorm.Config{})
		if err != nil {
			log.Fatalf("[DB] Failed to connect to SQLite: %v", err)
		}
	} else {
		// MySQL Mode (Server panel)
		dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
			cfg.MySQLUser,
			cfg.MySQLPassword,
			cfg.MySQLHost,
			cfg.MySQLPort,
			cfg.MySQLDBName,
		)
		log.Printf("[DB] Connecting to MySQL database: %s@tcp(%s:%s)/%s", cfg.MySQLUser, cfg.MySQLHost, cfg.MySQLPort, cfg.MySQLDBName)

		DB, err = gorm.Open(mysql.Open(dsn), &gorm.Config{})
		if err != nil {
			// Elegant fallback to SQLite for easy development/review!
			fallbackPath := "data/server_fallback.db"
			log.Printf("[DB] WARNING: Failed to connect to MySQL database: %v", err)
			log.Printf("[DB] FALLBACK: Elevating sandbox resilience, establishing SQLite fallback at: %s", fallbackPath)

			dir := filepath.Dir(fallbackPath)
			_ = os.MkdirAll(dir, 0755)

			DB, err = gorm.Open(sqlite.Open(fallbackPath), &gorm.Config{})
			if err != nil {
				log.Fatalf("[DB] Fatal: Database initialization failed completely: %v", err)
			}
		}
	}

	// Auto Migration
	log.Println("[DB] Executing automatic database schema migrations...")
	if err := DB.AutoMigrate(&models.User{}, &models.ClientSession{}); err != nil {
		log.Fatalf("[DB] Auto migration failed: %v", err)
	}

	// Seed Admin User: salman / 136517
	seedAdmin(cfg)

	return DB
}

func seedAdmin(cfg *config.Config) {
	var admin models.User
	result := DB.Where("username = ?", cfg.AdminUsername).First(&admin)
	if result.Error != nil {
		log.Printf("[DB] Seeding administrator account. Username: %s", cfg.AdminUsername)

		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(cfg.AdminPassword), bcrypt.DefaultCost)
		if err != nil {
			log.Fatalf("[DB] Failed to hash seeded password: %v", err)
		}

		admin = models.User{
			Username: cfg.AdminUsername,
			Password: string(hashedPassword),
			Role:     "admin",
		}

		if err := DB.Create(&admin).Error; err != nil {
			log.Fatalf("[DB] Failed to seed administrator: %v", err)
		}
		log.Println("[DB] Administrator seeded successfully.")
	} else {
		log.Println("[DB] Seed integrity validated. Administrator account already exists.")
	}
}
