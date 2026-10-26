@echo off
chcp 65001 >nul
title HMS Industrial System - Commercial Client Packager
color 0B

echo ===================================================================
echo   HMS Industrial Barcode System - Build Commercial Client Package
echo ===================================================================
echo.

cd /d "%~dp0"

echo [1/2] Checking Node.js environment...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [ERROR] Node.js is not installed!
    echo Solution: Download from https://nodejs.org
    pause
    exit /b 1
)

echo  [OK] Node.js found.
echo.

echo [2/2] Starting build, obfuscation and anti-theft protection...
echo.

node package_client_release.js

if %errorlevel% equ 0 (
    echo.
    echo ===================================================================
    echo  [SUCCESS] Client package created in: [HMS_Enterprise_Release]
    echo  You can now copy this folder and deliver it to the client safely!
    echo ===================================================================
) else (
    echo.
    echo [ERROR] An error occurred during the build process.
    echo  Check the messages above for details.
)

echo.
pause
