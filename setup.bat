@echo off
REM Sharkoder Setup Launcher - Auto-detects and runs the best setup script

echo Starting Sharkoder setup...

REM Try to run PowerShell script (preferred)
where powershell >nul 2>&1
if %errorlevel% equ 0 (
    echo Running PowerShell setup script...
    powershell -ExecutionPolicy Bypass -File "%~dp0check_and_install_node.ps1"
    exit /b %errorlevel%
)

REM Fallback to batch script
echo Running batch setup script...
call "%~dp0check_and_install_node.bat"
exit /b %errorlevel%
