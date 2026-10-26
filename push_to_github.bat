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
echo [1/3] جاري تجهيز وإضافة جميع الملفات المعدلة...
"%GIT_CMD%" add .

set COMMIT_MSG=
set /p COMMIT_MSG="👉 اكتب وصف التعديل (أو اضغط Enter للوصف التلقائي): "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=update: system improvements and optimizations

echo.
echo [2/3] حفظ التعديلات محلياً (Commit)...
"%GIT_CMD%" commit -m "%COMMIT_MSG%"

echo.
echo [3/3] رفع التعديلات إلى فرع main على GitHub...
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
