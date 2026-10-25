@echo off
chcp 65001 >nul
title HMS Industrial Barcode Tracking System
color 0B

echo ===================================================================
echo      HMS Industrial Barcode Tracking System (v8.0 Enterprise)
echo ===================================================================
echo.

:: ─── فحص Node.js ─────────────────────────────────────────────────────────
echo [1/4] فحص بيئة Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] لم يتم العثور على Node.js مثبت على هذا الجهاز!
    echo يرجى تثبيت Node.js من: https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: ─── فحص هل الإعداد الأول تم مسبقاً ────────────────────────────────────
echo [2/4] فحص حالة إعداد قاعدة البيانات...
findstr /C:"SETUP_DONE=true" "%~dp0.env" >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ================================================================
    echo  أول تشغيل على هذا الجهاز - جاري إعداد قاعدة البيانات تلقائياً
    echo ================================================================
    echo.
    node "%~dp0first_run_setup.js"
    if %errorlevel% neq 0 (
        color 0C
        echo.
        echo [ERROR] فشل إعداد قاعدة البيانات. يرجى تشغيل setup_sql_server.bat أولاً.
        echo.
        pause
        exit /b 1
    )
)

:: ─── تحرير المنفذ 3000 ───────────────────────────────────────────────────
echo [3/4] فحص وتحرير المنفذ 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: ─── تشغيل السيرفر ───────────────────────────────────────────────────────
echo [4/4] بدء تشغيل النظام...
echo.

node "%~dp0server.js"
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] حدث خطأ أثناء تشغيل السيرفر!
    pause
)
