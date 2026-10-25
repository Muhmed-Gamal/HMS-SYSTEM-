@echo off
chcp 65001 >nul
title HMS Barcode System - Push to GitHub
color 0B

echo ===================================================================
echo      HMS Industrial System - رفع المشروع على مستودع GitHub
echo ===================================================================
echo.

cd /d "%~dp0"

:: تحديد مسار git
set "GIT_CMD=git"
where git >nul 2>&1
if %errorlevel% neq 0 (
    set "GIT_CMD=C:\Program Files\Microsoft SQL Server Management Studio 22\Release\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe"
)

:: فحص هل الريموت مربوط بالفعل
"%GIT_CMD%" remote get-url origin >nul 2>&1
if %errorlevel% neq 0 (
    echo [تنبيه] لم يتم ربط رابط GitHub بعد.
    echo.
    echo يرجى نسخ ولصق رابط المستودع الخاص بك من صفحة GitHub:
    echo (مثال: https://github.com/YourUsername/HMS_Barcode_System.git)
    echo.
    set /p REPO_URL="👉 الصق الرابط هنا ثم اضغط Enter: "
    if not "%REPO_URL%"=="" (
        "%GIT_CMD%" remote add origin %REPO_URL%
    ) else (
        echo لم يتم إدخال الرابط. تم إلغاء العملية.
        pause
        exit /b
    )
)

echo.
echo جاري رفع الملفات إلى فرع main على GitHub...
echo (إذا طُلب منك تسجيل الدخول، سجّل عبر المتصفح لتأكيد الحساب)...
echo.

"%GIT_CMD%" push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ===================================================================
    echo 🎉 تم رفع المشروع بنجاح 100%% على GitHub!
    echo ===================================================================
) else (
    echo.
    echo ❌ حدث خطأ أثناء الرفع، تأكد من صحة الرابط واتصال الإنترنت.
)

echo.
pause
