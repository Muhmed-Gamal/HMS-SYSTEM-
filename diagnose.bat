@echo off
chcp 65001 >nul
title HMS - تشخيص المشكلة
color 0E

echo ===================================================================
echo   HMS System - أداة تشخيص المشاكل
echo ===================================================================
echo.

cd /d "%~dp0"

echo [1] فحص Node.js...
node -v
if %errorlevel% neq 0 (
    echo    ❌ Node.js غير مثبّت!
    echo    الحل: حمّل Node.js من https://nodejs.org
) else (
    echo    ✅ Node.js موجود
)
echo.

echo [2] فحص ملفات المشروع...
if exist "server.js"         (echo    ✅ server.js) else (echo    ❌ server.js مفقود!)
if exist "node_modules"      (echo    ✅ node_modules) else (echo    ❌ node_modules مفقودة - شغّل npm install)
if exist ".env"              (echo    ✅ .env موجود) else (echo    ❌ .env مفقود!)
if exist "first_run_setup.js"(echo    ✅ first_run_setup.js) else (echo    ❌ first_run_setup.js مفقود!)
echo.

echo [3] محتوى ملف .env...
if exist ".env" (
    type .env
) else (
    echo    ❌ ملف .env غير موجود!
)
echo.

echo [4] فحص اتصال قاعدة البيانات...
node test_db_connection.js
echo.

echo ===================================================================
echo  انتهى التشخيص - راجع الرسائل أعلاه
echo  اعمل screenshot لهذه الشاشة وابعتها
echo ===================================================================
echo.
pause
