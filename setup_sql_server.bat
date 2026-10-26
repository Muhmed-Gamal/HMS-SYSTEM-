@echo off
chcp 65001 >nul
title HMS Industrial System - Client Database Setup
color 0B

echo ===================================================================
echo   HMS Industrial Barcode System - Client Machine Database Setup
echo ===================================================================
echo.

cd /d "%~dp0"

:: Check Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] This file requires Administrator privileges.
    echo Requesting elevated permissions automatically...
    powershell -Command "Start-Process '%~0' -Verb RunAs"
    exit /b
)

echo  [OK] Running as Administrator.
echo.

:: Open firewall ports
echo [1/3] Opening required firewall ports...
netsh advfirewall firewall delete rule name="HMS Barcode Web Port 3000" >nul 2>&1
netsh advfirewall firewall add rule name="HMS Barcode Web Port 3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
netsh advfirewall firewall delete rule name="HMS SQL Server Port 1433" >nul 2>&1
netsh advfirewall firewall add rule name="HMS SQL Server Port 1433" dir=in action=allow protocol=TCP localport=1433 >nul 2>&1
echo  [OK] Ports 3000 and 1433 opened successfully.
echo.

:: Reset setup flag to force re-initialization
echo [2/3] Resetting database configuration for new machine...
node -e "const fs=require('fs'),p='.env'; if(fs.existsSync(p)){let c=fs.readFileSync(p,'utf8'); c=c.replace(/^SETUP_DONE=.*$/m,'SETUP_DONE=false'); fs.writeFileSync(p,c);}" >nul 2>&1
echo  [OK] Reset complete.
echo.

:: Run auto database setup
echo [3/3] Running automatic database setup...
echo.
node "%~dp0first_run_setup.js"

if %errorlevel% equ 0 (
    echo.
    echo ===================================================================
    echo.
    echo  [SUCCESS] Database setup complete!
    echo  You can now launch the system by running: start_system.bat
    echo.
    echo ===================================================================
) else (
    echo.
    echo ===================================================================
    echo  [ERROR] Automatic setup failed. Please follow these steps:
    echo  1. Open SSMS on this machine.
    echo  2. Open the file: CREATE_USER_AND_DB.sql
    echo  3. Press F5 to execute it.
    echo  4. Then run start_system.bat directly.
    echo ===================================================================
)

echo.
pause
