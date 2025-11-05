<div align="center">

# 🦈 Sharkoder

### GPU-Accelerated Video Encoder with Remote File Management

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/Electron-27.x-blue.svg)](https://www.electronjs.org/)

**Encode video libraries with NVIDIA NVENC (GPU) or x265 (CPU), manage remote files via SFTP/WebDAV.**

</div>

---

## 🎯 What is Sharkoder?

- 📹 Encode videos with GPU (NVENC) or CPU (x265)
- 🌐 Browse remote files via SFTP/WebDAV
- ⚡ Auto process: download → encode → upload → cleanup
- 💾 HEVC compression (50-70% size reduction)
- 🔄 Automatic backups and restore

---

## 🚀 Quick Start

```bash
# 1. Clone and install
git clone https://github.com/MonsieurZed/Sharkoder.git
cd Sharkoder
npm install

# 2. Configure
cp sharkoder.config.example.json sharkoder.config.json
# Edit with your server details

# 3. Launch
npm start
```

### Windows One-Click Setup

Run `setup.bat` to auto-install Node.js and dependencies.

---

## 💻 Configuration

### Basic Setup

```json
{
  "remote_host": "your-server.com",
  "remote_user": "username",
  "remote_password": "password",
  "remote_path": "/path/to/media",
  "local_temp": "C:/Temp/Sharkoder/cache",
  "local_backup": "C:/Temp/Sharkoder/backups",
  "encode_preset": "p7",
  "cq": 18
}
```

### Key Settings

**NVENC (GPU):**
- `encode_preset`: p1 (fast) to p7 (best quality)
- `cq`: 15-23 (18 recommended, lower = better)

**x265 (CPU):**
- `cpu_preset`: ultrafast to veryslow (slow recommended)
- `cpu_crf`: 18-28 (23 recommended)

**Options:**
- `keep_original`: Keep local original backup
- `create_backups`: Create `.bak` files on server
- `skip_hevc_reencode`: Skip files already in HEVC

---

## 🔧 Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| Connection failed | Check `remote_host`, `remote_user`, `remote_password` in config |
| Node.js not found | Run `setup.bat` or install from [nodejs.org](https://nodejs.org/) |
| FFmpeg not found | Install FFmpeg or app uses CPU fallback automatically |
| Slow transfers | Already optimized (8-12 MB/s typical) |
| Download path error | Open Settings → Local Paths → Browse → Save |
| App crash | Run: `npm run rebuild` |

### Debug Mode

Click `🔧` button in app to open DevTools console.

---

## 📝 Changelog

### v1.2.3.7 (2025-11-05)
- ✨ Preset import/export, restore optimization, hover tooltips
- � Fixed download path config, browse buttons

### v1.2.3.6 (2025-11-03)
- 🚀 SFTP 6-10x faster, French format (Mo, Go)

### v1.2.3.5 (2025-11-03)
- ✨ Auto-refresh UI, auto-shutdown checkbox

### v1.2.3.0 (2025-11-03)
-  Initial release

---

## 📄 License

MIT License - see [LICENSE](LICENSE)

---

<div align="center">

**Made with ❤️ by MonsieurZed**

![Sharkoder Icon](assets/icon.png)

</div>
