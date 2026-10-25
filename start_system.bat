@echo off
chcp 65001 >nul
title HMS Industrial Barcode Tracking System
color 0B

echo ===================================================================
echo      HMS Industrial Barcode Tracking System (v7.2 Enterprise)
echo ===================================================================
echo.

echo [1/3] فحص بيئة Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] لم يتم العثور على Node.js مثبت على هذا الجهاز!
    echo يرجى تثبيت Node.js من: https://nodejs.org
    echo.
    pause
    exit /b
)

echo [2/3] فحص وتحرير المنفذ 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [3/3] بدء تشغيل السيرفر وقاعدة البيانات...
echo.

node server.js
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] حدث خطأ أثناء تشغيل السيرفر!
    pause
)
