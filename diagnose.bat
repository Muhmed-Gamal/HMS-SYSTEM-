@echo off
chcp 65001 >nul
title HMS Industrial System - Diagnostics
color 0E

echo ===================================================================
echo   HMS Industrial Barcode System - System Diagnostics Tool
echo ===================================================================
echo.

cd /d "%~dp0"

echo [1] Checking Node.js...
node -v
if %errorlevel% neq 0 (
    echo    [FAIL] Node.js is NOT installed!
    echo    Solution: Download Node.js from https://nodejs.org
) else (
    echo    [OK] Node.js is installed.
)
echo.

echo [2] Checking project files...
if exist "server.js"          (echo    [OK] server.js) else (echo    [FAIL] server.js - MISSING!)
if exist "node_modules"       (echo    [OK] node_modules) else (echo    [FAIL] node_modules - Run: npm install)
if exist ".env"               (echo    [OK] .env) else (echo    [FAIL] .env - MISSING!)
if exist "first_run_setup.js" (echo    [OK] first_run_setup.js) else (echo    [FAIL] first_run_setup.js - MISSING!)
if exist "licenseManager.js"  (echo    [OK] licenseManager.js) else (echo    [FAIL] licenseManager.js - MISSING!)
if exist "hms.lic"            (echo    [OK] hms.lic - License found) else (echo    [WARN] hms.lic - No license file found)
echo.

echo [3] .env file contents...
if exist ".env" (
    type .env
) else (
    echo    [FAIL] .env file not found!
)
echo.

echo [4] Checking database connection...
node test_db_connection.js
echo.

echo [5] Checking port 3000 status...
netstat -aon 2>nul | findstr :3000 | findstr LISTENING
if %errorlevel% neq 0 (
    echo    [OK] Port 3000 is free.
) else (
    echo    [INFO] Port 3000 is already in use.
)
echo.

echo ===================================================================
echo  Diagnostics complete - Review messages above.
echo  Take a screenshot and share it if you need support.
echo ===================================================================
echo.
pause
