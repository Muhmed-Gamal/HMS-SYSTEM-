@echo off
setlocal EnableDelayedExpansion
title HMS Industrial System - Client SQL Server Auto Setup
color 0B

echo ===================================================================
echo     HMS System - Automatic SQL Server Setup for Client Machine
echo ===================================================================
echo.

:: 1. Check for Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Administrator privileges required.
    echo Requesting elevated permissions...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/k \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

:: 2. Execute PowerShell Configurator
echo Running SQL Server configuration script...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Configure_Client_SQL.ps1"

:: 3. Run first_run_setup.js to confirm Node.js connection
if exist "%~dp0first_run_setup.js" (
    echo.
    echo Validating connection via Node.js...
    node "%~dp0first_run_setup.js"
)

echo.
echo ===================================================================
echo   Setup finished. You can now run: start_system.bat
echo ===================================================================
pause
