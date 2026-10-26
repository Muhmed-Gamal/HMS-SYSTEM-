@echo off
chcp 65001 >nul
title HMS Industrial System - Push to GitHub
color 0B

echo ===================================================================
echo      HMS Industrial System - Push Project to GitHub
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
) else if exist "C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe" (
    set "GIT_CMD=C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe"
)

if "%GIT_CMD%"=="" (
    color 0C
    echo.
    echo [ERROR] git not found on this machine!
    echo Solution: Install Git from https://git-scm.com/downloads
    echo.
    pause
    exit /b 1
)

echo  [OK] git found: %GIT_CMD%
echo.

:: Check if remote is configured
"%GIT_CMD%" remote get-url origin >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] GitHub remote URL is not configured yet.
    echo.
    echo Please paste your GitHub repository URL:
    echo (Example: https://github.com/YourUsername/HMS_Barcode_System.git)
    echo.
    set /p REPO_URL="Paste the URL here and press Enter: "
    if not "%REPO_URL%"=="" (
        "%GIT_CMD%" remote add origin %REPO_URL%
    ) else (
        echo No URL entered. Operation cancelled.
        pause
        exit /b
    )
)

echo.
echo [1/3] Staging all modified files...
"%GIT_CMD%" add .

set COMMIT_MSG=
set /p COMMIT_MSG="Enter commit message (or press Enter for auto message): "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=update: system improvements and optimizations

echo.
echo [2/3] Committing changes locally...
"%GIT_CMD%" commit -m "%COMMIT_MSG%"

echo.
echo [3/3] Pushing to main branch on GitHub...
echo.

"%GIT_CMD%" push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ===================================================================
    echo  [SUCCESS] Project pushed to GitHub successfully!
    echo ===================================================================
) else (
    echo.
    echo  [ERROR] Push failed. Check your internet connection and repo URL.
)

echo.
pause
