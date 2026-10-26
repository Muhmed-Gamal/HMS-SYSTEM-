@echo off
chcp 65001 >nul
title HMS Industrial System - Auto Updater
color 0B

echo ===================================================================
echo      HMS Industrial System - Auto Update from GitHub
echo ===================================================================
echo.

cd /d "%~dp0"

:: Detect git path
set "GIT_CMD="
where git >nul 2>&1
if %errorlevel% equ 0 (
    set "GIT_CMD=git"
) else if exist "C:\Program Files\Git\cmd\git.exe" (
    set "GIT_CMD=C:\Program Files\Git\cmd\git.exe"
) else if exist "C:\Program Files\Microsoft SQL Server Management Studio 22\Release\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe" (
    set "GIT_CMD=C:\Program Files\Microsoft SQL Server Management Studio 22\Release\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe"
)

if "%GIT_CMD%"=="" (
    color 0C
    echo.
    echo [ERROR] git not found! Install Git from https://git-scm.com/downloads
    echo.
    pause
    exit /b 1
)

echo [1/3] Pulling latest updates from GitHub...
"%GIT_CMD%" pull origin main
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Could not connect to GitHub. Check your internet connection.
    pause
    exit /b
)

echo.
echo [2/3] Rebuilding frontend UI...
npm --prefix "%~dp0frontend" run build >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK] Frontend rebuilt successfully.
) else (
    echo  [WARN] Frontend build had issues, but update continues...
)

echo.
echo [3/3] Restarting server with updated version...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo ===================================================================
echo  [SUCCESS] System updated to latest version!
echo ===================================================================
echo.
timeout /t 3 >nul
start "" "%~dp0start_system.bat"
exit
