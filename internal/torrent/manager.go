package torrent

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"clever-connect/internal/db"
	"clever-connect/internal/models"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/metainfo"
)

type torrentSpeed struct {
	lastDownloaded int64
	lastUploaded   int64
	lastTime       time.Time
	downloadSpeed  float64
	uploadSpeed    float64
}

type TorrentManager struct {
	client     *torrent.Client
	mu         sync.Mutex
	speeds     map[string]*torrentSpeed
	stopStats  chan struct{}
}

var Manager *TorrentManager

// Init initializes the torrent client instance
func Init() error {
	saveDir := "./data/manager/downloads"
	if err := os.MkdirAll(saveDir, 0755); err != nil {
		return fmt.Errorf("failed to create downloads directory: %w", err)
	}

	torrentsDir := "./data/manager/torrents"
	if err := os.MkdirAll(torrentsDir, 0755); err != nil {
		return fmt.Errorf("failed to create torrent metadata directory: %w", err)
	}

	cfg := torrent.NewDefaultClientConfig()
	cfg.DataDir = saveDir
	cfg.NoUpload = false // Seed completed files to keep ratio healthy

	client, err := torrent.NewClient(cfg)
	if err != nil {
		return fmt.Errorf("failed to create torrent client: %w", err)
	}

	Manager = &TorrentManager{
		client:    client,
		speeds:    make(map[string]*torrentSpeed),
		stopStats: make(chan struct{}),
	}

	// Auto-migrate the GORM TorrentJob model
	if err := db.DB.AutoMigrate(&models.TorrentJob{}); err != nil {
		return fmt.Errorf("failed to migrate torrent DB table: %w", err)
	}

	// Reload all existing torrent jobs from database
	var jobs []models.TorrentJob
	if err := db.DB.Find(&jobs).Error; err == nil {
		for _, job := range jobs {
			if job.MagnetURI != "" {
				t, err := client.AddMagnet(job.MagnetURI)
				if err == nil {
					if job.Status == "paused" {
						t.DisallowDataDownload()
					} else {
						t.AllowDataDownload()
						t.DownloadAll()
					}
				}
			} else if job.TorrentPath != "" {
				if _, err := os.Stat(job.TorrentPath); err == nil {
					mi, err := metainfo.LoadFromFile(job.TorrentPath)
					if err == nil {
						t, err := client.AddTorrent(mi)
						if err == nil {
							if job.Status == "paused" {
								t.DisallowDataDownload()
							} else {
								t.AllowDataDownload()
								t.DownloadAll()
							}
						}
					}
				}
			}
		}
	}

	// Start background speed & progress monitoring loop
	go Manager.statsLoop()

	return nil
}

// Close gracefully closes the torrent client
func (m *TorrentManager) Close() {
	close(m.stopStats)
	m.client.Close()
}

// statsLoop tick worker
func (m *TorrentManager) statsLoop() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopStats:
			return
		case <-ticker.C:
			m.updateStats()
		}
	}
}

// updateStats recalculates progress, seeds/peers, and delta upload/download speeds
func (m *TorrentManager) updateStats() {
	m.mu.Lock()
	defer m.mu.Unlock()

	torrents := m.client.Torrents()
	now := time.Now()

	for _, t := range torrents {
		infoHash := t.InfoHash().HexString()

		var totalBytes int64
		var downloaded int64
		var uploaded int64
		var peers int
		var progress float64
		var name string

		select {
		case <-t.GotInfo():
			// Metainfo resolved
			totalBytes = t.Length()
			downloaded = t.BytesCompleted()
			stats := t.Stats()
			uploaded = stats.BytesWritten.Int64()
			peers = stats.ActivePeers
			name = t.Name()
			if totalBytes > 0 {
				progress = (float64(downloaded) / float64(totalBytes)) * 100.0
			}
		default:
			// Metainfo still fetching
			name = "Fetching metadata..."
			stats := t.Stats()
			peers = stats.ActivePeers
		}

		speedInfo, exists := m.speeds[infoHash]
		if !exists {
			speedInfo = &torrentSpeed{
				lastDownloaded: downloaded,
				lastUploaded:   uploaded,
				lastTime:       now,
			}
			m.speeds[infoHash] = speedInfo
		}

		duration := now.Sub(speedInfo.lastTime).Seconds()
		if duration > 0 {
			downloadDelta := downloaded - speedInfo.lastDownloaded
			uploadDelta := uploaded - speedInfo.lastUploaded

			speedInfo.downloadSpeed = float64(downloadDelta) / (1024 * 1024) / duration
			speedInfo.uploadSpeed = float64(uploadDelta) / (1024 * 1024) / duration

			speedInfo.lastDownloaded = downloaded
			speedInfo.lastUploaded = uploaded
			speedInfo.lastTime = now
		}

		// Save updates to database
		var job models.TorrentJob
		if err := db.DB.Where("info_hash = ?", infoHash).First(&job).Error; err == nil {
			job.Name = name
			job.TotalBytes = totalBytes
			job.Downloaded = downloaded
			job.Uploaded = uploaded
			job.Progress = progress
			job.DownloadSpeed = speedInfo.downloadSpeed
			job.UploadSpeed = speedInfo.uploadSpeed
			job.Peers = peers

			// Update state based on download status
			if job.Status != "paused" && totalBytes > 0 {
				if downloaded >= totalBytes {
					job.Status = "seeding"
				} else {
					job.Status = "downloading"
				}
			}
			db.DB.Save(&job)
		}
	}
}

