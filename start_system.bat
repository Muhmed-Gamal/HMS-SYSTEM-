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
    echo.
    echo ===================================================================
    echo  [ERROR] لم يتم العثور على Node.js على هذا الجهاز!
    echo.
    echo  الحل: حمّل وثبّت Node.js من الرابط:
    echo  https://nodejs.org  (اختر LTS)
    echo ===================================================================
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do set NODE_VER=%%v
echo       OK Node.js موجود: %NODE_VER%
echo.

:: ─── فحص ملف server.js ────────────────────────────────────────────────────
echo [2/4] فحص ملفات النظام...
if not exist "%~dp0server.js" (
    color 0C
    echo.
    echo ===================================================================
    echo  [ERROR] ملف server.js غير موجود!
    echo  تأكد أن كل ملفات المشروع منقولة بشكل صحيح.
    echo ===================================================================
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0node_modules" (
    color 0E
    echo.
    echo ===================================================================
    echo  [تنبيه] مجلد node_modules غير موجود - جاري تثبيت الحزم...
    echo ===================================================================
    echo.
    cd /d "%~dp0"
    npm install
    if %errorlevel% neq 0 (
        color 0C
        echo.
        echo [ERROR] فشل تثبيت الحزم! تأكد من الاتصال بالإنترنت.
        echo.
        pause
        exit /b 1
    )
)
echo       OK ملفات النظام موجودة.
echo.

:: ─── فحص هل الإعداد الأول تم مسبقاً ────────────────────────────────────
echo [3/4] فحص حالة قاعدة البيانات...
findstr /C:"SETUP_DONE=true" "%~dp0.env" >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ================================================================
    echo  أول تشغيل - جاري إعداد قاعدة البيانات تلقائياً...
    echo ================================================================
    echo.
    cd /d "%~dp0"
    node first_run_setup.js
    if %errorlevel% neq 0 (
        color 0C
        echo.
        echo ===================================================================
        echo  [ERROR] فشل إعداد قاعدة البيانات التلقائي.
        echo.
        echo  الحل:
        echo  1. شغّل setup_sql_server.bat بصلاحيات مسؤول (Run as Administrator)
        echo  2. ثم أعد تشغيل هذا الملف.
        echo ===================================================================
        echo.
        pause
        exit /b 1
    )
)
echo       OK قاعدة البيانات جاهزة.
echo.

:: ─── تحرير المنفذ 3000 ───────────────────────────────────────────────────
echo [4/4] تحرير المنفذ 3000 وتشغيل النظام...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo ===================================================================
echo  النظام يعمل الآن - افتح المتصفح على:
echo  http://localhost:3000
echo ===================================================================
echo.

cd /d "%~dp0"
node server.js
if %errorlevel% neq 0 (
    echo.
    color 0C
    echo ===================================================================
    echo  [ERROR] توقف السيرفر بسبب خطأ!
    echo  راجع الرسائل أعلاه لمعرفة السبب.
    echo ===================================================================
    echo.
    pause
)
