@echo off
chcp 65001 >nul
title HMS Industrial Barcode Tracking System
color 0B

echo ===================================================================
echo      HMS Industrial Barcode Tracking System (v8.0 Enterprise)
echo ===================================================================
echo.

cd /d "%~dp0"

:: Check Node.js
echo [1/4] Checking Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo ===================================================================
    echo  [ERROR] Node.js not found on this machine!
    echo.
    echo  Solution: Download and install Node.js from:
    echo  https://nodejs.org  (choose LTS)
    echo ===================================================================
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do set NODE_VER=%%v
echo  [OK] Node.js found: %NODE_VER%
echo.

:: Check server.js
echo [2/4] Checking system files...
if not exist "%~dp0server.js" (
    color 0C
    echo.
    echo ===================================================================
    echo  [ERROR] server.js not found!
    echo  Make sure all project files are copied correctly.
    echo ===================================================================
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0node_modules" (
    color 0E
    echo.
    echo ===================================================================
    echo  [WARNING] node_modules missing - Installing packages...
    echo ===================================================================
    echo.
    npm install --omit=dev
    if %errorlevel% neq 0 (
        color 0C
        echo.
        echo  [ERROR] Package installation failed! Check your internet connection.
        echo.
        pause
        exit /b 1
    )
)
echo  [OK] System files OK.
echo.

:: Check first-run setup
echo [3/4] Checking database status...
findstr /C:"SETUP_DONE=true" "%~dp0.env" >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ================================================================
    echo  First run - Setting up database automatically...
    echo ================================================================
    echo.
    node first_run_setup.js
    if %errorlevel% neq 0 (
        color 0C
        echo.
        echo ===================================================================
        echo  [ERROR] Automatic database setup failed.
        echo.
        echo  Solution:
        echo  1. Run setup_sql_server.bat as Administrator
        echo  2. Then restart this file.
        echo ===================================================================
        echo.
        pause
        exit /b 1
    )
)
echo  [OK] Database is ready.
echo.

:: Free port 3000
echo [4/4] Freeing port 3000 and starting system...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo ===================================================================
echo  System is running - Open your browser at:
echo  http://localhost:3000
echo ===================================================================
echo.

node server.js
if %errorlevel% neq 0 (
    echo.
    color 0C
    echo ===================================================================
    echo  [ERROR] Server stopped due to an error!
    echo  Check the messages above for details.
    echo ===================================================================
    echo.
    pause
)