// AddMagnet adds a torrent via magnet link
func (m *TorrentManager) AddMagnet(uri string, saveDir string) (string, error) {
	t, err := m.client.AddMagnet(uri)
	if err != nil {
		return "", err
	}

	infoHash := t.InfoHash().HexString()

	// Default save directory is downloads
	if saveDir == "" {
		saveDir = "./data/manager/downloads"
	}

	job := models.TorrentJob{
		InfoHash:      infoHash,
		Name:          "Fetching metadata...",
		MagnetURI:     uri,
		SaveDirectory: saveDir,
		Status:        "downloading",
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	// Save or update GORM entry
	if err := db.DB.Save(&job).Error; err != nil {
		return "", err
	}

	// Trigger download
	t.AllowDataDownload()
	t.DownloadAll()

	return infoHash, nil
}

// AddTorrentFile adds a torrent via physical .torrent file
func (m *TorrentManager) AddTorrentFile(torrentPath string, saveDir string) (string, error) {
	mi, err := metainfo.LoadFromFile(torrentPath)
	if err != nil {
		return "", err
	}

	t, err := m.client.AddTorrent(mi)
	if err != nil {
		return "", err
	}

	infoHash := t.InfoHash().HexString()

	if saveDir == "" {
		saveDir = "./data/manager/downloads"
	}

	// Save metadata to persistent configs
	persistentPath := filepath.Join("./data/manager/torrents", infoHash+".torrent")
	if torrentPath != persistentPath {
		_ = copyFile(torrentPath, persistentPath)
	}

	job := models.TorrentJob{
		InfoHash:      infoHash,
		Name:          t.Name(),
		TorrentPath:   persistentPath,
		SaveDirectory: saveDir,
		Status:        "downloading",
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	if err := db.DB.Save(&job).Error; err != nil {
		return "", err
	}

	t.AllowDataDownload()
	t.DownloadAll()

	return infoHash, nil
}

// PauseTorrent cancels piece priority and stops download
func (m *TorrentManager) PauseTorrent(infoHash string) {
	for _, t := range m.client.Torrents() {
		if t.InfoHash().HexString() == infoHash {
			t.DisallowDataDownload()
			db.DB.Model(&models.TorrentJob{}).Where("info_hash = ?", infoHash).Update("status", "paused")
			break
		}
	}
}

// ResumeTorrent downloads all files/pieces
func (m *TorrentManager) ResumeTorrent(infoHash string) {
	for _, t := range m.client.Torrents() {
		if t.InfoHash().HexString() == infoHash {
			t.AllowDataDownload()
			t.DownloadAll()
			db.DB.Model(&models.TorrentJob{}).Where("info_hash = ?", infoHash).Update("status", "downloading")
			break
		}
	}
}

// DeleteTorrent deletes the torrent from client, GORM, and optionally deletes actual files
func (m *TorrentManager) DeleteTorrent(infoHash string, deleteFiles bool) {
	for _, t := range m.client.Torrents() {
		if t.InfoHash().HexString() == infoHash {
			t.Drop()
			break
		}
	}

	var job models.TorrentJob
	if err := db.DB.Where("info_hash = ?", infoHash).First(&job).Error; err == nil {
		if deleteFiles {
			// Delete downloaded files/directory if existing
			dataDir := job.SaveDirectory
			if job.Name != "" {
				targetPath := filepath.Join(dataDir, job.Name)
				_ = os.RemoveAll(targetPath)
			}
		}
		if job.TorrentPath != "" {
			_ = os.Remove(job.TorrentPath)
		}
		db.DB.Delete(&job)
	}
}

// Helper to copy files
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	if err != nil {
		return err
	}
	return out.Sync()
}

// Client returns the underlying client instance
func (m *TorrentManager) Client() *torrent.Client {
	return m.client
}
