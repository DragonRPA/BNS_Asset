@echo off
title BNS Asset Reconciliation Tool
cd /d "%~dp0"

echo ===================================================
echo   BNS Asset Reconciliation Tool Launcher
echo ===================================================
echo.

:: Check Node.js installation
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js to run this program.
    echo Download link: https://nodejs.org/
    echo.
    pause
    exit /b
)

:: Install dependencies if not present
if not exist node_modules (
    echo [1/3] Installing dependencies...
    call npm install --no-fund --no-audit
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Package installation failed! Check your internet connection.
        pause
        exit /b
    )
) else (
    echo [1/3] Dependencies already installed.
)

echo [2/3] Starting local server...
echo (Close this window or press Ctrl+C to stop the server)
echo.

call npm start
pause
