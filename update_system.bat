@echo off
chcp 65001 >nul
title HMS Industrial System - Auto Updater
color 0B

cd /d "%~dp0"

echo ===================================================================
echo   HMS Industrial Barcode System - Auto Updater
echo ===================================================================
echo.

node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo ===================================================================
    echo  [ERROR] Node.js is not found on this machine!
    echo  Solution: Download and install Node.js from https://nodejs.org
    echo ===================================================================
    echo.
    pause
    exit /b 1
)

node updater.js

echo.
echo ===================================================================
echo  ???? ?? ?? ?????? ??????? ???? / Press any key to start system...
echo ===================================================================
pause
start "" "%~dp0start_system.bat"