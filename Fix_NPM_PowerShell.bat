@echo off
title Fix NPM PowerShell Execution Policy - HMS System
color 0A

echo ===================================================================
echo     HMS System - Fix NPM PowerShell Execution Policy Tool
echo ===================================================================
echo.

echo [1/3] Enabling PowerShell Script Execution for CurrentUser...
powershell -NoProfile -Command "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy Bypass -Force"
reg add "HKCU\Software\Microsoft\PowerShell\1\ShellIds\Microsoft.PowerShell" /v ExecutionPolicy /t REG_SZ /d Bypass /f >nul 2>&1
echo       [OK] Script Execution Policy set to Bypass.
echo.

echo [2/3] Checking Node.js script wrappers...
if exist "%ProgramFiles%\nodejs\npm.ps1" del /f /q "%ProgramFiles%\nodejs\npm.ps1" >nul 2>&1
if exist "%ProgramFiles%\nodejs\npx.ps1" del /f /q "%ProgramFiles%\nodejs\npx.ps1" >nul 2>&1
if exist "%ProgramFiles(x86)%\nodejs\npm.ps1" del /f /q "%ProgramFiles(x86)%\nodejs\npm.ps1" >nul 2>&1
if exist "%APPDATA%\npm\npm.ps1" del /f /q "%APPDATA%\npm\npm.ps1" >nul 2>&1
echo       [OK] Checked.
echo.

echo [3/3] Testing npm in PowerShell...
echo.
powershell -NoProfile -Command "npm -v"
if %errorlevel% equ 0 (
    echo.
    echo ===================================================================
    echo   [SUCCESS] Problem Solved 100%%!
    echo   NPM is now working without any ExecutionPolicy restrictions.
    echo   You can now open PowerShell and run: npm install
    echo ===================================================================
) else (
    echo.
    echo ===================================================================
    echo   [NOTICE] If npm did not show version above, please right-click
    echo   this file and select: "Run as administrator"
    echo ===================================================================
)

echo.
pause
