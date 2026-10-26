@echo off
chcp 65001 >nul
title HMS Industrial System - Commercial Client Packager
color 0B

echo ===================================================================
echo   HMS Industrial Barcode System - إنشاء حزمة العميل التجارية المشفرة
echo ===================================================================
echo.

cd /d "%~dp0"

echo [1/2] فحص بيئة Node.js والحزم...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js غير مثبت!
    pause
    exit /b 1
)

echo [2/2] بدء التجميع والتشفير والحماية ضد السرقة...
echo.

node package_client_release.js

if %errorlevel% equ 0 (
    echo.
    echo ===================================================================
    echo  🎉 تم إنشاء الحزمة بنجاح في مجلد: [HMS_Enterprise_Release]
    echo  يمكنك الآن نسخ هذا المجلد وبيعه للعميل بأمان تام 100%!
    echo ===================================================================
) else (
    echo.
    echo [ERROR] حدث خطأ أثناء بناء الحزمة.
)

echo.
pause
