<div align="center">

# 🦈 Sharkoder

### GPU-Accelerated Video Encoder with Remote File Management

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/Electron-27.x-blue.svg)](https://www.electronjs.org/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-NVENC%20%7C%20x265-orange.svg)](https://ffmpeg.org/)

**Encode massive video libraries with NVIDIA NVENC (GPU) or x265 (CPU), manage remote files via SFTP/WebDAV, and optimize storage with intelligent compression.**

[Features](#-features) • [Quick Start](#-quick-start) • [Installation](#-installation) • [Usage](#-usage) • [Documentation](#-documentation)

</div>

---

## 🎯 What is Sharkoder?

Sharkoder is a desktop application that helps you:

- 📹 **Encode videos** with NVIDIA NVENC (GPU) or x265 (CPU) for maximum efficiency
- 🌐 **Browse remote files** via SFTP or WebDAV without mounting drives
- ⚡ **Process queues** automatically: download → encode → upload → cleanup
- 💾 **Save storage** with intelligent HEVC compression (50-70% size reduction)
- 🔄 **Backup originals** automatically before replacing files
- 📊 **Track progress** with detailed stats, ETA, and speed monitoring
- 🛡️ **Restore files** from local or server backups if needed

Perfect for managing large media libraries on remote servers or NAS devices!

---

## ✨ Features

### 🎬 Encoding

- **NVIDIA NVENC** (GPU) - Ultra-fast H.265/HEVC encoding
- **x265** (CPU) - Automatic fallback if GPU unavailable
- **Configurable presets** - Balance speed vs quality (p1-p7 for GPU, ultrafast-veryslow for CPU)
- **CQ/CRF quality control** - Fine-tune compression quality
- **Audio passthrough** - Preserve original audio streams
- **Subtitle preservation** - Keep all subtitle tracks
- **Smart re-encoding** - Skip files already in HEVC (optional)

### 🌐 Remote File Management

- **SFTP & WebDAV support** - Connect to any server or NAS
- **File browser** - Navigate remote directories like local folders
- **Folder statistics** - See video count and total size instantly
- **Recursive scanning** - Scan entire folder structures
- **Download/Upload** - Direct file operations with progress tracking
- **Delete files/folders** - Clean up empty directories
- **Automatic caching** - Fast loading with background updates

### 📋 Queue Management

- **Smart queue** - Add individual files or entire folders
- **Pause/Resume** - Control encoding at any time
- **Manual approval** - Review before uploading (optional)
- **Job history** - Track all completed encodes
- **Progress tracking** - Real-time speed, ETA, and percentage
- **Auto-shutdown** - Turn off PC when queue finishes

### 💾 Backup & Restore

- **Local backups** - Keep original and encoded copies
- **Server backups** - Create `.bak` files on server before overwrite
- **One-click restore** - Recover from local or server backups
- **Instant server restore** - Use MOVE command (no download/upload)

### 🎨 Modern UI

- **Dark theme** - Easy on the eyes for long encoding sessions
- **Real-time updates** - See progress without refreshing
- **Loading indicators** - Visual feedback for all operations
- **Encoding badges** - See GPU/CPU mode and settings at a glance
- **French/English support** - Internationalized file sizes (Mo, Go, KB)

---

## 🚀 Quick Start

### One-Click Setup (Windows)

1. **Download** Sharkoder
2. **Double-click** `setup.bat`
3. **Wait** for automatic Node.js installation (if needed)
4. **Configure** your server settings
5. **Start encoding!**

### Manual Setup

```bash
# Install dependencies
npm install

# Copy and edit configuration
cp sharkoder.config.example.json sharkoder.config.json
nano sharkoder.config.json

# Start the application
npm start
```

---

## 📦 Installation

### Prerequisites

- **Node.js** 20.x or later ([Download](https://nodejs.org/))
- **FFmpeg** with NVENC support ([Download](https://ffmpeg.org/))
- **NVIDIA GPU** (optional, for GPU encoding)
- **SFTP/WebDAV server** or NAS

### Setup Scripts

| Script | Description |
|--------|-------------|
| `setup.bat` | **Recommended** - Auto-detects and runs best setup script |
| `check_and_install_node.ps1` | PowerShell - Interactive with colored output |
| `check_and_install_node.bat` | Batch - Works on all Windows systems |
| `install.ps1` | Full installation with FFmpeg and directory checks |

### Step-by-Step Installation

#### 1. Clone Repository

```bash
git clone https://github.com/MonsieurZed/Sharkoder.git
cd Sharkoder
```

#### 2. Install Dependencies

```bash
npm install
```

#### 3. Configure Server

```bash
# Copy example config
cp sharkoder.config.example.json sharkoder.config.json

# Edit with your server details
nano sharkoder.config.json
```

**Minimum configuration:**

```json
{
  "remote_host": "your-server.com",
  "remote_user": "username",
  "remote_password": "password",
  "remote_path": "/path/to/media",
  "local_temp": "C:/Temp/Sharkoder/cache",
  "local_backup": "C:/Temp/Sharkoder/backups",
  "default_download_path": "C:/Users/YourName/Downloads",
  "encode_preset": "p7",
  "cq": 18
}
```

#### 4. Verify FFmpeg (Optional but Recommended)

```bash
# Check FFmpeg
ffmpeg -version

# Check NVENC support
ffmpeg -encoders | grep nvenc
```

#### 5. Launch

```bash
npm start
```

---

## 💻 Usage

### Main Workflow

1. **Launch Sharkoder** - Auto-connects to your server
2. **Browse files** - Navigate through remote directories
3. **Add to queue**:
   - Single file: Click `➕ Add to Queue`
   - Entire folder: Click `📂 Add Folder`
4. **Optional**: Enable `☑ Shutdown when done`
5. **Start queue**: Click `▶️ Start`
6. **Let it work**: Download → Encode → Upload → Cleanup (automatic)

### Interface Overview

```
┌────────────────────────────────────────────────────────────────┐
│ 🦈 Sharkoder - GPU Video Encoder              [🔧] [⚙️] [📊]  │
├───────────────────────┬────────────────────────────────────────┤
│ 📁 Remote Explorer    │ 🎬 Encoding Queue                      │
│                       │                                        │
│ ● Connected           │ ▶️ Start  ⏸️ Pause  🗑️ Clear           │
│ 📂 /movies            │                                        │
│ 📂 /series            │ ┌──────────────────────────────────┐  │
│ 📄 video.mkv          │ │ movie.mkv          [████░] 45%   │  │
│    2.5 GB  x264       │ │ ⚙️ NVENC • p7 • CQ 18             │  │
│    [➕] [📥] [🗑️]     │ │ Speed: 120 fps • ETA: 2m 30s     │  │
│                       │ └──────────────────────────────────┘  │
├───────────────────────┴────────────────────────────────────────┤
│ 📋 Activity Logs                                               │
│ [10:30:15] ✅ Completed: movie.mkv (-65% size)                │
│ [10:30:20] 🎬 Starting: episode.mkv                           │
├────────────────────────────────────────────────────────────────┤
│ ☑ 🔌 Shutdown computer when queue finishes                    │
├────────────────────────────────────────────────────────────────┤
│ Status: 5 waiting • 1 encoding • 12 completed                 │
└────────────────────────────────────────────────────────────────┘
```

### Queue Controls

| Button | Action |
|--------|--------|
| ▶️ Start | Begin processing queue |
| ⏸️ Pause | Pause current job (can resume) |
| ⏹️ Stop | Stop all processing |
| 🗑️ Clear | Remove all jobs from queue (keeps completed) |

### Settings Panel

Access via `⚙️` button:

- **Server Settings**: SFTP/WebDAV connection details
- **FFmpeg Settings**: GPU/CPU encoding parameters
- **Local Paths**: Temp, backup, and download directories
- **Advanced Options**: Skip HEVC, simulation mode, backups

### File Operations

| Icon | Action | Description |
|------|--------|-------------|
| ➕ | Add to Queue | Add single file for encoding |
| 📂 | Add Folder | Add all videos in folder |
| 📥 | Download | Download to default directory |
| 🗑️ | Delete | Remove file (videos) or empty folder |

### Backup & Restore

In the **Completed** tab, each job shows available backups:

- ✓ **Local Original** - Original file saved locally
- ✓ **Local Encoded** - Encoded file saved locally
- ✓ **Server Backup** - `.bak` file on server

**Restore options:**

- `⬆️ Restore Original` - Upload local original backup
- `⬆️ Re-upload Encoded` - Re-upload encoded version
- `↩️ Restore Server Backup` - Instant restore using server move

---

## 📖 Documentation

### Configuration Reference

#### Server Connection

```json
{
  "remote_host": "server.com",      // Server hostname or IP
  "remote_user": "username",        // SSH/WebDAV username
  "remote_password": "password",    // Password (or use SSH key)
  "remote_port": 22,                // SSH port (default: 22)
  "remote_path": "/media",          // Base path on server
  
  "ssh_key_path": "~/.ssh/id_rsa",      // Optional: SSH key
  "ssh_key_passphrase": "passphrase"    // Optional: Key passphrase
}
```

#### WebDAV (Optional)

```json
{
  "webdav_enabled": true,
  "webdav_url": "https://server.com:13888",
  "webdav_username": "user",
  "webdav_password": "pass",
  "webdav_path": "/",
  "webdav_transfer_mode": "prefer_webdav"  // or "sftp", "auto"
}
```

#### FFmpeg Settings

**GPU Encoding (NVENC):**

```json
{
  "ffmpeg": {
    "force_gpu": true,
    "gpu_enabled": true,
    "encode_preset": "p7",      // p1 (fast) to p7 (slow/best)
    "cq": 18,                   // 0-51, lower = better quality
    "bitrate": "5M",            // Average bitrate
    "maxrate": "10M",           // Maximum bitrate
    "bufsize": "10M"            // Buffer size
  }
}
```

**CPU Encoding (x265):**

```json
{
  "ffmpeg": {
    "force_gpu": false,
    "cpu_preset": "slow",       // ultrafast to veryslow
    "cpu_crf": 23               // 0-51, lower = better quality
  }
}
```

**Audio:**

```json
{
  "ffmpeg": {
    "audio_codec": "copy",      // or "aac"
    "audio_bitrate": "192k"     // if transcoding
  }
}
```

#### Advanced Options

```json
{
  "advanced": {
    "keep_original": true,           // Keep local original backup
    "keep_encoded": true,            // Keep local encoded backup
    "create_backups": true,          // Create server .bak files
    "skip_hevc_reencode": true,      // Skip files already in HEVC
    "simulation_mode": false,        // Test mode (no encoding)
    "block_larger_encoded": true     // Reject if encoded > original
  }
}
```

### Encoding Presets Guide

#### NVENC (GPU) Presets

| Preset | Speed | Quality | Use Case |
|--------|-------|---------|----------|
| p1 | Fastest | Low | Real-time streaming |
| p4 | Fast | Medium | Quick encodes |
| **p7** | Slow | **Best** | **Recommended for archival** |

#### CQ (Constant Quality) Values

| CQ | Quality | File Size | Recommended For |
|----|---------|-----------|-----------------|
| 15-17 | Very High | Large | High-quality source (Blu-ray) |
| **18-20** | **High** | **Medium** | **Most videos (recommended)** |
| 21-23 | Good | Small | Standard quality acceptable |
| 24+ | Lower | Very Small | Low-quality source |

#### x265 (CPU) Presets

| Preset | Speed | Quality |
|--------|-------|---------|
| ultrafast | Fastest | Low |
| fast | Fast | Medium |
| **slow** | **Slow** | **Best** |
| veryslow | Very Slow | Excellent |

---

## 🎓 Advanced Usage

### FFmpeg Preset Management

Save and load encoding presets to/from server:

1. Configure your ideal FFmpeg settings
2. Click `📤 Save Preset to Server`
3. On another machine: `📥 Load Preset from Server`

Presets are saved as `/ffmpeg_preset.json` on your server.

### Series Detection

When adding a folder, Sharkoder automatically detects series patterns:

- Groups files by series (e.g., "Show S01", "Show S02")
- Adds "pause before upload" for review
- Shows episode count per season

### Folder Downloads

Download entire folders recursively:

1. Navigate to parent folder
2. Click `📥` on folder
3. Files download to `default_download_path`
4. Progress shown for each file

### Manual Approval Mode

Enable for critical encodes:

1. Add job to queue
2. Check `⏸️ Review` option
3. Job pauses after encoding
4. Review quality, then `✅ Approve` or `❌ Reject`

---

## 🔧 Troubleshooting

### Common Issues

#### "Failed to connect to server"

**Solutions:**
- Verify `remote_host`, `remote_user`, `remote_password` in config
- Check firewall allows port 22 (SFTP) or your WebDAV port
- Test manually: `ssh user@server.com`

#### "Node.js not found"

**Solutions:**
- Run `setup.bat` to auto-install Node.js
- Or download from [nodejs.org](https://nodejs.org/)
- Restart terminal after installation

#### "FFmpeg not found" or "GPU not detected"

**Solutions:**
- Install FFmpeg: `choco install ffmpeg` (Windows with Chocolatey)
- Or download from [ffmpeg.org](https://ffmpeg.org/)
- Update NVIDIA drivers for GPU support
- App automatically falls back to CPU (x265) if GPU unavailable

#### Slow SFTP transfers

**Solutions (already optimized in v1.2.3.6+):**
- AES-GCM cipher for speed
- 64KB buffers
- SSH keepalive enabled
- Expected: 8-12 MB/s (depends on connection)

#### "Default download path not configured"

**Solutions:**
- Open Settings (`⚙️`)
- Go to "Local Paths" section
- Click `📂 Browse` next to "Default Download Directory"
- Select a folder
- Click `💾 Save`

#### Application crashes on startup

**Solutions:**
```bash
# Rebuild native modules
npm run rebuild

# Or manually
./node_modules/.bin/electron-rebuild -f -w sqlite3
```

### Debug Mode

Enable DevTools for troubleshooting:

1. Click `🔧` button in app
2. Check Console tab for errors
3. View Network tab for SFTP/WebDAV issues

---

## 🏗️ Architecture

### Technology Stack

- **Frontend**: React 18, Tailwind CSS
- **Backend**: Electron 27, Node.js 20
- **Database**: SQLite3
- **Transfer**: ssh2-sftp-client, webdav-client
- **Encoding**: FFmpeg (hevc_nvenc / libx265)

### Project Structure

```
Sharkoder/
├── main.js                 # Electron main process
├── preload.js              # IPC bridge
├── renderer/
│   └── index.html          # React UI (single file)
├── backend/
│   ├── db.js              # SQLite database
│   ├── queue.js           # Queue manager
│   ├── encode.js          # FFmpeg encoder
│   ├── transfer.js        # Unified transfer manager
│   ├── sftp.js            # SFTP client
│   ├── webdav.js          # WebDAV client
│   ├── webdav-explorer.js # WebDAV file browser
│   ├── progressfile.js    # Progress tracking
│   └── utils.js           # Utilities
├── scripts/
│   └── quick_precalc.sh   # Cache folder sizes
├── assets/
│   └── icon.png           # App icon
├── sharkoder.config.json  # Configuration
└── sharkoder.db           # SQLite database
```

### Encoding Pipeline

```
┌─────────────┐
│ Remote File │
└──────┬──────┘
       │ SFTP/WebDAV Download
       ↓
┌─────────────┐
│ Local Cache │ (local_temp/downloaded/)
└──────┬──────┘
       │ FFmpeg Encode (NVENC or x265)
       ↓
┌─────────────┐
│ Encoded File│ (local_temp/encoded/)
└──────┬──────┘
       │ Create server backup (.bak)
       ↓
┌─────────────┐
│ SFTP Upload │ (overwrites original)
└──────┬──────┘
       │ Cleanup local files
       ↓
┌─────────────┐
│   Complete  │
└─────────────┘
```

---

## 📊 Performance

### Benchmarks

| Metric | GPU (NVENC) | CPU (x265) |
|--------|-------------|------------|
| **Speed** | 80-150 fps | 10-30 fps |
| **Quality** | Excellent | Excellent |
| **Power** | ~50-100W | ~100-200W |
| **File Size** | -50 to -70% | -50 to -70% |

**SFTP Transfer Speeds:**
- Download: 8-12 MB/s (optimized)
- Upload: 8-12 MB/s (optimized)

**Resource Usage:**
- RAM: 200-500 MB
- Disk: 3x file size (original + encoded + buffer)
- Network: Constant during transfers

---

## 🛠️ Development

### Build from Source

```bash
# Clone and install
git clone https://github.com/MonsieurZed/Sharkoder.git
cd Sharkoder
npm install

# Development mode
npm run dev

# Build for production
npm run build

# Package for distribution
npm run package
```

### Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to your fork
5. Open a Pull Request

---

## 📝 Changelog

### v1.2.3.7 (2025-11-05)
- ✨ Added preset import/export for FFmpeg settings
- 🔧 Fixed default download path configuration
- 🚀 Optimized server restore using MOVE command (instant)
- 🎨 Added encoding parameters hover tooltip
- 📂 Added folder browser for path selection
- 💾 Removed backup creation for FFmpeg presets
- ⚡ Improved configuration cache handling

### v1.2.3.6 (2025-11-03)
- 🚀 SFTP speed optimization: 6-10x faster
- 🇫🇷 French file size format (Mo, Go, Ko)
- 🔐 AES-GCM cipher for faster encryption
- 📦 64KB buffers, SSH keepalive enabled

### v1.2.3.5 (2025-11-03)
- ✨ Auto-refresh UI after queue actions
- 🔌 Auto-shutdown checkbox
- 📊 Real-time queue status updates

### v1.2.3.4 (2025-11-03)
- 🐛 Fixed prefetchLoop error
- 🗑️ Added Clear Queue button
- 🧹 Improved cleanup process

### v1.2.3.3 (2025-11-03)
- ⏳ Loading icons on all operations
- 📋 Activity logs instead of popups
- 🎨 UI improvements

### v1.2.3.2 (2025-11-03)
- 🔄 Auto-connect to SFTP on startup
- 📁 Auto-load remote files
- 🚀 Improved startup experience

### v1.2.3.0 (2025-11-03)
- 🎉 Initial public release
- ✨ NVENC + x265 encoding
- 🌐 SFTP + WebDAV support
- 📋 Queue management
- 💾 Backup & restore

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **FFmpeg** - The backbone of video processing
- **Electron** - Cross-platform desktop framework
- **React** - UI library
- **ssh2** - SSH2 client for Node.js
- **webdav-client** - WebDAV client library

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/MonsieurZed/Sharkoder/issues)
- **Documentation**: This README + `SETUP_GUIDE.md`
- **In-App**: Click `🔧 DevTools` for debugging

---

<div align="center">

**Made with ❤️ by MonsieurZed**

*Encode fast, encode smart, encode with Sharkoder*

![Sharkoder Icon](assets/icon.png)

</div>
