@echo off
chcp 65001 >nul
title HMS Industrial System - Auto Updater
color 0B

echo ===================================================================
echo      HMS Industrial System - التحديث التلقائي للنظام من السحابة
echo ===================================================================
echo.

echo [1/3] جاري جلب أحدث التحديثات من مستودع GitHub...
git pull origin main
if %errorlevel% neq 0 (
    echo.
    echo ❌ تعذر الاتصال بـ GitHub. يرجى التأكد من اتصال الإنترنت ثم المحاولة مجدداً.
    pause
    exit /b
)

echo.
echo [2/3] فحص وتحديث مكتبات وواجهة المستخدم...
cd frontend
call npm run build >nul 2>&1
cd ..

echo.
echo [3/3] إعادة تشغيل السيرفر بالنسخة المحدثة...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo ===================================================================
echo 🎉 تم تحديث النظام بالكامل إلى أحدث إصدار بنجاح!
echo ===================================================================
echo.
timeout /t 3 >nul
start "" "%~dp0start_system.bat"
exit
