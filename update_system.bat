@echo off
title HMS Industrial System - Auto Updater
color 0B

cd /d "%~dp0"

echo ===================================================================
echo   HMS Industrial Barcode System - Auto Updater v3.0
echo ===================================================================
echo.

:: Check Node.js is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo ===================================================================
    echo  [ERROR] Node.js is not installed on this server!
    echo  Please install Node.js from: https://nodejs.org
    echo ===================================================================
    echo.
    pause
    exit /b 1
)

echo  [OK] Node.js found. Starting update process...
echo.

:: Run the Node.js updater script
node "%~dp0updater.js"

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo ===================================================================
    echo  [FAILED] Update could not complete. See error above.
    echo  Please take a photo of this screen and contact HMS support.
    echo ===================================================================
    echo.
    pause
    exit /b 1
)

echo.
echo ===================================================================
echo  [SUCCESS] Update complete! Launching the system now...
echo ===================================================================
echo.
timeout /t 2 /nobreak >nul

start "" "%~dp0start_system.bat"
