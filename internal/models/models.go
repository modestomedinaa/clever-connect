package models

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	Username string `gorm:"size:191;uniqueIndex;not null" json:"username"`
	Password string `gorm:"not null" json:"-"`
	Role     string `gorm:"default:'admin'" json:"role"`
}

type ClientSession struct {
	ID            string    `gorm:"primaryKey" json:"id"`
	Username      string    `gorm:"not null" json:"username"`
	IP            string    `json:"ip"`
	Country       string    `json:"country"`
	Flag          string    `json:"flag"`
	Protocol      string    `json:"protocol"`
	ConnectedAt   time.Time `json:"connected_at"`
	UploadSpeed   float64   `json:"upload_speed"`   // MB/s
	DownloadSpeed float64   `json:"download_speed"` // MB/s
	Active        bool      `gorm:"default:true" json:"active"`
}
