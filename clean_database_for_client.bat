@echo off
chcp 65001 >nul
title HMS Industrial System - Database Sanitizer
color 0E

echo ===================================================================
echo   HMS Industrial Barcode System - تنظيف وتهيئة قاعدة البيانات للعميل
echo ===================================================================
echo.
echo تحذير: هذا الإجراء سيقوم بحذف جميع أوامر التشغيل والمسحات وحركات المخزن
echo والإبقاء فقط على حسابات الماستر الرئيسية (Gamal و Auf) ومراحل خط الإنتاج.
echo.
set /p CONFIRM="هل أنت متأكد من المتابعة؟ (اكتب y للموافقة): "
if not "%CONFIRM%"=="y" if not "%CONFIRM%"=="Y" (
    echo تم إلغاء العملية.
    pause
    exit /b 0
)

echo.
cd /d "%~dp0"
node reset_database_clean.js

pause
