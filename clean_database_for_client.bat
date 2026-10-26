@echo off
chcp 65001 >nul
title HMS Industrial System - Database Sanitizer
color 0E

echo ===================================================================
echo   HMS Industrial Barcode System - Clean Database for Client
echo ===================================================================
echo.

cd /d "%~dp0"

echo  WARNING: This operation will DELETE all production orders, scans,
echo  and movements while KEEPING master admin accounts (Gamal and Auf)
echo  and all production stage configurations.
echo.
set /p CONFIRM="Are you sure you want to continue? (type y to confirm): "
if /i not "%CONFIRM%"=="y" (
    echo.
    echo  Operation cancelled.
    pause
    exit /b 0
)

echo.
echo  Running database cleanup...
node reset_database_clean.js

if %errorlevel% equ 0 (
    echo.
    echo ===================================================================
    echo  [SUCCESS] Database cleaned and ready for client delivery!
    echo ===================================================================
) else (
    echo.
    echo  [ERROR] Cleanup failed. Check the messages above.
)

echo.
pause
