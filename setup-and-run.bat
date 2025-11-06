@echo off
REM ==================================================
REM  setup-and-run.bat - Sharkoder Quick Launcher
REM ==================================================
REM
REM  Module: Windows Batch Launcher
REM  Author: Sharkoder Team
REM  Description: Lance le script PowerShell setup-and-run.ps1
REM  Created: 2025
REM
REM ==================================================

title Sharkoder Setup and Run

echo.
echo ================================================
echo        Sharkoder Setup and Run Script        
echo ================================================
echo.

REM Vérifier si PowerShell est disponible
where pwsh >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Using PowerShell Core...
    pwsh -ExecutionPolicy Bypass -File "%~dp0setup-and-run.ps1"
) else (
    where powershell >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo Using Windows PowerShell...
        powershell -ExecutionPolicy Bypass -File "%~dp0setup-and-run.ps1"
    ) else (
        echo ERROR: PowerShell not found!
        echo Please install PowerShell from https://github.com/PowerShell/PowerShell
        pause
        exit /b 1
    )
)

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ================================================
    echo  Setup or startup failed! Check errors above.
    echo ================================================
    pause
    exit /b %ERRORLEVEL%
)

exit /b 0
