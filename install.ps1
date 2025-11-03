# Sharkoder Installation Script for Windows
# Run this in PowerShell as Administrator

Write-Host "🦈 Sharkoder Installation Script" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js installation
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js is installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js is not installed!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check npm
try {
    $npmVersion = npm --version
    Write-Host "✓ npm is installed: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ npm is not installed!" -ForegroundColor Red
    exit 1
}

# Check FFmpeg
Write-Host ""
Write-Host "Checking FFmpeg..." -ForegroundColor Yellow
try {
    $ffmpegVersion = ffmpeg -version 2>&1 | Select-String -Pattern "version" | Select-Object -First 1
    Write-Host "✓ FFmpeg is installed" -ForegroundColor Green
    
    # Check for NVENC support
    $nvencCheck = ffmpeg -encoders 2>&1 | Select-String -Pattern "nvenc"
    if ($nvencCheck) {
        Write-Host "✓ NVENC encoders detected" -ForegroundColor Green
    } else {
        Write-Host "⚠ NVENC encoders not found - GPU encoding may not work" -ForegroundColor Yellow
        Write-Host "  Please update your NVIDIA drivers" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ FFmpeg is not installed!" -ForegroundColor Red
    Write-Host "Please install FFmpeg from https://ffmpeg.org/" -ForegroundColor Yellow
    Write-Host "Or use chocolatey: choco install ffmpeg" -ForegroundColor Yellow
}

# Create temp directories
Write-Host ""
Write-Host "Creating temporary directories..." -ForegroundColor Yellow

$tempDir = "C:\Temp\Sharkoder\cache"
$backupDir = "C:\Temp\Sharkoder\backups"

try {
    if (-not (Test-Path $tempDir)) {
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
        Write-Host "✓ Created: $tempDir" -ForegroundColor Green
    } else {
        Write-Host "✓ Already exists: $tempDir" -ForegroundColor Green
    }
    
    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        Write-Host "✓ Created: $backupDir" -ForegroundColor Green
    } else {
        Write-Host "✓ Already exists: $backupDir" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠ Failed to create directories: $_" -ForegroundColor Yellow
    Write-Host "  You may need to run this script as Administrator" -ForegroundColor Yellow
}

# Install npm dependencies
Write-Host ""
Write-Host "Installing dependencies (this may take a few minutes)..." -ForegroundColor Yellow

try {
    npm install
    Write-Host "✓ Dependencies installed successfully" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to install dependencies: $_" -ForegroundColor Red
    exit 1
}

# Check configuration
Write-Host ""
Write-Host "Checking configuration..." -ForegroundColor Yellow

$configFile = "sharkoder.config.json"
if (Test-Path $configFile) {
    Write-Host "✓ Configuration file found: $configFile" -ForegroundColor Green
    Write-Host "  Please review and update with your server details" -ForegroundColor Yellow
} else {
    Write-Host "⚠ Configuration file not found!" -ForegroundColor Yellow
    Write-Host "  Creating from example..." -ForegroundColor Yellow
    
    if (Test-Path "sharkoder.config.example.json") {
        Copy-Item "sharkoder.config.example.json" $configFile
        Write-Host "✓ Created $configFile from example" -ForegroundColor Green
        Write-Host "  Please edit this file with your server details!" -ForegroundColor Yellow
    } else {
        Write-Host "✗ Example config not found!" -ForegroundColor Red
    }
}

# Summary
Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Installation Summary" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Edit sharkoder.config.json with your server details" -ForegroundColor White
Write-Host "2. Run: npm start" -ForegroundColor White
Write-Host "3. Click 'Connect' and enter your SSH credentials" -ForegroundColor White
Write-Host ""
Write-Host "For help, see:" -ForegroundColor Yellow
Write-Host "- README.md - Full documentation" -ForegroundColor White
Write-Host "- QUICKSTART.md - Quick start guide" -ForegroundColor White
Write-Host "- SSH_SETUP.md - SSH authentication setup" -ForegroundColor White
Write-Host ""
Write-Host "Happy encoding! 🎬✨" -ForegroundColor Cyan