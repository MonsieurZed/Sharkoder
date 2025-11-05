@echo off
echo ========================================
echo   Sharkoder - Node.js Setup Check
echo ========================================
echo.

REM Check if Node.js is installed
echo [1/3] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Node.js is installed
    node --version
) else (
    echo [WARNING] Node.js is NOT installed!
    echo.
    echo Downloading and installing Node.js LTS...
    echo Please wait...
    
    REM Download Node.js LTS installer
    set NODE_VERSION=20.11.0
    set NODE_INSTALLER=node-v%NODE_VERSION%-x64.msi
    set DOWNLOAD_URL=https://nodejs.org/dist/v%NODE_VERSION%/%NODE_INSTALLER%
    
    echo Downloading from: %DOWNLOAD_URL%
    powershell -Command "& {Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -OutFile '%TEMP%\%NODE_INSTALLER%'}"
    
    if exist "%TEMP%\%NODE_INSTALLER%" (
        echo Installing Node.js...
        echo This may require administrator privileges.
        msiexec /i "%TEMP%\%NODE_INSTALLER%" /qn /norestart
        
        echo Cleaning up installer...
        del "%TEMP%\%NODE_INSTALLER%"
        
        echo.
        echo Node.js installation completed!
        echo Please RESTART this script to verify the installation.
        pause
        exit /b 0
    ) else (
        echo [ERROR] Failed to download Node.js installer
        echo.
        echo Please download and install Node.js manually from:
        echo https://nodejs.org/
        echo.
        pause
        exit /b 1
    )
)

echo.

REM Check if npm is installed
echo [2/3] Checking npm installation...
npm --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] npm is installed
    npm --version
) else (
    echo [ERROR] npm is NOT installed!
    echo npm should be installed with Node.js.
    echo Please reinstall Node.js from: https://nodejs.org/
    pause
    exit /b 1
)

echo.

REM Check if node_modules exists
echo [3/3] Checking project dependencies...
if exist "node_modules\" (
    echo [OK] Dependencies are installed
) else (
    echo [WARNING] Dependencies are NOT installed
    echo Installing project dependencies...
    echo This may take a few minutes...
    echo.
    call npm install
    
    if %errorlevel% equ 0 (
        echo.
        echo [OK] Dependencies installed successfully!
    ) else (
        echo.
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo All checks passed. You can now run:
echo   - npm start       (to start the application)
echo   - npm run dev     (to start in development mode)
echo.
echo Press any key to start Sharkoder...
pause >nul

REM Start the application
npm start
