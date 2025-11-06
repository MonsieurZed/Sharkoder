# 🚀 Sharkoder Setup Scripts

This directory contains multiple setup scripts to help you get Sharkoder up and running.

## Quick Start

### Option 1: Automatic Setup (Recommended)
Just double-click:
```
setup.bat
```
This will automatically check and install Node.js if needed, install dependencies, and start Sharkoder.

### Option 2: PowerShell Script
Right-click and "Run with PowerShell":
```
check_and_install_node.ps1
```
More robust with better error handling and colored output.

### Option 3: Batch Script
Double-click:
```
check_and_install_node.bat
```
Basic Windows batch version that works on all systems.

### Option 4: Full Installation (First Time)
For first-time setup with all checks:
```powershell
.\install.ps1
```
This checks Node.js, npm, FFmpeg, creates directories, and sets up configuration.

## What Each Script Does

### `setup.bat`
- **Purpose**: Quick launcher
- **Features**:
  - Auto-detects PowerShell availability
  - Runs the best available setup script
  - No configuration needed

### `check_and_install_node.bat`
- **Purpose**: Node.js verification and installation (Batch)
- **Features**:
  - Checks if Node.js is installed
  - Downloads and installs Node.js LTS (20.11.0) if missing
  - Checks npm installation
  - Installs project dependencies
  - Starts Sharkoder

### `check_and_install_node.ps1`
- **Purpose**: Node.js verification and installation (PowerShell)
- **Features**:
  - Same as batch version but with better UI
  - Colored output
  - Interactive prompts
  - Better error handling
  - Progress indicators

### `install.ps1`
- **Purpose**: Complete first-time installation
- **Features**:
  - Checks Node.js, npm, and FFmpeg
  - Verifies NVENC support
  - Creates temp/backup directories
  - Installs npm dependencies
  - Creates config from example
  - Shows setup summary

### `install.sh`
- **Purpose**: Linux/Mac installation
- **Features**:
  - Bash script for Unix-based systems
  - Same functionality as install.ps1

## Requirements

- **Windows 10 or later** (for batch/PowerShell scripts)
- **Internet connection** (for downloading Node.js if needed)
- **~100MB free space** (for Node.js installation)

## Node.js Version

All scripts install **Node.js LTS 20.11.0**, which is the recommended version for Sharkoder.

## Troubleshooting

### "Cannot be loaded because running scripts is disabled"
If you get this error with PowerShell, run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "Node.js installed but npm not found"
Restart your terminal or computer after Node.js installation.

### "Failed to install dependencies"
1. Check your internet connection
2. Try running as Administrator
3. Delete `node_modules` folder and try again

### "FFmpeg not found"
Install FFmpeg:
- **Windows (Chocolatey)**: `choco install ffmpeg`
- **Windows (Manual)**: Download from https://ffmpeg.org/
- **Linux**: `sudo apt install ffmpeg` or `sudo yum install ffmpeg`

## Manual Installation

If automatic scripts fail, install manually:

1. **Install Node.js**: https://nodejs.org/ (LTS version)
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Create config**:
   ```bash
   copy sharkoder.config.example.json sharkoder.config.json
   ```
4. **Edit config** with your server details
5. **Start**:
   ```bash
   npm start
   ```

## After Setup

Once setup is complete, you can start Sharkoder with:
```bash
npm start
```

Or use the setup script again - it will detect existing installation and just start the app.

## Getting Help

- 📖 **Full Docs**: See `README.md`
- 🚀 **Quick Start**: See `QUICKSTART.md` (if available)
- 🔐 **SSH Setup**: See `SSH_SETUP.md` (if available)
- 🐛 **Issues**: https://github.com/MonsieurZed/Sharkoder/issues

---

Happy encoding! 🎬✨
