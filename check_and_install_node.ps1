# Sharkoder - Node.js Setup Check and Install Script
# PowerShell Version

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Sharkoder - Node.js Setup Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if a command exists
function Test-CommandExists {
    param($command)
    $null = Get-Command $command -ErrorAction SilentlyContinue
    return $?
}

# Function to download and install Node.js
function Install-NodeJS {
    Write-Host "[INFO] Downloading Node.js LTS..." -ForegroundColor Yellow
    
    $nodeVersion = "20.11.0"
    $installerName = "node-v$nodeVersion-x64.msi"
    $downloadUrl = "https://nodejs.org/dist/v$nodeVersion/$installerName"
    $installerPath = "$env:TEMP\$installerName"
    
    try {
        # Download installer
        Write-Host "Downloading from: $downloadUrl" -ForegroundColor Gray
        Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing
        
        Write-Host "[INFO] Installing Node.js..." -ForegroundColor Yellow
        Write-Host "This may require administrator privileges." -ForegroundColor Yellow
        
        # Install silently
        Start-Process msiexec.exe -ArgumentList "/i `"$installerPath`" /qn /norestart" -Wait -NoNewWindow
        
        # Clean up
        Remove-Item $installerPath -Force
        
        Write-Host "[OK] Node.js installation completed!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Please RESTART this script or open a new terminal to verify the installation." -ForegroundColor Yellow
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 0
        
    } catch {
        Write-Host "[ERROR] Failed to download or install Node.js" -ForegroundColor Red
        Write-Host "Error: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please download and install Node.js manually from:" -ForegroundColor Yellow
        Write-Host "https://nodejs.org/" -ForegroundColor Cyan
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Check Node.js
Write-Host "[1/3] Checking Node.js installation..." -ForegroundColor Yellow
if (Test-CommandExists node) {
    $nodeVersion = node --version
    Write-Host "[OK] Node.js is installed: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "[WARNING] Node.js is NOT installed!" -ForegroundColor Red
    Write-Host ""
    $response = Read-Host "Would you like to install Node.js now? (Y/N)"
    
    if ($response -eq 'Y' -or $response -eq 'y') {
        Install-NodeJS
    } else {
        Write-Host ""
        Write-Host "Please install Node.js manually from: https://nodejs.org/" -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }
}

Write-Host ""

# Check npm
Write-Host "[2/3] Checking npm installation..." -ForegroundColor Yellow
if (Test-CommandExists npm) {
    $npmVersion = npm --version
    Write-Host "[OK] npm is installed: $npmVersion" -ForegroundColor Green
} else {
    Write-Host "[ERROR] npm is NOT installed!" -ForegroundColor Red
    Write-Host "npm should be installed with Node.js." -ForegroundColor Yellow
    Write-Host "Please reinstall Node.js from: https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# Check dependencies
Write-Host "[3/3] Checking project dependencies..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Write-Host "[OK] Dependencies are installed" -ForegroundColor Green
} else {
    Write-Host "[WARNING] Dependencies are NOT installed" -ForegroundColor Yellow
    Write-Host "Installing project dependencies..." -ForegroundColor Yellow
    Write-Host "This may take a few minutes..." -ForegroundColor Gray
    Write-Host ""
    
    npm install
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "[OK] Dependencies installed successfully!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "[ERROR] Failed to install dependencies" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "All checks passed. You can now run:" -ForegroundColor Green
Write-Host "  - npm start       (to start the application)" -ForegroundColor White
Write-Host "  - npm run dev     (to start in development mode)" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to start Sharkoder..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Start the application
npm start
